import * as api from "./js/api.js";
import { initModals, openFormModal } from "./js/modals.js";
import { escapeHtml, formatDateTime, showToast } from "./js/utils.js";

const AUTO_REFRESH_MS = 60000;

function clearClientAuth() {
  sessionStorage.removeItem("auth_token");
  sessionStorage.removeItem("auth_role");
  sessionStorage.removeItem("auth_name");
  localStorage.removeItem("auth_token");
  localStorage.removeItem("auth_role");
  localStorage.removeItem("auth_name");
}

async function logout() {
  try {
    await api.logout();
  } catch (err) {
    // Ignore failures.
  }
  clearClientAuth();
  window.location.href = "login.html";
}

function roleHome(role) {
  if (role === "admin") return "admin.html";
  if (role === "doctor") return "home.html";
  if (role === "staff") return "staff-overview.html";
  if (role === "nurse") return "index.html";
  return "login.html";
}

function riskChip(score) {
  const value = Number(score || 0);
  if (value >= 65) return '<span class="risk-chip risk-chip-high">High</span>';
  if (value >= 40) return '<span class="risk-chip risk-chip-medium">Medium</span>';
  return '<span class="risk-chip risk-chip-low">Stable</span>';
}

function trendText(delta) {
  if (delta == null || Number.isNaN(delta)) return "No trend";
  if (delta > 0) return `+${Math.round(delta)} increase`;
  if (delta < 0) return `${Math.round(delta)} decrease`;
  return "No change";
}

function isToday(value) {
  if (!value) return false;
  const now = new Date();
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return false;
  return (
    now.getFullYear() === dt.getFullYear() &&
    now.getMonth() === dt.getMonth() &&
    now.getDate() === dt.getDate()
  );
}

function renderSidebar(user) {
  const sidebar = document.getElementById("roleSidebar");
  if (!sidebar) return;
  sidebar.innerHTML = `
    <div class="clinical-brand">
      <span class="sidebar-brand-dot"></span>
      <span>CarePulse Doctor</span>
    </div>
    <div class="mt-6 text-xs uppercase tracking-wide text-slate-500">Navigation</div>
    <nav class="mt-2 space-y-1">
      <a href="home.html" class="clinical-nav-link active">Decision Dashboard</a>
      <a href="alerts.html" class="clinical-nav-link">Alerts</a>
      <a href="reviews.html" class="clinical-nav-link">Reviews</a>
      <a href="patients.html" class="clinical-nav-link">Patients</a>
    </nav>
    <div class="mt-10 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
      Signed in as <span class="font-semibold text-slate-700">${escapeHtml(user?.name || "Doctor")}</span>
    </div>
  `;
}

function renderTopbar(user, notifications) {
  const topbar = document.getElementById("roleTopbar");
  if (!topbar) return;
  const rows = Array.isArray(notifications) ? notifications : [];
  topbar.innerHTML = `
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="text-sm text-slate-500">High-risk decision and escalation management</div>
      <div class="flex items-center gap-2">
        <div class="relative">
          <button id="notifBtn" type="button" class="app-btn app-btn-ghost">
            Notifications <span class="font-semibold">${rows.length}</span>
          </button>
          <div id="notifPanel" class="hidden absolute right-0 top-full mt-2 w-80 rounded-xl border border-slate-200 bg-white p-3 shadow-md text-sm text-slate-600">
            ${
              rows.length
                ? rows
                    .slice(0, 8)
                    .map(
                      (row) => `
                        <div class="rounded-lg border border-slate-200 px-3 py-2 mb-2">
                          <div class="font-semibold text-slate-800">${escapeHtml(row.title || "Update")}</div>
                          <div class="text-xs text-slate-500 mt-1">${escapeHtml(row.detail || "")}</div>
                        </div>
                      `
                    )
                    .join("")
                : '<div class="text-slate-500">No new clinical alerts.</div>'
            }
          </div>
        </div>
        <span class="text-sm font-semibold">${escapeHtml(user?.name || "Doctor")}</span>
        <button id="logoutBtn" type="button" class="app-btn app-btn-ghost text-xs">Logout</button>
      </div>
    </div>
  `;

  const logoutBtn = topbar.querySelector("#logoutBtn");
  if (logoutBtn) logoutBtn.addEventListener("click", logout);

  const notifBtn = topbar.querySelector("#notifBtn");
  const notifPanel = topbar.querySelector("#notifPanel");
  if (notifBtn && notifPanel) {
    notifBtn.addEventListener("click", () => notifPanel.classList.toggle("hidden"));
    if (!topbar.dataset.notifListenerBound) {
      document.addEventListener("click", (event) => {
        const panel = document.getElementById("notifPanel");
        const button = document.getElementById("notifBtn");
        if (!panel || !button) return;
        if (!panel.contains(event.target) && event.target !== button) {
          panel.classList.add("hidden");
        }
      });
      topbar.dataset.notifListenerBound = "1";
    }
  }
}

