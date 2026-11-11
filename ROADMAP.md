# Roadmap

Open work only. Delete an entry in the PR that finishes it. (Items needed before a public release live in `docs/RELEASE_TODO.md`.)

## Finish the November 2026 audit

The overnight audit of 2026-11-08 (report: `C:\Code\.audit\2026-11-08\mc-packs.md` on the PC, finding ids `MCP-nnn`) read only part
of the repo before a usage cut, and fixed the critical, high and most medium findings it found. Left:

- **Easy Building (`build_bp`, `build_rp`): 34 verified medium, low and nit findings still open.** Medium: left-click book actions the
  docs promise but 2.1.0 cannot do (MCP-011), no per-tick cap on Instant placement and destroys (MCP-013), O(n^2) placement queue
  (MCP-014), undo limits of 500 and 1,000 blocks over the 32 KB property limit (MCP-015), unbounded in-memory undo history (MCP-016),
  shape generators looping over the whole bounding volume (MCP-017), Array and Radial dropping mirror flip flags (MCP-018), Mirror
  flipping states that no longer exist (MCP-019), refund stacks of 64 for items that stack lower (MCP-020), book gifts ignoring
  addItem's leftover (MCP-021), the join message's wrong XP cost for `/realm:build_book` (MCP-055). Low and nit: MCP-022 (rest of the
  saved-data table), MCP-023, MCP-030 to MCP-044, MCP-047 to MCP-052, MCP-088.
- **Expeditions:** death-drop collection gives the dead player teammates' items within 6 blocks (MCP-083; the fix needs a BDS check
  of when vanilla death drops exist in the `entityDie` after-event), and a sigil lost to a restart mid-run is not refunded (rest of
  MCP-081: save `sigilItem` in the run record and refund it at world load).
- **Phase 3 findings (2026-11-09): 218 still open** of 470 (2 medium, 152 low, 64 nit; the other 252 are fixed). Full list with
  evidence and fixes: `C:\Code\.audit6-11-08\mc-packs.md`, section "Phase 3 findings" (PC only). Medium: MCP-113 (release and merge
  jobs `npm install` hosting's tools with no lockfile, then run them with `HOSTING_TOKEN` in the environment; pin or vendor a lockfile in
  `nishant/hosting`) and MCP-118 (HUD right-hand readouts clipped to nothing on short phone viewports such as the Z Fold 7 cover
  screen, `hud_rp/ui/hud_screen.json`). Lows are mostly test hygiene (84: vacuous or misnamed assertions, stale comments, temp files
  left by tests), then docs drift (48), small bugs (32), duplicated helpers (15) and dead code (14).
- **Audit lenses not run:** pack-data, live site at 360/840/1440 px, and inventory. Chunk lists are in
  `C:\Code\.audit6-11-08\mc-packs-work\chunks\`.
