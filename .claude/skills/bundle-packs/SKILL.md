---
name: bundle-packs
description: Combine the packs from this repo's packs/ folder into bundles (dist/realm_bundle.mcpack for every behavior pack, dist/realm_resources.mcpack for every resource pack) so the Realm only needs two packs. Use when the user asks to bundle, combine, merge or compile packs into one, or invokes /bundle-packs. Optional args - "all", or a comma/space-separated list of pack folders, and optionally "name=<file_name>" / "title=<display name>".
---

# Bundle packs into one .mcpack

`tools/bundle.mjs` merges the selected behavior packs into one: each pack's `scripts/` goes to `scripts/<pack>/`, and a generated `scripts/main.js` imports each of them. `--resources` merges every resource pack into one resource pack, Realm Resources (`dist/realm_resources.mcpack`); a pack can't hold both kinds, so behavior and resource packs are always two bundles. Dependencies are merged to the highest version. The bundle's UUID comes from `--name`, so rebuilding updates the same pack on the Realm instead of adding a second one.

## Steps

1. **List the packs.** Run:
   ```bash
   node tools/bundle.mjs --list --json
   ```
   `"bundle"` says which bundle takes each pack: `realm_bundle` (behavior packs, `--all`) or `realm_resources` (resource packs, `--resources`). Packs with `"bundled": false` are **standalone** (listed in `tools/standalone.json`, empty today): both flags leave them out. Mention them, and only include one if the user names it. Never mix the two kinds in one `--packs` list.

2. **Pick the packs.** Skip this step if the args already say `all` or name pack folders. Check the folders against the list and stop on unknown ones.

   Otherwise, use `AskUserQuestion`:

   - **Question 1** (single select, header `Packs`): "Which packs should go in the bundle?"
     - Option 1 **must be first**: label `All packs (Recommended)`, description = the names of the `"bundled": true` packs joined with ", ".
     - Option 2: label `Let me choose`, description `Pick individual packs`.
   - If they picked **Let me choose**, ask one more `AskUserQuestion` call with `multiSelect: true`:
     - One option per pack: label = pack `name` (≤ 5 words), description = the pack's `description` plus its folder in backticks.
     - A question can hold at most 4 options, so split the packs into chunks of 4. Each chunk is its own question in the **same call**, with headers `Packs 1`, `Packs 2`, …, up to 4 questions (16 packs) per call. Use another call for more.
     - Map the chosen labels back to folders. If nothing was picked, ask again instead of building an empty bundle.

3. **Build it.** Default name `realm_bundle`, title `Realm Bundle`, unless the args override them:
   ```bash
   npm run bundle -- --all                                  # every bundled (non-standalone) behavior pack
   npm run bundle -- --resources                            # every bundled resource pack → dist/realm_resources.mcpack
   npm run bundle -- --packs welcome_bp,stats_bp            # a selection (keep the user's order)
   npm run bundle -- --packs a,b --name my_bundle --title "My Bundle"
   ```
   If it errors (file conflict between packs, mismatched major `@minecraft/*` versions, …), show the error and explain which packs conflict. Don't work around it by editing the packs unless the user asks.

4. **Check it.** Run `npm run check`, then `python3 -m zipfile -l dist/<name>.mcpack` and confirm `manifest.json` plus `scripts/<pack>/…` for every chosen pack are in it.

5. **Report back.** Send `dist/<name>.mcpack` with `SendUserFile` if that tool exists, otherwise give the path. Include:
   - a table of the packs included, with each pack's version and commands (from its manifest description), and the bundle version (`[YYYY, MMDD, HHMM]` UTC, so it always goes up)
   - **Important:** on the Realm, activate *either* the bundle *or* the individual packs, never both. Running both would register every command twice, and the duplicate commands fail to load.
   - To update later, rebuild with the same `--name` and re-apply it. It replaces the old bundle in place.
   - Switching between individual packs and a bundle resets in-game settings stored as dynamic properties (Bedrock keeps them separately for each pack): welcome or news edits, tips, per-player toggles. Scoreboard stats are kept. Rebuilding the *same* bundle name keeps everything.

Don't commit `dist/`. It's gitignored.