function renderHeader() {
  const header = document.getElementById("roleHeader");
  if (!header) return;
  header.innerHTML = `
    <h1 class="clinical-page-title">Doctor Decision Dashboard</h1>
    <p class="clinical-page-subtitle">Prioritized high-risk patient stack with alert confirmation, risk override, and nurse assignment actions.</p>
  `;
}

function renderKpis(snapshot) {
  const mount = document.getElementById("roleKpis");
  if (!mount) return;
  mount.innerHTML = `
    <article class="kpi-card">
      <div class="kpi-label">High Alert Patients</div>
      <div class="kpi-value">${snapshot.highCount}</div>
      <div class="kpi-meta">Current active high risk set</div>
    </article>
    <article class="kpi-card">
      <div class="kpi-label">Escalations Today</div>
      <div class="kpi-value">${snapshot.escalationsToday}</div>
      <div class="kpi-meta">Open escalation interventions</div>
    </article>
    <article class="kpi-card">
      <div class="kpi-label">Cleared Alerts</div>
      <div class="kpi-value">${snapshot.clearedToday}</div>
      <div class="kpi-meta">Doctor-confirmed clear actions today</div>
    </article>
    <article class="kpi-card">
      <div class="kpi-label">High-Risk Calls Today</div>
      <div class="kpi-value">${snapshot.highCallsToday}</div>
      <div class="kpi-meta">Daily report high-risk call count</div>
    </article>
  `;
}

function renderAlertStack(snapshot, selectedPatientId) {
  const mount = document.getElementById("alertStackPanel");
  if (!mount) return;
  const rows = snapshot.highRows;
  mount.innerHTML = `
    <div class="panel-head">
      <h2 class="panel-title">High Alert Patient Stack</h2>
      <span class="text-xs text-slate-500">${rows.length} patients</span>
    </div>
    <div class="p-4 space-y-3">
      ${
        rows.length
          ? rows
              .map((row) => {
                const selected = Number(selectedPatientId) === Number(row.patientId);
                return `
                  <article class="alert-strip high rounded-lg border border-slate-200 p-3 ${selected ? "bg-slate-50" : "bg-white"}" data-action="select-patient" data-patient-id="${row.patientId}">
                    <div class="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div class="text-base font-semibold">${escapeHtml(row.name)}</div>
                        <div class="text-xs text-slate-500">Risk ${Math.round(Number(row.riskScore || 0))}% | ${escapeHtml(trendText(row.riskTrend))}</div>
                      </div>
                      ${riskChip(row.riskScore)}
                    </div>
                    <div class="mt-2 text-sm text-slate-600">
                      Trigger: ${escapeHtml(row.triggerReason || "No clear trigger available")}
                    </div>
                    <div class="mt-1 text-xs text-slate-500">
                      Last IVR signal: ${escapeHtml(row.lastSignal || "No transcript")}
                    </div>
                    <div class="mt-3 flex flex-wrap gap-2">
                      <button type="button" class="app-btn app-btn-soft text-xs" data-action="confirm-alert" data-patient-id="${row.patientId}">Confirm Alert</button>
                      <button type="button" class="app-btn app-btn-ghost text-xs" data-action="clear-alert" data-patient-id="${row.patientId}">Clear Alert</button>
                      <button type="button" class="app-btn app-btn-ghost text-xs" data-action="assign-nurse" data-patient-id="${row.patientId}">Assign Nurse</button>
                      <button type="button" class="app-btn app-btn-ghost text-xs" data-action="add-note" data-patient-id="${row.patientId}">Add Note</button>
                      <button type="button" class="app-btn app-btn-danger text-xs" data-action="override-score" data-patient-id="${row.patientId}">Override Score</button>
                    </div>
                  </article>
                `;
              })
              .join("")
          : '<div class="text-sm text-slate-500">No high alert patients right now.</div>'
      }
    </div>
  `;
}

