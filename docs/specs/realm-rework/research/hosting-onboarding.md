# Research: website + release pipeline (hosting), and first-join / returning-player experience (mc-packs)

Read-only research, 2026-11-15. Nothing was edited, built or run in either repo. Every claim is marked
**[V]** verified by reading the cited file, or **[S]** suspected / inferred. Paths: `H/` = `/home/user/hosting`,
`M/` = `/home/user/mc-packs`. Line numbers are as of the checkouts in this session.

---

## Part A: the website and the release pipeline

### A1. How the realm page is built today

**Files and who owns them**

| File | Size | Written by | Notes |
|---|---|---|---|
| `H/minecraft/site/realm/index.html` | 130 KB raw, 1,100 lines (39 KB compressed per `H/minecraft/docs/perf-audit-2026-11/PLAN.md`) | hand-written shell + three generated marker regions | [V] |
| `H/minecraft/site/realm/cards/<id>.html` | 74 files, 3 KB to 94 KB (`saga.html` 94 KB, `expedition.html` 72 KB, `town.html` 60 KB) | `tools/pack-docs.mjs` | [V] one fragment per pack, fetched when a card opens |
| `H/minecraft/site/realm/search.json` | 982 KB | `tools/pack-docs.mjs` | [V] `{ "<cardId>": "<lowercased plain text of the fragment>" }`, fetched once on the first search (`realm/index.html` script, `fetch(new URL('search.json', ...))`) |
| `H/minecraft/site/realm/media/` | pictures and clips | `pack-docs.mjs` copies from `M/docs/media/`, deletes the rest | [V] pack-docs.mjs:242-256 |
| `H/minecraft/site/commands/index.html` | 67 KB | hand-written, plus rows between `// pack-docs:commands:start` / `end` | [V] pack-docs.mjs:279-294 |
| `H/minecraft/site/packs/packs.json` | 1.03 MB, 76 packs (2 bundles + 74 singles), 1,500+ versions | `tools/publish-packs.mjs` (+ `archive-packs.mjs` adds `archive` URLs) | [V] |
| `H/minecraft/site/catalog.json` → `"realm"` (line 573) and `"built"` (line 563) | hand-written | nobody generates it | [V] |

**pack-docs.mjs, exactly** [V] (`H/minecraft/tools/pack-docs.mjs`):

- Input: `M/docs/PACKS.md` only, plus `node tools/bundle.mjs --list --json` run in mc-packs to learn which folders
  are in `realm_bundle` (lines 55-56).
- A pack is any `## Name — \`folder\`` heading (line 179). Its card id is the folder without `_bp`
  (`cardId` in `tools/lib.mjs`; `rain_rp` stays `rain_rp`).
- The card header on the page: name, the section's first paragraph as the summary, command chips parsed from the
  Commands table (dashed = ops). The body fragment: gallery (`### See and hear it`), `### How to use`,
  `### Commands`, then two collapsed boxes: "How it works in detail" (every other `###`) and "For operators: settings
  and saved data" (`### Configuration…`, `### Saved data`, `### Resetting…`) (lines 185-212).
- **A pack section with no `### How to use` makes pack-docs exit 1** (line 190). `M/tools/check-docs.mjs` enforces
  the same on the mc-packs side.
- Three marker regions in `realm/index.html`: `pack-docs:features` (bundled behavior packs), `pack-docs:standalone`
  (resource packs and anything not in `realm_bundle`), `pack-docs:more` (sections marked `<!-- on the site -->`).
  **A missing marker makes it exit 1** (lines 232-236). Today's `more` cards are only four: "Installing from
  minecraft.nish.software", "Setting up a new world or a big server", "Formatting codes", "Troubleshooting"
  (realm/index.html:502-646). "How the packs work together" is **not** on the site (not marked).
- `--check` compares the page, every card, `search.json`, media and the commands rows; any difference exits 1
  (lines 296-304).

**How the page is organized** [V]

