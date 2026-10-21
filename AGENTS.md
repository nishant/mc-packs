# AGENTS.md

Instructions for coding agents other than Claude Code (GitHub Copilot, Codex and others), which read this file
instead of `CLAUDE.md`. The rules are the same for everyone, and they live in one place:

1. Read [`CLAUDE.md`](CLAUDE.md) first and follow it as this repository's instructions (pack layout, generated
   files, docs that change with the code, version bumps, stable APIs only, the finishing steps).
2. Before big or multi-pack work, read [`docs/WORKING.md`](docs/WORKING.md): the finishing order, "Testing in CI",
   the known API quirks and the C1-C29 bug checklist.
3. `npm run check` and `npm run build` must pass before you push. CI then runs the BDS scenarios your change
   touches and a perf check against the PR's base (`.github/workflows/pr-tests.yml`); the long soaks and the whole
   suite run after the merge (`validate.yml`). Don't run the long soaks by hand to get a change out.

Claude Code skills in `.claude/skills/` are optional helpers; everything they do is also a plain command in
`CLAUDE.md` ("Commands").
