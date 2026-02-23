import * as api from "./js/api.js";
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
    // Ignore logout transport errors.
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

function riskChip(score) {
  const value = Number(score || 0);
  if (value >= 65) return '<span class="risk-chip risk-chip-high">High</span>';
  if (value >= 40) return '<span class="risk-chip risk-chip-medium">Medium</span>';
  return '<span class="risk-chip risk-chip-low">Low</span>';
}

function renderSidebar(user) {
  const sidebar = document.getElementById("roleSidebar");
  if (!sidebar) return;
  sidebar.innerHTML = `
    <div class="clinical-brand">
      <span class="sidebar-brand-dot"></span>
      <span>CarePulse Staff</span>
    </div>
    <div class="mt-6 text-xs uppercase tracking-wide text-slate-500">Navigation</div>
    <nav class="mt-2 space-y-1">
      <a href="staff-overview.html" class="clinical-nav-link active">Operations Dashboard</a>
      <a href="enroll.html" class="clinical-nav-link">Enroll Patient</a>
      <a href="scheduler.html" class="clinical-nav-link">Scheduler</a>
      <a href="patients.html" class="clinical-nav-link">Patients</a>
    </nav>
    <div class="mt-10 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
      Signed in as <span class="font-semibold text-slate-700">${escapeHtml(user?.name || "Staff")}</span>
    </div>
  `;
}

