window.addEventListener("load", () => {
  setTimeout(() => {
    const splash = document.getElementById("splash");
    const mainContent = document.getElementById("main-content");
    if (splash) splash.style.display = "none";
    if (mainContent) mainContent.classList.remove("hidden");
  }, 3000);
});

const backendURL = "http://127.0.0.1:8000";
const cardiacEl = document.getElementById("cardiacCount");
const pulmonaryEl = document.getElementById("pulmonaryCount");
const generalEl = document.getElementById("generalCount");

async function loadPatientCounts() {
  try {
    const res = await fetch(`${backendURL}/patients`);
    const patients = await res.json();

    let cardiac = 0;
    let pulmonary = 0;
    let general = 0;

    patients.forEach((patient) => {
      const track = String(patient.disease_track || "").toLowerCase();
      if (track.includes("card")) cardiac += 1;
      else if (track.includes("pulmo")) pulmonary += 1;
      else general += 1;
    });

    if (cardiacEl) cardiacEl.textContent = `${cardiac} Patients`;
    if (pulmonaryEl) pulmonaryEl.textContent = `${pulmonary} Patients`;
    if (generalEl) generalEl.textContent = `${general} Patients`;
  } catch (err) {
    console.error("Failed to load patient counts", err);
    if (cardiacEl) cardiacEl.textContent = "--";
    if (pulmonaryEl) pulmonaryEl.textContent = "--";
    if (generalEl) generalEl.textContent = "--";
  }
}

window.addEventListener("load", loadPatientCounts);

document.querySelectorAll(".track-card").forEach((card) => {
  card.addEventListener("click", () => {
    const track = card.getAttribute("data-track");
    window.location.href = `patients.html?track=${track}`;
  });
});

const profilePic = document.getElementById("profilePic");
const profileDropdown = document.getElementById("profileDropdown");

if (profilePic && profileDropdown) {
  profilePic.addEventListener("click", () => {
    profileDropdown.style.display = profileDropdown.style.display === "block" ? "none" : "block";
  });

  profilePic.onclick = () => {
    profileDropdown.classList.toggle("show");
  };
}

document.addEventListener("click", (event) => {
  if (!profilePic || !profileDropdown) return;
  if (!profilePic.contains(event.target) && !profileDropdown.contains(event.target)) {
    profileDropdown.style.display = "none";
  }
});

function logout() {
  if (window.ui?.toast) {
    window.ui.toast("Logged out successfully.", "success");
    setTimeout(() => {
      window.location.href = "login.html";
    }, 300);
    return;
  }
  window.location.href = "login.html";
}

window.logout = logout;
