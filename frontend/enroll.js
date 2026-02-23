document.addEventListener("DOMContentLoaded", () => {
  const backend = window.BACKEND_URL || "http://127.0.0.1:8000";
  const form = document.getElementById("enrollForm");
  const status = document.getElementById("enrollStatus");
  const assignedDoctor = document.getElementById("assignedDoctor");
  const assignedNurse = document.getElementById("assignedNurse");
  if (!form) return;

  async function loadAssignableUsers() {
    if (!assignedDoctor || !assignedNurse) return;
    try {
      const res = await window.authFetch(`${backend}/auth/users/options`);
      const data = res.ok ? await res.json() : { doctors: [], nurses: [] };
      assignedDoctor.innerHTML = `<option value="">Select doctor</option>` + (data.doctors || []).map((u) => (
        `<option value="${u.name}">${u.name}${u.department ? ` (${u.department})` : ""}</option>`
      )).join("");
      assignedNurse.innerHTML = `<option value="">Select nurse</option>` + (data.nurses || []).map((u) => (
        `<option value="${u.name}">${u.name}${u.department ? ` (${u.department})` : ""}</option>`
      )).join("");
    } catch (err) {
      console.error(err);
      status.textContent = "Could not load doctor/nurse list";
    }
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    status.textContent = "";
    const payload = {
      name: document.getElementById("name").value.trim(),
      age: Number(document.getElementById("age").value) || undefined,
      gender: document.getElementById("gender").value || undefined,
      phone_number: document.getElementById("phone").value.trim(),
      disease_track: document.getElementById("track").value.trim(),
      protocol: document.getElementById("protocol").value.trim() || undefined,
      timezone: document.getElementById("timezone").value.trim(),
      call_time: document.getElementById("callTime").value.trim(),
      days_to_monitor: Number(document.getElementById("days").value),
      diagnosis: document.getElementById("diagnosis").value.trim() || undefined,
      medications_text: document.getElementById("medications").value.trim() || undefined
    };
    const doctorName = assignedDoctor?.value?.trim() || "";
    const nurseName = assignedNurse?.value?.trim() || "";
    try {
      const res = await window.authFetch(`${backend}/patients`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) {
        status.textContent = data.detail || "Enrollment failed";
        return;
      }
      if (data?.id && doctorName && nurseName) {
        await window.authFetch(`${backend}/care/assignments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            patient_id: data.id,
            doctor_name: doctorName,
            nurse_name: nurseName
          })
        });
      }
      status.textContent = "Patient enrolled.";
      form.reset();
      document.getElementById("timezone").value = "Asia/Kolkata";
      document.getElementById("callTime").value = "10:00";
      document.getElementById("days").value = "30";
      await loadAssignableUsers();
    } catch (err) {
      console.error(err);
      status.textContent = "Enrollment failed";
    }
  });

  loadAssignableUsers();
});

