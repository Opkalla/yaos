/**
 * Room-only startup regressions (3.4.0).
 *
 * A spoke can join a room via an invite link and never configure a host of its
 * own — the invite carries a room-scoped host+token. Before 3.4.0 that vault
 * synced only until the next restart, because:
 *
 *  1. startAllRooms() was called from the tail of initSync(), and onload()
 *     returned early when settings.host/token were empty. The room sync was
 *     started only as a side effect of joinRoom() in the live session.
 *  2. The settings tab hid the entire Rooms section behind !setupIncomplete,
 *     so a hostless spoke could not see that it was in a room at all.
 *  3. The status bar reported only the personal VaultSync, so a working
 *     room-only vault read "CRDT: Disconnected".
 *
 * main.ts cannot be imported outside Obsidian (it extends Plugin and pulls in
 * the `obsidian` module), so these are source-level structural assertions.
 * They are deliberately shaped to fail if the startup ordering or the settings
 * gating regresses back to the personal-sync-only assumption.
 *
 * Run: node tests/room-only-startup-regressions.mjs
 */
import { readFileSync } from "node:fs";

const mainSrc = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
const settingsSrc = readFileSync(new URL("../src/settings.ts", import.meta.url), "utf8");

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
	if (start === -1) return null;
	const open = src.indexOf("{", start);
	if (open === -1) return null;
	let depth = 0;
	for (let i = open; i < src.length; i++) {
		if (src[i] === "{") depth++;
		else if (src[i] === "}") {
			depth--;
			if (depth === 0) return src.slice(open, i + 1);
		}
	}
	return null;
}

console.log("\n--- 1: room-only startup path exists and precedes the host gates ---");

const onload = methodBody(mainSrc, "async onload()") ?? "";
assert(onload !== "", "onload() body located");

const roomOnlyCall = onload.indexOf("initRoomOnlyMode()");
const missingHostReturn = onload.indexOf('finishOnload("missing-host")');
const missingTokenReturn = onload.indexOf('finishOnload("missing-token")');

assert(roomOnlyCall !== -1, "onload() reaches initRoomOnlyMode()");
assert(missingHostReturn !== -1, "onload() still has the missing-host bail-out");
assert(
	roomOnlyCall !== -1 && missingHostReturn !== -1 && roomOnlyCall < missingHostReturn,
	"initRoomOnlyMode() is attempted BEFORE the missing-host early return",
);
assert(
	roomOnlyCall !== -1 && missingTokenReturn !== -1 && roomOnlyCall < missingTokenReturn,
	"initRoomOnlyMode() is attempted BEFORE the missing-token early return",
);
assert(
	onload.includes("hasIndependentRooms()"),
	"the room-only path is gated on hasIndependentRooms()",
);

console.log("\n--- 2: initRoomOnlyMode wires up what vault events need ---");

const roomOnlyMode = methodBody(mainSrc, "private async initRoomOnlyMode()") ?? "";
assert(roomOnlyMode !== "", "initRoomOnlyMode() body located");
assert(
	roomOnlyMode.includes("registerVaultEvents()"),
	"registers vault events (otherwise local edits never reach the room)",
);
assert(
	roomOnlyMode.includes("this.reconciled = true"),
	"sets reconciled (every vault event handler is gated on it)",
);
assert(
	roomOnlyMode.includes('startAllRooms("independent")'),
	"starts only rooms that carry their own host+token",
);
assert(
	roomOnlyMode.includes("bindAllOpenEditors()"),
	"binds already-open editors so room files are live immediately",
);
// 3.4.1: ordering matters. Both rebind hooks inside startRoomSync
// (seedRoomAndRebindEditors and the onProviderSync callback) are gated on
// `reconciled`. If rooms start first, those hooks no-op and the spoke stays
// bound to stub Y.Texts — text arrives only via the DiskMirror (stutter-y,
// sub-real-time) and remote cursors never render.
const reconciledAt = roomOnlyMode.indexOf("this.reconciled = true");
const startRoomsAt = roomOnlyMode.indexOf('startAllRooms("independent")');
assert(
	reconciledAt !== -1 && startRoomsAt !== -1 && reconciledAt < startRoomsAt,
	"reconciled is set BEFORE rooms start (rebind hooks are gated on it)",
);

