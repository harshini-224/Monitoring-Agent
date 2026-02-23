/**
 * Nurse Patient Detail Page JavaScript
 */

let patientId = null;
let currentDate = null;
let patientData = null;
let correctionTarget = null;

let currentUser = null;

document.addEventListener('DOMContentLoaded', async () => {
  currentUser = await initAuth(['nurse']);
  if (!currentUser) return;

  // Get patient ID from URL
  const params = new URLSearchParams(window.location.search);
  patientId = parseInt(params.get('id'));

  if (!patientId) {
    showToast('Error', 'No patient ID provided', 'error');
    setTimeout(() => window.location.href = 'dashboard.html', 2000);
    return;
  }

  // Set current date to today
  currentDate = formatDateISO(new Date());

  await loadPatientDetail();
});

async function loadPatientDetail() {
  try {
    patientData = await api.getNursePatientDetail(patientId, currentDate);
    renderPatientDetail();
  } catch (error) {
    console.error('Error loading patient detail:', error);
    showToast('Error', 'Failed to load patient details', 'error');
  }
}

function renderPatientDetail() {
  if (!patientData) return;

  // Update header
  document.getElementById('patient-name').textContent = patientData.patient_name || 'Patient';

  // Render date navigation
  const dateNavContainer = document.getElementById('date-nav');
  dateNavContainer.innerHTML = '';

  const dateNav = createDateNav(
    currentDate,
    patientData.monitoring_start || null,
    formatDateISO(new Date()),
    async (newDate) => {
      currentDate = newDate;
      await loadPatientDetail();
    }
  );
  dateNavContainer.appendChild(dateNav);

  // Render enrollment data
  const enrollmentEl = document.getElementById('enrollment-data');
  enrollmentEl.innerHTML = `
    <div class="grid grid-2 gap-2">
      <div><strong>Age:</strong> ${patientData.age || 'N/A'}</div>
      <div><strong>Gender:</strong> ${patientData.gender || 'N/A'}</div>
      <div><strong>Disease:</strong> ${patientData.disease_track || 'N/A'}</div>
      <div><strong>Protocol:</strong> ${patientData.protocol || 'N/A'}</div>
      <div><strong>Phone:</strong> ${formatPhone(patientData.phone_number)}</div>
      <div><strong>Enrolled:</strong> ${formatDate(patientData.created_at)}</div>
    </div>
  `;

  // Render monitoring summary
  const summaryEl = document.getElementById('monitoring-summary');
  summaryEl.innerHTML = `
    <div style="background: var(--bg-secondary); padding: 1rem; border-radius: 8px;">
      <div class="flex-between mb-1">
        <span>Monitoring Day</span>
        <strong>${patientData.monitoring_day || 'N/A'} / ${patientData.days_to_monitor || 'N/A'}</strong>
      </div>
      <div class="flex-between mb-1">
        <span>Current Risk</span>
        ${patientData.risk_score !== null ? createRiskBadge(patientData.risk_score) : '<span>N/A</span>'}
      </div>
      <div class="flex-between">
        <span>Follow-up Required</span>
        <strong>${patientData.follow_up_required ? 'Yes' : 'No'}</strong>
      </div>
    </div>
  `;

  // Render IVR responses
  const ivrContainer = document.getElementById('ivr-responses');
  if (patientData.ivr_data && patientData.ivr_data.length > 0) {
    ivrContainer.innerHTML = '';
    patientData.ivr_data.forEach(response => {
      const card = document.createElement('div');
      card.className = 'card mb-2';

      const correction = patientData.corrections?.find(c => c.agent_response_id === response.id);

      card.innerHTML = `
        <div class="flex-between mb-2">
          <strong style="color: var(--accent-primary); line-height: 1.4;">${response.question || response.intent_id}</strong>
          ${response.red_flag ? '<span class="risk-badge risk-badge-critical" style="flex-shrink: 0; margin-left: 0.5rem;">RED FLAG</span>' : ''}
        </div>
        <div style="color: var(--text-secondary);">
          ${correction ? `
            <div style="text-decoration: line-through; color: var(--text-tertiary);">${response.full_response || response.raw_text || '-'}</div>
            <div style="color: var(--success); font-weight: 500; margin-top: 0.25rem;">
              ✓ ${correction.corrected_text}
            </div>
            <div class="text-xs text-muted mt-1">Reason: ${correction.correction_reason || 'N/A'}</div>
          ` : (response.full_response && response.full_response !== '-' ? response.full_response : (response.raw_text || 'No response'))}
        </div>
        ${!correction ? `
          <button class="btn btn-secondary btn-sm mt-2" onclick='correctResponse(${JSON.stringify({
        id: response.id,
        text: response.full_response || response.raw_text,
        intent: response.intent_id
      }).replace(/'/g, "&apos;")})'>
            ✏️ Correct Response
          </button>
        ` : ''}
      `;

      ivrContainer.appendChild(card);
    });
  } else {
    ivrContainer.innerHTML = '<p class="text-muted">No IVR responses for this date</p>';
  }

  // Render doctor notes
  const notesEl = document.getElementById('doctor-notes');
  if (patientData.doctor_notes && patientData.doctor_notes.length > 0) {
    notesEl.innerHTML = '';
    patientData.doctor_notes.forEach(note => {
      const noteCard = document.createElement('div');
      noteCard.style.cssText = 'padding: 0.75rem; background: var(--bg-secondary); border-radius: 8px; margin-bottom: 0.5rem;';
      noteCard.innerHTML = `
        <div>${note.note.replace(/^\[for [^\]]+\]\s*/, '')}</div>
      `;
      notesEl.appendChild(noteCard);
    });
  } else {
    notesEl.innerHTML = '<p class="text-muted">No doctor notes for this date</p>';
  }

  // Render medications
  const medsEl = document.getElementById('medications');
  if (patientData.medications && patientData.medications.length > 0) {
    medsEl.innerHTML = '';
    patientData.medications.forEach(med => {
      const medCard = document.createElement('div');
      medCard.style.cssText = 'padding: 0.75rem; background: var(--bg-secondary); border-radius: 8px; margin-bottom: 0.5rem;';
      medCard.innerHTML = `
        <div class="flex-between">
          <strong>${med.medication_name}</strong>
          <span class="text-sm" style="color: var(--${med.status === 'completed' ? 'success' : 'warning'})">${med.status}</span>
        </div>
        ${med.dose ? `<div class="text-sm text-muted">Dose: ${med.dose}</div>` : ''}
        <div class="text-xs text-muted">${formatDateTime(med.scheduled_for)}</div>
      `;
      medsEl.appendChild(medCard);
    });
  } else {
    medsEl.innerHTML = '<p class="text-muted">No medications for this date</p>';
  }

  // Handle delete button visibility (Admin and Staff only)
  const delBtn = document.getElementById('delete-patient-btn');
  if (delBtn) {
    const canDelete = currentUser && ['admin', 'staff'].includes(currentUser.role);
    delBtn.style.display = canDelete ? 'inline-flex' : 'none';
  }
}

