const ID_MASK_SALT = "cp-nurse-workspace";

export function todayISO() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function normalizeDateInput(value) {
  const raw = String(value || "").trim();
  if (!raw) return todayISO();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!match) return todayISO();
  const candidate = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(candidate.getTime())) return todayISO();
  return raw;
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function formatDate(value) {
  if (!value) return "--";
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "--";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

export function formatDateTime(value) {
  if (!value) return "--";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "--";
  return d.toLocaleString();
}

export function riskLevel(level) {
  const v = String(level || "").toLowerCase();
  if (v === "critical" || v === "high") return "high";
  if (v === "monitor" || v === "medium") return "medium";
  return "low";
}

export function riskDotClass(level) {
  const tone = riskLevel(level);
  if (tone === "high") return "risk-dot risk-dot-high";
  if (tone === "medium") return "risk-dot risk-dot-medium";
  return "risk-dot risk-dot-low";
}

export function riskBadgeClass(level) {
  const tone = riskLevel(level);
  if (tone === "high") return "badge badge-danger";
  if (tone === "medium") return "badge badge-warn";
  return "badge badge-ok";
}

export function riskLabel(level) {
  const tone = riskLevel(level);
  if (tone === "high") return "High";
  if (tone === "medium") return "Monitor";
  return "Stable";
}

export function getStoredToken() {
  return sessionStorage.getItem("auth_token") || localStorage.getItem("auth_token") || "";
}

export function showToast(message, type = "success", timeoutMs = 2800) {
  const previous = document.querySelector(".toast");
  if (previous) previous.remove();

  const toast = document.createElement("div");
  toast.className = `toast ${type === "error" ? "error" : "success"}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  window.setTimeout(() => toast.remove(), timeoutMs);
}

function toBase64Url(raw) {
  return btoa(raw).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function fromBase64Url(raw) {
  const padded = raw.replaceAll("-", "+").replaceAll("_", "/") + "===".slice((raw.length + 3) % 4);
  return atob(padded);
}

export function maskPatientId(patientId) {
  const numeric = Number(patientId);
  if (!Number.isInteger(numeric) || numeric < 1) return "";
  return toBase64Url(`${numeric}:${ID_MASK_SALT}`);
}

export function unmaskPatientId(masked) {
  if (!masked) return null;
  try {
    const decoded = fromBase64Url(masked);
    const [idRaw, salt] = decoded.split(":");
    const idNum = Number(idRaw);
    if (salt !== ID_MASK_SALT || !Number.isInteger(idNum) || idNum < 1) return null;
    return idNum;
  } catch (err) {
    return null;
  }
}

export function debounce(fn, delayMs = 200) {
  let timeout = null;
  return (...args) => {
    window.clearTimeout(timeout);
    timeout = window.setTimeout(() => fn(...args), delayMs);
  };
}
