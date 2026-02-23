import * as api from "./api.js";
import { openFormModal, initModals } from "./modals.js";
import { createPatientList } from "./patients.js";
import {
  debounce,
  escapeHtml,
  formatDate,
  formatDateTime,
  maskPatientId,
  normalizeDateInput,
  riskLabel,
  showToast,
  todayISO,
  unmaskPatientId
} from "./utils.js";

const SETTINGS_KEY = "nurse_workspace_settings";

function clearClientAuth() {
  localStorage.removeItem("auth_token");
  localStorage.removeItem("auth_role");
  localStorage.removeItem("auth_name");
  sessionStorage.removeItem("auth_token");
  sessionStorage.removeItem("auth_role");
  sessionStorage.removeItem("auth_name");
}

async function doLogout() {
  try {
    await api.logout();
  } catch (err) {
    // Ignore logout response failures and clear local auth state anyway.
  }
  clearClientAuth();
  window.location.href = "login.html";
}

function readSettings() {
  try {
    const raw = sessionStorage.getItem(SETTINGS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (err) {
    return {};
  }
}

function saveSettings(next) {
  sessionStorage.setItem(SETTINGS_KEY, JSON.stringify(next || {}));
}

function isoFromDateTimeLocal(value) {
  if (!value) return null;
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString();
}

function renderSidebar(activePage, user) {
  const sidebar = document.getElementById("sidebar");
  if (!sidebar) return;
  sidebar.className = "sidebar-shell hidden md:block md:w-64 p-4";
  sidebar.innerHTML = `
    <div class="sidebar-brand">
      <span class="sidebar-brand-dot"></span>
      <span>CarePulse Nurse</span>
    </div>
    <div class="mt-6 text-xs uppercase tracking-wide text-slate-500">Navigation</div>
    <nav class="mt-2 space-y-1">
      <a href="index.html" class="nav-link ${activePage === "workspace" ? "active" : ""}">Workspace</a>
      <a href="profile.html" class="nav-link ${activePage === "profile" ? "active" : ""}">Profile</a>
      <a href="settings.html" class="nav-link ${activePage === "settings" ? "active" : ""}">Settings</a>
    </nav>
    <div class="mt-10 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
      Signed in as <span class="font-semibold text-slate-700">${escapeHtml(user?.name || "Nurse")}</span>
    </div>
  `;
}

function renderTopbar(user, withWorkspaceControls) {
  const topbar = document.getElementById("topbar");
  if (!topbar) return {};
  topbar.className = "topbar-shell px-3 py-3 md:px-5";

  topbar.innerHTML = `
    <div class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
      <div class="${withWorkspaceControls ? "w-full md:w-80" : "hidden"}">
        <input
          id="patientSearch"
          type="search"
          placeholder="Search patient"
          class="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
        />
      </div>
      <div class="flex items-center justify-between gap-2 md:justify-end md:gap-3 w-full md:w-auto">
        <input
          type="date"
          id="dateSelector"
          class="${withWorkspaceControls ? "" : "hidden"} rounded-lg border border-slate-200 px-3 py-2 text-sm"
        />
        <div class="relative">
          <button
            id="notifBtn"
            class="app-btn app-btn-ghost"
            type="button"
            aria-label="Notifications"
          >
            Notifications <span id="notifCount" class="font-semibold">0</span>
          </button>
          <div
            id="notifPanel"
            class="hidden absolute right-0 top-full mt-2 w-72 rounded-xl border border-slate-200 bg-white p-3 shadow-md text-sm text-slate-600"
          ></div>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-sm font-semibold">${escapeHtml(user?.name || "Clinician")}</span>
          <button id="logoutBtn" type="button" class="app-btn app-btn-ghost text-xs">Logout</button>
        </div>
      </div>
    </div>
  `;

  const refs = {
    searchInput: topbar.querySelector("#patientSearch"),
    dateSelector: topbar.querySelector("#dateSelector"),
    notifBtn: topbar.querySelector("#notifBtn"),
    notifCount: topbar.querySelector("#notifCount"),
    notifPanel: topbar.querySelector("#notifPanel"),
    logoutBtn: topbar.querySelector("#logoutBtn")
  };

  if (refs.logoutBtn) {
    refs.logoutBtn.addEventListener("click", doLogout);
  }
  if (refs.notifBtn && refs.notifPanel) {
    refs.notifBtn.addEventListener("click", () => {
      refs.notifPanel.classList.toggle("hidden");
    });
    document.addEventListener("click", (event) => {
      if (!refs.notifPanel) return;
      if (!refs.notifPanel.contains(event.target) && event.target !== refs.notifBtn) {
        refs.notifPanel.classList.add("hidden");
      }
    });
  }
  return refs;
}

function roleHome(role) {
  if (role === "admin") return "admin.html";
  if (role === "doctor") return "home.html";
  if (role === "staff") return "staff-overview.html";
  return "index.html";
}

function renderEmptyPanel(panelEl, message) {
  panelEl.className = "flex-1 overflow-y-auto p-4 md:p-6";
  panelEl.innerHTML = `
    <section class="app-card p-6">
      <p class="text-sm text-slate-500">${escapeHtml(message)}</p>
    </section>
  `;
}

function parseMedicationPlan(textValue) {
  const text = String(textValue || "");
  return text
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function shortGender(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw.startsWith("m")) return "M";
  if (raw.startsWith("f")) return "F";
  if (!raw) return "--";
  return raw.slice(0, 1).toUpperCase();
}

function dailyCardTone(kind, rawValue) {
  const value = String(rawValue || "").toLowerCase();
  if (kind === "ivr") return value.includes("answered") ? "ok" : value.includes("missed") ? "bad" : "warn";
  if (kind === "medication") return value.includes("taken") ? "ok" : value.includes("not taken") ? "bad" : "warn";
  if (kind === "reminder") return value.includes("sent") ? "ok" : value.includes("not sent") ? "warn" : "warn";
  if (kind === "followup") return value.includes("required") ? "bad" : "ok";
  return "warn";
}

function cardValueClass(tone) {
  if (tone === "ok") return "text-emerald-700";
  if (tone === "bad") return "text-rose-700";
  return "text-amber-700";
}

function initials(name) {
  const text = String(name || "").trim();
  if (!text) return "P";
  const parts = text.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return `${parts[0].slice(0, 1)}${parts[1].slice(0, 1)}`.toUpperCase();
}

function responseTypeForRow(row) {
  const type = String(row?.response_type || "").toLowerCase();
  if (type) return type;
  const structured = row?.structured_data;
  if (structured && typeof structured === "object") {
    if (Object.prototype.hasOwnProperty.call(structured, "trend")) return "trend";
    if (Object.prototype.hasOwnProperty.call(structured, "answer")) return "choice";
  }
  return "choice";
}

function responseToneClass(level) {
  const value = String(level || "").toLowerCase();
  if (value === "critical" || value === "high") return "risk-chip risk-chip-high";
  if (value === "monitor" || value === "medium") return "risk-chip risk-chip-medium";
  return "risk-chip risk-chip-low";
}

function responseLabel(level) {
  const value = String(level || "").toLowerCase();
  if (value === "critical" || value === "high") return "High";
  if (value === "monitor" || value === "medium") return "Medium";
  return "Low";
}

function normalizeResponseRow(row) {
  const responseType = responseTypeForRow(row);
  const rawText = row?.raw_text || row?.full_response || row?.summary_answer || "-";
  const severity = row?.severity || (row?.red_flag ? "critical" : "stable");
  return {
    intent_id: row?.intent_id || "",
    question: row?.question || row?.intent_id || "Response",
    response_type: responseType,
    raw_text: rawText,
    model_label: row?.label || row?.question || row?.intent_id || "--",
    structured_data: row?.structured_data || {},
    confidence: row?.confidence,
    red_flag: Boolean(row?.red_flag),
    severity,
    review_status: row?.review_status || null,
    corrected_answer: row?.corrected_answer || "",
    corrected_trend: row?.corrected_trend || "",
    corrected_reason: row?.corrected_reason || ""
  };
}

function renderWorkspacePanel(panelEl, state) {
  const details = state.details || {};
  const profile = state.profile || {};
  const header = details.profile_header || {};
  const daily = details.daily_status || {};
  const reviewRows = Array.isArray(state.reviewRows) ? state.reviewRows : [];
  const selectedLog = state.selectedLog || null;
  const doctorNotes = (details.daily_notes?.items || []).filter((item) => String(item.author || "").toLowerCase() === "doctor");
  const masked = maskPatientId(state.currentPatientId);
  const age = header.age ?? profile.age ?? "--";
  const gender = shortGender(header.gender || profile.gender);
  const day = header.monitoring_day ?? "--";
  const totalDays = header.monitoring_total_days ?? profile.days_to_monitor ?? "--";
  const riskText = riskLabel(header.status);
  const followupValue = daily.follow_up_required ? "Required" : "Not Required";
  const quickProfile = [
    ["Diagnosis", profile.diagnosis || profile.disease_track || "--"],
    ["Program", profile.protocol || "--"],
    ["Hospital", profile.primary_hospital || profile.hospital || "--"]
  ];
  const statusCards = [
    { key: "ivr", title: "IVR", value: daily.ivr_call || "--" },
    { key: "medication", title: "Meds", value: daily.medication || "--" },
    { key: "reminder", title: "Reminder", value: daily.reminder || "--" },
    { key: "followup", title: "Follow-up", value: followupValue }
  ];

  panelEl.className = "flex-1 overflow-y-auto p-4 md:p-6";
  panelEl.innerHTML = `
    <div class="space-y-4">
      <section class="app-card p-5">
        <div id="patientHeader" class="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 class="text-xl font-bold">${escapeHtml(header.patient_name || `Patient ${state.currentPatientId}`)}</h2>
            <p class="text-sm text-slate-600">
              ${escapeHtml(String(age))} ${escapeHtml(gender)} | Day ${escapeHtml(String(day))}/${escapeHtml(String(totalDays))} | ${escapeHtml(riskText)} Risk
            </p>
          </div>
          <a href="${masked ? `profile.html?p=${encodeURIComponent(masked)}` : "profile.html"}" class="app-link text-sm">View Full Profile -></a>
        </div>
      </section>

      <section class="app-card p-5">
        <h3 class="section-title">Today's Status</h3>
        <div class="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
          ${statusCards
            .map((card) => {
              const tone = dailyCardTone(card.key, card.value);
              return `
                <div class="rounded-xl border border-slate-200 bg-white p-3">
                  <div class="text-xs uppercase tracking-wide text-slate-500">${escapeHtml(card.title)}</div>
                  <div class="mt-1 text-lg font-semibold ${cardValueClass(tone)}">${escapeHtml(card.value)}</div>
                </div>
              `;
            })
            .join("")}
        </div>
      </section>

      <section id="doctorNotes" class="app-card p-5">
        <h3 class="section-title">Doctor Notes (Today)</h3>
        <div class="mt-3">
          ${
            doctorNotes.length
              ? doctorNotes
                  .map(
                    (item) => `
                      <div class="rounded-lg border border-slate-200 p-3 text-sm mb-2">
                        <div class="text-xs text-slate-500">${escapeHtml(formatDateTime(item.time))}</div>
                        <div class="mt-1">${escapeHtml(item.note || "-")}</div>
                      </div>
                    `
                  )
                  .join("")
              : '<div class="text-sm text-slate-500">No doctor notes recorded for selected date.</div>'
          }
        </div>
      </section>

      <section class="app-card p-5">
        <h3 class="section-title">Response Review</h3>
        <p class="section-subtle mt-1">Raw IVR response and model interpretation with nurse correction.</p>
        <div class="mt-3 space-y-3">
          ${
            !reviewRows.length
              ? !selectedLog
                ? '<div class="text-sm text-slate-500">No call log found for selected date.</div>'
                : '<div class="text-sm text-slate-500">No IVR responses available for this call.</div>'
              : reviewRows
                  .map((row) => {
                    const responseType = responseTypeForRow(row);
                    const previousCorrection = responseType === "trend" ? row.corrected_trend : row.corrected_answer;
                    return `
                      <article class="rounded-lg border border-slate-200 p-3" data-review-item data-intent="${escapeHtml(row.intent_id || "")}" data-response-type="${escapeHtml(responseType)}">
                        <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
                          <div class="space-y-2">
                            <div class="text-xs uppercase tracking-wide text-slate-500">${escapeHtml(row.question || "Prompt")}</div>
                            <div class="rounded-lg border border-slate-200 bg-slate-50 p-2 text-sm">${escapeHtml(row.raw_text || "-")}</div>
                            <div class="text-xs text-slate-600">
                              Model: <span class="font-semibold">${escapeHtml(row.model_label || "--")}</span>
                              ${row.confidence == null ? "" : `<span class="text-slate-500">(${escapeHtml(String(Math.round(Number(row.confidence))))}% confidence)</span>`}
                            </div>
                            <div class="flex items-center gap-2">
                              <span class="${responseToneClass(row.severity)}">${escapeHtml(responseLabel(row.severity))}</span>
                              ${row.red_flag ? '<span class="text-xs text-rose-700">Flagged</span>' : ""}
                            </div>
                          </div>
                          <div class="space-y-2">
                            <div class="text-xs uppercase tracking-wide text-slate-500">Nurse Correction</div>
                            ${
                              responseType === "yes_no"
                                ? `
                                    <select data-field="answer" class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
                                      <option value="">Select answer</option>
                                      <option value="yes" ${previousCorrection === "yes" ? "selected" : ""}>Yes</option>
                                      <option value="no" ${previousCorrection === "no" ? "selected" : ""}>No</option>
                                    </select>
                                  `
                                : responseType === "trend"
                                  ? `
                                    <select data-field="trend" class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
                                      <option value="">Select trend</option>
                                      <option value="better" ${previousCorrection === "better" ? "selected" : ""}>Better</option>
                                      <option value="same" ${previousCorrection === "same" ? "selected" : ""}>Same</option>
                                      <option value="worse" ${previousCorrection === "worse" ? "selected" : ""}>Worse</option>
                                    </select>
                                  `
                                  : `
                                    <input
                                      type="text"
                                      data-field="answer"
                                      value="${escapeHtml(previousCorrection || "")}"
                                      placeholder="Correct interpretation"
                                      class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                                    />
                                  `
                            }
                            <textarea
                              data-field="corrected_text"
                              rows="2"
                              placeholder="Correct transcript (optional)"
                              class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                            ></textarea>
                            <textarea
                              data-field="reason"
                              rows="2"
                              placeholder="Clinical reason"
                              class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                            >${escapeHtml(row.corrected_reason || "")}</textarea>
                            <div class="flex flex-wrap gap-2">
                              <button type="button" class="app-btn app-btn-soft" data-action="saveCorrection">Save Correction</button>
                              <button type="button" class="app-btn app-btn-ghost" data-action="escalateResponse">Escalate</button>
                            </div>
                          </div>
                        </div>
                      </article>
                    `;
                  })
                  .join("")
          }
        </div>
      </section>

      <section class="app-card p-5">
        <h3 class="section-title">Nurse Actions</h3>
        <div class="mt-3 flex flex-wrap gap-2">
          <button type="button" class="app-btn app-btn-primary" data-action="confirmCall">Call Patient</button>
          <button type="button" class="app-btn app-btn-soft" data-action="addReminder">Add Reminder</button>
          <button type="button" class="app-btn app-btn-ghost" data-action="addNote">Add Nurse Note</button>
        </div>
      </section>

      <section class="app-card p-5">
        <button class="collapse-toggle" data-toggle="quickProfileBox" data-label="Basic Info">> Basic Info</button>
        <div id="quickProfileBox" class="hidden mt-3">
          <div class="grid grid-cols-1 gap-3 md:grid-cols-3">
            ${quickProfile
              .map(
                ([label, value]) => `
                  <div class="rounded-lg border border-slate-200 p-3">
                    <div class="text-xs uppercase tracking-wide text-slate-500">${escapeHtml(label)}</div>
                    <div class="mt-1 text-sm font-semibold">${escapeHtml(String(value || "--"))}</div>
                  </div>
                `
              )
              .join("")}
          </div>
        </div>
      </section>
    </div>
  `;
}

function bindPanelInteractions(panelEl, handlers) {
  panelEl.querySelectorAll("[data-toggle]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetId = btn.dataset.toggle;
      const label = btn.dataset.label || "Section";
      const target = panelEl.querySelector(`#${targetId}`);
      if (!target) return;
      target.classList.toggle("hidden");
      btn.textContent = `${target.classList.contains("hidden") ? ">" : "v"} ${label}`;
    });
  });

  panelEl.querySelectorAll("[data-action]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const action = btn.dataset.action;
      if (action === "confirmCall") return handlers.confirmCall();
      if (action === "addReminder") return handlers.addReminder();
      if (action === "addNote") return handlers.addNote();
      if (action === "saveCorrection") {
        const card = btn.closest("[data-review-item]");
        if (!card) return null;
        const responseType = String(card.dataset.responseType || "choice").toLowerCase();
        const answerEl = card.querySelector('[data-field="answer"]');
        const trendEl = card.querySelector('[data-field="trend"]');
        const reasonEl = card.querySelector('[data-field="reason"]');
        const correctedTextEl = card.querySelector('[data-field="corrected_text"]');
        return handlers.saveCorrection({
          intentId: card.dataset.intent || "",
          responseType,
          answer: answerEl ? String(answerEl.value || "").trim().toLowerCase() : "",
          trend: trendEl ? String(trendEl.value || "").trim().toLowerCase() : "",
          reason: reasonEl ? String(reasonEl.value || "").trim() : "",
          correctedText: correctedTextEl ? String(correctedTextEl.value || "").trim() : ""
        });
      }
      if (action === "escalateResponse") {
        const card = btn.closest("[data-review-item]");
        if (!card) return null;
        const reasonEl = card.querySelector('[data-field="reason"]');
        return handlers.escalateResponse({
          intentId: card.dataset.intent || "",
          responseType: String(card.dataset.responseType || "choice").toLowerCase(),
          reason: reasonEl ? String(reasonEl.value || "").trim() : ""
        });
      }
      return null;
    });
  });
}

