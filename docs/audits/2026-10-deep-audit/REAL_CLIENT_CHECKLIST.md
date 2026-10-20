# Real-client checklist (F71: W2, O11-O16, O68-O75 and the fix campaign)

A dedicated server draws nothing, so these checks need a real game. Run them on **a phone and a PC** in a
**private test world**, never on the live Realm: some steps spawn tornadoes, skip story chapters or dig out a
townsfolk's floor. Each check says what to do, what you should see (PASS) and what counts as a problem (FAIL).
Write the result in the table at the end, one line per check, with a screenshot when something looks wrong.

Time: about 90 minutes for everything. The checks are independent; do them in any order and skip what you can't
do today (write "not run").

## 0. Set up the test world (once, about 10 minutes)

1. On the PC, download the newest **Realm Bundle** and **Realm Resources** from https://mc.nish.software/realm/ and
   open both files: Minecraft imports them.
2. Create a new world: **Survival**, a normal (not flat) world, **Activate cheats: on** (needed for `/time`,
   `/gamemode` and `/scriptevent`). Under **Behavior Packs** activate **Realm Bundle**, under **Resource Packs**
   **Realm Resources**. Check both list the version the realm page shows.
3. Start the world on the PC. Open it to LAN / friends.
4. On the phone, sign in with **a second account** (a family or alt account; the phone can't join as the same
   account) and join the PC's world over the same Wi-Fi. Without a second account, do every check on each device in
   turn and mark the two-player checks (B3, C2) "not run".
5. On the PC: pause menu → the phone player → give **Operator** permission, so both can run operator commands.
6. Phone: set the GUI scale to the phone's default. PC: note the GUI scale (Settings → Video) and the window size;
   do the HUD checks once in a normal window and once at full screen.
7. Before each check that asks for it, note the device, GUI scale and screen size in the result line.

Useful commands (operator):
- `/time set 1000` (day), `/time set 14000` (night), `/gamemode creative` / `/gamemode survival`.
- `/realm:prefs` (each player's own settings), `/realm:config` (the realm's settings).
- `/realm:npc_add <id>` places a townsfolk where you stand (`tobin`, `mara`, `reyes`, ...).
- Story skips: `/scriptevent realm:saga_debug {"player":"<name>","action":"jump","story":"act1_signs","chapter":"<id>"}`
  marks every chapter before `<id>` finished. Accept the story first (tap Old Tobin and accept *The Drowned Bell*, or
  run `/realm:saga` and accept the main story).

## A. HUD and side boxes (both devices)

### A1. Story quest box: size, place, no "..." (O12, O68, F17)
1. Accept the main story (`/realm:saga`). The quest box shows at the right (**Right 4** by default).
2. Make it long: start a party with the other player (`/realm:party_invite <name>`, accept on the other device),
   so the box adds the party line. Turn on the Minimap radar (`/realm:minimap`) and the Coordinates HUD in a side box
   (`/realm:prefs` → **Where my HUD shows** → **Right 1**).
3. In `/realm:prefs` → **Where my story tracker shows**, try **Right 1**, **Right 2**, **Right 3** and **Middle**,
   closing the menu each time.
- PASS: every line of the box is whole: no word cut in half, no line ending in `...`, the text stays inside its
  dark background. The box never covers the radar or the compass strip. A line the box has no room for is left out
  with a note like `+2 more steps in /realm:saga` instead of being cut. Middle sits under the crosshair without covering it.
- FAIL: `...`, letters past the box edge, a box over the radar, two boxes drawn on top of each other.

### A2. Side boxes together (the Minimap now draws every box: the compositor)
1. Keep A1's set-up (radar, Coordinates HUD in Right 1, quest box in Right 4). Add Mob Health (hit a cow: it shows
   in **Left 1**) and the Elytra HUD (glide with an elytra in creative: **Left 2**).
2. Walk around for a minute, hit mobs, glide, stand still for 30 seconds.
3. Run `/realm:admin_title "Test" "Subtitle" 5` and watch the boxes.
- PASS: every box keeps updating on its own (coordinates change as you walk, mob health on each hit) while the radar
  moves. Nothing blinks out for more than a moment. Standing still, nothing fades away. During the title the boxes
  hide, and they come back within about 2 seconds after it fades.
- FAIL: a box that freezes, flickers every second, disappears and stays gone, or shows another player's text.

