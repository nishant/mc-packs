// Offline exact-order/work-count proof only; not native CPU or visual acceptance.
// Capture of the old function precedes the Task18 product edit, after candidate04 was frozen.
// Candidate04 SPEED tree: 35917990a6916649d2446613d1698e87de0c1b6b5630c6663dd328e9ec41a347.
// MAP_ORDER_PARTITION_RED=1 runs the immutable legacy path against the fresh-work bound.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import vm from "node:vm";
import { orderLatticeWork } from "../packs/map_bp/scripts/terrain-work.js";

// Literal immutable oracle, NEVER extracted from the current production function at runtime.
const LEGACY_SOURCE = String.raw`export function orderLatticeWork(picks,now,previewEnabled){
 /** @type {LatticePick[]} */ const visible=[];
 /** @type {LatticePick[]} */ const holes=[];
 /** @type {LatticePick[]} */ const previews=[];
 /** @type {LatticePick[]} */ const stale=[];
 for(const p of picks){if(p.stale)stale.push(p);else if(p.resolution===4){if(previewEnabled)previews.push(p);}else if(p.visible!==false)visible.push(p);else holes.push(p);}
 const cmp=(/** @type {LatticePick} */ a,/** @type {LatticePick} */ b)=>{const aa=now-a.queuedAt>=80,bb=now-b.queuedAt>=80;return Number(bb)-Number(aa)||(aa&&bb?a.queuedAt-b.queuedAt:0)||a.d-b.d||a.key-b.key;};
 visible.sort(cmp);holes.sort(cmp);previews.sort(cmp);stale.sort(cmp);
 /** @type {LatticePick[]} */ const out=[];let v=0,h=0,p=0,s=0,round=0;
 if(holes.length&&now-holes[0].queuedAt>=80)out.push(holes[h++]);
 for(let i=0;i<8&&v<visible.length;i++)out.push(visible[v++]);
 while(v<visible.length||h<holes.length||p<previews.length){
  for(let i=0;i<3&&v<visible.length;i++)out.push(visible[v++]);
  if(h<holes.length)out.push(holes[h++]);
  if(p<previews.length)out.push(previews[p++]);
  if(++round%4===0&&s<stale.length)out.push(stale[s++]);
 }
 while(s<stale.length)out.push(stale[s++]);return out;
}`;
const legacyOrder = Object.freeze(vm.runInNewContext(LEGACY_SOURCE.replace(/^export /, "") + ";orderLatticeWork"));
const workBoundOrder = process.env.MAP_ORDER_PARTITION_RED ? legacyOrder : orderLatticeWork;
function sameSequence(actual, expected, message = "") {
  assert.equal(actual.length, expected.length, message + " length");
  for (let i = 0; i < expected.length; i++) assert.equal(actual[i], expected[i], message + " reference at " + i);
}
function random(seed) {
  return () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0);
}
function keyFor(resolution, n) { return (resolution === 4 ? 2 ** 51 : resolution === 1 ? 2 ** 52 : 0) + n; }
function pick(id, values = {}) {
  return Object.freeze({ id, wx: -id, wz: id - 100, resolution: 2, key: id, d: id, stale: false, queuedAt: 1000, visible: true, ...values });
}

test("oracle is an immutable literal of the pre-partition comparator, not a live production import", () => {
  assert.notEqual(legacyOrder, orderLatticeWork);
  assert.equal(crypto.createHash("sha256").update(LEGACY_SOURCE).digest("hex"), "d2aaf7251313f1e2ba8db57f19ba74c159a467201e49143834cbfb8037212fa3");
  assert.ok(Object.isFrozen(legacyOrder));
  assert.ok(LEGACY_SOURCE.includes("Number(bb)-Number(aa)"));
  assert.ok(LEGACY_SOURCE.includes("visible.sort(cmp);holes.sort(cmp);previews.sort(cmp);stale.sort(cmp)"));
});

test("600 seeded mixed populations of1..2000 preserve exact legacy reference order with either preview setting", () => {
  const next = random(0x6af03118);
  const ages = [-900, -1, 0, 79, 80, 81, 160, 2000];
  for (let round = 0; round < 600; round++) {
    const count = round === 0 ? 1 : round === 1 ? 2000 : 1 + next() % 2000;
    const now = (next() % 8193) - 4096;
    const picks = [];
    for (let i = 0; i < count; i++) {
      if (i && i % 11 === 0) { picks.push(Object.freeze({ ...picks[i - 1], id: i })); continue; }
      const resolution = [1, 2, 4][next() % 3];
      picks.push(pick(i, { resolution, key: keyFor(resolution, next() % 65536), d: next() % 257,
        stale: next() % 4 === 0, queuedAt: now - ages[next() % ages.length], visible: [undefined, true, false][next() % 3] }));
    }
    Object.freeze(picks);
    for (const preview of [false, true]) sameSequence(orderLatticeWork(picks, now, preview), legacyOrder(picks, now, preview), `round${round}/${count}/preview${preview}`);
  }
});

