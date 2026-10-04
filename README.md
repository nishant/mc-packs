# mc-packs

Minecraft Bedrock add-ons for my Realm. Each folder in `packs/` is a standalone behavior pack. They all use only the stable Script API (Minecraft **1.21.100+**), so no experimental toggles are needed.

📖 **Full documentation (what each pack does, every command and config option): [`docs/PACKS.md`](docs/PACKS.md)**

| Pack | Folder | What it does | Commands |
|---|---|---|---|
| [Welcome Message](docs/PACKS.md#welcome-message--welcome_bp) | `welcome_bp` | Popup when players join | `/realm:welcome` · `/realm:welcome_edit` · `/realm:welcome_reset` |
| [Low Durability Warning](docs/PACKS.md#low-durability-warning--durability_bp) | `durability_bp` | Warns at 10% and 3% durability left, for tools, weapons and armor | `/realm:durability` |
| [AFK + Smart Sleep](docs/PACKS.md#afk--smart-sleep--afk_bp) | `afk_bp` | `[AFK]` tag after 5 min idle; the night can be skipped without waiting for AFK players | `/realm:afk` |
| [Stats & Leaderboards](docs/PACKS.md#stats--leaderboards--stats_bp) | `stats_bp` | Playtime, deaths, kills, blocks, distance; leaderboards; sidebar | `/realm:stats` · `/realm:stats_sidebar` |
| [Realm News & Tips](docs/PACKS.md#realm-news--tips--news_bp) | `news_bp` | News popup when something's new, "you were away 3d", rotating chat tips | `/realm:news` · `/realm:news_edit` · `/realm:news_tips` |

Commands with `edit`, `reset`, `tips` or `sidebar` in the name are ops-only. None of the commands need cheats.

## Quick start

```bash
npm install
npm run build                 # dist/<folder>.mcpack for every pack
npm run bundle -- --all       # or: everything in one dist/realm_bundle.mcpack
```

Open the `.mcpack` on a device with Minecraft, then go to **Realms → ✏️ Edit Realm → Behavior Packs** and activate it. Use the individual packs **or** a bundle, never both. See [Installing](docs/PACKS.md#installing-on-a-realm) and [Bundling](docs/PACKS.md#bundling-packs-into-one).

With Claude, `/bundle-packs` asks which packs to include (**All packs** is the first option) and builds the bundle.

## Development

```bash
npm run check   # type-check against @minecraft/server 2.1.0 / server-ui 2.0.0 + check docs/PACKS.md is complete
npm run build   # one .mcpack per pack
npm run bundle  # merge packs into one (--list, --all, --packs a,b, --name, --title)
```

| Path | |
|---|---|
| `packs/<folder>/` | One behavior pack: `manifest.json`, `scripts/main.js`, `scripts/config.js` |
| `docs/PACKS.md` | Documentation. **Update it in the same commit as any pack change**; `npm run check` enforces it |
| `tools/build.mjs`, `tools/bundle.mjs` | Packaging, with no dependencies |
| `tools/check-docs.mjs` | Fails if a pack, command or config option is missing from the docs |
| `.claude/skills/bundle-packs/` | The `/bundle-packs` skill |

Script errors show up in the content log (**Settings → Creator → Enable Content Log GUI**).
