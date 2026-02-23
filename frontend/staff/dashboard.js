/**
 * Staff Dashboard JavaScript
 */

let allPatients = [];
let selectedPatient = null;
let currentUser = null;

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    // 1. Setup UI listeners immediately (don't wait for auth)
    const searchInput = document.getElementById('search-patients');
    if (searchInput) {
        searchInput.addEventListener('input', debounce(searchPatients, 300));
    }

    const diseaseEl = document.getElementById('enroll-disease');
    const protocolEl = document.getElementById('enroll-protocol');

    if (diseaseEl && protocolEl) {
        diseaseEl.addEventListener('change', (e) => {
            const category = e.target.value;
            console.log('Disease track changed to:', category);

            // Define protocols by category
            const protocolsByCategory = {
                'Cardiovascular': [
                    { value: 'POST_MI', label: 'Post-MI (Heart Attack)' },
                    { value: 'HEART_FAILURE', label: 'Heart Failure (CHF)' },
                    { value: 'HYPERTENSION', label: 'Hypertension (High BP)' },
                    { value: 'ARRHYTHMIA', label: 'Arrhythmia (Afib/Palpitations)' }
                ],
                'Pulmonary': [
                    { value: 'COPD', label: 'COPD' },
                    { value: 'ASTHMA', label: 'Asthma' },
                    { value: 'PNEUMONIA', label: 'Pneumonia' },
                    { value: 'PE', label: 'Pulmonary Embolism (PE)' },
                    { value: 'ILD_POST_COVID', label: 'ILD / Post-COVID' }
                ],
                'General': [
                    { value: 'GENERAL_MONITORING', label: 'General / Wellness Monitoring' }
                ]
            };

            const protocols = protocolsByCategory[category] || [];
            protocolEl.innerHTML = '<option value="">Select Protocol...</option>';

            protocols.forEach(p => {
                const opt = document.createElement('option');
                opt.value = p.value;
                opt.textContent = p.label;
                protocolEl.appendChild(opt);
            });

            if (protocols.length > 0) {
                protocolEl.disabled = false;
                protocolEl.focus();
                console.log('Protocol dropdown enabled with', protocols.length, 'options');
            } else {
                protocolEl.disabled = true;
            }
        });
    }

    // 2. Perform authentication and data loading
    currentUser = await initAuth(['staff', 'admin']);
    if (!currentUser) return;

    await loadPatients();
    setupAutoRefresh(loadPatients, 30);
    setupSystemAlerts();
});

async function loadPatients() {
    try {
        const patients = await api.getPatients();
        allPatients = patients;
        renderPatientList(patients);
    } catch (error) {
        console.error('Error loading patients:', error);
        showToast('Error', 'Failed to load patients', 'error');
    }
}

function renderPatientList(patients) {
    const container = document.getElementById('patient-list');

    if (!patients || patients.length === 0) {
        container.innerHTML = '';
        const empty = createEmptyState(
            'No Patients',
            'Get started by enrolling your first patient',
            { label: '+ Enroll Patient', onClick: showEnrollModal }
        );
        container.appendChild(empty);
        return;
    }

    container.innerHTML = '';
    patients.forEach(patient => {
        const card = createPatientCard(patient, {
            showRisk: true,
            onClick: selectPatient,
            selected: selectedPatient && selectedPatient.id === patient.id
        });
        container.appendChild(card);
    });
}

function searchPatients() {
    const query = document.getElementById('search-patients').value.toLowerCase();
    const filtered = allPatients.filter(p =>
        p.name.toLowerCase().includes(query) ||
        p.phone_number.includes(query)
    );
    renderPatientList(filtered);
}

