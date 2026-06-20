// CENTRALIZED NAVIGATION AND MOBILE RESPONSIVENESS LOADER
document.addEventListener("DOMContentLoaded", () => {
    const navContainer = document.getElementById("global-nav-container");
    if (!navContainer) return;

    // 1. Render the responsive, unified HTML structure
    navContainer.innerHTML = `
        <nav class="navbar navbar-expand-lg navbar-dark bg-dark mb-4 mb-md-5 shadow-sm">
            <div class="container">
                <a class="navbar-brand fw-bold d-flex align-items-center" href="index.html">
                    <span>🚗 LLR Portal</span>
                </a>
                
                <button class="navbar-toggler border-0" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav" aria-controls="navbarNav" aria-expanded="false" aria-label="Toggle navigation">
                    <span class="navbar-toggler-icon"></span>
                </button>
                
                <div class="collapse navbar-collapse" id="navbarNav">
                    <ul class="navbar-nav ms-auto gap-1 gap-lg-2 pt-2 pt-lg-0">
                        <li class="nav-item"><a class="nav-link" data-page="index.html" href="index.html">🏠 Home</a></li>
                        <li class="nav-item"><a class="nav-link" data-page="extractor.html" href="extractor.html">📄 Data Extraction</a></li>
                        <li class="nav-item"><a class="nav-link" data-page="records.html" href="records.html">📋 Records</a></li>
                        <li class="nav-item"><a class="nav-link" data-page="report.html" href="report.html">📊 Reports</a></li>
                        <li class="nav-item"><a class="nav-link" data-page="dashboard.html" href="dashboard.html">📈 Dashboard</a></li>
                        <li class="nav-item"><a class="nav-link" data-page="print-engine.html" href="print-engine.html">🖨️ Print Console</a></li>
                    </ul>
                </div>
            </div>
        </nav>
    `;

    // 2. Automated Smart Highlight Engine for Active States
    const currentPath = window.location.pathname.split("/").pop() || "index.html";
    const targetLink = document.querySelector(`.nav-link[data-page="${currentPath}"]`);
    
    if (targetLink) {
        targetLink.classList.add("active");
        targetLink.parentElement.classList.add("active");
    }
});