function renderExplainPanel(snapshot, selectedPatientId) {
  const mount = document.getElementById("explainPanel");
  if (!mount) return;
  const fallbackRow = snapshot.highRows[0] || null;
  const row = snapshot.highRows.find((item) => Number(item.patientId) === Number(selectedPatientId)) || fallbackRow;
  if (!row) {
    mount.innerHTML = `
      <div class="panel-head">
        <h2 class="panel-title">Clinical Explainability</h2>
      </div>
      <div class="p-4 text-sm text-slate-500">Select a patient from high alert stack to review risk drivers.</div>
    `;
    return;
  }

  const factors = Array.isArray(row.riskDrivers) ? row.riskDrivers.slice(0, 6) : [];
  mount.innerHTML = `
    <div class="panel-head">
      <h2 class="panel-title">Clinical Explainability</h2>
      ${riskChip(row.riskScore)}
    </div>
    <div class="p-4">
      <div class="text-sm font-semibold">${escapeHtml(row.name)}</div>
      <div class="text-xs text-slate-500 mt-1">Confidence ${row.confidence == null ? "--" : `${Math.round(row.confidence)}%`}</div>

      <h3 class="text-xs uppercase tracking-wide text-slate-500 mt-4 mb-2">Risk Drivers</h3>
      ${
        factors.length
          ? factors
              .map(
                (factor) => `
                  <div class="rounded-lg border border-slate-200 p-2 mb-2">
                    <div class="text-sm font-semibold">${escapeHtml(factor.label || factor.feature || "Driver")}</div>
                    <div class="text-xs text-slate-500 mt-1">${escapeHtml(factor.direction === "decrease" ? "Suggests lower immediate risk." : "Suggests higher immediate risk.")}</div>
                  </div>
                `
              )
              .join("")
          : '<div class="text-sm text-slate-500">No explainability factors available for selected patient.</div>'
      }
    </div>
  `;
}

function findPatientRow(snapshot, patientId) {
  return snapshot.highRows.find((row) => Number(row.patientId) === Number(patientId)) || null;
}