async function selectPatient(patient) {
    selectedPatient = patient;
    renderPatientList(allPatients);

    const detailCard = document.getElementById('patient-detail-card');
    detailCard.style.display = 'block';

    document.getElementById('detail-patient-name').textContent = patient.name;

    // Show enrollment info
    const enrollInfo = document.getElementById('enrollment-info');
    enrollInfo.innerHTML = `
    <div style="background: var(--bg-secondary); padding: 1rem; border-radius: 8px;">
      <div class="grid grid-2 gap-2">
        <div><strong>Age:</strong> ${patient.age || 'N/A'}</div>
        <div><strong>Gender:</strong> ${patient.gender || 'N/A'}</div>
        <div><strong>Phone:</strong> ${formatPhone(patient.phone_number)}</div>
        <div><strong>Disease:</strong> ${patient.disease_track}</div>
        <div><strong>Protocol:</strong> ${patient.protocol}</div>
        <div><strong>Call Time:</strong> ${patient.call_time || 'N/A'}</div>
        <div><strong>Days to Monitor:</strong> ${patient.days_to_monitor || 'N/A'}</div>
        <div><strong>Enrolled:</strong> ${formatDate(patient.created_at)}</div>
      </div>
      ${patient.diagnosis ? `<div class="mt-2"><strong>Diagnosis:</strong><br/>${patient.diagnosis}</div>` : ''}
      ${patient.medications_text ? `<div class="mt-2"><strong>Medications:</strong><br/>${patient.medications_text}</div>` : ''}
    </div>
  `;

    // Load call history
    showLoading('call-history');
    try {
        const logs = await api.getPatientLogs(patient.id);
        displayCallHistory(logs);
    } catch (error) {
        console.error('Error loading call history:', error);
    } finally {
        hideLoading('call-history');
    }

    // Load medication status
    showLoading('medication-status');
    try {
        const reminders = await api.getMedicationReminders(patient.id);
        displayMedicationStatus(reminders);
    } catch (error) {
        console.error('Error loading medications:', error);
    } finally {
        hideLoading('medication-status');
    }

    // Show delete button for authorized roles (Admin and Staff only)
    const delBtn = document.getElementById('delete-patient-btn');
    if (delBtn) {
        const canDelete = currentUser && ['admin', 'staff'].includes(currentUser.role);
        delBtn.style.display = canDelete ? 'inline-flex' : 'none';
    }
}

function displayCallHistory(logs) {
    const container = document.getElementById('call-history');

    if (!logs || logs.length === 0) {
        container.innerHTML = '<p class="text-muted">No call history</p>';
        return;
    }

    const columns = [
        { label: 'Date', key: 'created_at' },
        { label: 'Type', key: 'status' },
        { label: 'Risk', key: 'risk_score' },
    ];

    const formatters = {
        created_at: (val) => formatDateTime(val),
        status: (val) => val || 'Monitoring',
        risk_score: (val) => val !== null ? createRiskBadge(val) : 'N/A',
    };

    const table = createTable(columns, logs, { formatters });
    container.innerHTML = '';
    container.appendChild(table);
}

function displayMedicationStatus(reminders) {
    const container = document.getElementById('medication-status');

    if (!reminders || reminders.length === 0) {
        container.innerHTML = '<p class="text-muted">No medication reminders</p>';
        return;
    }

    const columns = [
        { label: 'Medication', key: 'medication_name' },
        { label: 'Dose', key: 'dose' },
        { label: 'Scheduled', key: 'scheduled_for' },
        { label: 'Status', key: 'status' },
        { label: 'Actions', key: 'id' },
    ];

    const formatters = {
        dose: (val) => val || 'N/A',
        scheduled_for: (val) => formatDateTime(val),
        status: (val) => {
            const colors = {
                completed: 'success',
                scheduled: 'info',
                pending: 'warning',
                pending: 'warning',
                missed: 'critical',
                not_taken: 'critical',
                taken: 'success',
            };
            return `<span style="color: var(--${colors[val] || 'text-secondary'})">${val}</span>`;
        },
        id: (val, row) => {
            const triggerable = ['sms_sent', 'missed', 'no_response', 'scheduled', 'call_placed'].includes(row.status);
            if (triggerable) {
                return `<button class="btn btn-primary btn-xs" onclick="manualMedCall(${val})">Call Now</button>`;
            }
            return '';
        }
    };

    const table = createTable(columns, reminders, { formatters });
    container.innerHTML = '';
    container.appendChild(table);
}

function showEnrollModal() {
    showModal('enroll-modal');
}

async function handleEnrollPatient() {
    const name = document.getElementById('enroll-name').value.trim();
    const age = parseInt(document.getElementById('enroll-age').value);
    const gender = document.getElementById('enroll-gender').value;
    const phone = document.getElementById('enroll-phone').value.trim();
    const disease = document.getElementById('enroll-disease').value;
    const protocol = document.getElementById('enroll-protocol').value.trim();
    const callTime = document.getElementById('enroll-time').value;
    const days = parseInt(document.getElementById('enroll-days').value);
    const diagnosis = document.getElementById('enroll-diagnosis').value.trim();
    const medications = document.getElementById('enroll-medications').value.trim();

    if (!name || !age || !gender || !phone || !disease || !protocol) {
        showToast('Error', 'Please fill in all required fields, including Category and Protocol', 'error');
        return;
    }

    try {
        await api.createPatient({
            name,
            age,
            gender,
            phone_number: phone,
            disease_track: disease,
            protocol: protocol || disease,
            call_time: callTime,
            days_to_monitor: days,
            diagnosis,
            medications_text: medications,
        });

        showToast('Success', `Patient ${name} enrolled successfully`, 'success');
        hideModal('enroll-modal');
        document.getElementById('enroll-form').reset();
        await loadPatients();
    } catch (error) {
        console.error('Error enrolling patient:', error);
        showToast('Error', error.message || 'Failed to enroll patient', 'error');
    }
}

