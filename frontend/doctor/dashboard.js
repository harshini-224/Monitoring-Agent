/**
 * Doctor Dashboard JavaScript
 */

let highAlerts = [];
let selectedPatient = null;
let selectedCallLog = null;

document.addEventListener('DOMContentLoaded', async () => {
    const user = await initAuth(['doctor']);
    if (!user) return;

    await loadHighAlerts();

    document.getElementById('include-actioned').addEventListener('change', loadHighAlerts);
    setupAutoRefresh(loadHighAlerts, 20);
});

async function loadHighAlerts() {
    try {
        const includeActioned = document.getElementById('include-actioned').checked;
        highAlerts = await api.getHighAlerts(includeActioned);

        renderAlertsList();
        updateAlertCount();
    } catch (error) {
        console.error('Error loading alerts:', error);
        showToast('Error', 'Failed to load high alerts', 'error');
    }
}

function updateAlertCount() {
    const count = highAlerts.length;
    const badge = document.getElementById('alert-count');
    badge.innerHTML = '';
    if (count > 0) {
        badge.appendChild(createNotificationBadge(count));
    }
}

function renderAlertsList() {
    const container = document.getElementById('alerts-list');

    if (highAlerts.length === 0) {
        container.innerHTML = '<p class="text-center text-muted p-3">No high risk alerts</p>';
        return;
    }

    container.innerHTML = '';
    highAlerts.forEach(alert => {
        const card = document.createElement('div');
        card.className = `patient-card ${selectedPatient && selectedPatient.patient_id === alert.patient_id ? 'selected' : ''}`;
        card.onclick = () => selectPatient(alert);

        card.innerHTML = `
      <div class="flex-between">
        <div>
          <div class="patient-name">${alert.patient_name}</div>
          <div class="patient-meta">
            ${alert.age}y • ${alert.disease_track}
          </div>
        </div>
        ${createRiskBadge(alert.risk_score)}
      </div>
      <div class="patient-footer">
        <span class="text-xs">${formatTimeAgo(alert.call_time)}</span>
        <span class="text-xs">${alert.has_nurse_correction ? '✓ Nurse reviewed' : '• No review'}</span>
      </div>
    `;

        container.appendChild(card);
    });
}

async function selectPatient(alert) {
    selectedPatient = alert;
    selectedCallLog = alert.call_log_id;
    renderAlertsList();

    document.getElementById('patient-detail').style.display = 'block';

    try {
        const data = await api.getPatientDetails(alert.patient_id);
        renderPatientDetail(data);
    } catch (error) {
        console.error('Error loading patient details:', error);
        showToast('Error', 'Failed to load patient details', 'error');
    }
}

function renderPatientDetail(data) {
    document.getElementById('detail-name').textContent = data.patient.name;
    document.getElementById('detail-meta').textContent =
        `${data.patient.age}y • ${data.patient.gender} • ${data.patient.disease_track} • ${data.patient.protocol}`;
    document.getElementById('detail-risk-badge').innerHTML = createRiskBadge(data.patient.risk_score);

    // IVR Responses
    const ivrContainer = document.getElementById('ivr-responses');
    if (data.ivr_responses && data.ivr_responses.length > 0) {
        ivrContainer.innerHTML = '';
        data.ivr_responses.forEach(response => {
            // Backend now provides flattened correction info in the response object
            const card = createIVRResponseCard(response);
            ivrContainer.appendChild(card);
        });
    } else {
        ivrContainer.innerHTML = '<p class="text-muted">No IVR responses for today</p>';
    }

    // SHAP Explainability
    const shapContainer = document.getElementById('shap-container');
    shapContainer.innerHTML = '';

    let shapData = data.explainability;
    if (typeof shapData === 'string') {
        try {
            shapData = JSON.parse(shapData);
            if (typeof shapData === 'string') {
                shapData = JSON.parse(shapData);
            }
        } catch (e) {
            console.error('Error parsing explainability JSON:', e);
        }
    }

    if (shapData) {
        shapContainer.appendChild(createSHAPChart(shapData));
    }

    // Previous Actions
    const actionsContainer = document.getElementById('previous-actions');
    if (data.previous_actions && data.previous_actions.length > 0) {
        actionsContainer.innerHTML = '';
        data.previous_actions.forEach(action => {
            const actionEl = document.createElement('div');
            actionEl.style.cssText = 'padding: 0.75rem; background: var(--bg-secondary); border-radius: 8px; margin-bottom: 0.5rem;';
            actionEl.innerHTML = `
        <div class="flex-between">
          <strong>${action.action}</strong>
        </div>
        ${action.doctor_note ? `<div class="text-sm mt-1">${action.doctor_note.replace(/^\[for [^\]]+\]\s*/, '')}</div>` : ''}
      `;
            actionsContainer.appendChild(actionEl);
        });
    } else {
        actionsContainer.innerHTML = '<p class="text-muted">No previous actions</p>';
    }
}

