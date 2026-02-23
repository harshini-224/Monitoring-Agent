document.addEventListener("DOMContentLoaded", async () => {
  const backend = window.BACKEND_URL || "http://127.0.0.1:8000";
  const timeline = document.getElementById("timeline");
  const upcoming = document.getElementById("upcoming");

  const res = await window.authFetch(`${backend}/scheduler`);
  const rows = res.ok ? await res.json() : [];

  const upcomingRows = rows
    .filter(r => r.next_call_at)
    .sort((a, b) => new Date(a.next_call_at) - new Date(b.next_call_at));

  if (upcoming) {
    if (!upcomingRows.length) {
      upcoming.innerHTML = `<div class="text-muted">No upcoming calls.</div>`;
    } else {
      upcoming.innerHTML = upcomingRows.slice(0, 8).map(r => `
        <div class="border border-border rounded-xl p-3">
          <div class="font-medium">${r.name}</div>
          <div class="text-sm text-muted">${window.formatTime(r.next_call_at)}</div>
          <div class="text-xs text-muted">${r.protocol}</div>
        </div>
      `).join("");
    }
  }

  if (timeline) {
    const grouped = {};
    upcomingRows.forEach(r => {
      const day = (r.next_call_at || "").split("T")[0];
      grouped[day] = grouped[day] || [];
      grouped[day].push(r);
    });
    timeline.innerHTML = Object.keys(grouped).slice(0, 7).map(day => `
      <div>
        <div class="text-sm font-medium">${day}</div>
        <div class="text-xs text-muted">${grouped[day].length} calls scheduled</div>
      </div>
    `).join("");
  }
});

