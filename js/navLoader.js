// js/navLoader.js - Enterprise Universal Navigation Component

// 1. Immediate Execution Guard (Redirects before DOM finishes if landing on bad route)
(function enforceRouteIntegrity() {
    const path = window.location.pathname;
    if (path.endsWith("/report.html") || path.endsWith("report.html")) {
        window.location.replace("reports.html" + window.location.search + window.location.hash);
    } else if (path.endsWith("/print-.html") || path.endsWith("print-.html")) {
        window.location.replace("print.html" + window.location.search + window.location.hash);
    }
})();

// 2. Global Click Interceptor (Catches any old links or mobile buttons dynamically)
document.addEventListener("click", function (event) {
    const targetLink = event.target.closest("a");
    if (!targetLink) return;

    const href = targetLink.getAttribute("href");
    if (!href) return;

    if (href === "report.html" || href.endsWith("/report.html")) {
        event.preventDefault();
        window.location.href = "reports.html";
    } else if (href === "print-.html" || href.endsWith("/print-.html")) {
        event.preventDefault();
        window.location.href = "print.html";
    }
}, true); // Captured in the capture phase to override default browser handling

document.addEventListener("DOMContentLoaded", function () {
    renderGlobalNavigation();
});

function renderGlobalNavigation() {
    const navContainer = document.getElementById("global-nav-container");
    if (!navContainer) return;

    // 1. Resolve & Normalize Route Pathing
    let rawPath = window.location.pathname.split("/").pop() || "index.html";
    if (rawPath === "" || rawPath === "/") rawPath = "index.html";
    rawPath = rawPath.split("?")[0].split("#")[0];

    // Canonical Route Normalizer
    const routeAliases = {
        "print.html": "print.html",
        "print-.html": "print.html",
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
            ? "nav-link active-portal-link d-flex align-items-center gap-2 px-3 py-2.5 py-xl-1.5 rounded-3 fw-semibold text-white bg-primary shadow-sm"
            : "nav-link portal-nav-item d-flex align-items-center gap-2 px-3 py-2.5 py-xl-1.5 rounded-3 fw-medium text-light opacity-75 hover-opacity-100 transition-all";

        return `
            <li class="nav-item">
                <a class="${linkClass}" href="${item.href}" data-portal-link>
                    <i class="bi ${item.icon} fs-5 fs-xl-6 text-primary-subtle"></i>
                    <span>${item.label}</span>
                    ${isActive ? '<span class="d-xl-none ms-auto badge bg-white text-primary small">Active</span>' : ''}
                </a>
            </li>
        `;
    }).join("");

    // 4. Inject Full Navigation Component
    navContainer.innerHTML = `
        <style>
            .portal-nav-item:hover {
                background-color: rgba(255, 255, 255, 0.08);
                opacity: 1 !important;
            }
            .status-pulse-dot {
                display: inline-block;
                width: 8px;
                height: 8px;
                border-radius: 50%;
                background-color: #22c55e;
                box-shadow: 0 0 0 2px rgba(34, 197, 94, 0.25);
                animation: pulseGlow 2s infinite ease-in-out;
            }
            @keyframes pulseGlow {
                0%, 100% { opacity: 1; transform: scale(1); }
                50% { opacity: 0.6; transform: scale(1.15); }
            }
            @media (max-width: 1199.98px) {
                #portalGlobalNavbar {
                    background: rgba(15, 23, 42, 0.95);
                    backdrop-filter: blur(12px);
                    border-radius: 1rem;
                    padding: 1rem;
                    margin-top: 0.75rem;
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5);
                }
            }
        </style>
        <nav class="navbar navbar-expand-xl navbar-dark border-bottom border-secondary border-opacity-25 shadow-sm py-2 mb-4 no-print sticky-top" style="background-color: #0f172a !important;">
            <div class="container-fluid px-3 px-md-4">
                <a class="navbar-brand fw-bold text-white d-flex align-items-center gap-2 m-0 fs-5" href="index.html">
                    <span class="d-inline-flex align-items-center justify-content-center bg-primary text-white rounded-3 shadow-sm" style="width: 34px; height: 34px;">
                        <i class="bi bi-shield-lock-fill fs-6"></i>
                    </span>
                    <span class="tracking-tight fw-bold">LLR Portal</span>
                </a>

                <button class="navbar-toggler border-0 p-1 text-light shadow-none" type="button" data-bs-toggle="collapse" data-bs-target="#portalGlobalNavbar" aria-controls="portalGlobalNavbar" aria-expanded="false" aria-label="Toggle navigation">
                    <i class="bi bi-list fs-1 lh-1"></i>
                </button>

                <div class="collapse navbar-collapse justify-content-end" id="portalGlobalNavbar">
                    <ul class="navbar-nav align-items-stretch align-items-xl-center gap-1.5 mb-3 mb-xl-0">
                        ${navLinksHtml}
                    </ul>

                    <div class="d-flex flex-column flex-xl-row align-items-stretch align-items-xl-center gap-2.5 ms-xl-3 pt-3 pt-xl-0 border-top border-xl-0 border-secondary border-opacity-25">
                        <div class="d-flex align-items-center justify-content-center justify-content-xl-start gap-2 text-light opacity-75 px-2 py-1 small font-monospace">
                            <span class="status-pulse-dot"></span> 
                            <span>System Online</span>
                        </div>
                        <button onclick="triggerPortalLogout()" type="button" class="btn btn-outline-danger btn-sm px-3.5 py-2 py-xl-1.5 rounded-pill fw-semibold d-inline-flex align-items-center justify-content-center gap-2 transition-all">
                            <i class="bi bi-box-arrow-right"></i>
                            <span>Sign Out</span>
                        </button>
                    </div>
                </div>
            </div>
        </nav>
    `;

    setupMobileMenuBehavior();
}

function setupMobileMenuBehavior() {
    const navbarCollapse = document.getElementById("portalGlobalNavbar");
    if (!navbarCollapse) return;

    const navLinks = navbarCollapse.querySelectorAll("[data-portal-link]");
    navLinks.forEach(link => {
        link.addEventListener("click", () => {
            if (window.innerWidth < 1200 && typeof bootstrap !== "undefined") {
                const bsCollapse = bootstrap.Collapse.getInstance(navbarCollapse) || new bootstrap.Collapse(navbarCollapse);
                bsCollapse.hide();
            }
        });
    });
}

function triggerPortalLogout() {
    if (confirm("Are you sure you want to sign out of the LLR Portal?")) {
        sessionStorage.removeItem("authBasic");
        sessionStorage.removeItem("activeUser");
        localStorage.removeItem("authBasic");
        window.location.href = "login.html";
    }
}