1. Hero: download box for the two bundles (QR codes), "What's new since your version" (a version picker built from
   `packs.json` notes), "Or download features one at a time (N)", chips ("2 packs to upload", "No experiments for the
   bundles"), the realm's experiments from `catalog.json`.
2. A filter box ("Find a feature: afk, claims, rain…") with three chips: All / Realm Bundle / Realm Resources.
3. `## Realm Bundle`: **67 cards in PACKS.md order**, which is roughly the order the packs were written, not
   alphabetical and not by task:
   `help settings admin welcome durability afk stats news guard phantom harvest farm stash find claims death refill
   hud mobhp elytra map mail nick quests milestones goals leaves cleanup chairs npc crowns caravan saga wander atlas
   calendar guilds bounty elite skills party titles relics journal fishing cooking domt slots silly dolphin platypus
   maps waystone expedition town build zones weather climate storm tornado rainbow night meteor moon rain translucent`
4. `## Realm Resources`: 7 cards.
5. `## Install and help`: the four shared sections + version history.
6. `## Everything on the realm` (from `catalog.json` → `realm`) and `## Already built in our world` (→ `built`).

**What a player with "how do I do X" or "what should I do next" finds** [V]

- Nothing task-shaped. The lede is "What runs on our Bedrock realm: our own Realm Bundle and Realm Resources and how
  to use each feature…". The first thing on the page is a download box that only the owner needs (players never
  install the Realm's packs; the Realm sends them).
- 74 collapsed cards in no meaningful order. The search box works (card headers, then full text through the 982 KB
  `search.json`), but you must already know a word to search for.
- No "start here", no story page, no menu map, no "coming back?" section. `/realm:help` in game has the same shape:
  "All commands" then one button per installed feature in PACKS.md order (`M/packs/help_bp/scripts/main.js:137-150`).
- The hub (`site/index.html`) reaches the realm page only through a small "Realm" header link and a "Realm Bundle
  <version>" stat (`site/assets/site.js:34-35, 298`; `site/index.html:458`). The hub is about building guides.
- The commands page has a searchable "Our realm commands" table (rows `[command, "Ops"|"Everyone", text, cardId,
  packName]`), again flat.

**The `"realm"` block of `catalog.json`** [V] (`H/minecraft/site/catalog.json:573-592`)

```
"experiments": ["Beta APIs", "Experimental Cameras"],
"behaviorPacks": [
  Realm Bundle (by us, path realm/),
  Dynamic Lightning [v4.0] (Raiyon),
  Holograms on dropped items            needs ["Beta APIs"],
  Armored Elytras [v1.2] (Raiyon),
  Multiplayer Waypoint System            needs ["Beta APIs", "Experimental Cameras"],
  Bedrock Essentials+ BP (Gao)
],
"resourcePacks": [ Realm Resources, Firewolf Resource Pack, Holograms on dropped items, Bedrock Essentials+ RP,
                   Dynamic Lightning [v4.0], Armored Elytras [v1.2], Multiplayer Waypoint System ]
```

- The Realm Bundle's `does` text is a hand-written sentence listing packs. It is already stale: it has no Minimap,
  Atlas, Calendar, Kitchen, Deck of Many Things, Slot Machine, Silly Enchants, Dolphin Friends, Platypus, Safe Zones,
  Easy Building, Wanderers or Regional Weather. [V] line 576.
- The realm page renders this block client-side (`realm/index.html` script, `fetch('catalog.json')`,
  `r.experiments`, `p.needs`).

**McSync and realm-reminder** [V]

- `H/minecraft/sync/server.mjs`: a browser-state sync store behind `/api/` (saved guides, checkmarks, tool
  settings), keyed by a sync code. It stores what the *website visitor's browser* sends. It knows nothing about the
  game.
- `H/minecraft/sync/realm-reminder.mjs`: every 5 minutes reads `site/packs/packs.json` on the PC; when the Realm
  Bundle or Realm Resources version changed, posts one item ("Upload Realm Bundle X to the Realm") to the owner's
  inbox at `127.0.0.1:8805`. Direction: PC → owner. It is the only "realm" automation and it exists precisely because
  nothing can push to the Realm.
- **There is no channel of any kind between the live Realm and the website or the PC.** See A4.

**Backlog and plans that touch this area** [V]

- `H/minecraft/docs/BACKLOG.md`: nothing about the realm page (it is about untested redstone builds, the realm's own
  farms lacking pages, wording, engine).
- `H/minecraft/docs/perf-audit-2026-11/PLAN.md` **H2** is open and collides with this work: it wants
  `publish-packs.mjs` to also write `packs/latest.json` and `packs/history/<slug>.json`, the realm page to load those
  instead of the 1 MB `packs.json`, and the two `catalog.json` lists written into the realm page at generation time
  (SITE-08). **H3** adds cache headers for card fragments and realm media in the Caddyfile. A realm page rework
  should either land after H2/H3 or absorb them; both edit `realm/index.html`'s script and `pack-docs.mjs`.
- `H/minecraft/docs/briefs/common.md` is the brief for build-guide subagents; not relevant.

### A2. What the rework requires on the hosting side

**The release path (must be respected)** [V] (`M/.github/workflows/release.yml`, `M/tools/ci-release.mjs`)

1. A merge to mc-packs `master` → `check` workflow green → `release` workflow.
2. Job `release`: checks out mc-packs master and **hosting master**, then in `hosting/minecraft` runs
   `fetch-packs --keep 1` → `publish-packs --from mc-packs <notes from release/notes.json>` →
   `archive-packs --prune --keep 5` → `pack-docs` → `pack-docs --check` → `check-site realm`
   (ci-release.mjs:316-331). If anything under `minecraft/` changed it commits **`git add -A minecraft`** on a
   `release/mc-packs-<sha>-<time>` branch and opens the hosting PR (lines 333-350).
3. Job `upload`: `archive-packs --upload --keep 0` puts every new `.mcpack` on the `packs-<slug>` release of
   mc-packs, then `--check --keep 5`.
4. Job `merge`: waits for the hosting PR's checks, merges with `--match-head-commit`, then `check-live --wait 900`.

Consequences:

- **Hosting's `pack-docs.mjs` at hosting `master` is what runs on every mc-packs release.** A hosting change that
  makes it *require* a new mc-packs file (say `docs/menu.json`) before mc-packs has it breaks every release. A
  mc-packs change that adds a file hosting does not read yet breaks nothing. So: **mc-packs exports first, hosting
  consumes second, and the consumer treats each new input as optional** (skip with a console note) until one release
  has proved it.
- Hosting's own PR check never runs `pack-docs --check` (there is no mc-packs checkout there; `H/.github/workflows/
  pr.yml` only runs `check-site` with the scope from `scripts/site-scope.mjs`). So a hosting PR that changes what
  pack-docs writes must regenerate the outputs locally against mc-packs `master` and commit them in the same PR;
  otherwise the next mc-packs release regenerates them (works, but the site is stale until then).
- A new marker region in `realm/index.html` and the `pack-docs.mjs` code that fills it must be in the **same hosting
  PR** (a missing marker is exit 1, pack-docs.mjs:234).
- `git add -A minecraft` means anything pack-docs writes under `minecraft/` rides the release PR automatically: new
  generated pages, JSON, cards. Anything outside `minecraft/` (the `Caddyfile`) never does.
- `scripts/site-scope.mjs` [V]: a changed file under `minecraft/site/<top>/…` checks page `<top>`; a file directly
  in `site/` (`catalog.json`, the hub) or under `site/assets/` forces a **full** site check (11-15 minutes); a new
  file in `minecraft/tools/` that is not in `TOOL_SCOPE` also forces a full run and needs a `TOOL_SCOPE` entry
  (hosting CLAUDE.md says so). A page removed forces a full run.
- `tools/check-site.mjs:55-56` [V]: every `site/<dir>/index.html` must be in `catalog.json` except `assets`,
  `_template`, `packs`, `realm`. So **new pages under `site/realm/<sub>/`** (for example `realm/start/`,
  `realm/story/`, `realm/menu/`) need no catalog entry, but they are not checked by `check-site realm` either unless
  added to `EXTRA` (line 40) and they are not in the sitemap unless `tools/seo.mjs` lists them (line 57, 69). New
  top-level pages (`site/start/`) need a catalog entry and get both for free, and force a full run once (catalog.json
  changed).
- Every page links assets with `?v=<hash>`: after touching `site/assets/` run `node tools/stamp.mjs`
  (check-site fails until then). New pages must use the shared shell (`<body data-cat>`, `[data-site-header]`,
  `[data-site-footer]`, `assets/site.js`) and keep the "← nish.software" header link.
- `check-live.mjs` [V]: compares `index.html`, `catalog.json`, `packs/packs.json`, `realm/index.html` with the
  checkout (line 51), checks **every** pack's newest file and `latest.mcpack`, an archived redirect, and opens
  `realm/` in Chromium (cards > 0, download link, Listen buttons = clips, one comparison card and one plain card load
  their bodies). It names no card id, so adding, removing or reordering cards does not break it. A reworked realm
  page must keep `details.feature` cards with `data-body`, the download link and at least one card with
  `data-compares` and one without media, or `check-live.mjs` must change in the same hosting PR.

**Adding `waypoints_bp`** [V] for the mechanics, [S] for names

In mc-packs (one PR): `packs/waypoints_bp/` (answering `realm:help_ping`, `diag.js` first import, `sync-events`,
`sync-diag`), a `## Waypoints — \`waypoints_bp\`` section in `docs/PACKS.md` with `### How to use`, Commands,
Configuration, Saved data; README table row; "How the packs work together" mention; `presets.js` `GROUPS`/`NAMES`
entries; `help-catalog.mjs`, `admin-catalog.mjs`; a `docs/NEWS.md` entry; `release/notes.json` with
`packNotes.waypoints_bp = { version: "1.0.0", notes }`.

In hosting: **nothing for the pipeline.** `publish-packs.mjs:227-240` creates a `packs.json` entry for any new
folder: slug = `slugify(manifest header.name)`, `page: realm/#waypoints`, `bundled: realm-bundle`, first note "First
version hosted here." unless `--pack-notes`; the `upload` job creates/uses release `packs-<slug>`; pack-docs makes
the card. OPERATIONS.md says the same ("A new pack in mc-packs needs nothing else"). Things to decide:

- **Name and slug.** A manifest name of `Waypoints` gives slug `waypoints`, URL
  `/packs/waypoints/waypoints-1.0.0.mcpack`, release `packs-waypoints`, card `#waypoints`. The slug is taken from the
  name **at first publish and never changes afterwards** (entries are found by `folder`), so pick the final name
  before the first release.
- **Confusion with Waystones & Inns** (`waystone_bp`, slug `waystones-inns`, card `#waystone`): two travel packs
  whose names differ by three letters, sitting 20 cards apart. If the rework keeps both, the docs and the site should
  present them as one "Travel" task (see A3); if it merges them, see "merging or renaming" below.
- Hand edits in hosting, **one small PR, timed with the day the owner removes the add-on from the Realm** (the
  catalog describes what is installed; removing the add-on is an owner action in the Realm settings):
  - `catalog.json` → `realm.behaviorPacks`: delete the `Multiplayer Waypoint System` line (580);
    `realm.resourcePacks`: delete its line (590).
  - `realm.experiments`: `Experimental Cameras` is named as a need **only** by Multiplayer Waypoint System [V line
    580]. `Beta APIs` is still needed by `Holograms on dropped items` [V line 578]. Our own packs need neither: the
    realm page says "No experiments for the bundles" and every manifest depends only on `@minecraft/server` and
    `@minecraft/server-ui` [V: `grep module_name M/packs/*/manifest.json`]; `saga_bp`, `expedition_bp` and
    `waystone_bp` use `player.camera`, which is stable API. So the list becomes `["Beta APIs"]` **if the owner also
    turns the Experimental Cameras toggle off on the Realm world** [S: whether Dynamic Lightning, Armored Elytras or
    Bedrock Essentials+ silently rely on it is not recorded anywhere in either repo; the catalog only has `needs` on
    two entries. Ask the owner or test on a copy of the world before changing the list].
  - Update the Realm Bundle's stale `does` sentence (add waypoints; better, stop hand-listing: see A3 item 3).
  - `catalog.json` is a top-level site file → full site check on that PR.
  - Five build guides say "**Waypoints:** mark the barn so you can find it again" (`site/barn/`, `slime-farm/`,
    `super-smelter/`, `watchtower/`, `crop-farm/`) [V grep]. They read fine with a first-party pack; link them to
    `realm/#waypoints` or the travel guide if wanted.
- Order: mc-packs release with `waypoints_bp` first (card and download go live by themselves) → owner uploads the
  bundle and removes the third-party add-on → hosting catalog PR. Player waypoints saved in the third-party add-on
  cannot be migrated by us (its data is its own dynamic properties) [S]; the news entry and the start page should
  say "re-save your waypoints".

**Merging or renaming packs: what happens today (nothing handles it)** [V unless marked]

There is no retire/rename procedure in either repo (`grep -i "retire|rename|remove a pack"` in `M/docs/WORKING.md`
and `H/minecraft/docs/OPERATIONS.md` finds none; `M/tools/check-versions.mjs:79` merely skips a removed pack).

- `publish-packs.mjs` loops over the folders that exist in `M/packs/` (line 225). A folder that is gone is simply
  never visited: **its `packs.json` entry stays forever, unchanged**, still with `bundled: "realm-bundle"` and
  `page: "realm/#<oldCard>"`.
  - The realm page's "download features one at a time" list is `packs.filter(p => p.bundled === SLUG || RES)`
    (`realm/index.html` script, `singles(...)`), so **a retired pack keeps showing as a current single download**,
    with a name that is no longer a link (its card is gone; `cardOf(p)` returns null) and it sorts to the end. It
    also stays in the single-pack version history. That is wrong twice: the pack is no longer "in the Realm Bundle",
    and installing the old single next to a new merged pack would register the same `realm:` commands twice
    (`NamespaceMismatch`-class failures).
  - Old URLs keep working: `fetch-packs` keeps fetching the newest 5 versions of **every** pack in `packs.json`, so
    `/packs/<slug>/latest.mcpack` and versioned files stay on disk; older ones redirect to
    `releases/download/packs-<slug>/…` through the Caddyfile's `@archived` rule (which is generic: any slug, any
    version; no Caddyfile change is needed for a retired slug). `check-live` keeps verifying them. The
    `packs-<slug>` GitHub releases stay.
  - Old deep links `realm/#<oldCard>` open the page with no card; `openHash` finds nothing and nothing explains it
    [V: `cardOf`/`openHash` only look up `document.getElementById`].
  - `pack-docs` removes `cards/<old>.html` and its `search.json` entry by itself (pack-docs.mjs:269-273); `--check`
    stays green.
