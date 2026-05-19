#!/usr/bin/env node
/**
 * feature-impact.mjs — print all surfaces affected by a feature.
 *
 * Usage: node scripts/feature-impact.mjs <feature-key>
 *        node scripts/feature-impact.mjs --list
 *
 * Read .lovable/feature-registry.json and surface every route, nav entry,
 * FAQ keyword, edge function, table, and ⚠️ VERIFIED file tied to a feature
 * so AI agents (and humans) can audit impact BEFORE editing.
 */
import { readFileSync, existsSync } from "node:fs";

const C = {
  reset: "\x1b[0m", green: "\x1b[32m", red: "\x1b[31m",
  yellow: "\x1b[33m", cyan: "\x1b[36m", bold: "\x1b[1m", dim: "\x1b[2m",
};
const c = (col, s) => `${C[col]}${s}${C.reset}`;

const REGISTRY = ".lovable/feature-registry.json";

function loadRegistry() {
  if (!existsSync(REGISTRY)) {
    console.error(c("red", `✗ ${REGISTRY} not found`));
    process.exit(2);
  }
  return JSON.parse(readFileSync(REGISTRY, "utf8"));
}

function listKeys(reg) {
  const keys = Object.keys(reg.features).sort();
  console.log(c("bold", c("cyan", "\n📋 Available feature keys:\n")));
  for (const k of keys) {
    const f = reg.features[k];
    console.log(`  ${c("green", "•")} ${c("bold", k)} ${c("dim", "— " + (f.label_en || ""))}`);
  }
  console.log("");
}

function printArr(label, arr) {
  if (!arr || arr.length === 0) {
    console.log(`  ${c("dim", label.padEnd(18) + " (none)")}`);
    return;
  }
  console.log(`  ${c("bold", label.padEnd(18))} ${c("cyan", arr.length + " item(s)")}`);
  for (const x of arr) console.log(`    ${c("yellow", "→")} ${x}`);
}

const arg = process.argv[2];
const reg = loadRegistry();

if (!arg || arg === "--list" || arg === "-l") {
  listKeys(reg);
  process.exit(0);
}

const feature = reg.features[arg];
if (!feature) {
  console.error(c("red", `\n✗ Unknown feature key: "${arg}"`));
  listKeys(reg);
  process.exit(1);
}

console.log(c("bold", c("cyan", `\n🎯 Impact analysis: ${arg}\n`)));
console.log(`  ${c("bold", "Label TH:")}        ${feature.label_th || "-"}`);
console.log(`  ${c("bold", "Label EN:")}        ${feature.label_en || "-"}`);
console.log("");
printArr("Routes",          feature.routes);
printArr("Nav entries",     feature.nav_entries);
printArr("FAQ keywords",    feature.faq_keywords);
printArr("Edge functions",  feature.edge_fns);
printArr("DB tables",       feature.tables);
printArr("⚠️ VERIFIED",     feature.verified_files);
printArr("Critical files",  feature.critical_files);

console.log("");
console.log(c("yellow", "  ⚠️  READ EVERY FILE ABOVE BEFORE EDITING."));
console.log(c("dim",    "      Do NOT remove ⚠️ VERIFIED markers (C12 will fail)."));
console.log(c("dim",    "      Keep DB rows, routes, FAQ, sidebar in sync (C1-C11 enforce)."));
console.log("");
