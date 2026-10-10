export const CONFIG = {
  /** Finished projects are announced in chat to everyone, and a town's level-up with a title on everyone's screen. */
  announce: true,

  /** Fireworks rise over a project when it is built. */
  fireworks: true,

  /** Players can also deliver with `/realm:town` while inside a town, without visiting its mayor. */
  deliverWithCommand: false,

  /** Items with a custom name are never delivered, so a named tool or a pet's name tag stays with its owner. */
  keepNamedItems: true,

  /**
   * How close (blocks) to a town's center its mayor answers, `/realm:town_spot` and `/realm:town_remove`
   * work, and `deliverWithCommand` delivers. New towns must be at least half this far from other towns.
   */
  townRadius: 96,

  /** The NPC role whose townsfolk offer "Town projects" (Townsfolk pack). The nearest town within `townRadius` of the player answers. */
  npcRole: "mayor",

  /** Guild reputation for each contributor when a project is finished (Guilds pack): growers for wood and crops, miners for stone and metal. */
  repPerProject: 10,

  /** Crowns for the top contributors of each finished project: first, second, third... */
  topCrowns: [60, 35, 20],

  /** What a town is called at each level, 1 to 5 ("Riverside is now a Town (level 3)"). */
  levelNames: ["Settlement", "Village", "Town", "City", "Capital"],

  /**
   * The projects. Each has a unique `id` (progress is saved by it, and `/realm:town_spot` names it: use
   * lowercase letters, digits and `_`), a `name`, the town `level` it belongs to (finishing every
   * project of a level raises the town to the next; level 5 is the top, so projects are for levels 1
   * to 4), the items it `needs` (item id: amount), what gets `build`t (`well`, `lamps`, `stall`,
   * `bell_tower`, `dock`, `garden` or `notice_board`), and optionally a `structure`: the id of a
   * structure an operator saved (with a structure block or `/structure save`) to place instead.
   * @type {{ id: string, name: string, level: number, needs: Record<string, number>,
   *   build: "well" | "lamps" | "stall" | "bell_tower" | "dock" | "garden" | "notice_board", structure?: string }[]}
   */
  projects: [
    { id: "well", name: "Well", level: 1, needs: { "minecraft:cobblestone": 64, "minecraft:oak_log": 8, "minecraft:bucket": 1 }, build: "well" },
    { id: "notice_board", name: "Notice Board", level: 1, needs: { "minecraft:oak_planks": 32, "minecraft:oak_sign": 3 }, build: "notice_board" },
    { id: "lamps", name: "Lamp Posts", level: 2, needs: { "minecraft:oak_fence": 16, "minecraft:lantern": 4 }, build: "lamps" },
    { id: "garden", name: "Garden Plot", level: 2, needs: { "minecraft:oak_log": 16, "minecraft:wheat_seeds": 16, "minecraft:bone_meal": 16 }, build: "garden" },
    { id: "stall", name: "Market Stall", level: 3, needs: { "minecraft:oak_planks": 32, "minecraft:white_wool": 8, "minecraft:red_wool": 8, "minecraft:barrel": 2 }, build: "stall" },
    { id: "dock", name: "Dock", level: 3, needs: { "minecraft:oak_planks": 64, "minecraft:oak_log": 32, "minecraft:iron_ingot": 16 }, build: "dock" },
    { id: "bell_tower", name: "Bell Tower", level: 4, needs: { "minecraft:stone_bricks": 128, "minecraft:gold_ingot": 16, "minecraft:iron_ingot": 16 }, build: "bell_tower" },
  ],
};
