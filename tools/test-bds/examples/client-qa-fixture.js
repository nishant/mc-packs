// Reusable client & server QA fixture for:
//   1) Map terrain/water/bridge/thin-roof/elevation/cave rendering (map_bp + hud_rp)
//   2) Sidebar long names & Side HUD boxes (hud_rp + side.js protocol)
//   3) Old/new inventory paging & cursor item transfers (stash_bp)
//   4) NPC nameplate distance stops at 5m, 10m, 15m, 20m, 25m + render-mode probe (npc_bp)
//
// Headless mode: verifies server-side fixture preconditions and exits cleanly (visual gate remains unverified).
// Interactive --client-qa mode: keeps server running, auto-stages any joining real client player, and
// listens for `/scriptevent qa:cmd <action>` from the server console or operator player.

export default async function (t) {
  const { world, system, ItemStack } = t.mc;
  const dim = world.getDimension("overworld");

  const sim = await t.player("QAFixtureBot", { op: true, gameMode: "creative" });
  const cx = 200;
  const cz = 200;
  const { top } = await t.loadArea(cx, cz, { radius: 4 });
  const baseY = Math.min(typeof top === "number" ? top : top.location.y, 72);

  // Move sim into the target chunks and wait 15 ticks so chunks cx-24..cx+28, cz-16..cz+16 are ticking before fill().
  sim.teleport({ x: cx + 8.5, y: baseY + 2, z: cz + 0.5 }, { rotation: { x: 0, y: -90 } });
  await t.wait(15);

  // 1. Build deterministic flat lawn + clear all trees/canopy up to baseY+30 + river + bridge + thin roof + spire + cave.
  const fill = (x1, y1, z1, x2, y2, z2, block) => {
    dim.runCommand(`fill ${x1} ${y1} ${z1} ${x2} ${y2} ${z2} ${block}`);
  };

  fill(cx - 24, baseY - 5, cz - 16, cx + 28, baseY, cz + 16, "grass_block");
  fill(cx - 24, baseY + 1, cz - 16, cx + 28, baseY + 10, cz + 16, "air");
  fill(cx - 24, baseY + 11, cz - 16, cx + 28, baseY + 20, cz + 16, "air");
  fill(cx - 24, baseY + 21, cz - 16, cx + 28, baseY + 30, cz + 16, "air");

  // Deep river channel (north of center: z - 12 .. z - 6, 5 blocks deep)
  fill(cx - 18, baseY - 4, cz - 12, cx + 18, baseY, cz - 6, "water");
  // Bridge over river (x - 1 .. x + 1, z - 12 .. z - 6, y = baseY + 1)
  fill(cx - 1, baseY + 1, cz - 12, cx + 1, baseY + 1, cz - 6, "stone_bricks");

  // Thin 1-block roof canopy (south of NPC sightline lane: x + 4 .. x + 10, z + 6 .. z + 12, y = baseY + 4)
  fill(cx + 4, baseY + 4, cz + 6, cx + 10, baseY + 4, cz + 12, "stone_slab");

  // High spire for elevation rendering (x + 14 .. x + 16, z + 8 .. z + 10, height +10)
  fill(cx + 14, baseY + 1, cz + 8, cx + 16, baseY + 10, cz + 10, "gold_block");

  // Sealed subterranean cave chamber for cave/underground mode (x - 13 .. x - 7, baseY - 5 .. baseY - 1, z + 7 .. z + 13)
  fill(cx - 13, baseY - 5, cz + 7, cx - 7, baseY - 1, cz + 13, "stone");
  fill(cx - 12, baseY - 4, cz + 8, cx - 8, baseY - 2, cz + 12, "air");
  fill(cx - 10, baseY - 4, cz + 10, cx - 10, baseY - 4, cz + 10, "sea_lantern");

  // Explicit cache-age precondition: move sim across the staged area and wait >210 ticks
  // so map_bp's column cache (CACHE_REFRESH_TICKS = 200) scans the fresh terrain rather than stale ground.
  sim.teleport({ x: cx + 5.5, y: baseY + 1, z: cz + 0.5 }, { rotation: { x: 0, y: -90 } });
  await t.wait(215);

  // Verify terrain blocks AND unobstructed NPC sightline corridor (x = cx - 5 .. cx + 21, z = cz - 1 .. cz + 1) via waitUntil.
  await t.waitUntil(() => {
    const bridge = dim.getBlock({ x: cx, y: baseY + 1, z: cz - 9 })?.typeId;
    const water = dim.getBlock({ x: cx + 5, y: baseY, z: cz - 9 })?.typeId;
    const roof = dim.getBlock({ x: cx + 7, y: baseY + 4, z: cz + 9 })?.typeId;
    if (bridge !== "minecraft:stone_bricks" || water !== "minecraft:water" || !roof?.includes("slab")) return false;
    for (let x = cx - 5; x <= cx + 21; x++) {
      const ground = dim.getBlock({ x, y: baseY, z: cz })?.typeId;
      if (ground !== "minecraft:grass_block" && ground !== "minecraft:sea_lantern") return false;
      for (let z = cz - 1; z <= cz + 1; z++) {
        for (let y = baseY + 1; y <= baseY + 4; y++) {
          if (dim.getBlock({ x, y, z })?.typeId !== "minecraft:air") return false;
        }
      }
    }
    return true;
  }, { timeout: 60, message: "terrain/water/bridge/thin-roof fixture blocks and clear NPC sightline corridor ready" });

  // 2. NPC fixture at (cx + 20, baseY + 1, cz) facing west (-X, yaw 90) with 5/10/15/20/25m pads along X.
  const npcPos = { x: cx + 20.5, y: baseY + 1, z: cz + 0.5 };
  for (const e of dim.getEntities({ location: npcPos, maxDistance: 30, type: "minecraft:npc" })) {
    try { e.remove(); } catch {}
  }
  const npc = dim.spawnEntity("minecraft:npc", npcPos);
  npc.nameTag = "§eArchivist Mara\n§7Keeper of the Western Reach";
  npc.addTag("npc:managed");
  npc.addTag("npc:id:qa_archivist_mara");

  const stops = [5, 10, 15, 20, 25];
  for (const dist of stops) {
    const sx = cx + 20 - dist;
    dim.runCommand(`setblock ${sx} ${baseY} ${cz} sea_lantern`);
  }

  await t.waitUntil(() => {
    const found = dim.getEntities({ location: npcPos, maxDistance: 4, type: "minecraft:npc" });
    return found.length === 1 && found[0].nameTag.includes("Archivist Mara");
  }, { timeout: 40, message: "NPC Archivist Mara spawned with nameplate" });

  // 3. Helper to push long-name Side HUD boxes + scoreboard sidebar to a player.
  function applyLongSidebarAndHud(player) {
    try {
      let obj = world.scoreboard.getObjective("qa_sidebar_long");
      if (!obj) {
        obj = world.scoreboard.addObjective(
          "qa_sidebar_long",
          "§6The Grand Archive of the Western Reach"
        );
      }
      dim.runCommand("scoreboard objectives setdisplay sidebar qa_sidebar_long");
      dim.runCommand(`scoreboard players set "Archivist_Mara_Of_The_Reach" qa_sidebar_long 1420`);
      dim.runCommand(`scoreboard players set "Sunken_Observatory_Watch_01" qa_sidebar_long 980`);
      dim.runCommand(`scoreboard players set "Bridge_Over_River_Crossing" qa_sidebar_long 315`);
    } catch {}

    const boxes = [
      {
        slot: "claim",
        text: "§l§6Claim§r\n§fThe Grand Archive of the Western Reach\n§7Owner: §bExtremelyLongOwnerName_TwentyFourChars\n§aPvP Off · Build Allowed",
      },
      {
        slot: "waystone",
        text: "§l§6Waystone§r\n§fSunken Observatory Spire Overlook (East)\n§7Distance: §e142m North-Northeast",
      },
      {
        slot: "party",
        text: "§l§6Party§r\n§a* §fCaptain_Longbeard_The_Third §7(100%)\n§a* §fNavigator_Aurelia_Westwind §7(95%)",
      },
    ];
    for (const b of boxes) {
      system.sendScriptEvent("realm:side_box", JSON.stringify({ player: player.name, slot: b.slot, text: b.text }));
    }
  }

  // 4. Helper to populate 2+ stash pages (40 items) for a target player.
  const STASH_ITEMS = [
    "minecraft:diamond", "minecraft:emerald", "minecraft:gold_ingot", "minecraft:iron_ingot",
    "minecraft:copper_ingot", "minecraft:netherite_ingot", "minecraft:amethyst_shard", "minecraft:quartz",
    "minecraft:lapis_lazuli", "minecraft:redstone", "minecraft:coal", "minecraft:charcoal",
    "minecraft:apple", "minecraft:golden_apple", "minecraft:bread", "minecraft:cooked_beef",
    "minecraft:cooked_porkchop", "minecraft:cooked_mutton", "minecraft:cooked_salmon", "minecraft:cooked_cod",
    "minecraft:oak_log", "minecraft:spruce_log", "minecraft:birch_log", "minecraft:jungle_log",
    "minecraft:acacia_log", "minecraft:dark_oak_log", "minecraft:mangrove_log", "minecraft:cherry_log",
    "minecraft:cobblestone", "minecraft:stone_bricks", "minecraft:mossy_stone_bricks", "minecraft:deepslate_tiles",
    "minecraft:glass", "minecraft:tinted_glass", "minecraft:sea_lantern", "minecraft:glowstone",
    "minecraft:torch", "minecraft:soul_torch", "minecraft:lantern", "minecraft:soul_lantern",
  ];

  const STORAGE_SLOTS = [9, 10, 11, 12, 13, 14, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35];

  async function seedPlayerStashPages(player) {
    const inv = player.getComponent("minecraft:inventory")?.container;
    if (!inv) throw new Error(`inventory container unavailable for ${player.name}`);
    const pageNow = () => Number(/Page (\d+)\//.exec(inv.getItem(16)?.nameTag ?? "")?.[1] ?? 0);
    await t.waitUntil(() => inv.getItem(15)?.typeId === "custom:inv_prev" && inv.getItem(17)?.typeId === "custom:inv_next", {
      timeout: 120,
      message: `stash_bp paging buttons placed in slots 15-17 for ${player.name}`,
    });

    // Ensure starting on Page 1
    if (pageNow() !== 1) {
      inv.setItem(15, undefined);
      await t.waitUntil(() => pageNow() === 1, { timeout: 60, message: `reset ${player.name} to stash page 1` });
      await t.wait(6);
    }

    // Populate Page 1 storage slots (12 distinct items) + hotbar items
    for (let i = 0; i < 12; i++) {
      inv.setItem(STORAGE_SLOTS[i], new ItemStack(STASH_ITEMS[i], (i % 16) + 1));
    }
    inv.setItem(0, new ItemStack("minecraft:diamond_sword", 1));
    inv.setItem(1, new ItemStack("minecraft:golden_apple", 8));

    // Switch to Page 2 via Next button (slot 17)
    inv.setItem(17, undefined);
    await t.waitUntil(() => pageNow() === 2, { timeout: 60, message: `switched ${player.name} to stash page 2` });
    await t.wait(8);

    // Populate Page 2 storage slots (12 more distinct items)
    for (let i = 0; i < 12; i++) {
      inv.setItem(STORAGE_SLOTS[i], new ItemStack(STASH_ITEMS[i + 12], (i % 16) + 1));
    }
    const page2Sample = inv.getItem(STORAGE_SLOTS[0])?.typeId ?? null;

    // Switch back to Page 1 via Prev button (slot 15)
    inv.setItem(15, undefined);
    await t.waitUntil(() => pageNow() === 1 && inv.getItem(STORAGE_SLOTS[0])?.typeId === STASH_ITEMS[0], {
      timeout: 60,
      message: `returned ${player.name} to stash page 1 with restored items`,
    });
    await t.wait(8);
    return {
      ok: true,
      activePage: pageNow(),
      page1FirstItem: inv.getItem(STORAGE_SLOTS[0])?.typeId ?? null,
      page2FirstItem: page2Sample,
      page1Count: 12,
      page2Count: 12,
    };
  }

  applyLongSidebarAndHud(sim);
  await seedPlayerStashPages(sim);

  // Teleport / action helper for any player (real client or simulated)
  async function movePlayerToStep(player, step) {
    const lookEast = { x: 0, y: -90 }; // Facing +X toward NPC at cx + 20.5
    if (step === "map_bridge") {
      player.teleport({ x: cx + 0.5, y: baseY + 2, z: cz - 9 + 0.5 }, { rotation: { x: 25, y: 0 } });
      return { view: "bridge_over_river" };
    } else if (step === "map_roof") {
      player.teleport({ x: cx + 7.5, y: baseY + 1, z: cz + 9.5 }, { rotation: { x: 0, y: 180 } });
      return { view: "under_thin_roof" };
    } else if (step === "map_spire") {
      player.teleport({ x: cx + 15.5, y: baseY + 11, z: cz + 9.5 }, { rotation: { x: 35, y: 135 } });
      return { view: "high_spire" };
    } else if (step === "map_cave") {
      player.teleport({ x: cx - 10 + 0.5, y: baseY - 4, z: cz + 10 + 0.5 }, { rotation: { x: 0, y: 0 } });
      return { view: "sealed_cave" };
    } else if (/^npc_(5|10|15|20|25)m$/.test(step)) {
      const dist = Number(step.match(/^npc_(\d+)m$/)[1]);
      player.teleport({ x: cx + 20.5 - dist, y: baseY + 1, z: cz + 0.5 }, { rotation: lookEast });
      return { view: `npc_${dist}m`, distanceMeters: dist };
    } else if (step === "npc_probe_always") {
      return t.cmd(player, "/realm:npc_name_probe always");
    } else if (step === "npc_probe_looked_at") {
      return t.cmd(player, "/realm:npc_name_probe looked_at");
    } else if (step === "sidebar_long") {
      applyLongSidebarAndHud(player);
      return { sidebar: "qa_sidebar_long" };
    } else if (step === "stash_open") {
      const inv = player.getComponent("minecraft:inventory")?.container;
      if (!inv) throw new Error(`inventory unavailable for ${player.name}`);
      inv.setItem(16, undefined);
      return { action: "open_inv_menu" };
    } else if (step === "stash_next") {
      const inv = player.getComponent("minecraft:inventory")?.container;
      if (!inv) throw new Error(`inventory unavailable for ${player.name}`);
      inv.setItem(17, undefined);
      await t.wait(8);
      return { activeButton: inv.getItem(16)?.nameTag ?? null, firstSlot: inv.getItem(STORAGE_SLOTS[0])?.typeId ?? null };
    } else if (step === "stash_prev") {
      const inv = player.getComponent("minecraft:inventory")?.container;
      if (!inv) throw new Error(`inventory unavailable for ${player.name}`);
      inv.setItem(15, undefined);
      await t.wait(8);
      return { activeButton: inv.getItem(16)?.nameTag ?? null, firstSlot: inv.getItem(STORAGE_SLOTS[0])?.typeId ?? null };
    } else if (step === "stash_fill") {
      return await seedPlayerStashPages(player);
    } else {
      // default spawn overview pad (10m from NPC, unobstructed sightline along z = cz)
      player.teleport({ x: cx + 10.5, y: baseY + 1, z: cz + 0.5 }, { rotation: lookEast });
      return { view: "npc_10m_default" };
    }
  }

  await movePlayerToStep(sim, "npc_10m");

  const fixtureManifest = {
    fixtureReady: true,
    visualGate: "unverified",
    center: { x: cx, y: baseY + 1, z: cz },
    npc: { name: "Archivist Mara", location: npcPos, distanceStopsMeters: stops },
    commands: [
      "scriptevent qa:cmd map_bridge",
      "scriptevent qa:cmd map_roof",
      "scriptevent qa:cmd map_spire",
      "scriptevent qa:cmd map_cave",
      "scriptevent qa:cmd sidebar_long",
      "scriptevent qa:cmd stash_fill",
      "scriptevent qa:cmd stash_next",
      "scriptevent qa:cmd stash_prev",
      "scriptevent qa:cmd stash_open",
      "scriptevent qa:cmd npc_5m",
      "scriptevent qa:cmd npc_10m",
      "scriptevent qa:cmd npc_15m",
      "scriptevent qa:cmd npc_20m",
      "scriptevent qa:cmd npc_25m",
      "scriptevent qa:cmd npc_probe_always",
      "scriptevent qa:cmd npc_probe_looked_at",
    ],
  };
  t.log(`QA_FIXTURE_READY ${JSON.stringify(fixtureManifest)}`);
  t.check(true, "server-side QA fixture preconditions verified (visual gate remains unverified until real client capture)");

  // Listen for `/scriptevent qa:cmd <step> [playerName]` and auto-stage joining real players.
  const stagedPlayers = new Set([sim.name]);
  system.afterEvents.scriptEventReceive.subscribe((ev) => {
    if (ev.id !== "qa:cmd") return;
    const [step = "overview", targetName = ""] = ev.message.trim().split(/\s+/);
    const all = world.getAllPlayers();
    const realPlayers = all.filter((p) => p.name !== "QAFixtureBot");
    const targets = targetName
      ? all.filter((p) => p.name.toLowerCase() === targetName.toLowerCase())
      : (realPlayers.length ? realPlayers : [sim]);
    system.run(async () => {
      for (const p of targets) {
        try {
          const detail = await movePlayerToStep(p, step);
          t.log(`QA_STEP_APPLIED ${JSON.stringify({ step, player: p.name, location: p.location, detail: detail ?? null })}`);
        } catch (err) {
          t.log(`QA_STEP_ERROR ${JSON.stringify({ step, player: p?.name ?? "unknown", error: String(err?.message ?? err) })}`);
        }
      }
    });
  });

  world.afterEvents.playerSpawn.subscribe((ev) => {
    const p = ev.player;
    if (!p || p.name === "QAFixtureBot" || stagedPlayers.has(p.name)) return;
    stagedPlayers.add(p.name);
    system.runTimeout(async () => {
      try {
        dim.runCommand(`gamemode creative "${p.name}"`);
        await movePlayerToStep(p, "npc_10m");
        applyLongSidebarAndHud(p);
        const stashPages = await seedPlayerStashPages(p);
        p.sendMessage("§a[QA Fixture] Staged at NPC 10m stop with clear sightline, river/bridge/roof, long sidebar, and 2 populated stash pages.");
        t.log(`QA_CLIENT_JOINED ${JSON.stringify({ player: p.name, location: p.location, stashPages })}`);
      } catch (err) {
        stagedPlayers.delete(p.name);
        t.log(`QA_CLIENT_JOIN_ERROR ${JSON.stringify({ player: p?.name ?? "unknown", error: String(err?.message ?? err) })}`);
      }
    }, 20);
  });
}
