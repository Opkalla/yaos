/**
 * Room access tier regressions (3.5.0).
 *
 * The hub publishes a room's access tier into the shared room Y.Doc
 * (`sys.roomAccessTier`) so every spoke converges on it, and the plugin gates
 * spoke writes against it. Two things are tested here:
 *
 *  1. The tier predicates and normalization (pure logic in src/types.ts).
 *  2. Real propagation through Yjs: a hub-side change reaches a spoke's
 *     document and fires its observer, including for a spoke that was offline
 *     when the change was made.
 *
 * Plus source-level assertions that each of the four write paths in main.ts is
 * actually gated — the gates are what make the documented "structure is
 * host-only" behavior true rather than incidental (see PROJECT-PLAN.md 4.8).
 *
 * Run: node --import jiti/register tests/room-access-tier-regressions.mjs
 */
import { readFileSync } from "node:fs";
import * as Y from "yjs";

const typesModule = await import("../src/types.ts");
const {
	DEFAULT_ROOM_ACCESS_TIER,
	ROOM_ACCESS_TIER_LABELS,
	normalizeRoomAccessTier,
	tierAllowsContentWrite,
	tierAllowsStructuralChange,
} = typesModule.default ?? typesModule;

const vaultSyncModule = await import("../src/sync/vaultSync.ts");
const { VaultSync } = vaultSyncModule.default ?? vaultSyncModule;

const mainSrc = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");

let passed = 0;
let failed = 0;

function assert(condition, name) {
	if (condition) {
		console.log(`  PASS  ${name}`);
		passed++;
	} else {
		console.error(`  FAIL  ${name}`);
		failed++;
	}
}

/** Return the body of a method, from its signature to the matching brace. */
function methodBody(src, signature) {
	const start = src.indexOf(signature);
	if (start === -1) return "";
	const open = src.indexOf("{", start);
	if (open === -1) return "";
	let depth = 0;
	for (let i = open; i < src.length; i++) {
		if (src[i] === "{") depth++;
		else if (src[i] === "}") {
			depth--;
			if (depth === 0) return src.slice(open, i + 1);
		}
	}
	return "";
}

/**
 * Build a VaultSync without its constructor (no IndexedDB, no WebSocket), with
 * only the sys map the shared-setting methods touch.
 */
function bareVaultSync(ydoc) {
	const vs = Object.create(VaultSync.prototype);
	vs.ydoc = ydoc;
	vs.sys = ydoc.getMap("sys");
	vs.log = () => {};
	return vs;
}

console.log("\n--- 1: tier predicates ---");

assert(DEFAULT_ROOM_ACCESS_TIER === "hub-notes", "default tier is hub-notes (today's documented behavior)");

assert(tierAllowsContentWrite("full") === true, "full allows content writes");
assert(tierAllowsContentWrite("hub-notes") === true, "hub-notes allows content writes");
assert(tierAllowsContentWrite("read-only") === false, "read-only blocks content writes");

assert(tierAllowsStructuralChange("full") === true, "full allows structural changes");
assert(
	tierAllowsStructuralChange("hub-notes") === false,
	"hub-notes blocks structural changes (create/rename/delete stay hub-only)",
);
assert(tierAllowsStructuralChange("read-only") === false, "read-only blocks structural changes");

console.log("\n--- 2: normalization fails closed ---");

assert(normalizeRoomAccessTier("full") === "full", "known tier passes through");
assert(normalizeRoomAccessTier("read-only") === "read-only", "read-only passes through");
assert(normalizeRoomAccessTier("FULL") === null, "case-mismatched value is rejected");
assert(normalizeRoomAccessTier("admin") === null, "unknown value is rejected");
assert(normalizeRoomAccessTier("") === null, "empty string is rejected");
assert(normalizeRoomAccessTier(undefined) === null, "undefined is rejected");
assert(normalizeRoomAccessTier(null) === null, "null is rejected");
assert(normalizeRoomAccessTier({ tier: "full" }) === null, "object is rejected");
assert(normalizeRoomAccessTier(1) === null, "number is rejected");
// An unrecognized value must NOT read as permissive — callers fall back to the
// default, which is the restrictive-by-comparison hub-notes.
assert(
	tierAllowsStructuralChange(normalizeRoomAccessTier("anything") ?? DEFAULT_ROOM_ACCESS_TIER) === false,
	"a junk tier value falls back to a non-structural tier, not full access",
);

assert(
	Object.keys(ROOM_ACCESS_TIER_LABELS).length === 3,
	"exactly three tiers are exposed to the UI",
);

console.log("\n--- 3: the tier propagates hub → spoke through Yjs ---");

const hubDoc = new Y.Doc();
const spokeDoc = new Y.Doc();
const hub = bareVaultSync(hubDoc);
const spoke = bareVaultSync(spokeDoc);

