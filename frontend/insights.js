document.addEventListener("DOMContentLoaded", async () => {
  const backend = window.BACKEND_URL || "http://127.0.0.1:8000";
  const insightCritical = document.getElementById("insightCritical");
  const insightMonitor = document.getElementById("insightMonitor");
  const insightStable = document.getElementById("insightStable");
  const insightHighRiskCalls = document.getElementById("insightHighRiskCalls");
  const insightAnswered = document.getElementById("insightAnswered");
  const insightFailed = document.getElementById("insightFailed");
  const insightsStatus = document.getElementById("insightsStatus");

  try {
    const patientsRes = await window.authFetch(`${backend}/patients`);
    const patients = patientsRes.ok ? await patientsRes.json() : [];
    const critical = patients.filter((p) => (p.risk_score ?? 0) >= 70).length;
    const monitor = patients.filter((p) => (p.risk_score ?? 0) >= 40 && (p.risk_score ?? 0) < 70).length;
    const stable = patients.filter((p) => (p.risk_score ?? 0) < 40).length;
    if (insightCritical) insightCritical.textContent = critical;
    if (insightMonitor) insightMonitor.textContent = monitor;
    if (insightStable) insightStable.textContent = stable;

    const reportRes = await window.authFetch(`${backend}/reports/daily`);
    if (reportRes.ok) {
      const report = await reportRes.json();
      if (insightHighRiskCalls) insightHighRiskCalls.textContent = report.high_risk_calls ?? "--";
      if (insightAnswered) insightAnswered.textContent = report.answered_calls ?? "--";
      if (insightFailed) insightFailed.textContent = report.failed_calls ?? "--";
    }
    if (insightsStatus) insightsStatus.textContent = "Updated just now";
  } catch (err) {
    console.error(err);
  }
});
