# Pack documentation

What each pack in this repo does, how to use it, and how to configure it.

> **Keep this file up to date.** Any change to a pack's behavior, commands or `config.js` must update this file in the same commit. `npm run check` fails if a pack, command, config option or `### How to use` section is missing from this file (see [Keeping this file current](#keeping-this-file-current)).
>
> **This file is also the players' documentation.** The [Our realm](https://mc.nish.software/realm/) page on mc.nish.software is generated from it (in the `nishant/hosting` repo: `cd minecraft && node tools/pack-docs.mjs`). Every pack section is published, plus the sections marked `<!-- on the site -->`. Write in plain American English, and quote in-game text and ids exactly as the code has them (in backticks). See [Publishing to mc.nish.software](#publishing-to-mcnishsoftware).

## Contents

- [Common to all packs](#common-to-all-packs)
  - [Requirements](#requirements)
  - [Installing from mc.nish.software](#installing-from-mcnishsoftware)
  - [Installing on a Realm](#installing-on-a-realm)
  - [Commands](#commands)
  - [Two ways to configure](#two-ways-to-configure)
  - [Updating a pack](#updating-a-pack)
  - [Formatting codes](#formatting-codes)
- [Realm Help — `help_bp`](#realm-help--help_bp)
- [Realm Settings — `settings_bp`](#realm-settings--settings_bp)
- [Realm Configuration — `admin_bp`](#realm-configuration--admin_bp)
- [Welcome Message — `welcome_bp`](#welcome-message--welcome_bp)
- [Low Durability Warning — `durability_bp`](#low-durability-warning--durability_bp)
- [AFK + Smart Sleep — `afk_bp`](#afk--smart-sleep--afk_bp)
- [Stats & Leaderboards — `stats_bp`](#stats--leaderboards--stats_bp)
- [Realm News & Tips — `news_bp`](#realm-news--tips--news_bp)
- [Creeper Guard — `guard_bp`](#creeper-guard--guard_bp)
- [Phantom Opt-out — `phantom_bp`](#phantom-opt-out--phantom_bp)
- [Right-click Harvest — `harvest_bp`](#right-click-harvest--harvest_bp)
- [Farm Loader — `farm_bp`](#farm-loader--farm_bp)
- [Quick Stack & Sort — `stash_bp`](#quick-stack--sort--stash_bp)
- [Chest Finder — `find_bp`](#chest-finder--find_bp)
- [Land Claims — `claims_bp`](#land-claims--claims_bp)
- [Death Point — `death_bp`](#death-point--death_bp)
- [Hotbar Refill — `refill_bp`](#hotbar-refill--refill_bp)
- [Coordinates HUD — `hud_bp`](#coordinates-hud--hud_bp)
- [Mob Health — `mobhp_bp`](#mob-health--mobhp_bp)
- [Elytra HUD — `elytra_bp`](#elytra-hud--elytra_bp)
- [Realm Mail — `mail_bp`](#realm-mail--mail_bp)
- [Nicknames — `nick_bp`](#nicknames--nick_bp)
- [Daily Quests — `quests_bp`](#daily-quests--quests_bp)
- [Milestones — `milestones_bp`](#milestones--milestones_bp)
- [Community Goals — `goals_bp`](#community-goals--goals_bp)
- [Fast Leaf Decay — `leaves_bp`](#fast-leaf-decay--leaves_bp)
- [Lag Cleanup — `cleanup_bp`](#lag-cleanup--cleanup_bp)
- [Chairs — `chairs_bp`](#chairs--chairs_bp)
- [Townsfolk — `npc_bp`](#townsfolk--npc_bp)
- [Crowns — `crowns_bp`](#crowns--crowns_bp)
- [Merchant Caravan — `caravan_bp`](#merchant-caravan--caravan_bp)
- [Story Questlines — `saga_bp`](#story-questlines--saga_bp)
- [Guilds & Reputation — `guilds_bp`](#guilds--reputation--guilds_bp)
- [Bounty Board — `bounty_bp`](#bounty-board--bounty_bp)
- [Champions — `elite_bp`](#champions--elite_bp)
- [Skills — `skills_bp`](#skills--skills_bp)
- [Parties — `party_bp`](#parties--party_bp)
- [Titles & Trails — `titles_bp`](#titles--trails--titles_bp)
- [Relics — `relics_bp`](#relics--relics_bp)
- [Field Journal — `journal_bp`](#field-journal--journal_bp)
- [Fishing 2.0 — `fishing_bp`](#fishing-20--fishing_bp)
- [Kitchen — `cooking_bp`](#kitchen--cooking_bp)
- [Deck of Many Things — `domt_bp`](#deck-of-many-things--domt_bp)
- [Slot Machine — `slots_bp`](#slot-machine--slots_bp)
- [Silly Enchants — `silly_bp`](#silly-enchants--silly_bp)
- [Dolphin Friends — `dolphin_bp`](#dolphin-friends--dolphin_bp)
- [Treasure Maps & Riddles — `maps_bp`](#treasure-maps--riddles--maps_bp)
- [Waystones & Inns — `waystone_bp`](#waystones--inns--waystone_bp)
- [Expeditions — `expedition_bp`](#expeditions--expedition_bp)
- [Town Projects — `town_bp`](#town-projects--town_bp)
- [Safe Zones — `zones_bp`](#safe-zones--zones_bp)
- [Weather Almanac — `weather_bp`](#weather-almanac--weather_bp)
- [Regional Weather — `climate_bp`](#regional-weather--climate_bp)
- [Storm Chasing — `storm_bp`](#storm-chasing--storm_bp)
- [Tornadoes — `tornado_bp`](#tornadoes--tornado_bp)
- [Rainbows & the Pot of Gold — `rainbow_bp`](#rainbows--the-pot-of-gold--rainbow_bp)
- [Aurora & Shooting Stars — `night_bp`](#aurora--shooting-stars--night_bp)
- [Meteor Strikes — `meteor_bp`](#meteor-strikes--meteor_bp)
- [Blood Moon & Harvest Moon — `moon_bp`](#blood-moon--harvest-moon--moon_bp)
- [Realistic Rain — `rain_rp`](#realistic-rain--rain_rp)
- [Rain Extras — `rain_bp`](#rain-extras--rain_bp)
- [Realm Skies — `sky_rp`](#realm-skies--sky_rp)
- [Translucent Tools — `translucent_rp`](#translucent-tools--translucent_rp)
- [Translucent Tools Switch — `translucent_bp`](#translucent-tools-switch--translucent_bp)
- [Side HUD — `hud_rp`](#side-hud--hud_rp)
- [Bundling packs into one](#bundling-packs-into-one)
- [How the packs work together](#how-the-packs-work-together)
- [Troubleshooting](#troubleshooting)
- [Keeping this file current](#keeping-this-file-current)
- [Publishing to mc.nish.software](#publishing-to-mcnishsoftware)

---

## Common to all packs

### Requirements

| | |
|---|---|
| Minecraft | Bedrock **1.21.100+** (`min_engine_version`) |
| Script API | `@minecraft/server` **2.1.0**, `@minecraft/server-ui` **2.0.0** (stable) |
| Experiments | **None.** Only stable APIs are used, so no experimental toggles are needed on the Realm |
| Cheats | **Not required** for any command (`cheatsRequired: false`) |
| Achievements | Any non-Marketplace behavior pack turns off achievements for the world (that's how Bedrock works) |

### Installing from mc.nish.software
<!-- on the site -->

The realm runs everything as two packs: **Realm Bundle**, a behavior pack with every feature, and **Realm Resources**, a resource pack with every texture, particle, fog and sound. A pack can't be both kinds, so two is the fewest possible. To install or update them:

1. **Download** the latest Realm Bundle and Realm Resources `.mcpack` files from [mc.nish.software/realm](https://mc.nish.software/realm/) on the device you play on (Windows, phone or tablet) and open each. Minecraft starts and imports them as "Realm Bundle" and "Realm Resources".
2. **Open the realm's settings** (the pencil next to the realm). Under **Behavior Packs**, find Realm Bundle under **Available** and activate it. Under **Resource Packs**, activate Realm Resources and move it to the **top** of the active list, so its rain, sky and tools win over other resource packs. Minecraft uploads both to the realm.
3. **Join** once the realm restarts, and accept the resource pack download if asked. The welcome popup and the `/realm:` commands mean it's running.

**Updating:** download and open the newer version, then check that the realm's active Realm Bundle (or Realm Resources) shows the new version. If it still shows the old one, deactivate it and activate it again so the new version uploads. Nothing is lost: in-game settings and stats are stored in the world. Version numbers are the build date and time in UTC (`YYYY.MMDD.HHMM`, without leading zeros, so 5 January at 09:05 is `2026.105.905`), so every build is higher than the last, which Minecraft needs to treat it as an update.

**What's in each:** the Realm Bundle holds every behavior pack in this repo, Rain Extras included. Realm Resources holds the four resource packs: [Realistic Rain](#realistic-rain--rain_rp), [Realm Skies](#realm-skies--sky_rp), [Translucent Tools](#translucent-tools--translucent_rp) and [Side HUD](#side-hud--hud_rp). Players get both packs automatically when they join. Realm Skies draws the tornadoes, rainbows, aurora, shooting stars, meteors, sandstorms, blizzards, moon fogs and trails of the bundle's sky packs: without it those still happen, but you can't see them.

**Only some features?** Every feature is also its own pack, downloaded from its card or the "one at a time" list under the Realm Bundle download, and activated the same way. Use **either** the Realm Bundle **or** single packs, never both: the same commands would be registered twice and fail to load. The same goes for Realm Resources and the single resource packs. If you had Realistic Rain, Realm Skies, Translucent Tools or Rain Extras active on their own before, remove them when you add the bundles. Switching between them starts the features' in-game settings over (welcome and news text, tips, settings from `/realm:config`, per-player choices, remembered chests, zones and farms); stats on the scoreboard are kept. Single packs use ordinary version numbers (`1.0.0`) that go up whenever that pack changes.

### Installing on a Realm

For whoever builds the packs from this repo:

1. Build the packs with `npm run build` (one `dist/<folder>.mcpack` per pack), or `npm run bundle -- --all` and `npm run bundle -- --resources` for the two bundles (`dist/realm_bundle.mcpack`, `dist/realm_resources.mcpack`).
2. Open the `.mcpack` on a device with Minecraft. It imports automatically.
3. Go to **Play → Realms → ✏️ Edit Realm → Behavior Packs** and move the pack from **Available** to **Active**. A resource pack (Realm Resources, or `rain_rp`, `sky_rp`, `translucent_rp`, `hud_rp` on their own) goes under **Resource Packs** instead, at the top of the active list.
   *Another way:* download the Realm world, activate the pack under the world's **Behavior Packs**, and upload the world again.
4. Rejoin. Commands are registered when the world loads.

> ⚠️ Activate **either** the individual packs **or** a bundle that contains them, never both. Otherwise every command is registered twice, and the duplicate commands fail to load. Packs listed in `tools/standalone.json` (none today) are never in a bundle: activate them next to it.

### Commands

- **Every command starts with `/realm:`**, e.g. `/realm:welcome`, `/realm:stats`. Type `/realm` to see all of them in autocomplete, or run `/realm:help` for a page that explains each one, with usage.
- All packs share the `realm` namespace because Bedrock requires **one command namespace per add-on**. A bundle is one add-on, so if packs used different namespaces, only the first pack's commands would register and the rest would show as "unknown command". `npm run check` and the bundler both enforce this.
- **Everyone** commands work for all players. **Ops** commands (permission level `GameDirectors`) only work for, and are only shown to, operators.

### Two ways to configure

| | Where | Who | Takes effect | Notes |
|---|---|---|---|---|
| **In-game, every pack** | `/realm:config` ([Realm Settings](#realm-settings--settings_bp)), or an item named `Realm Settings` | Operators | Immediately | The options that make sense to change live, in every installed pack: switches, numbers and choices. Saved in the world, and overrides `config.js`. **Reset a pack to defaults** goes back to `config.js` |
| **In-game, per player** | `/realm:prefs`, and toggles such as `/realm:durability`, `/realm:phantoms`, `/realm:rain` | Every player, for themselves | Immediately | Overrides the realm's value for that player only |
| **In-game editors** | `/realm:welcome_edit`, `/realm:news_edit`, `/realm:news_tips`, `/realm:stats_sidebar` | Operators | Immediately | Texts, tips and the sidebar. Saved in the world, and overrides `config.js` |
| **`config.js`** | `packs/<folder>/scripts/config.js` | Whoever builds the pack | After rebuilding and re-applying the pack | Defaults for all of the above, and the options that have no in-game editor: lists, texts, tick intervals and command permissions |

### Updating a pack

1. Edit the pack.
2. **Increase `header.version`** in its `manifest.json`, e.g. `[1, 0, 0]` → `[1, 0, 1]`. If you don't, devices keep using their cached copy. (Bundles do this automatically.)
3. `npm run build`, then re-import and re-apply the pack.

### Formatting codes
<!-- on the site -->

Text that operators edit in game (the welcome popup, news, tips) supports these codes:

| Code | Effect |
|---|---|
| `\n` | New line, in the welcome and news **body** only (not in titles, the button or tips). The in-game text boxes are one line, so type a literal `\n` |
| `\|` | New line in text pasted with `/realm:news_body` or `/realm:news_add` (chat commands drop the backslash of `\n`, which then shows as a plain `n`) |
| `%` | Doesn't show: Minecraft takes it for a formatting code. Write `percent` instead |
| `§0`–`§9`, `§a`–`§f` | Colors: `§a` green, `§b` aqua, `§c` red, `§e` yellow, `§6` gold, `§7` gray |
| `§l` `§o` `§r` | Bold, italic, reset |

---

## Realm Help — `help_bp`

One help page for every realm command: how each feature works, and each command with its usage.

### How to use

1. Run `/realm:help`. A **Realm help** menu lists every feature installed on this realm, with its commands under its name.
2. Tap **All commands** to see every command with its usage on one page, or tap a feature for its how-to steps and its commands. **Back** returns to the menu.
3. Jump straight to a page with `/realm:help <feature>`, for example `/realm:help stash` or `/realm:help find`, or `/realm:help all` for every command. Chat autocompletes the feature names.
4. **Operators** also see the operator-only commands and steps, marked `(operators)`.

### What players see

- Only features that are installed show up: each pack answers when the help asks, so a realm running a few single packs gets help for just those.
- Usages follow the usual notation: `<name>` must be typed, `[name]` is optional.
- The text is the same as on mc.nish.software/realm: it's generated from this file.
- Running `/realm:help` again while the help is already open does nothing, so menus don't stack. If chat or another screen stays open for about 20 seconds, chat says `Couldn't open the help. Close chat or your inventory and try again.`

### Commands

| Command | Who | What it does |
|---|---|---|
| `/realm:help [feature]` | Everyone | Opens the help menu, or the page for `feature` (a pack's folder name without `_bp`, such as `stash`, `crowns` or `quests`; chat autocompletes them) or `all` |

### Configuration (`scripts/config.js` → `CONFIG`)

| Option | Default | Description |
|---|---|---|
| `answerTicks` | `10` | Ticks to wait for the installed packs to answer before the help opens (20 = 1 s) |
| `showOpsToEveryone` | `false` | Show operator-only commands and steps to everyone. Operators can change it in game with `/realm:config` |

### Saved data

| Key | Scope | Contents |
|---|---|---|
| `help:cfg` | World | Settings changed in `/realm:config` (`showOpsToEveryone`) |

### How it works

- `scripts/catalog.js` holds every pack's summary, `### How to use` steps and Commands table from this file, converted to Minecraft formatting. `node tools/help-catalog.mjs` writes it (and bumps this pack's patch version once per commit); `npm run check` fails when it's out of date.
- `/realm:help` sends the script event `realm:help_ping`. Every other pack answers `realm:help_pong` with its folder name, and the help lists the packs that answered within `answerTicks`. Script events cross pack boundaries without imports, so the packs stay independent, and work the same in the Realm Bundle and as single packs.

---

## Realm Settings — `settings_bp`

Change the packs' settings in game: operators set them for everyone with `/realm:config`, and every player picks their own preferences with `/realm:prefs`.

### How to use

1. Run `/realm:prefs` to open **My preferences**: one form with your own choices from every installed pack, such as whether you get durability warnings, phantoms or the rain extras, what sneak-tapping a chest does, and whether chat announces you going AFK. Every switch is named for what it does: on means **Enabled**. Change what you like and tap **Save**. A summary pops up with how many changes were saved and each one as before -> after, for example `1 change saved` and `Phantom Opt-out > Phantoms near me: Enabled -> Disabled` (chat gets the same). Tap **Back to my preferences** to change more, or **Done**.
2. Your choices are remembered. `/realm:durability`, `/realm:phantoms` and `/realm:rain` flip the same switches as the form.
3. **Operators:** run `/realm:config`, or use any item renamed `Realm Settings` on an anvil (a stick works). The first button, **All settings**, holds every pack's settings with a heading per pack (see below); the buttons under it open one pack each. Change settings (switches, sliders and lists) and tap **Save**. They apply right away for everyone. A summary pops up with how many changes were saved and each one as before -> after, such as `Storm wind volume: 70% -> 50%`; tap **Back to Realm Settings** for another pack, or **Done**. A setting shown as text with `(change in config.js, then restart the world)` can only be changed there.
4. **Operators: All settings.** With the whole Realm Bundle that is about 370 settings, so they come on a few pages, such as `All settings (page 1 of 5)`, of at most 100 lines each (`allPageSize`); a pack is never split across pages. The list at the top, **After saving, go to**, picks where **Save and go** takes you next: the next page (already chosen), any other page (each named by its first and last pack, `Page 2: <first pack> to <last pack>`) or **Done (show what was saved)**. Each page saves its changes when you tap **Save and go**; closing a page saves nothing on it. At the end one summary lists every change from every page, each as `Pack > Setting: before -> after`. All settings and a pack's own page show the same saved values: change Leaderboard size on one and the other shows the new number the next time it opens.
5. **Operators:** **Reset a pack to defaults**, at the bottom of the menu, puts one pack's settings back to its `config.js` values after asking. Players' own preferences are kept.

### What players see

- Only installed packs are listed: each pack answers when the menu asks, as with `/realm:help`. Rain Extras is listed too, from the bundle or on its own.
- Each setting has a `!` icon: hover over it or tap it for what the setting does, its default and, for a slider, its range.
- Volumes and other 0 to 1 settings are sliders in percent (`Storm wind volume (%)`, 0 to 100 in steps of 5), and settings in fractional steps, such as Chairs' seat reach (1 to 5 blocks in 0.5s), are lists of their exact values: Bedrock's sliders only stop on whole numbers. A setting you don't touch is saved exactly as it was, even a `config.js` value between the steps or outside the in-game range (shown at the nearest place the control can show it).
- Tapping **Save** without changing anything says `No changes`.
- Switches read the same everywhere: the setting is named for what it does, the switch on means **Enabled**, and chat says `Enabled` or `Disabled`. Lists show plain choices, such as `Open the menu` or `Only in protected zones`.
- A preference set to what the realm has follows the realm: if an operator changes that setting later, you get the new value. A preference set to something else stays yours.
- If a pack doesn't confirm a change within half a second, the summary counts it as not saved (`1 change saved, 1 not saved`) and that line says `not saved, the pack didn't answer. Try again`; a value the pack refuses says why.
- Players who aren't operators and use an item named `Realm Settings` are pointed to `/realm:prefs`.

### Commands

| Command | Who | What it does |
|---|---|---|
| `/realm:prefs` | Everyone | Opens **My preferences**: your own choices from every installed pack, in one form |
| `/realm:config` | Ops | Opens **Realm Settings**: **All settings** first (every pack's settings with a heading per pack, about 100 lines per page, `allPageSize`), then each installed pack's own page, then **Reset a pack to defaults**. Using an item named `Realm Settings` opens it too (`itemName`) |

### What each pack offers

Each pack's own section says which of its options are in `/realm:config` and which are preferences in `/realm:prefs` (under its Configuration). With the whole Realm Bundle, `/realm:config` lists every pack that has settings (about 60) and `/realm:prefs` holds about 40 preferences in one form, with a heading per pack, such as **Stats ticker above my hotbar** and its stats, speed, style and colors (`/realm:stats_ticker`), **Welcome popup when I join**, **Low-durability warnings** (`/realm:durability`), **Phantoms near me** (`/realm:phantoms`), **Announce when I go AFK**, Quick Stack & Sort's sneak-tap and hotbar choices, **Unread letters notice on join** and **Rain extras** (`/realm:rain`).

Everything else (lists such as crops, `keepItems` and container types, texts such as name tag prefixes, tick intervals, and command permissions) stays in `config.js`.

### Configuration (`scripts/config.js` → `CONFIG`)

| Option | Default | Description |
|---|---|---|
| `answerTicks` | `10` | Ticks to wait for the installed packs to answer, and for each change to be confirmed (20 = 1 s) |
| `itemName` | `Realm Settings` | Operators who use an item with exactly this name (renamed on an anvil) open `/realm:config`. `""` turns it off |
| `allPageSize` | `100` | **All settings** puts at most this many lines on a page (a heading per pack plus a line per setting); a pack bigger than that gets a page of its own. `0` puts everything on one page (with the whole bundle about 370 controls, slow to open and to scroll on phones) |

### Saved data

None in this pack. Each pack saves its own settings, so they stay with that pack and still apply when Realm Settings is removed:

| Key | Scope | Contents |
|---|---|---|
| `<prefix>:cfg` (`afk:cfg`, `stash:cfg`, …) | World | JSON of the settings changed in `/realm:config` that differ from `config.js` |
| `<prefix>:pref` (`afk:pref`, `stash:pref`, `welcome:pref`) | Player | JSON of the player's own preferences that differ from the realm's |
| `durability:off`, `phantom:off`, `rain:off` | Player | The existing switches, kept so nobody's earlier choice is lost |
| `news:tipSettings`, `welcome:settings` | World | Shared with `/realm:news_tips` and `/realm:welcome_edit`, so both menus show the same values |

### How it works

- **All settings** and a pack's own page are two views of the same thing: both ask the packs for their current values (`realm:cfg_ping`) each time they open, draw each setting with the same control, and save through the same `realm:cfg_set`, so neither keeps a copy that could go stale. **My preferences** is one form with a heading per pack.
- Every other behavior pack has a `scripts/settings.js` that lists what can change in game. The pack reads those options through it (`get(key)`: the world's saved value over `config.js`; `getFor(player, key)`: the player's own value over the world's), so a change applies on the next use, with no restart.
- The packs never import each other. This pack sends the script event `realm:cfg_ping` (`{id, player}`), and each pack answers `realm:cfg_schema` with its options and their current values (`{id, pack, title, part, parts, options}`), split into parts under the 2048-character limit of a script event message. Saving sends `realm:cfg_set` (`{id, pack, key, value, player?}`) and resetting `realm:cfg_reset` (`{id, pack}`). The pack checks the value (type, range, choices), ignores keys it doesn't have, saves it and answers `realm:cfg_ack` (`{id, pack, key, ok, value, error?}`), which is what the save summary reports.
- An option can carry `invert` (a switch stored as `off` but shown as **Enabled**, so no label is a double negative) and `names` (readable words for a list's choices). Labels name what the setting does, never "Turn off ...".
- In-game text is plain ASCII: Bedrock draws a whole line in a smaller fallback font when it holds a character like `…`, `–`, `•` or an emoji, which is why `/realm:help` once looked different in `/help`. `npm run check` (`tools/check-ascii.mjs`) fails on any other character in pack code, and `tools/help-catalog.mjs` converts the docs' typography when it builds the help.
- The part of `settings.js` that does this is the same in every pack: it's copied from `tools/settings-shared.js` by `node tools/sync-settings.mjs`, and `npm run check` fails if a copy is missing or out of date.
- Operators with cheats on could send the same script events with `/scriptevent`; that does nothing an operator can't do in the menu.

---

## Realm Configuration — `admin_bp`

Every operator carries a **Realm Configuration** item (a nether star with a gold name). Using it opens an admin menu that runs **every realm command** from one place: pick a category, pick a command, choose its options from preset lists (townsfolk, weather kinds, relics, online players, sliders with sensible ranges, your position filled in), and it runs as you, with the command's own checks, messages and menus. The commands still work as typed; this is for when you'd rather not type them while playing. It isn't settings: settings are one button away, at the top.

### How to use

1. **Operators:** you get the `Realm Configuration` item when you join or respawn without one (and within 30 seconds of becoming an operator). It stays through death and can't be dropped or put in a chest. Lost it anyway? Run `/realm:admin_item`. `/realm:admin` opens the same menu.
2. **Operators:** use the item (right-click or long press, like eating). The menu starts with **Realm Settings** (opens `/realm:config`), **Search commands**, **Recent**, **Server setup checklist** and **Quick actions**, then the categories: **World & weather**, **Story & townsfolk**, **Towns & places**, **Economy**, **Events & news**, **Players**, **Dungeons & loot**, **Fun**, **Utilities** (and **Other** for a pack the menu doesn't know yet). Each lists its commands with what they do; `(ops)` marks operator commands.
3. **Operators:** pick a command. Without options it runs right away (a menu command such as `/realm:meteor` opens its own menu). With options, a form asks for them: lists for choices (`mara`, `thunder`, `storm_staff`...), a list of online players (with **Everyone online (@a)** where a command can take several, and a box for an offline name where it makes sense), sliders for amounts and radii, a switch for true or false, and your current position already filled in for coordinates. Leave an optional choice on `(leave out)` or its box empty to skip it. Press **Run**.
4. **Operators:** chat says `[Realm Configuration] Ran /realm:...` with the exact command, or that it didn't run. Commands that remove or reset something, and a few with big effects (`/realm:meteor_now`, `/realm:tornado_spawn`, `/realm:caravan_call`, `/realm:crowns_give`, `/realm:domt_draw`), ask **Are you sure?** first.
5. **Operators:** **Recent** keeps your last 8 commands with their options (`recentSize`): tap one to run it again. **Search commands** finds commands and quick actions by any word of their name or description.
6. **Operators:** **Quick actions** are the vanilla things you'd otherwise type: set the weather (with the [Weather Almanac](#weather-almanac--weather_bp) installed this runs `/realm:weather_set`, because the almanac plans the weather and would undo a plain change), set the time (day, noon, sunset, night, midnight, sunrise), game mode for a player, teleport to a player or a player to you, give an item by id and amount, clear effects, heal, set the world spawn where you stand, remove hostile mobs nearby (monsters only, named mobs are kept, radius 8 to 128) and game rules (day and night cycle, keep inventory, mob spawning, mob griefing). They work without cheats.
7. **Operators:** **Server setup checklist** lists the one-time jobs across the installed packs (place the townsfolk, story places, towns and their project spots, bounty board, caravan spots, expedition site, waystones, safe zones, Creeper Guard zones, farms, a community goal, welcome message, news, settings); tap one to do it. Safe zones and towns show `[x]` with how many exist; the others can't be checked from here.

### What players see

- **Operators:** the item in their inventory, a chat line each time they're given one (`You have the Realm Configuration item: use it to run any realm command from one menu.`), and the menu. The menu shows only the commands of installed packs that the operator's permission level allows.
- **Everyone else:** nothing. A player who isn't an operator and uses an item with that name sees `Realm Configuration is for operators. Your own options: /realm:prefs` above the hotbar, and the real item is taken from them (`removeFromOthers`): `The Realm Configuration item is for operators, so it was put away.` An item renamed on an anvil is never taken (it has no Realm Configuration lore), it just doesn't open anything.
- An item renamed `Realm Settings` on an anvil still opens [Realm Settings](#realm-settings--settings_bp) as before; the Realm Configuration menu's first button opens it too.

### Commands

| Command | Who | What it does |
|---|---|---|
| `/realm:admin` | Ops | Opens the Realm Configuration menu (the same as using the item) |
| `/realm:admin_item [player]` | Ops | Gives you the Realm Configuration item if you don't carry one, or checks the named operators and gives them one. Players who aren't operators are refused |

### Configuration (`scripts/config.js` → `CONFIG`)

| Option | Default | Description |
|---|---|---|
| `giveToOperators` | `true` | Operators without the item get one when they join or respawn, and within `checkSeconds` of becoming an operator |
| `removeFromOthers` | `true` | Take the real item from players who aren't operators (an anvil-renamed item is left alone) |
| `checkSeconds` | `30` | How often to check who carries the item, in seconds (5 to 300) |
| `itemType` | `"minecraft:nether_star"` | The vanilla item it's made from. It gets the name, lore, keep on death and an inventory lock |
| `recentSize` | `8` | How many of your last commands **Recent** keeps (1 to 20) |
| `answerTicks` | `10` | Ticks to wait for the installed packs (and the safe zone lists, for the checklist) to answer (20 = 1 second) |

Operators can change `giveToOperators`, `removeFromOthers`, `checkSeconds` and `recentSize` in game with `/realm:config` when Realm Settings is installed.

### Saved data

| Key | Scope | Contents |
|---|---|---|
| `admin:recent` | Player | JSON list of that operator's last commands, newest first: `{ t, l }` (a title and the command line) or `{ t, a, v }` (a quick action's id and its values, with player names rather than list positions) |
| `admin:cfg` | World | Settings changed in `/realm:config` |

### How it works

- `scripts/catalog.js` lists every `realm:` command of every pack: name, description, permission level, parameters (type, optional, enum values) and the pack. `node tools/admin-catalog.mjs` writes it by loading each pack's `scripts/main.js` in Node with a stand-in for the Minecraft modules and recording what its startup handler registers, so enum values computed from `config.js` (townsfolk ids, relics, story places...) are exact. `npm run check` runs it with `--check` and fails when a command was added or changed and the catalog wasn't rewritten. `scripts/presets.js` (hand-written) adds categories, friendlier labels, slider ranges and defaults, the commands that ask first and the setup checklist; a command it doesn't mention still shows, with plain inputs.
- Which packs are installed: the menu sends `realm:help_ping` like `/realm:help` and keeps the folders that answer (for a minute). If nobody answers, it shows everything.
- Commands run with `player.runCommand`, so a command does exactly what it does when typed by that operator. When a command refuses (a bad name, too far from a town...), the game doesn't hand its reason to the script, so chat says `didn't run: the command refused. Check the options, or type it to see its reason` (some packs also explain in chat); a command that doesn't parse shows the game's own error.
- The setup checklist pings the safe zones protocol (`realm:zones_ping`) and counts the `zones` and `town` lists it hears back.
- The menu checks the operator level itself (`commandPermissionLevel` of `GameDirectors` or higher) before opening and again right before each command or quick action runs (someone who stopped being an operator with the menu open gets `didn't run: you aren't an operator any more.`), and hides commands above the player's level.

---

## Welcome Message — `welcome_bp`

Shows a popup when a player joins the Realm. Operators can edit the popup in-game.

### How to use

1. Join the realm. The welcome popup appears after about 2 seconds; tap its button (`Let's go!` by default) to close it.
2. Run `/realm:welcome` (or `/realm:welcome_show`) any time to see it again. Don't want the popup when you join? Disable **Welcome popup when I join** in `/realm:prefs`.
3. **Operators:** `/realm:welcome` opens the **Welcome Message** menu instead: `Show the welcome message`, `Edit the welcome message`, `Reset to the defaults` and `Settings` (which points to `/realm:config` → Welcome Message). The edit and reset buttons do the same as the commands below. Run `/realm:welcome_edit`, change the title, body or button text and the switches, then submit. The body is split over boxes of 100 characters each (Minecraft's limit), joined in order; type `\n` for a new line. Players see the new text on their next join (with "show once" on, each player sees it one more time, unless you turn off "Show it again to players who've seen it" for a typo fix). `/realm:welcome_reset` asks first, then goes back to the pack's default text.

### What players see

- About 2 seconds after joining (`delayTicks`), a popup appears with a title, body text and one close button.
- If the player is still loading, or has chat or their inventory open, the game rejects the popup. The pack retries every second for up to 30 seconds.
- Respawning after death does **not** show it. Only joining does.

### Commands

| Command | Who | What it does |
|---|---|---|
| `/realm:welcome` | Everyone | Shows the welcome message to yourself, like `/realm:welcome_show`. Operators get the **Welcome Message** menu instead: show, edit, reset and `Settings` |
| `/realm:welcome_show` | Everyone | Shows the welcome message to yourself (preview). Ignores `showOnce` |
| `/realm:welcome_edit` | Ops | Opens an editor: title, body (Minecraft's text boxes hold only 100 characters each, so the body is split over at least 4 boxes, joined in order with nothing between them; `\n` is a new line; all boxes empty = the default text), button text, and toggles for show once, chat copy, big on-screen title and "Show it again to players who've seen it" (on by default; turn it off for a quiet fix). If chat or the inventory stays open, it retries for about 20 s and then says so once |
| `/realm:welcome_reset` | Ops | Asks `Reset the welcome message?` first, then discards in-game edits and goes back to the `config.js` defaults |

Every save from `/realm:welcome_edit` counts as a new revision. With **show once** turned on, everyone sees the edited message one more time.

### Placeholders

| Placeholder | Replaced with |
|---|---|
| `{player}` | The joining player's name |
| `{online}` | Number of players online |

### Configuration (`scripts/config.js` → `DEFAULTS`)

These are defaults. Once an op saves with `/realm:welcome_edit`, the saved values win until `/realm:welcome_reset`. The switches `showOnce`, `chat` and `screenTitle` are also in `/realm:config`, saved in the same place, so both menus always show the same values. Each player can disable the popup on join for themselves in `/realm:prefs` (`/realm:welcome` still shows it).

| Option | Default | In-game? | Description |
|---|---|---|---|
| `title` | `§l§6Welcome to the Realm!` | ✅ | Popup title |
| `body` | Greeting + 3 rules + a pointer to `/realm:help` + online count | ✅ | Popup body. Supports placeholders and formatting |
| `button` | `§lLet's go!` | ✅ | Close button text |
| `showOnce` | `false` | ✅ | `true` = only once per player, shown again after each edit (unless the edit turns that off). `false` = every join |
| `chat` | `false` | ✅ | Also post the title + body in that player's chat |
| `screenTitle` | `false` | ✅ | Also flash the title as big on-screen text |
| `delayTicks` | `40` | ❌ | Ticks after spawn before the first try (20 ticks = 1 s). Not editable in game, so a new value here always applies, edits or not |

### Saved data

| Key | Scope | Contents |
|---|---|---|
| `welcome:settings` | World | JSON of in-game edits |
| `welcome:revision` | World | Increases on every save or reset |
| `welcome:seen` | Player | Last revision the player saw (used by `showOnce`) |
| `welcome:pref` | Player | JSON `{ popup: false }` when the player turned the popup on join off in `/realm:prefs` |

---

## Low Durability Warning — `durability_bp`

Warns players before a tool, weapon or armor piece breaks.

### How to use

1. Nothing to set up: hold or wear any tool, weapon or armor piece. At **10%** durability left a yellow warning appears above the hotbar with a soft chime; at **3%** a red "about to break!" warning, an anvil sound and the same line in chat.
2. Repair the item (Mending, an anvil) or swap it before it breaks. A repaired item warns again the next time it runs low.
3. Don't want the warnings? Run `/realm:durability` to turn them off for yourself; run it again to turn them back on. The same switch is in `/realm:prefs`. The choice is remembered.

### What players see

| Level | When | Shows |
|---|---|---|
| **Warning** | ≤ `warnPercent` (10%) left | Yellow message above the hotbar: `! Diamond Pickaxe is low: 141/1561 (9.0%)` + soft "pling" |
| **Critical** | ≤ `criticalPercent` (3%) left | Red message `! Diamond Pickaxe is about to break! 31/1561 (2.0%)` above the hotbar **and in chat** (`chatOnCritical`) + anvil sound |

- Checks the **main hand, offhand, helmet, chestplate (including elytra), leggings and boots** every `checkIntervalTicks`.
- Warns **once per level**. It only warns again when the item drops to the next level.
- A different kind of item in that slot, emptying the slot, or a repair (Mending, anvil, grindstone) resets it. Another item of the same kind that's just as worn doesn't warn again.
- Each **hotbar slot** is tracked separately, so switching to another worn tool warns for that one too.
- Items without durability (blocks, torches, …) are ignored.
- Named items use their custom name (e.g. `Excalibur is low`).
- The [Coordinates HUD](#coordinates-hud--hud_bp) steps aside for 3 seconds so the warning stays readable.

### Commands

| Command | Who | What it does |
|---|---|---|
| `/realm:durability` | Everyone | Enables or disables warnings **for yourself**. Remembered between sessions. Chat says `Low-durability warnings: Disabled. Run /realm:durability again to enable them.` |

### Configuration (`scripts/config.js` → `CONFIG`)

| Option | Default | Description |
|---|---|---|
| `warnPercent` | `10` | Warning level, in % of durability left |
| `criticalPercent` | `3` | Critical level, in % left |
| `maxUsesForWarning` | `0` | If > 0, never warn while more than this many uses are left, even under the % (useful for netherite). `0` = off |
| `chatOnCritical` | `true` | Also post critical warnings in chat |
| `checkIntervalTicks` | `10` | How often to check (20 = 1 s). Read when the world starts, so `/realm:config` only shows it |

Operators can change `warnPercent`, `criticalPercent`, `maxUsesForWarning` and `chatOnCritical` in game with `/realm:config`; they apply at the next check.

### Saved data

| Key | Scope | Contents |
|---|---|---|
| `durability:off` | Player | `true` when the player turned warnings off (`/realm:durability` or `/realm:prefs`) |
| `durability:cfg` | World | Settings changed in `/realm:config` |

---

## AFK + Smart Sleep — `afk_bp`

Marks idle players as AFK, and skips the night without waiting for them.

### How to use

1. **Going AFK:** just stop playing. After 5 minutes your name shows `[AFK]` and chat says so. To go AFK right away (so the night can be skipped without you), run `/realm:afk`.
2. **Coming back:** move or look around. Chat says you're back and, after 30 seconds or more, how many minutes you were marked AFK. Rather chat didn't announce you? Disable **Announce when I go AFK** in `/realm:prefs`.
3. **Skipping the night:** get in a bed. Players who are AFK, and players in the Nether or the End, aren't waited for. While anyone is in bed, Overworld players see how many are asleep out of how many are needed, above the hotbar, and, when only 1 to 3 counted players are still up, who they are (`Zzz 1/2 sleeping - awake: Sam`). Once everyone needed is in bed, it's morning within about 8 seconds, and rain or thunder stops.

### AFK detection

A player counts as **active** when they do any of these:

| Signal | Notes |
|---|---|
| Movement keys or stick | Checks the actual movement input, so being pushed by water streams, pistons or minecarts **doesn't** count. Tiny stick input (< 10%, controller drift) is ignored |
| Turning the camera | More than 0.5° |
| Breaking, placing, interacting with blocks or entities | |
| Using an item, hitting a block or entity | |
| Jumping or sneaking, changing hotbar slot | |

After `afkMinutes` (5) with none of these:

- The name above the player's head becomes `[AFK] Name` (`nameTagPrefix`). The prefix goes in front of whatever the name tag already shows, so a nickname or title from [Nicknames](#nicknames--nick_bp) stays.
- The player gets the `afk` tag (`tag`). Other packs and commands can use it, e.g. `@a[tag=!afk]`.
- Chat shows `Name is now AFK` (`announce`).

Any activity brings them back, with `Name is back (AFK 12m)` in chat (minutes since being marked AFK; left out under 30 seconds). Sleeping players are never marked AFK. Leftover AFK names or tags are cleared when a player rejoins, and after a script reload.

### Smart sleep (night skip)

Checked every second while at least one player is in bed:

1. **Counted players** = everyone asleep, plus every non-AFK player in the Overworld (also those in the Nether/End if `sleep.countOtherDimensions` is on).
2. **Needed** = `ceil(counted × sleep.percent / 100)`, at least 1.
3. While anyone is in bed, Overworld players see `Zzz 1/2 sleeping - awake: Sam (1 AFK ignored)` above the hotbar. The names show when 1 to 3 counted players are awake. The [Coordinates HUD](#coordinates-hud--hud_bp) steps aside for it.
4. **If vanilla's own rule already covers it**, i.e. enough players are asleep to meet the `playerssleepingpercentage` gamerule counting *everyone*, the pack does nothing and lets vanilla skip the night. That's always the case when nobody is AFK and everyone is in bed. Doing both would race, and the second skip would land a full day later.
5. Otherwise, once enough players have been asleep for `sleep.requiredTicks` (about 8 s, and never less than about 7 s, so vanilla's ~5 s skip always comes first):
   - **At night:** moves to the **next morning**. Absolute time moves forward, so the day counter (`showdaysplayed`) stays correct. The weather clears too.
   - **During a daytime thunderstorm:** only clears the weather. The game doesn't let packs read the weather, so the pack remembers the last change it saw (saved, so it survives a restart); a storm that started before the pack was installed isn't cleared.
   - Chat shows `Good morning! (1 AFK player skipped)`.

Lying in bed counts as activity, so a player who waits in bed for a long night isn't marked AFK when they get up.

This works **alongside** the vanilla `playerssleepingpercentage` gamerule: vanilla handles everything it can, and this pack only covers what vanilla wouldn't, such as nights blocked by AFK players or by players in other dimensions.

### Commands

| Command | Who | What it does |
|---|---|---|
| `/realm:afk` | Everyone | Marks you AFK right away. Anything you do in the next 3 seconds (closing chat, the camera settling) is ignored. After that, move to come back. With announcements off (`announce`, or yours in `/realm:prefs`), only you get a confirmation |

### Configuration (`scripts/config.js` → `CONFIG`)

| Option | Default | Description |
|---|---|---|
| `afkMinutes` | `5` | Minutes without input before a player is marked AFK |
| `announce` | `true` | Post AFK / back messages in chat |
| `nameTagPrefix` | `§7[AFK]§r ` | Shown before the name above the player's head |
| `tag` | `afk` | Tag added while AFK. The Stats pack's `afkTag` must match |
| `sleep.enabled` | `true` | Skip the night when enough non-AFK players are in bed |
| `sleep.percent` | `100` | % of counted players that must be asleep |
| `sleep.countOtherDimensions` | `false` | Also count non-AFK players in the Nether/End (who can't sleep), like vanilla |
| `sleep.requiredTicks` | `160` | How long enough players must be asleep before skipping (20 = 1 s). Values below `140` are raised to `140`, so vanilla's ~100-tick skip always comes first |

Operators can change `afkMinutes`, `announce` and every `sleep.` option in game with `/realm:config`; they apply within a second. Each player can stop chat announcing them in `/realm:prefs`. With `announce` off, nobody is announced.

### Saved data

| Key | Scope | Contents |
|---|---|---|
| `afk:cfg` | World | Settings changed in `/realm:config` |
| `afk:pref` | Player | JSON `{ announce: false }` when the player turned their announcements off in `/realm:prefs` |
| `afk:thunder` | World | `true` while the last Overworld weather change seen was a thunderstorm (for clearing a daytime storm) |

AFK state itself isn't saved: it's kept in memory and resets on rejoin. While a player is AFK, their name tag and the `afk` tag are changed.

### Known limits

- Being fully AFK while in a vehicle with no input still counts as AFK, which is intended.
- Name-tag changes may clash with other packs that also change player name tags. [Nicknames](#nicknames--nick_bp) keeps the prefix in step (its `afkPrefix` must match `nameTagPrefix`).

---

## Stats & Leaderboards — `stats_bp`

Tracks player stats as scoreboards, with leaderboard menus, a stats ticker above each player's hotbar that each player sets up for themselves, and an optional sidebar for everyone.

### How to use

1. Play: stats count on their own (playtime and distance, except while AFK; deaths; mob and player kills; blocks mined and placed; elytra distance; joins).
2. Run `/realm:stats` to open **Realm Stats**. **My stats** shows every stat, with your rank (`#2 of 7`) in each one you've scored in, and the date you first joined (UTC); **Leaderboards** and a stat shows the top 10.
3. Want your own stats on screen? Tap **Stats ticker** in the same menu (or run `/realm:stats_ticker`). Above your hotbar you now see one stat at a time, such as `Mob kills 120 #2 of 7`, changing every 5 seconds. Only you see yours.
4. Tap **My ticker settings** (or open `/realm:prefs`, the same settings) to choose which stats it shows (one switch each), how many seconds each stays, **One stat at a time** or **Every chosen stat on one line**, the full style or a compact one (`Kills 120`), and the colors of the names and the numbers. Your choices are remembered.
5. **Operators:** **Sidebar (everyone)** in `/realm:stats` (or `/realm:stats_sidebar <stat>`) picks what the sidebar shows: **Hidden**, one stat, or **Rotate through the stats**, how many seconds each stat stays and which stats the rotation includes. Bedrock shows the same sidebar to everyone, so players can't hide it for themselves; leave it **Hidden** and let players use the ticker if some don't want it. The stat IDs for the command are `playtime`, `deaths`, `mobkills`, `pvpkills`, `mined`, `placed`, `travelled`, `flown` and `joins`, plus `cycle` (rotate) and `off`, for example `/realm:stats_sidebar travelled`.
6. **Operators:** `/realm:config` → **Stats & Leaderboards** has all of that, plus the leaderboard size, the ticker for the whole realm (**Stats ticker**), whether new players see it from the start, and what every ticker setting starts as for players who haven't chosen.

### Stats

| ID (for `/realm:stats_sidebar`) | Label | How it's counted |
|---|---|---|
| `playtime` | Playtime | +1 min per 60 s online. Paused while the player has the `afkTag` tag |
| `deaths` | Deaths | Player deaths |
| `mobkills` | Mob kills | Non-player entities killed by the player (arrows count for the shooter) |
| `pvpkills` | Player kills | Other players killed |
| `mined` | Blocks mined | Blocks broken by the player. Essentials+ tree felling and vein mining only count the first block |
| `placed` | Blocks placed | Blocks placed by the player |
| `travelled` | `Distance traveled` | Blocks moved, not gliding, measured every second. Includes walking, swimming, boats and minecarts. Not counted while AFK, so a water stream or minecart loop doesn't climb the board |
| `flown` | Elytra distance | Blocks moved while gliding |
| `joins` | Times joined | Each join |

- Movement faster than `maxSpeed` blocks/s is treated as a teleport and not counted. Respawning isn't counted either.
- Each stat is the scoreboard objective **`stats_<id>`** (e.g. `stats_deaths`). Scores are stored under the player's **name** (a "fake player" participant), not the player entity. Bedrock shows offline entity participants as "Player Offline", so this keeps real names on leaderboards and the sidebar when people are offline.
- Vanilla commands work too, e.g. `/scoreboard players list "Steve"`.
- If someone changes their gamertag, their stats start again under the new name, and the old name stays on the leaderboard.
- Scores from the first Stats pack (v1.0.0, before the Realm Bundle), which stored them on the player entity, move to the name automatically the next time that player joins. Until then they're hidden from the menus, and the vanilla sidebar may still show them as "Player Offline".
- First-joined date is saved per player, from the first join after the pack was added.

### The stats ticker

- **Off until a player enables it** (`tickerDefaultOn`), with **Stats ticker** in `/realm:stats`, `/realm:stats_ticker` or **Stats ticker above my hotbar** in `/realm:prefs` (all the same switch). While an operator has disabled it for the realm (`tickerEnabled`), nobody sees it, and the menu and `/realm:stats_ticker` say `The stats ticker is disabled on this realm.`
- **Which stats:** one switch per stat, **Ticker shows Playtime** and so on. Players start with Playtime, Deaths, Mob kills, Blocks mined and Distance traveled (`tickerStats`). With none chosen, the ticker shows nothing.
- **Speed:** **Ticker seconds per stat**, 2 to 60 (default 5, `tickerSeconds`), when it shows **One stat at a time** (`tickerMode`). **Every chosen stat on one line** shows them all at once, which gets long with many stats in the full style.
- **Style:** **Name, value and rank** (`Mob kills 120 #2 of 7`) or **Compact: short name and value** (`Kills 120`, with the short names `Time`, `Deaths`, `Kills`, `PvP`, `Mined`, `Placed`, `Walked`, `Flown` and `Joins`) (`tickerStyle`).
- **Colors:** **Ticker name color** (default gray) and **Ticker number color** (default white): White, Gray, Dark gray (dim), Gold, Yellow, Green, Aqua, Blue, Light purple or Red (`tickerLabelColor`, `tickerValueColor`). Dark gray for both is the closest to a faint, see-through ticker.
- **Transparency:** scripts can't change how see-through the bar's dark background is. Each player sets that in Bedrock's own **Settings > Accessibility > Text Background Opacity**, which also changes chat and other text backgrounds.
- **Sharing the bar:** the ticker uses the bar above the hotbar, like other packs' short notes. It waits while one is showing (packs that send `realm:actionbar`, such as Mob Health and the Elytra HUD while you glide) and redraws right after. With the [Coordinates HUD](#coordinates-hud--hud_bp) on, the ticker is a second line under your coordinates instead, so the two don't take turns.
- It updates once a second and resends an unchanged line every 2 seconds, so it doesn't fade.

### Commands

| Command | Who | What it does |
|---|---|---|
| `/realm:stats` | Everyone | Opens **Realm Stats**: **My stats** (every stat with your rank `#2 of 7`, plus first-joined date), **Leaderboards** (pick a stat to see the top 10, `leaderboardSize`, with your own position underneath if you're outside it), **Stats ticker** (shows or hides yours), **My ticker settings** (which stats, seconds per stat, style and colors). Operators also get **Sidebar (everyone)** |
| `/realm:stats_ticker` | Everyone | Shows or hides your own stats above the hotbar (default hidden, `tickerDefaultOn`). Remembered between sessions. Says so when an operator has disabled the ticker for the realm (`tickerEnabled`) |
| `/realm:stats_sidebar <stat>` | Ops | Shows a stat on everyone's sidebar. `<stat>` is a stat ID, **`cycle`** (rotates through the chosen stats every 30 seconds, `sidebarCycleSeconds`, `sidebarStats`) or **`off`** (hides it). The same setting as **Sidebar (everyone)** |

### Configuration (`scripts/config.js` → `CONFIG`)

| Option | Default | Description |
|---|---|---|
| `afkTag` | `afk` | Playtime isn't counted while a player has this tag. Must match the AFK pack's `tag`. `""` = always count |
| `leaderboardSize` | `10` | Number of players on a leaderboard |
| `sidebar` | `off` | What everyone's sidebar shows until an operator chooses: `off`, `cycle` or a stat ID |
| `sidebarCycleSeconds` | `30` | Seconds per stat in `cycle` mode |
| `sidebarStats` | every stat | The stats the sidebar rotates through in `cycle` mode |
| `tickerEnabled` | `true` | The stats ticker for the whole realm. Disabled: nobody sees it, whatever they chose |
| `tickerDefaultOn` | `false` | Show the ticker to players who never chose |
| `tickerMode` | `cycle` | What players start with: `cycle` (one stat at a time) or `all` (every chosen stat on one line) |
| `tickerSeconds` | `5` | What players start with: seconds per stat in `cycle` mode (2 to 60 in game) |
| `tickerStyle` | `full` | What players start with: `full` (name, value and rank) or `compact` (short name and value) |
| `tickerLabelColor` | `gray` | What players start with: the color of the stat names. One of `white`, `gray`, `dark_gray`, `gold`, `yellow`, `green`, `aqua`, `blue`, `light_purple`, `red` |
| `tickerValueColor` | `white` | What players start with: the color of the numbers (same colors) |
| `tickerStats` | `playtime`, `deaths`, `mobkills`, `mined`, `travelled` | What players start with: the stats the ticker shows |
| `maxSpeed` | `100` | Faster movement (blocks/s) counts as a teleport and isn't added to distance |

Operators can change every option except `afkTag` and `maxSpeed` in game with `/realm:config` (28 settings; `sidebarStats` and `tickerStats` as one switch per stat, such as **Sidebar rotation includes Deaths** and **Ticker shows Deaths (players start with)**). A new cycle length applies from the next second. Each player chooses their own ticker (on or off, mode, seconds, style, both colors and a switch per stat: 15 preferences) in `/realm:prefs` or **My ticker settings**; a player who never chose follows the realm's value, including later changes to it.

### Saved data

| Key | Scope | Contents |
|---|---|---|
| `stats_playtime`, `stats_deaths`, `stats_mobkills`, `stats_pvpkills`, `stats_mined`, `stats_placed`, `stats_travelled`, `stats_flown`, `stats_joins` | World scoreboard | The stats, one participant per player name. **Kept** when switching between the individual pack and a bundle |
| `stats:sidebar` | World | Current sidebar choice (`<stat>`, `cycle` or `off`) when it differs from `sidebar`. Set by `/realm:stats_sidebar`, **Sidebar (everyone)** and `/realm:config` |
| `stats:firstJoin` | Player | First join time (ms since epoch) |
| `stats:pref` | Player | JSON of the player's ticker choices that differ from the realm's |
| `stats:cfg` | World | Settings changed in `/realm:config` |

### How it works

- The sidebar is a scoreboard display slot, which Bedrock has one of per world: everyone sees the same sidebar, and scripts can't hide it for one player. That's why the per-player display is the ticker on the bar above the hotbar (`onScreenDisplay.setActionBar`), which is each player's own.
- Once a second the pack builds each ticker from the player's scores (and ranks, in the full style). While the [Coordinates HUD](#coordinates-hud--hud_bp) is on for that player, it sends the line to the HUD with the script event `realm:hud_line` (`{"player":"<id>","key":"stats","text":"...","ticks":80}`) instead of drawing it; the HUD says who sees it with `realm:hud_state`. The packs don't import each other: without the HUD, the ticker draws on its own.

### Resetting stats

Use vanilla commands (cheats needed):

- `/scoreboard players reset * stats_deaths` resets one stat for everyone.
- `/scoreboard players reset "Steve" stats_deaths` resets it for one player.
- `/scoreboard objectives remove stats_deaths` removes the stat entirely.

 The pack recreates missing objectives automatically.

---

## Realm News & Tips — `news_bp`

A news popup with what changed in the latest update (written automatically for every bundle, from `docs/NEWS.md`), or news operators edit in game, a "welcome back" notice, and rotating chat tips.

### How to use

1. After the realm's packs are updated, the update's news pops up once for everyone: what's new, written for players. Operators don't type it: it comes with the packs (`releaseNews`).
2. When there's news, it pops up about 5 seconds after you join, after the welcome popup. Tap `Got it` to close it. If you're online when it's posted, chat says `Realm news updated. Run /realm:news to read it.`
3. Missed it, or want to read it again? Run `/realm:news` (or `/realm:news_read`).
4. Tips appear in chat every 20 minutes while someone is online, starting with `[Tip]`.
5. **Operators:** `/realm:news` opens the **Realm News & Tips** menu instead: `Read the news`, `Edit the news`, `Paste a long news body` (how to use the chat commands below), `Chat tips` and `Settings` (which points to `/realm:config` → Realm News & Tips). `/realm:news_edit` writes the news. Minecraft's text boxes hold only 100 characters each, so the body is split over at least 10 boxes (1,000 characters) that are joined in order with nothing between them; type `\n` for a new line. Easier for a long message: paste it into chat as `/realm:news_body "<text>"`, with `|` for each new line, and the editor opens with every box filled in; check the title and tap **Save**. Chat has a length limit too, so for a message longer than one paste, paste it in parts: the first part with `/realm:news_body` (close the editor that opens, or just keep chat open), each next part with `/realm:news_add "<text>"`, then run `/realm:news_edit` to check and save the whole draft. Parts are joined exactly as pasted, so end a part on a space or start the next one with one. Leave "Pop up for everyone on their next join" on to announce it, or turn it off for a quiet fix such as a typo. `/realm:news_tips` adds, edits or deletes tips, posts the next one now, changes how often they're posted (5 to 120 minutes) or turns them off.

### News popup

- **Release news:** the pack carries `scripts/release.js`, generated by `node tools/gen-news.mjs` (which `npm run bundle` runs) from the newest `## ` entry of `docs/NEWS.md`. When the world loads (or a player joins) with a release id it hasn't posted (`news:release`), that entry becomes the news and pops up once for everyone, like news saved with the pop-up toggle. Operators can still write news in game; the next update's release news replaces it. `releaseNews` `false` turns this off.
- When an op saves news with **"Pop up for everyone on their next join"** checked, every player sees it **once** on their next join, and everyone online gets `Realm news updated. Run /realm:news to read it.` in chat. Reading it with `/realm:news` counts, so a player who already read it isn't shown the popup again.
- The popup is timed after the welcome popup (`delayTicks` = 5 s). If another popup is still open, it waits up to about 90 s.
- If it still can't show, chat says `There's new Realm news! Run /realm:news to read it.` (on the same line after the "welcome back" notice, if there is one), and the player sees the popup on their next join instead.
- Saving **unchecked** is a quiet edit (e.g. a typo fix). Players who already saw the news don't see it again.
- An empty body means no news.

### "Welcome back"

Players returning after at least `awayNoticeHours` (12 h) get `Welcome back! You were away 3d 5h.` It appears at the top of the news popup if there's unseen news, otherwise in chat. Last-seen time is refreshed every minute while online.

### Tips

- A tip from the list is posted in chat every `tipIntervalMinutes` (20), as `[Tip] …` (`tipPrefix`), only while someone is online.
- The default tips cover the realm's other add-ons (tree felling, vein mining, the Waypoint Menu) and these packs (`/realm:stats`, `/realm:afk`, `/realm:help`, the Quick Stack & Sort sneak-tap, `/realm:find`, `/realm:prefs`, `/realm:mail`, `/realm:quests` and `/realm:nick`). A world that already saved its own tips keeps them; add the new ones with `/realm:news_tips`.
- A tip holds up to 100 characters, the most Minecraft's text box takes. If another operator changes or deletes a tip while you edit it, saving says `That tip was changed or deleted meanwhile, so nothing was saved.`
- Opening **+ Add a tip** and saving it empty changes nothing. Only a real change saves the list, and from then on the saved list is used instead of `config.js`.

### Commands

| Command | Who | What it does |
|---|---|---|
| `/realm:news` | Everyone | Shows the current news, like `/realm:news_read`. Operators get the **Realm News & Tips** menu instead: read, edit, paste a long body, chat tips and `Settings` |
| `/realm:news_read` | Everyone | Shows the current news, which also counts as having seen its popup |
| `/realm:news_edit` | Ops | Editor: title, the body in 100-character parts (at least 10, joined in order), and the "pop up on next join" toggle. If you have a draft from `/realm:news_body` or `/realm:news_add`, it shows the draft instead of the saved news, with a toggle to discard it. **Save** saves the news and clears the draft; closing the editor keeps the draft. If chat stays open for about 20 s, it says it couldn't open |
| `/realm:news_body "<text>"` | Ops | Starts a news draft from pasted text (chat takes more than a form's 100-character boxes) and opens the editor with it split over the boxes. Put the text in double quotes, use `|` for new lines (chat drops the backslash of `\n`), and `'` rather than `"` inside it |
| `/realm:news_add "<text>"` | Ops | Adds pasted text to the end of your draft, for news longer than chat lets you paste at once. Doesn't open the editor; it says how long the draft is now (10,000 characters at most). `|` is a new line here too |
| `/realm:news_tips` | Ops | Tips menu: **+ Add a tip**, **Settings** (on/off, interval 5–120 min in steps of 5), **Post the next tip now**, or tap a tip to edit or delete it |

### Configuration (`scripts/config.js`)

`DEFAULTS` are starting values that ops can change in-game. Of the `CONFIG` options, `awayNoticeHours` is in `/realm:config`; the others can only be changed in the file.

| Option | Default | In-game? | Description |
|---|---|---|---|
| `news.title` | `§l§bRealm News` | ✅ `/realm:news_edit` | News popup title |
| `news.body` | *(empty)* | ✅ `/realm:news_edit` | News text. Empty = no news |
| `tips` | 12 tips about the realm's add-ons and commands | ✅ `/realm:news_tips` | Starting tip list |
| `tipIntervalMinutes` | `20` | ✅ `/realm:news_tips` → Settings, or `/realm:config` | Minutes between tips |
| `tipsEnabled` | `true` | ✅ `/realm:news_tips` → Settings, or `/realm:config` | Post tips at all |
| `delayTicks` | `100` | ❌ | Ticks after joining before showing the news (after the welcome popup's `40`) |
| `awayNoticeHours` | `12` | ✅ `/realm:config` | Minimum time away for the welcome-back notice. `0` = never |
| `tipPrefix` | `§b[Tip]§r ` | ❌ | Text before each tip in chat |
| `releaseNews` | `true` | ❌ | Post each update's release news (`scripts/release.js`, from `docs/NEWS.md`) once, as news that pops up for everyone |

### Saved data

| Key | Scope | Contents |
|---|---|---|
| `news:news` | World | JSON `{ title, body }` |
| `news:revision` | World | Increases on each announced save |
| `news:release` | World | Id of the release news last posted, so each update's news pops up once |
| `news:tips` | World | JSON list of tips, once edited in-game |
| `news:tipSettings` | World | JSON `{ enabled, intervalMinutes }`, from `/realm:news_tips` or `/realm:config` |
| `news:cfg` | World | Other settings changed in `/realm:config` (`awayNoticeHours`) |
| `news:seen` | Player | Last revision the player saw |
| `news:lastSeen` | Player | Last time online (ms since epoch) |
| `news:draft` | Player | Unsaved news body from `/realm:news_body` and `/realm:news_add`, until it's saved or discarded in the editor |

---

## Creeper Guard — `guard_bp`

Creepers still hurt, but their explosions break no blocks, so nobody comes home to a crater. TNT is left alone.

### How to use

1. Nothing to set up: a creeper that explodes still damages and knocks back players and mobs, but the ground and your builds stay intact.
2. Run `/realm:guard` for the menu: it shows whether you stand in a protected spot, the mode, which blasts are covered and any protected zones, and **Status** posts the same in chat (like `/realm:guard_status`). With [Safe Zones](#safe-zones--zones_bp) installed, **Safe zones** opens its menu.
3. **Operators:** to keep creeper craters in the wild and protect only bases, set the mode to `zones` in `/realm:config` (or `mode` in `config.js`), then stand in a base and pick **Protect this spot** in `/realm:guard` (a name and a radius), or run `/realm:guard_add <name> [radius]` (for example `/realm:guard_add home 64`). **Remove a zone** or `/realm:guard_remove <name>` removes one. In `zones` mode, safe zones from [Safe Zones](#safe-zones--zones_bp), and towns and claims protected from world events, are protected too (`safeZones`).

### What players see

- **`everywhere` mode (default):** every blast from a listed source (`sources`, creepers by default) hurts and knocks back as usual but breaks no blocks.
- **`zones` mode:** blocks inside a zone are kept; the rest of the blast breaks blocks as in vanilla. A creeper at the edge of a zone breaks only the part of its crater that lies outside. With `safeZones` (default enabled), every safe zone counts as a zone too: [Safe Zones](#safe-zones--zones_bp), and towns and claims protected from world events, top to bottom. **Status** then says `Where you stand: protected (safe zone Home)`.
- Charged creepers are covered too. TNT, beds in the Nether or End, respawn anchors and end crystals are never touched, because they aren't listed (beds and anchors have no source entity at all).
- Unlike the `mobGriefing` gamerule, this changes nothing else: villagers still farm, sheep still eat grass (the Wool Farm guide needs that) and endermen still pick up blocks.

### Commands

| Command | Who | What it does |
|---|---|---|
| `/realm:guard` | Everyone | Opens the Creeper Guard menu: **Status**, and for operators **Protect this spot** (a zone around you: a name and a radius, 8–256, default 64, `defaultRadius`) and **Remove a zone**; **Safe zones** when Safe Zones is installed |
| `/realm:guard_status` | Everyone | Shows whether the spot you're standing on is protected (and by which zone or safe zone), then the mode, the covered blast sources and the zones |
| `/realm:guard_add <name> [radius]` | Ops | Protects a sphere around you, `radius` 8–256 blocks (default 64, `defaultRadius`). Names use letters, digits, `_` and `-`, up to 24, and must be unique whatever their case (`home` and `Home` are the same zone). Only matters in `zones` mode |
| `/realm:guard_remove <name>` | Ops | Removes a zone (any case) |

### Configuration (`scripts/config.js` → `CONFIG`)

| Option | Default | Description |
|---|---|---|
| `mode` | `everywhere` | `everywhere`: listed blasts never break blocks. `zones`: only inside the zones from `/realm:guard_add` (and safe zones, with `safeZones`) |
| `safeZones` | `true` | In `zones` mode, safe zones count as zones too: Safe Zones, and towns and claims protected from world events |
| `sources` | `["minecraft:creeper"]` | Exploding entity types to neutralize. Add `minecraft:fireball` (ghast fireballs) or `minecraft:wither_skull` if wanted |
| `defaultRadius` | `64` | Zone radius in blocks when `/realm:guard_add` is given none |

Operators can change `mode`, `safeZones` and `defaultRadius` in game with `/realm:config`; a new mode applies to the next explosion. `sources` stays in `config.js`.

### Saved data

| Key | Scope | Contents |
|---|---|---|
| `guard:zones` | World | JSON list of zones `{ name, dim, x, y, z, radius }`, up to 100 |
| `guard:cfg` | World | Settings changed in `/realm:config` |

### How it works

The pack listens to `world.beforeEvents.explosion`. When the exploding entity's type is in `sources`, it empties the list of blocks the blast will break (`everywhere`), or drops the blocks inside a zone from it (`zones`). It never cancels the explosion, which would also remove the damage and drops. Safe zones come from the safe zones protocol (`realm:zones`, see [How the packs work together](#how-the-packs-work-together)), kept in memory.

---

## Phantom Opt-out — `phantom_bp`

Lets each player disable phantoms for themselves. Phantoms come from not sleeping, and with smart sleep the night can be skipped without everyone in bed, so some players never need to sleep.

### How to use

1. Run `/realm:phantoms`, or disable **Phantoms near me** in `/realm:prefs`. Chat says `Phantoms near you: Disabled. Run /realm:phantoms again to enable them.` The choice is remembered.
2. Phantoms that spawn for you now vanish the moment they appear, with no drops. Everyone else's phantoms are untouched.
3. Run `/realm:phantoms` again to get them back (for phantom membranes, say).

### What players see

- Bedrock spawns phantoms at night, in small groups high above a player who hasn't slept for 3 or more in-game days. When the nearest player to a new phantom has phantoms off, and the phantom appeared at least `minHeightAbovePlayer` (10) blocks above them, it is removed on the spot.
- Every phantom in a group is checked the same way. If two players stand close together, only the nearest one's choice counts. Players in creative or spectator are skipped when looking for the nearest player, since phantoms never come for them.
- Phantoms from spawn eggs or `/summon` near a player are left alone, because they don't appear high overhead.
- Turning phantoms off doesn't reset the game's own "time since rest" counter. A player who turns them back on without sleeping may get phantoms that same night.

### Commands

| Command | Who | What it does |
|---|---|---|
| `/realm:phantoms` | Everyone | Enables or disables phantoms **for yourself**. Remembered between sessions |

### Configuration (`scripts/config.js` → `CONFIG`)

| Option | Default | Description |
|---|---|---|
| `defaultOff` | `false` | Start with phantoms off for players who never ran `/realm:phantoms` |
| `minHeightAbovePlayer` | `10` | Only remove phantoms that appear at least this many blocks above their nearest player, as natural spawns do |
| `searchRadius` | `64` | How far (blocks) to look for a new phantom's nearest player. Phantoms with no player this close are left alone |

Operators can change `defaultOff` in game with `/realm:config`. Players whose own choice differs from the realm's keep it.

### Saved data

| Key | Scope | Contents |
|---|---|---|
| `phantom:off` | Player | `true` when the player turned phantoms off, `false` when they turned them back on while `defaultOff` is `true`. Not set = `defaultOff`. Set by `/realm:phantoms` and `/realm:prefs` |
| `phantom:cfg` | World | Settings changed in `/realm:config` |

---

## Right-click Harvest — `harvest_bp`

Tap a ripe crop to harvest it and replant it in one go, so fields never need re-seeding.

### How to use

1. Tap (use) a fully grown crop with an empty hand or a hoe. It pops its normal drops and goes back to a seedling, with the break sound.
2. Unripe crops behave as in vanilla, and so does anything else in your hand: seeds still plant, bone meal still grows.
3. Sneak while tapping to skip the harvest for that tap.

### Crops

| Crop | Block id | Ripe when |
|---|---|---|
| Wheat | `minecraft:wheat` | `growth` = 7 |
| Carrots | `minecraft:carrots` | `growth` = 7 |
| Potatoes | `minecraft:potatoes` | `growth` = 7 |
| Beetroots | `minecraft:beetroot` | `growth` = 7 |
| Nether wart | `minecraft:nether_wart` | `age` = 3 |
| Cocoa | `minecraft:cocoa` | `age` = 2 (keeps the direction it faces) |

### What players see

- Drops come from the block's own Bedrock loot table, as if you had broken it with what's in your hand, so the counts match vanilla and a Fortune hoe raises carrot, potato and other yields.
- Only one harvest per tap. Holding the button down doesn't sweep a field.
- With `replantCostsSeed` on and no seed to spare, the bar above the hotbar says `No seed to replant it` and the spot is left empty.
- Villager farmers are unaffected, and a farm guide's water-flush harvest still works on the same field.
- Harvests don't count as **Blocks mined** in the Stats pack, because no block is broken.
- Where a tap is blocked, nothing is harvested: in someone else's [Land Claims](#land-claims--claims_bp) claim, and in adventure mode (which can't break blocks either).

### Configuration (`scripts/config.js` → `CONFIG`)

| Option | Default | Description |
|---|---|---|
| `crops` | the table above | Which blocks harvest: `block`, the growth `state`, its `ripe` value, the `seed` item a replant uses and the harvest `sound` |
| `requireHoe` | `false` | Only harvest when a hoe is held |
| `damageHoe` | `false` | A held hoe loses one durability per harvest (Unbreaking applies, and the hoe can break; never in creative) |
| `replantCostsSeed` | `false` | The replant uses one seed (or carrot, potato, wart, cocoa bean): from the drops, else from your inventory. With none, the crop is harvested and not replanted |

Operators can change `requireHoe`, `damageHoe` and `replantCostsSeed` in game with `/realm:config`; they apply to the next harvest. `crops` stays in `config.js`.

### Saved data

| Key | Scope | Contents |
|---|---|---|
| `harvest:cfg` | World | Settings changed in `/realm:config` |

### How it works

`world.beforeEvents.playerInteractWithBlock` cancels the tap when no other pack canceled it already, it is the first event of the press, the player isn't sneaking or in adventure mode, the hand is empty or holds a `*_hoe`, and the block is a listed crop at its ripe value. On the next tick the pack runs `loot spawn <center> mine <block> mainhand` as the player, then sets the crop's state back to 0. If `/loot` fails for a harvest, that harvest drops from a built-in table close to vanilla (without Fortune), and the first failure logs `[harvest] /loot failed`.

---

## Farm Loader — `farm_bp`

Keeps named farms loaded with Bedrock ticking areas, so crops grow, furnaces smelt and redstone runs while everyone is elsewhere.

### How to use

1. Run `/realm:farm` to open the **Farm Loader** menu: it lists which farms are kept loaded (name, dimension, coordinates, size, who added it and when).
2. **Operators:** stand in the middle of a farm, run `/realm:farm` and tap `Add a farm here`: type a name and pick the radius (1 to 4 chunks). Or run `/realm:farm_add <name> [radius]`, for example `/realm:farm_add kelp 2`. The chunks within that many chunks of you stay loaded, and chat confirms `Farm "kelp" stays loaded (radius 2 chunks, 3/10 used)`.
3. **Operators:** tap `Remove <name>` in `/realm:farm` and confirm with `Remove` (the menu comes back afterwards, so you can remove another), or run `/realm:farm_remove <name>`. The menu's `Settings` button points to `/realm:config` → Farm Loader.

### What keeps running, and what doesn't

Bedrock rules, worth knowing before you add a farm:

- **Keeps running:** random ticks (crops, kelp, sugar cane, bamboo, cactus and trees grow), furnaces, smokers and blast furnaces, hoppers, redstone, pistons, observers and flowing water.
- **Doesn't:** mob spawning. Mobs only spawn near a player, so iron farms, mob farms and the slime farm still need someone nearby.
- **Costs performance:** every loaded chunk costs the realm. A radius of 2 chunks covers a circle about 5 chunks (80 blocks) across. Bedrock allows 10 ticking areas per world, and the pack refuses an 11th before the game does.
- The game keeps the ticking areas across realm restarts by itself. The pack only keeps the list for the menu.

### Commands

| Command | Who | What it does |
|---|---|---|
| `/realm:farm` | Everyone | The **Farm Loader** menu: lists the loaded farms. Operators (everyone, with `everyoneCanAdd`) also get `Add a farm here` (a name and a radius, like `/realm:farm_add`) and a `Remove <name>` button for each farm; operators also get `Settings` |
| `/realm:farm_add <name> [radius]` | Ops (everyone if `everyoneCanAdd`) | Adds a ticking area centered on you, `radius` 1–4 chunks (default 2, `defaultRadius`). Names use letters, digits, `_` and `-`, up to 24, and must be unique |
| `/realm:farm_remove <name>` | Ops (everyone if `everyoneCanAdd`) | Stops keeping the farm loaded and removes it from the list |

### Configuration (`scripts/config.js` → `CONFIG`)

| Option | Default | Description |
|---|---|---|
| `everyoneCanAdd` | `false` | Let everyone add and remove farms, not just operators |
| `defaultRadius` | `2` | Radius in chunks when `/realm:farm_add` is given none |
| `maxAreas` | `10` | Most farms at once. Bedrock's limit is 10 ticking areas per world, including any made with `/tickingarea` by hand |

Operators can change `defaultRadius` and `maxAreas` in game with `/realm:config`. `everyoneCanAdd` sets who may run the commands, which is fixed when the world starts, so `/realm:config` only shows it.

### Saved data

| Key | Scope | Contents |
|---|---|---|
| `farm:areas` | World | JSON list of farms `{ name, dim, x, z, radius, by, at }` for the menu. The ticking areas themselves are saved by the game |
| `farm:cfg` | World | Settings changed in `/realm:config` |

### How it works

`/realm:farm_add` runs `tickingarea add circle <x> <y> <z> <radius> "<name>" true` in your dimension. If the game reports no success (for example, the world already has 10 ticking areas), the pack says so and saves nothing. `/realm:farm_remove` runs `tickingarea remove "<name>"`. A ticking area removed by hand with `/tickingarea remove` stays in the menu until it is removed there too.

---

## Quick Stack & Sort — `stash_bp`

Sneak-tap any chest, barrel or shulker box for a menu: sort it, lock it, quick stack into the storage that already holds each item (like Terraria), or sort your inventory.

### How to use

1. **Open the menu:** sneak and tap a chest, trapped chest, copper chest, barrel, shulker box or ender chest with an empty hand, or holding a tool, weapon or armor. It doesn't open; a **Quick Stack & Sort** menu does, with these buttons:
   - **Sort this chest** (or barrel, shulker box…): its stacks merge and sort, and the bar above the hotbar says `Sorted 31 stacks`.
   - **Lock this chest:** only you can open, sort or break it. Once it's yours, the button reads **Share or unlock**: share it with players who are online, stop sharing, or unlock it.
   - **Quick stack my inventory:** the same as `/realm:stash`, below.
   - **Sort my inventory:** the same as `/realm:sort`, below.
2. **Quick stack:** stand near your storage and run `/realm:stash`. Every item in your main inventory goes into a chest, copper chest or barrel within 8 blocks that already holds the same item. Your gear, shulker boxes, bundles, totems, maps and compasses stay with you. The bar says `Stashed 143 items into 3 chests`, and each container that got something sparkles.
3. **Sort your inventory:** run `/realm:sort`. Your main inventory is sorted; the hotbar stays as it is.
4. **Your way:** in `/realm:prefs`, choose what sneak-tapping a container does for you (**When I sneak-tap a container**: `Open the menu`, `Sort it right away` or `Nothing (opens as usual)`), and whether sorting your inventory includes your hotbar.
5. **Help:** run `/realm:stash_help` for a page that explains the menu, chest locks and every command with its usage. `/help realm:stash` and `/help realm:sort` also describe them.
6. **Operators:** sneak-tap someone else's locked container for **Remove the lock (operator)**. To switch chest locks off for the realm, disable **Chest locks** in `/realm:config` (existing locks are kept for when they're enabled again).

### What players see

- **The menu** shows how full the container is and how full your inventory is (`Barrel - 18 of 27 slots used`, `Your inventory - 22 of 27 slots used`), then the three buttons. Close it to do nothing. Holding anything other than gear (a block, a hopper, honeycomb) skips the menu, so sneak-placing a hopper on a chest or waxing a copper chest works as usual. To scrape a copper chest with an axe, don't sneak.
- **Ender chests** get the menu without **Sort this**: add-ons can't see inside an ender chest, so it can't be sorted or stashed into.
- **Sorting** merges partial stacks of the same item, then orders the slots by item id, the biggest stack first, with empty slots at the end. A chest with 3 partial stacks of cobblestone ends with 1 full stack plus the rest.
- Items with a custom name, lore or enchantments are never merged, only moved, and moving keeps every item exactly as it was: enchanted gear, named items, written books, filled maps, banners and shulker boxes with their contents.
- `/realm:stash` only takes from your main inventory (slots 9–35): never the hotbar, armor or offhand. It also leaves you your gear (anything with durability: tools, weapons, armor, elytra; `stashGear`), named items (`stashNamedItems`) and everything in `keepItems`: shulker boxes, bundles, the totem of undying, filled maps, compasses and clocks. A container that holds the item gets matching stacks topped up first, then its empty slots, nearest container first.
- **What receives stashes:** chests, trapped chests, copper chests and barrels (`stashTypes`). Placed shulker boxes don't: they're a kit you pick up and carry, so they only get the menu and sorting.
- Double chests (copper ones too) count once. Ender chests never receive anything. Containers in chunks that aren't loaded are never touched. Another player having the chest open is fine.
- Each player can sort or stash once per second (`cooldownTicks`). A menu button pressed sooner says `Too fast. Try again in a moment.`

#### Chest locks

- **Locking** (`locks`, enabled): the menu's **Lock this chest** (or barrel, copper chest, shulker box…) locks it to you; the bar says `Locked: only you can open this chest`. Both halves of a double chest are locked, and a chest added next to a locked one later is locked with it.
- **Someone else's locked container** doesn't open for anyone else: they see `Locked by Sam` above the hotbar. Their sneak-tap menu shows `Chest: locked by Sam.` with only the inventory buttons. They can't break it, `/realm:stash` never puts anything in it, and nobody else can place a hopper or a chest right next to it (a hopper could drain it; a chest could join it into a double chest).
- **Sharing:** **Share or unlock** lists the players online now (up to 10 per container, `maxShared`); a shared player can open, sort and break it like you, and sees `Locked by Sam, shared with Alex` in the menu. The same menu stops sharing or unlocks it.
- Explosions never break a locked container; the blast still hurts as usual.
- Each player can have up to 50 locked containers (`maxLocks`); a double chest counts once.
- Breaking a locked container (you can, as its owner) removes its lock. Breaking one half of a locked double chest leaves the other half locked, and it still counts once toward `maxLocks`.
- **What a lock can't stop:** a hopper (or hopper minecart) that was already under it before it was locked, a copper golem that takes from a locked copper chest, and pistons. Chest Finder still points to a locked chest that holds what you search for; it can't open it.
- Locks only show in the sneak-tap menu, so a player who chose `Sort it right away` or `Nothing (opens as usual)` for the sneak-tap in `/realm:prefs` locks nothing until they switch back to `Open the menu`. Their own locks still hold.

### Commands

| Command | Who | What it does |
|---|---|---|
| `/realm:stash` | Everyone | Quick stack: puts your main inventory into chests and barrels within 8 blocks that already hold the same items, keeping your gear and carried items. Same as the menu's **Quick stack my inventory** |
| `/realm:sort` | Everyone | Sorts your inventory, slots 9–35. The hotbar is untouched, unless you turned that on in `/realm:prefs` (default off, `sortHotbar`). Same as the menu's **Sort my inventory** |
| `/realm:stash_help` | Everyone | Opens the help page: the sneak-tap menu, then each command with its usage and what it never touches |

None of them take parameters. The help page follows the settings in force, yours from `/realm:prefs` included; the `/help` description of `/realm:stash` follows `stashRadius` in `config.js`.

### Configuration (`scripts/config.js` → `CONFIG`)

| Option | Default | Description |
|---|---|---|
| `stashRadius` | `8` | Blocks around the player to look for containers (a 17 × 17 × 17 cube) |
| `containerTypes` | chest, trapped chest, copper chest (all 8: every stage, waxed or not), barrel, placed shulker boxes (all 17 colors) | Block ids that get the sneak-tap menu and can be sorted. Ender chests get the menu regardless and are never sorted or stashed into |
| `stashTypes` | chest, trapped chest, copper chest (all 8), barrel | Block ids that receive `/realm:stash`. Ids this game version doesn't have are skipped. Shulker boxes are left out on purpose |
| `sneakTap` | `"menu"` | What sneak-tapping a container with an empty hand or gear in it does: `"menu"` opens the menu, `"sort"` sorts it right away (no menu, no ender chests), `"off"` does nothing so it opens as usual. With `"menu"` or `"sort"`, sneak-tapping never opens it |
| `stashNamedItems` | `false` | `/realm:stash` also moves items with a custom name |
| `stashGear` | `false` | `/realm:stash` also moves gear: anything with durability (tools, weapons, armor, elytra, shields…) |
| `keepItems` | shulker boxes (17), bundles (17), `totem_of_undying`, `filled_map`, `compass`, `lodestone_compass`, `recovery_compass`, `clock` | Item ids `/realm:stash` never moves |
| `sortHotbar` | `false` | `/realm:sort` and the menu's **Sort my inventory** also sort the hotbar |
| `cooldownTicks` | `20` | Minimum time between sorts and stashes per player (20 = 1 s). Opening the menu, the help page or a lock button doesn't count |
| `locks` | `true` | Chest locks: the sneak-tap menu's **Lock this chest**. Disabled: no lock buttons and no lock is enforced; the locks are kept and apply again once it's enabled |
| `maxLocks` | `50` | Most containers one player can have locked at a time (a double chest counts once) |
| `maxShared` | `10` | Most players one locked container can be shared with |

Operators can change `sneakTap`, `sortHotbar`, `stashGear`, `stashNamedItems`, `cooldownTicks`, `locks` and `maxLocks` in game with `/realm:config`. Each player can choose their own `sneakTap` and `sortHotbar` in `/realm:prefs`, which wins over the realm's for them. `stashRadius` and the lists stay in `config.js`.

### Saved data

| Key | Scope | Contents |
|---|---|---|
| `stash:cfg` | World | Settings changed in `/realm:config` |
| `stash:pref` | Player | JSON of the player's own `sneakTap` and `sortHotbar` from `/realm:prefs` |
| `stash:lock:<dimension>:<x>,<y>,<z>` | World | One per locked block (both halves of a double chest): JSON `{ o, n, s, h? }`, the owner's id and name, the players it's shared with (`[{ i, n }]`), and `h: 1` on a double chest's second half so it counts once |

### How it works

- **Menu:** `world.beforeEvents.playerInteractWithBlock` cancels the tap when the player is sneaking, the hand is empty or holds an item with a `minecraft:durability` component, and the block is a listed container or an ender chest. On the next tick an `ActionFormData` from `@minecraft/server-ui` shows the menu; a player can have one open at a time. The chosen action re-reads the block, so a container broken while the menu was open is left alone.
- **Sort:** stacks are merged by changing the amount of the slot that stays (`ContainerSlot.amount`) and ordered with `swapItems`. Both are native moves, so no item is ever copied or re-created and nothing about it can be lost.
- **Stash:** one `dimension.getBlocks` query finds the `stashTypes` containers in the cube (loaded chunks only), and they are read a few per tick with `system.runJob`. Each main-inventory slot is then moved with `transferItem` into the nearest container holding that item, then the next.
- When both halves of a double chest report the whole 54 slots, the second half is recognized (same kind of chest, same contents, same facing, side by side; in a row of identical chests, counted from the row's end) and skipped. Copper chests of different stages count as the same kind.
- If `transferItem` ever hands a leftover back instead of leaving it in the slot, the pack puts it back, so nothing is lost.
- **Locks:** every lock is read into memory once and kept in step as it changes. `beforeEvents.playerInteractWithBlock` cancels opening someone else's locked container, and tapping a block with a hopper or chest in hand when the spot it would go is next to one (the stable API has no "before place" event, and placing starts with that tap). `beforeEvents.playerBreakBlock` cancels breaking it, and `beforeEvents.explosion` takes locked blocks out of the blast. A double chest's other half is found the same way as for stashing. A lock left where its block is gone some other way (a piston, a command) is removed when something is placed there.
- Messages above the hotbar send `realm:actionbar` first, so the [Coordinates HUD](#coordinates-hud--hud_bp) leaves them on screen for a moment.

---

## Chest Finder — `find_bp`

Answers "which chest has the iron?" for a shared base: it remembers what each container held the last time anyone opened it, and points you to it.

### How to use

1. Open chests as usual. The pack quietly remembers what's in them.
2. Run `/realm:find iron`, or just `/realm:find` while holding the item. A menu lists the containers that have it, nearest first, for example `Chest - 23 Iron Ingot` with `35 blocks NE - seen 2h ago` under it.
3. Tap a result: a column of particles marks that container for 10 seconds. Only you see it, and chat gives its coordinates. Marking another container replaces the first mark. A container in another dimension only gets its coordinates in chat.

### What players see

- **Matching:** the item id first. `/realm:find diamond` finds diamonds only, because an item is called exactly that. When nothing is called exactly what you typed, every item whose id contains it is listed: `/realm:find iron` finds iron ingots, iron blocks, raw iron, iron swords and so on. Type one word, or use `_` for a space: `/realm:find iron_ingot` (or quote it: `/realm:find "iron ingot"`).
- **Always current nearby:** containers within `liveScanRadius` (16 blocks) are read at search time, so a chest filled by hoppers that nobody ever opened is still found. Farther ones show what they held when last seen, hence `seen 2h ago`: hoppers and the copper golem sorter may have changed them since.
- Results in your dimension are sorted by distance; containers in other dimensions are listed after them, without a distance.
- Copper chests count, in every stage, waxed or not, and the result names the exact one (`Waxed Oxidized Copper Chest`), which helps tell them apart.
- A double chest (copper ones too) is listed once. A broken container disappears from the results. One that was removed some other way (an explosion, say) disappears the next time a search finds its spot loaded and empty.
- Only containers and their contents are remembered, never who opened them.

### Commands

| Command | Who | What it does |
|---|---|---|
| `/realm:find [item]` | Everyone | Searches remembered and nearby containers for `item` (any part of an item id), or for the item in your hand if you leave it out |

### Configuration (`scripts/config.js` → `CONFIG`)

| Option | Default | Description |
|---|---|---|
| `liveScanRadius` | `16` | Containers this close (blocks) are read live at search time, so nearby results are always current |
| `maxContainers` | `2000` | Most containers remembered; the ones seen longest ago are forgotten first |
| `maxResults` | `20` | Rows in the results menu |
| `highlightSeconds` | `10` | How long the particle column shows |
| `containerTypes` | chest, trapped chest, copper chest (all 8: every stage, waxed or not), barrel, placed shulker boxes (all 17 colors) | Block ids that are remembered and searched. Ids this game version doesn't have are skipped |

Operators can change `liveScanRadius`, `maxResults` and `highlightSeconds` in game with `/realm:config`; they apply to the next search.

### Saved data

| Key | Scope | Contents |
|---|---|---|
| `find:cfg` | World | Settings changed in `/realm:config` |
| `find:idx:0`, `find:idx:1`, … | World | The index as JSON shards under 30,000 characters each: `{ "<dimension>:<x>,<y>,<z>": { t: [[itemId, count], …], at: epochMs, b: blockId } }`, ids without the `minecraft:` prefix. Written at most once every 30 seconds, and whenever a player leaves |

### How it works

- **Remembering:** on `world.afterEvents.playerInteractWithBlock` with a listed container, its contents are counted per item id right away, again 10 seconds later, after the player has put things in or taken them out, and once more after a minute, for long sorting sessions. `playerBreakBlock` removes the entry. Empty containers aren't kept.
- **Searching:** one `dimension.getBlocks` query finds the containers within `liveScanRadius`, which are read a few per tick with `system.runJob`, then the whole index is matched in one pass and sorted by distance.
- **Double chests:** when both halves report the whole 54 slots, both are stored under the half with the smaller coordinates. Copper chests of different stages count as the same kind of chest. The halves are told apart from a neighboring double chest with the same contents by their facing and, in a row of identical chests, by counting from the row's end.

---

## Land Claims — `claims_bp`

Claim the land around your base so other players can't break, place or open anything there. **Off until an operator enables it**: until then `/realm:claim` only says so and nothing is protected.

### How to use

1. Once an operator has enabled land claims, stand in the middle of your base and run `/realm:claim`, then pick **Claim this land**. You get 33 × 33 blocks around you (default radius 16, `radius`), from the bottom of the world to the top, and green sparkles show its borders.
2. Inside it, only you and the players you share it with can break or place blocks, open chests, doors and furnaces, press buttons, pour buckets, or use armor stands and chest minecarts or boats. Anyone else sees `This land is claimed by Sam`.
3. **Share it:** `/realm:claim` → **My claim: 120, -340** → **Share with Alex** (players online now). The same menu stops sharing, shows its borders or removes the claim.
4. **Where are the borders?** `/realm:claim` → **Show claim borders** sparkles the edges of every claim near you for 10 seconds (asking again starts over). Walking in or out of one says `Entering Sam's claim` / `Leaving Sam's claim` above the hotbar.
5. Claims are safe zones for world events too: meteors, storm lightning and the other world-event packs break no blocks in them (see [Safe Zones](#safe-zones--zones_bp)).
6. **Operators:** enable it in `/realm:config` → **Land Claims** → **Land claims**, and set the claim size and how many each player gets there. `/realm:claim` → **All claims (operator)** lists every claim to remove any of them. **Protect claims from world events** (`protectWorldEvents`) turns the safe zone part off.

### What players see

- **While disabled** (`enabled`, disabled by default): `/realm:claim` answers `Land claims are disabled on this realm. An operator can enable them in /realm:config (Land Claims).` and nothing is protected. Disabling it later keeps every claim; they apply again once it's enabled.
- **The menu** says whose land you're on and how many claims you have (`You have 1 of 2 claims`), then **Claim this land** (when you're on unclaimed land and have one left), **Show claim borders**, one **My claim** button per claim, and for operators **All claims (operator)**.
- **Claiming** is refused with a reason when you already have 2 (`maxClaims`), or when the new square would overlap another claim (`That would overlap Sam's claim (-16, 48 to 16, 80). Move further away.`). A claim keeps the size it was made with when operators change `radius` later.
- **What's protected** from everyone who isn't the owner or shared: breaking and placing blocks, tapping any block (chests, doors, trapdoors, buttons, levers, beds, crafting tables, buckets), and using the entities in `protectedEntities`. A block placed from outside onto the edge of a claim is refused too; with an empty hand you can still open a door or chest just outside the border.
- **Explosions** break no blocks inside a claim (`protectExplosions`), whatever caused them; the damage is unchanged, and the part of the blast outside the claim breaks blocks as usual.
- **World events** (`protectWorldEvents`, default enabled): every claim is a safe zone, so no meteor crater, storm cell lightning or other world event changes blocks in it, and [Safe Zones](#safe-zones--zones_bp) lists it under **Towns and claims** as `Sam's claim`.
- **Operators** can't build in other players' claims unless **Operators can build in any claim** is enabled (`operatorsBypass`), so a realm where everyone is an operator still gets protection. They can always remove a claim.
- **What a claim doesn't stop:** mobs, hurting animals or pets, fire spreading, lava or water flowing in, pistons pushing blocks in from outside, hoppers or minecarts pulling items across the border, and hits: punching an armor stand to break it, or punching the item out of an item frame, isn't stopped (only tapping them is).

### Commands

| Command | Who | What it does |
|---|---|---|
| `/realm:claim` | Everyone | Opens the Land Claims menu: claim the land around you (default 33 × 33 blocks, `radius` 16), show nearby claim borders, share or remove your claims (default 2 each, `maxClaims`); operators also get every claim, to remove any. Only works once an operator has enabled land claims (default disabled, `enabled`) |

### Configuration (`scripts/config.js` → `CONFIG`)

| Option | Default | Description |
|---|---|---|
| `enabled` | `false` | Land claims for the whole realm. Disabled: `/realm:claim` only says so and nothing is protected; claims are kept |
| `radius` | `16` | How far a new claim reaches from where you stand, each way: 16 = 33 × 33 blocks, top to bottom (4–64 in game) |
| `maxClaims` | `2` | Most claims one player can have (1–10 in game) |
| `maxShared` | `10` | Most players one claim can be shared with |
| `protectExplosions` | `true` | Explosions break no blocks inside a claim |
| `protectWorldEvents` | `true` | Claims are safe zones: meteors, tornadoes, storm lightning and other world events break no blocks in them |
| `operatorsBypass` | `false` | Operators can build, break and open things in anyone's claim |
| `protectedEntities` | `armor_stand`, `chest_minecart`, `hopper_minecart`, `chest_boat` | Entities only a claim's players can use inside it |
| `borderSeconds` | `10` | How long **Show claim borders** draws them |

Operators can change `enabled`, `radius`, `maxClaims`, `protectExplosions`, `protectWorldEvents` and `operatorsBypass` in game with `/realm:config`. The rest stays in `config.js`. The realm has room for 500 claims in all.

### Saved data

| Key | Scope | Contents |
|---|---|---|
| `claims:c:<id>` | World | One per claim: JSON `{ id, o, n, dim, x, z, r, s }`, the owner's id and name, the dimension, the center, the radius and the players it's shared with (`[{ i, n }]`) |
| `claims:next` | World | The next claim id |
| `claims:cfg` | World | Settings changed in `/realm:config` |

### How it works

- Claims are read into memory once and kept in step as they change, so the checks below never read saved data.
- `beforeEvents.playerBreakBlock` and `beforeEvents.playerInteractWithBlock` are canceled inside someone else's claim. The tap is checked at the block and at the spot a block would be placed, since the stable API has no "before place" event and placing starts with that tap. `afterEvents.playerPlaceBlock` removes anything that still got placed. `beforeEvents.playerInteractWithEntity` is canceled for `protectedEntities`.
- `beforeEvents.explosion` takes the blocks inside claims out of the blast without canceling it.
- The pack is the `claims` provider of the safe zones protocol: while claims are enabled and `protectWorldEvents` is on, it sends every claim as a square zone (`realm:zones`) whenever claims change, when the world starts and when asked (`realm:zones_ping`); otherwise it sends an empty list.
- Once a second, each player's claim is looked up to say when they walk in or out of one. Messages above the hotbar send `realm:actionbar` first, so the [Coordinates HUD](#coordinates-hud--hud_bp) leaves them on screen.

---

## Death Point — `death_bp`

Tells you where you died once you respawn, and points you back there. The realm keeps inventories on death, so nothing is lying on the ground waiting for you: this is for finding your way back to where you were, say a cave you were exploring or a long trip through the Nether.

### How to use

1. Nothing to set up: when you respawn after dying, chat says `You died at 120, 64, -340 in the Overworld.`
2. Run `/realm:death` any time to see your last death point again, how far it is from where you stand and in which direction, for example `It's 245 blocks to the NE, 12 blocks down.` When teleporting back is enabled (or you're an operator) it opens the **Death Point** menu with that text and the buttons `Where I died` (the same in chat), `Teleport back` and, for operators, `Settings`; otherwise it answers in chat right away. `/realm:death_info` always answers in chat.
3. Don't want the chat message? Disable **Tell me where I died** in `/realm:prefs`. `/realm:death` still works.
4. If an operator has enabled it, tap `Teleport back` in `/realm:death`, or run `/realm:death_back`, to teleport to your last death point, once per death. It only lands you somewhere safe to stand, and says so when there isn't such a place.
5. **Operators:** enable `/realm:death_back` in `/realm:config` → **Death Point** → **Teleport back to the death point (/realm:death_back)**. The same page turns the respawn message off for everyone.

### What players see

- **On respawn** (`announce`): `You died at 120, 64, -340 in the Overworld. Run /realm:death to see where that is from here.` A player who leaves on the death screen gets it when they next spawn.
- **`/realm:death`** (or `/realm:death_info`) shows the block you died in and its dimension, then the distance along the ground, rounded to whole blocks, with one of 8 directions (N, NE, E, SE, S, SW, W, NW; north is toward negative Z) and how far up or down. Within 2 blocks it says `You're standing on it.` In another dimension it says which one you're in, with no distance. When `/realm:death_back` is enabled it adds whether you can still use it for this death.
- **`/realm:death_back`** while disabled (`backEnabled`, disabled by default): `Teleporting back is disabled on this realm. An operator can enable it in /realm:config (Death Point). /realm:death still shows the way.`
- **`/realm:death_back`** while enabled looks for the nearest safe spot within 2 blocks sideways (`backSearchRadius`) and 8 blocks up or down (`backSearchHeight`) of the death point: two blocks of air (or grass, ferns, flowers, a dead bush, vines, glow lichen or a torch) to stand in, on a block that isn't air, water, lava, magma, fire, a campfire, cactus, a berry bush, a wither rose, powder snow or pointed dripstone, with no lava or fire right beside it. It works across dimensions. Then:
  - it teleports you and says `Teleported back to your death point (120, 65, -340).` Once per death: a second try says `You already went back to this death point.`
  - with no safe spot (you died in lava, deep water, inside a wall or below the world) it says so and doesn't move you, and you can try again after the lava cools or the water is drained.
  - a death point far from every player isn't loaded: it's loaded for a moment (up to 5 seconds, `backLoadSeconds`) and the search runs then. If it can't be loaded it says so.
- `/realm:death_back` doesn't bring back dropped items or experience, and it isn't needed for them: the realm keeps inventories on death.

### Commands

| Command | Who | What it does |
|---|---|---|
| `/realm:death` | Everyone | The **Death Point** menu: your last death point in its text, with `Where I died`, `Teleport back` (when `backEnabled` is on) and, for operators, `Settings`. With nothing else to choose it answers in chat like `/realm:death_info` |
| `/realm:death_info` | Everyone | Shows your last death point (x, y, z and dimension), with the distance and direction from where you stand, or which dimension it's in |
| `/realm:death_back` | Everyone, once an operator enables it | Teleports you to a safe spot at your last death point, once per death (default disabled, `backEnabled`). Refuses with a reason when there's no safe place to stand |

### Configuration (`scripts/config.js` → `CONFIG`)

| Option | Default | Description |
|---|---|---|
| `announce` | `true` | Tell players in chat where they died once they respawn. Each player can change it for themselves |
| `backEnabled` | `false` | `/realm:death_back` teleports players to their last death point, once per death |
| `backSearchRadius` | `2` | How far sideways (blocks) from the death point `/realm:death_back` looks for a safe place to stand (0 to 4 in game) |
| `backSearchHeight` | `8` | How far up and down (blocks) it looks (0 to 16 in game) |
| `backLoadSeconds` | `5` | How long `/realm:death_back` waits for a faraway death point to load before giving up |

Operators can change `announce`, `backEnabled`, `backSearchRadius` and `backSearchHeight` in game with `/realm:config`. `backLoadSeconds` stays in `config.js`. Each player can disable the respawn message for themselves in `/realm:prefs` (**Tell me where I died**).

### Saved data

| Key | Scope | Contents |
|---|---|---|
| `death:last` | Player | JSON `{ d, x, y, z, told, used }`: the dimension and block of the last death, whether the respawn message was sent and whether `/realm:death_back` was used for it |
| `death:pref` | Player | The player's choice for **Tell me where I died**, when it differs from the realm's |
| `death:areas` | World | JSON list of the temporary ticking areas `/realm:death_back` is using right now; any left after a restart are removed when the world loads |
| `death:cfg` | World | Settings changed in `/realm:config` |

### How it works

- `world.afterEvents.entityDie` saves the block a player died in; `world.afterEvents.playerSpawn` sends the message once.
- `/realm:death_back` checks the blocks around the death point with `Dimension.getBlock`, nearest first. When the death point isn't loaded, it runs `tickingarea add circle <x> <y> <z> 1 "death_back_<id>" true` in that dimension, checks again every 5 ticks until the blocks can be read, and removes the ticking area right after (`tickingarea remove`). While it's there it counts toward Bedrock's 10 ticking areas per world (see [Farm Loader](#farm-loader--farm_bp)); if all 10 are taken, `/realm:death_back` says it can't load the death point now.
- The teleport uses `Entity.tryTeleport` with `checkForBlocks`, so the game refuses it too if the spot became blocked meanwhile. It is marked used only after it succeeds.

---

## Hotbar Refill — `refill_bp`

When the stack in your hand runs out, or your tool breaks, the same slot is refilled from your inventory, so you keep building, eating or fighting without opening it.

### How to use

1. Nothing to set up: keep spare stacks and spare tools in your main inventory (above the hotbar). Place your last block, eat your last steak, throw your last snowball or ender pearl, or break your pickaxe, and a matching stack or tool from your inventory moves into that hotbar slot.
2. Don't want it? Run `/realm:refill` to disable it for yourself; run it again to enable it. The same switch is **Refill my hotbar** in `/realm:prefs`. The choice is remembered.
3. **Operators:** `/realm:config` → **Hotbar Refill** disables it for the whole realm, stops it replacing broken tools, or changes what new players start with.

### What players see

- **A stack runs out** (the last block placed, the last food eaten, the last snowball, egg, ender pearl or firework used, the last bone meal or seeds used on a block): the fullest stack in your main inventory that would have stacked with it moves into the same slot. "Would have stacked" means the same item with the same name, enchantments and other data, so a renamed stack never replaces a plain one, and the other way around.
- **A tool, weapon or other item with durability breaks** while you use it (mining, hitting, tilling, shearing, lighting, fishing; `refillTools`): a spare of the same item moves in, the one with the most uses left. Two rules keep your special gear where it is:
  - a spare with a name (renamed on an anvil) only replaces a broken tool with that same name;
  - a plain (unenchanted) tool is only replaced by a plain spare, so a Silk Touch or Fortune pickaxe isn't pulled out when an ordinary one breaks. A broken enchanted tool is replaced by the spare sharing the most of its enchantments (any spare of that item counts, enchanted or not), then the one with the most uses left.
- **Not refilled:** a stack you drop, move or put away by hand, armor and elytra you put on from the hotbar, a thrown trident, an item that turns into another (a bucket, a bowl, a glass bottle), slots other than the one in your hand, items locked in their slot, and anything when there's no match in the main inventory (the 27 slots above the hotbar; the other hotbar slots aren't used).
- The item is moved, not copied: it keeps its enchantments, name, lore, durability and everything else.
- Nothing is shown or played; the slot just fills.

### Commands

| Command | Who | What it does |
|---|---|---|
| `/realm:refill` | Everyone | Enables or disables hotbar refills **for yourself** (default enabled, `defaultOn`). Remembered between sessions. Chat says `Hotbar refill: Disabled. Run /realm:refill again to enable it.` |

### Configuration (`scripts/config.js` → `CONFIG`)

| Option | Default | Description |
|---|---|---|
| `enabled` | `true` | Hotbar refill for the whole realm. Disabled: nothing is refilled, whatever players chose |
| `refillTools` | `true` | Also replace a tool, weapon or other item with durability that breaks |
| `defaultOn` | `true` | Players get refills until they disable them for themselves |

Operators can change all three in game with `/realm:config`. Players whose own choice differs from `defaultOn` keep it when `defaultOn` changes. Each player switches it for themselves with `/realm:refill` or **Refill my hotbar** in `/realm:prefs`.

### Saved data

| Key | Scope | Contents |
|---|---|---|
| `refill:pref` | Player | The player's choice from `/realm:refill` or `/realm:prefs`, when it differs from `defaultOn` |
| `refill:cfg` | World | Settings changed in `/realm:config` |

### How it works

- `world.afterEvents.playerInventoryItemChange` reports a hotbar slot going from an item to empty. Only the selected slot counts.
- A slot that empties within 3 ticks of a use counts as used up: placing a block (`playerPlaceBlock`), mining (`playerBreakBlock`), tapping a block or mob (`playerInteractWithBlock`, `playerInteractWithEntity`), hitting (`entityHitEntity`), or using, eating or releasing an item (`itemUse`, `itemCompleteUse`, `itemReleaseUse`). Moving items by hand fires none of these, which is how a deliberate move is told apart. Items that don't stack only come back when they broke: they had 2 uses or fewer left, or vanished while being used in hand.
- Two ticks later, if the slot is still empty, `Container.swapItems` swaps it with the chosen inventory slot. A native swap keeps the item exactly as it was.

---

## Coordinates HUD — `hud_bp`

Your own coordinates, the direction you're facing and the day and time, on the bar above the hotbar, for players who enable it. Handy for building, mapping and meeting up without opening a map.

### How to use

1. Run `/realm:hud`. Above your hotbar you now see `XYZ 120 64 -340  Facing NE  Day 12 at 6:30 AM`, updated as you move. Only you see yours.
2. Run `/realm:hud` again to hide it. The choice is remembered. The same switch is **Coordinates HUD above my hotbar** in `/realm:prefs`.
3. Only want the coordinates? Disable **HUD shows the day and time** in `/realm:prefs`.
4. **Operators:** `/realm:config` → **Coordinates HUD** disables it for the whole realm (for servers that play without coordinates), shows it to new players from the start, or switches the facing to 4 directions.

### What players see

- **Coordinates** are the block your feet are in, as in the game's own coordinates. **Facing** is one of 8 directions, `N`, `NE`, `E`, `SE`, `S`, `SW`, `W`, `NW` (`eightWay`; 4 directions when disabled); north is toward negative Z.
- **Day and time** (`showTime`): the in-game day, counted from 1, and the time on a 12-hour clock in 10-minute steps, with sunrise at 6:00 AM and noon at 12:00 PM (an in-game day lasts 20 minutes, so 10 in-game minutes pass in about 8 seconds).
- Off for every player until they enable it (`defaultOn`). While an operator has disabled it for the realm (`enabled`), nobody sees it and `/realm:hud` says `The coordinates HUD is disabled on this realm.`
- It updates at most twice a second (`intervalTicks`), and only when the text changes, or every 2 seconds (`refreshTicks`) so it doesn't fade while you stand still.
- **The stats ticker:** a player who also has the [Stats pack](#stats--leaderboards--stats_bp)'s ticker on sees it as a second line under the coordinates, such as `Mob kills 120 #2 of 7`, instead of the two taking turns on the bar.
- **Sharing the bar with other packs:** the same bar also shows other packs' short messages: low-durability warnings, `Sorted 31 stacks` and other Quick Stack & Sort results, entering or leaving a claim, the Chairs reminder, the smart sleep count, [Mob Health](#mob-health--mobhp_bp) after a hit, [Daily Quests](#daily-quests--quests_bp) progress notes and others. Each of them asks the HUD to wait (usually 2 to 3 seconds) so the message stays readable, and the HUD redraws right after. While you glide with the [Elytra HUD](#elytra-hud--elytra_bp) above the hotbar, it keeps the bar to itself; the coordinates come back a second or two after you land. Other packs can do the same (see How it works).

### Commands

| Command | Who | What it does |
|---|---|---|
| `/realm:hud` | Everyone | Shows or hides your coordinates, facing and the day and time above the hotbar, **for yourself** (default hidden, `defaultOn`). Remembered between sessions. Says so when an operator has disabled it for the realm (`enabled`) |

### Configuration (`scripts/config.js` → `CONFIG`)

| Option | Default | Description |
|---|---|---|
| `enabled` | `true` | The HUD for the whole realm. Disabled: nobody sees it, whatever they chose |
| `defaultOn` | `false` | Show the HUD to players who never ran `/realm:hud` |
| `showTime` | `true` | Show the day and time after the coordinates. Each player can change it for themselves |
| `eightWay` | `true` | Facing in 8 directions; `false` shows `N`, `E`, `S` and `W` only |
| `intervalTicks` | `10` | How often (ticks) the HUD updates. 10 is the fastest it goes (twice a second). Read when the world starts |
| `refreshTicks` | `40` | Send an unchanged HUD again after this many ticks, so the bar doesn't fade |

Operators can change `enabled`, `defaultOn`, `showTime` and `eightWay` in game with `/realm:config`; `intervalTicks` is fixed when the world starts, so `/realm:config` only shows it. `refreshTicks` stays in `config.js`. Each player chooses **Coordinates HUD above my hotbar** (`/realm:hud`) and **HUD shows the day and time** in `/realm:prefs`; a player who never chose follows `defaultOn` and `showTime`.

### Saved data

| Key | Scope | Contents |
|---|---|---|
| `hud:pref` | Player | JSON of the player's choices (HUD shown, day and time) that differ from the realm's |
| `hud:cfg` | World | Settings changed in `/realm:config` |

### How it works

- Every `intervalTicks`, for each player with the HUD on, the pack builds the text from the player's location, `getRotation()` (the yaw), `world.getDay()` and `world.getTimeOfDay()`, and calls `onScreenDisplay.setActionBar` only if it changed or `refreshTicks` have passed.
- Another pack that puts a message on the bar can send the script event `realm:actionbar` with `{"player":"<player id>","ticks":40}`; the HUD then leaves that player's bar alone for that many ticks (up to 200) and redraws right after. Every pack that writes the bar does this (see the action bar protocol in [How the packs work together](#how-the-packs-work-together)); the packs never import each other.
- Turning the HUD off clears the bar right away.
- Another pack can add a line under the HUD for one player with the script event `realm:hud_line` (`{"player":"<player id>","key":"stats","text":"...","ticks":80}`): it shows while the HUD is on, until `ticks` pass (up to 400; resend to keep it) or a message with `"text":""` removes it. Lines show in `key` order. The Stats pack's ticker uses it.
- So those packs know whether to draw on their own, the HUD sends `realm:hud_state` (`{"players":["<player id>", ...]}`, the players who see it) when that changes, every 5 seconds, and in reply to `realm:hud_ping`.

---

## Mob Health — `mobhp_bp`

Hit a mob and its name and health show in a small box on the right side of your screen (or in the middle, or above your hotbar, if you prefer), so you know how close it is to going down.

### How to use

1. Nothing to set up: hit a mob with anything, or shoot it, and a small box on the right side of your screen, above the scoreboard, shows something like `Zombie  14/20 ||||||||||` with the bar in color. Only you see it.
2. Don't want it? Run `/realm:mobhp` to hide it for yourself; run it again to show it. The same switch is **Show the health of mobs I hit** in `/realm:prefs`. The choice is remembered.
3. **Operators:** `/realm:config` → **Mob Health** disables it for the whole realm, shows players' health too when one player hurts another, changes the bar length, or changes what new players start with.

### What players see

- **Name:** the mob's name tag if it has one, otherwise its name in the game's language (`Zombie`, `Iron Golem`).
- **Health** after the hit, rounded up to whole points, out of its maximum (`14/20`; 2 points are one heart), then a bar of 10 `|` characters (`barLength`): green above half health, yellow above a quarter, red below that, with the lost part in dark gray. A killing blow shows `0/20`.
- Shown for melee hits and for arrows, tridents and other projectiles you fired, every time the mob is hurt by you.
- **Other players** only when an operator enabled **Show players' health too** (`players`, disabled by default): then hurting a player shows their name and health the same way.
- Enabled for every player until they disable it (`defaultOn`). While an operator has disabled it for the realm (`enabled`), nobody sees it.
- **Where it shows** (`showAt`, default **Right side, above the scoreboard**): a small box on the right side of the screen, just above where the scoreboard sidebar sits, for 2 seconds (`holdTicks`). The box is drawn by [Side HUD](#side-hud--hud_rp) in Realm Resources; without it the text shows in the middle of the screen instead. Other add-ons that redraw the line above the hotbar all the time (waypoint and compass add-ons) can't cover it there; that's why it never showed on realms with such an add-on. Each player can pick **Middle of the screen** or **Above the hotbar** instead (**Where the health of mobs I hit shows** in `/realm:prefs`); then, with the [Coordinates HUD](#coordinates-hud--hud_bp) on, the HUD waits 2 seconds after each hit before it draws itself again.

### Commands

| Command | Who | What it does |
|---|---|---|
| `/realm:mobhp` | Everyone | Shows or hides the health of mobs you hit, **for yourself** (default shown, `defaultOn`). Remembered between sessions. Chat says `Mob health: Disabled. Run /realm:mobhp again to show it.` |

### Configuration (`scripts/config.js` → `CONFIG`)

| Option | Default | Description |
|---|---|---|
| `enabled` | `true` | Mob health for the whole realm. Disabled: nobody sees it, whatever they chose |
| `defaultOn` | `true` | Players see it until they disable it for themselves |
| `players` | `false` | Also show a player's health when you hurt another player |
| `barLength` | `10` | How many `\|` characters make up the bar (5 to 20 in game) |
| `showAt` | `"side"` | Where it shows for players who haven't chosen: `side` (a box on the right side, above the scoreboard, from [Side HUD](#side-hud--hud_rp)), `middle` (the subtitle line in the middle of the screen) or `hotbar` (the line above the hotbar). Other add-ons can cover only `hotbar` |
| `holdTicks` | `40` | How long (ticks) the health stays on screen; above the hotbar, how long the Coordinates HUD leaves it before drawing itself again |

Operators can change `enabled`, `defaultOn`, `players`, `barLength` and `showAt` in game with `/realm:config`. Players pick their own place with **Where the health of mobs I hit shows** in `/realm:prefs`. `holdTicks` stays in `config.js`. Each player switches it for themselves with `/realm:mobhp` or **Show the health of mobs I hit** in `/realm:prefs`; players whose own choice differs from `defaultOn` keep it when `defaultOn` changes.

### Saved data

| Key | Scope | Contents |
|---|---|---|
| `mobhp:pref` | Player | JSON of the player's choices from `/realm:mobhp` or `/realm:prefs` (shown or hidden, where it shows) that differ from the realm's |
| `mobhp:cfg` | World | Settings changed in `/realm:config` |

### How it works

- `world.afterEvents.entityHurt` gives the hurt mob and the damage source. When the damaging entity (the shooter, for a projectile) is a player with it on, the pack reads the mob's `minecraft:health` component and shows it on that player's screen, with the mob's name as a translated text so it reads in each player's language: on the right side as a title marked `§s§1§r` that [Side HUD](#side-hud--hud_rp) draws as a box (cleared with `§s§0§r` after `holdTicks`, unless another pack took the box meanwhile: each sends the script event `realm:side` `{player, from, ticks}` when it does), on the subtitle line, or on the action bar.
- Above the hotbar it also sends the script event `realm:actionbar` with `{"player":"<id>","ticks":40}` (`holdTicks`), which the Coordinates HUD understands. Without the HUD nothing listens and nothing happens.

---

## Elytra HUD — `elytra_bp`

While you glide, a small box on the right side of your screen (or the middle, or the line above your hotbar, if you prefer) shows your speed, height, how much durability your elytra has left and how many firework rockets you carry.

### How to use

1. Put on an elytra and glide. On the right side of the screen, above the scoreboard, you see something like `31.4 blocks/s  Y 142  Elytra 87%  Rockets 12`, updated 4 times a second.
2. Don't want it? Run `/realm:elytra`, or disable **Elytra HUD while gliding** in `/realm:prefs`. Chat says `Elytra HUD: Disabled. Run /realm:elytra again to enable it.` The choice is remembered.
3. **Operators:** to turn it off for everyone, disable **Elytra HUD** in `/realm:config` → **Elytra HUD**. The same page sets when durability turns red.

### What players see

- **Speed** in blocks per second (your total speed, diving included), **Y** (your height), **Elytra** durability left in percent and **Rockets**: firework rockets in your inventory and offhand.
- Durability shows green, yellow at 30 percent or less, and red at 10 percent or less (`lowPercent`). An elytra stops working at 1 durability left, which shows as 0%.
- The bar only shows while you're gliding and fades a moment after you land. Nothing is shown, and nothing is checked, for players who aren't gliding.
- When it shows above the hotbar and the [Coordinates HUD](#coordinates-hud--hud_bp) is on, the coordinates pause while you glide, so the two don't take turns on the bar; they come back a second or two after you land. On the right side or in the middle, both show at once.
- **Where it shows** (`showAt`, default **Right side, above the scoreboard**): a small box drawn by [Side HUD](#side-hud--hud_rp) (in the middle of the screen without it), which other add-ons that redraw the line above the hotbar all the time (waypoint and compass add-ons) can't cover; that's why it never showed on realms with such an add-on. Players can pick **Middle of the screen** or **Above the hotbar** in `/realm:prefs` (**Where my Elytra HUD shows**); there, other messages (low durability warnings, claim borders, the sleep count) can briefly swap places with it.

### Commands

| Command | Who | What it does |
|---|---|---|
| `/realm:elytra` | Everyone | Enables or disables the gliding HUD **for yourself** (enabled by default). Remembered between sessions. Works while the HUD is enabled for the realm (default enabled, `enabled`) |

### Configuration (`scripts/config.js` → `CONFIG`)

| Option | Default | Description |
|---|---|---|
| `enabled` | `true` | The gliding HUD for the whole realm. Disabled: nobody sees it and `/realm:elytra` says so |
| `intervalTicks` | `5` | Ticks between HUD updates while gliding (5 = 4 times a second) |
| `lowPercent` | `10` | Elytra durability left (percent) at or below which it shows in red (1 to 50 in game) |
| `showAt` | `"side"` | Where it shows for players who haven't chosen: `side` (a box on the right side, above the scoreboard, from [Side HUD](#side-hud--hud_rp)), `middle` (the subtitle line in the middle of the screen) or `hotbar` (the line above the hotbar). Other add-ons can cover only `hotbar` |

Operators can change `enabled`, `lowPercent` and `showAt` in game with `/realm:config`; `intervalTicks` shows there but is read when the world starts, so change it in `config.js`. Each player can disable the HUD for themselves in `/realm:prefs` (**Elytra HUD while gliding**), the same switch as `/realm:elytra`, and pick where it shows (**Where my Elytra HUD shows**).

### Saved data

| Key | Scope | Contents |
|---|---|---|
| `elytra:pref` | Player | JSON of the player's own choices: `"off": true` when they disabled the HUD (`/realm:elytra` or `/realm:prefs`), and `where` when they picked where it shows |
| `elytra:cfg` | World | Settings changed in `/realm:config` |

### How it works

Every `intervalTicks` the pack looks at each player's `isGliding`. For gliding players who haven't disabled it, it reads `getVelocity()` (blocks per tick, times 20), their Y, the chest slot's durability through the equippable component, and counts rockets in the inventory and offhand, then writes the line: on the right side as a title marked `§s§1§r` that [Side HUD](#side-hud--hud_rp) draws as a box (with `realm:side`, as Mob Health does), on the subtitle line, or with `onScreenDisplay.setActionBar`.

Above the hotbar, it also sends the script event `realm:actionbar` with `{"player":"<id>","ticks":30}` (renewed every 10 ticks; `ticks` is at least 3 times `intervalTicks`), the same request Mob Health makes, so the Coordinates HUD leaves that player's bar alone until they stop gliding. Without the HUD nothing listens.

---

## Realm Mail — `mail_bp`

Write letters to anyone who has played on the realm, online or not. Letters to offline players wait in their inbox, and they're told about them when they join. Letters carry words only: for items, see the [Player Mailroom](https://mc.nish.software/mailroom/) build.

### How to use

1. Run `/realm:mail` and pick **Write a letter**. Choose who it's for (everyone who has joined since the pack was added, with `(online)` after the ones playing now), type a subject and the letter, and press **Send**. Minecraft's text boxes hold only 100 characters each, so the letter has several boxes (6 for the default 600 characters): a full box runs straight on into the next, and after a box that isn't full the next one starts a new line. You can also type `\n` for a new line.
2. If they're online, they see `New letter from Sam: "Hello!". Read it with /realm:mail` in chat. If not, the letter waits: the next time they join, chat says `You have 2 unread letters: /realm:mail`.
3. **Read your letters:** `/realm:mail` → **Inbox**. New letters are marked `[New]`. Open one to read it, then **Reply** or **Delete** it. **Delete all read letters** clears out the rest and shows the inbox again.
4. **See what you sent:** `/realm:mail` → **Sent** shows your recent letters and whether each was read yet.
5. Don't want the chat line on joining? Disable **Unread letters notice on join** in `/realm:prefs`.
6. **Operators:** `/realm:config` → **Realm Mail** sets how many letters an inbox holds, how many are kept in Sent, the wait between letters, and whether players are told about unread letters on joining.

### What players see

- **The menu** says how many unread letters you have, then **Inbox** (`3 letters, 1 unread`), **Write a letter** and **Sent**.
- **Writing:** the recipient list holds every player who has joined since the pack was added (up to 400, `maxRoster`; the ones seen longest ago are forgotten first). The subject is shortened to 40 characters (`subjectLength`) and the letter to 600 (`bodyLength`); chat says `(It was shortened to fit.)` when that happens. An empty letter brings the form back with `Write something in the letter first.` A letter without a subject gets `(no subject)`. The subject is at most 100 characters whatever `subjectLength` says, the most a text box takes.
- **Waiting between letters:** each player can send one letter every 10 seconds (`sendCooldownSeconds`); sending sooner brings the form back, filled in, with `Wait 4 more seconds before sending another letter, then press Send again.` at the top
- **Full inboxes:** an inbox holds 50 letters (`inboxLimit`). When a letter arrives in a full inbox, the oldest letters its owner has already read are dropped to make room. If every letter in it is still unread, the letter isn't sent: the form comes back, filled in, with `Alex's mailbox is full of unread letters. Try again once they've read some.` at the top, so you can pick someone else or keep the text.
- **Reading** a letter shows who sent it and when (`3h ago (2026-10-06 14:05 UTC)`), and marks it read. **Reply** opens the letter form with the sender picked and the subject `Re: ...`.
- **Sent** keeps your last 30 letters (`sentLimit`), each marked `read`, `not read yet` or `deleted` (by the recipient). **Remove from Sent** removes your copy only; the recipient keeps theirs.
- **No items:** letters can't carry items, because an item's full data can't be stored safely by an add-on. To send items, use the [Player Mailroom](https://mc.nish.software/mailroom/) build (the mail menu points to `mc.nish.software/mailroom`).

### Commands

| Command | Who | What it does |
|---|---|---|
| `/realm:mail` | Everyone | Opens Realm Mail: your **Inbox** (read, reply, delete; default 50 letters each, `inboxLimit`), **Write a letter** to any player who has joined, even offline, and **Sent** (your last 30 letters, `sentLimit`) |

### Configuration (`scripts/config.js` → `CONFIG`)

| Option | Default | Description |
|---|---|---|
| `inboxLimit` | `50` | Most letters one inbox holds. A new letter in a full inbox drops the oldest read letters first; if all are unread, it isn't sent (10–200 in game) |
| `sentLimit` | `30` | Most letters kept in each player's Sent list; the oldest drop off first. `0` keeps none (0–100 in game) |
| `subjectLength` | `40` | Longest subject, in characters |
| `bodyLength` | `600` | Longest letter, in characters. The form gets one 100-character box per 100 characters |
| `notifyOnJoin` | `true` | Players with unread letters get `You have 2 unread letters: /realm:mail` in chat on joining |
| `notifyDelaySeconds` | `8` | Seconds after joining before that line, so it comes after the welcome and news popups |
| `sendCooldownSeconds` | `10` | Seconds a player waits between two letters. `0` = no wait (0–120 in game) |
| `maxRoster` | `400` | Most players remembered as recipients; the ones seen longest ago are forgotten first. Their letters stay |

Operators can change `inboxLimit`, `sentLimit`, `notifyOnJoin` and `sendCooldownSeconds` in game with `/realm:config`. Each player can switch the join notice off or on for themselves with **Unread letters notice on join** in `/realm:prefs`, which follows `notifyOnJoin` until they choose. The rest stays in `config.js`.

### Saved data

| Key | Scope | Contents |
|---|---|---|
| `mail:l:<id>` | World | One per letter: JSON `{ id, f, fn, t, tn, s, b, at, r, di, ds }`, the writer's and recipient's ids and names, subject, letter, when it was sent (ms), read, deleted from the inbox, removed from Sent. Removed once both the recipient deleted it and it left the writer's Sent list |
| `mail:next` | World | The next letter id |
| `mail:roster` | World | JSON list of players who have joined: `[{ i, n, t }]`, id, name and last join (ms), newest first, up to `maxRoster` |
| `mail:pref` | Player | JSON of the player's own `joinNotice` choice from `/realm:prefs` |
| `mail:cfg` | World | Settings changed in `/realm:config` |

### How it works

- Each letter is its own small world property (a few hundred bytes up to about 2 KB), so no property comes near the 32 KB limit however many letters a player keeps. The realm holds up to 5,000 letters in all. Letters are read into memory once and kept in step as they change.
- The roster is updated on every join (`afterEvents.playerSpawn` with `initialSpawn`), so a player who changes their gamertag shows under the new name. Letters are addressed by player id, so they still arrive.
- The unread notice is sent `notifyDelaySeconds` after joining. A letter to someone online reaches them straight away with a chat line and a sound.
- The forms are `ActionFormData` and `ModalFormData` from `@minecraft/server-ui`.

---

## Nicknames — `nick_bp`

Pick a nickname and a color to show above your head instead of your gamertag. Chat, the player list and death messages still show gamertags: the stable Script API can't change chat. With [Titles & Trails](#titles--trails--titles_bp), the title a player wears shows in gray on a line under the name, with or without a nickname.

### How to use

1. Run `/realm:nick`, type a nickname (3 to 16 letters A-Z, digits, spaces or `_`), pick a color and tap **Save**. It shows above your head right away, with your gamertag in gray underneath.
2. Run `/realm:nick` again to change it, or enable **Remove my nickname** there to show your gamertag again. Your nickname stays when you leave, die or the realm restarts.
3. Wear a title from `/realm:titles` (the Titles & Trails pack) and it shows in gray on its own line under your name, whether or not you have a nickname. Choose **None** there to take it off.
4. **Operators:** `/realm:nick` → **Players' nicknames (operator)** lists every saved nickname; tap one to clear it, even for players who are offline. To turn nicknames off for everyone, disable **Nicknames** in `/realm:config` → **Nicknames**.

### What players see

- **Above your head:** your nickname in the color you picked, and your gamertag in gray on a second line (`showGamertag`), so everyone still knows who is who. With the AFK pack, an AFK player's tag reads `[AFK] Nickname`. A title from Titles & Trails adds one more gray line under that, and shows under the plain gamertag for players without a nickname.
- **Chat still shows your gamertag**, and so do the player list, death messages, `/realm:` command messages and other packs' messages. The stable Script API has no chat events, so a pack can't change the name in chat.
- **Rules:** 3 to 16 characters: letters A-Z, digits, spaces and `_` (spaces at the ends are trimmed, repeated spaces become one). A nickname can't be another player's gamertag or nickname, whatever the case: the form says `Alex is someone else's gamertag.` or `Sam already has that nickname.` and opens again.
- **Colors:** White, Gray, Red, Dark red, Gold, Yellow, Green, Dark green, Aqua, Dark aqua, Blue, Light purple, Dark purple.
- **Operators** clearing a nickname see `Cleared Nick (Gamertag).`; the player, if online, gets `An operator cleared your nickname.`
- **While nicknames are disabled** (`enabled`): `/realm:nick` answers `Nicknames are disabled on this realm. An operator can enable them in /realm:config (Nicknames).`, everyone shows their gamertag, and saved nicknames come back once it's enabled again. Titles still show under the gamertag.

### Commands

| Command | Who | What it does |
|---|---|---|
| `/realm:nick` | Everyone | Set, change or remove your nickname and its color, shown above your head (3 to 16 letters, digits, spaces or `_`). Operators also get every saved nickname, to clear any of them. Works while nicknames are enabled (default enabled, `enabled`) |

### Configuration (`scripts/config.js` → `CONFIG`)

| Option | Default | Description |
|---|---|---|
| `enabled` | `true` | Players can set nicknames. Disabled: everyone shows their gamertag; nicknames are kept |
| `showGamertag` | `true` | Show the gamertag in gray on a second line under the nickname |
| `afkTag` | `afk` | The tag the AFK pack gives AFK players. Keep it the same as AFK `tag` |
| `afkPrefix` | `§7[AFK]§r ` | Shown before a nickname while the player has `afkTag`. Keep it the same as AFK `nameTagPrefix` |

Operators can change `enabled` and `showGamertag` in game with `/realm:config`; name tags update within half a second. `afkTag` and `afkPrefix` stay in `config.js`.

### Saved data

| Key | Scope | Contents |
|---|---|---|
| `nick:p:<player id>` | World | One per nicknamed player: JSON `{ n, c, g }`, the nickname, its color code and the player's gamertag when last seen (for the operators' list) |
| `nick:cfg` | World | Settings changed in `/realm:config` |

### How it works

- The nickname is the player's `nameTag` (`§<color><nickname>§r`, then `\n§7<gamertag>`, then `\n§7<title>` when the player has the tag `realm_title:<title>`). Bedrock forgets a player's name tag when they leave, so it's set again whenever a player spawns.
- Twice a second the pack compares each nicknamed player's name tag with what it should be and sets it again if it differs. That puts the tag back whatever else changed it, and adds `afkPrefix` itself for players with the `afk` tag (the AFK pack only adds and removes its prefix in front of the existing tag, so the two agree). The same check picks up a title being put on or taken off, and puts the plain gamertag back once a player has neither a nickname nor a title.
- Nicknames are read into memory once and kept in step as they change.

---

## Daily Quests — `quests_bp`

Every player gets three quests a day, such as mining coal, defeating zombies, harvesting wheat or traveling 1,000 blocks, each with a reward of XP levels or items. New quests come at midnight UTC.

### How to use

1. Play: about 10 seconds after you join, chat lists today's quests, for example `New daily quests: Mine 12 coal ore, Defeat 10 zombies, Travel 1,000 blocks.` They count as you play; nothing to start.
2. A note above the hotbar shows your progress at each quarter (`Quest: Mine 12 coal ore 6/12`). Finishing one says `Quest complete: Mine 12 coal ore! Reward: 16 Torch` in chat and gives the reward.
3. Run `/realm:quests` to see today's quests with progress bars, their rewards and the time until new ones (`New quests in 5h 12m`).
4. Don't want the progress notes? Disable **Quest progress notes** in `/realm:prefs`.
5. **Operators:** `/realm:config` → **Daily Quests** sets the hour new quests come (UTC), how many each player gets, and whether creative mode counts. The quests themselves and their rewards are the `pool` in `config.js`.

### What players see

- **Each day** (from `resetHourUtc`, 0 = midnight UTC) every player gets 3 quests (`questsPerDay`) picked at random from the `pool`, each of a different kind where possible. Players get different quests. Joining with quests left says `You have 2 daily quests to finish: /realm:quests`; a new day while playing lists the new quests in chat.
- **Quest kinds**, and what counts:
  - **Mine:** breaking the listed blocks. Blocks a player placed lately (the last 10,000 placed on the realm, since it last started) don't count, so placing and breaking the same block doesn't work.
  - **Defeat:** killing the listed mobs (any mob when none are listed). Arrows and tridents count for the shooter.
  - **Harvest:** breaking a fully grown crop (wheat, carrots, potatoes, beetroot, nether wart, cocoa), or a melon or pumpkin, from `crops`. Tapping a grown crop so it resets, as the Right-click Harvest pack does, counts too. Crops you planted yourself count once grown; a melon or pumpkin block you placed doesn't.
  - **Place:** placing blocks.
  - **Travel:** blocks moved any way (walking, swimming, riding, flying), added every 5 seconds. Teleports (faster than `maxSpeed`) and respawning don't count.
  - **Eat:** finishing eating any food.
  - **Fish:** fish caught with a fishing rod (cod, salmon, tropical fish, pufferfish by default). Fish you drop from your inventory next to your hook don't count.
- **Progress notes** appear above the hotbar at a quarter, half and three quarters of a quest (`progressNotes`). With the [Coordinates HUD](#coordinates-hud--hud_bp) on, the HUD waits 2 seconds so the note stays readable (the pack sends `realm:actionbar`, like Mob Health).
- **Rewards** go into your inventory; what doesn't fit drops at your feet, and the chat line says so. XP levels are added to your level. Finishing all of them says `All of today's quests are done. New ones in 5h 12m.`
- **Other packs hear about it:** finishing a quest sends `realm:quest_done`, so [Guilds & Reputation](#guilds--reputation--guilds_bp) gives reputation for it. Without other packs nothing changes.
- **Creative mode** makes no progress (`skipCreative`).
- **The menu** (`/realm:quests`) shows `1 of 3 done today. New quests in 5h 12m.`, then each quest with a bar, `6/12`, and its reward; finished ones are marked `[Done]`.

### Commands

| Command | Who | What it does |
|---|---|---|
| `/realm:quests` | Everyone | Shows today's quests (default 3, `questsPerDay`) with your progress and rewards, and the time until new ones (default midnight UTC, `resetHourUtc`) |

### Configuration (`scripts/config.js` → `CONFIG`)

| Option | Default | Description |
|---|---|---|
| `resetHourUtc` | `0` | New quests every day at this hour, UTC (0–23). Changing it can hand out new quests early once |
| `questsPerDay` | `3` | Quests each player gets per day (1–5 in game). Applies from the next day |
| `progressNotes` | `true` | A note above the hotbar at each quarter of a quest |
| `skipCreative` | `true` | Players in creative mode make no progress |
| `maxSpeed` | `100` | Movement faster than this (blocks per second) is a teleport and doesn't count for travel quests |
| `crops` | wheat, carrots, potatoes, beetroot (`growth` 7), nether wart (`age` 3), cocoa (`age` 2), melon, pumpkin | What counts for harvest quests: `{ block, state, ripe }`, the block, its growth state and fully grown value; without `state`, any break counts |
| `pool` | 16 quests (below) | The quests to pick from: `{ id, kind, count, label, targets?, reward: { levels?, item?, amount? } }`. `kind` is `mine`, `kill`, `harvest`, `place`, `travel`, `eat` or `fish`; `targets` lists the block, mob, crop, food or fish ids that count (leave it out for any). Keep each `id` when editing: progress is saved by it |

The default `pool`:

| Quest | Reward |
|---|---|
| Mine 64 stone (stone, cobblestone, deepslate, andesite, diorite, granite, tuff) | 2 levels |
| Mine 12 coal ore | 16 torches |
| Mine 8 iron ore | 3 levels |
| Chop 32 logs (any wood, crimson and warped stems) | 4 apples |
| Defeat 10 zombies (husks, drowned and zombie villagers too) | 3 levels |
| Defeat 8 skeletons (strays and bogged too) | 16 arrows |
| Defeat 5 creepers | 4 levels |
| Defeat 8 spiders (cave spiders too) | 8 string |
| Defeat 25 mobs of any kind | 3 levels |
| Harvest 32 grown crops | 16 bone meal |
| Harvest 24 wheat | 6 bread |
| Place 64 blocks | 2 levels |
| Travel 1,000 blocks | 2 levels |
| Travel 3,000 blocks | 4 golden carrots |
| Eat 5 meals | 1 level and 4 cookies |
| Catch 5 fish | 3 levels |

Operators can change `resetHourUtc`, `questsPerDay`, `progressNotes` and `skipCreative` in game with `/realm:config`. Each player can switch the progress notes for themselves with **Quest progress notes** in `/realm:prefs`, which follows `progressNotes` until they choose. `pool`, `crops` and `maxSpeed` stay in `config.js`.

### Saved data

| Key | Scope | Contents |
|---|---|---|
| `quests:day` | Player | JSON `{ d, q }`: the day number and today's quests, `[{ id, p, done }]` (pool id, progress, finished) |
| `quests:pref` | Player | JSON of the player's own `progressNotes` choice from `/realm:prefs` |
| `quests:cfg` | World | Settings changed in `/realm:config` |

### How it works

- The day number counts days since 1970 from `resetHourUtc`; when a player's saved day is older, they get new quests the next time anything checks them (joining, the once-a-second loop, any progress).
- **Mine** and **harvest** use `afterEvents.playerBreakBlock` (its `brokenBlockPermutation` tells a grown crop); **place** uses `afterEvents.playerPlaceBlock`, which also remembers the spot so mining it again doesn't count; **defeat** uses `afterEvents.entityDie` with the killer from its damage source; **eat** uses `afterEvents.itemCompleteUse` for items with a food component.
- **Harvest by tapping:** `beforeEvents.playerInteractWithBlock` notes a tap on a grown crop, and 3 ticks later the crop is checked again: if it's the same crop at its first stage, it was harvested.
- **Fish:** a fishing hook belongs to the player nearest to it when it appears, and its place is followed every 2 ticks. An item that appears within 3 blocks of where a hook was in the last second is that player's catch, once per hook, unless it appears within 1 block of the player's head, where items dropped from the inventory appear. There is no "caught a fish" event in the stable API, so this is how a catch is recognized.
- **Travel** adds the distance moved each second while a travel quest is open, as the Stats pack measures it.
- The quests are saved on the player whenever they progress.
- Finishing a quest sends the script event `realm:quest_done` `{ player: player.id, pack: "quests_bp", id, label, kind }`, the same event Story Questlines, Bounty Board, Treasure Maps, Fishing 2.0, Expeditions and Town Projects send for their quest-like things.

---

## Milestones — `milestones_bp`

Realm achievements in tiers: play 1, 10 and 100 hours, mine 1,000, 10,000 and 100,000 blocks, travel a million blocks and more. Unlocks are announced in chat, and anyone can look at anyone's progress.

### How to use

1. Play: milestones count on their own. Reaching one tells everyone in chat, for example `Sam reached a milestone: Miner II (Mine 10,000 blocks)`, with a sound.
2. Run `/realm:milestones` to see yours: each milestone with the tier you have, a progress bar toward the next one and what it takes (`Mine 100,000 blocks`).
3. Pick **Another player's milestones** to see anyone who has played since the pack was added, online or not.
4. **Operators:** to keep unlocks out of public chat, disable **Announce unlocks to everyone** in `/realm:config` → **Milestones**; then only the player is told. The milestones and their tiers are `milestones` in `config.js`.

### What players see

- **The milestones** (`milestones`), each with three tiers, numbered I, II, III:

  | Milestone | Counts | Tiers |
  |---|---|---|
  | Regular | Hours played | 1, 10, 100 |
  | Miner | Blocks mined | 1,000, 10,000, 100,000 |
  | Builder | Blocks placed | 1,000, 10,000, 100,000 |
  | Explorer | Blocks traveled (not gliding) | 10,000, 100,000, 1,000,000 |
  | Aviator | Blocks flown with an elytra | 10,000, 100,000, 1,000,000 |
  | Monster Hunter | Mobs defeated | 100, 1,000, 10,000 |
  | Unlucky | Deaths | 10, 50, 100 |
  | Loyal | Times joined | 10, 100, 365 |

- **Counting** follows the Stats pack's rules: playtime and distance pause while a player has the `afk` tag (`afkTag`), teleports (faster than `maxSpeed`) and respawns don't add distance, and arrows count for the shooter.
- **With the Stats pack** installed, a milestone uses the larger of the Stats pack's number and this pack's own count, so players who had stats before Milestones was added get credit for them. Without it, this pack's own count is used.
- **Unlocking** is checked every 10 seconds (`checkSeconds`), and when you open the menu. Unlocking several at once gives one line: `Sam reached milestones: Miner I (Mine 1,000 blocks), Builder I (Place 1,000 blocks)`. The player hears a level-up sound and everyone else a chime.
- **The first check** after the pack is added (or a player's first join) tells only that player what they already have, `Milestones you already have: Regular I (Play 1 hour), ...`, so a veteran's history doesn't flood chat.
- **The menu** says `5 of 24 unlocked`, then each milestone: its tier (`Miner II`, `next: Miner III`), a bar and `12,345 / 100,000`, or `(every tier)` once all are done.

### Commands

| Command | Who | What it does |
|---|---|---|
| `/realm:milestones` | Everyone | Shows your milestones with progress toward the next tier, and **Another player's milestones** for anyone who has played since the pack was added. Unlocks are announced to everyone (default enabled, `announce`) |

### Configuration (`scripts/config.js` → `CONFIG`)

| Option | Default | Description |
|---|---|---|
| `announce` | `true` | Unlocks are announced in chat to everyone online. Disabled: only the player who unlocked it is told |
| `checkSeconds` | `10` | Seconds between checks for new unlocks |
| `afkTag` | `afk` | Playtime and distance aren't counted while a player has this tag. Must match the AFK pack's `tag`. `""` = always count |
| `maxSpeed` | `100` | Movement faster than this (blocks per second) is a teleport and isn't counted as distance |
| `milestones` | the 8 above | `{ id, stat, name, tiers }`: `stat` is one of `playtime` (in hours), `mined`, `placed`, `travelled`, `flown`, `mobkills`, `pvpkills`, `deaths`, `joins`; `tiers` the amount for each tier, lowest first. Keep each `id` when editing: unlocks are saved by it |

Operators can change `announce` in game with `/realm:config`. The rest stays in `config.js`.

### Saved data

| Key | Scope | Contents |
|---|---|---|
| `milestones:p:<player id>` | World | One per player, so anyone's milestones show while they're offline: JSON `{ n, c, g }`, their name, this pack's own counts per stat (playtime in minutes) and the tiers unlocked per milestone id |
| `milestones:cfg` | World | Settings changed in `/realm:config` |

The Stats pack's scoreboards (`stats_mined` and the rest) are only read, never written.

### How it works

- Counting uses the same events as the Stats pack: `afterEvents.playerBreakBlock`, `playerPlaceBlock`, `entityDie`, `playerSpawn` (joins), and a once-a-second loop for playtime and distance (gliding counts as elytra distance).
- The Stats pack's numbers are read from its scoreboard objectives `stats_<stat>`, where scores are kept under each player's name. The packs don't import each other: without those objectives, the pack uses its own counts only.
- Counts are kept in memory and saved every `checkSeconds` and whenever a player leaves.

---

## Community Goals — `goals_bp`

Shared goals for the whole realm, like 10,000 cobblestone for the Colosseum. Operators set the item, the amount and the chest it goes into; everyone donates from their inventory, and chat cheers each quarter of the way.

### How to use

1. Run `/realm:goals` to see the realm's goals, each with how far along it is (`Colosseum: 23 percent`, `2,340 / 10,000 Cobblestone`).
2. Pick a goal, then **Donate from my inventory**: every matching item you carry (hotbar included) goes into the goal's chest, up to what the goal still needs. Chat says `You gave 320 Cobblestone to Colosseum.`
3. The goal's page shows a progress bar, where its chest is, what you gave and the top contributors.
4. At 25, 50 and 75 percent everyone sees it in chat, and when a goal is reached chat thanks its top contributors.
5. **Operators:** place a chest or barrel for the donations, look at it, run `/realm:goals` and tap `Add a goal`: the item you hold is filled in; type the amount and, if you like, a name. Or run `/realm:goals_add <item> <amount> [name]`, for example `/realm:goals_add cobblestone 10000 Colosseum`. The menu's `Settings` button points to `/realm:config` → Community Goals. In a goal's page, **Mark finished** stops donations early, **Link to the block I'm looking at** moves the goal to another container (one that no other open goal collects into), and **Remove this goal** deletes it (the items stay in its chest).

### What players see

- **The menu** lists the goals still open, oldest first, then **Finished goals** when there are any. Operators also get `Add a goal` (the same as `/realm:goals_add`, in a form, for the container they look at; looking at none, it explains what to do) and `Settings`.
- **Donating** moves stacks of the goal's item from anywhere in your inventory into the goal's container, as if you'd shift-clicked them. Only what the goal still needs is taken: the rest of a stack stays with you. Items with a custom name are never donated (`keepNamedItems`), so a named tool stays yours; `You only have Diamond Sword with a custom name, and those are never donated.` Items locked in their slot stay too.
- **A full container** stops the donation: `The goal's chest at 120, 64, -340 (overworld) is full, so the rest stayed with you. An operator needs to empty it or link a bigger one.` What already went in still counts.
- **The container must be loaded:** someone has to be near it (the same area as you, usually). Otherwise: `The goal's chest at 120, 64, -340 (overworld) isn't loaded. Go closer to it and try again.` If it was broken: `The goal's chest ... is gone. Ask an operator to link the goal to a new one.`
- **Announcements** (`announce`): a new goal (`New community goal: Colosseum, 10,000 Cobblestone. Donate with /realm:goals`), and `Community goal Colosseum: 50 percent there (5,000 / 10,000 Cobblestone). /realm:goals to help` at each quarter. Reaching the goal finishes it and says `Community goal Colosseum reached: 10,000 Cobblestone! Top contributors: Sam 4,200, Alex 3,100, Kim 900. Thanks, everyone!`; with announcements disabled, only the donor who finished it sees that.
- **A goal's page** shows the bar and `2,340 / 10,000 (23 percent)`, where its chest is, `You gave: 320`, and the top 5 contributors (`topContributors`).
- **Only donations count:** items put into the chest by hand, or by hoppers, don't add to the goal, and items taken out don't lower it. An operator can lock the chest with Quick Stack & Sort so only they can take from it; donations still go in.

### Commands

| Command | Who | What it does |
|---|---|---|
| `/realm:goals` | Everyone | Lists the community goals with their progress; pick one to donate from your inventory and see the top contributors (default 5, `topContributors`). Operators can add a goal (`Add a goal`), mark a goal finished, move it to another container or remove it there |
| `/realm:goals_add <item> <amount> [name]` | Ops | Adds a goal collected into the chest, barrel or other container you're looking at (within 8 blocks, `linkDistance`): `item` is the item id, `amount` 1 to 1,000,000, `name` up to 32 characters (default: the item's name). Up to 30 goals at a time, finished ones included (`maxGoals`) |

### Configuration (`scripts/config.js` → `CONFIG`)

| Option | Default | Description |
|---|---|---|
| `announce` | `true` | New goals and progress at 25, 50, 75 and 100 percent are announced in chat to everyone |
| `linkDistance` | `8` | How far away (blocks) the container an operator looks at can be |
| `maxGoals` | `30` | Most goals at a time, finished ones included |
| `topContributors` | `5` | Players listed under "Top contributors" (3–20 in game) |
| `keepNamedItems` | `true` | Items with a custom name are never donated |

Operators can change `announce`, `topContributors` and `keepNamedItems` in game with `/realm:config`. The rest stays in `config.js`.

### Saved data

| Key | Scope | Contents |
|---|---|---|
| `goals:g:<id>` | World | One per goal: JSON `{ id, n, item, target, got, dim, x, y, z, c, by, at, done, m }`, its name, item id, target and progress, the container's dimension and position, contributions by player id (`{ "<id>": [name, amount] }`), who added it and when, whether it's finished, and the last quarter announced |
| `goals:next` | World | The next goal id |
| `goals:cfg` | World | Settings changed in `/realm:config` |

### How it works

- `/realm:goals_add` finds the container with `getBlockFromViewDirection` and stores its position; the goal is linked to that block, so a double chest counts as one container.
- Donating goes through the player's 36 inventory slots and moves each matching stack with the native `Container.transferItem`, which fills matching stacks in the container first, then empty slots. When a goal needs fewer than a whole stack, a copy of that many goes in with `addItem` and the stack is reduced by what went in. Progress is counted from what actually left the inventory, so nothing is counted twice or lost.
- Goals are read into memory once and kept in step as they change.

---

## Fast Leaf Decay — `leaves_bp`

Chop a tree and its leaves fall within a few seconds instead of hanging in the air for minutes, dropping the usual saplings, sticks and apples. Leaves you placed yourself are never touched.

### How to use

1. Chop down a tree as usual, log by log or all at once with a sneak-break (Bedrock Essentials+ tree felling).
2. About a second after the last log breaks, the leaves that no longer reach a log start breaking on their own, a few at a time, with their normal drops. Pick up the saplings and apples underneath.
3. Leaves still held by another tree's logs stay, as in vanilla. So do leaves you placed, sheared ones included.
4. **Operators:** to go back to vanilla leaf decay, disable **Fast leaf decay** in `/realm:config` → **Fast Leaf Decay**. The same page sets how many leaves break per tick.

### What players see

- After a player breaks a log, natural leaves nearby that are now more than 6 steps (`logDistance`) from any log, counted through leaves the way vanilla counts, break within a few seconds: `leavesPerTick` (6) per tick across the realm, in a random order so a canopy thins out evenly. A 120-leaf oak canopy is gone in about a second.
- Each leaf breaks as if broken by hand: the leaves' own drops (saplings, sticks, apples from oak and dark oak), particles and sound. Fortune and shears don't apply, as with vanilla decay.
- Leaves placed by a player (`persistent_bit`) never break, but like in vanilla they still link other leaves to a log.
- **Tree felling (Bedrock Essentials+):** a sneak-break that fells a whole tree is checked once, from the log you broke: the pack follows the trunk's now-empty column up to 32 blocks (`fellHeight`) to find the canopy. Logs broken close together within a second (`delayTicks`) are checked together too, so chopping a tree log by log costs one check.
- Breaking the bottom log of a tree that still stands changes nothing: the logs above still hold the leaves.
- Only logs broken by players start a check. Trees burned down or removed by commands decay at vanilla speed, and so does anything in a chunk that unloads first.

### Commands

None. The pack works by itself once installed.

### Configuration (`scripts/config.js` → `CONFIG`)

| Option | Default | Description |
|---|---|---|
| `enabled` | `true` | Leaves decay quickly after a log is broken. Disabled: vanilla speed |
| `delayTicks` | `20` | Ticks to wait after a log breaks before checking (20 = 1 second), so a felled tree or a tree chopped log by log is checked once |
| `leavesPerTick` | `6` | Most leaves that break per tick, across the realm (1–20 in game) |
| `logDistance` | `6` | Leaves stay while a log is this many steps away or closer, through leaves (vanilla: 6) |
| `searchDepth` | `16` | How far (steps through leaves) from a broken log one check looks |
| `maxBlocks` | `3000` | Most blocks one check reads. Leaves past it count as held by a log, so nothing that might still be attached breaks |
| `fellHeight` | `32` | How far up the pack follows an empty trunk column to find a felled tree's canopy |

Operators can change `enabled` and `leavesPerTick` in game with `/realm:config`; they apply to the next broken log. The rest stays in `config.js`.

### Saved data

| Key | Scope | Contents |
|---|---|---|
| `leaves:cfg` | World | Settings changed in `/realm:config` |

Checks and the leaves waiting to break are kept in memory only: after a restart, leftovers decay at vanilla speed.

### How it works

- `world.afterEvents.playerBreakBlock` notes each broken log (`*_log`, `*_wood`, stripped or not). Logs within 10 blocks of a waiting check join it; a check starts once no log has joined for `delayTicks`, or after 10 seconds at most.
- Each check runs as a `system.runJob` job, spread over ticks, one at a time. It starts from the leaves next to the broken logs and up their empty trunk columns, follows connected leaves up to `searchDepth` steps (at most `maxBlocks` reads), then measures each leaf's distance to a log through leaves. A leaf next to a log, an unloaded block, or anything the check didn't read counts as held, so the pack only ever errs toward leaving leaves alone.
- Natural leaves with no log within `logDistance` are queued; each tick up to `leavesPerTick` of them are checked again (still natural leaves?) and broken with `setblock <x> <y> <z> air destroy`, which gives the normal drops.
- Disabling the pack drops any waiting checks and queued leaves.

---

## Lag Cleanup — `cleanup_bp`

When too many dropped items pile up (a broken farm, a big explosion), the realm warns everyone and clears them 30 seconds later, so the server doesn't lag. Renamed, enchanted and rare items, items right next to a player and a player's death drops are kept.

### How to use

1. Nothing to set up. If more than 500 dropped items (`threshold`) lie around, chat says `Clearing 612 dropped items in 30 s: pick up what you need`. Pick up anything you want to keep.
2. 30 seconds later they're removed, and chat says `Cleared 580 dropped items. (32 kept: renamed, rare, enchanted, or near a player or a recent death)`.
3. Items renamed on an anvil, enchanted items, shulker boxes, elytra, nether stars, totems, enchanted books and the other items in `keepItems`, items within 4 blocks of a player (`nearPlayerRadius`), and items within 8 blocks of where a player died in the last 5 minutes (`keepDeathDropsMinutes`) are never cleared.
4. Run `/realm:cleanup` to see how many dropped items there are in each dimension.
5. **Operators:** `/realm:cleanup` opens a menu to clear now, clear after a warning, or call off a coming cleanup. Change the threshold, timing and what's kept in `/realm:config` → **Lag Cleanup**, or disable **Automatic cleanup** there.

### What players see

- Every 60 seconds (`checkSeconds`) the pack counts the dropped items a cleanup would remove (not the kept ones) in the Overworld, Nether and End together. A stack counts once, however many items it holds. Only loaded chunks (near players) count. Kept items don't count, so a big pile of kept items can't start a cleanup that clears nothing, again and again.
- **Above the threshold:** `Clearing 612 dropped items in 30 s: pick up what you need` in chat (`warnSeconds`; 0 clears at once, without a warning). When the time is up, every dropped item that isn't kept is removed and chat says how many: `Cleared 580 dropped items.`, with how many were kept.
- **Kept:** items with a custom name, enchanted items, items whose id is in `keepItems`, (`keepNearPlayers`) items within `nearPlayerRadius` blocks of any player, so the pile you're standing in and the items a farm drops next to you stay, and items within 8 blocks of where a player died in the last `keepDeathDropsMinutes` minutes, so a player running back for their things finds them (the game itself removes dropped items after 5 minutes). Death points are remembered in memory only: after a restart, older deaths aren't known. Everything else goes.
- **`/realm:cleanup` for everyone:** `Dropped items: 312 (Overworld 300, Nether 12, End 0).` and `280 of them would be cleared, the others are kept.`, then whether a cleanup is coming (`Clearing in 18 s.`), the threshold and how often it counts, or `Automatic cleanup is disabled.`
- **`/realm:cleanup` for operators:** the same counts in a menu, with **Clear now** (no warning; chat says `Sam cleared 580 dropped items.`), **Clear in 30 s** (warns everyone first) and, while one is coming, **Call off the coming cleanup** (chat says `The dropped item cleanup was called off.`). Disabling **Automatic cleanup** also calls off one that's coming.
- Experience orbs, arrows and mobs are never touched.

### Commands

| Command | Who | What it does |
|---|---|---|
| `/realm:cleanup` | Everyone | Shows the dropped items in each dimension and when they're cleared (above 500, `threshold`, counted every 60 s, `checkSeconds`). Operators get a menu to clear them now, clear after a 30 s warning (`warnSeconds`) or call off a coming cleanup |

### Configuration (`scripts/config.js` → `CONFIG`)

| Option | Default | Description |
|---|---|---|
| `enabled` | `true` | Clear dropped items automatically when there are too many. Disabled: only operators' `/realm:cleanup` clears them |
| `threshold` | `500` | Dropped items in all dimensions together that start a cleanup (100–5000 in game) |
| `checkSeconds` | `60` | Seconds between counts (10–600 in game) |
| `warnSeconds` | `30` | Seconds between the chat warning and the clearing; 0 = no warning (0–120 in game) |
| `keepNearPlayers` | `true` | Keep items lying near a player |
| `nearPlayerRadius` | `4` | Blocks around each player where items are kept (1–16 in game) |
| `keepDeathDropsMinutes` | `5` | Keep items within 8 blocks of where a player died for this many minutes after the death; `0` = don't (0–30 in game) |
| `keepItems` | `shulker_box`, `minecraft:elytra`, `minecraft:nether_star`, `minecraft:totem_of_undying`, `minecraft:dragon_egg`, `minecraft:beacon`, `minecraft:heavy_core`, `minecraft:enchanted_book` | Item ids never cleared. An entry matches any id ending with it, so `shulker_box` covers every color. Renamed and enchanted items are always kept as well |

Operators can change `enabled`, `threshold`, `checkSeconds`, `warnSeconds`, `keepNearPlayers`, `nearPlayerRadius` and `keepDeathDropsMinutes` in game with `/realm:config`; they apply from the next count. `keepItems` stays in `config.js`.

### Saved data

| Key | Scope | Contents |
|---|---|---|
| `cleanup:cfg` | World | Settings changed in `/realm:config` |

A coming cleanup is kept in memory only: a restart during the warning calls it off.

### How it works

- Once a second the pack checks whether a count is due; a count is one `getEntities({ type: "minecraft:item" })` per dimension, and a look at each item's stack to leave out the kept ones.
- Player deaths come from `afterEvents.entityDie` (players only); the last 50 death points are kept in memory.
- Clearing reads the items again, skips any picked up meanwhile, and removes the rest with `Entity.remove()` (no drops, nothing left behind) in a `system.runJob` job, 50 at a time.

---

## Chairs — `chairs_bp`

Sit on any stair or bottom slab, which makes the furnished houses on mc.nish.software feel lived in.

### How to use

1. Tap a stair or a bottom slab with an empty hand, standing within 2.5 blocks of it. You sit on it, facing away from the stair's back.
2. Sneak to stand up (on touch screens, the dismount button). The bar above the hotbar reminds you when you sit.
3. Run `/realm:sit` to sit down right where you stand.

### What players see

- Works on every stair that isn't upside down and every bottom slab, in any wood or stone: oak, stone brick and quartz stairs alike. Upside-down stairs, top slabs and double slabs (copper ones included) do nothing.
- The two blocks above the seat must be air, so you can't sit with your head in a ceiling.
- One player per seat: tapping a taken seat says `Someone is already sitting there`.
- Breaking the stair or slab stands its rider up. Seats nobody sits on vanish within a second.
- You can still use blocks and items while seated. The AFK pack still marks a seated, idle player as AFK, and sitting adds nothing to the Stats pack's distance.

### Commands

| Command | Who | What it does |
|---|---|---|
| `/realm:sit` | Everyone | Sits you down where you stand (on the ground). Sneak to stand up |

### Configuration (`scripts/config.js` → `CONFIG`)

| Option | Default | Description |
|---|---|---|
| `blocks` | `["*_stairs", "*_slab"]` | What can be sat on, `*` as a wildcard. Stairs must not be upside down and slabs must be bottom slabs |
| `maxReach` | `2.5` | Farthest the seat may be from the player's feet, in blocks (1–5 in game) |
| `cleanupTicks` | `20` | How often (ticks) empty seats, and seats whose block is gone, are removed |
| `seatHeight` | `0.25` | Height of the seat above the bottom of the block. Raise or lower it in steps of `0.05` if players sit too high or too low |

Operators can change `maxReach` in game with `/realm:config`. `cleanupTicks` is fixed when the world starts, so `/realm:config` only shows it.

### Saved data

| Key | Scope | Contents |
|---|---|---|
| `chairs:cfg` | World | Settings changed in `/realm:config` |

Seats are entities and are cleaned up; any left over from before a restart are removed as soon as their chunk loads.

### The seat entity

`entities/seat.json` defines `realm:seat`: not spawnable naturally, summonable, a tiny collision box, no gravity or collision, not pushable, immune to all damage, no AI, and a `minecraft:rideable` with one seat for players. The pack has no resource pack, so the game has no model for it and draws nothing. If a seat ever shows up under a player, a `chairs_rp` resource pack with an empty model is the fix.

### How it works

- `world.beforeEvents.playerInteractWithBlock` cancels the tap when it is the first event of the press, the hand is empty, the player isn't sneaking or already riding, the block can be sat on, the two blocks above are air and the seat is within `maxReach`.
- On the next tick the pack spawns `realm:seat` in the block, turns the player to face away from a stair's back (its `weirdo_direction` state; slabs keep your facing) and adds them as its rider.
- Every `cleanupTicks`, seats without a rider, and block seats whose stair or slab is gone, are removed.

---

## Townsfolk — `npc_bp`

Twelve named townsfolk that operators place around town: Mara the Cartographer, Old Tobin the Fisherman, Warden Reyes, Elsie the Innkeeper, Mayor Bram, Quill the Trader, Ida the Relicsmith, Sol the Sky-reader, Brother Hollis the Chapel Keeper, Moss the Gravedigger, Wren the Stable Girl and Bea the Cook. They turn to face you as you walk up, mutter to themselves now and then, go home at night and come back at dawn, and greet you depending on the time of day and the weather. Tap one to talk: the menu lists what the realm's other packs offer at that NPC, such as Quill's market from [Crowns](#crowns--crowns_bp), the stories of [Story Questlines](#story-questlines--saga_bp) or Sol's forecast from the [Weather Almanac](#weather-almanac--weather_bp). The townsfolk are the game's own NPC entities, so operators can give each one any of the game's NPC skins.

### How to use

1. Run `/realm:npc` and pick **Who lives here?** (or run `/realm:npc_who` for the list in chat) to see who lives on the realm and where: each townsfolk with the distance and direction from you, like `Mara the Cartographer - 240m NE (cartographer)`.
2. Walk up to one. They turn to face you, and now and then say something above their head (`Where did I leave my compass?`).
3. Tap them to talk. The menu greets you (`Mara: "Morning, Steve! The light's perfect for surveying."`) and lists what they can do for you, then **Who lives here?** (where everyone is) and **Goodbye**. What's on the list depends on which packs the realm has: Quill opens the **Market**, for example.
4. At night, townsfolk with a home go there; they're back at their post at dawn.
5. **Operators:** `/realm:npc` has every tool as a button: **Add or move a townsfolk here**, **Set a home here**, **Remove the nearest townsfolk** and **List with coordinates**. Or stand where an NPC should live, face the way it should look back, and run `/realm:npc_add <id>` (`mara`, `tobin`, `reyes`, `elsie`, `bram`, `quill`, `ida`, `sol`, `hollis`, `moss`, `wren`, `bea`). To pick a skin, sneak and tap the NPC in creative mode: that opens the game's NPC editor (only the skin matters; the name comes from `config.js`). Set where it sleeps with `/realm:npc_home <id>` (run it at its post to clear the home), list everyone with `/realm:npc_list`, and remove the nearest NPC with `/realm:npc_remove`. `/realm:config` → **Townsfolk** switches the turning, idle lines and night routine.

### What players see

- **The NPCs** show their name in yellow and their trade in gray above their heads (`Mara the Cartographer`). They can't be hurt, pushed away or led off: one that's moved is put back at its spot.
- **Turning:** a townsfolk turns, in steps, toward the nearest player within 8 blocks (`faceRange`), and back to the way it was placed when nobody is near.
- **Idle lines:** every 30 to 60 seconds (`idleMinSeconds`, `idleMaxSeconds`), if a player is within 12 blocks (`idleRange`), the NPC's name turns into a line for 3 seconds (`speechSeconds`), like a speech bubble. Mostly its own chatter, sometimes a remark about the time of day or the weather.
- **Greetings** in the menu fit the moment: morning, day, evening or night, or the rain or a thunderstorm (in the Overworld). `{player}` in a line is your name.
- **Night routine:** from dusk (time 13000, `nightStart`) to just before sunrise (23000, `nightEnd`), a townsfolk with a home is at home instead of its post (`nightRoutine`). It moves instantly, when the spot it's going to is loaded.
- **The menu:** title is the NPC's name, then a greeting, then the offers from other packs in their order, **Who lives here?**, and **Goodbye**. Who lives here? lists every placed townsfolk with distance and direction, nearest first (`in the Nether` for another dimension).
- **The default townsfolk** (ids are fixed; other packs and the stories use them):

  | id | Name | Roles |
  |---|---|---|
  | `mara` | Mara the Cartographer | `cartographer`, `questgiver` |
  | `tobin` | Old Tobin the Fisherman | `fisher`, `questgiver` |
  | `reyes` | Warden Reyes | `warden`, `guildmaster`, `questgiver` |
  | `elsie` | Elsie the Innkeeper | `innkeeper`, `questgiver` |
  | `bram` | Mayor Bram | `mayor`, `questgiver` |
  | `quill` | Quill the Trader | `merchant`, `questgiver` |
  | `ida` | Ida the Relicsmith | `relicsmith`, `questgiver` |
  | `sol` | Sol the Sky-reader | `skymage`, `questgiver` |
  | `hollis` | Brother Hollis the Chapel Keeper | `priest`, `questgiver` |
  | `moss` | Moss the Gravedigger | `gravedigger`, `questgiver` |
  | `wren` | Wren the Stable Girl | `stablehand`, `questgiver` |
  | `bea` | Bea the Cook | `chef`, `questgiver` |

  Roles decide what other packs offer: `merchant` (the market of [Crowns](#crowns--crowns_bp)), `questgiver` (stories and daily favors; [Story Questlines](#story-questlines--saga_bp) picks by NPC id, so the role is a label), `priest`, `gravedigger` and `stablehand` (labels for the story cast), `chef` (recipes from [Kitchen](#kitchen--cooking_bp)), `skymage` (the forecast, [Weather Almanac](#weather-almanac--weather_bp)), and `guildmaster` (`guilds_bp`), `cartographer` (`maps_bp`), `fisher` (`fishing_bp`), `innkeeper` (`waystone_bp`), `mayor` (`town_bp`), `warden` (`bounty_bp`), `relicsmith` (`relics_bp`).
- **A missing NPC comes back:** if a townsfolk isn't where it belongs while a player has been within 24 blocks of that spot for about 6 seconds (`respawnRange`), it's found again by its tags or spawned again there. A spawned-again NPC has the default skin until an operator picks one again. Each townsfolk exists once: any second copy is removed when its chunk loads.

### Commands

| Command | Who | What it does |
|---|---|---|
| `/realm:npc` | Everyone | The townsfolk menu: **Who lives here?**, and for operators Add or move a townsfolk here (pick one from a list), Set a home here, Remove the nearest townsfolk, List with coordinates |
| `/realm:npc_who` | Everyone | Lists the townsfolk on the realm in chat with their distance and direction from you, and their roles |
| `/realm:npc_add <id>` | Operators | Places that townsfolk where you stand, facing you (moves it there if it's already placed) |
| `/realm:npc_remove` | Operators | Removes the nearest townsfolk within 5 blocks (`removeRange`) and forgets its spot |
| `/realm:npc_home <id>` | Operators | Where that townsfolk goes at night (time 13000 to 23000, `nightStart`/`nightEnd`); in the same dimension as its post. Run it within 2 blocks of the post to clear the home |
| `/realm:npc_list` | Operators | Every placed townsfolk with its coordinates, dimension, home and whether it's loaded, and the ids not placed yet |

### Configuration (`scripts/config.js` → `CONFIG`)

| Option | Default | Description |
|---|---|---|
| `enabled` | `true` | Townsfolk turn to face players, say idle lines and go home at night. Taps and the menu work either way |
| `faceRange` | `8` | Townsfolk turn toward the nearest player within this many blocks. `0` = never turn |
| `idleRange` | `12` | An idle line is only said while a player is within this many blocks |
| `idleMinSeconds` | `30` | Shortest time between an NPC's idle lines, in seconds |
| `idleMaxSeconds` | `60` | Longest time between an NPC's idle lines, in seconds |
| `speechSeconds` | `3` | How long an idle line stays above the NPC |
| `nightRoutine` | `true` | Townsfolk with a home go there at night and back to their post at dawn |
| `nightStart` | `13000` | Night starts at this time of day (ticks; 13000 = dusk) |
| `nightEnd` | `23000` | Night ends at this time of day (23000 = just before sunrise) |
| `removeRange` | `5` | How far `/realm:npc_remove` looks, in blocks |
| `respawnRange` | `24` | A missing NPC is spawned again once a player has been this close to its spot for a few seconds |
| `townsfolk` | the 12 above | `{ id, name, title, roles, greetings: { morning, day, evening, night, rain, thunder }, idle }`: the name (yellow) and title (gray) above the NPC, its roles, and its lines. `{player}` in a line is the player's name. Keep the ids: saved spots, tags and other packs use them. An id removed here removes that NPC when its chunk loads |

Operators can change `enabled`, `faceRange`, `idleMinSeconds`, `idleMaxSeconds` and `nightRoutine` in game with `/realm:config` (**Townsfolk**). The rest stays in `config.js`.

### Saved data

| Key | Scope | Contents |
|---|---|---|
| `npc:list` | World | JSON `[{ id, dim, x, y, z, yaw, eid, home? }]`: each placed townsfolk's post, the way it faces, its entity id and its home `{ x, y, z }` |
| `npc:weather` | World | The Overworld weather from the last change (`Clear`, `Rain` or `Thunder`), for weather greetings; scripts can't read the weather |
| `npc:cfg` | World | Settings changed in `/realm:config` |

### How it works

- Each townsfolk is a vanilla `minecraft:npc` with the tags `realm:npc`, `realm:npc_id:<id>`, `realm:npc_role:<role>` (one per role) and `realm:npc_owner:npc_bp`. Its `nameTag` is its name.
- **One of each:** the saved entity id is the real one (entity ids stay the same across loads). An NPC entity of this pack that loads (`afterEvents.entityLoad`, and a check of loaded NPCs every 10 seconds) is removed if its townsfolk isn't placed any more, or if the saved one is loaded too; if the saved one isn't loaded, the newcomer takes over. A townsfolk whose entity isn't loaded, while its spot is loaded and a player has been near it for 3 checks 2 seconds apart, is looked for by its tags and otherwise spawned again.
- **Every 10 ticks** each loaded townsfolk is teleported back if it's more than 1.5 blocks from where it belongs (post, or home at night; with `enabled` off, always its post), and otherwise, with `enabled` on, turned up to 45 degrees toward the nearest player (not spectators) with a teleport in place (`rotation`). A tap turns it toward the player at once, in place.
- **Taps** (`beforeEvents.playerInteractWithEntity`) on an NPC with `realm:npc_owner:npc_bp` are canceled, except an operator sneaking in creative mode, who gets the game's NPC editor. Then the offer round: `realm:npc_talk` `{ req, player, npc, roles, name }` goes out, `realm:npc_offer` `{ req, pack, key, label, order? }` answers are collected for 4 ticks, the menu lists them by `order` (default 50) then label (offers with an empty label, or claiming to be from `npc_bp`, are ignored), and a pick sends `realm:npc_choose` `{ player, npc, pack, key }` to the pack that offered it. `realm:npc_talk` also tells quest packs the player talked to that NPC. NPCs of other packs (the [Merchant Caravan](#merchant-caravan--caravan_bp)'s traders) carry their own owner tag and are left to them.
- **Weather** can't be read by scripts, so the pack remembers the last `afterEvents.weatherChange` in the Overworld (the event names it `overworld` on current servers; both spellings are accepted).
- **Summon for other packs:** `realm:npc_summon` `{ id, player }` places (or moves) townsfolk `id` at that player, exactly like `/realm:npc_add <id>` run by them, and answers `realm:npc_summoned` `{ id, player, ok, error? }`. Only honored when the player is an operator (`GameDirectors`); the Relics pack uses it to bring the relicsmith.

---

## Crowns — `crowns_bp`

The realm's currency. Crowns are paid by other packs (quests, bounties, stories and more), earned by selling harvest, loot and ores at the market, and spent on supplies there or on rare goods from the [Merchant Caravan](#merchant-caravan--caravan_bp). Everyone gets a small bonus for their first visit of each day, can pay other players, and can see who's richest. The market is Quill the Trader's: tap a merchant from [Townsfolk](#townsfolk--npc_bp) and pick **Market**.

### How to use

1. Run `/realm:crowns` for the Crowns menu: **Balance and top list** (your balance, your rank and the top 10; also `/realm:crowns_balance`), **Pay a player**, and **Market** where the realm opens it anywhere.
2. Log in each day for the daily bonus: `+5 Crowns (Daily login bonus. Balance: 25)` in chat, once per UTC day.
3. To sell or buy, find Quill the Trader (`/realm:npc` says where), tap them and pick **Market**. **Sell** lists what you carry that the market buys; pick one and slide how many. **Buy** lists the supplies for sale.
4. Pay a friend from the menu (**Pay a player**: pick who and type the amount) or with `/realm:crowns_pay <player> <amount>`, for example `/realm:crowns_pay Steve 25`.
5. **Operators:** the menu's **Give Crowns** (one player or everyone online), or `/realm:crowns_give <player> <amount>`, gives Crowns (a negative amount takes them). `/realm:config` → **Crowns** sets the daily bonus, the starting balance, whether the market is open and whether `/realm:crowns_market` opens it anywhere. Prices are the `sell` and `buy` lists in `config.js`.

### What players see

- **The menu:** `/realm:crowns` shows `Your balance: 120 Crowns` and a button for each thing you can do: **Balance and top list**, **Pay a player**, **Market** (only with the market open anywhere) and, for operators, **Give Crowns**.
- **Balance:** **Balance and top list** (or `/realm:crowns_balance`) shows `Your balance: 120 Crowns`, `Rank: #3 of 12` and the top 10 (`topCount`), you in green. With the market open anywhere, it has a **Market** button.
- **Getting Crowns:** any pack can pay into the `crowns` scoreboard; packs say so in chat, like `+25 Crowns (Bounty: Gerald the Unexploded)`. New players start with `startBalance` (default 0). The daily bonus (default 5, `dailyBonus`) comes about 10 seconds after your first join of each UTC day, or when a new UTC day starts while you play.
- **Paying:** **Pay a player** picks an online player from a list and takes the amount as a typed whole number; `/realm:crowns_pay` takes one online player and a whole amount from 1 to 100,000 (`maxPay`). You can't pay yourself or send more than you have. You see `You paid 25 Crowns to Steve. Balance: 75`; they see `+25 Crowns (from Alex. Balance: 125)`.
- **The market** (tap a townsfolk with the `merchant` role, `merchantRole`, and pick **Market**):
  - **Sell** shows only what you have enough of, like `Wheat: 64` / `8 for 1 Crown`. A slider picks how many, in whole lots; chat says `+8 Crowns (Sold 64 Wheat. Balance: 108)`. It counts your main inventory and hotbar (not armor or the offhand), and counts again when you confirm, so nothing sells twice. Storm Glass and Relic Shards are recognized by their lore; plain prismarine crystals and amethyst shards aren't bought, and relics never are.
  - **Buy** lists supplies with their price; a slider picks how many lots (up to 16, and what you can afford). Chat says `-6 Crowns (Bought 8 Bread. Balance: 102)`; what doesn't fit in your inventory drops at your feet.
- **`/realm:crowns_market`:** opens the market when `marketAnywhere` is enabled; otherwise it says `The market is at Quill the Trader: tap them to trade.`
- **Default prices.** The market buys:

  | Item | Crowns |
  |---|---|
  | Wheat, bone, string, coal, copper ingot, lapis lazuli | 1 per 8 |
  | Carrot, potato, beetroot, melon slice, sugar cane, rotten flesh, redstone | 1 per 16 |
  | Pumpkin, cod, salmon, gunpowder, leather | 1 per 4 |
  | Iron ingot | 3 each |
  | Gold ingot | 4 each |
  | Relic Shard | 4 each |
  | Emerald | 5 each |
  | Storm Glass | 15 each |
  | Diamond | 25 each |

  It sells: 4 bread for 3, 4 steak (cooked beef) for 5, 16 torches for 2, 16 arrows for 4, 16 bone meal for 3, an empty map for 8, a lead for 6, a name tag for 20 and a saddle for 25.

### Commands

| Command | Who | What it does |
|---|---|---|
| `/realm:crowns` | Everyone | The Crowns menu: balance and top list, pay a player, the market (where it's open anywhere, default off, `marketAnywhere`), and for operators, give Crowns |
| `/realm:crowns_balance` | Everyone | Your balance, rank and the top 10 (`topCount`) |
| `/realm:crowns_pay <player> <amount>` | Everyone | Pays one online player from your balance (1 to 100,000, `maxPay`) |
| `/realm:crowns_market` | Everyone | Opens the market if it's open anywhere (disabled by default, `marketAnywhere`); otherwise tells you to visit Quill the Trader (`merchantName`) |
| `/realm:crowns_give <player> <amount>` | Operators | Gives Crowns to the players picked (`@a` works); a negative amount takes them, down to 0 |

### Configuration (`scripts/config.js` → `CONFIG`)

| Option | Default | Description |
|---|---|---|
| `startBalance` | `0` | Crowns a player gets the first time they join with this pack installed |
| `dailyBonus` | `5` | Crowns for each player's first visit of each UTC day. `0` = none |
| `marketEnabled` | `true` | The market is open: merchants offer it, and `/realm:crowns_market` works where allowed |
| `marketAnywhere` | `false` | `/realm:crowns_market` opens the market anywhere; when `false` it points players to the merchant |
| `merchantRole` | `"merchant"` | The townsfolk role that offers the market (Quill the Trader has it) |
| `merchantName` | `"Quill the Trader"` | Who `/realm:crowns_market` sends players to |
| `maxPay` | `100000` | Most Crowns one `/realm:crowns_pay` can send |
| `topCount` | `10` | How many players the top list shows |
| `sell` | 24 items (above) | What the market buys: `{ item, per, price, name?, lore? }`, `per` items for `price` Crowns. With `lore`, only items whose first lore line is exactly that; without it, only items with no lore |
| `buy` | 9 items (above) | What the market sells: `{ item, amount, price, name? }`, `amount` items for `price` Crowns |

Operators can change `dailyBonus`, `startBalance`, `marketAnywhere` and `marketEnabled` in game with `/realm:config` (**Crowns**). The rest stays in `config.js`.

### Saved data

| Key | Scope | Contents |
|---|---|---|
| `crowns` | Scoreboard | Every player's balance. Any pack may add to it or spend from it; operators can also use `/scoreboard players` |
| `crowns:joined` | Player | `true` once the starting balance was given |
| `crowns:bonus` | Player | The UTC day number (days since 1970) of the last daily bonus |
| `crowns:names` | World | JSON `{ scoreboard id: name }` of up to 800 players, so the top list shows names of players who are offline |
| `crowns:cfg` | World | Settings changed in `/realm:config` |

### How it works

- Balances are the `crowns` scoreboard (display name `Crowns`), so other packs pay and charge without this pack: they add to the objective and say so in chat. This pack only reads it for the menu, and writes it for payments, the bonus and the market.
- **The market offer:** on `realm:npc_talk` with the `merchant` role, the pack answers `realm:npc_offer` with **Market** (`order` 10); on `realm:npc_choose` for it, it opens the market for that player.
- **Selling** removes items slot by slot from the inventory container after counting again; items with a `relic:id` property are never counted.
- The daily bonus is checked 10 seconds after joining and once a minute for everyone online.

---

## Merchant Caravan — `caravan_bp`

Once a week a merchant caravan comes to town: three traders and their pack llamas set up at one of the arrival spots operators picked, stay for 40 real minutes (about two in-game days) and sell rare goods for [Crowns](#crowns--crowns_bp): a Mending book, a totem, music discs, armor trims, pottery sherds, golden apples, Storm Glass and more, a different selection each visit and only a few of each. They also buy Storm Glass and Relic Shards. Chat announces when the caravan arrives and when it leaves, and `/realm:caravan` tells you when the next one comes.

### How to use

1. Run `/realm:caravan` for the caravan menu; it and its **Caravan info** button (also `/realm:caravan_info`, in chat) say when the next caravan comes (`The next merchant caravan comes in 3d 5h (Saturday 18:00 UTC), and stays 40m.`) or, while it's here, where it is (`at Market Square (120, -45), 240m NE of you. It leaves in 23m.`).
2. When it arrives, chat says `A merchant caravan has arrived at Market Square (120, -45)! It stays 40m. Tap a trader to buy rare goods for Crowns.` Go there.
3. Tap any trader. The shop lists this visit's goods with their price and how many are left; pick one and choose how many. Chat confirms: `-60 Crowns (Caravan: bought 1 Enchanted Book (Mending))`.
4. Have Storm Glass or Relic Shards? Pick **Sell to the caravan** in the shop.
5. Five minutes before it leaves, chat warns you; then it packs up and is gone until next time.
6. **Operators:** stand where the caravan should set up and pick **Add an arrival spot here** in `/realm:caravan` (or run `/realm:caravan_spot [name]`, for example `/realm:caravan_spot "Market Square"`); add a few and each visit picks one at random. **Remove an arrival spot** lists them to pick from (`/realm:caravan_spot_remove` removes the nearest one). **Bring the caravan now** (or `/realm:caravan_call`) brings it now. `/realm:config` → **Merchant Caravan** sets how often it comes, which day, the hour, how long it stays and how many goods it brings. The goods are `goods` in `config.js`.

### What players see

- **When:** every 7 days (`everyDays`) at 18:00 UTC (`hourUtc`). The day is counted from 1 January 1970, a Thursday, shifted by `offsetDays`: with 7 days, `0` is Thursday and the default `2` is Saturday. If nobody is online when it's due, it comes when someone joins within 24 hours (`lateHours`) and stays its full time. The first caravan after installing the pack is the next one due.
- **Where:** at a random one of the operators' spots (`/realm:caravan_spot`). With no spots, it comes to world spawn, on the surface. Arrival happens even far from everyone: the traders appear once a player comes near enough for the spot to load. The caravan places and breaks no blocks.
- **The caravan:** three traders (`traders`: Zahir the Spice Merchant, Old Marisol and Fennick the Peddler), one at the spot and the others about 3 blocks to the sides where there's room, with their names in gold. Two pack llamas (`llamas`, `Caravan Llama`) come along and are brought back if they stray more than 10 blocks. Traders turn to face the nearest player within 8 blocks (`faceRange`), can't be hurt, and go back to their place if pushed.
- **The shop:** `You have 140 Crowns. The caravan leaves in 23m.`, then one button per good (`Enchanted Book (Mending)` / `60 Crowns, 1 left`, or `Sold out`), **Sell to the caravan** and **Goodbye**. Stock is shared: what one player buys, others can't. A purchase can be up to 16 at once, as far as the stock and your Crowns go. Goods that don't fit in your inventory drop at your feet.
- **Selling to the caravan:** Storm Glass for 18 Crowns and Relic Shards for 5 Crowns each (`buys`), recognized by their lore; better than the market's prices.
- **Leaving:** `The merchant caravan leaves in 5m.` (`warnMinutes`), then `The merchant caravan has packed up and left. Next visit in 6d 23h.` Traders and llamas are removed; any that were in an unloaded chunk are removed when it loads.
- **Default goods** (each visit picks 8, `stockSize`; price in Crowns, then stock per visit): Enchanted Book (Mending) 60, 1; Enchanted Book (Unbreaking III) 30, 2; Totem of Undying 80, 1; Heart of the Sea 45, 1; 2 Golden Apples 20, 3; Enchanted Golden Apple 150, 1; Name Tag 12, 4; music discs Pigstep 40, Otherside 35 and Relic 35, 1 each; armor trims Silence 90, 1, Wayfinder 20, 2, Coast 20, 2 and Spire 40, 1; Netherite Upgrade 70, 1; Prize, Heart, Skull and Archer pottery sherds 8, 2 each; Sniffer Egg 40, 1; 2 Echo Shards 20, 2; 2 Nautilus Shells 8, 3; Storm Glass 25, 2; 2 Relic Shards 10, 4.

### Commands

| Command | Who | What it does |
|---|---|---|
| `/realm:caravan` | Everyone | The caravan menu: caravan info, and for operators, add or remove an arrival spot and bring the caravan now |
| `/realm:caravan_info` | Everyone | In chat: when the next caravan comes (every 7 days at 18:00 UTC, `everyDays`, `hourUtc`), or where it is and when it leaves. Operators also see the arrival spots |
| `/realm:caravan_spot [name]` | Operators | Adds an arrival spot where you stand (up to 20); without a name it's `Spot 1`, `Spot 2`... |
| `/realm:caravan_spot_remove` | Operators | Removes the nearest arrival spot within 32 blocks (`removeRange`) |
| `/realm:caravan_call` | Operators | Brings the caravan now, for the usual stay (40 minutes, `stayMinutes`). It counts as the visit due most recently |

### Configuration (`scripts/config.js` → `CONFIG`)

| Option | Default | Description |
|---|---|---|
| `enabled` | `true` | Caravans come on their own schedule. `/realm:caravan_call` works either way |
| `everyDays` | `7` | A caravan comes every this many real days (1–30 in game) |
| `offsetDays` | `2` | Shifts the visit day: visit days are days since 1 January 1970 where (day - `offsetDays`) is a multiple of `everyDays`. With 7: 0 = Thursday, 1 = Friday, 2 = Saturday, 3 = Sunday. Changing the schedule can bring a caravan early once |
| `hourUtc` | `18` | The hour it arrives, UTC |
| `stayMinutes` | `40` | How long it stays, in real minutes (40 = two in-game days) |
| `lateHours` | `24` | If nobody is online when it's due, it comes when someone joins within this many hours, else that visit is skipped |
| `warnMinutes` | `5` | Chat warns this many minutes before it leaves. `0` = no warning |
| `stockSize` | `8` | Goods for sale per visit, picked at random from `goods` |
| `traders` | 3 names | One trader NPC per name (up to 6) |
| `llamas` | `2` | Pack llamas that come along |
| `faceRange` | `8` | Traders turn toward the nearest player within this many blocks. `0` = never |
| `respawnRange` | `24` | A missing trader is spawned again once a player has been this close to the caravan for a few seconds |
| `removeRange` | `32` | How far `/realm:caravan_spot_remove` looks, in blocks |
| `goods` | 24 goods (above) | What the traders may sell: `{ id, item, amount, price, stock, name?, nameTag?, lore?, enchant?: { id, level } }`. `amount` items per purchase for `price` Crowns, `stock` purchases per visit shared by everyone. Goods the game can't make (an unknown item, an enchantment it refuses) are skipped |
| `buys` | Storm Glass 18, Relic Shard 5 | What the traders buy: `{ item, name, lore, price }`, recognized by the exact first lore line |

Operators can change `enabled`, `everyDays`, `offsetDays`, `hourUtc`, `stayMinutes` and `stockSize` in game with `/realm:config` (**Merchant Caravan**). The rest stays in `config.js`.

### Saved data

| Key | Scope | Contents |
|---|---|---|
| `caravan:spots` | World | JSON `[{ name, dim, x, y, z }]`: the arrival spots |
| `caravan:visit` | World | JSON of the caravan while it's here: `{ v, until, spot, surface, placed, traders: [{ name, eid, at }], llamas, stock: [{ id, left }], warned }` |
| `caravan:last` | World | Arrival time (ms) of the last scheduled visit already handled |
| `caravan:cfg` | World | Settings changed in `/realm:config` |

### How it works

- Every 2 seconds the pack checks the schedule (only while someone is online), the time left and the caravan itself. Traders are spawned once the spot's chunk is loaded; at world spawn the height is found with `getTopmostBlock` then.
- Traders are vanilla `minecraft:npc` entities tagged `realm:npc`, `realm:npc_owner:caravan_bp`, `realm:caravan`, `realm:caravan_v:<visit>` and `realm:caravan_trader:<n>`; llamas (`minecraft:trader_llama`) are tagged `realm:caravan`, `realm:caravan_v:<visit>` and `realm:caravan_llama` and named, so they never despawn. The [Townsfolk](#townsfolk--npc_bp) pack leaves NPCs with another owner tag alone; this pack handles taps on its own (`beforeEvents.playerInteractWithEntity`, canceled except for an operator sneaking in creative mode).
- Any caravan entity from another visit, or found after the caravan left, is removed when its chunk loads (`afterEvents.entityLoad`, and a check of loaded entities every 10 seconds); so is a second copy of a trader. A trader that's missing while a player has been near for 6 seconds is found by its tags or spawned again.
- On arrival the pack sends `realm:sky_event` `{ kind: "caravan", dim, x, z, text }`, so packs that announce events can pick it up.
- Prices are paid from and into the `crowns` scoreboard directly, so the shop works with or without the Crowns pack (with it, players can see their balance). Enchanted books are made with the item's enchantable component.

---

## Story Questlines — `saga_bp`

An RPG quest engine told by the realm's townsfolk: 21 stories and 151 chapters (about 40 hours). A five-act main story, **The Lantern and the Hollow**, that starts with two prologue stories (**The Drowned Bell** and **The Cartographer's Last Map**), plus side questlines that open up as the world does, and a **daily favor** from each questgiver. Each chapter starts with a conversation, gives you things to do (go somewhere, sneak past guards, escort someone, answer a riddle, hold a place against waves, follow a wisp, fight a champion...), and ends when you report back, often with a choice that changes later chapters, the ending, and which guild thanks you. A tracker above the hotbar points the way, **Ask for a hint** helps when you're stuck, and `/realm:saga` is your story log, with a **Codex** of every secret you've uncovered. Needs the [Townsfolk](#townsfolk--npc_bp) pack: the stories are told through its NPCs.

### How to use

1. Tap a townsfolk with a story button: `Main story: The Drowned Bell` (Old Tobin) or `Main story: The Cartographer's Last Map` (Mara) to begin. Read the pages with **Next**, then pick **Accept** (or **Not now**: you can come back any time). Some intros end with a choice instead of Accept.
2. Chat lists the chapter's objectives. Do them in any order (a few boss chapters go one step at a time). The tracker on the right side of the screen (above the scoreboard) always shows where to go next (`Drowned Bell: Lighthouse NE 240m`), or who to report to.
3. Stuck? Open `/realm:saga`, pick **Current quests** and the story, then **Ask for a hint**: it says what to do and gives the exact coordinates of every place in the chapter, for a quarter of the chapter's levels and Crowns (once per chapter).
4. When everything is done, chat says `[Story] The Drowned Bell: "Salt and Silence" is done. Go back to Old Tobin to hear what happens.` Tap that NPC and pick the story (`Done: report back`). If the chapter ends with a choice, nothing is final until you pick one: close the form and the report waits.
5. Finished stories open new ones: chat names them, and **Available** in `/realm:saga` lists what you can start and what's still locked.
6. Each questgiver also has a **Daily favor** button: a short job, a new one each day (UTC), for a few levels and Crowns.
7. In a party (the [Parties](#parties--party_bp) pack), mates within 64 blocks on the same chapter share progress for defeating, keeping watch in a storm and reaching places.
8. Don't want the tracker? Disable **Story tracker** in `/realm:prefs`. **Where my story tracker shows** there moves it to the middle of the screen or above the hotbar (the right side and the middle can't be covered by other add-ons, such as waypoint add-ons, that redraw the line above the hotbar all the time).
9. **Operators:** stories need places (a lighthouse, an old chapel, the seals...). By default the pack picks a spot for a place the first time a chapter needs it and builds its building when a player comes within 64 blocks, saving the terrain first. `/realm:saga_places` (also in `/realm:saga`) lists every place with its status and lets you **Teleport**, **Set here**, **Build here** (a green outline preview with Build here, Rotate, Look around and Cancel), **Rebuild**, **Remove** (puts the terrain back exactly) and **Relocate**. `/realm:saga_place <name>` sets a spot where you stand without building. **Operator tools** in `/realm:saga` finish a stuck player's current step or reset their stories. `/realm:config` → **Story Questlines** has the switches.

### What players see

- **Offers at the townsfolk:** an NPC with something for you shows a button: `Main story: <title>` or `Story: <title>` with `New story`, `Chapter 3: <title>` (the next chapter), `Done: report back`, or a reminder while you're working on it; `Answer: <riddle>` when the chapter needs an answer from them; and `Daily favor: <job>`.
- **Dialogues** are short pages from the NPC (`Chapter 2 of 6: The Drowned Choir` on top, and the story's tones as tags such as `[mystery] [eerie]`). Closing one is the same as **Not now**; nothing is lost. When the same NPC tells the next chapter, its intro opens right after the report.
- **Branches:** choices set flags that decide which chapters you get, what people say, and which endings are offered later; some choices only appear if you made other choices before (or have enough guild reputation). Chapter numbers count the chapters you actually get.
- **Objectives**, and what counts (the tracker shows the nearest unfinished one; `secret` steps show no arrow until you ask for a hint):
  - **Talk:** tap the NPC.
  - **Reach:** stand within the radius of a place or a spot a set distance from world spawn (across, height doesn't matter), or be in a dimension (`in the Nether`), below or above a height.
  - **Deliver:** tap the NPC with the items: they take what you have (up to what's still needed) and keep count over several trips (`You give Ida the Relicsmith 12 Iron Ingot (12/24).`). Renamed items are never taken, unless the story asks for an item by name (a dish, a key): then only items with that name count, of any kind. Rename things at an anvil if a story asks you to. A [Kitchen](#kitchen--cooking_bp) dish or rare ingredient must be the real thing, cooked or found, with the Kitchen's description: a renamed food doesn't count.
  - **Collect:** have the items (or an item with that name) in your inventory; they aren't taken.
  - **Defeat:** kill the mobs, sometimes only at night, near a place, or within a time limit (`1:20 left` in the tracker; too slow and it starts over). **Champions** (named, tougher bosses) come when you're within 32 blocks of their place, or near you when they have no place; sea champions swim in the nearest water. Some call for help at half health.
  - **Interact:** tap or hit a block near a place (strike a bell, light candles: lighting with flint and steel counts). Blocks you can't use (a sea lantern, deepslate, an end rod) count when you hit them, and one that breaks at the first hit (an end rod, a candle) still counts.
  - **Keep watch (survive):** stand outdoors, with open sky above you, in a thunderstorm (or rain, or any weather, as the step says) near the place, for some seconds. The log says `Wait for a thunderstorm.` until one comes.
  - **Vigil:** stay at a place for some seconds, sometimes at a time of night, outdoors, or sneaking.
  - **Mine**, **fish:** blocks broken (not ones you placed yourself) and things caught with a rod.
  - **Meet:** a story character (a ghost girl, a witch, an echo) appears at the place: walk up to them (or tap them) to talk. They can't be hurt and can't hurt you. Their conversation may end with a choice.
  - **Inspect:** find clues around a place: faint green sparkles mark them. Walk onto one, or tap a block next to it, to read it (`[Clue 2/4] ...`).
  - **Stealth:** guards walk their rounds around a place. Reach the spot the tracker shows without being seen: guards see about 120 degrees in front of them, up to 10 blocks away (4 while you sneak, or while you wear the disguise the story names), never through walls. Spotted, you're put back at the edge of the area (or the guards attack, in some chapters).
  - **Escort:** someone waits at the start; walk up and they follow your exact path. Keep them alive (monsters may ambush you on the way) and bring them to the destination. If they're hurt, they run back and you try again.
  - **Lead:** put a lead on the animal (some wait where they were lost, named) and bring it to the pen. It stays there as your animal.
  - **Defend:** stand at the place to start; waves of monsters come one after another (the tracker shows `wave 2 of 3`). If the one you're guarding falls, you die, or you leave for 30 seconds, the defense resets to the first wave. Monsters come where they can reach you, in sight of the middle (in a room underground, inside the room, never in the rock or a cave beside it).
  - **Follow:** go to where the trail starts; a glowing wisp drifts along the ground toward somewhere and waits whenever you fall behind. Lose it for 15 seconds and it goes back to the start.
  - **Answer:** a riddle in a text box, from the NPC (`Answer:` button), at a place (it opens when you get there), or from the story log. Capitals, spaces and punctuation don't matter. A wrong answer may call monsters.
  - **Place:** build with the blocks named (breaking them again takes the count back).
  - **Tend**, **tame:** use an item on animals (feed, brush, name tag; each animal counts once) or tame them.
  - **Ride:** ride something (a horse, a boat) a number of blocks.
  - **Sleep:** sleep in a bed; some chapters show a dream when you wake.
  - **Vision:** a short cutscene: the screen fades, titles show each scene (also written in chat), sometimes with darkness and sounds. Sneak to skip it.
  - **Wear:** wear the named item (a helmet, a mask).
  - **Use:** use an item (eat, drink, right-click), sometimes at a place.
  - **Wait:** some real minutes or in-game days pass (`2 days left`); it counts while you're away too (in-game days only while the realm runs).
- **Progress notes:** chat says `[Story] Defeat 12 drowned: done.` and the next step for each objective; for counts of 4 or more, a note shows each quarter where the tracker shows.
- **The tracker** (every 2 seconds): `Drowned Bell: Lighthouse NE 240m`, `here` once you're in range, `in the Nether`, a countdown for timed steps, `report to Old Tobin NE 40m` when the chapter is done, the wisp or the person you're escorting, or `Lighthouse isn't set yet`. With several stories going, it follows the chapter you accepted last. On the right side or above the hotbar, it waits while another pack's note is showing there.
- **Hints:** **Ask for a hint** on a chapter's page shows the chapter's hint, each step's hint, and the exact coordinates of every place in the unfinished steps (and where the NPC you need stands, when loaded), and shows the tracker arrow for secret steps. It costs 25% of the chapter's levels and Crowns (`hintPenalty`, asked for once per chapter; items, relics and titles are kept).
- **Rewards** at the end of each chapter: XP levels and items (some named, with a description), Crowns (on the [Crowns](#crowns--crowns_bp) scoreboard), a **Codex** entry (`[Codex] New entry: ...`), and, through other packs when they're installed, a relic ([Relics](#relics--relics_bp)), a title ([Titles & Trails](#titles--trails--titles_bp)), a `story` page in the [Field Journal](#field-journal--journal_bp) and guild reputation ([Guilds & Reputation](#guilds--reputation--guilds_bp)). Without those packs, those parts are skipped.
- **The story log** (`/realm:saga`): the story you're on and its **Current step**, then **Current quests** (main story first, then side stories and favors; each opens the chapter's page with its objectives, distance and direction, who to report to, **Ask for a hint** and **Hear the intro again**), **Available** (stories to start and who starts them, and the next locked ones with what they need), **Finished** (each story's chapters, your choices and the ending), **Codex** (every lore entry you've found, to reread), **Daily favors** (each questgiver's favor today), and for operators **Story places** and **Operator tools**.
- **Daily favors:** each questgiver offers one favor per player per real day (UTC), picked from that NPC's list (the same pick all day). Accept it at the NPC, do it like any objective, report back for a small reward. You can give one up from its page (no new one until tomorrow).
- **Places:** a place an operator hasn't set is picked by the pack when a chapter first needs it, by the place's rules (coast, under water, deep underground, high ground, the sky; a distance band from world spawn), and built when a player comes within 64 blocks (`buildRange`), never over anything player-made (planks, glass, doors and the like): if the land doesn't suit, the spot moves and chat says so (after three moves any open land will do, but underground and sky places keep their height). The terrain is saved first, so an operator's **Remove** restores it exactly.
- **Creative mode** makes no progress (`skipCreative`).

### The stories

21 stories and 151 chapters: about 40 hours if you play everything. A story opens when the stories under **Opens after** are finished, so most side stories appear as the main story goes on; the ones marked `-` are open from the start. Chapters with branches are counted once each; a player plays most, but not all, of them.

| Story | Kind | Told by | Opens after | Chapters | Feel |
|---|---|---|---|---|---|
| **The Drowned Bell** | Main, prologue | Old Tobin | - | 6 | mystery, eerie, heroic |
| **The Cartographer's Last Map** | Main, prologue | Mara the Cartographer | - | 4 | exploration, mystery, happy |
| **Signs in the Sky** | Main, act 1 | Sol the Sky-reader | The Drowned Bell, The Cartographer's Last Map | 10 | mystery, eerie, cozy, creepy |
| **The Gray Choir** | Main, act 2 | Warden Reyes | Signs in the Sky | 12 | stealth, violent, mystery, tragic, dangerous |
| **Into the Deep** | Main, act 3 | Ida the Relicsmith | The Gray Choir | 10 | scary, exploration, eerie, dangerous, mystery, sad |
| **The Three Seals** | Main, act 4 | Elsie the Innkeeper | Into the Deep | 12 | epic, heroic, dangerous, exploration, sad |
| **Lantern Night** | Main, act 5 | Mayor Bram | The Three Seals | 13 | epic, heroic, violent, sad, scary |
| **A Room at the Inn** | Side | Elsie the Innkeeper | Signs in the Sky | 7 | creepy, sad, eerie |
| **Graveyard Shift** | Side | Moss the Gravedigger | - | 6 | scary, funny, creepy |
| **The Witch's Bargain** | Side | Moss the Gravedigger | The Gray Choir | 7 | creepy, mystery, dangerous |
| **Lamp in the Window** | Side | Brother Hollis | The Gray Choir, saving Brother Hollis | 5 | sad, happy, cozy |
| **Wren's Lost Lambs** | Side | Wren | - | 7 | adorable, happy, funny |
| **The Star Kittens** | Side | Wren | Signs in the Sky | 6 | adorable, sad, cozy |
| **Little Turtles** | Side | Old Tobin | The Drowned Bell | 5 | adorable, heroic, cozy |
| **The One That Got Away** | Side | Old Tobin | - | 5 | happy, funny, heroic |
| **Hearth and Table** | Side | Bea the Cook | - | 7 | cozy, happy, funny, sad |
| **The Wardens' Oath** | Side | Warden Reyes | - | 7 | violent, heroic, dangerous, sad |
| **Smuggler's Run** | Side | Quill the Trader | The Gray Choir | 5 | stealth, funny, dangerous |
| **The Mayor's Burden** | Side | Mayor Bram | The Gray Choir | 5 | sad, funny, mystery |
| **Edges of the Map** | Side | Mara the Cartographer | The Cartographer's Last Map | 7 | exploration, happy, dangerous |
| **The Forge That Sings** | Side | Ida the Relicsmith | Signs in the Sky | 5 | dangerous, epic, mystery |

The daily favors come on top: 48 short jobs, 4 for each of the 12 questgivers, one a day each.

### Commands

| Command | Who | What it does |
|---|---|---|
| `/realm:saga` | Everyone | The story log menu: current quests, available and finished stories, the codex, daily favors; for operators also story places and operator tools |
| `/realm:saga_log` | Everyone | Straight to **Current quests**: each story you're on with its current step |
| `/realm:saga_places` | Operators | Every story place with its status (set, picked, built, missing), coordinates and the stories that use it: Teleport, Set here, Build here (outline preview with Build here, Rotate, Look around, Cancel), Rebuild, Remove (terrain restored), Relocate |
| `/realm:saga_place [name]` | Operators | Sets a story place where you stand, without a building (an earlier building of it is removed first). Without a name, lists the places in chat |
| `/realm:saga_reset <player>` | Operators | Starts the player's stories over: progress, finished chapters, choices, codex and favors. Rewards already given are kept |

### Configuration (`scripts/config.js` → `CONFIG`)

| Option | Default | Description |
|---|---|---|
| `enabled` | `true` | Stories can be started and make progress. Disabled, the story log still opens (`Stories are paused by an operator`) but nothing counts and NPCs offer nothing |
| `tracker` | `true` | The story tracker, for players who haven't chosen in `/realm:prefs` |
| `trackerAt` | `"side"` | Where the tracker and progress notes show for players who haven't chosen in `/realm:prefs`: `"side"` (a panel on the right, above the scoreboard sidebar, drawn by the HUD resource pack `hud_rp`), `"middle"` (the subtitle line in the middle of the screen) or `"hotbar"` (above the hotbar). Add-ons that redraw the action bar every tick can't cover the first two |
| `partyShare` | `true` | Party mates on the same chapter share progress for defeat, survive and reach objectives |
| `partyRange` | `64` | How close (blocks) a party mate must be to share progress |
| `skipCreative` | `true` | Players in creative mode make no story progress |
| `opHints` | `true` | Tell operators online when a player's chapter needs a place nobody has set and the pack can't pick it (at most every 10 minutes per place) |
| `championFallback` | `true` | When no [Champions](#champions--elite_bp) pack answers a story champion request within 3 seconds, spawn the story's mob itself: named, with extra health (the champion's `health`), resistance and strength. Story bosses Champions can't make (an elder guardian, pillagers, a phantom) are always spawned this way |
| `championRetrySeconds` | `120` | Seconds before a story champion is asked for again, once the last one is gone |
| `offerOrder` | `20` | Where story offers sit among an NPC's buttons (lower is higher up; other offers default to 50) |
| `hintPenalty` | `0.25` | Share of a chapter's levels and Crowns a hint costs (once per chapter). `0` = free hints |
| `autoPlaces` | `true` | Places nobody set are picked by the pack and built when a player comes close. Disabled, operators set every place |
| `buildRange` | `64` | How close (blocks) a player must come to a picked place before its building is built |
| `actorTimeoutSeconds` | `300` | How long a story character (a ghost, guards, someone to escort) waits for its player to come back before it's removed; it comes back when needed |
| `favors` | `true` | Questgivers offer a daily favor |

Operators can change every option but `offerOrder` in game with `/realm:config`. Each player can switch the tracker for themselves with **Story tracker** in `/realm:prefs`, which follows `tracker` until they choose, and move it with **Where my story tracker shows** (follows `trackerAt`).

**The stories** are data: the prologue in `scripts/stories.js` (with `NPC_NAMES` and `PLACES`), the acts, side questlines and favors in `scripts/stories/*.js`, typed by `scripts/types.js`. A story is `{ id, title, short, giver, kind, act?, tones, summary, requires?, chapters }`; a chapter `{ id, title, npc?, end?, when?, sequential?, intro, introChoices?, teach?, objectives, outro, choices?, reward, rep?, hint }` (`teach`: [Kitchen](#kitchen--cooking_bp) recipes sent with `realm:recipe_learn` when the chapter is accepted); flags are a story's own, `g:<name>` (player-wide, also counters with `inc`) or `<story>.<flag>`, matched exactly, with `!x` (not x, also unset) or `>=n`. `requires` checks finished stories and chapters, flags, counters (`minCount`) and guild reputation. Each objective type and its fields are listed in `types.js`; the place prefabs are in `scripts/prefabs.js`. `npm run check` runs `tools/check-stories.mjs`, which fails on unknown objective types, missing fields, unknown places or NPCs, duplicate ids, bad champion tags, item, block and mob ids this Minecraft version doesn't have (from `@minecraft/vanilla-data`), an interact objective whose blocks aren't within reach in its place's building, and Kitchen dish names out of step with the Cooking pack; it walks every story through every combination of choices (and of the flags other stories set) and fails when a reachable chapter has no objective, no intro or outro page, or only locked choices, when a story requires a chapter some endings skip, or when stories require each other; and it warns about flags that are read but never set and pages over 450 characters. Keep every `id`: progress is saved by story, chapter and choice id.

### Saved data

| Key | Scope | Contents |
|---|---|---|
| `saga:p` | Player | JSON `{ s: { <story id>: { dn, a?, cur?, o?, t?, f, ch, fin?, h?, x? } }, g?, cx?, fv? }`: per story the finished chapter ids, whether the current chapter is accepted, its id, objective progress, when it was accepted, the story's flags, the choices made (by chapter, `<chapter>#<step>` for a meet, `<chapter>@` for an intro choice), when it was finished, whether a hint was bought, and step extras (clues found, timer and wait starts). `g` is the player-wide flags and counters, `cx` the codex entries found, `fv` the daily favors by NPC `{ id, d, a?, o?, x?, c?, t?, h? }`. A finished story keeps only its chapters, flags and choices; saved a few seconds after a change and when the player leaves |
| `saga:places` | World | JSON `{ <name>: { dim, x, y?, z, by?, f?, b?, a?, p?, mv?, s? } }`: each place's spot, who set it, the building's facing, whether it's built, picked by the pack, still waiting to be built, how often it moved, and its terrain snapshot (structure ids and corners) |
| `saga:place_<name>_<n>` | World structures | The terrain under a built place, saved before building (`structureManager`), put back by Remove |
| `saga:weather` | World | The overworld weather at the last change: `Clear`, `Rain` or `Thunder`. The stable Script API can't read the current weather |
| `saga:pref` | Player | JSON of the player's own `tracker` and `trackerAt` choices from `/realm:prefs` |
| `saga:cfg` | World | Settings changed in `/realm:config` |

### How it works

- **Modules:** `data.js` (saved progress, flags, requirements, which chapter is current), `objectives.js` (what counts for each objective type, scenes), `actors.js` (story characters and mobs), `places.js` (places, building, snapshots, the places menu), `ui.js` (offers, dialogues, hints, rewards, tracker, story log), `main.js` (commands, script events, loops).
- **Townsfolk:** the pack answers `realm:npc_talk` with `realm:npc_offer` (keys `start:`, `end:`, `info:` plus the story id, `ans:` for riddles, `fvstart:`/`fvinfo:`/`fvend:` plus the NPC for favors) and opens its dialogues on `realm:npc_choose`. The same `realm:npc_talk` counts talk objectives and takes deliveries first, so delivering the last item lets you report back in the same tap.
- **The current chapter** is the accepted one, else the first unfinished chapter whose `when` matches; a story is finished when none is left. Objectives with a `when` that doesn't match don't exist for that player. In a `sequential` chapter only the first unfinished step counts, spawns and shows on the tracker.
- **Counting:** events count defeat (`entityDie`, killer from the damage source), mine, place, interact, inspect taps, tend, tame (checked a few times after the interaction), use (`itemUse` and item taps on blocks) and fish (a hook followed as in Daily Quests). A loop once a second checks only the steps the player is working on (indexed by type): reach, collect, survive (overworld weather from `weatherChange`, accepting `overworld` and `minecraft:overworld`; nothing over the player's head), vigil, wear, ride (distance while the riding component's entity matches), wait, sleep, timers, champions, and starts or ends scenes. A fast loop every 5 ticks moves guards, escorts and wisps.
- **Story characters** are spawned per player with the tags `saga:actor`, `saga:o:<player>` and `saga:k:<step>` and a name (so they never despawn). Characters you talk to and guards get resistance 5, weakness and slowness and are healed back each second; what they throw or summon near them (potions, arrows, tridents, fireballs, fangs, vexes) is removed. Escorts and wards can be hurt, except a ward that is itself a monster (Vesna, a witch): she can't be hurt and what she throws is removed, so she never fights you. Monsters of ambushes, waves, champion adds and wrong answers are tagged `saga:add` (and `saga:choir` for the Gray Choir, which the Relics pack's Gray Choir Mask reads). All of them go when the step is done, the chapter ends, the player leaves, after `actorTimeoutSeconds` away, after 10 minutes (story monsters), or at a restart; leftovers are removed when their chunk loads.
- **Stealth detection** every 5 ticks: distance to each guard's eyes against `detect` or `detectSneak` (sneaking or wearing the `disguise`), within 60 degrees of the guard's facing, and a block ray (`getBlockFromRay`) for walls.
- **Champions:** the pack sends `realm:champion_spawn` `{ dim, x, y, z, mob, trait?, name, tag, health }` (at most once per `championRetrySeconds`, and not while one with that tag is loaded in that dimension) for the mobs Champions can make (zombie, husk, drowned, zombie villager, skeleton, stray, spider, creeper, witch), spawns its own after 3 seconds with `championFallback` (and always for any other mob, such as the elder guardian, pillagers or the phantom, which Champions would swap for one of its own), and spawns the `adds` when a champion with that tag drops below half health. A `realm:champion_slain` with the story's tag (or the fallback's death) credits the killer, helpers, everyone within 32 blocks on that step, and their party mates.
- **Places:** a picked place is built by a job that tries the picked spot and 32 spots around it within 48 blocks, asks the prefab's `siteOk` whether the column suits the place, checks that the building's box holds nothing player-made, saves the box with `structureManager.createFromWorld` (tiles of up to 64 by 64, saved in the world), then runs the prefab's build steps. After 3 moves any open land will do; after 6 it gives up and tells operators. Remove places the snapshot back and deletes it.
- **Seals:** for the Relics pack's Lantern Shard, the pack sends `realm:seals` `{ player, seals: [{ name, dim, x, z }] }` with the seal places that are set and whose Act IV relight chapter that player hasn't finished, when it changes (checked every 5 seconds), at load and in reply to `realm:seals_ping`.
- **Finishing a chapter** gives the reward (levels and Crowns cut by `hintPenalty` after a hint) and sends `realm:quest_done` `{ player, pack: "saga_bp", id: "<story>:<chapter>", label, kind: "story" }` (`kind: "favor"` for favors), `realm:rep_add` for the choice's and chapter's reputation, `realm:relic_give`, `realm:title_unlock` and `realm:journal` (page `story`). Crowns go straight onto the `crowns` scoreboard.
- **The tracker** shows on the right side by default: `setTitle("§s§1§r", { subtitle })`, which `hud_rp` draws as a panel above the sidebar, then `realm:side` `{ player, from: "saga", ticks }`; the pack remembers the last `realm:side` writer per player and, when its text runs out, clears the panel (`setTitle("§s§0§r")`) only if it was the last to write. `middle` is a plain subtitle (`setTitle("§r", { subtitle })`). Above the hotbar it listens to other packs' `realm:actionbar` and skips its update while their note holds the bar (up to 10 seconds), and sends its own with `from: "saga_bp"`; on the right side it likewise skips while another pack's `realm:side` text lasts (its `ticks`, up to 10 seconds); in the middle only its own progress notes make it wait.
- **Testing hook:** `/scriptevent realm:saga_debug {"player":"<name>","action":"state"}` prints a player's saved progress to the content log; `"action":"finish","story":"<id>"` marks a whole story finished; `"action":"places"` sends the player every saved place as JSON; `"action":"jump","story":"<id>","chapter":"<id>"` marks every chapter before that one finished; both take `"flags":{...}` to set (a `g:` key is player-wide); `"action":"answer","text":"..."` answers the player's open riddle. Script events need operator rights.

---

## Guilds & Reputation — `guilds_bp`

Four guilds you rise through by playing: the Miners, the Growers, the Wardens (combat) and the Wayfarers (exploration and the sea). Finished quests and bounties earn reputation with the guild they suit, and so do plain mining, farming, fighting and traveling, a little at a time. Each guild has five ranks from Initiate to Master; higher ranks unlock more of the guild's shop (paid in Crowns), a small perk at Journeyman, and the titles `Expert Miner` and `Master Miner` (and so on) for the [Titles & Trails](#titles--trails--titles_bp) pack.

### How to use

1. Play: mining ores, harvesting grown crops, defeating monsters and traveling slowly earn reputation with the Miners, Growers, Wardens and Wayfarers. Finished [Daily Quests](#daily-quests--quests_bp), [Story Questlines](#story-questlines--saga_bp) chapters and [Bounty Board](#bounty-board--bounty_bp) bounties earn more, with a chat line such as `+10 Miners rep (Mine 12 coal ore)`.
2. Rank up: chat says `Miners' Guild: you are now a Journeyman! (300 rep)`, with any new perk and new shop stock. Reaching Expert or Master is announced to everyone and unlocks a title.
3. Run `/realm:guilds` to see your rank in all four guilds, a bar to the next rank (`Journeyman at 300 (120 to go)`), each guild's perk and your Crowns. Its buttons open each guild's shop.
4. In a shop, tap an item to buy it with Crowns. Gray items need a higher rank, shown under them (`[Expert]`).
5. Talk to a guildmaster (the [Townsfolk](#townsfolk--npc_bp) pack's Warden Reyes) and pick **Guild hall** for the same menu.
6. Don't want the reputation lines in chat? Disable **Reputation notes in chat** in `/realm:prefs`.
7. **Operators:** `/realm:config` → **Guilds & Reputation** sets whether plain play earns reputation and how much, whether the perks are on, and the rank they need. Ranks, shops, titles and quest rewards are in `config.js`.

### What players see

- **Ranks** (`ranks`): Initiate (0 rep), Member (100), Journeyman (300), Expert (700), Master (1,500), separately in each guild.
- **Reputation from quests** (`realm:quest_done` from any pack): 10 for a daily quest (`questRep`), 30 for a story chapter, 25 for a bounty, 20 for a treasure map or tournament, 15 for a town project, 30 for a finished expedition. Kinds go to guilds as in `kindGuild`: mining and placing blocks to the Miners, harvesting and eating to the Growers, defeating mobs, bounties and expeditions to the Wardens, traveling, fishing and treasure to the Wayfarers. A quest that names a guild goes to that guild; anything else (a story chapter or town project without one) is shared evenly between all four.
- **Reputation from other packs** (`realm:rep_add`) can add or take away reputation, for example a story choice. Reputation never drops below 0.
- **Reputation from plain play** (`passive`), quietly: 1 Miners rep per 10 ores mined (`ores`; ores you placed lately don't count), 1 Growers rep per 25 grown crops harvested, broken or tapped (`crops`), 1 Wardens rep per 10 hostile mobs defeated (`hostile`), 5 Wardens rep for defeating or helping to defeat a [champion](#champions--elite_bp), and 1 Wayfarers rep per 500 blocks traveled any way (teleports don't count, and neither does moving while the [AFK](#afk--smart-sleep--afk_bp) pack marks you away, such as riding a minecart loop). Creative and spectator mode earn nothing here.
- **Perks** (`perks`), from Journeyman (`perkRank`) in that guild:

  | Guild | Perk |
  |---|---|
  | Miners | Mining 20 ores within 60 seconds gives Haste I for 30 seconds |
  | Growers | A 25% chance of one extra crop when you harvest a grown crop |
  | Wardens | Strength I for 10 seconds after you defeat, or help to defeat, a champion |
  | Wayfarers | Sprinting 200 blocks gives Speed I for 20 seconds |

  A perk that starts says so above the hotbar (`Miners' Guild: Haste I for 30s`).
- **Titles:** reaching Expert and Master (`titleRanks`) unlocks `Expert Miner` / `Master Miner`, `Expert Grower`, `Expert Warden`, `Expert Wayfarer` and so on, which players pick in the Titles pack.
- **Reputation earned while offline** (a bounty paid out after you left) is added when you next join: `+25 Wardens rep (while you were away)`.
- **The shops** (`shops`), one item per rank in each guild by default:

  | Rank | Miners | Growers | Wardens | Wayfarers |
  |---|---|---|---|---|
  | Initiate | 32 torches, 8 | 16 bone meal, 6 | 32 arrows, 10 | 8 bread, 6 |
  | Member | Iron pickaxe, 40 | 8 golden carrots, 30 | Iron sword, 30 | Empty map, 20 |
  | Journeyman | 4 TNT, 60 | 4 cherry saplings, 40 | Shield, 40 | 4 ender pearls, 60 |
  | Expert | Diamond pickaxe, 200 | 2 golden apples, 120 | Totem of Undying, 300 | Saddle, 80 |
  | Master | Netherite scrap, 400 | Sniffer egg, 400 | Trident, 500 | Heart of the Sea, 300 |

  Prices are in [Crowns](#crowns--crowns_bp). Buying says `-40 Crowns (Miners' Guild: 1 Iron Pickaxe)` in chat; what doesn't fit in your inventory drops at your feet.

### Commands

| Command | Who | What it does |
|---|---|---|
| `/realm:guilds` | Everyone | Your rank, reputation and progress to the next rank in all four guilds, their perks (from Journeyman, `perkRank`), and buttons for each guild's shop |

### Configuration (`scripts/config.js` → `CONFIG`)

| Option | Default | Description |
|---|---|---|
| `guilds.miners.name`, `guilds.miners.member` | `"Miners' Guild"`, `"Miner"` | The guild's name, and the word its titles and scoreboard use (`Master Miner`, `Miners Rep`) |
| `guilds.growers.name`, `guilds.growers.member` | `"Growers' Guild"`, `"Grower"` | The same for the Growers |
| `guilds.wardens.name`, `guilds.wardens.member` | `"Wardens' Guild"`, `"Warden"` | The same for the Wardens |
| `guilds.wayfarers.name`, `guilds.wayfarers.member` | `"Wayfarers' Guild"`, `"Wayfarer"` | The same for the Wayfarers |
| `ranks` | Initiate 0, Member 100, Journeyman 300, Expert 700, Master 1500 | The ranks, `{ name, rep }`, lowest first; the first needs 0 |
| `titleRanks` | `[4, 5]` | Ranks (1 = the first) that unlock a title (`realm:title_unlock`) |
| `perkRank` | `3` | Rank each guild's perk needs (3 = Journeyman) |
| `announceRanks` | `[4, 5]` | Reaching these ranks is announced to everyone |
| `questRep.mine`, `questRep.kill`, `questRep.harvest`, `questRep.place`, `questRep.travel`, `questRep.eat`, `questRep.fish` | `10` each | Reputation for a finished daily quest of that kind |
| `questRep.story` | `30` | For a story chapter |
| `questRep.bounty` | `25` | For a bounty |
| `questRep.treasure`, `questRep.tournament` | `20` each | For a treasure map or a tournament |
| `questRep.town` | `15` | For a town project |
| `questRep.expedition` | `30` | For a finished expedition |
| `questRep.other` | `10` | For any other kind |
| `kindGuild.mine`, `kindGuild.place` | `"miners"` | The guild those quest kinds count for |
| `kindGuild.harvest`, `kindGuild.eat` | `"growers"` | |
| `kindGuild.kill`, `kindGuild.bounty`, `kindGuild.expedition` | `"wardens"` | |
| `kindGuild.travel`, `kindGuild.fish`, `kindGuild.treasure` | `"wayfarers"` | Kinds not listed are shared between all four guilds, unless the quest names a guild |
| `passive.enabled` | `true` | Plain play earns reputation |
| `passive.oresPerRep` | `10` | Ores mined per Miners rep |
| `passive.cropsPerRep` | `25` | Grown crops harvested per Growers rep |
| `passive.killsPerRep` | `10` | Hostile mobs defeated per Wardens rep |
| `passive.championRep` | `5` | Wardens rep for defeating or helping to defeat a champion |
| `passive.blocksPerRep` | `500` | Blocks traveled per Wayfarers rep |
| `ores` | coal, iron, copper, gold, redstone, lapis, diamond, emerald ores (and deepslate), nether gold, quartz, ancient debris | What counts as an ore |
| `crops` | wheat, carrots, potatoes, beetroot (`growth` 7), nether wart (`age` 3), cocoa (`age` 2), melon, pumpkin | Grown crops, `{ block, state?, ripe?, drop }`: growth state and fully grown value (none: any break counts), and the extra item the Growers' perk adds |
| `hostile` | 34 hostile mobs (zombies, skeletons, spiders, creepers, illagers, Nether and End mobs...) | Mobs that count for the Wardens |
| `perks.enabled` | `true` | Apply the perks |
| `perks.miners.ores` | `20` | Ores within `perks.miners.seconds` for Haste I |
| `perks.miners.seconds` | `60` | |
| `perks.miners.hasteSeconds` | `30` | How long the Haste lasts |
| `perks.growers.extraChance` | `0.25` | Chance of one extra crop |
| `perks.wardens.strengthSeconds` | `10` | Seconds of Strength I after a champion |
| `perks.wayfarers.sprintBlocks` | `200` | Blocks sprinted for Speed I (not counted while it's on) |
| `perks.wayfarers.speedSeconds` | `20` | How long the Speed lasts |
| `shops.miners`, `shops.growers`, `shops.wardens`, `shops.wayfarers` | 5 items each (above) | Each guild's shop, `{ item, amount, price, rank }`: `rank` (1 = the first) unlocks it |
| `npcRole` | `"guildmaster"` | NPCs with this role offer the **Guild hall** |
| `maxSpeed` | `100` | Movement faster than this (blocks per second) is a teleport and doesn't count as travel |
| `afkTag` | `"afk"` | Players with this tag (the AFK pack's; keep it the same as AFK `tag`) earn no Wayfarers reputation for moving, so an idle ride around a loop doesn't count. `""` turns the check off |

Operators can change `passive.enabled`, `passive.oresPerRep`, `passive.cropsPerRep`, `passive.killsPerRep`, `passive.blocksPerRep`, `perks.enabled` and `perkRank` in game with `/realm:config`. Each player can switch the reputation lines in chat with **Reputation notes in chat** in `/realm:prefs` (`repNotes`, on until they choose). The rest stays in `config.js`.

### Saved data

| Key | Scope | Contents |
|---|---|---|
| `rep_miners`, `rep_growers`, `rep_wardens`, `rep_wayfarers` | Scoreboards | Each player's reputation with that guild |
| `guilds:prog` | Player | JSON `{ o, c, k, b }`: ores, crops, kills and blocks counted toward the next point of plain-play reputation (saved every 30 seconds and when the player leaves) |
| `guilds:pending` | World | JSON `{ playerId: { guild: amount } }`: reputation earned while offline, added when they join (up to 300 players) |
| `guilds:cfg` | World | Settings changed in `/realm:config` |
| `guilds:pref` | Player | JSON of the player's own `repNotes` choice from `/realm:prefs` |

### How it works

- Reputation is a scoreboard per guild, so any pack, `/scoreboard` or a sidebar can read it. Shops spend the `crowns` scoreboard directly, with or without the [Crowns](#crowns--crowns_bp) pack.
- It listens for `realm:quest_done` `{ player, kind?, guild?, label }`, `realm:rep_add` `{ player, guild, amount, reason }` and `realm:champion_slain` `{ player?, helpers }`. For a player who isn't online, the reputation waits in `guilds:pending`.
- Rank-ups send `realm:title_unlock` `{ player, title, from: "guilds_bp" }` for the ranks in `titleRanks`.
- Plain play uses `afterEvents.playerBreakBlock` (ores and grown crops; a placed ore or melon is remembered, the last 5,000, so breaking it again earns nothing), a tap on a grown crop that resets it 3 ticks later (the [Right-click Harvest](#right-click-harvest--harvest_bp) pack), `afterEvents.entityDie` with a player as the killer, and the distance moved each second. Sprinting is read from the player's `isSprinting`.
- Perk notes above the hotbar also send `realm:actionbar` (50 ticks), so the [Coordinates HUD](#coordinates-hud--hud_bp) steps aside.
- The **Guild hall** is an offer in the [Townsfolk](#townsfolk--npc_bp) offer round: it answers `realm:npc_talk` for NPCs with the `guildmaster` role and opens on `realm:npc_choose`.

---

## Bounty Board — `bounty_bp`

A lectern at spawn with realm-wide bounties that change every day: named [champions](#champions--elite_bp) to hunt down, with a hint where they were last seen (`Gerald the Unexploded - last seen near 1240, -380 (NE of here, about 900 blocks)`), and cull bounties such as `Defeat 30 drowned` that everyone works on together. Rewards are paid in [Crowns](#crowns--crowns_bp), and bounties also count as finished quests and Wardens reputation for [Guilds & Reputation](#guilds--reputation--guilds_bp).

### How to use

1. Tap the bounty board (a lectern near spawn) to see today's bounties, or run `/realm:bounty` anywhere and pick **Today's bounties** (or run `/realm:bounty_list`; from anywhere it also says where the board is). You don't need to accept anything: every bounty is open to everyone.
2. **Champion targets:** head the way the board says. When you come within 64 blocks of the spot, the target appears, and chat says `A champion stirs nearby: Gerald the Unexploded`. Whoever defeats it gets 100 Crowns; everyone who hit it in its last 30 seconds, and the killer's [party](#parties--party_bp) mates within 64 blocks, get 30 Crowns each. Chat tells everyone: `[Bounty] Steve claimed the bounty on Gerald the Unexploded! (with 2 helpers)`.
3. **Cull bounties:** every mob of the right kind that anyone defeats counts (`Bounty: Defeat 30 drowned 12/30` above your hotbar). When the count is reached, everyone who defeated at least one gets 40 Crowns.
4. Talk to a warden (the [Townsfolk](#townsfolk--npc_bp) pack's Warden Reyes) and pick **Bounties** for the same list.
5. Don't want the cull progress notes? Disable **Bounty progress notes** in `/realm:prefs`.
6. **Operators:** look at a lectern within 6 blocks and open `/realm:bounty`: **Make this lectern a bounty board** (or run `/realm:bounty_board`). Looking at a board, the menu offers **Make this board a lectern again** (or `/realm:bounty_board_remove`); **Remove a bounty board** lists every board to pick from, and breaking the lectern works too. To put a book on a board, sneak and tap it in creative mode. `/realm:config` → **Bounty Board** sets the hour new bounties come, how many, the target distances and the rewards. Champion targets need the [Champions](#champions--elite_bp) pack.

### What players see

- **Each day** (from `resetHourUtc`, 0 = midnight UTC) the board posts 4 bounties (`count`): 2 champion targets (`champions`) and the rest cull bounties picked from `culls`. Unfinished bounties expire, and a target from an earlier day disappears. Chat tells online players: `[Bounty] New bounties are posted: Gerald the Unexploded, Mortimer the Rattling, Defeat 30 drowned, Defeat 5 witches. See them with /realm:bounty`.
- **Champion targets** have a name from `names` and an epithet that suits the mob (`targets`): `Gerald the Unexploded` is a creeper, `Edna the Unwashed` a zombie. Each has a random champion trait as well. Its spot is 300 to 1,200 blocks (`minDistance`, `maxDistance`) from the first board in the overworld, in a random direction, never within 64 blocks of the world spawn (`avoidSpawn`).
- **Where it appears:** when a player comes within 64 blocks (`spawnDistance`) of the spot, the Champions pack spawns it on the surface there (a drowned if the spot is water). It is never put next to a build: if a scan of the 9 x 9 columns around the spot (from the surface down 4 blocks) finds anything player-made (planks, glass, chests, barrels, signs, beds, torches, lanterns, doors, fences, wool, concrete, glazed terracotta, crafting tables, furnaces, stairs, bricks and the like), it tries places 16 to 40 blocks around (also when the spot is a treetop or within `avoidSpawn` of the world spawn), and after 6 tries moves the spot 100 to 200 blocks away, never next to the world spawn; the board shows the new place.
- **The hint** follows the target: once it has appeared, `last seen near` is updated whenever it has moved more than 16 blocks. On the board, directions are from the board (`NE of here`); with `/realm:bounty` and from a warden, from you (`NE of you`).
- **If a target dies with no player involved** (lava, a fall) or vanishes, it appears again when someone comes near (after 5 minutes for one that died).
- **Rewards:** for a champion target, 100 Crowns to the killer (`rewards.champion`) and 30 to each helper (`rewards.helper`): players who hit it in its last 30 seconds and the killer's party mates within 64 blocks. For a cull bounty, 40 Crowns (`rewards.cull`) to everyone who defeated at least one. Payment says `+100 Crowns (Bounty: Gerald the Unexploded)` in chat; players who are offline by then are paid when they next join. Reputation (with the Guilds pack) comes once, not twice: the killer and every cull contributor get a finished quest (`realm:quest_done`, worth 25 Wardens reputation by default), and helpers of a champion target, who finished nothing themselves, get 5 Wardens reputation directly (`rewards.helperRep`). Defeating or helping to defeat any champion also earns Guilds' own small champion reputation, bounty or not.
- **The board** shows `New bounties in 5h 12m.`, then each bounty: champion targets in red with the hint and the reward, claimed ones as `[Claimed by Steve]`, cull bounties with a bar, `12/30` and how many were yours, finished ones as `[Done]`.

### Commands

| Command | Who | What it does |
|---|---|---|
| `/realm:bounty` | Everyone | The bounty menu: today's bounties, and for operators, make the lectern you look at a board (or a board a lectern again) and remove a board from a list |
| `/realm:bounty_list` | Everyone | Shows today's bounties (default 4, `count`) with directions from you, where the board is, and the time until new ones (default midnight UTC, `resetHourUtc`) |
| `/realm:bounty_board` | Operators | Makes the lectern you are looking at (within 6 blocks) a bounty board |
| `/realm:bounty_board_remove` | Operators | Makes the bounty board you are looking at an ordinary lectern again |

### Configuration (`scripts/config.js` → `CONFIG`)

| Option | Default | Description |
|---|---|---|
| `enabled` | `true` | Post new bounties every day. Disabled, no new bounties are posted and no targets spawn |
| `resetHourUtc` | `0` | New bounties every day at this hour, UTC (0 to 23). Unfinished bounties expire then |
| `count` | `4` | Bounties each day |
| `champions` | `2` | How many of them are champion targets; the rest are cull bounties. Needs the Champions pack and a board in the overworld |
| `minDistance` | `300` | Champion targets are at least this many blocks from the board... |
| `maxDistance` | `1200` | ...and at most this many |
| `spawnDistance` | `64` | A target appears when a player comes this close to its spot |
| `avoidSpawn` | `64` | Never put a target spot within this many blocks of the world spawn |
| `rewards.champion` | `100` | Crowns for the player who defeats a champion target |
| `rewards.helper` | `30` | Crowns for each helper |
| `rewards.cull` | `40` | Crowns for everyone who helped finish a cull bounty |
| `rewards.helperRep` | `5` | Wardens reputation (`realm:rep_add`) for each helper of a champion target. The killer and cull contributors get theirs from the finished quest instead, so it isn't counted twice |
| `names` | 20 names (Gerald, Morwen, Bartholomew...) | First names for champion targets |
| `targets` | creeper, zombie, skeleton, spider, husk, stray, each with 3 or 4 epithets | The mobs targets can be, `{ mob, epithets }` |
| `culls` | 10 (below) | Cull bounties to pick from, `{ id, label, count, mobs }` |
| `npcRole` | `"warden"` | NPCs with this role offer **Bounties** |

The default `culls`: 40 zombies (husks and zombie villagers count), 30 drowned, 30 skeletons (strays and bogged count), 30 spiders (cave spiders count), 20 creepers, 5 witches, 10 phantoms, 10 endermen, 25 slimes, 15 pillagers or vindicators.

Operators can change `enabled`, `resetHourUtc`, `count`, `champions`, `minDistance`, `maxDistance`, `spawnDistance`, `rewards.champion`, `rewards.helper` and `rewards.cull` in game with `/realm:config`. Each player can switch the cull progress notes for themselves with **Bounty progress notes** in `/realm:prefs` (`notes`). The rest stays in `config.js`.

### Saved data

| Key | Scope | Contents |
|---|---|---|
| `bounty:boards` | World | JSON list of boards, `[{ d, x, y, z }]` (dimension and lectern position) |
| `bounty:day` | World | JSON `{ d, list }`: the day number and today's bounties. Champion targets: `{ id, t: "c", name, trait, mob, dim, x, z, lx, lz, s, done, by }` (spot, last seen, spawned, claimed by); cull bounties: `{ id, t: "k", label, count, mobs, p, who, done, by }` (progress and each player's kills) |
| `bounty:pending` | World | JSON `{ playerId: crowns }`: rewards for players who were offline, paid when they join |
| `bounty:cfg` | World | Settings changed in `/realm:config` |
| `bounty:pref` | Player | JSON of the player's own `notes` choice from `/realm:prefs` |

### How it works

- **Boards:** `beforeEvents.playerInteractWithBlock` cancels a tap on a registered lectern and opens the board (unless an operator sneaks in creative mode). `/realm:bounty_board` uses `getBlockFromViewDirection` (6 blocks). Boards whose lectern is gone are forgotten when their chunk is loaded.
- **Targets** are spawned by the Champions pack: when a player is near, this pack checks the spot (once every 2 seconds, only when the chunk is loaded) and sends `realm:champion_spawn` `{ dim, x, y, z, mob, trait, name, tag: "realm:bounty:<id>" }`. Two seconds later it looks for the tagged champion; if it isn't there, it tries again a minute later. On load it sends `realm:help_ping` and listens for the Champions pack's `realm:help_pong`; without it, the board posts only cull bounties.
- **Claims** come from `realm:champion_slain` with the bounty's tag: its `player` is the killer and `helpers` the helpers; party mates are players with the same `realm_party:<code>` tag. Then it sends `realm:quest_done` `{ kind: "bounty" }` for the killer and `realm:rep_add` `{ guild: "wardens" }` for each helper, and pays from the `crowns` scoreboard directly, with or without the Crowns pack.
- **Culls** count `afterEvents.entityDie` with a player as the killer (arrows count for the shooter).
- Every 10 seconds, champions tagged with a bounty that is claimed or from an earlier day are removed, so old targets don't linger.

---

## Champions — `elite_bp`

About one in 40 monsters that spawn in the overworld at night becomes a champion: a named, tougher monster with a trait, such as `Gerald the Stormcaller`, who calls lightning in thunderstorms. A badge before the name, a helmet and a small aura in the trait's color tell them apart from ordinary mobs. Champions stay until someone deals with them, and defeating one drops Relic Shards and a burst of XP. A Blood Moon makes them three times as common, and the [Bounty Board](#bounty-board--bounty_bp) sends players after named ones.

### How to use

1. Play at night: when a champion appears within 48 blocks of you, chat says `A champion stirs nearby: Gerald the Stormcaller`, and you may hear a spell being cast. Champions are easy to spot: a red name with a colored badge in front (`[/] Gerald the Stormcaller`), a helmet in the trait's color on zombies and skeletons, and a small sparkling aura.
2. Read the badge to know what you're fighting: yellow `[/]` Stormcaller, aqua `[*]` Frostbound, dark red `[v]` Vampiric, green `[%]` Splitting, blue `[#]` Shielded (it turns gray `[x]` once the shield breaks). `/realm:champions` → **What champions look like** shows the whole list.
3. Fight it like any monster, but expect more: it takes less damage, has more health and has a trait (below). Friends can help: everyone who hit it in its last 30 seconds is a helper.
4. Defeat it for 1 to 3 Relic Shards and about 20 XP orbs. Chat says `You defeated Gerald the Stormcaller! (Champions defeated: 3)`; helpers get `Gerald the Stormcaller is defeated. You helped.`
5. Run `/realm:champions` for the menu: **Champions near you** lists the champions within 64 blocks of you, which way they are and how far (`Gerald the Stormcaller NE, 23m`), and how many you have defeated (`/realm:champions_near` puts the same list in chat).
6. Don't want the chat line when one appears? Disable **Champion alerts in chat** in `/realm:prefs`.
7. **Operators:** the menu also has **Spawn a champion** (pick a trait and a mob, or leave them random), **Remove champions near you** and **Aura cost** (how much time the aura takes). `/realm:champions_spawn` spawns one 3 blocks in front of you without the menu (add a trait, such as `/realm:champions_spawn stormcaller`, or leave it out for a random one). `/realm:config` → **Champions** sets the chance, the Blood Moon multiplier, the most at once, night-only and open-sky-only, the alert radius, and the looks: **Champion auras**, **Aura puff interval (ticks)**, **Champion helmets** and **Champion arrival effect**.

### What players see

- **Who becomes a champion:** a zombie, husk, drowned, zombie villager, skeleton, stray, spider, creeper or witch (`mobs`) that spawns on its own in the overworld, with a 2.5% chance (`chance`), at night (`nightOnly`), under the open sky (`surfaceOnly`, so caves and dark-room mob farms don't make them), while fewer than 8 champions are loaded (`maxAlive`), and never next to anything player-made (`avoidBuilds`: a scan of the 5 x 5 blocks around the spawn, from under its feet to its head, for planks, glass, slabs, stairs, trapdoors, torches and the like), so bases, villages and open-sky mob farms don't make them. No other natural champion appears within 48 blocks of one for 10 minutes (`areaSpacing`, `areaCooldownMinutes`).
- **Blood Moon:** while the [Blood Moon & Harvest Moon](#blood-moon--harvest-moon--moon_bp) pack says a Blood Moon is up, the chance is three times higher (`bloodMoonMultiplier`).
- **The name** is a first name and the trait, in red, after a badge in the trait's color: `§e[/] §cGerald the Stormcaller`. A champion the Bounty Board asks for has the bounty's name instead (`Gerald the Unexploded`), with the same badge. The name tag is put back every 5 seconds, so a name tag item can't hide a champion.
- **The looks:** every champion carries its trait's colors, so it stands out from ordinary mobs at a glance. All of it is vanilla items and particles, so no resource pack is needed:

  | Trait | Badge | Helmet | Aura |
  |---|---|---|---|
  | Stormcaller | yellow `[/]` | gold helmet | electric sparks |
  | Frostbound | aqua `[*]` | diamond helmet | snowflakes |
  | Vampiric | dark red `[v]` | netherite helmet | red dust |
  | Splitting | green `[%]` | turtle shell | green sparkles |
  | Shielded | blue `[#]`, gray `[x]` once the shield breaks | iron helmet | white glints, crit sparks once the shield breaks |

  - **Helmets** (`looks.gear`) go on the mobs that show armor: zombies, husks, drowned, zombie villagers, skeletons and strays (and bogged, wither skeletons, zombified piglins, piglins and piglin brutes if they're added to `mobs`). Spiders, creepers and witches can't show one: they have the badge and the aura. The helmet adds its usual armor (2 or 3 points; diamond and netherite also some toughness). It never drops: when a champion dies, the pack removes the helmet it dropped (one helmet of that kind, without a custom name, within 2.5 blocks, that appeared as it died: a helmet a player dropped there earlier stays), so champion gear can't be farmed. The helmet goes on once; a champion that loses it (it can swap it for a better one it picks up) carries on without it. Disabling **Champion helmets** takes the pack's helmets off loaded champions within 5 seconds.
  - **The aura** (`looks.aura`) is 2 particles around the champion's body every 10 ticks, half a second (`looks.auraTicks`), only while a player is within 64 blocks. With 20 champions near a player it took 1.1 to 1.8 ms per puff on a test server, 0.1 to 0.2 ms a tick on average; operators can see the live numbers under **Aura cost** in the menu.
  - **Arrival** (`looks.spawnEffect`): a spell sound (the evoker's summoning sound, a little lower) and a burst of the aura where the champion appears.
- **Every champion** has Resistance I (`resistanceLevel`), 8 extra health from Health Boost II (`healthBoostLevel`; Absorption instead on a mob that ignores Health Boost) and Fire Resistance, so daylight doesn't burn it (`fireResistance`). Named mobs don't despawn, so a champion stays until it's defeated.
- **The traits:**

  | Trait | What it does |
  |---|---|
  | Stormcaller | In thunderstorms, calls lightning down 1.5 to 3 blocks from a player within 16 blocks, every 6 to 10 seconds (`traits.stormcaller`) |
  | Frostbound | Each of its hits gives Slowness II for 4 seconds (`traits.frostbound.slownessSeconds`) |
  | Vampiric | Heals half the damage it deals (`traits.vampiric.healShare`). Also has Speed I |
  | Splitting | Leaves 3 copies when it dies (`traits.splitting.copies`): baby zombies (or baby husks, drowned, zombie villagers) for the zombie kind, the same mob at half health otherwise. The copies are ordinary mobs. Also has Speed I |
  | Shielded | Resistance IV until it has been hit 5 times (`traits.shielded.hits`), then the shield breaks with a glass sound and `The shield of Gerald the Shielded breaks!` |

  Creepers are never Frostbound or Vampiric (they don't hit). Speed I goes to the traits in `speedTraits`.
- **Lightning is safe for builds:** a strike never lands within 64 blocks of the world spawn (`avoidSpawn`) or where a scan of the 9 x 9 columns around the spot (from the surface down 4 blocks) finds something player-made (planks, glass, chests, barrels, signs, beds, torches, lanterns, doors, fences, wool, carpet, concrete, glazed terracotta, crafting tables, furnaces, stairs, slabs, bricks and the like). There it only rumbles. Fire a strike starts within 2 blocks is put out a moment later.
- **Drops:** 1 to 3 Relic Shards (`shards.min`, `shards.max`; amethyst shards named `Relic Shard` with the lore `Bring 8 to a relicsmith`) and 20 XP orbs (`xpOrbs`), but only when a player hit it in its last 30 seconds (`helperSeconds`) or killed it: a champion that dies in lava or a fall on its own drops nothing special.
- **Killer and helpers:** the player who landed the killing blow is the killer (or, if something else finished it, the player who hit it last). Every other player who hit it in its last 30 seconds is a helper. A tamed wolf's (or other pet's) hits and kills count for its owner. The [Bounty Board](#bounty-board--bounty_bp) and [Guilds & Reputation](#guilds--reputation--guilds_bp) reward both.

### Commands

| Command | Who | What it does |
|---|---|---|
| `/realm:champions` | Everyone | Opens the Champions menu: the champions near you, what each trait looks like and does, and for operators spawning a champion, removing the ones near you and the aura's cost |
| `/realm:champions_near` | Everyone | Lists the champions within 64 blocks of you in chat, with their badge, direction and distance, and how many you have defeated |
| `/realm:champions_spawn [trait]` | Operators | Spawns a champion 3 blocks in front of you (where you stand if that's blocked), with the trait you name (`stormcaller`, `frostbound`, `vampiric`, `splitting`, `shielded`) or a random one, even when `maxAlive` champions are already loaded |

### Configuration (`scripts/config.js` → `CONFIG`)

| Option | Default | Description |
|---|---|---|
| `enabled` | `true` | Champions appear on their own. Disabled, only `/realm:champions_spawn` and other packs (the Bounty Board) make them |
| `chance` | `0.025` | Chance a hostile mob spawning in the overworld becomes a champion (2.5%) |
| `bloodMoonMultiplier` | `3` | The chance is multiplied by this during a Blood Moon |
| `maxAlive` | `8` | No new natural champions while this many are loaded. Operators and other packs can still spawn more |
| `nightOnly` | `true` | Natural champions only at night (time of day 13000 to 23000) |
| `surfaceOnly` | `true` | Natural champions only under the open sky (nothing above the mob's head) |
| `areaSpacing` | `48` | No other natural champion within this many blocks of one that appeared lately... |
| `areaCooldownMinutes` | `10` | ...for this many minutes |
| `avoidBuilds` | `true` | Natural champions never appear next to anything player-made (the 5 x 5 blocks around the spawn, from under its feet to its head), so bases, villages and the platforms of open-sky mob farms don't make them |
| `mobs` | zombie, husk, drowned, zombie villager, skeleton, stray, spider, creeper, witch | Mobs that can become champions |
| `names` | 30 names (Gerald, Morwen, Bartholomew...) | First names champions get at random |
| `traits.stormcaller.range` | `16` | A Stormcaller strikes near a player within this many blocks |
| `traits.stormcaller.minSeconds` | `6` | Shortest time between strikes |
| `traits.stormcaller.maxSeconds` | `10` | Longest time between strikes |
| `traits.frostbound.slownessSeconds` | `4` | Seconds of Slowness II each Frostbound hit gives |
| `traits.vampiric.healShare` | `0.5` | Share of the damage it deals that a Vampiric champion heals |
| `traits.splitting.copies` | `3` | Copies a Splitting champion leaves when it dies |
| `traits.shielded.hits` | `5` | Hits before a Shielded champion's Resistance IV breaks |
| `speedTraits` | `["vampiric", "splitting"]` | Traits that also give Speed I |
| `resistanceLevel` | `1` | Resistance level every champion has (0 = none) |
| `healthBoostLevel` | `2` | Health Boost level every champion has (4 health per level); Absorption of the same level on a mob that ignores it |
| `fireResistance` | `true` | Champions don't burn in daylight or fire |
| `shards.min` | `1` | Fewest Relic Shards a champion drops |
| `shards.max` | `3` | Most Relic Shards a champion drops |
| `xpOrbs` | `20` | XP orbs a champion drops |
| `helperSeconds` | `30` | Players who hit a champion this many seconds or less before it died are helpers |
| `announceRadius` | `48` | Players within this many blocks get a chat line when a champion appears (0 = none) |
| `avoidSpawn` | `64` | Stormcaller lightning never lands within this many blocks of the world spawn |
| `looks.aura` | `true` | A small particle aura in the trait's color around every champion that has a player within 64 blocks |
| `looks.auraTicks` | `10` | Ticks between aura puffs (20 ticks = 1 second; 2 particles per champion each time). Lower is busier |
| `looks.gear` | `true` | Champions that can wear armor wear their trait's helmet. It never drops |
| `looks.spawnEffect` | `true` | A spell sound and a burst of the aura when a champion appears |

Operators can change `enabled`, `chance`, `bloodMoonMultiplier`, `maxAlive`, `nightOnly`, `surfaceOnly`, `announceRadius`, `looks.aura`, `looks.auraTicks`, `looks.gear` and `looks.spawnEffect` in game with `/realm:config`. Each player can switch the chat alerts off for themselves with **Champion alerts in chat** in `/realm:prefs`. The rest stays in `config.js`.

### Saved data

| Key | Scope | Contents |
|---|---|---|
| `elite:name` | Entity (each champion) | Its plain name, `Gerald the Stormcaller` |
| `elite:hits` | Entity (each champion) | Hits taken, for the Shielded trait |
| `elite:gear` | Entity (each champion) | The helmet the pack put on it (`minecraft:golden_helmet`), so it is put on once and removed again when it dies or `looks.gear` is disabled |
| `elite:kills` | Player | Champions this player has defeated |
| `elite:weather` | World | The overworld weather from the last change (scripts can't read the weather) |
| `elite:moon` | World | The last state the Blood Moon pack sent (`blood`, `harvest` or `normal`) |
| `elite:cfg` | World | Settings changed in `/realm:config` |
| `elite:pref` | Player | JSON of the player's own `alerts` choice from `/realm:prefs` |

### How it works

- A champion is a vanilla mob with the tags `realm:champion` and `realm:champion_trait:<trait>` (plus any tag a pack asked for, such as `realm:bounty:<id>`), a name tag, and effects that last as long as the game allows (about 11 days), saved with the mob. Every 5 seconds, and when one loads, missing effects and names are put back.
- **New champions:** `afterEvents.entitySpawn` with the cause `Spawned` rolls the chance; a tick later the other rules are checked (our own spawns have their tags by then, so Splitting copies and requested champions are never converted again).
- **Looks:** the helmet goes on with `/replaceitem entity @s slot.armor.head` (scripts can't reach a mob's equipment in `@minecraft/server` 2.1.0, and a mob's own drop chances can't be changed without overriding its behavior file), and on death the dropped helmet item is removed in the same tick and again over the next 5 ticks. The aura is `Dimension.spawnParticle` with vanilla particles (`minecraft:electric_spark_particle`, `minecraft:snowflake_particle`, `minecraft:redstone_ore_dust_particle`, `minecraft:villager_happy`, `minecraft:endrod`, `minecraft:basic_crit_particle`), from one loop over the loaded champions the pack already tracks, so it doesn't search the world. Changing how the mobs themselves render (a tint or overlay) would mean overriding the vanilla client entity files of every champion mob in a resource pack, which breaks whenever Mojang updates those mobs, so the pack doesn't.
- **Traits:** `afterEvents.entityHurt` counts hits on champions (and remembers which players hit them, and when), and applies Frostbound and Vampiric when a champion is the attacker, ranged attacks included. Stormcallers are checked once a second while the last overworld weather change was to thunder (`afterEvents.weatherChange`, saved in `elite:weather`); lightning is a `minecraft:lightning_bolt` entity.
- **Death:** `afterEvents.entityDie` drops the shards and XP, spawns Splitting copies, and sends `realm:champion_slain` `{ player?, helpers, name, trait, mob, tag?, dim, x, y, z }` (`player` is left out when no player had a hand in it). The killer also gets a [Field Journal](#field-journal--journal_bp) entry (`realm:journal`, page `mobs`, entry `champion_<trait>`).
- **Other packs** ask for a champion with `realm:champion_spawn` `{ dim, x, y, z, mob?, trait?, name?, tag? }`: it spawns there (the chunk must be loaded) whether `enabled` is on or not, with the given name and tag (a `realm:` tag). A `mob` that isn't in `mobs` is swapped for one that is, and any other fields (such as Story Questlines' `health`) are ignored. The Blood Moon pack's `realm:moon` `{ state }` switches the multiplier.
- The [Skills](#skills--skills_bp) pack gives extra combat XP for champions, and [Mob Health](#mob-health--mobhp_bp) shows their health like any mob's.

---

## Skills — `skills_bp`

Six skills grow as you play: Mining, Woodcutting, Farming, Fishing, Combat and Exploration. Each goes from level 1 to 50 with XP from what you already do (mining ores, chopping trees, harvesting grown crops, fishing, defeating mobs and exploring new land), and every 10 levels unlocks a small perk such as a chance of a double ore drop or a short burst of Speed. Playing near a party mate gives 10% more XP, and level 50 in a skill unlocks a title such as `Master Miner`.

### How to use

1. Play: XP counts by itself. Mine stone and ores, chop logs, harvest fully grown crops, catch things with a fishing rod, defeat mobs and travel to places you have never been. A note above the hotbar shows what you gained, for example `+5 Mining XP (level 3: 40/104)`.
2. On a level up the screen shows `Mining 12` with `Level up!`, and chat says `Mining is now level 12!`, plus any new perk (`New perk: 5% chance of a double ore drop.`).
3. Run `/realm:skills` to see every skill's level with a progress bar, then tap a skill for its total XP, how to gain it and its perks, unlocked (`[x]`) and still to come (`[ ]`).
4. Play near a friend in a party ([Parties](#parties--party_bp), `/realm:party`): while a party mate is within 64 blocks in the same dimension, you gain 10% more XP.
5. Reach level 50 to unlock a title for the [Titles & Trails](#titles--trails--titles_bp) pack: `Master Miner`, `Master Woodcutter`, `Master Farmer`, `Master Angler`, `Master Warrior` or `Master Explorer`.
6. Don't want the XP notes? Disable **Skill XP notes** in `/realm:prefs`.
7. **Operators:** `/realm:config` → **Skills** switches skills, perks and creative-mode XP, and sets the XP multiplier and the party bonus. XP per block, mob and catch, and the perks, are in `config.js`. Each skill's XP is a scoreboard (`skill_mining`, `skill_woodcutting`, `skill_farming`, `skill_fishing`, `skill_combat`, `skill_exploration`), so `/scoreboard` can show or change it.

### What players see

- **Levels:** every skill starts at level 1 and goes up to 50 (`maxLevel`). Going from level n to n + 1 takes `round(20 x n ^ 1.5)` XP (`xpBase`, `xpExponent`): 20 XP for level 2, about 2,200 XP in all for level 10, 13,400 for level 20 and 138,000 for level 50.
- **Where XP comes from:**
  - **Mining:** stone, deepslate, andesite, diorite, granite, tuff, calcite, blackstone, basalt and end stone give 1 XP; ores give more: coal and copper 3, redstone 4, iron 5, lapis 6, gold 7, diamond and emerald 15, nether quartz and nether gold 3, ancient debris 25 (`mining.blocks`). Blocks a player placed lately (the last 10,000 placed on the realm, remembered across restarts) give nothing, and neither do blocks a piston moved, so placing and breaking the same block doesn't work. Ores mined with Silk Touch give no XP (as in vanilla), since the ore block could be placed and mined again.
  - **Woodcutting:** 4 XP per log or stem of any tree, crimson and warped stems too (`woodcutting.xp`, `woodcutting.logs`). Logs placed lately don't count.
  - **Farming:** 3 XP for a fully grown wheat, carrot, potato, beetroot, nether wart or cocoa, 4 for a melon or pumpkin (`farming.crops`). Breaking it counts, and so does tapping it so it resets to its first stage, as the [Right-click Harvest](#right-click-harvest--harvest_bp) pack does.
  - **Fishing:** 12 XP for a fish, 25 for treasure (enchanted books, name tags, saddles, nautilus shells, bows, fishing rods) and 5 for junk (`fishing.fishXp`, `fishing.treasureXp`, `fishing.junkXp`).
  - **Combat:** 10 XP for a hostile mob, 2 for an animal, a golem or another peaceful mob, and more for big ones: Ender Dragon 1,000, Wither 600, Warden 300, Elder Guardian 150, Ravager 60, Evoker 40 (`combat.bosses`). A champion (a mob with the `realm:champion` tag, from the Champions pack) gives 5 times as much (`combat.championMultiplier`). Arrows and tridents count for the shooter.
  - **Exploration:** 4 XP for each chunk (a 16 x 16 area) you enter for the first time, in each dimension (`exploration.chunkXp`), and 1 XP for every 50 blocks you travel any way but teleporting (`exploration.blocksPerXp`) through chunks you haven't been in lately (not one of your last 128), so riding a rail loop or a water stream, or walking around your base, earns nothing after the first lap. At most 30 new chunks a minute give XP (`exploration.maxChunksPerMinute`), so a fast elytra flight doesn't skip levels; the rest are still remembered as explored.
- **Party bonus:** +10% XP (`partyBonus`) while a party mate (the [Parties](#parties--party_bp) pack's `realm_party:<code>` tag) is within 64 blocks (`partyRange`) in the same dimension.
- **XP notes** above the hotbar add up what you gained each second: `+5 Mining XP (level 3: 40/104)`, or `+3 Farming, +10 Combat XP` for several skills (`xpNotes`). Distance XP from walking is added quietly; new chunks show. With the [Coordinates HUD](#coordinates-hud--hud_bp) on, the HUD waits so the note stays readable (the pack sends `realm:actionbar`).
- **Perks** (`perks`, on while `perksEnabled`). Where a perk appears twice, the higher level replaces the lower:

  | Skill | Level 10 | Level 20 | Level 30 | Level 40 | Level 50 |
  |---|---|---|---|---|---|
  | Mining | 5% chance of a double ore drop | Haste I for 20s after mining 20 ores in a row | 10% double ore drop | Haste I for 30s after 12 ores in a row | 15% double ore drop |
  | Woodcutting | 5% chance of an extra log | 5% chance of an apple from a log | 10% extra log | 10% apple | 15% extra log |
  | Farming | 5% chance of an extra crop | 10% chance of extra seeds | 10% extra crop | 20% extra seeds | 15% extra crop |
  | Fishing | 5% chance of a second fish | +10% Fishing XP | 10% second fish | +20% Fishing XP | 15% second fish |
  | Combat | 5% chance of Strength I for 5s after a kill | +10% Combat XP | 10% Strength I for 5s | 10% chance of Regeneration I for 4s after a kill | 15% Strength I for 8s |
  | Exploration | +10% Exploration XP | Speed I for 10s when you enter a new chunk | +20% Exploration XP | Speed I for 20s | +30% Exploration XP |

  - A **double ore drop** drops one more of what the ore gives (coal, raw iron, a diamond...; 2 raw copper, 4 redstone or lapis, 3 gold nuggets), never with a Silk Touch tool, and never for ancient debris. Fortune doesn't change it.
  - **Ores in a row** means ores mined with at most 30 seconds between them (`mining.streakGapSeconds`); the note says `Ore streak! Haste I for 20s`.
  - **Extra crop** and **extra seeds** drop where the crop was: wheat and beetroot give their seeds, melons and pumpkins theirs; carrots, potatoes, nether wart and cocoa have no seeds to give.
  - A **second fish** drops at your feet (`Second catch!`); treasure and junk are never doubled.
  - Effects from perks show no particles.
- **Level 50** (`maxLevel`) in a skill unlocks its title (`masterTitles`) in [Titles & Trails](#titles--trails--titles_bp), and chat tells everyone `Ann reached Mining level 50 and is now a Master Miner!` (`announceMaster`). Players who reached it before Titles & Trails was installed get the title the next time they join.
- **The menu** (`/realm:skills`) shows `Total level: 47 of 300`, then a button per skill with its level and bar. A skill's page shows `Level 12 of 50`, the bar with `340/831 XP to level 13`, its total XP, how to gain XP, the chunks you have explored (Exploration), and every perk.
- **Creative mode** gains no XP and gets no perks (`skipCreative`), and neither does spectator mode.

### Commands

| Command | Who | What it does |
|---|---|---|
| `/realm:skills` | Everyone | Shows your six skills (levels 1 to 50, default `maxLevel`) with progress bars; tap one for its XP, how to gain it and its perks, unlocked and to come |

### Configuration (`scripts/config.js` → `CONFIG`)

| Option | Default | Description |
|---|---|---|
| `enabled` | `true` | Skills gain XP and perks work. Disabled: no XP, no perks; levels are kept |
| `skipCreative` | `true` | Players in creative mode gain no XP and get no perks |
| `maxLevel` | `50` | The highest level a skill can reach. Read when the world starts |
| `xpBase` | `20` | XP from level n to n + 1 is `round(xpBase x n ^ xpExponent)`. Read when the world starts |
| `xpExponent` | `1.5` | See `xpBase`. Read when the world starts |
| `xpMultiplier` | `1` | Every XP gain is multiplied by this (0.1 to 10 in game), before the party bonus and perks |
| `partyBonus` | `10` | Extra XP in percent while a party mate is within `partyRange` blocks in the same dimension (0 to 100) |
| `partyRange` | `64` | How near a party mate has to be for `partyBonus`, in blocks |
| `xpNotes` | `true` | A note above the hotbar as you gain XP, at most once a second |
| `perksEnabled` | `true` | Perks work. Disabled: levels still go up, perks do nothing |
| `announceMaster` | `true` | Tell everyone in chat when a player reaches `maxLevel` in a skill |
| `masterTitles.mining` | `Master Miner` | Title unlocked at `maxLevel` Mining (empty for none) |
| `masterTitles.woodcutting` | `Master Woodcutter` | Title unlocked at `maxLevel` Woodcutting |
| `masterTitles.farming` | `Master Farmer` | Title unlocked at `maxLevel` Farming |
| `masterTitles.fishing` | `Master Angler` | Title unlocked at `maxLevel` Fishing |
| `masterTitles.combat` | `Master Warrior` | Title unlocked at `maxLevel` Combat |
| `masterTitles.exploration` | `Master Explorer` | Title unlocked at `maxLevel` Exploration |
| `mining.blocks` | stone kinds 1, ores 3 to 25 (above) | Blocks that give Mining XP: `{ blocks, xp, drop?, amount? }`. `drop` (and `amount`, default 1) is what the double-drop perk adds; rows without it are never doubled |
| `mining.streakGapSeconds` | `30` | Ores mined at most this many seconds apart count as one streak, for the Haste perk |
| `woodcutting.logs` | every log, crimson and warped stems | Blocks that give Woodcutting XP |
| `woodcutting.xp` | `4` | XP per log |
| `farming.crops` | wheat, carrots, potatoes, beetroot (`growth` 7), nether wart (`age` 3), cocoa (`age` 2): 3 XP; melon, pumpkin: 4 XP | `{ block, state?, ripe?, xp, drop, seeds? }`: the crop, its growth state and fully grown value (without them, any break of a block not placed lately counts), its XP, what the extra crop perk drops and what the seeds perk drops |
| `fishing.fishXp` | `12` | XP for a fish |
| `fishing.treasureXp` | `25` | XP for a treasure |
| `fishing.junkXp` | `5` | XP for anything else caught |
| `fishing.fish` | cod, salmon, tropical fish, pufferfish | What counts as a fish (only fish are doubled by the second-catch perk) |
| `fishing.treasure` | enchanted book, name tag, saddle, nautilus shell, bow, fishing rod | What counts as treasure |
| `combat.xp` | `10` | XP for a mob not in `combat.passive` or `combat.bosses` |
| `combat.passiveXp` | `2` | XP for a mob in `combat.passive` |
| `combat.passive` | farm animals, fish, villagers, pets, golems, skeleton and zombie horses and other peaceful mobs | Mobs that give `combat.passiveXp` |
| `combat.bosses` | Ender Dragon 1,000, Wither 600, Warden 300, Elder Guardian 150, Ravager 60, Evoker 40 | `{ mob, xp }`: mobs with their own XP |
| `combat.championMultiplier` | `5` | A champion (tag `realm:champion`) gives this many times the XP |
| `combat.ignore` | armor stand, NPC, player, end crystal, boats, minecarts, painting, leash knot | Never give XP |
| `exploration.chunkXp` | `4` | XP for each chunk entered for the first time, per dimension |
| `exploration.blocksPerXp` | `50` | One XP for every this many blocks traveled through chunks you haven't been in lately (your last 128) |
| `exploration.maxChunksPerMinute` | `30` | At most this many new chunks a minute give XP; the rest are still remembered |
| `exploration.maxSpeed` | `100` | Movement faster than this (blocks per second) is a teleport: no distance XP |
| `exploration.maxAreas` | `4000` | Areas of 8 x 8 chunks remembered per player; past this the least recently visited are forgotten (and give XP again) |
| `perks.mining` | (table above) | Mining perks: `{ level, perk, chance?, seconds?, streak?, percent? }`. For each `perk` kind the highest unlocked row counts |
| `perks.woodcutting` | (table above) | Woodcutting perks |
| `perks.farming` | (table above) | Farming perks |
| `perks.fishing` | (table above) | Fishing perks |
| `perks.combat` | (table above) | Combat perks |
| `perks.exploration` | (table above) | Exploration perks |

Perk kinds: `doubleOre` (`chance`), `haste` (`streak`, `seconds`), `extraLog`, `apple`, `extraCrop`, `seeds`, `secondCatch` (`chance`), `strength`, `regen` (`chance`, `seconds`), `speed` (`seconds`) and `bonusXp` (`percent`, any skill).

Operators can change `enabled`, `skipCreative`, `xpMultiplier`, `partyBonus`, `partyRange`, `perksEnabled`, `announceMaster` and `xpNotes` in game with `/realm:config`; `maxLevel`, `xpBase` and `xpExponent` show there but only change in `config.js` (they move everyone's levels). Each player can switch the XP notes for themselves with **Skill XP notes** in `/realm:prefs`, which follows `xpNotes` until they choose. Everything else stays in `config.js`.

### Saved data

| Key | Scope | Contents |
|---|---|---|
| `skill_mining`, `skill_woodcutting`, `skill_farming`, `skill_fishing`, `skill_combat`, `skill_exploration` | Scoreboard | Each player's total XP in that skill; the level is worked out from it |
| `skills:map0`, `skills:map1`, ... | Player | Explored chunks: 21-character records (dimension, area x and z, a 64-bit map of the area's 8 x 8 chunks), up to 1,000 per property, least recently visited first |
| `skills:placed0`, `skills:placed1`, ... | World | Blocks placed (or moved by a piston) lately, the last 10,000: `<dimension letter>x,y,z` separated by `;`, 1,200 per property, saved every 30 seconds (planted crops are not kept) |
| `skills:pref` | Player | JSON of the player's own `xpNotes` choice from `/realm:prefs` |
| `skills:cfg` | World | Settings changed in `/realm:config` |

### How it works

- **Mining, woodcutting and farming** use `afterEvents.playerBreakBlock` (its `brokenBlockPermutation` tells a grown crop, and `itemStackBeforeBreak` a Silk Touch tool through its enchantable component). `afterEvents.playerPlaceBlock` remembers placed blocks so mining them again gives nothing, and `afterEvents.pistonActivate` marks every XP-giving block a piston moves and the spots around it; a crop with a growth state counts even where seeds were planted, since it had to grow. **Tap harvests:** `beforeEvents.playerInteractWithBlock` notes a tap on a grown crop and checks it 3 ticks later, like Daily Quests.
- **Combat** uses `afterEvents.entityDie` with the killer from its damage source.
- **Fishing:** there is no "caught a fish" event in the stable API. A fishing hook belongs to the nearest player when it appears and is followed every tick. A catch is an item that appears within 2 blocks of the hook while the hook is reeled in (the hook goes within 4 ticks of the item appearing), from a hook that was in water and out for at least 1.5 seconds. An item that appears at a player's head (dropped, not caught) never counts, so dropping things next to your hook earns nothing. Items this pack drops itself are never taken for a catch.
- **Exploration** checks each player's chunk once a second, and remembers the last 128 chunks each player was in (in memory) for distance XP. Explored chunks are bits in maps of 8 x 8 chunks, kept in memory and saved every 30 seconds and when the player leaves.
- **Party bonus:** the pack looks for another online player with the same `realm_party:` tag in range (at most once a second per player). XP from other packs gets no party bonus.
- **Other packs** can give XP with the script event `realm:skill_xp` `{ player, skill, amount }` (`player` is the player id, `skill` one of `mining`, `woodcutting`, `farming`, `fishing`, `combat`, `exploration`, `amount` up to 100,000); it is multiplied by `xpMultiplier` and the skill's `bonusXp` perk.
- **Level 50** sends `realm:title_unlock` `{ player, title, from: "skills_bp" }`, again each time the player joins (Titles & Trails ignores titles a player already has).

---

## Parties — `party_bp`

Team up with up to five friends. Party mates see each other's health, distance and direction above the hotbar, can send messages only the party reads, and share credit in packs that offer it, such as 10% more [Skills](#skills--skills_bp) XP while playing near each other. A party stays together when its members log off.

### How to use

1. Run `/realm:party` and tap **Start a party**, then pick a player from the list (nearest first) and tap **Invite**. Or type `/realm:party_invite Steve` (put a name with spaces in quotes: `/realm:party_invite "Some Name"`); that starts a party for you if you have none.
2. The invited player sees `[Party] Ann invited you to their party.` and joins with `/realm:party_accept`, or with the **Accept Ann's invite** button in `/realm:party`. An invite lasts 2 minutes.
3. While a mate is within 128 blocks in the same dimension, the bar above your hotbar shows them every 2 seconds: `Ann 18hp 40m NE | Bob 9hp 120m S` (health, distance in blocks, and which way to look). Don't want it? Disable **Party HUD** in `/realm:prefs`.
4. Talk to the party only: `/realm:party_chat "meet at the portal"` (in quotes for more than one word), or **Send a message** in `/realm:party`. Everyone in the party who is online sees `[Party] Ann: meet at the portal`.
5. Run `/realm:party` to see every member with their health and where they are (or `offline`), and to invite more players. The leader can also **Remove a member**. Leave with `/realm:party_leave` or **Leave the party**.
6. **Operators:** `/realm:config` → **Parties** switches parties on or off and sets the party size, how long invites last and the HUD's range.

### What players see

- **Party size:** at most 6 players, the leader included (`maxSize`). The player who starts the party leads it; when the leader leaves, the next member (one who is online, if any) leads, and chat says so. A party with nobody left is gone.
- **Who can invite:** any member, while the party has room. A player already in another party has to leave it first (`Bob is already in a party.`). Invites last 120 seconds (`inviteSeconds`); a newer invite replaces an older one.
- **The menu** (`/realm:party`) lists the party's code (like `K7QF`) and each member: `Ann (leader) 20hp 40m NE`, `you, 18hp`, `18hp, in the Nether` or `offline`. Buttons: **Invite players** (a dropdown of online players with their distance, nearest first), **Send a message**, **Remove a member** (leader only), **Leave the party**.
- **Offline members stay** in the party and show as `offline`; the HUD and messages skip them. A player removed while offline is out of the party when they next join.
- **The HUD** (`partyHud`, each player's own **Party HUD** in `/realm:prefs`) lists up to 4 mates (`hudMates`) within 128 blocks (`hudRange`) in your dimension, nearest first. When nobody is near it writes nothing, so other notes stay. With the [Coordinates HUD](#coordinates-hud--hud_bp) on, the HUD steps aside while the party line shows (the pack sends `realm:actionbar`). The party line itself waits while another pack's note or an expedition's run line is on the bar.
- **Party chat** is only seen by the party. Color codes are removed, and messages are cut at 200 characters (`chatMaxLength`). Ordinary chat still goes to everyone: the stable Script API can't read or change chat.
- **Friendly fire:** party mates can still hurt each other. The stable Script API has no way to cancel damage before it happens, so this pack can't block it.
- **While parties are disabled** (`enabled`), the commands answer `Parties are disabled on this realm. An operator can enable them in /realm:config (Parties).` and the HUD stops; parties and their tags are kept.

### Commands

| Command | Who | What it does |
|---|---|---|
| `/realm:party` | Everyone | Your party: members with health, distance and direction, invite players (up to 6 in a party, default `maxSize`), send a party message, remove a member (leader), leave. Without a party: start one or accept an invite |
| `/realm:party_invite <player>` | Everyone | Invites an online player (gamertag or nickname; quote names with spaces) to your party, starting one if you have none. The invite lasts 120 seconds (default, `inviteSeconds`) |
| `/realm:party_accept` | Everyone | Joins the party you were last invited to |
| `/realm:party_leave` | Everyone | Leaves your party; the next member leads if you led it |
| `/realm:party_chat <message>` | Everyone | Sends a message only your party sees, as `[Party] Name: message`. Put it in double quotes for more than one word |

### Configuration (`scripts/config.js` → `CONFIG`)

| Option | Default | Description |
|---|---|---|
| `enabled` | `true` | Players can make and join parties. Disabled: the commands say so and the HUD stops; parties are kept |
| `maxSize` | `6` | Most players in a party, the leader included (2 to 12 in game) |
| `inviteSeconds` | `120` | An invite can be accepted for this many seconds |
| `partyHud` | `true` | The party HUD above the hotbar; each player can switch it in `/realm:prefs` |
| `hudRange` | `128` | The HUD lists mates within this many blocks, in the same dimension |
| `hudMates` | `4` | The HUD lists at most this many mates, nearest first |
| `chatMaxLength` | `200` | Longest party chat message, in characters |

Operators can change `enabled`, `maxSize`, `inviteSeconds`, `partyHud`, `hudRange` and `hudMates` in game with `/realm:config`. Each player can switch the HUD for themselves with **Party HUD** in `/realm:prefs`, which follows `partyHud` until they choose. `chatMaxLength` stays in `config.js`.

### Saved data

| Key | Scope | Contents |
|---|---|---|
| `party:data` | World | JSON `{ <code>: { l, m } }`: each party's leader (player id) and members as `[player id, gamertag when last seen]`, in joining order. Kept under 30,000 characters: if it grows past that, parties of one whose member is offline are forgotten |
| `realm_party:<code>` | Player tag | On every member while they're in that party, for other packs to read |
| `party:pref` | Player | JSON of the player's own `partyHud` choice from `/realm:prefs` |
| `party:cfg` | World | Settings changed in `/realm:config` |

Pending invites are kept in memory only: they end when the realm restarts.

### How it works

- Every member carries the tag `realm_party:<code>`. Other packs read it: [Skills](#skills--skills_bp) (the party bonus), the [Bounty Board](#bounty-board--bounty_bp) and [Story Questlines](#story-questlines--saga_bp) share credit with mates in the same dimension within 64 blocks, and [Expeditions](#expeditions--expedition_bp) takes nearby mates along. The pack puts every online player's tag right when they join and every 2 seconds, so a tag left from a party they were removed from goes away.
- After any change (start, join, leave, remove) the pack sends the script event `realm:party_changed` `{ code }`.
- Parties are read into memory once and saved whenever they change. The HUD runs every 40 ticks; it's a few distance sums per member.
- `/realm:party_chat` takes one command argument, so a message of several words needs double quotes; the menu's **Send a message** box doesn't.

---

## Titles & Trails — `titles_bp`

Collect titles and wear one on a line under your name, like `Stormchaser` or `Master Miner`, and pick a particle trail that follows you as you move: a little rain cloud over your head, falling leaves, embers or sparkles. Some titles you earn by playing (travel far, stay up at night, stand out in thunderstorms); other packs give more, such as [Skills](#skills--skills_bp) at level 50.

### How to use

1. Play: three titles count up by themselves. `Wanderer` after traveling 10,000 blocks, `Night Owl` after 2 hours played at night, and `Stormchaser` after 10 minutes outdoors in thunderstorms. Each comes with a trail. Unlocking one says `New title unlocked: Stormchaser. Wear it with /realm:titles` in chat.
2. Run `/realm:titles` to see your title, your trail and how far along you are with each title to earn (`Wanderer: 3,400/10,000 blocks traveled`).
3. Tap **Choose a title** and pick one (or **None**). With the [Nicknames](#nicknames--nick_bp) pack installed, it shows in gray on a line under your name above your head.
4. Tap **Choose a trail** and pick one (or **None**). It follows you whenever you move. Trails need the Realm Skies resource pack (`sky_rp`) on the realm; without it nothing shows.
5. **Operators:** `/realm:titles` also has `Give a title or trail` (pick a player online or type a name, then the title or `trail:ember`) and `Settings` (which points to `/realm:config` → Titles & Trails). In chat, `/realm:titles_give Steve "Hero of the Realm"` gives a player a title, and `/realm:titles_give Steve trail:ember` a trail (players who are offline too, if they've played since the pack was added). `/realm:config` → **Titles & Trails** switches the built-in titles and trails and sets how often trails puff.

### What players see

- **Built-in titles** (`builtins`):

  | Title | How to earn it | Trail that comes with it |
  |---|---|---|
  | `Wanderer` | Travel 10,000 blocks, any way but teleporting (faster than `maxSpeed`), in any dimension | Falling leaves |
  | `Night Owl` | Play for 2 hours while it's night in the Overworld (from dusk to dawn, wherever you are) | Sparkles |
  | `Stormchaser` | Spend 10 minutes outdoors in the Overworld during a thunderstorm, with open sky above you (standing on sand or terracotta, as in deserts and badlands, doesn't count: no storm reaches the ground there) | Rain cloud |

- **Titles from other packs** arrive the same way, with the same chat line: [Skills](#skills--skills_bp) gives `Master Miner`, `Master Woodcutter`, `Master Farmer`, `Master Angler`, `Master Warrior` and `Master Explorer` at level 50; [Guilds & Reputation](#guilds--reputation--guilds_bp) gives `Expert Miner` and `Master Miner` (and so on) at its top two ranks; [Blood Moon](#blood-moon--harvest-moon--moon_bp) gives `Blood Moon Survivor`; [Field Journal](#field-journal--journal_bp) pages and [Story Questlines](#story-questlines--saga_bp) chapters give some too. A title you already have is never announced twice.
- **Wearing a title:** you wear one at a time, or none. It shows under your name (and under the gamertag line, if you have a nickname) through the Nicknames pack. Titles are plain text up to 32 characters (`maxTitleLength`).
- **Trails:** `Rain cloud` (a small gray cloud with a drip, over your head), `Falling leaves`, `Embers` and `Sparkles` (behind you). Everyone sees them. A puff every 4 ticks (`trailTicks`) while you move, none while you stand still, are invisible (the Invisibility effect) or in spectator mode. At most 12 puffs at a time are shared by everyone (`trailBudget`), so a busy realm stays smooth.
- **The menu** (`/realm:titles`) shows `Title: Stormchaser`, `Trail: Rain cloud`, and each built-in title as `[x] Wanderer` when you have it or `[ ] Night Owl: 45/120 minutes played at night` while you're earning it. The title and trail lists mark the one you use with `(now)`.
- **Announcements:** with `announceUnlocks` on, everyone else sees `Ann unlocked the title Stormchaser!`.
- **While the pack is disabled** (`enabled`), trails stop and the built-in titles stop counting; titles from other packs and operators are still recorded, and worn titles stay.

### Commands

| Command | Who | What it does |
|---|---|---|
| `/realm:titles` | Everyone | Shows your title, trail and progress toward the built-in titles; choose the title under your name and the trail that follows you (a puff every 4 ticks while moving, default `trailTicks`). Operators also get `Give a title or trail` (like `/realm:titles_give`) and `Settings` |
| `/realm:titles_give <player> <title>` | Ops | Gives a player a title (quote titles and names with spaces), or a trail with `trail:cloud`, `trail:leaves`, `trail:ember` or `trail:sparkle`. Works for offline players this pack has seen |

### Configuration (`scripts/config.js` → `CONFIG`)

| Option | Default | Description |
|---|---|---|
| `enabled` | `true` | Built-in titles count up and trails show. Disabled: neither; titles from other packs are still recorded and worn titles stay |
| `trails` | `true` | Trails follow the players who chose one |
| `trailTicks` | `4` | A trail puff every this many ticks while a player moves (2 to 20 in game; 20 ticks = 1 second) |
| `trailBudget` | `12` | At most this many trail puffs each time, shared by everyone |
| `announceUnlocks` | `false` | Tell everyone in chat when a player unlocks a title |
| `maxSpeed` | `100` | Movement faster than this (blocks per second) is a teleport and doesn't count for `Wanderer` |
| `maxTitleLength` | `32` | Longest title in characters; longer ones from other packs are cut |
| `builtins` | `Wanderer`, `Night Owl`, `Stormchaser` (above) | `{ title, stat, amount, trail? }`: `stat` is `distance` (blocks), `night` (seconds played at night) or `storm` (seconds outdoors in thunderstorms); `trail` is unlocked with the title |

Operators can change `enabled`, `trails`, `trailTicks`, `trailBudget` and `announceUnlocks` in game with `/realm:config`. `maxSpeed`, `maxTitleLength` and `builtins` stay in `config.js`.

### Saved data

| Key | Scope | Contents |
|---|---|---|
| `titles:p:<player id>` | World | One per player: JSON `{ n, t, r, tr, s }`, the gamertag when last seen, unlocked titles (at most 300 a player), unlocked trails, the chosen trail, and the built-in stats `{ d, n, w }` (blocks traveled, seconds at night, seconds in thunderstorms) |
| `realm_title:<text>` | Player tag | The title the player wears (at most one); the Nicknames pack shows it |
| `titles:weather` | World | The Overworld weather from the last change (`Clear`, `Rain` or `Thunder`) |
| `titles:cfg` | World | Settings changed in `/realm:config` |

### How it works

- Other packs unlock with the script events `realm:title_unlock` `{ player, title, from }` and `realm:trail_unlock` `{ player, trail, from }` (`player` is the player id; `trail` is `cloud`, `leaves`, `ember` or `sparkle`). The data is a world property per player, so an unlock for someone offline is kept for them. Repeats are ignored quietly.
- The chosen title is the player tag `realm_title:<text>`; only this pack sets or removes it. The [Nicknames](#nicknames--nick_bp) pack reads it.
- **Stats** are counted once a second and saved every minute and when the player leaves. The weather can't be read by scripts, so the pack follows `weatherChange` in the Overworld and keeps the last value in `titles:weather`, as Rain Extras does. Outdoors means the highest block above you is at most one block above your feet.
- **Trails** use `dimension.spawnParticle` with `realm:trail_cloud`, `realm:trail_leaves`, `realm:trail_ember` and `realm:trail_sparkle` from the Realm Skies resource pack, so every player nearby sees them. The pack checks every 2 ticks whether `trailTicks` have passed, then starts at a different player each time so the budget is shared fairly.

---

## Relics — `relics_bp`

Seventeen rare relics, each a named item with a power of its own: a staff that calls lightning in a thunderstorm, boots that speed you through the rain, a lamp that helps you mine, a pendant that saves you from fire. Ten come from adventures in other packs (champions, bounties, treasure maps, caravans) or are forged from 8 Relic Shards at a relicsmith; seven more are story relics, earned only in the [Story Questlines](#story-questlines--saga_bp). Relics never break and stay with you when you die.

### How to use

1. Find relics: other packs hand them out as rewards, and champions drop **Relic Shards** (purple amethyst shards named `Relic Shard`). Getting one says `You received a relic: Storm Staff (Legendary). Use in a thunderstorm: lightning strikes what you look at.` in chat.
2. Keep a relic where it works: some in your main hand, some anywhere in your hotbar or off hand, helmets and boots worn. Its lore says what it does; **Your relics** in `/realm:relics` says where it works.
3. Bring 8 Relic Shards to a relicsmith (Ida the Relicsmith, from the [Townsfolk](#townsfolk--npc_bp) pack): tap her and pick **Relic forge**, then **Forge a relic**. You get a random relic you haven't had yet; rarer ones are less likely. Story relics are never forged.
4. Run `/realm:relics` for the menu: **Your relics** (also `/realm:relics_list`) lists the relics you've found, what each does and how many are left to find.
5. Holding the Storm Meter shows the nearest storm cell above the hotbar. Don't want that? Disable **Storm Meter readout** in `/realm:prefs`.
6. **Operators:** the `/realm:relics` menu also has **Give a relic** (pick a player and a relic; or `/realm:relics_give <player> <relic>`) and **Place a relicsmith here** (or `/realm:relics_smith`), which asks the Townsfolk pack to place Ida where you stand. `/realm:config` → **Relics** enables or disables the abilities, sets the shards a forge takes, lets players forge anywhere, and sets whether relics wear out, whether the Storm Staff can strike players and how close to spawn it may strike.

### What players see

- **The relics** (`relics`). The first ten are found or forged:

  | Relic | Item | Rarity | Where it works | What it does | How to get it (other packs' defaults) |
  |---|---|---|---|---|---|
  | Storm Staff (`storm_staff`) | Trident | Legendary | Main hand | Use it in a thunderstorm in the Overworld: lightning strikes the mob or block you look at, up to 48 blocks away (`staffRange`). Cooldown 30 s | Forge |
  | Rain Charm (`rain_charm`) | Goat horn | Common | Hotbar or off hand | Regeneration I while you stand in the rain | Forge, pot of gold, treasure maps |
  | Tide Boots (`tide_boots`) | Blue leather boots | Rare | Worn | Speed I and Jump Boost I while you're in the rain | Forge, expeditions, the story (The Drowned Bell) |
  | Lantern of the Deep (`lantern_deep`) | Warped fungus on a stick | Common | Hotbar or off hand | Night Vision below y 0 | Forge, expeditions |
  | Storm Meter (`storm_meter`) | Spyglass | Rare | Main hand | Shows `Storm Meter: Cell: 340m NE, strength 7/10` above the hotbar, or `No storm cell` | Forge |
  | Compass of Echoes (`compass_echoes`) | Music disc (5); older ones are a brush | Rare | Main hand | Use it: chat says where the nearest champion is within 128 blocks (`compassRange`), e.g. `Compass of Echoes: a champion (Gerald the Unexploded) is 84m NE.` Cooldown 10 s | Forge, expeditions, treasure maps, the story (The Last Map) |
  | Frost Band (`frost_band`) | Music disc (wait) | Rare | Hotbar or off hand | Your melee hits give Slowness I for 3 s | Forge, expeditions |
  | Sun Pendant (`sun_pendant`) | Music disc (blocks) | Epic | Hotbar or off hand | When you catch fire: Fire Resistance for 10 s. Cooldown 120 s | Forge, pot of gold, treasure maps |
  | Miner's Lamp (`miners_lamp`) | Golden helmet | Common | Worn | Haste I below y 30 | Forge, expeditions |
  | Wayfarer Boots (`wayfarer_boots`) | Chainmail boots | Common | Worn | Speed I while you sprint outdoors in the Overworld | Forge, treasure maps |

  The seven **story relics** are rewards from the [Story Questlines](#story-questlines--saga_bp) only (never forged, never in random drops):

  | Relic | Item | Rarity | Where it works | What it does |
  |---|---|---|---|---|
  | Lantern Shard (`lantern_shard`) | Music disc (otherside) | Epic | Hotbar or off hand | Night Vision in the dark (at night, under cover below y 50, or in the Nether and the End). Held in your main hand, every few seconds it says where the nearest unlit seal is: `Lantern Shard: The Tide Seal pulls 340m NE` (when the story reports its seals) |
  | Gray Choir Mask (`choir_mask`) | Gray leather helmet | Epic | Worn | Choir enemies (the story's mobs tagged `saga:choir`) only do half damage to you, unless you've hit one in the last 10 s; Darkness (wardens, sculk shriekers) is removed. Sneaking is already silent to sculk in the game |
  | Hal's Compass (`hal_compass`) | Music disc (13) | Rare | Main hand | Use it: `Hal's Compass: Your last death: 340m NE (y 12). Home: 120m S (y 70).` (home is your bed or respawn point, else `World spawn`). Cooldown 5 s |
  | Fen Charm (`vesna_charm`) | Music disc (chirp) | Rare | Hotbar or off hand | Poison never takes hold, and witches (their potions too) can't hurt you, unless you've hit a witch in the last 10 s |
  | The Singing Blade (`singing_blade`) | Iron sword | Epic | Main hand | Each melee hit rings a bell note: monsters within 6 blocks of what you hit (`auraRange`) get Slowness II for 2 s; at most once every 2 s |
  | The Hollow Crown (`hollow_crown`) | Chainmail helmet | Legendary | Worn | At night in the Overworld: Night Vision and Strength I. Villagers and wandering traders shun you: tapping one says `The villager shrinks away from the Hollow Crown` (no trading while you wear it) |
  | Keeper's Lamp (`keeper_lamp`) | Music disc (strad) | Rare | Hotbar or off hand | In the dark: a ring of end rod light around you (everyone sees it), and monsters within 6 blocks (`auraRange`) slow down (Slowness I) |

- **A relic** has a colored name (green common, blue rare, purple epic, gold legendary) and lore: its rarity, what it does and its cooldown. Relics are kept when you die (`keepOnDeath`) and their durability is restored while you hold or wear them (`autoRepair`), so they never break. The Storm Staff is a trident that can't be thrown or charged (using it calls lightning instead), so it can't be lost in lava or the void; it still hits like a trident. Relics can't go in a jukebox. Don't put a relic in a crafting grid (to dye the Tide Boots, say): what comes out is a plain item.
- **"In the rain"** means in the Overworld while it rains or thunders, with nothing 2 or more blocks over your head (leaves count as cover), and not on sand, terracotta, snow or ice, where it doesn't rain.
- **Effects** last about 10 seconds, are topped up while the condition holds and are removed within a second of it ending. A stronger or longer effect, such as a potion, is never shortened.
- **The Storm Staff** answers when the pack knows it's thundering: the weather changed to a thunderstorm while the pack was running, a lightning bolt it didn't make struck in the Overworld in the last minute (so it also works in a storm that started before the pack was installed, once the first bolt falls), or you're within 160 blocks of a storm cell from [Storm Chasing](#storm-chasing--storm_bp). A strike says `Storm Staff: lightning! Ready again in 30s`. Otherwise it says why, above the hotbar: `Storm Staff: it only answers in a thunderstorm`, `Storm Staff: ready in 12s`, `Storm Staff: nothing to strike within 48 blocks`, `Storm Staff: the sky won't strike within 24 blocks of spawn` (`avoidSpawn`, 0 = anywhere), or `Storm Staff: too close to you`. It doesn't strike players (`staffHitsPlayers`) or townsfolk; it hits what's behind them. It won't strike within 5 blocks of you, another player (unless `staffHitsPlayers`), a villager or wandering trader, a tamed pet, a townsfolk NPC, an armor stand, an item frame or a painting, and any fire the bolt starts is put out (checked for 4 seconds), so it can't burn a build.
- **The forge** takes 8 shards (`shardsPerForge`) from anywhere in your inventory and gives a random relic you haven't had yet from the first ten, picked by rarity: common 50, rare 30, epic 15, legendary 5 (`rarityWeights`). Once you've had all ten, any of them. Without shards it says `You need 8 Relic Shards to forge a relic. You have 3.`
- **`/realm:relics`** opens a menu: **Your relics**, **Forge a relic** (only when operators let players forge anywhere, `forgeAnywhere`), and for operators **Give a relic** and **Place a relicsmith here**. **Your relics** shows `Relics found: 3 of 10`, each relic you've had with its rarity, ability, cooldown and where it works (`- not with you` when it isn't in your inventory), how many of each rarity are still to find, then `Story relics: 1 of 7` and the story relics you've had. Opened from a relicsmith, it's the **Relic forge** with a **Forge a relic** button.
- **Place a relicsmith here** (operators) asks the [Townsfolk](#townsfolk--npc_bp) pack to place Ida the Relicsmith (`relicsmithId`) at your spot, facing your way, like `/realm:npc_add ida`: `The relicsmith is here.` Without the Townsfolk pack it says `No answer from the Townsfolk pack, so no relicsmith was placed.` and that the pack is needed. A relicsmith is any townsfolk with the `relicsmith` role (`npcRole`).
- **Gifts for players who are offline** (from another pack) wait and are handed over 5 seconds after they next join.
- The first time you get each relic, the [Field Journal](#field-journal--journal_bp) records it on its Relics page.

### Commands

| Command | Who | What it does |
|---|---|---|
| `/realm:relics` | Everyone | Opens the relics menu: your relics, the forge when players may forge anywhere (default disabled, `forgeAnywhere`), and for operators giving a relic and placing a relicsmith |
| `/realm:relics_list` | Everyone | Lists the relics you've found and what they do |
| `/realm:relics_give <player> <relic>` | Operators | Gives the player a new relic: `storm_staff`, `rain_charm`, `tide_boots`, `lantern_deep`, `storm_meter`, `compass_echoes`, `frost_band`, `sun_pendant`, `miners_lamp`, `wayfarer_boots`, or a story relic: `lantern_shard`, `choir_mask`, `hal_compass`, `vesna_charm`, `singing_blade`, `hollow_crown`, `keeper_lamp` |
| `/realm:relics_smith` | Operators | Places the relicsmith (Ida, `relicsmithId`) where you stand; needs the Townsfolk pack |

### Configuration (`scripts/config.js` → `CONFIG`)

| Option | Default | Description |
|---|---|---|
| `enabled` | `true` | Relic abilities work. Disabled, relics are only keepsakes; the forge and the commands still work |
| `shardsPerForge` | `8` | Relic Shards it takes to forge one relic (1–64 in game) |
| `forgeAnywhere` | `false` | Players can forge from `/realm:relics` anywhere, not only at a relicsmith |
| `npcRole` | `"relicsmith"` | The townsfolk role that offers **Relic forge** |
| `relicsmithId` | `"ida"` | The townsfolk **Place a relicsmith here** places (a Townsfolk pack id with the `npcRole` role) |
| `keepOnDeath` | `true` | New relics stay with their owner on death (set when a relic is made) |
| `autoRepair` | `true` | A relic's durability is restored while it's held or worn, so it never breaks |
| `rarityWeights.common` | `50` | How likely the forge picks a common relic (relative to the others) |
| `rarityWeights.rare` | `30` | The same for rare relics |
| `rarityWeights.epic` | `15` | The same for epic relics |
| `rarityWeights.legendary` | `5` | The same for legendary relics |
| `staffRange` | `48` | How far the Storm Staff reaches (blocks) |
| `staffHitsPlayers` | `false` | The Storm Staff can strike players |
| `avoidSpawn` | `24` | No Storm Staff lightning within this many blocks of world spawn (0 = anywhere; 0-256 in game). Fires a bolt starts are put out either way |
| `compassRange` | `128` | How far the Compass of Echoes looks for a champion (blocks) |
| `auraRange` | `6` | How far the Singing Blade's note and the Keeper's Lamp's slowing reach (blocks); the lamp's ring of light is drawn at up to 4 |
| `relics` | the 17 above | `{ id, name, item, rarity, where, cooldown, ability, story? }` per relic. `id` is saved on items, so keep it. `item` must be an item that doesn't stack (relics carry data, which only those can); a stacking one is replaced with a brush. `where` is `hand`, `carry` (hotbar or off hand), `head` or `feet`. `cooldown` in seconds. `ability` is the lore text. `story: true` relics are never forged. The powers belong to the ids, so a new id would only be a keepsake |

Operators can change `enabled`, `shardsPerForge`, `forgeAnywhere`, `autoRepair`, `staffHitsPlayers` and `avoidSpawn` in game with `/realm:config`. Each player can switch the Storm Meter's readout with **Storm Meter readout** in `/realm:prefs`. The rest stays in `config.js`.

### Saved data

| Key | Scope | Contents |
|---|---|---|
| `relic:id` | Item | The relic's id, on the relic item itself |
| `relic:serial` | Item | A number unique to each relic made on this realm |
| `relics:found` | Player | JSON array of the relic ids the player has had |
| `relics:death` | Player | JSON `{ dim, x, y, z }`: where the player last died, for Hal's Compass |
| `relics:pref` | Player | The player's own **Storm Meter readout** choice |
| `relics:serial` | World | The last serial number handed out |
| `relics:pending` | World | JSON `{ playerId: { r, s } }`: relics and shards waiting for players who were offline |
| `relics:weather` | World | The Overworld weather at the last change (`Clear`, `Rain` or `Thunder`); the stable Script API can't read it |
| `relics:cfg` | World | Settings changed in `/realm:config` |

Cooldowns are kept in memory, so a restart makes every relic ready again.

### How it works

- A relic is a vanilla item with a name, lore and the item dynamic property `relic:id`. Only items that don't stack can carry dynamic properties, which is why the relics are tools, armor, horns and discs. Compasses stack in Bedrock (64, lodestone compasses too), so the compass relics are discs; Compasses of Echoes made before 1.1.0 are brushes and still work. An anvil can rename any item but can't add the property, so a fake relic does nothing.
- Once a second each player's hotbar, off hand, head and feet are read (12 slots). Wanted effects are added for 210 ticks (Night Vision 400, so it doesn't flicker) when they're missing or run low, and removed when no longer wanted if they're still level I and no longer than that. A durability-damaged relic in hand or worn is mended (`autoRepair`), and a relic whose lore is out of date (an ability that changed in an update) gets the current lore. "In the rain", "outdoors" and "under cover" use one `getTopmostBlock` over the player, only when a relic needs it. The stable API can't read light levels, so "in the dark" is night (time 13000-23000), under cover below y 50, or the Nether and the End.
- **Used relics** (Storm Staff, Compass of Echoes, Hal's Compass) run from `beforeEvents.itemUse`; the staff's use is canceled so the trident never charges or flies. A tap that arrives as `beforeEvents.playerInteractWithBlock` (aiming at the ground) does the same, and `afterEvents.itemStartUse` is a safety net for the staff; one tap does one thing (4 ticks apart). `playerInteractWithBlock` also keeps relics out of jukeboxes.
- **Weather:** the stable API can't read it, so it comes from `weatherChange` (saved as `relics:weather`, so it survives a restart; the event's dimension is matched with or without `minecraft:`), from `entitySpawn` of a `minecraft:lightning_bolt` the staff didn't make (a thunderstorm for the next minute), and from Storm Chasing's `realm:storm_cell` reports.
- **The Storm Staff** aims with `getEntitiesFromViewDirection` (players, items, projectiles and townsfolk skipped) and falls back to `getBlockFromViewDirection` (water counts as a target), then spawns `minecraft:lightning_bolt` and removes `minecraft:fire` (nothing else) in the 7 x 7 x 7 blocks around the strike 1, 5, 15, 40 and 80 ticks later. The compass finds the closest entity tagged `realm:champion` ([Champions](#champions--elite_bp)).
- **Hits** use `afterEvents.entityHurt`: the Frost Band and Singing Blade on a melee hit by the player (the blade's monsters are `families: ["monster"]`, its note is `note.bell`); the Sun Pendant when fire, burning, lava, magma or a campfire hurts the player (also checked every second while on fire). The stable API can't cancel damage or clear a mob's target, so the Gray Choir Mask and the Fen Charm give back the damage right after the hit (half for the mask, all for the charm), unless the player hit a mob tagged `saga:choir` (or a witch) in the last 10 s. `beforeEvents.effectAdd` cancels Poison for the Fen Charm; `beforeEvents.playerInteractWithEntity` turns villagers away from the Hollow Crown; `afterEvents.entityDie` saves the death point.
- The Storm Meter shows the last `realm:storm_cell` report from [Storm Chasing](#storm-chasing--storm_bp) (sent every 2 s); without one in the last 5 seconds it says `No storm cell`.
- **Seals** (Lantern Shard): the pack listens for `realm:seals` `{ player?, seals: [{ name, dim, x, z }] }`, the seals still unlit (for that player when `player` is given, else for everyone; an empty list clears it), and asks with `realm:seals_ping` `{}` 5 seconds after the world loads. The [Story Questlines](#story-questlines--saga_bp) is the pack meant to send it; without it the shard only gives Night Vision.
- **The relicsmith:** **Place a relicsmith here** sends `realm:npc_summon` `{ id: "ida", player }` to the [Townsfolk](#townsfolk--npc_bp) pack and waits 1 second for `realm:npc_summoned` `{ id, player, ok, error? }`.
- Other packs give relics and shards with the script events `realm:relic_give` `{ player, relic }` (story relics included: Story Questlines rewards them by id) and `realm:shard_give` `{ player, amount }` (at most 640). A Relic Shard is `minecraft:amethyst_shard` named `Relic Shard` whose first lore line is `Bring 8 to a relicsmith`; that lore line is how the forge counts them. Townsfolk with the `relicsmith` role get the **Relic forge** offer in answer to `realm:npc_talk`, and `realm:npc_choose` opens the forge.
- The first time a player has a relic (given, forged, or seen in their hotbar or armor, for one traded to them), the pack sends `realm:journal` `{ page: "relics" }`.

---

## Field Journal — `journal_bp`

A journal that fills itself as you play: the mobs you've defeated, the places you've been, the fish you've caught, the weather and sky events you've seen, the relics you've had and the story chapters you've finished. Each page shows how complete it is, and finishing a page gives XP levels, Crowns and a title.

### How to use

1. Play: entries are added on their own. The first time you defeat a creeper, chat says `Journal: New entry in Mobs - Creeper`.
2. Run `/realm:journal` to open the journal: your overall completion, then a button per page with its progress (`Mobs 12/30 (40%)`). Open a page to see what you've found (`[x]`) and what's still missing (`[ ]`), with a short note on each mob you've met.
3. Find every entry on a page to finish it: chat says `Journal page complete: Mobs! Reward: 10 levels, the title Naturalist` and `+200 Crowns (Journal: Mobs)`.
4. Don't want a chat line for every entry? Disable **New journal entry notes** in `/realm:prefs`.
5. **Operators:** `/realm:config` → **Field Journal** enables or disables new entries, the page rewards and the entry notes. The pages, their entries and rewards, and how biomes are recognized are in `config.js`.

### What players see

- **Mobs** (30 entries): the first time you defeat each kind of mob (arrows and tridents count): zombie, husk, drowned, skeleton, stray, bogged, creeper, spider, cave spider, enderman, witch, slime, phantom, pillager, vindicator, guardian, silverfish, breeze, blaze, ghast, magma cube, wither skeleton, piglin, hoglin, shulker, cow, pig, sheep, chicken and rabbit. Each found mob shows a one-line note (`Silent until it hisses. Keep your distance.`). Other mobs you defeat are listed under "Also found". Reward: 10 levels, 200 Crowns, title **Naturalist**.
- **Places** (29 entries): the Overworld, the Nether and the End; below y 0 and below y -55; above y 200 and above y 300 (in the overworld); 1,000, 5,000 and 10,000 blocks from world spawn (`farDistances`); and biomes, recognized from the blocks around you (below). The page also shows your deepest and highest y and the farthest you've been from spawn. Reward: 10 levels, 200 Crowns, title **Explorer**.
- **Biomes** can't be read by a pack, so they're guessed from blocks (`biomes`): the surface block over you for Desert (sand, cactus or dead bushes, above y 66), Badlands (red sand or terracotta), Snowy lands (snow or ice), Jungle (jungle leaves), Mushroom Fields (mycelium), Cherry Grove (cherry leaves or pink petals), Swamp (mangrove or lily pads), Taiga (spruce leaves or podzol), Dark Forest, Savanna (acacia leaves) and Pale Garden; deep water under open sky for Ocean; the block under your feet for Lush Caves (moss, below y 50), Dripstone Caves, the Deep Dark (sculk, below y 0) and the four Nether biomes (crimson or warped nylium, soul sand or soil, basalt or blackstone). A build of the right blocks can count too.
- **Fish** (4 entries): cod, salmon, tropical fish and pufferfish caught with a fishing rod. Species from [Fishing 2.0](#fishing-20--fishing_bp) are listed under "Also found". Reward: 5 levels, 100 Crowns, title **Angler**.
- **Weather** (9 entries): rain and a thunderstorm (being in the overworld, not deep underground, while it happens), a storm cell ([Storm Chasing](#storm-chasing--storm_bp)), a tornado ([Tornadoes](#tornadoes--tornado_bp)), a rainbow ([Rainbows & the Pot of Gold](#rainbows--the-pot-of-gold--rainbow_bp)), a meteor ([Meteor Strikes](#meteor-strikes--meteor_bp)), an aurora ([Aurora & Shooting Stars](#aurora--shooting-stars--night_bp)), a Blood Moon and a Harvest Moon ([Blood Moon & Harvest Moon](#blood-moon--harvest-moon--moon_bp)). A sky event counts for everyone in its dimension within 256 blocks of it (`skyEventRadius`), or everyone there when it has no spot. Reward: 10 levels, 250 Crowns, title **Stormwatcher**.
- **Relics** (10 entries): the first time you have each relic from [Relics](#relics--relics_bp). Reward: 15 levels, 500 Crowns, title **Relic Keeper**.
- **Story**: the chapters you finish in [Story Questlines](#story-questlines--saga_bp), in order. It has no fixed list, so no completion.
- **Overall** completion counts every entry on the pages with a list. Rewards are given once per page; Crowns go on the shared `crowns` scoreboard ([Crowns](#crowns--crowns_bp)) and titles to [Titles & Trails](#titles--trails--titles_bp). Without those packs the levels are still given.
- **Entry notes**: the first one each session ends with `(/realm:journal)` so new players find the book.

### Commands

| Command | Who | What it does |
|---|---|---|
| `/realm:journal` | Everyone | Opens your journal: completion overall and per page, then each page's entries (default rewards, `pages`) |

### Configuration (`scripts/config.js` → `CONFIG`)

| Option | Default | Description |
|---|---|---|
| `enabled` | `true` | New entries are recorded. Disabled, nothing new is added; the journal can still be read |
| `notes` | `true` | A chat line for each new entry. Each player can choose in `/realm:prefs` |
| `rewards` | `true` | Finishing a page gives its reward |
| `skyEventRadius` | `256` | Players within this many blocks of an announced sky event get its Weather entry |
| `farDistances` | `[1000, 5000, 10000]` | Distances from world spawn (blocks, overworld) that are Places entries, `far_<distance>`; each needs an entry in the Places page |
| `pages` | 6 pages (above) | `{ id, label, entries, reward }` per page, in menu order. `entries`: `{ id, label, blurb? }` (keep each `id`: players' journals are saved by it). `reward`: `{ levels, crowns, title }`. Mob ids are the mob's id without `minecraft:`; fish ids are the fish item's |
| `biomes` | 18 rules (above) | How biomes are guessed: `{ entry, at, blocks, dim?, minY?, maxY? }`. `at` is `top` (the surface block over you, while you're near the surface) or `feet` (the block you stand on or in). The first rule that matches wins |

Operators can change `enabled`, `rewards` and `notes` in game with `/realm:config`. Each player can switch the entry notes for themselves with **New journal entry notes** in `/realm:prefs`, which follows `notes` until they choose. The rest stays in `config.js`.

### Saved data

| Key | Scope | Contents |
|---|---|---|
| `journal:data` | Player | JSON `{ e, l, r, lo, hi, far }`: entry ids found per page, labels of entries that aren't in `config.js` (up to 40 such entries per page; a label is only saved when it differs from the name made from the id), pages already rewarded, deepest and highest y, farthest from spawn. Kept under 30,000 characters: past that, entries that aren't in `config.js` are refused, and saved labels are dropped to make room for ones that are |
| `journal:pref` | Player | The player's own **New journal entry notes** choice |
| `journal:weather` | World | The overworld weather at the last change; the stable Script API can't read it |
| `journal:cfg` | World | Settings changed in `/realm:config` |

### How it works

- **Mobs:** `afterEvents.entityDie` with a player as the damaging entity. Things that aren't mobs (armor stands, townsfolk NPCs, end crystals, boats, minecarts, paintings, item frames, leash knots) never make an entry.
- **Places, rain and thunder:** every 2 seconds each player's dimension, height and distance from world spawn are checked, plus one `getTopmostBlock` and two `getBlock` lookups for biomes (one more over deep water). Weather comes from `weatherChange` and is saved as `journal:weather`.
- **Fish:** a fishing hook belongs to the nearest player when it appears. A catch is an item that appears within 2 blocks of the hook while it's reeled in (the hook goes within 4 ticks of the item appearing), from a hook that was in water and out for at least 1.5 seconds, the same check as [Skills](#skills--skills_bp). An item that appears at a player's head (dropped, not caught) never counts, so dropping a fish next to your hook doesn't add it.
- **Other packs** add entries with `realm:journal` `{ player, page, entry, label }` (pages `mobs`, `places`, `fish`, `weather`, `relics`, `story`). The pack also listens to `realm:sky_event` (only kinds on the Weather page) and `realm:moon` (`blood`, `harvest`: everyone in the overworld).
- Finishing a page adds the levels, adds Crowns to the `crowns` scoreboard and sends `realm:title_unlock` `{ player, title, from: "journal_bp" }`.

---

## Fishing 2.0 — `fishing_bp`

Every fish you catch with a rod becomes one of 40 species, from the common Atlantic Cod to the legendary Old Whiskers, with a size in cm and your name on it. Which species bite depends on the weather, the time of day and the water you fish in (ocean, river, frozen water, swamp, jungle or cave). Your fish log keeps your personal bests, the realm keeps the biggest fish of each species, and every Sunday evening there's a fishing tournament with Crowns for the top three. Old Tobin the fisherman, from [Townsfolk](#townsfolk--npc_bp), buys your fish.

### How to use

1. Fish with a rod as usual. When a cod, salmon, tropical fish or pufferfish comes up, it's a species: chat says `You caught a Storm Eel (82 cm)!`, with `New realm record!`, `Personal best!` or `New species for your log (12/40).` when it is one.
2. Fish in different places and weathers to find more: some only bite in thunderstorms, at night, at dawn, in caves, in frozen water, in swamps or in the jungle.
3. Run `/realm:fishing` for the fishing menu: **Fish log**, **Realm records**, **Make my fish stackable** and **Fishing settings** (operators also get **Start a tournament now**).
4. **Fish log** (or `/realm:fishing_log`) shows how many species you've caught out of 40, how many of each and your biggest. Species you haven't caught yet show as `???` with a hint, like `??? (Rare: thunderstorms)`. **Realm records** (or `/realm:fishing_top`) shows the realm's biggest fish of each species and who caught them.
5. Measured fish don't stack. To stack them, pick **Make my fish stackable** (or run `/realm:fishing_stack`): after you confirm, every measured raw fish in your inventory becomes a plain cod, salmon, tropical fish or pufferfish. Your log and the records keep them.
6. In **Fishing settings** (or `/realm:prefs` → **Fishing 2.0**), disable **Measure my catches** to always get plain fish that stack, or enable **Only measure notable catches** to get a measured fish only for a new species, a personal best or a realm record. Either way, every catch still counts in your log, the records and the tournament.
7. Join the weekly tournament (Sundays at 18:00 UTC, for an hour): the biggest fish for its kind wins. Chat tells everyone 10 minutes before and when it starts.
8. Sell your fish: tap Old Tobin (or any NPC with the `fisher` role) and pick **Sell fish**. **Fish records** there shows the realm's records. Fishers only buy measured fish.
9. **Operators:** **Start a tournament now** in the menu, or `/realm:fishing_tournament`, starts one. `/realm:config` → **Fishing 2.0** switches the species and the tournament, sets the tournament's day, hour and length, and whether legendary catches are announced. The species themselves are the `species` list in `config.js`.

### What players see

- **A catch:** the fish that flies out of the water is named after its species in its rarity's color (white Common, green Uncommon, blue Rare, purple Epic, gold Legendary), with three lore lines: its size (`82 cm`), `Caught by Alex` and the date (`Oct 10, 2026`, UTC). Only cod, salmon, tropical fish and pufferfish change; junk and treasure stay as they are. A cod becomes one of the cod species, a salmon one of the salmon species, and so on. Fish with different sizes or catchers don't stack.
- **Plain fish instead:** with **Measure my catches** disabled, the fish you reel in stays a plain vanilla fish that stacks; with **Only measure notable catches** enabled, only a new species, a personal best or a realm record comes measured. Chat still says what you caught (`You caught an Atlantic Cod (54 cm)!`), and the catch still goes in your log, the records, the tournament, the Field Journal and Skills.
- **Make my fish stackable** (menu, or `/realm:fishing_stack`): asks `Turn your 5 measured raw fish into plain cod, salmon, tropical fish and pufferfish that stack?`, then replaces every measured raw cod, salmon, tropical fish and pufferfish in your inventory with plain vanilla ones, merged with the plain ones you already carry into as few stacks as possible, and says `5 fish are plain now and stack.` Cooked fish, renamed fish and anything this pack didn't measure are left alone. The plain fish are exactly vanilla (no name, no lore), so they stack with any other and the [Crowns](#crowns--crowns_bp) market buys them; a fisher doesn't.
- **Which species:** among the species of that fish that can bite right there and then, rarer ones bite less often: Common 60, Uncommon 25, Rare 10, Epic 4 and Legendary 1 (`rarities`). Sizes lean small, so fish near the top of their range are rare.
- **Conditions** (a species with several must have all of them):
  - **Weather:** clear, rain or thunderstorms, in the Overworld (elsewhere counts as clear). The Rainbow Trout only bites in the first 10 minutes after rain stops.
  - **Time:** dawn (game time 23000 to 1000), day, dusk (11500 to 13500) and night.
  - **Place**, guessed from the blocks around the bobber, since the game doesn't tell packs the biome: **ocean** when at least 70% of the water level around it, up to 16 blocks away, is water (`oceanShare`), otherwise **rivers and lakes**; **frozen water** with ice or snow nearby; **swamps** with lily pads, mangrove roots or mud; **jungle** with jungle trees or bamboo nearby; **caves** when the water is below height 50 (`caveBelowY`) with blocks over it.
- **Chat:** `You caught a Storm Eel (82 cm)!`, plus `New realm record!` (the biggest of that species yet), `Personal best!` or `New species for your log (12/40).`, and `(Tournament: 2nd)` during a tournament. A level-up sound plays for a record or a new species. When someone catches a legendary fish, everyone else sees `Alex caught a legendary Old Whiskers (164 cm)!` (`announceLegendary`).
- **The menu** (`/realm:fishing`): the tournament line, then **Fish log**, **Realm records**, **Make my fish stackable** (with how many measured raw fish you carry), **Fishing settings** (with your **Measure my catches** setting) and, for operators, **Start a tournament now**.
- **The fish log** (**Fish log**, or `/realm:fishing_log`): `Species caught: 12/40   Fish caught: 57`, the tournament line, then every species by rarity: caught ones as `Storm Eel x3, best 82 cm`, the others as `???` with their rarity and conditions. A button opens the realm records.
- **Realm records** (`/realm:fishing_top`, or **Fish records** at a fisher): each species' biggest fish, `Storm Eel: 160 cm by Alex, Oct 10, 2026`, and the tournament line: `Tournament on! Ends in 23m. Leader: ...` or `Next tournament: Sunday at 18:00 UTC (in 2d 5h).`
- **The tournament:** every week on `tournamentDay` (0 = Sunday) at `tournamentHourUtc` (18) UTC for `tournamentMinutes` (60). Chat says `A fishing tournament starts in 10m! Grab a rod.` 10 minutes before (`tournamentWarnMinutes`) and `The fishing tournament has begun! ... Prizes: 50, 30, 15 Crowns.` at the start. Each player's best fish counts, measured against its species' biggest size (an 82 cm Storm Eel is 46% of 180 cm), so a big Clownfish can beat a small Storm Eel. At the end chat lists the top three with their fish, and they get 50, 30 and 15 [Crowns](#crowns--crowns_bp) (`tournamentPrizes`): `+50 Crowns (Fishing tournament: 1st place)`. A winner who left before the end is paid the next time they join. If the realm was down when a tournament was due, it starts when the realm comes back, as long as it's still within the tournament's hour.
- **Selling** (tap an NPC with the `fisher` role, `npcRole`, and pick **Sell fish**): the menu lists the fish you carry with what each pays, and **Sell all**. A fish pays its rarity's price (Common 2, Uncommon 5, Rare 12, Epic 30, Legendary 80 Crowns) x (0.5 + its size / the species' biggest size), so a record-sized fish pays one and a half times the price. Chat says `+25 Crowns (Sold 3 fish)`. Only fish this pack named are bought: a renamed vanilla fish has no size lore. The [Crowns](#crowns--crowns_bp) market doesn't buy named fish.
- **Other packs:** each catch is a `fish` page entry in the [Field Journal](#field-journal--journal_bp) (`realm:journal`, the species id) and Fishing XP in [Skills](#skills--skills_bp) (5, 10, 25, 50 or 100 by rarity, `rarities`). Tournament prize winners finish a `tournament` quest for packs that count them. The tournament start is a `tournament` sky event, which the innkeepers of [Waystones & Inns](#waystones--inns--waystone_bp) remember for **Hear the news**.

The species:

| Species | Fish | Rarity | Size (cm) | Bites |
|---|---|---|---|---|
| Atlantic Cod | Cod | Common | 35-100 | anywhere, any time |
| Haddock | Cod | Common | 30-70 | ocean |
| Brook Perch | Cod | Common | 15-40 | rivers and lakes |
| Blind Cavefish | Cod | Common | 8-20 | caves |
| Lantern Perch | Cod | Uncommon | 15-45 | caves |
| Frostfin | Cod | Uncommon | 30-70 | frozen water |
| Bog Catfish | Cod | Uncommon | 40-120 | swamps |
| Rain Carp | Cod | Uncommon | 30-90 | rain or thunderstorms |
| Dawn Pike | Cod | Uncommon | 50-120 | dawn |
| Moonscale Cod | Cod | Rare | 40-110 | night |
| Storm Eel | Cod | Rare | 60-180 | thunderstorms |
| Abyssal Ling | Cod | Epic | 60-150 | caves |
| Old Whiskers | Cod | Legendary | 120-200 | night, swamps |
| Silver Salmon | Salmon | Common | 45-100 | anywhere, any time |
| River Salmon | Salmon | Common | 40-90 | rivers and lakes |
| Brook Trout | Salmon | Common | 20-50 | day, rivers and lakes |
| Sockeye Salmon | Salmon | Uncommon | 45-85 | rain or thunderstorms, rivers and lakes |
| Arctic Char | Salmon | Uncommon | 30-80 | frozen water |
| Dusk Grayling | Salmon | Uncommon | 25-55 | dusk |
| Tiger Trout | Salmon | Uncommon | 30-70 | jungle |
| Rainbow Trout | Salmon | Rare | 25-75 | first 10 minutes after rain stops |
| Ember Salmon | Salmon | Epic | 50-110 | clear skies, dusk |
| Jungle Arapaima | Salmon | Epic | 120-250 | jungle |
| Frost Monarch | Salmon | Legendary | 80-150 | night, frozen water |
| Clownfish | Tropical fish | Common | 6-12 | anywhere, any time |
| Blue Tang | Tropical fish | Common | 15-30 | day, ocean |
| Neon Tetra | Tropical fish | Common | 2-4 | jungle |
| Parrotfish | Tropical fish | Uncommon | 30-70 | ocean |
| Angelfish | Tropical fish | Uncommon | 10-25 | jungle or swamps |
| Glowtail | Tropical fish | Rare | 3-8 | caves |
| Thunder Betta | Tropical fish | Rare | 5-8 | thunderstorms |
| Sunburst Wrasse | Tropical fish | Rare | 15-40 | clear skies, day, ocean |
| Starlight Koi | Tropical fish | Epic | 30-80 | clear skies, night, rivers and lakes |
| Golden Koi | Tropical fish | Legendary | 40-90 | dawn, rivers and lakes |
| Pufferfish | Pufferfish | Common | 10-40 | anywhere, any time |
| Spiny Puffer | Pufferfish | Uncommon | 20-50 | ocean |
| Swamp Toadfish | Pufferfish | Uncommon | 15-35 | swamps |
| Moon Puffer | Pufferfish | Rare | 10-35 | night |
| Glacier Puffer | Pufferfish | Rare | 15-45 | frozen water |
| Stormblower | Pufferfish | Epic | 30-70 | thunderstorms |

### Commands

| Command | Who | What it does |
|---|---|---|
| `/realm:fishing` | Everyone | The fishing menu: fish log, realm records, make your fish stackable, your fishing settings, and (operators) start a tournament |
| `/realm:fishing_log` | Everyone | Your fish log: species caught out of 40, how many of each and your biggest, hints for the rest, and the tournament |
| `/realm:fishing_stack` | Everyone | Turns every measured raw fish in your inventory into plain fish that stack (asks first) |
| `/realm:fishing_top` | Everyone | The realm's biggest fish of each species, who caught it and when, and the tournament |
| `/realm:fishing_tournament` | Operators | Starts a tournament now, for the usual length (default 60 minutes, `tournamentMinutes`) |

### Configuration (`scripts/config.js` → `CONFIG`)

| Option | Default | Description |
|---|---|---|
| `enabled` | `true` | Vanilla fish caught with a rod become a species with a size and the catcher's name |
| `announceLegendary` | `true` | Tell everyone in chat when someone catches a legendary fish |
| `rarities` | Common, Uncommon, Rare, Epic, Legendary | `{ id, label, weight, color, price, xp }` per rarity: how often it bites (60, 25, 10, 4, 1), the name's color code, the Crowns a fisher pays before the size factor (2, 5, 12, 30, 80) and the Fishing skill XP a catch gives (5, 10, 25, 50, 100) |
| `caveBelowY` | `50` | Water below this height with blocks over it is a cave |
| `oceanShare` | `0.7` | Share of the water level around the bobber (up to 16 blocks) that must be water for the ocean; less is rivers and lakes |
| `npcRole` | `"fisher"` | The NPC role whose NPCs buy fish and show the records |
| `tournamentEnabled` | `true` | Hold the weekly tournament |
| `tournamentDay` | `0` | Its day of the week, UTC: 0 = Sunday ... 6 = Saturday |
| `tournamentHourUtc` | `18` | The hour it starts, UTC |
| `tournamentMinutes` | `60` | How long it lasts, in minutes (10 to 180 in game) |
| `tournamentWarnMinutes` | `10` | Chat warns this many minutes before it starts (0 = no warning) |
| `tournamentPrizes` | `[50, 30, 15]` | Crowns for 1st, 2nd and 3rd place; add or remove numbers for more or fewer places |
| `species` | 40 species (above) | `{ id, name, item, rarity, min, max, weather?, time?, places?, afterRain? }`: the fish `item` it replaces, its size range in cm and its conditions: `weather` (`Clear`, `Rain`, `Thunder`), `time` (`day`, `night`, `dawn`, `dusk`), `places` (`ocean`, `river`, `frozen`, `swamp`, `jungle`, `cave`) and `afterRain` (only this many minutes after rain stops). Keep each `id` when editing: logs and records are saved by it. Keep one species without conditions for each fish item, or some catches stay vanilla |

Operators can change `enabled`, `announceLegendary`, `tournamentEnabled`, `tournamentDay`, `tournamentHourUtc` and `tournamentMinutes` in game with `/realm:config` (**Fishing 2.0**). The rest stays in `config.js`.

Player preferences, in `/realm:prefs` (**Fishing 2.0**) or the menu's **Fishing settings**:

| Preference | Default | |
|---|---|---|
| **Measure my catches** | Enabled | Your fish carry their species, size and your name. Disabled: plain fish that stack (the catch still counts) |
| **Only measure notable catches** | Disabled | A catch that isn't a new species, a personal best or a realm record comes as a plain fish that stacks |

### Saved data

| Key | Scope | Contents |
|---|---|---|
| `fishing:log` | Player | JSON `{ speciesId: [count, best cm] }`: the player's fish log |
| `fishing:records` | World | JSON `{ speciesId: [cm, name, player id, time] }`: the realm's biggest fish of each species |
| `fishing:tourney` | World | JSON `{ s, e, en }` of the running tournament: start and end times and each player's best fish `[share of the species' biggest, name, species, cm, time]`. Cleared when it ends |
| `fishing:tmeta` | World | JSON `{ last, warned }`: the scheduled tournament starts already started and warned about |
| `fishing:owed` | World | JSON `{ player id: [Crowns, note, quest id] }`: prizes for winners who were offline, paid when they join |
| `fishing:weather` | World | The Overworld weather at the last change (`Clear`, `Rain` or `Thunder`): the stable Script API can't read the current weather |
| `fishing:rainEnd` | World | When rain last stopped (ms), for the Rainbow Trout |
| `fishing:cfg` | World | Settings changed in `/realm:config` |
| `fishing:pref` | Player | JSON `{ measure?, notableOnly? }`: the player's own choices, only where they differ from the default |
| `crowns` | Scoreboard | Prizes and fish sales are added to the shared Crowns balance |

### How it works

- **Catches:** there is no "caught a fish" event in the stable API, so the pack recognizes one much as [Daily Quests](#daily-quests--quests_bp) does: a fishing hook belongs to the player who cast it (its projectile owner, else the player nearest to it when it appears), and its place is followed every tick. A single unnamed cod, salmon, tropical fish or pufferfish that appears within 2 blocks of a hook, as that hook is reeled in (the hook is gone then or within 3 ticks), is that player's catch, once per hook. A fish dropped from an inventory (it appears within 1 block of a player's head), a stack of several, or a fish that turns up next to a hook still in the water is never a catch, so dropping fish next to your bobber doesn't turn them into species. Then (a tick later, so other packs like Daily Quests see the vanilla fish first) the pack spawns the named fish at the same spot with the same velocity, so it still flies to the player, and removes the vanilla one. If the player picks the vanilla fish up first, it simply stays vanilla. When the player's settings ask for a plain fish, the vanilla fish is left where it is and only the catch is recorded.
- **Making fish stackable:** the pack finds measured fish the way the sell menu does (name and lore), empties those slots and the slots of plain fish of the same kinds, and adds back fresh vanilla `ItemStack`s of the total, up to 64 a stack; anything that wouldn't fit (it always should) drops at the player's feet. Nothing is written to the log or the records: they were written when the fish was caught.
- **Place:** one scan per catch, about 100 block reads: the water surface at the bobber, 48 samples at the water level 4 to 16 blocks around it (and the blocks above the nearer ones, for lily pads and snow), and the highest block of 12 columns 6 and 12 blocks away for trees and snow. Weather comes from `afterEvents.weatherChange` (whose `dimension` is `overworld` on current servers, `minecraft:overworld` on older ones; both count), saved so it survives a restart. Time of day is `world.getTimeOfDay()`.
- **Fish are recognized** for selling by their name (a known species in a rarity color) and their lore (`<size> cm`, `Caught by ...`), which an anvil can't add. The sell menu checks each slot again before taking the fish.
- **The tournament clock** checks every 5 seconds; the running tournament is saved, so it survives a restart and is finished on schedule. Prizes go into the `crowns` scoreboard; winners get `realm:quest_done` with `kind: "tournament"`.
- **Fishers:** on `realm:npc_talk` with the `fisher` role the pack answers `realm:npc_offer` with **Sell fish** (`order` 20) and **Fish records** (21).
- Events sent: `realm:journal` `{ page: "fish", entry: <species id> }` and `realm:skill_xp` `{ skill: "fishing" }` on every catch, `realm:quest_done` `{ kind: "tournament" }` for prize winners, `realm:sky_event` `{ kind: "tournament" }` at the start.

---

## Kitchen — `cooking_bp`

Cook real dishes at a cooking pot (a cauldron over a lit campfire). Each dish is a food with a gentle, long-lasting buff when you eat it, like Haste I for 5 minutes or Night Vision for 10, and a few rolling dishes roll for a surprise instead: mostly a good buff, sometimes something silly. Everyone knows 6 basic recipes; Bea the Cook (from [Townsfolk](#townsfolk--npc_bp)) teaches more in her **Kitchen** for Crowns or ingredients, and the best dishes need rare ingredients like the Champion's Heart, dropped by [Champions](#champions--elite_bp), or the Storm Eel of [Fishing 2.0](#fishing-20--fishing_bp). There are 27 recipes and 8 rare ingredients.

### How to use

1. Build a cooking pot: put a cauldron on top of a lit campfire (or soul campfire). Water in the cauldron is optional.
2. Tap the cauldron with an empty hand, or sneak and tap it with anything. The `Cooking Pot` menu lists the recipes you know, the ones you have everything for first (`Ready: 2 servings`), the others with what's missing (`Missing: 1 Kelp`).
3. Pick a recipe to see its ingredients and effects, then **Cook 1 batch** or **Cook 3 batches**. The ingredients are taken, the pot bubbles for 3 seconds, and the dishes land in your inventory: `You cooked 2 Miner's Pasty.`
4. Eat a dish like any food (when you're hungry). Chat says what you got: `Miner's Pasty: Haste I for 5m`. A rolling dish says what it rolled: `Mystery Stew: A rush of speed! (Speed II for 2m)`.
5. Learn more recipes: tap Bea the Cook (or any NPC with the `chef` role) and pick **Kitchen**. She teaches each recipe for Crowns or for ingredients (`Learn: Warden's Ration` for `30 Crowns or 8 Cooked Beef`), and the rare ones for one of their rare ingredient plus Crowns. Story Questlines also teaches recipes, and recipe cards (paper named `Recipe Card: Lantern Cake`) dropped by champions teach theirs as soon as you open a pot, the Kitchen or `/realm:cooking`.
6. Collect rare ingredients: defeat champions, catch a Storm Eel in a thunderstorm, harvest full beehives at night, and harvest crops during a Harvest Moon or after an aurora or a meteor, and hunt monsters under a Blood Moon (see the table below). When one of those windows opens, chat says so: `Stardust settles on the fields. Ripe wheat harvested in the next 15 minutes may give Starwright Flour (Kitchen).` `/realm:cooking` → **Rare ingredients** lists them, what they're for and how many you carry.
7. Run `/realm:cooking` for your recipes (**What can I cook?**, **My recipes**), the **Cookbook** of every recipe and how to learn it, and the rare ingredients. Disable the bubbling sounds in `/realm:prefs` → **Kitchen** → **Cooking sounds**.
8. **Operators:** `/realm:cooking` also has **Teach or forget recipes** (one or all, for any online player) and **Give dishes and ingredients** (any dish, rare ingredient or recipe card). `/realm:config` → **Kitchen** sets the effect length multiplier, rolling dishes, the champion ingredient and recipe card chances, foraging and cooking anywhere.

### What players see

- **The cooking pot:** any cauldron with a lit `campfire` or `soul_campfire` right under it (`potFires`). An empty-hand tap or a sneak-tap opens the menu; a tap with a bucket or bottle without sneaking fills or empties the cauldron as usual (to use a bucket on a pot, don't sneak). With `cookAnywhere` on, the recipe pages of `/realm:cooking` have the cook buttons too.
- **Cooking** takes `cookSeconds` (3) for any number of batches, up to `maxBatch` (16) at once: smoke rises from the pot, it bubbles (`bubble.pop`, if **Cooking sounds** is on) and ends with happy-villager sparkles and a ding. One cooking at a time per player. If you walk away the dish still goes to your inventory (or drops at your feet when it's full); if you leave the game, it drops at the pot.
- **Ingredients:** a plain ingredient (`Wheat`, `Cooked Beef`) only counts items without a custom name, so cooking never uses up a named dish or fish. A rare ingredient counts only the real thing (its name and its `Rare ingredient` lore with the line saying where it comes from). Honey-Glazed Ham gives back the glass bottle.
- **A dish** is the vanilla food item named after the dish, in plain text without color codes (`Harbor Chowder` is a `minecraft:rabbit_stew` named exactly `Harbor Chowder`), with lore: a gray line about it (`Warm and salty, like the docks at dawn`), its effects in blue with their base length (`Water Breathing I (8:00)`) or `Rolls for a surprise`, and `Kitchen dish` (gray) or `Rare dish` (gold). Servings of the same dish always have the same lore, so they stack like the food they are (stews and soups don't stack, as in vanilla, and give back their bowl when eaten). An anvil-renamed food is not a dish (anvils can't add lore), and neither is a dish renamed to another dish: the first lore line must be that dish's own.
- **Eating:** the effects are added without particles. Lengths are multiplied by **Effect durations** (`durationMultiplier`, 1x) except Saturation, Levitation and Nausea. An effect never makes one you already have weaker or shorter, so eating the same dish twice doesn't stack the time; eating it when the effect is running low tops it up. The lore always shows the base length; chat shows the real one. Like any food, a dish can only be eaten when you're hungry (in survival).
- **Rolling dishes** (Mystery Stew, Hiccup Cookies, Gambler's Goulash) roll one result: Speed II 2 min (weight 12), Strength I 3 min (10), Haste II 2 min (10), Regeneration I 40s (10), Absorption II 4 min (8), Jump Boost II and Slow Falling 2 min (8), Night Vision 10 min (8), Hero of the Village 10 min (4), the jackpot `JACKPOT! Everything at once!` (Strength, Speed and Absorption 4 min and Regeneration 30s, weight 3), or something silly: floating up for 3 seconds with Slow Falling to land softly (5), Nausea for 8 seconds (4), sparkles all over for 15 seconds (5), six hiccup hops (5), or a burp everyone within 16 blocks hears about (`Alex burps loudly.`, 4). Hiccup Cookies double the silly weights; Gambler's Goulash has 0.3x the silly weights and triple the jackpot. With **Rolling dishes** disabled (`rollingDishes`) they give their plain effect instead (table below).
- **Bea's Kitchen** (tap an NPC with the `chef` role, `chefRole`, and pick **Kitchen**): Bea says a line (`Bea: "Hungry? Of course you are. Sit, sit!"`), how many recipes you know and your Crowns, then a **Learn: <dish>** button for each recipe she teaches that you don't know yet with its prices, **What can I cook?** and **Rare ingredients**. Picking a recipe shows each way to pay (`Pay 30 Crowns`, `Pay 8 Cooked Beef`); one you can't afford is gray. Paying teaches it: `New recipe: Warden's Ration! (taught by Bea)`.
- **Recipe cards** drop from champions (`recipeCardChance`, 10%, killer only), one of the recipes marked "recipe card" below, at random. Opening a pot, the Kitchen or `/realm:cooking` with a card for a recipe you don't know teaches it and uses up the card; a card for a recipe you know stays, to give to someone else. Each card names its recipe in its lore (`Recipe: Lantern Cake`), so a card renamed on an anvil teaches nothing.
- **Champions** (`realm:champion_slain`): the killer has a 60% chance (`championDropChance`) of a Champion's Heart, the same chance of its trait's ingredient (Stormcaller: Storm Eel, Frostbound: Frost Pepper, Vampiric: Moon Salt) and of an Ember Truffle when it died in the Nether; each helper has half the chance of a Champion's Heart. They go straight into your inventory: `Rare ingredient: Champion's Heart (Gerald the Stormcaller)`.
- **Other packs:** each serving cooked gives 3 Farming XP in [Skills](#skills--skills_bp) (`skillXp`).

The recipes (dish names are exact, for stories that deliver or reward them):

| Dish | Item | Makes | Ingredients | When eaten | Learned from |
|---|---|---|---|---|---|
| `Harbor Chowder` | `minecraft:rabbit_stew` | 1 | 1 Bowl, 1 Cooked Cod, 1 Baked Potato, 1 Kelp | Water Breathing I 8 min | Everyone (basic) |
| `Fisherman's Breakfast` | `minecraft:cooked_salmon` | 1 | 1 Cooked Salmon, 1 Bread, 1 Egg | Conduit Power I 3 min | Everyone (basic) |
| `Miner's Pasty` | `minecraft:baked_potato` | 2 | 1 Cooked Beef, 2 Potato, 1 Wheat | Haste I 5 min | Everyone (basic) |
| `Garden Salad` | `minecraft:beetroot_soup` | 1 | 1 Bowl, 2 Beetroot, 1 Carrot | Speed I 5 min | Everyone (basic) |
| `Hearty Porridge` | `minecraft:mushroom_stew` | 1 | 1 Bowl, 3 Wheat, 1 Sugar | Saturation (fills you up), Regeneration I 15s | Everyone (basic) |
| `Campfire Kebab` | `minecraft:cooked_mutton` | 2 | 2 Cooked Mutton, 1 Carrot, 1 Stick | Jump Boost I 5 min | Everyone (basic) |
| `Warden's Ration` | `minecraft:bread` | 3 | 2 Bread, 1 Cooked Beef, 2 Dried Kelp | Resistance I 4 min | Bea: 30 Crowns, or 8 Cooked Beef |
| `Glow Berry Tart` | `minecraft:cookie` | 3 | 3 Glow Berries, 2 Wheat, 1 Sugar | Night Vision I 10 min | Bea: 25 Crowns, or 16 Glow Berries |
| `Honey-Glazed Ham` | `minecraft:cooked_porkchop` | 2 | 2 Cooked Porkchop, 1 Honey Bottle, 1 Sugar (gives back 1 Glass Bottle) | Absorption I 6 min, Regeneration I 15s | Bea: 35 Crowns, or 4 Honey Bottle |
| `Spiced Pumpkin Soup` | `minecraft:mushroom_stew` | 1 | 1 Bowl, 1 Pumpkin, 1 Sugar, 1 Cocoa Beans | Fire Resistance I 8 min | Bea: 40 Crowns, or 8 Pumpkin |
| `Climber's Trail Mix` | `minecraft:cookie` | 4 | 1 Cocoa Beans, 2 Wheat, 2 Sweet Berries | Jump Boost II 3 min, Slow Falling I 3 min | Bea: 30 Crowns, or 16 Sweet Berries |
| `Rabbit Ragout` | `minecraft:rabbit_stew` | 1 | 1 Bowl, 1 Cooked Rabbit, 1 Carrot, 1 Potato, 1 Brown Mushroom | Speed I 8 min, Jump Boost I 8 min | Bea: 40 Crowns, or 6 Rabbit Hide |
| `Pathfinder's Carrots` | `minecraft:golden_carrot` | 2 | 2 Golden Carrot, 1 Sugar | Night Vision I 8 min, Speed I 4 min | Bea: 45 Crowns, or 16 Gold Nugget |
| `Smith's Hotpot` | `minecraft:mushroom_stew` | 1 | 1 Bowl, 1 Cooked Beef, 1 Baked Potato, 1 Coal | Haste II 4 min | Bea: 50 Crowns, or 6 Iron Ingot |
| `Sweet Berry Roll` | `minecraft:bread` | 2 | 1 Bread, 3 Sweet Berries, 1 Sugar | Regeneration I 45s | Bea: 25 Crowns, or 32 Wheat |
| `Mystery Stew` | `minecraft:mushroom_stew` | 1 | 1 Bowl, 1 Red Mushroom, 1 Brown Mushroom, 1 Beetroot | **Rolls** (usual odds); with rolling off: Saturation (fills you up) | Bea: 20 Crowns, or 8 Red Mushroom |
| `Hiccup Cookies` | `minecraft:cookie` | 4 | 2 Wheat, 1 Cocoa Beans, 1 Sugar | **Rolls** (twice the silly odds); with rolling off: Jump Boost I 1 min | Bea: 15 Crowns, or 8 Cocoa Beans |
| `Gambler's Goulash` | `minecraft:rabbit_stew` | 1 | 1 Bowl, 1 Cooked Beef, 1 Carrot, 3 Gold Nugget | **Rolls** (few silly results, triple jackpot odds); with rolling off: Strength I 1 min | Bea: 60 Crowns, or 4 Gold Ingot; recipe card |
| `Storm Eel Pie` | `minecraft:pumpkin_pie` | 2 | 1 Storm Eel, 3 Wheat, 1 Egg | Speed II 5 min, Haste II 5 min | Bea: 1 Storm Eel + 60 Crowns; recipe card |
| `Frost Pepper Soup` | `minecraft:beetroot_soup` | 1 | 1 Bowl, 1 Frost Pepper, 2 Beetroot | Fire Resistance I 15 min, Resistance I 3 min | Bea: 1 Frost Pepper + 60 Crowns; recipe card |
| `Ember Truffle Risotto` | `minecraft:mushroom_stew` | 1 | 1 Bowl, 1 Ember Truffle, 2 Wheat, 1 Brown Mushroom | Strength I 6 min, Fire Resistance I 6 min | Bea: 1 Ember Truffle + 60 Crowns; recipe card |
| `Moon Salt Roast` | `minecraft:cooked_beef` | 2 | 2 Cooked Beef, 1 Moon Salt | Night Vision I 15 min, Strength I 5 min | Bea: 1 Moon Salt + 60 Crowns; recipe card |
| `Golden Harvest Loaf` | `minecraft:bread` | 3 | 1 Harvest Saffron, 3 Wheat | Health Boost II 10 min, Saturation (fills you up) | Bea: 1 Harvest Saffron + 60 Crowns; recipe card |
| `Champion's Heart Stew` | `minecraft:rabbit_stew` | 1 | 1 Bowl, 1 Champion's Heart, 1 Cooked Beef, 1 Carrot, 1 Baked Potato | Strength I 8 min, Health Boost II 8 min, Regeneration I 20s | Bea: 1 Champion's Heart + 80 Crowns; recipe card |
| `Starwright Bread` | `minecraft:bread` | 2 | 1 Starwright Flour, 2 Wheat, 1 Glowstone Dust | Night Vision I 15 min, Slow Falling I 5 min, Jump Boost I 5 min | recipe card |
| `Lantern Cake` | `minecraft:pumpkin_pie` | 2 | 1 Glow Honey, 3 Wheat, 2 Sugar, 1 Egg, 1 Glowstone Dust | Night Vision I 20 min, Regeneration I 1 min, Hero of the Village I 20 min | recipe card |
| `Hearthkeeper's Feast` | `minecraft:rabbit_stew` | 1 | 1 Bowl, 1 Champion's Heart, 1 Glow Honey, 1 Harvest Saffron, 1 Cooked Beef | Health Boost II 15 min, Resistance I 15 min, Strength I 10 min, Regeneration I 1 min, Saturation (fills you up) | recipe card |

The rare ingredients (each is a vanilla item with a custom name and `Rare ingredient` lore; eating or using one does nothing special):

| Ingredient | Item | Where it comes from | Used in |
|---|---|---|---|
| `Champion's Heart` | `minecraft:beetroot` | Every champion: the killer 60%, helpers 30% (`championDropChance`) | Champion's Heart Stew, Hearthkeeper's Feast |
| `Storm Eel` | `minecraft:cod` | The Storm Eel of [Fishing 2.0](#fishing-20--fishing_bp) (thunderstorms; a cod named `Storm Eel` with its size line, like `42 cm`, counts), and Stormcaller champions | Storm Eel Pie |
| `Frost Pepper` | `minecraft:light_blue_dye` | Frostbound champions; 4% from each stray you kill (`forage.frostPepper`) | Frost Pepper Soup |
| `Glow Honey` | `minecraft:honeycomb` | 30% when you harvest a full beehive or bee nest with a bottle or shears at night (time 13000 to 23000, `forage.glowHoney`); only a harvest that empties the hive counts, so a tap a land claim stops gives nothing | Lantern Cake, Hearthkeeper's Feast |
| `Starwright Flour` | `minecraft:sugar` | 25% from each ripe wheat you harvest within 15 minutes (`starMinutes`) of an aurora or a meteor, including one an operator calls down (`forage.starwrightFlour`) | Starwright Bread |
| `Ember Truffle` | `minecraft:magma_cream` | 3% from each ripe nether wart you harvest (`forage.emberTruffle`); champions that die in the Nether | Ember Truffle Risotto |
| `Moon Salt` | `minecraft:quartz` | 8% from each hostile mob you kill during a Blood Moon (`forage.moonSalt`); Vampiric champions | Moon Salt Roast |
| `Harvest Saffron` | `minecraft:orange_dye` | 8% from each ripe crop (wheat, carrots, potatoes, beetroot) you harvest during a Harvest Moon (`forage.harvestSaffron`) | Golden Harvest Loaf, Hearthkeeper's Feast |

Foraging (everything but champions) can be disabled with **Foraging** (`foragingEnabled`). Harvesting counts both ways: breaking a ripe crop, or tapping it with [Right-click Harvest](#right-click-harvest--harvest_bp). At the start of an aurora or meteor window, a Harvest Moon or a Blood Moon, chat names the ingredient it can bring: `Kitchen: ripe crops harvested tonight may give Harvest Saffron.`, `Kitchen: monsters slain tonight may drop Moon Salt.`

### Commands

| Command | Who | What it does |
|---|---|---|
| `/realm:cooking` | Everyone | The Kitchen menu: what you can cook now, your recipes, the cookbook (every recipe, its ingredients, effects and how to learn it) and the rare ingredients you carry. Operators also teach or forget recipes and give dishes, ingredients and recipe cards |

### Configuration (`scripts/config.js` → `CONFIG`)

| Option | Default | Description |
|---|---|---|
| `enabled` | `true` | Dishes give their effects when eaten. When `false` they are plain food |
| `durationMultiplier` | `1` | Every dish effect's length is multiplied by this (0.25 to 4 in game), except Saturation, Levitation and Nausea |
| `rollingDishes` | `true` | Rolling dishes roll on the surprise table; when `false` they give their plain effect |
| `championDropChance` | `60` | Percent chance that a champion's killer gets a Champion's Heart, and the same for its trait's ingredient; helpers get half this chance of a heart |
| `recipeCardChance` | `10` | Percent chance that a champion's killer also gets a recipe card |
| `foragingEnabled` | `true` | Rare ingredients from harvesting, beehives and hunting (the chances below). Champions drop them either way |
| `forage.glowHoney` | `30` | Percent: Glow Honey from a full beehive or bee nest harvested at night |
| `forage.starwrightFlour` | `25` | Percent: Starwright Flour from ripe wheat soon after an aurora or a meteor |
| `forage.harvestSaffron` | `8` | Percent: Harvest Saffron from a ripe crop during a Harvest Moon |
| `forage.moonSalt` | `8` | Percent: Moon Salt from a hostile mob killed during a Blood Moon |
| `forage.emberTruffle` | `3` | Percent: Ember Truffle from ripe nether wart |
| `forage.frostPepper` | `4` | Percent: Frost Pepper from a stray |
| `starMinutes` | `15` | After an aurora or a meteor, ripe wheat can give Starwright Flour for this many minutes |
| `potFires` | `["minecraft:campfire", "minecraft:soul_campfire"]` | Blocks that make a cauldron on top of them a cooking pot (lit ones only) |
| `cookAnywhere` | `false` | Players can cook from `/realm:cooking` anywhere, without a pot |
| `cookSeconds` | `3` | How long one cooking takes, in seconds, for any number of batches |
| `maxBatch` | `16` | Most batches cooked at once |
| `chefRole` | `"chef"` | The NPC role whose townsfolk open the Kitchen (Bea the Cook has it) |
| `chefName` | `"Bea the Cook"` | Who teaches recipes, in menus |
| `skillXp` | `3` | Farming XP (Skills pack) per serving cooked; `0` = none |

The dishes, rare ingredients, champion trait ingredients and the rolling table are in `scripts/recipes.js` (`DISHES`, `INGREDIENTS`, `TRAIT_INGREDIENT`, `ROLLS`): `{ id, name, base, tier, yield, needs, effects, blurb, learn?, card?, returns?, roll? }` per dish, where `needs` are `[item id, count]` (`"ing:<id>"` for a rare ingredient), `effects` are `[effect id, amplifier, seconds]` and `learn` the ways Bea teaches it (`{ crowns?, items? }`, any one). Keep the ids and names of existing dishes: players' recipes are saved by id, and stories use the names.

Operators can change `enabled`, `durationMultiplier`, `rollingDishes`, `championDropChance`, `recipeCardChance`, `foragingEnabled` and `cookAnywhere` in game with `/realm:config` (**Kitchen**). Each player can disable **Cooking sounds** in `/realm:prefs` (**Kitchen**). The rest stays in `config.js`.

### Saved data

| Key | Scope | Contents |
|---|---|---|
| `cooking:known` | Player | JSON `[recipe id]`: the recipes the player learned (the 6 basics aren't saved; everyone knows them) |
| `cooking:stats` | Player | JSON `{ c, e }`: servings cooked and dishes eaten, shown in `/realm:cooking` |
| `cooking:pending` | World | JSON `{ player id: [recipe id] }`: recipes a story taught a player who was offline, learned when they join |
| `cooking:moon` | World | JSON `{ s, t }`: the Blood or Harvest Moon announced by `realm:moon` and when (forgotten after 20 minutes or when it sets) |
| `cooking:star` | World | When the last aurora or meteor was announced (ms), for Starwright Flour |
| `cooking:cfg` | World | Settings changed in `/realm:config` |
| `cooking:pref` | Player | The player's **Cooking sounds** choice |
| `crowns` | Scoreboard | Bea's lessons are paid from the shared Crowns balance |

### How it works

- **Pots:** `beforeEvents.playerInteractWithBlock` on a `minecraft:cauldron` whose block below is a lit `potFires` block (its `extinguished` state isn't set), with an empty hand or while sneaking, is canceled and opens the menu on the next tick (once per tap, `isFirstEvent`).
- **Eating:** `afterEvents.itemCompleteUse` from a player with an item that is a dish (its type is the dish's `base`, its name without § codes is the dish's name, and its first lore line is that dish's gray line). The vanilla food points are the base item's.
- **Foraging:** `afterEvents.playerBreakBlock` on ripe crops (`growth` 7) and nether wart (`age` 3), plus a first tap (`beforeEvents.playerInteractWithBlock`) on a ripe one that 3 ticks later is unripe or air (Right-click Harvest replanted or removed it); `afterEvents.entityDie` with a player as the damaging entity; full hives (`honey_level` 5) tapped with a glass bottle or shears, checked a tick later (the hive must have emptied). Scripts can't read the moon or the sky, so the pack remembers the last `realm:moon` (`{ state: "blood" | "harvest" | "normal" }` from [Blood Moon & Harvest Moon](#blood-moon--harvest-moon--moon_bp)) and `realm:sky_event` with `kind` `aurora` ([Aurora & Shooting Stars](#aurora--shooting-stars--night_bp)) or `meteor` ([Meteor Strikes](#meteor-strikes--meteor_bp)).
- **Townsfolk:** on `realm:npc_talk` with the `chef` role the pack answers `realm:npc_offer` with **Kitchen** (`order` 15), and opens it on `realm:npc_choose`.
- **Script events it listens to** (JSON; other packs and `/scriptevent` can send them):
  - `realm:champion_slain` `{ player?, helpers, name, trait, dim, ... }` from Champions: rare ingredients and recipe cards.
  - `realm:recipe_learn` `{ player, recipe }`: teaches a recipe, by id (`starwright_bread`) or name (`Starwright Bread`; case, spaces and punctuation ignored). A player who is offline learns it when they next join. Story Questlines sends it when a chapter that asks for a story recipe starts (Lantern Cake, Starwright Bread in Hearth and Table).
  - `realm:dish_give` `{ player, dish, amount? }` and `realm:ingredient_give` `{ player, ingredient, amount? }`: give real dishes or rare ingredients (by id or name), with the right lore. Stories that reward a dish should use these (or give the item with the dish's `base`, exact name and any lore).
  - `realm:cooking_cook` `{ player, recipe, times? }`: cooks a known recipe at the player's position from what they carry, like the pot (for tests and automation).
  - `realm:cooking_eat` `{ player, dish }`: gives a dish's effects as if eaten, without an item (for tests).
- Events sent: `realm:npc_offer` (above) and `realm:skill_xp` `{ skill: "farming" }` for each cooking.

---

## Deck of Many Things — `domt_bp`

Draw a card from the Deck of Many Things for a random effect: 100 cards, from a loaf of bread or a dizzy spell to a sky arena, a champion on your heels, a trip to the Nether or, once in a hundred draws, a wish. Most cards are small and quick (70 common), some are a real treat or a real nuisance (20 uncommon), a few are big swings (9 rare) and one is legendary. Everyone draws, with a cooldown between draws, or, if an operator sets it up that way, only operators draw, for themselves or for any player.

### How to use

1. Run `/realm:domt` and pick **Draw a card**. The deck shuffles, the card's name shows on screen in its rarity's color, and chat says what it does, like `[Deck] You drew The Merchant (Uncommon): A wandering trader appears with wares to sell.`
2. Then the deck rests: you can draw again after 20 real minutes. **My draws** shows your last cards and when you can draw next.
3. **The odds** lists every card and the chance of each rarity: Common 70%, Uncommon 20%, Rare 9%, Legendary 1% by default.
4. If you draw **The Wish**, choose one of the three boons it offers. If you close the window, the wish waits: **Make your wish** is at the top of `/realm:domt` until you choose.
5. **Operators:** `/realm:domt_draw <player>` draws for a player (no cooldown), and **Draw for a player** in the menu can pick the card too. **Cards on/off** (or `/realm:domt_effects`) switches each card on or off, a page per rarity. **Reset a cooldown** lets a player draw again at once. `/realm:config` → **Deck of Many Things** sets who draws (everyone with a cooldown, or operators only), the cooldown, the rarity weights, whether rare draws are announced, whether block-changing cards are allowed and how long The Spore lasts.

### What players see

- **The draw:** three page turns with enchanting sparkles and `The deck shuffles...` above the hotbar, then the card's name as a title, in white (Common), green (Uncommon), aqua (Rare) or light purple (Legendary), with a sound and particles to match. Chat gives the card's line, and sometimes a second gray line with details (`You landed at 812, 71, -340.`).
- **A card that can't happen where you are** (no safe spot to land, no creature to swap with, no wild ground for mushrooms) says `The Merchant crumbles to dust: it can't happen here. The deck draws again...` and another card is drawn, up to 5 times. If nothing works, your cooldown is given back.
- **Rare and legendary draws** are told to everyone in chat (`announceRare`), like `[Deck] Alex drew The Gate and fell into the Nether!`.
- **Teleports are always safe:** the deck lands you on a full block with two open blocks above, never in lava, water, fire or a wall, only in loaded chunks, and near your own height first (so a card drawn in a cave keeps you in caves). The far ones (The Comet, The Gate) hold you high in the air with Slow Falling and Resistance for a moment while the place loads (with a ticking area for a few seconds if it loads slowly), then land you; an ocean or lava sea makes them try up to 3 other places nearby, and if none is safe, you are put back and the deck draws again.
- **Mobs** appear on safe spots around you, 3 to 12 blocks away. Wolves and the horse are already tamed to you.
- **Skill XP** cards (The Mentor, The Archmage) send XP to a random skill through the [Skills](#skills--skills_bp) pack; without it, that part does nothing.
- **Crowns** cards add to or take from the `crowns` scoreboard, never below 0, with or without the [Crowns](#crowns--crowns_bp) pack.
- **The Rainbow** cycles your name above your head through rainbow colors for 5 minutes, then puts it back. If Nicknames or AFK change your name meanwhile, the rainbow stops and leaves theirs.
- **The rare cards:**
  - **The Gate:** to the Nether (near your Overworld position divided by 8), or out of it to the Overworld, on a safe spot, with 2 minutes of Fire Resistance, 10 obsidian and a flint and steel to build a portal home. Not in the End.
  - **The Arena:** in the Overworld, a 15 by 15 platform appears about 24 blocks above you, or above the ground over your head (only where that space is completely empty), walled with invisible barriers, and you fight three husks, a vindicator and a pillager for up to 2 minutes. Win for an enchanted book and 15 Crowns. Win, lose or run out of time, you're sent back where you were and every arena block is removed. The arena's blocks can't be mined while it stands. If the server restarts mid-fight, the arena is removed within 10 minutes, its leftover mobs vanish within 10 seconds, and you're sent back when you join.
  - **The Champion:** a champion monster appears 8 to 12 blocks away, from the [Champions](#champions--elite_bp) pack (`realm:champion_spawn`, named `the Deck's Champion`); without it, the deck sends its own: `The Deck's Champion`, a vindicator with extra health, Strength and Resistance.
  - **The Spore:** in the Overworld, wild grass and dirt within 9 blocks turns to mycelium, with a few red and brown mushrooms and two mooshrooms, for 60 minutes (`sporeMinutes`). It only changes the top block of open ground with nothing on it, and fizzles if it sees anything built or farmed within 13 blocks (planks, glass, bricks, farmland, paths, torches, fences, chests and the like). When time is up, every block it changed that is still mycelium or its mushroom goes back to what was there (and mycelium that spread around the field turns back to grass); anything a player built meanwhile stays. Bedrock scripts can't change biomes, so the grass color and mob spawning stay as they were.
  - **The Eclipse:** the time jumps to midnight for everyone.
  - **The Archmage**, **The Knight**, **Second Chance** and **The Gamble:** see the card table.
- **The Wish (legendary):** fireworks, a totem burst and a dragon's growl for everyone, then a choice of three boons drawn from eight: an enchanted netherite pickaxe (`Worldbreaker`) or sword (`Kingslayer`), an elytra with 64 rockets, 30 levels, 500 Crowns, an enchanted trident (`The Tide`) with a Heart of the Sea, a beacon with 9 iron blocks, or full diamond armor with Protection IV. Nothing is destroyed and nobody is hurt.
- **Safe zones:** block-changing cards (The Arena and The Spore) never work inside a safe zone from the `realm:zones` protocol (Safe Zones, towns, land claims that share theirs); they fizzle there and the deck draws again. Operators can also disable block-changing cards altogether (`blockCards`).

### Commands

| Command | Who | What it does |
|---|---|---|
| `/realm:domt` | Everyone | Opens the deck: **Draw a card** (once every 20 minutes, `cooldownMinutes`), **My draws**, **The odds**, and **Make your wish** when one is waiting; operators also get **Draw for a player**, **Cards on/off** and **Reset a cooldown** |
| `/realm:domt_draw <player>` | Operators | Draws a random card for the players picked (`@a` works), with no cooldown |
| `/realm:domt_effects` | Operators | Switches each of the 100 cards on or off, a page per rarity (saved in the world) |

With **Who draws** set to **Operators only** (`mode` `operators`), only operators can draw, with no cooldown; everyone else can still see their draws and the odds.

### Configuration (`scripts/config.js` → `CONFIG`)

| Option | Default | Description |
|---|---|---|
| `mode` | `"cooldown"` | `"cooldown"`: everyone draws, once every `cooldownMinutes`. `"operators"`: only operators draw (no cooldown), for themselves or for any player |
| `cooldownMinutes` | `20` | Real minutes between a player's draws in `"cooldown"` mode. `0` = no cooldown |
| `weights.common` | `70` | How likely a common card is, relative to the other weights |
| `weights.uncommon` | `20` | How likely an uncommon card is |
| `weights.rare` | `9` | How likely a rare card is |
| `weights.legendary` | `1` | How likely the legendary card is |
| `announceRare` | `true` | Rare and legendary draws are told to everyone in chat |
| `blockCards` | `true` | The Arena and The Spore, which place blocks for a while, can be drawn |
| `sporeMinutes` | `60` | Minutes before The Spore's field turns back to grass |
| `disabled` | `[]` | Card ids (from the table below) that start disabled; the operators' choices in `/realm:domt_effects` win over this list |
| `historySize` | `20` | How many past draws each player's history keeps |

A rarity whose cards are all disabled is skipped, and its weight shared out among the others. Operators can change `mode`, `cooldownMinutes`, the four weights, `announceRare`, `blockCards` and `sporeMinutes` in game with `/realm:config` (**Deck of Many Things**), and switch cards in `/realm:domt_effects`.

### Saved data

| Key | Scope | Contents |
|---|---|---|
| `domt:off` | World | JSON `{ card id: true (disabled) or false (enabled) }`: the operators' choices that differ from `disabled` in `config.js` |
| `domt:draws` | World | JSON `{ card id: times drawn }` |
| `domt:tasks`, `domt:task:<id>` | World | Block changes waiting to be undone (an arena, a spore field): where, when, and what to put back |
| `domt:cfg` | World | Settings changed in `/realm:config` |
| `domt:next` | Player | When the player may draw again (milliseconds since 1970) |
| `domt:history` | Player | JSON list of the last draws: `[time, card id, operator who drew it]` |
| `domt:wish` | Player | The three boons The Wish offered, until one is chosen |
| `domt:arena` | Player | Where to send the player back if the server restarts mid-arena |
| `domt:name` | Player | The name to put back after The Rainbow, if the server restarts first |

### How it works

- A draw picks a rarity by the weights (only rarities with a card enabled), then a card of that rarity at random. A card whose handler can't work where you are says so, and the deck draws again without that card.
- Block changes (The Arena, The Spore) are saved with the time to undo them and checked every 10 seconds, so a restart doesn't leave them behind. A block is only put back where the block the deck placed is still there.
- Safe zones arrive as `realm:zones` `{ src, part, parts, zones }` script events; the pack keeps the latest list from each provider and asks for them with `realm:zones_ping` after loading. Every zone counts as the full square around its center, to be safe.
- Other packs: The Champion sends `realm:champion_spawn` (with a tag starting `realm:domt_champ_`, and spawns its own if no champion appears), The Mentor and The Archmage send `realm:skill_xp` `{ player, skill, amount }`, and the Crowns cards use the `crowns` scoreboard.
- **Testing:** an operator (or the server console) can run `/scriptevent realm:domt_test {"effect":"<card id>"}` to run one card's handler on themselves (several ids separated by commas work too), or `{"effect":"all","player":"<name>"}` for all 100 in a row on that player. Each card is checked for its main effect (an effect, an item, a mob, a move...) and the result goes to the content log as `[domt] TEST PASS ...` or `TEST FAIL ...`, ending with `TEST SUMMARY 100/100 passed`. After each card the test puts the player back, clears their effects and removes the mobs it made, so it isn't meant for a busy realm.

### The cards

| # | Card | Id | Rarity | Kind | What happens |
|---|---|---|---|---|---|
| 1 | Swift Feet | `swift_feet` | Common | good | Speed II for 3 minutes. |
| 2 | The Frog | `the_frog` | Common | good | Jump Boost II for 3 minutes. |
| 3 | Owl's Eyes | `owl_eyes` | Common | good | Night Vision for 10 minutes. |
| 4 | Iron Skin | `iron_skin` | Common | good | Resistance for 3 minutes. |
| 5 | The Miner | `the_miner` | Common | good | Haste II for 5 minutes. |
| 6 | The Fish | `the_fish` | Common | good | Water Breathing for 10 minutes. |
| 7 | The Feather | `the_feather` | Common | good | Slow Falling for 3 minutes. |
| 8 | Ember Ward | `ember_ward` | Common | good | Fire Resistance for 5 minutes. |
| 9 | The Healer | `the_healer` | Common | good | Instant healing and Regeneration II for 30 seconds. |
| 10 | The Ox | `the_ox` | Common | good | Strength for 3 minutes. |
| 11 | Golden Heart | `golden_heart` | Common | good | Absorption II for 3 minutes. |
| 12 | Village Hero | `village_hero` | Common | good | Hero of the Village for 10 minutes: villagers give discounts. |
| 13 | Full Belly | `full_belly` | Common | good | Your hunger is filled. |
| 14 | The Shadow | `the_shadow` | Common | mixed | Invisibility for 3 minutes. |
| 15 | The Vigor | `the_vigor` | Common | good | Health Boost II for 5 minutes: four extra hearts. |
| 16 | Heavy Boots | `heavy_boots` | Common | bad | Slowness for 1 minute. |
| 17 | Sore Arms | `sore_arms` | Common | bad | Mining Fatigue for 1 minute. |
| 18 | Weak Arms | `weak_arms` | Common | bad | Weakness for 1 minute. |
| 19 | Famine | `famine` | Common | bad | Hunger for 30 seconds. |
| 20 | Dizzy Spell | `dizzy_spell` | Common | bad | Nausea for 15 seconds. |
| 21 | The Blindfold | `the_blindfold` | Common | bad | Blindness for 10 seconds. |
| 22 | The Dark | `the_dark` | Common | bad | Darkness for 15 seconds. |
| 23 | Up, Up | `up_up` | Common | mixed | Levitation for 4 seconds, then a gentle Slow Falling down. |
| 24 | Sour Berry | `sour_berry` | Common | bad | Poison for 5 seconds (it never kills). |
| 25 | Hot Foot | `hot_foot` | Common | bad | Your boots catch fire for a moment. |
| 26 | Butterfingers | `butterfingers` | Common | bad | You drop what you are holding. |
| 27 | The Juggler | `the_juggler` | Common | bad | Your hotbar is shuffled. |
| 28 | Baker's Gift | `bakers_gift` | Common | good | 8 bread. |
| 29 | The Feast | `the_feast` | Common | good | 6 steaks. |
| 30 | Golden Carrots | `golden_carrots` | Common | good | 4 golden carrots. |
| 31 | The Apple | `the_apple` | Common | good | A golden apple. |
| 32 | The Cake | `the_cake` | Common | good | A cake! Happy un-birthday. |
| 33 | The Torch | `the_torch` | Common | good | 32 torches. |
| 34 | The Quiver | `the_quiver` | Common | good | 24 arrows. |
| 35 | Lump of Coal | `lump_of_coal` | Common | mixed | 8 coal. Were you naughty? |
| 36 | Iron Ration | `iron_ration` | Common | good | 6 iron ingots. |
| 37 | Fool's Gold | `fools_gold` | Common | good | 4 gold ingots. |
| 38 | Merchant's Purse | `merchants_purse` | Common | good | 3 emeralds. |
| 39 | The Woodsman | `the_woodsman` | Common | good | 16 oak logs. |
| 40 | Green Thumb | `green_thumb` | Common | good | 16 bone meal. |
| 41 | The Gardener | `the_gardener` | Common | good | Seeds, a sapling and a few carrots and potatoes. |
| 42 | The Pearl | `the_pearl` | Common | good | 2 ender pearls. |
| 43 | Honey Pot | `honey_pot` | Common | good | 3 bottles of honey. |
| 44 | The Bouquet | `the_bouquet` | Common | good | A bunch of flowers. |
| 45 | Rotten Luck | `rotten_luck` | Common | bad | 8 rotten flesh. Yum. |
| 46 | Pocket Dirt | `pocket_dirt` | Common | bad | 16 dirt. Your pockets are full of it. |
| 47 | Snow Day | `snow_day` | Common | good | 16 snowballs. |
| 48 | The Name | `the_name` | Common | good | A name tag. |
| 49 | The Flock | `the_flock` | Common | good | Three chickens come running. |
| 50 | Stray Cat | `stray_cat` | Common | good | A stray cat finds you. Fish might win it over. |
| 51 | Bunny Hop | `bunny_hop` | Common | good | Four rabbits hop out of the deck. |
| 52 | The Grave | `the_grave` | Common | bad | Two zombies climb out of the ground. |
| 53 | Creepy Crawlies | `creepy_crawlies` | Common | bad | Two spiders drop in. |
| 54 | The Slime | `the_slime` | Common | bad | A slime oozes out of the deck. |
| 55 | The Hive | `the_hive` | Common | mixed | Three bees buzz around. Be nice to them. |
| 56 | Bone Rattle | `bone_rattle` | Common | bad | Two skeletons rattle up. |
| 57 | Frog Chorus | `frog_chorus` | Common | good | Three frogs, ready to sing. |
| 58 | The Hop | `the_hop` | Common | mixed | You blink 8 to 16 blocks away. |
| 59 | The Wanderer | `the_wanderer` | Common | mixed | You are whisked up to 64 blocks in a random direction. |
| 60 | The Sky | `the_sky` | Common | mixed | You are thrown 20 blocks into the sky, with Slow Falling. |
| 61 | The Spin | `the_spin` | Common | mixed | You spin around. Which way were you going? |
| 62 | The Spark | `the_spark` | Common | good | 50 experience points. |
| 63 | Copper Purse | `copper_purse` | Common | good | 5 Crowns. |
| 64 | The Taxman | `the_taxman` | Common | bad | The taxman takes 5 Crowns. |
| 65 | The Leech | `the_leech` | Common | bad | You lose one experience level. |
| 66 | The Bandage | `the_bandage` | Common | good | Your health is fully restored. |
| 67 | Clean Slate | `clean_slate` | Common | mixed | Every effect on you is washed away, good and bad. |
| 68 | The Fireworks | `the_fireworks` | Common | good | Fireworks! And three rockets to keep. |
| 69 | Confetti | `confetti` | Common | good | A burst of confetti. Congratulations, on something! |
| 70 | The Rainbow | `the_rainbow` | Common | good | Your name shines in rainbow colors for 5 minutes. |
| 71 | The Merchant | `the_merchant` | Uncommon | good | A wandering trader appears with wares to sell. |
| 72 | The Void | `the_void` | Uncommon | mixed | You swap places with a nearby creature. |
| 73 | The Scholar | `the_scholar` | Uncommon | good | A random enchanted book. |
| 74 | The Smith | `the_smith` | Uncommon | good | An enchanted iron tool or weapon. |
| 75 | The Sage | `the_sage` | Uncommon | good | 5 experience levels. |
| 76 | The Mentor | `the_mentor` | Uncommon | good | 250 XP in a random skill (with the Skills pack). |
| 77 | Silver Purse | `silver_purse` | Uncommon | good | 25 Crowns. |
| 78 | The Gem | `the_gem` | Uncommon | good | 2 diamonds. |
| 79 | The Pack | `the_pack` | Uncommon | good | Two wolves, already loyal to you. |
| 80 | The Steed | `the_steed` | Uncommon | good | A tamed horse, and a saddle for it. |
| 81 | Ambush | `ambush` | Uncommon | bad | Monsters surround you! More of them when friends are near. |
| 82 | The Witch | `the_witch` | Uncommon | bad | A witch arrives, cackling. |
| 83 | Night Terror | `night_terror` | Uncommon | bad | Two phantoms swoop down from the sky. |
| 84 | The Beacon | `the_beacon` | Uncommon | good | Haste II, Speed, Strength and Resistance for 5 minutes. |
| 85 | The Curse | `the_curse` | Uncommon | bad | Slowness II, Weakness, Mining Fatigue and Hunger for 2 minutes. |
| 86 | The Comet | `the_comet` | Uncommon | mixed | You streak across the sky and land 150 to 300 blocks away. |
| 87 | Treasure | `treasure` | Uncommon | good | A handful of riches: iron, gold, lapis, redstone, emeralds or a diamond. |
| 88 | The Shepherd | `the_shepherd` | Uncommon | good | Three sheep and a pair of shears. |
| 89 | The Guardian | `the_guardian` | Uncommon | good | An iron golem comes to protect you. |
| 90 | The Patrol | `the_patrol` | Uncommon | bad | A pillager patrol finds you. |
| 91 | The Gate | `the_gate` | Rare | mixed | You are pulled into the Nether (or out of it), with obsidian and flint and steel to build a portal home. |
| 92 | The Arena | `the_arena` | Rare | mixed | You are pulled into a sky arena. Win for an enchanted book and 15 Crowns. (block-changing) |
| 93 | The Champion | `the_champion` | Rare | bad | A champion monster comes for you. |
| 94 | The Spore | `the_spore` | Rare | mixed | The wild ground around you turns to mushroom fields for an hour, with two mooshrooms. (block-changing) |
| 95 | The Eclipse | `the_eclipse` | Rare | mixed | Night falls at once, for everyone. |
| 96 | The Archmage | `the_archmage` | Rare | good | 15 experience levels and 750 XP in a random skill. |
| 97 | The Knight | `the_knight` | Rare | good | Full iron armor, enchanted. |
| 98 | Second Chance | `second_chance` | Rare | good | A Totem of Undying and an enchanted golden apple. |
| 99 | The Gamble | `the_gamble` | Rare | mixed | A coin flip: double your Crowns (up to 100 more), or lose half (up to 100). |
| 100 | The Wish | `the_wish` | Legendary | good | The deck grants one wish: choose one of three powerful boons. |

---

---

## Slot Machine — `slots_bp`

A slot machine with three reels, played for [Crowns](#crowns--crowns_bp) or emeralds. Play it anywhere from the **Slot Machine** item, or at a fixed machine an operator made from a block (a note block or a jukebox at the tavern, say). The reels are honest: each one is drawn at random on its own and stops on exactly what was drawn, and the pay table, with each line's odds and the exact return, is one tap away. Every player has a daily loss limit, a short pause between spins and can block themselves from the slots for a while.

### How to use

1. Run `/realm:slots` and pick **Spin**, use a **Slot Machine** item, or tap a slot machine block.
2. Pick what to play for (**Crowns** or **Emeralds**), then a stake: 1, 5, 10 or 25 Crowns, or 1, 2, 4 or 8 emeralds. The stake is taken at once.
3. The reels spin above your hotbar for 2 seconds and stop one by one. Chat says what you won, like `2x Cherry! +30 Crowns (stake 10. Balance: 510)` or `No win. -10 Crowns (Balance: 490)`.
4. Pick **Spin again** for the same stake, **Change stake**, or **Close**.
5. `/realm:slots` also has **My stats**, the **Pay table** and **Limits and breaks**, where you can block yourself from playing for 1, 7 or 30 days, or until an operator lifts it.
6. **Operators:** `/realm:slots` → **Operator tools** makes the block you look at a machine (or removes it), gives Slot Machine items (also `/realm:slots_give`), lifts a player's self-block and shows the realm's totals. `/realm:config` → **Slot Machine** sets the currencies, the daily loss limits, the pause between spins and jackpot announcements.

### What players see

- **The reels** spin in the bar above the hotbar (`[ Cherry | Lemon | Bell ]`) with ticking sounds; the first stops after 1 second, the second after 1.5 and the third after 2, each with a click. Spinning reels flash random symbols, and a stopped reel shows the real result.
- **Wins** pay a multiple of the stake, which includes the stake (a 3x win on 10 Crowns gives 30, so you're up 20). Only the best matching line counts. A win of 10x or more plays a level-up sound.
- **The jackpot** (three Crowns, 300x) shows `JACKPOT!` on screen, sets off four fireworks around you and, with `announceJackpots`, tells everyone: `[Slots] Steve hit the JACKPOT for 7,500 Crowns!`
- **Emeralds** are counted and taken from your inventory (plain emeralds only, not renamed ones); emerald wins go into your inventory, and what doesn't fit drops at your feet.
- **Refusals** say why and take nothing: not enough money, `Wait 2s before the next spin.`, `That stake is over what's left of today's loss limit (9 Crowns).`, `You reached today's loss limit for Crowns (200 Crowns). Come back tomorrow (UTC).`, or `You blocked yourself from the slots for 6 more days.`
- **Fixed machines:** tapping a machine block opens the machine instead of the block (sneak-tap in creative mode to use the block normally). Breaking the block removes the machine.

**The pay table** (default `symbols` and `payouts`). Each reel has 32 stops: Cherry 7, Lemon 8, Bell 6, BAR 5, Gem 3, 7 2, Crown 1.

| Result | Pays | Chance per spin |
|---|---|---|
| Crown Crown Crown (jackpot) | 300x | 1 in 32,768 |
| 7 7 7 | 100x | 1 in 4,096 |
| Gem Gem Gem | 40x | 1 in 1,214 |
| BAR BAR BAR | 30x | 1 in 262 |
| Bell Bell Bell | 18x | 1 in 152 |
| Cherry Cherry Cherry | 10x | 1 in 96 |
| Lemon Lemon Lemon | 10x | 1 in 64 |
| Any two Cherries | 3x | 1 in 9 |
| Any two Crowns | 8x | 1 in 352 |

**Return to player: 91.97%** exactly (30,137 of every 32,768 staked comes back on average; the machine keeps about 8%), and 15.26% of spins win something. The menu computes these from `config.js`, so they stay right if you change the table: the return is the sum over every line of its chance times its pay, over all 32,768 equally likely reel stops. A 100,000-spin simulation with the machine's own code came out at 92.79% at stake 1 and 90.73% at stake 10 (the jackpot makes short runs swing).

### Commands

| Command | Who | What it does |
|---|---|---|
| `/realm:slots` | Everyone | The menu: **Spin**, **My stats**, **Pay table**, **Limits and breaks** (and **Operator tools** for operators) |
| `/realm:slots_spin` | Everyone | Opens the machine straight away: pick a currency and a stake (Crowns and emeralds both allowed by default, `currencies`) |
| `/realm:slots_give [player]` | Operators | Gives the Slot Machine item to the players picked, or to you |

### Configuration (`scripts/config.js` → `CONFIG`)

| Option | Default | Description |
|---|---|---|
| `enabled` | `true` | The slots can be played. When `false`, machines and the item say they're closed |
| `currencies.crowns` | `true` | Players may stake Crowns (the `crowns` scoreboard of the Crowns pack) |
| `currencies.emeralds` | `true` | Players may stake emeralds from their inventory |
| `stakes.crowns` | `[1, 5, 10, 25]` | The Crowns stakes to choose from |
| `stakes.emeralds` | `[1, 2, 4, 8]` | The emerald stakes to choose from |
| `dailyLossLimit.crowns` | `200` | Most Crowns a player may lose per UTC day (stakes minus winnings). `0` = no limit |
| `dailyLossLimit.emeralds` | `32` | The same for emeralds |
| `cooldownSeconds` | `2` | Seconds between the end of one spin and the start of the next |
| `announceJackpots` | `true` | A jackpot is announced to everyone in chat |
| `symbols` | 7 symbols (above) | The reel symbols, `{ id, name, color, weight }`; `weight` is how many of a reel's stops show it |
| `payouts` | 9 lines (above) | The pay table, `{ symbol, count, pay, jackpot? }`: `count` reels showing `symbol` (anywhere) pay `pay` times the stake. The first matching line wins, so put bigger wins first |

Operators can change `enabled`, `currencies.crowns`, `currencies.emeralds`, `dailyLossLimit.crowns`, `dailyLossLimit.emeralds`, `cooldownSeconds` and `announceJackpots` in game with `/realm:config` (**Slot Machine**). Stakes and the pay table stay in `config.js`.

### Saved data

| Key | Scope | Contents |
|---|---|---|
| `slots:stats` | Player | JSON: spins, Crowns and emeralds staked and won, the biggest win and jackpots |
| `slots:day` | Player | JSON `{ day, crowns, emeralds }`: the UTC day and that day's net loss per currency, for the daily limit |
| `slots:block` | Player | When the player's self-block ends (milliseconds since 1970), or `-1` until an operator lifts it |
| `slots:machines` | World | JSON list of machine blocks, `[{ d, x, y, z }]` (at most 100) |
| `slots:totals` | World | JSON: all spins, Crowns and emeralds staked and paid out, jackpots |
| `slots:machine` | Item | `true` on a Slot Machine item (a carrot on a stick named `Slot Machine`) |
| `slots:cfg` | World | Settings changed in `/realm:config` |
| `crowns` | Scoreboard | Balances, shared with the Crowns pack: stakes are taken from it and wins paid into it |

---

## Silly Enchants — `silly_bp`

Fourteen silly "enchantments" for your gear. They only add particles, sounds and some very big bounces: none of them changes damage, armor, speed, drops or durability. Most effects come in a few random variants, so they rarely sound the same twice. Each one is a lore line on the item, like `Silly: Grunt Birthday`, and an item holds at most two. They come on **Silly Books** (enchanted books named `Silly Book`), which you apply from `/realm:silly` to the item in your hand.

### How to use

1. Get a **Silly Book**: operators hand them out, and the realm may sell them (at the caravan or market, if an operator adds them). A book says what it holds (`Silly Book: Hyper Jump`), or `Silly Book: Random` for a surprise.
2. Hold the item to enchant (boots for Hyper Jump, a sword for Grunt Birthday...) and run `/realm:silly`.
3. Pick **Apply a Silly Book**, then the book. The book is used up and the item gets a line like `Silly: Hyper Jump`. Each item takes up to 2.
4. Wear or hold the item to see it work. Don't like it? `/realm:silly` → **Remove a silly enchant** takes it off for free (the book doesn't come back).
5. Don't want to see your own silly effects for a while? Disable **My silly effects** in `/realm:prefs`; the lore stays.
6. **Operators:** `/realm:silly` → **Give Silly Books**, or `/realm:silly_give <player> <book> [amount]`. `/realm:config` → **Silly Enchants** switches the effects, sets the enchants per item, the Hyper Jump cooldown and **Hyper Jump soft landing**.

### What players see

| Enchant | Goes on | What it does |
|---|---|---|
| Grunt Birthday (`grunt_birthday`) | Held item | Mobs you defeat pop like a party: a big burst of confetti, then one of five parties at random (fireworks, a little fanfare, a party horn, hearts, or a zap) |
| Hyper Jump (`hyper_jump`) | Boots | Sneak and jump to launch. Each launch is a surprise (`hyperJumpOdds`): 60% a big jump (about 30 blocks up), 30% a huge one (about 50), and 10% the **Realm Space Program**: a `3`, `2`, `1`, `LIFTOFF!` countdown on screen, a harmless explosion, then a rocket burn with flames and smoke to about 150 blocks up, while players within 96 blocks read `[Space Program] <name> has left the atmosphere.` (or another line). You fall at full speed; just above the ground a puff of slow falling catches you with a little boing, so you don't get hurt (`hyperJumpSoftLanding`; without it a big jump is a deadly fall). Every 4 seconds (`hyperJumpCooldownSeconds`) |
| Squeak (`squeak`) | Boots | Your footsteps squeak (now and then a different squeak) |
| Bubbles (`bubbles`) | Any armor | You leave a trail of bubbles |
| Rainbow Trail (`rainbow_trail`) | Boots | Rainbow-colored puffs follow your steps |
| Hat Trick (`hat_trick`) | Held item | A critical hit (hitting while falling) pulls a baby rabbit out of thin air (sometimes with a ta-da); it vanishes in a puff after 10 seconds (`hatTrickRabbitSeconds`). At most one every 10 seconds (`hatTrickCooldownSeconds`). Baby rabbits drop nothing |
| Disco (`disco`) | Any armor | Colored lights flash around you, with music notes |
| Moo (`moo`) | Helmet | You moo when you get hurt. Sometimes the wrong animal answers: an oink, a baa, a cluck or a meow |
| Confetti Swing (`confetti_swing`) | Held item | Every hit throws confetti, with a pop, a bubble, a pling or a bell |
| Tiny Thunder (`tiny_thunder`) | Held item | A thunderclap and a shower of sparks when you defeat a mob, sometimes with a lightning crack |
| Fish Slap (`fish_slap`) | Held item | Your hits make a loud wet fish slap and a splash (or a dolphin's giggle). Best on a fish |
| Glow (`glow`) | Helmet | You sparkle softly at night |
| Duck (`duck`) | Any armor | You quack when you sneak; sometimes twice |
| Hiccups (`hiccups`) | Helmet | You hiccup now and then, with bubbles; some hiccups hop you off the ground a little |

- **Held item** means anything you hold that isn't armor or a book: swords, tools, a bow, even a raw cod. **Helmet** includes the turtle shell; **any armor** includes the elytra.
- **Applying** says `Silly: Hyper Jump! Sneak and jump: a big bounce, a huge one, or now and then a trip with the Realm Space Program.` with a puff of confetti. A book that doesn't fit says so (`Hyper Jump goes on boots.`), and an item with 2 already says `An item holds at most 2 silly enchants. Remove one first.` A relic says `Relics can't take silly enchants.` and keeps the book (relics rewrite their lore, which would wipe the line). A Random book picks one that fits the item.
- The effects follow your worn armor and the item in your main hand, checked twice a second. Other players see and hear them too.

**Selling Silly Books** (for operators). This pack doesn't change other packs, but a book is recognized by its lore line, so a shop can sell one. In the [Merchant Caravan](#merchant-caravan--caravan_bp)'s `goods` in `caravan_bp/scripts/config.js`, add for example:

```js
{ id: "silly_book", item: "minecraft:enchanted_book", amount: 1, price: 30, stock: 3, name: "Silly Book (random)", nameTag: "§r§dSilly Book", lore: ["§dSilly Book: Random", "§7A surprise silly enchant"] },
```

Use `Silly Book: Hyper Jump` (any enchant's name) instead of `Random` for a particular one. The [Crowns](#crowns--crowns_bp) market's `buy` list only sells plain items, so the caravan is the place for books.

### Commands

| Command | Who | What it does |
|---|---|---|
| `/realm:silly` | Everyone | The menu: apply a Silly Book to the item in your hand (up to 2 per item, `maxPerItem`), remove one for free, see every enchant (and give books, for operators) |
| `/realm:silly_give <player> <book> [amount]` | Operators | Gives Silly Books: `book` is `random` or an enchant id (`hyper_jump`, `grunt_birthday`...), `amount` 1 to 64 (default 1) |

### Configuration (`scripts/config.js` → `CONFIG`)

| Option | Default | Description |
|---|---|---|
| `enabled` | `true` | Silly effects play. When `false`, the lore stays on the gear but does nothing |
| `maxPerItem` | `2` | Most silly enchants one item can hold |
| `disabled` | `[]` | Enchant ids that never play and can't be applied, e.g. `["moo"]` |
| `hyperJumpStrength` | `1.0` | Scales every Hyper Jump launch (0.2 to 2). At 1 a big jump goes about 30 blocks up, a huge one about 50 and the Space Program about 150 |
| `hyperJumpOdds.big` | `60` | Weight of a big Hyper Jump (about 30 blocks up) |
| `hyperJumpOdds.huge` | `30` | Weight of a huge Hyper Jump (about 50 blocks up) |
| `hyperJumpOdds.space` | `10` | Weight of a Realm Space Program launch (about 150 blocks up). The three are weights: they needn't add up to 100 |
| `hyperJumpSoftLanding` | `true` | A puff of slow falling just above the ground stops a Hyper Jump fall, so landings don't hurt. When `false`, you fall for real (Feather Falling helps; a big jump without it is deadly) |
| `hyperJumpCooldownSeconds` | `4` | Seconds between Hyper Jumps |
| `hatTrickCooldownSeconds` | `10` | Seconds between Hat Trick rabbits for one player |
| `hatTrickRabbitSeconds` | `10` | Seconds before a Hat Trick rabbit vanishes |

Operators can change `enabled`, `maxPerItem`, `hyperJumpCooldownSeconds` and `hyperJumpSoftLanding` (**Hyper Jump soft landing**) in game with `/realm:config` (**Silly Enchants**). Each player can switch their own effects with **My silly effects** in `/realm:prefs`.

### Saved data

| Key | Scope | Contents |
|---|---|---|
| Item lore `Silly: <name>` | Item | The enchants on a piece of gear (plain lore, so it survives anvils and trading) |
| Item lore `Silly Book: <name>` | Item | What a Silly Book holds (`Random` for a surprise) |
| `silly:applied` | Player | How many silly enchants the player has applied |
| `silly:pref` | Player | JSON of the player's preferences (**My silly effects**) |
| `silly:until` | Entity | When a Hat Trick rabbit (tagged `silly_rabbit`) vanishes |
| `silly:cfg` | World | Settings changed in `/realm:config` |

---

## Dolphin Friends — `dolphin_bp`

Tame a dolphin with raw fish, then ride it through the sea: it swims where you look. Tamed dolphins stay (they never despawn), follow you in the water, can be named and called to you.

### How to use

1. Find a dolphin (oceans) and feed it **raw cod** or **raw salmon**: tap it with the fish. Each fish has a 25% chance (`tameChancePercent`) to tame it: hearts mean it worked, smoke means try again. Chat says `The dolphin trusts you!`. It takes 4 fish on average.
2. **Ride:** tap your tamed dolphin with an empty hand. It swims where you look: push forward to go, back to back up, left or right to drift sideways. Look up or down to rise or dive.
3. **Leap:** press jump while swimming at the surface and the dolphin jumps out of the water.
4. **Get off:** sneak.
5. Run `/realm:dolphin` for **My dolphins**: call one to you (it swims over when you're in the water, up to 128 blocks), name it or release it. **Call the nearest** calls the closest one; `/realm:dolphin_call` does the same.
6. **Operators:** `/realm:dolphin` → **Operator tools** lists every tamed dolphin with its owner and releases the one you look at. `/realm:config` → **Dolphin Friends** sets the taming chance, how many dolphins each player may have, whether others can ride yours and the top speed.

### What players see

- **Feeding** works as in vanilla too: a fed dolphin may still lead you to treasure. One fish is used per tap, whether or not the dolphin takes it as a vanilla treat. A player can have up to 3 tamed dolphins (`maxPerPlayer`); a fourth says `You already have 3 dolphins. Release one first (/realm:dolphin).`
- **Riding:** the dolphin turns to face where you look and speeds up to 12 blocks per second (`maxSpeed`, gaining `acceleration` 1.6 blocks per second each tick). Without input it glides to a stop. Out of the water it doesn't steer. Leaps need 1.5 seconds between them. Others can ride your dolphins too unless an operator disables `othersCanRide`.
- **Following:** an unridden tamed dolphin swims toward its owner when you're both in the water and more than 8 blocks apart (`followDistance`), up to 64 blocks away.
- **Calling:** the dolphin must be loaded (near a player) and in your dimension, and you must be in the water. It appears next to you with hearts. Calling, naming and releasing only work on a dolphin that is still yours (one an operator released and someone else tamed says `That dolphin isn't yours any more.`).
- A tamed dolphin that dies tells its owner: `Splash died.`
- **For operators and tests:** with cheats on, `/scriptevent realm:dolphin_feed` (run by an operator holding raw cod or salmon) feeds the nearest dolphin within 5 blocks exactly as a tap would.

**Compatibility note:** this pack carries a copy of the vanilla dolphin's behavior file (`entities/dolphin.json`, from Minecraft 1.26.50) with one addition: a `realm:dolphin_tamed` group (a seat for one player, `minecraft:rideable`; `minecraft:is_tamed`; `minecraft:persistent`), added by the event `realm:dolphin_tame` and removed by `realm:dolphin_release`. Wild dolphins behave exactly as in vanilla: treasure leading, playing with items, swimming with players for Dolphin's Grace, breathing air, drying out on land. All components are stable ones, so no experiments are needed on the Realm. Two things to know: another behavior pack that also changes the dolphin wins or loses depending on pack order (only the top one's file is used), and if a future Minecraft update changes the vanilla dolphin, this copy keeps the old behavior until it is refreshed from the newest vanilla file.

### Commands

| Command | Who | What it does |
|---|---|---|
| `/realm:dolphin` | Everyone | Your tamed dolphins (up to 3, `maxPerPlayer`): call, name, release; **Call the nearest** (and **Operator tools** for operators) |
| `/realm:dolphin_call` | Everyone | Calls your nearest tamed dolphin to you (you must be in the water) |

### Configuration (`scripts/config.js` → `CONFIG`)

| Option | Default | Description |
|---|---|---|
| `enabled` | `true` | Dolphins can be tamed, ridden and called. When `false`, tamed dolphins stay tamed (and can still be sat on) but don't steer, follow or come when called |
| `tameChancePercent` | `25` | Chance in percent that one raw cod or salmon tames a dolphin |
| `maxPerPlayer` | `3` | Most tamed dolphins one player can have |
| `othersCanRide` | `true` | Other players may ride and steer your tamed dolphins |
| `maxSpeed` | `12` | Top speed while ridden, in blocks per second |
| `acceleration` | `1.6` | Blocks per second a ridden dolphin gains each tick |
| `leapStrength` | `0.9` | Upward push of a leap out of the water |
| `followDistance` | `8` | A tamed dolphin swims after its owner (in water) when farther than this many blocks |

Operators can change `enabled`, `tameChancePercent`, `maxPerPlayer`, `othersCanRide` and `maxSpeed` in game with `/realm:config` (**Dolphin Friends**).

### Saved data

| Key | Scope | Contents |
|---|---|---|
| `dolphin:owner` | Entity | The owner's player id on a tamed dolphin |
| `dolphin:ownerName` | Entity | The owner's name when it was tamed |
| `dolphin:index` | World | JSON `{ entity id: { o, on, n, d, x, y, z } }`: every tamed dolphin's owner, name and last known spot, for the lists while it's far away |
| `dolphin:tamedCount` | Player | How many dolphins the player has tamed |
| `dolphin:cfg` | World | Settings changed in `/realm:config` |

---

## Treasure Maps & Riddles — `maps_bp`

Buy a treasure map from Mara the Cartographer and follow its riddles across the land: each clue tells you which way to walk and roughly how far, and where it ends the next clue appears. After two or three clues, 800 to 2,000 blocks from where you bought the map, a chest lies buried. Hold the map and it tells you whether you're getting warmer. Finding the treasure pays Crowns, and the chest holds gold, iron, emeralds and sometimes a diamond or even a relic.

### How to use

1. Find Mara the Cartographer (or any NPC with the `cartographer` role, from [Townsfolk](#townsfolk--npc_bp)), tap her and pick **Buy a treasure map (50 Crowns)**. You get a piece of paper named `Treasure Map`, and chat reads the first clue, for example `"Walk toward the setting sun for about twelve hundred paces, and there the next riddle waits."`
2. Work out the direction: the North Star is north, the rising sun is east, the setting sun is west, and "with the North Star at your back" is south. A pace is a block.
3. Hold the map in your hand: every 2 seconds the box on the right side of the screen, above the scoreboard (or the middle of the screen or the line above the hotbar, if you choose it in `/realm:prefs`), says `Warmer`, `Colder` or `Very warm`, with which clue you're on.
4. Get within 30 blocks of where the clue points and the next clue appears in chat and on the map. As you get close, the map also names what the spot looks like (`The spot lies among the trees.`).
5. On the last clue, once you're close, the map grows hot: the chest is buried nearby, 1 to 3 blocks down. Follow `Hot` to `Burning hot! Dig here.`; standing over it pays the Crowns. Then dig up the chest for the rest.
6. Lost the map, or the clue? Run `/realm:maps` (or `/realm:maps_hunts`) for your hunt's clue, a new copy of the map, or to give the hunt up.
7. **Operators:** `/realm:maps` opens the **Treasure Maps** menu instead: `Your treasure hunts`, `Give a treasure map` (pick a player online) and `Settings` (which points to `/realm:config` → Treasure Maps & Riddles). `/realm:maps_give <player>` gives a free map from chat. `/realm:config` → **Treasure Maps & Riddles** sets the price, how far maps lead, how many hunts a player can have, the Crowns found, the distance from world spawn and the hints.

### What players see

- **Buying:** the cartographer's menu explains the hunt and the price (default 50 Crowns, `price`) and shows your balance. Chat says `-50 Crowns (Treasure map)` and `You bought a treasure map! The first clue: "..."`. You can follow one hunt at a time (`maxHunts`); with one going, the cartographer also offers **Your treasure hunt**, and buying another says `You're already following one of my maps. Find that treasure first, or give it up.` Maps only show the Overworld.
- **The hunt:** the treasure is 800 to 2,000 blocks (`minDistance`, `maxDistance`) in a straight line from where you bought the map, in a random direction away from world spawn, reached in 2 or 3 legs (`legsMin`, `legsMax`) that wander a little sideways. Each clue is told from where you found the last one, so it points the right way from there.
- **Clues** come from `clues` and, for the last leg, `finalClues`, with `{dir}` from `directions` (8 compass points as riddles) and `{dist}` in words rounded to 100 blocks (`about twelve hundred`). Coming within 30 blocks (`legRadius`) of the end of a leg says `You found the next clue! (2 of 3) "..."` and rewrites the map. Within 96 blocks, once the place is loaded, chat says `The map's ink darkens: the spot lies ...`: on the warm sand, in the snow, among the trees, among the red rocks, on bare stone, high on the bare mountain, in the muddy marsh, where the land meets the water, out on the open water, high up in the hills or in the open fields.
- **The map** is paper named `Treasure Map` with the clue as lore, then `Clue 2 of 3` and `Map 4QZ` (its hunt). While you hold it (`warmth`): `Warmer` or `Colder` (compared with 2 seconds ago), `The map is quiet` when you haven't moved, `Very warm` within 40 blocks (`veryWarm`) of the next clue or the chest, and, near the chest, `Hot` (12 blocks) and `Burning hot! Dig here.` Holding a map from a finished or abandoned hunt says so.
- **The chest:** once you're within 48 blocks (`buryDistance`) of the treasure, the pack looks for a spot within 32 blocks (`searchRadius`) of it and buries a chest there, 1 to 3 blocks under natural ground: `The map grows hot in your hands. The treasure is buried close by: follow the warmth, then dig.` If there's no good spot there (water, a build, a cave), the treasure moves 60 to 120 blocks further and the map says `The map's ink shifts: the treasure isn't here after all.` with a new clue. After 4 tries the treasure is handed over directly (`You found the treasure, washed up and half buried!`).
- **Finding it:** standing within 3 blocks of the chest says `You found the treasure! The chest is buried right here, 1 to 3 blocks down: dig it up.` and pays 30 to 90 [Crowns](#crowns--crowns_bp) (`crownsMin`, `crownsMax`): `+40 Crowns (Treasure map)`. The map disappears. The chest holds what `loot` rolls: by default often gold and iron ingots, often emeralds or bottles o' enchanting, sometimes ender pearls, a diamond or two, a golden apple, a name tag or a saddle, and rarely a heart of the sea.
- **Other packs:** finding a treasure finishes a `treasure` quest (`realm:quest_done`), gives 10 Wayfarers reputation in [Guilds & Reputation](#guilds--reputation--guilds_bp) (`reputation`), 50 Exploration XP in [Skills](#skills--skills_bp) (`skillXp`) and a `Buried treasure` entry on the Places page of the [Field Journal](#field-journal--journal_bp) (listed under "Also found"). One treasure in 10 (`relicChance`) also holds a relic from [Relics](#relics--relics_bp) (`relics`): `Something old and strange glints among the coins...`
- **Giving up** (`/realm:maps` → **Give up this hunt**) removes the hunt and its map; the Crowns aren't paid back. A chest that was already buried stays where it is.

**Treasure chests never touch builds.** A chest only replaces natural ground (grass, dirt, sand, gravel, clay, stone, snow, natural terracotta and the like), with natural ground above it. Before burying one, the pack checks the 9 x 9 columns around the spot, from 4 blocks over the ground to 4 below, and skips the spot if it finds anything a player likely made: planks, glass, chests, barrels, signs, beds, torches, lanterns, doors, fences, wool, carpet, concrete, glazed terracotta, terracotta in colors the badlands don't have, bricks, tiles, slabs, stairs, crafted wood, metal and other crafted blocks, heads, crafting tables, furnaces, rails, farmland, paths, cobblestone and more. It never buries one within 64 blocks of world spawn (`avoidSpawn`), and skips columns it can't read. Packs can't read [Land Claims](#land-claims--claims_bp), so this check is what keeps chests out of claimed builds.

### Commands

| Command | Who | What it does |
|---|---|---|
| `/realm:maps` | Everyone | Your treasure hunt, like `/realm:maps_hunts`. Operators get the **Treasure Maps** menu instead: their hunts, `Give a treasure map` and `Settings` |
| `/realm:maps_hunts` | Everyone | Your treasure hunt: the clue, the place once seen, which clue you're on; buttons for a new copy of the map (when you don't carry one) and to give the hunt up |
| `/realm:maps_give <player>` | Operators | Gives the players picked (`@a` works) a free treasure map, starting where each one stands. Skips players outside the Overworld or already on as many hunts as allowed (default 1, `maxHunts`) |

### Configuration (`scripts/config.js` → `CONFIG`)

| Option | Default | Description |
|---|---|---|
| `price` | `50` | Crowns a treasure map costs at a cartographer (0 = free) |
| `npcRole` | `"cartographer"` | The NPC role whose NPCs sell treasure maps |
| `maxHunts` | `1` | Treasure hunts a player can have at once (1 to 3 in game) |
| `minDistance` | `800` | The treasure is at least this many blocks from where the map was bought |
| `maxDistance` | `2000` | ...and at most this many |
| `legsMin` | `2` | Fewest clues a hunt has |
| `legsMax` | `3` | Most clues a hunt has |
| `legRadius` | `30` | Coming this close (blocks, ignoring height) to the end of a leg reveals the next clue |
| `buryDistance` | `48` | The chest is buried once the player is this close to the treasure |
| `searchRadius` | `32` | How far from the planned spot the chest may be buried |
| `avoidSpawn` | `64` | Never bury a chest closer than this to world spawn |
| `warmth` | `true` | Show Warmer / Colder / Very warm while holding a Treasure Map |
| `showAt` | `"side"` | Where Warmer / Colder shows for players who haven't chosen: `side` (a box on the right side, above the scoreboard, from [Side HUD](#side-hud--hud_rp)), `middle` (the subtitle line in the middle of the screen) or `hotbar`. Other add-ons that redraw the line above the hotbar (waypoint and compass add-ons) can cover only `hotbar`. Players pick their own with **Where Warmer / Colder shows for me** in `/realm:prefs` |
| `veryWarm` | `40` | `Very warm` within this many blocks of the next clue or the chest |
| `plainHints` | `false` | `/realm:maps` also shows the plain direction and distance from where you stand, like `(W, about 1,000 blocks)` |
| `crownsMin` | `30` | Least Crowns found with a treasure |
| `crownsMax` | `90` | Most Crowns found with a treasure |
| `reputation` | `10` | Wayfarers reputation for a treasure |
| `skillXp` | `50` | Exploration skill XP for a treasure |
| `relicChance` | `0.1` | Chance (0 to 1) that a treasure also holds a relic |
| `relics` | `compass_echoes`, `wayfarer_boots`, `sun_pendant`, `rain_charm` | The relics a treasure can hold (Relics pack ids) |
| `loot` | 10 lines | What the chest holds: `{ item, min, max, chance }`, each line rolled on its own. Default: gold ingots 2-6 (80%), iron ingots 3-8 (70%), emeralds 1-5 (50%), diamonds 1-2 (25%), a golden apple (20%), ender pearls 1-3 (30%), bottles o' enchanting 3-8 (50%), a name tag (15%), a saddle (10%), a heart of the sea (3%). A chest that rolls nothing gets the first line |
| `directions` | 8 riddles | How N, NE, E, SE, S, SW, W and NW read in a clue: `toward the North Star`, `between the North Star and the rising sun`, `toward the rising sun`, `between the rising sun and the warm south wind`, `with the North Star at your back`, `between the warm south wind and the setting sun`, `toward the setting sun`, `between the setting sun and the North Star` |
| `clues` | 4 riddles | Clues for a leg that ends at another clue, with `{dir}` and `{dist}`, e.g. `Walk {dir} for {dist} paces, and there the next riddle waits.` |
| `finalClues` | 3 riddles | Clues for the last leg, e.g. `{dist} paces {dir}, and the X is beneath your feet.` |

Operators can change `price`, `maxHunts`, `minDistance`, `maxDistance`, `warmth`, `showAt`, `plainHints`, `crownsMin`, `crownsMax` and `avoidSpawn` in game with `/realm:config` (**Treasure Maps & Riddles**). The rest stays in `config.js`. Each player picks where Warmer / Colder shows with **Where Warmer / Colder shows for me** in `/realm:prefs`.

### Saved data

| Key | Scope | Contents |
|---|---|---|
| `maps:hunts` | Player | JSON list of the player's hunts: `{ id, dim, pts, leg, clue, place?, chest?, tries, t }`: the end of each leg (the last is the treasure), the leg being followed, its clue, what the spot looks like, where the chest was buried, failed chest spots and when the map was bought |
| `maps:cfg` | World | Settings changed in `/realm:config` |
| `maps:pref` | Player | The player's **Where Warmer / Colder shows for me** choice, when it differs from the realm's |
| `crowns` | Scoreboard | The map's price is taken from, and the treasure's Crowns added to, the shared Crowns balance |

### How it works

- **The route** is planned when the map is bought: a random direction (retried up to 16 times to keep the treasure away from world spawn), a distance, and evenly spaced leg ends with a sideways wander of up to a quarter of a leg. Nothing is placed then: the far land isn't loaded yet.
- **Following:** once a second the pack checks each player with a hunt (Overworld only) against the end of their leg; the Warmer / Colder line runs every 2 seconds for players holding a map. On the right side it follows the side box protocol (`realm:side`, see [How the packs work together](#how-the-packs-work-together)); above the hotbar it sends `realm:actionbar` first, so the [Coordinates HUD](#coordinates-hud--hud_bp) steps aside. The place description reads the highest block at the leg's end (and 4 around it, for water).
- **Burying** is a search spread over time: at most 150 block reads every 10 ticks for all players together. It tries the planned spot, then rings 6, 12, 18, 24 and 30 blocks out, and for each candidate reads the ground, the blocks down to the chest, and the 9 x 9 columns around it (surface +4 to -4). The chest is placed with `Block.setType` and filled through its inventory component.
- **The map** is plain paper (no map mechanics) identified by its name and its last lore line, `Map <id>`; its lore is rewritten in the inventory when the clue changes, and it's taken away when the hunt ends.
- **Cartographers:** on `realm:npc_talk` with the `cartographer` role the pack answers `realm:npc_offer` with **Buy a treasure map** (`order` 20) and, during a hunt, **Your treasure hunt** (21).
- Events sent on finding a treasure: `realm:quest_done` `{ kind: "treasure" }`, `realm:rep_add` `{ guild: "wayfarers" }`, `realm:journal` `{ page: "places", entry: "treasure" }`, `realm:skill_xp` `{ skill: "exploration" }`, and sometimes `realm:relic_give`.

---

## Waystones & Inns — `waystone_bp`

Fast travel you build yourself. Put a sign saying `Waystone: <name>` next to a lodestone and tap the lodestone: it becomes a waystone. Everyone who finds it (by tapping it or walking up to it) can later travel there from any other waystone, for a few Crowns per 100 blocks after standing still for 10 seconds. Innkeepers, like Elsie from [Townsfolk](#townsfolk--npc_bp), rent beds that make the inn your respawn point and leave you Well Rested, and pass on the latest news.

### How to use

1. Make a waystone: place a lodestone, put a sign next to it (on it, beside it or on the block next to it, standing or on a wall) and write `Waystone: River Gate` on the sign. Then tap the lodestone with an empty hand. Chat says `You raised the waystone River Gate!`
2. Discover waystones by tapping them or walking within 4 blocks of one: `Waystone discovered: River Gate.`
3. To travel, tap any waystone with an empty hand. Pick a waystone you've discovered; each button shows how far it is and what it costs (`240m NE, 3 Crowns`).
4. Stand still for 10 seconds while the countdown runs above the hotbar (`Traveling to River Gate in 7...`). Moving more than a block or getting hurt cancels the trip. The screen fades and you arrive next to the other waystone; the trip is paid then.
5. Run `/realm:waystones` for the waystone menu: **My waystones** (also `/realm:waystones_list`) lists the waystones you've discovered and how far they are.
6. At an inn, tap the innkeeper: **Rent a bed** (10 Crowns) makes the inn your respawn point and gives you Well Rested; **Hear the news** tells what's happened lately (tornadoes, meteors, caravans...).
7. **Operators:** **Remove a waystone** in `/realm:waystones` lists every waystone, nearest first, to pick from; or look at a waystone's lodestone or sign and run `/realm:waystones_remove`. `/realm:config` → **Waystones & Inns** sets who can make waystones, whether travel costs Crowns or XP levels and how much, the wait, travel between dimensions and from anywhere, and the inn's price and Well Rested time.

### What players see

- **Making a waystone:** an empty-hand tap on a lodestone with a `Waystone:` sign within one block (any of the 26 blocks around it, front or back of the sign) registers it under the name after `Waystone:` (or after `Waystone` on the first line, with the name on the lines below; up to 24 characters; color codes and other symbols are dropped). Any player can (`whoCanCreate`, or operators only). Names are unique: `There's already a waystone named River Gate.` A sign with nothing after `Waystone:` says `Write a name after Waystone: on the sign`, and a lodestone with no such sign says `Put a sign saying Waystone: <name> next to this lodestone, then tap it again to make a waystone.` The realm keeps at most 150 waystones (`maxWaystones`). Changing the sign later doesn't rename the waystone.
- **Discovering:** tapping a waystone or coming within 4 blocks of it (`discoverRadius`) adds it to your list, with a chime, and as a `places` entry in the [Field Journal](#field-journal--journal_bp) (`waystone_river_gate`). The one who makes a waystone discovers it at once.
- **Travel menu** (tap a waystone): `Where to? You have 42 Crowns.` and a button per discovered waystone, nearest first: `River Gate` / `240m NE, 3 Crowns`, or `Nether, 10 Crowns` for one in another dimension.
- **Cost:** 1 Crown per 100 blocks (`costPer100`), rounded up, at least 1 (`minCost`); 10 to another dimension (`crossDimensionCost`, or not offered with `crossDimension` disabled). With `currency` set to `levels`, trips cost XP levels instead. The cost is checked when you choose and taken when you arrive (`Paid 3 Crowns for the trip to River Gate.`).
- **The wait:** 10 seconds (`channelSeconds`, 0 = at once): `Traveling to River Gate in 10 seconds. Stand still.` in chat and a countdown above the hotbar. Moving more than 1 block, changing dimension or taking any damage cancels it: `You moved: the trip to River Gate is canceled.` Half a second before the jump the screen fades to dark blue and back.
- **Arriving:** you land beside the other waystone's lodestone, facing it, on a free spot with solid floor (or, for a waystone in a cellar, the first open space straight above it); if its surroundings aren't loaded yet you land on top of the lodestone and are moved beside it once they load. If you'd land inside a block, in lava, or over a drop where the lodestone used to be, you're moved to a free spot, and when there's none you're sent back to where you started with the trip paid back (`There's no safe place to stand at River Gate, so the waystone sent you back.`). A waystone that's loaded and walled in on every side isn't traveled to at all, and nothing is paid.
- **A broken waystone:** breaking or blowing up its lodestone removes the waystone (`The waystone River Gate is gone.`). A lodestone that vanished another way (pistons, commands) is noticed when someone is within 96 blocks, or when someone arrives there. Trips on the way to it are canceled.
- **`/realm:waystones`:** a menu saying how many waystones you've discovered, with **My waystones** (**Travel** with `travelAnywhere` enabled) and, for operators, **Remove a waystone** (asks first; the lodestone and sign stay).
- **`/realm:waystones_list`** (the menu's first button): lists your discovered waystones with distance and direction. You can't travel from it unless `travelAnywhere` is enabled; then it opens the travel menu, priced from where you stand (or from the waystone you're standing at).
- **Inns** (tap an NPC with the `innkeeper` role, `npcRole`):
  - **Rent a bed** (10 [Crowns](#crowns--crowns_bp), `bedPrice`): your respawn point becomes the innkeeper's spot, until you sleep in a bed of your own, and you're Well Rested: Health Boost I (2 extra hearts) for 60 minutes (`wellRestedMinutes`), plus a moment of Saturation and Regeneration to fill them, all without particles. Chat says `-10 Crowns (A bed at the inn)` and `You rest at the inn. Well Rested: 2 extra hearts for 60 minutes.` Beds can only be rented in the Overworld. Dying ends Well Rested, like any effect.
  - **Hear the news:** the latest 6 (`newsKept`) sky events other packs announced, newest first, like `3h ago: A tornado tore across the land (240m NE of here)` or the event's own text: tornadoes, rainbows, meteors, blood and harvest moons, auroras, storms, caravans and fishing tournaments. Nothing yet: `Nothing new lately. Quiet times, and I'm not complaining.`

### Commands

| Command | Who | What it does |
|---|---|---|
| `/realm:waystones` | Everyone | The waystone menu: your waystones, and for operators, remove a waystone from a list |
| `/realm:waystones_list` | Everyone | Lists the waystones you've discovered, with distance and direction. With travel from anywhere enabled (default off, `travelAnywhere`), opens the travel menu instead |
| `/realm:waystones_remove` | Operators | Removes the waystone whose lodestone or sign you're looking at (within 8 blocks). The lodestone and sign stay |

### Configuration (`scripts/config.js` → `CONFIG`)

| Option | Default | Description |
|---|---|---|
| `whoCanCreate` | `"everyone"` | Who can make a waystone: `everyone` or `operators` |
| `currency` | `"crowns"` | What travel costs: `crowns` or `levels` (XP levels) |
| `costPer100` | `1` | Cost per 100 blocks, rounded up |
| `minCost` | `1` | The least a trip costs |
| `crossDimension` | `true` | Allow travel between waystones in different dimensions |
| `crossDimensionCost` | `10` | What a trip to another dimension costs (instead of the distance cost) |
| `channelSeconds` | `10` | Seconds to stand still before traveling (0 = at once) |
| `travelAnywhere` | `false` | `/realm:waystones` opens the travel menu anywhere |
| `discoverRadius` | `4` | Standing this close (blocks) to a waystone discovers it |
| `maxWaystones` | `150` | Most waystones the realm keeps |
| `npcRole` | `"innkeeper"` | The NPC role whose NPCs rent beds and tell the news |
| `bedPrice` | `10` | Crowns a bed at the inn costs (0 = free) |
| `wellRestedMinutes` | `60` | How long Well Rested (Health Boost I) lasts, in minutes; 0 = no Well Rested |
| `newsKept` | `6` | How many of the latest sky events the innkeeper remembers |

Operators can change `whoCanCreate`, `currency`, `costPer100`, `minCost`, `crossDimension`, `crossDimensionCost`, `channelSeconds`, `travelAnywhere`, `bedPrice` and `wellRestedMinutes` in game with `/realm:config` (**Waystones & Inns**). The rest stays in `config.js`. There are no player preferences.

### Saved data

| Key | Scope | Contents |
|---|---|---|
| `waystone:list` | World | JSON list of waystones: `{ i, n, d, x, y, z, by, t }` (id, name, dimension, lodestone position, who made it, when) |
| `waystone:next` | World | The next waystone id |
| `waystone:known` | Player | JSON list of the waystone ids the player discovered |
| `waystone:news` | World | JSON list of the latest sky events: `{ k, t, text?, d?, x?, z? }` (kind, when, text, dimension, place) |
| `waystone:cfg` | World | Settings changed in `/realm:config` |
| `crowns` | Scoreboard | Trips (with `currency` `crowns`) and beds are paid from the shared Crowns balance |

### How it works

- **Taps:** `beforeEvents.playerInteractWithBlock` with an empty hand on a lodestone (first event only); the work happens a tick later. The sign is read with the stable `minecraft:sign` block component (`getText`, front then back) on the 26 blocks around the lodestone.
- **Discovery** checks every online player against the waystones in their dimension once a second (distance math only, no block reads).
- **Removal:** `afterEvents.playerBreakBlock` and `afterEvents.blockExplode` on a registered lodestone; every 5 seconds up to 8 waystones within 96 blocks of a player are checked for their lodestone; arriving checks the one you traveled to.
- **The trip** is followed every 5 ticks: distance from where it started (over 1 block cancels) and `afterEvents.entityHurt`. Then `player.camera.fade`, the cost, and `player.teleport` with the destination dimension. The landing spot is checked for free feet and head room and a solid, safe floor (no lava, fire, magma, cactus, powder snow or water) on the 12 blocks around the lodestone at its height, one above and one below, then on top of it and up to 40 blocks straight above it; 10, 40 and 100 ticks after landing the pack checks the player's feet, head and the block under them again in case the area wasn't loaded. The countdown sends `realm:actionbar` first, so the [Coordinates HUD](#coordinates-hud--hud_bp) steps aside.
- **Inns:** on `realm:npc_talk` with the `innkeeper` role the pack answers `realm:npc_offer` with **Rent a bed** (`order` 20) and **Hear the news** (21). Renting finds the innkeeper (the nearest `minecraft:npc` with its `realm:npc_id:<id>` tag within 16 blocks) and sets the player's spawn point there with `Player.setSpawnPoint`. The news is every `realm:sky_event` the pack hears (the same kind twice within a minute counts once), kept in the world.
- Events sent: `realm:journal` `{ page: "places", entry: "waystone_<name>" }` on discovery.

---

## Expeditions — `expedition_bp`

Dungeon runs for you and your [party](#parties--party_bp), in the spirit of Diablo's Nightmare Dungeons. Pick one of eight dungeons (the Crypt, the Drowned Vault, Frost Hollow, the Nether Forge, the Sculk Depths, the Pillager Keep, the Spider Nest or the Ender Spire) and a difficulty: **Easy**, **Normal**, **Hard**, or **Nightmare tiers 1 to 20**, which you unlock one by one by clearing the tier below. A fresh dungeon is built for you deep underground: 6 to 18 rooms joined by corridors, with waves of mobs, elite halls, trap halls, shrines, puzzles (nine kinds), vertical shafts, hidden side caches, a boss and treasure. Higher tiers have more rooms and waves, tougher and armored mobs, champions, tall rooms you climb, build or fly up, and **affixes** that change the run (Frenzied, Volcanic, Lightning Storm...). The clock runs from the moment you arrive; the fastest clears of each dungeon and difficulty go on a leaderboard. Finishing pays [Crowns](#crowns--crowns_bp), Warden reputation in [Guilds & Reputation](#guilds--reputation--guilds_bp), a page in the [Field Journal](#field-journal--journal_bp), sometimes a [relic](#relics--relics_bp), and bosses and champions may drop a **Nightmare Sigil** that opens one exact run. No structure files: every dungeon is generated from a random seed, and the ground is filled back in after each run, so the next one is new.

### How to use

1. Run `/realm:expedition` and tap **Start an expedition**. Pick a dungeon, then a difficulty: Easy, Normal and Hard are open to everyone; **Nightmare 1** unlocks when you clear Hard, and each Nightmare tier unlocks the next.
2. The last screen shows what the run is like: rooms, time limit, waves, how strong the mobs are, the **affixes** (Nightmare only) and the rewards. Tap **Start**, or **Reroll affixes** (costs 25 Crowns, `rerollCost`) for a different set. If you're in a party, your party members within 32 blocks are asked `Ann is starting an expedition: Crypt (Nightmare 5). ... Join?` and have 20 seconds to tap **Join**.
3. The screen fades and you arrive in the entry room, with the clock running. The bar above the hotbar shows the dungeon, the time, what to do next and the affixes, like `Crypt N5 2:41/24:00 | Room 3/10: defeat the wave (2 left)`.
4. Walk into each room. The bars on the way out rise once the room is done (`The bars rise. Onward!`):
   - **Combat** and **elite** rooms send waves (`Wave 1 of 4!`): kill every mob. Elite halls bring a champion every wave.
   - **Puzzle** rooms explain themselves on signs and in chat: levers, a memory sequence, a safe path of pressure plates, target practice, lights out, a color riddle, a climb, a button rush or a riddle (see below).
   - **Trap halls**: the door out is already open. Run for it while flames flicker on the floor (they burst a moment later) and arrows fly from the walls.
   - **Shrines**: press one of three buttons: a **Blessing** for the rest of the run, a **curse** (one more affix, but more treasure and Crowns), or pass by.
   - **Shafts** (Nightmare 3 and up): the way on is high up the wall. Climb the ladder (below tier 10) or the ledges, pillar up with your own blocks, or fly with an elytra. At the top, drop down the chute into the pool.
   - **Side rooms** (Nightmare): an open doorway off a room leads to a puzzle; solve it for a hidden cache chest.
5. In the boss room the boss appears with its name as a title; on high tiers it calls adds onto the balconies. Defeat it: `Expedition complete` and your time fill the screen, everyone still in the dungeon is paid, and the treasure room opens. You have 30 seconds to empty the chests, then you're taken back to where you started.
6. **Nightmare Sigils** dropped by bosses and champions open one exact run: use the sigil (right-click) or pick it under **Use a Nightmare Sigil** in `/realm:expedition`. It works even before you've unlocked its tier, and it's used up when the run starts (a run called off before anyone goes in, say because the site isn't safe, gives it back).
7. To give up, run `/realm:expedition_leave` (or **Leave the expedition** in `/realm:expedition`). If you die you're out of the run, you respawn as usual and are sent back to where you started, and the items you dropped are given back.
8. `/realm:expedition` → **Leaderboards** shows the fastest clears of each dungeon at each difficulty, the **Highest tiers** players have cleared and the **Recent runs**; **My progress** shows what you've unlocked, your best and your own recent runs.
9. **Operators:** stand somewhere far from spawn and from anyone's builds and mines, and run `/realm:expedition_site` once (or `/realm:expedition_site <x> <z>`, or **Operator tools** → **Set the site where I stand**). Dungeons are built deep underground around that spot (up to 100 by 100 blocks, y -41 to -8), and the site is refused if it's within 114 blocks of world spawn or if anything that isn't natural rock, ore, dirt, gravel, water, lava or cave plants is in the way. `/realm:expedition_reset` ends a run in progress and fills the dungeon back in. **Operator tools** also has **Create a Nightmare Sigil** (any dungeon, tier and affixes) and **Unlock every tier for me**. `/realm:config` → **Expeditions** sets the party size, the time limit, the highest tier, building, the reroll cost and more.

### What players see

- **Difficulties and tiers.** Every dungeon can be played at every difficulty you've unlocked. Clearing Hard unlocks Nightmare 1; clearing Nightmare N unlocks N + 1, up to Nightmare 20 (`maxTier`). Progress is per player; the leader's unlocks decide what can be started (party members can join any run). How each level scales (time with the default 20 minutes per 7 rooms; mobs per wave get one more for every two players after the first):

  | Level | Rooms | Time (min) | Waves | Mobs per wave | Monster buffs | Elites / champion chance per wave | Affixes | Boss | Crowns / treasure | Room mix (as room allows) |
  |---|---|---|---|---|---|---|---|---|---|---|
  | Easy | 6-8 | 17-23 | 2 | 2-3 | none | 0 / 0% | 0 | x1.0 health | x1.00 / x1.0 | 1 puzzle |
  | Normal | 6-8 | 17-23 | 3 | 2-3 | none | 0 / 0% | 0 | x1.2 health | x1.25 / x1.1 | 1 puzzle, 1 trap |
  | Hard | 7-9 | 20-26 | 4 | 2-3 | Strength 1 | 1 / 0% | 0 | x1.4 health | x1.50 / x1.2 | 1 puzzle, 1 trap, shrine (75%), 1 elite |
  | Nightmare 1 | 7-9 | 20-25 | 4 | 3-4 | +4 health, Strength 1 | 1 / 14% | 1 | x1.6 health | x1.75 / x1.3 | as Hard, 1 side cache |
  | Nightmare 3 | 8-10 | 22-28 | 4 | 3-4 | +8 health, Strength 1, chainmail armor (31%) | 1 / 21% | 1 | x2.0 health | x2.25 / x1.5 | as above, 1 shaft, tall rooms 41% up to 14 high |
  | Nightmare 5 | 9-11 | 24-30 | 4 | 4-5 | +12 health, Strength 1, Speed 1, chainmail (38%) | 1 / 28% | 2 | x2.4 health, 2 adds every 20 s | x2.75 / x1.7 | tall rooms 45% up to 18 high |
  | Nightmare 6 | 9-12 | 24-32 | 5 | 4-5 | +12 health, Resistance 1, Strength 1, Speed 1, chainmail (41%) | 2 / 31% | 2 | x2.6, 2 adds | x3.00 / x1.8 | 2 puzzles, up to 20 high |
  | Nightmare 8 | 10-13 | 26-34 | 5 | 5-6 | +16 health, Resistance 1, Strength 2, Speed 1, iron (48%) | 2 / 38% | 2 | x3.0, 2 adds | x3.50 / x2.0 | 2 elite halls, up to 24 high |
  | Nightmare 10 | 10-13 | 26-33 | 5 | 6-7 | +20 health, Resistance 1, Strength 2, Speed 1, iron (55%) | 2 / 45% | 3 | x3.4, 3 adds | x4.00 / x2.2 | 2 traps, 2 side caches, up to 28 high, shafts without ladders |
  | Nightmare 12 | 11-14 | 28-35 | 6 | 6-7 | +24 health, Resistance 1, Strength 2, Speed 1, diamond (62%) | 3 / 52% | 3 | x3.8, 3 adds | x4.50 / x2.4 | up to 30 high |
  | Nightmare 15 | 12-16 | 29-39 | 6 | 7-8 | +32 health, Resistance 1, Strength 3, Speed 2, diamond (73%) | 3 / 63% | 4 | x4.4, 4 adds | x5.25 / x2.7 | 3 puzzles, 2 shafts |
  | Nightmare 17 | 13-17 | 31-40 | 7 | 8-9 | +36 health, Resistance 2, Strength 3, Speed 2, netherite (80%) | 3 / 70% | 4 | x4.8, 4 adds | x5.75 / x2.9 | 3 elite halls |
  | Nightmare 20 | 14-18 | 32-41 | 7 | 9-10 | +40 health, Resistance 2, Strength 3, Speed 2, netherite (90%) | 4 / 80% | 4 | x5.4, 5 adds | x6.50 / x3.2 | 3 puzzles, 2 traps, shrine, 3 elite, 2 shafts, 2 side caches, tall rooms 75% |

  Tiers in between follow the same steps. The grid grows from 3 by 3 to 5 by 5 cells for the bigger runs. Elite mobs (`Elite Zombie`) have extra health and Strength; champions (`Champion Skeleton`, or a named champion from the [Champions](#champions--elite_bp) pack) much more. Every dungeon mob has Fire Resistance. At most 18 dungeon mobs (`mobCap`) are alive at once.
- **Affixes** (Nightmare runs: 1 at tiers 1-4, 2 at 5-9, 3 at 10-14, 4 at 15-20, rolled by weight, never twice; plus a 15% chance of the Blessing). They're shown before you start, on a sign in the entry room, in chat and on the bar above the hotbar:

  | Affix | From tier | What it does |
  |---|---|---|
  | `Frenzied` | 1 | Mobs (and the boss) get Speed, one level more |
  | `Bulwark` | 1 | Mobs and the boss get one more level of Resistance |
  | `Swarming` | 1 | Half again as many mobs in every wave |
  | `Shrouded` | 1 | Darkness pulses over everyone in the dungeon every 20 seconds or so |
  | `Frozen` | 1 | Snowflake patches appear at your feet, then slow anyone standing in them for about 6 seconds |
  | `Hunger` | 1 | Hunger while fighting (stronger from tier 12) |
  | `Volcanic` | 3 | Flames flicker on the floor around you for 2 seconds, then fire bursts there (real fire on stone floors, put out after 4 seconds; on wooden floors only the burn) |
  | `Explosive Death` | 3 | A mob hisses when it dies and bursts a second later: damage within 3 blocks, no block damage |
  | `Backup` | 3 | A mob brought below half health calls one more mob, once |
  | `Vampiric` | 5 | Mobs heal half the damage they deal you |
  | `Thorned` | 5 | Hitting a mob in melee hurts you a little (1, 2 from tier 10) |
  | `Champion Packs` | 5 | Every wave brings a champion |
  | `Venomous` | 5 | Mob hits poison you (Wither from tier 15) |
  | `Arcane Beams` | 7 | A line of blue sparks crosses the room through you; 2 seconds later it burns anyone still on it |
  | `Lightning Storm` | 7 | Sparks circle your spot; 2 seconds later lightning strikes there (damage, no fire) |
  | `Blinding` | 10 | Bursts of blindness during fights |
  | `Juggernaut` | 10 | Mobs have far more health, the boss a third more |
  | `Blessing` | 1 (15% chance, extra) | Half again as much treasure and a quarter more Crowns |

- **Dungeons** (from `dungeons`; mobs join the pool from the level shown):

  | Dungeon | Mobs | Flyers in tall rooms | Boss (extra health) | Built of | Crowns |
  |---|---|---|---|---|---|
  | Crypt | zombies, skeletons; husks (Hard), zombie villagers (N1), wither skeletons (N5), witches (N8) | phantoms, vexes | `The Crypt Lord` (wither skeleton, +40) | deepslate bricks, soul lanterns, cobwebs | 40 |
  | Drowned Vault | drowned; zombies (Normal), bogged (N2), witches (N7) | phantoms | `The Tide Keeper` (drowned, +60) | prismarine, sea lanterns in the floor | 60 |
  | Frost Hollow | strays, skeletons; zombies (Normal), breezes (N6) | phantoms, breezes | `The Frost Archer` (stray, +80) | packed ice, snow, blue ice | 90 |
  | Nether Forge | magma cubes, blazes; wither skeletons (Hard), zoglins (N4) | blazes | `The Forge Heart` (blaze, +80) | polished blackstone, basalt, gilded blackstone, magma in the floor | 90 |
  | Sculk Depths | zombies, silverfish; endermites (Normal), husks (N1), bogged (N4) | phantoms, vexes | `The Listener` (bogged, +90) | deepslate tiles, sculk floor, soul lanterns | 100 |
  | Pillager Keep | pillagers, vindicators; witches (N1), evokers (N3), ravagers (N10) | vexes, phantoms | `The Warlord's Ravager` (ravager, +60) | stone bricks, spruce planks, dark oak | 70 |
  | Spider Nest | spiders, cave spiders; skeletons (Hard), bogged (N6), witches (N10) | phantoms | `The Brood Mother` (spider, +60) | mossy stone bricks, lots of cobwebs | 50 |
  | Ender Spire | endermen, endermites; skeletons (Hard), shulkers (N2) | phantoms, vexes | `The Starless Walker` (enderman, +100) | purpur, end stone bricks, end rods | 110 |

  Each dungeon has a line of lore on a sign in its entry room (`Where the town buried what it chose to forget.`). No wardens ever spawn. Cobwebs can be cut.
- **Rooms.** Every run starts with the entry room and ends with the boss room and the treasure room; in between come at least two combat rooms and the rest of the level's room mix, shuffled. Rooms are 15 by 15 blocks inside, 5 high (some 8 high from Hard), joined by corridors 3 wide.

  | Room | What happens | Done when |
  |---|---|---|
  | Entry | Signs: the dungeon and level, its lore, the affixes | (its door is open) |
  | Combat | Waves of the dungeon's mobs, with elites and maybe a champion; some rooms have cover pillars or a low ring wall; tall rooms have balconies with ladders where mobs spawn too, and flyers | Every mob of the last wave is dead |
  | Elite hall | One wave fewer, fewer mobs, one more elite each, and a champion every wave (`Elite guards wake in this hall...`) | Last wave dead |
  | Puzzle | One of nine puzzles (below) | Solved |
  | Trap hall | The exit is open at once; flame patches telegraphed by flickering flames, arrow volleys from the side walls telegraphed by sparks | Someone reaches the far door |
  | Shrine | Three buttons: the Blessing (Vigor: extra hearts, Swiftness, Ward: Resistance, Haste: Haste and Strength, or Fortune: a quarter more treasure), a curse (one more affix for the rest of the run; treasure x1.4 and Crowns x1.25), or pass by. The effects last until the run ends or you leave it | Someone presses a button |
  | Shaft (N3+) | 17 to 30 blocks high; the exit is in the wall near the top, over a landing. Ledges climb the walls to it (1 block apart, 2 from tier 8), a ladder too below tier 10; flyers harass you. Over the exit, a chute drops into a pool, so the fall never hurts | Someone stands on the landing |
  | Side cache (N1+) | An open doorway off a room leads to a puzzle; solving it puts a chest with extra loot in the side room | Optional |
  | Boss | The boss, with its name as a title. From Normal it calls its guards once at half health; from N5 it calls adds every 20 seconds. Tall arenas (N3+) have balconies on several levels | The boss dies |
  | Treasure | The treasure chest (two from N6) | (open after the boss) |

- **Puzzles** (each run picks different kinds where it can; signs and chat explain each one, and none can get stuck):

  | Puzzle | From | How it works |
  |---|---|---|
  | Lever logic | Easy | Four levers on red, blue, yellow and green wool; clue signs like `2 levers are on` and `RED and GREEN differ` always fit exactly one setting (at least one lever on). Pulling a lever shows all four above the hotbar |
  | Memory | Easy | The game flashes the four colored pillars in a sequence (3 long on Easy up to 8 at Nightmare 20, never one color twice in a row) with notes; press the buttons on top in the same order. A wrong press replays it; the gold button shows it again |
  | Color riddle | Easy | Four pillars of wool with a button each; each press changes the color (red, blue, yellow, green, white, black). The sign in front of each says `is the color of lapis lazuli`: match them all |
  | Riddle | Easy | A riddle on the signs and in chat, and 3 answer buttons (4 from N4) labeled by signs. A wrong answer locks the buttons for 6 seconds and spawns mobs |
  | Lights out | Easy | A 3 by 3 panel of lamps with a button on each; a button flips its lamp and the ones next to it. Light all nine (every start can be solved) |
  | Safe path | Normal | A 4 by 4 grid of pressure plates (5 by 5 from N6). The safe path flashes plate by plate; step on its plates in order from the near row to the far row. A wrong plate starts you over (and stings a little in Nightmare runs); the gold button shows the path again |
  | Target practice | Normal | 3 to 7 target blocks set in the walls, some high up. Hit each with an arrow, snowball or trident; everyone is given 16 snowballs, and anyone in the room who runs out (or comes in late) gets 16 more within a few seconds |
  | Button rush | Normal | 4 to 8 buttons around the walls: press them all within a time limit from the first press (about 3 seconds per button, a little less at high tiers), or they reset |
  | Climb | Normal | A tall room: jump up ledges along the walls to a button at the top (8 to 24 blocks up). Fall and you start again; or pillar up with your own blocks where building is allowed |

- **Building** (from Nightmare 1, `buildFromTier`, while `allowBuilding` is on): blocks you place in the dungeon stay, so you can pillar up a shaft, bridge between balconies or wall yourself in, and you can break your own blocks again (also sand or gravel that fell, or a block an enderman moved, as long as it's a kind someone placed this run and not one the dungeon is built of). They're removed when the dungeon is filled in (they're used up). Containers, TNT, beds, respawn anchors and pistons still pop straight back out, so nothing is lost, blown up or pushed through the bars. In every run, lava, powder snow and empty buckets can't be used in a dungeon (`That bucket can't be used in the dungeon.`), so nobody scoops the pool under a shaft's chute; water buckets can. On Easy, Normal and Hard every block you place pops back out (`Blocks placed in the dungeon pop back out.`). The dungeon's own blocks can never be broken (`The dungeon's blocks can't be broken.`), except cobwebs; explosions never break them either. Operators in creative mode can do both.
- **Finishing:** the title `Expedition complete` with `Crypt Nightmare 5 cleared in 6:12`, chat to everyone `Ann, Bob cleared the Crypt (Nightmare 5) in 6:12.`, and `A new record!` or your place when you made that difficulty's leaderboard. Each player still in the dungeon gets the dungeon's Crowns times the level (x1 on Easy up to x6.5 on Nightmare 20; x1.25 more with the Blessing, x1.25 with a shrine curse), Warden reputation (`rep`, plus 10% per tier), the Journal page `expedition_<dungeon>` under Places, a relic by chance (`relicChance` plus 1% per tier, at most 50%), counts as a finished quest of kind `expedition` for other packs, and unlocks the next tier (`Nightmare 6 is unlocked!`). The treasure chests hold the dungeon's `loot` plus `tierLoot` from the tier on, scaled by the level (x1 to x3.2), a quarter more per extra player, half again with the Blessing.
- **Nightmare Sigils:** a boss in a Hard or Nightmare run drops one 35% of the time plus 1% per tier (`sigilChanceBoss`), a champion in a Nightmare run 8% of the time (`sigilChanceChampion`). It's an echo shard (`sigilItem`) named `Nightmare Sigil` whose lore lists the dungeon, the tier (usually the run's tier or one above, sometimes one below) and the affixes. Using it (or **Use a Nightmare Sigil**) shows the run's preview with **Start (uses the sigil)**.
- **The time limit:** a run not finished in time fails: `Time's up! The Crypt wasn't cleared within 24 minutes.` Everyone is sent back, and the run is listed as failed in the history.
- **Leaving:** `/realm:expedition_leave`, dying, leaving the game, or getting out of the dungeon any other way (a teleport, for example; you're out after 5 seconds outside it) all take you out of the run. Nobody can join a run after it starts. When the last player is out, the run fails and the dungeon is filled in. Anyone who leaves the game during a run is sent back to where they started when they next join.
- **Death:** your items drop in the dungeon as usual, are collected right away and given back after you respawn (`returnItemsOnDeath`). They're kept in memory until then, so respawn before the server restarts (a Realm closes a while after the last player leaves), or they're lost. Experience is lost as usual.
- **Above the hotbar** every second during a run: the dungeon and level, the clock and limit, the current step, and the affixes on a second line. With the [Coordinates HUD](#coordinates-hud--hud_bp) on, the HUD steps aside (the pack sends `realm:actionbar`). The run line waits while a note holds the bar (a puzzle's count, another pack's skill XP or mob health), so notes stay readable.

### Commands

| Command | Who | What it does |
|---|---|---|
| `/realm:expedition` | Everyone | The Expeditions menu: start an expedition (dungeon, difficulty or Nightmare tier, affix preview and reroll), use a Nightmare Sigil, leaderboards (fastest clears per dungeon and difficulty, highest tiers, recent runs), your progress, go back to where you started. During a run: how it's going, the affixes, and leave it. Operators also get **Operator tools** (set the site, reset, create a sigil, unlock every tier) |
| `/realm:expedition_leave` | Everyone | Leave your expedition and go back to where you started it |
| `/realm:expedition_site [x] [z]` | Operators | Sets where dungeons are built: where you stand, or at x z. Refused within 114 blocks of world spawn (default 64, `avoidSpawn`, plus half the biggest dungeon) or where anything but natural underground blocks is in the way of the biggest dungeon, with what and where |
| `/realm:expedition_reset` | Operators | Ends every expedition in progress (players are sent back) and fills the dungeons back in |

### Configuration (`scripts/config.js` → `CONFIG`)

| Option | Default | Description |
|---|---|---|
| `enabled` | `true` | New expeditions can start. Disabled: the menu only shows the leaderboards; a run in progress still finishes |
| `depth` | `-40` | Floor height of the dungeon; it fills from 1 block below to 2 above its tallest room (y -41 to -33 for a run without tall rooms, up to y -8). Kept between -58 and -20 |
| `avoidSpawn` | `64` | The site's nearest dungeon edge must be at least this far from world spawn (flat distance), so a dungeon is never dug under the spawn town |
| `slots` | `1` | Expeditions that can run at the same time (1 to 3), each in its own dungeon: the first at the site, each next one `slotSpacing` blocks east |
| `slotSpacing` | `128` | Blocks between those dungeons (at least 112) |
| `maxParty` | `4` | Most players in one expedition, the leader included (1 to 4) |
| `partyRadius` | `32` | Party members within this many blocks of the leader are asked along |
| `confirmSeconds` | `20` | Seconds party members have to answer; no answer is a no |
| `timeLimitMinutes` | `20` | Minutes for a 7-room run: each run gets this much per 7 rooms, 1% less per Nightmare tier, at least 5 minutes |
| `exitSeconds` | `30` | Seconds after the boss falls before everyone is sent back, to collect the treasure |
| `returnItemsOnDeath` | `true` | Items dropped dying in a dungeon are given back after respawning (otherwise they'd be lost when the dungeon is filled in) |
| `leaderboardSize` | `10` | Fastest clears kept on each leaderboard (one per dungeon and difficulty or tier) |
| `tierBoardSize` | `20` | Players kept on the Highest tiers board |
| `historySize` | `20` | Runs kept in the world's run history and in each player's |
| `maxTier` | `20` | Highest Nightmare tier (1 to 20) |
| `tallFromTier` | `3` | From this Nightmare tier, rooms can be tall (14 to 30 blocks) with balconies, and shafts appear |
| `buildFromTier` | `1` | Players may place blocks in a dungeon from this Nightmare tier |
| `allowBuilding` | `true` | Players may place blocks at all (see `buildFromTier`). Disabled: blocks placed in a dungeon always pop back out |
| `useChampionsPack` | `true` | Champions in waves come from the Champions pack when it's installed and knows the mob (zombie, husk, drowned, zombie villager, skeleton, stray, spider, witch); otherwise, or when disabled, the pack makes its own |
| `mobCap` | `18` | Most dungeon mobs alive in one run at a time: waves, adds and reinforcements stop there |
| `rerollCost` | `25` | Crowns to reroll the affixes shown before a Nightmare run (0: free) |
| `sigilItem` | `"minecraft:echo_shard"` | The item a Nightmare Sigil is |
| `sigilChanceBoss` | `0.35` | Chance a boss of a Hard or Nightmare run drops a sigil, plus 1% per tier |
| `sigilChanceChampion` | `0.08` | Chance a champion in a Nightmare run drops a sigil |
| `rep` | `15` | Warden reputation (Guilds) for each player who finishes, plus 10% per Nightmare tier |
| `relicChance` | `0.1` | Chance (0 to 1) that each player who finishes also gets a relic (Relics pack), plus 1% per tier, at most 50% |
| `relics` | `lantern_deep`, `miners_lamp`, `compass_echoes`, `frost_band`, `tide_boots` | The relics a finished run can give, one at random |
| `tierLoot` | diamonds (N1), emeralds (N3), golden apples (N5), netherite scrap (N8), a totem (N10, 20%), an enchanted golden apple (N12, 15%), a netherite ingot (N15, 25%), an elytra (N18, 5%) | Extra treasure from a Nightmare tier on: `{ from, item, min, max, chance }`, added to the dungeon's `loot` (half chance in side caches) |
| `dungeons` | the eight above | The dungeons: `{ id, name, lore, difficulty, mobs, flyers, boss: { mob, name, health, adds }, wall, floor, accent, trim, light, door, decor: { block, count, floor, breakable }, crowns, loot: [{ item, min, max, chance }] }`. `mobs` entries are an id or `{ id, from, weight }` (`from` is the first level: 0 Easy, 1 Normal, 2 Hard, 3 to 22 Nightmare 1 to 20). `difficulty` (1 to 3) is the difficulty the dungeon had before tiers: its old fastest clears were moved there. `health` is extra boss health in points (times the level and party); `adds` are what the boss calls. `accent` is the corner pillars, `trim` the balconies and ledges, `light` the lanterns, `door` the bars, `decor` a block scattered in combat rooms. Keep each `id`: the leaderboards and Journal entries use it |

Default treasure (`loot`, each with its chance): **Crypt** 4–10 iron ingots, 2–6 gold ingots (80%), 4–12 bones, 1–2 diamonds (40%), a golden apple (40%), 4–10 bottles o' enchanting (80%), a name tag (25%). **Drowned Vault** 8–16 prismarine shards, 4–10 prismarine crystals (80%), 4–10 gold ingots, 1–3 diamonds (60%), 1–2 nautilus shells (50%), a heart of the sea (10%), 6–12 bottles o' enchanting (80%). **Frost Hollow** 2–5 diamonds, 4–12 emeralds, 1–3 golden apples (70%), an enchanted golden apple (5%), 8–16 blue ice (60%), 8–16 bottles o' enchanting. **Nether Forge** 6–14 gold ingots, 2–6 blaze rods (90%), 8–16 quartz (80%), 1–3 diamonds (60%), netherite scrap (15%), 8–14 bottles o' enchanting. **Sculk Depths** 1–3 echo shards (60%), 6–14 amethyst shards, 2–4 diamonds (80%), 1–3 disc fragments (30%), 10–18 bottles o' enchanting. **Pillager Keep** 6–16 emeralds, 6–12 iron ingots, a crossbow (50%), a totem of undying (15%), 1–3 diamonds (50%), 6–12 bottles o' enchanting (80%). **Spider Nest** 8–20 string, 2–6 spider eyes (80%), 4–10 iron ingots, 1–2 diamonds (40%), 1–2 golden apples (40%), 4–10 bottles o' enchanting (80%). **Ender Spire** 4–10 ender pearls, 1–2 shulker shells (40%), 2–4 diamonds (80%), 6–14 chorus fruit (80%), 10–18 bottles o' enchanting.

Operators can change `enabled`, `slots`, `maxParty`, `timeLimitMinutes`, `exitSeconds`, `returnItemsOnDeath`, `relicChance`, `maxTier`, `allowBuilding`, `useChampionsPack`, `mobCap`, `rerollCost`, `sigilChanceBoss` and `sigilChanceChampion` in game with `/realm:config`. The rest stay in `config.js`.

### Saved data

| Key | Scope | Contents |
|---|---|---|
| `expedition:site` | World | JSON `{ x, z, by, at }`: the site an operator set |
| `expedition:run:<slot>` | World | JSON `{ id, slot, dungeon, seed, x, y, z, leader, phase, l, g, c, h, pt }` while a dungeon exists in that slot (`l` level, `g`/`c`/`h` the box's grid, cell size and height, `pt` block types players placed), so one cut short by a restart is filled in when the world starts again. Records from before tiers (without `g`, `c`, `h`) are read as the old 48 by 48 by 9 box |
| `expedition:next` | World | The next run's number |
| `expedition:best:<dungeon id>` | World | JSON `{ <level>: [{ t, n, at, a }] }`: the fastest clears per level (`e`, `n`, `h`, `t1` to `t20`): milliseconds, the players' names, when, the affixes |
| `expedition:best` | World | The fastest clears from before tiers (`{ <dungeon id>: [{ t, n, at }] }`). Copied once into `expedition:best:<id>` at the dungeon's old difficulty, then only kept |
| `expedition:best_v2` | World | `1` once that copy was made |
| `expedition:tiers` | World | JSON `[{ id, n, l, d, at }]`: the highest level each player cleared (the Highest tiers board) |
| `expedition:history` | World | JSON `[{ d, l, ok, t, n, at, a }]`: the latest runs, cleared or failed, newest first |
| `expedition:return` | Player | JSON `{ d, x, y, z, run }`: where to send the player back to, while they're on a run (or until they rejoin after one) |
| `expedition:prog` | Player | JSON `{ u, b, c, r }`: the highest Nightmare tier unlocked, the highest level cleared, clears, the player's recent runs |
| `expedition:rolls` | Player | JSON `{ <level>: [affix ids] }`: the affixes shown for each Nightmare level, kept until that run starts or they're rerolled (so reopening the menu doesn't reroll) |
| `expedition:cfg` | World | Settings changed in `/realm:config` |
| `realm:exp_mob`, `realm:exp_run:<id>`, `realm:exp_champ`, `realm:exp_called`, `realm:exp_ch_<id>`, `realm:bounty:exp_<id>` | Entity tags | On the dungeon's mobs (champions, mobs that called for help, champions asked of the Champions pack; the last one on the boss only). Leftovers are removed when the world starts |
| `realm_exp_<slot>` | Ticking area | Keeps the dungeon loaded while it's built, played and filled in; removed afterward |

Runs themselves are kept in memory: a restart ends a run in progress (its players are sent back when they join, and the dungeon is filled in); after a script reload, players still online are sent back at once. A player is only taken off their return spot once the teleport back worked, so one who can't be moved right then (dead, say) is sent back when they next spawn. Shrine effects are taken away when a player leaves the run.

### How it works

- **Never near builds:** the dungeon is a sealed box of 3 by 3 to 5 by 5 cells of 20 blocks (60 to 100 blocks wide) and 9 to 34 high, deep underground. Before every run the box is checked with `Dimension.containsBlock`, a column at a time, for any block that isn't natural (stone, deepslate, tuff, granite, diorite, andesite, ores, raw ore blocks, dirt, gravel, clay, water, lava, obsidian, magma, amethyst geodes, dripstone, lush cave plants, sculk), and the run is called off if there is one (operators are told what and where). `/realm:expedition_site` runs the same check over the biggest possible dungeon where it can. While building, every fill only touches a volume that holds nothing but natural blocks, air and the dungeon's own (such a volume is filled whole; any other is filled through a filter that replaces only natural and dungeon blocks). The site must also be far from world spawn (`avoidSpawn`).
- **Building:** a ticking area keeps the box loaded. Once its chunks can be read and the box is found clean, anyone in it, dropped items and named or tamed animals are moved to the surface, then the whole box is filled with deepslate (sealing any caves), and the rooms, floors, corner pillars, ceiling lanterns, corridors (with a chute and pool under a shaft's high exit), closed bars, balconies, ladders, ledges, puzzles, signs and decor are placed. The work runs as a `system.runJob` job, one column or room per step, so the server never stalls (a Nightmare 20 dungeon builds in about a second). The layout follows from the seed and level alone (`scripts/layout.js`, which has no game code, so it's checked in Node across thousands of seeds and every level: rooms fit the box, paths connect, every door stays clear, ledges can be climbed, every puzzle has an answer).
- **Filling in:** after the run (or when it fails or an operator resets it) the chests in the box are emptied, the dungeon's mobs and dropped items are removed, anything else in the box (a pet) is moved to the surface, any player is sent back to where they started their expedition (or to the surface), and the whole box is filled with deepslate again: the box held only natural blocks before the run and stayed sealed, so everything in it came from the run, including the blocks players placed and whatever came of them (cobblestone where water met lava, concrete, frosted ice). Nothing is left behind that would call off the next run there. The ticking area is removed. If the box can't be loaded, it's tried again after a restart or with `/realm:expedition_reset`, and no new run starts there until then; its blocks still can't be broken meanwhile. A box is only ever filled in after the check before its run found it clean.
- **The run** is checked twice a second: who is in which room, wave mobs left (mobs that leave the dungeon are removed; a wave mob or the boss that ends up somewhere else in it, like an enderman that teleported into a room behind the bars, is brought back once it has been away from the room, and from everyone, for 3 seconds), the boss (an `entityDie` for it finishes the run), goal spots of trap halls and shafts, side rooms, the button rush clock, affix hazards (warned with particles for 1.5 to 2 seconds before they hit), the time limit, and players who left. Buttons, pressure plates, target blocks, projectiles and levers are read from `afterEvents.buttonPush`, `pressurePlatePush`, `targetBlockHit`, `projectileHitBlock` and `leverAction`; puzzle buttons pop back up at once so the same one can be pressed again. Vampiric, Venomous, Thorned and Backup work through `entityHurt`. Explosions inside a dungeon are kept from breaking blocks (`beforeEvents.explosion`).
- **Party members** are players with the same `realm_party:<code>` tag as the leader ([Parties](#parties--party_bp)), online, in the same dimension and within `partyRadius`.
- **Messages sent:** `realm:quest_done` `{ player, pack: "expedition_bp", id: "expedition_<dungeon>", label, kind: "expedition", guild: "wardens" }`, `realm:rep_add` `{ guild: "wardens" }`, `realm:journal` `{ page: "places", entry: "expedition_<dungeon>" }` and, by chance, `realm:relic_give`, for each player who finishes. Champions are asked of the Champions pack with `realm:champion_spawn` `{ dim, x, y, z, mob, tag: "realm:exp_ch_<run>" }`; if none with that tag appears within 3 ticks (the pack isn't installed), the pack makes its own. Crowns go straight into the `crowns` scoreboard.
- **For tests:** the script event `realm:expedition_debug` (`{ room? }`) is answered with `realm:expedition_state` (`{ part, parts, data }`): the first run's state and one room's layout and puzzle, used by the BDS scenario that plays whole runs.

---

## Town Projects — `town_bp`

Grow the realm's towns together. Operators add a town; its mayor (Mayor Bram from [Townsfolk](#townsfolk--npc_bp), or any NPC with the `mayor` role) takes deliveries of materials for the town's projects: a well and a notice board, then lamp posts and a garden plot, a market stall and a dock, and finally a bell tower. When a project has everything it needs, it is built on the spot the operators chose, fireworks go up and the top contributors are paid in [Crowns](#crowns--crowns_bp). Finishing every project of a level raises the town: Settlement, Village, Town, City and Capital. This is separate from [Community Goals](#community-goals--goals_bp), which collect one item into a chest: town projects take several items, are delivered through the mayor, and build something.

### How to use

1. Find your town's mayor, tap them and pick **Town projects (Riverside)**. You see the town's level and this level's projects with progress bars.
2. Pick a project to see what it needs (`Oak Planks: 32 / 64 (you carry 20)`) and who has helped, then tap **Deliver what I have**. It takes what you carry of the needed items, up to what's still needed: partial deliveries count. Chat says `You delivered 20 Oak Planks, 4 Iron Ingot for Riverside's Dock. Now 52 percent.`
3. When the last item is in, everyone hears `Riverside finished its Dock! Top contributors: Ann 64, Bob 32. Thank you, everyone!`, the dock is built where the operators chose and fireworks rise over it. The top three contributors get 60, 35 and 20 Crowns, and everyone who helped gets reputation in [Guilds & Reputation](#guilds--reputation--guilds_bp) (if you're offline, it's waiting when you join).
4. When every project of a level is finished, the town levels up: `Riverside is now a Town (level 3)` on everyone's screen, with the new projects.
5. Run `/realm:town` anywhere for the town menu: **Town info** (the nearest town's level, projects, progress and contributors; also `/realm:town_stats`), **Projects** (what each still needs) and **Other towns**.
6. **Operators:** stand in the middle of a town, open `/realm:town` and pick **Add a town here** (or run `/realm:town_add Riverside`, quotes for a name with spaces). Then, for each project, stand where it should be built, facing the way it should face, and pick **Set a project spot** and the project (or run `/realm:town_spot <project>`: `well`, `notice_board`, `lamps`, `garden`, `stall`, `dock`, `bell_tower`). Its outline appears in green particles, with a blue arrow for its front: pick **Set spot here**, **Rotate 90**, **Look around** (10 seconds to walk around it) or **Cancel**. A project finished before it has a spot waits, and operators are reminded when they join.
7. **Operators:** **Manage spots** in `/realm:town` removes a spot (a built project is taken away and the ground put back), rebuilds a damaged build, or relocates it (preview at the new place, then it's taken away from the old one and built at the new one). **Protect from world events** (Enabled for new towns) keeps meteors, tornadoes and storms from breaking blocks in the town. **Remove town** (or `/realm:town_remove`) removes the town you're in. `/realm:config` → **Town Projects** sets the town radius, announcements and more.

### What players see

- **Levels** (`levelNames`): 1 Settlement, 2 Village, 3 Town, 4 City, 5 Capital. A new town is a Settlement. Only the projects of the town's current level take deliveries.
- **Projects** (from `projects`):

  | Level | Project | Needs | Built |
  |---|---|---|---|
  | 1 | Well | 64 cobblestone, 8 oak logs, 1 bucket | A 5 by 5 cobblestone well set into the ground, with water, fence posts and an oak slab roof |
  | 1 | Notice Board | 32 oak planks, 3 oak signs | A planked board between two log posts, with three signs: the town's name and level, projects done, and its top three contributors (kept up to date) |
  | 2 | Lamp Posts | 16 oak fences, 4 lanterns | Four fence posts with lanterns, 4 blocks apart in a row ahead of the spot |
  | 2 | Garden Plot | 16 oak logs, 16 wheat seeds, 16 bone meal | A 5 by 5 plot edged with logs: farmland planted with wheat, carrots, potatoes and beetroot around a water block with a lily pad |
  | 3 | Market Stall | 32 oak planks, 8 white wool, 8 red wool, 2 barrels | A counter and two barrels under a striped red and white wool roof on fence posts |
  | 3 | Dock | 64 oak planks, 32 oak logs, 16 iron ingots | A plank deck 3 wide reaching 10 blocks out over the water, on log posts down to the bottom, with fence rails and two lanterns at the end |
  | 4 | Bell Tower | 128 stone bricks, 16 gold ingots, 16 iron ingots | A stone brick tower 3 by 3 and 8 high with a bell hanging under its roof and a lightning rod on top |

- **Delivering** takes the needed items from anywhere in your inventory, never more than still needed. Locked items stay, and so do items with lore (Storm Glass, Relic Shards, relics and other special items) and items with a custom name (`keepNamedItems`). Items are used up by the project, not stored in a chest.
- **The mayor:** an NPC with the `mayor` role (`npcRole`) offers **Town projects (Riverside)** for the nearest town within 96 blocks (`townRadius`) of the player; with no town that close, the mayor doesn't offer it. With `deliverWithCommand` enabled, `/realm:town` also takes deliveries while you're within a town's radius.
- **Building:** every build starts at the spot where the operator stood and goes forward the way they faced. Builds only replace air, plants (grass, flowers, ferns, snow layers, bushes, mushrooms, vines), and for the well's water and the garden's farmland the grass or dirt they sit in, and for the dock, water. Anything else in the way (a build, a path, stone) is left alone and that block of the project is skipped; operators are told how many. Water (the well's and the garden's) goes in last and only where blocks or more of its water hold it in on every side and below, so it never spills onto anything nearby; a lily pad only goes on that water. A project is built all at once: while any part of it is in a chunk that isn't loaded, it waits, and it's built as soon as a player comes within 64 blocks of its spot with all of it loaded. Chat says `Riverside's new Dock is built at 120, 63, -45.`
- **Structures instead:** a project with a `structure` id places that structure (saved by an operator with a structure block or `/structure save`) with its corner at the spot, turned to the way the operator faced (saved facing south), instead of the built-in design. It's placed as saved, replacing what's there. Without such a structure in the world, the built-in design is used.
- **Rewards** for each finished project: Crowns for the top contributors (`topCrowns`: 60, 35, 20), shown as `+60 Crowns (Dock, Riverside)`; for every contributor, `repPerProject` (10) reputation to the Growers when the project is mostly wood, crops and wool, or the Miners when it's mostly stone and metal, plus a finished quest of kind `town` for other packs. Contributors who are offline get theirs when they next join (`Town projects you helped with were finished while you were away. Thank you!`).
- **Announcements** (`announce`): finished projects, builds and level-ups go to everyone in chat, with fireworks (`fireworks`) and a title for level-ups. Disabled: only the contributors and the operators hear about it, and only players in the town see the level-up title.
- **The menu:** `/realm:town` says which town you're in (or the nearest one and how far), then has a button for everything you may do: **Town info**, **Projects** (each open project with its percent; pick one for what it needs, and **Deliver what I have** where `deliverWithCommand` allows it) and **Other towns**. Operators also see, inside a town, **Set a project spot**, **Manage spots** (when the town has spots), **Protect from world events** with its state, and **Remove town**; outside one, **Add a town here** (a name field).
- **Spot preview** (operators): the project's outline, the exact blocks it covers when built at the spot, is drawn in green particles (only you see them) at where you stood, facing the way you faced to the nearest quarter turn, with a blue arrow on the ground from the spot pointing at the build's front. It's redrawn twice a second for 30 seconds after each answer; with no answer by then it closes and nothing changes (`The spot preview timed out. Nothing was changed.`). The form says the size (`5 by 5 blocks, 6 high`) and how many blocks would be left out because something is in the way. **Rotate 90** turns it a quarter to the right; **Look around** closes the form for 10 seconds so you can walk around the outline, then asks again. The outline comes from the build's own blocks (a saved `structure`'s size for a project with one), so it's always the real size: a well 5 by 5 and 6 high, the lamps 1 by 13, a dock 3 by 10 and 11 deep.
- **Removing, rebuilding and moving** (operators, **Manage spots**): just before a project is first built at a spot, the blocks its outline covers are saved in the world as a structure. **Remove spot** forgets an unbuilt project's spot, or takes a built one away and puts the saved ground back block by block (blocks added inside its outline since then stay, and a chest keeps its items, unless they are of a kind the build is made of); the project stays finished and waits for a new spot. **Rebuild** puts the saved ground back and builds it again, fresh. **Relocate** previews a new spot where you stand; on **Set spot here** the build is taken away from the old spot and built at the new one. Setting a spot for a built project (from the menu or `/realm:town_spot`) moves it the same way. Each asks first. Projects built before this version have no saved ground: the form warns about it, removing or moving clears only the build's own blocks that are still there (ground blocks become grass, a dock's posts water, the rest air), and **Rebuild** puts back the missing blocks.
- **Protect from world events** (operators, per town, default Enabled): world events (meteors, tornadoes, storms and the like) still happen within the town radius (96 blocks, `townRadius`), but packs that support safe zones don't break or place blocks there. Disabled, they can.

### Commands

| Command | Who | What it does |
|---|---|---|
| `/realm:town` | Everyone | The town menu: town info, projects, other towns, and for operators, add a town, set a project spot with a preview, manage spots (remove, rebuild, relocate), protect from world events (default Enabled) and remove the town |
| `/realm:town_stats` | Everyone | The nearest town's level, its projects with progress bars, what each still needs and who has helped. Delivering is at the town's mayor (or here, inside a town, with `deliverWithCommand`, default off) |
| `/realm:town_add <name>` | Operators | Adds a town centered where you stand. Towns must be at least 48 blocks apart (half of default 96, `townRadius`) |
| `/realm:town_spot <project>` | Operators | Shows the project's outline where you stand, facing the way you face, in the town you're in (within 96 blocks of its center, default, `townRadius`), and asks to set the spot there, rotate it or cancel. Builds it right away if it's already finished; a built project is moved there (the ground at the old spot is put back) |
| `/realm:town_remove` | Operators | Removes the town you're in and its project progress, after asking. What's built stays standing |

### Configuration (`scripts/config.js` → `CONFIG`)

| Option | Default | Description |
|---|---|---|
| `announce` | `true` | Finished projects, builds and level-ups are announced to everyone in chat, with a title for a level-up |
| `fireworks` | `true` | Fireworks rise over a project when it's built |
| `deliverWithCommand` | `false` | `/realm:town` also takes deliveries while you're within a town's radius, without the mayor |
| `keepNamedItems` | `true` | Items with a custom name are never delivered |
| `townRadius` | `96` | How close to a town's center (blocks) its mayor answers and `/realm:town_spot`, `/realm:town_remove` and `deliverWithCommand` work. New towns must be at least half this far apart |
| `npcRole` | `"mayor"` | The townsfolk role that offers **Town projects** |
| `repPerProject` | `10` | Guild reputation for each contributor when a project is finished (Growers or Miners, by its materials) |
| `topCrowns` | `[60, 35, 20]` | Crowns for the first, second, third... contributor of each finished project |
| `levelNames` | Settlement, Village, Town, City, Capital | What a town is called at levels 1 to 5 |
| `projects` | 7 projects (above) | `{ id, name, level, needs: { <item id>: amount }, build, structure? }`. `level` 1 to 4 (finishing all of a level raises the town; a level without projects is skipped); `build` is `well`, `lamps`, `stall`, `bell_tower`, `dock`, `garden` or `notice_board`; `structure` is an optional saved structure to place instead. Keep each `id` (lowercase letters, digits, `_`): progress and spots are saved by it, and `/realm:town_spot` lists them |

Operators can change `announce`, `fireworks`, `deliverWithCommand`, `keepNamedItems`, `townRadius` and `repPerProject` in game with `/realm:config`. The rest stay in `config.js` (the project list is read when the world starts).

### Saved data

| Key | Scope | Contents |
|---|---|---|
| `town:t:<town>` | World | JSON `{ id, n, dim, x, y, z, lvl, spots, by, at, prot? }`: the town's name, center, level, `prot: 0` when **Protect from world events** is Disabled, and each project's build spot `{ x, y, z, f, snap?, b?, old? }` (`f`: 0 south, 1 west, 2 north, 3 east; `snap: 1` once the ground was saved, `b` the box it covers `[x1, y1, z1, x2, y2, z2]`; `old: 1` for a project built before snapshots, rebuilt in place) |
| Structure `town:<town>__<project>` | World | The blocks a project's outline covered just before it was built (no entities), put back when it's removed, rebuilt or moved, and deleted after a removal or move or with the town |
| `town:p:<town>:<project>` | World | JSON `{ got, c, done, built }`: items delivered, contributors `{ <player id>: [name, amount] }`, finished and built. Past about 30,000 characters the smallest contributors are dropped |
| `town:owed` | World | JSON `{ <player id>: { cr, q } }`: Crowns and finished projects (the latest 10 each) waiting for contributors who were offline |
| `town:cfg` | World | Settings changed in `/realm:config` |

### How it works

- **The mayor** is an offer in the [Townsfolk](#townsfolk--npc_bp) offer round: the pack answers `realm:npc_talk` for NPCs with the `npcRole` role with `realm:npc_offer` (key `town:<town id>`, order 30) and opens the town's menu on `realm:npc_choose`.
- **Builds** are placed block by block in code (no structure files needed), each block only after checking what's there. Spots that aren't loaded are checked every 5 seconds against where players are, and built when one is within 64 blocks. Fireworks are `minecraft:fireworks_rocket` entities.
- **Messages sent** to each contributor of a finished project: `realm:quest_done` `{ player, pack: "town_bp", id: "town_<town>_<project>", label, kind: "town", guild }` and `realm:rep_add` `{ player, guild, amount: repPerProject }`, with `guild` `growers` or `miners`. Crowns go straight into the `crowns` scoreboard.
- **Snapshots** use `world.structureManager.createFromWorld` (saved to the world) right before the first build at a spot, and `Structure.getBlockPermutation` to put the ground back block by block, only where the block now is air, liquid, of a kind the build is made of, and not already the saved one. The outline is the min and max of the design's block offsets, turned to the spot's facing (or a saved structure's size, with x and z swapped for a quarter turn).
- **Safe zones:** every town with **Protect from world events** Enabled is sent as `realm:zones` `{ src: "town", part, parts, zones: [{ id, name, dim, x, z, r, shape: "circle" }] }` (`r` = `townRadius`, `part` from 1, split under 2,048 characters; an empty list has `parts: 0`) when a town is added, removed or toggled, when `townRadius` changes, 5 seconds after the world loads, and in reply to `realm:zones_ping`.
- **Scenario tests:** `/scriptevent realm:town_test {"action": ...}` runs the operator actions without forms (`add`, `spot` with an optional `spot: { x, y, z, f }`, `finish`, `remove`, `rebuild`, `protect`, `zones`, `dump`), for the test harness. It's only honored from the server console or an operator.
- **Not Community Goals:** [Community Goals](#community-goals--goals_bp) is a realm-wide donation chest for one item; Town Projects belong to a town, need several items, go through the mayor and build something. They don't share data.

---

## Safe Zones — `zones_bp`

Mark your base, a town square or a farm as a **safe zone**, and world events leave it alone: meteors don't make craters there, storm lightning doesn't strike (so it can't start fires), tornadoes can be set to calm down or steer around it, and Blood Moon creepers don't spawn in it. The events still happen, and you still see the meteor streak across the sky; they just break no blocks inside. Towns ([Town Projects](#town-projects--town_bp)) and land claims ([Land Claims](#land-claims--claims_bp)) can be safe zones too, and the world-event packs treat them all the same.

### How to use

1. Run `/realm:zones`. The top of the menu says whether the spot you're standing on is protected, and by what (`Where you stand: protected by Home (Safe zone).`).
2. **Safe zones** lists every zone made with this pack, nearest first, with its center, radius and how far it is from you. Pick one and **Show outline**: green sparkles trace its edge around you for 20 seconds (`previewSeconds`), and the bar above the hotbar says whether you're inside and how far the edge is.
3. **Towns and claims** lists the protected areas other packs share (towns with **Protect from world events**, claims while **Protect claims from world events** is on), read only, with their source; **Show outline** works for them too. **Show nearby outlines** traces every zone whose edge is within 64 blocks of you.
4. **Operators:** stand in the middle of the place and pick **Add a safe zone here**. Type a name (up to 24 characters) and set the radius with the slider: 8 to 512 blocks in steps of 8 (starting at 64, `defaultRadius`; at most `maxRadius`). Pick **Preview**: white sparkles outline the circle around you, and after a few seconds a menu asks **Create it**, **Look again**, **Change name or size** or **Cancel** (closed it? `/realm:zones` shows **Create Home** at the top until you decide). A zone reaches from the bottom of the world to the top.
5. **Operators:** pick a zone in **Safe zones** to **Edit name or size**, **Move here** (centers it where you stand, with the same preview), **Teleport** to its center, or **Remove** it. Meteor Strikes' **Protect this area from meteors** button opens the same **Add a safe zone here**.
6. **Operators:** to let everyone protect their own base, enable **Players can add safe zones** in `/realm:config` → **Safe Zones** (`playersCreate`). Each player can then add up to 1 zone (`playerMaxZones`) of up to 64 blocks radius (`playerMaxRadius`), and change, move or remove their own.

### What players see

- **Inside a safe zone** (any zone from any provider, in the zone's dimension, top to bottom):
  - [Meteor Strikes](#meteor-strikes--meteor_bp): no meteor is aimed into one, and no crater block is ever placed or removed in one. A meteor that still comes down over a zone lands just outside it, or bursts in the sky above it (the meteor pack's **A meteor over a safe zone** setting).
  - [Storm Chasing](#storm-chasing--storm_bp): no storm cell lightning strikes in or right next to a zone, so it can't start fires there. Lightning rods inside still get struck and charged.
  - [Tornadoes](#tornadoes--tornado_bp): a tornado never breaks blocks anywhere; its **Tornadoes and safe zones** setting picks whether it passes through as usual, moves nothing inside a zone, or steers around zones.
  - [Blood Moon](#blood-moon--harvest-moon--moon_bp): no Blood Moon creeper spawns in a zone (another monster comes instead).
  - [Creeper Guard](#creeper-guard--guard_bp): in its protected zones mode, creeper blasts break nothing in a safe zone either.
- **What it doesn't stop:** vanilla lightning from an ordinary thunderstorm, fire spread, creepers and other mobs that spawn on their own (use Creeper Guard for creeper blasts), and players. A safe zone isn't a land claim.
- **Overlaps** are fine: zones may overlap each other, towns and claims.

### Commands

| Command | Who | What it does |
|---|---|---|
| `/realm:zones` | Everyone | Opens the Safe Zones menu: whether you're in a safe zone, the list of safe zones (nearest first) and of protected towns and claims, with **Show outline** for each and **Show nearby outlines**. Operators also add a zone where they stand (radius 8 to 512, default 64, `defaultRadius`) with a preview, edit, move, teleport to and remove zones. With `playersCreate` enabled (default disabled), players can add their own too (1 each, `playerMaxZones`, radius up to 64, `playerMaxRadius`) |

### Configuration (`scripts/config.js` → `CONFIG`)

| Option | Default | Description |
|---|---|---|
| `defaultRadius` | `64` | Where the radius slider of **Add a safe zone here** starts, in blocks |
| `maxRadius` | `512` | Largest radius a zone can have, in blocks (8 to 512, in steps of 8) |
| `previewSeconds` | `20` | Seconds an outline shows: the preview of a new zone, **Show outline** and **Show nearby outlines** |
| `playersCreate` | `false` | Players who aren't operators can add safe zones, within the two limits below. Operators always can |
| `playerMaxZones` | `1` | Most safe zones one player (not an operator) can have |
| `playerMaxRadius` | `64` | Largest radius a player (not an operator) can give a zone, in blocks |

Operators can change every option but `previewSeconds` in game with `/realm:config` when Realm Settings is installed. The realm has room for 100 zones made with this pack.

### Saved data

| Key | Scope | Contents |
|---|---|---|
| `zones:list` | World | JSON list of the zones: `{ id, name, dim, x, y, z, r, o?, on? }`, its id (`z1`, `z2`...), name, dimension, center (and the height it was made at, for **Teleport**), radius, and the id and name of the player who added it when that wasn't an operator |
| `zones:next` | World | The next zone id number |
| `zones:cfg` | World | Settings changed in `/realm:config` |

Towns and claims aren't saved here: their packs send them again whenever the world starts.

### How it works

- This pack is the `zones` provider of the safe zones protocol (see [How the packs work together](#how-the-packs-work-together)): it sends its whole list as `realm:zones` whenever a zone changes, 5 seconds after the world loads, and when any pack sends `realm:zones_ping`. It also listens to the other providers, so its lists are complete.
- `realm:zones_open` `{ player, action: "add" }` opens **Add a safe zone here** for that player (Meteor Strikes' **Protect this area from meteors**); any other action opens the menu (Creeper Guard's **Safe zones** button).
- Outlines are `Player.spawnParticle` (`minecraft:villager_happy`, `minecraft:endrod` for a preview) every half second, only along the part of the edge within 40 blocks of you and at your height, so a 512-block zone costs no more than a small one.

---

## Weather Almanac — `weather_bp`

Plans the overworld weather hours ahead, so the realm has a forecast: clear spells, rain and thunderstorms come and go on a schedule in real time, and anyone can look up what's coming with `/realm:weather` (or ask Sol the Sky-reader). Rain and storms last a realistic while, a clear spell always ends in rain or a storm, and rain can build into a thunderstorm.

### How to use

1. About 10 seconds after you first join each day (UTC), chat gives the day's forecast in one line, for example `Forecast: clear now, rain in about 25 minutes. More with /realm:weather`. Don't want it? Disable **Daily forecast in chat** in `/realm:prefs`.
2. Run `/realm:weather` (or `/realm:weather_forecast`) to see the forecast for the next 3 hours: what the weather is now and how long it lasts, then every spell coming up with its start time (in UTC) and length, and a summary such as `Rain in 25 min, for about 12 min. Thunderstorm likely around 14:40 UTC.`
3. With the [Townsfolk](#townsfolk--npc_bp) pack, tap Sol the Sky-reader (or any townsfolk with the `skymage` role) and pick **Forecast** for the same.
4. Sleeping through rain or a thunderstorm ends it, as in vanilla: the sky clears and the plan carries on from there (the forecast updates).
5. **Operators:** `/realm:weather` opens a menu with **Forecast** and **Set the weather** (pick clear, rain or a thunderstorm and 5 to 240 real minutes). `/realm:weather_set <clear|rain|thunder> <minutes>` does the same from chat: it starts that weather now for that many real minutes, and the plan carries on after it. Vanilla `/weather` doesn't stick while the almanac runs: it's put back within a second. `/realm:config` → **Weather Almanac** sets how long each kind of weather lasts and how likely thunder is, or disables the almanac to give the weather back to the game.

### What players see

- **The weather follows a plan**, 3 hours ahead (`horizonHours`), in real time:
  - **Clear** spells last 20 to 60 minutes (`clear.minMinutes`, `clear.maxMinutes`) and always end in rain, or, one time in ten (`thunderAfterClear`, 0.1), straight in a thunderstorm.
  - **Rain** lasts 8 to 20 minutes (`rain.minMinutes`, `rain.maxMinutes`), then clears, or builds into a thunderstorm 35% of the time (`thunderAfterRain`).
  - **Thunderstorms** last 6 to 12 minutes (`thunder.minMinutes`, `thunder.maxMinutes`), then clear, or ease back into rain half the time (`rainAfterThunder`).
  - Each length is picked at random between its shortest and longest.
- **The forecast** (`/realm:weather`, title `Weather Forecast`) starts with the summary line, then `Now: Rain, for about 12 min more (until 14:40 UTC).` and a `Coming up:` list such as `15:15 UTC  Thunderstorm, about 9 min (in 47 min)`. Times are real time in UTC, so they mean the same for everyone. The plan is saved in the world: after a restart it carries on where it was, skipping whatever the realm missed while it was closed.
- **The daily chat line** reads `Forecast: clear now, rain in about 25 minutes.`, `Forecast: rain now, clearing in about 12 minutes.` or `Forecast: thunderstorm now, easing to rain in about 8 minutes.` (`dailyForecast`; once per player per UTC day).
- **Sleeping:** when a night or a daytime thunderstorm is skipped by sleeping (vanilla's or [AFK + Smart Sleep](#afk--smart-sleep--afk_bp)'s), the rain or storm that was on is over and a new clear spell starts, so the forecast after waking is fresh. This matches vanilla, where sleeping clears the weather.
- **Other weather changes** (vanilla `/weather`, or another pack) are put back to the plan a second later. If something keeps changing it (more than 6 times in a minute), the almanac stops fighting it for the rest of that minute and the content log says so.

### Commands

| Command | Who | What it does |
|---|---|---|
| `/realm:weather` | Everyone | The forecast (below). Operators get a menu instead: **Forecast** and **Set the weather** (clear, rain or thunder for 5 to 240 real minutes) |
| `/realm:weather_forecast` | Everyone | The forecast for the next 3 hours (`horizonHours`): the weather now and when it changes, every spell coming up, in real time (UTC) |
| `/realm:weather_set <clear\|rain\|thunder> <minutes>` | Operators | Starts that weather now for 1 to 1440 real minutes; the plan carries on after it. With the almanac disabled it just sets the weather, and the game's weather cycle takes over after |

### Configuration (`scripts/config.js` → `CONFIG`)

| Option | Default | Description |
|---|---|---|
| `enabled` | `true` | The almanac runs the overworld weather: it sets the `doWeatherCycle` gamerule to false and plays its plan. Disabled, it puts the gamerule back how it was before and the game's weather takes over |
| `horizonHours` | `3` | How far ahead the plan reaches, in real hours. The forecast shows this far |
| `clear.minMinutes` | `20` | Shortest clear spell, in real minutes |
| `clear.maxMinutes` | `60` | Longest clear spell, in real minutes |
| `rain.minMinutes` | `8` | Shortest rain, in real minutes |
| `rain.maxMinutes` | `20` | Longest rain, in real minutes |
| `thunder.minMinutes` | `6` | Shortest thunderstorm, in real minutes |
| `thunder.maxMinutes` | `12` | Longest thunderstorm, in real minutes |
| `thunderAfterClear` | `0.1` | Chance (0–1) a clear spell ends straight in a thunderstorm instead of rain |
| `thunderAfterRain` | `0.35` | Chance (0–1) rain builds into a thunderstorm instead of clearing |
| `rainAfterThunder` | `0.5` | Chance (0–1) a thunderstorm eases into rain instead of clearing |
| `dailyForecast` | `true` | A one-line forecast in chat the first time each player joins on a UTC day |
| `npcRole` | `skymage` | The [Townsfolk](#townsfolk--npc_bp) role that offers **Forecast** when tapped. Empty = no offer |

Operators can change `enabled`, every `.minMinutes` and `.maxMinutes`, `thunderAfterClear`, `thunderAfterRain`, `rainAfterThunder` and `dailyForecast` in game with `/realm:config` when Realm Settings is installed; length and chance changes apply from the next spell (the one on now keeps its length). Each player can switch the daily chat line for themselves with **Daily forecast in chat** in `/realm:prefs`, which follows `dailyForecast` until they choose. `horizonHours` and `npcRole` stay in `config.js`.

### Saved data

| Key | Scope | Contents |
|---|---|---|
| `weather:plan` | World | JSON `{ v: 1, s: [{ w, s, e }] }`: the plan, each spell's weather (`Clear`, `Rain` or `Thunder`) and its start and end (ms since 1970). The first one is now |
| `weather:weather` | World | The overworld weather at the last change. The stable Script API can't read the current weather |
| `weather:cycle` | World | The `doWeatherCycle` gamerule as it was before the almanac took over, put back when it's disabled. Not set while the almanac isn't running |
| `weather:day` | Player | The UTC day number of the player's last daily forecast |
| `weather:pref` | Player | JSON of the player's own `dailyForecast` choice from `/realm:prefs` |
| `weather:cfg` | World | Settings changed in `/realm:config` |

### How it works

- On start (and when enabled), the pack saves the `doWeatherCycle` gamerule and sets it to false, so the game never changes the weather on its own, then plays the plan's current spell with `Dimension.setWeather` (with the spell's remaining length, plus a minute, as the game's own fallback). Once a second it checks whether the current spell has ended; if so it plays the next one and plans further ahead, to `horizonHours`. Every 10 seconds it makes sure `doWeatherCycle` is still false.
- The plan is a chain: each spell's kind is picked from the one before it with the chances above, and its length at random between its shortest and longest. It's saved as `weather:plan` on every change.
- `weatherChange` in the overworld is checked against the plan. A change to clear within 10 seconds of anyone being in bed, or a jump in the time of day right after, is sleeping: the wet spell ends and a clear one starts. Any other mismatch is put back a second later (at most 6 times a minute).
- **Other packs:** whenever the plan changes, the pack sends `realm:weather_plan` `{ now, until, next: [{ weather, at }] }`: `now` is the current weather (`Clear`, `Rain` or `Thunder`), `until` when it ends and `at` when each later spell starts (ms since 1970), up to 24 spells. It sends the same in answer to `realm:weather_ask`. With the almanac disabled the answer is `{ now, until: 0, next: [], off: true }`, with `now` the last weather seen.
- **Townsfolk:** on `realm:npc_talk` with the `skymage` role it offers **Forecast** (`realm:npc_offer`, key `forecast`), and `realm:npc_choose` opens the forecast for that player.

### Known limits

- When the almanac first starts, it doesn't know the weather at that moment, so it starts from clear (or the last weather it saw) and sets that.
- `/weather` and other packs can't change the weather for long while it runs: use `/realm:weather_set`, or disable the almanac.
- The plan runs in real time; `/time` and sleeping don't move it, except that sleeping ends rain or a storm.

---

## Regional Weather — `climate_bp`

The weather depends on where you stand: when it rains, deserts and badlands get a sandstorm and snowy places a blizzard, and on the morning after rain a fog bank rolls in off lakes, rivers and the sea. Each player gets the condition of the ground around them, with its own fog and blowing sand or snow; sandstorms and blizzards also slow you down.

### How to use

1. **Sandstorm:** when it rains or storms and you're outdoors in a desert or badlands, the air turns tan, sand blows past you on the wind and you get Slowness I. Wear any helmet to keep the sand out of your eyes: no Slowness. Above the hotbar: `Sandstorm! A helmet keeps the sand out of your eyes.`
2. **Blizzard:** when it rains or storms and you're outdoors where snow or ice lies on top, it's a white-out with driving snow and Slowness I. Get under a roof, or within 4 blocks of a lit campfire, and it's gone. Above the hotbar: `Blizzard! Get under a roof or near a lit campfire.`
3. **Fog bank:** for 30 real minutes after rain ends, dawn (from sunrise to mid-morning) brings a low, pale fog when you're by water and below y 80. Above the hotbar: `A fog bank rolls in off the water.`
4. Run `/realm:climate`, or use the same switch in `/realm:prefs`, to disable the fog and particles for yourself (on a slower device, say). Slowness still applies. The choice is remembered.
5. **Operators:** add [Realm Skies](#realm-skies--sky_rp) under **Resource Packs**: the fogs and particles come from it, so without it only the Slowness happens. `/realm:config` → **Regional Weather** enables or disables each condition and the Slowness, sets the campfire distance and the fog bank window.

### What players see

- **Where:** decided once a second for each player in the overworld from the highest block over them and over one random column within 4 blocks: sand, red sand, sandstone, terracotta, cactus or dead bushes mean desert or badlands (cut, smooth and chiseled sandstone, sandstone stairs, slabs and walls, and glazed terracotta are building blocks and don't count); snow, powder snow or ice mean a snowy place. Sand with water within 8 blocks (and no more than 3 below your feet) is a beach or a riverbank, where it really rains, so no sandstorm there. The Script API can't read biomes, so this is a guess from the ground (as [Rain Extras](#rain-extras--rain_bp) does). Outdoors means nothing 2 or more blocks over your head, and not flying more than 16 blocks over the ground.
- **Sandstorm** (rain or thunder, outdoors on desert ground): the `realm:sky_sandstorm` fog (tan, about 6 to 20 blocks of sight) and 2 bursts of blowing sand a second (`particlesPerSecond`) from upwind. The wind (`wind.speed`, 6 blocks a second) slowly turns (`wind.turnDegrees`, 2° a second), so the sand drifts from a different side over a few minutes. Slowness I without a helmet (`slowness`, `sandstorm.helmetProtects`).
- **Blizzard** (rain or thunder, outdoors on snow or ice): the `realm:sky_blizzard` white-out fog, driving snow from upwind, and Slowness I. A lit campfire or soul campfire within 4 blocks (`blizzard.campfireRadius`) or a roof ends it for you.
- **Fog bank** (no rain): from time 23000 (sunrise) to 2500 (mid-morning) (`fogbank.fromTime`, `fogbank.toTime`), within 30 real minutes of the last rain ending (`fogbank.minutesAfterRain`), outdoors, below y 80 (`fogbank.maxY`), with water within 6 blocks to the side (`fogbank.waterRadius`) and no more than 3 below your feet (`fogbank.waterBelow`): the `realm:sky_fogbank` fog and pale fog puffs on the ground around you, one a second.
- A condition lingers 3 seconds after you step out of it (`lingerSeconds`), so a patch of grass in a desert doesn't make it flicker. The note above the hotbar shows at most once every 2 minutes for each condition.
- **Slowness** is Slowness I for 2 seconds, renewed every second while you're in it, without particles. A stronger or longer Slowness (a potion) is left alone. None in creative or spectator mode.
- The fogs and particles are only for the player they're for. Rain itself still comes from [Realistic Rain](#realistic-rain--rain_rp) and [Rain Extras](#rain-extras--rain_bp), which leave deserts and snowy places alone.
- The first time you're in each condition, the [Journal](#field-journal--journal_bp) records it on its weather page (`sandstorm`, `blizzard`, `fogbank`).

### Commands

| Command | Who | What it does |
|---|---|---|
| `/realm:climate` | Everyone | Enables or disables the sandstorm, blizzard and fog bank fog and particles **for yourself** (enabled by default). Slowness still applies. Remembered between sessions |

### Configuration (`scripts/config.js` → `CONFIG`)

| Option | Default | Description |
|---|---|---|
| `enabled` | `true` | Sandstorms, blizzards and fog banks happen. Disabled, the pack does nothing and clears its fogs |
| `slowness` | `true` | Sandstorms (without a helmet) and blizzards give Slowness I |
| `lingerSeconds` | `3` | Seconds a condition lingers after you step out of it |
| `particlesPerSecond` | `2` | Bursts of sand or snow per second around each player (fog bank puffs are half that) |
| `wind.speed` | `6` | Wind speed for the blowing sand and snow, in blocks per second |
| `wind.turnDegrees` | `2` | How fast the wind turns, in degrees per second |
| `sandstorm.enabled` | `true` | Rain or thunder over desert ground blows up a sandstorm for players outdoors |
| `sandstorm.helmetProtects` | `true` | Wearing any helmet keeps sandstorm Slowness away |
| `blizzard.enabled` | `true` | Rain or thunder over snow or ice is a blizzard for players outdoors |
| `blizzard.campfireRadius` | `4` | A lit campfire or soul campfire within this many blocks shelters you from the blizzard (1–8 in game) |
| `fogbank.enabled` | `true` | Low fog by the water at dawn after rain |
| `fogbank.minutesAfterRain` | `30` | Real minutes after the rain ends during which dawn brings a fog bank |
| `fogbank.fromTime` | `23000` | Dawn starts at this time of day (ticks; 23000 is sunrise) |
| `fogbank.toTime` | `2500` | Dawn ends at this time of day |
| `fogbank.maxY` | `80` | Fog banks only below this height |
| `fogbank.waterRadius` | `6` | Water must be within this many blocks to the side |
| `fogbank.waterBelow` | `3` | ... and no more than this many blocks below your feet |

Operators can change `enabled`, `slowness`, `sandstorm.enabled`, `sandstorm.helmetProtects`, `blizzard.enabled`, `blizzard.campfireRadius`, `fogbank.enabled`, `fogbank.minutesAfterRain` and `particlesPerSecond` in game with `/realm:config` when Realm Settings is installed. Each player switches the visuals for themselves with **Sandstorm, blizzard and fog bank visuals** in `/realm:prefs` (the same switch as `/realm:climate`). The other numbers stay in `config.js`.

### Saved data

| Key | Scope | Contents |
|---|---|---|
| `climate:weather` | World | The overworld weather at the last change: `Clear`, `Rain` or `Thunder`. The stable Script API can't read the current weather |
| `climate:dry` | World | When the last rain ended (ms since 1970), for fog banks |
| `climate:seen` | Player | Conditions already sent to the Journal, such as `sandstorm,blizzard` |
| `climate:pref` | Player | JSON of the player's own visuals choice from `/realm:climate` or `/realm:prefs` |
| `climate:cfg` | World | Settings changed in `/realm:config` |

### How it works

- `weatherChange` in the overworld keeps the weather (saved as `climate:weather`), and a change to clear after rain saves the time as `climate:dry`. The pack's loop only runs while it rains, during the fog bank window after rain, or while a player still has its fog; it runs twice a second and updates half of the players each time, so each player once a second.
- Each update: one `getTopmostBlock` over the player (outdoors, and the ground) and, in rain, one over a random column within 4 blocks. In a blizzard, a lit campfire is looked for with `Dimension.getBlocks` in the 9 x 9 x 9 blocks around the player (at the default `blizzard.campfireRadius` of 4) every 3 seconds; on sand, water (for a beach) with `Dimension.containsBlock` in the 17 x 17 blocks around and up to 3 below every 5 seconds; for a fog bank, water the same way every 5 seconds. Each is a single native call.
- Fogs use `/fog @s push realm:sky_… climate_sky` and `/fog @s remove climate_sky`, so only this pack's fog entry is ever touched; joining clears it and the next update puts back what's needed. Particles use `Player.spawnParticle` with the wind in `variable.wx` and `variable.wz`, so only that player sees them.
- Slowness uses `addEffect("slowness", 40, { amplifier: 0, showParticles: false })`, skipped while a stronger or longer Slowness is on.
- The first time in each condition sends `realm:journal` `{ player, page: "weather", entry, label }` and the note above the hotbar sends `realm:actionbar` first, so the [Coordinates HUD](#coordinates-hud--hud_bp) steps aside.

### Known limits

- Biomes can't be read, so a plain sandstone or terracotta roof or a snow-covered field counts as desert or snowy ground, and the sand by a desert river or well counts as a riverbank. Rain or thunder anywhere is a sandstorm or blizzard on that ground.
- Fogs stack, and the one pushed last shows. Rain Extras leaves its storm fog off on sand, terracotta, snow and ice, and Blood Moon & Harvest Moon leaves its moon fog off while it rains, so a sandstorm or blizzard fog is never covered by theirs.
- Realm Skies has one fog for each condition, so the fog comes and goes in one step rather than rolling in by stages like the storm fog of Rain Extras.

---

## Storm Chasing — `storm_bp`

Thunderstorms get a storm cell: a heart of the storm that drifts with the wind, throwing lightning as it grows and fades. Chase it with a clock or the Storm Meter relic, and set out lightning rods: a rod lightning strikes becomes charged, and tapping it gives Storm Glass.

### How to use

1. In a thunderstorm, chat soon says `A storm cell is forming to the NE.` The cell forms 200 to 500 blocks from one of the players online, drifts 1 to 3 blocks a second and lasts 4 to 8 minutes.
2. Hold a clock and run `/realm:storm` → **Read the storm** (or `/realm:storm_read`) for a reading: `Cell: 340m NE, strength 7/10`. Holding the Storm Meter relic ([Relics](#relics--relics_bp)) shows the reading all the time.
3. Near the cell, lightning lands every 3 to 8 seconds, more often as it grows. Watch out: it hurts. Getting within 64 blocks of the cell adds **Storm cell** to the Weather page of your [Field Journal](#field-journal--journal_bp).
4. Place lightning rods where the storm goes. When lightning strikes one you placed (the cell's, or ordinary storm lightning), it sparks blue and is charged. Tap a charged rod to collect 1 or 2 **Storm Glass**, and it can be charged again.
5. Don't want the chat line when a cell forms? Disable **Storm cell notes** in `/realm:prefs`.
6. Storm cell lightning never strikes in or right next to a safe zone ([Safe Zones](#safe-zones--zones_bp), protected towns and claims), so it can't set your base on fire. Lightning rods there still get struck.
7. **Operators:** `/realm:storm` also has **Start a storm cell**, **Start a storm cell anyway** (without a thunderstorm) and **End the storm cell**. `/realm:storm_cell` starts a cell 48 to 96 blocks from you during a thunderstorm; `/realm:storm_cell true` starts one even without a storm. `/realm:config` → **Storm Chasing** enables or disables the cells, their lightning and the chat line, and sets the wait between cells.

### What players see

- **One storm cell at a time**, in the overworld only. A thunderstorm's first cell forms 10 to 40 seconds after it starts, and after a cell passes the next one waits 60 seconds (`gapSeconds`). The cell ends when its time is up or the thunderstorm ends.
- **Strength** goes from 1 up to the cell's peak (5 to 10) halfway through its life, then back down. Strikes come every 8 seconds at strength 1 and every 3 at strength 10 (`strikeSecondsMax`, `strikeSecondsMin`), give or take a second.
- **Wind:** each cell drifts at its own speed (`minSpeed` to `maxSpeed`) in a direction that turns a few degrees a second (`turnPerSecond`), so it wanders.
- **Lightning** lands at a random spot within 30 blocks of the cell (`strikeRadius`), only where the world is loaded (around players). To keep builds from catching fire, a strike is skipped within 64 blocks of world spawn (`avoidSpawn`) and anywhere a check of the 9 x 9 columns around the spot (the surface and 4 blocks under it) finds a player-made block: planks, glass, chests, barrels, signs, beds, torches, lanterns, doors, fences, wool, carpet, concrete, glazed terracotta, polished, cut and chiseled stone, copper blocks, paths, farmland, crafting tables, furnaces, bricks, slabs, stairs, rails, redstone parts and the like.
- **Lightning rods:** the pack remembers rods players place (up to 200, `maxRods`). Half the time (`rodChance`) a strike goes to an uncharged rod within the cell's reach instead, even near spawn (a struck rod doesn't start fires). Any lightning within 3 blocks of a remembered rod charges it: a blue spark and a beacon hum, then a spark every 2 seconds while someone is within 48 blocks. Tapping a charged rod (with anything in hand) collects `You collect 2 Storm Glass from the lightning rod.` Tapping an uncharged one with an empty hand says `This lightning rod isn't charged. A lightning strike charges it.` The sparks come from [Realm Skies](#realm-skies--sky_rp); without it, the rods still charge.
- **Storm Glass** is prismarine crystals named `Storm Glass` with the lore `Charged by a lightning strike`. Other packs may buy or use it.
- **Read the storm** without a clock in your hand says `Hold a clock to read the storm.`; with no cell (or outside the overworld), `No storm cell.`

### Commands

| Command | Who | What it does |
|---|---|---|
| `/realm:storm` | Everyone | Opens the Storm Chasing menu: **Read the storm**; operators also start a storm cell (with or without a thunderstorm) or end it |
| `/realm:storm_read` | Everyone | With a clock in your hand: the storm cell's distance, direction and strength (`Cell: 340m NE, strength 7/10`) |
| `/realm:storm_cell [force]` | Operators | Starts a storm cell 48 to 96 blocks from you now (default, `commandMinDistance` to `commandMaxDistance`), replacing any other. Needs a thunderstorm unless `force` is `true`; a forced cell lasts its full time even if the weather clears |

### Configuration (`scripts/config.js` → `CONFIG`)

| Option | Default | Description |
|---|---|---|
| `enabled` | `true` | Thunderstorms in the overworld get a storm cell |
| `lightning` | `true` | The storm cell throws lightning. Disabled, it still drifts and can be read |
| `avoidZones` | `true` | No lightning in or within 4 blocks of a safe zone (Safe Zones, protected towns and claims). Lightning rods there still get struck and charged |
| `formNotes` | `true` | A chat line when a storm cell forms. Each player can choose in `/realm:prefs` |
| `gapSeconds` | `60` | Seconds after a cell passes before the next can form (0–3600 in game) |
| `minDistance` | `200` | A new cell forms at least this far from a random online player (blocks) |
| `maxDistance` | `500` | ...and at most this far |
| `minLifeSeconds` | `240` | Shortest a cell lasts (seconds) |
| `maxLifeSeconds` | `480` | Longest a cell lasts (seconds) |
| `minSpeed` | `1` | Slowest a cell drifts (blocks per second) |
| `maxSpeed` | `3` | Fastest a cell drifts (blocks per second) |
| `turnPerSecond` | `3` | How fast the wind turns, at most (degrees per second) |
| `strikeRadius` | `30` | Lightning lands within this many blocks of the cell |
| `strikeSecondsMin` | `3` | Seconds between strikes at strength 10 |
| `strikeSecondsMax` | `8` | Seconds between strikes at strength 1 |
| `avoidSpawn` | `64` | No lightning within this many blocks of world spawn (rods excepted) |
| `rodChance` | `0.5` | Chance a strike goes to an uncharged lightning rod near the cell, when there is one |
| `maxRods` | `200` | Lightning rods remembered; past this the oldest are forgotten |
| `glassMin` | `1` | Fewest Storm Glass from a charged rod |
| `glassMax` | `2` | Most Storm Glass from a charged rod |
| `journalRadius` | `64` | Players this close to the cell get the Field Journal's Storm cell entry |
| `commandMinDistance` | `48` | `/realm:storm_cell` puts the cell at least this far from the operator |
| `commandMaxDistance` | `96` | ...and at most this far |

Operators can change `enabled`, `lightning`, `avoidZones`, `gapSeconds` and `formNotes` in game with `/realm:config`. Each player can switch the chat line for themselves with **Storm cell notes** in `/realm:prefs`, which follows `formNotes` until they choose. The rest stays in `config.js`.

### Saved data

| Key | Scope | Contents |
|---|---|---|
| `storm:cell` | World | JSON of the current cell (`x`, `z`, `heading`, `speed`, `age`, `life`, `peak`, `forced`), saved every 10 seconds so it survives a restart during the storm |
| `storm:rods` | World | JSON `[[dimension, x, y, z, charged], ...]`: lightning rods players placed, and which are charged |
| `storm:weather` | World | The overworld weather at the last change; the stable Script API can't read it |
| `storm:pref` | Player | The player's own **Storm cell notes** choice |
| `storm:cfg` | World | Settings changed in `/realm:config` |

### How it works

- Weather comes from `weatherChange` (saved as `storm:weather`). Once a second the cell moves along its heading and counts down to its next strike; the cell itself is just a point, not an entity.
- A strike first checks the spot's column with `getTopmostBlock`: in an unloaded chunk that fails and the strike is skipped. Then the 9 x 9 build check (at most 405 block lookups, only when a strike is due), then `dimension.spawnEntity("minecraft:lightning_bolt")` on the surface.
- Rods are remembered from `afterEvents.playerPlaceBlock` and forgotten on `playerBreakBlock`, or when found missing (a strike aimed at one, a tap, or the spark check of a charged rod near a player, so a rod blown up or pushed away stops sparking). `afterEvents.entitySpawn` of a `minecraft:lightning_bolt` within 3 blocks of a rod charges it. A tap is `beforeEvents.playerInteractWithBlock`; on a charged rod it's canceled (so no block is placed against it) and the glass is given.
- Every 2 seconds the pack sends `realm:storm_cell` `{ dim, x, z, strength }` (`{ dim: null }` once the cell is gone), which the [Relics](#relics--relics_bp) Storm Meter shows, and `realm:journal` `{ page: "weather", entry: "storm_cell" }` to players within `journalRadius` (once per cell). A new cell sends `realm:sky_event` `{ kind: "storm_cell", dim, x, z, text: "A storm cell is forming" }` for the packs that listen to sky events (see [How the packs work together](#how-the-packs-work-together)).

---

## Tornadoes — `tornado_bp`

Some thunderstorms spin up a tornado: a tall, swaying funnel of dust that wanders across open country for a couple of minutes, sweeping up mobs and dropped items and flinging players who get too close. It never breaks or places a single block, so builds are safe even when it passes right by them, and it leaves a few Storm Glass behind where it dies down. The funnel is drawn with particles from [Realm Skies](#realm-skies--sky_rp): without that resource pack the tornado still pulls, throws and warns, but you can't see it.

### How to use

1. When a thunderstorm starts, there's a chance (`chance`, 0.2) that a tornado touches down during it, 1 to 4 minutes in, somewhere 80 to 160 blocks from one of the players in the Overworld, on open grass, dirt or sand.
2. Anyone within 150 blocks gets a warning in chat, such as `§cTornado! 140m to the SW, moving NE.`, and hears a warning horn every 20 seconds while it lasts. Closer in you hear the wind roar and the storm rumble from its direction.
3. Run `/realm:tornado` → **Where is the tornado?** (or `/realm:tornado_info`) any time to see where it is and which way it's heading, or `No tornado right now.`
4. Want a closer look? Mobs and items near the funnel circle it and get lifted; get within about 6 blocks and you're thrown a few blocks up and out, then float down with Slow Falling, so it's a ride, not a death trap. Creative and spectator players are left alone.
5. When it dies down (after 1.5 to 3 minutes), chat says `§7The tornado has died down.` and 2 to 5 **Storm Glass** lie on the ground at the end of its path. Go pick them up.
6. **Operators:** add [Realm Skies](#realm-skies--sky_rp) under **Resource Packs** so players can see the funnel. `/realm:tornado` → **Spawn one** (or `/realm:tornado_spawn`) makes a tornado 40 blocks in front of you right away, in any weather; **End the tornado** stops it. `/realm:config` → **Tornadoes** enables or disables tornadoes in storms and sets the chance, the distance kept from spawn, what a tornado does in safe zones, the funnel's density and view distance, the pull radius and whether players are thrown.

### What players see

- **The funnel:** rings of spinning dust stacked 40 blocks (`height`) up from the ground, narrow at the bottom and about 11 blocks wide at the top, bending and swaying, with dirt and leaf bits flung out at its base. Each player within `viewDistance` (128) blocks gets their own copy (`rings`, 16 rings, half as many beyond 64 blocks; `density` scales both), so players far away cost nothing.
- **Where it goes:** it drifts 2 to 4 blocks a second (`speed`) on a slowly wandering heading, follows the ground over hills, and turns away rather than come within `avoidSpawn` (64) blocks of the world spawn. It may pass by builds: it never changes a block.
- **Safe zones** ([Safe Zones](#safe-zones--zones_bp), protected towns and claims), by **Tornadoes and safe zones** (`zoneMode`): `pass` (default) goes through them like anywhere else, since it breaks nothing; `calm` pulls, lifts and throws nothing that is inside a zone (pens, farms and item sorters stay as they are); `avoid` never forms within `pullRadius` + 16 blocks of a zone and turns away before its pull reaches one (and is calm inside one, if an operator spawns it there).
- **Pull:** mobs and dropped items within `pullRadius` (12) blocks of the funnel circle it, drift inward and rise up to `liftHeight` (8) blocks. Mobs get Slow Falling while they're in it, so pets, villagers and farm animals land safely. Townsfolk (`minecraft:npc`), armor stands, paintings, minecarts, boats, falling sand and gravel, primed TNT, ender pearls and other projectiles, and other packs' helper entities are never moved.
- **Players:** at the edge of the pull radius you feel a tug toward the funnel; within half of it you're thrown a few blocks up and sideways (at most once every 4 seconds), and get Slow Falling for `slowFallingSeconds` (6) seconds near the top of the throw. `throwPlayers` disabled leaves players alone.
- **Warnings and sounds:** within `warnDistance` (150) blocks, a chat warning once per tornado with its distance, direction and heading (`§cTornado! 140m to the SW, moving NE.`), and the raid horn every `hornEvery` (20) seconds. Within 100 blocks a deep thunder rumble every 6 s; within 48 blocks the roar of wind every 5 s. Sounds come from the tornado's direction.
- **When it ends:** chat says `§7The tornado has died down.` to everyone who was warned, and 2 to 5 (`stormGlass`) Storm Glass drop along the last part of its path: prismarine crystals named `Storm Glass` with the lore `Charged by a lightning strike`, the same item other packs use. A natural tornado dies down within 10 seconds once the thunderstorm ends.
- **Journal:** players who see it (within `viewDistance`) get the **Tornado** page in their journal (Journal pack), and innkeepers' **Hear the news** ([Waystones & Inns](#waystones--inns--waystone_bp)) passes on `A tornado touched down` (the `realm:sky_event` script event).

### Commands

| Command | Who | What it does |
|---|---|---|
| `/realm:tornado` | Everyone | Opens the Tornadoes menu: **Where is the tornado?**; operators also **Spawn one** (40 blocks in front of you) and **End the tornado** (no Storm Glass) |
| `/realm:tornado_info` | Everyone | Where the tornado is and where it's heading (`§cTornado! 140m to the SW, moving NE.`), or `No tornado right now.` |
| `/realm:tornado_spawn` | Operators | A tornado forms 40 blocks in front of you now, in any weather (one at a time). It lasts and drifts like a natural one, but doesn't end with the storm |

### Configuration (`scripts/config.js` → `CONFIG`)

| Option | Default | Description |
|---|---|---|
| `enabled` | `true` | Tornadoes form on their own during thunderstorms (`/realm:tornado_spawn` works either way) |
| `chance` | `0.2` | Chance (0-1) that a thunderstorm brings one tornado, rolled when the thunderstorm starts |
| `formAfter.min` | `60` | Earliest second after the thunderstorm starts that the tornado forms |
| `formAfter.max` | `240` | Latest second after the thunderstorm starts that the tornado forms |
| `lifetime.min` | `90` | Shortest life of a tornado, in seconds |
| `lifetime.max` | `180` | Longest life of a tornado, in seconds |
| `speed.min` | `2` | Slowest drift, blocks per second |
| `speed.max` | `4` | Fastest drift, blocks per second |
| `formDistance.min` | `80` | Closest it forms to the chosen player, in blocks |
| `formDistance.max` | `160` | Farthest it forms from the chosen player, in blocks |
| `avoidSpawn` | `64` | It never forms or travels closer than this many blocks to the world spawn |
| `zoneMode` | `"pass"` | Safe zones: `pass` goes through them as usual (it never breaks blocks anyway), `calm` moves nothing inside them, `avoid` never forms near one and turns away from them |
| `viewDistance` | `128` | Players within this many blocks see the funnel (and get the journal page) |
| `height` | `40` | Height of the funnel, in blocks |
| `rings` | `16` | Rings of dust stacked up the funnel for each player near it (half as many beyond 64 blocks); each is redrawn every half second |
| `density` | `1` | Multiplies `rings` and the debris, 0.25 to 1.5: lower it if the funnel slows devices down |
| `pullRadius` | `12` | Mobs, items and players within this many blocks of the funnel are pulled in |
| `liftHeight` | `8` | Mobs and items are lifted up to this many blocks above the ground |
| `throwPlayers` | `true` | Players close to the funnel are thrown a few blocks and land with Slow Falling |
| `slowFallingSeconds` | `6` | Seconds of Slow Falling after being thrown |
| `warnDistance` | `150` | Players within this many blocks get the chat warning and the horn |
| `hornEvery` | `20` | Seconds between warning horns; `0` = no horn |
| `stormGlass.min` | `2` | Fewest Storm Glass dropped where it dies down |
| `stormGlass.max` | `5` | Most Storm Glass dropped where it dies down |
| `sounds.wind` | `"elytra.loop"` | The wind roar near the funnel (within 48 blocks) |
| `sounds.rumble` | `"ambient.weather.thunder"` | The rumble within 100 blocks, played low |
| `sounds.horn` | `"raid.horn"` | The warning horn |

Operators can change `enabled`, `chance`, `avoidSpawn`, `zoneMode`, `density`, `pullRadius`, `throwPlayers`, `viewDistance` and `rings` in game with `/realm:config` when Realm Settings is installed. The other numbers stay in `config.js`.

### Saved data

| Key | Scope | Contents |
|---|---|---|
| `tornado:weather` | World | The overworld weather at the last change: `Clear`, `Rain` or `Thunder` (the stable Script API can't read the current weather) |
| `tornado:cfg` | World | Settings changed in `/realm:config` |

A tornado itself isn't saved: if the realm restarts during one, it's gone, and no Storm Glass drops.

### How it works

- `weatherChange` in the overworld: a change to `Thunder` rolls `chance` once and schedules the tornado `formAfter` seconds later. A check every 5 s forms it: it picks a random Overworld player and tries 16 spots `formDistance` away (the last 8 at half the distance, in case the far chunks aren't loaded), keeping spots at least `avoidSpawn` from spawn whose ground (`getTopmostBlock`, looking under low plants) is grass, dirt, coarse dirt, podzol, sand or red sand, so not water, leaves, stone or a build. A failed attempt is retried every 10 s, up to 12 times, while the thunderstorm lasts.
- While a tornado exists one loop runs every 2 ticks: it moves the funnel, draws a slice of the rings for each nearby player with `Player.spawnParticle` (`realm:sky_tornado` with `variable.radius` and `variable.spin`, `realm:sky_debris` with `variable.radius`), and every 4 ticks pushes entities with `applyImpulse` (speeds capped at 0.6 blocks per tick sideways and 0.35 up, at most 40 entities per run) and players with `applyKnockback`. Once a second it wanders, finds the ground under it, warns and plays sounds (`Player.playSound`, from the tornado's direction). The loop stops when the tornado ends.
- Blocks are only ever read, never changed. Safe zones come from the safe zones protocol (`realm:zones`), kept in memory.
- Script events: `realm:sky_event` `{ kind: "tornado", dim, x, z, text }` when it forms, `realm:journal` `{ player, page: "weather", entry: "tornado", label: "Tornado" }` once per player who sees it.

---

## Rainbows & the Pot of Gold — `rainbow_bp`

When rain clears in the morning or the evening, a big rainbow often arches across the sky, and it really does end somewhere: a pot of gold waits at its foot, 150 to 300 blocks away. Race your friends to it. The first one there gets Crowns, the chest of gold and dyes, and sometimes a relic. The rainbow is a real thing in the world: one fixed arc, one foot standing on the pot of gold under a golden light beam, so walking toward it brings you closer. It's drawn with particles from [Realm Skies](#realm-skies--sky_rp): without that resource pack there's no rainbow or beam to see, but the chat hint, `/realm:rainbow` and the pot of gold still work.

### How to use

1. When the rain stops in the morning (time 0-3000) or the evening (9000-12000), there's a good chance (`chance`, 0.7) of a rainbow. Chat says where its end is, for example `§eA rainbow! Its end is somewhere to the NE: look for the golden beam where it touches the ground.`
2. Look that way, with the sun at your back: the rainbow stands on the horizon, and a golden beam of light rises from the foot that ends at the pot. The rainbow stays up for 2.5 minutes (`durationSeconds`); the beam stays as long as the pot can be found. Run `/realm:rainbow` any time to see which way its end is from where you stand (a direction only, no distance, so it stays a race).
3. Head for the beam. The rainbow doesn't move: it grows as you get closer, and you can walk around it. Within 40 blocks a **chest** appears at the foot of the beam.
4. The first player to get within 3 blocks of it wins: `§6+50 Crowns §7(Pot of gold)` and everyone reads `§6Ann found the pot of gold at the rainbow's end!` The chest is yours to empty: gold ingots and nuggets, rare dyes, maybe a golden apple or emeralds. Sometimes (`relicChance`, 0.1) a relic comes with it.
5. Missed the rainbow? The pot stays findable for 15 minutes (`potMinutes`) after it appeared: `/realm:rainbow` says `The rainbow has faded, but its pot of gold is still out there, somewhere to the NE, under a golden beam.` Follow the beam.
6. **Operators:** add [Realm Skies](#realm-skies--sky_rp) under **Resource Packs** so players can see the rainbow. `/realm:rainbow_now` puts a rainbow up right away, with its pot of gold 150 to 300 blocks from you. `/realm:config` → **Rainbows & the Pot of Gold** enables or disables rainbows after rain and sets the chance, how long rainbows and pots last, the Crowns and relic chance, the distance kept from spawn and the rainbow's size.

### What players see

- **The rainbow:** one arc standing in the world, the same for everyone: a half circle `size` (80) blocks wide foot to foot and about half as tall, in seven soft color bands (red outside, violet inside), standing upright across the line of sight of the player it appeared for (so they see it side on; from elsewhere you see it at an angle, and from its ends edge on). One foot stands on the pot of gold; the other is `size` blocks away. Its feet stand on the ground at the pot's spot (until that spot is loaded, at the surface where the player it appeared for stood). Like a real one, it's opposite the sun: in the west in the morning, in the east in the afternoon and evening (at night, opposite the moon). It's built from glowing dots, 57 per band. Parts within 48 blocks of you are drawn at their real spot; farther parts are drawn 48 blocks out on the same line of sight and scaled down, so they look exactly as big and in the same place, but stay clear of fog and unloaded chunks. From more than 100 blocks away, the bands are drawn bolder (up to 3 times as wide, with fewer dots), so it stays easy to see from far off. Players more than 512 blocks from it, deeper than 24 blocks under the surface, or in the Nether or the End, don't see it, and nobody sees it without [Realm Skies](#realm-skies--sky_rp).
- **The beam:** a golden light beam, like a beacon's, rising about 64 blocks (`size` x 0.8) from the pot of gold (from the top of its chest once it's placed), thinning toward the top and drawn bolder from far away like the rainbow. It stays until the pot is found or can no longer be found.
- **The pot of gold:** its spot is picked 150 to 300 blocks (`distance`) from a random player in the Overworld, within 45 degrees of straight opposite the sun (any direction if 6 tries there fail), at least `avoidSpawn` (64) blocks from the world spawn and outside every safe zone (Safe Zones, towns protected from world events, land claims), and its chest is never placed inside one. The chest is only placed when someone gets within 40 blocks (the ground there has to be loaded to check it): on natural ground (grass, dirt, sand, stone, snow and the like, not water or leaves), at the rainbow's end or up to 12 blocks from it, and never where a scan of the 9 x 9 columns around it (4 blocks above and below the ground) finds a player-made block (planks, glass, chests, beds, torches, doors, fences, wool, concrete, glazed terracotta, crafting tables, furnaces and the like). If there's no such spot, there's no chest, and the first player to reach the end on the ground gets the loot straight into their inventory instead.
- **The finder:** the first player (not in spectator mode) within 3 blocks of the chest gets `crowns` (50) Crowns on the shared `crowns` scoreboard (`§6+50 Crowns §7(Pot of gold)`; the Crowns pack shows balances, and the Crowns are paid without it too), a level-up sound, and with `relicChance` a relic picked from `relics` (the Relics pack hands it out; without that pack nothing happens). Everyone reads `§6Ann found the pot of gold at the rainbow's end!` Later players find the chest, but no Crowns.
- **The chest's loot** (`loot`): 3-8 gold ingots and 8-24 gold nuggets always; each of magenta, cyan, pink, light blue and lime dye (1-4) at 40%; a golden apple at 30%; 1-3 emeralds at 25%. Put in random slots.
- **Afterwards:** when the pot expires (`potMinutes` after the rainbow appeared), an empty pot chest is removed if that spot is loaded; a chest that still holds anything is never removed.
- **Journal:** every player who sees the rainbow gets the **Rainbow** page in their journal (Journal pack), and innkeepers' **Hear the news** ([Waystones & Inns](#waystones--inns--waystone_bp)) passes it on (the `realm:sky_event` script event).

### Commands

| Command | Who | What it does |
|---|---|---|
| `/realm:rainbow` | Everyone | Whether a rainbow is up, and which way its end is from you (`§eA rainbow is up! Its end is somewhere to the NE, under a golden beam.`); after it fades, whether its pot of gold is still out there and which way, or who found it |
| `/realm:rainbow_now` | Operators | A rainbow now, in any weather and at any time, for `durationSeconds` (150), with its pot of gold 150-300 blocks from you. An earlier pot is replaced: its chest stays if it still holds anything, an empty one is removed |

### Configuration (`scripts/config.js` → `CONFIG`)

| Option | Default | Description |
|---|---|---|
| `enabled` | `true` | Rainbows appear on their own after rain (`/realm:rainbow_now` works either way) |
| `chance` | `0.7` | Chance (0-1) of a rainbow when rain clears in the morning (time 0-3000) or the evening (9000-12000) |
| `durationSeconds` | `150` | Seconds a rainbow stays in the sky |
| `distance.min` | `150` | Closest its end is to the chosen player, in blocks |
| `distance.max` | `300` | Farthest its end is from the chosen player, in blocks |
| `avoidSpawn` | `64` | The pot of gold is never placed closer than this many blocks to the world spawn |
| `size` | `80` | The rainbow's width in blocks, foot to foot (it's about half as tall; each color band is `size` / 80 blocks wide). Also sets the beam's height (`size` x 0.8) |
| `potMinutes` | `15` | Minutes the pot of gold can be found after the rainbow appears; then an empty pot chest is removed |
| `crowns` | `50` | Crowns for the first player to reach the pot of gold |
| `relicChance` | `0.1` | Chance (0-1) the finder also gets a relic (needs the Relics pack) |
| `relics` | `["sun_pendant", "rain_charm"]` | Relic ids the pot of gold can give, one picked at random |
| `loot` | gold ingots, gold nuggets, dyes, golden apple, emeralds | What goes in the chest: each entry's `item`, put in with its `chance` (0-1), a random amount from `min` to `max` |

Operators can change `enabled`, `chance`, `durationSeconds`, `potMinutes`, `crowns`, `relicChance`, `avoidSpawn` and `size` in game with `/realm:config` when Realm Settings is installed. The other options stay in `config.js`.

### Saved data

| Key | Scope | Contents |
|---|---|---|
| `rainbow:pot` | World | The current rainbow and its pot of gold: JSON with its spot, the arc's direction and ground height, when the rainbow fades and the pot expires, whether its chest was placed (or couldn't be), and who found it. Cleared when the pot expires |
| `rainbow:cfg` | World | Settings changed in `/realm:config` |
| `crowns` scoreboard | Player | Crowns paid to the finder (shared with the other packs that use Crowns) |

### How it works

- `weatherChange` in the overworld from `Rain` or `Thunder` to `Clear`, at time 0-3000 or 9000-12000, rolls `chance` (skipped while an earlier pot is still unfound). The end's spot is tried up to 12 times at a random angle and distance from a random Overworld player, skipping spots near spawn and, when that chunk happens to be loaded, water.
- The end's direction: `antisolarAngle` in `scripts/sky.js` gives west (light from the east: time 22000-6000, or the moon at 12000-18000) or east (otherwise), and the end is tried within 45 degrees of it.
- The arc's plane (`arcAngle` in `scripts/sky.js`) is at right angles to the line from the player it appeared for to its end, turned left or right at random; it's saved with the pot, so it never moves. Its ground height is the surface at the end when that chunk is loaded, else that player's surface (at least 63); the first time the end's chunk is loaded it's set to the surface there (once), and when the chest is placed the arc's foot and the beam move onto the chest (up to 12 blocks).
- Every second, for each Overworld player within 512 blocks and not deep underground, `scripts/sky.js` (plain math, no game imports) gives every dot of the arc (`arcDots`: 7 bands x 57 points, each band `size` / 80 blocks apart, dots 1.25 band widths in radius) and 16 beam segments (`beamSegments`), and `toward` puts any farther than 48 blocks from the player's eyes 48 blocks out on the same line, with its size scaled by 48 / distance. From more than 100 blocks from the arc's middle, everything is drawn up to 3 times bolder with a third as many points (`boldness`). Dots go out with `Player.spawnParticle`: `realm:sky_rainbow_band` (`variable.size`, `variable.life`, `variable.cr`/`cg`/`cb` the band's color) and `realm:sky_rainbow_beam` (`variable.size`, `variable.height`, `variable.alpha`, `variable.life`). Stand-ins last 1.5 s and are redrawn every second (they move as you do); dots at their real spot are redrawn every other second and last 2.6 s, so a player gets at most about 415 particles a second. Dots in unloaded chunks (checked once per chunk per drawing) or outside the world's height are skipped.
- `weatherChange`'s dimension is matched with or without `minecraft:` (the game sends `overworld`; before 1.1.0 the pack only took `minecraft:overworld`, so no rainbow ever followed rain). In an unloaded chunk `getTopmostBlock` can return a block whose properties throw; before 1.1.0 that stopped `/realm:rainbow_now` before the rainbow was made whenever its end was out of loaded range. Both are read inside a `try` now.
- Safe zones: the pack keeps the latest `realm:zones` `{ src, part, parts, zones: [{ dim, x, z, r, shape? }] }` list of each provider (parts numbered from 1 or 0 and joined; `parts` 0 clears that provider; `shape: "square"` zones, like land claims, cover their corners too), asks with `realm:zones_ping` 2 seconds after the world loads, and skips rainbow ends and chest spots inside any Overworld zone.
- Every second: a player within 40 blocks of the end starts a `system.runJob` that looks for the chest's spot (the build scan reads at most 810 blocks per spot, a column at a time, over several ticks), places a `minecraft:chest` and fills it. A player within 3 blocks of it is the finder. A pot past `potMinutes` is cleared.
- Script events: `realm:sky_event` `{ kind: "rainbow", dim, x, z, text }` when it appears, `realm:journal` `{ player, page: "weather", entry: "rainbow", label: "Rainbow" }` once per player who sees it, `realm:relic_give` `{ player, relic }` on a relic roll.

---

## Aurora & Shooting Stars — `night_bp`

Clear nights in the Overworld get a sky show. Every so often a shooting star streaks across the sky; sneak right after one to make a wish. On some nights, the northern lights ripple in green and purple curtains over snowy lands. The show is drawn with particles from [Realm Skies](#realm-skies--sky_rp): without that resource pack there's nothing to see.

### How to use

1. On a clear night (no rain), step outdoors in the Overworld and look up: every 15 to 30 seconds a shooting star streaks across the sky, usually somewhere in front of you.
2. **Make a wish:** sneak within 3 seconds after a shooting star. Chat says `§bYou made a wish.` and you get Hero of the Village I for 5 minutes (better prices from villagers). One wish per night.
3. On an aurora night (`aurora.chance`, 0.4 of nights), stand on or near snowy ground (snow or ice on top) and look north: rippling curtains of green, teal and purple light hang high over the northern sky.
4. Rather not see it, on a slower device for example? Run `/realm:night`, or use **Night sky show** in `/realm:prefs`. Chat says `Night sky (aurora and shooting stars): Disabled. Run /realm:night again to enable it.` The choice is remembered.
5. **Operators:** add [Realm Skies](#realm-skies--sky_rp) under **Resource Packs** so players can see the show. `/realm:config` → **Aurora & Shooting Stars** enables or disables the whole show, the shooting stars, wishes and the aurora, and sets the aurora chance, the time to make a wish, and whether new players start with the show on.

### What players see

- **When:** at night (time 13000-23000), in clear weather, for each player in the Overworld who is outdoors: nothing at all (not even leaves) over their head. Under a roof or a tree, in caves, in the Nether or the End, it pauses.
- **Shooting stars:** for each player, one every 15 to 30 seconds (`stars.every`), at a random time of its own: a bright streak with a fading trail, 60 to 100 blocks away and 50 to 80 blocks up, mostly in the direction you're looking (7 in 10), moving 35 to 55 blocks a second in a random direction, slightly downward, for about a second. Each player gets their own stars.
- **Wishes:** sneaking within `wish.windowSeconds` (3) seconds after one of your stars gives `wish.effect` (Hero of the Village, level I) for `wish.minutes` (5) minutes, once per night. Bedrock has no Luck effect, so the wish brings luck with traders instead.
- **The aurora:** each night is an aurora night with `aurora.chance` (0.4), rolled once. On aurora nights, players within `aurora.snowRadius` (16) blocks of snowy ground (snow, snow layers, powder snow or ice on top, checked every 10 s) see a curtain of `aurora.segments` (9) tall ribbon segments in a row 180 blocks wide, about 100 blocks north of them and 60 to 90 blocks up, waving north and south and up and down, its color drifting from green to purple along it and through the night. It's redrawn every `aurora.refreshSeconds` (4) seconds, each segment fading in and out over 2 seconds, so it ripples without gaps. It moves with you.
- **Journal:** the first shooting star and the first aurora you see add the **Shooting star** and **Aurora** pages to your journal (Journal pack), and innkeepers' **Hear the news** ([Waystones & Inns](#waystones--inns--waystone_bp)) passes on the first aurora of a night (the `realm:sky_event` script event).

### Commands

| Command | Who | What it does |
|---|---|---|
| `/realm:night` | Everyone | Enables or disables the night sky show (shooting stars and aurora) **for yourself** (on by default, `defaultOn`). Remembered between sessions |

### Configuration (`scripts/config.js` → `CONFIG`)

| Option | Default | Description |
|---|---|---|
| `enabled` | `true` | The night sky show: shooting stars and the aurora on clear nights |
| `aurora.enabled` | `true` | Northern lights over snowy ground on aurora nights |
| `aurora.chance` | `0.4` | Chance (0-1) that a night is an aurora night, rolled once each night |
| `aurora.segments` | `9` | Ribbon segments in the curtain, side by side |
| `aurora.refreshSeconds` | `4` | Seconds between redraws of the curtain (each segment lasts 2 s longer) |
| `aurora.snowRadius` | `16` | A player counts as on snowy ground when snow or ice is on top within this many blocks |
| `stars.enabled` | `true` | Shooting stars for players outdoors on clear nights |
| `stars.every.min` | `15` | Shortest time between a player's shooting stars, in seconds |
| `stars.every.max` | `30` | Longest time between a player's shooting stars, in seconds |
| `wish.enabled` | `true` | Sneaking just after a shooting star makes a wish, once a night |
| `wish.windowSeconds` | `3` | Seconds after a shooting star that sneaking still counts as a wish |
| `wish.minutes` | `5` | Minutes the wish's effect lasts |
| `wish.effect` | `"village_hero"` | The effect a wish gives, level I (Bedrock has no Luck effect) |
| `defaultOn` | `true` | The show for players who never ran `/realm:night` |

Operators can change `enabled`, `stars.enabled`, `wish.enabled`, `aurora.enabled`, `aurora.chance`, `wish.windowSeconds` and `defaultOn` in game with `/realm:config` when Realm Settings is installed. Each player can switch the show for themselves with **Night sky show (aurora and shooting stars)** in `/realm:prefs` (the same switch as `/realm:night`), which follows `defaultOn` until they choose. The other numbers stay in `config.js`.

### Saved data

| Key | Scope | Contents |
|---|---|---|
| `night:weather` | World | The overworld weather at the last change: `Clear`, `Rain` or `Thunder` (the stable Script API can't read the current weather) |
| `night:aurora` | World | JSON `{ n, on }`: the night (day number) of the last aurora roll and whether it's an aurora night |
| `night:wish` | Player | The night (day number) the player last made a wish |
| `night:pref` | Player | JSON of the player's own `/realm:night` choice, when it differs from `defaultOn` |
| `night:cfg` | World | Settings changed in `/realm:config` |

### How it works

- A check once a second, only on clear nights: one `getTopmostBlock` above each Overworld player tells outdoors, plus 5 more every 10 s on aurora nights for snowy ground. If the pack is added while it is raining, it counts the weather as clear until the next weather change.
- Particles use `Player.spawnParticle`, so each player sees only their own: `realm:sky_star` (`variable.dx`, `variable.dy`, `variable.dz` velocity, `variable.life`) and `realm:sky_aurora` (`variable.size` height, `variable.life`, `variable.hue` 0 green to 1 purple). If a star's or an aurora segment's spot isn't loaded, that one is drawn closer and smaller.
- Wishes use `playerButtonInput` (sneak pressed) and the time of that player's last star.
- Script events: `realm:journal` `{ player, page: "weather", entry: "shooting_star" | "aurora", label }` once per player per session, `realm:sky_event` `{ kind: "aurora", dim, text }` once per aurora night.

---

## Meteor Strikes — `meteor_bp`

Some nights a meteor falls. Chat gives a minute's warning and the coordinates, then a fiery streak crosses the sky for everyone in the Overworld and comes down with a boom you feel. Where it lands it leaves a small smoking crater with a meteorite core of ancient debris in magma, for whoever gets there first. Meteors land far from spawn, never in builds (a crater only replaces natural ground) and never in a safe zone, protected town or claim. The streak and the smoke come from [Realm Skies](#realm-skies--sky_rp): without that resource pack you still get the warning, the boom and the crater, but no streak or smoke.

### How to use

1. Some nights (`chance`, 0.33), at a random time, chat warns everyone: `§6A meteor is falling! It will land near 1240, -380 in 60 seconds.`
2. Look up: a few seconds before it lands, a glowing meteor with a fiery trail streaks down from the sky toward the spot. Near it you hear the explosion and the thunder and the screen shakes; far away you hear a distant rumble.
3. Go find it: at the spot (or a few blocks from it) there's a crater about 7 to 9 blocks across, lined with blackstone, magma and obsidian, still smoking, with 1 to 3 **ancient debris** in its middle. Bring a diamond pickaxe or better. The first player to reach it is announced: `§6Ann found the meteor crater!`
4. Run `/realm:meteor` for the menu: it says whether a meteor is falling or where the last one fell, and **Last meteors** lists the last 5, how far each is from you and who found its crater. `/realm:meteor_info` says the same as the menu's top line, in chat.
5. **Operators:** add [Realm Skies](#realm-skies--sky_rp) under **Resource Packs** so players can see the streak and smoke. In `/realm:meteor`: **Drop one now** (or `/realm:meteor_now`) drops a meteor 100 blocks in front of you, after the usual warning; **Meteor settings** enables or disables meteors at night and craters, and sets the chance, the warning time, the distance kept from spawn, **Avoid safe zones and towns** and what a meteor does over a safe zone (the same settings as `/realm:config` → **Meteor Strikes**); **Protect this area from meteors** opens [Safe Zones](#safe-zones--zones_bp)' **Add a safe zone here** where you stand.

### What players see

- **Each night** (time 13000-23000) the pack rolls `chance` once. On a yes, the warning comes at a random time that still lets the meteor land before dawn, aimed at a spot 200 to 600 blocks (`distance`) from a random player in the Overworld and at least `avoidSpawn` (64) blocks from the world spawn. Everyone online gets the warning, `warningSeconds` (60) seconds ahead.
- **The streak** (the last 3 seconds): every player in the Overworld sees `realm:sky_meteor` come down at a slant. Within 110 blocks it's the real meteor falling onto the spot; farther away it's drawn 110 blocks away (closer and smaller if that isn't loaded) toward the impact, landing just over your horizon. Where the start of its path isn't loaded, the streak starts partway down.
- **The boom:** within `shakeDistance` (200) blocks, an explosion and thunder from the impact's direction and a camera shake (stronger the closer you are, for 2 seconds); out to 1,000 blocks, a distant rumble.
- **The crater:** a bowl `craterRadius` (3-4) blocks in radius, up to 3 blocks deep, lined with blackstone, magma and obsidian bits, with `ancientDebris` (1-3) ancient debris and magma at the center. It only removes or replaces natural blocks (dirt, grass, stone, sand, gravel, snow, ores, natural leaves and plants); logs, water, leaves a player placed and everything else stay as they are. It smokes (`realm:sky_meteor_smoke`) for `smokeSeconds` (120) seconds.
- **Where a crater can go:** the game can only change loaded ground, so if no one is near when it lands, the crater is made when a player first comes within `craterDistance` (64) blocks, and smokes from then on. Before making it, the pack checks the spot: natural ground (not water or lava), at least `avoidSpawn` from spawn, and no player-made block (planks, glass, chests, beds, torches, doors, fences, wool, concrete, bricks, glazed terracotta, crafting tables, furnaces, farmland and the like) in a scan of the 9 x 9 columns around it, 4 blocks above and below the ground (leaves a player placed count as player-made). If part of that area isn't loaded yet, the crater waits until a player comes closer. If the spot fails, up to 8 other spots within 24 blocks are tried; if they all fail, nearby players read `§7The meteor burned up before it reached the ground.` and there's no crater.
- **Found:** the first player within `foundDistance` (12) blocks of a crater is announced to everyone (`§6Ann found the meteor crater!`), and every player who reaches it gets the **Meteor crater** page in their journal (Journal pack).
- With `craters` disabled, a meteor is only the show: the warning, the streak, the boom and the smoke.
- **Safe zones** ([Safe Zones](#safe-zones--zones_bp), towns with **Protect from world events**, claims with **Protect claims from world events**), with **Avoid safe zones and towns** (`avoidZones`, default enabled): a night's meteor is never aimed where its crater could reach into a zone (within 5 blocks of one), the crater spot check rejects such spots, and the carving skips any block inside a zone. A meteor that still comes down over a zone (an operator's **Drop one now** aimed at one, or a zone added while it falls) does what **A meteor over a safe zone** (`inZone`) says:
  - `move` (default): it lands just outside the zone instead, crater, ancient debris and all; the warning gives the new spot. A zone added after it landed moves its waiting crater out of the zone the same way.
  - `burst`: the warning says `A meteor is falling toward Home, near 1240, -380! The safe zone will stop it in the sky in 60 seconds.`, the streak ends 40 blocks above the ground in a flash and smoke with a loud blast, and chat says `The meteor burst in the sky over Home. The safe zone kept the ground safe.` No crater, no ancient debris.
  With `avoidZones` disabled, meteors ignore safe zones.

### Commands

| Command | Who | What it does |
|---|---|---|
| `/realm:meteor` | Everyone | Opens the Meteor Strikes menu: what's falling or where the last meteor fell, and **Last meteors**; operators also get **Drop one now**, **Meteor settings** (meteors at night, chance, warning time, craters, distance kept from spawn, avoid safe zones, what a meteor does over one) and **Protect this area from meteors** (needs Safe Zones) |
| `/realm:meteor_info` | Everyone | While one is falling, where it will land and in how many seconds; otherwise where the last meteor fell (with its height once its crater is made) and who found its crater, or `No meteor has fallen yet.` |
| `/realm:meteor_now` | Operators | A meteor falls `nowDistance` (100) blocks in front of you after the usual `warningSeconds` warning, in any weather or time (pushed out past `avoidSpawn` if that's near spawn, and out of safe zones or set to burst by `inZone`). One at a time |

### Configuration (`scripts/config.js` → `CONFIG`)

| Option | Default | Description |
|---|---|---|
| `enabled` | `true` | Meteors fall on their own at night (`/realm:meteor_now` works either way) |
| `chance` | `0.33` | Chance (0-1) of a meteor each night, rolled once a night |
| `distance.min` | `200` | Closest it lands to the chosen player, in blocks |
| `distance.max` | `600` | Farthest it lands from the chosen player, in blocks |
| `nowDistance` | `100` | How far in front of the operator `/realm:meteor_now` aims, in blocks |
| `avoidSpawn` | `64` | It never lands closer than this many blocks to the world spawn |
| `warningSeconds` | `60` | Seconds between the chat warning and the impact |
| `avoidZones` | `true` | Meteors keep out of safe zones (Safe Zones, protected towns and claims): none is aimed into one and no crater block is changed in one. Disabled, they ignore safe zones |
| `inZone` | `"move"` | A meteor that still comes down over a safe zone: `move` lands it just outside the zone, `burst` blows it apart in the sky (no crater) |
| `craters` | `true` | Make a crater with a meteorite core; disabled, a meteor is only the show |
| `craterRadius.min` | `3` | Smallest crater radius, in blocks |
| `craterRadius.max` | `4` | Largest crater radius, in blocks |
| `ancientDebris.min` | `1` | Fewest ancient debris in the core |
| `ancientDebris.max` | `3` | Most ancient debris in the core |
| `craterDistance` | `64` | A crater is made when a player is within this many blocks of where the meteor landed (at once, or later) |
| `shakeDistance` | `200` | Players within this many blocks get the camera shake and the full boom |
| `smokeSeconds` | `120` | Seconds the crater smokes after it's made |
| `foundDistance` | `12` | Players this close to the crater have found it |

Operators can change `enabled`, `chance`, `warningSeconds`, `craters`, `avoidSpawn`, `avoidZones` and `inZone` in game with **Meteor settings** in `/realm:meteor`, or with `/realm:config` when Realm Settings is installed. The other numbers stay in `config.js`.

### Saved data

| Key | Scope | Contents |
|---|---|---|
| `meteor:night` | World | JSON `{ n, at }`: the night (day number) the meteor was last rolled for, and the time of day of tonight's warning (`-1` for none) |
| `meteor:impacts` | World | JSON list of the last 5 meteors: where each landed, whether its crater is made, still waiting for a player to come near, or couldn't be made, or whether it burst over a safe zone (and which), and who found it |
| `meteor:cfg` | World | Settings changed in `/realm:config` |

### How it works

- A check every 5 s rolls the night once (saved, so a restart doesn't roll again) and launches the meteor when its time comes, waiting for someone to be in the Overworld. The target is a random angle and distance from a random player, retried (up to 12 times) when it's near spawn or, if that chunk happens to be loaded, on water.
- The fall is timed in ticks: 3 s before impact each player gets `realm:sky_meteor` (`variable.dx`, `variable.dy`, `variable.dz` velocity, `variable.life`, and `variable.size` for the smaller stand-ins) with `Player.spawnParticle`. At impact, sounds are played to each player from the impact's direction, and `camerashake add @s <intensity> 2 positional` runs for players within `shakeDistance`.
- Every 2 s, waiting craters with a player within `craterDistance` are made by a `system.runJob` job: the spot check (81 topmost blocks and 729 blocks per spot, a column at a time over several ticks), then the carving, a column at a time. Smoke is a dimension particle once a second at the crater. A meteor still falling when the realm stops counts as landed (crater waiting) when it starts again.
- Script events: `realm:sky_event` `{ kind: "meteor", dim, x, z, text }` with the warning, `realm:journal` `{ player, page: "weather", entry: "meteor", label: "Meteor crater" }` once per player (per session) who reaches a crater.

---

## Blood Moon & Harvest Moon — `moon_bp`

Some full moons are special. About one in three rises as a **Blood Moon**: a red sky, more monsters all night, and a reward for everyone who makes it to dawn without dying. About one in three of the rest is a **Harvest Moon**: a golden sky and crops that grow three times as fast until morning.

### How to use

1. At dusk on a full moon, watch the screen: `Blood Moon` (`Survive until dawn`) or `Harvest Moon` (`Crops grow faster tonight`) appears with a sound, and chat says what it means. Most full moons are still ordinary.
2. **Blood Moon:** outdoors the sky turns dark red and red motes drift up around you. Every 20 seconds a zombie, skeleton, spider or creeper or two appears 16 to 32 blocks away, never inside or next to anything built. Stay online from dusk to dawn without dying, and at dawn you get 3 levels and 25 Crowns (`You survived the Blood Moon!`), plus the **Blood Moon Survivor** title the first time (with the Titles pack). Blood Moon monsters drop extra experience orbs, and the ones still around at dawn vanish.
3. **Harvest Moon:** the sky turns soft gold, golden motes drift around you, and crops, saplings and grass grow three times as fast until dawn. A good night to stand by the farm.
4. Run `/realm:moon` to see tonight's moon, the moon phase and how many days until the next full moon (`/realm:moon_info` says the same in chat).
5. In a safe zone ([Safe Zones](#safe-zones--zones_bp), protected towns and claims) the Blood Moon sends no creepers, so it can't blow holes in a protected base; other monsters still come.
6. **Operators:** `/realm:moon` has **Make tonight a Blood Moon**, **a Harvest Moon** and **an ordinary moon**; `/realm:moon_set <blood|harvest|normal>` does the same from chat. Either makes tonight a Blood Moon, a Harvest Moon or an ordinary night: at once if it's night, else at dusk. `/realm:config` → **Blood Moon & Harvest Moon** sets the chances, the monster waves, the survivor reward and the Harvest Moon's growth speed. Add [Realm Skies](#realm-skies--sky_rp) under **Resource Packs** for the red and gold skies and the motes.

### What players see

- **At dusk** (time 12000, `duskTime`) on a full moon, tonight's moon is decided: a Blood Moon with a 34% chance (`bloodChance`), else a Harvest Moon with a 34% chance (`harvestChance`), else an ordinary night. The full moon comes every 8 in-game days, so a Blood Moon comes about every 24 days and a Harvest Moon about every 36.
- **The announcement:** overworld players see the title and hear a sound (a low wither roar for a Blood Moon, a chime for a Harvest Moon); chat tells everyone `A Blood Moon rises. More monsters roam tonight. Survive until dawn without dying: 3 levels and 25 Crowns.` or `A Harvest Moon rises. Crops grow faster until dawn.` At dawn (time 23000, `dawnTime`), `The Blood Moon sets.`
- **Blood Moon sky:** the `realm:sky_blood_moon` fog for players outdoors in the overworld (under trees counts as outdoors), lifted under a roof, while it rains (the clouds hide the moon, and the rain's own fogs stay in charge) and at dawn, and a few `realm:sky_blood` motes around you every 3 seconds.
- **Blood Moon monsters:** every 20 seconds (`blood.spawnSeconds`) 1 or 2 (`blood.spawnMin`, `blood.spawnMax`) monsters per player, picked from `blood.mobs` (zombies most often, then skeletons, spiders and creepers), 16 to 32 blocks away (`blood.minDistance`, `blood.maxDistance`), on the open surface. No new ones while 8 (`blood.maxExtraPerPlayer`) are already alive within 48 blocks of you. None for players in creative or spectator mode, on Peaceful, or with the `doMobSpawning` gamerule off.
- **Never in a base:** monsters only appear on the topmost block of a column (outdoors), at most 16 blocks above or below you, not on leaves, glass, slabs, stairs, fences, walls, carpets, ice, cactus, magma or campfires, not within 12 blocks of any player, not within 64 blocks of world spawn (`avoidSpawn`), and not where the 9 x 9 columns around the spot, 4 blocks up and down, hold anything player-made: planks, any glass, chests, barrels, signs, beds, torches, lanterns, doors, fences, wool, carpets, concrete, glazed terracotta, bricks, crafting tables, furnaces, rails, redstone parts and the like. The Script API can't read Land Claims or light levels, so this is how claims and lit bases are kept out.
- **Bonus experience:** each Blood Moon monster a player kills drops 3 extra experience orbs (`blood.bonusXpOrbs`).
- **Safe zones:** a Blood Moon monster that would spawn inside a safe zone is never a creeper (another monster from `blood.mobs` instead), unless `blood.creepersInZones` is enabled.
- **Surviving:** players online at dusk are in the running; dying or leaving takes you out (`You died during the Blood Moon: no survivor reward this time.`). At a natural dawn everyone still in gets 3 levels (`blood.rewardLevels`), 25 Crowns (`blood.rewardCrowns`, on the `crowns` scoreboard of the [Crowns](#crowns--crowns_bp) pack, shown in chat as `+25 Crowns (Blood Moon survived)`) and, the first time, the `Blood Moon Survivor` title (`blood.title`) from the [Titles](#titles--trails--titles_bp) pack. Skipping the night by sleeping (or `/time`) skips the reward too.
- **Harvest Moon:** the `randomTickSpeed` gamerule goes up to 3 (`harvest.tickSpeed`; vanilla is 1) until dawn, then back to what it was. If the realm closes during a Harvest Moon, it's put back when the realm starts. The `realm:sky_harvest_moon` fog outdoors (not while it rains) and `realm:sky_harvest` motes around you.
- **The Journal** records the first Blood Moon and Harvest Moon each player sees in the overworld on its weather page (`blood_moon`, `harvest_moon`).
- **`/realm:moon`** (the menu's text, and `/realm:moon_info`) says, for example, `Tonight is a full moon: it may rise as a Blood Moon or a Harvest Moon.` and `Moon phase: Full Moon. Next full moon: tonight.`, or during one `Tonight is a Blood Moon: more monsters roam. Survive until dawn without dying for a reward.`

### Commands

| Command | Who | What it does |
|---|---|---|
| `/realm:moon` | Everyone | Opens the moon menu: tonight's moon, the moon phase and the days until the next full moon; operators also make tonight a Blood Moon, a Harvest Moon or an ordinary moon |
| `/realm:moon_info` | Everyone | Tonight's moon (Blood Moon, Harvest Moon or ordinary), the moon phase and the days until the next full moon, in chat |
| `/realm:moon_set <blood\|harvest\|normal>` | Operators | Makes tonight a Blood Moon, a Harvest Moon or an ordinary night: right away if it's night (dusk 12000 to dawn 23000, `duskTime`, `dawnTime`), else from the next dusk, full moon or not |

### Configuration (`scripts/config.js` → `CONFIG`)

| Option | Default | Description |
|---|---|---|
| `enabled` | `true` | Full moons can rise as a Blood Moon or a Harvest Moon. Disabled, every night is ordinary (and one in progress ends) |
| `bloodChance` | `0.34` | Chance (0–1) that a full moon is a Blood Moon |
| `harvestChance` | `0.34` | Chance (0–1) that a full moon that isn't a Blood Moon is a Harvest Moon |
| `duskTime` | `12000` | The night starts at this time of day (ticks; 12000 is sunset) |
| `dawnTime` | `23000` | The night ends at this time of day (23000 is sunrise) |
| `avoidSpawn` | `64` | No Blood Moon monsters within this many blocks of world spawn |
| `blood.spawnSeconds` | `20` | Seconds between waves of extra monsters around each player |
| `blood.spawnMin` | `1` | Fewest monsters per wave, per player |
| `blood.spawnMax` | `2` | Most monsters per wave, per player |
| `blood.minDistance` | `16` | Closest a monster appears to the player, in blocks |
| `blood.maxDistance` | `32` | Farthest a monster appears from the player, in blocks |
| `blood.maxExtraPerPlayer` | `8` | No new waves around a player while this many Blood Moon monsters are alive within 48 blocks |
| `blood.mobs` | zombie 4, skeleton 3, spider 2, creeper 2 | The monsters and their weights: `{ id, weight }`, a higher weight is picked more often |
| `blood.creepersInZones` | `false` | Blood Moon creepers can spawn inside safe zones (Safe Zones, protected towns and claims). Disabled, another monster comes instead |
| `blood.bonusXpOrbs` | `3` | Extra experience orbs from each Blood Moon monster a player kills |
| `blood.rewardLevels` | `3` | XP levels for each survivor |
| `blood.rewardCrowns` | `25` | Crowns for each survivor. `0` = none |
| `blood.title` | `Blood Moon Survivor` | The title unlocked the first time a player survives one. Empty = none |
| `harvest.tickSpeed` | `3` | The `randomTickSpeed` gamerule during a Harvest Moon. If it's already that high or higher, it isn't changed |

Operators can change `enabled`, `bloodChance`, `harvestChance`, `avoidSpawn`, `blood.spawnSeconds`, `blood.maxExtraPerPlayer`, `blood.creepersInZones`, `blood.rewardLevels`, `blood.rewardCrowns` and `harvest.tickSpeed` in game with `/realm:config` when Realm Settings is installed. The other options stay in `config.js`.

### Saved data

| Key | Scope | Contents |
|---|---|---|
| `moon:night` | World | JSON `{ d, s, a, alive }`: the day number of tonight, its moon (`blood`, `harvest` or `normal`), `1` while the night is on, and the ids of players still in the running for the survivor reward |
| `moon:pending` | World | The moon an operator chose for the next night with `/realm:moon_set` during the day |
| `moon:tick` | World | JSON `{ was, set }`: `randomTickSpeed` before a Harvest Moon raised it, and what it was raised to. Only set during a Harvest Moon |
| `moon:seen` | Player | Moons already sent to the Journal, such as `blood,harvest` |
| `moon:survivor` | Player | `true` once the player unlocked the survivor title |
| `moon:weather` | World | The overworld weather at the last change (`Clear`, `Rain` or `Thunder`), for the moon fog. The stable Script API can't read the current weather |
| `moon:cfg` | World | Settings changed in `/realm:config` |

### How it works

- Once a second the pack reads the time of day. The first check after dusk on a new day decides tonight's moon (an operator's choice first, else a roll if `world.getMoonPhase()` is 0, a full moon) and sends `realm:moon` `{ state }` (`blood`, `harvest` or `normal`; [Champions](#champions--elite_bp) raise their spawn chance during `blood`) and, for a special moon, `realm:sky_event` `{ kind: "blood_moon" | "harvest_moon", dim, text }`. At dawn it sends `realm:moon` `{ state: "normal" }`.
- A dawn is natural when the previous check was within 10 seconds before `dawnTime`; a jump past it (sleeping, `/time`, a restart) ends the night without rewards.
- Fogs use `/fog @s push realm:sky_blood_moon moon_sky` (or `realm:sky_harvest_moon`) and `/fog @s remove moon_sky`, so only this pack's fog entry is ever touched; outdoors is one `getTopmostBlock` over the player each second. The weather comes from `weatherChange` (saved as `moon:weather`); in rain or thunder the moon fog is off, so it never covers the rain, storm, sandstorm or blizzard fogs of [Rain Extras](#rain-extras--rain_bp) and [Regional Weather](#regional-weather--climate_bp).
- Blood Moon monsters are spawned with `Dimension.spawnEntity` and tagged `realm:moon_mob`. Each try costs one `getTopmostBlock` and one `Dimension.containsBlock` over the 9 x 9 x 9 blocks around the spot (one native call, checking against every player-made block type of the game version). At dawn every tagged monster in loaded chunks is removed; ones in unloaded chunks are removed when they load (`entityLoad`). Kills of tagged monsters drop extra `minecraft:xp_orb`s.
- Survivors: the player ids online at dusk are saved in `moon:night`; `entityDie` and leaving take a player out. The reward adds levels, adds to the `crowns` scoreboard directly, and sends `realm:title_unlock` `{ player, title, from: "moon_bp" }` the first time.
- The Harvest Moon raises `world.gameRules.randomTickSpeed` and saves the old value in `moon:tick`; at dawn (or on the next start if the realm closed first, or when the pack is disabled, or the night is skipped) it's put back, unless an operator changed the gamerule in between. The pack waits for the world to load before its first check, so a restart in the night carries on with the saved moon instead of rolling a new one.
- The first special moon of each kind a player sees sends `realm:journal` `{ player, page: "weather", entry, label }`.

### Known limits

- The moon phase name comes from the game's day count; the phase in the sky can look a little different from the name around the half moons.
- Light levels can't be read, so a Blood Moon monster can appear on a lit spot with no player-made block nearby (lit by lava, say).
- A Blood Moon monster that despawns or wanders off can be replaced by the next wave.
- Removing the pack during a Harvest Moon leaves `randomTickSpeed` raised: set it back with `/gamerule randomtickspeed 1`.

---

## Realistic Rain — `rain_rp`

Thicker, heavier rain that stays blue like vanilla, the realm's own rain and thunderstorm recordings, denser blue-gray rain fog, and smaller, softer splashes. Where it snows, bigger, solid snowflakes and a whiter, denser snow fog. A **resource pack**, part of **Realm Resources** (or on its own), and costs no more frames than vanilla rain.

### See and hear it

![Vanilla](media/rain/rain-vanilla.webp) ![Realistic Rain](media/rain/rain.webp) Rain: vanilla-width streaks, 13 lanes of them instead of 8, and the blue-gray rain fog
![Vanilla](media/rain/storm-vanilla.webp) ![Realistic Rain](media/rain/storm-rain.webp) A thunderstorm with Realistic Rain alone (Rain Extras adds the storm fog, mist and drips)
![Vanilla](media/rain/snow-vanilla.webp) ![Realistic Rain](media/rain/snow.webp) Snowfall: the same flakes in the same number, each one bigger and solid, and the whiter snow fog
![The weather texture: vanilla's 32x32 on the left, Realistic Rain's 128x128 on the right. The snowflakes (top row) and the rain rows differ](media/rain/weather-atlas.png)

[Listen: rain, a distant roll, then a close strike (26 s)](media/rain/rain.mp3)

The pictures are renders, not in-game screenshots: a simple scene drawn with this pack's own texture, fog and splash numbers, with how much rain shows matched to an in-game screenshot. Lighting and Vibrant Visuals aren't modeled, and the snow renders aren't matched to a screenshot: how many flakes fall and how big they look is up to the game, so only the flakes' shape and the fog are this pack's. Each pair is the same spot with vanilla on the left; on mc.nish.software, drag across it to compare. In the clip, the thunder is 12 dB quieter than in game so the rain stays audible.

### How to use

1. Nothing to do as a player: when the realm has it, Minecraft downloads it as you join (accept the resource pack prompt if one appears).
2. Wait for rain, or ask an operator for `/weather rain` or `/weather thunder`. In snowy places (snowy plains, ice spikes, snowy taigas, frozen rivers and oceans, snowy beaches, groves, snowy slopes, and frozen and jagged peaks) the same weather brings the heavier snow and its whiter fog.
3. For storm fog, a darker haze on Vibrant Visuals, ground mist, drips, storm wind, rain on the roof and the rain muffled indoors, the realm also needs [Rain Extras](#rain-extras--rain_bp).
4. **Operators:** it comes with Realm Resources: activate that under **Resource Packs** at the **top** of the active list, above Firewolf and the others, so its rain wins. To use it alone instead, download Realistic Rain from its card and activate it the same way (not together with Realm Resources).

### What players see

- **Rain:** vanilla's own streaks (as wide, in its blue `#4465C1`, at its opacity), but 13 lanes of them instead of 8 and longer, each fading from a fainter tail (34%) to a solid head (96%). Overall about 1.8× as much rain on screen as vanilla.
- **Fog while it rains:** starts at 15% of your render distance and is solid by 55% (vanilla: 23% → 70%), in a gloomy blue-gray `#5F6B79` instead of vanilla's gray `#666666`. At 10 chunks that's 24 → 88 blocks. Pale gardens and sulfur caves keep their own fog colors with the new distances.
- **Snow:** the game's own snowflakes, the same number and the same three kinds in the same places on the texture (an x, a plus and a speck), but each one redrawn at 4× as a round, solid flake with four arms instead of vanilla's thin, gappy one, white with a cool rim (`#DFE5ED`, the tint of vanilla's snowball flakes) so it stays readable against the pale fog. About 1.3× as much white per flake as vanilla, and the specks become small flakes.
- **Fog while it snows:** starts at 12% of your render distance and is solid by 50%, in a pale blue-gray `#A9B3BE` instead of vanilla's gray `#666666`: whiter than the rain fog but still darker than the flakes, so snowfall doesn't turn into a whiteout. At 10 chunks that's 19 → 80 blocks. Bedrock has one fog for rain and snowfall, chosen by biome, so the snow fog is in the biomes where it always snows: snowy plains, ice spikes, snowy mountains, the snowy taigas, frozen rivers and oceans, snowy beaches, groves, snowy slopes, and frozen and jagged peaks. Where it rains low down and snows only high up (windswept hills, taigas), the snow keeps the rain fog.
- **Rain sound:** the realm owner's rain recording, at 125% of vanilla's volume. The game plays rain as many short sounds at once, so it's cut into 2.4 s clips from all through the recording, which blend back into the same steady rain (its tone stays within 1 dB of the recording). Each clip fades in over 0.8 s, so Rain Extras can stop them quietly to muffle the rain indoors.
- **Thunder:** for every lightning bolt, a roll from the realm owner's thunderstorm recording (6 rolls, 8 s each), with the recording's rain hiss filtered out (a fixed cut above about 900 Hz, where the recording holds little thunder), so the rain you hear stays steady while thunder rolls instead of swelling with it.
- **Lightning strike** (only when it hits near you): the sharpest hits of the same recording, starting right on the hit (4 sounds, 4.5 s): the full crack for the first 0.4 s, then the rumble with the same rain filter. Both play at their recorded pitch: vanilla plays these sounds pitched far down, so this pack sets lightning's pitch to 0.9–1.1. Explosions keep their vanilla sound.
- **Splashes:** the rain splash is smaller (0.10 blocks instead of 0.175) and softer (70% opacity, a cool tint).
- **With Rain Extras:** storm fog, a darker haze on Vibrant Visuals, ground mist, drips, the thunderstorm recording for as long as a storm lasts, storm wind, rain on the roof, and the rain muffled indoors (the rain recording heard through a roof, `realm.rain.inside`). Their fogs, particles and sounds are in this pack.

### Performance

- Everything replaces a vanilla file one for one: the game draws the same rain and plays rain and thunder as often as before, so this pack costs no extra frames on any device.
- Rain clips are 2.4 s, like vanilla's 2 s, so the copies the game keeps starting (about 15 at once) don't pile up any more than vanilla's. The whole pack is about 2 MB, most of it the thunderstorm recording.

### Saved data

None. It's a resource pack: no scripts, no commands, nothing to configure in game.

### Known limits

- **Vibrant Visuals ignores fog colors**, so on its own this pack's blue-gray rain fog only shows on **Fancy**; Vibrant Visuals players see the game's pale gray rain haze. [Rain Extras](#rain-extras--rain_bp) fixes that with a darker haze of its own. The rain, sounds and splashes change the same way under both.
- A resource pack higher in the list that also changes the weather texture, fog or rain sounds wins: keep Realistic Rain at the top.
- **Snow in a thunderstorm with Rain Extras:** Rain Extras leaves out its storm fog and haze where the ground above you is snow or ice, so the snow fog shows in thunderstorms too. Under a bare tree or an overhang in a snowy place it can't tell, and the storm fog can show there.
- **Groves and snowy slopes** share their fog with many rainy biomes, so the pack points them at a copy of it with the snow fog (`realm:fog_snow_default`). The mutated desert and badlands plateaus share the fog of the frozen and jagged peaks; they get no rain or snow, so its snow fog shouldn't show there.
- The texture tiles the way vanilla's does; how big the streaks look on screen depends on the game, not the pack.

### How it's made

Everything in `packs/rain_rp/` is generated by `npm run gen:rain` (`tools/gen-rain/`), from Mojang's vanilla files in `tools/gen-rain/vanilla/` (see its README):

| Files | Generator | |
|---|---|---|
| `textures/environment/weather.png` | `textures.mjs` | The weather atlas at 4× (128×128). The rain rows are redrawn, and each of the 8 snowflakes inside its own 3×3-texel cell (the generator fails if the snow covers less than 52% or more than 60% of those cells, so it can't thin out or turn into blobs); every other pixel is vanilla upscaled |
| `textures/particle/realm_rain_mist.png`, `pack_icon.png` | `textures.mjs` | Rain Extras' mist sprite and the pack icon |
| `fogs/*_fog_setting.json` | `fogs.mjs` | The vanilla fogs that have a weather fog, with only `distance.weather` changed (to the rain fog, or to the snow fog for `fog_dry`, which the frozen and jagged peaks use), and the fogs of the biomes where it always snows (temperature below 0.15), with the snow fog added as their `distance.weather` |
| `fogs/snow_default_fog_setting.json`, `biomes/grove.client_biome.json`, `biomes/snowy_slopes.client_biome.json` | `fogs.mjs` | `realm:fog_snow_default` (vanilla `fog_default` with the snow fog), and the grove and snowy slopes client biomes pointed at it, otherwise vanilla's |
| `fogs/rain_storm*.json` | `fogs.mjs` | The three storm fogs Rain Extras pushes (`realm:rain_storm_1`, `realm:rain_storm_2`, `realm:rain_storm`) |
| `fogs/rain_gloom*.json` | `fogs.mjs` | The Vibrant Visuals haze Rain Extras pushes in rain (`realm:rain_gloom_1`, `realm:rain_gloom`): only volumetric air fog, denser below y 64 and gone above 256, absorbing about as much light as it scatters so it reads darker. Fancy ignores it |
| `sounds/realistic_rain/*.ogg` | `sounds.mjs` | Rain, thunder, strikes and the thunderstorm sound: excerpts of the realm owner's recordings (`tools/gen-rain/recordings.json`), mono and loudness-normalized, otherwise as recorded, except that thunder and strikes go through a fixed low-pass at 900 Hz (a strike only after its first 0.4 s), which takes out the rain hiss under the thunder and leaves the rumble as recorded. A gate that opened and closed per frequency (1.2.2) made the thunder whoosh and rattle, so it isn't used. The 10-minute originals aren't committed: put them in `tools/gen-rain/sources/` to cut new clips (without them the committed clips are kept). The rain's volume is tuned on a simulation of how the game stacks the clips. Wind and rain on the roof for Rain Extras are synthesized. `--audition docs/media/rain` also writes the listening clips |
| `sounds/sound_definitions.json`, `sounds.json` | `sounds.mjs` | Each sound's volume, computed from its measured loudness: the rain stack lands 25% above vanilla's (measured from Mojang's decoded rain), thunder and strikes set by their level below 300 Hz: each clip exactly as in 1.2.1, 1.5 dB quieter (thunder about 4 dB and strikes about 6 dB under vanilla's). `sounds.json` sets lightning's pitch to 0.9–1.1 |
| `CREDITS.txt` | `sounds.mjs` | Where the sounds come from, from `recordings.json` |
| `particles/*.json`, `manifest.json` | by hand | The splash, `realm:rain_mist` (drifts with the storm wind) and `realm:rain_drip` particles |
| `docs/media/rain/*.webp`, `weather-atlas.png` | `renders.mjs` | The pictures above and in Rain Extras: a small voxel scene rendered from one spot with the vanilla and new textures, fogs and splashes, in rain and in a thunderstorm (vanilla, Realistic Rain alone, and with Rain Extras), and under snow with each texture's flakes and fog, so each pairs up with vanilla (needs ffmpeg). Rain coverage is calibrated to an in-game screenshot; snow isn't |
| `docs/media/rain/*.mp3` | `sounds.mjs --audition docs/media/rain` | The listening clips: rain stacked the way the game stacks it, plus the scene's sounds at their in-game volumes. The rain is at the same level in every clip and version, so a change in level is heard as one |

`npm run check` fails if the textures, fogs or client biomes differ from what the generators make.


### Credits

The rain, thunder, lightning-strike and thunderstorm sounds are excerpts of recordings supplied by the realm's owner. The wind and rain-on-the-roof sounds are synthesized. The pack carries the same note in `CREDITS.txt`.
---

## Rain Extras — `rain_bp`

Storm fog, a darker rain haze on Vibrant Visuals, ground mist, drips under leaves and roof edges, the thunderstorm recording during storms, storm wind, rain on the roof and the rain muffled indoors, for the Realistic Rain resource pack. Part of the Realm Bundle.

### See and hear it

![Vanilla](media/rain/storm-vanilla.webp) ![Rain Extras](media/rain/storm.webp) A thunderstorm with Rain Extras (and Realistic Rain, which it needs): the darker storm fog, ground mist drifting with the wind, and drips under the trees

[Listen: a breeze outdoors in rain, then indoors (the rain muffled through the roof, drumming on it, muffled wind), then a thunderstorm outdoors (34 s)](media/rain/extras.mp3)

A render, not an in-game screenshot (see [Realistic Rain](#realistic-rain--rain_rp)), with vanilla from the same spot on the left; on mc.nish.software, drag across the picture to compare. The Vibrant Visuals haze isn't shown, since the render doesn't model Vibrant Visuals.

### How to use

1. When it rains, water drips from the leaves of trees and from roof edges near you, and keeps dripping for a while after the rain stops. Outdoors a soft breeze blows; indoors the rain sounds muffled through the roof, and drums on it.
2. In a thunderstorm, the fog rolls in thicker and darker over about 12 seconds, the storm rumbles all around you with strong wind gusts (both muffled when you're inside), and low mist drifts along the ground with the wind when you're outdoors. It all clears the same way when the storm passes.
3. On **Vibrant Visuals**, rain also brings a darker blue-gray haze that settles in the valleys, since Vibrant Visuals ignores fog colors. Fancy keeps Realistic Rain's fog.
4. Run `/realm:rain`, or use the same switch in `/realm:prefs`, to disable these extras for yourself, on a slower device for example. Chat says `Rain extras (fog, haze, mist, drips and sounds): Disabled. Run /realm:rain again to enable them.` The choice is remembered.
5. **Operators:** Rain Extras is in the Realm Bundle; its fogs, particles and sounds come from Realistic Rain (in Realm Resources), so without that nothing shows. `/realm:config` → Rain Extras enables or disables each extra and sets the wind, thunderstorm and roof volumes.

### What players see

- **Drips:** small blue drops form under the lowest leaves of a tree and under roof edges where the next column is at least 2 blocks lower, hang for 0.2–1.2 s and fall. Up to `drips.perSecond` (5) per second within `drips.radius` (6) blocks of you, and for `drips.afterRainSeconds` (30) seconds after the rain, tapering off.
- **Ground mist** (thunderstorms only, outdoors, near the ground): soft gray-blue puffs 5–9 blocks away, mostly in front of you, each fading in and out over about 4 s. `mist.puffsPerSecond` (2) puffs of 4 sprites a second, so about 32 on screen.
- **Storm fog:** three steps from 12% → 48% to 8% → 35% of your render distance, darkening from `#59646F` to `#4E5763`, over `stormFog.fadeSeconds` (12) seconds. Plain rain keeps Realistic Rain's 15% → 55%, and snowy places (snow or ice on top) keep its snow fog.
- **Vibrant Visuals haze** (rain and thunderstorms): a volumetric fog that is densest below y 64 and gone by y 256, darker and slightly blue, in two steps over `haze.fadeSeconds` (10) seconds. It only sets Vibrant Visuals' volumetric fog, so Fancy and the storm fog are untouched. Lifted in caves and in the Nether and the End.
- **Thunderstorm sound:** for as long as a thunderstorm lasts, the realm owner's thunderstorm recording plays around you, a little louder than the rain, 20 s at a time with crossfades (`stormSound.volume`, 1), and muffled when you're under a roof.
- **Wind:** gusts with a faint whistle at the peaks, every 8 s (10 s clips that crossfade): strong in thunderstorms (`wind.inThunder`, 0.7), a soft breeze in plain rain (`wind.inRain`, 0.35). Under a roof you hear the muffled version (with a rattle in the strongest gusts); under trees, the outdoor wind. Walking in or out swaps them at once.
- **Rain on the roof:** while it rains and there's a roof 2 to `roof.maxHeadroom` (10) blocks over your head (not leaves), a muffled drumming with a soft gutter trickle, every 3 s, at `roof.volume` (0.8).
- **Muffled rain indoors** (`roof.muffleRain`, enabled): Bedrock plays its rain sound the same indoors and out, at full volume. Under any roof (not leaves), Rain Extras stops the game's rain for you and plays the rain recording muffled, as heard through a roof, about 9 dB under the rain outdoors (20 s clips that crossfade, at `roof.volume`), under the drumming. Deep underground (more than 24 blocks under the surface) the rain is silent. Walk out and the game's rain is back within a second. Thunder isn't muffled: the game plays it, and it carries indoors anyway.
- Mist, drips, haze and sounds are only for the player they're for, so each player's extras cost only their own device.
- None of it happens in the Nether or the End, deep underground (more than 24 blocks under the surface), or on sand, terracotta, snow or ice: deserts and badlands get no rain, and snowy places get snow. That includes the storm fog, so in a thunderstorm snowy places keep Realistic Rain's whiter snow fog.

### Commands

| Command | Who | What it does |
|---|---|---|
| `/realm:rain` | Everyone | Enables or disables storm fog, haze, ground mist, drips, the wind, thunderstorm and roof sounds and the muffled rain indoors **for yourself** (enabled by default, `defaultOff`). Remembered between sessions |

### Configuration (`scripts/config.js` → `CONFIG`)

| Option | Default | Description |
|---|---|---|
| `defaultOff` | `false` | Start with the extras off for players who never ran `/realm:rain` |
| `stormFog.enabled` | `true` | Thunderstorms roll in denser, darker fog |
| `stormFog.fadeSeconds` | `12` | Seconds the storm fog takes to roll in, and again to clear, in three steps |
| `haze.enabled` | `true` | A darker, blue-gray haze in rain and thunderstorms for players on Vibrant Visuals (Fancy is unaffected) |
| `haze.fadeSeconds` | `10` | Seconds the haze takes to thicken, and again to clear, in two steps |
| `mist.enabled` | `true` | Ground mist around players outdoors during thunderstorms |
| `mist.puffsPerSecond` | `2` | Mist puffs per second per player. Each is 4 sprites that live about 4 s |
| `drips.enabled` | `true` | Drips from leaves and roof edges while it rains |
| `drips.perSecond` | `5` | Drips per second per player |
| `drips.afterRainSeconds` | `30` | Seconds drips keep falling after the rain stops, tapering off. `0` stops them with the rain |
| `drips.radius` | `6` | How far from the player (blocks) to look for leaves and roof edges |
| `drips.lookupsPerSecond` | `6` | Block lookups per second per player for drips and mist: the main cost on the server |
| `wind.enabled` | `true` | Gusting wind while it rains, muffled indoors |
| `wind.inThunder` | `0.7` | Wind volume in thunderstorms, 0–1 |
| `wind.inRain` | `0.35` | Wind volume in plain rain, 0–1 |
| `stormSound.enabled` | `true` | The thunderstorm recording around each player during thunderstorms, muffled indoors |
| `stormSound.volume` | `1` | Thunderstorm sound volume, 0–1 |
| `roof.enabled` | `true` | Rain drumming on the roof while a player is indoors |
| `roof.volume` | `0.8` | Rain on the roof volume, 0–1 |
| `roof.maxHeadroom` | `10` | Highest roof (blocks above the player's feet) that still counts as indoors for the roof sound |
| `roof.muffleRain` | `true` | Under a roof, stop the game's rain sound for the player and play it muffled through the roof instead (at `roof.volume`); deep underground, silence it |

Operators can change `defaultOff`, `stormFog.enabled`, `haze.enabled`, `mist.enabled`, `drips.enabled`, `wind.enabled`, `wind.inThunder`, `wind.inRain`, `stormSound.enabled`, `stormSound.volume`, `roof.enabled`, `roof.volume` and `roof.muffleRain` in game with `/realm:config` when Realm Settings is installed (in the Realm Bundle or as its own pack). The other numbers stay in `config.js`.

### Saved data

| Key | Scope | Contents |
|---|---|---|
| `rain:off` | Player | `true` when the player turned the extras off, `false` when they turned them on while `defaultOff` is `true`. Not set = `defaultOff`. Set by `/realm:rain` and `/realm:prefs` |
| `rain:cfg` | World | Settings changed in `/realm:config` |
| `rain:weather` | World | The overworld weather at the last change: `Clear`, `Rain` or `Thunder`. The stable Script API can't read the current weather, so this is how the pack knows it after a restart |

### Performance

- **Nothing runs in clear weather.** The pack's loop exists only while it rains, while drips finish after the rain, or while a storm fog or haze is still on someone.
- While it runs, it handles a quarter of the players 4 times a second, so each player costs one update a second: at most `drips.lookupsPerSecond` (6) block lookups, `drips.perSecond` (5) drips and `mist.puffsPerSecond` × 4 (8) mist sprites. Drip spots are remembered (up to 8) until the player moves 4 blocks.
- Storm fog and haze are one `/fog` command per player, run only when they change step: 3 + 2 times as a storm arrives and again as it leaves, and when a player goes into or out of a cave.
- Wind, thunderstorm, roof and muffled-rain sounds reuse the block lookup the update already makes: one sound every 8 s, one every 18 s (two indoors in a storm) and one every 3 s at most, per player, each played to that player only (one to four extra voices on their device).
- Muffled rain indoors adds one `/stopsound` command 4 times a second per player who is under a roof or deep underground while it rains, and takes the game's rain clips (about 15 voices at once) off that player's device.
- Each player's particles and sounds go to that player only. On a weak device, `/realm:rain` turns everything off for that player alone.

### Known limits

- Added while it's already raining? The extras start at the next weather change.
- Storm fog and haze use the `/fog` command, run by the script. If that fails, the content log shows `[rain] /fog` and the mist, drips and sounds still work.
- Drips come from the highest block of each column: leaves under a roof, or overhangs inside caves, don't drip.
- Indoors and outdoors are judged from the block over your head: standing under a single overhanging block counts as indoors.
- Sounds can't be filtered live, so indoors plays separate muffled recordings, swapped when you walk in or out.
- The game starts its own rain sounds wherever you are, so the muffling stops them as they start: 4 times a second, while each is still fading in, which leaves them about 16 dB down or more. For a moment after you walk in (up to a second) you still hear the rain as outdoors. If the muffled rain ever sounds choppy, operators can disable **Muffled rain indoors** in `/realm:config`.

### How it works

- `weatherChange` in the overworld sets the weather (and saves it as `rain:weather`). The storm fog steps toward dense during thunder and back to none otherwise, with `/fog @s push realm:rain_storm… rain_storm` and `/fog @s remove rain_storm`. The haze does the same in rain and thunder with `realm:rain_gloom…` under the id `rain_gloom`. Each fog only sets its own part (the storm fog the weather fog distance, the haze Vibrant Visuals' volumetric fog), so they stack, and only this pack's fog entries are ever touched. Joining clears any leftover fog, and the next update puts back what the weather calls for.
- Each update: one `getTopmostBlock` above the player decides outdoors (nothing 2+ blocks over your head), under a tree, indoors, underground or dry ground (sand, terracotta, snow or ice there also takes off the storm fog, so it never lands on top of [Regional Weather](#regional-weather--climate_bp)'s sandstorm or blizzard fog). Mist picks spots in front of the player and checks the ground there. Drips probe random columns within `drips.radius` for leaves with air under them, or a solid block whose neighbor is 2+ lower, and remember them.
- Particles use `Player.spawnParticle` and sounds `Player.playSound` (`realm.storm.wind`, `realm.storm.wind_inside`, `realm.storm.bed`, `realm.storm.bed_inside`, `realm.rain.roof`, `realm.rain.inside`), so they reach that player only; walking in or out runs `/stopsound` for the wind, the thunderstorm sound and the muffled rain.
- Muffled rain indoors: each update marks a player as muffled when they're under a roof (or more than 24 blocks under the surface) while it rains, and every run of the loop (4 times a second) sends those players `/stopsound @s ambient.weather.rain`. Realistic Rain's rain clips fade in over 0.8 s, so a clip stopped within a quarter second has barely started. Indoors, `realm.rain.inside` plays every 18 s. The particles and sounds are defined in Realistic Rain.

---

## Realm Skies — `sky_rp`

The pictures for the realm's sky events: rainbows, aurora curtains, shooting stars, meteors with fiery trails and smoking craters, tornado dust, sandstorms, blizzards, fog banks, the blood and harvest moons' glow, and the small trails players can earn. A **resource pack**, part of **Realm Resources** with [Realistic Rain](#realistic-rain--rain_rp) (or on its own). It adds only new particles and fogs and replaces nothing from vanilla, so it changes nothing until a behavior pack uses it, and those packs still work without it (their particles and fogs just don't show).

### How to use

1. Nothing to do as a player: when the realm has it, Minecraft downloads it as you join (accept the resource pack prompt if one appears).
2. Watch the sky. The behavior packs below decide when something happens; this pack is what you see when it does: a rainbow after the rain, an aurora on a clear night, a meteor shower, a tornado on the horizon.
3. **Operators:** it comes with Realm Resources: activate that under **Resource Packs** at the **top** of the active list. To use it alone instead, download Realm Skies from its card and activate it the same way (not together with Realm Resources).

### What players see

- **Rainbows** ([Rainbows & the Pot of Gold](#rainbows--the-pot-of-gold--rainbow_bp)): a fixed arc in the world built from soft round glowing dots in seven colors, red outside, violet inside, at most 85% opaque so the sky shows through, plus a golden beam like a beacon's (a white-hot core in a golden glow) over the pot of gold. Each dot and beam segment fades in over 0.3 s and out over its last 0.5 s, and Rainbows redraws them before they fade, so they blend.
- **Auroras** ([Aurora & Shooting Stars](#aurora--shooting-stars--night_bp)): tall curtains of soft light with rays reaching up from a bright, wavy lower edge, rippling slowly (an 8-frame loop), green to purple. They glow: additive light, not affected by the darkness.
- **Shooting stars** ([Aurora & Shooting Stars](#aurora--shooting-stars--night_bp)): a bright point streaking across the sky, leaving a short blue-white tail.
- **Meteors** ([Meteor Strikes](#meteor-strikes--meteor_bp)): a big fireball with a long trail of embers that cool from white through orange to dark red, then dark smoke rising from the crater.
- **Tornadoes** ([Tornadoes](#tornadoes--tornado_bp)): spinning rings of gray-brown dust that build a column, with leaves and clods of dirt flung out of it.
- **Sandstorms and blizzards** ([Regional Weather](#regional-weather--climate_bp)): gusts of tan sand grains and wind-driven snow streaks around you, and a close fog: tan from 6 to 20 blocks in a sandstorm, a white-out from 4 to 16 blocks in a blizzard.
- **Fog banks** ([Regional Weather](#regional-weather--climate_bp)): big pale puffs drifting low over the ground and a pale fog that hides everything past about a third of your render distance.
- **Blood and harvest moons** ([Blood Moon & Harvest Moon](#blood-moon--harvest-moon--moon_bp)): slow red or golden motes rising around you, and a dark red or soft gold tint on the distance.
- **Storm sparks** ([Storm Chasing](#storm-chasing--storm_bp)): short blue electric sparks that flicker and vanish.
- **Trails** ([Titles & Trails](#titles--trails--titles_bp)): what follows a player who picked one: a little gray rain cloud with a drip, falling leaves, rising embers or white sparkles.

Rainbows, auroras, stars, meteors, sparks, embers, moon motes and sparkles glow in the dark. Dust, sand, snow, smoke, fog puffs, leaves and clouds are lit by the world, so they're dark at night like the blocks around them.

### What's in it

Particles, each spawned by a behavior pack with `player.spawnParticle(id, location, molang)` (seen by that player only) or `dimension.spawnParticle(id, location, molang)`. Numbers go in with `MolangVariableMap.setFloat("variable.<name>", n)`; one left at 0 uses the default in parentheses.

| Particle | What it is | Variables | Used by |
|---|---|---|---|
| `realm:sky_rainbow_band` | One round dot of a rainbow's color band, facing you, soft-edged | `variable.size` radius in blocks (1), `variable.life` seconds (2), `variable.cr`, `variable.cg`, `variable.cb` its color (0-1) | [Rainbows & the Pot of Gold](#rainbows--the-pot-of-gold--rainbow_bp) |
| `realm:sky_rainbow_beam` | One segment of a golden light beam, upright and turning to face you; stack them for a beam | `variable.size` half-width (0.5), `variable.height` half-height (2), `variable.alpha` 0-1 (1), `variable.life` seconds (2) | [Rainbows & the Pot of Gold](#rainbows--the-pot-of-gold--rainbow_bp) |
| `realm:sky_aurora` | One segment of an aurora curtain, rippling and additive. A segment is `size * 0.8` wide with soft sides: place them about `size * 0.6` apart so they overlap | `variable.size` height in blocks (40), `variable.life` seconds (20), `variable.hue` 0 green .. 1 purple | [Aurora & Shooting Stars](#aurora--shooting-stars--night_bp) |
| `realm:sky_star` | A shooting star flying from the location along the velocity, leaving a short glowing tail | `variable.dx`, `variable.dy`, `variable.dz` blocks/s, `variable.life` seconds (1.2) | [Aurora & Shooting Stars](#aurora--shooting-stars--night_bp) |
| `realm:sky_meteor` | A fireball flying from the location along the velocity, with a long fiery trail | `variable.dx`, `variable.dy`, `variable.dz` blocks/s, `variable.life` seconds (3), `variable.size` fireball scale (1) | [Meteor Strikes](#meteor-strikes--meteor_bp) |
| `realm:sky_meteor_smoke` | 8 dark smoke puffs rising from a crater for 3.5 to 5.5 s | none | [Meteor Strikes](#meteor-strikes--meteor_bp) |
| `realm:sky_sand` | 20 sand grains in an 8 x 3 x 8 box around the location, blown by the wind | `variable.wx`, `variable.wz` wind in blocks/s | [Regional Weather](#regional-weather--climate_bp) |
| `realm:sky_snow` | 20 snow streaks in an 8 x 4 x 8 box, driven by the wind and falling | `variable.wx`, `variable.wz` | [Regional Weather](#regional-weather--climate_bp) |
| `realm:sky_fogbank` | 4 big pale fog puffs drifting low within 5 blocks, for about 10 s | none | [Regional Weather](#regional-weather--climate_bp) |
| `realm:sky_tornado` | One ring of dust circling the location and climbing for about a second (8 to 40 puffs, 5 per block of radius) | `variable.radius` blocks (2), `variable.spin` radians/s (4) | [Tornadoes](#tornadoes--tornado_bp) |
| `realm:sky_debris` | 5 dark leaves and clods thrown outward and up from the ring, tumbling | `variable.radius` (2) | [Tornadoes](#tornadoes--tornado_bp) |
| `realm:sky_blood` | 6 slow red motes rising in an 8 x 2 x 8 box, 4 to 6.5 s | none | [Blood Moon & Harvest Moon](#blood-moon--harvest-moon--moon_bp) |
| `realm:sky_harvest` | The same, golden | none | [Blood Moon & Harvest Moon](#blood-moon--harvest-moon--moon_bp) |
| `realm:sky_spark` | 4 blue zigzag sparks, a quarter second | none | [Storm Chasing](#storm-chasing--storm_bp) |
| `realm:trail_cloud` | A small gray cloud puff, sometimes with a raindrop falling from it | none | [Titles & Trails](#titles--trails--titles_bp) |
| `realm:trail_leaves` | 2 leaves fluttering down (mostly green, now and then orange) | none | [Titles & Trails](#titles--trails--titles_bp) |
| `realm:trail_ember` | 2 embers floating up, cooling from yellow to red | none | [Titles & Trails](#titles--trails--titles_bp) |
| `realm:trail_sparkle` | 3 white twinkles | none | [Titles & Trails](#titles--trails--titles_bp) |

Fogs, pushed on one player with `player.runCommand("fog @s push <id> <name>")` and removed with `fog @s remove <name>` (as [Rain Extras](#rain-extras--rain_bp) does). Each sets both the clear-weather and the rain fog, so it looks the same in any weather (in rain a little closer and darker).

| Fog | Clear weather | In rain or snow | Used by |
|---|---|---|---|
| `realm:sky_sandstorm` | 6 → 20 blocks, tan `#C9A46E` | 5 → 17 blocks, `#B3946A` | [Regional Weather](#regional-weather--climate_bp) |
| `realm:sky_blizzard` | 4 → 16 blocks, white `#E4EAF0` | 4 → 14 blocks, `#DCE3EA` | [Regional Weather](#regional-weather--climate_bp) |
| `realm:sky_fogbank` | 4% → 35% of render distance, pale `#C8CFD6` | 3% → 30%, `#AEB6BF` | [Regional Weather](#regional-weather--climate_bp) |
| `realm:sky_blood_moon` | 20% → 85%, dark red `#7A1612` | 15% → 60%, `#5E1410` | [Blood Moon & Harvest Moon](#blood-moon--harvest-moon--moon_bp) |
| `realm:sky_harvest_moon` | 30% → 95%, soft gold `#C99A45` | 18% → 65%, `#9C7B45` | [Blood Moon & Harvest Moon](#blood-moon--harvest-moon--moon_bp) |

### Saved data

None. It's a resource pack: no scripts, no commands, nothing to configure in game.

### Known limits

- **Vibrant Visuals ignores fog colors**, so there the sandstorm, blizzard and fog bank keep their distances but not their color, and the blood and harvest moon tints don't show. The particles look the same on Fancy and Vibrant Visuals.
- A resource pack higher in the list can't hide these particles or fogs (nothing else uses their names), but another pack's `/fog` push on the same player stacks with them: the last one pushed wins.
- Particles show only where the chunk is loaded, so a rainbow or aurora far beyond your render distance isn't drawn. Particles are also fogged like blocks: during and right after rain the fog ends at about half the render distance, so the behavior packs draw big sky pictures close to the player and scale them (the rainbow's far parts at 48 blocks, on the same line of sight).
- How the snow streaks line up with their motion is up to the game's `lookat_direction` billboards.

### How it's made

Everything in `packs/sky_rp/` is generated by `npm run gen:sky` (`tools/gen-sky/gen.mjs`); nothing is hand-edited and nothing comes from outside the repo. The textures are drawn in code (smooth shapes and hash-based noise, no randomness), so the same code always writes the same pixels. It reuses Realistic Rain's PNG encoder (`tools/gen-rain/png.mjs`).

| Files | What |
|---|---|
| `particles/*.json` | The 18 particles above (format 1.10.0) |
| `fogs/*.json` | The 5 fogs above (`distance.air` and `distance.weather`) |
| `textures/particle/realm_sky_*.png` | Rainbow dot (32x32), golden beam (16x32), aurora flipbook (8 frames of 32x128), glow, meteor fireball, smoke, fog puff, 4 dust puffs, sand grain, snow streak, leaf and clod, 2 sparks, sparkle, cloud and raindrop |
| `pack_icon.png` | A night sky with stars, an aurora, a shooting star and dark hills (128x128) |
| `manifest.json` | Fixed uuids, version 1.0.2 |

`npm run check` runs `node tools/gen-sky/gen.mjs --check`, which fails if any file in the pack differs from what the generator makes, is missing, or is left over in its folders. It also fails if a particle names a texture the generator doesn't make.

---

## Translucent Tools — `translucent_rp`

Tools, weapons and the shield are half see-through in your hand, so they block less of the screen. Swords, pickaxes, axes, shovels and hoes of every material, the mace, bow, crossbow, trident and shield are drawn at 50% opacity, in their usual shape and place. Each player can switch it off for themselves with [Translucent Tools Switch](#translucent-tools-switch--translucent_bp). A **resource pack**, part of **Realm Resources** (or on its own).

### See and hear it

![The textures: vanilla on top, Translucent Tools below, on a checkerboard so the see-through shows](media/translucent/textures.png)

A picture of the textures, not an in-game screenshot: where a tool sits and how big it looks on screen is the game's, and stays the same as vanilla.

### How to use

1. Nothing to do as a player: when the realm has it, Minecraft downloads it as you join (accept the resource pack prompt if one appears).
2. Hold any tool, weapon or a shield: you can see through it. It works in first person and in third person, for every player and mob holding one.
3. Prefer solid tools? Run `/realm:prefs`, pick **Translucent Tools** and disable **Translucent tools**: your tools look like vanilla again, for you and for everyone who sees you (this needs Translucent Tools Switch, which is in the Realm Bundle).
4. **Operators:** it comes with Realm Resources: activate that under **Resource Packs**, near the top of the list (above Firewolf and any pack that changes how held items look). To use it alone instead, download Translucent Tools from its card and activate it the same way (not together with Realm Resources).

### What players see

- **40 items at 50% opacity:** swords, pickaxes, axes, shovels and hoes in wood, stone, copper, iron, gold, diamond and netherite (35), plus the mace, bow (and each frame as you draw it), crossbow (loaded or not), trident and shield.
- **Same shape and place:** each item keeps vanilla's pixels, thickness and animations; only the opacity changes. Tools and the mace are held like any hand-held tool, gripped at the handle and tilted forward, in first and third person, so swinging, mining and using them moves them around the handle as vanilla does. The bow, crossbow, trident and shield keep their own vanilla poses (blocking, drawing, throwing).
- **Solid for players who choose it:** a player with **Translucent tools** disabled (`/realm:prefs`, from [Translucent Tools Switch](#translucent-tools-switch--translucent_bp)) holds them opaque, with vanilla's materials and the normal enchantment glint. Everyone sees that player's tools that way. A switch takes effect at once.
- **Enchanted items:** Bedrock has no material that is both see-through and glinting, so in your hand an enchanted item shows a soft purple shimmer instead of the glint. Its inventory icon keeps the glint.
- **Unchanged:** inventory and hotbar icons, dropped items, item frames, armor, and items this pack doesn't list (fishing rod, shears, flint and steel, brush, spears).

### Saved data

None. It's a resource pack: no scripts and no commands. It reads one player property, `realm:solid_tools`, which [Translucent Tools Switch](#translucent-tools-switch--translucent_bp) sets from each player's preference; without that pack every tool is see-through.

### Known limits

- **See-through things behind a tool** (water, glass, rain, other translucent blocks) can disappear behind it for a moment: Bedrock doesn't always sort see-through models against them.
- **Shields with a banner pattern** haven't been tried: the pattern may show solid, or not at all.
- **Other resource packs:** a pack higher in the list with its own models for these items (3D swords, custom shields) wins. Packs that only retexture items, like Firewolf, still show their art in the inventory, but in your hand the tools use vanilla's textures, since this pack carries its own see-through copies.
- **Mobs** holding these items (zombies, vindicators, piglins, skeletons) show them see-through too, like players.
- **The pose** is the hand-held tool pose built from Minecraft's own numbers (below), checked by reading, not in a game client: if a tool still sits or swings differently from vanilla on some device, the numbers to adjust are `HANDHELD` and `BASE` in the generator.

### How it's made

Everything in `packs/translucent_rp/` except `manifest.json` is generated by `npm run gen:translucent` (`tools/gen-translucent/generate.mjs`), from Mojang's vanilla files in `tools/gen-translucent/vanilla/` (see its README):

| Files | |
|---|---|
| `textures/translucent_tools/<item>.png` | The vanilla texture with every pixel at 50% opacity (`OPACITY` in the generator) |
| `textures/translucent_tools/shape/<item>.png` | The vanilla texture, opaque. The game builds the held item's 3D outline from it (`texture_meshes`), so the outline is exactly vanilla's whatever the opacity |
| `attachables/<item>.json` | One per tool and the mace (vanilla draws those without an attachable), with the `entity_alphablend` material, plus vanilla's `entity_alphatest` and `entity_alphatest_glint` for the solid look. The bow, crossbow, shield and trident files are vanilla's with only the materials, textures and render controller swapped, and one `pre_animation` line that reads `realm:solid_tools` (attachable queries run on the entity holding the item; mobs don't have it, so they read 0, see-through) |
| `models/entity/translucent_tools.geo.json`, `animations/translucent_tools.animation.json` | The tool mesh, bound to the hand (`q.item_slot_to_bone_name(c.item_slot)`), and its pose: Minecraft's hand-held item display (`item/handheld`: third person rotated 0, -90, 55, raised 4 and scaled 0.85; first person rotated 0, -90, 25, moved 1.13, 3.2, 1.13 and scaled 0.68) applied with the bone layout and base offsets Geyser's java2bedrock converter uses for 2D items on Bedrock, for each hand and view. Also the bow and crossbow frames |
| `render_controllers/translucent_tools.render_controllers.json` | See-through or solid (by `realm:solid_tools`) for every item, and the purple shimmer when enchanted and see-through |
| `pack_icon.png`, `docs/media/translucent/textures.png` | The pack icon and the picture above |

`npm run check` fails if any of these differ from what the generator makes.

---

## Translucent Tools Switch — `translucent_bp`

Lets each player choose whether their held tools are see-through ([Translucent Tools](#translucent-tools--translucent_rp), in Realm Resources) or solid like vanilla. A setting in `/realm:prefs`, with a realm default for operators.

### How to use

1. Run `/realm:prefs` and pick **Translucent Tools**.
2. **Translucent tools** Enabled (the default): tools, weapons and the shield in your hand are see-through. Disabled: they look solid, like vanilla, with the normal enchantment glint. It changes at once, and everyone who sees you sees your choice.
3. **Operators:** `/realm:config` → **Translucent Tools** → **Translucent tools (realm default)** sets what every player has until they choose (`translucentTools`).

### What players see

- Nothing new on screen: only how their held tools look, through the Translucent Tools resource pack. Without that resource pack the setting does nothing.
- A player who never chose follows the realm default, so changing it switches them at once; a player whose choice differs from the default keeps it.

### Commands

None. The setting is in `/realm:prefs`, the realm default in `/realm:config`.

### Configuration (`scripts/config.js` → `CONFIG`)

| Option | Default | Description |
|---|---|---|
| `translucentTools` | `true` | What a player has until they choose: `true` see-through tools, `false` solid (vanilla) tools. Operators can change it in game in `/realm:config` |

Player preference, in `/realm:prefs` (**Translucent Tools**): **Translucent tools**, defaulting to the realm's `translucentTools`.

### Saved data

| Key | Scope | Contents |
|---|---|---|
| `translucent:cfg` | World | Settings changed in `/realm:config` |
| `translucent:pref` | Player | JSON `{ translucent }`: the player's own choice, only when it differs from the realm default |
| `realm:solid_tools` | Player entity property | `true` when the player's tools should look solid. Saved with the player and synced to every client, which is how the resource pack knows |

### How it works

- A resource pack can't read scripts, but it can read an entity property the server syncs to clients. This pack adds one to the player: its `entities/player.json` is a copy of vanilla's player behavior file (`minecraft:player`, format 1.26.30, the newest one Bedrock Dedicated Server 1.26.52 ships, identical to Mojang's bedrock-samples 1.26.50.4 file) with only `"properties": { "realm:solid_tools": { "type": "bool", "default": false, "client_sync": true } }` added. It is the only pack here that defines `minecraft:player`.
- The script sets the property with `player.setProperty("realm:solid_tools", !translucent)` when a player spawns, when the world loads, when the player changes the preference and when an operator changes the default. Translucent Tools' attachables read `query.property('realm:solid_tools')` on the entity holding the item and switch texture and material.
- **When Mojang updates the player:** a behavior pack's `minecraft:player` replaces vanilla's, so after a Minecraft update that changes the player file, copy the new one (from the newest `behavior_packs/vanilla_*` of Bedrock Dedicated Server, or bedrock-samples `behavior_pack/entities/player.json`) into `entities/player.json`, put the `properties` block back and bump the version. Until then players keep the older behavior (exhaustion, raid omen and so on).

---

## Side HUD — `hud_rp`

A small box on the right side of the screen, just above where the scoreboard sidebar sits, for the short readouts other packs show: [Mob Health](#mob-health--mobhp_bp), the [Elytra HUD](#elytra-hud--elytra_bp), treasure map [Warmer / Colder](#treasure-maps--maps_bp) and the [story tracker](#story-questlines--saga_bp). Other add-ons that redraw the line above the hotbar all the time (waypoint and compass add-ons) can't cover it. A **resource pack**, part of **Realm Resources** (or on its own).

### How to use

1. Nothing to do as a player: when the realm has it, Minecraft downloads it as you join. Hit a mob, glide or hold a treasure map and the readout shows in the box on the right.
2. Prefer another spot? Run `/realm:prefs`, pick the pack (Mob Health, Elytra HUD, Treasure Maps, Story Questlines) and change **Where ... shows** to **Middle of the screen** or **Above the hotbar**.
3. **Operators:** it comes with Realm Resources. The realm default for each pack is its `showAt` setting in `/realm:config` (`trackerAt` for Story Questlines; default `side`).

### What players see

- **The box:** white text on a dark, half see-through background, right-aligned against the edge of the screen, its bottom 60 pixels above the middle of the right edge. The scoreboard sidebar is centered on that edge, so the box sits above a sidebar of up to about 10 rows (a taller one overlaps it).
- **One readout at a time:** the last pack to write wins, and the box disappears when that readout ends (2 seconds after a hit, as soon as you land, 2 seconds after you stop holding the map).
- **Without this pack** (or with an older Realm Resources) the same text shows in the middle of the screen instead, as a subtitle. Nothing breaks.
- **Titles from commands and other packs** (`/title`, area names, boss intros) show in the middle as always.

### Saved data

None. It's a resource pack: no scripts and no commands.

### How it works

- `ui/hud_screen.json` adds to Minecraft's HUD (JSON UI `modifications`, so other packs that change the HUD still merge): a box anchored to the right edge that shows the subtitle text whenever the title text is exactly `§s§1§r` (color codes only, so it's invisible on its own), and a visibility binding on the vanilla title and subtitle that hides them for `§s§1§r` and `§s§0§r`. The vanilla title and subtitle frames are copied from Mojang's `hud_screen.json` with only that binding added; after a Minecraft update that changes them, copy them again.
- A pack shows text with `setTitle("§s§1§r", { subtitle })` and clears the box with `setTitle("§s§0§r")` when its readout ends. The `realm:side` script event (in [How the packs work together](#how-the-packs-work-together)) makes sure only the last writer clears it.
- Checked by reading against Mojang's files, not in a game client (a dedicated server doesn't draw the HUD). If the box sits in the wrong spot on some screen size, the numbers to change are `anchor_from`, `anchor_to` and `offset` of `realm_side_box`.

---

## Bundling packs into one

Merges several packs into one `.mcpack`, so the Realm lists one pack instead of many.

**With Claude:** run the `/bundle-packs` skill. It asks **All packs** (first option) or **Let me choose**, then builds, checks and sends the file.

**Yourself:**

```bash
npm run bundle -- --list                                 # available packs, and which --all bundles
npm run bundle -- --all                                  # → dist/realm_bundle.mcpack (every behavior pack)
npm run bundle -- --resources                            # → dist/realm_resources.mcpack (every resource pack)
npm run bundle -- --packs welcome_bp,stats_bp            # some packs, in this order
npm run bundle -- --all --name my_bundle --title "My Bundle"
```

| | |
|---|---|
| Layout | Each pack's scripts go in `scripts/<folder>/`, and a generated `scripts/main.js` imports them all |
| Dependencies | `@minecraft/*` versions merged to the highest. Packs needing different major versions can't be bundled |
| Identity | UUIDs are derived from `--name`. Rebuilding with the same name, even with a different selection, **updates** the existing pack on the Realm |
| Version | Build time `[YYYY, MMDD, HHMM]` (UTC), so it always increases |
| Conflicts | Two packs with the same non-script file and different contents → error, except the JSON lists the game merges (`sounds.json`, `sound_definitions.json`, `*_texture.json`, `blocks.json`…), whose entries are merged as long as none is defined twice differently |
| Icon | `pack_icon.png` of `--icon` (default `sky_rp`, Realm Skies' night sky) |
| Resource packs | `--resources` merges every resource pack into **Realm Resources** (`dist/realm_resources.mcpack`): all files side by side, one manifest. Behavior and resource packs never share a bundle |
| Limits | `--all` and `--resources` leave out packs listed in `tools/standalone.json` (none today); `--list` shows which bundle takes each pack |
| Realm News | Runs `node tools/gen-news.mjs` first, so the bundle's update popup is the newest `docs/NEWS.md` entry |

> ⚠️ **Saved settings don't move between the bundle and individual packs.** Bedrock keeps each pack's script data (dynamic properties) separately. Switching resets in-game edits: welcome text, news, tips, `/realm:config` settings, per-player toggles and preferences, first-joined dates, Creeper Guard zones, the Farm Loader list (the ticking areas themselves stay loaded) and what Chest Finder remembers. **Scoreboard stats are kept.** Rebuilding the same bundle name keeps everything.

---

## How the packs work together
<!-- on the site -->

| Pair | Interaction |
|---|---|
| Realm Configuration → every pack | Runs the other packs' commands as the operator (`player.runCommand`), so each command keeps its own checks and menus. Finds the installed packs with `realm:help_ping`, and counts safe zones and protected towns for the setup checklist from `realm:zones`. Its first button opens Realm Settings (`/realm:config`) |
| AFK → Stats | Stats pauses playtime for players with the `afk` tag. Keep AFK `tag` and Stats `afkTag` the same |
| Welcome → News | Both popups show on join, welcome first (`delayTicks` 40 vs 100). News waits until the welcome popup is closed |
| News tips → others | The default tips mention `/realm:stats`, `/realm:afk`, `/realm:help`, the stash sneak-tap and `/realm:find`. Edit them with `/realm:news_tips` if you don't use those packs |
| Bedrock Essentials+ | Tree felling and vein mining only count 1 block in `mined`. No other overlap |
| AFK smart sleep → Phantom Opt-out | Smart sleep lets the night pass without everyone in bed, so some players build up phantoms. They can disable them for themselves with `/realm:phantoms` |
| Right-click Harvest → Stats | Harvesting by tap breaks no block, so it doesn't count toward `mined` |
| Quick Stack & Sort → sorters | `/realm:stash` also fills the chests of an item sorter (hoppers or copper golems), since they already hold the same items, and a copper golem's copper chest if it already holds them. Sorting a sorter's chest from the sneak-tap menu is harmless |
| Chest Finder ↔ Quick Stack & Sort | Both read the same chests and change nothing about each other. A stash or sort changes what Chest Finder remembers only once the chest is opened again or searched within 16 blocks |
| Quick Stack & Sort locks ↔ Land Claims | Separate: a chest lock works anywhere, claims or not, and a claim protects every container in it without locking it. A shared claim doesn't open the owner's locked chests; share those from the sneak-tap menu |
| Land Claims → Quick Stack & Sort | In someone else's claim, sneak-tapping a container does nothing (no menu), so it can't be sorted or locked there. `/realm:stash` can still put your items into containers in a claim within 8 blocks that already hold them |
| Land Claims ↔ Creeper Guard | Both take blocks out of explosions; together a creeper breaks nothing in a claim even in Creeper Guard's `zones` mode |
| Chairs → AFK, Stats | A seated, idle player is still marked AFK. Sitting adds nothing to `travelled` |
| Death Point ↔ Farm Loader | `/realm:death_back` adds a ticking area for a few seconds to load a faraway death point, so it counts toward the same 10 per world. If Farm Loader has used all 10, `/realm:death_back` says it can't load the death point; a `/realm:farm_add` during those seconds may be refused by the game |
| Hotbar Refill ↔ Low Durability Warning | Separate: the warning still comes before a tool breaks, and Hotbar Refill moves a spare in once it has. The spare starts with no warning until it runs low |
| Coordinates HUD ↔ packs with action bar messages | Every pack that writes the bar above the hotbar (Low Durability Warning, Quick Stack & Sort, Land Claims, Chairs, AFK, Right-click Harvest, Mob Health, Daily Quests, Skills, Realm Mail, Safe Zones, Storm Chasing, Regional Weather and the adventure packs) sends `realm:actionbar` first, so the HUD, the stats ticker, Story Questlines' tracker, the Party HUD and an expedition's run line wait while its note shows (the action bar protocol, below) |
| Mob Health → Coordinates HUD | Each hit shows the mob's health and asks the HUD to hold off for `holdTicks` (2 seconds); then the coordinates come back |
| Stats → Coordinates HUD | A player with both the stats ticker and the HUD on sees the ticker as a second line under the coordinates (`realm:hud_line`); the HUD says who sees it (`realm:hud_state`). Without the HUD the ticker draws on its own and waits for `realm:actionbar` notes, as the HUD does |
| Elytra HUD → Coordinates HUD | While a player glides, the Elytra HUD sends `realm:actionbar`, so the Coordinates HUD pauses for that player and comes back a second or two after landing |
| Elytra HUD ↔ Low Durability Warning, Land Claims, AFK smart sleep | All write the bar above the hotbar. While gliding, their messages can show for a moment before the HUD's next update replaces them |
| Realm Mail ↔ Welcome, News | The unread letters line comes 8 seconds after joining (`notifyDelaySeconds`), after the welcome and news popups |
| AFK ↔ Nicknames | Both write the name above a player's head. The AFK pack only adds or removes its own `[AFK]` prefix in front of whatever the tag shows, so a nickname and title stay put. Keep Nicknames `afkTag` and `afkPrefix` the same as AFK `tag` and `nameTagPrefix` |
| Right-click Harvest → Daily Quests | A crop harvested by tapping counts for harvest quests, the same as breaking it |
| Daily Quests ↔ Stats, Milestones | Separate counts: the same mining, kills and travel add to all of them |
| Slot Machine ↔ Crowns | Crowns stakes are taken from and wins paid into the shared `crowns` scoreboard, so they show in `/realm:crowns` at once. Without the Crowns pack, Crowns stakes still work but nobody earns Crowns to play with |
| Silly Enchants → Merchant Caravan | The caravan can sell Silly Books if an operator adds one to its `goods` (see [Silly Enchants](#silly-enchants--silly_bp)); the book is recognized by its lore |
| Dolphin Friends ↔ other dolphin packs | Dolphin Friends replaces the vanilla dolphin's behavior file with a copy plus a seat. Another behavior pack that also changes the dolphin conflicts with it: only the higher pack's file is used |
| Stats → Milestones | Milestones reads the `stats_<stat>` scoreboards when they exist and uses the larger of their number and its own, so history from Stats counts. Works without Stats |
| AFK → Milestones | Playtime and distance pause for players with the `afk` tag. Keep AFK `tag` and Milestones `afkTag` the same |
| Community Goals ↔ Quick Stack & Sort | Lock a goal's chest so nobody takes from it: donations still go in, because the pack moves them itself. `/realm:stash` can also fill a goal's chest that already holds the item, but that doesn't count toward the goal |
| Community Goals ↔ Land Claims | Donations reach a goal's chest inside a claim, since the pack moves the items, not the player |
| Bedrock Essentials+ → Fast Leaf Decay | A sneak-break that fells a whole tree is checked once, from the broken log up the empty trunk, so the felled tree's leaves fall too |
| Fast Leaf Decay → Stats | Leaves broken by the pack don't count toward `mined` |
| Fast Leaf Decay → Lag Cleanup | The saplings and sticks from decayed leaves are dropped items like any others; a forest cleared in one go can push the count toward Lag Cleanup's `threshold` |
| Lag Cleanup → Farm Loader, item farms | Items a farm drops count toward `threshold`. Items that sit in a farm's collection area with no player near can be cleared; hoppers under the drops keep the count low |
| Realm Help ← every pack | `/realm:help` lists the packs that answer its script event, so it only shows what's installed. Its text is generated from this file |
| Realm Settings ↔ every behavior pack | `/realm:config` and `/realm:prefs` list the packs that answer the `realm:cfg_ping` script event, and send changes back the same way, so each pack keeps its own settings. Without Realm Settings, every pack still works, with its saved settings or `config.js` |
| Realm Settings → Welcome, News | `/realm:config` changes the same saved values as `/realm:welcome_edit` (`showOnce`, `chat`, `screenTitle`) and `/realm:news_tips` → **Settings** (tips on or off, interval) |
| Rain Extras → Realistic Rain | Rain Extras' storm fogs, haze, mist and drip particles, and wind, thunderstorm, roof and muffled-rain sounds are defined in Realistic Rain, so it needs that resource pack. Realistic Rain works on its own |
| Rain Extras ↔ Regional Weather, Blood Moon | Rain Extras' storm fog stays off on sand, terracotta, snow and ice, so Regional Weather's sandstorm and blizzard fogs show there; the moon fog is off while it rains. Each pack pushes `/fog` under its own name and only removes its own |
| AFK smart sleep → Rain Extras | Skipping the night clears the weather, so the storm fog and haze clear, the wind stops and drips taper off as after any rain |
| Townsfolk ↔ the adventure packs | Townsfolk owns the NPCs and their menus. When you tap one, it sends `realm:npc_talk`; Crowns (Market), Story Questlines, Guilds (Guild hall), Bounty Board, Relics (Relic forge), Fishing 2.0, Treasure Maps, Waystones & Inns, Town Projects and Weather Almanac (Forecast) answer with buttons for that NPC's roles. Without Townsfolk those menus can't be reached from an NPC; most packs also have a command |
| Crowns ↔ every pack that pays or sells | They all use the `crowns` scoreboard directly, so rewards and prices work with or without the Crowns pack. Crowns adds the balance, the top list, paying other players and the Market |
| Daily Quests, Story Questlines, Bounty Board, Treasure Maps, Fishing 2.0, Expeditions, Town Projects → Guilds | Each finished quest-like thing sends `realm:quest_done`; Guilds turns it into reputation (`questRep`, `kindGuild`). Bounty Board gives reputation only that way (plus `realm:rep_add` for bounty helpers, who finish nothing themselves); Story Questlines adds `realm:rep_add` for its choices |
| AFK → Guilds | Players with the `afk` tag earn no travel reputation (`afkTag`), so idle minecart or boat loops don't farm Wayfarers |
| Champions ↔ Bounty Board, Story Questlines, Expeditions, Guilds, Blood Moon | Bounty Board, Story Questlines and Expeditions ask Champions for named targets (`realm:champion_spawn`) and hear about kills (`realm:champion_slain`); Guilds gives Wardens reputation for them; a Blood Moon triples the champion chance (`realm:moon`). Champions only makes champions of the mobs in its `mobs` list (zombies, husks, drowned, zombie villagers, skeletons, strays, spiders, creepers, witches) and puts one of those in place of any other mob asked for, so Story Questlines and Expeditions spawn their own boss for any other mob (an elder guardian, a pillager, a phantom) and when Champions isn't installed. A `realm:champion_spawn` tag must start with `realm:`. Natural champions never appear in or next to player builds (`avoidBuilds`), so mob farms don't make them |
| Deck of Many Things → Champions, Skills, Crowns | The Champion card asks Champions for a named champion (`realm:champion_spawn`; without it the deck spawns its own boss), The Mentor and The Archmage send skill XP with `realm:skill_xp`, and the Crowns cards add to or take from the `crowns` scoreboard |
| Safe zones → Deck of Many Things | The Arena and The Spore never change blocks inside a zone sent with `realm:zones`; they fizzle there and the deck draws another card |
| Kitchen, Fishing 2.0, Treasure Maps, Deck of Many Things → Skills | Cooking (Farming), catches (Fishing), treasure chests (Exploration) and the Deck's cards send skill XP with `realm:skill_xp` `{ player, skill, amount }`. Without Skills nothing happens |
| Skills, Bounty Board, Story Questlines, Expeditions ← Parties | Party mates carry the tag `realm_party:<code>`. Skills gives 10% more XP near a mate; bounties and story objectives count for mates within 64 blocks; Expeditions takes the party in together |
| Titles & Trails → Nicknames | The title a player wears is the tag `realm_title:<text>`; Nicknames shows it in gray under the name. Guilds, Skills, Field Journal, Blood Moon and Story Questlines unlock titles with `realm:title_unlock` |
| Relics ← Champions, Story Questlines, Treasure Maps, Rainbows, Expeditions | Champions drop Relic Shards; the others may give a relic with `realm:relic_give` (the seven story relics come only from Story Questlines). Relics' Storm Meter reads Storm Chasing's cell (`realm:storm_cell`), and the Storm Staff answers near one too. The Lantern Shard points at the seals Story Questlines reports with `realm:seals`; the Gray Choir Mask reads its `saga:choir` tag. **Place a relicsmith here** asks Townsfolk with `realm:npc_summon` |
| Field Journal ← many packs | Weather, sky, fishing, relic, story and place discoveries arrive as `realm:journal` and `realm:sky_event`, so the Journal fills in as you meet them |
| Weather Almanac ↔ AFK smart sleep, weather packs | The Almanac owns the weather (`doWeatherCycle` off) and puts it back if anything else changes it, so operators should use `/realm:weather_set` rather than `/weather`; sleeping through rain (or Smart Sleep) ends that spell, as in vanilla. Storm Chasing, Tornadoes, Rainbows, Regional Weather, Aurora, Meteors and Rain Extras all follow whatever the weather is |
| Sky packs → Realm Skies (Realm Resources) | Tornadoes, Rainbows, Aurora & Shooting Stars, Meteor Strikes, Regional Weather, Blood & Harvest Moon, Storm Chasing (the rod spark) and Titles & Trails draw with Realm Skies' particles and fogs. Without it the events still happen, unseen |
| Storm Chasing, Tornadoes, Rainbows, Meteor Strikes, Aurora & Shooting Stars, Blood Moon, Merchant Caravan, Fishing 2.0 → Waystones & Inns | Innkeepers remember the last few `realm:sky_event` announcements for **Hear the news** |
| Town Projects → world event packs | Each town with **Protect from world events** Enabled (the default) is a safe zone: Town Projects sends it as `realm:zones` (`src: "town"`, radius `townRadius`) and answers `realm:zones_ping`. Packs whose world events break or place blocks (meteor craters, tornadoes, storms) skip block changes inside it; the event itself still happens |
| Translucent Tools Switch → Translucent Tools (Realm Resources) | The Switch sets each player's `realm:solid_tools` property from **Translucent tools** in `/realm:prefs`; Translucent Tools draws that player's held tools solid when it's on. Either pack works alone: without the Switch every tool is see-through, without Translucent Tools the setting changes nothing |
| Kitchen ↔ Townsfolk, Story Questlines | Bea the Cook (role `chef`) offers the **Kitchen** through `realm:npc_talk`. Story Questlines' Hearth and Table teaches its story recipes (Lantern Cake, Starwright Bread) with `realm:recipe_learn` when you accept the chapter that asks for them, and delivers dishes by their item and exact name (`minecraft:rabbit_stew` named `Harbor Chowder`). Each chapter that asks for a dish also has an "old way" with plain food, for realms without the Kitchen. `realm:dish_give` and `realm:ingredient_give` are there for stories to give dishes and rare ingredients; no shipped story uses them yet |
| Champions, Fishing 2.0, Blood Moon, Aurora, Meteor Strikes → Kitchen | Champions drop rare ingredients and recipe cards (`realm:champion_slain`); Fishing 2.0's Storm Eel is the Storm Eel ingredient; a Blood or Harvest Moon (`realm:moon`) and an aurora or meteor (`realm:sky_event`) make Moon Salt, Harvest Saffron and Starwright Flour possible. Each pack works without the others |
| Weather Almanac ↔ Rain Extras | Rain Extras' fog, mist, drips and sounds follow the Almanac's planned rain and thunder like any other weather |
| Safe Zones, Town Projects, Land Claims → world-event packs | The safe zones protocol (below): Meteor Strikes, Storm Chasing, Tornadoes, Blood Moon, Creeper Guard's `zones` mode, Rainbows (no rainbow end or pot of gold chest in a zone) and the Deck of Many Things leave the blocks in every safe zone alone, whichever pack it comes from. Regional Weather, Rain Extras, Aurora & Shooting Stars and the Weather Almanac change no blocks, so zones don't affect them |
| Meteor Strikes, Creeper Guard → Safe Zones | **Protect this area from meteors** (Meteor Strikes) and **Safe zones** (Creeper Guard) open the Safe Zones menu with `realm:zones_open` |

**The safe zones protocol** (script events with JSON messages; the shared code is `tools/zones-shared.js`, copied into each pack that takes part as `scripts/zones.js` by `node tools/sync-zones.mjs`):

- **Providers** send `realm:zones` `{ src, part, parts, zones: [{ id, name, dim, x, z, r, shape? }] }` with their full list whenever it changes, about 5 seconds after the world loads, and in reply to `realm:zones_ping` `{}`. `src` names the provider: `zones` (Safe Zones), `town` (Town Projects, towns with **Protect from world events**), `claims` (Land Claims, with `protectWorldEvents`). A list longer than one message (2048 characters) is split into parts numbered from 1 (parts numbered from 0 are accepted too); `parts` 0 or an empty list clears that provider's zones. `shape` is `circle` (default: within `r` blocks of `x`, `z`) or `square` (`x - r` to `x + r`, `z - r` to `z + r`); zones reach from the bottom of the world to the top of `dim`.
- **Consumers** (every pack that breaks or places blocks in a world event) keep the latest list from each provider, ping on world load, and skip block changes inside any zone: the event still happens, it just changes no blocks there.
- **`realm:zones_open`** `{ player, action }` asks Safe Zones to open **Add a safe zone here** (`action: "add"`) or its menu for that player.

**The action bar protocol** (one bar above the hotbar, many packs):

- **Every write** to a player's action bar is preceded by `realm:actionbar` `{ player, ticks, from?, background? }`: "my text is on this player's bar, leave it for `ticks` ticks" (at most 200). `from` is the sending pack's folder, so a pack can ignore its own requests.
- **Steady lines** that redraw every second or two wait while someone else's request lasts, then redraw: the Coordinates HUD, the stats ticker (without the HUD), Story Questlines' tracker, the Party HUD and an expedition's run line. So a note (a durability warning, skill XP, mob health, a sort result) stays readable instead of being drawn over within a second.
- **`background: true`** marks a steady line that an expedition's run line needn't wait for (the other steady lines still do). The Party HUD sends it, so an expedition's run line takes the bar during a party run; the Party HUD itself waits for the run line and for every note.
- Packs that only show a short note now and then just send the request and write; they don't listen. Without any listener nothing happens.

**The side box protocol** (one box on the right side, from [Side HUD](#side-hud--hud_rp)): a pack that writes the box sends `realm:side` `{ player, from, ticks }` right after, and every pack that uses the box remembers the last `from` per player. When its readout ends, a pack clears the box (`setTitle("§s§0§r")`) only if it is still the last writer, so it never wipes another pack's text. The story tracker, which redraws every 2 seconds, waits while another pack's `ticks` last, so a hit's mob health or a Warmer / Colder note stays readable. Mob Health, the Elytra HUD, Treasure Maps and Story Questlines use it.

Rain Extras needs Realistic Rain and the sky packs need Realm Skies to be seen, both in Realm Resources; and the adventure packs are best together, but any combination works. Translucent Tools only changes how held items are drawn; its one link is Translucent Tools Switch, which tells it per player whether to draw tools solid.

---

## Troubleshooting
<!-- on the site -->

| Problem | Check |
|---|---|
| A command doesn't show up | Run `/realm:help` to see the features this realm has, or type `/realm` to list the commands (e.g. `/realm:stats`). Is the pack **Active**, not just Available? Minecraft 1.21.100+? Rejoin after activating. Ops-only commands are hidden from regular members |
| Commands missing after adding a bundle | The individual packs and the bundle are both active, so duplicates fail. Keep only one |
| Popup never appears | Close chat/inventory. The welcome popup retries for 30 s, news for about 90 s. Check the content log |
| Changes to `config.js` don't show up | Increase `header.version` in `manifest.json`, rebuild, and re-apply. In-game edits override `config.js` defaults: `/realm:config` → **Reset a pack to defaults** clears that pack's settings, `/realm:welcome_reset` clears welcome edits; news, tips and tip settings saved in game always win over `config.js`. A player's own choice in `/realm:prefs` wins over both for that player |
| A pack is missing from `/realm:config` or `/realm:prefs` | It isn't installed or active, or it has nothing to change there (`/realm:prefs` only lists packs with preferences of their own). If a pack answers too slowly on a busy realm, raise Realm Settings' `answerTicks` |
| Settings reset after switching to or from a bundle | Expected: Bedrock keeps each pack's saved data separately, so in-game settings (welcome text, news, tips, `/realm:config` settings, per-player toggles and preferences, first-joined dates, Creeper Guard zones, the Farm Loader list, what Chest Finder remembers) start fresh. Scoreboard stats are kept |
| Night doesn't skip | Is `sleep.enabled` on? The `Zzz x/y sleeping` status shows how many are asleep (x) and how many are needed (y). Players in other dimensions only count if `sleep.countOtherDimensions` is on |
| Script errors | **Settings → Creator → Enable Content Log GUI**, then rejoin. Errors start with the pack's name in brackets, such as `[welcome]`, `[stats]` or `[chairs]` |
| No tornado, rainbow, aurora, shooting stars, meteor streak, sandstorm, blizzard, moon fog or trail to see | Is Realm Skies (`sky_rp`) active under **Resource Packs**? Those packs draw only with its particles and fogs; without it the events still happen (chat warnings, the pot of gold, the crater) but nothing shows. Players must accept the resource pack download when they join |
| An NPC's buttons are missing (no Market, Guild hall, Forecast...) | Each button comes from its own pack, answering for the NPC's roles: is that pack in the bundle? On a very busy realm an answer can miss the 4-tick window: tap the NPC again |
| Rain looks and sounds like vanilla | Is Realistic Rain active under **Resource Packs**, at the top of the list? A resource pack above it that changes rain wins. Players must accept the resource pack download when they join |
| No storm fog, haze, mist, drips, wind or roof sound | Is Rain Extras active under **Behavior Packs**, and Realistic Rain under **Resource Packs**? Run `/realm:rain` in case they're off for you, and check `/realm:config` → Rain Extras. If the pack was added during rain, they start at the next weather change. Nothing shows in deserts, badlands or snowy places, or deep underground. The haze only shows on Vibrant Visuals |
| Storm fog or haze stays after a storm | Rejoin: Rain Extras clears its fogs when you join. Running `/realm:rain` twice also resets them |
| Wind, thunderstorm or rain on the roof too loud or too quiet | Operators: `/realm:config` → Rain Extras → **Storm wind volume**, **Rain breeze volume**, **Thunderstorm sound volume**, **Rain on the roof volume** (also the muffled rain indoors). Everyone: the game's **Weather** volume slider covers them too |
| Rain as loud indoors as outdoors | Is **Muffled rain indoors** enabled (`/realm:config` → Rain Extras), and are the extras on for you (`/realm:rain`)? It needs Realistic Rain, whose rain clips fade in slowly enough to be stopped quietly. Leaves don't count as a roof |
| Tools still look solid in your hand | Is Translucent Tools active under **Resource Packs**, above other packs that change held items? Did you accept the resource pack download when you joined? Inventory icons stay solid; only the item in your hand is see-through |
| The pack shows a pink and black placeholder icon | Harmless: single behavior packs have no icon. Both bundles carry Realm Skies' icon (`--icon`) |

---

## Keeping this file current

`npm run check` runs these, in order, and stops at the first that fails:

- `tsc -p .`: the type check.
- `tools/check-ascii.mjs`: every pack's script code (comments aside) is plain ASCII plus `§`, since Bedrock draws a line with `…`, `–`, `•` or an emoji in a smaller fallback font.
- `tools/check-docs.mjs`: this file has
  - a `##` section whose heading contains `` `<folder>` `` for **every pack** in `packs/`
  - a `### How to use` section in every pack section: short numbered steps for players, operators last
  - **every command** a pack registers, e.g. `` `/realm:stats` ``
  - **every option** in a pack's `config.js`, as `` `option` ``, or `` `parent.option` `` for nested options like `` `sleep.percent` ``
- `tools/check-commands.mjs`: every command and enum a pack registers uses the `realm:` namespace (a second namespace in one add-on throws `NamespaceMismatch`, so a bundle would lose those commands), and no two packs register the same command.
- `tools/check-stories.mjs`: Story Questlines' story content (`packs/saga_bp/scripts/stories/`) uses known objective types and fields, places, NPC ids, unique ids, champion tags and requirements. Flags read that nothing sets are only warnings.
- `tools/sync-settings.mjs --check`: fails if a behavior pack (other than Realm Settings) has no `scripts/settings.js`, or its copy of the shared Realm Settings helper differs from `tools/settings-shared.js`. Change the helper there, then run `node tools/sync-settings.mjs` and bump the version of every pack it updates.
- `tools/sync-zones.mjs --check`: the same for the safe zones protocol: every pack with a `scripts/zones.js` has the same copy as `tools/zones-shared.js`. Change it there, then run `node tools/sync-zones.mjs` (with pack folders to add the file to new ones) and bump the version of every pack it updates.
- `tools/help-catalog.mjs --check`: the in-game `/realm:help` text (`packs/help_bp/scripts/catalog.js`) is generated from each pack's summary, `### How to use` and Commands table here, so after changing those, run `node tools/help-catalog.mjs` (it bumps `help_bp`'s patch version). It also fails if a behavior pack doesn't answer `/realm:help`'s `realm:help_ping` script event. Resource packs have no scripts, so they're left out of the help.
- `tools/admin-catalog.mjs --check`: the Realm Configuration menu's list of commands (`packs/admin_bp/scripts/catalog.js`) matches what the packs register. After adding or changing a command or its parameters, run `node tools/admin-catalog.mjs` and bump `admin_bp`'s version.
- `tools/gen-news.mjs --check`: Realm News' update popup (`packs/news_bp/scripts/release.js`) is the newest entry of `docs/NEWS.md`. After adding an entry, run `node tools/gen-news.mjs` (it bumps `news_bp`'s patch version; `npm run bundle` runs it too).
- `tools/gen-rain/textures.mjs --check` and `tools/gen-rain/fogs.mjs --check`: Realistic Rain's textures, fogs and client biomes are what `npm run gen:rain` generates.
- `tools/gen-sky/gen.mjs --check`: every file in Realm Skies is what `npm run gen:sky` generates, none missing or left over.
- `tools/gen-translucent/generate.mjs --check`: Translucent Tools (all but its `manifest.json`) is what `npm run gen:translucent` generates.

When adding or changing a pack: update its section here, and the pack table in `README.md`, in the same commit.

---

## Publishing to mc.nish.software

The [Our realm](https://mc.nish.software/realm/) page shows this file to players. It is generated, never hand-written, so the site and this repo can't drift:

| | |
|---|---|
| What goes on the site | Every pack section (one collapsible card per pack, `### How to use` first; behavior packs under the Realm Bundle, resource packs under **Realm Resources**), plus every section marked `<!-- on the site -->` |
| What stays behind "For operators" | A pack's `### Configuration…`, `### Saved data` and `### Resetting…` subsections, collapsed |
| What goes in "How it works in detail" | A pack's other subsections (`### What players see`, `### How it works`, `### Known limits`…), collapsed |
| Commands page | Every pack's Commands rows also go into the searchable commands table on mc.nish.software (`site/commands/index.html`) |
| Pictures and sound clips | A pack's `### See and hear it` subsection becomes a gallery at the top of its card: each `[label](media/….mp3)` link as a listening clip at the top (with a **Listen** button in the card's header, so it plays without opening the card), each `![caption](media/…)` image (`.webp`, `.png`, `.jpg`, `.gif`) with its caption, two images on one line (`![Before label](media/…) ![After label](media/…) caption`) as a before/after comparison you drag across, and any other paragraph as a note. The files live in `docs/media/` here, and `pack-docs.mjs` copies the ones the page uses to `site/realm/media/` |
| How | In a checkout of `nishant/hosting`: `cd minecraft && node tools/pack-docs.mjs --from <path to this repo>` (default `../../mc-packs`, or `MC_PACKS`), then `node tools/check-site.mjs` and a PR to `main` there, which you merge (the merge is the deploy); `node tools/check-live.mjs` then checks the live pages. `--check` fails if the page is out of date |
| Downloads | `node tools/publish-packs.mjs --from <path to this repo> --notes "what changed" --pack-notes <folder>="what changed"` there builds the Realm Bundle, Realm Resources and every single pack from this repo and publishes each new version (see `minecraft/docs/OPERATIONS.md`, "Publishing a pack version"; `--resource-notes` gives Realm Resources its own notes, `--dry-run` writes nothing). A single pack is only published when its `header.version` goes up, and then needs its `--pack-notes` (a first version gets `First version hosted here.`); the same version with different files is an error, since a published version is never replaced. A bundle is published whenever anything in it changed, and needs `--notes`. The realm page leads with the two bundles, and every pack can still be downloaded on its own from its card |
| When | After every change to this file that players should see, and with every new bundle or pack version published on the site |

Links in this file to its own sections (`#…`) are dropped on the site; links to web pages are kept.
