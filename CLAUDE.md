# mc-packs

Minecraft Bedrock behavior packs for a Realm. Each folder in `packs/` is a standalone pack (`manifest.json`, `scripts/main.js`, `scripts/config.js`).

## Rules

- **Docs stay current.** Any change to a pack's behaviour, commands, config options or saved data must update `docs/PACKS.md` (and the pack table in `README.md` if the summary or commands change) **in the same commit**. `npm run check` fails if a pack, a registered command or a `config.js` option is missing from the docs. That only checks coverage, so make sure descriptions and defaults are still accurate too.
- **New pack:** add `packs/<folder>/`, a `## <Name> — \`<folder>\`` section in `docs/PACKS.md` (same layout as the others: what players see, Commands, Configuration, Saved data), a row in the README table, and a mention in "How the packs work together" if it interacts with other packs.
- **Stable APIs only:** `@minecraft/server` 2.1.0 / `@minecraft/server-ui` 2.0.0, no beta modules or experiments, because the packs run on a Realm.
- **Packs stay independent:** no imports between packs. Coordinate through tags or scoreboards, like the AFK pack's `afk` tag that the Stats pack reads. Prefix command names and dynamic property keys with the pack's namespace.
- **Version bumps:** increase `header.version` in a pack's `manifest.json` whenever its contents change.

## Commands

```bash
npm run check   # tsc + tools/check-docs.mjs. Run before every commit
npm run build   # dist/<folder>.mcpack
npm run bundle  # merge packs (see the bundle-packs skill)
```
