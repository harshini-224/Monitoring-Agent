document.addEventListener("DOMContentLoaded", async () => {
  const backend = window.BACKEND_URL || "http://127.0.0.1:8000";
  const staffList = document.getElementById("staffList");
  const staffSummary = document.getElementById("staffSummary");

  try {
    const res = await window.authFetch(`${backend}/admin/staff`);
    if (!res.ok) {
      if (staffList) staffList.innerHTML = '<div class="text-sm text-muted">Unable to load staff.</div>';
      return;
    }
    const rows = await res.json();
    const active = rows.filter((r) => r.active);
    const counts = active.reduce((acc, row) => {
      acc.total += 1;
      acc[row.role] = (acc[row.role] || 0) + 1;
      return acc;
    }, { total: 0 });
    if (staffSummary) {
      staffSummary.textContent = `${counts.total || 0} total · ${counts.admin || 0} admins · ${counts.nurse || 0} nurses · ${counts.doctor || 0} doctors · ${counts.staff || 0} staff`;
    }

    if (staffList) {
      if (!active.length) {
        staffList.innerHTML = '<div class="text-sm text-muted">No active staff found.</div>';
        return;
      }
      staffList.innerHTML = active.slice(0, 20).map((row) => {
        const last = row.last_active ? window.formatTime(row.last_active) : "No recent activity";
        const dept = row.department ? ` · ${row.department}` : "";
        return `
          <div class="card-soft p-4 flex items-center justify-between">
            <div>
              <div class="font-medium">${row.name || "Staff Member"}</div>
              <div class="text-xs text-muted">${(row.role || "staff").replace(/^\w/, (c) => c.toUpperCase())}${dept} · ${row.email || "--"}</div>
            </div>
            <div class="text-xs text-muted">Last active ${last}</div>
          </div>
        `;
      }).join("");
    }
  } catch (err) {
    console.error(err);
    if (staffList) staffList.innerHTML = '<div class="text-sm text-muted">Unable to load staff.</div>';
  }
});
