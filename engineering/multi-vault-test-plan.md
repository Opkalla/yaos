# Multi-vault test plan — 3-person, 2-hub topology

Target version: **3.5.0 or later on every device.** Verify before starting: each
person's Obsidian → Lodestone settings shows their plugin version, and the
status bar shows a room count (`… · 1/1 rooms`) rather than only `CRDT:`.

Participants and roles:

| Person | Role in this test | Needs their own Worker? |
|---|---|---|
| Austin | Hub A (owns rooms 1 and 2) | Yes — already deployed |
| Dad | Spoke in room 1; later Hub B | Not at first; yes for Phase 3 |
| Noah | Spoke in rooms 1 and 2 | No |

The point of the test is **isolation** — that each room only ever contains what
its hub shared, and that nobody sees anything outside the rooms they joined.
Every phase below has an isolation check; those are the ones that matter most.

---

## Phase 0 — Baseline (everyone, 5 min)

1. Everyone updates the Lodestone plugin to the same version and **restarts
   Obsidian** (not just reload — the startup path changed in 3.4.1).
2. Everyone confirms in settings: plugin version matches, and the Rooms section
   is visible. Each room card should show a "Server" row and an access-tier row.
3. Austin only: confirm `Connected to Host` with a green badge.
4. Dad and Noah: put a private note somewhere **outside** any folder that will
   be shared, with recognizable text (e.g. `PRIVATE-dad.md`). This is the
   control for the isolation checks.

> If anyone's status bar reads `Disconnected`, stop and capture their Lodestone
> debug log before changing anything — that's a finding, not a setup hiccup.

---

## Phase 1 — Room 1: Austin (hub) + Dad + Noah

**Setup.** Austin creates room 1, shares one folder, and sends the invite link
to Dad and Noah. Each of them joins and picks a local folder for it.

**Checks, in order:**

1. **Seeding** — Dad and Noah both see every note from the shared folder, with
   correct content. Note how long this takes.
2. **Live text, hub → spokes** — Austin types in an existing note that Dad and
   Noah both have open. It should appear **character by character**, not in
   chunks a second or two later. Chunky/stutter-y arrival is the 3.4.0 bug
   fixed in 3.4.1 and means someone did not update.
3. **Cursors, both directions** — Austin should see Dad's and Noah's cursors;
   both of them should see Austin's. Missing cursors on the spoke side is the
   same bug as above.
4. **Live text, spoke → hub** — Dad edits an existing shared note; Austin and
   Noah both see it live.
5. **Three-way concurrent edit** — all three type in the **same paragraph** at
   once for ~10 seconds. Expect interleaved text and no duplicated or lost
   lines. This is the CRDT's core claim; it is worth being deliberately rough.
6. **New note by the hub** — Austin creates a note in the shared folder, waits
   for it to appear on both spokes, then types. It should be live for everyone.
7. **Isolation check** — Dad and Noah confirm they see *only* the shared folder's
   contents, and that Austin's other notes are absent. Austin confirms
   `PRIVATE-dad.md` did **not** appear in his vault.
8. **Structural changes are hub-only on the default tier** — Austin renames a
   shared note and deletes another; both propagate. Then Dad creates a note
   inside his room folder: it should stay local, **not** reach Austin or Noah,
   and Dad should get a notice telling him only the host can add notes. Confirm
   it survives a restart on Dad's side. Dad should also try deleting a shared
   note — it must stay put for Austin and Noah (a spoke delete propagating
   would be the worst-case bug in this area).
9. **Restart durability** — Dad and Noah fully quit and reopen Obsidian. The
   room should reconnect on its own, still show `1/1 rooms`, and still be live.
   Repeat check 2 after the restart.
10. **Offline catch-up** — Noah disconnects from Wi-Fi, edits a shared note,
    Austin edits the *same* note meanwhile, then Noah reconnects. Both edits
    should merge with nothing lost.

---

## Phase 2 — Room 2: Austin (hub) + Noah only

**Setup.** Austin creates room 2 with a **different** folder and invites only
Noah.

**Checks:**

1. Both rooms show separately in Austin's and Noah's settings, each with its own
   live badge. Status bar reads `2/2 rooms` for Austin, `2/2 rooms` for Noah,
   `1/1 rooms` for Dad.
2. **The isolation check that matters most** — Dad must see **no trace** of room
   2: not the folder, not the notes, not in search, not in graph view. Austin
   should type in room 2 while Dad watches for anything appearing.
3. Austin edits notes in both rooms in quick succession; each edit lands in the
   right room on the right people, with no cross-contamination.
4. Noah edits in room 2 → Austin sees it; Dad sees nothing.
5. **Leave and rejoin** — Noah leaves room 2. His local files should remain but
   stop syncing (Austin edits something to confirm). Noah rejoins with the same
   invite link and catches back up.