function updateNotifications(topbarRefs, rows) {
  if (!topbarRefs?.notifCount || !topbarRefs?.notifPanel) return;
  const list = Array.isArray(rows) ? rows : [];
  const followup = list.filter((row) => row.follow_up_required);
  topbarRefs.notifCount.textContent = String(followup.length);
  if (!followup.length) {
    topbarRefs.notifPanel.innerHTML = `<div class="text-slate-500">No pending follow-ups.</div>`;
    return;
  }
  topbarRefs.notifPanel.innerHTML = followup
    .slice(0, 8)
    .map(
      (row) => `
        <div class="rounded-lg border border-slate-200 px-3 py-2 mb-2">
          <div class="font-semibold text-slate-800">${escapeHtml(row.patient_name || `Patient ${row.patient_id}`)}</div>
          <div class="text-xs text-slate-500">${escapeHtml(riskLabel(row.risk_level))} risk | action needed</div>
        </div>
      `
    )
    .join("");
}

async function requireUser() {
  try {
    return await api.getCurrentUser();
  } catch (err) {
    window.location.href = "login.html";
    return null;
  }
}

export async function initWorkspace() {
  initModals(document.getElementById("modal"));

  const user = await requireUser();
  if (!user) return;
  if (user.role !== "nurse") {
    window.location.href = roleHome(user.role);
    return;
  }

  const settings = readSettings();
  const topbarRefs = renderTopbar(user, true);
  renderSidebar("workspace", user);

  const listSection = document.getElementById("patientList");
  const panelSection = document.getElementById("patientPanel");
  if (!listSection || !panelSection) return;

  const state = {
    selectedDate: normalizeDateInput(settings.defaultDate || todayISO()),
    currentPatientId: null,
    details: null,
    profile: null,
    reminders: [],
    logs: [],
    selectedLog: null,
    reviewRows: []
  };
  let requestToken = 0;

  if (topbarRefs.dateSelector) {
    topbarRefs.dateSelector.value = state.selectedDate;
  }

  const list = createPatientList(listSection, {
    onSelect: (id) => selectPatient(id)
  });

  function updateDateSelectorBounds(dateControl) {
    if (!topbarRefs.dateSelector || !dateControl) return;
    topbarRefs.dateSelector.value = dateControl.selected_date || state.selectedDate;
    if (dateControl.min_date) topbarRefs.dateSelector.min = dateControl.min_date;
    if (dateControl.max_date) topbarRefs.dateSelector.max = dateControl.max_date;
    state.selectedDate = normalizeDateInput(topbarRefs.dateSelector.value);
  }

  async function loadPatientData(patientId, selectedDate) {
    if (!patientId) return;
    const myToken = ++requestToken;
    panelSection.className = "flex-1 overflow-y-auto p-4 md:p-6";
    panelSection.innerHTML = `
      <section class="app-card p-6">
        <p class="text-sm text-slate-500">Loading patient data...</p>
      </section>
    `;

    try {
      let details = null;
      try {
        details = await api.getPatientDetails(patientId, selectedDate);
      } catch (err) {
        if (Number(err?.status) === 422 && selectedDate) {
          details = await api.getPatientDetails(patientId);
        } else {
          throw err;
        }
      }
      const [profile, reminders, logs] = await Promise.all([
        api.getPatientRecord(patientId),
        api.getMedicationReminders(patientId).catch(() => []),
        api.getPatientLogs(patientId).catch(() => [])
      ]);

      if (myToken !== requestToken) return;
      state.details = details;
      state.profile = profile;
      state.reminders = Array.isArray(reminders) ? reminders : [];
      state.logs = Array.isArray(logs) ? logs : [];
      const targetDate = details?.date_control?.selected_date || state.selectedDate;
      const dayLogs = state.logs.filter((entry) => String(entry?.created_at || "").slice(0, 10) === targetDate);
      const selectedLog = dayLogs.length
        ? dayLogs.slice().sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")))[0]
        : null;
      state.selectedLog = selectedLog;
      const logResponses = Array.isArray(selectedLog?.responses) ? selectedLog.responses.map(normalizeResponseRow) : [];
      if (logResponses.length) {
        state.reviewRows = logResponses;
      } else {
        const fallback = Array.isArray(details?.ivr_responses?.items) ? details.ivr_responses.items.map(normalizeResponseRow) : [];
        state.reviewRows = fallback;
      }
      updateDateSelectorBounds(details?.date_control);
      renderWorkspacePanel(panelSection, state);
      bindPanelInteractions(panelSection, {
        confirmCall: async () => {
          try {
            await api.confirmCall(state.currentPatientId, state.selectedDate);
            showToast("Call action sent.");
            await refreshPatientData();
          } catch (err) {
            showToast(err.message || "Unable to confirm call.", "error");
          }
        },
        addReminder: async () => {
          const values = await openFormModal({
            title: "Add reminder",
            description: "Create a medication reminder for the selected date.",
            confirmLabel: "Create",
            fields: [
              { name: "medication_name", label: "Medication", required: true, placeholder: "Atorvastatin" },
              { name: "dose", label: "Dose", placeholder: "10mg" },
              { name: "scheduled_for", label: "Schedule time", type: "datetime-local" }
            ]
          });
          if (!values) return;
          if (!values.medication_name) {
            showToast("Medication name is required.", "error");
            return;
          }
          try {
            await api.addReminder(state.currentPatientId, {
              medication_name: values.medication_name,
              dose: values.dose || null,
              selected_date: state.selectedDate,
              scheduled_for: isoFromDateTimeLocal(values.scheduled_for)
            });
            showToast("Reminder created.");
            await refreshPatientData();
            await refreshQueue();
          } catch (err) {
            showToast(err.message || "Unable to add reminder.", "error");
          }
        },
        addNote: async () => {
          const values = await openFormModal({
            title: "Add nurse note",
            confirmLabel: "Save",
            fields: [{ name: "note", label: "Note", type: "textarea", required: true, rows: 5 }]
          });
          if (!values) return;
          if (!values.note) {
            showToast("Note cannot be empty.", "error");
            return;
          }
          try {
            await api.addNote(state.currentPatientId, { note: values.note, selected_date: state.selectedDate });
            showToast("Note saved.");
            await refreshPatientData();
          } catch (err) {
            showToast(err.message || "Unable to add note.", "error");
          }
        },
        saveCorrection: async (payload) => {
          if (!state.selectedLog?.id) {
            showToast("No call log available for correction on selected date.", "error");
            return;
          }
          if (!payload.intentId) {
            showToast("Intent is missing for this response.", "error");
            return;
          }
          if (payload.responseType === "trend" && !payload.trend && !payload.correctedText) {
            showToast("Select a trend or add corrected transcript.", "error");
            return;
          }
          if (payload.responseType !== "trend" && !payload.answer && !payload.correctedText) {
            showToast("Provide corrected answer or corrected transcript.", "error");
            return;
          }
          try {
            await api.correctResponse({
              patient_id: state.currentPatientId,
              call_log_id: state.selectedLog.id,
              intent_id: payload.intentId,
              response_type: payload.responseType,
              answer: payload.answer || null,
              trend: payload.trend || null,
              corrected_text: payload.correctedText || null,
              reason: payload.reason || null
            });
            showToast("Response correction saved.");
            await refreshPatientData();
            await refreshQueue();
          } catch (err) {
            showToast(err.message || "Unable to save correction.", "error");
          }
        },
        escalateResponse: async (payload) => {
          if (!payload.intentId) {
            showToast("Unable to escalate without intent reference.", "error");
            return;
          }
          try {
            await api.createIntervention({
              patient_id: state.currentPatientId,
              type: "nurse_escalation",
              status: "planned",
              note: `Escalated response ${payload.intentId}${payload.reason ? `: ${payload.reason}` : ""}`
            });
            showToast("Escalation created.");
            await refreshQueue();
          } catch (err) {
            showToast(err.message || "Unable to escalate response.", "error");
          }
        }
      });
    } catch (err) {
      if (myToken !== requestToken) return;
      renderEmptyPanel(panelSection, err.message || "Unable to load patient data.");
    }
  }

  async function refreshPatientData() {
    if (!state.currentPatientId) return;
    await loadPatientData(state.currentPatientId, state.selectedDate);
  }

  async function selectPatient(patientId) {
    state.currentPatientId = patientId;
    list.setSelected(patientId);
    await loadPatientData(patientId, state.selectedDate);
  }

  async function refreshQueue() {
    try {
      const rows = await api.getPatients();
      list.setPatients(rows);
      updateNotifications(topbarRefs, rows);
      const activeExists = rows.some((item) => Number(item.patient_id) === Number(state.currentPatientId));
      if (!activeExists) state.currentPatientId = null;
      if (!state.currentPatientId && rows.length) {
        await selectPatient(Number(rows[0].patient_id));
        return;
      }
      if (!rows.length) {
        renderEmptyPanel(panelSection, "No patients assigned for today.");
      }
    } catch (err) {
      renderEmptyPanel(panelSection, err.message || "Unable to load patient queue.");
    }
  }

  if (topbarRefs.searchInput) {
    topbarRefs.searchInput.addEventListener(
      "input",
      debounce(() => {
        list.setSearch(topbarRefs.searchInput.value);
        const visible = list.getVisiblePatients();
        const hasCurrent = visible.some((row) => Number(row.patient_id) === Number(state.currentPatientId));
        if (!hasCurrent && visible.length) {
          selectPatient(Number(visible[0].patient_id));
        }
      }, 140)
    );
  }

  if (topbarRefs.dateSelector) {
    topbarRefs.dateSelector.addEventListener("change", async (event) => {
      state.selectedDate = normalizeDateInput(event.target.value);
      if (state.currentPatientId) {
        await refreshPatientData();
      }
    });
  }

  await refreshQueue();

  if (settings.autoRefreshQueue) {
    window.setInterval(() => {
      refreshQueue();
    }, 60000);
  }
}

