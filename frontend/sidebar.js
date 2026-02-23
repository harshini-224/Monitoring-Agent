(function initSidebar() {
  const menus = {
    doctor: [
      {
        label: "Monitor",
        items: [
          { href: "doctor-dashboard.html", label: "High Alerts" },
          { href: "home.html", label: "Overview" },
          { href: "patients.html", label: "Patients" },
          { href: "calls.html", label: "Calls / IVR" },
          { href: "alerts.html", label: "Alerts" },
          { href: "reviews.html", label: "Reviews" },
          { href: "notes.html", label: "Notes" },
          { href: "insights.html", label: "Insights" }
        ]
      },
      {
        label: "Help",
        items: [{ href: "about.html", label: "How It Works" }]
      }
    ],
    nurse: [
      {
        label: "Nurse",
        items: [
          { href: "index.html", label: "Workspace" },
          { href: "profile.html", label: "Profile" },
          { href: "settings.html", label: "Settings" },
          { href: "patients.html", label: "Patients" },
          { href: "calls.html", label: "Calls / IVR" },
          { href: "about.html", label: "How It Works" },
          { href: "#", label: "Notifications", id: "nurseNotificationsNav" }
        ]
      }
    ],
    staff: [
      {
        label: "Operations",
        items: [
          { href: "staff-overview.html", label: "Overview" },
          { href: "patients.html", label: "Patients" },
          { href: "calls.html", label: "Calls / IVR" },
          { href: "scheduler.html", label: "Scheduler" },
          { href: "enroll.html", label: "Enroll Patient" },
          { href: "about.html", label: "How It Works" }
        ]
      }
    ],
    admin: [
      {
        label: "Monitor",
        items: [
          { href: "admin-dashboard.html", label: "Dashboard" },
          { href: "admin.html", label: "System Overview" }
        ]
      },
      {
        label: "Operations",
        items: [
          { href: "access.html", label: "Access Control" },
          { href: "staff.html", label: "Staff Directory" },
          { href: "events.html", label: "System Events" },
          { href: "ivr.html", label: "IVR Infrastructure" }
        ]
      },
      {
        label: "Governance",
        items: [
          { href: "audit.html", label: "Audit Logs" },
          { href: "security.html", label: "Security & Compliance" }
        ]
      }
    ]
  };

  const rolePages = {
    admin: new Set(["admin-dashboard.html", "admin.html", "access.html", "staff.html", "events.html", "ivr.html", "audit.html", "security.html"]),
    doctor: new Set(["doctor-dashboard.html", "home.html", "alerts.html", "reviews.html", "notes.html", "insights.html"]),
    nurse: new Set(["index.html", "profile.html", "settings.html"]),
    staff: new Set(["staff-overview.html", "scheduler.html", "enroll.html"])
  };

  const activeAlias = {};

  function currentPageName() {
    const page = (window.location.pathname.split("/").pop() || "").toLowerCase();
    return page || "index.html";
  }

  function inferRoleFromPage(page) {
    if (rolePages.admin.has(page)) return "admin";
    if (rolePages.staff.has(page)) return "staff";
    if (rolePages.nurse.has(page)) return "nurse";
    if (rolePages.doctor.has(page)) return "doctor";
    return "";
  }

  function resolveRole(page) {
    const explicit = document.body?.dataset.sidebarRole || "";
    if (menus[explicit]) return explicit;

    const authRole = (typeof window.getRole === "function" ? window.getRole() : "") || localStorage.getItem("auth_role") || "";
    if (menus[authRole]) return authRole;

    return inferRoleFromPage(page) || "doctor";
  }

  function renderItem(item, activePage) {
    const itemPage = (item.href || "").toLowerCase();
    const isActive = itemPage !== "#" && itemPage === activePage;
    const classes = `nav-item${isActive ? " active" : ""}`;
    const idAttr = item.id ? ` id="${item.id}"` : "";
    return `<a href="${item.href}"${idAttr} class="${classes}">${item.label}</a>`;
  }

  function renderSection(section, index, activePage) {
    const headingClass = index === 0 ? "mb-3" : "mt-6 mb-3";
    const heading = `<div class="text-xs uppercase tracking-widest text-muted ${headingClass}">${section.label}</div>`;
    const links = section.items.map((item) => renderItem(item, activePage)).join("");
    return `${heading}<nav class="space-y-1">${links}</nav>`;
  }

  function renderSidebar() {
    const sidebar = document.getElementById("appSidebar") || document.querySelector("aside.w-60");
    if (!sidebar) return;

    const page = currentPageName();
    const activePage = activeAlias[page] || page;
    const role = resolveRole(page);
    const sections = menus[role];
    if (!sections) return;

    sidebar.className = "w-60 bg-white border-r border-border min-h-screen px-4 py-6";
    const sectionMarkup = sections.map((section, index) => renderSection(section, index, activePage)).join("");
    sidebar.innerHTML = `<div class="text-lg font-medium mb-6">CarePulse</div>${sectionMarkup}`;
  }

  document.addEventListener("DOMContentLoaded", renderSidebar);
})();
