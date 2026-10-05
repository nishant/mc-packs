export const CONFIG = {
  /** "everywhere": creeper blasts never break blocks. "zones": only inside the zones operators add with /realm:guard_add. */
  mode: "everywhere",

  /** Exploding entity types whose blasts break no blocks. Add "minecraft:fireball" (ghasts) or "minecraft:wither_skull" if wanted. */
  sources: ["minecraft:creeper"],

  /** Zone radius in blocks when /realm:guard_add is given none (8–256). */
  defaultRadius: 64,
};
