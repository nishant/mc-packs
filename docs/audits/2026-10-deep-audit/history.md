# mc-packs history audit: recurring fix classes

Scope: `/home/user/mc-packs`, 728 commits, 2026-10-04 to 2026-10-18 (two weeks). Hosting history read only for pack publishing (Realm Help and Realm News). Read-only; nothing edited.

Method: `git log --stat`, `--grep` (subject and body), `-G` (diff content) and per-path counts, plus selected diffs (b34e042, a629c4d, b164eff, 12a861a, 79b7ff4, 6cb2fa5, 2a060f0, fb9cbb9, 566522d, 98d02e8, cb4b6dd and others).

Overall numbers:
- 161 non-merge commits say fix, bug, wrong, lost, stale, again, instead or similar.
- 31 commits are WIP or checkpoint commits.
- 15 commits on 2026-10-17 are co-authored by Copilot App. That one day holds the stash, HUD, label and admin churn.

Most commits per pack:

| Pack | Commits |
|---|---|
| saga | 100 |
| help | 83 |
| news | 81 |
| admin | 40 |
| expedition | 39 |
| npc | 37 |
| domt | 33 |
| maps | 31 |
| build | 25 |
| stash | 23 |
| elytra | 22 |

## Known classes (confirmed, counted, refined)

| Area | Commits | Span | Root cause | Checklist |
|---|---|---|---|---|
| Minimap / Side HUD layout (`hud_rp`, `map_bp`) | 29 touch the two packs. About 17 are only sizes and spacing: 1cb593a, caab4b1, 3f91ba9, 84a7070, 9f9dba0, 9d174f9, e327f2e, 8d0e1f1, 7f7861c, e1a2e43, ca9c5a6, e1c2f1a, 8ccda1c, 12a861a, c2fa9cd, 70cb4d5, f4be371, 3b00080 | 10-11 to 10-18 | JSON UI sizes were guessed and tuned blind. BDS cannot render the client, so nothing checked them until 12a861a ("literal HUD dimensions proven by client sizing diagnostic"): scalar size aliases collapse numbered cells to the minimum. 70cb4d5 then measured glyph advances (8.5 by 9 px). The grid went 15x15, then 21x21, then v4 in two days, and each redesign threw the fit off again. | C1 |
| NPC name labels (npc, caravan, wander, saga) | 9 commits, 6 designs | 10-15 to 10-17 | (1) Resend nameTag on approach (e3fd45b). (2) 120-block helper label entities (92f0408). (3) Client entities in build_rp (6cb2fa5). (4) 20 m anchored (8d0e1f1). (5) Removed in favor of native names (fb9cbb9, 2a060f0). (6) Leftovers restored (566522d), then single-carrier world-fixed helper (79b7ff4). The Bedrock client caches the default "NPC" nameplate of `minecraft:npc`. No design was checked on a real client before it shipped. Removing entity definitions orphans entities already in saved worlds. `name-labels.js` is now 4 identical 332-line copies with no `sync-*` tool. | C2, C14 |
| Expansive Inventory pages (`stash_bp`) | 10: 6cb2fa5, c97fc63, 8d0e1f1, b164eff, 5bd94a5, 1092b18, 1dc4407, b760d20, ca9c5a6, fb7c74d | 10-16 to 10-17 | Inactive pages were saved as JSON copies of ItemStacks. The script API cannot serialize everything: shulker contents, potions and bundles were kept only in RAM ("1.6.2 holds opaque stacks only in RAM"), and pages over 28 KB were split. A restart or crash lost items. Fixed by `StructureSaveMode.World` snapshots of an inventory entity, verified before the live inventory changes, plus one committed index property and a rollback journal. Cursor and button-slot items were overwritten too. | C3, C9 |
| Realm Configuration item (`admin_bp`) duplicates and concurrency | 40 commits on admin. The item fix is b34e042, and concurrent changes are 6762121 plus merge b745ccb ("Preserve concurrent operator-menu source updates"). 0de3b56 fixed a repeated full-inventory note. | 10-11 to 10-17 | The item was recognized by name plus a lore mark. 5d8102d changed the lore and gave the item to every player, so old items were no longer recognized and a new one was given each time, causing duplicates. Inventory-change handlers re-entered on the script's own writes (fixed with the `updatingItem` and `scheduledItem` guards). Config writes from two operators raced (read-modify-write with no queue). | C4, C5 |
| `spawnEntity` returns another entity | 2: a629c4d (elite, saga) and 7d2891f (siege Choir). d696039 cleaned up afterward. | 10-16 | In a world with repeating entity ids, the returned handle can be an existing entity (a dropped item became the Bell Warden). Tags put on it leaked onto items (d696039: champion tags on non-mobs used up `maxAlive`). Fixed with a `spawnFresh` loop that checks `typeId`. | C6 |
| help_bp / news_bp published stale | 4: #20 and #24 (stale catalog), #64 ("bump past versions already published from master"), #72 ("1.1.42 was already published with the previous catalog"). In hosting, 6d61a0ff synced the docs and catalog afterward. | 10-05 to 10-16 | The generators bump the version on every branch, so parallel branches mint the same version with different content. Docs edited after `help-catalog.mjs` leave a stale catalog. `publish-packs` will not overwrite a published version, so the stale build stays live. | C7 |
| NOS Rocket audio (elytra_bp, build_rp sounds) | 5 retunes in one day: 1a5373c, 17e1eec (-35%), 6cb2fa5 (restore crisp), c97fc63 (lower), a1babd7 (0.55/0.65). 880ae17 also fixed the item schema and lang keys. | 10-16 | Tuned by ear with no loudness target or vanilla reference, and no lock. Rain had the same churn (8 commits, 10-05 to 10-16: c3323a9, dacfd99, 0277c26, a0a2242, e793c29, ca8bde5, 05eed52, 921723e) until 3973bb6 added a hash and volume `--check`. NOS has no such lock. | C8 |
| Form `.header()` | Added back in 3 commits (6cb2fa5, 5d8102d, 4aefb9b port). Removed in a9cc2ea and fb7c74d (14 occurrences). | 10-05 to 10-17 | The rule was in docs only. `check-ascii` gained the `.header(` guard only in fb7c74d (10-17), so new and ported code brought it back. | C10 |
| `weatherChange` dimension id | 3: 512aebc, 8e5533f, cb4b6dd (four packs, one by one) | 10-11 | BDS 1.26 sends `"overworld"` without `minecraft:`. Each pack compared strictly. | C11 |
| `getScore` on new players | 5: 078c17a (Guilds lost all rep), ba24466, 19b73f7 (Deck), 37b3318 (Stats), e984b09 | 10-13 to 10-14 | `getScore` throws `Failed to resolve identity` for a player with no score on any objective. | C12 |
| Canceled `beforeEvents` in the bundle | 4: 49fbefc, 98d02e8 (Chairs, Kitchen, slots, waystones), 6d4cfe3 (hive taps), b890b5c (docs) | 10-11 to 10-14 | One bundle means one script context, so later subscribers still get a canceled event. Packs loaded before claims never see the cancel. The harness runs packs separately, which hides it. | C13 |

