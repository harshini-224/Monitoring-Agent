document.addEventListener("DOMContentLoaded", async () => {
  const backend = window.BACKEND_URL || "http://127.0.0.1:8000";
  const notesList = document.getElementById("notesList");
  const notesCount = document.getElementById("notesCount");
  const notesStatus = document.getElementById("notesStatus");

  try {
    const res = await window.authFetch(`${backend}/patients`);
    const patients = res.ok ? await res.json() : [];
    const notes = [];
    for (const patient of patients.slice(0, 12)) {
      const logsRes = await window.authFetch(`${backend}/patients/${patient.id}/all-logs`);
      if (!logsRes.ok) continue;
      const logs = await logsRes.json();
      logs.forEach((log) => {
        if (log.doctor_note) {
          notes.push({
            patient,
            note: log.doctor_note,
            created_at: log.created_at
          });
        }
      });
    }
    notes.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    if (notesCount) notesCount.textContent = `${notes.length} Notes`;
    if (notesStatus) notesStatus.textContent = "Updated just now";

    if (!notesList) return;
    if (!notes.length) {
      notesList.innerHTML = `<div class="text-sm text-muted">No clinical notes found.</div>`;
      return;
    }
    notesList.innerHTML = notes.slice(0, 20).map((row) => `
      <div class="border border-border rounded-md p-3">
        <div class="flex items-center justify-between">
          <div class="font-medium text-gray-900">${row.patient.name}</div>
          <div class="text-xs text-gray-400">${window.formatTime(row.created_at)}</div>
        </div>
        <div class="text-xs text-gray-400 mt-1">Visibility: Doctor only</div>
        <div class="text-sm text-gray-700 mt-2">${row.note}</div>
      </div>
    `).join("");
  } catch (err) {
    console.error(err);
    if (notesList) notesList.innerHTML = `<div class="text-sm text-muted">Unable to load notes.</div>`;
  }
});
