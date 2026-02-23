/**
 * CarePulse UI Components
 * Reusable UI component generators
 */

// ============================================================================
// PATIENT CARD COMPONENT
// ============================================================================

/**
 * Create patient card HTML
 */
function createPatientCard(patient, options = {}) {
  const { showRisk = true, onClick = null, selected = false } = options;

  const riskBadge = showRisk && patient.risk_score !== null && patient.risk_score !== undefined
    ? createRiskBadge(patient.risk_score)
    : '';

  const selectedClass = selected ? 'selected' : '';

  const card = document.createElement('div');
  card.className = `patient-card ${selectedClass}`;
  card.innerHTML = `
    <div class="patient-header">
      <div>
        <div class="patient-name">${patient.name || 'Unknown'}</div>
        <div class="patient-meta">
          ${patient.age ? `${patient.age}y` : ''}
          ${patient.gender ? ` • ${patient.gender}` : ''}
          ${patient.disease_track || patient.conditions?.[0] ? ` • ${patient.disease_track || patient.conditions?.[0]}` : ''}
        </div>
      </div>
      ${riskBadge}
    </div>
    <div class="patient-footer">
      <span>${patient.phone_number || 'No phone'}</span>
      <span>${patient.protocol || 'No protocol'}</span>
    </div>
  `;

  if (onClick) {
    card.addEventListener('click', () => onClick(patient));
  }

  return card;
}

// ============================================================================
// STAT CARD COMPONENT
// ============================================================================

/**
 * Create stat card HTML
 */
function createStatCard(label, value, icon = null, color = null) {
  const card = document.createElement('div');
  card.className = 'stat-card';
  card.style.position = 'relative';

  if (color) {
    card.style.borderLeft = `4px solid var(--${color})`;
  }

  card.innerHTML = `
    ${icon ? `<div class="stat-icon">${icon}</div>` : ''}
    <div class="stat-value">${value}</div>
    <div class="stat-label">${label}</div>
  `;

  return card;
}

// ============================================================================
// TABLE COMPONENT
// ============================================================================

/**
 * Create table from data
 */