### A3. One-line Coordinates HUD on a phone (O13)
1. `/realm:prefs` → **Where my HUD shows** → **Above the hotbar**. Turn on the stats ticker (it's on by default) and
   stay in the party from A1 with the other player 20+ blocks away, so the line has the coordinates, facing, day and
   time, a stat and the mate (`X 120  Y 64  Z -340 | Facing NE | Day 12 6:30 AM | Mob kills 120 #2 of 7 | Bob 20hp 2m E`).
- PASS on the phone: the whole line fits on screen, or wraps onto a second line that is still readable above the
  hotbar. Nothing runs off the screen edge.
- FAIL: the line is cut at the screen edge, or covers the hotbar or health bar.

### A4. Minimap budget and the black square (O15, O69)
1. `/realm:config` → **Minimap** → **Minimap script time a tick**: try **low**, then **normal**, then **high**.
   With each: walk for 30 seconds, sprint, fly in creative across new land for 30 seconds, then stand at spawn with
   the other player and some animals around.
2. Then turn your radar off (`/realm:minimap`), then the compass (`/realm:compass`), and turn both on again. Also
   switch the Minimap off for the realm (`/realm:config` → Minimap → disabled) and on again.
- PASS: at every level the strip turns smoothly with you and the radar keeps up within a second or two when flying
  (low may lag a bit more, then catches up when you stop). With a part off, nothing is left where it was: no black
  or dark square, no empty frame, even while another box (quest box, Coordinates HUD) is showing.
- FAIL: a black square after turning the radar off; a strip or radar that stops updating; a stutter you only see at
  one level (say which).

### A5. Welcome popup and Realm News on a phone
1. Join the test world with an account that hasn't joined before (or run `/realm:welcome_show`).
2. Then `/realm:npc_add tobin` somewhere, and run `/realm:welcome_show` again a few seconds later.
- PASS: one popup, three short bold gold headings (`The World`, `What You Can Do`, `Where To Go Next`), normal-size
  text, scrolls on the phone, one Close button. Before Old Tobin is placed it does **not** say "Tap Old Tobin or
  Mara"; after placing him it says `Tap Old Tobin in town to begin The Lantern and the Hollow.` (not Mara). After
  closing it, the Realm News popup comes next and is readable too.
- FAIL: a huge heading font, text off the edges, a popup that can't be closed, Old Tobin named before he is placed.

## B. Characters, labels and walking

### B1. Name label timing (O11, O16)
1. `/time set 1000`. Place Mara (`/realm:npc_add mara`) and walk at least 40 blocks away, out of sight.
2. Walk back toward her at normal speed. Repeat once sprinting, once flying in creative.
3. Find a wanderer or a story character (`/realm:wander` → **Someone appears here** as operator) and do the same.
4. Switch to spectator (`/gamemode spectator`) near a story character, then back.
- PASS: the name appears above the head within about a second of coming within 20 blocks, stays steady (no
  blinking), sits just above the head (not inside it, not floating far above), shows the real name (never "NPC", no
  empty dark pill). Only one label per character. In spectator mode no story label is drawn over you.
- FAIL: no label until you're very close, a label that blinks every second or three, two labels, "NPC", an empty
  pill. Note how long it took (count seconds).

### B2. Wanderers and caravan llamas walk home, no rubber-banding (F42, the tether)
1. Find a wanderer (`/realm:wander` → **Someone appears here**). Watch it for 2 minutes from 10 blocks away.
2. Push it away: lead it with your body, or stand so it walks after you, until it is 8+ blocks from where it started.
3. Build a short wall (3 high) between it and its spot and watch again. Then remove the wall.
4. Call the caravan (`/realm:caravan_call`) and push a pack llama 10+ blocks away the same way.
- PASS: it slows, turns and walks back on its own. No teleport jumps, no stutter back and forth at the edge. Behind
  the wall it walks around it (or after a while waits, then finds its way); at most one jump back as a last resort.
- FAIL: it snaps back again and again, vibrates in place, walks into the wall forever, or lands on a roof or inside
  a fence.

### B3. Townsfolk whose floor is dug out (the tether, both devices)
1. Stand next to Mara (from B1). Dig out the 2 blocks under her (survival), so she drops into the hole.
2. Wait 10 seconds. Then fill the hole and wait 10 seconds again. Then dig a hole and pour water in it under her.
- PASS: she stays down in the hole (or on a dry spot next to it in the water case) instead of being lifted up every
  second; once the floor is back, she goes back up onto her own spot. No endless jumping up and falling.
- FAIL: she pops up and falls again and again, floats in the water for good, or ends up stuck inside blocks.

## C. Story checks

### C1. The Old Graveyard: camera and respawn screen (O75)
1. Accept the main story, then skip to the graveyard chapter:
   `/scriptevent realm:saga_debug {"player":"<you>","action":"jump","story":"act1_signs","chapter":"graves"}`.
   Talk to Moss when the tracker says so, then follow the tracker to the Old Graveyard.
2. While searching for clues, tap empty ground and a few spots that are not clues, many times, quickly. Tap the
   real clues too (they glow faintly).
3. `/time set 14000`, let the zombies come, and die to them (survival, no armor).
- PASS: clue finds come as chat lines only; no form pops up for a tap. You can move, tap and look around the whole
  time. When you die, the normal respawn screen shows at once and **Respawn** works. After respawning the story goes
  on (the clues found stay found).
- FAIL: movement, tapping or the camera freezes; no respawn screen until Escape; a form stuck on screen.

### C2. The Gray Ring with a party (F47)
1. Both players: accept the main story, start a party (`/realm:party_invite <name>`, accept), then both skip to
   *Song in the Dark*:
   `/scriptevent realm:saga_debug {"player":"<name>","action":"jump","story":"act1_signs","chapter":"song"}` for
   each player. `/time set 14000`.
2. Go to the Old Chapel, follow the pale light to the Gray Ring together. At the stones, both sneak toward the
   circle. Then try once more and let one player walk in upright to be seen.
- PASS: both players see the **same** gray hoods (about 4 watchers, not a set for each player). Guards walk their
  rounds smoothly, without jumping back and forth. Reaching the inside of the stone circle unseen finishes the step
  for both; the scene (the Cantor and the hoods) plays once. Being seen sends the right message and lets you retry.
- FAIL: double guards, guards that teleport or vibrate, the step finished for one player only, the step impossible
  to finish while inside the circle.

## D. Inventory and storage

### D1. Shift-click (sneak-tap) sorting (O72)
1. Put a messy mix of items into a chest, a barrel and a shulker box.
2. Empty hand: sneak and tap each one. Then hold a pickaxe and sneak-tap the chest. Repeat on the phone (sneak
   button, then tap the chest).
- PASS: with an empty hand it sorts at once and the bar above the hotbar says `Sorted N stacks`; the container does
  not open. With a tool in hand the **Quick Stack & Sort** menu opens. Works the same on phone and PC.
- FAIL: the chest just opens, nothing happens, or the phone needs something different from the PC.

### D2. Moving items between pages, and the page buttons (O73)
1. Open your inventory. The last three slots of the top row are `<`, the page/menu button and `>`. Switch pages
   with them a few times, on PC (click, and shift-click) and phone (tap).
2. Run `/realm:inv` → **Move to page**: move one stack to page 3, then a whole row to page 2. Check pages 2 and 3.
   Include a filled shulker box, an enchanted sword and a potion.
3. Hold an item on the cursor (PC) while clicking a page button.
- PASS: the buttons stay where they are and always come back after a click; the bar says `[Page #2/5] ...`; moved
  items arrive once, with their contents, enchantments and potion kind intact; nothing is lost or doubled; the item
  on the cursor stays with you.
- FAIL: a button item you can keep, an item that vanishes or doubles, a shulker box that arrives empty.

### D3. Auto-store into other pages (the stash page index)
1. Fill your current page until only one slot is free (24 slots, use mixed blocks). Make sure page 2 has a stack of
   cobblestone with room left.
2. Pick up cobblestone, then dirt, then some new item from the ground. Then free two slots and pick up more.
3. Open `/realm:inv` → **Fill earlier pages**.
- PASS: while your page has at most one free slot, the pickups go into the other pages (cobblestone onto page 2's
  stack first); once it has two free slots they stay on your page. Nothing is dropped on the ground or lost; the
  pickup sound and bar note make sense. **Fill earlier pages** moves items toward page 1 without sorting.
- FAIL: pickups refused while another page has room, an item lost, the page flicker-switching while you pick up.

### D4. Chest Finder marker (O70)
1. Put iron ingots in a chest 20-30 blocks away, behind a wall, among other chests and signs. Do it once by day,
   once at night.
2. Run `/realm:find iron` and tap the result.
- PASS: a bright arrow above the right chest is easy to spot from where you stand, on both screens, by day and night;
  the bar says the direction and distance (`Chest 12 blocks NE`) and updates as you walk; it all goes away after about
  10 seconds. The other player sees nothing.
- FAIL: the arrow is hard to see or sits over the wrong chest; the line covers other HUD text; the other player
  sees it.

## E. Other things only a client can judge

### E1. Stats ticker on by default, with your own off switch (O71)
1. On a fresh account (or after `/realm:stats` → **Stats ticker** off and on): look above the hotbar.
2. Turn yours off with `/realm:stats_ticker` (or `/realm:prefs` → Stats ticker). Rejoin.
- PASS: your stats rotate above the hotbar (`Mob kills 120 #2 of 7`) by default; the other player's ticker shows
  only their own stats; after turning yours off it stays off after rejoining, while the other player's stays on.
  Ties show the same place in the ticker and in `/realm:stats` → My stats.
- FAIL: no ticker by default, the switch doesn't stick, a rank that differs between ticker and menu.

### E2. Tornado funnel at 64+ blocks (O14)
1. Install nothing extra: Realm Resources has the sky effects. `/realm:tornado_spawn` (40 blocks in front of you).
2. Look at it from 30 blocks, then walk or fly away to 70 and 120 blocks (`/realm:tornado_info` gives the distance).
- PASS: one funnel, the same shape near and far (thinner far away is fine), no second funnel drawn next to or inside
  the first, no doubled rings when you cross 64 blocks. The phone keeps a playable frame rate.
- FAIL: two funnels, a funnel that pops or doubles at about 64 blocks, a phone that stutters badly near it.

### E3. Easy Building preview and beds (F7, F8, F9, O47)
1. `/realm:build_book`, pick **Line** in its menu, hold a stack of planks: right-click a block (first anchor), look
   around, then right-click again to place. Do the same for **Wall** and **Cube**.
2. After setting a first anchor, switch to a sword, then back to the planks. Then pick a pickaxe and right-click.
3. Hold a bed: build a Line, a Floor and a Circle of beds; try one with **Mirror** on (Sneak + left-click with the
   book). Then try **Air Build** with a bed.
- PASS: the outline follows your aim smoothly with the size and block count above the hotbar; it hides while you hold
  the sword and comes back with the planks (same anchor); the pickaxe starts a red destroy anchor instead of building.
  Beds come out whole (head and foot together, facing the same way) in every mode, and the camera isn't forced to
  look somewhere odd. Undo (`/realm:build_undo`) gives the beds back in survival.
- FAIL: an outline that lags far behind, flickers or stays after building; half beds; a build from a pickaxe click.

### E4. Settings menus on a phone
1. Open `/realm:prefs` and `/realm:config` on the phone, scroll to the end.
- PASS: headings are normal-size bold gold, nothing wraps a pack name over two lines, every switch is reachable;
  a preference the operators locked shows as locked; closing with unsaved changes warns first.
- FAIL: huge headings, text cut off, a switch that can't be reached.

## Results

Fill in one line per check (copy the table into a reply, or edit this file). Device: Phone or PC, with the GUI
scale and screen size.

| Check | Device | PASS / FAIL / not run | What you saw (and the screenshot name) |
|---|---|---|---|
| A1 quest box | | | |
| A2 side boxes together | | | |
| A3 one-line HUD | | | |
| A4 Minimap budget, no black square | | | |
| A5 welcome and news | | | |
| B1 name labels | | | |
| B2 wanderers and llamas walk home | | | |
| B3 townsfolk on a dug-out floor | | | |
| C1 graveyard camera and respawn | | | |
| C2 Gray Ring with a party | | | |
| D1 sneak-tap sorting | | | |
| D2 move between pages | | | |
| D3 auto-store | | | |
| D4 Chest Finder marker | | | |
| E1 stats ticker | | | |
| E2 tornado funnel | | | |
| E3 Easy Building | | | |
| E4 settings menus | | | |

Which F- and O-items each check closes: A1 O12/O68/F17, A2 side box compositor, A3 O13, A4 O15/O69, A5 O43/F64,
B1 O11/O16, B2 F42, B3 tether (floor gone), C1 O75, C2 F47, D1 O72, D2 O73, D3 O17/O20/F3/F13, D4 O70, E1 O71/F45,
E2 O14, E3 F7/F8/F9/O47/O48, E4 the prefs lock and header rules.
