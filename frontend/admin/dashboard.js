/**
 * Admin Dashboard JavaScript
 */

let allUsers = [];

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  // Require admin role
  const user = await initAuth(['admin']);
  if (!user) return;

  // Load initial data
  await loadDashboard();

  // Setup form handlers
  document.getElementById('create-user-form').addEventListener('submit', handleCreateUser);

  // Setup auto-refresh (every 30 seconds)
  setupAutoRefresh(loadDashboard, 30);
});

/**
 * Load all dashboard data
 */
async function loadDashboard() {
  try {
    await Promise.all([
      loadStats(),
      loadPendingRequests(),
      loadActiveUsers(),
      loadSystemMetrics(),
    ]);
  } catch (error) {
    console.error('Error loading dashboard:', error);
    showToast('Error', 'Failed to load dashboard data', 'error');
  }
}

/**
 * Load system stats
 */
async function loadStats() {
  try {
    const metrics = await api.getSystemMetrics();

    const statsGrid = document.getElementById('stats-grid');
    statsGrid.innerHTML = '';

    // Active Patients
    const patientsCard = createStatCard(
      'Active Patients',
      metrics.patient_counts?.total || 0,
      '👥',
      'accent-primary'
    );
    statsGrid.appendChild(patientsCard);

    // Calls Today
    const callsCard = createStatCard(
      'Calls Today',
      metrics.call_stats?.total_today || 0,
      '📞',
      'accent-secondary'
    );
    statsGrid.appendChild(callsCard);

    // High Alerts
    const alertsCard = createStatCard(
      'High Risk Alerts',
      metrics.risk_distribution?.high || 0,
      '⚠️',
      'risk-high'
    );
    statsGrid.appendChild(alertsCard);

    // Active Users
    const usersCard = createStatCard(
      'Active Users',
      metrics.user_counts?.total || 0,
      '👤',
      'success'
    );
    statsGrid.appendChild(usersCard);
  } catch (error) {
    console.error('Error loading stats:', error);
  }
}

/**
 * Load pending registration requests
 */
async function loadPendingRequests() {
  try {
    const requests = await api.getPendingRegistrations();
    const container = document.getElementById('pending-list');

    if (!requests || requests.length === 0) {
      container.innerHTML = `
        <div class="text-center text-muted" style="padding: 2rem;">
          <div style="font-size: 2rem; margin-bottom: 0.5rem;">✓</div>
          <p>No pending requests</p>
        </div>
      `;
      return;
    }

    container.innerHTML = '';

    requests.forEach(request => {
      const card = document.createElement('div');
      card.style.cssText = `
        padding: 1rem;
        background: var(--bg-secondary);
        border: 1px solid var(--border-color);
        border-radius: 8px;
        margin-bottom: 0.75rem;
      `;

      card.innerHTML = `
        <div class="flex-between" style="margin-bottom: 0.5rem;">
          <div>
            <strong style="color: var(--text-primary);">${request.name || request.email}</strong>
            <div class="text-sm text-muted">${request.email}</div>
          </div>
          <span class="risk-badge risk-badge-medium">${request.role.toUpperCase()}</span>
        </div>
        ${request.department ? `<div class="text-sm text-muted">Department: ${request.department}</div>` : ''}
        <div class="flex gap-2" style="margin-top: 0.75rem;">
          <button class="btn btn-success btn-sm" onclick="approveRequest(${request.id}, '${request.email}')">
            Approve
          </button>
          <button class="btn btn-danger btn-sm" onclick="rejectRequest(${request.id}, '${request.email}')">
            Reject
          </button>
        </div>
      `;

      container.appendChild(card);
    });
  } catch (error) {
    console.error('Error loading pending requests:', error);
    document.getElementById('pending-list').innerHTML = `
      <div class="text-center text-muted" style="padding: 2rem;">
        <p>Failed to load requests</p>
      </div>
    `;
  }
}

/**
 * Approve access request
 */
