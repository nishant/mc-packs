export const CONFIG = {
  /** Everyone may run /realm:farm_add and /realm:farm_remove (otherwise operators only). Takes effect when the world loads. */
  everyoneCanAdd: false,

  /** Radius in chunks when /realm:farm_add is given none (1–4). */
  defaultRadius: 2,

  /** Most farms at once. Bedrock allows 10 ticking areas per world, shared with Expeditions (one per dungeon slot), Siege, Death Point, Town Houses and Easy Building; leave room for them. */
  maxAreas: 5,
};
