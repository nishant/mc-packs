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
- [Chairs — `chairs_bp`](#chairs--chairs_bp)
- [Realistic Rain — `rain_rp`](#realistic-rain--rain_rp)
- [Rain Extras — `rain_bp`](#rain-extras--rain_bp)
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

**Standalone packs:** the two rain packs are never in the Realm Bundle and are made to run next to it: [Realistic Rain](#realistic-rain--rain_rp) (a resource pack) and [Rain Extras](#rain-extras--rain_bp) (a behavior pack). Download each from its card under **Standalone packs** and open it, then in the realm's settings activate Realistic Rain under **Resource Packs**, at the top of the list, and Rain Extras under **Behavior Packs**, next to the Realm Bundle. Players get both automatically when they join.

**Only some features?** Every feature is also its own pack, downloaded from its card or the "one at a time" list under the Realm Bundle download, and activated the same way. Use **either** the Realm Bundle **or** single packs, never both: the same commands would be registered twice and fail to load. (The standalone packs above aren't in the bundle, so they go with either.) Switching between them starts the features' in-game settings over (welcome and news text, tips, settings from `/realm:config`, per-player choices, remembered chests, zones and farms); stats on the scoreboard are kept. Single packs use ordinary version numbers (`1.0.0`) that go up whenever that pack changes.

### Installing on a Realm

For whoever builds the packs from this repo:

1. Build the packs with `npm run build` (one `dist/<folder>.mcpack` per pack), or `npm run bundle -- --all` for a single bundle.
2. Open the `.mcpack` on a device with Minecraft. It imports automatically.
3. Go to **Play → Realms → ✏️ Edit Realm → Behavior Packs** and move the pack from **Available** to **Active**. A resource pack (`rain_rp`) goes under **Resource Packs** instead, at the top of the active list.
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

1. Run `/realm:prefs` to open **My preferences**: one form with your own choices from every installed pack, such as whether you get durability warnings, phantoms or the rain extras, what sneak-tapping a chest does, and whether chat announces you going AFK. Every switch is named for what it does: on means **Enabled**. Change what you like and tap **Save**. Chat confirms each change, for example `Saved: Phantom Opt-out > Phantoms near me: Disabled`.
2. Your choices are remembered. `/realm:durability`, `/realm:phantoms` and `/realm:rain` flip the same switches as the form.
3. **Operators:** run `/realm:config`, or use any item renamed `Realm Settings` on an anvil (a stick works). Pick a pack, change its settings (switches, sliders and lists) and tap **Save**. They apply right away for everyone, and chat confirms each one. A setting shown as text with `(change in config.js, then restart the world)` can only be changed there.
4. **Operators:** **Reset a pack to defaults**, at the bottom of the menu, puts one pack's settings back to its `config.js` values after asking. Players' own preferences are kept.

### What players see

- Only installed packs are listed: each pack answers when the menu asks, as with `/realm:help`. Rain Extras is listed too when it runs next to the Realm Bundle.
- Each setting has a `!` icon: hover over it or tap it for what the setting does, its default and, for a slider, its range.
- Switches read the same everywhere: the setting is named for what it does, the switch on means **Enabled**, and chat says `Enabled` or `Disabled`. Lists show plain choices, such as `Open the menu` or `Only in protected zones`.
- A preference set to what the realm has follows the realm: if an operator changes that setting later, you get the new value. A preference set to something else stays yours.
- If a pack doesn't confirm a change within half a second, chat says `Not saved: <pack> > <setting>: the pack didn't answer. Try again.`; a value the pack refuses says why.
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
| Rain Extras | `defaultOff` (shown as **Rain extras for new players**), `stormFog.enabled`, `haze.enabled`, `mist.enabled`, `drips.enabled`, `wind.enabled`, `wind.inThunder`, `wind.inRain`, `roof.enabled`, `roof.volume` | Rain extras (fog, haze, mist, drips, wind, roof) (`/realm:rain`) |

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
- The packs never import each other. This pack sends the script event `realm:cfg_ping` (`{id, player}`), and each pack answers `realm:cfg_schema` with its options and their current values (`{id, pack, title, part, parts, options}`), split into parts under the 2048-character limit of a script event message. Saving sends `realm:cfg_set` (`{id, pack, key, value, player?}`) and resetting `realm:cfg_reset` (`{id, pack}`). The pack checks the value (type, range, choices), ignores keys it doesn't have, saves it and answers `realm:cfg_ack` (`{id, pack, key, ok, value, error?}`), which is what chat confirms.
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
4. **Operators:** `/realm:news_edit` writes the news. Minecraft's text boxes hold only 100 characters each, so the body is split over at least 10 boxes (1,000 characters) that are joined in order with nothing between them; type `\n` for a new line. Easier for a long message: paste it all into chat as `/realm:news_body "<text>"` and the editor opens with every box filled in; check the title and tap **Save**. Leave "Pop up for everyone on their next join" on to announce it, or turn it off for a quiet fix such as a typo. `/realm:news_tips` adds, edits or deletes tips, posts the next one now, changes how often they're posted (5 to 120 minutes) or turns them off.

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
| `/realm:news_edit` | Ops | Editor: title, the body in 100-character parts (at least 10, joined in order), and the "pop up on next join" toggle. If chat stays open for about 20 s, it says it couldn't open |
| `/realm:news_body "<text>"` | Ops | Paste a whole news body in one go (chat takes far more than a form's 100-character boxes). Opens the editor with it split over the boxes; nothing is saved until you tap **Save**. Put the text in double quotes, use `\n` for new lines, and `'` rather than `"` inside it |
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

Sneak-tap any chest, barrel or shulker box for a menu: sort it, quick stack into the storage that already holds each item (like Terraria), or sort your inventory.

### How to use

1. **Open the menu:** sneak and tap a chest, trapped chest, copper chest, barrel, shulker box or ender chest with an empty hand, or holding a tool, weapon or armor. It doesn't open; a **Quick Stack & Sort** menu does, with three buttons:
   - **Sort this chest** (or barrel, shulker box…): its stacks merge and sort, and the bar above the hotbar says `Sorted 31 stacks`.
   - **Quick stack my inventory:** the same as `/realm:stash`, below.
   - **Sort my inventory:** the same as `/realm:sort`, below.
2. **Quick stack:** stand near your storage and run `/realm:stash`. Every item in your main inventory goes into a chest, copper chest or barrel within 8 blocks that already holds the same item. Your gear, shulker boxes, bundles, totems, maps and compasses stay with you. The bar says `Stashed 143 items into 3 chests`, and each container that got something sparkles.
3. **Sort your inventory:** run `/realm:sort`. Your main inventory is sorted; the hotbar stays as it is.
4. **Your way:** in `/realm:prefs`, choose what sneak-tapping a container does for you (`menu`, `sort` right away, or `off` so it just opens), and whether sorting your inventory includes your hotbar.
5. **Help:** run `/realm:stash_help` for a page that explains the menu and every command with its usage. `/help realm:stash` and `/help realm:sort` also describe them.

### What players see

- **The menu** shows how full the container is and how full your inventory is (`Barrel · 18 of 27 slots used`, `Your inventory · 22 of 27 slots used`), then the three buttons. Close it to do nothing. Holding anything other than gear (a block, a hopper, honeycomb) skips the menu, so sneak-placing a hopper on a chest or waxing a copper chest works as usual. To scrape a copper chest with an axe, don't sneak.
- **Ender chests** get the menu without **Sort this**: add-ons can't see inside an ender chest, so it can't be sorted or stashed into.
- **Sorting** merges partial stacks of the same item, then orders the slots by item id, the biggest stack first, with empty slots at the end. A chest with 3 partial stacks of cobblestone ends with 1 full stack plus the rest.
- Items with a custom name, lore or enchantments are never merged, only moved, and moving keeps every item exactly as it was: enchanted gear, named items, written books, filled maps, banners and shulker boxes with their contents.
- `/realm:stash` only takes from your main inventory (slots 9–35): never the hotbar, armor or offhand. It also leaves you your gear (anything with durability: tools, weapons, armor, elytra; `stashGear`), named items (`stashNamedItems`) and everything in `keepItems`: shulker boxes, bundles, the totem of undying, filled maps, compasses and clocks. A container that holds the item gets matching stacks topped up first, then its empty slots, nearest container first.
- **What receives stashes:** chests, trapped chests, copper chests and barrels (`stashTypes`). Placed shulker boxes don't: they're a kit you pick up and carry, so they only get the menu and sorting.
- Double chests (copper ones too) count once. Ender chests never receive anything. Containers in chunks that aren't loaded are never touched. Another player having the chest open is fine.
- Each player can sort or stash once per second (`cooldownTicks`). A menu button pressed sooner says `Too fast. Try again in a moment.`

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
| `cooldownTicks` | `20` | Minimum time between sorts and stashes per player (20 = 1 s). Opening the menu or the help page doesn't count |

Operators can change `sneakTap`, `sortHotbar`, `stashGear`, `stashNamedItems` and `cooldownTicks` in game with `/realm:config`. Each player can choose their own `sneakTap` and `sortHotbar` in `/realm:prefs`, which wins over the realm's for them. `stashRadius` and the lists stay in `config.js`.

### Saved data

| Key | Scope | Contents |
|---|---|---|
| `stash:cfg` | World | Settings changed in `/realm:config` |
| `stash:pref` | Player | JSON of the player's own `sneakTap` and `sortHotbar` from `/realm:prefs` |

### How it works

- **Menu:** `world.beforeEvents.playerInteractWithBlock` cancels the tap when the player is sneaking, the hand is empty or holds an item with a `minecraft:durability` component, and the block is a listed container or an ender chest. On the next tick an `ActionFormData` from `@minecraft/server-ui` shows the menu; a player can have one open at a time. The chosen action re-reads the block, so a container broken while the menu was open is left alone.
- **Sort:** stacks are merged by changing the amount of the slot that stays (`ContainerSlot.amount`) and ordered with `swapItems`. Both are native moves, so no item is ever copied or re-created and nothing about it can be lost.
- **Stash:** one `dimension.getBlocks` query finds the `stashTypes` containers in the cube (loaded chunks only), and they are read a few per tick with `system.runJob`. Each main-inventory slot is then moved with `transferItem` into the nearest container holding that item, then the next.
- When both halves of a double chest report the whole 54 slots, the second half is recognized (same kind of chest, same contents, same facing, side by side; in a row of identical chests, counted from the row's end) and skipped. Copper chests of different stages count as the same kind.
- If `transferItem` ever hands a leftover back instead of leaving it in the slot, the pack puts it back, so nothing is lost.

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

Thicker, heavier rain that stays blue like vanilla, warmer and heavier rain sounds, real recorded thunder and lightning strikes, denser blue-gray rain fog, and smaller, softer splashes. A **resource pack** that runs next to the Realm Bundle, never inside it, and costs no more frames than vanilla rain.

### See and hear it

![Realistic Rain 1.1: vanilla-width streaks, 13 lanes instead of 8, and the blue-gray rain fog](media/rain/rain.webp)
![Vanilla rain from the same spot](media/rain/rain-vanilla.webp)
![The weather texture: vanilla's 32x32 on the left, Realistic Rain's 128x128 on the right. Only the rain rows differ](media/rain/weather-atlas.png)

[Listen: rain, a far thunder, then a close strike (34 s)](media/rain/rain.mp3)

The pictures are renders, not in-game screenshots: a simple scene drawn with this pack's own texture, fog and splash numbers, with how much rain shows matched to an in-game screenshot. Lighting and Vibrant Visuals aren't modeled. In the clip, the thunder is 12 dB quieter than in game so the rain stays audible.

### How to use

1. Nothing to do as a player: when the realm has it, Minecraft downloads it as you join (accept the resource pack prompt if one appears).
2. Wait for rain, or ask an operator for `/weather rain` or `/weather thunder`.
3. For storm fog, a darker haze on Vibrant Visuals, ground mist, drips, storm wind and rain on the roof, the realm also needs [Rain Extras](#rain-extras--rain_bp).
4. **Operators:** download Realistic Rain from its card on mc.nish.software/realm and open it. In the realm's settings, activate it under **Resource Packs** and move it to the **top** of the active list, above Firewolf and the others, so its rain wins.

### What players see

- **Rain:** vanilla's own streaks (as wide, in its blue `#4465C1`, at its opacity), but 13 lanes of them instead of 8 and longer, each fading from a fainter tail (34%) to a solid head (96%). Overall about 1.8× as much rain on screen as vanilla. **Snow is unchanged.**
- **Fog while it rains:** starts at 15% of your render distance and is solid by 55% (vanilla: 23% → 70%), in a gloomy blue-gray `#5F6B79` instead of vanilla's gray `#666666`. At 10 chunks that's 24 → 88 blocks. Pale gardens and sulfur caves keep their own fog colors with the new distances. Bedrock has one fog for rain and snowfall, so snowfall gets the same fog.
- **Rain sound:** a heavier shower at 125% of vanilla's volume: a hiss with dense patter and soft drops, in vanilla's own warm tone (matched to it octave by octave), with nothing high-pitched or bubbly.
- **Thunder:** real rolling thunder, cut from field recordings of thunderstorms (5 rolls, 11–14 s, see Credits).
- **Lightning strike** (only when it hits near you): real close strikes, starting right on the crack and fading as the roll takes over (4 sounds, 5–6 s). Both play at their recorded pitch: vanilla plays these sounds pitched far down, so this pack sets lightning's pitch to 0.9–1.1. Explosions keep their vanilla sound.
- **Splashes:** the rain splash is smaller (0.10 blocks instead of 0.175) and softer (70% opacity, a cool tint).
- **With Rain Extras:** storm fog, a darker haze on Vibrant Visuals, ground mist, drips, storm wind and rain on the roof. Their fogs, particles and sounds are in this pack.

### Performance

- Everything replaces a vanilla file one for one: the game draws the same rain and plays rain and thunder as often as before, so this pack costs no extra frames on any device.
- Rain clips are 2.0–2.4 s, like vanilla's 2 s, so the copies the game keeps starting (about 15 at once) don't pile up any more than vanilla's. The whole pack is about 0.8 MB.

### Saved data

None. It's a resource pack: no scripts, no commands, nothing to configure in game.

### Known limits

- **Vibrant Visuals ignores fog colors**, so on its own this pack's blue-gray rain fog only shows on **Fancy**; Vibrant Visuals players see the game's pale gray rain haze. [Rain Extras](#rain-extras--rain_bp) fixes that with a darker haze of its own. The rain, sounds and splashes change the same way under both.
- A resource pack higher in the list that also changes the weather texture, fog or rain sounds wins: keep Realistic Rain at the top.
- The texture tiles the way vanilla's does; how big the streaks look on screen depends on the game, not the pack.

### How it's made

Everything in `packs/rain_rp/` is generated by `npm run gen:rain` (`tools/gen-rain/`), from Mojang's vanilla files in `tools/gen-rain/vanilla/` (see its README):

| Files | Generator | |
|---|---|---|
| `textures/environment/weather.png` | `textures.mjs` | The weather atlas at 4× (128×128). Snow and every other non-rain pixel is vanilla upscaled; only the rain rows are redrawn |
| `textures/particle/realm_rain_mist.png`, `pack_icon.png` | `textures.mjs` | Rain Extras' mist sprite and the pack icon |
| `fogs/*_fog_setting.json` | `fogs.mjs` | The vanilla fogs that have a weather fog, with only `distance.weather` changed |
| `fogs/rain_storm*.json` | `fogs.mjs` | The three storm fogs Rain Extras pushes (`realm:rain_storm_1`, `realm:rain_storm_2`, `realm:rain_storm`) |
| `fogs/rain_gloom*.json` | `fogs.mjs` | The Vibrant Visuals haze Rain Extras pushes in rain (`realm:rain_gloom_1`, `realm:rain_gloom`): only volumetric air fog, denser below y 64 and gone above 256, absorbing about as much light as it scatters so it reads darker. Fancy ignores it |
| `sounds/realistic_rain/*.ogg` | `sounds.mjs` | Synthesized (needs ffmpeg) and loudness-normalized. Rain: a hiss with dense patter and soft drops, nothing tonal, matched to vanilla's tone octave by octave; its volume is tuned on a simulation of how the game stacks the clips. Thunder and strikes: excerpts of real recordings (`tools/gen-rain/recordings.json`: each source's URL, sha256, author and license; downloaded once and checked). Wind and rain on the roof for Rain Extras. `--audition docs/media/rain` also writes the listening clips |
| `sounds/sound_definitions.json`, `sounds.json` | `sounds.mjs` | Each sound's volume, computed from its measured loudness: the rain stack lands 25% above vanilla's (measured from Mojang's decoded rain), thunder and strikes about at vanilla's level. `sounds.json` sets lightning's pitch to 0.9–1.1 |
| `CREDITS.txt` | `sounds.mjs` | The recordings used, with authors and licenses, from `recordings.json` |
| `particles/*.json`, `manifest.json` | by hand | The splash, `realm:rain_mist` (drifts with the storm wind) and `realm:rain_drip` particles |
| `docs/media/rain/*.webp`, `weather-atlas.png` | `renders.mjs` | The pictures above: a small voxel scene rendered with the vanilla and new textures, fogs and splashes (needs ffmpeg). Rain coverage is calibrated to an in-game screenshot |
| `docs/media/rain/*.mp3` | `sounds.mjs --audition docs/media/rain` | The listening clips: rain stacked the way the game stacks it, plus the scene's sounds at their in-game volumes |

`npm run check` fails if the textures or fogs differ from what the generators make.


### Credits

The thunder and lightning-strike sounds are excerpts of these recordings (cut, made mono, faded and loudness-normalized):

- "Thunder / Lightning Ambience - Field Recording" by Gregor Quendel, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), from [OpenGameArt](https://opengameart.org/content/thunder-lightning-ambience-field-recording)
- "Thunder, Very Close, Rain, 01" by InspectorJ (www.jshaw.co.uk), [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/), from [OpenGameArt](https://opengameart.org/content/thunder-very-close-rain-01)
- "Rain + Long Thunder" by wuxiascrub, [CC0](https://creativecommons.org/publicdomain/zero/1.0/), from [OpenGameArt](https://opengameart.org/content/rain-long-thunder)

The pack carries the same list in `CREDITS.txt`. Everything else in it is generated or written for it.
---

## Rain Extras — `rain_bp`

Storm fog, a darker rain haze on Vibrant Visuals, ground mist, drips under leaves and roof edges, storm wind and rain on the roof, for the Realistic Rain resource pack. A **standalone** behavior pack: it runs next to the Realm Bundle, not inside it.

### See and hear it

![A thunderstorm with Rain Extras: the darker storm fog, ground mist drifting with the wind, and drips under the trees](media/rain/storm.webp)

[Listen: a breeze outdoors in rain, then rain on the roof and muffled wind indoors, then storm gusts outdoors (32 s)](media/rain/extras.mp3)

A render, not an in-game screenshot (see [Realistic Rain](#realistic-rain--rain_rp)). The Vibrant Visuals haze isn't shown, since the render doesn't model Vibrant Visuals.

### How to use

1. When it rains, water drips from the leaves of trees and from roof edges near you, and keeps dripping for a while after the rain stops. Outdoors a soft breeze blows; indoors you hear the rain drumming on the roof.
2. In a thunderstorm, the fog rolls in thicker and darker over about 12 seconds, strong wind gusts howl (muffled when you're inside), and low mist drifts along the ground with the wind when you're outdoors. It all clears the same way when the storm passes.
3. On **Vibrant Visuals**, rain also brings a darker blue-gray haze that settles in the valleys, since Vibrant Visuals ignores fog colors. Fancy keeps Realistic Rain's fog.
4. Run `/realm:rain`, or use the same switch in `/realm:prefs`, to disable these extras for yourself, on a slower device for example. Chat says `Rain extras (storm fog, haze, mist, drips, wind, roof): Disabled. Run /realm:rain again to enable them.` The choice is remembered.
5. **Operators:** add Rain Extras under **Behavior Packs**, next to the Realm Bundle (it's never part of the bundle), and add [Realistic Rain](#realistic-rain--rain_rp) under **Resource Packs** at the top of the list. The fogs, particles and sounds come from Realistic Rain, so without it nothing shows. `/realm:config` → Rain Extras enables or disables each extra and sets the wind and roof volumes.

### What players see

- **Drips:** small blue drops form under the lowest leaves of a tree and under roof edges where the next column is at least 2 blocks lower, hang for 0.2–1.2 s and fall. Up to `drips.perSecond` (5) per second within `drips.radius` (6) blocks of you, and for `drips.afterRainSeconds` (30) seconds after the rain, tapering off.
- **Ground mist** (thunderstorms only, outdoors, near the ground): soft gray-blue puffs 5–9 blocks away, mostly in front of you, each fading in and out over about 4 s. `mist.puffsPerSecond` (2) puffs of 4 sprites a second, so about 32 on screen.
- **Storm fog:** three steps from 12% → 48% to 8% → 35% of your render distance, darkening from `#59646F` to `#4E5763`, over `stormFog.fadeSeconds` (12) seconds. Plain rain keeps Realistic Rain's 15% → 55%.
- **Vibrant Visuals haze** (rain and thunderstorms): a volumetric fog that is densest below y 64 and gone by y 256, darker and slightly blue, in two steps over `haze.fadeSeconds` (10) seconds. It only sets Vibrant Visuals' volumetric fog, so Fancy and the storm fog are untouched. Lifted in caves and in the Nether and the End.
- **Wind:** gusts with a faint whistle at the peaks, every 8 s (10 s clips that crossfade): full volume in thunderstorms (`wind.inThunder`, 1), a soft breeze in plain rain (`wind.inRain`, 0.35). Under a roof you hear the muffled version (with a rattle in the strongest gusts); under trees, the outdoor wind. Walking in or out swaps them at once.
- **Rain on the roof:** while it rains and there's a roof 2 to `roof.maxHeadroom` (10) blocks over your head (not leaves), a muffled drumming with a soft gutter trickle, every 3 s, at `roof.volume` (0.8).
- Mist, drips, haze and sounds are only for the player they're for, so each player's extras cost only their own device.
- None of it happens in the Nether or the End, deep underground (more than 24 blocks under the surface), or on sand, terracotta, snow or ice: deserts and badlands get no rain, and snowy places get snow.

### Commands

| Command | Who | What it does |
|---|---|---|
| `/realm:rain` | Everyone | Enables or disables storm fog, haze, ground mist, drips, wind and roof sounds **for yourself** (enabled by default, `defaultOff`). Remembered between sessions |

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
| `wind.inThunder` | `1` | Wind volume in thunderstorms, 0–1 |
| `wind.inRain` | `0.35` | Wind volume in plain rain, 0–1 |
| `roof.enabled` | `true` | Rain drumming on the roof while a player is indoors |
| `roof.volume` | `0.8` | Rain on the roof volume, 0–1 |
| `roof.maxHeadroom` | `10` | Highest roof (blocks above the player's feet) that still counts as indoors for the roof sound |

Operators can change `defaultOff`, `stormFog.enabled`, `haze.enabled`, `mist.enabled`, `drips.enabled`, `wind.enabled`, `wind.inThunder`, `wind.inRain`, `roof.enabled` and `roof.volume` in game with `/realm:config` when Realm Settings is installed (in the Realm Bundle or as its own pack). The other numbers stay in `config.js`.

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
- Wind and roof reuse the block lookup the update already makes: one sound every 8 s and one every 3 s at most, per player, each played to that player only (one or two extra voices on their device).
- Each player's particles and sounds go to that player only. On a weak device, `/realm:rain` turns everything off for that player alone.

### Known limits

- Added while it's already raining? The extras start at the next weather change.
- Storm fog and haze use the `/fog` command, run by the script. If that fails, the content log shows `[rain] /fog` and the mist, drips and sounds still work.
- Drips come from the highest block of each column: leaves under a roof, or overhangs inside caves, don't drip.
- Indoors and outdoors are judged from the block over your head: standing under a single overhanging block counts as indoors.
- Sounds can't be filtered live, so indoors plays separate muffled recordings, swapped when you walk in or out. The vanilla rain sound itself keeps playing indoors, as in vanilla.

### How it works

- `weatherChange` in the overworld sets the weather (and saves it as `rain:weather`). The storm fog steps toward dense during thunder and back to none otherwise, with `/fog @s push realm:rain_storm… rain_storm` and `/fog @s remove rain_storm`. The haze does the same in rain and thunder with `realm:rain_gloom…` under the id `rain_gloom`. Each fog only sets its own part (the storm fog the weather fog distance, the haze Vibrant Visuals' volumetric fog), so they stack, and only this pack's fog entries are ever touched. Joining clears any leftover fog, and the next update puts back what the weather calls for.
- Each update: one `getTopmostBlock` above the player decides outdoors (nothing 2+ blocks over your head), under a tree, indoors, underground or dry ground. Mist picks spots in front of the player and checks the ground there. Drips probe random columns within `drips.radius` for leaves with air under them, or a solid block whose neighbor is 2+ lower, and remember them.
- Particles use `Player.spawnParticle` and sounds `Player.playSound` (`realm.storm.wind`, `realm.storm.wind_inside`, `realm.rain.roof`), so they reach that player only; walking in or out runs `/stopsound` for the wind. The particles and sounds are defined in Realistic Rain.

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
| Chairs → AFK, Stats | A seated, idle player is still marked AFK. Sitting adds nothing to `travelled` |
| Realm Help ← every pack | `/realm:help` lists the packs that answer its script event, so it only shows what's installed. Its text is generated from this file |
| Realm Settings ↔ every behavior pack | `/realm:config` and `/realm:prefs` list the packs that answer the `realm:cfg_ping` script event, and send changes back the same way, so each pack keeps its own settings. Rain Extras answers too, from outside the bundle. Without Realm Settings, every pack still works, with its saved settings or `config.js` |
| Realm Settings → Welcome, News | `/realm:config` changes the same saved values as `/realm:welcome_edit` (`showOnce`, `chat`, `screenTitle`) and `/realm:news_tips` → **Settings** (tips on or off, interval) |
| Rain Extras → Realistic Rain | Rain Extras' storm fogs, haze, mist and drip particles, and wind and roof sounds are defined in Realistic Rain, so it needs that resource pack. Realistic Rain works on its own |
| Rain Extras → Realm Bundle | Standalone: it runs as its own add-on next to the bundle and still answers `/realm:help` (`/realm:help rain`). `/realm:rain` shares the `realm:` namespace, so it can join the bundle later without a rename |
| AFK smart sleep → Rain Extras | Skipping the night clears the weather, so the storm fog and haze clear, the wind stops and drips taper off as after any rain |

Only Rain Extras needs another pack (Realistic Rain). Any other combination works.

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
| Storm fog or haze stays after a storm | Rejoin: Rain Extras clears its fogs when you join. Running `/realm:rain` twice also resets them |
| Wind or rain on the roof too loud or too quiet | Operators: `/realm:config` → Rain Extras → **Storm wind volume**, **Rain breeze volume**, **Rain on the roof volume**. Everyone: the game's **Weather** volume slider covers them too |
| The pack shows a pink and black placeholder icon | Harmless. Only Realistic Rain has a `pack_icon.png` so far, and `tools/bundle.mjs` leaves pack icons out of the bundle, so giving the bundle an icon needs a bundler change first |

---

## Keeping this file current

`npm run check` runs `tools/check-docs.mjs` after the type check, and fails if this file is missing any of:

- a `##` section whose heading contains `` `<folder>` `` for **every pack** in `packs/`
- a `### How to use` section in every pack section: short numbered steps for players, operators last
- **every command** a pack registers, e.g. `` `/realm:stats` ``
- **every option** in a pack's `config.js`, as `` `option` ``, or `` `parent.option` `` for nested options like `` `sleep.percent` ``

It also runs `tools/sync-settings.mjs --check`, which fails if a behavior pack (other than Realm Settings) has no `scripts/settings.js`, or its copy of the shared Realm Settings helper differs from `tools/settings-shared.js`. Change the helper there, then run `node tools/sync-settings.mjs` and bump the version of every pack it updates.

It also runs `tools/gen-rain/textures.mjs --check` and `tools/gen-rain/fogs.mjs --check`, which fail if Realistic Rain's textures or fogs differ from what `npm run gen:rain` generates, and `tools/help-catalog.mjs --check`: the in-game `/realm:help` text is generated from each pack's summary, `### How to use` and Commands table here, so after changing those, run `node tools/help-catalog.mjs`. It also fails if a pack doesn't answer `/realm:help`'s `realm:help_ping` script event. Resource packs have no scripts, so they're left out of the help.

When adding or changing a pack: update its section here, and the pack table in `README.md`, in the same commit.

---

## Publishing to mc.nish.software

The [Our realm](https://mc.nish.software/realm/) page shows this file to players. It is generated, never hand-written, so the site and this repo can't drift:

| | |
|---|---|
| What goes on the site | Every pack section (one collapsible card per pack, `### How to use` first; bundled packs under the Realm Bundle, standalone and resource packs under **Standalone packs**), plus every section marked `<!-- on the site -->` |
| What stays behind "For operators" | A pack's `### Configuration…`, `### Saved data` and `### Resetting…` subsections, collapsed |
| Pictures and sound clips | A pack's `### See and hear it` subsection becomes a gallery at the top of its card: each `![caption](media/…)` image (`.webp`, `.png`, `.jpg`, `.gif`) with its caption, each `[label](media/….mp3)` link as an audio player, and any other paragraph as a note. The files live in `docs/media/` here, and `pack-docs.mjs` copies the ones the page uses to `site/realm/media/` |
| How | In a checkout of `nishant/hosting`: `cd minecraft && node tools/pack-docs.mjs --from <path to this repo>` (default `../../mc-packs`), then commit and push there. `--check` fails if the page is out of date |
| Downloads | `node tools/publish-packs.mjs --notes "what changed"` there builds the Realm Bundle and every single pack from this repo and publishes each new version (see `minecraft/docs/OPERATIONS.md`, "Publishing a pack version"). A single pack is only published when its `header.version` goes up. Standalone packs and resource packs are published the same way, and the realm page lists them under **Standalone packs** instead of the Realm Bundle |
| When | After every change to this file that players should see, and with every new bundle or pack version published on the site |

Links in this file to its own sections (`#…`) are dropped on the site; links to web pages are kept.
