document.addEventListener("DOMContentLoaded", async () => {
  const backend = window.BACKEND_URL || "http://127.0.0.1:8000";
  const mfaCoverage = document.getElementById("mfaCoverage");
  const passwordRotation = document.getElementById("passwordRotation");
  const policyExceptions = document.getElementById("policyExceptions");

  try {
    const res = await window.authFetch(`${backend}/admin/security`);
    if (!res.ok) return;
    const data = await res.json();
    if (mfaCoverage) mfaCoverage.textContent = `${data.mfa_coverage ?? 0}%`;
    if (passwordRotation) passwordRotation.textContent = `${data.password_rotation ?? 0}%`;
    if (policyExceptions) policyExceptions.textContent = data.policy_exceptions ?? 0;
  } catch (err) {
    console.error(err);
  }
});
