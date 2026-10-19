// Header recipes (the shell lines above a scenario's run command) built for a per-scenario stage folder.
// The headers write /tmp/<dir> so a person on Linux can paste them; the suite stages each scenario in its own folder
// instead. The stage path can hold spaces, quotes or (on Windows) backslashes, so it is never pasted into the
// recipe unquoted: every /tmp/ is replaced by the quoted stage path in the quoting context it appears in.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

/** Bash on Windows must be Git for Windows' (MSYS paths): never C:\Windows\System32\bash.exe, the WSL launcher. */
export function findBash({ platform = process.platform, env = process.env, exists = fs.existsSync } = {}) {
  if (env.BDS_HARNESS_BASH) {
    if (!exists(env.BDS_HARNESS_BASH)) throw new Error(`BDS_HARNESS_BASH is set to ${env.BDS_HARNESS_BASH}, which does not exist`);
    return env.BDS_HARNESS_BASH;
  }
  if (platform !== "win32") return "bash";
  const roots = new Set();
  for (const dir of String(env.PATH ?? env.Path ?? "").split(path.win32.delimiter).filter(Boolean)) {
    for (const exe of ["git.exe", "git.cmd"]) if (exists(path.win32.join(dir, exe))) roots.add(dir);
  }
  for (const key of ["ProgramFiles", "ProgramFiles(x86)", "ProgramW6432"]) if (env[key]) roots.add(path.win32.join(env[key], "Git", "cmd"));
  if (env.LOCALAPPDATA) roots.add(path.win32.join(env.LOCALAPPDATA, "Programs", "Git", "cmd"));
  for (const dir of roots) {
    for (const rel of [["..", "bin", "bash.exe"], ["..", "..", "bin", "bash.exe"], ["..", "usr", "bin", "bash.exe"], ["..", "..", "usr", "bin", "bash.exe"]]) {
      const candidate = path.win32.normalize(path.win32.join(dir, ...rel));
      if (exists(candidate)) return candidate;
    }
  }
  throw new Error("scenario header recipes need bash: install Git for Windows (its bash.exe) or set BDS_HARNESS_BASH to a bash.exe that uses MSYS paths");
}

export const forward = (p) => String(p).replace(/\\/g, "/");
/** One POSIX shell word for any text. */
export const shellQuote = (s) => `'${String(s).replace(/'/g, "'\\''")}'`;

/** The stage folder as the recipes and the node processes in them see it: forward slashes work for both on Windows. */
export function stagePrefix(stageDir) {
  const given = String(stageDir);
  const windowsPath = process.platform === "win32" || /^[A-Za-z]:[\\/]|^\\\\/.test(given);
  const abs = path.isAbsolute(given) || windowsPath ? given : path.resolve(given);
  const base = (windowsPath ? forward(abs) : abs).replace(/\/+$/, "") + "/";
  if (/[\r\n"$`\\]/.test(base)) throw new Error(`stage path ${JSON.stringify(base)} has a line break, quote ("), $, backtick or backslash that cannot be put into a recipe safely`);
  return base;
}

/**
 * Replaces every "/tmp/" in a header recipe with the stage folder, keeping the shell's quoting intact:
 * unquoted -> one single-quoted word, inside '...' or "..." -> the path as plain text (a ' becomes '\'' there).
 * Here-document bodies are copied literally.
 */
export function stageRecipe(recipe, stageDir) {
  recipe = recipe.replace(/\r\n/g, "\n");
  const base = stagePrefix(stageDir);
  let out = "";
  let quote = null; // null | "'" | '"'
  let heredoc = null; // { tag, quoted, dash } while a here-document body is being copied
  let pendingHeredoc = null;
  let i = 0;
  const copyBody = (line) => line.replace(/\/tmp\//g, base);
  while (i < recipe.length) {
    if (heredoc) {
      let end = recipe.indexOf("\n", i);
      if (end < 0) end = recipe.length;
      const line = recipe.slice(i, end);
      const isTag = (heredoc.dash ? line.replace(/^\t+/, "") : line) === heredoc.tag;
      out += isTag ? line : copyBody(line);
      if (isTag) heredoc = null;
      if (end < recipe.length) out += "\n";
      i = end + 1;
      continue;
    }
    const c = recipe[i];
    if (recipe.startsWith("/tmp/", i)) {
      out += quote === null ? shellQuote(base) : quote === "'" ? base.replace(/'/g, "'\\''") : base;
      i += 5;
      continue;
    }
    if (quote === "'") {
      if (c === "'") quote = null;
      out += c;
      i++;
      continue;
    }
    if (c === "\\") {
      out += c + (recipe[i + 1] ?? "");
      i += 2;
      continue;
    }
    if (quote === '"') {
      if (c === '"') quote = null;
      out += c;
      i++;
      continue;
    }
    if (c === "'" || c === '"') {
      quote = c;
      out += c;
      i++;
      continue;
    }
    if (c === "#" && (i === 0 || /\s/.test(recipe[i - 1]))) {
      const end = recipe.indexOf("\n", i);
      const stop = end < 0 ? recipe.length : end;
      out += recipe.slice(i, stop);
      i = stop;
      continue;
    }
    if (quote === null && recipe[i] === "$") {
      const v = /^\$(?:S|\{S\})(?![A-Za-z0-9_])/.exec(recipe.slice(i, i + 8));
      if (v) {
        out += '"$S"'; // the stage path may hold spaces: an unquoted $S would split into several words
        i += v[0].length;
        continue;
      }
    }
    const doc = /^<<(-?)\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\2/.exec(recipe.slice(i, i + 80));
    if (doc) {
      pendingHeredoc = { tag: doc[3], quoted: doc[2] !== "", dash: doc[1] === "-" };
      out += doc[0];
      i += doc[0].length;
      continue;
    }
    if (c === "\n" && pendingHeredoc) {
      heredoc = pendingHeredoc;
      pendingHeredoc = null;
    }
    out += c;
    i++;
  }
  if (quote !== null) throw new Error(`the recipe has an unterminated ${quote} quote`);
  return out;
}

/** The value a recipe gives its S variable (S=/tmp/x), before staging. */
export function recipeVariableS(recipe) {
  const m = /(?:^|[\s;&])S=(?:'([^']*)'|"([^"]*)"|([^\s;&]+))/m.exec(recipe);
  return m ? (m[1] ?? m[2] ?? m[3]) : null;
}

/** A word of the run command (no shell involved: it goes straight to node) with /tmp/ and $S as native stage paths. */
export function stageWord(word, recipe, stageDir) {
  const base = stagePrefix(stageDir);
  const s = recipeVariableS(recipe ?? "");
  const sValue = s === null ? null : s.replace(/\/tmp\//g, base);
  return word.replace(/\/tmp\//g, () => base).replace(/\$\{?S\}?(?![A-Za-z0-9_])/g, () => sValue ?? "$S");
}

/** Runs a staged recipe with bash -e in cwd (the repo root); returns spawnSync's result. */
export function runRecipe(recipe, { cwd, bash = findBash(), env = process.env } = {}) {
  return spawnSync(bash, ["-e", "-c", recipe], { cwd, encoding: "utf8", env });
}
