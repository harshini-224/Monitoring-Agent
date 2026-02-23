document.addEventListener("DOMContentLoaded", () => {
  const nameEl = document.getElementById("profileName");
  const roleEl = document.getElementById("profileRole");
  const emailEl = document.getElementById("profileEmail");
  const statusEl = document.getElementById("profileStatus");
  const logoutBtn = document.getElementById("logoutBtn");
  const auditList = document.getElementById("auditList");
  const themeToggle = document.getElementById("themeToggle");

  function setTheme(next) {
    if (next === "dark") {
      document.body.classList.add("dark");
      if (themeToggle) themeToggle.textContent = "Light Mode";
      localStorage.setItem("theme", "dark");
    } else {
      document.body.classList.remove("dark");
      if (themeToggle) themeToggle.textContent = "Dark Mode";
      localStorage.setItem("theme", "light");
    }
  }

  if (themeToggle) {
    const saved = localStorage.getItem("theme") || "light";
    setTheme(saved);
    themeToggle.addEventListener("click", () => {
      const next = document.body.classList.contains("dark") ? "light" : "dark";
      setTheme(next);
    });
  }

  async function loadProfile() {
    try {
      const res = await window.authFetch(`${window.BACKEND_URL}/auth/me`);
      if (!res.ok) return;
      const data = await res.json();
      if (nameEl) nameEl.textContent = data.name || "Clinician";
      if (roleEl) roleEl.textContent = (data.role || "user").toUpperCase();
      if (emailEl) emailEl.textContent = data.email || "";
      if (statusEl) statusEl.textContent = "Active";
    } catch (err) {
      console.error(err);
    }
  }

  function renderAudit() {
    if (!auditList) return;
    const entries = JSON.parse(localStorage.getItem("audit_log") || "[]");
    if (!entries.length) {
      auditList.innerHTML = `<div class="muted">No audit events yet.</div>`;
      return;
    }
    auditList.innerHTML = "";
    entries.slice(0, 20).forEach((entry) => {
      const item = document.createElement("div");
      item.className = "audit-item";
      item.innerHTML = `
        <strong>${entry.action}</strong>
        <div class="muted">${entry.role}  -  ${entry.user}  -  ${new Date(entry.ts).toLocaleString()}</div>
      `;
      auditList.appendChild(item);
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      try {
        await window.authFetch(`${window.BACKEND_URL}/auth/logout`, { method: "POST" });
      } catch (err) {
        console.error(err);
      }
      window.clearAuth();
      window.location.href = "login.html";
    });
  }

  loadProfile();
  renderAudit();
});


