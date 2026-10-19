// Harness self-test: a ticking-area circle radius must be 1 to 4, and a rejected tickingarea command is reported with the
// game's own message at once. Before, an invalid radius (6 in the first O74 fixture) was swallowed by loadArea and showed
// up only as "chunk did not load" after the whole timeout. Needs no pack under test; the harness alone answers.
// Expected on the old harness: the radius 6 and the rejected-add checks FAIL (the timeouts run out); on the new one all pass.
//   node tools/test-bds/run.mjs --quiet --flat --only help_bp --scenario tools/test-bds/examples/harness-tickingarea-inputs.js --timeout 240
export default async function (t) {
  const attempt = async (fn) => {
    const start = t.tick;
    try {
      await fn();
      return { ok: true, ticks: t.tick - start, error: "" };
    } catch (e) {
      return { ok: false, ticks: t.tick - start, error: String(e?.message ?? e) };
    }
  };

  // Radius 6 (and 0, 5, 2.5): refused before any command runs.
  for (const radius of [6, 5, 0, 2.5]) {
    const r = await attempt(() => t.loadArea(40, 40, { radius, timeout: 100 }));
    t.check(!r.ok && /whole number from 1 to 4/.test(r.error), `loadArea radius ${radius} is rejected with the radius rule (${r.error})`);
    t.check(r.ticks <= 2, `and at once, not after the chunk wait (${r.ticks} ticks)`);
  }
  const raw = await attempt(async () => { t.server("/tickingarea add circle 40 0 40 6 raw_area true"); });
  t.check(!raw.ok && /whole number from 1 to 4/.test(raw.error) && raw.ticks <= 2, `a raw /tickingarea add circle with radius 6 is rejected at once (${raw.error})`);
  t.check(!t.server("/tickingarea remove raw_area").ok, "and the rejected command never reached the game (no such area)");

  // Legal radii 1 and 4 load.
  for (const radius of [1, 4]) {
    const r = await attempt(() => t.loadArea(40, 40, { radius, timeout: 200 }));
    t.check(r.ok, `loadArea radius ${radius} loads (${r.error})`);
  }
  t.server("/tickingarea remove_all");

  // The game itself refuses an eleventh ticking area: the command's message comes back, not a timeout.
  for (let k = 0; k < 10; k++) t.server(`/tickingarea add circle ${300 + k * 40} 0 300 1 fill_${k} true`);
  const full = await attempt(() => t.loadArea(-4000, -4000, { radius: 1, timeout: 200 }));
  t.check(!full.ok && /tickingarea add circle -4000 0 -4000 1 failed:/.test(full.error), `a rejected add is reported with its own error (${full.error})`);
  t.check(full.ticks <= 5, `and does not wait out the 200-tick chunk timeout (${full.ticks} ticks)`);
  t.check(!/did not load/.test(full.error), "the error is not the generic chunk timeout");
  t.server("/tickingarea remove_all");
}
