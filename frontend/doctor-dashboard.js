/* Doctor Dashboard JavaScript */

let selectedPatient = null;
let selectedCallLog = null;
let highAlerts = [];

(async () => {
    await ensureAuth();
    const user = getUser();

    if (user.role !== 'doctor' && user.role !== 'admin') {
        window.location.href = '/frontend/login.html';
        return;
    }

    renderSidebar();
    document.getElementById('userName').textContent = user.name;

    // Load data
    await loadHighAlerts();

    // Auto-refresh every 20 seconds
    setInterval(loadHighAlerts, 20000);

    // Event listeners
    document.getElementById('logoutBtn').addEventListener('click', logout);
    document.getElementById('includeActioned').addEventListener('change', loadHighAlerts);
    document.getElementById('btnConfirm').addEventListener('click', confirmAlert);
    document.getElementById('btnClear').addEventListener('click', () => showClearModal());
    document.getElementById('btnOverride').addEventListener('click', overrideRisk);
    document.getElementById('btnAssignNurse').addEventListener('click', () => showNurseModal());
    document.getElementById('confirmAssign').addEventListener('click', assignNurse);
    document.getElementById('cancelAssign').addEventListener('click', () => hideNurseModal());
})();

async function loadHighAlerts() {
    try {
        const includeActioned = document.getElementById('includeActioned').checked;
        const alerts = await apiCall(`/doctor/high-alerts?include_actioned=${includeActioned}`);
        highAlerts = alerts;

        const container = document.getElementById('highAlertsList');
        const countEl = document.getElementById('alertCount');

        countEl.textContent = `${alerts.length} High Alert${alerts.length !== 1 ? 's' : ''}`;

        if (alerts.length === 0) {
            container.innerHTML = '<div class="text-sm text-muted text-center py-8">No high-risk patients</div>';
            return;
        }

        container.innerHTML = alerts.map(alert => {
            const bgClass = alert.has_nurse_correction ? 'bg-info bg-opacity-10' : 'bg-white';
            const timeAgo = formatTimeAgo(alert.call_time);

            return `
        <div class="p-4 border border-border rounded-xl ${bgClass} cursor-pointer hover:shadow-sm transition-shadow"
             onclick="selectPatient(${alert.patient_id}, ${alert.call_log_id})">
          <div class="flex justify-between items-start mb-2">
            <div>
              <div class="font-semibold">${alert.patient_name}</div>
              <div class="text-sm text-muted">${alert.age} y/o • ${alert.disease_track}</div>
            </div>
            <div class="px-2 py-1 bg-critical text-white rounded text-xs font-semibold">
              ${(alert.risk_score * 100).toFixed(0)}%
            </div>
          </div>
          <div class="flex items-center gap-2 text-xs text-muted">
            <span>${timeAgo}</span>
            ${alert.has_nurse_correction ? '<span class="text-info">● Nurse reviewed</span>' : ''}
            ${alert.previous_actions.length > 0 ? `<span>${alert.previous_actions.length} action(s)</span>` : ''}
          </div>
        </div>
      `;
        }).join('');
    } catch (err) {
        console.error('Failed to load high alerts:', err);
        showToast('Failed to load high alerts', 'error');
    }
}

async function selectPatient(patientId, callLogId) {
    selectedPatient = patientId;
    selectedCallLog = callLogId;

    try {
        const details = await apiCall(`/doctor/patient-details/${patientId}`);

        // Show detail panel
        document.getElementById('emptyState').classList.add('hidden');
        document.getElementById('patientDetail').classList.remove('hidden');

        // Populate header
        const patient = details.patient;
        document.getElementById('detailName').textContent = patient.name;
        document.getElementById('detailInfo').textContent =
            `${patient.age} y/o ${patient.gender || ''} • ${patient.disease_track} • ${patient.protocol}`;

        // Risk score badge
        const todayCall = details.todays_calls.find(c => c.id === callLogId);
        if (todayCall && todayCall.risk_score) {
            const riskEl = document.getElementById('detailRisk');
            riskEl.textContent = `${(todayCall.risk_score * 100).toFixed(0)}% Risk`;
            riskEl.className = `px-3 py-1 rounded-lg text-sm font-semibold ${todayCall.risk_level === 'high' ? 'bg-critical text-white' :
                todayCall.risk_level === 'medium' ? 'bg-warning text-white' :
                    'bg-success text-white'
                }`;
        }

        // IVR Responses
        const responsesEl = document.getElementById('detailResponses');
        if (details.ivr_responses && details.ivr_responses.length > 0) {
            responsesEl.innerHTML = details.ivr_responses.map(resp => `
        <div class="p-3 border border-border rounded-lg text-sm bg-panel bg-opacity-30">
          <div class="font-semibold text-xs text-muted uppercase mb-2">${resp.intent_id}</div>
          <div class="mb-2">
            <span class="font-medium">Q:</span> ${resp.question || 'No question text'}
          </div>
          <div class="flex items-start gap-2">
            <span class="font-medium">A:</span>
            ${resp.has_correction ? `
              <div class="flex-1">
                <span class="text-muted line-through">${resp.original_text}</span>
                <span class="text-info font-medium ml-1">✓ ${resp.corrected_text}</span>
              </div>
            ` : `
              <div class="flex-1 font-medium">${resp.original_text || 'No response'}</div>
            `}
          </div>
          ${resp.red_flag ? '<div class="mt-2 text-critical text-xs font-semibold">🚩 Red Flag Detected</div>' : ''}
        </div>
      `).join('');
        } else {
            responsesEl.innerHTML = '<div class="text-muted text-sm">No IVR responses today</div>';
        }

        // Model Explainability
        const explainEl = document.getElementById('detailExplain');
        if (details.explainability) {
            explainEl.innerHTML = renderExplainability(details.explainability);
        } else {
            explainEl.innerHTML = '<div class="text-muted">No explainability data available</div>';
        }

        // Previous Actions
        if (details.previous_actions && details.previous_actions.length > 0) {
            document.getElementById('prevActionsSection').classList.remove('hidden');
            document.getElementById('detailActions').innerHTML = details.previous_actions.map(action => `
        <div class="p-2 bg-panel rounded text-xs">
          <span class="font-semibold">${action.action.toUpperCase()}</span>
          ${action.doctor_note ? `<div class="text-muted mt-1">${action.doctor_note.replace(/^\[for [^\]]+\]\s*/, '')}</div>` : ''}
        </div>
      `).join('');
        } else {
            document.getElementById('prevActionsSection').classList.add('hidden');
        }

    } catch (err) {
        console.error('Failed to load patient details:', err);
        showToast('Failed to load patient details', 'error');
    }
}

