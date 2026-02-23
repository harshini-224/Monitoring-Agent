import { initProfilePage, initSettingsPage, initWorkspace } from "./workspace.js";

function pageName() {
  return (window.location.pathname.split("/").pop() || "index.html").toLowerCase();
}

async function run() {
  const page = pageName();
  if (page === "index.html" || page === "") {
    await initWorkspace();
    return;
  }
  if (page === "profile.html") {
    await initProfilePage();
    return;
  }
  if (page === "settings.html") {
    await initSettingsPage();
  }
}

document.addEventListener("DOMContentLoaded", () => {
  run().catch((err) => {
    // Keep a minimal fallback so unexpected client errors don't render a blank page.
    const fallback = document.createElement("div");
    fallback.className = "p-4 text-sm text-red-700";
    fallback.textContent = `Unable to initialize page: ${err?.message || "Unknown error"}`;
    document.body.appendChild(fallback);
  });
});