test("empty and singleton classes retain identity without mutation", () => {
  for (const preview of [false, true]) {
    sameSequence(orderLatticeWork(Object.freeze([]), 1000, preview), []);
    for (const stale of [false, true]) for (const resolution of [1, 2, 4]) for (const visible of [undefined, true, false]) for (const age of [-1, 79, 80, 81]) {
      const picks = Object.freeze([pick(1, { stale, resolution, visible, queuedAt: 1000 - age })]);
      sameSequence(orderLatticeWork(picks, 1000, preview), legacyOrder(picks, 1000, preview));
    }
  }
});

test("aged-hole promotion, exact80 boundary, visible8 burst and stale interleave remain unchanged", () => {
  const now = 1000;
  const picks = [
    ...Array.from({ length: 16 }, (_, i) => pick(i + 1, { d: 50 - i, queuedAt: now - (i % 2 ? 79 : 80) })),
    pick(30, { visible: false, d: 1, queuedAt: now - 79 }),
    pick(31, { visible: false, d: 10, queuedAt: now - 81 }),
    pick(32, { visible: false, d: 0, queuedAt: now - 80 }),
    ...Array.from({ length: 7 }, (_, i) => pick(40 + i, { resolution: 4, key: keyFor(4, 40 + i), queuedAt: now - (i % 2 ? 0 : 80) })),
    ...Array.from({ length: 8 }, (_, i) => pick(60 + i, { stale: true, queuedAt: now - (i % 2 ? 0 : 80) })),
  ];
  Object.freeze(picks);
  const result = orderLatticeWork(picks, now, true);
  sameSequence(result, legacyOrder(picks, now, true));
  assert.equal(result[0].id, 31, "oldest aged hole still gets the initial promotion");
  assert.ok(result.slice(1, 9).every(p => p.visible !== false && p.resolution !== 4 && !p.stale), "then exactly the existing eight visible entries");
});

test("stable ties keep input order; fresh queue ages are not a hidden tie breaker", () => {
  const picks = Object.freeze([
    pick(1, { key: 7, d: 9, queuedAt: 1000 }),
    pick(2, { key: 7, d: 9, queuedAt: 1001 }),
    pick(3, { key: 7, d: 9, queuedAt: 1000 }),
    pick(4, { key: 8, d: 8, queuedAt: 920 }),
    pick(5, { key: 8, d: 8, queuedAt: 920 }),
  ]);
  const result = orderLatticeWork(picks, 1000, true);
  sameSequence(result, legacyOrder(picks, 1000, true));
  assert.deepEqual(result.map(p => p.id), [4, 5, 1, 2, 3]);
});

test("disabled nonstale preview is discarded without reading its age, while stale preview remains", () => {
  const discarded = Object.freeze({ resolution: 4, stale: false, get queuedAt() { throw new Error("discarded preview age read"); } });
  const retained = pick(1, { resolution: 4, key: keyFor(4, 1), stale: true, queuedAt: 900 });
  const picks = Object.freeze([discarded, retained]);
  sameSequence(orderLatticeWork(picks, 1000, false), legacyOrder(picks, 1000, false));
  assert.equal(orderLatticeWork(picks, 1000, false)[0], retained);
});

test("fresh2000 mixed-class picks read queuedAt exactly once each rather than in every comparison", t => {
  function fixture() {
    const next = random(0x786b0421);
    let reads = 0;
    const picks = Object.freeze(Array.from({ length: 2000 }, (_, id) => {
      const kind = id % 4, resolution = kind === 2 ? 4 : 2, d = next() % 1048576;
      return Object.freeze({ id, resolution, key: keyFor(resolution, id + 1), d,
        stale: kind === 3, visible: kind !== 1, get queuedAt() { reads++; return 1000 + id % 7; } });
    }));
    return { picks, reads: () => reads };
  }
  const old = fixture(), current = fixture();
  const expected = legacyOrder(old.picks, 1000, true);
  const actual = workBoundOrder(current.picks, 1000, true);
  assert.deepEqual(Array.from(actual, p => p.id), Array.from(expected, p => p.id));
  assert.equal(current.reads(), current.picks.length, "one classification read per included fresh Pick, including holes/stale");
  assert.ok(old.reads() > old.picks.length * 4, "the immutable legacy path exposes comparison-amplified getter work");
  t.diagnostic(JSON.stringify({ evidence: "getter operations only; NOT native CPU", picks: 2000, legacyReads: old.reads(), partitionReads: current.reads() }));
});