- **Renaming a folder while keeping the pack's name fails the release**: the new folder has no entry, the slug from
  the unchanged name already exists → `fail("<folder>: slug "…" is taken; give the pack another name.")`
  (publish-packs.mjs:231). Renaming the *name* while keeping the folder is harmless (the entry keeps its old slug and
  gets the new name).
- A merged pack that keeps one of the old folders keeps that folder's slug, UUID and version line; its bundle UUIDs
  never change (`realm_bundle`, `realm_resources`), so the Realm updates in place either way.
- Saved data: each pack's dynamic property keys carry its own prefix and `diag.js` declares the prefixes it owns. A
  merged pack must keep reading (and declare) the old prefixes, or players lose saved data; `/realm:diag` "forget"
  would otherwise orphan the old keys [V for the mechanism: PACKS.md "Pack diagnostics" paragraph; S for the effect
  on a merge].
- `/realm:help <feature>` topics, card ids and the commands page's `cardId` column all come from the folder name, so
  a retired folder changes all three.

**What the spec should require if any pack is merged, renamed or retired** (hosting PR *before* the mc-packs
release that removes the folder):

1. `publish-packs.mjs`: after the folder loop, for every entry with a `folder` that no longer exists in
   `M/packs/`: delete `bundled`, set `retired: "<YYYY-MM-DD>"` and, from a small map in mc-packs
   (`M/tools/retired.json`: `{ "<oldFolder>": { "into": "<newFolder>", "date": "…" } }`), `replacedBy:
   "<newSlug>"` and `page: "realm/#<newCard>"`. Never delete the entry (version history and old links depend on it).
2. Realm page script: `singles()` already skips entries without `bundled`; make `standalone()` skip `retired`
   (today it would list them under "Also ours, not in the bundles": its filter is `p.folder && !p.bundled`,
   `realm/index.html` script line ~305). Show retired packs only in the version history, labelled "Now part of
   <new name>".
3. `pack-docs.mjs`: emit an alias map into the page (`<script type="application/json" id="card-aliases">{"waystone":
   "travel"}</script>` from the same `retired.json`) and have `openHash` follow it, so `realm/#waystone` opens the
   new card. Same for `commands/index.html` row links.
4. No Caddyfile change. No `check-live` change (it iterates `packs.json`). `fetch-packs` could skip
   `retired` packs' `latest.mcpack` after a grace period to stop growing the PC cache, but that is optional (5
   versions each).
5. mc-packs: `check-docs`, `help-catalog`, `admin-catalog`, `presets.js`, README table, `tools/standalone.json`
   (empty today), `SHARED` in `bundle.mjs`, every `sync-*.mjs` list that names the folder, the BDS scenarios'
   `--only` lists. A folder rename is best avoided: keep the folder, change the display name.

Recommendation for the spec: **group packs on the page and in the menu instead of merging folders** wherever the
goal is only "fewer things to remember". Grouping costs one data file (A3); merging costs the list above plus saved
data migration, and buys the player nothing they can see.

**Generated-docs markers after the rework** (proposed, all owned by pack-docs)

- keep `pack-docs:features`, `pack-docs:standalone`, `pack-docs:more`, `// pack-docs:commands`.
- add `pack-docs:tasks` (the task-first block above the cards) and `pack-docs:installed` (the Realm Bundle's
  feature list, generated from the pack names instead of the hand-written `does` sentence; this is also H2's
  SITE-08).
- new generated pages are whole files owned by pack-docs (`realm/start/index.html`, `realm/menu/index.html`,
  `realm/story/index.html`), listed in a manifest it writes and prunes exactly like `cards/`.

**Order of work across the two repos** (one line each; every step is its own PR and ends green and live)

1. hosting: retire handling in `publish-packs.mjs` + realm script + tests (only if anything is merged/retired). No
   mc-packs dependency.
2. mc-packs: exporters (`docs/menu.json`, `docs/story.json`, `docs/tasks.json`, see A3) with `--check` in
   `npm run check`. Released like any change; hosting ignores them.
3. hosting: `pack-docs.mjs` reads them (optional inputs), new markers and pages, `check-site` `EXTRA`, `seo.mjs`,
   `site-scope.mjs` knows `realm/*` sub-pages, outputs regenerated from mc-packs master. Check 360 / 840 / 1440,
   light and dark.
4. mc-packs: the Realm Menu rework, `waypoints_bp`, saga changes: each release regenerates the site pages from the
   same data by itself.
5. owner: upload the bundle, remove the third-party waypoint add-on (and the camera experiment if nothing else
   needs it).
6. hosting: `catalog.json` realm block cleanup (full site check), then make pack-docs' new inputs required.

### A3. Website features that would help, ranked

The owner's problem is "too much to navigate, people don't use the menu, I don't know what to do when I come back".
The site can fix the *orientation* half, and it is the only place a player can read on a phone while the game is
closed. Ranked by value for cost.

**1. Task-first block at the top of the realm page ("I want to…")** — value high, cost S-M

- What: above the 74 cards, 6-8 tiles in the Realm Menu's own words and order: *Travel*, *Find my stuff*, *Follow
  the story*, *Play with friends*, *Build faster*, *Earn and spend Crowns*, *My screen and settings*, *What's
  happening in the world*. Each tile opens a short generated list: "Do this in game" (the menu path: `Star → Travel →
  Waypoints`), the 1-3 commands, and links to the pack cards behind it. Move the download box and "one at a time"
  into a collapsed "For server owners: downloads" section below; players never need it.
