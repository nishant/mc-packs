# Performance audit, November 2026

A read-only audit of everything that costs time or bytes: the packs' scripts, the bundle and its shared modules, the
resource packs, the test harness and CI, and (in `nishant/hosting`) the website and its deploy. Done on 2026-11-14
at master `68095de5`, on Fable 5.2 at high effort: seven reader tracks plus the lead's own read of the bundle and of
the profile data from validation run 43107658136. Nothing was built or run for it, so every cost that is not quoted
from a validation report is an estimate from counted native calls (about 10 us each) and says so.

- [PLAN.md](PLAN.md): what to do, in what order, and the targets. Open work only.
- [findings/](findings/): 244 findings in seven files, each with `path:line`, frequency, cost, fix and proof, plus
  what was checked and found fine and which first-pass leads were rejected.
- [brief.md](brief.md): the brief the readers worked from (limits, evidence rules, what was already known).

Four of the pack tracks had a first pass by a weaker model; each was then redone from the code on Fable, which
confirmed, corrected or rejected every first-pass finding. Only the second-pass files are kept.
