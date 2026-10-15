#!/usr/bin/env node
// ccusage report builder — runs the ccusage CLI in JSON mode and renders one markdown report.
// No dependencies. Node 18+. Usage: node report.mjs [--since YYYY-MM-DD] [--until YYYY-MM-DD]
//   [--timezone TZ] [--project NAME] [--days 14] [--top 10] [--offline] [--save DIR] [--no-blocks]
import { execFile, execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

// ---------- args ----------
const argv = process.argv.slice(2);
const opt = { days: 14, top: 10, offline: false, blocks: true };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i], next = () => argv[++i];
  if (a === '--since') opt.since = next();
  else if (a === '--until') opt.until = next();
  else if (a === '--timezone' || a === '-z') opt.timezone = next();
  else if (a === '--project' || a === '-p') opt.project = next();
  else if (a === '--days') opt.days = Math.max(1, parseInt(next(), 10) || 14);
  else if (a === '--top') opt.top = Math.max(1, parseInt(next(), 10) || 10);
  else if (a === '--offline') opt.offline = true;
  else if (a === '--save') opt.save = next();
  else if (a === '--no-blocks') opt.blocks = false;
  else if (a === '--runner') opt.runner = next(); // e.g. "bunx ccusage" or "npx -y ccusage@latest"
  else if (a === '-h' || a === '--help') { console.log('See SKILL.md for options.'); process.exit(0); }
}
const ymd = s => s.replace(/-/g, '');

// ---------- runner detection ----------
const isWin = process.platform === 'win32';
function works(cmd, args) {
  try { execFileSync(cmd, args, { stdio: 'ignore', timeout: 60000, shell: isWin }); return true; } catch { return false; }
}
function pickRunner() {
  if (opt.runner) { const [c, ...r] = opt.runner.split(/\s+/); return [c, r]; }
  if (works('ccusage', ['--version'])) return ['ccusage', []];
  if (works('bunx', ['--version'])) return ['bunx', ['ccusage']];
  return ['npx', ['-y', 'ccusage@latest']];
}
const [CMD, PRE] = pickRunner();

function run(args) {
  const common = ['--json'];
  if (opt.offline) common.push('--offline');
  if (opt.timezone) common.push('--timezone', opt.timezone);
  return new Promise(res => {
    execFile(CMD, [...PRE, ...args, ...common], { maxBuffer: 256 * 1024 * 1024, timeout: 300000, shell: isWin, env: { ...process.env, NO_COLOR: '1' } },
      (err, stdout, stderr) => {
        if (err && !stdout) return res({ error: (stderr || err.message || '').toString().trim().split('\n').slice(-3).join(' ') });
        try { res({ data: JSON.parse(stdout) }); }
        catch { res({ error: 'Could not parse JSON: ' + stdout.slice(0, 200) }); }
      });
  });
}
const range = [];
if (opt.since) range.push('--since', ymd(opt.since));
if (opt.until) range.push('--until', ymd(opt.until));
const proj = opt.project ? ['--project', opt.project] : [];

const jobs = {
  daily: ['claude', 'daily', '--breakdown', ...range, ...proj],
  weekly: ['claude', 'weekly', ...range, ...proj],
  monthly: ['claude', 'monthly', '--breakdown', ...range, ...proj],
  sessions: ['claude', 'session', '--breakdown', ...range, ...proj],
  projects: ['claude', 'daily', '--instances', ...range, ...proj],
  allAgents: ['daily', ...range],
};
if (opt.blocks) jobs.blocks = ['blocks', ...range];

const keys = Object.keys(jobs);
const results = Object.fromEntries((await Promise.all(keys.map(k => run(jobs[k])))).map((r, i) => [keys[i], r]));

if (opt.save) {
  mkdirSync(opt.save, { recursive: true });
  for (const k of keys) if (results[k].data) writeFileSync(join(opt.save, `${k}.json`), JSON.stringify(results[k].data, null, 2));
}