- Data: `M/docs/menu.json` (same file as the cheat sheet, item 2).
- Files: `H/minecraft/tools/pack-docs.mjs`, `site/realm/index.html` (new `pack-docs:tasks` marker, hero rewrite),
  `tools/check-live.mjs` if the download link moves, `site/assets/site.css` only if new components are needed (then
  `stamp.mjs` + full check).
- Also re-order the cards by the same groups (a heading per group) instead of PACKS.md order. `byCard()` on the page
  already orders lists by card position, so nothing else changes.

**2. Realm Menu cheat sheet, generated from the menu's own data** — value high, cost S

- What: `realm/menu/` : the whole Realm Menu tree on one phone-width page, printable (`@media print`, one or two
  A4 pages), each leaf with its one-line hint and the typed command as a fallback. Linked from the task block, the
  start page and the in-game welcome ("minecraft.nish.software/realm/menu").
- Why it cannot drift: the game menu and the page are both rendered from one curated file. Today the menu's groups
  live in `M/packs/admin_bp/scripts/presets.js` `GROUPS` (`{ id, title, hint, sections: [{ title, packs }] }`) and
  `NAMES` (button name + hint per command), with `--check` already measuring line widths. The rework's task-first
  menu will need a curated tree anyway; export it.
- Contract `M/docs/menu.json` (written by a new `M/tools/menu-export.mjs`, `--check` in `npm run check`; it imports
  the menu data module the game uses, so there is one source):

```json
{
  "version": 1,
  "source": "packs/admin_bp/scripts/menu.js",
  "home": [
    { "id": "continue", "title": "Continue", "hint": "Pick up your story where you left it", "opens": "saga" },
    { "id": "travel", "title": "Travel", "hint": "Waypoints, waystones, home" }
  ],
  "tasks": [
    {
      "id": "travel",
      "title": "Travel",
      "want": "I want to get somewhere",
      "hint": "Waypoints, waystones, your last death",
      "items": [
        { "title": "My waypoints", "hint": "Save this spot, go to one", "command": "/realm:waypoints",
          "pack": "waypoints_bp", "ops": false, "path": ["Travel", "My waypoints"] }
      ],
      "packs": ["waypoints_bp", "waystone_bp", "death_bp", "map_bp"]
    }
  ],
  "ops": [ { "title": "Operator Tools", "items": [ … ] } ]
}
```

  Rules: plain ASCII, no `§` codes (the exporter strips them); `pack` is a folder name (hosting maps it to a card
  with `cardId`); `ops: true` items render in the dashed operator style the site already uses; `packs` on a task is
  the list of cards the tile links to. Every pack folder must appear in exactly one task (the exporter's `--check`
  fails otherwise), which also gives pack-docs the card grouping for item 1.
- Files: `M/tools/menu-export.mjs`, `M/docs/menu.json`, `M/package.json` check script; `H/…/pack-docs.mjs`,
  `site/realm/menu/index.html` (generated), `check-site.mjs` `EXTRA`, `seo.mjs`, `scripts/site-scope.mjs` (map
  `realm/<sub>/` changes to the `realm` scope and have `check-site realm` include the sub-pages).

**3. "Start here / Coming back?" page** — value high, cost S