async function performDoctorAction(action, patientId, snapshot, user, refresh) {
  const row = findPatientRow(snapshot, patientId);
  if (!row) {
    showToast("Selected patient is no longer in high alert stack.", "error");
    return;
  }

  try {
    if (action === "confirm-alert") {
      await api.createIntervention({
        patient_id: patientId,
        type: "doctor_alert_confirmed",
        status: "completed",
        note: "Doctor confirmed high-risk alert."
      });
      showToast("Alert confirmed.");
      await refresh();
      return;
    }

    if (action === "clear-alert") {
      await api.createIntervention({
        patient_id: patientId,
        type: "doctor_alert_cleared",
        status: "completed",
        note: "Doctor cleared high-risk alert."
      });
      showToast("Alert cleared.");
      await refresh();
      return;
    }

    if (action === "assign-nurse") {
      const nurseOptions = snapshot.nurseOptions.length
        ? snapshot.nurseOptions.map((nurse) => ({ label: nurse.name, value: nurse.name }))
        : [{ label: "Nurse", value: "" }];
      const values = await openFormModal({
        title: "Assign Nurse",
        description: "Assign care follow-up nurse for this alert",
        confirmLabel: "Assign",
        fields: [
          {
            name: "nurse_name",
            label: "Nurse",
            type: "select",
            required: true,
            options: nurseOptions
          }
        ]
      });
      if (!values) return;
      if (!values.nurse_name) {
        showToast("Select a nurse to continue.", "error");
        return;
      }
      await api.upsertAssignment({
        patient_id: patientId,
        doctor_name: user.name || "Doctor",
        nurse_name: values.nurse_name
      });
      await api.createIntervention({
        patient_id: patientId,
        type: "doctor_nurse_assignment",
        status: "planned",
        note: `Assigned nurse ${values.nurse_name}`
      });
      showToast("Nurse assigned.");
      await refresh();
      return;
    }

    if (action === "add-note") {
      if (!row.latestLogId) {
        showToast("No call log available to attach doctor note.", "error");
        return;
      }
      const values = await openFormModal({
        title: "Add Doctor Note",
        confirmLabel: "Save Note",
        fields: [{ name: "note", label: "Doctor Note", type: "textarea", required: true, rows: 5 }]
      });
      if (!values) return;
      if (!values.note) {
        showToast("Note cannot be empty.", "error");
        return;
      }
      await api.saveDoctorNote(patientId, row.latestLogId, values.note);
      showToast("Doctor note saved.");
      await refresh();
      return;
    }

    if (action === "override-score") {
      if (!row.latestLogId) {
        showToast("No call log found to override score.", "error");
        return;
      }
      const values = await openFormModal({
        title: "Override Risk Score",
        description: `Current score: ${Math.round(Number(row.riskScore || 0))}%`,
        confirmLabel: "Confirm Override",
        fields: [
          { name: "risk_score", label: "Risk Score (0-100)", type: "number", required: true, min: 0, max: 100, value: String(Math.round(Number(row.riskScore || 0))) },
          { name: "note", label: "Reason", type: "textarea", required: true, rows: 3 }
        ]
      });
      if (!values) return;
      const score = Number(values.risk_score);
      if (Number.isNaN(score) || score < 0 || score > 100) {
        showToast("Risk score must be between 0 and 100.", "error");
        return;
      }
      await api.overrideRisk({
        patient_id: patientId,
        call_log_id: row.latestLogId,
        risk_score: score,
        note: values.note || "Doctor override"
      });
      showToast("Risk score overridden.");
      await refresh();
    }
  } catch (err) {
    showToast(err.message || "Unable to complete doctor action.", "error");
  }
}

function bindStackActions(state, user, refresh) {
  const panel = document.getElementById("alertStackPanel");
  if (!panel) return;
  panel.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const action = button.dataset.action;
    const patientId = Number(button.dataset.patientId || "");
    if (!patientId) return;

    if (action === "select-patient") {
      state.selectedPatientId = patientId;
      renderAlertStack(state.snapshot, state.selectedPatientId);
      renderExplainPanel(state.snapshot, state.selectedPatientId);
      return;
    }

    await performDoctorAction(action, patientId, state.snapshot, user, async () => {
      await refresh();
    });
  });
}

function buildNotifications(snapshot) {
  const rows = [];
  if (snapshot.highCount > 0) {
    rows.push({
      title: "High-risk patients",
      detail: `${snapshot.highCount} patients require decision review`
    });
  }
  if (snapshot.escalationsToday > 0) {
    rows.push({
      title: "Escalations pending",
      detail: `${snapshot.escalationsToday} escalation interventions opened today`
    });
  }
  if (snapshot.clearedToday > 0) {
    rows.push({
      title: "Cleared alerts",
      detail: `${snapshot.clearedToday} alerts were cleared today`
    });
  }
  return rows;
}

