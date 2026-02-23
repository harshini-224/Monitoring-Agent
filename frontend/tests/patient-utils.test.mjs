import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";
import { describe, expect, test } from "vitest";

function loadPatientUtils() {
  const script = readFileSync(resolve(process.cwd(), "patient-utils.js"), "utf8");
  const context = { window: {} };
  vm.runInNewContext(script, context);
  return context.window.patientUtils;
}

describe("patient utils", () => {
  test("formats and risk helpers behave as expected", () => {
    const utils = loadPatientUtils();
    expect(utils.toTitleCase("POST_MI")).toBe("Post Mi");
    expect(utils.displayTrack("cardiac")).toBe("Cardiovascular");
    expect(utils.riskLevel(72)).toBe("high");
    expect(utils.riskColor("medium")).toBe("bg-amber-500");
    expect(utils.formatPercent(48.2)).toBe("48%");
  });

  test("buildNurseTimeline aggregates reminders, logs, and notes", () => {
    const utils = loadPatientUtils();
    const result = utils.buildNurseTimeline(
      [
        {
          created_at: "2026-02-10T09:00:00Z",
          answered: true,
          responses: [{ intent_id: "med_adherence", structured_data: { answer: "yes" } }],
          doctor_note: "Doctor note"
        }
      ],
      [{ scheduled_for: "2026-02-10T08:00:00Z", status: "taken" }],
      [{ created_at: "2026-02-10T10:00:00Z", note: "Nurse note" }]
    );

    expect(result.keys.length).toBe(1);
    const day = result.days.get("2026-02-10");
    expect(day.reminders.length).toBe(1);
    expect(day.logs[0].press_result).toBe("Press 1 (Taken)");
    expect(day.notes.length).toBe(2);
  });
});