---

## Phase 2b — Access tiers (Austin sets, Dad and Noah feel it)

New in 3.5.0. The hub picks one of three tiers per room; the setting lives in
Settings → Rooms → Edit on the hub's room card. Every tier change should reach
the spokes **live**, with no restart and no rejoin.

1. **Default is "Edit shared notes"** — confirm on all three vaults that room 1
   shows that tier (hub card says "Spoke access", spoke cards say "Your access").
   This is the behavior already exercised in Phase 1.
2. **Switch room 1 to Read-only.** Within a few seconds, without restarting:
   - Dad and Noah should find the shared notes **not editable** — no caret,
     typing does nothing.
   - Austin edits a note; both still see it arrive live. Read-only must not mean
     disconnected.
   - Both spokes' room cards should now read "Read-only".
3. **Switch back to "Edit shared notes"** — editing should start working again
   for both spokes, again without a restart.
4. **Switch room 1 to Full access.** Now Dad creates a note inside the room
   folder: it **should** propagate to Austin and Noah. Have Dad rename it, then
   delete it — both should propagate too.
5. **Drop back to "Edit shared notes"** with Dad's note still in the room. It
   stays (it's already shared); Dad should now be blocked from creating a
   *second* one, with a notice.
6. **Offline tier change** — Noah quits Obsidian. Austin sets room 1 to
   Read-only. Noah reopens: he should come back **already** read-only, not
   editable-then-corrected.
7. **Per-room independence** — set room 1 and room 2 to *different* tiers and
   confirm Noah (who is in both) gets each room's rule separately.

Worth noting explicitly: tiers are enforced by the plugin on each spoke, not by
the server. This test verifies cooperating clients honor the setting; it is not
a test of a security boundary, and shouldn't be described as one.

## Phase 3 — Two hubs, peer to peer (Austin ↔ Dad)

This is the new topology: both vaults are hubs with their own Workers, and each
is a spoke in the other's room.

**Setup.** Dad deploys his own Worker and claims it, then creates his own room
(room 3) sharing a folder of his and invites **only Austin**.

**Checks:**

1. Dad's settings should now show `Connected to Host` *plus* his room cards —
   room 1 as spoke (on Austin's server) and room 3 as hub (on his own).
2. **Per-room server routing** — on Austin's side, the `Server` row on each room
   card should show Austin's Worker for rooms 1 and 2, and **Dad's** Worker for
   room 3. This is the thing to look at closely; it is the whole point of the
   phase.
3. Austin and Dad edit room 3 live, both directions, cursors both ways.
4. **Simultaneous cross-room editing** — Austin edits room 1 (his server) and
   room 3 (Dad's server) within a few seconds of each other. Both should be
   live, independently. Dad does the reverse.
5. **Isolation, both directions** — Noah must see nothing from room 3. Dad's
   room 3 folder must not leak into rooms 1 or 2, and Austin's room 1/2 content
   must not appear in room 3.
6. **One server down, the other unaffected** — Dad stops or unbinds his Worker
   briefly. Room 3 should show offline on both sides while rooms 1 and 2 keep
   working normally, and Austin's status bar should show a partial count
   (`2/3 rooms`). When Dad's server returns, room 3 catches up on its own.
7. **Restart both hubs** — Austin and Dad quit and reopen Obsidian. All rooms
   reconnect without intervention.

---

## What to write down

For each check: pass / fail, and for anything that felt slow, roughly how slow.
Specifically worth capturing:

- Seeding time per room, and rough note count.
- Any status-bar text that disagreed with reality.
- Anything that needed a restart, a reload, or a rejoin to start working —
  that's a bug even if the end state was correct.
- Anything that appeared in a vault that should not have. Treat any isolation
  failure as stop-the-test and capture the debug log immediately.
- Whether cursors appeared **immediately** on opening a note, or only after
  someone typed. "Only after typing" is a binding-timing regression.

Turn on **Debug** in Lodestone settings on at least one spoke before Phase 1;
the trace log is what makes a vague "it felt laggy" diagnosable afterward.

---

## Known limits going in — not bugs

- Room access tiers are **per room, not per spoke** — every spoke in a room gets
  the same tier. Per-spoke permissions would need a spoke identity model that
  doesn't exist today; deliberately not in this build.
- Tiers (and the host-only structure rule generally) are enforced in the client,
  not the server (see `lodestone.md`). A modified client could ignore them.
- A spoke's blocked note stays on its own disk permanently. It does not queue up
  and propagate later if the tier is raised — the spoke has to touch the file
  again once it has access.
- Attachments sync through R2 separately from note text and can lag behind it.
- Vault size target is ~50 MB; see `engineering/warts-and-limits.md`.