async function confirmAlert() {
    if (!selectedPatient || !selectedCallLog) return;

    const note = document.getElementById('doctorNote').value;

    try {
        await apiCall('/doctor/confirm-alert', 'POST', {
            call_log_id: selectedCallLog,
            patient_id: selectedPatient,
            doctor_note: note || null
        });

        showToast('Alert confirmed successfully', 'success');
        document.getElementById('doctorNote').value = '';
        await loadHighAlerts();
    } catch (err) {
        showToast('Failed to confirm alert: ' + err.message, 'error');
    }
}

function showClearModal() {
    const reason = prompt('Reason for clearing this alert (false positive):');
    if (reason && reason.length >= 5) {
        clearAlert(reason);
    } else if (reason) {
        showToast('Reason must be at least 5 characters', 'error');
    }
}

async function clearAlert(reason) {
    if (!selectedPatient || !selectedCallLog) return;

    try {
        await apiCall('/doctor/clear-alert', 'POST', {
            call_log_id: selectedCallLog,
            patient_id: selectedPatient,
            reason: reason
        });

        showToast('Alert cleared as false positive', 'success');
        document.getElementById('doctorNote').value = '';
        await loadHighAlerts();
    } catch (err) {
        showToast('Failed to clear alert: ' + err.message, 'error');
    }
}

async function overrideRisk() {
    if (!selectedPatient || !selectedCallLog) return;

    const overrideScore = parseFloat(document.getElementById('overrideScore').value);
    const justification = document.getElementById('doctorNote').value;

    if (isNaN(overrideScore) || overrideScore < 0 || overrideScore > 1) {
        showToast('Invalid risk score. Must be between 0 and 1', 'error');
        return;
    }

    if (!justification || justification.length < 10) {
        showToast('Justification must be at least 10 characters', 'error');
        return;
    }

    try {
        await apiCall('/doctor/override-risk', 'POST', {
            call_log_id: selectedCallLog,
            patient_id: selectedPatient,
            override_score: overrideScore,
            justification: justification
        });

        showToast(`Risk score overridden to ${(overrideScore * 100).toFixed(0)}%`, 'success');
        document.getElementById('overrideScore').value = '';
        document.getElementById('doctorNote').value = '';
        await loadHighAlerts();
        if (selectedPatient) {
            await selectPatient(selectedPatient, selectedCallLog);
        }
    } catch (err) {
        showToast('Failed to override risk: ' + err.message, 'error');
    }
}

function showNurseModal() {
    document.getElementById('nurseAssignModal').classList.remove('hidden');
}

function hideNurseModal() {
    document.getElementById('nurseAssignModal').classList.add('hidden');
    document.getElementById('assignNote').value = '';
}

async function assignNurse() {
    if (!selectedPatient || !selectedCallLog) return;

    const priority = document.getElementById('assignPriority').value;
    const note = document.getElementById('assignNote').value;

    if (!note || note.length < 5) {
        showToast('Note must be at least 5 characters', 'error');
        return;
    }

    try {
        await apiCall('/doctor/assign-nurse-call', 'POST', {
            patient_id: selectedPatient,
            call_log_id: selectedCallLog,
            assigned_to_nurse_id: null, // Unassigned - any nurse can take
            priority: priority,
            note: note
        });

        showToast('Nurse follow-up assigned successfully', 'success');
        hideNurseModal();
    } catch (err) {
        showToast('Failed to assign nurse: ' + err.message, 'error');
    }
}

function renderExplainability(explain) {
    if (!explain || !explain.shap_values) {
        return '<div class="text-muted">Explainability data not available</div>';
    }

    // Simple bar chart representation of SHAP values
    const features = Object.entries(explain.shap_values || {})
        .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
        .slice(0, 5);

    if (features.length === 0) {
        return '<div class="text-muted">No feature importance data</div>';
    }

    return features.map(([feature, value]) => {
        const absValue = Math.abs(value);
        const maxAbs = Math.max(...features.map(f => Math.abs(f[1])));
        const width = (absValue / maxAbs) * 100;
        const color = value > 0 ? 'bg-critical' : 'bg-success';

        return `
      <div class="mb-2">
        <div class="flex justify-between text-xs mb-1">
          <span>${feature}</span>
          <span class="font-semibold">${value > 0 ? '+' : ''}${value.toFixed(3)}</span>
        </div>
        <div class="h-2 bg-gray-200 rounded-full overflow-hidden">
          <div class="${color} h-full rounded-full" style="width: ${width}%"></div>
        </div>
      </div>
    `;
    }).join('');
}

function formatTimeAgo(isoString) {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
}

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `fixed top-4 right-4 px-4 py-3 rounded-lg shadow-lg text-white z-50 ${type === 'success' ? 'bg-success' : type === 'error' ? 'bg-critical' : 'bg-info'
        }`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// Make functions global
window.selectPatient = selectPatient;
