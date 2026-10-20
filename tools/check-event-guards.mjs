// Fails when a script event handler's own id checks drifted from the ids it registered with onScriptEvent (F25).
// Packs converted to the one-listener dispatcher (tools/events-shared.js) kept their old guards, for example
//   onScriptEvent(["realm:a", "realm:b"], ({ id }) => { if (id !== "realm:a" && id !== "realm:b") return; ... });
// The dispatcher already delivers only the registered ids, so the two lists must say the same thing: an id added to
// the registration but not to a guard is dropped silently, and an id compared but never registered never arrives.
// Rules, for every onScriptEvent call whose ids are literals (or a const array of literals in the same file):
//   1. every "realm:..." the handler compares its event id with (===, !==, switch case) is registered;
//   2. a guard `if (id !== a && id !== b ...) return;` at the top level of the handler lets through every registered
//      id that reaches it: all of them, minus those an earlier top-level `if (id === x || ...) { ...; return; }` took.
// Scans packs/*/scripts/**/*.js and the tools/*-shared.js sources. Uses the TypeScript parser (already a dependency).
//   node tools/check-event-guards.mjs            # check
//   node tools/check-event-guards.mjs <file...>  # check only these files (for tests)
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import ts from "typescript";

const root = join(import.meta.dirname, "..");

/** @param {string} dir @returns {string[]} */
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : e.name.endsWith(".js") ? [join(dir, e.name)] : []));

function defaultFiles() {
  const packs = join(root, "packs");
  const files = [];
  for (const p of readdirSync(packs)) {
    const scripts = join(packs, p, "scripts");
    try {
      if (statSync(scripts).isDirectory()) files.push(...walk(scripts));
    } catch {
      // a resource pack
    }
  }
  for (const f of readdirSync(join(root, "tools"))) if (f.endsWith("-shared.js")) files.push(join(root, "tools", f));
  return files;
}

/** @param {ts.Node} n */
const unwrap = (n) => {
  let x = n;
  while (ts.isParenthesizedExpression(x) || ts.isAsExpression(x) || ts.isTypeAssertionExpression(x)) x = x.expression;
  return x;
};

/**
 * The ids of a registration argument: a string, an array of strings, or a const name bound to one in the file.
 * @param {ts.Node} arg @param {Map<string, ts.Expression>} consts @returns {string[] | undefined}
 */
function idsOf(arg, consts) {
  const a = unwrap(arg);
  if (ts.isStringLiteralLike(a)) return [a.text];
  if (ts.isArrayLiteralExpression(a)) {
    const out = [];
    for (const el of a.elements) {
      const e = unwrap(el);
      if (!ts.isStringLiteralLike(e)) return undefined;
      out.push(e.text);
    }
    return out;
  }
  if (ts.isIdentifier(a) && consts.has(a.text)) return idsOf(/** @type {ts.Expression} */ (consts.get(a.text)), new Map());
  return undefined;
}

/**
 * How the handler names the event id: `({ id })` -> "id", `({ id: x })` -> "x", `(event)` -> "event.id".
 * @param {ts.FunctionLikeDeclaration} fn @returns {string[]}
 */
function idNames(fn) {
  const p = fn.parameters[0];
  if (!p) return [];
  if (ts.isObjectBindingPattern(p.name)) {
    for (const el of p.name.elements) {
      const prop = el.propertyName && ts.isIdentifier(el.propertyName) ? el.propertyName.text : ts.isIdentifier(el.name) ? el.name.text : "";
      if (prop === "id" && ts.isIdentifier(el.name)) return [el.name.text];
    }
    return [];
  }
  if (ts.isIdentifier(p.name)) return [`${p.name.text}.id`];
  return [];
}

/** @param {ts.Node} n @param {ts.SourceFile} sf */
const text = (n, sf) => n.getText(sf);

/**
 * A comparison of the event id with a string: { op, id } or undefined.
 * @param {ts.Node} n @param {string[]} names @param {ts.SourceFile} sf
 */
