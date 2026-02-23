document.addEventListener("DOMContentLoaded", async () => {
  const backend = window.BACKEND_URL || "http://127.0.0.1:8000";
  const patientList = document.getElementById("patientsTable");
  const detailPanel = document.getElementById("detailPanel");
  const protocolFilter = document.getElementById("protocolFilter");
  const trackFilter = document.getElementById("trackFilter");
  const commandAlerts = document.getElementById("commandAlerts");
  const commandPending = document.getElementById("commandPending");
  const commandSync = document.getElementById("commandSync");
  const triageTabs = document.getElementById("triageTabs");
  const notifBtn = document.getElementById("notifBtn");
  const nurseNotificationsNav = document.getElementById("nurseNotificationsNav");
  const role = window.getRole ? window.getRole() : "";
  const endpoints = window.api?.endpoints || {};
  const patientUtils = window.patientUtils || {};
  const toTitleCase = patientUtils.toTitleCase || ((value) => String(value || ""));
  const displayTrack = patientUtils.displayTrack || ((value) => String(value || ""));
  const displayProtocol = patientUtils.displayProtocol || ((value) => String(value || ""));
  const riskLevel = patientUtils.riskLevel || ((score) => ((score ?? 0) >= 70 ? "high" : (score ?? 0) >= 40 ? "medium" : "low"));
  const riskColor = patientUtils.riskColor || ((level) => (level === "high" ? "bg-red-500" : level === "medium" ? "bg-amber-500" : "bg-green-500"));
  const formatPercent = patientUtils.formatPercent || ((value) => (value == null ? "--" : `${Math.round(value)}%`));
  const statusBadgeClass = patientUtils.statusBadgeClass || (() => "bg-panel text-muted");
  const statusLabel = patientUtils.statusLabel || (() => "Scheduled");
  const formatDateKey = patientUtils.formatDateKey || (() => "");
  const formatDayLabel = patientUtils.formatDayLabel || (() => "Unknown Day");
  const buildNurseTimeline = patientUtils.buildNurseTimeline || (() => ({ keys: [], days: new Map() }));
  const adherenceBadge = patientUtils.adherenceBadge || (() => ({ text: "Pending", cls: "bg-blue-50 text-info" }));

  let patients = [];
  let assignmentByPatient = new Map();
  const latestLogCache = new Map();
  const detailGate = window.createRequestGate ? window.createRequestGate() : null;
  const fallbackPageState = {
    listLoading: false,
    listError: "",
    detailLoading: false,
    detailError: ""
  };
  const pageStore = window.createStore ? window.createStore(fallbackPageState) : null;
  let selectedId = null;
  let activeTriage = "all";

  function getPageState() {
    return pageStore ? pageStore.getState() : fallbackPageState;
  }

  function setPageState(nextState) {
    if (pageStore) {
      pageStore.setState(nextState);
      return;
    }
    Object.assign(fallbackPageState, nextState);
  }

  function withBackend(pathOrUrl) {
    if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
    if (String(pathOrUrl).startsWith("/")) return `${backend}${pathOrUrl}`;
    return `${backend}/${pathOrUrl}`;
  }

  async function requestRaw(pathOrUrl, options = {}, config = {}) {
    if (window.api?.requestRaw) return window.api.requestRaw(pathOrUrl, options, config);
    return window.authFetch(withBackend(pathOrUrl), options);
  }

  async function requestJson(pathOrUrl, options = {}, config = {}) {
    if (window.api?.requestJson) return window.api.requestJson(pathOrUrl, options, config);
    const res = await requestRaw(pathOrUrl, options, config);
    const contentType = res.headers.get("content-type") || "";
    const body = contentType.includes("application/json") ? await res.json() : await res.text();
    if (!res.ok) {
      const detail = body && typeof body === "object" ? (body.detail || body.message) : "";
      throw new Error(detail || `Request failed (${res.status})`);
    }
    return body;
  }

  if (nurseNotificationsNav && notifBtn) {
    nurseNotificationsNav.addEventListener("click", (e) => {
      e.preventDefault();
      notifBtn.click();
    });
  }

  function ensureTrackOptions(rows) {
    if (!trackFilter) return;
    const tracks = Array.from(new Set(rows.map((p) => p.disease_track).filter(Boolean))).sort();
    trackFilter.innerHTML = `<option value="">All Tracks</option>` + tracks.map((t) => `<option value="${t}">${displayTrack(t)}</option>`).join("");
  }

  function ensureProtocolOptions(rows) {
    if (!protocolFilter) return;
    const protocols = Array.from(new Set(rows.map((p) => p.protocol).filter(Boolean))).sort();
    protocolFilter.innerHTML = `<option value="">All Protocols</option>` + protocols.map((p) => `<option value="${p}">${displayProtocol(p)}</option>`).join("");
  }

  async function loadPatients() {
    setPageState({ listLoading: true, listError: "" });
    renderList();
    try {
      const [patientRows, assignments] = await Promise.all([
        requestJson(endpoints.patients?.list || "/patients"),
        requestJson(endpoints.care?.assignments || "/care/assignments")
      ]);
      patients = Array.isArray(patientRows) ? patientRows : [];
      assignmentByPatient = new Map();
      (Array.isArray(assignments) ? assignments : []).forEach((a) => {
        if (!assignmentByPatient.has(a.patient_id)) assignmentByPatient.set(a.patient_id, a);
      });
      ensureTrackOptions(patients);
      ensureProtocolOptions(patients);

      const params = new URLSearchParams(window.location.search);
      const paramTrack = String(params.get("track") || "").trim().toLowerCase();
      if (paramTrack && trackFilter) {
        const trackOption = Array.from(trackFilter.options).find(
          (option) => String(option.value || "").trim().toLowerCase() === paramTrack
        );
        if (trackOption) trackFilter.value = trackOption.value;
      }

      setPageState({ listLoading: false, listError: "" });
      renderList();
      const alerts = patients.filter((p) => (p.risk_score ?? 0) >= 70);
      if (commandAlerts) commandAlerts.textContent = `${alerts.length} Alerts`;
      if (commandPending) {
        const pending = patients.filter((p) => (p.risk_score ?? 0) >= 40 && (p.risk_score ?? 0) < 70).length;
        commandPending.textContent = `${pending} Pending`;
      }
      if (commandSync) commandSync.textContent = `Updated ${new Date().toLocaleTimeString()}`;
      renderTriageTabs();

      const paramId = Number(params.get("patient_id") || "");
      if (!Number.isNaN(paramId) && paramId > 0 && patients.some((p) => p.id === paramId)) {
        selectedId = paramId;
        renderList();
        await renderDetail(paramId);
      }
    } catch (err) {
      console.error(err);
      setPageState({ listLoading: false, listError: "Failed to load patient list." });
      renderList();
      renderTriageTabs();
      if (commandSync) commandSync.textContent = "Update failed";
    }
  }

  function applyFilters(rows) {
    let filtered = [...rows];
    const protocol = protocolFilter?.value || "";
    const track = trackFilter?.value || "";
    if (activeTriage && activeTriage !== "all") {
      filtered = filtered.filter((p) => riskLevel(p.risk_score) === activeTriage);
    }
    if (protocol) filtered = filtered.filter((p) => p.protocol === protocol);
    if (track) filtered = filtered.filter((p) => p.disease_track === track);
    return filtered;
  }

  function renderTriageTabs() {
    if (!triageTabs) return;
    const counts = {
      all: patients.length,
      high: patients.filter((p) => riskLevel(p.risk_score) === "high").length,
      medium: patients.filter((p) => riskLevel(p.risk_score) === "medium").length,
      low: patients.filter((p) => riskLevel(p.risk_score) === "low").length
    };
    triageTabs.innerHTML = [
      { key: "all", label: `All (${counts.all})` },
      { key: "high", label: `High (${counts.high})` },
      { key: "medium", label: `Medium (${counts.medium})` },
      { key: "low", label: `Low (${counts.low})` }
    ].map((tab) => `
      <button class="triage-tab ${activeTriage === tab.key ? "active" : ""}" data-triage="${tab.key}">${tab.label}</button>
    `).join("");
    triageTabs.querySelectorAll("[data-triage]").forEach((btn) => {
      btn.addEventListener("click", () => {
        activeTriage = btn.dataset.triage;
        renderTriageTabs();
        renderList();
      });
    });
  }

  function renderList() {
    if (!patientList) return;
    const state = getPageState();
    if (state.listLoading) {
      patientList.innerHTML = window.ui?.loadingRows ? window.ui.loadingRows(6) : `<div class="text-sm text-muted">Loading patients...</div>`;
      return;
    }
    if (state.listError) {
      patientList.innerHTML = window.ui?.renderError(state.listError) || `<div class="text-sm text-critical">${state.listError}</div>`;
      return;
    }
    const filtered = applyFilters(patients).sort((a, b) => (b.risk_score ?? 0) - (a.risk_score ?? 0));
    if (!filtered.length) {
      patientList.innerHTML = window.ui?.renderEmpty("No patients found.") || `<div class="text-sm text-muted">No patients found.</div>`;
      return;
    }
    if (role === "nurse") {
      patientList.innerHTML = `
        <div class="grid grid-cols-[2fr_1fr_1fr_1.2fr] gap-2 px-2 py-2 text-xs uppercase tracking-widest text-muted">
          <div>Name</div>
          <div>Monitoring Period</div>
          <div>Last Response</div>
          <div>Assigned Doctor</div>
        </div>
      ` + filtered.map((p) => {
        const active = selectedId === p.id ? "bg-blue-50 border-blue-300" : "";
        const assignment = assignmentByPatient.get(p.id);
        const logData = latestLogCache.get(p.id);
        const dayX = logData?.logs?.length || "--";
        const dayY = logData?.logs?.length ? Math.max(14, logData.logs.length) : "--";
        const lastStatus = (logData?.latest?.answered === false) ? "No Response" : (p.risk_score != null ? "Received" : "Pending");
        return `
          <button class="w-full text-left border border-border rounded-lg p-3 hover:bg-panel ${active}" data-patient-id="${p.id}">
            <div class="grid grid-cols-[2fr_1fr_1fr_1.2fr] gap-2 text-sm items-center">
              <div class="font-medium text-gray-900">${p.name}</div>
              <div class="text-muted">Day ${dayX}/${dayY}</div>
              <div class="text-muted">${lastStatus}</div>
              <div class="text-muted">${assignment?.doctor_name || "Unassigned"}</div>
            </div>
          </button>
        `;
      }).join("");
      patientList.querySelectorAll("[data-patient-id]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const id = Number(btn.dataset.patientId);
          selectedId = id;
          renderList();
          await renderDetail(id);
        });
      });
      return;
    }
    patientList.innerHTML = filtered.map((p) => {
      const level = riskLevel(p.risk_score);
      const active = selectedId === p.id ? "bg-blue-50 border-blue-300" : "";
      return `
        <button class="w-full text-left border border-border rounded-xl p-4 hover:bg-panel ${active}" data-patient-id="${p.id}">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <span class="w-2 h-12 rounded ${riskColor(level)}"></span>
              <div>
                <div class="font-semibold text-gray-900">${p.name}</div>
                <div class="text-sm text-gray-500">${displayTrack(p.disease_track)}</div>
                <div class="text-xs text-gray-400">${displayProtocol(p.protocol)}</div>
              </div>
            </div>
            <div class="text-right">
              <div class="text-xs px-2 py-1 rounded-md ${level === "high" ? "bg-red-50 text-critical" : level === "medium" ? "bg-amber-50 text-warning" : "bg-green-50 text-success"}">${level === "high" ? "Danger" : level === "medium" ? "Monitor" : "Stable"}</div>
              <div class="text-sm font-medium text-gray-900 mt-1">${formatPercent(p.risk_score)}</div>
            </div>
          </div>
        </button>
      `;
    }).join("");

    patientList.querySelectorAll("[data-patient-id]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = Number(btn.dataset.patientId);
        selectedId = id;
        renderList();
        await renderDetail(id);
      });
    });
  }

  async function fetchLatestLog(patientId) {
    if (latestLogCache.has(patientId)) return latestLogCache.get(patientId);
    let logs = [];
    try {
      const logsPath = endpoints.patients?.allLogs
        ? endpoints.patients.allLogs(patientId)
        : `/patients/${patientId}/all-logs`;
      const rows = await requestJson(logsPath);
      logs = Array.isArray(rows) ? rows : [];
    } catch (err) {
      console.error(err);
    }
    const latest = logs[logs.length - 1] || null;
    const previous = logs.length > 1 ? logs[logs.length - 2] : null;
    const payload = { latest, previous, logs };
    latestLogCache.set(patientId, payload);
    return payload;
  }

  function renderResponses(latest) {
    const responses = latest?.responses || [];
    if (!responses.length) return `<div class="text-sm text-muted">No IVR responses.</div>`;
    return responses.map((r, idx) => {
      const detailId = `resp-detail-${idx}`;
      const reviewLabel = r.review_status === "confirmed"
        ? `<span class="text-xs px-2 py-1 rounded-md bg-green-50 text-success">Confirmed</span>`
        : r.review_status === "cleared"
          ? `<span class="text-xs px-2 py-1 rounded-md bg-amber-50 text-warning">Cleared</span>`
          : "";
      const hasCorrection = Boolean(r.corrected_answer || r.corrected_trend || r.corrected_reason);
      return `
      <div class="border border-border rounded-xl p-4">
        <div class="flex items-center justify-between">
          <div class="font-medium text-gray-900">${r.question || r.label || r.intent_id}</div>
          <div class="flex items-center gap-2">
            ${reviewLabel}
            <span class="text-xs px-2 py-1 rounded-md ${r.red_flag ? "bg-red-50 text-critical" : "bg-amber-50 text-warning"}">${r.red_flag ? "Critical" : "Monitor"}</span>
          </div>
        </div>
        <div class="text-sm text-gray-600 mt-2">Summary: ${r.raw_text || "-"}</div>
        <button class="detail-toggle mt-2" data-toggle-details data-target="${detailId}">Toggle details</button>
        <div id="${detailId}" class="hidden text-xs text-gray-500 mt-2 space-y-1">
          <div>Confidence: ${r.confidence ? r.confidence.toFixed(2) : "--"} | Domain: ${r.domain || "general"}</div>
          ${r.structured_data ? `<div>Structured: ${JSON.stringify(r.structured_data)}</div>` : ""}
          ${r.review_reason ? `<div>Review reason: ${r.review_reason}</div>` : ""}
          ${r.corrected_answer ? `<div>Corrected answer: ${r.corrected_answer}</div>` : ""}
          ${r.corrected_trend ? `<div>Corrected trend: ${r.corrected_trend}</div>` : ""}
          ${r.corrected_reason ? `<div>Correction: ${r.corrected_reason}</div>` : ""}
        </div>
        ${role === "nurse" && !hasCorrection ? `
        <div class="mt-3 flex gap-2">
          <button class="btn-secondary text-sm" data-correct-speech="${r.intent_id}">Speech Correction</button>
        </div>` : ``}
        ${role === "nurse" && hasCorrection ? `
        <div class="mt-3 border border-border rounded-lg p-3 bg-panel">
          <div class="text-xs uppercase tracking-widest text-muted">Corrected Speech</div>
          <div class="text-sm text-gray-700 mt-1">${r.raw_text || "-"}</div>
        </div>` : ``}
        ${role === "doctor" && (r.corrected_answer || r.corrected_trend || r.corrected_reason) ? `
        <div class="mt-3 flex gap-2">
          <button class="btn-secondary text-sm" data-view-edits="${r.intent_id}">View Edited Details</button>
        </div>` : ``}
        ${role === "doctor" ? `
        <div class="mt-3 flex gap-2">
          <button class="btn-primary text-sm" data-review-confirm="${r.intent_id}">Confirm Alert</button>
          <button class="btn-secondary text-sm" data-review-clear="${r.intent_id}">Clear Alert</button>
        </div>` : ``}
      </div>
    `;
    }).join("");
  }

  function renderExplainability(latest) {
    const factors = latest?.explanation?.top_factors || [];
    if (!factors.length) return `<div class="text-sm text-muted">No explainability factors.</div>`;
    return factors.map((f) => `
      <div class="border border-border rounded-xl p-4">
        <div class="flex items-center justify-between">
          <div class="font-medium text-gray-900">${f.label || f.feature}</div>
          <div class="text-sm text-gray-900">${Math.abs(Math.round((f.impact || 0) * 100))}%</div>
        </div>
        <div class="text-xs text-gray-400 mt-2">${f.direction === "increase" ? "Increases risk" : "Decreases risk"}</div>
      </div>
    `).join("");
  }

  function renderNurseWorkspace(patient, latest, logs, reminders, interventions, assignment) {
    const timeline = buildNurseTimeline(logs, reminders, interventions);
    const todayKey = formatDateKey(new Date().toISOString());
    const todayReminders = (reminders || []).filter((r) => formatDateKey(r.scheduled_for) === todayKey);
    const todayPrimary = todayReminders[0] || null;
    const badge = adherenceBadge(todayReminders);
    const dayX = logs.length || 1;
    const dayY = Math.max(14, logs.length || 14);
    const hasAssignedFollowup = (interventions || []).some((i) =>
      i.type === "nurse_followup_call" && ["assigned", "planned"].includes((i.status || "").toLowerCase())
    );
    const hasIvrFailed = todayReminders.some((r) => ["missed", "no_response"].includes((r.status || "").toLowerCase()));
    const pressedNotTaken = Boolean(
      (latest?.responses || []).some((r) => {
        const intent = String(r.intent_id || "").toLowerCase();
        const answer = String(r.structured_data?.answer || "").toLowerCase();
        return intent.includes("med_adherence") && answer === "no";
      })
    );
    const needsAction = hasAssignedFollowup || hasIvrFailed || pressedNotTaken;

    return `
      <div class="flex flex-col min-h-0 overflow-hidden">
        <div class="sticky top-0 z-10 bg-white border-b border-border px-4 py-3">
          <div class="flex items-center justify-between">
            <div>
              <div class="font-semibold text-gray-900">${patient.name} <span class="text-xs text-gray-400">| CP-${patient.id}</span></div>
              <div class="mt-2 flex flex-wrap gap-2 text-xs">
                <span class="px-2 py-1 rounded-md border border-border">Doctor: ${assignment?.doctor_name || "Unassigned"}</span>
                <span class="px-2 py-1 rounded-md border border-border">Day ${dayX} / ${dayY}</span>
                <span class="px-2 py-1 rounded-md ${badge.cls}">${badge.text}</span>
              </div>
            </div>
          </div>
        </div>

        <div class="flex-1 overflow-y-auto p-6 space-y-4">
          <section class="card-soft p-4">
            <div class="text-xs uppercase tracking-widest text-muted">Today's Snapshot</div>
            <div class="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <div class="border border-border rounded-lg p-3">
                <div class="text-xs text-muted">Today's medication</div>
                <div class="text-gray-900 mt-1">${todayPrimary ? `${todayPrimary.medication_name} ${todayPrimary.dose || ""}`.trim() : "No medication scheduled"}</div>
              </div>
              <div class="border border-border rounded-lg p-3">
                <div class="text-xs text-muted">Reminder sent</div>
                <div class="text-gray-900 mt-1">${todayReminders.some((r) => ["sms_sent", "call_placed", "taken", "missed", "no_response"].includes(r.status)) ? "Yes" : "No"}</div>
              </div>
              <div class="border border-border rounded-lg p-3">
                <div class="text-xs text-muted">IVR confirmation result</div>
                <div class="text-gray-900 mt-1">${badge.text}</div>
              </div>
              <div class="border border-border rounded-lg p-3">
                <div class="text-xs text-muted">Follow-up required</div>
                <div class="text-gray-900 mt-1">${needsAction ? "Yes" : "No"}</div>
              </div>
            </div>
          </section>

          <section class="card p-4">
            <div class="flex items-center justify-between">
              <div class="text-sm font-semibold text-ink">Monitoring Timeline</div>
              <div class="text-xs text-muted">Today expanded by default</div>
            </div>
            <div class="mt-3 space-y-3">
              ${timeline.keys.length ? timeline.keys.map((key) => {
      const day = timeline.days.get(key);
      const open = key === todayKey ? "open" : "";
      const muted = key === todayKey ? "" : "opacity-75";
      return `
                  <details ${open} class="border border-border rounded-lg ${muted}">
                    <summary class="px-3 py-2 cursor-pointer text-sm font-medium text-ink">${formatDayLabel(key)}</summary>
                    <div class="px-3 pb-3 space-y-2">
                      ${(day.reminders || []).map((r) => `
                        <div class="text-xs border border-border rounded-md p-2">
                          <div>${r.medication_name} ${r.dose || ""}</div>
                          <div class="text-muted mt-1">${window.formatTime(r.scheduled_for)} | ${statusLabel(r.status)}</div>
                        </div>
                      `).join("")}
                      ${(day.logs || []).map((l) => `
                        <div class="text-xs border border-border rounded-md p-2">
                          <div>IVR: ${l.answered ? "Answered" : "No Answer"} | ${l.press_result}</div>
                          <div class="text-muted mt-1">Risk: ${formatPercent(l.risk_score)} | Time: ${l.created_at ? window.formatTime(l.created_at) : "--"}</div>
                        </div>
                      `).join("")}
                      ${(day.notes || []).map((n) => `
                        <div class="text-xs border border-border rounded-md p-2">
                          <span class="font-medium">${n.role}</span>: ${n.text}
                        </div>
                      `).join("")}
                    </div>
                  </details>
                `;
    }).join("") : `<div class="text-sm text-muted">No timeline records.</div>`}
            </div>
          </section>

          <section class="card p-4">
            <div class="text-sm font-semibold text-ink">IVR Responses</div>
            <div class="mt-3 space-y-3">
              ${renderResponses(latest)}
            </div>
          </section>

          <section class="card p-4">
            <div class="flex items-center justify-between">
              <div class="text-sm font-semibold text-ink">Medication Management</div>
              <button class="btn-primary text-sm" data-action-add-reminder>Add Medication</button>
            </div>
            <div class="mt-3 space-y-2">
              ${(reminders || []).slice(0, 12).map((r) => `
                <div class="border border-border rounded-lg p-3">
                  <div class="flex items-center justify-between">
                    <div class="text-sm text-ink">${r.medication_name} ${r.dose || ""}</div>
                    <span class="text-xs px-2 py-1 rounded-md ${statusBadgeClass(r.status)}">${statusLabel(r.status)}</span>
                  </div>
                  <div class="text-xs text-muted mt-1">${window.formatTime(r.scheduled_for)}</div>
                  <div class="mt-2 flex gap-2">
                    <button class="btn-secondary text-xs" data-edit-reminder="${r.id}" data-dose="${r.dose || ""}" data-time="${r.scheduled_for || ""}">Edit Schedule</button>
                    <button class="btn-secondary text-xs" data-toggle-reminder="${r.id}" data-status="${r.status || "scheduled"}">${(r.status || "") === "paused" ? "Resume" : "Pause"}</button>
                  </div>
                </div>
              `).join("") || `<div class="text-sm text-muted">No medications configured.</div>`}
            </div>
          </section>

          ${needsAction ? `
          <section class="card p-4">
            <div class="text-sm font-semibold text-ink">Nurse Actions</div>
            <div class="text-xs text-muted mt-1">Action panel is visible because follow-up is needed.</div>
            <div class="mt-3 grid grid-cols-2 gap-2">
              <button class="btn-secondary text-sm" data-nurse-call-patient>Call Patient</button>
              <button class="btn-secondary text-sm" data-nurse-log-outcome>Log Outcome</button>
              <button class="btn-primary text-sm" data-nurse-mark-taken>Mark Taken</button>
              <button class="btn-secondary text-sm" data-nurse-mark-not-taken>Mark Not Taken</button>
            </div>
          </section>` : ``}

          <section class="card p-4">
            <div class="flex items-center justify-between">
              <div class="text-sm font-semibold text-ink">Notes</div>
              <button class="btn-secondary text-sm" data-nurse-add-note>Add Nurse Note</button>
            </div>
            <div class="mt-3 space-y-2">
              ${timeline.keys.flatMap((k) => timeline.days.get(k).notes || []).length
        ? timeline.keys.flatMap((k) => timeline.days.get(k).notes || [])
          .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")))
          .slice(0, 20)
          .map((n) => `
                      <div class="border border-border rounded-md p-2 text-xs">
                        <span class="font-medium">${n.role}</span>
                        <div class="mt-1">${n.text.replace(/^\[for [^\]]+\]\s*/, '')}</div>
                      </div>
                    `).join("")
        : `<div class="text-sm text-muted">No notes yet.</div>`}
            </div>
          </section>
        </div>
      </div>
    `;
  }

  function renderStaffWorkspace(patient, logs, reminders, assignment) {
    const sortedLogs = [...(logs || [])].sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
    const smsHistory = (reminders || [])
      .filter((r) => r.sms_sent_at)
      .sort((a, b) => String(b.sms_sent_at || "").localeCompare(String(a.sms_sent_at || "")));
    const confirmationHistory = (reminders || [])
      .filter((r) => r.call_placed_at)
      .sort((a, b) => String(b.call_placed_at || "").localeCompare(String(a.call_placed_at || "")));
    const missedMonitoring = sortedLogs.filter((l) => !l.answered || ["no_answer", "failed", "missed"].includes(String(l.status || "").toLowerCase()));
    const missedConfirmation = (reminders || [])
      .filter((r) => ["missed", "no_response"].includes(String(r.status || "").toLowerCase()))
      .sort((a, b) => String(b.call_placed_at || b.scheduled_for || "").localeCompare(String(a.call_placed_at || a.scheduled_for || "")));
    const missedCount = missedMonitoring.length + missedConfirmation.length;

    return `
      <div class="flex flex-col min-h-0 overflow-hidden">
        <div class="sticky top-0 z-10 bg-white border-b border-border px-4 py-3">
          <div class="flex items-center justify-between">
            <div>
              <div class="font-semibold text-gray-900">${patient.name} <span class="text-xs text-gray-400">| CP-${patient.id}</span></div>
              <div class="mt-2 flex flex-wrap gap-2 text-xs">
                <span class="px-2 py-1 rounded-md border border-border">Doctor: ${assignment?.doctor_name || "Unassigned"}</span>
                <span class="px-2 py-1 rounded-md border border-border">Calls: ${sortedLogs.length}</span>
                <span class="px-2 py-1 rounded-md ${missedCount ? "bg-amber-50 text-warning" : "bg-green-50 text-success"}">Missed: ${missedCount}</span>
              </div>
            </div>
          </div>
        </div>

        <div class="flex-1 overflow-hidden p-6">
          <section class="card p-4 h-full flex flex-col min-h-0">
            <div class="detail-tabs">
              <button class="detail-tab active" data-staff-main-tab="actions">Actions</button>
              <button class="detail-tab" data-staff-main-tab="history">History</button>
            </div>

            <div id="staff-main-actions" class="mt-3 flex-1 overflow-y-auto pr-2">
              <div class="text-sm font-semibold text-ink">Actions</div>
              <div class="mt-3 space-y-2">
                <button class="btn-secondary text-sm" data-staff-edit-patient>Edit Patient Details</button>
                <button class="btn-primary text-sm" data-staff-trigger-call>Call Now (Test Monitoring)</button>
                <div class="text-xs text-muted mt-2">Use this for quick monitoring call testing.</div>
              </div>
              <div class="mt-4 border border-border rounded-lg p-3">
                <div class="text-xs uppercase tracking-widest text-muted">Missed Monitoring Calls</div>
                <div class="mt-2 space-y-2">
                  ${missedMonitoring.length ? missedMonitoring.slice(0, 8).map((l) => `
                    <div class="border border-border rounded-md p-2">
                      <div class="flex items-center justify-between gap-2">
                        <div class="text-xs text-muted">${window.formatTime(l.created_at)}</div>
                        <button class="btn-primary text-xs" data-staff-call-now-monitoring="${l.id}">Call Now</button>
                      </div>
                      <div class="text-xs text-muted mt-1">Status: ${toTitleCase(l.status || "missed")}</div>
                    </div>
                  `).join("") : `<div class="text-sm text-muted">No missed monitoring calls.</div>`}
                </div>
              </div>
              <div class="mt-4 border border-border rounded-lg p-3">
                <div class="text-xs uppercase tracking-widest text-muted">Missed Confirmation Calls</div>
                <div class="mt-2 space-y-2">
                  ${missedConfirmation.length ? missedConfirmation.slice(0, 8).map((r) => `
                    <div class="border border-border rounded-md p-2">
                      <div class="flex items-center justify-between gap-2">
                        <div class="text-xs text-muted">${window.formatTime(r.call_placed_at || r.scheduled_for)}</div>
                        <button class="btn-primary text-xs" data-staff-call-now-confirmation="${r.id}">Call Now</button>
                      </div>
                      <div class="text-xs text-muted mt-1">${r.medication_name}${r.dose ? ` ${r.dose}` : ""}</div>
                    </div>
                  `).join("") : `<div class="text-sm text-muted">No missed confirmation calls.</div>`}
                </div>
              </div>
            </div>

            <div id="staff-main-history" class="mt-3 hidden flex-1 min-h-0 flex flex-col">
              <div class="flex items-center justify-between">
                <div class="text-sm font-semibold text-ink">History</div>
                <div class="text-xs text-muted">${sortedLogs.length} monitoring | ${confirmationHistory.length} confirmation</div>
              </div>
              <div class="detail-tabs mt-3">
                <button class="detail-tab active" data-staff-history-tab="monitoring">Monitoring Calls</button>
                <button class="detail-tab" data-staff-history-tab="confirmation">Confirmation Calls</button>
                <button class="detail-tab" data-staff-history-tab="sms">Messages Sent</button>
              </div>

              <div id="staff-history-monitoring" class="mt-3 flex-1 overflow-y-auto pr-2 space-y-2">
                ${sortedLogs.length ? sortedLogs.map((l) => `
                  <div class="border border-border rounded-lg p-3">
                    <div class="flex items-center justify-between">
                      <div class="text-sm text-gray-900">${window.formatTime(l.created_at)}</div>
                      <span class="text-xs px-2 py-1 rounded-md ${l.answered ? "bg-green-50 text-success" : "bg-amber-50 text-warning"}">${l.answered ? "Answered" : "Missed"}</span>
                    </div>
                    <div class="text-xs text-muted mt-1">Status: ${toTitleCase(l.status || "scheduled")} | Risk: ${formatPercent(l.risk_score)}</div>
                    <div class="text-xs text-muted mt-1">Start: ${l.started_at ? window.formatTime(l.started_at) : "--"} | End: ${l.ended_at ? window.formatTime(l.ended_at) : "--"}</div>
                  </div>
                `).join("") : `<div class="text-sm text-muted">No monitoring calls found.</div>`}
              </div>

              <div id="staff-history-confirmation" class="mt-3 hidden flex-1 overflow-y-auto pr-2 space-y-2">
                ${confirmationHistory.length ? confirmationHistory.map((r) => `
                  <div class="border border-border rounded-lg p-3">
                    <div class="flex items-center justify-between">
                      <div class="text-sm text-gray-900">${r.medication_name} ${r.dose || ""}</div>
                      <span class="text-xs px-2 py-1 rounded-md ${statusBadgeClass(r.status)}">${statusLabel(r.status)}</span>
                    </div>
                    <div class="text-xs text-muted mt-1">Call placed: ${window.formatTime(r.call_placed_at)}</div>
                    <div class="text-xs text-muted mt-1">Scheduled: ${window.formatTime(r.scheduled_for)}</div>
                  </div>
                `).join("") : `<div class="text-sm text-muted">No confirmation call history.</div>`}
              </div>

              <div id="staff-history-sms" class="mt-3 hidden flex-1 overflow-y-auto pr-2 space-y-2">
                ${smsHistory.length ? smsHistory.map((r) => `
                  <div class="border border-border rounded-lg p-3">
                    <div class="text-sm text-gray-900">${r.medication_name} ${r.dose || ""}</div>
                    <div class="text-xs text-muted mt-1">SMS sent: ${window.formatTime(r.sms_sent_at)}</div>
                    <div class="text-xs text-muted mt-1">Scheduled: ${window.formatTime(r.scheduled_for)}</div>
                    <div class="text-xs text-muted mt-1">Status: ${statusLabel(r.status)}</div>
                  </div>
                `).join("") : `<div class="text-sm text-muted">No SMS history.</div>`}
              </div>
            </div>
          </section>
        </div>
      </div>
    `;
  }

  function renderActions(patient, latest, reminders, interventions) {
    if (role === "nurse") {
      const doctorNote = latest?.doctor_note || "No doctor note yet.";
      const reminderRows = (reminders || []).slice(0, 8);
      const followupRows = (interventions || [])
        .filter((row) => row.type === "nurse_followup_call")
        .slice(0, 8);
      return `
        <div class="grid gap-4">
          <div class="border border-border rounded-xl p-4">
            <div class="text-xs uppercase tracking-widest text-muted">Doctor Note</div>
            <div class="text-sm text-gray-900 font-semibold mt-2">${doctorNote.replace(/^\[for [^\]]+\]\s*/, '')}</div>
          </div>
          <div class="border border-border rounded-xl p-4">
            <div class="text-sm font-medium text-gray-900">Assigned Nurse Calls</div>
            <div class="mt-3 space-y-2">
              ${followupRows.length ? followupRows.map((row) => `
                <div class="border border-border rounded-lg p-3">
                  <div class="flex items-center justify-between">
                    <div class="text-sm text-gray-900">Nurse Follow-up Call</div>
                    <span class="text-xs px-2 py-1 rounded-md bg-amber-50 text-warning">${toTitleCase(row.status || "assigned")}</span>
                  </div>
                  <div class="text-xs text-muted mt-1">${row.note || "Assigned by doctor."}</div>
                  <div class="text-xs text-muted mt-1">Assigned: ${row.created_at ? window.formatTime(row.created_at) : "--"}</div>
                </div>
              `).join("") : `<div class="text-sm text-muted">No assigned nurse calls for this patient.</div>`}
            </div>
          </div>
          <div class="border border-border rounded-xl p-4">
            <div class="flex items-center justify-between">
              <div class="text-sm font-medium text-gray-900">Medication Reminders</div>
              <button class="btn-primary text-sm" data-action-add-reminder>Medication Reminder</button>
            </div>
            <div class="mt-3 space-y-2">
              ${reminderRows.length ? reminderRows.map((row) => `
                <div class="border border-border rounded-lg p-3">
                  <div class="flex items-center justify-between">
                    <div class="text-sm text-gray-900">${row.medication_name} ${row.dose || ""}</div>
                    <span class="text-xs px-2 py-1 rounded-md ${statusBadgeClass(row.status)}">${statusLabel(row.status)}</span>
                  </div>
                  <div class="text-xs text-muted mt-1">Scheduled: ${row.scheduled_for ? window.formatTime(row.scheduled_for) : "--"}</div>
                </div>
              `).join("") : `<div class="text-sm text-muted">No medication reminders for this patient.</div>`}
            </div>
          </div>
        </div>
      `;
    }
    return `
      <div class="grid gap-3">
        <button class="btn-secondary text-sm" data-action-assign-nurse-call>Assign Nurse Call</button>
        <button class="btn-primary text-sm" data-action-confirm-all>Confirm All Alerts</button>
        <button class="btn-secondary text-sm" data-action-clear-all>Clear All Alerts</button>
        <button class="btn-secondary text-sm" data-action-add-note>Add Note</button>
        <button class="btn-secondary text-sm" data-action-override>Override Risk</button>
      </div>
    `;
  }

  async function renderDetail(patientId) {
    if (!detailPanel) return;
    const patient = patients.find((p) => p.id === patientId);
    if (!patient) return;
    const detailToken = detailGate ? detailGate.nextToken() : null;
    setPageState({ detailLoading: true, detailError: "" });
    detailPanel.innerHTML = window.ui?.loadingRows ? window.ui.loadingRows(5) : `<div class="text-sm text-muted px-6 py-6">Loading patient details...</div>`;
    let data;
    let reminders = [];
    let interventions = [];
    let assignments = [];
    try {
      [data, reminders, interventions, assignments] = await Promise.all([
        fetchLatestLog(patientId),
        requestJson(endpoints.care?.remindersByPatient ? endpoints.care.remindersByPatient(patientId) : `/care/medication/reminders?patient_id=${patientId}`),
        requestJson(endpoints.care?.interventionsByPatient ? endpoints.care.interventionsByPatient(patientId) : `/care/interventions?patient_id=${patientId}`),
        requestJson(endpoints.care?.assignmentsByPatient ? endpoints.care.assignmentsByPatient(patientId) : `/care/assignments?patient_id=${patientId}`)
      ]);
    } catch (err) {
      console.error(err);
      if (detailGate && !detailGate.isCurrent(detailToken)) return;
      setPageState({ detailLoading: false, detailError: "Failed to load patient details." });
      detailPanel.innerHTML = window.ui?.renderError("Failed to load patient details.") || `<div class="text-sm text-critical px-6 py-6">Failed to load patient details.</div>`;
      return;
    }
    if (detailGate && !detailGate.isCurrent(detailToken)) return;
    setPageState({ detailLoading: false, detailError: "" });
    const latest = data?.latest || null;
    const previous = data?.previous || null;
    const logs = data?.logs || [];
    const reminderRows = Array.isArray(reminders) ? reminders : [];
    const interventionRows = Array.isArray(interventions) ? interventions : [];
    const assignment = (Array.isArray(assignments) ? assignments : [])[0] || null;
    const level = riskLevel(latest?.risk_score ?? patient.risk_score);
    const trend = previous && latest?.risk_score != null && previous?.risk_score != null
      ? (latest.risk_score - previous.risk_score)
      : 0;
    const trendLabel = trend > 0 ? `up ${Math.round(trend)}% / 7d` : trend < 0 ? `down ${Math.round(Math.abs(trend))}% / 7d` : "-";
    const statusBadge = level === "high" ? "Critical" : level === "medium" ? "Monitor" : "Stable";
    const engagement = latest?.answered ? "Active" : "No Response";

    if (role === "nurse") {
      detailPanel.innerHTML = renderNurseWorkspace(patient, latest, logs, reminderRows, interventionRows, assignment);
      bindDetailActions(patient, latest, { reminders: reminderRows, interventions: interventionRows });
      return;
    }

    if (role === "staff") {
      detailPanel.innerHTML = renderStaffWorkspace(patient, logs, reminderRows, assignment);
      bindDetailActions(patient, latest, { reminders: reminderRows, interventions: interventionRows });
      return;
    }

    detailPanel.innerHTML = `
      <div class="flex flex-col min-h-0 overflow-hidden">
        <div class="sticky top-0 z-10 bg-white border-b border-border px-4 py-3">
          <div class="flex items-center justify-between">
            <div>
              <div class="font-semibold text-gray-900">${patient.name} <span class="text-xs text-gray-400">| ${patient.age || "--"} | CP-${patient.id}</span></div>
              <div class="mt-2 flex flex-wrap gap-2 text-xs">
                <span class="px-2 py-1 rounded-md border border-border">${statusBadge}</span>
                ${latest?.risk_source === "manual_override" ? `<span class="px-2 py-1 rounded-md border border-border">Overridden</span>` : ""}
                <span class="px-2 py-1 rounded-md border border-border">${engagement}</span>
              </div>
            </div>
            <div class="text-right">
              <div class="text-xs text-gray-400">Current Risk</div>
              <div class="text-lg font-medium text-gray-900">${formatPercent(latest?.risk_score ?? patient.risk_score)}</div>
            </div>
          </div>
        </div>

        <div class="flex-1 overflow-y-auto p-6 space-y-4">
          <div class="card-soft p-4">
            <div class="flex items-center justify-between">
              <div>
                <div class="text-lg font-medium text-gray-900">${patient.name}</div>
                <div class="text-sm text-gray-500">Age ${patient.age || "--"} | ${toTitleCase(patient.gender || "--")}</div>
              </div>
              <div class="text-right">
                <div class="text-xs px-2 py-1 rounded-md ${level === "high" ? "bg-red-50 text-critical" : level === "medium" ? "bg-amber-50 text-warning" : "bg-green-50 text-success"}">${level === "high" ? "Critical" : level === "medium" ? "Monitor" : "Stable"}</div>
                <div class="text-sm text-gray-500 mt-2">${formatPercent(latest?.risk_score ?? patient.risk_score)} ${trendLabel}</div>
              </div>
            </div>
            <div class="mt-3 flex flex-wrap gap-4 text-xs text-gray-400">
              <span>Protocol: ${displayProtocol(patient.protocol || latest?.protocol || "--")}</span>
              <span>Track: ${displayTrack(patient.disease_track || "--")}</span>
              <span>Gender: ${toTitleCase(patient.gender || "--")}</span>
              <span>Age: ${patient.age || "--"}</span>
              <span>Last contact: ${latest?.created_at ? window.formatTime(latest.created_at) : "--"}</span>
              <span>Status: ${latest?.status || "completed"}</span>
            </div>
          </div>

          <div class="detail-tabs">
            <button class="detail-tab active" data-tab="responses">Clinical Alerts</button>
            ${role === "doctor" ? `<button class="detail-tab" data-tab="explain">Explainability</button>` : ``}
            ${role === "doctor" || role === "nurse" ? `<button class="detail-tab" data-tab="actions">Actions</button>` : ``}
          </div>

          <div id="tab-responses" class="tab-panel">
            <div class="card-soft p-4 text-sm text-gray-600">
              <strong class="text-gray-900">How review works:</strong> Confirm Alert if clinically correct, Clear Alert if false positive. Each action is audited.
            </div>
            <div class="mt-4 space-y-4">
              ${renderResponses(latest)}
            </div>
          </div>
          ${role === "doctor" ? `
          <div id="tab-explain" class="tab-panel hidden">
            <div class="space-y-4">
              ${renderExplainability(latest)}
            </div>
          </div>` : ``}
          ${role === "doctor" || role === "nurse" ? `
          <div id="tab-actions" class="tab-panel hidden">
            ${renderActions(patient, latest, reminderRows, interventionRows)}
          </div>` : ``}
        </div>
      </div>
    `;

    bindDetailActions(patient, latest, { reminders: reminderRows, interventions: interventionRows });
    bindTabs();
  }

  function bindTabs() {
    const tabs = detailPanel.querySelectorAll("[data-tab]");
    const panels = {
      responses: detailPanel.querySelector("#tab-responses"),
      explain: detailPanel.querySelector("#tab-explain"),
      actions: detailPanel.querySelector("#tab-actions")
    };
    tabs.forEach((btn) => {
      btn.addEventListener("click", () => {
        const key = btn.dataset.tab;
        tabs.forEach((b) => {
          b.classList.remove("active");
        });
        btn.classList.add("active");
        Object.entries(panels).forEach(([name, panel]) => {
          if (!panel) return;
          panel.classList.toggle("hidden", name !== key);
        });
      });
    });
  }

  function bindDetailActions(patient, latest, context = {}) {
    const reminders = context.reminders || [];
    const todayKey = formatDateKey(new Date().toISOString());
    const latestTodayReminder = [...reminders]
      .filter((r) => formatDateKey(r.scheduled_for) === todayKey)
      .sort((a, b) => String(b.scheduled_for || "").localeCompare(String(a.scheduled_for || "")))[0] || null;
    detailPanel.querySelectorAll("[data-toggle-details]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const target = btn.dataset.target;
        const panel = detailPanel.querySelector(`#${target}`);
        if (panel) panel.classList.toggle("hidden");
      });
    });

    const confirmAll = detailPanel.querySelector("[data-action-confirm-all]");
    const clearAll = detailPanel.querySelector("[data-action-clear-all]");
    const addNote = detailPanel.querySelector("[data-action-add-note]");
    const overrideAction = detailPanel.querySelector("[data-action-override]");
    const assignNurseCall = detailPanel.querySelector("[data-action-assign-nurse-call]");
    const addReminder = detailPanel.querySelector("[data-action-add-reminder]");
    const nurseCallPatient = detailPanel.querySelector("[data-nurse-call-patient]");
    const nurseLogOutcome = detailPanel.querySelector("[data-nurse-log-outcome]");
    const nurseMarkTaken = detailPanel.querySelector("[data-nurse-mark-taken]");
    const nurseMarkNotTaken = detailPanel.querySelector("[data-nurse-mark-not-taken]");
    const nurseAddNote = detailPanel.querySelector("[data-nurse-add-note]");
    const staffTriggerCall = detailPanel.querySelector("[data-staff-trigger-call]");
    const staffEditPatient = detailPanel.querySelector("[data-staff-edit-patient]");
    const staffMonitoringCallButtons = detailPanel.querySelectorAll("[data-staff-call-now-monitoring]");
    const staffConfirmationCallButtons = detailPanel.querySelectorAll("[data-staff-call-now-confirmation]");

    if (role === "doctor" && confirmAll && latest) {
      confirmAll.onclick = async () => {
        for (const r of (latest.responses || [])) {
          await requestJson(`${backend}/care/response-review`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              patient_id: patient.id,
              call_log_id: latest.id,
              intent_id: r.intent_id,
              label: 1,
              reason: "bulk confirm"
            })
          });
        }
        latestLogCache.delete(patient.id);
        await renderDetail(patient.id);
      };
    }

    if (role === "doctor" && clearAll && latest) {
      clearAll.onclick = async () => {
        for (const r of (latest.responses || [])) {
          await requestJson(`${backend}/care/response-review`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              patient_id: patient.id,
              call_log_id: latest.id,
              intent_id: r.intent_id,
              label: 0,
              reason: "bulk clear"
            })
          });
        }
        latestLogCache.delete(patient.id);
        await renderDetail(patient.id);
      };
    }

    if (role === "doctor" && addNote && latest) {
      addNote.onclick = () => {
        showDialog({
          title: "Add Clinical Note",
          html: `
            <div class="text-sm text-muted">This note is stored with the latest review.</div>
            <textarea id="dialogNote" class="mt-3 w-full border border-border rounded-md px-3 py-2 text-sm" rows="4" placeholder="Enter note"></textarea>
          `,
          confirmLabel: "Save Note",
          onConfirm: async () => {
            const note = document.getElementById("dialogNote")?.value?.trim() || "";
            if (!note) return;
            await requestJson(`${backend}/patients/${patient.id}/logs/${latest.id}/note`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ note })
            });
            latestLogCache.delete(patient.id);
            await renderDetail(patient.id);
          }
        });
      };
    }

    if (role === "doctor" && overrideAction && latest) {
      overrideAction.onclick = () => {
        showDialog({
          title: "Override Risk",
          html: `
            <div class="text-sm text-muted">Overrides are audited and permanent.</div>
            <label class="text-xs text-muted mt-3 block">New Risk (%)</label>
            <input id="dialogOverrideValue" type="number" min="0" max="100" class="mt-1 w-full border border-border rounded-md px-3 py-2 text-sm" />
            <label class="text-xs text-muted mt-3 block">Reason</label>
            <textarea id="dialogOverrideReason" class="mt-1 w-full border border-border rounded-md px-3 py-2 text-sm" rows="3"></textarea>
          `,
          confirmLabel: "Confirm Override",
          onConfirm: async () => {
            const value = Number(document.getElementById("dialogOverrideValue")?.value || "");
            const reason = document.getElementById("dialogOverrideReason")?.value?.trim() || "";
            if (Number.isNaN(value)) return;
            await requestJson(`${backend}/care/risk-override`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                patient_id: patient.id,
                call_log_id: latest.id,
                risk_score: value,
                note: reason
              })
            });
            latestLogCache.delete(patient.id);
            await renderDetail(patient.id);
          }
        });
      };
    }

    if (role === "doctor" && assignNurseCall) {
      assignNurseCall.onclick = () => {
        showDialog({
          title: "Assign Nurse Call",
          html: `
            <div class="text-sm text-muted">This creates a nurse follow-up task and sends it to nurse notifications.</div>
            <label class="text-xs text-muted mt-3 block">Reason</label>
            <textarea id="dialogNurseCallReason" class="mt-1 w-full border border-border rounded-md px-3 py-2 text-sm" rows="3"></textarea>
          `,
          confirmLabel: "Assign",
          onConfirm: async () => {
            const reason = document.getElementById("dialogNurseCallReason")?.value?.trim() || "Doctor requested follow-up call.";
            await requestJson(`${backend}/care/interventions`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                patient_id: patient.id,
                type: "nurse_followup_call",
                status: "assigned",
                note: reason,
                risk_before: latest?.risk_score ?? null,
                risk_after: null
              })
            });
            await renderDetail(patient.id);
          }
        });
      };
    }

    if (role === "nurse" && addReminder) {
      addReminder.onclick = () => {
        const istNow = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
        const defaultDate = `${istNow.getFullYear()}-${String(istNow.getMonth() + 1).padStart(2, "0")}-${String(istNow.getDate()).padStart(2, "0")}`;
        showDialog({
          title: "Create Medication Reminder",
          html: `
            <div class="text-sm text-muted">All scheduling uses India time (IST). SMS reminder is sent first, then IVR confirmation call after 10 minutes.</div>
            <label class="text-xs text-muted mt-3 block">Medication Name</label>
            <input id="dialogMedName" class="mt-1 w-full border border-border rounded-md px-3 py-2 text-sm text-ink" />
            <label class="text-xs text-muted mt-3 block">Dose</label>
            <input id="dialogMedDose" class="mt-1 w-full border border-border rounded-md px-3 py-2 text-sm text-ink" />
            <label class="text-xs text-muted mt-3 block">Start Date (IST)</label>
            <input id="dialogMedStartDate" type="date" value="${defaultDate}" class="mt-1 w-full border border-border rounded-md px-3 py-2 text-sm text-brand" />
            <label class="text-xs text-muted mt-3 block">Number of Days</label>
            <input id="dialogMedDays" type="number" min="1" max="30" value="1" class="mt-1 w-full border border-border rounded-md px-3 py-2 text-sm text-brand" />
            <div class="mt-3 grid grid-cols-2 gap-2">
              <label class="text-sm border border-border rounded-md px-3 py-2">
                <div class="flex items-center gap-2">
                <input id="dialogSlotMorning" type="checkbox" checked />
                <span>Morning</span>
                </div>
                <input id="dialogTimeMorning" type="time" value="08:00" class="mt-2 w-full border border-border rounded-md px-2 py-1 text-sm text-brand" />
              </label>
              <label class="text-sm border border-border rounded-md px-3 py-2">
                <div class="flex items-center gap-2">
                <input id="dialogSlotEvening" type="checkbox" />
                <span>Evening</span>
                </div>
                <input id="dialogTimeEvening" type="time" value="20:00" class="mt-2 w-full border border-border rounded-md px-2 py-1 text-sm text-brand" />
              </label>
            </div>
          `,
          confirmLabel: "Schedule Reminder",
          onConfirm: async () => {
            const name = document.getElementById("dialogMedName")?.value?.trim() || "";
            const dose = document.getElementById("dialogMedDose")?.value?.trim() || "";
            const startDate = document.getElementById("dialogMedStartDate")?.value || "";
            const days = Number(document.getElementById("dialogMedDays")?.value || "1");
            const morning = Boolean(document.getElementById("dialogSlotMorning")?.checked);
            const evening = Boolean(document.getElementById("dialogSlotEvening")?.checked);
            const morningTime = document.getElementById("dialogTimeMorning")?.value || "";
            const eveningTime = document.getElementById("dialogTimeEvening")?.value || "";
            if (!name || !startDate || Number.isNaN(days) || days < 1) return;
            if (!morning && !evening) return;
            if (morning && !morningTime) return;
            if (evening && !eveningTime) return;

            const [year, month, day] = startDate.split("-").map(Number);
            const slots = [];
            if (morning) slots.push(morningTime);
            if (evening) slots.push(eveningTime);
            const requests = [];

            for (let offset = 0; offset < days; offset += 1) {
              const utcMidnight = new Date(Date.UTC(year, month - 1, day + offset, 0, 0, 0));
              const y = utcMidnight.getUTCFullYear();
              const m = utcMidnight.getUTCMonth() + 1;
              const d = utcMidnight.getUTCDate();
              for (const slot of slots) {
                const [h, mm] = slot.split(":").map(Number);
                const utcMillis = Date.UTC(y, m - 1, d, h, mm) - (5.5 * 60 * 60 * 1000);
                requests.push(requestJson(`${backend}/care/medication/reminders`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    patient_id: patient.id,
                    medication_name: name,
                    dose: dose || null,
                    scheduled_for: new Date(utcMillis).toISOString()
                  })
                }));
              }
            }

            await Promise.all(requests);
            await renderDetail(patient.id);
          }
        });

        const colorizeOnInput = (id) => {
          const el = document.getElementById(id);
          if (!el) return;
          const sync = () => {
            const hasValue = String(el.value || "").trim().length > 0;
            el.classList.toggle("text-brand", hasValue);
            el.classList.toggle("text-ink", !hasValue);
          };
          el.addEventListener("input", sync);
          el.addEventListener("change", sync);
          sync();
        };

        [
          "dialogMedName",
          "dialogMedDose",
          "dialogMedStartDate",
          "dialogMedDays",
          "dialogTimeMorning",
          "dialogTimeEvening"
        ].forEach(colorizeOnInput);
      };
    }

    if (role === "nurse") {
      detailPanel.querySelectorAll("[data-edit-reminder]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const reminderId = Number(btn.dataset.editReminder);
          const dose = btn.dataset.dose || "";
          const iso = btn.dataset.time || "";
          const dt = iso ? new Date(iso) : new Date();
          const localVal = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}T${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`;
          showDialog({
            title: "Edit Medication Schedule",
            html: `
              <label class="text-xs text-muted block">Dose</label>
              <input id="dialogEditDose" class="mt-1 w-full border border-border rounded-md px-3 py-2 text-sm" value="${dose}" />
              <label class="text-xs text-muted mt-3 block">Schedule</label>
              <input id="dialogEditTime" type="datetime-local" class="mt-1 w-full border border-border rounded-md px-3 py-2 text-sm" value="${localVal}" />
            `,
            confirmLabel: "Save",
            onConfirm: async () => {
              const newDose = document.getElementById("dialogEditDose")?.value?.trim() || "";
              const when = document.getElementById("dialogEditTime")?.value || "";
              if (!when) return;
              await requestJson(`${backend}/care/medication/reminders/${reminderId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  dose: newDose || null,
                  scheduled_for: new Date(when).toISOString()
                })
              });
              await renderDetail(patient.id);
            }
          });
        });
      });

      detailPanel.querySelectorAll("[data-toggle-reminder]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const reminderId = Number(btn.dataset.toggleReminder);
          const status = String(btn.dataset.status || "scheduled").toLowerCase();
          const nextStatus = status === "paused" ? "scheduled" : "paused";
          await requestJson(`${backend}/care/medication/reminders/${reminderId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: nextStatus })
          });
          await renderDetail(patient.id);
        });
      });

      if (nurseCallPatient) {
        nurseCallPatient.addEventListener("click", async () => {
          await requestJson(`${backend}/care/interventions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              patient_id: patient.id,
              type: "nurse_call_attempt",
              status: "completed",
              note: "Nurse initiated follow-up call."
            })
          });
          await renderDetail(patient.id);
        });
      }

      if (nurseLogOutcome) {
        nurseLogOutcome.addEventListener("click", () => {
          showDialog({
            title: "Log Follow-up Outcome",
            html: `<textarea id="dialogOutcome" class="w-full border border-border rounded-md px-3 py-2 text-sm" rows="4"></textarea>`,
            confirmLabel: "Save",
            onConfirm: async () => {
              const note = document.getElementById("dialogOutcome")?.value?.trim() || "";
              if (!note) return;
              await requestJson(`${backend}/care/interventions`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  patient_id: patient.id,
                  type: "nurse_followup_log",
                  status: "completed",
                  note
                })
              });
              await renderDetail(patient.id);
            }
          });
        });
      }

      if (nurseMarkTaken) {
        nurseMarkTaken.addEventListener("click", async () => {
          await requestJson(`${backend}/care/interventions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              patient_id: patient.id,
              type: "nurse_followup_call",
              status: "completed",
              note: "Follow-up completed. Patient confirmed medication taken."
            })
          });
          if (latestTodayReminder?.id) {
            await requestJson(`${backend}/care/medication/reminders/${latestTodayReminder.id}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ status: "taken" })
            });
          }
          await renderDetail(patient.id);
        });
      }

      if (nurseMarkNotTaken) {
        nurseMarkNotTaken.addEventListener("click", async () => {
          await requestJson(`${backend}/care/interventions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              patient_id: patient.id,
              type: "nurse_followup_call",
              status: "completed",
              note: "Follow-up completed. Patient has not taken medication."
            })
          });
          if (latestTodayReminder?.id) {
            await requestJson(`${backend}/care/medication/reminders/${latestTodayReminder.id}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ status: "missed" })
            });
          }
          await renderDetail(patient.id);
        });
      }

      if (nurseAddNote) {
        nurseAddNote.addEventListener("click", () => {
          showDialog({
            title: "Add Nurse Note",
            html: `<textarea id="dialogNurseNote" class="w-full border border-border rounded-md px-3 py-2 text-sm" rows="4"></textarea>`,
            confirmLabel: "Save",
            onConfirm: async () => {
              const note = document.getElementById("dialogNurseNote")?.value?.trim() || "";
              if (!note) return;
              await requestJson(`${backend}/care/interventions`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  patient_id: patient.id,
                  type: "nurse_note",
                  status: "completed",
                  note
                })
              });
              await renderDetail(patient.id);
            }
          });
        });
      }
    }

    if (role === "staff" && staffTriggerCall) {
      staffTriggerCall.addEventListener("click", () => {
        showDialog({
          title: "Call Now (Monitoring Test)",
          message: "Place a monitoring call right now for testing?",
          confirmLabel: "Call Now",
          onConfirm: async () => {
            await requestJson(`${backend}/call/${encodeURIComponent(patient.phone_number)}?patient_id=${patient.id}`, {
              method: "POST"
            });
            latestLogCache.delete(patient.id);
            await renderDetail(patient.id);
          }
        });
      });
    }

    if (role === "staff" && staffMonitoringCallButtons.length) {
      staffMonitoringCallButtons.forEach((btn) => {
        btn.addEventListener("click", () => {
          const logId = Number(btn.dataset.staffCallNowMonitoring);
          showDialog({
            title: "Retry Monitoring Call",
            message: "Place a monitoring retry call now for this missed attempt?",
            confirmLabel: "Call Now",
            onConfirm: async () => {
              await requestJson(`${backend}/call/${encodeURIComponent(patient.phone_number)}?patient_id=${patient.id}`, {
                method: "POST"
              });
              await requestJson(`${backend}/care/interventions`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  patient_id: patient.id,
                  type: "staff_monitoring_call_retry",
                  status: "completed",
                  note: `Retry monitoring call placed for log ${logId}.`
                })
              });
              latestLogCache.delete(patient.id);
              await renderDetail(patient.id);
            }
          });
        });
      });
    }

    if (role === "staff" && staffConfirmationCallButtons.length) {
      staffConfirmationCallButtons.forEach((btn) => {
        btn.addEventListener("click", () => {
          const reminderId = Number(btn.dataset.staffCallNowConfirmation);
          showDialog({
            title: "Retry Confirmation Call",
            message: "Place a confirmation retry call now for this missed medication response?",
            confirmLabel: "Call Now",
            onConfirm: async () => {
              await requestJson(`${backend}/call/${encodeURIComponent(patient.phone_number)}?patient_id=${patient.id}`, {
                method: "POST"
              });
              await requestJson(`${backend}/care/medication/reminders/${reminderId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: "call_placed" })
              });
              await requestJson(`${backend}/care/interventions`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  patient_id: patient.id,
                  type: "staff_confirmation_call_retry",
                  status: "completed",
                  note: `Retry confirmation call placed for reminder ${reminderId}.`
                })
              });
              latestLogCache.delete(patient.id);
              await renderDetail(patient.id);
            }
          });
        });
      });
    }

    if (role === "staff" && staffEditPatient) {
      staffEditPatient.addEventListener("click", () => {
        const assignment = assignmentByPatient.get(patient.id) || {};
        const currentTrack = String(patient.disease_track || "").toLowerCase();
        const selectedTrack = currentTrack.includes("cardio")
          ? "cardiovascular"
          : currentTrack.includes("pulm")
            ? "pulmonary"
            : "general";
        const currentProtocol = String(patient.protocol || "").toUpperCase();
        showDialog({
          title: "Edit Patient Details",
          html: `
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <label class="text-sm">
                <span class="block text-muted mb-1">Patient name</span>
                <input id="editName" class="border border-border rounded-xl px-4 py-2 w-full" value="${patient.name || ""}" required />
              </label>
              <label class="text-sm">
                <span class="block text-muted mb-1">Phone number</span>
                <input id="editPhone" class="border border-border rounded-xl px-4 py-2 w-full" value="${patient.phone_number || ""}" required />
              </label>
              <label class="text-sm">
                <span class="block text-muted mb-1">Age</span>
                <input id="editAge" type="number" min="0" max="120" class="border border-border rounded-xl px-4 py-2 w-full" value="${patient.age || ""}" />
              </label>
              <label class="text-sm">
                <span class="block text-muted mb-1">Gender</span>
                <select id="editGender" class="border border-border rounded-xl px-4 py-2 w-full">
                  <option value="">Select</option>
                  <option value="female" ${patient.gender === "female" ? "selected" : ""}>Female</option>
                  <option value="male" ${patient.gender === "male" ? "selected" : ""}>Male</option>
                  <option value="other" ${patient.gender === "other" ? "selected" : ""}>Other</option>
                </select>
              </label>
              <label class="text-sm">
                <span class="block text-muted mb-1">Disease track</span>
                <select id="editTrack" class="border border-border rounded-xl px-4 py-2 w-full">
                  <option value="">Select track</option>
                  <option value="cardiovascular" ${selectedTrack === "cardiovascular" ? "selected" : ""}>Cardiovascular</option>
                  <option value="pulmonary" ${selectedTrack === "pulmonary" ? "selected" : ""}>Pulmonary</option>
                  <option value="general" ${selectedTrack === "general" ? "selected" : ""}>General</option>
                </select>
              </label>
              <label class="text-sm">
                <span class="block text-muted mb-1">Protocol</span>
                <select id="editProtocol" class="border border-border rounded-xl px-4 py-2 w-full">
                  <option value="POST_MI" ${currentProtocol === "POST_MI" ? "selected" : ""}>POST_MI</option>
                  <option value="HEART_FAILURE" ${currentProtocol === "HEART_FAILURE" ? "selected" : ""}>HEART_FAILURE</option>
                  <option value="HYPERTENSION" ${currentProtocol === "HYPERTENSION" ? "selected" : ""}>HYPERTENSION</option>
                  <option value="ARRHYTHMIA" ${currentProtocol === "ARRHYTHMIA" ? "selected" : ""}>ARRHYTHMIA</option>
                  <option value="COPD" ${currentProtocol === "COPD" ? "selected" : ""}>COPD</option>
                  <option value="ASTHMA" ${currentProtocol === "ASTHMA" ? "selected" : ""}>ASTHMA</option>
                  <option value="PNEUMONIA" ${currentProtocol === "PNEUMONIA" ? "selected" : ""}>PNEUMONIA</option>
                  <option value="PE" ${currentProtocol === "PE" ? "selected" : ""}>PE</option>
                  <option value="ILD_POST_COVID" ${currentProtocol === "ILD_POST_COVID" ? "selected" : ""}>ILD_POST_COVID</option>
                  <option value="GENERAL_MONITORING" ${currentProtocol === "GENERAL_MONITORING" ? "selected" : ""}>GENERAL_MONITORING</option>
                </select>
              </label>
              <label class="text-sm">
                <span class="block text-muted mb-1">Timezone (IST)</span>
                <input id="editTimezone" class="border border-border rounded-xl px-4 py-2 w-full" value="${patient.timezone || "Asia/Kolkata"}" />
              </label>
              <label class="text-sm">
                <span class="block text-muted mb-1">Schedule time to call (IST)</span>
                <input id="editCallTime" type="time" class="border border-border rounded-xl px-4 py-2 w-full" value="${patient.call_time || "10:00"}" />
              </label>
              <label class="text-sm">
                <span class="block text-muted mb-1">Days to monitor</span>
                <input id="editDays" type="number" min="1" class="border border-border rounded-xl px-4 py-2 w-full" value="${patient.days_to_monitor || 30}" />
              </label>
              <label class="text-sm">
                <span class="block text-muted mb-1">Assigned doctor</span>
                <select id="editDoctor" class="border border-border rounded-xl px-4 py-2 w-full">
                  <option value="">Select doctor</option>
                </select>
              </label>
              <label class="text-sm">
                <span class="block text-muted mb-1">Assigned nurse</span>
                <select id="editNurse" class="border border-border rounded-xl px-4 py-2 w-full">
                  <option value="">Select nurse</option>
                </select>
              </label>
              <label class="text-sm md:col-span-2">
                <span class="block text-muted mb-1">Diagnosis</span>
                <textarea id="editDiagnosis" rows="3" class="border border-border rounded-xl px-4 py-2 w-full">${patient.diagnosis || ""}</textarea>
              </label>
              <label class="text-sm md:col-span-2">
                <span class="block text-muted mb-1">Medication</span>
                <textarea id="editMedications" rows="3" class="border border-border rounded-xl px-4 py-2 w-full">${patient.medications_text || ""}</textarea>
              </label>
            </div>
          `,
          confirmLabel: "Save Changes",
          dialogClass: "max-w-2xl",
          onConfirm: async () => {
            const body = {
              name: document.getElementById("editName")?.value?.trim() || patient.name,
              phone_number: document.getElementById("editPhone")?.value?.trim() || patient.phone_number,
              age: Number(document.getElementById("editAge")?.value || patient.age || 0) || null,
              gender: document.getElementById("editGender")?.value || null,
              disease_track: document.getElementById("editTrack")?.value || patient.disease_track,
              protocol: document.getElementById("editProtocol")?.value?.trim() || patient.protocol,
              timezone: document.getElementById("editTimezone")?.value?.trim() || "Asia/Kolkata",
              call_time: document.getElementById("editCallTime")?.value || "10:00",
              days_to_monitor: Number(document.getElementById("editDays")?.value || "30"),
              diagnosis: document.getElementById("editDiagnosis")?.value?.trim() || "",
              medications_text: document.getElementById("editMedications")?.value?.trim() || ""
            };
            await requestJson(`${backend}/patients/${patient.id}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body)
            });
            await requestJson(`${backend}/care/assignments`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                patient_id: patient.id,
                doctor_name: document.getElementById("editDoctor")?.value?.trim() || "",
                nurse_name: document.getElementById("editNurse")?.value?.trim() || ""
              })
            });
            latestLogCache.delete(patient.id);
            await loadPatients();
          }
        });

        const doctorSelect = document.getElementById("editDoctor");
        const nurseSelect = document.getElementById("editNurse");
        const selectedDoctor = assignment.doctor_name || "";
        const selectedNurse = assignment.nurse_name || "";

        const renderAssigneeOptions = (el, rows, selectedValue, placeholder) => {
          if (!el) return;
          const selectedExists = rows.some((row) => row.name === selectedValue);
          const currentOption = selectedValue && !selectedExists
            ? `<option value="${selectedValue}">${selectedValue}</option>`
            : "";
          el.innerHTML = `<option value="">${placeholder}</option>` +
            currentOption +
            rows.map((row) => (
              `<option value="${row.name}">${row.name}${row.department ? ` (${row.department})` : ""}</option>`
            )).join("");
          el.value = selectedValue || "";
        };

        renderAssigneeOptions(doctorSelect, [], selectedDoctor, "Loading doctors...");
        renderAssigneeOptions(nurseSelect, [], selectedNurse, "Loading nurses...");

        requestJson(endpoints.auth?.usersOptions || `${backend}/auth/users/options`)
          .then((data) => data || { doctors: [], nurses: [] })
          .then((data) => {
            renderAssigneeOptions(doctorSelect, data.doctors || [], selectedDoctor, "Select doctor");
            renderAssigneeOptions(nurseSelect, data.nurses || [], selectedNurse, "Select nurse");
          })
          .catch((err) => {
            console.error(err);
            renderAssigneeOptions(doctorSelect, [], selectedDoctor, "Select doctor");
            renderAssigneeOptions(nurseSelect, [], selectedNurse, "Select nurse");
          });
      });
    }

    if (role === "staff") {
      const mainTabButtons = detailPanel.querySelectorAll("[data-staff-main-tab]");
      const mainPanels = {
        actions: detailPanel.querySelector("#staff-main-actions"),
        history: detailPanel.querySelector("#staff-main-history")
      };
      mainTabButtons.forEach((btn) => {
        btn.addEventListener("click", () => {
          const key = btn.dataset.staffMainTab;
          mainTabButtons.forEach((b) => b.classList.remove("active"));
          btn.classList.add("active");
          Object.entries(mainPanels).forEach(([name, panel]) => {
            if (!panel) return;
            panel.classList.toggle("hidden", name !== key);
          });
        });
      });

      const tabButtons = detailPanel.querySelectorAll("[data-staff-history-tab]");
      const panels = {
        monitoring: detailPanel.querySelector("#staff-history-monitoring"),
        confirmation: detailPanel.querySelector("#staff-history-confirmation"),
        sms: detailPanel.querySelector("#staff-history-sms")
      };
      tabButtons.forEach((btn) => {
        btn.addEventListener("click", () => {
          const key = btn.dataset.staffHistoryTab;
          tabButtons.forEach((b) => b.classList.remove("active"));
          btn.classList.add("active");
          Object.entries(panels).forEach(([name, panel]) => {
            if (!panel) return;
            panel.classList.toggle("hidden", name !== key);
          });
        });
      });
    }

    if (role === "doctor" && latest) detailPanel.querySelectorAll("[data-view-edits]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const intentId = btn.dataset.viewEdits;
        const response = (latest.responses || []).find((r) => r.intent_id === intentId);
        if (!response) return;
        showDialog({
          title: "Edited Response Details",
          html: `
            <div class="text-sm text-muted">Latest edited values for this IVR response.</div>
            <div class="mt-3 grid gap-2 text-sm">
              <div><span class="text-muted">Question:</span> ${response.question || response.label || response.intent_id}</div>
              <div><span class="text-muted">Transcript:</span> ${response.raw_text || "-"}</div>
              <div><span class="text-muted">Corrected Answer:</span> ${response.corrected_answer || "-"}</div>
              <div><span class="text-muted">Corrected Trend:</span> ${response.corrected_trend || "-"}</div>
              <div><span class="text-muted">Reason:</span> ${response.corrected_reason || "-"}</div>
            </div>
          `,
          confirmLabel: "Close",
          showCancel: false
        });
      });
    });

    if (role === "doctor") detailPanel.querySelectorAll("[data-review-confirm]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const intentId = btn.dataset.reviewConfirm;
        showDialog({
          title: "Confirm Alert",
          message: "Confirm this alert as clinically correct?",
          confirmLabel: "Confirm",
          onConfirm: async () => {
            await requestJson(`${backend}/care/response-review`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                patient_id: patient.id,
                call_log_id: latest.id,
                intent_id: intentId,
                label: 1,
                reason: ""
              })
            });
            latestLogCache.delete(patient.id);
            await renderDetail(patient.id);
          }
        });
      });
    });

    if (role === "doctor") detailPanel.querySelectorAll("[data-review-clear]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const intentId = btn.dataset.reviewClear;
        showDialog({
          title: "Clear Alert",
          message: "Clear this alert as a false positive?",
          confirmLabel: "Clear",
          onConfirm: async () => {
            await requestJson(`${backend}/care/response-review`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                patient_id: patient.id,
                call_log_id: latest.id,
                intent_id: intentId,
                label: 0,
                reason: ""
              })
            });
            latestLogCache.delete(patient.id);
            await renderDetail(patient.id);
          }
        });
      });
    });

    if (role === "nurse" && latest) detailPanel.querySelectorAll("[data-correct-speech]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const intentId = btn.dataset.correctSpeech;
        const response = (latest.responses || []).find((r) => r.intent_id === intentId);
        if (!response) return;
        const responseType = response.response_type || "yes_no";
        const currentText = response.raw_text || "";
        const answerSection = responseType === "yes_no" || responseType === "choice" || responseType === "options" || responseType === "scale"
          ? `
            <label class="text-xs text-muted mt-3 block">Structured Answer (optional)</label>
            <select id="dialogCorrectedAnswer" class="mt-1 w-full border border-border rounded-md px-3 py-2 text-sm">
              <option value="">Keep current parsing</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          `
          : "";
        const trendSection = responseType === "trend"
          ? `
            <label class="text-xs text-muted mt-3 block">Trend (optional)</label>
            <select id="dialogCorrectedTrend" class="mt-1 w-full border border-border rounded-md px-3 py-2 text-sm">
              <option value="">Keep current parsing</option>
              <option value="better">Better</option>
              <option value="same">Same</option>
              <option value="worse">Worse</option>
            </select>
          `
          : "";
        showDialog({
          title: "Speech Correction",
          html: `
            <div class="text-sm text-muted">Fix unclear IVR words. This is audited.</div>
            <label class="text-xs text-muted mt-3 block">Corrected Transcript</label>
            <textarea id="dialogCorrectedText" class="mt-1 w-full border border-border rounded-md px-3 py-2 text-sm" rows="4">${currentText}</textarea>
            ${answerSection}
            ${trendSection}
            <label class="text-xs text-muted mt-3 block">Reason (optional)</label>
            <input id="dialogCorrectionReason" class="mt-1 w-full border border-border rounded-md px-3 py-2 text-sm" />
          `,
          confirmLabel: "Save Correction",
          onConfirm: async () => {
            const correctedText = document.getElementById("dialogCorrectedText")?.value?.trim() || "";
            const correctedAnswer = document.getElementById("dialogCorrectedAnswer")?.value || null;
            const correctedTrend = document.getElementById("dialogCorrectedTrend")?.value || null;
            const reason = document.getElementById("dialogCorrectionReason")?.value?.trim() || "";
            await requestJson(`${backend}/care/response-correction`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                patient_id: patient.id,
                call_log_id: latest.id,
                intent_id: intentId,
                response_type: responseType,
                answer: correctedAnswer,
                trend: correctedTrend,
                corrected_text: correctedText || null,
                reason
              })
            });
            latestLogCache.delete(patient.id);
            await renderDetail(patient.id);
          }
        });
      });
    });
  }

  async function showDialog(config) {
    if (window.ui?.dialog) return window.ui.dialog(config);
    console.error("Shared dialog helper is unavailable.");
    if (typeof config?.onConfirm === "function") await config.onConfirm();
    return true;
  }

  if (protocolFilter) protocolFilter.addEventListener("change", renderList);
  if (trackFilter) trackFilter.addEventListener("change", renderList);

  await loadPatients();
});
