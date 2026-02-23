document.addEventListener('DOMContentLoaded', async () => {
  const backend = window.BACKEND_URL || 'http://127.0.0.1:8000';
  const events = document.getElementById('adminEvents');
  const eventDetail = document.getElementById('eventDetail');
  const eventCount = document.getElementById('eventCount');
  const eventSearch = document.getElementById('eventSearch');
  const eventTypeFilter = document.getElementById('eventTypeFilter');
  const eventStart = document.getElementById('eventStart');
  const eventEnd = document.getElementById('eventEnd');
  const loadMoreBtn = document.getElementById('loadMoreEvents');
  const exportLogs = document.getElementById('exportLogs');

  let auditRows = [];
  let selectedId = null;
  let visibleCount = 20;

  const allowedActions = new Set([
    'user_login',
    'user_logout',
    'failed_login',
    'password_reset',
    'user_created',
    'role_changed',
    'account_disabled',
    'ivr_service_restart',
    'scheduler_delay',
    'api_failure',
    'twilio_webhook_error'
  ]);

  const actionMap = {
    user_login: 'Login',
    user_logout: 'Logout',
    failed_login: 'Failed Login',
    password_reset: 'Password Reset',
    user_created: 'User Created',
    role_changed: 'Role Changed',
    account_disabled: 'Account Disabled',
    ivr_service_restart: 'IVR Service Restart',
    scheduler_delay: 'Scheduler Delay',
    api_failure: 'API Failure',
    twilio_webhook_error: 'Twilio Webhook Error'
  };

  function actionLabel(action) {
    return actionMap[action] || (action || '').replace(/_/g, ' ');
  }

  function categoryFor(action) {
    const auth = ['user_login', 'user_logout', 'failed_login', 'password_reset'];
    const access = ['user_created', 'role_changed', 'account_disabled'];
    const system = ['ivr_service_restart', 'scheduler_delay', 'api_failure', 'twilio_webhook_error'];
    if (auth.includes(action)) return 'auth';
    if (access.includes(action)) return 'access';
    if (system.includes(action)) return 'system';
    return 'system';
  }

  function iconFor(action) {
    const category = categoryFor(action);
    if (category === 'auth') return '[AUTH]';
    if (category === 'access') return '[ACCESS]';
    return '[SYSTEM]';
  }

  function severityFor(action) {
    if (['user_login', 'user_logout', 'user_created', 'role_changed'].includes(action)) return 'info';
    if (['failed_login', 'password_reset', 'scheduler_delay'].includes(action)) return 'warning';
    if (['account_disabled', 'api_failure', 'ivr_service_restart', 'twilio_webhook_error'].includes(action)) return 'critical';
    return 'info';
  }

  function severityLabel(sev) {
    if (sev === 'info') return 'INFO';
    if (sev === 'warning') return 'WARNING';
    if (sev === 'critical') return 'CRITICAL';
    return 'INFO';
  }

  function severityBadgeClass(sev) {
    if (sev === 'info') return 'badge-live';
    if (sev === 'warning') return 'badge-warning';
    if (sev === 'critical') return 'badge-critical';
    return 'badge-neutral';
  }

  function matchesFilters(row, search, type, start, end) {
    if (type && categoryFor(row.action) !== type) return false;
    const date = row.created_at ? new Date(row.created_at) : null;
    if (start && date && date < new Date(start)) return false;
    if (end && date) {
      const endDate = new Date(end);
      endDate.setHours(23, 59, 59, 999);
      if (date > endDate) return false;
    }
    if (search) {
      const metaText = JSON.stringify(row.meta || {}).toLowerCase();
      const actionText = (row.action || '').toLowerCase();
      if (!metaText.includes(search) && !actionText.includes(search)) return false;
    }
    return true;
  }

  function renderDetail(row) {
    if (!eventDetail) return;
    if (!row) {
      eventDetail.innerHTML = '<div class="text-sm text-muted">Select an event to view details.</div>';
      return;
    }
    const meta = row.meta || {};
    const displayName = meta.user_name || meta.name || meta.user || 'System';
    const roleName = meta.role || 'Staff';
    const source = meta.source || meta.device || meta.user_agent || 'Web Portal';
    const ip = meta.ip || meta.ip_address || '';
    const service = meta.service || meta.service_name || 'Web';
    const impactUser = meta.user_impact || meta.impact || 'None';
    const actionRequired = meta.action_required === true ? 'Yes' : meta.action_required === false ? 'No' : 'No';

    const severity = severityFor(row.action);
    const badgeClass = severityBadgeClass(severity);

    const contextLines = [
      `Service: ${service}`,
      `Source: ${source}`,
      ip ? `IP: ${ip}` : ''
    ].filter(Boolean);

    const impactLines = [
      `User impact: ${impactUser}`,
      `Action required: ${actionRequired}`
    ];

    eventDetail.innerHTML = `
      <div class='space-y-4 fade-in'>
        <div class='flex items-center justify-between'>
          <div class='text-lg font-medium'>${iconFor(row.action)} ${actionLabel(row.action)}</div>
          <span class='badge badge-dot ${badgeClass}'>${severityLabel(severity)}</span>
        </div>
        <div>
          <div class='text-xs uppercase tracking-widest text-muted mb-2'>Event Summary</div>
          <div class='card-soft px-4 py-3 text-sm'>
            <div>Action: ${actionLabel(row.action)}</div>
            <div>Timestamp: ${window.formatTime(row.created_at)}</div>
            <div>Severity: ${severityLabel(severity)}</div>
          </div>
        </div>
        <div>
          <div class='text-xs uppercase tracking-widest text-muted mb-2'>Actor</div>
          <div class='card-soft px-4 py-3 text-sm'>
            <div>Name: ${displayName}</div>
            <div>Role: ${roleName}</div>
          </div>
        </div>
        <div>
          <div class='text-xs uppercase tracking-widest text-muted mb-2'>System Context</div>
          <div class='card-soft px-4 py-3 text-sm'>${contextLines.join('<br />')}</div>
        </div>
        <div>
          <div class='text-xs uppercase tracking-widest text-muted mb-2'>Impact</div>
          <div class='card-soft px-4 py-3 text-sm'>${impactLines.join('<br />')}</div>
        </div>
      </div>
    `;
  }

  function renderEventList() {
    if (!events) return;
    const search = (eventSearch?.value || '').trim().toLowerCase();
    const type = eventTypeFilter?.value || '';
    const start = eventStart?.value || '';
    const end = eventEnd?.value || '';

    const filtered = auditRows.filter((r) => matchesFilters(r, search, type, start, end));
    if (eventCount) eventCount.textContent = `${filtered.length} events`;

    const limited = filtered.slice(0, visibleCount);
    if (!limited.length) {
      events.innerHTML = '<div class="text-sm text-muted">No events found for selected filters.</div>';
      renderDetail(null);
      if (loadMoreBtn) loadMoreBtn.classList.add('hidden');
      return;
    }

    events.innerHTML = limited
      .map((r) => {
        const severity = severityFor(r.action);
        const badgeClass = severityBadgeClass(severity);
        const isActive = selectedId === r.id ? 'active' : '';
        const meta = r.meta || {};
        const nameLine = [
          meta.user_name ? `Name: ${meta.user_name}` : '',
          meta.role ? `Role: ${meta.role}` : ''
        ].filter(Boolean).join(' | ');
        const isNew = r.created_at ? ((Date.now() - new Date(r.created_at).getTime()) < 24 * 3600 * 1000) : false;
        return `
          <button class='event-card text-left w-full ${isActive}' data-event-id='${r.id}'>
            <div class='flex items-center justify-between'>
              <div class='font-medium'>${iconFor(r.action)} ${actionLabel(r.action)}</div>
              <span class='badge badge-dot ${badgeClass}'>${severityLabel(severity)}</span>
            </div>
            ${nameLine ? `<div class='text-xs text-muted mt-2'>${nameLine}</div>` : ''}
            ${isNew ? `<div class='text-xs text-muted mt-1'><span class='badge badge-dot badge-live'>NEW</span></div>` : ''}
            <div class='text-xs text-muted mt-1'>${window.formatTime(r.created_at)}</div>
          </button>
        `;
      })
      .join('');

    events.querySelectorAll('[data-event-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = Number(btn.dataset.eventId);
        const row = auditRows.find((r) => r.id === id);
        selectedId = id;
        renderEventList();
        renderDetail(row);
      });
    });

    if (loadMoreBtn) {
      if (filtered.length > visibleCount) loadMoreBtn.classList.remove('hidden');
      else loadMoreBtn.classList.add('hidden');
    }
  }

  if (eventSearch) eventSearch.addEventListener('input', renderEventList);
  if (eventTypeFilter) eventTypeFilter.addEventListener('change', renderEventList);
  if (eventStart) eventStart.addEventListener('change', renderEventList);
  if (eventEnd) eventEnd.addEventListener('change', renderEventList);

  if (loadMoreBtn) {
    loadMoreBtn.addEventListener('click', () => {
      visibleCount += 20;
      renderEventList();
    });
  }

  const auditRes = await window.authFetch(`${backend}/admin/events?limit=200`);
  if (!auditRes.ok) {
    if (events) events.innerHTML = '<div class="text-sm text-muted">Unable to load events.</div>';
    return;
  }

  const rows = await auditRes.json();
  auditRows = (rows || []).filter((row) => allowedActions.has(row.action));
  if (!auditRows.length) {
    if (events) events.innerHTML = '<div class="text-sm text-muted">No events found for selected filters.</div>';
    renderDetail(null);
  } else {
    selectedId = auditRows[0].id;
    renderEventList();
    renderDetail(auditRows[0]);
  }

  if (exportLogs) {
    exportLogs.addEventListener('click', () => {
      const search = (eventSearch?.value || '').trim().toLowerCase();
      const type = eventTypeFilter?.value || '';
      const start = eventStart?.value || '';
      const end = eventEnd?.value || '';
      const filtered = auditRows.filter((r) => matchesFilters(r, search, type, start, end));
      const rowsOut = [
        ['id', 'action', 'name', 'role', 'timestamp'].join(',')
      ].concat(filtered.map((r) => {
        const meta = r.meta || {};
        return [
          r.id,
          r.action,
          meta.user_name || '',
          meta.role || '',
          r.created_at || ''
        ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',');
      }));
      const blob = new Blob([rowsOut.join('\n')], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'system_events.csv';
      link.click();
      URL.revokeObjectURL(url);
    });
  }
});
