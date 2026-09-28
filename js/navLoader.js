// js/navLoader.js - Enterprise Universal Navigation Component
document.addEventListener("DOMContentLoaded", function () {
    renderGlobalNavigation();
});

function renderGlobalNavigation() {
    const navContainer = document.getElementById("global-nav-container");
    if (!navContainer) return;

    // 1. Resolve & Normalize Route Pathing
    let rawPath = window.location.pathname.split("/").pop() || "index.html";
    if (rawPath === "" || rawPath === "/") rawPath = "index.html";

    // Route Alias Normalizer (Fixes naming discrepancies across files)
    const routeAliases = {
        "print.html": "print.html",
        "print-engine.html": "print.html",
        "report.html": "reports.html",
        "reports.html": "reports.html"
    };
    const currentPath = routeAliases[rawPath] || rawPath;

    // 2. Navigation Items Definition
    const navItems = [
        { href: "index.html", label: "Home", icon: "bi-house-door" },
        { href: "extractor.html", label: "Data Extraction", icon: "bi-file-earmark-text" },
        { href: "records.html", label: "Records", icon: "bi-table" },
        { href: "reports.html", label: "Reports", icon: "bi-graph-up" },
        { href: "dashboard.html", label: "Dashboard", icon: "bi-grid-1x2" },
        { href: "print.html", label: "Print Console", icon: "bi-printer" }
    ];

    // 3. Build Navigation Links Markup
    const navLinksHtml = navItems.map(item => {
        const isActive = currentPath === item.href;
        const linkClass = isActive
            ? "nav-link active-portal-link px-3 py-1.5 rounded-3 fw-semibold text-white bg-primary shadow-sm"
            : "nav-link px-3 py-1.5 rounded-3 fw-medium text-light opacity-75 hover-opacity-100 transition-all";

        return `
            <li class="nav-item">
                <a class="${linkClass}" href="${item.href}">
                    <i class="bi ${item.icon} me-1.5"></i> ${item.label}
                </a>
            </li>
        `;
    }).join("");

    // 4. Inject Full Navigation Component
    navContainer.innerHTML = `
        <nav class="navbar navbar-expand-xl navbar-dark bg-dark border-bottom border-secondary border-opacity-25 shadow-sm py-2.5 mb-4 no-print" style="background-color: #0f172a !important;">
            <div class="container-fluid px-3 px-md-4">
                <!-- Brand Lockup -->
                <a class="navbar-brand fw-bold text-white d-flex align-items-center gap-2 m-0 fs-5" href="index.html">
                    <span class="d-inline-flex align-items-center justify-content-center bg-primary text-white rounded-3 p-1.5 shadow-sm" style="width: 32px; height: 32px;">
                        <i class="bi bi-shield-lock-fill fs-6"></i>
                    </span>
                    <span class="tracking-tight">LLR Portal</span>
                </a>

                <!-- Mobile Toggle Button -->
                <button class="navbar-toggler border-0 p-1 text-light shadow-none" type="button" data-bs-toggle="collapse" data-bs-target="#portalGlobalNavbar" aria-controls="portalGlobalNavbar" aria-expanded="false" aria-label="Toggle navigation">
                    <i class="bi bi-list fs-2"></i>
                </button>

                <!-- Navigation Drawer -->
                <div class="collapse navbar-collapse justify-content-end mt-3 mt-xl-0" id="portalGlobalNavbar">
                    <ul class="navbar-nav align-items-stretch align-items-xl-center gap-1 gap-xl-1.5 mb-2 mb-xl-0">
                        ${navLinksHtml}
                    </ul>

                    <!-- User Meta & Logout Dock -->
                    <div class="d-flex flex-column flex-xl-row align-items-stretch align-items-xl-center gap-2 ms-xl-3 pt-2 pt-xl-0 border-top border-xl-0 border-secondary border-opacity-25">
                        <div class="d-none d-xxl-flex align-items-center gap-1.5 text-light opacity-50 px-2 small font-monospace">
                            <span class="status-pulse-dot"></span> Online
                        </div>
                        <button onclick="triggerPortalLogout()" type="button" class="btn btn-outline-danger btn-sm px-3 rounded-pill fw-semibold d-inline-flex align-items-center justify-content-center gap-1.5 transition-all">
                            <i class="bi bi-box-arrow-right"></i>
                            <span>Sign Out</span>
                        </button>
                    </div>
                </div>
            </div>
        </nav>
    `;
}

/**
 * Graceful session termination and sign-out routine.
 */
function triggerPortalLogout() {
    if (confirm("Are you sure you want to sign out of the LLR Portal?")) {
        sessionStorage.removeItem("authBasic");
        sessionStorage.removeItem("activeUser");
        localStorage.removeItem("authBasic");
        window.location.href = "login.html";
    }
}