# mc-packs

Minecraft Bedrock add-ons for my Realm. Each folder in `packs/` is a standalone behavior pack. `npm run build` turns each one into `dist/<folder>.mcpack`.

| Pack | Folder | What it does |
|---|---|---|
| Welcome Message | `packs/welcome_bp` | Configurable popup when players join |
| Longer Reach | `packs/reach_bp` | Place blocks from 7.5 blocks away instead of 5 |

Install any pack the same way (see [Install on a Realm](#install-on-a-realm)). Packs are independent, so turn on whichever ones you want.

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

## Longer Reach (`packs/reach_bp`)

Bedrock's reach distance is **hard-coded in the engine**. Unlike Java's `block_interaction_range` attribute, there's no add-on API, entity component or Script API that changes it. So this pack *emulates* longer reach for **placing blocks**:

1. You right-click while holding a block and nothing is within vanilla reach. The game fires `itemUse`, which it doesn't do when vanilla handles the click itself.
2. The script raycasts up to `vanillaReach × reachMultiplier` (5 × 1.5 = **7.5 blocks**).
3. If it hits a block farther than 5 blocks away, the script places your block on that face, the same way vanilla would.

| Behaviour | Matches vanilla? |
|---|---|
| Uses up 1 item (except in Creative) | ✅ |
| Won't place inside mobs or players | ✅ |
| Replaces grass, water, snow layers, … | ✅ |
| Adventure, Spectator and Visitor players can't place | ✅ |
| Won't place against a chest or door unless you sneak | ✅ |
| Logs (axis), stairs, slabs (top or bottom half), furnaces and chests (facing) | ✅ oriented |
| Pistons, observers and dispensers (6-way facing) | ⚠️ default orientation |
| Doors, beds, torches, signs, plants, rails, redstone dust, … | ❌ deny-listed (still work at normal range) |
| Place sound | ≈ rough per-material match |
| **Breaking** blocks further away | ❌ not supported |
| **Opening** chests or doors further away | ❌ not supported |

Why breaking and opening aren't supported:

- **Breaking:** scripts can't read a block's hardness or mining speed, so far blocks would break instantly.
- **Opening:** scripts can't open a container screen for a player.

Settings are in `packs/reach_bp/scripts/config.js`: reach multiplier, cooldown, and the deny list.

## Development

```bash
npm install
npm run check   # type-checks the JS against @minecraft/server 2.1.0 / server-ui 2.0.0
npm run build   # dist/<pack>.mcpack for every folder in packs/
```

Script errors show up in the content log (**Settings → Creator → Enable Content Log GUI**).
