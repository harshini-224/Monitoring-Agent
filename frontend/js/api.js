import { getStoredToken } from "./utils.js";

const API_BASE = window.BACKEND_URL || "";

export class ApiError extends Error {
  constructor(message, status = 0, payload = null) {
    super(message || "Request failed");
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

function toUrl(pathOrUrl) {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  if (pathOrUrl.startsWith("/")) return `${API_BASE}${pathOrUrl}`;
  return `${API_BASE}/${pathOrUrl}`;
}

function resolveMessage(payload, fallback) {
  if (!payload) return fallback;
  if (typeof payload === "string") return payload;
  if (typeof payload.detail === "string") return payload.detail;
  if (typeof payload.message === "string") return payload.message;
  return fallback;
}

function redirectLoginIfNeeded() {
  sessionStorage.removeItem("auth_token");
  sessionStorage.removeItem("auth_role");
  sessionStorage.removeItem("auth_name");
  localStorage.removeItem("auth_token");
  localStorage.removeItem("auth_role");
  localStorage.removeItem("auth_name");
  const page = window.location.pathname.split("/").pop() || "";
  if (page.toLowerCase() !== "login.html") {
    window.location.href = "login.html";
  }
}

export async function request(pathOrUrl, options = {}) {
  const method = String(options.method || "GET").toUpperCase();
  const headers = { ...(options.headers || {}) };
  const token = getStoredToken();
  if (token && !headers.Authorization) {
    headers.Authorization = `Bearer ${token}`;
  }

  let body = options.body;
  if (body && typeof body === "object" && !(body instanceof FormData)) {
    if (!headers["Content-Type"]) headers["Content-Type"] = "application/json";
    body = JSON.stringify(body);
  }

  const response = await fetch(toUrl(pathOrUrl), {
    ...options,
    method,
    headers,
    body,
    credentials: "include"
  });

  let payload = null;
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    try {
      payload = await response.json();
    } catch (err) {
      payload = null;
    }
  } else {
    try {
      payload = await response.text();
    } catch (err) {
      payload = null;
    }
  }

  if (response.status === 401) {
    redirectLoginIfNeeded();
  }
  if (!response.ok) {
    throw new ApiError(resolveMessage(payload, `Request failed (${response.status})`), response.status, payload);
  }
  return payload;
}

export function getCurrentUser() {
  return request("/auth/me");
}

export function logout() {
  return request("/auth/logout", { method: "POST" });
}

export async function getPatients() {
  const data = await request("/nurse/dashboard");
  return data?.items || [];
}

export async function getPatientDirectory() {
  const rows = await request("/patients");
  return Array.isArray(rows) ? rows : [];
}

export function getPatientRecord(patientId) {
  return request(`/patients/${patientId}`).catch(async (err) => {
    if (err instanceof ApiError && (err.status === 404 || err.status === 405)) {
      const rows = await request("/patients");
      if (!Array.isArray(rows)) return null;
      return rows.find((row) => Number(row.id) === Number(patientId)) || null;
    }
    throw err;
  });
}

export function getPatientLogs(patientId) {
  return request(`/patients/${patientId}/all-logs`);
}

export function saveDoctorNote(patientId, logId, note) {
  return request(`/patients/${patientId}/logs/${logId}/note`, {
    method: "PUT",
    body: { note }
  });
}

export function getPatientDetails(patientId, selectedDate) {
  const suffix = selectedDate ? `?selected_date=${encodeURIComponent(selectedDate)}` : "";
  return request(`/nurse/patient/${patientId}${suffix}`);
}

export function getDailyReport() {
  return request("/reports/daily");
}

export function getOverviewReport(date = "") {
  const suffix = date ? `?report_date=${encodeURIComponent(date)}` : "";
  return request(`/reports/overview${suffix}`);
}

export function getSystemReport() {
  return request("/reports/system");
}

export function getScheduler() {
  return request("/scheduler");
}

export function getUserOptions() {
  return request("/auth/users/options");
}

export async function getAssignments(patientId = null) {
  const suffix = patientId ? `?patient_id=${encodeURIComponent(patientId)}` : "";
  const list = await request(`/care/assignments${suffix}`);
  return Array.isArray(list) ? list : [];
}

export async function getMedicationReminders(patientId) {
  const suffix = patientId ? `?patient_id=${encodeURIComponent(patientId)}` : "";
  const list = await request(`/care/medication/reminders${suffix}`);
  return Array.isArray(list) ? list : [];
}

export async function getInterventions(patientId = null) {
  const suffix = patientId ? `?patient_id=${encodeURIComponent(patientId)}` : "";
  const list = await request(`/care/interventions${suffix}`);
  return Array.isArray(list) ? list : [];
}

export function createIntervention(payload) {
  return request("/care/interventions", { method: "POST", body: payload });
}

export function upsertAssignment(payload) {
  return request("/care/assignments", { method: "POST", body: payload });
}

export function overrideRisk(payload) {
  return request("/care/risk-override", { method: "POST", body: payload });
}

export function correctResponse(payload) {
  console.log('API Request (js/api.js): POST /care/response-correction', payload);
  return request("/care/response-correction", { method: "POST", body: payload });
}

export function confirmCall(patientId, selectedDate) {
  return request(`/nurse/patient/${patientId}/actions/trigger-call`, {
    method: "POST",
    body: { selected_date: selectedDate || null }
  });
}

export function triggerManualCall(phoneNumber, patientId) {
  return request(`/call/${encodeURIComponent(phoneNumber)}?patient_id=${encodeURIComponent(patientId)}`, {
    method: "POST"
  });
}

export function addReminder(patientId, payload) {
  return request(`/nurse/patient/${patientId}/actions/send-reminder`, {
    method: "POST",
    body: payload
  });
}

export function addNote(patientId, payload) {
  return request(`/nurse/patient/${patientId}/actions/add-note`, {
    method: "POST",
    body: payload
  });
}

export async function getPendingAccessRequests() {
  const list = await request("/auth/requests");
  return Array.isArray(list) ? list : [];
}

export function approveAccessRequest(userId) {
  return request(`/auth/requests/${userId}/approve`, { method: "POST" });
}

export function rejectAccessRequest(userId) {
  return request(`/auth/requests/${userId}/reject`, { method: "POST" });
}

export async function getAdminEvents(limit = 50) {
  const list = await request(`/admin/events?limit=${encodeURIComponent(limit)}`);
  return Array.isArray(list) ? list : [];
}

export function getSecurityMetrics() {
  return request("/admin/security");
}

export async function getCareAudit(limit = 50) {
  const list = await request(`/care/audit?limit=${encodeURIComponent(limit)}`);
  return Array.isArray(list) ? list : [];
}

export async function getStaffUsers() {
  const list = await request("/admin/staff");
  return Array.isArray(list) ? list : [];
}
