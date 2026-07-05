// CENTRALIZED NAVIGATION AND MOBILE RESPONSIVENESS LOADER
document.addEventListener("DOMContentLoaded", () => {
    const navContainer = document.getElementById("global-nav-container");
    if (!navContainer) return;

    // Inject Completely Isolated Styles Using Unique Namespace (llr-sys-*)
    const styleId = "llr-sys-nav-styles-isolated";
    if (!document.getElementById(styleId)) {
        const style = document.createElement("style");
        style.id = styleId;
        style.textContent = `
            :root {
                --llr-sys-bg: #111827;
                --llr-sys-accent: #3b82f6;
                --llr-sys-text-muted: #9ca3af;
                --llr-sys-text-active: #ffffff;
            }
            .llr-sys-navbar {
                background-color: var(--llr-sys-bg) !important;
                border-bottom: 1px solid rgba(255, 255, 255, 0.08);
                padding: 0.75rem 0;
                backdrop-filter: blur(8px);
            }
            .llr-sys-navbar .llr-sys-brand {
                font-size: 1.25rem;
                letter-spacing: -0.025em;
                color: #ffffff !important;
                text-decoration: none;
            }
            .llr-sys-navbar .llr-sys-link {
                color: var(--llr-sys-text-muted) !important;
                font-weight: 500;
                font-size: 0.925rem;
                padding: 0.625rem 1rem !important;
                border-radius: 6px;
                display: inline-flex;
                align-items: center;
                gap: 0.5rem;
                text-decoration: none;
                transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            }
            /* Desktop Hover States */
            @media (min-width: 992px) {
                .llr-sys-navbar .llr-sys-link:hover {
                    color: var(--llr-sys-text-active) !important;
                    background-color: rgba(255, 255, 255, 0.05);
                }
            }
            /* Isolated Active Navigation Item State */
            .llr-sys-navbar .llr-sys-link.llr-sys-active {
                color: var(--llr-sys-text-active) !important;
                background-color: rgba(59, 130, 246, 0.15) !important;
                box-shadow: inset 0 0 0 1px rgba(59, 130, 246, 0.3);
            }
            /* Responsive Touch Enhancements */
            @media (max-width: 991.98px) {
                .llr-sys-collapse-box {
                    background-color: #111827;
                    margin-top: 0.75rem;
                    padding: 1rem;
                    border-radius: 8px;
                    border: 1px solid rgba(255, 255, 255, 0.08);
                    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.3);
                }
                .llr-sys-navbar .llr-sys-link {
                    width: 100%;
                    padding: 0.75rem 1rem !important;
                }
            }
            .llr-sys-toggler:focus { box-shadow: none !important; }
            .llr-sys-toggler-icon { transition: transform 0.2s ease; }
            .llr-sys-toggler[aria-expanded="true"] .llr-sys-toggler-icon { transform: rotate(90deg); }
        `;
        document.head.appendChild(style);
    }

    // 1. Render the responsive HTML structure with isolated targeting hooks
    navContainer.innerHTML = `
        <nav class="navbar navbar-expand-lg navbar-dark llr-sys-navbar sticky-top shadow-sm">
            <div class="container">
                <a class="llr-sys-brand fw-bold d-flex align-items-center gap-2" href="index.html">
                    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-primary" viewBox="0 0 24 24"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/></svg>
                    <span>LLR Portal</span>
                </a>
                
                <button class="navbar-toggler border-0 p-2 llr-sys-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#llrSysNavbarNav" aria-controls="llrSysNavbarNav" aria-expanded="false" aria-label="Toggle navigation">
                    <span class="navbar-toggler-icon llr-sys-toggler-icon"></span>
                </button>
                
                <div class="collapse navbar-collapse llr-sys-collapse-box" id="llrSysNavbarNav">
                    <ul class="navbar-nav ms-auto gap-1 gap-lg-2 pt-2 pt-lg-0">
                        <li class="nav-item">
                            <a class="llr-sys-link" data-page="index.html" href="index.html">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                                Home
                            </a>
                        </li>
                        <li class="nav-item">
                            <a class="llr-sys-link" data-page="extractor.html" href="extractor.html">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                                Data Extraction
                            </a>
                        </li>
                        <li class="nav-item">
                            <a class="llr-sys-link" data-page="records.html" href="records.html">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect width="18" height="18" x="3" y="3" rx="2" stroke-linecap="round" stroke-linejoin="round"/><path stroke-linecap="round" stroke-linejoin="round" d="M7 8h10M7 12h10M7 16h10"/></svg>
                                Records
                            </a>
                        </li>
                        <li class="nav-item">
                            <a class="llr-sys-link" data-page="report.html" href="report.html">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3 3v18h18"/><path stroke-linecap="round" stroke-linejoin="round" d="m19 9-5 5-4-4-3 3"/></svg>
                                Reports
                            </a>
                        </li>
                        <li class="nav-item">
                            <a class="llr-sys-link" data-page="dashboard.html" href="dashboard.html">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>
                                Dashboard
                            </a>
                        </li>
                        <li class="nav-item">
                            <a class="llr-sys-link" data-page="print-engine.html" href="print-engine.html">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14"/></svg>
                                Print Console
                            </a>
                        </li>
                    </ul>
                </div>
            </div>
        </nav>
    `;

    // 2. High-Performance Active Route Engine (Using Isolated Selectors)
    let currentPath = window.location.pathname.split("/").pop();
    if (!currentPath || currentPath === "") {
        currentPath = "index.html"; 
    }

    const targetLink = document.querySelector(`.llr-sys-link[data-page="${currentPath}"]`);
    if (targetLink) {
        targetLink.classList.add("llr-sys-active");
        targetLink.setAttribute("aria-current", "page");
    }

    // 3. Native Bootstrap Collapse Driver for Multi-Device Target Isolation
    const navbarCollapse = document.getElementById('llrSysNavbarNav');
    if (navbarCollapse && typeof bootstrap !== 'undefined' && bootstrap.Collapse) {
        new bootstrap.Collapse(navbarCollapse, { toggle: false });
    }
});