// run.mjs --native-profile: what BDS's own script profiler (`script profiler start` / `stop`, which writes
// ./profiles/<name>.cpuprofile in the server folder, Chrome's .cpuprofile format) says. Its samples see native calls
// (`System::currentTick`, `Dimension::getEntities`) as frames of their own, under the script file that made them, so a
// pack's share includes the native work its calls do, which lib/profile.js cannot see. Sampled, not exact.

/**
 * Self samples grouped by pack (the `<pack>_bp/` folder of each frame's url) and the functions with the most self
 * samples, native frames (`Class::method`) included.
 * @param {any} profile a parsed .cpuprofile @param {number} [top]
 */
export function summarizeCpuProfile(profile, top = 12) {
  const nodes = Array.isArray(profile?.nodes) ? profile.nodes : [];
  const total = nodes.reduce((a, n) => a + (Number(n.hitCount) || 0), 0);
  const ms = Number.isFinite(profile?.endTime) && Number.isFinite(profile?.startTime) ? (profile.endTime - profile.startTime) / 1000 : null;
  /** @type {Map<string, number>} */
  const byPack = new Map();
  /** @type {Map<string, { hits: number, native: boolean }>} */
  const byFn = new Map();
  let native = 0, idle = 0;
  for (const n of nodes) {
    const hits = Number(n.hitCount) || 0;
    if (!hits) continue;
    const f = n.callFrame ?? {};
    const name = String(f.functionName || "(anonymous)");
    if (name === "(idle)" || name === "(program)" || name === "(root)") { idle += hits; continue; }
    const m = /(?:^|[/\\])([A-Za-z0-9_]+_bp)[/\\]/.exec(String(f.url ?? ""));
    const pack = m ? m[1] : "(other)";
    byPack.set(pack, (byPack.get(pack) ?? 0) + hits);
    const isNative = name.includes("::");
    if (isNative) native += hits;
    const key = `${name} @ ${String(f.url ?? "?")}${isNative ? "" : `:${(Number(f.lineNumber) || 0) + 1}`}`;
    const e = byFn.get(key) ?? { hits: 0, native: isNative };
    e.hits += hits;
    byFn.set(key, e);
  }
  const busy = total - idle;
  return {
    samples: total, busy, native, durationMs: ms,
    packs: [...byPack].sort((a, b) => b[1] - a[1]).map(([pack, hits]) => ({ pack, hits, share: busy ? hits / busy : 0 })),
    functions: [...byFn].sort((a, b) => b[1].hits - a[1].hits).slice(0, top).map(([key, e]) => ({ key, hits: e.hits, native: e.native, share: busy ? e.hits / busy : 0 })),
  };
}

/** Summary lines for run.mjs's output. @param {ReturnType<typeof summarizeCpuProfile>} s @param {string} file */
export function cpuProfileLines(s, file) {
  const pct = (/** @type {number} */ x) => `${(100 * x).toFixed(1)}%`;
  const L = [`  cpuprofile ${file}: ${s.samples} samples over ${s.durationMs === null ? "?" : `${(s.durationMs / 1000).toFixed(1)} s`}, ${s.busy} in script (${s.busy ? pct(s.native / s.busy) : "-"} of them in native calls)`];
  L.push(`  cpuprofile by pack: ${s.packs.slice(0, 15).map((p) => `${p.pack} ${pct(p.share)}`).join(", ") || "-"}`);
  for (const f of s.functions) L.push(`  cpuprofile top: ${pct(f.share)} ${f.native ? "[native] " : ""}${f.key.slice(0, 160)}`);
  return L;
}
