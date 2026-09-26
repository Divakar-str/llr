document.addEventListener("DOMContentLoaded", function () {
    const navContainer = document.getElementById("global-nav-container");
    if (navContainer) {
        const currentPath = window.location.pathname.split("/").pop() || "index.html";
        navContainer.innerHTML = `
            <nav class="navbar navbar-expand-lg navbar-light bg-white border-bottom shadow-sm mb-4 py-3">
                <div class="container-fluid px-4">
                    <a class="navbar-brand fw-bold text-dark d-flex align-items-center gap-2" href="index.html">
                        <i class="bi bi-shield-lock-fill text-primary fs-4"></i> LLR Portal
                    </a>
                    <button class="navbar-toggler border-0" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav">
                        <span class="navbar-toggler-icon"></span>
                    </button>
                    <div class="collapse navbar-collapse justify-content-end" id="navbarNav">
                        <ul class="navbar-nav align-items-center gap-1 gap-lg-2 mt-3 mt-lg-0">
                            <li class="nav-item"><a class="nav-link px-3 rounded-3 fw-semibold ${currentPath === 'index.html' ? 'bg-dark text-white' : 'text-secondary'}" href="index.html"><i class="bi bi-house-door me-1"></i> Home</a></li>
                            <li class="nav-item"><a class="nav-link px-3 rounded-3 fw-semibold ${currentPath === 'extractor.html' ? 'bg-dark text-white' : 'text-secondary'}" href="extractor.html"><i class="bi bi-file-earmark-text me-1"></i> Data Extraction</a></li>
                            <li class="nav-item"><a class="nav-link px-3 rounded-3 fw-semibold ${currentPath === 'records.html' ? 'bg-dark text-white' : 'text-secondary'}" href="records.html"><i class="bi bi-table me-1"></i> Records</a></li>
                            <li class="nav-item"><a class="nav-link px-3 rounded-3 fw-semibold ${currentPath === 'report.html' ? 'bg-dark text-white' : 'text-secondary'}" href="report.html"><i class="bi bi-graph-up me-1"></i> Reports</a></li>
                            <li class="nav-item"><a class="nav-link px-3 rounded-3 fw-semibold ${currentPath === 'dashboard.html' ? 'bg-dark text-white' : 'text-secondary'}" href="dashboard.html"><i class="bi bi-grid-1x2 me-1"></i> Dashboard</a></li>
                            <li class="nav-item"><a class="nav-link px-3 rounded-3 fw-semibold ${currentPath === 'print-engine.html' ? 'bg-dark text-white' : 'text-secondary'}" href="print-engine.html"><i class="bi bi-printer me-1"></i> Print Console</a></li>
                            <li class="nav-item ms-lg-3 mt-2 mt-lg-0">
                                <button onclick="triggerPortalLogout()" class="btn btn-outline-danger btn-sm px-3 rounded-pill fw-semibold w-100">
                                    <i class="bi bi-box-arrow-right me-1"></i> Logout
                                </button>
                            </li>
                        </ul>
                    </div>
                </div>
            </nav>
        `;
    }
});

function triggerPortalLogout() {
    if (confirm("Are you sure you want to log out?")) {
        sessionStorage.removeItem("authBasic");
        window.location.href = "login.html";
    }
}