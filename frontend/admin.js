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
    // Ignore network failure and clear local auth state anyway.
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

function pct(value) {
  if (value == null || Number.isNaN(Number(value))) return "--";
  return `${Math.round(Number(value))}%`;
}

function statusLabel(value) {
  const raw = String(value || "").toLowerCase();
  if (!raw || raw === "operational") return "Operational";
  if (raw.includes("incident")) return "Incident";
  if (raw.includes("degrad")) return "Degraded";
  return raw[0].toUpperCase() + raw.slice(1);
}

function topIncident(events) {
  const rows = Array.isArray(events) ? events : [];
  return rows.find((row) => ["api_failure", "twilio_webhook_error", "scheduler_delay", "ivr_service_restart"].includes(row.action));
}

function renderSidebar(user) {
  const sidebar = document.getElementById("roleSidebar");
  if (!sidebar) return;
  sidebar.innerHTML = `
    <div class="clinical-brand">
      <span class="sidebar-brand-dot"></span>
      <span>CarePulse Admin</span>
    </div>
    <div class="mt-6 text-xs uppercase tracking-wide text-slate-500">Navigation</div>
    <nav class="mt-2 space-y-1">
      <a href="admin.html" class="clinical-nav-link active">System Dashboard</a>
      <a href="access.html" class="clinical-nav-link">Access Control</a>
      <a href="events.html" class="clinical-nav-link">System Events</a>
      <a href="security.html" class="clinical-nav-link">Security</a>
    </nav>
    <div class="mt-10 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
      Signed in as <span class="font-semibold text-slate-700">${escapeHtml(user?.name || "Admin")}</span>
    </div>
    <div class="mt-3 clinical-status-indicator">
      <span class="clinical-status-dot"></span>
      System health monitored
    </div>
  `;
}

