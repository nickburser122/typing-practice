import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const acorn = require("acorn");
const escope = require("eslint-scope");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(root, "src");

const LAYERS = { data: 0, i18n: 0, core: 1, engine: 2, input: 3, features: 3, ui: 3 };
const BROWSER = new Set(["document", "window", "navigator", "localStorage", "sessionStorage", "getComputedStyle", "matchMedia", "requestAnimationFrame", "location", "Blob", "URL", "FileReader", "alert", "confirm", "Event", "CustomEvent", "HTMLElement", "Node", "Element"]);
const ALLOWED = { "core/base.js": ["window"], "core/state.js": ["navigator"], "core/storage.js": ["window"] };

function layerOf(rel) {
  const top = rel.split("/")[0];
  return top in LAYERS ? LAYERS[top] : 4;
}

export function check() {
  const problems = [];
  const graph = new Map();
  const files = [];
  (function walk(d) {
    for (const f of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, f.name);
      if (f.isDirectory()) { if (f.name !== "fonts") walk(p); }
      else if (p.endsWith(".js")) files.push(path.relative(SRC, p).split(path.sep).join("/"));
    }
  })(SRC);
  for (const rel of files) {
    const text = fs.readFileSync(path.join(SRC, rel), "utf8");
    const ast = acorn.parse(text, { ecmaVersion: 2022, sourceType: "module", ranges: true });
    const deps = new Set();
    for (const s of ast.body) {
      if (s.type !== "ImportDeclaration" || !s.source.value.endsWith(".js")) continue;
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(rel), s.source.value));
      deps.add(target);
      if (layerOf(rel) < 3 && layerOf(target) > layerOf(rel)) problems.push(`${rel} imports ${target} from a higher layer`);
    }
    graph.set(rel, deps);
    if (layerOf(rel) < 3) {
      const sm = escope.analyze(ast, { ecmaVersion: 2022, sourceType: "module" });
      const mod = sm.globalScope.childScopes[0];
      const allowed = new Set(ALLOWED[rel] || []);
      const seen = new Set();
      for (const ref of mod.through) {
        const n = ref.identifier.name;
        if (BROWSER.has(n) && !allowed.has(n) && !seen.has(n)) { seen.add(n); problems.push(`${rel} uses browser global ${n}`); }
      }
    }
  }
  return problems;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const problems = check();
  if (problems.length) {
    console.error(problems.join("\n"));
    process.exit(1);
  }
  console.log("module boundaries ok");
}
