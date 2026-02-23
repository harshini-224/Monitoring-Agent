document.addEventListener("DOMContentLoaded", async () => {
  const backend = window.BACKEND_URL || "http://127.0.0.1:8000";
  const reviewsToday = document.getElementById("reviewsToday");
  const reviewsYesterday = document.getElementById("reviewsYesterday");
  const reviewsOverdue = document.getElementById("reviewsOverdue");
  const reviewCount = document.getElementById("reviewCount");
  const reviewStatus = document.getElementById("reviewStatus");

  function renderRows(rows, container) {
    if (!container) return;
    if (!rows.length) {
      container.innerHTML = `<div class="text-sm text-muted">No reviews.</div>`;
      return;
    }
    container.innerHTML = rows.map((row) => `
      <div class="border border-border rounded-md p-3 flex items-center justify-between">
        <div>
          <div class="font-medium text-gray-900">${row.name}</div>
          <div class="text-xs text-gray-400">Reason: ${row.reason} · Age ${row.age || "--"}</div>
        </div>
        <div class="text-xs text-gray-400">${row.waiting}</div>
      </div>
    `).join("");
  }

  try {
    const res = await window.authFetch(`${backend}/patients`);
    const patients = res.ok ? await res.json() : [];
    const now = new Date();
    const rows = patients.map((p) => {
      const risk = p.risk_score ?? 0;
      const reason = risk >= 70 ? "High risk" : risk >= 40 ? "Monitor risk" : "Routine review";
      return {
        id: p.id,
        name: p.name,
        age: p.age,
        risk,
        reason,
        waiting: "Awaiting review"
      };
    }).sort((a, b) => b.risk - a.risk);

    const today = rows.slice(0, 6);
    const yesterday = rows.slice(6, 10);
    const overdue = rows.slice(10, 14);

    renderRows(today, reviewsToday);
    renderRows(yesterday, reviewsYesterday);
    renderRows(overdue, reviewsOverdue);

    if (reviewCount) reviewCount.textContent = `${rows.length} Reviews`;
    if (reviewStatus) reviewStatus.textContent = `Updated ${now.toLocaleTimeString()}`;
  } catch (err) {
    console.error(err);
  }
});