async function approveRequest(userId, email) {
  confirmDialog(
    'Approve Access',
    `Are you sure you want to approve access for ${email}?`,
    async () => {
      try {
        showLoading();
        await api.approveRegistration(userId);
        hideLoading();
        showToast('Success', `Access approved for ${email}`, 'success');
        await loadPendingRequests();
        await loadActiveUsers();
      } catch (error) {
        hideLoading();
        console.error('Error approving request:', error);
        showToast('Error', 'Failed to approve request', 'error');
      }
    }
  );
}

/**
 * Reject access request
 */
async function rejectRequest(userId, email) {
  confirmDialog(
    'Reject Access',
    `Are you sure you want to reject and delete the access request for ${email}?`,
    async () => {
      try {
        showLoading();
        await api.rejectRegistration(userId);
        hideLoading();
        showToast('Success', `Access rejected for ${email}`, 'success');
        await loadPendingRequests();
      } catch (error) {
        hideLoading();
        console.error('Error rejecting request:', error);
        showToast('Error', 'Failed to reject request', 'error');
      }
    }
  );
}

/**
 * Handle create user form
 */
async function handleCreateUser(e) {
  e.preventDefault();

  const name = document.getElementById('new-name').value.trim();
  const email = document.getElementById('new-email').value.trim();
  const password = document.getElementById('new-password').value;
  const role = document.getElementById('new-role').value;
  const department = document.getElementById('new-department').value.trim() || null;

  if (!name || !email || !password || !role) {
    showToast('Error', 'Please fill in all required fields', 'error');
    return;
  }

  if (password.length < 8) {
    showToast('Error', 'Password must be at least 8 characters', 'error');
    return;
  }

  const submitBtn = e.target.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Creating...';

  try {
    await api.createUser({ name, email, password, role, department });
    showToast('Success', `User ${email} created successfully`, 'success');

    // Reset form
    e.target.reset();

    // Reload users
    await loadActiveUsers();
  } catch (error) {
    console.error('Error creating user:', error);
    showToast('Error', error.message || 'Failed to create user', 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Create User';
  }
}

/**
 * Load active users
 */
async function loadActiveUsers() {
  try {
    const users = await api.getAllStaff();
    allUsers = users;

    const container = document.getElementById('users-table');

    if (!users || users.length === 0) {
      container.innerHTML = '<p class="text-center text-muted p-3">No users found</p>';
      return;
    }

    const columns = [
      { label: 'Name', key: 'name' },
      { label: 'Email', key: 'email' },
      { label: 'Role', key: 'role' },
      { label: 'Department', key: 'department' },
      { label: 'Created', key: 'created_at' },
      { label: 'Actions', key: 'id' },
    ];

    const formatters = {
      role: (value) => {
        const colors = {
          admin: 'risk-critical',
          doctor: 'risk-high',
          nurse: 'risk-medium',
          staff: 'risk-low',
        };
        const badgeClass = colors[value] || 'risk-normal';
        return `<span class="risk-badge ${badgeClass}">${value.toUpperCase()}</span>`.trim();
      },
      department: (value) => value || 'N/A',
      created_at: (value) => formatDate(value),
      id: (val, row) => {
        const currentUser = auth.getUser();
        if (currentUser && currentUser.id === row.id) return '<span class="text-muted text-sm">(You)</span>';
        return `
                    <button class="btn btn-danger btn-sm" onclick="handleDeleteUser(${row.id}, '${row.email}')">
                        🗑️ Delete
                    </button>
                `.trim();
      }
    };

    const table = createTable(columns, users, { formatters });
    container.innerHTML = '';
    container.appendChild(table);
  } catch (error) {
    console.error('Error loading users:', error);
    document.getElementById('users-table').innerHTML = `
      <p class="text-center text-muted p-3">Failed to load users</p>
    `;
  }
}

/**
 * Load system metrics
 */
async function loadSystemMetrics() {
  try {
    const metrics = await api.getSystemMetrics();
    const container = document.getElementById('system-metrics');

    container.innerHTML = `
      <div>
        <h4 style="margin-bottom: 0.75rem; color: var(--text-primary);">User Distribution</h4>
        <div style="background: var(--bg-secondary); padding: 1rem; border-radius: 8px;">
          <div class="flex-between mb-1">
            <span class="text-sm">Admins</span>
            <strong style="color: var(--accent-primary);">${metrics.user_counts?.admin || 0}</strong>
          </div>
          <div class="flex-between mb-1">
            <span class="text-sm">Doctors</span>
            <strong style="color: var(--accent-primary);">${metrics.user_counts?.doctor || 0}</strong>
          </div>
          <div class="flex-between mb-1">
            <span class="text-sm">Nurses</span>
            <strong style="color: var(--accent-primary);">${metrics.user_counts?.nurse || 0}</strong>
          </div>
          <div class="flex-between">
            <span class="text-sm">Staff</span>
            <strong style="color: var(--accent-primary);">${metrics.user_counts?.staff || 0}</strong>
          </div>
        </div>
      </div>

      <div>
        <h4 style="margin-bottom: 0.75rem; color: var(--text-primary);">Call Statistics</h4>
        <div style="background: var(--bg-secondary); padding: 1rem; border-radius: 8px;">
          <div class="flex-between mb-1">
            <span class="text-sm">Total Today</span>
            <strong style="color: var(--accent-primary);">${metrics.call_stats?.total_today || 0}</strong>
          </div>
          <div class="flex-between mb-1">
            <span class="text-sm">Answered</span>
            <strong style="color: var(--success);">${metrics.call_stats?.answered_today || 0}</strong>
          </div>
          <div class="flex-between">
            <span class="text-sm">Missed</span>
            <strong style="color: var(--error);">${metrics.call_stats?.missed_today || 0}</strong>
          </div>
        </div>
      </div>

      <div>
        <h4 style="margin-bottom: 0.75rem; color: var(--text-primary);">Risk Distribution</h4>
        <div style="background: var(--bg-secondary); padding: 1rem; border-radius: 8px;">
          <div class="flex-between mb-1">
            <span class="text-sm">High Risk</span>
            <strong style="color: var(--risk-high);">${metrics.risk_distribution?.high || 0}</strong>
          </div>
          <div class="flex-between mb-1">
            <span class="text-sm">Medium Risk</span>
            <strong style="color: var(--risk-medium);">${metrics.risk_distribution?.medium || 0}</strong>
          </div>
          <div class="flex-between">
            <span class="text-sm">Low Risk</span>
            <strong style="color: var(--risk-low);">${metrics.risk_distribution?.low || 0}</strong>
          </div>
        </div>
      </div>

      <div>
        <h4 style="margin-bottom: 0.75rem; color: var(--text-primary);">Patient Status</h4>
        <div style="background: var(--bg-secondary); padding: 1rem; border-radius: 8px;">
          <div class="flex-between mb-1">
            <span class="text-sm">Active Patients</span>
            <strong style="color: var(--accent-primary);">${metrics.patient_counts?.active || 0}</strong>
          </div>
          <div class="flex-between mb-1">
            <span class="text-sm">Enrolled Today</span>
            <strong style="color: var(--success);">${metrics.patient_counts?.enrolled_today || 0}</strong>
          </div>
          <div class="flex-between">
            <span class="text-sm">Total Patients</span>
            <strong style="color: var(--text-tertiary);">${metrics.patient_counts?.total || 0}</strong>
          </div>
        </div>
      </div>
    `;
  } catch (error) {
    console.error('Error loading system metrics:', error);
  }
}

/**
 * Delete a user permananetly
 */
async function handleDeleteUser(userId, email) {
  confirmDialog(
    'Delete User',
    `Are you sure you want to permanently delete user ${email}? This will remove their account and login access. This action cannot be undone.`,
    async () => {
      try {
        showLoading();
        await api.deleteUser(userId);
        hideLoading();
        showToast('Success', `User ${email} deleted`, 'success');
        await loadActiveUsers();
        await loadStats();
      } catch (error) {
        hideLoading();
        console.error('Error deleting user:', error);
        showToast('Error', 'Failed to delete user', 'error');
      }
    }
  );
}
