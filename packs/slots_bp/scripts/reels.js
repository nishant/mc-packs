// The reels and the pay table, as plain math with no game imports, so the exact return to player can
// be computed (and checked in Node) from the same code the machine uses.

/**
 * @typedef {object} SlotSymbol
 * @property {string} id
 * @property {string} name how it reads on the reel (short, plain ASCII)
 * @property {string} color a § color code for the reel
 * @property {number} weight stops on each reel's strip; a symbol's chance per reel is weight / total
 */
/**
 * @typedef {object} PayLine
 * @property {string} symbol a symbol id
 * @property {number} count how many of the 3 reels must show it (anywhere): 1, 2 or 3
 * @property {number} pay what the spin returns, as a multiple of the stake (the stake is not given back on top)
 * @property {boolean} [jackpot] fireworks and a chat announcement
 */

/** @param {SlotSymbol[]} symbols */
const totalWeight = (symbols) => symbols.reduce((sum, s) => sum + Math.max(0, s.weight), 0);

/**
 * One reel's stop, drawn by weight with `random` (0 <= x < 1). Each reel is drawn on its own, so what
 * the reels show is exactly what was drawn: no weighting toward a near miss.
 * @param {SlotSymbol[]} symbols @param {() => number} random
 */
export function drawReel(symbols, random) {
  let left = random() * totalWeight(symbols);
  for (const s of symbols) {
    left -= Math.max(0, s.weight);
    if (left < 0) return s.id;
  }
  return symbols[symbols.length - 1].id;
}

/** @param {SlotSymbol[]} symbols @param {() => number} random @returns {string[]} */
export const spinReels = (symbols, random) => [drawReel(symbols, random), drawReel(symbols, random), drawReel(symbols, random)];

/**
 * The first pay line (in table order) the reels match, or undefined. Put bigger wins first.
 * @param {PayLine[]} table @param {string[]} reels
 */
export function lineFor(table, reels) {
  for (const line of table) {
    if (reels.filter((r) => r === line.symbol).length >= line.count) return line;
  }
  return undefined;
}

/**
 * The exact return to player (expected payout per 1 staked) and hit rate of a table, over all
 * outcomes of three independent reels.
 * @param {SlotSymbol[]} symbols @param {PayLine[]} table
 * @returns {{ rtp: number, hitRate: number, lines: { line: PayLine, chance: number, share: number }[] }}
 */
export function analyze(symbols, table) {
  const W = totalWeight(symbols);
  const chance = new Map(table.map((l) => [l, 0]));
  let rtp = 0;
  let hitRate = 0;
  for (const a of symbols) {
    for (const b of symbols) {
      for (const c of symbols) {
        const p = (Math.max(0, a.weight) * Math.max(0, b.weight) * Math.max(0, c.weight)) / W ** 3;
        if (p === 0) continue;
        const line = lineFor(table, [a.id, b.id, c.id]);
        if (!line) continue;
        chance.set(line, (chance.get(line) ?? 0) + p);
        rtp += p * line.pay;
        if (line.pay > 0) hitRate += p;
      }
    }
  }
  return { rtp, hitRate, lines: table.map((line) => ({ line, chance: chance.get(line) ?? 0, share: (chance.get(line) ?? 0) * line.pay })) };
}

/** What a win pays in whole coins: the stake times the line's multiple, rounded down. @param {PayLine | undefined} line @param {number} stake */
export const payFor = (line, stake) => (line ? Math.floor(stake * line.pay) : 0);
