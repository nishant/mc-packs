# Roadmap

Open work only. Delete an entry in the PR that finishes it. (Items needed before a public release live in `docs/RELEASE_TODO.md`.)

## Performance plan (November 2026)

The performance audit of 2026-11-14 (244 findings: packs, bundle, resource packs, harness and CI) is in
`docs/audits/2026-11-perf-audit/`. Its `PLAN.md` lists the open workstreams (W0 measurement first, then the shared
modules, then per pack), their order and the targets; delete each workstream there in the PR that finishes it, and
this entry with the last one. Implementation runs on Opus at medium effort. The website's half is in
`nishant/hosting`, `minecraft/docs/perf-audit-2026-11/PLAN.md`.

## Finish the November 2026 audit

The overnight audit of 2026-11-08 (report: `C:\Code\.audit\2026-11-08\mc-packs.md` on the PC, finding ids `MCP-nnn`) read only part
of the repo before a usage cut, and fixed the critical, high and most medium findings it found. Left:

- **Easy Building (`build_bp`, `build_rp`):** MCP-042 (preview dot lifetime; needs a client check), MCP-052 (optional dead
  `pre_animation` reads), and the trapdoor `direction` map in Mirror (MCP-019; needs a BDS check).
- **Expeditions:** death-drop collection gives the dead player teammates' items within 6 blocks (MCP-083; the fix needs a BDS check
  of when vanilla death drops exist in the `entityDie` after-event).
- **Phase 3 findings (2026-11-09):** about 180 of the 470 are still open, all low or nit except MCP-113 (the release and merge jobs
  `npm install` hosting's tools with no lockfile, then run them with `HOSTING_TOKEN` in the environment; pin or vendor a lockfile in
  `nishant/hosting`). Full list with evidence and fixes: `C:\Code\.audit\2026-11-08\mc-packs.md`, section "Phase 3 findings" (PC only).
  They are mostly test hygiene, docs drift, small bugs in shared modules (`tools/*-shared.js`, which fan out to many packs),
  duplicated helpers and dead code.
- **Audit lenses not run:** pack-data, live site at 360/840/1440 px, and inventory. Chunk lists are in
  `C:\Code\.audit\2026-11-08\mc-packs-work\chunks\`.
