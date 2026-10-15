---
name: ccusage
description: Run the ccusage CLI against the user's local Claude Code logs and turn it into one complete, well-formatted usage report (cost, tokens, token mix, models, months, weeks, days, projects, top sessions, 5-hour blocks, live burn rate). Use this whenever the user types /ccusage, or asks anything about their Claude Code usage, spend, cost, tokens, burn rate, the current 5-hour block or limit window, which model or project used the most, session costs, or cache hit rate — even if they don't name ccusage.
---

# ccusage — full Claude Code usage report

ccusage (https://github.com/ccusage/ccusage) reads the JSONL logs Claude Code writes to `~/.claude/projects/` (or `~/.config/claude/projects/`) and prices them at API list rates. This skill runs it several times in JSON mode and merges everything into a single markdown report, so the user sees every detail at once instead of one table at a time.

It reads only the logs on the machine it runs on. **In a Claude Code cloud session** (claude.ai/code) the container is fresh, so `~/.claude/projects/` holds just this session and its subagents: the report is "what this session has cost so far", not account-wide usage. Say so in one line above the report. For all-time numbers the user runs `/ccusage` in Claude Code on their own PC or Mac.

## 1. Map the request to flags

| User says | Flags |
|---|---|
| "/ccusage", "show my usage", nothing specific | *(none)* — all time |
| "this month", "September" | `--since 2026-09-01 --until 2026-09-30` (compute real dates from today) |
| "this week", "last 7 days" | `--since <date 7 days ago>` and `--days 7` |
| "today" | `--since <today> --until <today>` |
| "for project X", "in nishboard" | `--project <name>` (substring of the folder name) |
| "in my timezone", specific TZ | `--timezone America/Chicago` (IANA name) |
| "more days" / "top 20 sessions" | `--days 30`, `--top 20` |
| No internet / pricing fetch fails | `--offline` (uses ccusage's bundled prices) |
| Wants raw data to dig into | `--save ./ccusage-raw` (writes each report's JSON) |

Other options: `--no-blocks` skips the 5-hour block section; `--runner "bunx ccusage"` forces a specific runner.

## 2. Run the report

```bash
node .claude/skills/ccusage/scripts/report.mjs [flags]   # from the repo root; else use this skill's directory
```

Needs Node 18+. The script uses a global `ccusage` if installed, else `bunx ccusage`, else `npx -y ccusage@latest` (the first npx run downloads the package and takes longer). All ccusage calls run in parallel. Cloud sessions reach npm through their proxy, so `npx` works there (about 3 s).

## 3. Present it

1. Output the script's markdown **as-is**. It is already formatted with tables and bars, so don't re-summarize it into prose or drop sections.
2. Then add a short **Takeaways** section of 3–5 bullets, using only numbers that appear in the report:
   - The biggest cost driver: the top model and its % of cost, plus the top project.
   - The trend: month-over-month Δ, and whether the latest week is above or below the previous one.
   - Cache hit ratio. Above ~80% is healthy for Claude Code. Low values mean lots of cache creation, e.g. many fresh sessions or frequent context resets.
   - If a block is active: the projected block-end cost and tokens, and the time remaining.
   - If one model, such as Opus, dominates cost, note it plainly without lecturing.
3. Always keep the caveat visible: costs are **API-list-price equivalents**. On a Pro or Max subscription the user isn't billed these amounts; the figure shows the value consumed.

## 4. Follow-ups

For drill-downs, call ccusage directly and present the result as a markdown table:
- `ccusage claude daily --breakdown --since YYYYMMDD` — per-model per-day
- `ccusage session --id <sessionId> --json` — one session in detail
- `ccusage blocks --live` — live dashboard. It is interactive, so tell the user to run it in their own terminal.
- `ccusage daily --by-agent` — compare Claude Code with Codex, Gemini CLI and other agents, if the report says others were detected

## 5. Troubleshooting

| Symptom | Fix |
|---|---|
| "No Claude Code usage data found" | Logs aren't in the default folders. Ask where Claude Code's config lives and set `CLAUDE_CONFIG_DIR=/path` before the command. |
| `npx` hangs or fails (offline, proxy) | `npm i -g ccusage` once, then rerun. Add `--offline` if only the pricing fetch fails. |
| A section is listed under "Sections that failed" | Show the error line. The rest of the report is still valid. Rerun with `--offline` if the error mentions pricing or network. |
| Project shows as `~/code-foo` instead of a real path | The folder no longer exists on disk, so the name can't be decoded exactly. This is harmless. |
