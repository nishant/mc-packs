# Pack documentation

What each pack in this repo does, how to use it, and how to configure it.

> **Keep this file up to date.** Any change to a pack's behaviour, commands or `config.js` must update this file in the same commit. `npm run check` fails if a pack, command or config option is missing from this file (see [Keeping this file current](#keeping-this-file-current)).

## Contents

- [Common to all packs](#common-to-all-packs)
  - [Requirements](#requirements)
  - [Installing on a Realm](#installing-on-a-realm)
  - [Commands](#commands)
  - [Two ways to configure](#two-ways-to-configure)
  - [Updating a pack](#updating-a-pack)
  - [Formatting codes](#formatting-codes)
- [Welcome Message — `welcome_bp`](#welcome-message--welcome_bp)
- [Low Durability Warning — `durability_bp`](#low-durability-warning--durability_bp)
- [AFK + Smart Sleep — `afk_bp`](#afk--smart-sleep--afk_bp)
- [Stats & Leaderboards — `stats_bp`](#stats--leaderboards--stats_bp)
- [Realm News & Tips — `news_bp`](#realm-news--tips--news_bp)
- [Bundling packs into one](#bundling-packs-into-one)
- [How the packs work together](#how-the-packs-work-together)
- [Troubleshooting](#troubleshooting)
- [Keeping this file current](#keeping-this-file-current)

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

### Installing on a Realm

1. Build the packs with `npm run build` (one `dist/<folder>.mcpack` per pack), or `npm run bundle -- --all` for a single bundle.
2. Open the `.mcpack` on a device with Minecraft. It imports automatically.
3. Go to **Play → Realms → ✏️ Edit Realm → Behavior Packs** and move the pack from **Available** to **Active**.
   *Another way:* download the Realm world, activate the pack under the world's **Behavior Packs**, and upload the world again.
4. Rejoin. Commands are registered when the world loads.

> ⚠️ Activate **either** the individual packs **or** a bundle that contains them, never both. Otherwise every command is registered twice, and the duplicate commands fail to load.

### Commands

- Every command has a namespace prefix: `/welcome:show`, `/stats:show`, … Type the prefix (e.g. `/stats`) to see that pack's commands in autocomplete.
- **Everyone** commands work for all players. **Ops** commands (permission level `GameDirectors`) only work for, and are only shown to, operators.

### Two ways to configure

| | Where | Who | Takes effect | Notes |
|---|---|---|---|---|
| **In-game** | Commands like `/welcome:edit`, `/news:edit`, `/news:tips`, `/stats:sidebar` | Operators | Immediately | Saved in the world, and overrides `config.js` |
| **`config.js`** | `packs/<folder>/scripts/config.js` | Whoever builds the pack | After rebuilding and re-applying the pack | Defaults and options that have no in-game editor |

### Updating a pack

1. Edit the pack.
2. **Increase `header.version`** in its `manifest.json`, e.g. `[1, 0, 0]` → `[1, 0, 1]`. If you don't, devices keep using their cached copy. (Bundles do this automatically.)
3. `npm run build`, then re-import and re-apply the pack.

### Formatting codes

Text you can edit (popups, news, tips) supports:

| Code | Effect |
|---|---|
| `\n` | New line. The in-game text boxes are one line, so type a literal `\n` |
| `§0`–`§9`, `§a`–`§f` | Colours: `§a` green, `§b` aqua, `§c` red, `§e` yellow, `§6` gold, `§7` grey |
| `§l` `§o` `§r` | Bold, italic, reset |

---

## Welcome Message — `welcome_bp`

Shows a popup when a player joins the Realm. Operators can edit the popup in-game.

### What players see

- About 2 seconds after joining (`delayTicks`), a popup appears with a title, body text and one close button.
- If the player is still loading, or has chat or their inventory open, the game rejects the popup. The pack retries every second for up to 30 seconds.
- Respawning after death does **not** show it. Only joining does.

### Commands

| Command | Who | What it does |
|---|---|---|
| `/welcome:show` | Everyone | Shows the welcome message to yourself (preview). Ignores `showOnce` |
| `/welcome:edit` | Ops | Opens an editor: title, body, button text, and toggles for show once, chat copy and big on-screen title. If chat or the inventory stays open, it retries for about 20 s and then says so once |
| `/welcome:reset` | Ops | Discards in-game edits and goes back to the `config.js` defaults |

Every save from `/welcome:edit` counts as a new revision. With **show once** turned on, everyone sees the edited message one more time.

### Placeholders

| Placeholder | Replaced with |
|---|---|
| `{player}` | The joining player's name |
| `{online}` | Number of players online |

### Configuration (`scripts/config.js` → `DEFAULTS`)

These are defaults. Once an op saves with `/welcome:edit`, the saved values win until `/welcome:reset`.

| Option | Default | In-game? | Description |
|---|---|---|---|
| `title` | `§l§6Welcome to the Realm!` | ✅ | Popup title |
| `body` | Greeting + 3 rules + online count | ✅ | Popup body. Supports placeholders and formatting |
| `button` | `§lLet's go!` | ✅ | Close button text |
| `showOnce` | `false` | ✅ | `true` = only once per player, shown again after each edit. `false` = every join |
| `chat` | `false` | ✅ | Also post the title + body in that player's chat |
| `screenTitle` | `false` | ✅ | Also flash the title as big on-screen text |
| `delayTicks` | `40` | ❌ | Ticks after spawn before the first try (20 ticks = 1 s) |

### Saved data

| Key | Scope | Contents |
|---|---|---|
| `welcome:settings` | World | JSON of in-game edits |
| `welcome:revision` | World | Increases on every save or reset |
| `welcome:seen` | Player | Last revision the player saw (used by `showOnce`) |

---

## Low Durability Warning — `durability_bp`

Warns players before a tool, weapon or armor piece breaks.

### What players see

| Level | When | Shows |
|---|---|---|
| **Warning** | ≤ `warnPercent` (10%) left | Yellow message above the hotbar: `⚠ Diamond Pickaxe is low: 141/1561 (9.0%)` + soft "pling" |
| **Critical** | ≤ `criticalPercent` (3%) left | Red message `⚠ … is about to break!` above the hotbar **and in chat** (`chatOnCritical`) + anvil sound |

- Checks the **main hand, offhand, helmet, chestplate (including elytra), leggings and boots** every `checkIntervalTicks`.
- Warns **once per level**. It only warns again when the item drops to the next level.
- A different item, or a repair (Mending, anvil, grindstone), resets it.
- Each **hotbar slot** is tracked separately, so switching to another worn tool warns for that one too.
- Items without durability (blocks, torches, …) are ignored.
- Named items use their custom name (e.g. `Excalibur is low`).

### Commands

| Command | Who | What it does |
|---|---|---|
| `/durability:toggle` | Everyone | Turns warnings off or on **for yourself**. Remembered between sessions |

### Configuration (`scripts/config.js` → `CONFIG`)

| Option | Default | Description |
|---|---|---|
| `warnPercent` | `10` | Warning level, in % of durability left |
| `criticalPercent` | `3` | Critical level, in % left |
| `maxUsesForWarning` | `0` | If > 0, never warn while more than this many uses are left, even under the % (useful for netherite). `0` = off |
| `chatOnCritical` | `true` | Also post critical warnings in chat |
| `checkIntervalTicks` | `10` | How often to check (20 = 1 s) |

### Saved data

| Key | Scope | Contents |
|---|---|---|
| `durability:off` | Player | `true` when the player turned warnings off |

---

## AFK + Smart Sleep — `afk_bp`

Marks idle players as AFK, and skips the night without waiting for them.

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

Any activity brings them back, with `Name is back (AFK 12m)` in chat. Sleeping players are never marked AFK. Leftover AFK names or tags are cleared when a player rejoins, and after a script reload.

### Smart sleep (night skip)

Checked every second while at least one player is in bed:

1. **Counted players** = everyone asleep, plus every non-AFK player in the Overworld (also those in the Nether/End if `sleep.countOtherDimensions` is on).
2. **Needed** = `ceil(counted × sleep.percent / 100)`, at least 1.
3. While anyone is in bed, Overworld players see `🛏 2/2 sleeping (1 AFK ignored)` above the hotbar.
4. **If vanilla's own rule already covers it**, i.e. enough players are asleep to meet the `playersSleepingPercentage` gamerule counting *everyone*, the pack does nothing and lets vanilla skip the night. That's always the case when nobody is AFK and everyone is in bed. Doing both would race, and the second skip would land a full day later.
5. Otherwise, once enough players have been asleep for `sleep.requiredTicks` (8 s, and never less than 7 s, so vanilla always gets to act first):
   - **At night:** moves to the **next morning**. Absolute time moves forward, so the day counter (`showdaysplayed`) stays correct. The weather clears too.
   - **During a daytime thunderstorm:** only clears the weather.
   - Chat shows `☀ Good morning! (1 AFK player skipped)`.

This works **alongside** the vanilla `playerssleepingpercentage` gamerule: vanilla handles everything it can, and this pack only covers what vanilla wouldn't, such as nights blocked by AFK players or by players in other dimensions.

### Commands

| Command | Who | What it does |
|---|---|---|
| `/afk:now` | Everyone | Marks you AFK right away. Small movements in the next 3 seconds (closing chat, the camera settling) are ignored. Move to come back |

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

### Saved data

Nothing is saved. AFK state is kept in memory and resets on rejoin. While a player is AFK, their name tag and the `afk` tag are changed.

### Known limits

- Being fully AFK while in a vehicle with no input still counts as AFK, which is intended.
- Name-tag changes may clash with other packs that also change player name tags.

---

## Stats & Leaderboards — `stats_bp`

Tracks player stats as scoreboards, with leaderboard menus and an optional sidebar.

### Stats

| ID (for `/stats:sidebar`) | Label | How it's counted |
|---|---|---|
| `playtime` | Playtime | +1 min per 60 s online. Paused while the player has the `afkTag` tag |
| `deaths` | Deaths | Player deaths |
| `mobkills` | Mob kills | Non-player entities killed by the player (arrows count for the shooter) |
| `pvpkills` | Player kills | Other players killed |
| `mined` | Blocks mined | Blocks broken by the player. Essentials+ tree felling and vein mining only count the first block |
| `placed` | Blocks placed | Blocks placed by the player |
| `travelled` | Distance travelled | Blocks moved per second, not gliding. Includes walking, swimming, boats and minecarts |
| `flown` | Elytra distance | Blocks moved while gliding |
| `joins` | Times joined | Each join |

- Movement faster than `maxSpeed` blocks/s is treated as a teleport and not counted. Respawning isn't counted either.
- Each stat is the scoreboard objective **`stats_<id>`** (e.g. `stats_deaths`). Scores are stored under the player's **name** (a "fake player" participant), not the player entity. Bedrock shows offline entity participants as "Player Offline", so this keeps real names on leaderboards and the sidebar when people are offline.
- Vanilla commands work too, e.g. `/scoreboard players list "Steve"`.
- If someone changes their gamertag, their stats start again under the new name, and the old name stays on the leaderboard.
- Scores from pack v1.0.0, which stored them on the player entity, move to the name automatically the next time that player joins. Until then they're hidden from the menus, and the vanilla sidebar may still show them as "Player Offline".
- First-joined date is saved per player, from the first join after the pack was added.

### Commands

| Command | Who | What it does |
|---|---|---|
| `/stats:show` | Everyone | Opens **Realm Stats**: **My stats** (every stat with your rank `#2 of 7`, plus first-joined date) or **Leaderboards** (pick a stat to see the top `leaderboardSize`, with your own position underneath if you're outside it) |
| `/stats:sidebar <stat>` | Ops | Shows a stat on everyone's sidebar. `<stat>` is a stat ID, **`cycle`** (rotates through every stat every `sidebarCycleSeconds`) or **`off`** |

### Configuration (`scripts/config.js` → `CONFIG`)

| Option | Default | Description |
|---|---|---|
| `afkTag` | `afk` | Playtime isn't counted while a player has this tag. Must match the AFK pack's `tag`. `""` = always count |
| `leaderboardSize` | `10` | Number of players on a leaderboard |
| `sidebarCycleSeconds` | `30` | Seconds per stat in `cycle` mode |
| `maxSpeed` | `100` | Faster movement (blocks/s) counts as a teleport and isn't added to distance |

### Saved data

| Key | Scope | Contents |
|---|---|---|
| `stats_playtime`, `stats_deaths`, `stats_mobkills`, `stats_pvpkills`, `stats_mined`, `stats_placed`, `stats_travelled`, `stats_flown`, `stats_joins` | World scoreboard | The stats, one participant per player name. **Kept** when switching between the individual pack and a bundle |
| `stats:sidebar` | World | Current sidebar mode (`<stat>` / `cycle`) |
| `stats:firstJoin` | Player | First join time (ms since epoch) |

### Resetting stats

Use vanilla commands (cheats needed):

- `/scoreboard players reset * stats_deaths` resets one stat for everyone.
- `/scoreboard players reset "Steve" stats_deaths` resets it for one player.
- `/scoreboard objectives remove stats_deaths` removes the stat entirely.

 The pack recreates missing objectives automatically.

---

## Realm News & Tips — `news_bp`

A news popup that operators edit in-game, a "welcome back" notice, and rotating chat tips.

### News popup

- When an op saves news with **"Pop up for everyone on their next join"** checked, every player sees it **once** on their next join.
- The popup is timed after the welcome popup (`delayTicks` = 5 s). If another popup is still open, it waits up to about 90 s.
- If it still can't show, chat says `📰 There's new Realm news! Run /news:show` (after the "welcome back" notice, if there is one), and the player sees it next join instead.
- Saving **unchecked** is a quiet edit (e.g. a typo fix). Players who already saw the news don't see it again.
- An empty body means no news.

### "Welcome back"

Players returning after at least `awayNoticeHours` (12 h) get `Welcome back! You were away 3d 5h.` It appears at the top of the news popup if there's unseen news, otherwise in chat. Last-seen time is refreshed every minute while online.

### Tips

- A tip from the list is posted in chat every `tipIntervalMinutes` (20), as `[Tip] …` (`tipPrefix`), only while someone is online.
- The default tips cover your other add-ons: tree felling, vein mining, the Waypoint Menu, `/stats:show` and `/afk:now`.

### Commands

| Command | Who | What it does |
|---|---|---|
| `/news:show` | Everyone | Shows the current news |
| `/news:edit` | Ops | Editor: title, body, and the "pop up on next join" toggle |
| `/news:tips` | Ops | Tips menu: **+ Add a tip**, **Settings** (on/off, interval 5–120 min in steps of 5), **Post the next tip now**, or tap a tip to edit or delete it |

### Configuration (`scripts/config.js`)

`DEFAULTS` are starting values that ops can change in-game. `CONFIG` options can only be changed in the file.

| Option | Default | In-game? | Description |
|---|---|---|---|
| `news.title` | `§l§bRealm News` | ✅ `/news:edit` | News popup title |
| `news.body` | *(empty)* | ✅ `/news:edit` | News text. Empty = no news |
| `tips` | 5 tips about your add-ons | ✅ `/news:tips` | Starting tip list |
| `tipIntervalMinutes` | `20` | ✅ `/news:tips` → Settings | Minutes between tips |
| `tipsEnabled` | `true` | ✅ `/news:tips` → Settings | Post tips at all |
| `delayTicks` | `100` | ❌ | Ticks after joining before showing the news (after the welcome popup's `40`) |
| `awayNoticeHours` | `12` | ❌ | Minimum time away for the welcome-back notice. `0` = never |
| `tipPrefix` | `§b[Tip]§r ` | ❌ | Text before each tip in chat |

### Saved data

| Key | Scope | Contents |
|---|---|---|
| `news:news` | World | JSON `{ title, body }` |
| `news:revision` | World | Increases on each announced save |
| `news:tips` | World | JSON list of tips, once edited in-game |
| `news:tipSettings` | World | JSON `{ enabled, intervalMinutes }` |
| `news:seen` | Player | Last revision the player saw |
| `news:lastSeen` | Player | Last time online (ms since epoch) |

---

## Bundling packs into one

Merges several packs into one `.mcpack`, so the Realm lists one pack instead of many.

**With Claude:** run the `/bundle-packs` skill. It asks **All packs** (first option) or **Let me choose**, then builds, checks and sends the file.

**Yourself:**

```bash
npm run bundle -- --list                                 # available packs
npm run bundle -- --all                                  # → dist/realm_bundle.mcpack
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
| Limits | Behavior packs only, for now |

> ⚠️ **Saved settings don't move between the bundle and individual packs.** Bedrock keeps each pack's script data (dynamic properties) separately. Switching resets in-game edits: welcome text, news, tips, per-player toggles, first-joined dates. **Scoreboard stats are kept.** Rebuilding the same bundle name keeps everything.

---

## How the packs work together

| Pair | Interaction |
|---|---|
| AFK → Stats | Stats pauses playtime for players with the `afk` tag. Keep AFK `tag` and Stats `afkTag` the same |
| Welcome → News | Both popups show on join, welcome first (`delayTicks` 40 vs 100). News waits until the welcome popup is closed |
| News tips → others | The default tips mention `/stats:show` and `/afk:now`. Edit them with `/news:tips` if you don't use those packs |
| Bedrock Essentials+ | Tree felling and vein mining only count 1 block in `mined`. No other overlap |

None of the packs depend on each other. Any combination works.

---

## Troubleshooting

| Problem | Check |
|---|---|
| A command doesn't show up | Type it with its prefix (`/stats:show`). Is the pack **Active**, not just Available? Minecraft 1.21.100+? Rejoin after activating. Ops-only commands are hidden from regular members |
| Commands missing after adding a bundle | The individual packs and the bundle are both active, so duplicates fail. Keep only one |
| Popup never appears | Close chat/inventory. The welcome popup retries for 30 s, news for about 90 s. Check the content log |
| Changes to `config.js` don't show up | Increase `header.version` in `manifest.json`, rebuild, and re-apply. In-game edits override `config.js` defaults (use `/welcome:reset`) |
| Settings reset after switching to or from a bundle | Expected: each pack keeps its own saved data (see [Bundling](#bundling-packs-into-one)) |
| Night doesn't skip | Is `sleep.enabled` on? The `🛏 x/y sleeping` status shows who's still needed. Players in other dimensions only count if `sleep.countOtherDimensions` is on |
| Script errors | **Settings → Creator → Enable Content Log GUI**, then rejoin. Errors start with `[welcome]`, `[afk]`, `[stats]`, `[news]` or `[durability]` |

---

## Keeping this file current

`npm run check` runs `tools/check-docs.mjs` after the type check, and fails if this file is missing any of:

- a `##` section whose heading contains `` `<folder>` `` for **every pack** in `packs/`
- **every command** a pack registers, e.g. `` `/stats:show` ``
- **every option** in a pack's `config.js`, as `` `option` ``, or `` `parent.option` `` for nested options like `` `sleep.percent` ``

When adding or changing a pack: update its section here, and the pack table in `README.md`, in the same commit.
