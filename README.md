# mc-packs

Minecraft Bedrock add-ons for my Realm. Each folder in `packs/` is a standalone behavior pack. They all use only the stable Script API (Minecraft **1.21.100+**), so no experimental toggles are needed.

| Pack | Folder | What it does | Commands |
|---|---|---|---|
| Welcome Message | `welcome_bp` | Popup when players join | `/welcome:show` · `/welcome:edit` · `/welcome:reset` |
| Low Durability Warning | `durability_bp` | Warns at 10% and 3% durability left, for tools, weapons and armor | `/durability:toggle` |
| AFK + Smart Sleep | `afk_bp` | `[AFK]` tag after 5 min idle; the night can be skipped without waiting for AFK players | `/afk:now` |
| Stats & Leaderboards | `stats_bp` | Playtime, deaths, kills, blocks, distance; leaderboards; sidebar | `/stats:show` · `/stats:sidebar` |
| Realm News & Tips | `news_bp` | News popup when something's new, "you were away 3d", rotating chat tips | `/news:show` · `/news:edit` · `/news:tips` |

Commands with `edit`, `reset`, `tips` or `sidebar` in the name are ops-only. None of the commands need cheats.

**One pack or several?** Install the packs one by one, *or* bundle them into one with `npm run bundle -- --all` (see [Bundling](#bundling)). **Never use both at once**: every command would be registered twice.

## Welcome Message (`packs/welcome_bp`)

A behavior pack that shows a popup when a player joins the Realm. You can change the popup from inside the game, so you never have to re-upload the pack just to edit the text.

| Feature | Details |
|---|---|
| Popup | A native form with a title, body text and a close button |
| When it shows | On every join (not when a player respawns after dying), or once per player |
| Placeholders | `{player}` (name), `{online}` (player count) |
| Formatting | `§` colour codes, `\n` for a new line |
| Extras (optional) | Also post the message in chat, or flash a big on-screen title |
| Needs | Minecraft Bedrock **1.21.100+**. Uses stable Script API only, so no experimental toggles |

### Commands

| Command | Who | What |
|---|---|---|
| `/welcome:show` | Everyone | Show the welcome message to yourself (preview) |
| `/welcome:edit` | Operators | Open an editor form for the title, body, button and options |
| `/welcome:reset` | Operators | Throw away in-game edits and go back to `scripts/config.js` |

None of these need cheats turned on. Each in-game save counts as a new revision, so with **show once** turned on, everyone sees the edited message one more time.

### Install on a Realm

1. Get `welcome_bp.mcpack`: run `npm run build` to put it in `dist/`, or download it from wherever it's shared.
2. Open the `.mcpack` on a device that has Minecraft. It imports automatically.
3. In Minecraft go to **Play → Realms → ✏️ (Edit Realm) → Behavior Packs**, then activate **Welcome Message**.
   *Another way:* download the Realm world, add the pack under the world's **Behavior Packs**, then upload the world again.
4. Join. The popup appears about 2 seconds after the world loads. If the client is still busy (loading, chat open, inventory open), it keeps retrying for up to about 30 seconds.

> ⚠️ Any non-Marketplace behavior pack turns off achievements for that world. This is how Bedrock works and isn't specific to this pack.

### Change the default message

You can just use `/welcome:edit` in-game. If you want to change the defaults that ship with the pack:

1. Edit `packs/welcome_bp/scripts/config.js`.
2. **Increase `header.version`** in `manifest.json` (for example `[1, 0, 0]` → `[1, 0, 1]`). If you don't, players' devices keep using their cached copy.
3. Run `npm run build` and re-import or re-apply the pack.

## Low Durability Warning (`packs/durability_bp`)

- Checks main hand, offhand and all 4 armor slots twice a second.
- **Warning** (yellow message above the hotbar + soft sound) at ≤ 10% durability left. **Critical** (red, also posted in chat + anvil sound) at ≤ 3%.
- Warns once per level. A new item or a repair resets it. Each hotbar slot is tracked separately.
- `/durability:toggle` turns it off just for you.
- Thresholds are in `scripts/config.js`.

## AFK + Smart Sleep (`packs/afk_bp`)

- **AFK detection:** goes by actual input (movement keys or stick, camera turns, breaking, placing, using items, hotbar changes). Water streams and minecarts don't count as activity.
- After 5 min of no input: the name above your head becomes `[AFK] Name`, you get the `afk` tag, and chat says so. Any input brings you back.
- `/afk:now` marks you AFK right away.
- **Night skip:** when 100% (configurable) of the *non-AFK* players in the Overworld are asleep for 5 seconds:
  - it moves to the next morning (the day counter stays correct) and clears the weather
  - while people are in bed, a status like `🛏 2/2 sleeping (1 AFK ignored)` shows above the hotbar
- It works alongside the vanilla `playerssleepingpercentage` gamerule. Whichever condition is met first skips the night.
- The Stats pack doesn't count playtime for players with the `afk` tag.

## Stats & Leaderboards (`packs/stats_bp`)

| Stat | Source |
|---|---|
| Playtime | +1 min per 60 s online, excluding time with the `afk` tag |
| Deaths, mob kills, player kills | Death events (kills by arrows count for the shooter) |
| Blocks mined / placed | Break and place events. Blocks broken by Essentials+ tree felling and vein mining only count the first block |
| Distance travelled / elytra | Position checked once a second; anything faster than 100 blocks/s is treated as a teleport and skipped |
| Times joined, first joined | Join events |

- Every stat is a scoreboard objective (`stats_<id>`), so offline players stay on the leaderboards and vanilla `/scoreboard` works too.
- `/stats:show` opens a menu with your stats and ranks, and leaderboards for each stat (top 10, plus your own position).
- `/stats:sidebar <stat|cycle|off>` (ops) puts a stat on everyone's sidebar. `cycle` rotates through all of them every 30 s.

## Realm News & Tips (`packs/news_bp`)

- `/news:edit` (ops): title + body. With **"Pop up for everyone on their next join"** checked, each player sees the news once. Unchecked, it's a quiet edit, e.g. to fix a typo.
- On join, if there's unseen news, the popup appears after the welcome popup closes (it waits up to about 90 s). If it can't show, chat gets a `/news:show` reminder.
- Players returning after 12+ hours get `Welcome back! You were away 3d 5h.`
- `/news:tips` (ops): add, edit or delete tips, change the interval (5–120 min) or turn them off, or post the next tip now. Default: every 20 min, only while someone is online.

## Bundling

To combine any of the packs into one `.mcpack`, ask Claude to run the **`bundle-packs`** skill (`/bundle-packs`). It asks *All packs* or *Let me choose*. You can also run it yourself:

```bash
npm run bundle -- --list                              # what's available
npm run bundle -- --all                               # → dist/realm_bundle.mcpack
npm run bundle -- --packs welcome_bp,stats_bp         # only some
npm run bundle -- --all --name my_bundle --title "My Bundle"
```

| | |
|---|---|
| Identity | The UUID is derived from `--name`. Rebuilding with the same name, even with a different selection, **updates** the pack on the Realm instead of adding a second one |
| Version | Build time `[YYYY, MMDD, HHMM]` (UTC), so it always goes up and devices never keep a stale copy |
| Layout | Each pack's scripts go in `scripts/<pack>/`; a generated `scripts/main.js` imports them all |
| Saved data | ⚠️ Bedrock keeps script data (dynamic properties) **separately for each pack**. Switching between individual packs and the bundle resets in-game edits: welcome text, news, tips, `/durability:toggle`, first-joined dates. **Stats are kept**, because scoreboards belong to the world. Choose one approach early on |

## Development

```bash
npm install
npm run check   # type-checks the JS against @minecraft/server 2.1.0 / server-ui 2.0.0
npm run build   # dist/<pack>.mcpack for every folder in packs/
npm run bundle  # merge packs into one; see Bundling
```

Script errors show up in the content log (**Settings → Creator → Enable Content Log GUI**).
