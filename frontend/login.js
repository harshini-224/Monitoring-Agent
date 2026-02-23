document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("loginForm");
  const error = document.getElementById("loginError");
  if (!form) return;

  function getDashboardForRole(role) {
    if (role === "admin") return "admin-dashboard.html";
    if (role === "doctor") return "doctor-dashboard.html";
    if (role === "nurse") return "index.html";
    if (role === "staff") return "staff-overview.html";
    return "doctor-dashboard.html";
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    error.textContent = "";

    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value.trim();

    // Use absolute URL so this works regardless of how the page was opened
    const backendUrl = window.BACKEND_URL || `${window.location.protocol}//${window.location.hostname}:8000`;

    try {
      const res = await fetch(`${backendUrl}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password })
      });

      const payload = await res.json().catch(() => ({}));

      if (!res.ok) {
        error.textContent = payload?.detail || "Login failed";
        error.className = "text-sm text-critical mt-2";
        return;
      }

      // Store token and role
      if (payload.token) {
        localStorage.setItem("auth_token", payload.token);
        sessionStorage.setItem("auth_token", payload.token);
      }
      if (payload.role) {
        sessionStorage.setItem("auth_role", payload.role);
        localStorage.setItem("auth_role", payload.role);
      }
      if (payload.name) {
        sessionStorage.setItem("auth_name", payload.name);
        localStorage.setItem("auth_name", payload.name);
      }

      error.textContent = "Login successful! Redirecting...";
      error.className = "text-sm text-success mt-2";

      setTimeout(() => {
        window.location.href = getDashboardForRole(payload.role);
      }, 800);

    } catch (err) {
      console.error("Login error:", err);
      error.textContent = "Unable to connect to server. Make sure the backend is running on port 8000.";
      error.className = "text-sm text-critical mt-2";
    }
  });
});
