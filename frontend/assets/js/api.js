/**
 * CarePulse API Client
 * Centralized API wrapper with authentication and error handling
 */

const API_BASE = '';  // Same origin

class APIClient {
    constructor() {
        this.token = localStorage.getItem('auth_token');
    }

    /**
     * Get authorization headers
     */
    getHeaders() {
        const headers = {
            'Content-Type': 'application/json',
        };

        if (this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }

        return headers;
    }

    /**
     * Make authenticated API request
     */
    async request(endpoint, options = {}) {
        const config = {
            ...options,
            headers: {
                ...this.getHeaders(),
                ...options.headers,
            },
        };

        try {
            const response = await fetch(`${API_BASE}${endpoint}`, config);

            // Handle 401 Unauthorized
            if (response.status === 401) {
                localStorage.removeItem('auth_token');
                window.location.href = '/frontend/auth/login.html';
                throw new Error('Unauthorized');
            }

            const data = await response.json();

            if (!response.ok) {
                const errorDetail = typeof data.detail === 'object' ? JSON.stringify(data.detail) : (data.detail || 'Request failed');
                console.error(`API Error: ${response.status} ${endpoint}`, data);
                throw new Error(`${response.status}: ${errorDetail}`);
            }

            return data;
        } catch (error) {
            console.error('API Error:', error);
            throw error;
        }
    }

    /**
     * GET request
     */
    async get(endpoint) {
        return this.request(endpoint, { method: 'GET' });
    }

    /**
     * POST request
     */
    async post(endpoint, data) {
        return this.request(endpoint, {
            method: 'POST',
            body: JSON.stringify(data),
        });
    }

    /**
     * PUT request
     */
    async put(endpoint, data) {
        return this.request(endpoint, {
            method: 'PUT',
            body: JSON.stringify(data),
        });
    }

    /**
     * DELETE request
     */
    async delete(endpoint) {
        return this.request(endpoint, { method: 'DELETE' });
    }

    // ========================================================================
    // AUTH ENDPOINTS
    // ========================================================================

    async login(email, password) {
        const data = await this.post('/auth/login', { email, password });
        if (data.token) {
            this.token = data.token;
            localStorage.setItem('auth_token', data.token);
        }
        return data;
    }

    async logout() {
        try {
            await this.post('/auth/logout');
        } finally {
            this.token = null;
            localStorage.removeItem('auth_token');
            window.location.href = '/frontend/auth/login.html';
        }
    }

    async register(userData) {
        return this.post('/auth/register', userData);
    }

    async getCurrentUser() {
        return this.get('/auth/me');
    }

    // ========================================================================
    // ADMIN ENDPOINTS
    // ========================================================================

    async getSystemMetrics() {
        return this.get('/metrics');
    }

    async getPendingRegistrations() {
        return this.get('/auth/requests');
    }

    async approveRegistration(userId) {
        return this.post(`/auth/requests/${userId}/approve`);
    }

    async rejectRegistration(userId) {
        return this.post(`/auth/requests/${userId}/reject`);
    }

    async createUser(userData) {
        return this.post('/auth/users', userData);
    }

    async getAllStaff() {
        return this.get('/admin/staff');
    }

    async getAdminEvents(limit = 200) {
        return this.get(`/admin/events?limit=${limit}`);
    }

    // ========================================================================
    // PATIENT ENDPOINTS (STAFF)
    // ========================================================================

    async getPatients() {
        return this.get('/patients');
    }

    async createPatient(patientData) {
        return this.post('/patients', patientData);
    }

    async updatePatient(patientId, patientData) {
        return this.put(`/patients/${patientId}`, patientData);
    }

    async deletePatient(patientId) {
        return this.delete(`/patients/${patientId}`);
    }

    async getPatientLogs(patientId) {
        return this.get(`/patients/${patientId}/all-logs`);
    }

    async triggerManualCall(phone, patientId = null, protocol = null) {
        // Backend handles phone in path: /call/{phone}
        return this.post(`/call/${phone}`, { patient_id: patientId, protocol });
    }

    // ========================================================================
    // MEDICATION ENDPOINTS
    // ========================================================================

    async getMedicationReminders(patientId = null) {
        const query = patientId ? `?patient_id=${patientId}` : '';
        return this.get(`/care/medication/reminders${query}`);
    }

