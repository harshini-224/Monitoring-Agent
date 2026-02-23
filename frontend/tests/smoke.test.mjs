import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

describe("frontend smoke checks", () => {
  test("critical shared scripts exist", () => {
    const files = ["api-client.js", "state.js", "ui.js", "auth.js", "patient-utils.js", "scripts/build-check.mjs"];
    for (const file of files) {
      const content = readFileSync(resolve(process.cwd(), file), "utf8");
      expect(content.length).toBeGreaterThan(30);
    }
  });

  test("shared ui exposes dialog helper", () => {
    const script = readFileSync(resolve(process.cwd(), "ui.js"), "utf8");
    expect(script.includes("dialog")).toBe(true);
  });

  test("login page has clean text markers", () => {
    const html = readFileSync(resolve(process.cwd(), "login.html"), "utf8");
    expect(html.includes("\u00A9 CarePulse")).toBe(true);
    expect(html.includes("HIPAA-aligned \u2022 Secure Access")).toBe(true);
    expect(html.includes("\u00C2\u00A9")).toBe(false);
    expect(html.includes("\u00E2\u20AC\u00A2")).toBe(false);
  });
});