function createTable(columns, data, options = {}) {
  const {
    onRowClick = null,
    emptyMessage = 'No data available',
    formatters = {},
  } = options;

  const container = document.createElement('div');
  container.className = 'table-container';

  if (data.length === 0) {
    container.innerHTML = `<p class="text-center text-muted p-3">${emptyMessage}</p>`;
    return container;
  }

  const table = document.createElement('table');
  table.className = 'table';

  // Create header
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  columns.forEach(col => {
    const th = document.createElement('th');
    th.textContent = col.label;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);

  // Create body
  const tbody = document.createElement('tbody');
  data.forEach(row => {
    const tr = document.createElement('tr');

    columns.forEach(col => {
      const td = document.createElement('td');
      let value = row[col.key];

      // Apply formatter if exists
      if (formatters[col.key]) {
        value = formatters[col.key](value, row);
      } else if (value === null || value === undefined) {
        value = 'N/A';
      }

      // Set content (allow HTML)
      if (typeof value === 'string' && value.startsWith('<')) {
        td.innerHTML = value;
      } else {
        td.textContent = value;
      }

      tr.appendChild(td);
    });

    if (onRowClick) {
      tr.style.cursor = 'pointer';
      tr.addEventListener('click', () => onRowClick(row));
    }

    tbody.appendChild(tr);
  });
  table.appendChild(tbody);

  container.appendChild(table);
  return container;
}

// ============================================================================
// ACTION BUTTONS
// ============================================================================

/**
 * Create action button group
 */
function createActionButtons(actions) {
  const container = document.createElement('div');
  container.className = 'flex gap-2';

  actions.forEach(action => {
    const btn = document.createElement('button');
    btn.className = `btn ${action.className || 'btn-secondary'}`;
    btn.textContent = action.label;
    btn.addEventListener('click', action.onClick);

    if (action.disabled) {
      btn.disabled = true;
    }

    container.appendChild(btn);
  });

  return container;
}

// ============================================================================
// ALERT PANEL
// ============================================================================

/**
 * Create alert panel
 */
function createAlert(message, type = 'info') {
  const alert = document.createElement('div');
  alert.className = `card`;
  alert.style.borderLeft = `4px solid var(--${type === 'info' ? 'info' : type})`;
  alert.style.backgroundColor = `var(--bg-secondary)`;

  alert.innerHTML = `
    <div class="flex gap-2">
      <span style="font-size: 1.25rem;">
        ${type === 'success' ? '✓' : type === 'error' ? '✕' : type === 'warning' ? '⚠' : 'ℹ'}
      </span>
      <div style="flex: 1;">
        ${message}
      </div>
    </div>
  `;

  return alert;
}

// ============================================================================
// EMPTY STATE
// ============================================================================

/**
 * Create empty state component
 */
function createEmptyState(title, message, actionButton = null) {
  const container = document.createElement('div');
  container.className = 'flex-center flex-col gap-3';
  container.style.padding = '4rem 2rem';
  container.style.textAlign = 'center';

  container.innerHTML = `
    <div style="font-size: 3rem; opacity: 0.3;">📋</div>
    <h3 style="color: var(--text-primary);">${title}</h3>
    <p style="color: var(--text-tertiary); max-width: 400px;">${message}</p>
  `;

  if (actionButton) {
    const btn = document.createElement('button');
    btn.className = `btn ${actionButton.className || 'btn-primary'}`;
    btn.textContent = actionButton.label;
    btn.addEventListener('click', actionButton.onClick);
    container.appendChild(btn);
  }

  return container;
}

// ============================================================================
// IVR RESPONSE CARD
// ============================================================================

/**
 * Create risk badge HTML based on score
 */
function createRiskBadge(riskScore) {
  let score = parseFloat(riskScore);
  if (isNaN(score)) return '';

  // Handle 0-1 scale vs 0-100 scale
  if (score <= 1) {
    score = score * 100;
  }

  // Cap at 100
  if (score > 100) score = 100;

  let className = 'risk-badge';
  if (score >= 65) className += ' risk-badge-high';
  else if (score >= 40) className += ' risk-badge-medium';
  else className += ' risk-badge-low';

  return `<span class="${className}">${Math.round(score)}% Risk</span>`;
}

/**
 * Create IVR response card with correction display
 */
function createIVRResponseCard(response) {
  const card = document.createElement('div');
  card.className = 'card';

  const redFlagBadge = response.red_flag
    ? '<span class="risk-badge risk-badge-critical" style="margin-left: 0.5rem;">RED FLAG</span>'
    : '';

  const responseText = response.original_text || response.raw_text || 'No response recorded';
  let correctionHTML = '';

  if (response.has_correction) {
    correctionHTML = `
      <div style="margin-top: 0.5rem; padding: 0.75rem; background: var(--bg-secondary); border-radius: 8px;">
        <div style="font-size: 0.75rem; color: var(--text-tertiary); margin-bottom: 0.25rem;">
          ✓ Corrected by Nurse
        </div>
        <div style="text-decoration: line-through; color: var(--text-tertiary); margin-bottom: 0.25rem;">
          ${responseText}
        </div>
        <div style="color: var(--success); font-weight: 500;">
          ${response.corrected_text}
        </div>
      </div>
    `;
  }

  card.innerHTML = `
    <div style="margin-bottom: 0.75rem; color: var(--text-primary); font-size: 0.9375rem;">
      <span style="font-weight: 600; color: var(--text-tertiary);">Q:</span> ${response.question || response.intent_id}
      ${redFlagBadge}
    </div>
    <div style="color: var(--text-secondary); display: flex; gap: 0.5rem; line-height: 1.4;">
      <span style="font-weight: 600; color: var(--text-tertiary);">A:</span>
      <div style="flex: 1;">
        ${response.has_correction ? '' : responseText}
        ${correctionHTML}
      </div>
    </div>
  `;

  return card;
}

// ============================================================================
// SHAP EXPLAINABILITY BAR CHART
// ============================================================================

/**
 * Create SHAP explainability visualization
 */
function createSHAPChart(shapData) {
  // Handle different data structures (seeded data uses top_factors, model might use features)
  const features = shapData.features || shapData.top_factors || [];
  if (features.length === 0) {
    return createEmptyState('No Explainability Data', 'SHAP values not available for this call');
  }

  const container = document.createElement('div');
  container.className = 'card';

  const title = document.createElement('h4');
  title.textContent = 'Risk Factors (SHAP Analysis)';
  title.style.marginBottom = '1rem';
  container.appendChild(title);

  // Normalize feature objects (handle key name differences)
  const normalizedFeatures = features.map(f => {
    const rawName = f.name || f.label || f.feature || 'Unknown';
    // Map technical names to human-readable labels
    const humanLabels = {
      'symptom_progression': 'Worsening Symptoms',
      'med_adherence': 'Medication Adherence',
      'chest_pain': 'Chest Pain/Pressure',
      'dyspnea': 'Shortness of Breath',
      'fatigue': 'Extreme Fatigue',
      'cough': 'Worsening Cough',
      'weight_gain': 'Rapid Weight Gain'
    };
    return {
      name: humanLabels[rawName.toLowerCase()] || rawName,
      value: f.value !== undefined ? f.value : '',
      impact: f.impact || 0,
      direction: f.impact > 0 ? 'increase' : 'decrease'
    };
  });

  // Sort by absolute impact
  const sortedFeatures = [...normalizedFeatures].sort(
    (a, b) => Math.abs(b.impact) - Math.abs(a.impact)
  ).slice(0, 5);

  // Create human-readable summary
  const topFactor = sortedFeatures[0];
  const insightBox = document.createElement('div');
  insightBox.style.padding = '1rem';
  insightBox.style.borderRadius = '8px';
  insightBox.style.marginBottom = '1.5rem';
  insightBox.style.background = 'rgba(45, 212, 191, 0.08)';
  insightBox.style.borderLeft = '4px solid var(--accent-primary)';

  const actionText = topFactor.impact > 0 ? 'increased' : 'is stable';
  const reasonText = topFactor.impact > 0 ? 'primarily due to' : 'partially thanks to';

  // Custom non-technical reasons
  const customReasons = {
    'Medication Adherence': topFactor.impact > 0 ? 'missed medications' : 'consistent medication intake',
    'Worsening Symptoms': 'reported symptom progression',
    'Shortness of Breath': 'new or worsening shortness of breath',
    'Chest Pain/Pressure': 'reported chest discomfort',
    'Extreme Fatigue': 'higher levels of exhaustion',
    'Worsening Cough': 'an increase in coughing',
    'Rapid Weight Gain': 'sudden weight increase'
  };

  const humanReason = customReasons[topFactor.name] || topFactor.name;
  const insightText = `The patient's readmission risk has <strong>${actionText}</strong>, ${reasonText} <strong>${humanReason}</strong>.`;

  insightBox.innerHTML = `<div style="display: flex; gap: 0.75rem; align-items: start;">
    <span style="font-size: 1.25rem;">🏥</span>
    <p style="margin: 0; font-size: 0.9375rem; line-height: 1.5;">${insightText}</p>
  </div>`;
  container.appendChild(insightBox);

  const list = document.createElement('div');
  list.className = 'flex-col gap-2';

  const maxImpact = Math.max(...sortedFeatures.map(f => Math.abs(f.impact)));

  sortedFeatures.forEach(feature => {
    const row = document.createElement('div');
    row.style.marginBottom = '1rem';

    const labelRow = document.createElement('div');
    labelRow.className = 'flex-between mb-1';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'font-medium text-sm';
    nameSpan.textContent = feature.name;

    const valueSpan = document.createElement('span');
    valueSpan.className = 'text-xs text-secondary';
    valueSpan.textContent = feature.impact > 0 ? `+${feature.impact.toFixed(3)}` : feature.impact.toFixed(3);

    labelRow.appendChild(nameSpan);
    labelRow.appendChild(valueSpan);

    const barContainer = document.createElement('div');
    barContainer.className = 'progress-bar';
    barContainer.style.height = '8px';
    barContainer.style.backgroundColor = 'var(--bg-secondary)';

    const bar = document.createElement('div');
    bar.className = 'progress-fill';
    const widthPercent = (Math.abs(feature.impact) / maxImpact) * 100;
    bar.style.width = `${widthPercent}%`;
    bar.style.backgroundColor = feature.impact > 0 ? 'var(--accent-red)' : 'var(--accent-primary)';

    barContainer.appendChild(bar);
    row.appendChild(labelRow);
    row.appendChild(barContainer);
    list.appendChild(row);
  });

  container.appendChild(list);
  return container;
}

// ============================================================================
// DATE NAVIGATION
// ============================================================================

/**
 * Create date navigation component
 */
function createDateNav(currentDate, minDate, maxDate, onDateChange) {
  const container = document.createElement('div');
  container.className = 'flex-between gap-2';
  container.style.padding = '1rem';
  container.style.background = 'var(--bg-card)';
  container.style.borderRadius = '8px';

  const prevBtn = document.createElement('button');
  prevBtn.className = 'btn btn-secondary';
  prevBtn.textContent = '◀ Previous';
  prevBtn.addEventListener('click', () => {
    const prev = new Date(currentDate);
    prev.setDate(prev.getDate() - 1);
    if (!minDate || prev >= new Date(minDate)) {
      onDateChange(formatDateISO(prev));
    }
  });

  if (minDate && new Date(currentDate) <= new Date(minDate)) {
    prevBtn.disabled = true;
  }

  const currentLabel = document.createElement('div');
  currentLabel.style.fontWeight = '600';
  currentLabel.style.color = 'var(--text-primary)';
  currentLabel.textContent = formatDate(currentDate);

  const nextBtn = document.createElement('button');
  nextBtn.className = 'btn btn-secondary';
  nextBtn.textContent = 'Next ▶';
  nextBtn.addEventListener('click', () => {
    const next = new Date(currentDate);
    next.setDate(next.getDate() + 1);
    if (!maxDate || next <= new Date(maxDate)) {
      onDateChange(formatDateISO(next));
    }
  });

  if (maxDate && new Date(currentDate) >= new Date(maxDate)) {
    nextBtn.disabled = true;
  }

  const todayBtn = document.createElement('button');
  todayBtn.className = 'btn btn-primary btn-sm';
  todayBtn.textContent = 'Today';
  todayBtn.addEventListener('click', () => {
    onDateChange(formatDateISO(new Date()));
  });

  container.appendChild(prevBtn);
  container.appendChild(currentLabel);
  container.appendChild(nextBtn);
  container.appendChild(todayBtn);

  return container;
}

// ============================================================================
// NOTIFICATION BADGE
// ============================================================================

/**
 * Create notification badge
 */
function createNotificationBadge(count) {
  if (count <= 0) return '';

  const badge = document.createElement('span');
  badge.style.cssText = `
    background: var(--error);
    color: white;
    font-size: 0.675rem;
    font-weight: 700;
    padding: 0.125rem 0.375rem;
    border-radius: 10px;
    min-width: 18px;
    text-align: center;
    display: inline-block;
  `;
  badge.textContent = count > 99 ? '99+' : count;

  return badge;
}
