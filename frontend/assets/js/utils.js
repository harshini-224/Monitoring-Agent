/**
 * CarePulse Utility Functions
 * Shared utilities for formatting, UI helpers, and common functions
 */

// ============================================================================
// DATE & TIME FORMATTING
// ============================================================================

/**
 * Format date to readable string
 */
function formatDate(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    });
}

/**
 * Format datetime to readable string
 */
function formatDateTime(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

/**
 * Format time ago (e.g., "2 hours ago")
 */
function formatTimeAgo(dateString) {
    if (!dateString) return 'N/A';

    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);

    const intervals = {
        year: 31536000,
        month: 2592000,
        week: 604800,
        day: 86400,
        hour: 3600,
        minute: 60,
    };

    for (const [unit, secondsInUnit] of Object.entries(intervals)) {
        const interval = Math.floor(seconds / secondsInUnit);
        if (interval >= 1) {
            return `${interval} ${unit}${interval > 1 ? 's' : ''} ago`;
        }
    }

    return 'Just now';
}

/**
 * Format date to ISO string for API (YYYY-MM-DD)
 */
function formatDateISO(date) {
    if (!date) return null;
    if (typeof date === 'string') {
        date = new Date(date);
    }
    return date.toISOString().split('T')[0];
}

// ============================================================================
// RISK & STATUS FORMATTING
// ============================================================================

/**
 * Get risk level from score
 */
function getRiskLevel(score) {
    if (score === null || score === undefined) return 'normal';
    if (score >= 0.85) return 'critical';
    if (score >= 0.7) return 'high';
    if (score >= 0.4) return 'medium';
    if (score >= 0.2) return 'low';
    return 'normal';
}

/**
 * Get risk label from score
 */
function getRiskLabel(score) {
    const level = getRiskLevel(score);
    return level.charAt(0).toUpperCase() + level.slice(1);
}

/**
 * Format risk score as percentage
 */
function formatRisk(score) {
    if (score === null || score === undefined) return 'N/A';
    return `${Math.round(score * 100)}%`;
}

/**
 * Create risk badge HTML
 */
function createRiskBadge(score) {
    const level = getRiskLevel(score);
    const label = getRiskLabel(score);
    const percentage = formatRisk(score);

    return `<span class="risk-badge risk-badge-${level}">${label} ${percentage}</span>`;
}

// ============================================================================
// TOAST NOTIFICATIONS
// ============================================================================

let toastContainer = null;

/**
 * Initialize toast container
 */
function initToastContainer() {
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.className = 'toast-container';
        document.body.appendChild(toastContainer);
    }
}

/**
 * Show toast notification
 */
