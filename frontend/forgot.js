document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("forgotForm");
  const error = document.getElementById("forgotError");
  const success = document.getElementById("forgotSuccess");
  const resetLinkWrap = document.getElementById("resetLinkWrap");
  const resetLink = document.getElementById("resetLink");
  if (!form) return;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (error) error.textContent = "";
    if (success) success.classList.add("hidden");
    if (resetLinkWrap) resetLinkWrap.classList.add("hidden");
    const email = document.getElementById("email").value.trim();
    try {
      const res = await fetch(`${window.BACKEND_URL}/auth/forgot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (error) error.textContent = data.detail || "Unable to send reset link.";
        return;
      }
      if (success) success.classList.remove("hidden");
      if (data.reset_token && resetLink && resetLinkWrap) {
        const url = `reset.html?token=${encodeURIComponent(data.reset_token)}`;
        resetLink.href = url;
        resetLink.textContent = url;
        resetLinkWrap.classList.remove("hidden");
      }
    } catch (err) {
      console.error(err);
      if (error) error.textContent = "Unable to send reset link.";
    }
  });
});

