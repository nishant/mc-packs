// npm run check: runs the steps in tools/check-steps.txt. The parallel steps ("& " lines: tsc, check-stories and the
// unit tests, together about 80% of the time when run one after another) all start at once; meanwhile the ordered
// steps run one at a time in file order, with their output shown as they go, and the first failing one stops that
// lane. Then the parallel steps' output is printed and one combined report lists every step that failed, the first
// failure (in file order) first, and its output's last lines. The exit code is the first failure's (0 when all pass).
//
//   node tools/check.mjs
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { delimiter, join, resolve } from "node:path";

const root = join(import.meta.dirname, "..");
export const STEPS_FILE = join(root, "tools", "check-steps.txt");

/**
 * The steps of a steps file: one command per line, "& " in front for a parallel step, # comments and blank lines skipped.
 * @param {string} text
 * @returns {{ cmd: string, parallel: boolean, index: number }[]}
 */
export function parseSteps(text) {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map((l, index) => (l.startsWith("& ") ? { cmd: l.slice(2).trim(), parallel: true, index } : { cmd: l, parallel: false, index }));
}

/** @param {number} ms */
const secs = (ms) => `${(ms / 1000).toFixed(1)} s`;

/**
 * Runs one command in a shell; its output is collected and, when `echo` is given, also written as it arrives.
 * @param {string} cmd @param {{ cwd: string, env: NodeJS.ProcessEnv, echo?: (s: string) => void }} o
 * @returns {Promise<{ code: number, out: string, ms: number }>}
 */
function runOne(cmd, { cwd, env, echo }) {
  const t0 = Date.now();
  return new Promise((done) => {
    const child = spawn(cmd, { cwd, env, shell: true, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    const take = (/** @type {Buffer} */ b) => {
      const s = b.toString();
      out += s;
      echo?.(s);
    };
    child.stdout.on("data", take);
    child.stderr.on("data", take);
    child.on("error", (e) => {
      out += String(e);
    });
    child.on("close", (code, signal) => done({ code: code ?? (signal ? 1 : 0), out, ms: Date.now() - t0 }));
  });
}

/**
 * Runs the steps: every parallel one at once, the ordered ones one at a time (the first failure stops them).
 * @param {{ cmd: string, parallel: boolean, index: number }[]} steps
 * @param {{ cwd?: string, env?: NodeJS.ProcessEnv, write?: (s: string) => void }} [o]
 * @returns {Promise<{ code: number, results: { cmd: string, parallel: boolean, index: number, code: number | undefined, out: string, ms: number }[], ms: number }>}
 *   code undefined: not run, because an earlier ordered step failed.
 */
export async function runSteps(steps, { cwd = root, env = process.env, write = (s) => process.stdout.write(s) } = {}) {
  const t0 = Date.now();
  /** @type {{ cmd: string, parallel: boolean, index: number, code: number | undefined, out: string, ms: number }[]} */
  const results = steps.map((s) => ({ ...s, code: undefined, out: "", ms: 0 }));
  const parallel = results.filter((r) => r.parallel);
  const running = parallel.map((r) => runOne(r.cmd, { cwd, env }).then((x) => Object.assign(r, x)));
  if (parallel.length) write(`check: started in parallel: ${parallel.map((r) => r.cmd).join(", ")}\n`);
  for (const r of results.filter((x) => !x.parallel)) {
    write(`> ${r.cmd}\n`);
    Object.assign(r, await runOne(r.cmd, { cwd, env, echo: write }));
    if (r.code !== 0) break;
  }
  await Promise.all(running);
  for (const r of parallel) {
    write(`\n> ${r.cmd} (parallel, ${secs(r.ms)}${r.code ? `, FAILED with exit code ${r.code}` : ""})\n`);
    const text = r.out.trimEnd();
    if (text) write(`${r.code ? text : text.split("\n").slice(-3).join("\n")}\n`);
  }
  const failed = results.filter((r) => r.code !== undefined && r.code !== 0).sort((a, b) => a.index - b.index);
  const skipped = results.filter((r) => r.code === undefined).length;
  const ms = Date.now() - t0;
  const slow = [...results].filter((r) => r.code !== undefined).sort((a, b) => b.ms - a.ms).slice(0, 4);
  write(`\ncheck: ${results.length - skipped} of ${results.length} steps run in ${secs(ms)}; slowest: ${slow.map((r) => `${r.cmd} ${secs(r.ms)}`).join(", ")}\n`);
  if (!failed.length) {
    write("check: every step passed.\n");
    return { code: 0, results, ms };
  }
  write(`check: ${failed.length} step${failed.length === 1 ? "" : "s"} FAILED${skipped ? ` (${skipped} later ordered step${skipped === 1 ? "" : "s"} not run)` : ""}, first failure first:\n`);
  for (const r of failed) {
    write(`\n--- FAILED: ${r.cmd} (exit code ${r.code}) ---\n`);
    write(`${r.out.trimEnd().split("\n").slice(-25).join("\n")}\n`);
  }
  write(`\ncheck: FAILED: ${failed.map((r) => r.cmd).join("; ")}\n`);
  return { code: failed[0].code ?? 1, results, ms };
}

// ---------- CLI ----------
if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) {
  // `tsc` and the other local binaries resolve as they do under npm run, also when this is started with node directly.
  const env = { ...process.env };
  const pathKey = Object.keys(env).find((k) => k.toLowerCase() === "path") ?? "PATH";
  env[pathKey] = [join(root, "node_modules", ".bin"), env[pathKey]].filter(Boolean).join(delimiter);
  const { code } = await runSteps(parseSteps(readFileSync(STEPS_FILE, "utf8")), { env });
  process.exit(code);
}
