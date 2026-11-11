// Offline stand-in for @minecraft/server, just enough for maps_bp/scripts/cleanup.js sweep() tests.
const props = new Map();
export const world = {
  getDynamicProperty: (k) => props.get(k),
  setDynamicProperty: (k, v) => { if (v === undefined) props.delete(k); else props.set(k, v); },
  getDimension: () => ({ getBlock: () => undefined }),
};
export const system = { runInterval() {} };
export const BlockPermutation = { resolve: () => ({}) };
