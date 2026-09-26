// js/printEngine.js - Advanced Print & Manifest Console Engine for Cloudflare D1
document.addEventListener("DOMContentLoaded", () => {
    initPrintConsole();
});

let masterPrintCache = [];

// Default printable columns configuration
let activeColumns = [
    { id: "llr_number", label: "LLR Number", visible: true },
    { id: "name", label: "Applicant Name", visible: true },
    { id: "date_of_birth", label: "DOB", visible: true },
    { id: "vehicle_class", label: "Vehicle Class", visible: true },
    { id: "mobile_number", label: "Mobile Number", visible: true },
    { id: "issue_date", label: "Issue Date", visible: true },
    { id: "expiry_date", label: "Expiry Date", visible: true },
    { id: "dl_issued", label: "DL Status", visible: true }
];

async function initPrintConsole() {
    setupPrintEventListeners();
    buildColumnConfigModalUI();
    await fetchPrintDataRegistry();
}

// 1. Fetch Master Registry Data
async function fetchPrintDataRegistry() {
    const tbody = document.getElementById("printTableBody");
    if (tbody) {
        tbody.innerHTML = `
            <tr>
                <td colspan="100" class="text-center py-5 text-muted small">
                    <div class="spinner-border spinner-border-sm text-dark me-2" role="status"></div>
                    Syncing database entries parameters fields...
                </td>
            </tr>
        `;
    }

    try {
        const response = await fetch(`${ENV.SHEET_API_URL}?action=readAll`, {
            headers: getAuthHeaders()
        });

        if (response.status === 401) {
            alert("Session expired or unauthorized. Redirecting to login...");
            window.location.href = "login.html";
            return;
        }

        if (!response.ok) throw new Error(`Server returned status: ${response.status}`);

        const data = await response.json();
        masterPrintCache = Array.isArray(data) ? data : (data.data || []);

        applyFiltersAndRender();
    } catch (error) {
        console.error("Print Console Fetch Error:", error);
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="100" class="text-center py-4 text-danger small">Failed to load registry data from server.</td></tr>`;
        }
    }
}

// 2. Setup Event Listeners
function setupPrintEventListeners() {
    const refreshBtn = document.getElementById("refreshBtn");
    if (refreshBtn) refreshBtn.addEventListener("click", fetchPrintDataRegistry);

    const filterTypeDropdown = document.getElementById("filterTypeDropdown");
    if (filterTypeDropdown) {
        filterTypeDropdown.addEventListener("change", (e) => {
            toggleConditionalDateInputs(e.target.value);
            applyFiltersAndRender();
        });
    }

    const triggerPrintBtn = document.getElementById("triggerPrintBtn");
    if (triggerPrintBtn) {
        triggerPrintBtn.addEventListener("click", () => window.print());
    }

    // Input listeners for dynamic re-rendering
    const liveSearch = document.getElementById("liveSearchQuery");
    const vehicleClassSelect = document.getElementById("filterVehicleClass");
    const toggleDl = document.getElementById("toggleDlIssuedVisibility");
    const targetDate = document.getElementById("filterTargetDate");
    const startDate = document.getElementById("filterStartDate");
    const endDate = document.getElementById("filterEndDate");

    [liveSearch, vehicleClassSelect, toggleDl, targetDate, startDate, endDate].forEach(el => {
        if (el) {
            el.addEventListener("input", applyFiltersAndRender);
            el.addEventListener("change", applyFiltersAndRender);
        }
    });

    // Custom column addition button
    const addCustomColBtn = document.getElementById("addCustomColumnBtn");
    if (addCustomColBtn) {
        addCustomColBtn.addEventListener("click", handleAddCustomColumn);
    }
}

// 3. Conditional Date View Handlers
function toggleConditionalDateInputs(mode) {
    const container = document.getElementById("conditionalDateContainer");
    const singleWrapper = document.getElementById("wrapperSingleDate");
    const rangeWrapper = document.getElementById("wrapperDateRange");

    if (mode === "ALL" || mode === "ELIMINATED_31DAYS") {
        container.classList.add("d-none");
        singleWrapper.classList.add("d-none");
        rangeWrapper.classList.add("d-none");
    } else if (mode === "SINGLE_DATE") {
        container.classList.remove("d-none");
        singleWrapper.classList.remove("d-none");
        rangeWrapper.classList.add("d-none");
    } else if (mode === "CUSTOM_RANGE") {
        container.classList.remove("d-none");
        singleWrapper.classList.add("d-none");
        rangeWrapper.classList.remove("d-none");
    }
}

// 4. Column Configuration Modal Builder
function buildColumnConfigModalUI() {
    const container = document.getElementById("modalColumnContainer");
    if (!container) return;

    container.innerHTML = "";
    activeColumns.forEach((col, index) => {
        const div = document.createElement("div");
        div.className = "form-check form-switch bg-light p-2.5 rounded-3 border";
        div.innerHTML = `
            <input class="form-check-input column-toggle-chk" type="checkbox" id="colChk_${col.id}" data-col-id="${col.id}" ${col.visible ? 'checked' : ''} style="cursor: pointer;">
            <label class="form-check-label small fw-bold text-dark ms-2" for="colChk_${col.id}" style="cursor: pointer;">
                ${col.label}
            </label>
        `;
        container.appendChild(div);
    });

    // Bind checkbox toggles
    document.querySelectorAll(".column-toggle-chk").forEach(chk => {
        chk.addEventListener("change", (e) => {
            const colId = e.target.getAttribute("data-col-id");
            const targetCol = activeColumns.find(c => c.id === colId);
            if (targetCol) {
                targetCol.visible = e.target.checked;
                applyFiltersAndRender();
            }
        });
    });
}

function handleAddCustomColumn() {
    const select = document.getElementById("customColumnSelect");
    const val = select.value;
    if (!val) {
        alert("Please select an available LLR data field from the dropdown first.");
        return;
    }

    if (activeColumns.some(c => c.id === val)) {
        alert("This column is already included in your layout viewports.");
        return;
    }

    const labelText = select.options[select.selectedIndex].text;
    activeColumns.push({ id: val, label: labelText, visible: true });
    
    buildColumnConfigModalUI();
    applyFiltersAndRender();
    select.selectedIndex = 0;
}

// 5. Filtering & Rendering Engine
function applyFiltersAndRender() {
    const filterMode = document.getElementById("filterTypeDropdown")?.value || "ALL";
    const targetDateVal = document.getElementById("filterTargetDate")?.value || "";
    const startDateVal = document.getElementById("filterStartDate")?.value || "";
    const endDateVal = document.getElementById("filterEndDate")?.value || "";
    const vehicleClassVal = document.getElementById("filterVehicleClass")?.value || "ALL";
    const searchQuery = (document.getElementById("liveSearchQuery")?.value || "").toLowerCase();
    const hideDlIssued = document.getElementById("toggleDlIssuedVisibility")?.checked || false;

    const today = new Date();
    today.setHours(0,0,0,0);

    const filtered = masterPrintCache.filter(row => {
        // 1. Hide DL Issued filter
        if (hideDlIssued && row.dl_issued === "Yes") return false;

        // 2. Live Search Filter
        if (searchQuery) {
            const matches = 
                (row.llr_number && row.llr_number.toLowerCase().includes(searchQuery)) ||
                (row.name && row.name.toLowerCase().includes(searchQuery)) ||
                (row.mobile_number && row.mobile_number.toLowerCase().includes(searchQuery));
            if (!matches) return false;
        }

        // 3. Vehicle Class Filter
        if (vehicleClassVal !== "ALL") {
            const rClass = (row.vehicle_class || "").toUpperCase();
            if (vehicleClassVal === "COMBINED") {
                if (!rClass.includes("MCWOG") && !rClass.includes("MCWG") && !rClass.includes("LMV")) return false;
            } else {
                if (rClass !== vehicleClassVal) return false;
            }
        }

        // 4. Date Mode Filter
        const issueParts = (row.issue_date || "").split("-");
        let issueDateISO = "";
        let issueDateObj = null;
        if (issueParts.length === 3) {
            issueDateISO = `${issueParts[2]}-${issueParts[1]}-${issueParts[0]}`;
            issueDateObj = new Date(issueDateISO);
        }

        if (filterMode === "SINGLE_DATE" && targetDateVal) {
            if (issueDateISO !== targetDateVal) return false;
        } else if (filterMode === "CUSTOM_RANGE") {
            if (startDateVal && issueDateISO < startDateVal) return false;
            if (endDateVal && issueDateISO > endDateVal) return false;
        } else if (filterMode === "ELIMINATED_31DAYS") {
            if (!issueDateObj || isNaN(issueDateObj)) return false;
            const diffDays = (today - issueDateObj) / (1000 * 60 * 60 * 24);
            if (diffDays < 31) return false;
        }

        return true;
    });

    renderPrintTable(filtered);
}

// 6. Table UI Rendering
function renderPrintTable(records) {
    const thead = document.getElementById("tableHeaderSelectors");
    const tbody = document.getElementById("printTableBody");
    const previewTitle = document.getElementById("previewTitle");

    if (!thead || !tbody) return;

    const visibleCols = activeColumns.filter(c => c.visible);

    if (previewTitle) {
        previewTitle.innerHTML = `<i class="bi bi-eye-fill"></i> Operational Print Manifest Preview <span class="badge bg-light text-dark ms-2" style="font-size: 0.75rem;">${records.length} Entries</span>`;
    }

    // Build Header
    let headerHTML = `<tr><th class="ps-4" style="width: 50px;">#</th>`;
    visibleCols.forEach(col => {
        headerHTML += `<th>${col.label}</th>`;
    });
    headerHTML += `</tr>`;
    thead.innerHTML = headerHTML;

    // Build Body
    tbody.innerHTML = "";
    if (records.length === 0) {
        tbody.innerHTML = `<tr><td colspan="100" class="text-center py-5 text-muted fw-semibold small">No records found matching current print manifest filters.</td></tr>`;
        return;
    }

    records.forEach((row, idx) => {
        const tr = document.createElement("tr");
        let rowHTML = `<td class="ps-4 text-muted small fw-medium">${idx + 1}</td>`;

        visibleCols.forEach(col => {
            let val = row[col.id] || "-";
            if (col.id === "llr_number") {
                rowHTML += `<td class="font-monospace fw-bold text-dark">${val}</td>`;
            } else if (col.id === "dl_issued") {
                const isYes = val === "Yes";
                rowHTML += `<td><span class="badge ${isYes ? 'bg-success bg-opacity-10 text-success border border-success' : 'bg-warning bg-opacity-10 text-warning border border-warning'} px-2 py-1">${val}</span></td>`;
            } else if (col.id === "vehicle_class") {
                rowHTML += `<td><span class="badge bg-light text-dark border px-2 py-1">${val}</span></td>`;
            } else {
                rowHTML += `<td>${val}</td>`;
            }
        });

        tr.innerHTML = rowHTML;
        tbody.appendChild(tr);
    });
}