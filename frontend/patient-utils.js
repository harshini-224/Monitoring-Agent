/* global window */
(function bootstrapPatientUtils(global) {
  function toTitleCase(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[_-]+/g, " ")
      .split(" ")
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }

  function displayTrack(track) {
    const normalized = String(track || "").trim().toLowerCase();
    if (!normalized) return "General";
    if (normalized === "cardiac") return "Cardiovascular";
    return toTitleCase(normalized);
  }

  function displayProtocol(protocol) {
    return toTitleCase(protocol || "");
  }

  function riskLevel(score) {
    if ((score ?? 0) >= 70) return "high";
    if ((score ?? 0) >= 40) return "medium";
    return "low";
  }

  function riskColor(level) {
    if (level === "high") return "bg-red-500";
    if (level === "medium") return "bg-amber-500";
    return "bg-green-500";
  }

  function formatPercent(value) {
    if (value === null || value === undefined) return "--";
    return `${Math.round(value)}%`;
  }

  function statusBadgeClass(status) {
    if (status === "taken") return "bg-green-50 text-success";
    if (status === "missed" || status === "no_response") return "bg-red-50 text-critical";
    if (status === "call_placed" || status === "sms_sent") return "bg-amber-50 text-warning";
    return "bg-panel text-muted";
  }

  function statusLabel(status) {
    if (status === "taken") return "Taken";
    if (status === "missed") return "Missed";
    if (status === "no_response") return "No Response";
    if (status === "call_placed") return "IVR Called";
    if (status === "sms_sent") return "SMS Sent";
    return "Scheduled";
  }

  function formatDateKey(value) {
    const date = new Date(value || "");
    if (Number.isNaN(date.getTime())) return "";
    return date.toISOString().slice(0, 10);
  }

  function formatDayLabel(key) {
    if (!key) return "Unknown Day";
    const today = formatDateKey(new Date().toISOString());
    if (key === today) return "Today";
    const date = new Date(`${key}T00:00:00`);
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }

  function buildNurseTimeline(logs, reminders, interventions) {
    const days = new Map();
    const ensure = (key) => {
      if (!days.has(key)) days.set(key, { reminders: [], logs: [], notes: [] });
      return days.get(key);
    };

    (reminders || []).forEach((row) => {
      const key = formatDateKey(row.scheduled_for) || "unknown";
      ensure(key).reminders.push(row);
    });

    (logs || []).forEach((row) => {
      const key = formatDateKey(row.created_at) || "unknown";
      const medResponse = (row.responses || []).find((entry) => {
        const id = String(entry.intent_id || "").toLowerCase();
        return id.includes("med_adherence");
      });
      const answer = String(medResponse?.structured_data?.answer || "").toLowerCase();
      const pressResult = answer === "yes"
        ? "Press 1 (Taken)"
        : answer === "no"
          ? "Press 2 (Not taken)"
          : (row.answered ? "Response unclear" : "No input");
      ensure(key).logs.push({ ...row, press_result: pressResult });
      if (row.doctor_note) {
        ensure(key).notes.push({
          role: "Doctor",
          text: row.doctor_note,
          created_at: row.created_at
        });
      }
    });

    (interventions || []).forEach((row) => {
      if (!row.note) return;
      const key = formatDateKey(row.created_at) || "unknown";
      ensure(key).notes.push({
        role: "Nurse",
        text: row.note,
        created_at: row.created_at
      });
    });

    const keys = Array.from(days.keys()).sort((a, b) => (a < b ? 1 : -1));
    return { keys, days };
  }

  function adherenceBadge(reminders) {
    const rows = reminders || [];
    if (rows.some((row) => row.status === "missed")) return { text: "Missed", cls: "bg-red-50 text-critical" };
    if (rows.some((row) => row.status === "no_response")) return { text: "No Response", cls: "bg-amber-50 text-warning" };
    if (rows.some((row) => row.status === "taken")) return { text: "Taken", cls: "bg-green-50 text-success" };
    return { text: "Pending", cls: "bg-blue-50 text-info" };
  }

  global.patientUtils = {
    adherenceBadge,
    buildNurseTimeline,
    displayProtocol,
    displayTrack,
    formatDateKey,
    formatDayLabel,
    formatPercent,
    riskColor,
    riskLevel,
    statusBadgeClass,
    statusLabel,
    toTitleCase
  };
})(window);