- What: `realm/start/`, two short columns that stack on a phone.
  - *New here*: join → you get a star item → open it → three first things (talk to the starter townsfolk, set a
    waypoint at your base, `/realm:prefs` to quiet anything you don't want).
  - *Coming back after a while*: "Your first 10 minutes": 1. Open the star (hold it and use). 2. **Continue** shows
    where your story stopped and what the next step is. 3. **Travel** takes you to your saved waypoints. 4.
    **What's new** lists what changed while you were away (and the same list is on this page, below). 5. Check mail
    and daily quests from the same menu.
  - Below: "What changed lately", the last ~10 `docs/NEWS.md` entries with dates, so a returning player can catch up
    **before** logging in. (Today the game shows only the single newest entry; see B5.)
- Data: hand-written copy lives in mc-packs so in-game text and the page agree: `M/docs/START.md` with two marked
  sections, or a `start` object in `menu.json`. News: `M/docs/news.json` written by `gen-news.mjs` (it already
  parses NEWS.md): `[{ "id": "8ca288c462e2", "title": "…", "date": "2026-11-14", "lines": ["…"] }]`, newest first,
  last 30. Dates need a source: NEWS.md entries have none today [V]; either add `## Title (2026-11-14)` (gen-news
  strips it for the in-game title) or take the date from `git log` of the heading line at export time [S, git blame
  works but is slow; a date in the heading is simpler and is also what the in-game "since you were away" needs].
- Files: `M/tools/gen-news.mjs`, `M/docs/NEWS.md` format, `H/…/pack-docs.mjs`, `site/realm/start/index.html`.
- Make the hub link to it: a "Playing on our Realm? Start here" strip on `site/index.html` (hub change → full
  check).

**4. Story page** — value medium-high (the story is the Realm's biggest feature and the easiest to lose track of),
cost M

- What: `realm/story/`: the acts and side questlines as a spoiler-safe ladder. Each story: title, who gives it,
  what it needs first, its chapter titles as a checklist the visitor can tick (state in `localStorage` under an
  `mc-` key, so the existing device sync carries it), and a **"Stuck?"** disclosure per chapter with the hint the
  game already has. A "Recap so far" disclosure per finished chapter (one or two sentences) that is hidden until the
  visitor ticks the chapter, so nothing is spoiled by scrolling.
- Data: `M/docs/story.json`, written by `M/tools/story-export.mjs` from `packs/saga_bp/scripts/stories/` (it can
  reuse `check-stories.mjs`'s loader, which already walks every story):

```json
{
  "version": 1,
  "stories": [
    {
      "id": "act1_signs", "title": "Signs in the Sky", "kind": "main", "act": 1,
      "giver": { "id": "sol", "name": "Sol the Sky-reader" },
      "summary": "Sol the Sky-reader has seen something in the eastern sky that should not be there yet.",
      "requires": ["drowned_bell", "last_map"],
      "needsPacks": ["night_bp"],
      "chapters": [
        { "id": "smudge", "title": "A Smudge in the East",
          "goal": "Watch the east from the lighthouse after dark, then bring Sol a spyglass.",
          "hint": "…the chapter hint the Story Log shows…",
          "recap": "Sol showed you a smudge under Oriel that grows every night." }
      ]
    }
  ]
}
```

  `title`, `summary`, `kind`, `act`, `giver`, `requires` and chapter `id`/`title` exist today [V:
  `stories/act1_signs.js:63-78`]. `recap` does **not** exist anywhere in `saga_bp` [V: `grep recap` finds nothing];
  the saga rework's recap text must be authored per chapter in the story files, and the exporter fails `--check` on a
  chapter without one. `goal` should be the tracker's one-line wording, not the dialog. The exporter must drop
  everything else (dialog, choices, flags, endings) so the page cannot spoil; `when:`-conditional text is left out.
- Size: `saga.html` is already 94 KB as a card; the story page should load `story.json` lazily per act.
- Files: `M/tools/story-export.mjs`, `M/docs/story.json`, story files (`recap`), `check-stories.mjs` (require
  `recap`), `H/…/pack-docs.mjs`, `site/realm/story/index.html`.

**5. Travel guide** — value medium, cost S (it is one generated section, not a new system)

- What: one page or one task tile: "Waypoints (your own, free, from the menu)" vs "Waystones (shared, built in the
  world, cost Crowns)" vs "Death Point" vs "Minimap compass", in a 3-short-column table, each with its menu path.
  Explains the retired third-party Waypoint Menu item and that old waypoints must be saved again.
- Data: the `travel` task in `menu.json` plus the first paragraphs of the four pack sections (pack-docs already has
  them). No new export.

**6. Search improvements** — value medium, cost S-M

- Today: `search.json` is 982 KB of lowercased card text, fetched whole on the first query; results are whole cards.
- Better: (a) pack-docs writes a second, small index `realm/tasks.json` (~10 KB: task titles, item titles, hints,
  commands, synonyms) searched first, so "teleport", "home", "tp", "lost my stuff", "where was I" land on a task
  tile; (b) add a `synonyms` array per task/item in `menu.json` (`"travel": ["teleport","tp","warp","home","fast
  travel"]`), also usable by the in-game menu's Search; (c) split `search.json` per group so a phone downloads only
  what it needs (fits H2/H3). (d) The commands page table gets the task as a filter chip (the row already carries
  `cardId`).

**7. Generate the Realm Bundle's "what's in it" sentence** — value low-medium, cost S. Replace the stale
hand-written `does` in `catalog.json` with a list pack-docs writes into the page (H2's SITE-08). Removes one manual
step from every new pack.

**8. In-game pointers to the site** — value medium, cost S, mc-packs only. Bedrock chat links are not clickable
and forms cannot open URLs [S, long-standing Bedrock behavior], so keep it to one short, typeable address shown in
the Realm Menu footer and the welcome card: `minecraft.nish.software/realm/start`. A short redirect
(`/start` → `/realm/start/`) is a one-line Caddy `redir` if wanted (Caddyfile push = deploy; validate first).

### A4. What cannot be done (the Realm is hosted by Mojang)

- **No live data from the game to the site, the PC or anything else.** [V] Every manifest in `M/packs/*/` depends
  only on `@minecraft/server` and `@minecraft/server-ui`; none uses `@minecraft/server-net` (HTTP) or
  `@minecraft/server-admin`, which exist only on Bedrock Dedicated Server, and `M/CLAUDE.md` forbids beta modules
  ("Stable APIs only … because the packs run on a Realm"). So: no live leaderboards, no "who is online", no "your
  story progress" on the site, no web map, no webhooks, no Discord relay, no remote config.
- **No data from the site or PC into the running Realm** either. The only path into the game is the bundle itself:
  data baked at build time (`news_bp/scripts/release.js` from `docs/NEWS.md` is the existing example), delivered when
  the owner uploads the bundle. The owner uploads by hand; hosting CLAUDE.md says never automate it.
- **No server console, logs, backups or world file access** except the owner's manual world download. That is why
  `catalog.json` → `built` is hand-maintained and BACKLOG says the realm's own farms "need the owner's world upload".
- Nothing in the repos contradicts this. The things that look like channels are not: McSync stores browser state;
  realm-reminder is PC → inbox; `check-live` checks the website; the realm page's "What's new since your version" is
  computed from `packs.json` in the browser from a version the *visitor picks*.
- What *is* possible and should be used: (1) build-time data both ways through the two repos (menu, story, news); (2)
  per-visitor state in the browser, synced across the visitor's own devices by McSync (a story checklist the player
  ticks by hand); (3) one-way, human-carried codes if ever wanted: the game can show a short text code (for example
  a progress code in a form) that a player types into the site, which decodes it locally. Cost M, value low for a
  10-player realm; not recommended now.

---

## Part B: first join, coming back, and open issues

### B5. What a player gets at login today

**Brand-new player, all packs at defaults** [V unless marked]. Ticks after the initial spawn (20 = 1 s):

| When | Pack | What | Where |
|---|---|---|---|
| 0-1 | admin_bp | The star item ("Realm Configuration", a nether star) is put in the inventory; chat: `[Realm Configuration] You have the Realm Configuration item: use it for every realm command you can use, in one menu.` | `admin_bp/scripts/main.js:1201-1217`, `:1052` |
| 0 | stats_bp, milestones_bp | joins +1, first-join time saved (no message) | `stats_bp/main.js:101-116`, `milestones_bp/main.js:165-169` |
| ~0-40 | atlas_bp | First region: a **title** (`<Region name>` / `Region 1 - 0 of N sites`) and chat `[Atlas] New region: <name> (Region 1, 1 found; /realm:atlas)` | `atlas_bp/main.js:551-567`, `:1985-1988` |
| 40 | welcome_bp | **Popup 1**: "Welcome!", three gold headings, ~151 words: the story hook, up to 13 feature lines each with a `/realm:` command, then `/realm:help…`, `/realm:prefs…`, `/realm:saga…` and `Operators: /realm:welcome_edit changes this message.` | `welcome_bp/main.js:335-341`, `:166-185`; `config.js` |
| 100 | news_bp | New world: nothing. Otherwise **Popup 2** if the newest release news is unseen (queued behind popup 1 for up to 90 s) | `news_bp/main.js:186-225` |
| 160 | mail_bp | `You have N unread letters: /realm:mail` (if any) | `mail_bp/main.js:169-188`, `config.js:28` |
| 200 | crowns_bp | `+N (Starting balance…)` (default 0: silent) then `+5 Crowns (Daily login bonus. Balance: 5)` | `crowns_bp/main.js:150-176`, `config.js:21-24` |
| 200-220 | quests_bp | `New daily quests: A, B, C. See them with /realm:quests` | `quests_bp/main.js:191-203`, `:586` |
| 200-220 | weather_bp | `Forecast: … More with /realm:weather` (once per UTC day) | `weather_bp/main.js:484-499` |
| first minutes | journal_bp | `Journal: New entry in Places - Overworld (/realm:journal)` and one line per new biome, mob, fish… | `journal_bp/main.js:288` |
| persistent | stats_bp, map_bp, hud_rp | stats ticker on the action bar (default on), the Minimap compass strip (map enabled; radar off), side boxes | `stats_bp/config.js:18-21`, `map_bp/config.js:3` |
| every 20 min | news_bp | `[Tip] …` to the whole world; 9 tips, all of the form "Run /realm:x" | `news_bp/config.js:18-33`, `main.js:247-262` |

Findings about the first minutes:

- **No tutorial and no starter kit.** The only item is the star. Nothing walks a new player through one action.
- **The welcome text never mentions the star item** [V: `grep -i "star|Realm Configuration|admin"
  welcome_bp/scripts/config.js` finds nothing]. It lists 13+ typed commands instead. The single line that introduces
  the star is a chat message that scrolls away under the popup that opens two seconds later. This alone explains
  "people aren't really using the menu".
- **The 9 tips never mention the star item, the story or travel** [V `news_bp/config.js:18-28`]. Every tip teaches a
  typed command.
- `Operators: /realm:welcome_edit changes this message.` is shown to **every** player, not only operators [V:
  `welcome_bp/main.js:181` pushes `GENERIC.operators` unconditionally]. Small bug.
- `showOnce` defaults to **false**: the 151-word welcome popup opens on **every join** unless the player finds
  **Welcome popup when I join** in `/realm:prefs` [V `PACKS.md` welcome Configuration table; `main.js:319`]. [S: the
  live Realm may have saved a different value with `/realm:config`; the saved world settings are not in the repo.]
- REAL_CLIENT_CHECKLIST A5 ("Welcome popup and Realm News on a phone") has **no result recorded**: the results table
  is empty for every check [V `M/docs/audits/2026-10-deep-audit/REAL_CLIENT_CHECKLIST.md:273-300`], and PACKS.md
  itself says the popup's "real client rendering … remains unverified".

**Player returning after 2+ weeks** [V]:

| When | Pack | What | Where |
|---|---|---|---|
| 0 | bounty_bp | `+N Crowns (Bounty rewards while you were away)` if owed | `bounty_bp/main.js:139-156` |
| 0 | guilds_bp | reputation owed, with the reason `while you were away` | `guilds_bp/main.js:235-246` |
| 0 | moon_bp | `A Harvest Moon is up. …` / `A Blood Moon is up. … You joined after dusk, so there's no survivor reward for you tonight.` | `moon_bp/main.js:478-490` |
| 0 | death_bp | `You died at X Y Z in <dimension>. Run /realm:death…` if they logged out dead | `death_bp/main.js:149-158` |
| 0+ | expedition_bp | sent back from a run that ended; `The treasure left in the chests came back with you.` | `expedition_bp/main.js:3789-3806`, `:1784` |
| 40 | welcome_bp | **Popup 1, the same new-player welcome again** (showOnce false) | as above |
| 60 | calendar_bp | `[Festival] <name> is on! /realm:calendar for the activities and the ribbon stall.`; `[Siege] The Gray Choir is at <town>!` | `calendar_bp/main.js:2485-2495` |
| 100 | news_bp | **Popup 2**: `Welcome back! You were away 16d 4h.` then **only the single newest news entry**; or, with no unseen news, the same sentence as a gray chat line | `news_bp/main.js:204-225` |
| 100 | cooking_bp, relics_bp, fishing_bp | owed dishes/rewards, `You received <relic>`, `+N Crowns (<tournament>)` | `cooking_bp/main.js:486-501`, `relics_bp/main.js:454-484`, `fishing_bp/main.js:907-934` |
| 160 | mail_bp | `You have N unread letters: /realm:mail` | as above |
| 200 | crowns_bp | `+5 Crowns (Daily login bonus. Balance: N)` | as above |
| 200 | domt_bp | `The deck still owes you a wish. Open /realm:domt to make it.` | `domt_bp/main.js:714-723` |
| 200 | town_bp | `Town projects you helped with were finished while you were away. Thank you!` + payout lines; operators: one line per finished project with no spot | `town_bp/main.js:3897-3913`, `:310-318` |
| 200-220 | quests_bp | `New daily quests: …` or `You have N daily quests to finish: /realm:quests` | as above |
| 200-220 | weather_bp | `Forecast: …` | as above |
| 200-220 | skills_bp, guilds_bp | title unlock events re-sent (no chat by themselves; PRG-21 in the perf audit) | `skills_bp/main.js:942-952`, `guilds_bp/main.js:223-234` |
| later | milestones_bp | `Loyal I/II` etc. announced to the world when the join count crosses a tier | `milestones_bp/main.js:327-332` |
| persistent | saga_bp | the story tracker box redraws if a quest is tracked. **Nothing says where the story stopped** | `saga_bp/main.js:742-755` only calls `wanderJoined`; `ui.js:1314` only clears the box cache |

So a returning player can get **two popups and up to ~12 unrelated chat lines in the first 11 seconds**, in an order
set by each pack's private timer, and still not learn the three things they came for:

1. **What changed while I was away.** Only the newest `docs/NEWS.md` entry is in the bundle
   (`gen-news.mjs` takes `parts[0]`; `release.js` holds one `{id,title,body}`), and `PROP_SEEN` is one revision
   number. NEWS.md has 80 entries; the newest today is "Fixes for Skills and the Atlas" (two bug-fix lines). A player
   away for two weeks missed about 40 entries, including "Living towns: a mayor for every town", "A rounder minimap",
   "Sort every page at once", and is shown two lines about XP double-counting. [V]
2. **Where I left the story.** No recap, no "Continue". `/realm:saga` exists but nothing points at it on join. [V]
3. **What friends did.** A feed exists but only inside NPC dialog: 20 packs post `realm:gossip`
   `{ kind, player, name?, place?, n?, from? }` through a shared gate (`M/tools/gossip-shared.js`; one piece per pack
   per in-game hour) and `npc_bp` keeps a board that townsfolk recite (`npc_bp/main.js:1164-1168`, `:1503`);
   `waystone_bp` keeps `waystone:news` (latest sky events) for innkeepers' "Hear the news". Nothing shows either at
   login. [V]

Good parts worth keeping: last-seen is already tracked per player (`news:lastSeen`, refreshed every 10 minutes and
on leave, `news_bp/main.js:228-240`); "owed while away" rewards use one shared store (`tools/owed-shared.js`);
every one-off action bar note already goes through `realm:actionbar`, and titles through `realm:title`.

### B5b. Proposal: one quiet "Welcome back" card

**Principle.** One pack owns the login moment. Everything else that wants to say something at login hands it a line
instead of talking. One form, opened once, closable with one tap, never more than one screen on a phone. Chat stays
empty for the first 15 seconds except for things that are urgent and about *now* (a Blood Moon overhead, a death
point).

**Owner.** `welcome_bp` (it already has the join popup, the per-player off switch, the installed-packs discovery and
the busy-client retry), absorbing `news_bp`'s join popup and "you were away" line. `news_bp` keeps the news store,
`/realm:news`, the editor and tips. If the rework merges packs, welcome + news is the cleanest merge in the repo
(same moment, same UI, overlapping settings); otherwise they talk through the protocol below.

**Protocol (script events, like `realm:help_ping`; all messages under 2,048 characters)**

```
realm:login_ping   { req, player, away, first }        welcome_bp -> everyone, at spawn + 60 ticks
                                                        away: whole hours since last seen (0 = unknown), first: true on the first ever join
realm:login_line   { req, pack, order, kind, text, cmd?, n? }   each pack -> welcome_bp, within 20 ticks (answerTicks)
realm:login_shown  { player, packs: [...] }             welcome_bp -> everyone, when the card was really seen
```

- `kind`: `"story" | "news" | "mail" | "reward" | "world" | "friends" | "todo"`. `order`: a number; the card sorts
  by kind first (fixed order below), then `order`. `text`: one line, plain ASCII, at most 60 characters after
  formatting codes (the exporter-style width check `presets.js` already has can enforce it in a unit test).
  `cmd`: the command a button for that line runs (`/realm:saga`), optional. `n`: a count for merging ("3 letters").
- A pack that answers `realm:login_line` **must not also send its own join chat line**. On `realm:login_shown` it
  marks the thing as told (mail: nothing to mark; crowns: bonus already paid, only the line moved).
- A pack that is installed without a new `welcome_bp` (single-pack installs, old bundle) gets no ping within 100
  ticks and falls back to its old chat line. That keeps packs independent, as CLAUDE.md requires.
- `away` and `first` come from `welcome_bp`'s own last-seen property (move `news:lastSeen` or duplicate it; one
  writer).

**Who answers what** (existing strings shortened; file is where the join message lives today)

| kind | Pack | Line | Button |
|---|---|---|---|
| story | saga_bp | `Story: Signs in the Sky, ch. 2 - Watch the east from the lighthouse` (the tracked quest's current step, the tracker's own wording); none started: `Story: not started. Talk to Old Tobin in town` | **Continue** → the saga rework's Continue (recap + track) |
| news | news_bp | `3 updates while you were away` (count of entries newer than the player's seen id) | **What's new** → the catch-up list |
| mail | mail_bp | `2 unread letters` | **Mail** → `/realm:mail` |
| reward | crowns_bp, bounty_bp, town_bp, guilds_bp, fishing_bp, relics_bp, cooking_bp | merged by welcome_bp into one line: `While you were away: +45 Crowns, 1 relic, town thanks` | none (already paid) |
| todo | quests_bp | `3 daily quests today` | **Quests** → `/realm:quests` |
| todo | domt_bp, expedition_bp | `The deck owes you a wish` / `Stored items waiting at the expedition site` | their menu |
| world | calendar_bp, moon_bp, weather_bp, caravan_bp | at most two lines: `Lantern Fair is on` / `Blood Moon tonight` / `Rain until evening` | none |
| friends | npc_bp (its gossip board) | at most two lines, newest first, only pieces newer than last seen and about *other* players: `Bob cleared the Sunken Vault`, `Ana reached Miner III` | none |

**The card (ActionFormData; labels, not `.header()`; one screen)**

Returning player, away 12 hours or more:

```
title:  Welcome back, {player}
label:  §7Away 16 days. {online} online now.

label:  §l§6Where you left off
label:  Signs in the Sky, chapter 2
        Next: watch the east from the lighthouse after dark.

label:  §l§6While you were away
label:  - 3 updates to the Realm
        - 2 unread letters
        - +45 Crowns, 1 relic (already yours)
        - Bob cleared the Sunken Vault

label:  §l§6Today
label:  - Lantern Fair is on
        - 3 daily quests

button: §lContinue the story§r\n§8Recap, then your next step
button: What's new§r\n§83 updates
button: Mail§r\n§82 unread
button: Open the Realm Menu§r\n§8Travel, friends, settings
button: Close
```

- Sections with no lines are left out; buttons exist only for lines that have a `cmd`. With nothing at all to say
  (short absence, nothing owed) **no card opens**; one gray chat line instead: `§7Welcome back. Use the star for the
  Realm Menu.` and, at most once a day, the daily bonus line.
- Away less than 12 hours (`awayNoticeHours`, existing setting): no card unless there is unread mail, unseen news or
  a reward; then the card without "Where you left off".
- **Open the Realm Menu** is always there: the card is the menu's front door, which is how players learn the star.

Brand-new player (`first: true`), replaces today's 151-word welcome:

```
title:  Welcome, {player}
label:  A sleepy harbor town keeps an old secret. The harbor bell sank forty
        winters ago, yet lately it has been heard ringing again.

label:  §l§6Three things to know
label:  1. The star in your inventory is the Realm Menu. Hold it and use it:
           travel, story, friends and your settings are all in there.
        2. The story starts in town. Tap Old Tobin.
        3. Nothing here is required. Build, explore, ignore the rest.

button: §lOpen the Realm Menu
button: Close
```

and one chat line that stays after the popup closes: `§7Lost? Use the star, or read
minecraft.nish.software/realm/start`. (Operators' edited welcome text, if any, still wins as today; the
`Operators: /realm:welcome_edit…` line goes only to operators.)

**"What's new" catch-up** (the real fix for "I don't know what changed")

- `gen-news.mjs` writes the last **12** entries into `release.js`:
  `RELEASES = [{ id, title, date, body }]` newest first (about 6 KB; the bundle is megabytes), and the same list to
  `docs/news.json` for the site (A3 item 3). Needs a date per entry in NEWS.md.
- Per player, store the id of the newest entry they have seen (`news:seen` becomes an id; migrate the old revision
  number to "seen the current one").
- The button opens one scrolling form: each unseen entry as `§l§6<title>` + its lines, newest first, capped at 6
  entries with `+N older: minecraft.nish.software/realm/start`. Closing it marks all as seen.
- Also add an optional `headline: true` marker in NEWS.md (`## Title !`) so a bug-fix release does not push "Living
  towns" off the top for returning players: the card's count line names the newest headline (`3 updates, incl.
  Living towns`).

**What to silence at login (move into the card), by pack**

| Pack | Today | Change |
|---|---|---|
| welcome_bp | 151-word popup on every join | first join only (`showOnce` behavior by default); afterwards the card |
| news_bp | second popup; `Welcome back! You were away…` chat line | both become card content; `/realm:news` unchanged |
| admin_bp | `You have the Realm Configuration item…` chat line under the popup | drop on join (the card says it); keep for `/realm:admin_item` |
| mail_bp | `You have N unread letters` at 8 s | `realm:login_line`; fallback chat line without welcome_bp |
| crowns_bp | daily bonus line at 10 s | reward line; pay silently |
| bounty_bp, guilds_bp, fishing_bp, town_bp, relics_bp, cooking_bp | one "while you were away" line each, at 0 / 5 / 10 s | reward lines, merged |
| quests_bp | `New daily quests: A, B, C…` at 10 s | todo line (count only); the midnight rollover notice while playing stays |
| weather_bp | `Forecast: …` at 10 s | world line; the player preference `dailyForecast` now means "show it on the card" |
| calendar_bp | `[Festival] … is on!`, `[Siege] …` at 3 s | world lines. A siege in progress may keep one chat line (it is about now) |
| domt_bp | `The deck still owes you a wish` at 10 s | todo line |
| moon_bp | special-moon line at 0 s | keep in chat (urgent, about now) but delay to after the card closes |
| death_bp | `You died at…` | keep (urgent) |
| atlas_bp | region title + chat on a new player's first tick | hold the first banner until the card closed (`realm:login_shown`) |
| journal_bp | `Journal: New entry in Places - Overworld` in the first seconds | suppress entry notes for 60 s after `first` join (record silently) |
| town_bp (operators) | one chat line per unspotted finished project | one line: `2 town projects need a spot: Realm Menu > Operator Tools` |
| news_bp tips | 9 typed-command tips | rewrite around the menu: `Use the star: Travel takes you to your waypoints.`; fewer, every 30 min; never in the first 5 minutes after a join |

Rules for the spec: every `playerSpawn` handler tests `initialSpawn` first and does nothing visible before the card
(this is also perf workstream **W13** in `M/docs/audits/2026-11-perf-audit/PLAN.md:360-374`, which already plans to
move join work out of the join tick with per-pack offsets; do both in one pass). A BDS scenario
(`tools/test-bds/examples/login-quiet.js`) should assert: a returning simulated player with mail, a bonus, a quest
and unseen news receives **zero** chat lines and **one** form in the first 300 ticks; a single-pack install of
`mail_bp` still gets its chat line.

### B6. Open, player-facing problems that touch the rework (ranked)

Sources: `M/ROADMAP.md`, `M/docs/RELEASE_TODO.md`, `M/docs/audits/2026-10-deep-audit/{OPEN,deferred,REAL_CLIENT_CHECKLIST}.md`,
`M/docs/audits/2026-11-perf-audit/PLAN.md`, `M/campaign-reports/*.md`, `M/docs/NEWS.md`, GitHub issues, and the code
read for B5. The October audit folder says of itself "closed record… Do not start work from here"; items below from
`deferred.md` are ones I could not see marked done there, so **each needs a quick re-check against the code before
it goes into the spec** (marked [recheck]). GitHub: the 19 open issues on nishant/mc-packs are all `perf-report`
validation issues (#223-#291); there are **no open bug or feature issues** [V, listed 2026-11-15].

High (directly the owner's complaint)

1. **NEW-1 Welcome never teaches the star item; it lists 13+ typed commands.** `welcome_bp/scripts/config.js`
   (`lines.*`, `next.*`), `main.js:166-185`. [V]
2. **NEW-2 Returning players see only the newest of ~40 missed news entries.** `tools/gen-news.mjs` (`parts[0]`),
   `news_bp/scripts/release.js`, `main.js:204-225`. [V]
3. **NEW-3 No "where you left the story" at login; no recap text exists in the story data.** `saga_bp/main.js:742-755`;
   `grep recap saga_bp` empty. [V]
4. **NEW-4 Login noise: 2 popups + up to ~12 chat lines in 11 s, uncoordinated.** Table in B5. Related perf item
   W13 (`PLAN.md:360-374`; findings XC-07, PRG-38 "the map of what the 18 progress packs do at join"). [V]
5. **NEW-5 The welcome popup shows on every join by default** (`showOnce: false`). `welcome_bp/config.js`, PACKS.md
   welcome Configuration. [V; live value S]
6. **NEW-6 `/realm:help` and the realm page list 67 features in the order they were written.**
   `help_bp/main.js:137-150`; `realm/index.html` card order. [V]
7. **NEW-7 Tips teach typed commands only, never the menu, story or travel.** `news_bp/config.js:18-28`. [V]
8. **O12 / A1, A2 Story quest box size and placement with the radar and other boxes never checked on a real
   client**, and **A5 welcome + news on a phone**, **E4 settings menus on a phone**: all "not run".
   `OPEN.md` (O11-O16), `REAL_CLIENT_CHECKLIST.md:43-102, 230-234, 273-300`. The rework changes all three surfaces;
   plan one device pass at the end. [V]
9. **C1 (O75) graveyard camera / respawn screen** and **C2 (F47) Gray Ring with a party**: never checked on a
   client; these are the cutscene/caption and party-flow areas of the rework. `REAL_CLIENT_CHECKLIST.md:135-158`. [V]
10. **Backlog: "a first-hour newcomer chapter"** for saga, and **"a party finder"**: listed as ideas, exactly what
    the rework's onboarding and party flow need. `OPEN.md` Backlog. [V]

Medium

11. **saga-content #4 [recheck]**: 15 steps in 7 stories assume the town is at world spawn; proposed
    `/realm:saga_place town`. `deferred.md` C table. Matters for "NPC links to the story".
12. **saga-content #9 [recheck]**: a started story whose required pack was removed waits forever with no note.
    `deferred.md`. Becomes live if packs are merged or retired.
13. **saga-content #5 [recheck]**: 78 required steps cannot finish with `doDaylightCycle` off. NEWS "Calmer
    wanderers…" fixed night *fights* on a stopped clock; time-window and `wait` steps are not mentioned. `deferred.md`.
14. **saga-engine #16 [recheck]**: a story save over 32,767 characters throws and loses progress since the last
    save. NEWS "Safer stories" says an unreadable save is now copied aside, which is not the same fix. `deferred.md`.
    Recaps and a Continue pointer add saved data; budget for it.
15. **social-prog review [recheck]**: nothing prunes parties (offline solo parties stay forever); **#20** load sends
    one `realm:party_members` per party in one tick. `deferred.md`. The party-flow rework should fix both.
16. **menus #16 [recheck]**: every pack's settings answer calls `world.getAllPlayers().find()` (67 packs per
    `/realm:prefs` open). `deferred.md`; perf plan **W2** "The shared settings helper" (`PLAN.md:175`). A task-first
    menu that opens prefs more often makes this matter.
17. **menus #14**: generic default welcome. Done for the default text (the installed-packs default shipped), but
    the result is NEW-1. `deferred.md`; PACKS.md welcome section.
18. **NEW-8 `Operators: /realm:welcome_edit changes this message.` is shown to non-operators.**
    `welcome_bp/main.js:181`. [V]
19. **NEW-9 Retired/merged packs stay listed as current single downloads; a folder rename with the same name fails
    the release.** `H/minecraft/tools/publish-packs.mjs:225-240`, realm page script. [V] Only bites if packs merge.
20. **NEW-10 `catalog.json` Realm Bundle description is hand-written and stale** (13 packs missing).
    `H/minecraft/site/catalog.json:576`. [V]
21. **W16 Saga with a quest active** costs about ten times an idle player (estimated, not measured); a Continue
    button means more players with a tracked quest. `M/docs/audits/2026-11-perf-audit/PLAN.md:404-412`. [V]
22. **MCP-113**: release and merge jobs `npm install` hosting's tools with `HOSTING_TOKEN` in the environment.
    `ROADMAP.md`. [recheck: `release.yml` now uses `npm ci --ignore-scripts` and passes the token only to the push
    and merge steps, so this looks fixed and the ROADMAP line stale.]

Low

23. **saga-engine review [recheck]**: tracker stagger by list index can skip a player's draw for 3 s after a join.
24. **saga-content #8 [recheck]**: "Old Pell" (a grave) reuses the pilgrim wanderer's name (`side_heart.js`,
    `npc_bp/hearth.js`). Confusing once NPCs link to the story.
25. **saga-content review [recheck]**: chapter hint for "A Champion's Heart" omits the no-Kitchen fallback.
26. **social-prog #13 [recheck]**: party chat has no cooldown; **#18**: the mail menu names `mc.nish.software/mailroom`
    (the old host; now `minecraft.nish.software`).
27. **Backlog ideas that fit**: Death Point "help me" waypoint and despawn countdown (belongs in `waypoints_bp`),
    `saga_reset` "forget players gone N days", leaderboards "around me". `OPEN.md` Backlog.
28. **H2 / SITE-01, -02, -08**: `packs.json` is 1 MB and the realm page waits on it; **SITE-13**: a 404 can be
    cached for a year. `H/minecraft/docs/perf-audit-2026-11/PLAN.md`. Do before or with the realm page rework.
29. **RELEASE_TODO**: Easy Building license credit (public release only; not this rework).

Recurring fix themes in the last ~40 news entries [V `M/docs/NEWS.md:10-365`]: (a) story steps that could not
finish (fights that never started, mined-out required blocks, clue popups during fights, time-stopped servers): five
entries; (b) text cut off or too big in forms and side boxes (quest box "...", huge headings, menu titles, red
vs gold operator buttons): six entries, all found late because no real-client pass has been run; (c) inventory page
safety; (d) "your choice came back" settings regressions (stats ticker, preferences); (e) performance. Themes (a),
(b) and (d) are the ones the rework will touch again: budget the device pass and a settings-migration test.

### B7. Other QoL ideas for returning players (ranked)

| # | Idea | Size | Why |
|---|---|---|---|
| 1 | **Realm Menu home shows state, not just buttons**: `Continue: Signs in the Sky (ch. 2)`, `Mail (2)`, `Quests (1/3)`, `Travel (4 saved)`. Same `realm:login_line` answers, asked when the menu opens | M | The menu becomes the answer to "what should I do"; counts are the cheapest possible recap |
| 2 | **"Take me there" on Continue**: the story step's place as a temporary waypoint (compass strip target + distance), using the waypoint pack's API through a script event | M | Removes "where was that again" after weeks away; also the natural saga ↔ waypoints link |
| 3 | **Auto-waypoint "Where I logged out"** and **"Last death"** in the waypoint list (death_bp already saves the point) | S | Zero-effort orientation on return |
| 4 | **First-run nudge to save a "Home" waypoint**: the first time a player sleeps in a bed, one line + button `Save this as Home?` | S | Makes Travel useful from day one |
| 5 | **Quiet mode preset in `/realm:prefs`**: one switch `Fewer messages` that turns off journal entry notes, the daily forecast, tips, the stats ticker and region banners together | S | One tap instead of hunting five switches across packs; needs a `realm:cfg_set` batch like Server size already does (`admin_bp` presets) |
| 6 | **"Since you were away" in the Story Log**: on the first open after 7+ days, the recap of the last finished chapter shows first | S | Uses the same `recap` field as the site's story page |
| 7 | **Friends strip on the card and menu**: who is online, who was on in the last 7 days (titles_bp and party_bp already keep name + last-seen), with `Mail them` | S-M | "What friends did" without any new tracking |
| 8 | **Search synonyms in the menu** from `menu.json` (`teleport`, `home`, `tp`, `lost`, `where`) | S | People search with their own words; shared with the site |
| 9 | **A lectern or sign at spawn** saying `Use the star. More: minecraft.nish.software/realm/start` (the spawn-plaza guide already has a "/realm:help board") | S, owner builds | Works even with every popup turned off |
| 10 | **Weekly digest letter** through Realm Mail to players away 7+ days: the same lines as the card, delivered as a letter so it can be re-read | M | Persists after the card is closed; mail_bp already supports system letters (town_bp sends them, `town_bp/main.js:463`) |
| 11 | **Printable one-page "Realm in 60 seconds"** (the cheat sheet's print style) for family members | S | Non-gamers read paper |
| 12 | **Tip of the visit instead of timed tips**: one tip chosen from features the player has *never used* (admin_bp `Recent` and per-pack "seen" flags), shown on the card's last line | M | Teaches what is new to that player instead of repeating `/realm:stats` every 20 minutes |

---

## Appendix: quick reference of contracts proposed

| File (in mc-packs) | Writer | Reader (hosting) | Shape |
|---|---|---|---|
| `docs/menu.json` | `tools/menu-export.mjs` (new; `--check` in `npm run check`) | `pack-docs.mjs` → `pack-docs:tasks` block, card grouping, `realm/menu/`, `realm/tasks.json` | `{ version, home[], tasks[{ id, title, want, hint, synonyms[], items[{ title, hint, command, pack, ops, path[] }], packs[] }], ops[] }` |
| `docs/story.json` | `tools/story-export.mjs` (new) | `pack-docs.mjs` → `realm/story/` | `{ version, stories[{ id, title, kind, act, giver{id,name}, summary, requires[], needsPacks[], chapters[{ id, title, goal, hint, recap }] }] }` |
| `docs/news.json` | `tools/gen-news.mjs` (extended) | `pack-docs.mjs` → `realm/start/` | `[{ id, title, date, headline?, lines[] }]`, newest first, 30 |
| `tools/retired.json` | hand-written when a folder is retired | `publish-packs.mjs`, `pack-docs.mjs` | `{ "<oldFolder>": { "into": "<newFolder>", "date": "YYYY-MM-DD" } }` |

All four are optional inputs on the hosting side until one mc-packs release has shipped them; `pack-docs --check`
covers every generated output; nothing outside `minecraft/` is generated.
