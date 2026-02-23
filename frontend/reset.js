document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("resetForm");
  const error = document.getElementById("resetError");
  const success = document.getElementById("resetSuccess");
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token") || "";
  if (!form) return;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (error) error.textContent = "";
    if (success) success.classList.add("hidden");
    const password = document.getElementById("password").value.trim();
    try {
      const res = await fetch(`${window.BACKEND_URL}/auth/reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (error) error.textContent = data.detail || "Unable to reset password.";
        return;
      }
      if (success) success.classList.remove("hidden");
      form.reset();
    } catch (err) {
      console.error(err);
      if (error) error.textContent = "Unable to reset password.";
    }
  });
});