function renderTopbar(user, notifications, searchValue = "") {
  const topbar = document.getElementById("roleTopbar");
  if (!topbar) return {};
  const rows = Array.isArray(notifications) ? notifications : [];
  topbar.innerHTML = `
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="w-full md:w-80">
        <input
          id="staffSearch"
          type="search"
          value="${escapeHtml(searchValue)}"
          placeholder="Search patient"
          class="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
        />
      </div>
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
                : '<div class="text-slate-500">No open notifications.</div>'
            }
          </div>
        </div>
        <span class="text-sm font-semibold">${escapeHtml(user?.name || "Staff")}</span>
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

  return { searchInput: topbar.querySelector("#staffSearch") };
}

function renderHeader() {
  const header = document.getElementById("roleHeader");
  if (!header) return;
  header.innerHTML = `
    <h1 class="clinical-page-title">Staff Operations Dashboard</h1>
    <p class="clinical-page-subtitle">Call operations, reminder execution, and today queue management for monitored patients.</p>
  `;
}

function renderKpis(snapshot) {
  const mount = document.getElementById("roleKpis");
  if (!mount) return;
  mount.innerHTML = `
    <article class="kpi-card">
      <div class="kpi-label">Calls Due</div>
      <div class="kpi-value">${snapshot.callsDue}</div>
      <div class="kpi-meta">From scheduler due list</div>
    </article>
    <article class="kpi-card">
      <div class="kpi-label">Missed Calls</div>
      <div class="kpi-value">${snapshot.missedCalls}</div>
      <div class="kpi-meta">Daily report</div>
    </article>
    <article class="kpi-card">
      <div class="kpi-label">Patients Under Monitoring</div>
      <div class="kpi-value">${snapshot.activePatients}</div>
      <div class="kpi-meta">Active programs</div>
    </article>
    <article class="kpi-card">
      <div class="kpi-label">Message Failures</div>
      <div class="kpi-value">${snapshot.messageFailures}</div>
      <div class="kpi-meta">Missed or no-response reminders</div>
    </article>
  `;
}

function renderMonitoringPanel(snapshot, query) {
  const mount = document.getElementById("monitoringPanel");
  if (!mount) return;
  const q = String(query || "").trim().toLowerCase();
  const rows = !q
    ? snapshot.patientRows
    : snapshot.patientRows.filter((row) => row.name.toLowerCase().includes(q) || String(row.patientId).includes(q));

  mount.innerHTML = `
    <div class="panel-head">
      <h2 class="panel-title">Patient Monitoring Grid</h2>
      <span class="text-xs text-slate-500">${rows.length} rows</span>
    </div>
    <div class="p-4 overflow-x-auto">
      ${
        rows.length
          ? `
              <table class="clinical-table">
                <thead>
                  <tr>
                    <th>Patient</th>
                    <th>Monitoring Call</th>
                    <th>Reminder Sent</th>
                    <th>Confirmation</th>
                    <th>Risk</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  ${rows
                    .map(
                      (row) => `
                        <tr>
                          <td>
                            <div class="font-semibold">${escapeHtml(row.name)}</div>
                            <div class="text-xs text-slate-500">ID ${row.patientId}</div>
                          </td>
                          <td>${escapeHtml(row.monitoringStatus)}</td>
                          <td>${escapeHtml(row.reminderSent)}</td>
                          <td>${escapeHtml(row.confirmationStatus)}</td>
                          <td>${riskChip(row.riskScore)}</td>
                          <td>
                            <button
                              type="button"
                              class="app-btn app-btn-soft text-xs"
                              data-action="trigger-call"
                              data-patient-id="${row.patientId}"
                              data-phone="${escapeHtml(row.phoneNumber || "")}"
                            >
                              Trigger Call
                            </button>
                          </td>
                        </tr>
                      `
                    )
                    .join("")}
                </tbody>
              </table>
            `
          : '<div class="text-sm text-slate-500">No patients match current filter.</div>'
      }
    </div>
  `;
}

function renderQueuePanel(snapshot) {
  const mount = document.getElementById("queuePanel");
  if (!mount) return;
  const rows = snapshot.queueRows.slice(0, 12);
  mount.innerHTML = `
    <div class="panel-head">
      <h2 class="panel-title">Today's Call Queue</h2>
      <span class="text-xs text-slate-500">${rows.length} items</span>
    </div>
    <div class="p-4 space-y-2">
      ${
        rows.length
          ? rows
              .map(
                (row) => `
                  <div class="rounded-lg border border-slate-200 p-3">
                    <div class="flex items-center justify-between gap-2">
                      <div class="text-sm font-semibold">${escapeHtml(row.name)}</div>
                      <span class="text-xs text-slate-500">${escapeHtml(row.status)}</span>
                    </div>
                    <div class="text-xs text-slate-500 mt-1">${escapeHtml(row.timeLabel)}</div>
                    <div class="mt-2">
                      <button
                        type="button"
                        class="app-btn app-btn-ghost text-xs"
                        data-action="trigger-call"
                        data-patient-id="${row.patientId}"
                        data-phone="${escapeHtml(row.phoneNumber || "")}"
                      >
                        Trigger
                      </button>
                    </div>
                  </div>
                `
              )
              .join("")
          : '<div class="text-sm text-slate-500">No queued calls for today.</div>'
      }
    </div>
  `;
}

function bindTriggerCall(refresh) {
  const clickHandler = async (event) => {
    const button = event.target.closest('[data-action="trigger-call"]');
    if (!button) return;
    const patientId = Number(button.dataset.patientId || "");
    const phoneNumber = String(button.dataset.phone || "").trim();
    if (!patientId || !phoneNumber) {
      showToast("Missing patient phone number for call trigger.", "error");
      return;
    }

    button.disabled = true;
    try {
      await api.triggerManualCall(phoneNumber, patientId);
      showToast("Call trigger sent.");
      await refresh();
    } catch (err) {
      showToast(err.message || "Unable to trigger call.", "error");
      button.disabled = false;
    }
  };

  const monitoringPanel = document.getElementById("monitoringPanel");
  const queuePanel = document.getElementById("queuePanel");
  if (monitoringPanel) monitoringPanel.addEventListener("click", clickHandler);
  if (queuePanel) queuePanel.addEventListener("click", clickHandler);
}

function queueStatus(nextCallAt, active) {
  if (!active) return "Inactive";
  if (!nextCallAt) return "Not Scheduled";
  const when = new Date(nextCallAt);
  if (Number.isNaN(when.getTime())) return "Scheduled";
  const now = new Date();
  if (when <= now) return "Due";
  return "Upcoming";
}

function buildNotifications(snapshot) {
  const rows = [];
  if (snapshot.callsDue > 0) {
    rows.push({ title: "Calls due now", detail: `${snapshot.callsDue} patients are due for call` });
  }
  if (snapshot.messageFailures > 0) {
    rows.push({ title: "Reminder failures", detail: `${snapshot.messageFailures} reminder workflows failed` });
  }
  if (snapshot.missedCalls > 0) {
    rows.push({ title: "Missed calls today", detail: `${snapshot.missedCalls} missed calls from daily report` });
  }
  return rows;
}

async function fetchSnapshot() {
  const [daily, system, patients, reminders, scheduler] = await Promise.all([
    api.getDailyReport().catch(() => ({})),
    api.getSystemReport().catch(() => ({})),
    api.getPatientDirectory().catch(() => []),
    api.getMedicationReminders().catch(() => []),
    api.getScheduler().catch(() => [])
  ]);

  const logsByPatient = new Map();
  await Promise.all(
    patients.map(async (patient) => {
      const logs = await api.getPatientLogs(patient.id).catch(() => []);
      const ordered = Array.isArray(logs)
        ? logs.slice().sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")))
        : [];
      logsByPatient.set(patient.id, ordered);
    })
  );

  const reminderByPatient = new Map();
  reminders.forEach((row) => {
    if (!reminderByPatient.has(row.patient_id)) reminderByPatient.set(row.patient_id, []);
    reminderByPatient.get(row.patient_id).push(row);
  });
  reminderByPatient.forEach((rows, key) => {
    rows.sort((a, b) => String(b.scheduled_for || "").localeCompare(String(a.scheduled_for || "")));
    reminderByPatient.set(key, rows);
  });

  const patientNameById = new Map(patients.map((row) => [row.id, row.name]));
  const patientPhoneById = new Map(patients.map((row) => [row.id, row.phone_number]));

  const patientRows = patients.map((patient) => {
    const logs = logsByPatient.get(patient.id) || [];
    const latestLog = logs[0] || null;
    const latestReminder = (reminderByPatient.get(patient.id) || [])[0] || null;
    const monitoringStatus = !latestLog
      ? "Pending"
      : latestLog.answered
        ? "Completed"
        : isToday(latestLog.created_at)
          ? "Missed"
          : "Pending";
    const reminderSent = latestReminder?.sms_sent_at ? "Sent" : "Not Sent";
    const confirmationStatus = latestReminder?.status ? String(latestReminder.status).replaceAll("_", " ") : "Not Recorded";
    return {
      patientId: patient.id,
      name: patient.name || `Patient ${patient.id}`,
      phoneNumber: patient.phone_number || "",
      monitoringStatus,
      reminderSent,
      confirmationStatus,
      riskScore: patient.risk_score ?? 0
    };
  });

  const queueRows = (Array.isArray(scheduler) ? scheduler : [])
    .map((row) => ({
      patientId: row.id,
      name: patientNameById.get(row.id) || row.name || `Patient ${row.id}`,
      phoneNumber: patientPhoneById.get(row.id) || row.phone_number || "",
      status: queueStatus(row.next_call_at, row.active),
      timeLabel: row.next_call_at ? formatDateTime(row.next_call_at) : "No schedule"
    }))
    .sort((a, b) => String(a.timeLabel).localeCompare(String(b.timeLabel)));

  const now = new Date();
  const callsDue = (Array.isArray(scheduler) ? scheduler : []).filter((row) => {
    if (!row.active || !row.next_call_at) return false;
    const dt = new Date(row.next_call_at);
    if (Number.isNaN(dt.getTime())) return false;
    return dt <= now;
  }).length;

  const messageFailures = reminders.filter((row) => ["missed", "no_response"].includes(String(row.status || "").toLowerCase())).length;
  const activePatients = patients.filter((row) => row.active !== false).length;
  const missedCalls = daily.failed_calls ?? 0;

  return {
    daily,
    system,
    patientRows,
    queueRows,
    callsDue,
    messageFailures,
    activePatients,
    missedCalls
  };
}

async function requireStaff() {
  try {
    const me = await api.getCurrentUser();
    if (me.role !== "staff") {
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
  const user = await requireStaff();
  if (!user) return;

  renderSidebar(user);
  renderHeader();

  const state = { query: "" };
  let handlersBound = false;

  const refresh = async () => {
    try {
      const snapshot = await fetchSnapshot();
      renderKpis(snapshot);
      renderMonitoringPanel(snapshot, state.query);
      renderQueuePanel(snapshot);
      const refs = renderTopbar(user, buildNotifications(snapshot), state.query);
      if (refs.searchInput) {
        refs.searchInput.addEventListener("input", () => {
          state.query = refs.searchInput.value;
          renderMonitoringPanel(snapshot, state.query);
        });
      }
      if (!handlersBound) {
        bindTriggerCall(refresh);
        handlersBound = true;
      }
    } catch (err) {
      const header = document.getElementById("roleHeader");
      if (header) {
        header.innerHTML = `
          <h1 class="clinical-page-title">Staff Operations Dashboard</h1>
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
