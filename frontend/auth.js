function getToken() {
  return sessionStorage.getItem("auth_token") || localStorage.getItem("auth_token") || "";
}

function getRole() {
  return sessionStorage.getItem("auth_role") || localStorage.getItem("auth_role") || "";
}

function getName() {
  return sessionStorage.getItem("auth_name") || localStorage.getItem("auth_name") || "";
}

function setAuth(token, role, name = "") {
  // Auth token is maintained in HttpOnly cookie by backend.
  // Clear any legacy client-side token copies.
  sessionStorage.removeItem("auth_token");
  localStorage.removeItem("auth_token");
  if (role) {
    sessionStorage.setItem("auth_role", role);
    localStorage.removeItem("auth_role");
  }
  if (name) {
    sessionStorage.setItem("auth_name", name);
    localStorage.removeItem("auth_name");
  }
}

function clearAuth() {
  sessionStorage.removeItem("auth_token");
  sessionStorage.removeItem("auth_role");
  sessionStorage.removeItem("auth_name");
  localStorage.removeItem("auth_token");
  localStorage.removeItem("auth_role");
  localStorage.removeItem("auth_name");
}

async function authFetch(url, options = {}) {
  if (window.api?.requestRaw) {
    return window.api.requestRaw(url, options);
  }
  const token = getToken();
  const headers = options.headers || {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  options.headers = headers;
  options.credentials = options.credentials || "include";
  const res = await fetch(url, options);
  if (res.status === 401) {
    clearAuth();
    // Only redirect if we're not already on an auth page
    const path = window.location.pathname;
    const isAuth = ["login.html", "register.html", "forgot.html", "reset.html"].some(p => path.endsWith(p));
    if (!isAuth) {
      window.location.href = "login.html";
    }
  }
  return res;
}

function applyRoleRendering(role) {
  document.querySelectorAll("[data-role]").forEach((node) => {
    const allowed = (node.dataset.role || "").split(",").map(r => r.trim());
    if (!allowed.includes(role)) node.remove();
  });
}

async function hydrateProfile() {
  try {
    const me = window.api?.requestJson
      ? await window.api.requestJson(window.api.endpoints.auth.me, { method: "GET" })
      : await (await authFetch(`${window.BACKEND_URL}/auth/me`)).json();
    if (me && me.role) {
      setAuth("", me.role, me.name || "");
    }
  } catch (err) {
    console.error(err);
  }
}

function renderTopbar() {
  const nameEl = document.getElementById("userName");
  const roleEl = document.getElementById("userRole");
  if (nameEl) nameEl.textContent = getName() || "Clinician";
  if (roleEl) roleEl.textContent = (getRole() || "user").toUpperCase();
}

function bindLogout() {
  const btn = document.getElementById("logoutBtn");
  if (!btn) return;
  btn.onclick = async (e) => {
    e.preventDefault();
    try {
      await authFetch(`${window.BACKEND_URL}/auth/logout`, { method: "POST" });
    } catch (err) {
      console.error(err);
    }
    clearAuth();
    window.location.href = "login.html";
  };
}

function guardPages() {
  const path = window.location.pathname;
  const isLogin = path.endsWith("login.html");
  const isRegister = path.endsWith("register.html");
  const isForgot = path.endsWith("forgot.html");
  const isReset = path.endsWith("reset.html");

  const role = getRole();

  // If not logged in and not on an auth page, go to login
  if (!isLogin && !isRegister && !isForgot && !isReset && !role) {
    window.location.href = "login.html";
    return false;
  }

  // If on login/register/forgot/reset but already have a role, go to dashboard
  if ((isLogin || isRegister || isForgot || isReset) && role) {
    if (role === "admin") window.location.href = "admin-dashboard.html";
    else if (role === "doctor") window.location.href = "doctor-dashboard.html";
    else if (role === "nurse") window.location.href = "index.html";
    else if (role === "staff") window.location.href = "staff-overview.html";
    else window.location.href = "doctor-dashboard.html";
    return false;
  }

  // Doctors
  const doctorPages = ["doctor-dashboard.html", "home.html", "alerts.html", "reviews.html", "notes.html", "insights.html"];
  if (doctorPages.some(p => path.endsWith(p)) && role !== "doctor") {
    if (role === "admin") {
      // Admins are allowed to see doctor pages for monitoring
      return true;
    }
    window.location.href = "login.html";
    return false;
  }

  // Admin Dashboard
  if (path.endsWith("admin-dashboard.html") && role !== "admin") {
    window.location.href = "doctor-dashboard.html"; // Fallback for non-admins
    return false;
  }

  // Staff
  if (path.endsWith("staff-overview.html") && role !== "staff" && role !== "admin") {
    window.location.href = "login.html";
    return false;
  }

  return true;
}

function toggleNotifications() {
  const btn = document.getElementById("notifBtn");
  const panel = document.getElementById("notifPanel");
  if (!btn || !panel) return;
  btn.addEventListener("click", () => {
    panel.classList.toggle("hidden");
  });
  document.addEventListener("click", (e) => {
    if (!panel.contains(e.target) && e.target !== btn) {
      panel.classList.add("hidden");
    }
  });
}

async function loadNotifications() {
  const panel = document.getElementById("notifPanel");
  const count = document.getElementById("notifCount");
  if (!panel) return;
  const role = getRole();
  if (!role || !["doctor", "nurse", "staff"].includes(role)) {
    panel.innerHTML = `<div class="text-sm text-muted">No notifications.</div>`;
    if (count) count.textContent = "0";
    return;
  }
  try {
    if (role === "doctor") {
      const res = await authFetch(`${window.BACKEND_URL}/patients`);
      const patients = res.ok ? await res.json() : [];
      const alerts = patients.filter(p => (p.risk_score ?? 0) >= 70).slice(0, 6);
      if (count) count.textContent = String(alerts.length);
      if (!alerts.length) {
        panel.innerHTML = `<div class="text-sm text-muted">No high-risk alerts.</div>`;
        return;
      }
      panel.innerHTML = alerts.map(p => `
        <div class="flex items-center justify-between border border-border rounded-lg px-3 py-2 mb-2">
          <div>
            <div class="text-sm font-medium">${p.name}</div>
            <div class="text-xs text-muted">${p.disease_track}</div>
          </div>
          <span class="text-xs px-2 py-1 rounded-md bg-red-50 text-critical">High</span>
        </div>
      `).join("");
      return;
    }

    if (role === "staff") {
      const [patientsRes, remindersRes] = await Promise.all([
        authFetch(`${window.BACKEND_URL}/patients`),
        authFetch(`${window.BACKEND_URL}/care/medication/reminders`)
      ]);
      const patients = patientsRes.ok ? await patientsRes.json() : [];
      const reminders = remindersRes.ok ? await remindersRes.json() : [];

      const missedConfirmations = reminders
        .filter((r) => ["missed", "no_response"].includes(String(r.status || "").toLowerCase()))
        .map((r) => ({
          patient_id: r.patient_id,
          title: "Missed confirmation call",
          detail: `${r.medication_name}${r.dose ? ` ${r.dose}` : ""}`,
          at: r.call_placed_at || r.scheduled_for || null
        }));

      const logRows = await Promise.all(
        patients.map(async (p) => {
          try {
            const logsRes = await authFetch(`${window.BACKEND_URL}/patients/${p.id}/all-logs`);
            const logs = logsRes.ok ? await logsRes.json() : [];
            return logs
              .filter((l) => !l.answered || ["no_answer", "failed", "missed"].includes(String(l.status || "").toLowerCase()))
              .map((l) => ({
                patient_id: p.id,
                title: "Missed monitoring call",
                detail: l.created_at ? `Attempt at ${formatTime(l.created_at)}` : "No response from patient",
                at: l.created_at || null
              }));
          } catch (err) {
            console.error(err);
            return [];
          }
        })
      );

      const items = [...missedConfirmations, ...logRows.flat()]
        .sort((a, b) => String(b.at || "").localeCompare(String(a.at || "")))
        .slice(0, 8);

      if (count) count.textContent = String(items.length);
      if (!items.length) {
        panel.innerHTML = `<div class="text-sm text-muted">No missed calls.</div>`;
        return;
      }

      const patientName = new Map(patients.map((p) => [p.id, p.name]));
      panel.innerHTML = items.map((item) => `
        <a href="patients.html?patient_id=${item.patient_id}" class="block border border-border rounded-lg px-3 py-2 mb-2 hover:bg-panel">
          <div class="flex items-center justify-between">
            <div class="text-sm font-medium">${patientName.get(item.patient_id) || `Patient ${item.patient_id}`}</div>
            <span class="text-xs px-2 py-1 rounded-md bg-amber-50 text-warning">Action</span>
          </div>
          <div class="text-xs text-muted mt-1">${item.title}</div>
          <div class="text-xs text-muted mt-1">${item.detail}</div>
        </a>
      `).join("");
      return;
    }

    const [patientsRes, interventionsRes] = await Promise.all([
      authFetch(`${window.BACKEND_URL}/patients`),
      authFetch(`${window.BACKEND_URL}/care/interventions`)
    ]);
    const patients = patientsRes.ok ? await patientsRes.json() : [];
    const interventions = interventionsRes.ok ? await interventionsRes.json() : [];
    const patientName = new Map(patients.map((p) => [p.id, p.name]));
    const followups = interventions
      .filter((i) => i.type === "nurse_followup_call" && ["assigned", "planned"].includes((i.status || "").toLowerCase()))
      .slice(0, 6);
    if (count) count.textContent = String(followups.length);
    if (!followups.length) {
      panel.innerHTML = `<div class="text-sm text-muted">No nurse call assignments.</div>`;
      return;
    }
    panel.innerHTML = followups.map((i) => `
      <a href="index.html" class="block border border-border rounded-lg px-3 py-2 mb-2 hover:bg-panel">
        <div class="flex items-center justify-between">
          <div class="text-sm font-medium">${patientName.get(i.patient_id) || `Patient ${i.patient_id}`}</div>
          <span class="text-xs px-2 py-1 rounded-md bg-amber-50 text-warning">Assigned</span>
        </div>
        <div class="text-xs text-muted mt-1">${i.note || "Doctor requested follow-up call."}</div>
      </a>
    `).join("");
  } catch (err) {
    console.error(err);
  }
}

async function ensureAuth() {
  await hydrateProfile();
}

function getUser() {
  return {
    role: getRole(),
    name: getName()
  };
}

window.getToken = getToken;
window.getRole = getRole;
window.getName = getName;
window.setAuth = setAuth;
window.clearAuth = clearAuth;
window.authFetch = authFetch;
window.ensureAuth = ensureAuth;
window.getUser = getUser;

function formatTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString();
}
window.formatTime = formatTime;

document.addEventListener("DOMContentLoaded", async () => {
  await hydrateProfile();
  if (!guardPages()) return;
  renderTopbar();
  applyRoleRendering(getRole() || "staff");
  bindLogout();
  toggleNotifications();
  loadNotifications();
});

