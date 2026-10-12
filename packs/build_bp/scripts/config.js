export const CONFIG = {
  /** Easy Building for the whole realm. Disabled: /realm:build only says so and placing blocks builds nothing extra. */
  enabled: true,

  /** Only operators can use the building tools. */
  operatorsOnly: false,

  /** Most blocks one build may place in survival (copies and repeats included). */
  maxBlocks: 4096,

  /** Most blocks one build may place in creative. */
  maxBlocksCreative: 32768,

  /** Largest width, height, depth or length the menus offer, in blocks (radius: half of it). */
  maxSize: 64,

  /** Blocks placed per tick: bigger builds are spread over several ticks so the realm doesn't stall. */
  blocksPerTick: 400,

  /** In survival, every block a build places is taken from your inventory (and given back by undo). */
  requireItems: true,

  /** Short of blocks in survival: build as much as you have (true) or nothing (false). */
  partialBuilds: true,

  /** Survival players may pick "Replace everything" (it destroys blocks without drops). Creative players always can. */
  survivalReplaceAll: false,

  /** Builds may reach into other players' land claims (Land Claims). Off: a build that would is refused. */
  inOthersClaims: false,

  /** Inside a safe zone made with Safe Zones (/realm:zones), only operators can build with the tools. */
  safeZonesOperatorsOnly: true,

  /** Steps each player can undo (and redo): builds, pastes, cuts and destroy mode. */
  undoSteps: 5,

  /** How many of the newest undo (and redo) steps are also saved on the player, so they survive a restart (0 to 10). */
  undoSaveSteps: 10,

  /** Most blocks a step may change and still be saved for after a restart; bigger steps are kept in memory only. */
  undoSaveBlocks: 2000,

  /** How far away the block you look at may be for /realm:build_here and the outline preview, in blocks. */
  reach: 16,

  /** Seconds the outline shows before "Build here now" asks to confirm. */
  previewSeconds: 3,

  /** Saved copies each player can keep besides "Last copy" (0 to 19). Each one is a structure saved in the world. */
  clipboardSlots: 19,

  /** Largest region one copy or cut may cover, air included. Each side is at most 64 blocks across (384 high). */
  copyMaxBlocks: 32768,

  /** Players can use destroy mode (breaking a block with a pickaxe, axe or shovel breaks the whole shape). */
  destroyMode: true,

  /** "Air and soft blocks" also replaces these (`*` is a wildcard). Air is always replaced. */
  softBlocks: [
    "minecraft:water",
    "minecraft:flowing_water",
    "minecraft:lava",
    "minecraft:flowing_lava",
    "minecraft:short_grass",
    "minecraft:tall_grass",
    "minecraft:short_dry_grass",
    "minecraft:tall_dry_grass",
    "minecraft:fern",
    "minecraft:large_fern",
    "minecraft:deadbush",
    "minecraft:bush",
    "minecraft:snow_layer",
    "minecraft:vine",
    "minecraft:glow_lichen",
    "minecraft:seagrass",
    "minecraft:fire",
    "minecraft:soul_fire",
    "minecraft:leaf_litter",
    "minecraft:pink_petals",
    "minecraft:wildflowers",
    "minecraft:dandelion",
    "minecraft:poppy",
    "minecraft:*_tulip",
    "minecraft:cornflower",
    "minecraft:oxeye_daisy",
    "minecraft:azure_bluet",
    "minecraft:allium",
    "minecraft:blue_orchid",
    "minecraft:lily_of_the_valley",
    "minecraft:nether_sprouts",
    "minecraft:crimson_roots",
    "minecraft:warped_roots",
    "minecraft:structure_void",
  ],

  /** Never replaced by a build, whatever the replace mode: containers, signs, portals and other blocks that hold something or can't be got back. */
  protectedBlocks: [
    "minecraft:bedrock",
    "minecraft:barrier",
    "minecraft:allow",
    "minecraft:deny",
    "minecraft:border_block",
    "minecraft:*command_block",
    "minecraft:structure_block",
    "minecraft:jigsaw",
    "minecraft:portal",
    "minecraft:end_portal",
    "minecraft:end_portal_frame",
    "minecraft:end_gateway",
    "minecraft:reinforced_deepslate",
    "minecraft:mob_spawner",
    "minecraft:trial_spawner",
    "minecraft:vault",
    "minecraft:*chest",
    "minecraft:barrel",
    "minecraft:*shulker_box",
    "minecraft:hopper",
    "minecraft:dispenser",
    "minecraft:dropper",
    "minecraft:crafter",
    "minecraft:*furnace",
    "minecraft:*smoker",
    "minecraft:brewing_stand",
    "minecraft:lectern",
    "minecraft:chiseled_bookshelf",
    "minecraft:*_shelf",
    "minecraft:decorated_pot",
    "minecraft:jukebox",
    "minecraft:beacon",
    "minecraft:conduit",
    "minecraft:lodestone",
    "minecraft:respawn_anchor",
    "minecraft:bed",
    "minecraft:*frame",
    "minecraft:flower_pot",
    "minecraft:*campfire",
    "minecraft:beehive",
    "minecraft:bee_nest",
    "minecraft:suspicious_*",
    "minecraft:creaking_heart",
    "minecraft:*_sign",
    "minecraft:*_banner",
    "minecraft:*_skull",
    "minecraft:*_head",
    "minecraft:cauldron",
    "minecraft:sculk_*",
    "minecraft:calibrated_sculk_sensor",
  ],

  /** Blocks the tools never place, even typed in by an operator. */
  forbiddenBlocks: [
    "minecraft:bedrock",
    "minecraft:barrier",
    "minecraft:allow",
    "minecraft:deny",
    "minecraft:border_block",
    "minecraft:*command_block",
    "minecraft:structure_block",
    "minecraft:jigsaw",
    "minecraft:light_block*",
    "minecraft:portal",
    "minecraft:end_portal",
    "minecraft:end_gateway",
    "minecraft:mob_spawner",
    "minecraft:trial_spawner",
    "minecraft:vault",
    "minecraft:*shulker_box",
    "minecraft:tnt",
    "minecraft:*bed",
    "minecraft:*_door",
    "minecraft:fire",
    "minecraft:soul_fire",
  ],
};