function renderTopbar(user, notifications) {
  const topbar = document.getElementById("roleTopbar");
  if (!topbar) return;
  const rows = Array.isArray(notifications) ? notifications : [];
  topbar.innerHTML = `
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="text-sm text-slate-500">System governance and reliability</div>
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
                : '<div class="text-slate-500">No active alerts.</div>'
            }
          </div>
        </div>
        <span class="text-sm font-semibold">${escapeHtml(user?.name || "Admin")}</span>
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

function renderHeader(snapshot) {
  const header = document.getElementById("roleHeader");
  if (!header) return;
  const incident = snapshot.incident;
  header.innerHTML = `
    <h1 class="clinical-page-title">Admin Dashboard</h1>
    <p class="clinical-page-subtitle">
      Live system status, pending access control decisions, and operational event feed.
      ${incident ? `Last incident at ${escapeHtml(formatDateTime(incident.created_at))}.` : "No active incidents."}
    </p>
  `;
}

function renderKpis(snapshot) {
  const mount = document.getElementById("roleKpis");
  if (!mount) return;
  mount.innerHTML = `
    <article class="kpi-card">
      <div class="kpi-label">Active Users</div>
      <div class="kpi-value">${snapshot.activeUsers}</div>
      <div class="kpi-meta">${snapshot.pendingRequests} pending approvals</div>
    </article>
    <article class="kpi-card">
      <div class="kpi-label">Calls Today</div>
      <div class="kpi-value">${snapshot.callsToday}</div>
      <div class="kpi-meta">${snapshot.failedCalls} failed calls</div>
    </article>
    <article class="kpi-card">
      <div class="kpi-label">Message Success</div>
      <div class="kpi-value">${pct(snapshot.messageSuccess)}</div>
      <div class="kpi-meta">Medication confirmation success rate</div>
    </article>
    <article class="kpi-card">
      <div class="kpi-label">Active Patients</div>
      <div class="kpi-value">${snapshot.activePatients}</div>
      <div class="kpi-meta">${snapshot.highRiskPatients} high risk patients</div>
    </article>
  `;
}

function renderSystemPanel(snapshot) {
  const mount = document.getElementById("systemPanel");
  if (!mount) return;
  const sys = snapshot.system || {};
  const recentErrors = snapshot.events.filter((row) =>
    ["api_failure", "twilio_webhook_error", "scheduler_delay", "ivr_service_restart"].includes(row.action)
  );
  mount.innerHTML = `
    <div class="panel-head">
      <h2 class="panel-title">System Monitoring</h2>
      <span class="risk-chip ${statusLabel(sys.system_status) === "Operational" ? "risk-chip-low" : "risk-chip-high"}">
        ${escapeHtml(statusLabel(sys.system_status))}
      </span>
    </div>
    <div class="p-4 grid grid-cols-1 gap-3 md:grid-cols-2">
      <div class="rounded-lg border border-slate-200 p-3">
        <div class="text-xs uppercase tracking-wide text-slate-500">IVR Calls Per Minute</div>
        <div class="mt-1 text-xl font-semibold">${sys.ivr_calls_per_minute ?? 0}</div>
      </div>
      <div class="rounded-lg border border-slate-200 p-3">
        <div class="text-xs uppercase tracking-wide text-slate-500">Queue Size</div>
        <div class="mt-1 text-xl font-semibold">${sys.queue_size ?? 0}</div>
      </div>
      <div class="rounded-lg border border-slate-200 p-3">
        <div class="text-xs uppercase tracking-wide text-slate-500">Active Calls</div>
        <div class="mt-1 text-xl font-semibold">${sys.active_calls ?? 0}</div>
      </div>
      <div class="rounded-lg border border-slate-200 p-3">
        <div class="text-xs uppercase tracking-wide text-slate-500">Scheduler Delayed</div>
        <div class="mt-1 text-xl font-semibold">${sys.scheduler_delayed ?? 0}</div>
      </div>
    </div>
    <div class="px-4 pb-4">
      <h3 class="text-sm font-semibold mb-2">Error Feed</h3>
      ${
        recentErrors.length
          ? recentErrors
              .slice(0, 8)
              .map(
                (row) => `
                  <div class="alert-strip high rounded-r-lg border border-slate-200 bg-white p-3 mb-2">
                    <div class="text-sm font-semibold">${escapeHtml(row.action)}</div>
                    <div class="text-xs text-slate-500">${escapeHtml(formatDateTime(row.created_at))}</div>
                  </div>
                `
              )
              .join("")
          : '<div class="text-sm text-slate-500">No critical failures in recent event stream.</div>'
      }
    </div>
  `;
}

function renderApprovalPanel(snapshot) {
  const mount = document.getElementById("approvalPanel");
  if (!mount) return;
  mount.innerHTML = `
    <div class="panel-head">
      <h2 class="panel-title">Pending Approvals</h2>
      <span class="text-xs text-slate-500">${snapshot.requests.length} pending</span>
    </div>
    <div class="p-4">
      ${
        snapshot.requests.length
          ? `
              <div class="overflow-x-auto">
                <table class="clinical-table">
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Role</th>
                      <th>Requested</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${snapshot.requests
                      .map(
                        (row) => `
                          <tr>
                            <td>
                              <div class="font-semibold">${escapeHtml(row.name || "User")}</div>
                              <div class="text-xs text-slate-500">${escapeHtml(row.email || "")}</div>
                            </td>
                            <td>${escapeHtml(String(row.role || "").toUpperCase())}</td>
                            <td>${escapeHtml(formatDateTime(row.created_at))}</td>
                            <td>
                              <div class="flex gap-1">
                                <button type="button" class="app-btn app-btn-soft text-xs" data-action="approve-request" data-user-id="${row.id}">Approve</button>
                                <button type="button" class="app-btn app-btn-danger text-xs" data-action="reject-request" data-user-id="${row.id}">Reject</button>
                              </div>
                            </td>
                          </tr>
                        `
                      )
                      .join("")}
                  </tbody>
                </table>
              </div>
            `
          : '<div class="text-sm text-slate-500">No pending access requests.</div>'
      }
    </div>
  `;
}

function renderEventsPanel(snapshot) {
  const mount = document.getElementById("eventsPanel");
  if (!mount) return;
  mount.innerHTML = `
    <div class="panel-head">
      <h2 class="panel-title">System Event Timeline</h2>
      <span class="text-xs text-slate-500">Latest ${snapshot.events.length} events</span>
    </div>
    <div class="p-4 overflow-x-auto">
      ${
        snapshot.events.length
          ? `
              <table class="clinical-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Action</th>
                    <th>Actor</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  ${snapshot.events
                    .slice(0, 20)
                    .map((row) => {
                      const actor = row.meta?.user_name || row.meta?.doctor_name || "System";
                      const detail = row.meta?.email || row.meta?.patient_name || "";
                      return `
                        <tr>
                          <td>${escapeHtml(formatDateTime(row.created_at))}</td>
                          <td>${escapeHtml(row.action || "--")}</td>
                          <td>${escapeHtml(actor)}</td>
                          <td>${escapeHtml(detail)}</td>
                        </tr>
                      `;
                    })
                    .join("")}
                </tbody>
              </table>
            `
          : '<div class="text-sm text-slate-500">No events available.</div>'
      }
    </div>
  `;
}

function buildNotifications(snapshot) {
  const rows = [];
  if (snapshot.requests.length) {
    rows.push({
      title: "Pending access approvals",
      detail: `${snapshot.requests.length} requests waiting for review`
    });
  }
  if (snapshot.failedCalls > 0) {
    rows.push({
      title: "Failed calls today",
      detail: `${snapshot.failedCalls} calls failed in daily report`
    });
  }
  if (snapshot.incident) {
    rows.push({
      title: "Recent system incident",
      detail: `${snapshot.incident.action} at ${formatDateTime(snapshot.incident.created_at)}`
    });
  }
  return rows;
}

function bindApprovalActions(refresh) {
  const panel = document.getElementById("approvalPanel");
  if (!panel) return;
  panel.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const userId = Number(button.dataset.userId || "");
    if (!userId) return;

    const action = button.dataset.action;
    button.disabled = true;
    try {
      if (action === "approve-request") {
        await api.approveAccessRequest(userId);
        showToast("Access request approved.");
      } else if (action === "reject-request") {
        await api.rejectAccessRequest(userId);
        showToast("Access request rejected.");
      }
      await refresh();
    } catch (err) {
      showToast(err.message || "Unable to process access request.", "error");
      button.disabled = false;
    }
  });
}

async function fetchSnapshot() {
  const [daily, system, patients, staffUsers, requests, events, security] = await Promise.all([
    api.getDailyReport().catch(() => ({})),
    api.getSystemReport().catch(() => ({})),
    api.getPatientDirectory().catch(() => []),
    api.getStaffUsers().catch(() => []),
    api.getPendingAccessRequests().catch(() => []),
    api.getAdminEvents(60).catch(() => []),
    api.getSecurityMetrics().catch(() => ({}))
  ]);

  const activeUsers = staffUsers.filter((row) => row.active).length;
  const activePatients = patients.filter((row) => row.active !== false).length;
  const highRiskPatients = patients.filter((row) => Number(row.risk_score || 0) >= 65).length;

  return {
    daily,
    system,
    patients,
    staffUsers,
    requests,
    events,
    security,
    activeUsers,
    activePatients,
    highRiskPatients,
    pendingRequests: requests.length,
    callsToday: daily.total_calls ?? 0,
    failedCalls: daily.failed_calls ?? 0,
    messageSuccess: daily.confirmation_success_rate ?? 0,
    incident: topIncident(events)
  };
}

async function requireAdmin() {
  try {
    const me = await api.getCurrentUser();
    if (me.role !== "admin") {
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
  const user = await requireAdmin();
  if (!user) return;

  renderSidebar(user);
  let mounted = false;

  const refresh = async () => {
    try {
      const snapshot = await fetchSnapshot();
      renderHeader(snapshot);
      renderKpis(snapshot);
      renderSystemPanel(snapshot);
      renderApprovalPanel(snapshot);
      renderEventsPanel(snapshot);
      renderTopbar(user, buildNotifications(snapshot));
      if (!mounted) {
        bindApprovalActions(refresh);
        mounted = true;
      }
    } catch (err) {
      const header = document.getElementById("roleHeader");
      if (header) {
        header.innerHTML = `
          <h1 class="clinical-page-title">Admin Dashboard</h1>
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
