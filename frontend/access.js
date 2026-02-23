document.addEventListener("DOMContentLoaded", async () => {
  const backend = window.BACKEND_URL || "http://127.0.0.1:8000";
  const endpoints = window.api?.endpoints || {};
  const adminCreateUserForm = document.getElementById("adminCreateUserForm");
  const adminCreateUserError = document.getElementById("adminCreateUserError");
  const adminCreateUserSuccess = document.getElementById("adminCreateUserSuccess");
  const accessRequestList = document.getElementById("accessRequestList");
  const accessRequestPreview = document.getElementById("accessRequestPreview");
  const refreshAccessRequests = document.getElementById("refreshAccessRequests");
  const tabButtons = document.querySelectorAll("[data-access-tab]");
  const tabCreate = document.getElementById("accessTabCreate");
  const tabPending = document.getElementById("accessTabPending");
  const regenPassword = document.getElementById("regenPassword");
  const adminUserPassword = document.getElementById("adminUserPassword");

  function withBackend(pathOrUrl) {
    if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
    if (String(pathOrUrl).startsWith("/")) return `${backend}${pathOrUrl}`;
    return `${backend}/${pathOrUrl}`;
  }

  async function requestJson(pathOrUrl, options = {}, config = {}) {
    if (window.api?.requestJson) return window.api.requestJson(pathOrUrl, options, config);
    const res = await window.authFetch(withBackend(pathOrUrl), options);
    const contentType = res.headers.get("content-type") || "";
    const body = contentType.includes("application/json") ? await res.json() : await res.text();
    if (!res.ok) {
      const detail = body && typeof body === "object" ? (body.detail || body.message) : "";
      throw new Error(detail || `Request failed (${res.status})`);
    }
    return body;
  }

  async function showDialog(config) {
    if (window.ui?.dialog) return window.ui.dialog(config);
    console.error("Shared dialog helper is unavailable.");
    if (typeof config?.onConfirm === "function") await config.onConfirm();
    return true;
  }

  function generateTempPassword() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@";
    const length = 12;
    let out = "";
    for (let i = 0; i < length; i += 1) {
      out += chars[Math.floor(Math.random() * chars.length)];
    }
    return out;
  }

  function setActiveTab(tab) {
    if (tabCreate && tabPending) {
      tabCreate.classList.toggle("hidden", tab !== "create");
      tabPending.classList.toggle("hidden", tab !== "pending");
    }
    tabButtons.forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.accessTab === tab);
    });
  }

  if (tabButtons.length) {
    tabButtons.forEach((btn) => {
      btn.addEventListener("click", () => setActiveTab(btn.dataset.accessTab));
    });
    setActiveTab("create");
  }

  if (adminUserPassword && !adminUserPassword.value) {
    adminUserPassword.value = generateTempPassword();
  }
  if (regenPassword && adminUserPassword) {
    regenPassword.addEventListener("click", () => {
      adminUserPassword.value = generateTempPassword();
    });
  }

  if (adminCreateUserForm) {
    adminCreateUserForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (adminCreateUserError) adminCreateUserError.textContent = "";
      if (adminCreateUserSuccess) adminCreateUserSuccess.classList.add("hidden");

      const payload = {
        name: document.getElementById("adminUserName").value.trim(),
        email: document.getElementById("adminUserEmail").value.trim(),
        password: document.getElementById("adminUserPassword").value.trim(),
        role: document.getElementById("adminUserRole").value,
        department: document.getElementById("adminUserDept").value.trim() || undefined
      };

      try {
        await requestJson(endpoints.auth?.users || "/auth/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        adminCreateUserForm.reset();
        if (adminUserPassword) adminUserPassword.value = generateTempPassword();
        if (adminCreateUserSuccess) adminCreateUserSuccess.classList.remove("hidden");
        await fetchAccessRequests();
      } catch (err) {
        console.error(err);
        if (adminCreateUserError) adminCreateUserError.textContent = err.message || "Unable to create user.";
      }
    });
  }

  async function fetchAccessRequests() {
    if (!accessRequestList) return;
    accessRequestList.textContent = "Loading requests...";
    if (accessRequestPreview) accessRequestPreview.textContent = "Loading requests...";
    try {
      const rows = await requestJson(endpoints.auth?.requests || "/auth/requests");
      renderAccessRequests(Array.isArray(rows) ? rows : []);
    } catch (err) {
      console.error(err);
      accessRequestList.innerHTML = `<div class="text-sm text-muted">Unable to load access requests.</div>`;
      if (accessRequestPreview) accessRequestPreview.innerHTML = `<div class="text-sm text-muted">Unable to load requests.</div>`;
    }
  }

  function renderAccessRequests(rows) {
    if (!accessRequestList) return;
    if (!rows.length) {
      accessRequestList.innerHTML = `<div class="text-sm text-muted">No pending requests.</div>`;
      if (accessRequestPreview) accessRequestPreview.innerHTML = `<div class="text-sm text-muted">No pending requests.</div>`;
      return;
    }

    if (accessRequestPreview) {
      const preview = rows.slice(0, 3);
      accessRequestPreview.innerHTML = preview
        .map((row) => {
          const domain = (row.email || "").split("@")[1] || "unknown domain";
          return `
            <div class="flex items-center justify-between text-sm">
              <div>
                <div class="font-medium">${row.name || "User"}</div>
                <div class="text-xs text-muted">${row.role || "staff"} &middot; ${domain}</div>
              </div>
              <div class="text-xs text-muted">${window.formatTime(row.created_at)}</div>
            </div>
          `;
        })
        .join("");
    }

    accessRequestList.innerHTML = rows
      .map((row) => `
        <div class="card-soft p-4 flex items-center justify-between">
          <div>
            <div class="font-medium">${row.name || "User"}</div>
            <div class="text-xs text-muted">Requested role: ${row.role || "staff"} &middot; ${row.email || "--"}</div>
            <div class="text-xs text-muted mt-1">Email domain: ${(row.email || "").split("@")[1] || "unknown"}</div>
            <div class="text-xs text-muted mt-1">Requested ${window.formatTime(row.created_at)}</div>
          </div>
          <div class="flex items-center gap-2">
            <button class="btn-secondary text-xs" data-request-view="${row.id}">View details</button>
            <button class="btn-secondary text-xs" data-request-reject="${row.id}">Reject</button>
            <button class="btn-primary text-xs" data-request-approve="${row.id}">Approve</button>
          </div>
        </div>
      `)
      .join("");

    accessRequestList.querySelectorAll("[data-request-view]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.requestView;
        const row = rows.find((r) => String(r.id) === String(id));
        if (!row) return;
        const domain = (row.email || "").split("@")[1] || "unknown";
        showDialog({
          title: "Request Details",
          message: `Name: ${row.name || "User"}\nRole: ${row.role || "staff"}\nEmail: ${row.email || "--"}\nDomain: ${domain}\nRequested: ${window.formatTime(row.created_at)}`,
          confirmLabel: "Close",
          showCancel: false,
          preserveWhitespace: true
        });
      });
    });

    accessRequestList.querySelectorAll("[data-request-approve]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.requestApprove;
        const name = btn.closest(".card-soft")?.querySelector(".font-medium")?.textContent || "this user";
        showDialog({
          title: "Approve Access",
          message: `Approve access for ${name}?`,
          confirmLabel: "Approve",
          onConfirm: async () => {
            await requestJson(
              endpoints.auth?.requestApprove
                ? endpoints.auth.requestApprove(id)
                : `/auth/requests/${id}/approve`,
              { method: "POST" }
            );
            await fetchAccessRequests();
          }
        });
      });
    });

    accessRequestList.querySelectorAll("[data-request-reject]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.requestReject;
        const name = btn.closest(".card-soft")?.querySelector(".font-medium")?.textContent || "this user";
        showDialog({
          title: "Reject Access",
          message: `Reject access for ${name}?`,
          confirmLabel: "Reject",
          onConfirm: async () => {
            await requestJson(
              endpoints.auth?.requestReject
                ? endpoints.auth.requestReject(id)
                : `/auth/requests/${id}/reject`,
              { method: "POST" }
            );
            await fetchAccessRequests();
          }
        });
      });
    });
  }

  if (refreshAccessRequests) {
    refreshAccessRequests.addEventListener("click", () => fetchAccessRequests());
  }

  await fetchAccessRequests();
});
