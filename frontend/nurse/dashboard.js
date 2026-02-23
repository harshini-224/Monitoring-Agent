/**
 * Nurse Dashboard JavaScript
 */

let dashboardData = null;
let currentFilter = 'all';

document.addEventListener('DOMContentLoaded', async () => {
    const user = await initAuth(['nurse']);
    if (!user) return;

    await loadDashboard();
    setupAutoRefresh(loadDashboard, 30);
});

async function loadDashboard() {
    try {
        dashboardData = await api.getNurseDashboard();
        renderPatientList();
    } catch (error) {
        console.error('Error loading dashboard:', error);
        showToast('Error', 'Failed to load dashboard', 'error');
    }
}

function filterByRisk(level) {
    currentFilter = level;
    renderPatientList();
}

function renderPatientList() {
    if (!dashboardData) return;

    const container = document.getElementById('patient-list');
    container.innerHTML = '';

    const categories = [
        { title: 'High Risk', patients: dashboardData.high_risk || [], level: 'high', color: 'risk-high' },
        { title: 'Medium Risk', patients: dashboardData.medium_risk || [], level: 'medium', color: 'risk-medium' },
        { title: 'Low Risk', patients: dashboardData.low_risk || [], level: 'low', color: 'risk-low' },
    ];

    categories.forEach(cat => {
        if (currentFilter !== 'all' && currentFilter !== cat.level) return;

        if (cat.patients.length === 0) return;

        const section = document.createElement('div');
        section.className = 'mb-3';

        const header = document.createElement('h3');
        header.style.color = `var(--${cat.color})`;
        header.style.marginBottom = '1rem';
        header.innerHTML = `${cat.title} (${cat.patients.length})`;
        section.appendChild(header);

        const grid = document.createElement('div');
        grid.className = 'grid grid-3';

        cat.patients.forEach(patient => {
            const card = createPatientCard(patient, {
                showRisk: true,
                onClick: () => window.location.href = `patient-detail.html?id=${patient.patient_id}`,
            });
            grid.appendChild(card);
        });

        section.appendChild(grid);
        container.appendChild(section);
    });
}