function showToast(title, message, type = 'info', duration = 3000) {
    initToastContainer();

    const icons = {
        success: '✓',
        error: '✕',
        warning: '⚠',
        info: 'ℹ',
    };

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
    <div class="toast-icon">${icons[type] || icons.info}</div>
    <div class="toast-content">
      <div class="toast-title">${title}</div>
      <div class="toast-message">${message}</div>
    </div>
  `;

    toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => {
            toastContainer.removeChild(toast);
        }, 300);
    }, duration);
}

// ============================================================================
// MODAL HELPERS
// ============================================================================

/**
 * Show modal
 */
function showModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        // If it's a dialog with an overlay, show the overlay
        const overlay = modal.closest('.modal-overlay');
        if (overlay) {
            overlay.classList.remove('hidden');
            overlay.style.display = 'flex';
        } else {
            modal.style.display = 'flex';
        }
        // Prevent body scroll
        document.body.style.overflow = 'hidden';
    }
}

/**
 * Hide modal
 */
function hideModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        const overlay = modal.closest('.modal-overlay');
        if (overlay) {
            overlay.classList.add('hidden');
            overlay.style.display = 'none';
        } else {
            modal.style.display = 'none';
        }
        // Restore body scroll
        document.body.style.overflow = '';
    }
}

/**
 * Show a professional alert dialog
 */
function alertDialog(title, message, onOk = null) {
    const dialogId = 'carepulse-alert-dialog';
    let overlay = document.getElementById(dialogId + '-overlay');

    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = dialogId + '-overlay';
        overlay.className = 'modal-overlay hidden';
        overlay.innerHTML = `
      <div id="${dialogId}" class="modal" style="display: flex;">
        <div class="modal-content" style="max-width: 400px; margin: auto;">
          <div class="modal-header">
            <h3 class="dialog-title">Alert</h3>
            <button class="modal-close" onclick="hideModal('${dialogId}')">&times;</button>
          </div>
          <div class="modal-body">
            <p class="dialog-message"></p>
          </div>
          <div class="modal-footer" style="display: flex; justify-content: flex-end;">
            <button class="btn btn-primary dialog-ok">OK</button>
          </div>
        </div>
      </div>
    `;
        document.body.appendChild(overlay);
    }

    const modal = overlay.querySelector('.modal');
    modal.querySelector('.dialog-title').textContent = title;
    modal.querySelector('.dialog-message').textContent = message;

    const okBtn = modal.querySelector('.dialog-ok');
    const newOk = okBtn.cloneNode(true);
    okBtn.parentNode.replaceChild(newOk, okBtn);

    newOk.addEventListener('click', () => {
        hideModal(dialogId);
        if (onOk) onOk();
    });

    showModal(dialogId);
}

/**
 * Show a professional confirmation dialog
 */
function confirmDialog(title, message, onConfirm, onCancel = null) {
    const dialogId = 'carepulse-confirm-dialog';
    let overlay = document.getElementById(dialogId + '-overlay');

    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = dialogId + '-overlay';
        overlay.className = 'modal-overlay hidden';
        overlay.innerHTML = `
      <div id="${dialogId}" class="modal" style="display: flex;">
        <div class="modal-content" style="max-width: 400px; margin: auto;">
          <div class="modal-header">
            <h3 class="dialog-title">Confirm</h3>
            <button class="modal-close" onclick="hideModal('${dialogId}')">&times;</button>
          </div>
          <div class="modal-body">
            <p class="dialog-message"></p>
          </div>
          <div class="modal-footer" style="display: flex; justify-content: flex-end; gap: 1rem;">
            <button class="btn btn-secondary dialog-cancel">Cancel</button>
            <button class="btn btn-primary dialog-confirm">Confirm</button>
          </div>
        </div>
      </div>
    `;
        document.body.appendChild(overlay);
    }

    const modal = overlay.querySelector('.modal');
    modal.querySelector('.dialog-title').textContent = title;
    modal.querySelector('.dialog-message').textContent = message;

    const confirmBtn = modal.querySelector('.dialog-confirm');
    const cancelBtn = modal.querySelector('.dialog-cancel');

    const newConfirm = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirm, confirmBtn);

    const newCancel = cancelBtn.cloneNode(true);
    cancelBtn.parentNode.replaceChild(newCancel, cancelBtn);

    newConfirm.addEventListener('click', () => {
        hideModal(dialogId);
        onConfirm();
    });

    newCancel.addEventListener('click', () => {
        hideModal(dialogId);
        if (onCancel) onCancel();
    });

    showModal(dialogId);
}

/**
 * Show a professional prompt dialog
 */
function promptDialog(title, message, defaultValue = '', onConfirm, onCancel = null) {
    const dialogId = 'carepulse-prompt-dialog';
    let overlay = document.getElementById(dialogId + '-overlay');

    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = dialogId + '-overlay';
        overlay.className = 'modal-overlay hidden';
        overlay.innerHTML = `
      <div id="${dialogId}" class="modal" style="display: flex;">
        <div class="modal-content" style="max-width: 400px; margin: auto;">
          <div class="modal-header">
            <h3 class="dialog-title">Prompt</h3>
            <button class="modal-close" onclick="hideModal('${dialogId}')">&times;</button>
          </div>
          <div class="modal-body">
            <p class="dialog-message" style="margin-bottom: 1rem;"></p>
            <input type="text" class="form-input dialog-input" style="width: 100%;" />
          </div>
          <div class="modal-footer" style="display: flex; justify-content: flex-end; gap: 1rem;">
            <button class="btn btn-secondary dialog-cancel">Cancel</button>
            <button class="btn btn-primary dialog-confirm">Submit</button>
          </div>
        </div>
      </div>
    `;
        document.body.appendChild(overlay);
    }

    const modal = overlay.querySelector('.modal');
    modal.querySelector('.dialog-title').textContent = title;
    modal.querySelector('.dialog-message').textContent = message;
    const input = modal.querySelector('.dialog-input');
    input.value = defaultValue;

    const confirmBtn = modal.querySelector('.dialog-confirm');
    const cancelBtn = modal.querySelector('.dialog-cancel');

    const newConfirm = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirm, confirmBtn);

    const newCancel = cancelBtn.cloneNode(true);
    cancelBtn.parentNode.replaceChild(newCancel, cancelBtn);

    newConfirm.addEventListener('click', () => {
        const val = input.value.trim();
        hideModal(dialogId);
        onConfirm(val);
    });

    newCancel.addEventListener('click', () => {
        hideModal(dialogId);
        if (onCancel) onCancel();
    });

    showModal(dialogId);
    setTimeout(() => input.focus(), 100);
}

/**
 * Setup modal close handlers
 */
function setupModalCloseHandlers(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;

    // Close on overlay click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            hideModal(modalId);
        }
    });

    // Close on close button click
    const closeBtn = modal.querySelector('.modal-close');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => hideModal(modalId));
    }
}

// ============================================================================
// LOADING HELPERS
// ============================================================================

/**
 * Show loading overlay on element or global
 */
function showLoading(elementId) {
    if (!elementId) {
        // Global loading
        let overlay = document.getElementById('global-loading');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'global-loading';
            overlay.className = 'loading-overlay-global';
            overlay.innerHTML = '<div class="spinner spinner-large"></div>';
            document.body.appendChild(overlay);
        }
        overlay.style.display = 'flex';
        return;
    }

    const element = document.getElementById(elementId);
    if (!element) return;

    const overlay = document.createElement('div');
    overlay.className = 'loading-overlay';
    overlay.innerHTML = '<div class="spinner"></div>';
    overlay.id = `${elementId}-loading`;

    element.style.position = 'relative';
    element.appendChild(overlay);
}

/**
 * Hide loading overlay
 */
function hideLoading(elementId) {
    if (!elementId) {
        const overlay = document.getElementById('global-loading');
        if (overlay) {
            overlay.style.display = 'none';
        }
        return;
    }

    const overlay = document.getElementById(`${elementId}-loading`);
    if (overlay) {
        overlay.remove();
    }
}

// ============================================================================
// THEME TOGGLE
// ============================================================================

/**
 * Initialize theme from localStorage or default to dark
 */
function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    setTheme(savedTheme);
}

/**
 * Set theme
 */
function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);

    // Update theme toggle icon
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
        themeToggle.textContent = theme === 'dark' ? '☀️' : '🌙';
    }
}

/**
 * Toggle theme
 */
function toggleTheme() {
    const currentTheme = localStorage.getItem('theme') || 'dark';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
}

/**
 * Setup theme toggle button
 */
function setupThemeToggle() {
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', toggleTheme);
    }
}

// ============================================================================
// FORM VALIDATION
// ============================================================================

/**
 * Validate email format
 */
function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

/**
 * Validate required fields in form
 */
function validateForm(formId) {
    const form = document.getElementById(formId);
    if (!form) return false;

    const requiredFields = form.querySelectorAll('[required]');
    let isValid = true;

    requiredFields.forEach(field => {
        if (!field.value.trim()) {
            field.classList.add('error');
            isValid = false;
        } else {
            field.classList.remove('error');
        }
    });

    return isValid;
}

// ============================================================================
// DEBOUNCE & THROTTLE
// ============================================================================

/**
 * Debounce function
 */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Throttle function
 */
function throttle(func, limit) {
    let inThrottle;
    return function (...args) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

// ============================================================================
// AUTO-REFRESH HELPER
// ============================================================================

/**
 * Setup auto-refresh for a function
 */
function setupAutoRefresh(func, intervalSeconds = 30) {
    // Initial call
    func();

    // Setup interval
    const intervalId = setInterval(func, intervalSeconds * 1000);

    // Cleanup on page unload
    window.addEventListener('beforeunload', () => {
        clearInterval(intervalId);
    });

    return intervalId;
}

// ============================================================================
// PHONE NUMBER FORMATTING
// ============================================================================

/**
 * Format phone number for display
 */
function formatPhone(phone) {
    if (!phone) return 'N/A';
    // Remove non-numeric characters
    const cleaned = phone.replace(/\D/g, '');

    // Format as (XXX) XXX-XXXX if 10 digits
    if (cleaned.length === 10) {
        return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
    }

    // Return as-is if not standard format
    return phone;
}

// ============================================================================
// INITIALIZATION
// ============================================================================

// Initialize theme on page load
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    setupThemeToggle();
});
