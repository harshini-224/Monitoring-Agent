document.addEventListener("DOMContentLoaded", async () => {
  const backend = window.BACKEND_URL || "http://127.0.0.1:8000";
  const criticalEl = document.getElementById("criticalAlerts");
  const mediumEl = document.getElementById("mediumAlerts");
  const infoEl = document.getElementById("infoAlerts");
  const alertCount = document.getElementById("alertCount");
  const alertStatus = document.getElementById("alertStatus");

  try {
    const res = await window.authFetch(`${backend}/patients`);
    const patients = res.ok ? await res.json() : [];
    const critical = patients.filter((p) => (p.risk_score ?? 0) >= 70);
    const medium = patients.filter((p) => (p.risk_score ?? 0) >= 40 && (p.risk_score ?? 0) < 70);
    const info = patients.filter((p) => (p.risk_score ?? 0) > 0 && (p.risk_score ?? 0) < 40);
    if (alertCount) alertCount.textContent = `${critical.length + medium.length} Alerts`;
    if (alertStatus) alertStatus.textContent = "Updated just now";

    const render = (rows, container, color) => {
      if (!container) return;
      if (!rows.length) {
        container.innerHTML = `<div class="text-sm text-muted">No alerts.</div>`;
        return;
      }
      container.innerHTML = rows.slice(0, 10).map((p) => `
        <div class="border border-border rounded-md p-3 flex items-center justify-between">
          <div>
            <div class="font-medium text-gray-900">${p.name}</div>
            <div class="text-xs text-gray-400">${p.disease_track || "General"}</div>
          </div>
          <div class="text-sm font-medium ${color}">${Math.round(p.risk_score ?? 0)}%</div>
        </div>
      `).join("");
    };

    render(critical, criticalEl, "text-red-600");
    render(medium, mediumEl, "text-amber-600");
    render(info, infoEl, "text-blue-600");
  } catch (err) {
    console.error(err);
  }
});
