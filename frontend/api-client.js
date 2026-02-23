/* global window, fetch, AbortController */
(function bootstrapApiClient(global) {
  const RETRYABLE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

  class ApiError extends Error {
    constructor(message, status, details) {
      super(message || "Request failed");
      this.name = "ApiError";
      this.status = status || 0;
      this.details = details || null;
    }
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function withBaseUrl(pathOrUrl) {
    if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
    const base = global.BACKEND_URL || "http://127.0.0.1:8000";
    if (pathOrUrl.startsWith("/")) return `${base}${pathOrUrl}`;
    return `${base}/${pathOrUrl}`;
  }

  async function parseResponseBody(response) {
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      try {
        return await response.json();
      } catch (err) {
        return null;
      }
    }
    try {
      const text = await response.text();
      return text || null;
    } catch (err) {
      return null;
    }
  }

  function normalizeErrorMessage(payload, fallbackMessage) {
    if (!payload) return fallbackMessage;
    if (typeof payload === "string") return payload;
    if (typeof payload.detail === "string") return payload.detail;
    if (typeof payload.message === "string") return payload.message;
    if (Array.isArray(payload.detail)) {
      const first = payload.detail[0];
      if (first && typeof first.msg === "string") return first.msg;
    }
    return fallbackMessage;
  }

  function getTokenSafely() {
    if (typeof global.getToken === "function") return global.getToken();
    return global.localStorage?.getItem("auth_token") || "";
  }

  function isAuthPage() {
    const path = global.location?.pathname || "";
    return ["login.html", "register.html", "forgot.html", "reset.html"].some((p) => path.endsWith(p));
  }

  async function requestRaw(pathOrUrl, options = {}, config = {}) {
    const {
      timeoutMs = 10000,
      retries = 1,
      retryDelayMs = 350
    } = config;
    const method = String(options.method || "GET").toUpperCase();
    const shouldRetryMethod = RETRYABLE_METHODS.has(method);
    let lastError = null;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const headers = { ...(options.headers || {}) };
        const token = getTokenSafely();
        if (token && !headers.Authorization) headers.Authorization = `Bearer ${token}`;

        const response = await fetch(withBaseUrl(pathOrUrl), {
          ...options,
          method,
          headers,
          credentials: options.credentials || "include",
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (response.status === 401) {
          if (typeof global.clearAuth === "function") global.clearAuth();
          if (!isAuthPage()) global.location.href = "login.html";
        }

        if (response.status >= 500 && shouldRetryMethod && attempt < retries) {
          await sleep(retryDelayMs * (attempt + 1));
          continue;
        }

        return response;
      } catch (err) {
        clearTimeout(timeoutId);
        lastError = err;
        if (!shouldRetryMethod || attempt >= retries) break;
        await sleep(retryDelayMs * (attempt + 1));
      }
    }

    throw new ApiError(lastError?.message || "Network request failed", 0, lastError || null);
  }

  async function requestJson(pathOrUrl, options = {}, config = {}) {
    const response = await requestRaw(pathOrUrl, options, config);
    const body = await parseResponseBody(response);
    if (!response.ok) {
      const message = normalizeErrorMessage(body, `Request failed (${response.status})`);
      throw new ApiError(message, response.status, body);
    }
    return body;
  }

  const endpoints = {
    auth: {
      login: "/auth/login",
      logout: "/auth/logout",
      me: "/auth/me",
      forgot: "/auth/forgot",
      reset: "/auth/reset",
      register: "/auth/register",
      users: "/auth/users",
      usersOptions: "/auth/users/options",
      requests: "/auth/requests",
      requestApprove: (requestId) => `/auth/requests/${requestId}/approve`,
      requestReject: (requestId) => `/auth/requests/${requestId}/reject`
    },
    patients: {
      list: "/patients",
      byId: (patientId) => `/patients/${patientId}`,
      allLogs: (patientId) => `/patients/${patientId}/all-logs`,
      logNote: (patientId, logId) => `/patients/${patientId}/logs/${logId}/note`
    },
    care: {
      assignments: "/care/assignments",
      assignmentsByPatient: (patientId) => `/care/assignments?patient_id=${patientId}`,
      interventions: "/care/interventions",
      interventionsByPatient: (patientId) => `/care/interventions?patient_id=${patientId}`,
      reminders: "/care/medication/reminders",
      remindersByPatient: (patientId) => `/care/medication/reminders?patient_id=${patientId}`,
      reminderById: (reminderId) => `/care/medication/reminders/${reminderId}`,
      responseReview: "/care/response-review",
      responseCorrection: "/care/response-correction",
      riskOverride: "/care/risk-override",
      audit: "/care/audit"
    },
    reports: {
      daily: "/reports/daily",
      system: "/reports/system"
    },
    nurse: {
      patient: (patientId, selectedDate) =>
        `/nurse/patient/${patientId}${selectedDate ? `?selected_date=${encodeURIComponent(selectedDate)}` : ""}`,
      action: (patientId, actionPath) => `/nurse/patient/${patientId}/actions/${actionPath}`
    },
    admin: {
      events: "/admin/events",
      staff: "/admin/staff",
      security: "/admin/security"
    },
    telephony: {
      call: (phoneNumber, patientId) => `/call/${encodeURIComponent(phoneNumber)}?patient_id=${patientId}`
    },
    scheduler: {
      status: "/scheduler"
    }
  };

  global.api = {
    ApiError,
    endpoints,
    requestRaw,
    requestJson
  };

  // Shortcut for doctor dashboard and other legacy scripts
  global.apiCall = (path, method = "GET", body = null) => {
    return requestJson(path, {
      method,
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : null
    });
  };
})(window);
