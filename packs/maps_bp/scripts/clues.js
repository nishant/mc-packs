// Treasure Maps & Riddles: the words. Every clue is built here from large pools, so the same sentence
// rarely comes twice. Far clues (how to get near the next spot) come in four kinds and a hunt never
// uses a kind twice; near riddles (what the spot looks like) come from the real terrain there.

/** @typedef {{ x: number, z: number }} XZ */

/** @template T @param {T[]} list @returns {T} */
const any = (list) => list[Math.floor(Math.random() * list.length)];
/** @param {number} lo @param {number} hi */
const randInt = (lo, hi) => lo + Math.floor(Math.random() * (Math.max(lo, hi) - lo + 1));
/** @param {string} s */
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
/** 12345 -> "12,345", -1247 -> "-1,247". @param {number} n */
const num = (n) => (n < 0 ? "-" : "") + String(Math.abs(Math.round(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

const ONES = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
const TEENS = ["ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

/** 0-99 in words. @param {number} n */
function small(n) {
  if (n < 10) return ONES[n];
  if (n < 20) return TEENS[n - 10];
  return TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : "");
}

/** 650 -> "six hundred and fifty", 1200 -> "twelve hundred" or "one thousand two hundred". @param {number} n */
export function words(n) {
  n = Math.max(0, Math.round(n));
  if (n === 0) return "zero";
  if (n < 100) return small(n);
  if (n >= 1100 && n < 2000) return `${small(Math.floor(n / 100))} hundred${n % 100 ? ` and ${small(n % 100)}` : ""}`;
  const th = Math.floor(n / 1000);
  const h = Math.floor((n % 1000) / 100);
  const r = n % 100;
  const parts = [];
  if (th) parts.push(`${small(th)} thousand`);
  if (h) parts.push(`${ONES[h]} hundred`);
  let out = parts.join(" ");
  if (r) out += `${out ? " and " : ""}${small(r)}`;
  return out;
}

// ---- Directions ----
// North is -z, east is +x. Each cardinal has several riddle names.
const NAMES = {
  N: ["the North Star", "the Pole Star", "the cold north wind", "the frozen north"],
  E: ["the rising sun", "the dawn", "the morning sun", "where the sun comes up"],
  S: ["the warm south wind", "the warm south", "the noonday wind"],
  W: ["the setting sun", "the dusk", "the evening sun", "where the sun goes down"],
};
/** How to walk along one axis, for step clues. */
const AXIS = {
  N: ["toward the North Star", "north", "toward the cold north wind", "toward the Pole Star"],
  E: ["toward the rising sun", "east", "the way your shadow points at sunset", "toward the dawn"],
  S: ["with the North Star at your back", "south", "toward the warm south wind", "with the cold wind behind you"],
  W: ["toward the setting sun", "west", "the way your shadow points at sunrise", "toward the dusk"],
};
const SIXTEEN = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];

/** 0 = N, 1 = NNE ... 15 = NNW, from `a` toward `b`. @param {XZ} a @param {XZ} b */
export function sixteenth(a, b) {
  const deg = (Math.atan2(b.x - a.x, -(b.z - a.z)) * 180) / Math.PI;
  return Math.round((((deg % 360) + 360) % 360) / 22.5) % 16;
}

/** A riddle for one of the 16 compass points, e.g. "toward the dawn, bearing a little toward the Pole Star". @param {number} i */
export function direction(i) {
  const name = SIXTEEN[i % 16];
  /** @param {string} c */
  const n = (c) => any(/** @type {Record<string, string[]>} */ (NAMES)[c]);
  if (name.length === 1) return any([`toward ${n(name)}`, `straight toward ${n(name)}`, `with ${n(name)} before you`]);
  if (name.length === 2) {
    const [a, b] = any([name.split(""), name.split("").reverse()]);
    return any([`between ${n(a)} and ${n(b)}`, `halfway between ${n(a)} and ${n(b)}`, `toward where ${n(a)} meets ${n(b)}`]);
  }
  const main = name[0];
  const lean = name[2] === main ? name[1] : name[2];
  return any([`toward ${n(main)}, bearing a little toward ${n(lean)}`, `mostly toward ${n(main)}, a touch toward ${n(lean)}`, `toward ${n(main)}, leaning toward ${n(lean)}`]);
}

/** "about six hundred and fifty paces", "some 650 strides"... rounded to `step`. @param {number} d @param {number} [step] */
export function distance(d, step = 50) {
  const n = Math.max(step, Math.round(d / step) * step);
  const unit = any(["paces", "paces", "paces", "strides", "steps"]);
  return any([`about ${words(n)} ${unit}`, `some ${words(n)} ${unit}`, `roughly ${words(n)} ${unit}`, `about ${num(n)} ${unit}`, `near enough ${words(n)} ${unit}`]);
}

// ---- Far clues ----

/** Where a leg starts, as the clue names it. @param {string} from e.g. "the cairn" or "" for where the map was bought */
function origin(from) {
  if (!from) return any(["From where this map changed hands", "From where you got this map", "From the cartographer's spot", "Starting where you bought this map"]);
  if (from.startsWith("where")) return any([`From ${from}`, `Starting from ${from}`]);
  return any([`From ${from}`, `With your back to ${from}`, `Leaving ${from}`, `Starting at ${from}`]);
}

/** How a clue ends, for a leg to another marker or to the treasure. @param {boolean} final */
function ending(final) {
  return final
    ? any(["There the treasure sleeps.", "X marks the spot, somewhere there.", "Dig where the map grows hot.", "The gold waits underground there.", "There the old pirate hid his chest.", "That is where the digging starts."])
    : any(["There the next sign waits.", "Look about you there for a marker.", "Another traveler left a mark there.", "The next riddle is hidden there.", "Something there will tell you more.", "There, look for what does not belong."]);
}

/** @param {number} v an axis value, as part of a sum puzzle */
function axisPuzzle(v) {
  const forms = [];
  const k = randInt(2, 30) * 10 + randInt(1, 9);
  forms.push(() => `lies halfway between ${num(v - k)} and ${num(v + k)}`);
  const base = Math.round(v / 100) * 100 + any([-200, -100, 100, 200]);
  const rest = v - base;
  forms.push(() => `is ${num(base)} ${rest < 0 ? "minus" : "plus"} ${num(Math.abs(rest))}`);
  const hundreds = Math.floor(v / 100) * 100;
  const tail = String(Math.abs(v) % 100).padStart(2, "0");
  if (tail !== "00") forms.push(() => `ends in ${tail} and lies between ${num(hundreds)} and ${num(hundreds + 100)}`);
  if (v > 40) {
    const m = randInt(3, 9);
    forms.push(() => `is ${words(m)} times ${num(Math.floor(v / m))}, plus ${num(v % m)}`);
  }
  return any(forms)();
}

/**
 * The four kinds of far clue. Each takes where the leg starts (`a`), where it ends (`b`), the start's name
 * and whether the leg ends at the treasure, and returns the clue.
 * @type {Record<string, (a: XZ, b: XZ, from: string, final: boolean) => string>}
 */
export const FAR = {
  // A heading and a distance.
  bearing(a, b, from, final) {
    const dir = direction(sixteenth(a, b));
    const dist = distance(Math.hypot(b.x - a.x, b.z - a.z));
    const body = any([
      `${origin(from)}, walk ${dir} for ${dist}.`,
      `${origin(from)}, go ${dir}: ${dist}.`,
      `${cap(dist)} from ${from || "where you got this map"}, ${dir}.`,
      `${origin(from)}, set your face ${dir} and count ${dist}.`,
      `The spot lies ${dist} from ${from || "where you got this map"}, ${dir}.`,
    ]);
    return `${body} ${ending(final)}`;
  },
  // Two or three straight walks along the compass.
  steps(a, b, from, final) {
    const dx = Math.round((b.x - a.x) / 10) * 10;
    const dz = Math.round((b.z - a.z) / 10) * 10;
    /** @type {[string, number][]} */
    const both = [
      [dx >= 0 ? "E" : "W", Math.abs(dx)],
      [dz >= 0 ? "S" : "N", Math.abs(dz)],
    ];
    let legs = both.filter((l) => l[1] >= 10);
    if (Math.random() < 0.5) legs.reverse();
    if (legs.length === 2 && legs[0][1] >= 100 && Math.random() < 0.35) {
      // A dogleg: part of the first walk, the second, then the rest of the first.
      const part = Math.round((legs[0][1] * (0.3 + Math.random() * 0.4)) / 10) * 10;
      legs = [[legs[0][0], part], legs[1], [legs[0][0], legs[0][1] - part]];
    }
    if (!legs.length) legs = [["N", 10]];
    const said = legs.map(([dir, n], i) => {
      const how = any(/** @type {Record<string, string[]>} */ (AXIS)[dir]);
      const count = Math.random() < 0.5 ? words(n) : num(n);
      return i === 0 ? `walk ${count} paces ${how}` : any([`then ${count} ${how}`, `then turn and go ${count} paces ${how}`, `then ${count} more ${how}`]);
    });
    return `${origin(from)}, ${said.join(", ")}. ${ending(final)}`;
  },
  // Coordinates hidden in sums.
  coords(_a, b, _from, final) {
    const x = Math.round(b.x);
    const z = Math.round(b.z);
    const intro = any(["Read your coordinates.", "Mind your coordinates.", "The surveyor wrote it in numbers.", "Count it out on your coordinates."]);
    return `${intro} The spot's X ${axisPuzzle(x)}, and its Z ${axisPuzzle(z)}. ${ending(final)}`;
  },
  // Walk one way until one coordinate reads right, then the other.
  mixed(a, b, from, final) {
    const x = Math.round(b.x);
    const z = Math.round(b.z);
    const ew = any(/** @type {Record<string, string[]>} */ (AXIS)[b.x >= a.x ? "E" : "W"]);
    const ns = any(/** @type {Record<string, string[]>} */ (AXIS)[b.z >= a.z ? "S" : "N"]);
    const first = Math.random() < 0.5;
    const one = first ? `go ${ew} until your X reads ${num(x)}` : `go ${ns} until your Z reads ${num(z)}`;
    const two = first ? `turn ${ns} until your Z reads ${num(z)}` : `turn ${ew} until your X reads ${num(x)}`;
    return `${origin(from)}, ${one}; then ${two}. ${ending(final)}`;
  },
};
export const FAR_KINDS = Object.keys(FAR);

// ---- Markers: what stands at the end of a leg ----

/** @typedef {{ id: string, name: string, blocks: (wool: string) => { dx: number, dy: number, dz: number, type: string }[] }} MarkerStyle */

/** @type {MarkerStyle[]} */
export const MARKERS = [
  {
    id: "cairn",
    name: "the cairn",
    blocks: () => [
      { dx: 0, dy: 1, dz: 0, type: "minecraft:mossy_cobblestone" },
      { dx: 1, dy: 1, dz: 0, type: "minecraft:cobblestone" },
      { dx: -1, dy: 1, dz: 0, type: "minecraft:cobblestone" },
      { dx: 0, dy: 1, dz: 1, type: "minecraft:mossy_cobblestone" },
      { dx: 0, dy: 1, dz: -1, type: "minecraft:cobblestone" },
      { dx: 0, dy: 2, dz: 0, type: "minecraft:cobblestone" },
      { dx: 0, dy: 3, dz: 0, type: "minecraft:mossy_cobblestone" },
      { dx: 0, dy: 4, dz: 0, type: "minecraft:lantern" },
    ],
  },
  {
    id: "flag",
    name: "the flag",
    blocks: (wool) => [
      { dx: 0, dy: 1, dz: 0, type: "minecraft:oak_fence" },
      { dx: 0, dy: 2, dz: 0, type: "minecraft:oak_fence" },
      { dx: 0, dy: 3, dz: 0, type: "minecraft:oak_fence" },
      { dx: 0, dy: 4, dz: 0, type: "minecraft:oak_fence" },
      { dx: 1, dy: 4, dz: 0, type: wool },
      { dx: 1, dy: 3, dz: 0, type: wool },
    ],
  },
  {
    id: "stone",
    name: "the standing stone",
    blocks: () => [
      { dx: 0, dy: 1, dz: 0, type: "minecraft:mossy_stone_bricks" },
      { dx: 0, dy: 2, dz: 0, type: "minecraft:stone_bricks" },
      { dx: 0, dy: 3, dz: 0, type: "minecraft:mossy_stone_bricks" },
      { dx: 0, dy: 4, dz: 0, type: "minecraft:chiseled_stone_bricks" },
    ],
  },
];
export const WOOLS = ["red", "yellow", "orange", "white", "lime", "light_blue", "magenta"].map((c) => `minecraft:${c}_wool`);

/** What a marker looks like, the first time a riddle mentions it. @param {string} id @param {string} wool */
export function markerLooks(id, wool) {
  const color = wool.replace("minecraft:", "").replace("_wool", "").replace("_", " ");
  if (id === "cairn") return any(["a cairn of mossy stones with a lantern on top", "a pile of mossy stones, lantern-topped", "an old cairn, a lantern glowing on its top"]);
  const a = /^[aeiou]/.test(color) ? "an" : "a";
  if (id === "flag") return any([`${a} ${color} flag on a wooden pole`, `a pole flying ${a} ${color} flag`, `${a} ${color} banner on a tall post`]);
  return any(["a standing stone with a carved top", "a tall carved stone", "a lone standing stone of old bricks"]);
}

// ---- Near riddles: the real terrain at the spot ----

const TREES = {
  oak: ["oak wood", "oak trees"],
  birch: ["birch wood", "white birches"],
  spruce: ["spruce forest", "dark spruces", "pine wood"],
  jungle: ["jungle", "jungle trees"],
  acacia: ["acacia trees", "flat-topped acacias"],
  dark_oak: ["dark oak wood", "dark oaks"],
  cherry: ["cherry grove", "pink cherry trees"],
  mangrove: ["mangroves", "mangrove swamp"],
  azalea: ["azalea bushes", "flowering azaleas"],
  pale_oak: ["pale oak wood", "pale gray oaks"],
};

/**
 * One near riddle. `what` says what is there ("the cairn stands" / "the treasure lies buried"),
 * `kind` the feature and `info` its details (tree species, height).
 * @param {string} kind @param {string} what @param {{ tree?: string, y?: number, big?: boolean }} info
 */
export function nearRiddle(kind, what, info) {
  const y = info.y ?? 64;
  /** @type {Record<string, string[]>} */
  const pools = {
    water: info.big
      ? [`${what} on the shore of the wide water`, `${what} where the land meets the lake`, `${what} at the water's edge, looking out over the lake`]
      : [`${what} beside a little pond`, `${what} by the water's edge`, `${what} where the land meets the water`],
    trees: [`${what} at the edge of the ${info.tree}`, `${what} just outside the ${info.tree}`, `${what} where the ${info.tree} begins`],
    peak: [`${what} on the highest ground around, at about height ${y}`, `${what} at the top of the hill`, `${what} where the land climbs highest`, `${what} on the summit, about height ${y}`],
    hollow: [`${what} down in the hollow`, `${what} in the low ground, at about height ${y}`, `${what} where the land dips lowest`],
    sand: [`${what} on the sand`, `${what} where the sand begins`, `${what} on the warm sand`],
    snow: [`${what} in the snow`, `${what} where the snow lies`, `${what} on the snowy ground`],
    flowers: [`${what} among the flowers`, `${what} in a patch of wildflowers`, `${what} where the flowers grow`],
    flat: [`${what} where the land is flattest`, `${what} on the level ground`, `${what} on a flat stretch of land, about height ${y}`],
  };
  const pool = pools[kind] ?? pools.flat;
  return cap(any(pool)) + ".";
}

/** Names a leaf block's tree, or undefined. @param {string} id */
export function treeOf(id) {
  const m = /^minecraft:(\w+?)_leaves$/.exec(id) ?? /^minecraft:(azalea)_leaves_flowered$/.exec(id);
  if (!m) return undefined;
  const pool = /** @type {Record<string, string[]>} */ (TREES)[m[1]];
  return pool ? any(pool) : undefined;
}

/** What the map says while far from the spot, in bands (no step-by-step warmth). @param {number} d @param {number} radius */
export function coarse(d, radius) {
  if (d > radius * 8) return "§bThe map is cold.";
  if (d > radius * 3) return "§3The map is cool.";
  return "§eThe map is faintly warm.";
}