// ---------- helpers ----------
const n = v => (typeof v === 'number' && isFinite(v) ? v : 0);
const pick = (o, ...ks) => { for (const k of ks) if (o && o[k] != null) return o[k]; return undefined; };
const arr = (d, ...ks) => { for (const k of ks) if (Array.isArray(d?.[k])) return d[k]; return []; };
const usd = v => { v = n(v); return v >= 1000 ? '$' + v.toLocaleString('en-US', { maximumFractionDigits: 0 }) : '$' + v.toFixed(2); };
const tok = v => { v = n(v); const a = Math.abs(v); return a >= 1e9 ? (v / 1e9).toFixed(2) + 'B' : a >= 1e6 ? (v / 1e6).toFixed(2) + 'M' : a >= 1e3 ? (v / 1e3).toFixed(1) + 'K' : String(Math.round(v)); };
const pct = (a, b) => (n(b) ? (n(a) / n(b) * 100).toFixed(1) + '%' : '—');
const bar = (v, max, w = 14) => { const f = max > 0 ? Math.round(n(v) / max * w) : 0; return '█'.repeat(f) + '░'.repeat(w - f); };
const shortModel = m => String(m || '?').replace(/^claude-/, '').replace(/-\d{8}$/, '');
// Claude Code encodes the project path by replacing '/' (and '.', '_') with '-'. Rebuild it by walking the real filesystem.
const projCache = {};
function decodeProject(enc) {
  if (projCache[enc]) return projCache[enc];
  const parts = String(enc).replace(/^-/, '').split('-');
  const isDir = p => { try { return statSync(p).isDirectory(); } catch { return false; } };
  function walk(base, i) {
    if (i >= parts.length) return base;
    for (let j = parts.length; j > i; j--) {
      const seg = parts.slice(i, j);
      for (const name of new Set([seg.join('-'), seg.join('.'), seg.join('_'), seg.join(' ')])) {
        const p = join(base, name);
        if (isDir(p)) { const r = walk(p, j); if (r) return r; }
      }
    }
    return null;
  }
  let found = enc.startsWith('-') ? walk('/', 0) : null;
  const home = homedir();
  const pretty = found ? (found.startsWith(home) ? '~' + found.slice(home.length) : found)
    : String(enc).replace(/^-(Users|home)-[^-]+-/, '~/').replace(/^-/, '/');
  return (projCache[enc] = pretty);
}
const prettyProject = p => decodeProject(String(p || '?'));
const row = cells => '| ' + cells.join(' | ') + ' |';
const table = (head, rows, align) => [row(head), row(head.map((_, i) => (align?.[i] === 'l' ? ':--' : '--:'))), ...rows.map(row)].join('\n');
const tokensOf = r => ({
  input: n(pick(r, 'inputTokens')) || n(r?.tokenCounts?.inputTokens),
  output: n(pick(r, 'outputTokens')) || n(r?.tokenCounts?.outputTokens),
  cacheCreate: n(pick(r, 'cacheCreationTokens')) || n(r?.tokenCounts?.cacheCreationInputTokens),
  cacheRead: n(pick(r, 'cacheReadTokens')) || n(r?.tokenCounts?.cacheReadInputTokens),
});
const totalTok = r => n(pick(r, 'totalTokens')) || Object.values(tokensOf(r)).reduce((a, b) => a + b, 0);
const cost = r => n(pick(r, 'totalCost', 'costUSD', 'cost'));
const fmtTime = iso => { if (!iso) return '—'; const d = new Date(iso); return isNaN(d) ? iso : d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: opt.timezone }); };

// ---------- data ----------
const daily = arr(results.daily.data, 'daily');
const weekly = arr(results.weekly.data, 'weekly');
const monthly = arr(results.monthly.data, 'monthly');
const sessions = arr(results.sessions.data, 'sessions', 'session');
const blocks = arr(results.blocks?.data, 'blocks').filter(b => !b.isGap);
const projectsRaw = results.projects.data?.projects || {};
const totals = results.daily.data?.totals || {};

const out = [];
const errs = keys.filter(k => results[k].error).map(k => `- \`${jobs[k].join(' ')}\`: ${results[k].error}`);

if (!daily.length) {
  out.push('# Claude Code usage', '', '**No Claude Code usage data found.**', '',
    'ccusage reads the local logs Claude Code writes to `~/.claude/projects/` (or `~/.config/claude/projects/`). Check that Claude Code has been used on this machine, or point `CLAUDE_CONFIG_DIR` at the right folder.');
  if (errs.length) out.push('', '### Command errors', ...errs);
  console.log(out.join('\n'));
  process.exit(0);
}

const T = { ...tokensOf(totals), total: totalTok(totals), cost: cost(totals) };
const firstDay = daily[0].date || daily[0].period, lastDay = daily[daily.length - 1].date || daily[daily.length - 1].period;
const spanDays = Math.max(1, Math.round((new Date(lastDay) - new Date(firstDay)) / 864e5) + 1);
const promptSide = T.input + T.cacheCreate + T.cacheRead;

// ---------- header ----------
const scope = [opt.since || opt.until ? `${opt.since || 'start'} → ${opt.until || 'today'}` : 'all time', opt.project ? `project \`${opt.project}\`` : null, opt.timezone ? `tz ${opt.timezone}` : null].filter(Boolean).join(' · ');
out.push(`# Claude Code usage report`, '', `_${scope} · ${firstDay} → ${lastDay} · generated ${new Date().toLocaleString('en-US', { timeZone: opt.timezone })} · costs are API-list-price equivalents, not your subscription bill_`, '');