function compare(n, names, sf) {
  const e = unwrap(n);
  if (!ts.isBinaryExpression(e)) return undefined;
  const op = e.operatorToken.kind;
  if (op !== ts.SyntaxKind.EqualsEqualsEqualsToken && op !== ts.SyntaxKind.ExclamationEqualsEqualsToken && op !== ts.SyntaxKind.EqualsEqualsToken && op !== ts.SyntaxKind.ExclamationEqualsToken) return undefined;
  const [l, r] = [unwrap(e.left), unwrap(e.right)];
  const neg = op === ts.SyntaxKind.ExclamationEqualsEqualsToken || op === ts.SyntaxKind.ExclamationEqualsToken;
  if (names.includes(text(l, sf)) && ts.isStringLiteralLike(r)) return { neg, id: r.text };
  if (names.includes(text(r, sf)) && ts.isStringLiteralLike(l)) return { neg, id: l.text };
  return undefined;
}

/**
 * The ids of a chain `a op b op c` of comparisons joined by `join` (&& or ||), all with the same sign, or undefined.
 * @param {ts.Node} n @param {ts.SyntaxKind} join @param {boolean} neg @param {string[]} names @param {ts.SourceFile} sf
 * @returns {string[] | undefined}
 */
function chain(n, join, neg, names, sf) {
  const e = unwrap(n);
  if (ts.isBinaryExpression(e) && e.operatorToken.kind === join) {
    const a = chain(e.left, join, neg, names, sf);
    const b = chain(e.right, join, neg, names, sf);
    return a && b ? [...a, ...b] : undefined;
  }
  const c = compare(e, names, sf);
  return c && c.neg === neg ? [c.id] : undefined;
}

/** The parts of `a || b || c` (or the expression itself). @param {ts.Node} n @returns {ts.Node[]} */
function disjuncts(n) {
  const e = unwrap(n);
  if (ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.BarBarToken) return [...disjuncts(e.left), ...disjuncts(e.right)];
  return [e];
}

/** A statement that always ends in return (a return, or a block whose last statement is one). @param {ts.Statement} s */
function returns(s) {
  if (ts.isReturnStatement(s)) return true;
  if (ts.isBlock(s)) {
    const last = s.statements.at(-1);
    return !!last && returns(last);
  }
  return false;
}

/** How many top-level guards were checked, and the `!==` comparisons left unchecked (for --list). */
export const stats = { guards: 0, unchecked: /** @type {string[]} */ ([]) };
let guardCount = 0;

