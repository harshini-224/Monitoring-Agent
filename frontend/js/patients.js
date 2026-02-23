import { escapeHtml, riskDotClass, riskLabel } from "./utils.js";

function normalizeSearch(value) {
  return String(value || "").trim().toLowerCase();
}

export function createPatientList(sectionEl, { onSelect }) {
  const state = {
    patients: [],
    selectedId: null,
    query: "",
    severityTab: "all"
  };

  if (!sectionEl) throw new Error("Patient list mount is missing");

  sectionEl.className = "patient-list-shell overflow-y-auto p-3 md:p-4";

  function filteredPatients() {
    const q = normalizeSearch(state.query);
    return state.patients.filter((row) => {
      const level = String(row.risk_level || "").toLowerCase();
      if (state.severityTab === "high" && !["high", "critical"].includes(level)) return false;
      if (state.severityTab === "medium" && !["monitor", "medium"].includes(level)) return false;
      if (state.severityTab === "low" && !["stable", "low"].includes(level)) return false;
      if (!q) return true;
      const name = String(row.patient_name || "").toLowerCase();
      const risk = String(row.risk_level || "").toLowerCase();
      const disease = String(row.disease_track || "").toLowerCase();
      return name.includes(q) || risk.includes(q) || disease.includes(q);
    });
  }

  function severityCounts() {
    const counts = { high: 0, medium: 0, low: 0, assigned: 0 };
    state.patients.forEach((row) => {
      const level = String(row.risk_level || "").toLowerCase();
      if (["high", "critical"].includes(level)) counts.high += 1;
      else if (["monitor", "medium"].includes(level)) counts.medium += 1;
      else counts.low += 1;
      if (row.follow_up_required) counts.assigned += 1;
    });
    return counts;
  }

  function tabButton(tab, label, count) {
    const active = state.severityTab === tab;
    return `
      <button
        type="button"
        class="px-2 py-1 text-xs rounded-md border ${active ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-200"}"
        data-severity-tab="${tab}"
      >
        ${escapeHtml(label)} ${count}
      </button>
    `;
  }

  function render() {
    const rows = filteredPatients();
    const counts = severityCounts();
    sectionEl.innerHTML = `
      <div class="flex items-center justify-between pb-3">
        <div>
          <div class="text-xs uppercase tracking-wide text-slate-500">Queue</div>
          <div class="section-title">Assigned Calls</div>
          <div class="text-xs text-slate-500 mt-1">High ${counts.high} | Medium ${counts.medium} | Low ${counts.low} | Assigned ${counts.assigned}</div>
        </div>
        <div class="text-xs text-slate-500">${rows.length} visible</div>
      </div>
      <div class="flex flex-wrap items-center gap-2 pb-3">
        ${tabButton("all", "All", state.patients.length)}
        ${tabButton("high", "High", counts.high)}
        ${tabButton("medium", "Medium", counts.medium)}
        ${tabButton("low", "Low", counts.low)}
      </div>
      <ul id="patients" class="space-y-2"></ul>
    `;

    const listEl = sectionEl.querySelector("#patients");
    if (!listEl) return;

    if (!rows.length) {
      listEl.innerHTML = `<li class="text-sm text-slate-500 px-2 py-4">No matching patients.</li>`;
      return;
    }

    listEl.innerHTML = rows
      .map((row) => {
        const isActive = Number(row.patient_id) === Number(state.selectedId);
        const riskClass = riskDotClass(row.risk_level);
        const riskText = riskLabel(row.risk_level);
        const followup = row.follow_up_required ? "Follow-up" : "On track";
        return `
          <li class="patient-row ${isActive ? "active" : ""}" data-patient-id="${row.patient_id}">
            <div class="flex items-center justify-between gap-2">
              <div class="font-semibold text-sm">${escapeHtml(row.patient_name || `Patient ${row.patient_id}`)}</div>
              <span class="${riskClass}"></span>
            </div>
            <div class="mt-1 flex items-center justify-between text-xs text-slate-500">
              <span>${escapeHtml(riskText)}</span>
              <span>${escapeHtml(followup)}</span>
            </div>
            <div class="mt-1 text-xs text-slate-500">
              ${escapeHtml(String(row.age ?? "--"))} ${escapeHtml(String(row.gender || "-").slice(0, 1).toUpperCase())} | ${escapeHtml(row.disease_track || "Track --")}
            </div>
          </li>
        `;
      })
      .join("");

    sectionEl.querySelectorAll("[data-severity-tab]").forEach((button) => {
      button.addEventListener("click", () => {
        state.severityTab = button.dataset.severityTab || "all";
        render();
      });
    });

    listEl.querySelectorAll("[data-patient-id]").forEach((item) => {
      item.addEventListener("click", () => {
        const id = Number(item.dataset.patientId || "");
        if (!id) return;
        if (typeof onSelect === "function") onSelect(id);
      });
    });
  }

  return {
    setPatients(rows) {
      state.patients = Array.isArray(rows) ? rows.slice() : [];
      render();
    },
    setSearch(query) {
      state.query = query || "";
      render();
    },
    setSelected(patientId) {
      state.selectedId = patientId;
      render();
    },
    setSeverityTab(next) {
      state.severityTab = next || "all";
      render();
    },
    getSelected() {
      return state.selectedId;
    },
    getVisiblePatients() {
      return filteredPatients();
    },
    getPatientById(patientId) {
      return state.patients.find((row) => Number(row.patient_id) === Number(patientId)) || null;
    }
  };
}
