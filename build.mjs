import { build } from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { check } from "./tools/check-boundaries.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(root, "src");

const RULES = [
  ["network calls", /fetch\(|XMLHttpRequest|sendBeacon|WebSocket/, "js"],
  ["native dropdowns", /h\("select"|createElement\("select"\)/, "js"],
  ["best-result highlight styling", /\.pb\.new/, "css"]
];

function checkSource(js, css) {
  const bad = RULES.filter(([, re, where]) => re.test(where === "js" ? js : css)).map(r => r[0]);
  if (bad.length) throw new Error("source check failed: " + bad.join(", "));
}

export async function bundle({ entry, plugins = [], stripCsp = false }) {
  const result = await build({
    entryPoints: [path.resolve(src, entry)],
    bundle: true,
    format: "iife",
    target: "es2022",
    write: false,
    outdir: path.join(root, ".out"),
    loader: { ".woff2": "dataurl" },
    banner: { js: '"use strict";' },
    charset: "utf8",
    legalComments: "none",
    logLevel: "warning",
    plugins
  });
  const out = {};
  for (const f of result.outputFiles) out[path.extname(f.path)] = f.text;
  const js = out[".js"];
  const css = out[".css"];
  if (/<\/script/i.test(js)) throw new Error("bundle contains a closing script tag");
  if (!entry.includes("dev") && !path.isAbsolute(entry)) checkSource(js, css);
  let page = fs.readFileSync(path.join(src, "index.template.html"), "utf8");
  if (stripCsp) page = page.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>\n?/, "");
  return page.replace("{{css}}", () => css.trimEnd()).replace("{{js}}", () => js.trimEnd());
}

async function main() {
  const problems = check();
  if (problems.length) throw new Error("module boundaries violated:\n" + problems.join("\n"));
  const dev = process.argv.includes("--dev");
  const html = await bundle({ entry: dev ? "dev.js" : "main.js" });
  const file = path.join(root, dev ? "dev.html" : "index.html");
  fs.writeFileSync(file, html);
  console.log(path.basename(file), (Buffer.byteLength(html) / 1024).toFixed(0) + " KB");
  if (!dev) {
    fs.mkdirSync(path.join(root, "public"), { recursive: true });
    fs.writeFileSync(path.join(root, "public", "index.html"), html);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
