import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd());
const failures = [];

function read(relativePath) {
  return readFileSync(resolve(root, relativePath), "utf8");
}

function requireScriptRefs(htmlFile, scripts) {
  const html = read(htmlFile);
  scripts.forEach((src) => {
    const escaped = src.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`<script[^>]+src=["']${escaped}["']`, "i");
    if (!pattern.test(html)) {
      failures.push(`${htmlFile}: missing script reference "${src}"`);
    }
  });
}

function requireNoLegacyModal(htmlFile) {
  const html = read(htmlFile);
  if (html.includes('id="uiDialog"')) {
    failures.push(`${htmlFile}: legacy in-page dialog markup found (id="uiDialog")`);
  }
}

function checkMojibake(relativePath) {
  const text = read(relativePath);
  const markers = [
    { label: "mojibake-bullet", value: "\u00C2\u00B7" },
    { label: "mojibake-lock", value: "\u00F0\u0178" },
    { label: "replacement-char", value: "\uFFFD" }
  ];
  markers.forEach((marker) => {
    if (text.includes(marker.value)) {
      failures.push(`${relativePath}: ${marker.label}`);
    }
  });
}

function checkAuthFetchUsage() {
  const patients = read("patients.js");
  const access = read("access.js");
  const patientsMatches = (patients.match(/window\.authFetch\(/g) || []).length;
  const accessMatches = (access.match(/window\.authFetch\(/g) || []).length;

  if (patientsMatches > 1) {
    failures.push("patients.js: direct window.authFetch calls found outside requestRaw fallback");
  }
  if (accessMatches > 1) {
    failures.push("access.js: direct window.authFetch calls found outside requestJson fallback");
  }
}

requireScriptRefs("patients.html", ["api-client.js", "state.js", "patient-utils.js", "ui.js", "auth.js"]);
requireScriptRefs("access.html", ["api-client.js", "ui.js", "auth.js"]);
requireScriptRefs("index.html", ["config.js", "js/app.js"]);

requireNoLegacyModal("patients.html");
requireNoLegacyModal("access.html");

checkMojibake("access.html");
checkMojibake("access.js");
checkMojibake("patients.html");
checkMojibake("patients.js");

checkAuthFetchUsage();

if (failures.length) {
  console.error("Build check failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Build check passed.");