function correctResponse(response) {
  correctionTarget = response;
  document.getElementById('original-response').textContent = response.text || 'No text';
  document.getElementById('corrected-text').value = '';
  document.getElementById('correction-reason').value = '';
  showModal('correction-modal');
}

async function submitCorrection() {
  if (!correctionTarget) return;

  const correctedText = document.getElementById('corrected-text').value.trim();
  const reason = document.getElementById('correction-reason').value.trim();

  if (!correctedText || !reason) {
    showToast('Error', 'Please provide corrected text and reason', 'error');
    return;
  }

  confirmDialog(
    'Submit Correction',
    'Are you sure you want to submit this correction? It will update the patient monitoring data.',
    async () => {
      try {
        showLoading();
        const payload = {
          patient_id: patientId,
          call_log_id: patientData.call_log_id,
          intent_id: correctionTarget.intent,
          corrected_text: correctedText,
          reason: reason,
        };
        console.log('Submitting correction with payload:', payload);
        await api.correctIVRResponse(payload);
        hideLoading();
        showToast('Success', 'Response corrected successfully', 'success');
        hideModal('correction-modal');
        await loadPatientDetail();
      } catch (error) {
        hideLoading();
        console.error('Error submitting correction:', error);
        let errorMsg = error.message || 'Failed to submit correction';
        if (typeof errorMsg === 'object') {
          errorMsg = JSON.stringify(errorMsg);
        }
        showToast('Error', errorMsg, 'error');
      }
    }
  );
}

function addMedication() {
  document.getElementById('medication-form').reset();
  showModal('medication-modal');
}

async function handleSendBulkReminders() {
  const medName = document.getElementById('med-name').value;
  const medDose = document.getElementById('med-dose').value;
  const medDays = document.getElementById('med-days').value;
  const medTimes = Array.from(document.querySelectorAll('input[name="med-time"]:checked')).map(cb => cb.value);

  if (!medName || medTimes.length === 0) {
    showToast('Error', 'Please enter medication name and select at least one time', 'error');
    return;
  }

  try {
    showLoading();
    await api.bulkMedicationReminders({
      patient_id: patientId,
      medication_name: medName,
      dose: medDose || null,
      times: medTimes,
      days: parseInt(medDays) || 1
    });
    hideLoading();
    hideModal('medication-modal');
    showToast('Success', 'Medication reminders scheduled successfully', 'success');
    setTimeout(() => loadPatientDetail(), 1000);
  } catch (error) {
    hideLoading();
    console.error('Error creating reminders:', error);
    showToast('Error', 'Failed to schedule reminders', 'error');
  }
}


async function handleDeletePatient() {
  if (!patientId || !patientData) return;

  confirmDialog(
    'Delete Patient',
    `Are you sure you want to permanently delete ${patientData.patient_name}? This will remove all their records. This action cannot be undone.`,
    async () => {
      try {
        showLoading();
        await api.deletePatient(patientId);
        hideLoading();
        showToast('Success', 'Patient deleted successfully', 'success');
        setTimeout(() => window.location.href = 'dashboard.html', 1500);
      } catch (error) {
        hideLoading();
        console.error('Error deleting patient:', error);
        showToast('Error', 'Failed to delete patient', 'error');
      }
    }
  );
}