## Further classes found

| Area | Commits | Span | Root cause | Checklist |
|---|---|---|---|---|
| `getTopmostBlock` skips water (sea bed treated as ground) | 11: cae4729, 58c8434, 48a1916, 2c68a1d, 1b3a418, 30f8da8, 1a65f22, 8be9566 (8 packs at once), 1a1dd00, 54c65b1, 0de3b56 | 10-11 to 10-16 | The API returns the solid block under water. Each pack found this separately. Same with `getBlockBelow` without `includeLiquidBlocks`. | C15 |
| Unloaded / non-ticking chunks | 19: cb4b6dd, 582bd5e, 48a1916, 1de436b, d650c18, 11ab44d, 0c39743, d076fb7, 7b26cbe, ce0eaa2, f433390, f10c423 (caravan at y 319), 8cf09ff, 228aa78, 7d2891f, 58c8434 and others | 10-11 to 10-16 | `getTopmostBlock` on a non-ticking column returns y 319 or a block that throws `LocationInUnloadedChunkError` on `typeId` or `isLiquid`. Jobs dropped work, logged every 5 s, or lost items instead of waiting. Mobs spawned into unloaded rings scattered. | C16 |
| Player leaves, dies or teleports mid-operation | About 48 commits mention leave or join. Examples: daffeb9, 0c39743, 5724c65, c79ac77, 80e198e, 4fd5db8, aae00b5, ca67e98, 16d1b1d, ce0a8ac, aafa29c | 10-04 to 10-16 | State keyed to an online player (forms, timers, carried items, cuts, runs) had no leave or death path. Handles used after an await were stale, which is an `isValid` problem (open item: `[elite] InvalidEntityError`). | C17 |
| Action bar and title collisions | 20: f98be81, e04e8e3, 1cb593a, bd86279, a8220d5, 70927c8, e129315, f5fa894, c57e3c8, 3166e62, ce0eaa2, 766a634, b5fc413, 43252b3, dbb32cc, aafa29c and others | 10-11 to 10-14 | There is one shared action bar and title per player. The protocol (`realm:actionbar` with `from`, steady rank, `realm:title`, one-space subtitle) was added in stages, and every pack was retrofitted one at a time. | C18 |
| Item duplication and loss on give or refund | 9: 30d3110 (Kitchen `giveItems` doubled), 248d8d9 (refund second copy), aae00b5, d650c18 (duplicate on taken slot), 463c8c9 (pumpkin copy across restart), 47ad15d (chest copied), 6d4cfe3 (forged dishes), ba24466 (overflow lost payment), b34e042 | 10-11 to 10-17 | `container.addItem` returns the leftover. Code dropped it and also dropped the item, or ignored it. Identity checks used a renamable nameTag or lore. In-memory "placed by player" sets were lost on restart. | C5, C19 |
| Wrong vanilla ids | 6: 0233d7a (evocation_illager, fence_gate), c7c9b15 (tropicalfish), 29c7cb0 (zombie_villager_v2 display), 880ae17 (1.21.60 item schema), cb4b6dd, 850a2dd (`effectAdd` gives display names) | 10-11 to 10-16 | Ids were guessed. `check-stories` checks story ids, but nothing checks the other packs. | C20 |
| Per-player work on one tick (performance) | 12: 04630e7, 5f43d77 (51-79 ms down to 5-22 ms), 24079f5, 7033bcc, c628c79, 10df3d8, 65c0e6f, d70a99e, 881d683, 3005619, 16fe1b9, 8693a96, e984b09 | 10-12 to 10-15 | Loops over every player, or recomputation of geometry, ran on the same tick or at every look. Full rescans happened where a delta would do. | C21 |
| Saved data size and unbounded lists | 6: e351f37, 83befe7 and 6126487 (Field Journal capped at 40 and silently refused new finds), stash 28 KB split, 65c0e6f, 7f7861c | 10-05 to 10-17 | Dynamic property strings have a cap (about 32 KB). Append-only lists hit it and failed silently. | C22 |
| State lost across restarts | 15: 5004d19, 2e3c0af, 8a29318, 4fbcffb, 463c8c9, 766a634, 7b26cbe, ca9c5a6 and others | 10-05 to 10-17 | Timers, pending effects, spawned helpers and anvils lived only in script memory. | C23 |
| Operator checks | 2 large ones: 90ffd01 (re-check on submit, de-op while open) and 5d8102d (checked server side) | 10-14 to 10-16 | The op check ran only when the form opened, and the client-shown entries were trusted. | C24 |
| Tags and markers leaking to wrong entities | d696039, 79b7ff4 (hidden ownership markers for villager to witch transforms), 59f6d4f (removed a player's helmet) | 10-11 to 10-17 | Ownership was decided by proximity, type or name, not a unique marker. | C6, C25 |
| `tameable` and `is_tamed` | 2: fe98a3b, f5881ab | 10-13 | A tamed mob loses `minecraft:tameable`. | C26 |
| Real time vs game time | 1: faee4df (moon window was 20 real minutes) | 10-13 | Wall-clock timers stand in for in-game durations and drift under sleep or `/time`. | C27 |
| Review after publish, WIP churn | #30, #31, #32, #33; 31 checkpoint commits; Champions approach fix in 3 commits (5f6dea0, 9fcbfc8, 39eb4a6); Tornado look restored after optimizing (880ae17) | the whole span | Published before an integration review. Performance passes changed the visuals without a before/after check. | C28 |

## Checklist (apply to any pack)

- **C1 HUD and JSON UI sizes**
  - grep: `"size"`, `"offset"` and variable aliases (`$cell`) in `hud_screen.json`.
  - Correct: literal dimensions measured on a real client with a sizing diagnostic, plus a regression test that pins them.
- **C2 Nameplates**
  - grep: `nameTag =` on `minecraft:npc` or villagers, and `*_label.json`.
  - Correct: one shared module (shared copy plus a sync tool), checked on a client. Removing an entity definition needs a cleanup of entities already in saved worlds.
- **C3 Item persistence**
  - grep: `JSON.stringify` of items, `getLore`, `setDynamicProperty(.*page`.
  - Correct: structure snapshots (`StructureSaveMode.World`), verified before clearing the live slots, with one committed index.
- **C4 Identifying a pack item**
  - grep: `nameTag ===`, `getLore().includes`.
  - Correct: accept current and legacy marks, and dedupe to one item.
- **C5 Re-entrant inventory handlers**
  - grep: `playerInventoryItemChange` and similar handlers that write to the inventory.
  - Correct: a per-player "updating" set and a single coalesced `system.run` reconcile.
- **C6 `spawnEntity` result**
  - grep: `spawnEntity(`.
  - Correct: check `e.typeId === type` (retry or fail), and tag only after that check.
- **C7 Generated packs**
  - Correct: run `help-catalog.mjs` and `gen-news.mjs` last, after merging master.
  - Before publishing, check that the version is not already in hosting `packs.json`.
- **C8 Sound volume**
  - Correct: a written target in dB relative to a vanilla sound, plus a hash and volume lock in `npm run check`.
- **C9 Cursor and button slots**
  - Correct: never overwrite a real item. Move it, or leave it and tell the player.
- **C10 Forms**
  - grep: `\.header\(`.
  - Correct: `.label("§l§6Title")`.
- **C11 Dimension ids**
  - grep: `weatherChange`, `dimension ===`.
  - Correct: `id.replace(/^minecraft:/, "")` before comparing.
- **C12 Scores**
  - grep: `\.getScore\(`.
  - Correct: a try/catch helper that returns 0.
- **C13 `beforeEvents` taps**
  - grep: `beforeEvents\.(playerInteractWithBlock|playerBreakBlock|itemUse)`.
  - Correct: the first line is `if (ev.cancel) return;`.
  - A pack loaded before claims asks with `realm:access_check`.
- **C14 Duplicated modules**
  - Check: `md5sum packs/*/scripts/<file>`.
  - Correct: identical copies need a `tools/sync-*.mjs` and a check.
- **C15 Water**
  - grep: `getTopmostBlock`, `getBlockBelow`.
  - Correct: check the block above for water (`waterOver` or `dryGround`), and use `includeLiquidBlocks: true`.
- **C16 Unloaded chunks**
  - grep: `getTopmostBlock`, `getBlock(`.
  - Correct: wrap both the call and the reads (`typeId`, `isLiquid`) in try/catch.
  - Treat y 319 or undefined as "not loaded" and retry later; never drop the job.
  - Spawning far from players: use a ticking area.
- **C17 Leave, death and dimension change mid-operation**
  - grep: `await`, `runTimeout`, `form.show`.
  - Correct: `if (!player.isValid) return` after every await or timeout.
  - A `playerLeave` cleanup that puts back blocks and items; `UserBusy` retried, `UserClosed` stops.
- **C18 Action bar and titles**
  - grep: `setActionBar`, `setTitle`.
  - Correct: send `realm:actionbar {player, ticks, from}` first (add `steady` and a rank for redrawn lines), and `realm:title` before titles.
  - A title with no subtitle sends a one-space subtitle.
- **C19 Giving items**
  - grep: `addItem(`, `spawnItem(`.
  - Correct: use the returned leftover exactly once (drop only the leftover).
  - Anything that grants rewards across a restart must be persisted.
- **C20 Ids**
  - grep: `"minecraft:` literals.
  - Correct: check them against `@minecraft/vanilla-data`.
  - `effectAdd` effectType: normalize the display name (lowercase, strip `minecraft:` and the level).
- **C21 Per-tick cost**
  - grep: `runInterval` with `getAllPlayers()` inside.
  - Correct: stagger players over ticks, share per-second work, and cache geometry.
  - Measure with 8-10 players; anything under 1 ms is not worth a change.
- **C22 Saved data size**
  - grep: `setDynamicProperty(` with `JSON.stringify`.
  - Correct: stay under 32 KB, bound append-only lists by dropping the oldest, and never refuse silently.
- **C23 Restarts**
  - Check: any `Map` or `Set` of pending work.
  - Correct: persist it, and on world load clean up and resume.
- **C24 Operators**
  - Correct: check op status on submit and server side, not only when the form opens.
- **C25 Ownership**
  - Correct: a unique tag or hidden marker per pack. Never choose by proximity, type or name.
- **C26 Pets**
  - Correct: use `minecraft:is_tamed`, not `tameable.isTamed`.
- **C27 Time**
  - Correct: in-game durations use game ticks or the time of day, not `Date.now()`.
- **C28 Process**
  - Correct: an integration review before the first publish, a before/after check on visual and performance changes, and a BDS scenario that fails before the fix.
