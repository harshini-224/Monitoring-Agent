document.addEventListener("DOMContentLoaded", async () => {
  const backend = window.BACKEND_URL || "http://127.0.0.1:8000";
  const auditList = document.getElementById("auditList");
  const auditSummary = document.getElementById("auditSummary");

  try {
    const res = await window.authFetch(`${backend}/care/audit?limit=50`);
    if (!res.ok) {
      if (auditList) auditList.innerHTML = '<div class="text-sm text-muted">Unable to load audit entries.</div>';
      return;
    }
    const rows = await res.json();
    if (auditSummary) {
      auditSummary.textContent = `Last 24 hours · ${rows.length} entries`;
    }
    if (!rows.length) {
      if (auditList) auditList.innerHTML = '<div class="text-sm text-muted">No audit entries found.</div>';
      return;
    }
    auditList.innerHTML = rows.map((row) => {
      const meta = row.meta || {};
      const actor = meta.doctor_name || meta.user_name || "Admin";
      const details = Object.entries(meta)
        .filter(([key]) => !["doctor_name", "user_name"].includes(key))
        .slice(0, 3)
        .map(([key, value]) => `${key.replace(/_/g, " ")}: ${value}`)
        .join(" · ");
      return `
        <div class="card-soft p-4">
          <div class="flex items-center justify-between">
            <div class="font-medium">${(row.action || "audit").replace(/_/g, " ")}</div>
            <span class="text-xs text-muted">${window.formatTime(row.created_at)}</span>
          </div>
          <div class="text-xs text-muted mt-1">Actor: ${actor}${details ? ` · ${details}` : ""}</div>
        </div>
      `;
    }).join("");
  } catch (err) {
    console.error(err);
    if (auditList) auditList.innerHTML = '<div class="text-sm text-muted">Unable to load audit entries.</div>';
  }
});
