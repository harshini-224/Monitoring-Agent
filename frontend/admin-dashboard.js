/* Admin Dashboard JavaScript */

(async () => {
  await ensureAuth();
  const user = getUser();
  
  if (user.role !== 'admin') {
    window.location.href = '/frontend/login.html';
    return;
  }

  renderSidebar();
  document.getElementById('userName').textContent = user.name;
  document.getElementById('userRole').textContent = user.role.toUpperCase();

  // Load data
  loadMetrics();
  loadPendingRequests();

  // Auto-refresh every 30 seconds
  setInterval(loadMetrics, 30000);
  setInterval(loadPendingRequests, 30000);

  // Event listeners
  document.getElementById('logoutBtn').addEventListener('click', logout);
  document.getElementById('createUserForm').addEventListener('submit', handleCreateUser);
})();

async function loadMetrics() {
  try {
    const metrics = await apiCall('/metrics');
    
    // Quick stats
    document.getElementById('statActivePatients').textContent = metrics.patients.active || 0;
    document.getElementById('statCallsToday').textContent = metrics.calls.total_today || 0;
    document.getElementById('statHighAlerts').textContent = metrics.risks.high || 0;
    document.getElementById('statActiveUsers').textContent = metrics.users.active || 0;

    // System monitoring
    document.getElementById('countAdmin').textContent = metrics.users.admin || 0;
    document.getElementById('countDoctors').textContent = metrics.users.doctor || 0;
    document.getElementById('countNurses').textContent = metrics.users.nurse || 0;
    document.getElementById('countStaff').textContent = metrics.users.staff || 0;

    document.getElementById('callsTotal').textContent = metrics.calls.total_today || 0;
    document.getElementById('callsAnswered').textContent = metrics.calls.answered_today || 0;
    document.getElementById('callsUnanswered').textContent = metrics.calls.unanswered_today || 0;

    document.getElementById('riskHigh').textContent = metrics.risks.high || 0;
    document.getElementById('riskMedium').textContent = metrics.risks.medium || 0;
    document.getElementById('riskLow').textContent = metrics.risks.low || 0;

    // Health check
    const health = await apiCall('/health');
    const statusEl = document.getElementById('systemHealth');
    if (health.status === 'healthy') {
      statusEl.textContent = '● System Healthy';
      statusEl.className = 'text-success';
    } else {
      statusEl.textContent = `● System ${health.status}`;
      statusEl.className = 'text-warning';
    }
  } catch (err) {
    console.error('Failed to load metrics:', err);
  }
}

async function loadPendingRequests() {
  try {
    const requests = await apiCall('/api/auth/access-requests');
    const container = document.getElementById('pendingRequests');
    const countEl = document.getElementById('pendingCount');

    const pending = requests.filter(r => !r.active);
    countEl.textContent = `${pending.length} pending`;

    if (pending.length === 0) {
      container.innerHTML = '<div class="text-sm text-muted text-center py-4">No pending requests</div>';
      return;
    }

    container.innerHTML = pending.map(req => `
      <div class="flex items-center justify-between p-3 border border-border rounded-lg">
        <div class="flex-1">
          <div class="font-medium">${req.name}</div>
          <div class="text-sm text-muted">${req.email} • ${req.role}</div>
          ${req.department ? `<div class="text-xs text-muted">${req.department}</div>` : ''}
        </div>
        <div class="flex gap-2">
          <button onclick="approveRequest(${req.id})" 
                  class="px-3 py-1 bg-success text-white rounded-lg text-sm hover:opacity-90">
            Approve
          </button>
          <button onclick="rejectRequest(${req.id})" 
                  class="px-3 py-1 bg-critical text-white rounded-lg text-sm hover:opacity-90">
            Reject
          </button>
        </div>
      </div>
    `).join('');
  } catch (err) {
    console.error('Failed to load pending requests:', err);
  }
}

async function approveRequest(userId) {
  try {
    await apiCall(`/api/auth/access-requests/${userId}/approve`, 'POST');
    showToast('User approved successfully', 'success');
    loadPendingRequests();
    loadMetrics();
  } catch (err) {
    showToast('Failed to approve user: ' + err.message, 'error');
  }
}

async function rejectRequest(userId) {
  try {
    await apiCall(`/api/auth/access-requests/${userId}/reject`, 'DELETE');
    showToast('User request rejected', 'success');
    loadPendingRequests();
  } catch (err) {
    showToast('Failed to reject user: ' + err.message, 'error');
  }
}

async function handleCreateUser(e) {
  e.preventDefault();
  
  const payload = {
    name: document.getElementById('userName').value,
    email: document.getElementById('userEmail').value,
    password: document.getElementById('userPassword').value,
    role: document.getElementById('userRole').value,
    department: document.getElementById('userDepartment').value || null
  };

  try {
    await apiCall('/api/auth/users', 'POST', payload);
    showToast('User created successfully', 'success');
    document.getElementById('createUserForm').reset();
    loadMetrics();
  } catch (err) {
    showToast('Failed to create user: ' + err.message, 'error');
  }
}

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `fixed top-4 right-4 px-4 py-3 rounded-lg shadow-lg text-white z-50 ${
    type === 'success' ? 'bg-success' : type === 'error' ? 'bg-critical' : 'bg-info'
  }`;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

// Make functions global for onclick handlers
window.approveRequest = approveRequest;
window.rejectRequest = rejectRequest;