// ---------- headline ----------
const maxDay = daily.reduce((a, b) => (cost(b) > cost(a) ? b : a));
out.push('## Headline', '', table(['Metric', 'Value'], [
  ['Total cost (API-equivalent)', `**${usd(T.cost)}**`],
  ['Total tokens', tok(T.total)],
  ['Active days', `${daily.length} of ${spanDays} (${pct(daily.length, spanDays)})`],
  ['Avg cost per active day', usd(T.cost / daily.length)],
  ['Sessions', String(sessions.length || '—')],
  ['Avg cost per session', sessions.length ? usd(T.cost / sessions.length) : '—'],
  ['Most expensive day', `${maxDay.date || maxDay.period} — ${usd(cost(maxDay))}`],
  ['Cache hit ratio (cache reads ÷ all prompt tokens)', pct(T.cacheRead, promptSide)],
  ['Effective $ per 1M tokens', usd(T.total ? T.cost / T.total * 1e6 : 0)],
], ['l', 'r']), '');

// ---------- active block ----------
const active = blocks.find(b => b.isActive);
if (active) {
  const br = active.burnRate || {}, pj = active.projection || {};
  const start = new Date(active.startTime), end = new Date(active.endTime), now = new Date();
  const elapsed = Math.max(0, (now - start) / 6e4), left = Math.max(0, (end - now) / 6e4);
  out.push('## Current 5-hour block', '', table(['Metric', 'Value'], [
    ['Window', `${fmtTime(active.startTime)} → ${fmtTime(active.endTime)}`],
    ['Elapsed / remaining', `${Math.floor(elapsed / 60)}h ${Math.round(elapsed % 60)}m / ${Math.floor(left / 60)}h ${Math.round(left % 60)}m`],
    ['Tokens so far', tok(totalTok(active))],
    ['Cost so far', usd(cost(active))],
    // ccusage's own rate spans first-to-last entry, so a block with seconds of activity projects nonsense.
    // Average over the time since the block started instead once it is at least 5 minutes old.
    ...(elapsed >= 5 ? (() => {
      const tpm = totalTok(active) / elapsed, cph = cost(active) / elapsed * 60;
      return [
        ['Burn rate (avg since block start)', `${tok(tpm)} tok/min · ${usd(cph)}/h`],
        ['Projected at block end', `${tok(totalTok(active) + tpm * left)} tokens · ${usd(cost(active) + cph * left / 60)}`],
      ];
    })() : [
      ['Burn rate', br.tokensPerMinute != null ? `${tok(br.tokensPerMinute)} tok/min · ${usd(br.costPerHour)}/h` : '—'],
      ['Projected at block end', '— (block under 5 min old)'],
    ]),
    ['Models', (active.models || []).map(shortModel).join(', ') || '—'],
  ], ['l', 'r']), '');
}

// ---------- token mix ----------
out.push('## Token mix', '', table(['Type', 'Tokens', 'Share', ''], [
  ['Input', tok(T.input), pct(T.input, T.total), bar(T.input, T.total)],
  ['Output', tok(T.output), pct(T.output, T.total), bar(T.output, T.total)],
  ['Cache create', tok(T.cacheCreate), pct(T.cacheCreate, T.total), bar(T.cacheCreate, T.total)],
  ['Cache read', tok(T.cacheRead), pct(T.cacheRead, T.total), bar(T.cacheRead, T.total)],
  ['**Total**', `**${tok(T.total)}**`, '100%', ''],
], ['l', 'r', 'r', 'l']), '');

// ---------- models ----------
const models = {};
for (const m of monthly.length ? monthly : daily) for (const b of m.modelBreakdowns || []) {
  const k = shortModel(b.modelName); const t = tokensOf(b);
  const e = models[k] || (models[k] = { cost: 0, input: 0, output: 0, cacheCreate: 0, cacheRead: 0 });
  e.cost += n(b.cost); for (const f of ['input', 'output', 'cacheCreate', 'cacheRead']) e[f] += t[f];
}
const mRows = Object.entries(models).sort((a, b) => b[1].cost - a[1].cost);
if (mRows.length) {
  const mx = mRows[0][1].cost;
  out.push('## By model', '', table(['Model', 'Cost', '% cost', 'Input', 'Output', 'Cache create', 'Cache read', ''],
    mRows.map(([k, e]) => [k, usd(e.cost), pct(e.cost, T.cost), tok(e.input), tok(e.output), tok(e.cacheCreate), tok(e.cacheRead), bar(e.cost, mx, 10)]),
    ['l', 'r', 'r', 'r', 'r', 'r', 'r', 'l']), '');
}

