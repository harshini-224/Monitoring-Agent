/* global window, document */
(function bootstrapUi(global) {
  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function renderEmpty(message = "No data available.") {
    return `<div class="empty-state">${escapeHtml(message)}</div>`;
  }

  function renderError(message = "Something went wrong.") {
    return `<div class="error-state">${escapeHtml(message)}</div>`;
  }

  function ensureModalRoot() {
    let root = document.getElementById("globalUiModal");
    if (root) return root;
    root = document.createElement("div");
    root.id = "globalUiModal";
    root.className = "ui-modal hidden";
    root.innerHTML = `
      <div class="ui-modal-backdrop"></div>
      <div class="ui-modal-card">
        <h3 id="globalUiModalTitle" class="ui-modal-title">Notice</h3>
        <div id="globalUiModalBody" class="ui-modal-body"></div>
        <div class="ui-modal-actions">
          <button id="globalUiModalCancel" class="btn-secondary">Cancel</button>
          <button id="globalUiModalConfirm" class="btn-primary">Confirm</button>
        </div>
      </div>
    `;
    document.body.appendChild(root);
    return root;
  }

  function showModal({
    title = "Notice",
    body = "",
    confirmLabel = "Confirm",
    cancelLabel = "Cancel",
    showCancel = true,
    dialogClass = "",
    preserveWhitespace = false
  }) {
    const root = ensureModalRoot();
    const titleEl = root.querySelector("#globalUiModalTitle");
    const bodyEl = root.querySelector("#globalUiModalBody");
    const cardEl = root.querySelector(".ui-modal-card");
    const confirmBtn = root.querySelector("#globalUiModalConfirm");
    const cancelBtn = root.querySelector("#globalUiModalCancel");
    const baseCardClass = "ui-modal-card";
    titleEl.textContent = title;
    bodyEl.innerHTML = body;
    bodyEl.style.whiteSpace = preserveWhitespace ? "pre-line" : "normal";
    if (cardEl) {
      cardEl.className = baseCardClass;
      if (dialogClass) cardEl.classList.add(...String(dialogClass).split(" ").filter(Boolean));
    }
    confirmBtn.textContent = confirmLabel;
    cancelBtn.textContent = cancelLabel;
    cancelBtn.classList.toggle("hidden", !showCancel);
    root.classList.remove("hidden");

    return new Promise((resolve) => {
      const cleanup = (result) => {
        root.classList.add("hidden");
        confirmBtn.onclick = null;
        cancelBtn.onclick = null;
        resolve(result);
      };
      confirmBtn.onclick = () => cleanup(true);
      cancelBtn.onclick = () => cleanup(false);
      root.querySelector(".ui-modal-backdrop").onclick = () => cleanup(false);
    });
  }

  async function dialog({
    title = "Notice",
    message = "",
    html = "",
    confirmLabel = "OK",
    cancelLabel = "Cancel",
    showCancel = true,
    onConfirm,
    dialogClass = "",
    preserveWhitespace = false
  }) {
    const safeMessage = escapeHtml(message).replace(/\n/g, "<br />");
    const body = html || safeMessage;
    const accepted = await showModal({
      title,
      body,
      confirmLabel,
      cancelLabel,
      showCancel,
      dialogClass,
      preserveWhitespace
    });
    if (!accepted) return false;

    if (typeof onConfirm === "function") {
      try {
        await onConfirm();
      } catch (err) {
        console.error(err);
        toast("Action failed. Please try again.", "error");
        return false;
      }
    }
    return true;
  }

  async function confirm(config) {
    return showModal({ ...config });
  }

  async function prompt({
    title = "Input required",
    label = "Value",
    placeholder = "",
    confirmLabel = "Save",
    cancelLabel = "Cancel",
    initialValue = ""
  }) {
    const inputId = "globalUiPromptInput";
    const body = `
      <label class="text-xs text-muted">${escapeHtml(label)}</label>
      <input id="${inputId}" class="mt-2 w-full border border-border rounded-md px-3 py-2 text-sm" placeholder="${escapeHtml(placeholder)}" value="${escapeHtml(initialValue)}" />
    `;
    const accepted = await showModal({ title, body, confirmLabel, cancelLabel, showCancel: true });
    if (!accepted) return null;
    const value = document.getElementById(inputId)?.value?.trim();
    return value || null;
  }

  function toast(message, variant = "neutral") {
    let host = document.getElementById("globalUiToastHost");
    if (!host) {
      host = document.createElement("div");
      host.id = "globalUiToastHost";
      host.className = "toast-host";
      document.body.appendChild(host);
    }
    const el = document.createElement("div");
    el.className = `toast toast-${variant}`;
    el.textContent = message;
    host.appendChild(el);
    setTimeout(() => {
      el.classList.add("toast-hide");
      setTimeout(() => el.remove(), 180);
    }, 2600);
  }

  function loadingRows(rows = 4) {
    return `<div class="skeleton-stack">${Array.from({ length: rows }).map(() => '<div class="skeleton-row"></div>').join("")}</div>`;
  }

  global.ui = {
    confirm,
    dialog,
    escapeHtml,
    loadingRows,
    prompt,
    renderEmpty,
    renderError,
    toast
  };
})(window);
