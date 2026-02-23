document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("registerForm");
  const error = document.getElementById("registerError");
  const success = document.getElementById("registerSuccess");
  if (!form) return;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    error.textContent = "";
    if (success) success.classList.add("hidden");
    const payload = {
      name: document.getElementById("name").value.trim(),
      email: document.getElementById("email").value.trim(),
      password: "pending",
      role: "staff"
    };
    try {
      const res = await fetch(`${window.BACKEND_URL}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) {
        error.textContent = data.detail || "Registration failed";
        return;
      }
      form.reset();
      if (success) success.classList.remove("hidden");
    } catch (err) {
      console.error(err);
      error.textContent = "Registration failed";
    }
  });
});

