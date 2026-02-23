import { escapeHtml } from "./utils.js";

let modalRoot = null;
let closeCurrent = null;

function ensureModalRoot() {
  if (modalRoot) return modalRoot;
  const el = document.getElementById("modal");
  if (!el) throw new Error("Modal root (#modal) is missing");
  modalRoot = el;
  return el;
}

function closeModal(result = null) {
  if (typeof closeCurrent === "function") {
    const resolve = closeCurrent;
    closeCurrent = null;
    resolve(result);
  }
  if (modalRoot) {
    modalRoot.classList.add("hidden");
    modalRoot.innerHTML = "";
  }
}

function fieldMarkup(field) {
  const name = escapeHtml(field.name);
  const label = escapeHtml(field.label || field.name);
  const type = field.type || "text";
  const required = field.required ? "required" : "";
  const value = field.value != null ? `value="${escapeHtml(field.value)}"` : "";
  const placeholder = field.placeholder ? `placeholder="${escapeHtml(field.placeholder)}"` : "";
  const min = field.min != null ? `min="${escapeHtml(field.min)}"` : "";
  const max = field.max != null ? `max="${escapeHtml(field.max)}"` : "";

  if (type === "textarea") {
    return `
      <label class="block">
        <span class="text-sm font-semibold text-slate-700">${label}</span>
        <textarea
          name="${name}"
          class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          ${placeholder}
          rows="${field.rows || 4}"
          ${required}
        >${escapeHtml(field.value || "")}</textarea>
      </label>
    `;
  }

  if (type === "select") {
    const options = Array.isArray(field.options) ? field.options : [];
    const selectedValue = String(field.value || "");
    return `
      <label class="block">
        <span class="text-sm font-semibold text-slate-700">${label}</span>
        <select
          name="${name}"
          class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          ${required}
        >
          <option value="">Select</option>
          ${options
            .map((option) => {
              const value = escapeHtml(option?.value ?? option?.label ?? "");
              const text = escapeHtml(option?.label ?? option?.value ?? "");
              const selected = String(option?.value ?? option?.label ?? "") === selectedValue ? "selected" : "";
              return `<option value="${value}" ${selected}>${text}</option>`;
            })
            .join("")}
        </select>
      </label>
    `;
  }

  return `
    <label class="block">
      <span class="text-sm font-semibold text-slate-700">${label}</span>
      <input
        type="${escapeHtml(type)}"
        name="${name}"
        class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
        ${value}
        ${placeholder}
        ${min}
        ${max}
        ${required}
      />
    </label>
  `;
}

export function initModals(rootEl) {
  modalRoot = rootEl || ensureModalRoot();
  modalRoot.addEventListener("click", (event) => {
    if (event.target === modalRoot) closeModal(null);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && closeCurrent) closeModal(null);
  });
}

export function openFormModal(config) {
  const root = ensureModalRoot();
  const {
    title,
    description = "",
    confirmLabel = "Save",
    cancelLabel = "Cancel",
    fields = []
  } = config || {};

  root.classList.remove("hidden");
  root.innerHTML = `
    <div class="modal-shell">
      <div class="modal-card p-5">
        <div class="mb-4">
          <h3 class="text-lg font-semibold">${escapeHtml(title || "Input")}</h3>
          ${description ? `<p class="mt-1 text-sm text-slate-500">${escapeHtml(description)}</p>` : ""}
        </div>
        <form id="modalForm" class="space-y-3">
          ${fields.map((field) => fieldMarkup(field)).join("")}
          <div class="flex items-center justify-end gap-2 pt-2">
            <button type="button" id="modalCancel" class="app-btn app-btn-ghost">${escapeHtml(cancelLabel)}</button>
            <button type="submit" class="app-btn app-btn-primary">${escapeHtml(confirmLabel)}</button>
          </div>
        </form>
      </div>
    </div>
  `;

  return new Promise((resolve) => {
    closeCurrent = resolve;
    const form = root.querySelector("#modalForm");
    const cancel = root.querySelector("#modalCancel");

    if (cancel) {
      cancel.addEventListener("click", () => closeModal(null));
    }

    if (!form) return;
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const fd = new FormData(form);
      const values = {};
      fields.forEach((field) => {
        values[field.name] = String(fd.get(field.name) || "").trim();
      });
      closeModal(values);
    });
  });
}

export function closeActiveModal() {
  closeModal(null);
}