/** @param {string} file @returns {string[]} */
export function checkFile(file) {
  const src = readFileSync(file, "utf8");
  if (!src.includes("onScriptEvent(")) return [];
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const rel = relative(root, file).split(sep).join("/");
  /** @type {Map<string, ts.Expression>} */
  const consts = new Map();
  /** @type {Map<string, ts.FunctionLikeDeclaration>} */
  const functions = new Map();
  const collect = (/** @type {ts.Node} */ n) => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer) {
      const init = unwrap(n.initializer);
      if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) functions.set(n.name.text, init);
      else consts.set(n.name.text, init);
    }
    if (ts.isFunctionDeclaration(n) && n.name) functions.set(n.name.text, n);
    ts.forEachChild(n, collect);
  };
  collect(sf);
  /** @type {string[]} */
  const problems = [];
  const visit = (/** @type {ts.Node} */ n) => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === "onScriptEvent" && n.arguments.length >= 2) {
      const ids = idsOf(n.arguments[0], consts);
      let fn = unwrap(n.arguments[1]);
      if (ts.isIdentifier(fn)) fn = /** @type {any} */ (functions.get(fn.text)) ?? fn;
      if (ids && !ids.includes("*") && (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn) || ts.isFunctionDeclaration(fn))) {
        const line = sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
        const where = `${rel}:${line}`;
        const names = idNames(fn);
        const registered = new Set(ids);
        /** @type {Set<string>} ids named in a checked guard */
        const checked = new Set();
        /** @type {{ id: string, line: number }[]} */
        const negated = [];
        // Rule 1: every id the handler compares with is registered.
        const seen = (/** @type {ts.Node} */ m) => {
          const c = compare(m, names, sf);
          if (c?.neg) negated.push({ id: c.id, line: sf.getLineAndCharacterOfPosition(m.getStart(sf)).line + 1 });
          if (c && c.id.startsWith("realm:") && !registered.has(c.id)) problems.push(`${where}: the handler checks "${c.id}", which this onScriptEvent doesn't register`);
          if (ts.isSwitchStatement(m) && names.includes(text(unwrap(m.expression), sf)))
            for (const clause of m.caseBlock.clauses)
              if (ts.isCaseClause(clause) && ts.isStringLiteralLike(unwrap(clause.expression)) && !registered.has(/** @type {ts.StringLiteral} */ (unwrap(clause.expression)).text))
                problems.push(`${where}: the handler has a case "${/** @type {ts.StringLiteral} */ (unwrap(clause.expression)).text}", which this onScriptEvent doesn't register`);
          ts.forEachChild(m, seen);
        };
        if (fn.body) seen(fn.body);
        // Rule 2: a top-level guard lets through every registered id still reaching it.
        if (fn.body && ts.isBlock(fn.body)) {
          const reach = new Set(ids);
          for (const s of fn.body.statements) {
            if (!ts.isIfStatement(s)) continue;
            const taken = !s.elseStatement && returns(s.thenStatement) ? chain(s.expression, ts.SyntaxKind.BarBarToken, false, names, sf) : undefined;
            if (taken) {
              for (const id of taken) reach.delete(id);
              continue;
            }
            if (s.elseStatement || !returns(s.thenStatement)) continue;
            // `if (id !== a && id !== b) return;`, also as one part of `if (<that> || other) return;`.
            const guards = disjuncts(s.expression).map((d) => chain(d, ts.SyntaxKind.AmpersandAmpersandToken, true, names, sf)).filter((g) => g !== undefined);
            if (!guards.length) continue;
            const guard = guards.flat();
            for (const g of guards) for (const id of g) checked.add(id);
            guardCount++;
            const lets = new Set(guards.reduce((acc, g) => acc.filter((id) => g.includes(id))));
            const dropped = [...reach].filter((id) => !lets.has(id));
            const gline = sf.getLineAndCharacterOfPosition(s.getStart(sf)).line + 1;
            if (dropped.length) problems.push(`${rel}:${gline}: this guard drops ${dropped.map((d) => `"${d}"`).join(", ")}, registered at line ${line}: remove the guard (the dispatcher already filters by id) or list them`);
            for (const id of [...reach]) if (!lets.has(id)) reach.delete(id);
          }
        }
        for (const n of negated) if (!checked.has(n.id)) stats.unchecked.push(`${rel}:${n.line} "${n.id}"`);
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  stats.guards = guardCount;
  return problems;
}

const isMain = process.argv[1]?.endsWith("check-event-guards.mjs");
if (isMain) {
  const args = process.argv.slice(2);
  const list = args.includes("--list");
  const named = args.filter((a) => a !== "--list");
  const files = named.length ? named : defaultFiles();
  const problems = files.flatMap((f) => checkFile(f));
  if (problems.length) {
    console.error(`Script event handlers whose own id checks don't match what they register (F25):\n${problems.map((p) => `  - ${p}`).join("\n")}`);
    process.exit(1);
  }
  if (list) console.log(`${stats.guards} guards checked; id !== comparisons not in a checked top-level guard:\n${stats.unchecked.map((u) => `  ${u}`).join("\n") || "  (none)"}`);
  console.log(`check-event-guards: every handler's id checks match its onScriptEvent ids (${files.length} files).`);
}