async function fetchSnapshot() {
  const [patients, dailyReport, interventions, userOptions] = await Promise.all([
    api.getPatientDirectory().catch(() => []),
    api.getDailyReport().catch(() => ({})),
    api.getInterventions().catch(() => []),
    api.getUserOptions().catch(() => ({ doctors: [], nurses: [] }))
  ]);

  const candidates = patients
    .filter((row) => Number(row.risk_score || 0) >= 65 && row.active !== false)
    .sort((a, b) => Number(b.risk_score || 0) - Number(a.risk_score || 0));

  const highRows = await Promise.all(
    candidates.map(async (patient) => {
      const logs = await api.getPatientLogs(patient.id).catch(() => []);
      const ordered = Array.isArray(logs)
        ? logs.slice().sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")))
        : [];
      const latest = ordered[0] || null;
      const previous = ordered[1] || null;
      const latestRisk = Number(latest?.risk_score ?? patient.risk_score ?? 0);
      const previousRisk = previous?.risk_score == null ? null : Number(previous.risk_score);
      const riskTrend = previousRisk == null ? null : latestRisk - previousRisk;
      const factors = latest?.explanation?.top_factors || [];
      const lastResponse = Array.isArray(latest?.responses) && latest.responses.length ? latest.responses[0] : null;
      return {
        patientId: patient.id,
        name: patient.name || `Patient ${patient.id}`,
        riskScore: latestRisk,
        riskTrend,
        latestLogId: latest?.id || null,
        triggerReason: factors[0]?.label || factors[0]?.feature || "",
        riskDrivers: factors,
        lastSignal: lastResponse?.raw_text || "",
        confidence: lastResponse?.confidence ?? null
      };
    });
  );

  const escalationsToday = interventions.filter(
    (row) =>
      isToday(row.created_at) &&
      (String(row.type || "").includes("escalation") || String(row.status || "").toLowerCase() === "planned")
  ).length;
  const clearedToday = interventions.filter(
    (row) => isToday(row.created_at) && String(row.type || "").toLowerCase() === "doctor_alert_cleared"
  ).length;

  return {
    highRows,
    highCount: highRows.length,
    escalationsToday,
    clearedToday,
    highCallsToday: dailyReport.high_risk_calls ?? 0,
    nurseOptions: Array.isArray(userOptions.nurses) ? userOptions.nurses : []
  };
}

async function requireDoctor() {
  try {
    const me = await api.getCurrentUser();
    if (me.role !== "doctor") {
      window.location.href = roleHome(me.role);
      return null;
    }
    return me;
  } catch (err) {
    window.location.href = "login.html";
    return null;
  }
}

async function init() {
  initModals(document.getElementById("modal"));

  const user = await requireDoctor();
  if (!user) return;

  renderSidebar(user);
  renderHeader();

  const state = {
    snapshot: { highRows: [], nurseOptions: [] },
    selectedPatientId: null
  };
  let bound = false;

  const refresh = async () => {
    try {
      state.snapshot = await fetchSnapshot();
      if (!state.selectedPatientId && state.snapshot.highRows.length) {
        state.selectedPatientId = state.snapshot.highRows[0].patientId;
      }
      renderKpis(state.snapshot);
      renderAlertStack(state.snapshot, state.selectedPatientId);
      renderExplainPanel(state.snapshot, state.selectedPatientId);
      renderTopbar(user, buildNotifications(state.snapshot));
      if (!bound) {
        bindStackActions(state, user, refresh);
        bound = true;
      }
    } catch (err) {
      const header = document.getElementById("roleHeader");
      if (header) {
        header.innerHTML = `
          <h1 class="clinical-page-title">Doctor Decision Dashboard</h1>
          <p class="clinical-page-subtitle text-rose-700">Unable to load dashboard: ${escapeHtml(err.message || "Unknown error")}</p>
        `;
      }
    }
  };

  await refresh();
  window.setInterval(refresh, AUTO_REFRESH_MS);
}

document.addEventListener("DOMContentLoaded", () => {
  init();
});