    async createMedicationReminder(reminderData) {
        return this.post('/care/medication/reminders', reminderData);
    }

    async updateMedicationReminder(reminderId, reminderData) {
        return this.put(`/care/medication/reminders/${reminderId}`, reminderData);
    }

    async deleteMedicationReminder(reminderId) {
        return this.delete(`/care/medication/reminders/${reminderId}`);
    }

    async triggerMedicationCall(reminderId) {
        return this.post(`/care/medication/reminders/${reminderId}/trigger-call`);
    }

    // ========================================================================
    // NURSE ENDPOINTS
    // ========================================================================

    async getNurseDashboard() {
        return this.get('/nurse/dashboard');
    }

    async getNursePatientDetail(patientId, selectedDate = null) {
        const query = selectedDate ? `?selected_date=${selectedDate}` : '';
        return this.get(`/nurse/patient/${patientId}${query}`);
    }

    async nurseTriggerCall(patientId, protocol = null, selectedDate = null) {
        return this.post(`/nurse/patient/${patientId}/actions/trigger-call`, {
            protocol,
            selected_date: selectedDate,
        });
    }

    async sendMedicationReminder(patientId, medicationName, dose = null) {
        return this.post('/care/medication/reminders', {
            patient_id: patientId,
            medication_name: medicationName,
            dose: dose,
        });
    }

    async bulkMedicationReminders(data) {
        return this.post('/care/medication/bulk-reminders', data);
    }

    async nurseSaveNote(patientId, noteData) {
        return this.post(`/nurse/patient/${patientId}/actions/add-note`, noteData);
    }

    async nurseMarkMedicationTaken(patientId, medicationData) {
        return this.post(`/nurse/patient/${patientId}/actions/mark-medication-taken`, medicationData);
    }

    async correctIVRResponse(correctionData) {
        console.log('API Request: POST /care/response-correction', correctionData);
        return this.post('/care/response-correction', correctionData);
    }

    // ========================================================================
    // DOCTOR ENDPOINTS
    // ========================================================================

    async getHighAlerts(includeActioned = false, hours = 24) {
        return this.get(`/doctor/high-alerts?include_actioned=${includeActioned}&hours=${hours}`);
    }

    async getPatientDetails(patientId, dateFilter = null) {
        const query = dateFilter ? `?date_filter=${dateFilter}` : '';
        return this.get(`/doctor/patient-details/${patientId}${query}`);
    }

    async confirmAlert(callLogId, patientId, doctorNote = null) {
        return this.post('/doctor/confirm-alert', {
            call_log_id: callLogId,
            patient_id: patientId,
            doctor_note: doctorNote,
        });
    }

    async clearAlert(callLogId, patientId, reason) {
        return this.post('/doctor/clear-alert', {
            call_log_id: callLogId,
            patient_id: patientId,
            reason,
        });
    }

    async overrideRisk(callLogId, patientId, overrideScore, justification) {
        return this.post('/doctor/override-risk', {
            call_log_id: callLogId,
            patient_id: patientId,
            override_score: overrideScore,
            justification,
        });
    }

    async assignNurseCall(assignmentData) {
        return this.post('/doctor/assign-nurse-call', assignmentData);
    }

    async saveDoctorNote(patientId, logId, note) {
        return this.put(`/patients/${patientId}/logs/${logId}/note`, { note });
    }

    // ========================================================================
    // CARE & INTERVENTION ENDPOINTS
    // ========================================================================

    async getAssignments(patientId = null) {
        const query = patientId ? `?patient_id=${patientId}` : '';
        return this.get(`/care/assignments${query}`);
    }

    async createAudit(action, meta = null) {
        return this.post('/care/audit', { action, meta });
    }

    // ========================================================================
    // ADMIN & MANAGEMENT
    // ========================================================================

    async deletePatient(patientId) {
        return this.delete(`/patients/${patientId}`);
    }

    async deleteUser(userId) {
        return this.delete(`/auth/users/${userId}`);
    }
}

// Export singleton instance
const api = new APIClient();
window.api = api;

// Compatibility wrapper
window.apiCall = async (endpoint, options = {}) => {
    return api.request(endpoint, options);
};
