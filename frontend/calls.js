document.addEventListener("DOMContentLoaded", async () => {
  const backend = window.BACKEND_URL || "http://127.0.0.1:8000";
  const dateFilter = document.getElementById("dateFilter");
  const statusFilter = document.getElementById("statusFilter");
  const patientCards = document.getElementById("patientCards");
  const historyList = document.getElementById("historyList");
  const historyHeader = document.getElementById("historyHeader");
  const summaryTotal = document.getElementById("summaryTotal");
  const summaryAlerts = document.getElementById("summaryAlerts");
  const summaryPie = document.getElementById("summaryPie");
  const modal = document.getElementById("modal");
  const modalBody = document.getElementById("modalBody");
  const closeModal = document.getElementById("closeModal");

  let patients = [];
  let logsByPatient = {};
  let selectedPatientId = null;

  function buildPie(el, counts) {
    if (!el) return;
    const total = counts.reduce((a, b) => a + b.value, 0) || 1;
    let start = 0;
    const slices = counts.map((c) => {
      const pct = (c.value / total) * 100;
      const end = start + pct;
      const seg = `${c.color} ${start}% ${end}%`;
      start = end;
      return seg;
    });
    el.style.background = `conic-gradient(${slices.join(", ")})`;
  }

  function filterLogs(logs) {
    let filtered = [...logs];
    const date = dateFilter?.value;
    const status = statusFilter?.value;
    if (date) filtered = filtered.filter((r) => (r.created_at || "").startsWith(date));
    if (status) filtered = filtered.filter((r) => r.status === status);
    return filtered;
  }

  function renderPatientCards() {
    if (!patientCards) return;
    const rows = patients
      .map((p) => {
        const logs = filterLogs(logsByPatient[p.id] || []);
        const total = logs.length;
        const completed = logs.filter((l) => l.status === "completed").length;
        const missed = logs.filter((l) => l.status === "no_answer").length;
        const inProgress = logs.filter((l) => l.status === "in_progress").length;
        const alerts = logs.reduce((sum, l) => sum + (l.alerts || 0), 0);
        const latest = logs[0];
        return {
          id: p.id,
          name: p.name,
          track: p.disease_track,
          total,
          completed,
          missed,
          inProgress,
          alerts,
          latest
        };
      })
      .filter((r) => r.total > 0)
      .sort((a, b) => (b.latest?.created_at || "") > (a.latest?.created_at || "") ? 1 : -1);

    if (!rows.length) {
      patientCards.innerHTML = `<div class="text-muted">No call logs.</div>`;
      return;
    }

    patientCards.innerHTML = rows
      .map(
        (r) => `
      <button class="w-full text-left border border-border rounded-xl p-4 hover:bg-panel ${selectedPatientId == r.id ? "bg-panel" : ""}" data-patient-card="${r.id}">
        <div class="flex items-center justify-between">
          <div>
            <div class="font-medium">${r.name}</div>
            <div class="text-xs text-muted">${r.track || "General monitoring"}</div>
          </div>
          <div class="text-xs text-muted">Alerts: ${r.alerts}</div>
        </div>
        <div class="grid grid-cols-3 gap-3 mt-3 text-xs text-muted">
          <div><span class="text-ink font-medium">${r.total}</span> calls</div>
          <div><span class="text-ink font-medium">${r.completed}</span> completed</div>
          <div><span class="text-ink font-medium">${r.missed}</span> missed</div>
        </div>
        <div class="text-xs text-muted mt-2">Last call: ${window.formatTime(r.latest?.created_at)}</div>
      </button>
    `
      )
      .join("");

    patientCards.querySelectorAll("[data-patient-card]").forEach((btn) => {
      btn.addEventListener("click", () => {
        selectedPatientId = btn.dataset.patientCard;
        renderPatientCards();
        renderHistory();
      });
    });
  }

  function renderHistory() {
    if (!historyList || !historyHeader) return;
    const patient = patients.find((p) => String(p.id) === String(selectedPatientId));
    if (!patient) {
      historyHeader.textContent = "Select a patient to see history.";
      historyList.innerHTML = "";
      return;
    }
    historyHeader.innerHTML = `<strong class="text-ink">${patient.name}</strong> - ${patient.disease_track || "General monitoring"}`;
    const logs = filterLogs(logsByPatient[patient.id] || []);
    if (!logs.length) {
      historyList.innerHTML = `<div class="text-muted">No call history for this patient.</div>`;
      return;
    }
    historyList.innerHTML = logs
      .map(
        (l) => `
      <button class="w-full text-left border border-border rounded-xl p-4 hover:bg-panel" data-call-id="${l.id}">
        <div class="flex items-center justify-between">
          <div class="font-medium">${window.formatTime(l.created_at)}</div>
          <div class="text-xs text-muted">${l.status}</div>
        </div>
        <div class="text-xs text-muted mt-2">Alerts: ${l.alerts} - Duration: ${l.duration || "--"}</div>
      </button>
    `
      )
      .join("");

    historyList.querySelectorAll("[data-call-id]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.callId;
        const logs = logsByPatient[patient.id] || [];
        const item = logs.find((l) => String(l.id) === String(id));
        if (!item) return;
        modalBody.innerHTML = (item.responses || [])
          .map(
            (resp) => `
          <div class="border border-border rounded-xl p-4">
            <div class="flex items-center justify-between">
              <div class="font-medium">${resp.question || resp.intent_id}</div>
              ${resp.red_flag ? `<span class="text-xs px-2 py-1 rounded-md bg-red-50 text-critical">Alert</span>` : ""}
            </div>
            <div class="text-sm text-muted mt-2">${resp.raw_text || "No transcript"}</div>
          </div>
        `
          )
          .join("");
        modal.classList.remove("hidden");
      });
    });
  }

  function renderSummary() {
    const allLogs = Object.values(logsByPatient).flat();
    summaryTotal.textContent = allLogs.length || 0;
    summaryAlerts.textContent = allLogs.reduce((sum, l) => sum + (l.alerts || 0), 0);
    const completed = allLogs.filter((l) => l.status === "completed").length;
    const missed = allLogs.filter((l) => l.status === "no_answer").length;
    const inProgress = allLogs.filter((l) => l.status === "in_progress").length;
    buildPie(summaryPie, [
      { value: completed, color: "#93c5fd" },
      { value: missed, color: "#fecaca" },
      { value: inProgress, color: "#fde68a" }
    ]);
  }

  async function load() {
    const res = await window.authFetch(`${backend}/patients`);
    patients = res.ok ? await res.json() : [];
    logsByPatient = {};
    await Promise.all(
      patients.map(async (p) => {
        const lr = await window.authFetch(`${backend}/patients/${p.id}/all-logs`);
        const plogs = lr.ok ? await lr.json() : [];
        const mapped = plogs
          .map((l) => {
            const alerts = (l.responses || []).filter((r) => r.red_flag).length;
            const duration = l.started_at && l.ended_at ? Math.round((new Date(l.ended_at) - new Date(l.started_at)) / 1000) + "s" : null;
            return {
              id: l.id,
              created_at: l.created_at || l.started_at,
              status: l.status,
              alerts,
              responses: l.responses || [],
              duration
            };
          })
          .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
        logsByPatient[p.id] = mapped;
      })
    );
    renderSummary();
    if (!selectedPatientId) {
      const first = patients.find((p) => (logsByPatient[p.id] || []).length);
      selectedPatientId = first ? first.id : null;
    }
    renderPatientCards();
    renderHistory();
  }

  closeModal?.addEventListener("click", () => modal.classList.add("hidden"));
  modal?.addEventListener("click", (e) => {
    if (e.target === modal) modal.classList.add("hidden");
  });
  dateFilter?.addEventListener("change", () => {
    renderPatientCards();
    renderHistory();
  });
  statusFilter?.addEventListener("change", () => {
    renderPatientCards();
    renderHistory();
  });

  await load();
});