async function triggerIVRCall() {
    if (!selectedPatient) return;

    confirmDialog(
        'Trigger IVR Call',
        `Are you sure you want to trigger an automated IVR call for ${selectedPatient.name}? This will contact the patient immediately.`,
        async () => {
            try {
                showLoading();
                await api.triggerManualCall(
                    selectedPatient.phone_number,
                    selectedPatient.id,
                    selectedPatient.protocol
                );
                hideLoading();
                showToast('Success', 'IVR call initiated', 'success');
                setTimeout(() => selectPatient(selectedPatient), 2000);
            } catch (error) {
                hideLoading();
                console.error('Error triggering call:', error);
                showToast('Error', 'Failed to trigger call', 'error');
            }
        }
    );
}

async function handleDeletePatient() {
    if (!selectedPatient) return;

    confirmDialog(
        'Delete Patient',
        `Are you sure you want to permanently delete ${selectedPatient.name}? This will remove all their records, including call history and risk assessments. This action cannot be undone.`,
        async () => {
            try {
                showLoading();
                await api.deletePatient(selectedPatient.id);
                hideLoading();
                showToast('Success', 'Patient deleted successfully', 'success');
                selectedPatient = null;
                document.getElementById('patient-detail-card').style.display = 'none';
                loadPatients();
            } catch (error) {
                hideLoading();
                console.error('Error deleting patient:', error);
                showToast('Error', 'Failed to delete patient', 'error');
            }
        }
    );
}

async function triggerMedicationReminder() {
    if (!selectedPatient) return;
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
            patient_id: selectedPatient.id,
            medication_name: medName,
            dose: medDose || null,
            times: medTimes,
            days: parseInt(medDays) || 1
        });
        hideLoading();
        hideModal('medication-modal');
        showToast('Success', 'Medication reminders scheduled successfully', 'success');

        // If times include a "now" or "immediate" flag (implicit if time is blank or handled by backend)
        // For now, reload and the 2-min scheduler will handle it.
        setTimeout(() => selectPatient(selectedPatient), 1000);
    } catch (error) {
        hideLoading();
        console.error('Error creating reminders:', error);
        showToast('Error', 'Failed to schedule reminders', 'error');
    }
}

async function handleSendImmediateReminder() {
    const medName = document.getElementById('med-name').value;
    const medDose = document.getElementById('med-dose').value;

    if (!medName) {
        showToast('Error', 'Please enter medication name', 'error');
        return;
    }

    try {
        showLoading();
        // Create a single reminder for "now"
        await api.createMedicationReminder({
            patient_id: selectedPatient.id,
            medication_name: medName,
            dose: medDose || null,
            scheduled_for: null // Backend handles as "now"
        });
        hideLoading();
        hideModal('medication-modal');
        showToast('Success', 'Immediate reminder sent. SMS will be followed by a call in 2 minutes.', 'success');
        setTimeout(() => selectPatient(selectedPatient), 1000);
    } catch (error) {
        hideLoading();
        console.error('Error sending reminder:', error);
        showToast('Error', 'Failed to send reminder', 'error');
    }
}

async function manualMedCall(reminderId) {
    if (!selectedPatient) return;

    confirmDialog(
        'Call Now',
        `Are you sure you want to trigger a medication confirmation call for ${selectedPatient.name}?`,
        async () => {
            try {
                showLoading();
                await api.triggerMedicationCall(reminderId);
                hideLoading();
                showToast('Success', 'Confirmation call triggered', 'success');
                if (selectedPatient) selectPatient(selectedPatient);
            } catch (error) {
                hideLoading();
                console.error('Error triggering call:', error);
                showToast('Error', 'Failed to trigger call', 'error');
            }
        }
    );
}

function setupSystemAlerts() {
    const alertsSource = api.streamAlerts();
    alertsSource.addEventListener('alerts', (event) => {
        try {
            const alerts = JSON.parse(event.data);
            if (alerts && alerts.length > 0) {
                const latest = alerts[0];
                showToast('Clinical Alert', `High risk event for ${latest.patient_name}`, 'error');
                // Refresh list if visible
                loadPatients();
            }
        } catch (e) {
            console.error('Error parsing alerts:', e);
        }
    });

    alertsSource.onerror = (err) => {
        console.error('Alert stream error:', err);
    };
}