// ---------- monthly ----------
if (monthly.length) {
  const mx = Math.max(...monthly.map(cost));
  out.push('## By month', '', table(['Month', 'Cost', 'Δ vs prev', 'Tokens', 'Active days', ''],
    monthly.map((m, i) => {
      const prev = i ? cost(monthly[i - 1]) : null;
      const days = daily.filter(d => String(d.date || d.period).startsWith(m.month)).length;
      return [m.month, usd(cost(m)), prev ? (cost(m) >= prev ? '+' : '') + ((cost(m) / prev - 1) * 100).toFixed(0) + '%' : '—', tok(totalTok(m)), String(days), bar(cost(m), mx, 12)];
    }), ['l', 'r', 'r', 'r', 'r', 'l']), '');
}

// ---------- weekly ----------
if (weekly.length) {
  const w = weekly.slice(-8); const mx = Math.max(...w.map(cost));
  out.push(`## By week (last ${w.length})`, '', table(['Week of', 'Cost', 'Tokens', 'Models', ''],
    w.map(x => [x.week || x.period, usd(cost(x)), tok(totalTok(x)), (x.modelsUsed || []).map(shortModel).join(', '), bar(cost(x), mx, 12)]),
    ['l', 'r', 'r', 'l', 'l']), '');
}

// ---------- daily ----------
const d = daily.slice(-opt.days); const dmx = Math.max(...d.map(cost));
out.push(`## By day (last ${d.length} active days)`, '', table(['Date', 'Cost', 'Input', 'Output', 'Cache read', 'Total', 'Models', ''],
  d.map(x => [x.date || x.period, usd(cost(x)), tok(tokensOf(x).input), tok(tokensOf(x).output), tok(tokensOf(x).cacheRead), tok(totalTok(x)), (x.modelsUsed || []).map(shortModel).join(', '), bar(cost(x), dmx, 12)]),
  ['l', 'r', 'r', 'r', 'r', 'r', 'l', 'l']), '');

// ---------- projects ----------
const pRows = Object.entries(projectsRaw).map(([p, rows]) => ({
  p, cost: rows.reduce((a, r) => a + cost(r), 0), tokens: rows.reduce((a, r) => a + totalTok(r), 0), days: rows.length,
  last: rows.map(r => r.date || r.period).sort().pop(),
})).sort((a, b) => b.cost - a.cost);
if (pRows.length) {
  const mx = pRows[0].cost;
  out.push('## By project', '', table(['Project', 'Cost', '% cost', 'Tokens', 'Active days', 'Last used', ''],
    pRows.map(r => [`\`${prettyProject(r.p)}\``, usd(r.cost), pct(r.cost, T.cost), tok(r.tokens), String(r.days), r.last || '—', bar(r.cost, mx, 10)]),
    ['l', 'r', 'r', 'r', 'r', 'l', 'l']), '');
}

// ---------- sessions ----------
if (sessions.length) {
  const top = [...sessions].sort((a, b) => cost(b) - cost(a)).slice(0, opt.top);
  out.push(`## Top ${top.length} sessions by cost`, '', table(['#', 'Project', 'Last activity', 'Duration', 'Cost', 'Tokens', 'Models'],
    top.map((s, i) => {
      const a = new Date(s.firstActivity), b = new Date(s.lastActivity || s.lastActivityTime);
      const mins = isNaN(a) || isNaN(b) ? null : (b - a) / 6e4;
      return [String(i + 1), `\`${prettyProject(s.projectPath || s.project)}\``, fmtTime(s.lastActivity), mins == null ? '—' : `${Math.floor(mins / 60)}h ${Math.round(mins % 60)}m`, usd(cost(s)), tok(totalTok(s)), (s.modelsUsed || []).map(shortModel).join(', ')];
    }), ['r', 'l', 'l', 'r', 'r', 'r', 'l']), '');
}

// ---------- blocks ----------
if (blocks.length) {
  const recent = blocks.slice(-8); const peak = blocks.reduce((a, b) => (cost(b) > cost(a) ? b : a));
  const avg = blocks.reduce((a, b) => a + cost(b), 0) / blocks.length;
  out.push('## 5-hour blocks', '', `${blocks.length} blocks · average ${usd(avg)} · peak ${usd(cost(peak))} (${fmtTime(peak.startTime)})`, '',
    table(['Start', 'Status', 'Entries', 'Tokens', 'Cost', ''], recent.map(b => [fmtTime(b.startTime), b.isActive ? '**active**' : 'done', String(n(b.entries)), tok(totalTok(b)), usd(cost(b)), bar(cost(b), cost(peak), 12)]),
      ['l', 'l', 'r', 'r', 'r', 'l']), '');
}

// ---------- other agents ----------
const agents = new Set(arr(results.allAgents.data, 'daily').flatMap(r => r.metadata?.agents || []));
agents.delete('claude');
if (agents.size) out.push('## Other coding agents detected', '', `ccusage also found usage for: ${[...agents].join(', ')}. Run \`ccusage daily --by-agent\` to compare them.`, '');

if (errs.length) out.push('## Sections that failed', '', ...errs, '');
console.log(out.join('\n'));