export async function initProfilePage() {
  initModals(document.getElementById("modal"));
  const user = await requireUser();
  if (!user) return;
  if (user.role !== "nurse") {
    window.location.href = roleHome(user.role);
    return;
  }

  renderSidebar("profile", user);
  const topbarRefs = renderTopbar(user, false);
  updateNotifications(topbarRefs, []);

  const mount = document.getElementById("profilePageContent");
  if (!mount) return;

  const params = new URLSearchParams(window.location.search);
  const patientId = unmaskPatientId(params.get("p") || "");
  if (!patientId) {
    mount.innerHTML = `
      <div class="rounded-lg border border-slate-200 bg-slate-50 p-4">
        Select a patient in <a href="index.html" class="app-link">Workspace</a> and open full profile from that panel.
      </div>
    `;
    return;
  }

  mount.innerHTML = `<div class="text-slate-500">Loading patient profile...</div>`;
  try {
    const [details, profile, logs, reminders] = await Promise.all([
      api.getPatientDetails(patientId, todayISO()),
      api.getPatientRecord(patientId),
      api.getPatientLogs(patientId),
      api.getMedicationReminders(patientId)
    ]);

    const profileData = profile || {};
    const header = details.profile_header || {};
    const diagnosis = profileData.diagnosis || profileData.disease_track || "--";
    const program = profileData.protocol || "--";
    const hospital = profileData.primary_hospital || profileData.hospital || "Not recorded";
    const enrollmentDate = details.date_control?.min_date || null;
    const day = header.monitoring_day ?? "--";
    const totalDays = header.monitoring_total_days ?? profileData.days_to_monitor ?? "--";
    const callLogs = Array.isArray(logs)
      ? logs.slice().sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")))
      : [];
    const reminderRows = Array.isArray(reminders)
      ? reminders.slice().sort((a, b) => String(b.scheduled_for || "").localeCompare(String(a.scheduled_for || "")))
      : [];
    const medicationPlan = parseMedicationPlan(profileData.medications_text);
    const emergencyName = profileData.emergency_contact_name || "Not recorded";
    const emergencyRelation = profileData.emergency_contact_relation || "Not recorded";
    const emergencyPhone = profileData.emergency_contact_phone || "Not recorded";
    const patientName = profileData.name || header.patient_name || "--";
    const patientIdLabel = `CP-${String(header.patient_id || patientId).padStart(3, "0")}`;

    mount.innerHTML = `
      <div class="space-y-4">
        <a href="index.html" class="app-link text-sm inline-block">Back to Workspace</a>
        <section class="app-card p-5">
          <div class="flex flex-wrap items-start justify-between gap-4">
            <div class="flex items-center gap-3">
              <div class="h-14 w-14 rounded-full bg-emerald-50 text-emerald-700 font-bold flex items-center justify-center">
                ${escapeHtml(initials(patientName))}
              </div>
              <div>
                <div class="text-2xl font-bold leading-tight">
                  ${escapeHtml(patientName)}
                  <span class="text-base font-medium text-slate-500 ml-2">${escapeHtml(patientIdLabel)}</span>
                </div>
                <div class="text-sm text-slate-600">${escapeHtml(String(profileData.age ?? header.age ?? "--"))} ${escapeHtml(shortGender(profileData.gender || header.gender))}</div>
                <div class="text-sm text-slate-600">Diagnosis: <span class="font-semibold">${escapeHtml(diagnosis)}</span></div>
              </div>
            </div>
          </div>

          <div class="mt-4 border-b border-slate-200">
            <div id="profileTabs" class="flex gap-5 overflow-x-auto pb-2">
              <button class="text-sm font-semibold text-slate-500 whitespace-nowrap" data-tab="overview">Overview</button>
              <button class="text-sm font-semibold text-slate-500 whitespace-nowrap" data-tab="vitals">Vitals</button>
              <button class="text-sm font-semibold text-slate-500 whitespace-nowrap" data-tab="medications">Medications</button>
              <button class="text-sm font-semibold text-slate-500 whitespace-nowrap" data-tab="history">History</button>
              <button class="text-sm font-semibold text-slate-500 whitespace-nowrap" data-tab="contacts">Contacts</button>
            </div>
          </div>

          <div id="profileTabPanel" class="mt-4"></div>
        </section>
      </div>
    `;

    const tabPanel = mount.querySelector("#profileTabPanel");
    const tabButtons = Array.from(mount.querySelectorAll("[data-tab]"));
    if (!tabPanel || !tabButtons.length) return;

    const overviewRows = [
      ["Enrollment Date", enrollmentDate ? formatDate(enrollmentDate) : "Not recorded"],
      ["Program", program],
      ["Primary Hospital", hospital],
      ["Monitoring Status", `Day ${day}/${totalDays}`],
      ["Total Monitoring", `${totalDays} Days`],
      ["Assigned Doctor", header.assigned_doctor || "Not assigned"],
      ["Assigned Nurse", header.assigned_nurse || "Not assigned"],
      ["Phone", profileData.phone_number || "--"]
    ];

    function renderTabContent(tab) {
      if (tab === "overview") {
        return `
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            ${overviewRows
              .map(
                ([label, value]) => `
                  <div class="rounded-lg border border-slate-200 p-3">
                    <div class="text-xs uppercase tracking-wide text-slate-500">${escapeHtml(label)}</div>
                    <div class="mt-1 text-sm font-semibold">${escapeHtml(String(value || "--"))}</div>
                  </div>
                `
              )
              .join("")}
          </div>
        `;
      }

      if (tab === "vitals") {
        if (!callLogs.length) {
          return `<div class="text-sm text-slate-500">No vitals feed recorded yet.</div>`;
        }
        return `
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="text-left text-slate-500 border-b border-slate-200">
                  <th class="py-2 pr-3">Time</th>
                  <th class="py-2 pr-3">Risk</th>
                  <th class="py-2 pr-3">Call</th>
                  <th class="py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                ${callLogs
                  .slice(0, 20)
                  .map(
                    (log) => `
                      <tr class="border-b border-slate-100">
                        <td class="py-2 pr-3">${escapeHtml(formatDateTime(log.created_at))}</td>
                        <td class="py-2 pr-3">${log.risk_score == null ? "--" : `${Math.round(Number(log.risk_score))}%`}</td>
                        <td class="py-2 pr-3">${log.answered ? "Answered" : "Missed"}</td>
                        <td class="py-2">${escapeHtml(log.risk_level || log.status || "--")}</td>
                      </tr>
                    `
                  )
                  .join("")}
              </tbody>
            </table>
          </div>
        `;
      }

      if (tab === "medications") {
        return `
          <div class="space-y-4">
            <div>
              <div class="text-sm font-semibold">Medication Plan</div>
              ${
                medicationPlan.length
                  ? `<ul class="mt-2 list-disc pl-5 text-sm text-slate-700">
                      ${medicationPlan.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
                    </ul>`
                  : `<div class="mt-2 text-sm text-slate-500">No medication plan documented.</div>`
              }
            </div>

            <div>
              <div class="text-sm font-semibold">Reminder History</div>
              ${
                reminderRows.length
                  ? `<div class="mt-2 overflow-x-auto">
                      <table class="w-full text-sm">
                        <thead>
                          <tr class="text-left text-slate-500 border-b border-slate-200">
                            <th class="py-2 pr-3">Medication</th>
                            <th class="py-2 pr-3">Dose</th>
                            <th class="py-2 pr-3">Scheduled</th>
                            <th class="py-2">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          ${reminderRows
                            .slice(0, 25)
                            .map(
                              (item) => `
                                <tr class="border-b border-slate-100">
                                  <td class="py-2 pr-3">${escapeHtml(item.medication_name || "Medication")}</td>
                                  <td class="py-2 pr-3">${escapeHtml(item.dose || "--")}</td>
                                  <td class="py-2 pr-3">${escapeHtml(formatDateTime(item.scheduled_for))}</td>
                                  <td class="py-2">${escapeHtml(item.status || "--")}</td>
                                </tr>
                              `
                            )
                            .join("")}
                        </tbody>
                      </table>
                    </div>`
                  : `<div class="mt-2 text-sm text-slate-500">No reminder history available.</div>`
              }
            </div>
          </div>
        `;
      }

      if (tab === "history") {
        if (!callLogs.length) {
          return `<div class="text-sm text-slate-500">No call history available.</div>`;
        }
        return `
          <div class="space-y-3">
            ${callLogs
              .slice(0, 15)
              .map((log) => {
                const firstResponse = Array.isArray(log.responses) && log.responses.length ? log.responses[0] : null;
                return `
                  <div class="rounded-lg border border-slate-200 p-3">
                    <div class="flex flex-wrap items-center justify-between gap-2">
                      <div class="text-sm font-semibold">${escapeHtml(formatDateTime(log.created_at))}</div>
                      <div class="text-xs text-slate-500">${log.answered ? "Answered" : "Missed"} | ${escapeHtml(log.status || "--")}</div>
                    </div>
                    ${
                      log.doctor_note
                        ? `<div class="mt-2 text-sm text-slate-700"><span class="font-semibold">Doctor Note:</span> ${escapeHtml(log.doctor_note)}</div>`
                        : ""
                    }
                    ${
                      firstResponse
                        ? `<div class="mt-2 text-sm text-slate-600"><span class="font-semibold">IVR:</span> ${escapeHtml(firstResponse.raw_text || firstResponse.label || "-")}</div>`
                        : ""
                    }
                  </div>
                `;
              })
              .join("")}
          </div>
        `;
      }

      return `
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div class="rounded-lg border border-slate-200 p-4">
            <div class="text-xs uppercase tracking-wide text-slate-500">Emergency Contact</div>
            <div class="mt-1 text-base font-semibold">${escapeHtml(emergencyName)}</div>
            <div class="text-sm text-slate-600">${escapeHtml(emergencyRelation)}</div>
            <div class="text-sm text-slate-600 mt-1">${escapeHtml(emergencyPhone)}</div>
          </div>
          <div class="rounded-lg border border-slate-200 p-4">
            <div class="text-xs uppercase tracking-wide text-slate-500">Care Team</div>
            <div class="mt-1 text-sm text-slate-700"><span class="font-semibold">Doctor:</span> ${escapeHtml(header.assigned_doctor || "Not assigned")}</div>
            <div class="text-sm text-slate-700"><span class="font-semibold">Nurse:</span> ${escapeHtml(header.assigned_nurse || "Not assigned")}</div>
          </div>
        </div>
      `;
    }

    function activateTab(nextTab) {
      tabButtons.forEach((button) => {
        const active = button.dataset.tab === nextTab;
        button.className = active
          ? "text-sm font-semibold whitespace-nowrap border-b-2 border-emerald-600 text-slate-900 pb-2"
          : "text-sm font-semibold whitespace-nowrap text-slate-500 pb-2";
      });
      tabPanel.innerHTML = renderTabContent(nextTab);
    }

    tabButtons.forEach((button) => {
      button.addEventListener("click", () => activateTab(button.dataset.tab));
    });

    activateTab("overview");
  } catch (err) {
    mount.innerHTML = `<div class="text-red-700 text-sm">Unable to load patient profile: ${escapeHtml(err.message || "")}</div>`;
  }
}

export async function initSettingsPage() {
  initModals(document.getElementById("modal"));
  const user = await requireUser();
  if (!user) return;
  if (user.role !== "nurse") {
    window.location.href = roleHome(user.role);
    return;
  }

  renderSidebar("settings", user);
  renderTopbar(user, false);

  const mount = document.getElementById("settingsContent");
  if (!mount) return;

  const settings = readSettings();
  mount.innerHTML = `
    <form id="settingsForm" class="space-y-4">
      <label class="block">
        <span class="text-sm font-semibold text-slate-700">Default selected date</span>
        <input
          type="date"
          name="defaultDate"
          value="${escapeHtml(settings.defaultDate || todayISO())}"
          class="mt-1 w-full md:w-56 rounded-lg border border-slate-200 px-3 py-2 text-sm"
        />
      </label>

      <label class="flex items-center gap-2 text-sm">
        <input type="checkbox" name="autoRefreshQueue" ${settings.autoRefreshQueue ? "checked" : ""} />
        Refresh patient queue every 60 seconds
      </label>

      <label class="flex items-center gap-2 text-sm">
        <input type="checkbox" name="compactList" ${settings.compactList ? "checked" : ""} />
        Compact patient list layout
      </label>

      <div>
        <button type="submit" class="app-btn app-btn-primary">Save Settings</button>
      </div>
    </form>
  `;

  const form = mount.querySelector("#settingsForm");
  if (!form) return;

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const fd = new FormData(form);
    saveSettings({
      defaultDate: normalizeDateInput(String(fd.get("defaultDate") || todayISO())),
      autoRefreshQueue: fd.get("autoRefreshQueue") === "on",
      compactList: fd.get("compactList") === "on"
    });
    showToast("Settings saved.");
  });
}