/** Two-way sync, as the room's Durable Object relay would do. */
function syncDocs() {
	Y.applyUpdate(spokeDoc, Y.encodeStateAsUpdate(hubDoc, Y.encodeStateVector(spokeDoc)));
	Y.applyUpdate(hubDoc, Y.encodeStateAsUpdate(spokeDoc, Y.encodeStateVector(hubDoc)));
}

const observed = [];
spoke.onSharedSettingsChange((keys) => observed.push(...keys));

assert(spoke.getSharedSetting("roomAccessTier") === undefined, "spoke starts with no published tier");

hub.setSharedSetting("roomAccessTier", "read-only");
syncDocs();
assert(spoke.getSharedSetting("roomAccessTier") === "read-only", "spoke sees the hub's published tier");
assert(observed.includes("roomAccessTier"), "spoke's observer fired for the tier key");

// Tightening and loosening must both propagate.
observed.length = 0;
hub.setSharedSetting("roomAccessTier", "full");
syncDocs();
assert(spoke.getSharedSetting("roomAccessTier") === "full", "a later change also propagates");
assert(observed.includes("roomAccessTier"), "observer fired again on the second change");

// Setting the same value must not churn observers — this runs on every
// provider sync, so a no-op write would re-bind every open editor repeatedly.
observed.length = 0;
hub.setSharedSetting("roomAccessTier", "full");
syncDocs();
assert(observed.length === 0, "re-publishing an unchanged tier fires no observer");

// A spoke that was offline for the change still converges once it syncs.
const lateDoc = new Y.Doc();
const late = bareVaultSync(lateDoc);
Y.applyUpdate(lateDoc, Y.encodeStateAsUpdate(hubDoc));
assert(
	late.getSharedSetting("roomAccessTier") === "full",
	"a spoke joining after the change reads the current tier, not a stale one",
);

console.log("\n--- 4: every spoke write path is gated in main.ts ---");

assert(
	mainSrc.includes("const ROOM_ACCESS_TIER_KEY = \"roomAccessTier\""),
	"the shared-settings key is defined once, not string-literalled per call site",
);

const effective = methodBody(mainSrc, "getEffectiveRoomTier(roomId: string): RoomAccessTier");
assert(effective !== "", "getEffectiveRoomTier() exists");
assert(
	effective.includes('room.role === "hub"') && effective.includes('return "full"'),
	"the hub is never gated by its own room's tier",
);
assert(
	effective.indexOf("getSharedSetting") < effective.indexOf("room.accessTier"),
	"the room Y.Doc wins over the locally-stored invite value",
);
assert(
	effective.includes("DEFAULT_ROOM_ACCESS_TIER"),
	"falls back to the documented default when nothing is published",
);

// Content edits: gated on canWriteRoomContent (read-only only).
const syncFromDisk = methodBody(mainSrc, "private async syncFileFromDisk(");
assert(
	syncFromDisk.includes("canWriteRoomContent(roomId)"),
	"editing an existing room note is gated (read-only)",
);
assert(
	syncFromDisk.includes("canChangeRoomStructure(roomId)"),
	"creating a new room note is gated (needs full)",
);
assert(
	syncFromDisk.indexOf("canChangeRoomStructure(roomId)") < syncFromDisk.indexOf("vaultSync.ensureFile(crdtPath, content, this.settings.deviceName);"),
	"the create gate runs BEFORE the file is seeded into the room Y.Doc",
);

// Rename and delete: both structural.
const vaultEvents = methodBody(mainSrc, "private registerVaultEvents(): void");
assert(
	vaultEvents.includes('noticeRoomWriteBlocked(matchedRoom.roomId, file.path, "rename")'),
	"rename is gated",
);
assert(
	vaultEvents.includes('noticeRoomWriteBlocked(deleteRoomId, file.path, "delete")'),
	"delete is gated — a spoke deleting its copy must not delete it for the hub",
);
assert(
	vaultEvents.indexOf("canChangeRoomStructure(deleteRoomId)") < vaultEvents.indexOf("roomResult.roomSync.handleDelete("),
	"the delete gate runs BEFORE handleDelete tombstones the note",
);

// Read-only must also stop the editor itself, not just the disk path.
assert(
	mainSrc.includes('this.getEffectiveRoomTier(room.roomId) === "read-only"'),
	"room editor bindings are constructed with a read-only predicate",
);
const editorBindingSrc = readFileSync(new URL("../src/sync/editorBinding.ts", import.meta.url), "utf8");
assert(
	editorBindingSrc.includes("EditorState.readOnly.of(true)")
	&& editorBindingSrc.includes("EditorView.editable.of(false)"),
	"a read-only binding makes CM6 non-editable (yCollab would otherwise push keystrokes)",
);

// The user has to be told, or a blocked write looks like a sync failure.
assert(
	methodBody(mainSrc, "private noticeRoomWriteBlocked(") !== "",
	"blocked writes surface a notice (PROJECT-PLAN 4.8's UX gap)",
);
assert(
	mainSrc.includes("roomWriteBlockedNotices"),
	"the notice is deduplicated per path so it fires once, not per keystroke",
);

console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
