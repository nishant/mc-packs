import js from "@eslint/js";
import globals from "globals";
import nish from "@nish/ui/eslint";

// Lint tools/ only. Packs run in Bedrock's script engine and have their own checks (npm run check).
const TOOLS = ["tools/**/*.{js,mjs}"];
const scoped = (configs) => configs.map((c) => ({ ...c, files: TOOLS }));

// Code that runs inside Bedrock's script engine, not Node: the *-shared.js files (synced into packs by
// sync-*.mjs, so their content stays as is), the BDS hooks (appended to a pack's main.js) and the harness
// pieces injected into packs. ES builtins plus console only.
const BEDROCK = [
  "tools/*-shared.js",
  "tools/test-bds/hooks/**/*.js",
  "tools/test-bds/lib/shim.js",
  "tools/test-bds/lib/profile.js",
  "tools/test-bds/testpack/scripts/**/*.js",
];

// Fragments appended to a pack or filled in from a template: they use the host file's identifiers.
const FRAGMENTS = [
  "tools/settings-shared.js",
  "tools/test-bds/hooks/**/*.js",
  "tools/test-bds/lib/shim.js",
  "tools/test-bds/lib/profile.js",
];

export default [
  {
    ignores: [
      "packs/**",
      "dist/**",
      "release/**",
      "node_modules/**",
      "campaign-reports/**",
      "docs/**",
      "types/**",
      "tools/gen-rain/sources/**",
      "tools/test-bds/.cache/**",
      "tools/test-bds/logs/**",
    ],
  },
  { ...js.configs.recommended, files: TOOLS },
  ...scoped(nish.configs.node),
  {
    files: TOOLS,
    languageOptions: { ecmaVersion: 2024, sourceType: "module", globals: { ...globals.node } },
  },
  {
    files: BEDROCK,
    languageOptions: { globals: { ...globals.es2021, console: "readonly" } },
  },
  {
    // Intentional: the ASCII / control-character filters in game text and in the shared files.
    files: TOOLS,
    rules: { "no-control-regex": "off" },
  },
  {
    // TODO(standards): 109 no-unused-vars hits and 115 no-empty hits at adoption (2026-10-31); fix them and move both back to "error".
    files: TOOLS,
    rules: {
      "no-unused-vars": "warn",
      "no-empty": "warn",
    },
  },
  { files: FRAGMENTS, rules: { "no-undef": "off" } },
];
