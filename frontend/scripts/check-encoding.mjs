import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, resolve } from "node:path";

const root = resolve(process.cwd());
const allowedExtensions = new Set([".html", ".js", ".css", ".mjs", ".cjs"]);
const ignoredDirs = new Set(["node_modules", ".git", "dist"]);
const patterns = [
  { label: "mojibake-copyright", value: "\u00C2\u00A9" },
  { label: "mojibake-middle-dot", value: "\u00C2\u00B7" },
  { label: "mojibake-bullet", value: "\u00E2\u20AC\u00A2" },
  { label: "mojibake-emdash", value: "\u00E2\u20AC\u201D" },
  { label: "mojibake-endash", value: "\u00E2\u20AC\u201C" },
  { label: "mojibake-emoji-prefix", value: "\u00F0\u0178" },
  { label: "replacement-char", value: "\uFFFD" }
];

function walk(dir, acc = []) {
  const entries = readdirSync(dir);
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      if (ignoredDirs.has(entry)) continue;
      walk(fullPath, acc);
      continue;
    }
    if (allowedExtensions.has(extname(entry))) acc.push(fullPath);
  }
  return acc;
}

const files = walk(root, []);
const findings = [];

for (const filePath of files) {
  const text = readFileSync(filePath, "utf8");
  for (const pattern of patterns) {
    const index = text.indexOf(pattern.value);
    if (index < 0) continue;
    findings.push({
      filePath,
      pattern: pattern.label
    });
  }
}

if (findings.length) {
  console.error("Encoding check failed. Found potential mojibake markers:");
  findings.forEach((finding) => {
    console.error(`- ${finding.filePath}: ${finding.pattern}`);
  });
  process.exit(1);
}

console.log(`Encoding check passed (${files.length} files scanned).`);