async function confirmAlert() {
    console.log('Confirm Alert clicked', { selectedPatient, selectedCallLog });
    if (!selectedPatient || !selectedCallLog) {
        console.warn('Cannot confirm: No patient/log selected');
        showToast('Warning', 'Please select a patient first', 'warning');
        return;
    }

    const note = document.getElementById('doctor-note').value.trim();
    console.log('Confirming with note:', note);

    confirmDialog('Confirm Alert', 'Are you sure you want to confirm this alert with the provided clinical note?', async () => {
        try {
            showLoading();
            await api.confirmAlert(selectedCallLog, selectedPatient.patient_id, note || null);
            hideLoading();
            console.log('Alert confirmed successfully');
            showToast('Success', 'Alert confirmed', 'success');
            document.getElementById('doctor-note').value = '';
            await loadHighAlerts();
            document.getElementById('patient-detail').style.display = 'none';
        } catch (error) {
            hideLoading();
            console.error('Error confirming alert:', error);
            showToast('Error', error.message || 'Failed to confirm alert', 'error');
        }
    });
}

async function clearAlert() {
    if (!selectedPatient || !selectedCallLog) return;

    promptDialog('Clear Alert', 'Reason for clearing this alert (min 5 characters):', '', async (reason) => {
        if (!reason || reason.length < 5) {
            showToast('Error', 'Please provide a reason (min 5 characters)', 'error');
            return;
        }

        try {
            showLoading();
            await api.clearAlert(selectedCallLog, selectedPatient.patient_id, reason);
            hideLoading();
            showToast('Success', 'Alert cleared', 'success');
            await loadHighAlerts();
            document.getElementById('patient-detail').style.display = 'none';
        } catch (error) {
            hideLoading();
            console.error('Error clearing alert:', error);
            showToast('Error', error.message || 'Failed to clear alert', 'error');
        }
    });
}

async function overrideRisk() {
    if (!selectedPatient || !selectedCallLog) return;

    promptDialog('Override Risk', 'Enter new risk score (0.0 to 1.0):', '0.5', (newScore) => {
        if (!newScore) return;

        const score = parseFloat(newScore);
        if (isNaN(score) || score < 0 || score > 1) {
            alertDialog('Invalid Input', 'Score must be between 0.0 and 1.0');
            return;
        }

        promptDialog('Justification Required', 'Enter justification for override (min 10 characters):', '', async (justification) => {
            if (!justification || justification.length < 10) {
                showToast('Error', 'Please provide justification (min 10 characters)', 'error');
                return;
            }

            try {
                showLoading();
                await api.overrideRisk(selectedCallLog, selectedPatient.patient_id, score, justification);
                hideLoading();
                showToast('Success', `Risk overridden to ${Math.round(score * 100)}%`, 'success');
                await loadHighAlerts();
                if (selectedPatient) {
                    await selectPatient(selectedPatient);
                }
            } catch (error) {
                hideLoading();
                console.error('Error overriding risk:', error);
                showToast('Error', error.message || 'Failed to override risk', 'error');
            }
        });
    });
}

function assignNurse() {
    if (!selectedPatient) return;
    showModal('assign-nurse-modal');
}

async function submitNurseAssignment() {
    if (!selectedPatient) return;

    const priority = document.getElementById('nurse-priority').value;
    const note = document.getElementById('nurse-note').value.trim();

    if (!note) {
        showToast('Error', 'Please provide instructions for nurse', 'error');
        return;
    }

    try {
        await api.assignNurseCall({
            patient_id: selectedPatient.patient_id,
            call_log_id: selectedCallLog,
            priority,
            note,
        });

        showToast('Success', 'Nurse assignment created', 'success');
        hideModal('assign-nurse-modal');
        document.getElementById('nurse-note').value = '';
    } catch (error) {
        console.error('Error assigning nurse:', error);
        showToast('Error', error.message || 'Failed to assign nurse', 'error');
    }
}