console.log("\n--- 3: startAllRooms scoping ---");

const startAllRooms = methodBody(mainSrc, 'private async startAllRooms(scope: "independent" | "all")') ?? "";
assert(startAllRooms !== "", "startAllRooms() takes a scope argument");
assert(
	startAllRooms.includes('scope === "independent" && !(room.host && room.token)'),
	"independent scope skips rooms that inherit the vault connection",
);

const initSync = methodBody(mainSrc, "private async initSync()");
assert(
	initSync !== null && initSync.includes('startAllRooms("all")'),
	"the normal startup path still starts every room after personal sync",
);

const startRoomSync = methodBody(mainSrc, "private async startRoomSync(room: RoomConfig)");
assert(
	startRoomSync !== null && startRoomSync.includes("if (this.roomSyncs.has(room.roomId)) return"),
	"startRoomSync is idempotent (safe to call from both startup paths)",
);

console.log("\n--- 4: status reporting covers rooms ---");

assert(
	mainSrc.includes("getRoomStatus(roomId: string)"),
	"per-room live status accessor exists",
);
assert(
	mainSrc.includes("getConnectedRoomCount()"),
	"aggregate connected-room count exists",
);

const updateStatusBar = methodBody(mainSrc, "private updateStatusBar(state: SyncStatus)") ?? "";
assert(updateStatusBar !== "", "updateStatusBar() body located");
assert(
	updateStatusBar.includes("getConnectedRoomCount()"),
	"status bar text accounts for connected rooms",
);
assert(
	updateStatusBar.includes("hasPersonalConnection()"),
	"status bar distinguishes room-only from personal-sync vaults",
);
assert(
	!updateStatusBar.includes("let text = this.getSyncStatusLabel(state);"),
	"status bar no longer reports the personal sync label unconditionally",
);

console.log("\n--- 4b: room editor bindings are audited, not just personal ones ---");

const auditAll = methodBody(mainSrc, "private auditAllEditorBindings(reason: string)") ?? "";
assert(auditAll !== "", "auditAllEditorBindings() exists");
assert(
	auditAll.includes("this.roomEditorBindings.values()"),
	"the audit covers every room's binding manager (repairs stale stub Y.Texts)",
);
assert(
	roomOnlyMode.includes('auditAllEditorBindings("status-tick")'),
	"room-only mode ticks the binding audit",
);
assert(
	(initSync ?? "").includes('auditAllEditorBindings("status-tick")'),
	"the normal startup path ticks the same audit",
);

console.log("\n--- 5: settings tab shows rooms without a personal connection ---");

const display = methodBody(settingsSrc, "display(): void") ?? "";
assert(display !== "", "settings display() body located");

const roomsMarker = display.indexOf("// ── Section 2: Rooms");
assert(roomsMarker !== -1, "Rooms section marker found");
// The gate that used to hide rooms was `if (!setupIncomplete) {` immediately
// after the section marker. Assert the next statement is no longer that gate.
const afterMarker = display.slice(roomsMarker, roomsMarker + 400);
assert(
	!/Section 2: Rooms[\s\S]{0,200}?if \(!setupIncomplete\)/.test(afterMarker),
	"Rooms section is NOT gated behind !setupIncomplete",
);
assert(
	display.includes("getRoomStatus(room.roomId)"),
	"each room card renders its live connection state",
);
assert(
	!/room.role === "hub" \? "Hub" : "Spoke",\s*\n\s*cls: `lodestone-settings-status-badge/.test(display),
	"the room badge is no longer the static role string",
);
assert(
	display.includes("Room sync only"),
	"a hostless vault with rooms gets a room-only card, not a broken-setup warning",
);

console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
