# Pack documentation

What each pack in this repo does, how to use it, and how to configure it.

> **Keep this file up to date.** Any change to a pack's behavior, commands or `config.js` must update this file in the same commit. `npm run check` fails if a pack, command, config option or `### How to use` section is missing from this file (see [Keeping this file current](#keeping-this-file-current)).
>
> **This file is also the players' documentation.** The [Our realm](https://mc.nish.software/realm/) page on mc.nish.software is generated from it (in the `nishant/hosting` repo: `cd minecraft && node tools/pack-docs.mjs`). Every pack section is published, plus the sections marked `<!-- on the site -->`. Write in plain American English, and quote in-game text and ids exactly as the code has them (in backticks), even where the game text is British (`Distance travelled`). See [Publishing to mc.nish.software](#publishing-to-mcnishsoftware).

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
- [Realistic Rain — `rain_rp`](#realistic-rain--rain_rp)
- [Rain Extras — `rain_bp`](#rain-extras--rain_bp)
- [Translucent Tools — `translucent_rp`](#translucent-tools--translucent_rp)
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

The realm runs everything as one pack, **Realm Bundle**, and that is the download to pick. To install or update it:

1. **Download** the latest Realm Bundle `.mcpack` from [mc.nish.software/realm](https://mc.nish.software/realm/) on the device you play on (Windows, phone or tablet) and open it. Minecraft starts and imports it as "Realm Bundle".
2. **Open the realm's settings** (the pencil next to the realm), go to **Behavior Packs**, find Realm Bundle under **Available** and activate it. Minecraft uploads it to the realm.
3. **Join** once the realm restarts. The welcome popup and the `/realm:` commands mean it's running.

**Updating:** download and open the newer version, then check that the realm's active Realm Bundle shows the new version. If it still shows the old one, deactivate it and activate it again so the new version uploads. Nothing is lost: in-game settings and stats are stored in the world. Version numbers are the build date and time in UTC (`YYYY.MMDD.HHMM`, without leading zeros, so 5 January at 09:05 is `2026.105.905`), so every build is higher than the last, which Minecraft needs to treat it as an update.

**Standalone packs:** the two rain packs and Translucent Tools are never in the Realm Bundle and are made to run next to it: [Realistic Rain](#realistic-rain--rain_rp) and [Translucent Tools](#translucent-tools--translucent_rp) (resource packs) and [Rain Extras](#rain-extras--rain_bp) (a behavior pack). Download each from its card under **Standalone packs** and open it, then in the realm's settings activate Realistic Rain and Translucent Tools under **Resource Packs**, at the top of the list, and Rain Extras under **Behavior Packs**, next to the Realm Bundle. Players get both automatically when they join.

**Only some features?** Every feature is also its own pack, downloaded from its card or the "one at a time" list under the Realm Bundle download, and activated the same way. Use **either** the Realm Bundle **or** single packs, never both: the same commands would be registered twice and fail to load. (The standalone packs above aren't in the bundle, so they go with either.) Switching between them starts the features' in-game settings over (welcome and news text, tips, settings from `/realm:config`, per-player choices, remembered chests, zones and farms); stats on the scoreboard are kept. Single packs use ordinary version numbers (`1.0.0`) that go up whenever that pack changes.

### Installing on a Realm

For whoever builds the packs from this repo:

1. Build the packs with `npm run build` (one `dist/<folder>.mcpack` per pack), or `npm run bundle -- --all` for a single bundle.
2. Open the `.mcpack` on a device with Minecraft. It imports automatically.
3. Go to **Play → Realms → ✏️ Edit Realm → Behavior Packs** and move the pack from **Available** to **Active**. A resource pack (`rain_rp`, `translucent_rp`) goes under **Resource Packs** instead, at the top of the active list.
   *Another way:* download the Realm world, activate the pack under the world's **Behavior Packs**, and upload the world again.
4. Rejoin. Commands are registered when the world loads.

> ⚠️ Activate **either** the individual packs **or** a bundle that contains them, never both. Otherwise every command is registered twice, and the duplicate commands fail to load. Standalone packs (listed in `tools/standalone.json`, like `rain_bp`) are never in a bundle: activate them next to it.

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

### Commands

| Command | Who | What it does |
|---|---|---|
| `/realm:help [feature]` | Everyone | Opens the help menu, or the page for `feature` (`afk`, `chairs`, `durability`, `farm`, `find`, `guard`, `harvest`, `news`, `phantom`, `rain`, `settings`, `stash`, `stats`, `welcome`) or `all` |

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
3. **Operators:** run `/realm:config`, or use any item renamed `Realm Settings` on an anvil (a stick works). Pick a pack, change its settings (switches, sliders and lists) and tap **Save**. They apply right away for everyone. A summary pops up with how many changes were saved and each one as before -> after, such as `Storm wind volume: 70% -> 50%`; tap **Back to Realm Settings** for another pack, or **Done**. A setting shown as text with `(change in config.js, then restart the world)` can only be changed there.
4. **Operators:** **Reset a pack to defaults**, at the bottom of the menu, puts one pack's settings back to its `config.js` values after asking. Players' own preferences are kept.

### What players see

- Only installed packs are listed: each pack answers when the menu asks, as with `/realm:help`. Rain Extras is listed too when it runs next to the Realm Bundle.
- Each setting has a `!` icon: hover over it or tap it for what the setting does, its default and, for a slider, its range.
- Volumes and other 0 to 1 settings are sliders in percent (`Storm wind volume (%)`, 0 to 100 in steps of 5), and settings in fractional steps, such as Chairs' seat reach (1 to 5 blocks in 0.5s), are lists of their exact values: Bedrock's sliders only stop on whole numbers. A setting you don't touch is saved exactly as it was.
- Tapping **Save** without changing anything says `No changes`.
- Switches read the same everywhere: the setting is named for what it does, the switch on means **Enabled**, and chat says `Enabled` or `Disabled`. Lists show plain choices, such as `Open the menu` or `Only in protected zones`.
- A preference set to what the realm has follows the realm: if an operator changes that setting later, you get the new value. A preference set to something else stays yours.
- If a pack doesn't confirm a change within half a second, the summary counts it as not saved (`1 change saved, 1 not saved`) and that line says `not saved, the pack didn't answer. Try again`; a value the pack refuses says why.
- Players who aren't operators and use an item named `Realm Settings` are pointed to `/realm:prefs`.

### Commands

| Command | Who | What it does |
|---|---|---|
| `/realm:prefs` | Everyone | Opens **My preferences**: your own choices from every installed pack, in one form |
| `/realm:config` | Ops | Opens **Realm Settings**: every installed pack's settings for everyone, then **Reset a pack to defaults**. Using an item named `Realm Settings` opens it too (`itemName`) |

### What each pack offers

| Pack | `/realm:config` (for everyone) | `/realm:prefs` (each player) |
|---|---|---|
| Realm Help | `showOpsToEveryone` | |
| Welcome Message | `showOnce`, `chat`, `screenTitle` (the same switches as `/realm:welcome_edit`) | Welcome popup when I join |
| Low Durability Warning | `warnPercent`, `criticalPercent`, `maxUsesForWarning`, `chatOnCritical`; `checkIntervalTicks` is shown, restart only | Low-durability warnings (`/realm:durability`) |
| AFK + Smart Sleep | `afkMinutes`, `announce`, `sleep.enabled`, `sleep.percent`, `sleep.countOtherDimensions`, `sleep.requiredTicks` | Announce when I go AFK |
| Stats & Leaderboards | `sidebarCycleSeconds`, `leaderboardSize` | |
| Realm News & Tips | `tipsEnabled` and `tipIntervalMinutes` (the same values as `/realm:news_tips` → **Settings**), `awayNoticeHours` | |
| Creeper Guard | `mode`, `defaultRadius` | |
| Phantom Opt-out | `defaultOff` (shown as **Phantoms for new players**) | Phantoms near me (`/realm:phantoms`) |
| Right-click Harvest | `requireHoe`, `damageHoe`, `replantCostsSeed` | |
| Farm Loader | `defaultRadius`, `maxAreas`; `everyoneCanAdd` is shown, restart only | |
| Quick Stack & Sort | `sneakTap`, `sortHotbar`, `stashGear`, `stashNamedItems`, `cooldownTicks` | When I sneak-tap a container (`Open the menu`, `Sort it right away` or `Nothing (opens as usual)`); My inventory sort includes my hotbar |
| Chest Finder | `liveScanRadius`, `maxResults`, `highlightSeconds` | |
| Chairs | `maxReach`; `cleanupTicks` is shown, restart only | |
| Rain Extras | `defaultOff` (shown as **Rain extras for new players**), `stormFog.enabled`, `haze.enabled`, `mist.enabled`, `drips.enabled`, `wind.enabled`, `wind.inThunder`, `wind.inRain`, `stormSound.enabled`, `stormSound.volume`, `roof.enabled`, `roof.volume`, `roof.muffleRain` | Rain extras (fog, haze, mist, drips and sounds) (`/realm:rain`) |

Everything else (lists such as crops, `keepItems` and container types, texts such as name tag prefixes, tick intervals, and command permissions) stays in `config.js`.

### Configuration (`scripts/config.js` → `CONFIG`)

| Option | Default | Description |
|---|---|---|
| `answerTicks` | `10` | Ticks to wait for the installed packs to answer, and for each change to be confirmed (20 = 1 s) |
| `itemName` | `Realm Settings` | Operators who use an item with exactly this name (renamed on an anvil) open `/realm:config`. `""` turns it off |

### Saved data

None in this pack. Each pack saves its own settings, so they stay with that pack and still apply when Realm Settings is removed:

| Key | Scope | Contents |
|---|---|---|
| `<prefix>:cfg` (`afk:cfg`, `stash:cfg`, …) | World | JSON of the settings changed in `/realm:config` that differ from `config.js` |
| `<prefix>:pref` (`afk:pref`, `stash:pref`, `welcome:pref`) | Player | JSON of the player's own preferences that differ from the realm's |
| `durability:off`, `phantom:off`, `rain:off` | Player | The existing switches, kept so nobody's earlier choice is lost |
| `news:tipSettings`, `welcome:settings` | World | Shared with `/realm:news_tips` and `/realm:welcome_edit`, so both menus show the same values |

### How it works

- Every other behavior pack has a `scripts/settings.js` that lists what can change in game. The pack reads those options through it (`get(key)`: the world's saved value over `config.js`; `getFor(player, key)`: the player's own value over the world's), so a change applies on the next use, with no restart.
- The packs never import each other. This pack sends the script event `realm:cfg_ping` (`{id, player}`), and each pack answers `realm:cfg_schema` with its options and their current values (`{id, pack, title, part, parts, options}`), split into parts under the 2048-character limit of a script event message. Saving sends `realm:cfg_set` (`{id, pack, key, value, player?}`) and resetting `realm:cfg_reset` (`{id, pack}`). The pack checks the value (type, range, choices), ignores keys it doesn't have, saves it and answers `realm:cfg_ack` (`{id, pack, key, ok, value, error?}`), which is what the save summary reports.
- An option can carry `invert` (a switch stored as `off` but shown as **Enabled**, so no label is a double negative) and `names` (readable words for a list's choices). Labels name what the setting does, never "Turn off ...".
- In-game text is plain ASCII: Bedrock draws a whole line in a smaller fallback font when it holds a character like `…`, `–`, `•` or an emoji, which is why `/realm:help` once looked different in `/help`. `npm run check` (`tools/check-ascii.mjs`) fails on any other character in pack code, and `tools/help-catalog.mjs` converts the docs' typography when it builds the help.
- The part of `settings.js` that does this is the same in every pack: it's copied from `tools/settings-shared.js` by `node tools/sync-settings.mjs`, and `npm run check` fails if a copy is missing or out of date.
- Operators with cheats on could send the same script events with `/scriptevent`; that does nothing an operator can't do in the menu.

---

## Welcome Message — `welcome_bp`

Shows a popup when a player joins the Realm. Operators can edit the popup in-game.

### How to use

1. Join the realm. The welcome popup appears after about 2 seconds; tap its button (`Let's go!` by default) to close it.
2. Run `/realm:welcome` any time to see it again. Don't want the popup when you join? Disable **Welcome popup when I join** in `/realm:prefs`.
3. **Operators:** run `/realm:welcome_edit`, change the title, body or button text and the switches, then submit. Players see the new text on their next join (with "show once" on, each player sees it one more time, unless you turn off "Show it again to players who've seen it" for a typo fix). `/realm:welcome_reset` asks first, then goes back to the pack's default text.

### What players see

- About 2 seconds after joining (`delayTicks`), a popup appears with a title, body text and one close button.
- If the player is still loading, or has chat or their inventory open, the game rejects the popup. The pack retries every second for up to 30 seconds.
- Respawning after death does **not** show it. Only joining does.

### Commands

| Command | Who | What it does |
|---|---|---|
| `/realm:welcome` | Everyone | Shows the welcome message to yourself (preview). Ignores `showOnce` |
| `/realm:welcome_edit` | Ops | Opens an editor: title, body, button text, and toggles for show once, chat copy, big on-screen title and "Show it again to players who've seen it" (on by default; turn it off for a quiet fix). If chat or the inventory stays open, it retries for about 20 s and then says so once |
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
| **Critical** | ≤ `criticalPercent` (3%) left | Red message `! Diamond Pickaxe is about to break!` above the hotbar **and in chat** (`chatOnCritical`) + anvil sound |

- Checks the **main hand, offhand, helmet, chestplate (including elytra), leggings and boots** every `checkIntervalTicks`.
- Warns **once per level**. It only warns again when the item drops to the next level.
- A different kind of item in that slot, emptying the slot, or a repair (Mending, anvil, grindstone) resets it. Another item of the same kind that's just as worn doesn't warn again.
- Each **hotbar slot** is tracked separately, so switching to another worn tool warns for that one too.
- Items without durability (blocks, torches, …) are ignored.
- Named items use their custom name (e.g. `Excalibur is low`).

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

- The name above the player's head becomes `[AFK] Name` (`nameTagPrefix`).
- The player gets the `afk` tag (`tag`). Other packs and commands can use it, e.g. `@a[tag=!afk]`.
- Chat shows `Name is now AFK` (`announce`).

Any activity brings them back, with `Name is back (AFK 12m)` in chat (minutes since being marked AFK; left out under 30 seconds). Sleeping players are never marked AFK. Leftover AFK names or tags are cleared when a player rejoins, and after a script reload.

### Smart sleep (night skip)

Checked every second while at least one player is in bed:

1. **Counted players** = everyone asleep, plus every non-AFK player in the Overworld (also those in the Nether/End if `sleep.countOtherDimensions` is on).
2. **Needed** = `ceil(counted × sleep.percent / 100)`, at least 1.
3. While anyone is in bed, Overworld players see `Zzz 1/2 sleeping - awake: Sam (1 AFK ignored)` above the hotbar. The names show when 1 to 3 counted players are awake.

Lying in bed counts as activity, so a player who waits in bed for a long night isn't marked AFK when they get up.
4. **If vanilla's own rule already covers it**, i.e. enough players are asleep to meet the `playerssleepingpercentage` gamerule counting *everyone*, the pack does nothing and lets vanilla skip the night. That's always the case when nobody is AFK and everyone is in bed. Doing both would race, and the second skip would land a full day later.
5. Otherwise, once enough players have been asleep for `sleep.requiredTicks` (about 8 s, and never less than about 7 s, so vanilla's ~5 s skip always comes first):
   - **At night:** moves to the **next morning**. Absolute time moves forward, so the day counter (`showdaysplayed`) stays correct. The weather clears too.
   - **During a daytime thunderstorm:** only clears the weather. The pack only knows about storms that started while it was running, so a storm already going when the realm started isn't cleared.
   - Chat shows `Good morning! (1 AFK player skipped)`.

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
| `sleep.enabled` | `true` | Turn smart sleep on or off |
| `sleep.percent` | `100` | % of counted players that must be asleep |
| `sleep.countOtherDimensions` | `false` | Also count non-AFK players in the Nether/End (who can't sleep), like vanilla |
| `sleep.requiredTicks` | `160` | How long enough players must be asleep before skipping (20 = 1 s). Values below `140` are raised to `140`, so vanilla's ~100-tick skip always comes first |

Operators can change `afkMinutes`, `announce` and every `sleep.` option in game with `/realm:config`; they apply within a second. Each player can stop chat announcing them in `/realm:prefs`. With `announce` off, nobody is announced.

### Saved data

| Key | Scope | Contents |
|---|---|---|
| `afk:cfg` | World | Settings changed in `/realm:config` |
| `afk:pref` | Player | JSON `{ announce: false }` when the player turned their announcements off in `/realm:prefs` |

AFK state itself isn't saved: it's kept in memory and resets on rejoin. While a player is AFK, their name tag and the `afk` tag are changed.

### Known limits

- Being fully AFK while in a vehicle with no input still counts as AFK, which is intended.
- Name-tag changes may clash with other packs that also change player name tags.

---

## Stats & Leaderboards — `stats_bp`

Tracks player stats as scoreboards, with leaderboard menus and an optional sidebar.

### How to use

1. Play: stats count on their own (playtime and distance, except while AFK; deaths; mob and player kills; blocks mined and placed; elytra distance; joins).
2. Run `/realm:stats` and pick **My stats** to see every stat, with your rank (`#2 of 7`) in each one you've scored in, and the date you first joined (UTC), or **Leaderboards** and a stat to see the top 10.
3. **Operators:** `/realm:stats_sidebar <stat>` shows one stat on everyone's sidebar. Use a stat ID (`playtime`, `deaths`, `mobkills`, `pvpkills`, `mined`, `placed`, `travelled`, `flown`, `joins`), for example `/realm:stats_sidebar travelled`, `cycle` to rotate through all of them every 30 seconds, or `off`.

### Stats

| ID (for `/realm:stats_sidebar`) | Label | How it's counted |
|---|---|---|
| `playtime` | Playtime | +1 min per 60 s online. Paused while the player has the `afkTag` tag |
| `deaths` | Deaths | Player deaths |
| `mobkills` | Mob kills | Non-player entities killed by the player (arrows count for the shooter) |
| `pvpkills` | Player kills | Other players killed |
| `mined` | Blocks mined | Blocks broken by the player. Essentials+ tree felling and vein mining only count the first block |
| `placed` | Blocks placed | Blocks placed by the player |
| `travelled` | `Distance travelled` | Blocks moved, not gliding, measured every second. Includes walking, swimming, boats and minecarts. Not counted while AFK, so a water stream or minecart loop doesn't climb the board |
| `flown` | Elytra distance | Blocks moved while gliding |
| `joins` | Times joined | Each join |

- Movement faster than `maxSpeed` blocks/s is treated as a teleport and not counted. Respawning isn't counted either.
- Each stat is the scoreboard objective **`stats_<id>`** (e.g. `stats_deaths`). Scores are stored under the player's **name** (a "fake player" participant), not the player entity. Bedrock shows offline entity participants as "Player Offline", so this keeps real names on leaderboards and the sidebar when people are offline.
- Vanilla commands work too, e.g. `/scoreboard players list "Steve"`.
- If someone changes their gamertag, their stats start again under the new name, and the old name stays on the leaderboard.
- Scores from the first Stats pack (v1.0.0, before the Realm Bundle), which stored them on the player entity, move to the name automatically the next time that player joins. Until then they're hidden from the menus, and the vanilla sidebar may still show them as "Player Offline".
- First-joined date is saved per player, from the first join after the pack was added.

### Commands

| Command | Who | What it does |
|---|---|---|
| `/realm:stats` | Everyone | Opens **Realm Stats**: **My stats** (every stat with your rank `#2 of 7`, plus first-joined date) or **Leaderboards** (pick a stat to see the top 10, `leaderboardSize`, with your own position underneath if you're outside it) |
| `/realm:stats_sidebar <stat>` | Ops | Shows a stat on everyone's sidebar. `<stat>` is a stat ID, **`cycle`** (rotates through every stat every 30 seconds, `sidebarCycleSeconds`) or **`off`** |

### Configuration (`scripts/config.js` → `CONFIG`)

| Option | Default | Description |
|---|---|---|
| `afkTag` | `afk` | Playtime isn't counted while a player has this tag. Must match the AFK pack's `tag`. `""` = always count |
| `leaderboardSize` | `10` | Number of players on a leaderboard |
| `sidebarCycleSeconds` | `30` | Seconds per stat in `cycle` mode |
| `maxSpeed` | `100` | Faster movement (blocks/s) counts as a teleport and isn't added to distance |

Operators can change `leaderboardSize` and `sidebarCycleSeconds` in game with `/realm:config`. A new cycle length applies from the next second.

### Saved data

| Key | Scope | Contents |
|---|---|---|
| `stats_playtime`, `stats_deaths`, `stats_mobkills`, `stats_pvpkills`, `stats_mined`, `stats_placed`, `stats_travelled`, `stats_flown`, `stats_joins` | World scoreboard | The stats, one participant per player name. **Kept** when switching between the individual pack and a bundle |
| `stats:sidebar` | World | Current sidebar mode (`<stat>` / `cycle`) |
| `stats:firstJoin` | Player | First join time (ms since epoch) |
| `stats:cfg` | World | Settings changed in `/realm:config` |

### Resetting stats

Use vanilla commands (cheats needed):

- `/scoreboard players reset * stats_deaths` resets one stat for everyone.
- `/scoreboard players reset "Steve" stats_deaths` resets it for one player.
- `/scoreboard objectives remove stats_deaths` removes the stat entirely.

 The pack recreates missing objectives automatically.

---

## Realm News & Tips — `news_bp`

A news popup that operators edit in-game, a "welcome back" notice, and rotating chat tips.

### How to use

1. When there's news, it pops up about 5 seconds after you join, after the welcome popup. Tap `Got it` to close it. If you're online when it's posted, chat says `Realm news updated. Run /realm:news to read it.`
2. Missed it, or want to read it again? Run `/realm:news`.
3. Tips appear in chat every 20 minutes while someone is online, starting with `[Tip]`.
4. **Operators:** `/realm:news_edit` writes the news. Minecraft's text boxes hold only 100 characters each, so the body is split over at least 10 boxes (1,000 characters) that are joined in order with nothing between them; type `\n` for a new line. Easier for a long message: paste it into chat as `/realm:news_body "<text>"`, with `|` for each new line, and the editor opens with every box filled in; check the title and tap **Save**. Chat has a length limit too, so for a message longer than one paste, paste it in parts: the first part with `/realm:news_body` (close the editor that opens, or just keep chat open), each next part with `/realm:news_add "<text>"`, then run `/realm:news_edit` to check and save the whole draft. Parts are joined exactly as pasted, so end a part on a space or start the next one with one. Leave "Pop up for everyone on their next join" on to announce it, or turn it off for a quiet fix such as a typo. `/realm:news_tips` adds, edits or deletes tips, posts the next one now, changes how often they're posted (5 to 120 minutes) or turns them off.

### News popup

- When an op saves news with **"Pop up for everyone on their next join"** checked, every player sees it **once** on their next join, and everyone online gets `Realm news updated. Run /realm:news to read it.` in chat. Reading it with `/realm:news` counts, so a player who already read it isn't shown the popup again.
- The popup is timed after the welcome popup (`delayTicks` = 5 s). If another popup is still open, it waits up to about 90 s.
- If it still can't show, chat says `There's new Realm news! Run /realm:news to read it.` (on the same line after the "welcome back" notice, if there is one), and the player sees the popup on their next join instead.
- Saving **unchecked** is a quiet edit (e.g. a typo fix). Players who already saw the news don't see it again.
- An empty body means no news.

### "Welcome back"

Players returning after at least `awayNoticeHours` (12 h) get `Welcome back! You were away 3d 5h.` It appears at the top of the news popup if there's unseen news, otherwise in chat. Last-seen time is refreshed every minute while online.

### Tips

- A tip from the list is posted in chat every `tipIntervalMinutes` (20), as `[Tip] …` (`tipPrefix`), only while someone is online.
- The default tips cover the realm's other add-ons (tree felling, vein mining, the Waypoint Menu) and these packs (`/realm:stats`, `/realm:afk`, `/realm:help`, the Quick Stack & Sort sneak-tap and `/realm:find`). A world that already saved its own tips keeps them; add the new ones with `/realm:news_tips`.
- Opening **+ Add a tip** and saving it empty changes nothing. Only a real change saves the list, and from then on the saved list is used instead of `config.js`.

### Commands

| Command | Who | What it does |
|---|---|---|
| `/realm:news` | Everyone | Shows the current news, which also counts as having seen its popup |
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
| `tips` | 5 tips about the realm's add-ons and commands | ✅ `/realm:news_tips` | Starting tip list |
| `tipIntervalMinutes` | `20` | ✅ `/realm:news_tips` → Settings, or `/realm:config` | Minutes between tips |
| `tipsEnabled` | `true` | ✅ `/realm:news_tips` → Settings, or `/realm:config` | Post tips at all |
| `delayTicks` | `100` | ❌ | Ticks after joining before showing the news (after the welcome popup's `40`) |
| `awayNoticeHours` | `12` | ✅ `/realm:config` | Minimum time away for the welcome-back notice. `0` = never |
| `tipPrefix` | `§b[Tip]§r ` | ❌ | Text before each tip in chat |

### Saved data

| Key | Scope | Contents |
|---|---|---|
| `news:news` | World | JSON `{ title, body }` |
| `news:revision` | World | Increases on each announced save |
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
2. Run `/realm:guard` to see the mode, which blasts are covered and any protected zones.
3. **Operators:** to keep creeper craters in the wild and protect only bases, set the mode to `zones` in `/realm:config` (or `mode` in `config.js`), then stand in a base and run `/realm:guard_add <name> [radius]` (for example `/realm:guard_add home 64`). `/realm:guard_remove <name>` removes a zone.

### What players see

- **`everywhere` mode (default):** every blast from a listed source (`sources`, creepers by default) hurts and knocks back as usual but breaks no blocks.
- **`zones` mode:** blocks inside a zone are kept; the rest of the blast breaks blocks as in vanilla. A creeper at the edge of a zone breaks only the part of its crater that lies outside.
- Charged creepers are covered too. TNT, beds in the Nether or End, respawn anchors and end crystals are never touched, because they aren't listed (beds and anchors have no source entity at all).
- Unlike the `mobGriefing` gamerule, this changes nothing else: villagers still farm, sheep still eat grass (the Wool Farm guide needs that) and endermen still pick up blocks.

### Commands

| Command | Who | What it does |
|---|---|---|
| `/realm:guard` | Everyone | Shows whether the spot you're standing on is protected (and by which zone), then the mode, the covered blast sources and the zones |
| `/realm:guard_add <name> [radius]` | Ops | Protects a sphere around you, `radius` 8–256 blocks (default 64, `defaultRadius`). Names use letters, digits, `_` and `-`, up to 24, and must be unique whatever their case (`home` and `Home` are the same zone). Only matters in `zones` mode |
| `/realm:guard_remove <name>` | Ops | Removes a zone (any case) |

### Configuration (`scripts/config.js` → `CONFIG`)

| Option | Default | Description |
|---|---|---|
| `mode` | `everywhere` | `everywhere`: listed blasts never break blocks. `zones`: only inside the zones from `/realm:guard_add` |
| `sources` | `["minecraft:creeper"]` | Exploding entity types to neutralize. Add `minecraft:fireball` (ghast fireballs) or `minecraft:wither_skull` if wanted |
| `defaultRadius` | `64` | Zone radius in blocks when `/realm:guard_add` is given none |

Operators can change `mode` and `defaultRadius` in game with `/realm:config`; a new mode applies to the next explosion. `sources` stays in `config.js`.

### Saved data

| Key | Scope | Contents |
|---|---|---|
| `guard:zones` | World | JSON list of zones `{ name, dim, x, y, z, radius }`, up to 100 |
| `guard:cfg` | World | Settings changed in `/realm:config` |

### How it works

The pack listens to `world.beforeEvents.explosion`. When the exploding entity's type is in `sources`, it empties the list of blocks the blast will break (`everywhere`), or drops the blocks inside a zone from it (`zones`). It never cancels the explosion, which would also remove the damage and drops.

---

## Phantom Opt-out — `phantom_bp`

Lets each player disable phantoms for themselves. Phantoms come from not sleeping, and with smart sleep the night can be skipped without everyone in bed, so some players never need to sleep.

### How to use

1. Run `/realm:phantoms`, or disable **Phantoms near me** in `/realm:prefs`. Chat says `Phantoms near you: Disabled. Run /realm:phantoms again to enable them.` The choice is remembered.
2. Phantoms that spawn for you now vanish the moment they appear, with no drops. Everyone else's phantoms are untouched.
3. Run `/realm:phantoms` again to get them back (for phantom membranes, say).

### What players see

- Bedrock spawns phantoms at night, in small groups high above a player who hasn't slept for 3 or more in-game days. When the nearest player to a new phantom has phantoms off, and the phantom appeared at least `minHeightAbovePlayer` (10) blocks above them, it is removed on the spot.
- Every phantom in a group is checked the same way. If two players stand close together, only the nearest one's choice counts.
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

Operators can change `defaultOff` in game with `/realm:config`. Players who already chose keep their choice.

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

### Configuration (`scripts/config.js` → `CONFIG`)

| Option | Default | Description |
|---|---|---|
| `crops` | the table above | Which blocks harvest: `block`, the growth `state`, its `ripe` value, the `seed` item a replant uses and the harvest `sound` |
| `requireHoe` | `false` | Only harvest when a hoe is held |
| `damageHoe` | `false` | A held hoe loses one durability per harvest (Unbreaking applies, and the hoe can break) |
| `replantCostsSeed` | `false` | The replant uses one seed (or carrot, potato, wart, cocoa bean): from the drops, else from your inventory. With none, the crop is harvested and not replanted |

Operators can change `requireHoe`, `damageHoe` and `replantCostsSeed` in game with `/realm:config`; they apply to the next harvest. `crops` stays in `config.js`.

### Saved data

| Key | Scope | Contents |
|---|---|---|
| `harvest:cfg` | World | Settings changed in `/realm:config` |

### How it works

`world.beforeEvents.playerInteractWithBlock` cancels the tap when it is the first event of the press, the player isn't sneaking, the hand is empty or holds a `*_hoe`, and the block is a listed crop at its ripe value. On the next tick the pack runs `loot spawn <center> mine <block> mainhand` as the player, then sets the crop's state back to 0. If `/loot` fails for a harvest, that harvest drops from a built-in table close to vanilla (without Fortune), and the first failure logs `[harvest] /loot failed`.

---

## Farm Loader — `farm_bp`

Keeps named farms loaded with Bedrock ticking areas, so crops grow, furnaces smelt and redstone runs while everyone is elsewhere.

### How to use

1. Run `/realm:farm` to see which farms are kept loaded: name, dimension, coordinates, size, who added it and when.
2. **Operators:** stand in the middle of a farm and run `/realm:farm_add <name> [radius]`, for example `/realm:farm_add kelp 2`. The chunks within that many chunks of you stay loaded, and chat confirms `Farm "kelp" stays loaded (radius 2 chunks, 3/10 used)`.
3. **Operators:** `/realm:farm_remove <name>` stops keeping it loaded, or tap **Remove** next to it in `/realm:farm`; the menu comes back afterwards, so you can remove another.

### What keeps running, and what doesn't

Bedrock rules, worth knowing before you add a farm:

- **Keeps running:** random ticks (crops, kelp, sugar cane, bamboo, cactus and trees grow), furnaces, smokers and blast furnaces, hoppers, redstone, pistons, observers and flowing water.
- **Doesn't:** mob spawning. Mobs only spawn near a player, so iron farms, mob farms and the slime farm still need someone nearby.
- **Costs performance:** every loaded chunk costs the realm. A radius of 2 chunks covers a circle about 5 chunks (80 blocks) across. Bedrock allows 10 ticking areas per world, and the pack refuses an 11th before the game does.
- The game keeps the ticking areas across realm restarts by itself. The pack only keeps the list for the menu.

### Commands

| Command | Who | What it does |
|---|---|---|
| `/realm:farm` | Everyone | Lists the loaded farms. Operators also get a **Remove** button for each |
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
4. **Your way:** in `/realm:prefs`, choose what sneak-tapping a container does for you (`menu`, `sort` right away, or `off` so it just opens), and whether sorting your inventory includes your hotbar.
5. **Help:** run `/realm:stash_help` for a page that explains the menu, chest locks and every command with its usage. `/help realm:stash` and `/help realm:sort` also describe them.
6. **Operators:** sneak-tap someone else's locked container for **Remove the lock (operator)**. To switch chest locks off for the realm, disable **Chest locks** in `/realm:config` (existing locks are kept for when they're enabled again).

### What players see

- **The menu** shows how full the container is and how full your inventory is (`Barrel · 18 of 27 slots used`, `Your inventory · 22 of 27 slots used`), then the three buttons. Close it to do nothing. Holding anything other than gear (a block, a hopper, honeycomb) skips the menu, so sneak-placing a hopper on a chest or waxing a copper chest works as usual. To scrape a copper chest with an axe, don't sneak.
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
- Breaking a locked container (you can, as its owner) removes its lock.
- **What a lock can't stop:** a hopper (or hopper minecart) that was already under it before it was locked, a copper golem that takes from a locked copper chest, and pistons. Chest Finder still points to a locked chest that holds what you search for; it can't open it.
- Locks only show in the sneak-tap menu, so a player who chose `sort` or `off` for the sneak-tap in `/realm:prefs` locks nothing until they switch back to `menu`. Their own locks still hold.

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

---

## Chest Finder — `find_bp`

Answers "which chest has the iron?" for a shared base: it remembers what each container held the last time anyone opened it, and points you to it.

### How to use

1. Open chests as usual. The pack quietly remembers what's in them.
2. Run `/realm:find iron`, or just `/realm:find` while holding the item. A menu lists the containers that have it, nearest first, for example `Chest · 23 Iron Ingot` with `35 blocks NE · seen 2h ago` under it.
3. Tap a result: a column of particles marks that container for 10 seconds. Only you see it, and chat gives its coordinates.

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
4. **Where are the borders?** `/realm:claim` → **Show claim borders** sparkles the edges of every claim near you for 10 seconds. Walking in or out of one says `Entering Sam's claim` / `Leaving Sam's claim` above the hotbar.
5. **Operators:** enable it in `/realm:config` → **Land Claims** → **Land claims**, and set the claim size and how many each player gets there. `/realm:claim` → **All claims (operator)** lists every claim to remove any of them.

### What players see

- **While disabled** (`enabled`, disabled by default): `/realm:claim` answers `Land claims are disabled on this realm. An operator can enable them in /realm:config (Land Claims).` and nothing is protected. Disabling it later keeps every claim; they apply again once it's enabled.
- **The menu** says whose land you're on and how many claims you have (`You have 1 of 2 claims`), then **Claim this land** (when you're on unclaimed land and have one left), **Show claim borders**, one **My claim** button per claim, and for operators **All claims (operator)**.
- **Claiming** is refused with a reason when you already have 2 (`maxClaims`), or when the new square would overlap another claim (`That would overlap Sam's claim (-16, 48 to 16, 80). Move further away.`). A claim keeps the size it was made with when operators change `radius` later.
- **What's protected** from everyone who isn't the owner or shared: breaking and placing blocks, tapping any block (chests, doors, trapdoors, buttons, levers, beds, crafting tables, buckets), and using the entities in `protectedEntities`. A block placed from outside onto the edge of a claim is refused too.
- **Explosions** break no blocks inside a claim (`protectExplosions`), whatever caused them; the damage is unchanged, and the part of the blast outside the claim breaks blocks as usual.
- **Operators** can't build in other players' claims unless **Operators can build in any claim** is enabled (`operatorsBypass`), so a realm where everyone is an operator still gets protection. They can always remove a claim.
- **What a claim doesn't stop:** mobs, hurting animals or pets, fire spreading, lava or water flowing in, pistons pushing blocks in from outside, and hoppers or minecarts pulling items across the border.

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
| `operatorsBypass` | `false` | Operators can build, break and open things in anyone's claim |
| `protectedEntities` | `armor_stand`, `chest_minecart`, `hopper_minecart`, `chest_boat` | Entities only a claim's players can use inside it |
| `borderSeconds` | `10` | How long **Show claim borders** draws them |

Operators can change `enabled`, `radius`, `maxClaims`, `protectExplosions` and `operatorsBypass` in game with `/realm:config`. The rest stays in `config.js`. The realm has room for 500 claims in all.

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
- Once a second, each player's claim is looked up to say when they walk in or out of one.

---

## Death Point — `death_bp`

Tells you where you died once you respawn, and points you back there. The realm keeps inventories on death, so nothing is lying on the ground waiting for you: this is for finding your way back to where you were, say a cave you were exploring or a long trip through the Nether.

### How to use

1. Nothing to set up: when you respawn after dying, chat says `You died at 120, 64, -340 in the Overworld.`
2. Run `/realm:death` any time to see your last death point again, how far it is from where you stand and in which direction, for example `It's 245 blocks to the NE, 12 blocks down.`
3. Don't want the chat message? Disable **Tell me where I died** in `/realm:prefs`. `/realm:death` still works.
4. If an operator has enabled it, run `/realm:death_back` to teleport to your last death point, once per death. It only lands you somewhere safe to stand, and says so when there isn't such a place.
5. **Operators:** enable `/realm:death_back` in `/realm:config` → **Death Point** → **Teleport back to the death point (/realm:death_back)**. The same page turns the respawn message off for everyone.

### What players see

- **On respawn** (`announce`): `You died at 120, 64, -340 in the Overworld. Run /realm:death to see where that is from here.` A player who leaves on the death screen gets it when they next spawn.
- **`/realm:death`** shows the block you died in and its dimension, then the distance along the ground, rounded to whole blocks, with one of 8 directions (N, NE, E, SE, S, SW, W, NW; north is toward negative Z) and how far up or down. Within 2 blocks it says `You're standing on it.` In another dimension it says which one you're in, with no distance. When `/realm:death_back` is enabled it adds whether you can still use it for this death.
- **`/realm:death_back`** while disabled (`backEnabled`, disabled by default): `Teleporting back is disabled on this realm. An operator can enable it in /realm:config (Death Point). /realm:death still shows the way.`
- **`/realm:death_back`** while enabled looks for the nearest safe spot within 2 blocks sideways (`backSearchRadius`) and 8 blocks up or down (`backSearchHeight`) of the death point: two blocks of air (or grass, ferns or a dead bush) to stand in, on a block that isn't air, water, lava, magma, fire, a campfire, cactus, a berry bush, a wither rose, powder snow or pointed dripstone, with no lava or fire right beside it. It works across dimensions. Then:
  - it teleports you and says `Teleported back to your death point (120, 65, -340).` Once per death: a second try says `You already went back to this death point.`
  - with no safe spot (you died in lava, deep water, inside a wall or below the world) it says so and doesn't move you, and you can try again after the lava cools or the water is drained.
  - a death point far from every player isn't loaded: it's loaded for a moment (up to 5 seconds, `backLoadSeconds`) and the search runs then. If it can't be loaded it says so.
- `/realm:death_back` doesn't bring back dropped items or experience, and it isn't needed for them: the realm keeps inventories on death.

### Commands

| Command | Who | What it does |
|---|---|---|
| `/realm:death` | Everyone | Shows your last death point (x, y, z and dimension), with the distance and direction from where you stand, or which dimension it's in |
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

Operators can change all three in game with `/realm:config`. Players who already chose keep their choice when `defaultOn` changes. Each player switches it for themselves with `/realm:refill` or **Refill my hotbar** in `/realm:prefs`.

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
- **Sharing the bar with other packs:** the same bar also shows other packs' short messages: low-durability warnings, `Sorted 31 stacks` and other Quick Stack & Sort results, entering or leaving a claim, the Chairs reminder, AFK and others. The HUD can't see them, so a message is replaced by the HUD as soon as the HUD's text changes (within half a second while you walk) or after 2 seconds when you stand still. The low-durability warning's red line also goes to chat, so it isn't lost. [Mob Health](#mob-health--mobhp_bp) asks the HUD to wait 2 seconds after each hit, so the health stays readable, and so do [Daily Quests](#daily-quests--quests_bp) progress notes. While you glide, the [Elytra HUD](#elytra-hud--elytra_bp) keeps the bar to itself; the coordinates come back a second or two after you land. Other packs can do the same (see How it works).

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
- Another pack that puts a message on the bar can send the script event `realm:actionbar` with `{"player":"<player id>","ticks":40}`; the HUD then leaves that player's bar alone for that many ticks (up to 200) and redraws right after. Mob Health, Elytra HUD and Daily Quests do this; the packs never import each other.
- Turning the HUD off clears the bar right away.

---

## Mob Health — `mobhp_bp`

Hit a mob and its name and health show above your hotbar, so you know how close it is to going down.

### How to use

1. Nothing to set up: hit a mob with anything, or shoot it, and the bar above your hotbar shows something like `Zombie  14/20 ||||||||||` with the bar in color. Only you see it.
2. Don't want it? Run `/realm:mobhp` to hide it for yourself; run it again to show it. The same switch is **Show the health of mobs I hit** in `/realm:prefs`. The choice is remembered.
3. **Operators:** `/realm:config` → **Mob Health** disables it for the whole realm, shows players' health too when one player hurts another, changes the bar length, or changes what new players start with.

### What players see

- **Name:** the mob's name tag if it has one, otherwise its name in the game's language (`Zombie`, `Iron Golem`).
- **Health** after the hit, rounded up to whole points, out of its maximum (`14/20`; 2 points are one heart), then a bar of 10 `|` characters (`barLength`): green above half health, yellow above a quarter, red below that, with the lost part in dark gray. A killing blow shows `0/20`.
- Shown for melee hits and for arrows, tridents and other projectiles you fired, every time the mob is hurt by you.
- **Other players** only when an operator enabled **Show players' health too** (`players`, disabled by default): then hurting a player shows their name and health the same way.
- Enabled for every player until they disable it (`defaultOn`). While an operator has disabled it for the realm (`enabled`), nobody sees it.
- The health uses the bar above the hotbar, like other packs' short messages. With the [Coordinates HUD](#coordinates-hud--hud_bp) on, the HUD waits 2 seconds (`holdTicks`) after each hit before it draws itself again.

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
| `holdTicks` | `40` | How long (ticks) the Coordinates HUD leaves the health on the bar before drawing itself again |

Operators can change `enabled`, `defaultOn`, `players` and `barLength` in game with `/realm:config`. `holdTicks` stays in `config.js`. Each player switches it for themselves with `/realm:mobhp` or **Show the health of mobs I hit** in `/realm:prefs`; players who already chose keep their choice when `defaultOn` changes.

### Saved data

| Key | Scope | Contents |
|---|---|---|
| `mobhp:pref` | Player | The player's choice from `/realm:mobhp` or `/realm:prefs`, when it differs from `defaultOn` |
| `mobhp:cfg` | World | Settings changed in `/realm:config` |

### How it works

- `world.afterEvents.entityHurt` gives the hurt mob and the damage source. When the damaging entity (the shooter, for a projectile) is a player with it on, the pack reads the mob's `minecraft:health` component and sets that player's action bar, with the mob's name as a translated text so it reads in each player's language.
- After each one it sends the script event `realm:actionbar` with `{"player":"<id>","ticks":40}`, which the Coordinates HUD understands. Without the HUD nothing listens and nothing happens.

---

## Elytra HUD — `elytra_bp`

While you glide, the bar above the hotbar shows your speed, height, how much durability your elytra has left and how many firework rockets you carry.

### How to use

1. Put on an elytra and glide. Above the hotbar you see something like `31.4 blocks/s  Y 142  Elytra 87%  Rockets 12`, updated 4 times a second.
2. Don't want it? Run `/realm:elytra`, or disable **Elytra HUD while gliding** in `/realm:prefs`. Chat says `Elytra HUD: Disabled. Run /realm:elytra again to enable it.` The choice is remembered.
3. **Operators:** to turn it off for everyone, disable **Elytra HUD** in `/realm:config` → **Elytra HUD**. The same page sets when durability turns red.

### What players see

- **Speed** in blocks per second (your total speed, diving included), **Y** (your height), **Elytra** durability left in percent and **Rockets**: firework rockets in your inventory and offhand.
- Durability shows green, yellow at 30 percent or less, and red at 10 percent or less (`lowPercent`). An elytra stops working at 1 durability left, which shows as 0%.
- The bar only shows while you're gliding and fades a moment after you land. Nothing is shown, and nothing is checked, for players who aren't gliding.
- With the [Coordinates HUD](#coordinates-hud--hud_bp) on, it pauses while you glide, so the two don't take turns on the bar; your coordinates come back a second or two after you land.
- Other messages above the hotbar (low durability warnings, claim borders, the sleep count) can briefly swap places with it while you glide.

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

Operators can change `enabled` and `lowPercent` in game with `/realm:config`; `intervalTicks` shows there but is read when the world starts, so change it in `config.js`. Each player can disable the HUD for themselves in `/realm:prefs` (**Elytra HUD while gliding**), the same switch as `/realm:elytra`.

### Saved data

| Key | Scope | Contents |
|---|---|---|
| `elytra:pref` | Player | JSON `{ "off": true }` when the player disabled the HUD for themselves. Set by `/realm:elytra` and `/realm:prefs` |
| `elytra:cfg` | World | Settings changed in `/realm:config` |

### How it works

Every `intervalTicks` the pack looks at each player's `isGliding`. For gliding players who haven't disabled it, it reads `getVelocity()` (blocks per tick, times 20), their Y, the chest slot's durability through the equippable component, and counts rockets in the inventory and offhand, then writes the line with `onScreenDisplay.setActionBar`.

While it shows, it also sends the script event `realm:actionbar` with `{"player":"<id>","ticks":30}` (renewed every 10 ticks; `ticks` is at least 3 times `intervalTicks`), the same request Mob Health makes, so the Coordinates HUD leaves that player's bar alone until they stop gliding. Without the HUD nothing listens.

---

## Realm Mail — `mail_bp`

Write letters to anyone who has played on the realm, online or not. Letters to offline players wait in their inbox, and they're told about them when they join. Letters carry words only: for items, see the [Player Mailroom](https://mc.nish.software/mailroom/) build.

### How to use

1. Run `/realm:mail` and pick **Write a letter**. Choose who it's for (everyone who has joined since the pack was added, with `(online)` after the ones playing now), type a subject and the letter, and press **Send**. Type `\n` in the letter for a new line.
2. If they're online, they see `New letter from Sam: "Hello!". Read it with /realm:mail` in chat. If not, the letter waits: the next time they join, chat says `You have 2 unread letters: /realm:mail`.
3. **Read your letters:** `/realm:mail` → **Inbox**. New letters are marked `[New]`. Open one to read it, then **Reply** or **Delete** it. **Delete all read letters** clears out the rest.
4. **See what you sent:** `/realm:mail` → **Sent** shows your recent letters and whether each was read yet.
5. Don't want the chat line on joining? Disable **Unread letters notice on join** in `/realm:prefs`.
6. **Operators:** `/realm:config` → **Realm Mail** sets how many letters an inbox holds, how many are kept in Sent, the wait between letters, and whether players are told about unread letters on joining.

### What players see

- **The menu** says how many unread letters you have, then **Inbox** (`3 letters, 1 unread`), **Write a letter** and **Sent**.
- **Writing:** the recipient list holds every player who has joined since the pack was added (up to 400, `maxRoster`; the ones seen longest ago are forgotten first). The subject is shortened to 40 characters (`subjectLength`) and the letter to 600 (`bodyLength`); chat says `(It was shortened to fit.)` when that happens. An empty letter brings the form back with `Write something in the letter first.` A letter without a subject gets `(no subject)`.
- **Waiting between letters:** each player can send one letter every 10 seconds (`sendCooldownSeconds`); sending sooner says `Wait 4 more seconds before sending another letter.`
- **Full inboxes:** an inbox holds 50 letters (`inboxLimit`). When a letter arrives in a full inbox, the oldest letters its owner has already read are dropped to make room. If every letter in it is still unread, the letter isn't sent and the writer sees `Alex's mailbox is full of unread letters. Try again once they've read some.`
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
| `bodyLength` | `600` | Longest letter, in characters |
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

Pick a nickname and a color to show above your head instead of your gamertag. Chat, the player list and death messages still show gamertags: the stable Script API can't change chat.

### How to use

1. Run `/realm:nick`, type a nickname (3 to 16 letters A-Z, digits, spaces or `_`), pick a color and tap **Save**. It shows above your head right away, with your gamertag in gray underneath.
2. Run `/realm:nick` again to change it, or enable **Remove my nickname** there to show your gamertag again. Your nickname stays when you leave, die or the realm restarts.
3. **Operators:** `/realm:nick` → **Players' nicknames (operator)** lists every saved nickname; tap one to clear it, even for players who are offline. To turn nicknames off for everyone, disable **Nicknames** in `/realm:config` → **Nicknames**.

### What players see

- **Above your head:** your nickname in the color you picked, and your gamertag in gray on a second line (`showGamertag`), so everyone still knows who is who. With the AFK pack, an AFK player's tag reads `[AFK] Nickname`.
- **Chat still shows your gamertag**, and so do the player list, death messages, `/realm:` command messages and other packs' messages. The stable Script API has no chat events, so a pack can't change the name in chat.
- **Rules:** 3 to 16 characters: letters A-Z, digits, spaces and `_` (spaces at the ends are trimmed, repeated spaces become one). A nickname can't be another player's gamertag or nickname, whatever the case: the form says `Alex is someone else's gamertag.` or `Sam already has that nickname.` and opens again.
- **Colors:** White, Gray, Red, Dark red, Gold, Yellow, Green, Dark green, Aqua, Dark aqua, Blue, Light purple, Dark purple.
- **Operators** clearing a nickname see `Cleared Nick (Gamertag).`; the player, if online, gets `An operator cleared your nickname.`
- **While nicknames are disabled** (`enabled`): `/realm:nick` answers `Nicknames are disabled on this realm. An operator can enable them in /realm:config (Nicknames).`, everyone shows their gamertag, and saved nicknames come back once it's enabled again.

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

- The nickname is the player's `nameTag` (`§<color><nickname>§r`, then `\n§7<gamertag>`). Bedrock forgets a player's name tag when they leave, so it's set again whenever a player spawns.
- Twice a second the pack compares each nicknamed player's name tag with what it should be and sets it again if it differs. That undoes the AFK pack, which writes `[AFK] Gamertag` and then the bare gamertag to the same name tag, while keeping its `[AFK]` prefix for players with the `afk` tag.
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
  - **Harvest:** breaking a fully grown crop (wheat, carrots, potatoes, beetroot, nether wart, cocoa), or a melon or pumpkin, from `crops`. Tapping a grown crop so it resets, as the Right-click Harvest pack does, counts too.
  - **Place:** placing blocks.
  - **Travel:** blocks moved any way (walking, swimming, riding, flying), added every 5 seconds. Teleports (faster than `maxSpeed`) and respawning don't count.
  - **Eat:** finishing eating any food.
  - **Fish:** fish caught with a fishing rod (cod, salmon, tropical fish, pufferfish by default).
- **Progress notes** appear above the hotbar at a quarter, half and three quarters of a quest (`progressNotes`). With the [Coordinates HUD](#coordinates-hud--hud_bp) on, the HUD waits 2 seconds so the note stays readable (the pack sends `realm:actionbar`, like Mob Health).
- **Rewards** go into your inventory; what doesn't fit drops at your feet, and the chat line says so. XP levels are added to your level. Finishing all of them says `All of today's quests are done. New ones in 5h 12m.`
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
- **Fish:** a fishing hook belongs to the player nearest to it when it appears, and its place is followed every 2 ticks. An item that appears within 3 blocks of where a hook was in the last second is that player's catch, once per hook. There is no "caught a fish" event in the stable API, so this is how a catch is recognized.
- **Travel** adds the distance moved each second while a travel quest is open, as the Stats pack measures it.
- The quests are saved on the player whenever they progress.

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
5. **Operators:** place a chest or barrel for the donations, look at it and run `/realm:goals_add <item> <amount> [name]`, for example `/realm:goals_add cobblestone 10000 Colosseum`. In a goal's page, **Mark finished** stops donations early, **Link to the block I'm looking at** moves the goal to another container, and **Remove this goal** deletes it (the items stay in its chest).

### What players see

- **The menu** lists the goals still open, oldest first, then **Finished goals** when there are any. Operators also get **Add a goal (operator)**, which explains `/realm:goals_add`.
- **Donating** moves stacks of the goal's item from anywhere in your inventory into the goal's container, as if you'd shift-clicked them. Only what the goal still needs is taken: the rest of a stack stays with you. Items with a custom name are never donated (`keepNamedItems`), so a named tool stays yours; `You only have Diamond Sword with a custom name, and those are never donated.` Items locked in their slot stay too.
- **A full container** stops the donation: `The goal's chest at 120, 64, -340 (overworld) is full, so the rest stayed with you. An operator needs to empty it or link a bigger one.` What already went in still counts.
- **The container must be loaded:** someone has to be near it (the same area as you, usually). Otherwise: `The goal's chest at 120, 64, -340 (overworld) isn't loaded. Go closer to it and try again.` If it was broken: `The goal's chest ... is gone. Ask an operator to link the goal to a new one.`
- **Announcements** (`announce`): a new goal (`New community goal: Colosseum, 10,000 Cobblestone. Donate with /realm:goals`), and `Community goal Colosseum: 50 percent there (5,000 / 10,000 Cobblestone). /realm:goals to help` at each quarter. Reaching the goal finishes it and says `Community goal Colosseum reached: 10,000 Cobblestone! Top contributors: Sam 4,200, Alex 3,100, Kim 900. Thanks, everyone!`; with announcements disabled, only the donor who finished it sees that.
- **A goal's page** shows the bar and `2,340 / 10,000 (23 percent)`, where its chest is, `You gave: 320`, and the top 5 contributors (`topContributors`).
- **Only donations count:** items put into the chest by hand, or by hoppers, don't add to the goal, and items taken out don't lower it. An operator can lock the chest with Quick Stack & Sort so only they can take from it; donations still go in.

### Commands

| Command | Who | What it does |
|---|---|---|
| `/realm:goals` | Everyone | Lists the community goals with their progress; pick one to donate from your inventory and see the top contributors (default 5, `topContributors`). Operators can mark a goal finished, move it to another container or remove it there |
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

When too many dropped items pile up (a broken farm, a big explosion), the realm warns everyone and clears them 30 seconds later, so the server doesn't lag. Renamed items, rare items and items right next to a player are kept.

### How to use

1. Nothing to set up. If more than 500 dropped items (`threshold`) lie around, chat says `Clearing 612 dropped items in 30 s: pick up what you need`. Pick up anything you want to keep.
2. 30 seconds later they're removed, and chat says `Cleared 580 dropped items. (32 kept: renamed, rare or near a player)`.
3. Items renamed on an anvil, shulker boxes, elytra, nether stars, totems and the other items in `keepItems`, and items within 4 blocks of a player (`nearPlayerRadius`) are never cleared.
4. Run `/realm:cleanup` to see how many dropped items there are in each dimension.
5. **Operators:** `/realm:cleanup` opens a menu to clear now, clear after a warning, or call off a coming cleanup. Change the threshold, timing and what's kept in `/realm:config` → **Lag Cleanup**, or disable **Automatic cleanup** there.

### What players see

- Every 60 seconds (`checkSeconds`) the pack counts dropped items in the Overworld, Nether and End together. A stack counts once, however many items it holds. Only loaded chunks (near players) count.
- **Above the threshold:** `Clearing 612 dropped items in 30 s: pick up what you need` in chat (`warnSeconds`; 0 clears at once, without a warning). When the time is up, every dropped item that isn't kept is removed and chat says how many: `Cleared 580 dropped items.`, with how many were kept.
- **Kept:** items with a custom name, items whose id is in `keepItems`, and (`keepNearPlayers`) items within `nearPlayerRadius` blocks of any player, so the pile you're standing in and the items a farm drops next to you stay. Everything else goes, death drops included: a player who died far away has the warning's 30 seconds.
- **`/realm:cleanup` for everyone:** `Dropped items: 312 (Overworld 300, Nether 12, End 0).`, then whether a cleanup is coming (`Clearing in 18 s.`), the threshold and how often it counts, or `Automatic cleanup is disabled.`
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
| `keepItems` | `shulker_box`, `minecraft:elytra`, `minecraft:nether_star`, `minecraft:totem_of_undying`, `minecraft:dragon_egg`, `minecraft:beacon`, `minecraft:heavy_core` | Item ids never cleared. An entry matches any id ending with it, so `shulker_box` covers every color |

Operators can change `enabled`, `threshold`, `checkSeconds`, `warnSeconds`, `keepNearPlayers` and `nearPlayerRadius` in game with `/realm:config`; they apply from the next count. `keepItems` stays in `config.js`.

### Saved data

| Key | Scope | Contents |
|---|---|---|
| `cleanup:cfg` | World | Settings changed in `/realm:config` |

A coming cleanup is kept in memory only: a restart during the warning calls it off.

### How it works

- Once a second the pack checks whether a count is due; a count is one `getEntities({ type: "minecraft:item" })` per dimension.
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
| `maxReach` | `2.5` | Farthest the seat may be from the player's feet, in blocks |
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

## Realistic Rain — `rain_rp`

Thicker, heavier rain that stays blue like vanilla, the realm's own rain and thunderstorm recordings, denser blue-gray rain fog, and smaller, softer splashes. Where it snows, bigger, solid snowflakes and a whiter, denser snow fog. A **resource pack** that runs next to the Realm Bundle, never inside it, and costs no more frames than vanilla rain.

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
4. **Operators:** download Realistic Rain from its card on mc.nish.software/realm and open it. In the realm's settings, activate it under **Resource Packs** and move it to the **top** of the active list, above Firewolf and the others, so its rain wins.

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

Storm fog, a darker rain haze on Vibrant Visuals, ground mist, drips under leaves and roof edges, the thunderstorm recording during storms, storm wind, rain on the roof and the rain muffled indoors, for the Realistic Rain resource pack. A **standalone** behavior pack: it runs next to the Realm Bundle, not inside it.

### See and hear it

![Vanilla](media/rain/storm-vanilla.webp) ![Rain Extras](media/rain/storm.webp) A thunderstorm with Rain Extras (and Realistic Rain, which it needs): the darker storm fog, ground mist drifting with the wind, and drips under the trees

[Listen: a breeze outdoors in rain, then indoors (the rain muffled through the roof, drumming on it, muffled wind), then a thunderstorm outdoors (34 s)](media/rain/extras.mp3)

A render, not an in-game screenshot (see [Realistic Rain](#realistic-rain--rain_rp)), with vanilla from the same spot on the left; on mc.nish.software, drag across the picture to compare. The Vibrant Visuals haze isn't shown, since the render doesn't model Vibrant Visuals.

### How to use

1. When it rains, water drips from the leaves of trees and from roof edges near you, and keeps dripping for a while after the rain stops. Outdoors a soft breeze blows; indoors the rain sounds muffled through the roof, and drums on it.
2. In a thunderstorm, the fog rolls in thicker and darker over about 12 seconds, the storm rumbles all around you with strong wind gusts (both muffled when you're inside), and low mist drifts along the ground with the wind when you're outdoors. It all clears the same way when the storm passes.
3. On **Vibrant Visuals**, rain also brings a darker blue-gray haze that settles in the valleys, since Vibrant Visuals ignores fog colors. Fancy keeps Realistic Rain's fog.
4. Run `/realm:rain`, or use the same switch in `/realm:prefs`, to disable these extras for yourself, on a slower device for example. Chat says `Rain extras (fog, haze, mist, drips and sounds): Disabled. Run /realm:rain again to enable them.` The choice is remembered.
5. **Operators:** add Rain Extras under **Behavior Packs**, next to the Realm Bundle (it's never part of the bundle), and add [Realistic Rain](#realistic-rain--rain_rp) under **Resource Packs** at the top of the list. The fogs, particles and sounds come from Realistic Rain, so without it nothing shows. `/realm:config` → Rain Extras enables or disables each extra and sets the wind, thunderstorm and roof volumes.

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
- Each update: one `getTopmostBlock` above the player decides outdoors (nothing 2+ blocks over your head), under a tree, indoors, underground or dry ground (snow or ice there also takes off the storm fog). Mist picks spots in front of the player and checks the ground there. Drips probe random columns within `drips.radius` for leaves with air under them, or a solid block whose neighbor is 2+ lower, and remember them.
- Particles use `Player.spawnParticle` and sounds `Player.playSound` (`realm.storm.wind`, `realm.storm.wind_inside`, `realm.storm.bed`, `realm.storm.bed_inside`, `realm.rain.roof`, `realm.rain.inside`), so they reach that player only; walking in or out runs `/stopsound` for the wind, the thunderstorm sound and the muffled rain.
- Muffled rain indoors: each update marks a player as muffled when they're under a roof (or more than 24 blocks under the surface) while it rains, and every run of the loop (4 times a second) sends those players `/stopsound @s ambient.weather.rain`. Realistic Rain's rain clips fade in over 0.8 s, so a clip stopped within a quarter second has barely started. Indoors, `realm.rain.inside` plays every 18 s. The particles and sounds are defined in Realistic Rain.

---

## Translucent Tools — `translucent_rp`

Tools, weapons and the shield are half see-through in your hand, so they block less of the screen. Swords, pickaxes, axes, shovels and hoes of every material, the mace, bow, crossbow, trident and shield are drawn at 50% opacity, in their usual shape and place. A **resource pack** that runs next to the Realm Bundle, never inside it.

### See and hear it

![The textures: vanilla on top, Translucent Tools below, on a checkerboard so the see-through shows](media/translucent/textures.png)

A picture of the textures, not an in-game screenshot: where a tool sits and how big it looks on screen is the game's, and stays the same as vanilla.

### How to use

1. Nothing to do as a player: when the realm has it, Minecraft downloads it as you join (accept the resource pack prompt if one appears).
2. Hold any tool, weapon or a shield: you can see through it. It works in first person and in third person, for every player and mob holding one.
3. **Operators:** download Translucent Tools from its card on mc.nish.software/realm and open it. In the realm's settings, activate it under **Resource Packs**, near the top of the list (above Firewolf and any pack that changes how held items look).

### What players see

- **40 items at 50% opacity:** swords, pickaxes, axes, shovels and hoes in wood, stone, copper, iron, gold, diamond and netherite (35), plus the mace, bow (and each frame as you draw it), crossbow (loaded or not), trident and shield.
- **Same shape and place:** each item keeps vanilla's pixels, thickness and animations; only the opacity changes. Tools sit the way vanilla holds a bow, which is how Bedrock holds a sprite item, and the bow, crossbow, trident and shield keep their own vanilla poses (blocking, drawing, throwing).
- **Enchanted items:** Bedrock has no material that is both see-through and glinting, so in your hand an enchanted item shows a soft purple shimmer instead of the glint. Its inventory icon keeps the glint.
- **Unchanged:** inventory and hotbar icons, dropped items, item frames, armor, and items this pack doesn't list (fishing rod, shears, flint and steel, brush, spears).

### Saved data

None. It's a resource pack: no scripts, no commands, nothing to configure in game.

### Known limits

- **See-through things behind a tool** (water, glass, rain, other translucent blocks) can disappear behind it for a moment: Bedrock doesn't always sort see-through models against them.
- **Shields with a banner pattern** haven't been tried: the pattern may show solid, or not at all.
- **Other resource packs:** a pack higher in the list with its own models for these items (3D swords, custom shields) wins. Packs that only retexture items, like Firewolf, still show their art in the inventory, but in your hand the tools use vanilla's textures, since this pack carries its own see-through copies.
- **Mobs** holding these items (zombies, vindicators, piglins, skeletons) show them see-through too, like players.

### How it's made

Everything in `packs/translucent_rp/` except `manifest.json` is generated by `npm run gen:translucent` (`tools/gen-translucent/generate.mjs`), from Mojang's vanilla files in `tools/gen-translucent/vanilla/` (see its README):

| Files | |
|---|---|
| `textures/translucent_tools/<item>.png` | The vanilla texture with every pixel at 50% opacity (`OPACITY` in the generator) |
| `textures/translucent_tools/shape/<item>.png` | The vanilla texture, opaque. The game builds the held item's 3D outline from it (`texture_meshes`), so the outline is exactly vanilla's whatever the opacity |
| `attachables/<item>.json` | One per tool and the mace (vanilla draws those without an attachable), with the `entity_alphablend` material. The bow, crossbow, shield and trident files are vanilla's with only the material, textures and render controller swapped |
| `models/entity/translucent_tools.geo.json`, `animations/translucent_tools.animation.json` | The tool mesh and pose, copied from vanilla's bow (`geometry.bow_standby`, `animation.bow.wield`), and the bow and crossbow frames |
| `render_controllers/translucent_tools.render_controllers.json` | The see-through material for every item, and the purple shimmer when enchanted |
| `pack_icon.png`, `docs/media/translucent/textures.png` | The pack icon and the picture above |

`npm run check` fails if any of these differ from what the generator makes.

---

## Bundling packs into one

Merges several packs into one `.mcpack`, so the Realm lists one pack instead of many.

**With Claude:** run the `/bundle-packs` skill. It asks **All packs** (first option) or **Let me choose**, then builds, checks and sends the file.

**Yourself:**

```bash
npm run bundle -- --list                                 # available packs, and which --all bundles
npm run bundle -- --all                                  # → dist/realm_bundle.mcpack (bundled packs only)
npm run bundle -- --packs welcome_bp,stats_bp            # some packs, in this order
npm run bundle -- --all --name my_bundle --title "My Bundle"
```

| | |
|---|---|
| Layout | Each pack's scripts go in `scripts/<folder>/`, and a generated `scripts/main.js` imports them all |
| Dependencies | `@minecraft/*` versions merged to the highest. Packs needing different major versions can't be bundled |
| Identity | UUIDs are derived from `--name`. Rebuilding with the same name, even with a different selection, **updates** the existing pack on the Realm |
| Version | Build time `[YYYY, MMDD, HHMM]` (UTC), so it always increases |
| Conflicts | Two packs with the same non-script file and different contents → error |
| Limits | Behavior packs only. `--all` also leaves out the **standalone** packs listed in `tools/standalone.json` (`rain_bp`), which run as their own add-on next to the bundle; `--list` shows which packs are bundled |

> ⚠️ **Saved settings don't move between the bundle and individual packs.** Bedrock keeps each pack's script data (dynamic properties) separately. Switching resets in-game edits: welcome text, news, tips, `/realm:config` settings, per-player toggles and preferences, first-joined dates, Creeper Guard zones, the Farm Loader list (the ticking areas themselves stay loaded) and what Chest Finder remembers. **Scoreboard stats are kept.** Rebuilding the same bundle name keeps everything.

---

## How the packs work together
<!-- on the site -->

| Pair | Interaction |
|---|---|
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
| Coordinates HUD ↔ packs with action bar messages | Low Durability Warning, Quick Stack & Sort, Land Claims, Chairs, AFK and others show short messages on the same bar. For a player with the HUD on, the HUD replaces them once its text changes (within half a second while walking). Mob Health, Elytra HUD and Daily Quests send `realm:actionbar`, so the HUD waits for them |
| Mob Health → Coordinates HUD | Each hit shows the mob's health and asks the HUD to hold off for `holdTicks` (2 seconds); then the coordinates come back |
| Elytra HUD → Coordinates HUD | While a player glides, the Elytra HUD sends `realm:actionbar`, so the Coordinates HUD pauses for that player and comes back a second or two after landing |
| Elytra HUD ↔ Low Durability Warning, Land Claims, AFK smart sleep | All write the bar above the hotbar. While gliding, their messages can show for a moment before the HUD's next update replaces them |
| Realm Mail ↔ Welcome, News | The unread letters line comes 8 seconds after joining (`notifyDelaySeconds`), after the welcome and news popups |
| AFK ↔ Nicknames | Both write the name above a player's head. Nicknames puts the nickname back within half a second of the AFK pack changing it, keeping `[AFK]` in front while the player has the `afk` tag. Keep Nicknames `afkTag` and `afkPrefix` the same as AFK `tag` and `nameTagPrefix` |
| Right-click Harvest → Daily Quests | A crop harvested by tapping counts for harvest quests, the same as breaking it |
| Daily Quests ↔ Stats, Milestones | Separate counts: the same mining, kills and travel add to all of them |
| Stats → Milestones | Milestones reads the `stats_<stat>` scoreboards when they exist and uses the larger of their number and its own, so history from Stats counts. Works without Stats |
| AFK → Milestones | Playtime and distance pause for players with the `afk` tag. Keep AFK `tag` and Milestones `afkTag` the same |
| Community Goals ↔ Quick Stack & Sort | Lock a goal's chest so nobody takes from it: donations still go in, because the pack moves them itself. `/realm:stash` can also fill a goal's chest that already holds the item, but that doesn't count toward the goal |
| Community Goals ↔ Land Claims | Donations reach a goal's chest inside a claim, since the pack moves the items, not the player |
| Bedrock Essentials+ → Fast Leaf Decay | A sneak-break that fells a whole tree is checked once, from the broken log up the empty trunk, so the felled tree's leaves fall too |
| Fast Leaf Decay → Stats | Leaves broken by the pack don't count toward `mined` |
| Fast Leaf Decay → Lag Cleanup | The saplings and sticks from decayed leaves are dropped items like any others; a forest cleared in one go can push the count toward Lag Cleanup's `threshold` |
| Lag Cleanup → Farm Loader, item farms | Items a farm drops count toward `threshold`. Items that sit in a farm's collection area with no player near can be cleared; hoppers under the drops keep the count low |
| Realm Help ← every pack | `/realm:help` lists the packs that answer its script event, so it only shows what's installed. Its text is generated from this file |
| Realm Settings ↔ every behavior pack | `/realm:config` and `/realm:prefs` list the packs that answer the `realm:cfg_ping` script event, and send changes back the same way, so each pack keeps its own settings. Rain Extras answers too, from outside the bundle. Without Realm Settings, every pack still works, with its saved settings or `config.js` |
| Realm Settings → Welcome, News | `/realm:config` changes the same saved values as `/realm:welcome_edit` (`showOnce`, `chat`, `screenTitle`) and `/realm:news_tips` → **Settings** (tips on or off, interval) |
| Rain Extras → Realistic Rain | Rain Extras' storm fogs, haze, mist and drip particles, and wind, thunderstorm, roof and muffled-rain sounds are defined in Realistic Rain, so it needs that resource pack. Realistic Rain works on its own |
| Rain Extras → Realm Bundle | Standalone: it runs as its own add-on next to the bundle and still answers `/realm:help` (`/realm:help rain`). `/realm:rain` shares the `realm:` namespace, so it can join the bundle later without a rename |
| AFK smart sleep → Rain Extras | Skipping the night clears the weather, so the storm fog and haze clear, the wind stops and drips taper off as after any rain |

Only Rain Extras needs another pack (Realistic Rain). Any other combination works. Translucent Tools only changes how held items are drawn, so it has nothing to coordinate with the other packs.

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
| Rain looks and sounds like vanilla | Is Realistic Rain active under **Resource Packs**, at the top of the list? A resource pack above it that changes rain wins. Players must accept the resource pack download when they join |
| No storm fog, haze, mist, drips, wind or roof sound | Is Rain Extras active under **Behavior Packs**, and Realistic Rain under **Resource Packs**? Run `/realm:rain` in case they're off for you, and check `/realm:config` → Rain Extras. If the pack was added during rain, they start at the next weather change. Nothing shows in deserts, badlands or snowy places, or deep underground. The haze only shows on Vibrant Visuals |
| Tools still look solid in your hand | Is Translucent Tools active under **Resource Packs**, above other packs that change held items? Did you accept the resource pack download when you joined? Inventory icons stay solid; only the item in your hand is see-through |
| Storm fog or haze stays after a storm | Rejoin: Rain Extras clears its fogs when you join. Running `/realm:rain` twice also resets them |
| Wind, thunderstorm or rain on the roof too loud or too quiet | Operators: `/realm:config` → Rain Extras → **Storm wind volume**, **Rain breeze volume**, **Thunderstorm sound volume**, **Rain on the roof volume** (also the muffled rain indoors). Everyone: the game's **Weather** volume slider covers them too |
| Rain as loud indoors as outdoors | Is **Muffled rain indoors** enabled (`/realm:config` → Rain Extras), and are the extras on for you (`/realm:rain`)? It needs Realistic Rain 1.3 or newer, whose rain clips fade in slowly enough to be stopped quietly. Leaves don't count as a roof |
| The pack shows a pink and black placeholder icon | Harmless. Only Realistic Rain and Translucent Tools have a `pack_icon.png` so far, and `tools/bundle.mjs` leaves pack icons out of the bundle, so giving the bundle an icon needs a bundler change first |

---

## Keeping this file current

`npm run check` runs `tools/check-docs.mjs` after the type check, and fails if this file is missing any of:

- a `##` section whose heading contains `` `<folder>` `` for **every pack** in `packs/`
- a `### How to use` section in every pack section: short numbered steps for players, operators last
- **every command** a pack registers, e.g. `` `/realm:stats` ``
- **every option** in a pack's `config.js`, as `` `option` ``, or `` `parent.option` `` for nested options like `` `sleep.percent` ``

It also runs `tools/sync-settings.mjs --check`, which fails if a behavior pack (other than Realm Settings) has no `scripts/settings.js`, or its copy of the shared Realm Settings helper differs from `tools/settings-shared.js`. Change the helper there, then run `node tools/sync-settings.mjs` and bump the version of every pack it updates.

It also runs `tools/gen-rain/textures.mjs --check` and `tools/gen-rain/fogs.mjs --check`, which fail if Realistic Rain's textures or fogs differ from what `npm run gen:rain` generates, `tools/gen-translucent/generate.mjs --check`, which fails if any file in Translucent Tools differs from what `npm run gen:translucent` generates, and `tools/help-catalog.mjs --check`: the in-game `/realm:help` text is generated from each pack's summary, `### How to use` and Commands table here, so after changing those, run `node tools/help-catalog.mjs`. It also fails if a pack doesn't answer `/realm:help`'s `realm:help_ping` script event. Resource packs have no scripts, so they're left out of the help.

When adding or changing a pack: update its section here, and the pack table in `README.md`, in the same commit.

---

## Publishing to mc.nish.software

The [Our realm](https://mc.nish.software/realm/) page shows this file to players. It is generated, never hand-written, so the site and this repo can't drift:

| | |
|---|---|
| What goes on the site | Every pack section (one collapsible card per pack, `### How to use` first; bundled packs under the Realm Bundle, standalone and resource packs under **Standalone packs**), plus every section marked `<!-- on the site -->` |
| What stays behind "For operators" | A pack's `### Configuration…`, `### Saved data` and `### Resetting…` subsections, collapsed |
| Pictures and sound clips | A pack's `### See and hear it` subsection becomes a gallery at the top of its card: each `[label](media/….mp3)` link as a listening clip at the top (with a **Listen** button in the card's header, so it plays without opening the card), each `![caption](media/…)` image (`.webp`, `.png`, `.jpg`, `.gif`) with its caption, two images on one line (`![Before label](media/…) ![After label](media/…) caption`) as a before/after comparison you drag across, and any other paragraph as a note. The files live in `docs/media/` here, and `pack-docs.mjs` copies the ones the page uses to `site/realm/media/` |
| How | In a checkout of `nishant/hosting`: `cd minecraft && node tools/pack-docs.mjs --from <path to this repo>` (default `../../mc-packs`), then commit and push there. `--check` fails if the page is out of date |
| Downloads | `node tools/publish-packs.mjs --notes "what changed"` there builds the Realm Bundle and every single pack from this repo and publishes each new version (see `minecraft/docs/OPERATIONS.md`, "Publishing a pack version"). A single pack is only published when its `header.version` goes up. Standalone packs and resource packs are published the same way, and the realm page lists them under **Standalone packs** instead of the Realm Bundle |
| When | After every change to this file that players should see, and with every new bundle or pack version published on the site |

Links in this file to its own sections (`#…`) are dropped on the site; links to web pages are kept.
