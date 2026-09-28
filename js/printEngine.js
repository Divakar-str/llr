// js/printEngine.js - Advanced Print & Manifest Console Engine for Cloudflare D1
document.addEventListener("DOMContentLoaded", () => {
    initPrintConsole();
});

let masterPrintCache = [];
let filteredPrintCache = [];

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

// Pagination State
let currentPage = 1;
let pageSize = 25;

async function initPrintConsole() {
    setupPrintEventListeners();
    buildColumnConfigModalUI();
    await fetchPrintDataRegistry();
}

/**
 * Calculates calendar days elapsed between DD-MM-YYYY issue date and today.
 */
function calculateDaysPassed(issueDateStr) {
    if (!issueDateStr || issueDateStr === "-") return 0;
    const parts = issueDateStr.split("-");
    if (parts.length !== 3) return 0;

    const issueDate = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
    const today = new Date();
    issueDate.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);

    const diffTime = today - issueDate;
    return Math.floor(diffTime / (1000 * 60 * 60 * 24));
}

// 1. Fetch Master Registry Data
async function fetchPrintDataRegistry() {
    const tbody = document.getElementById("printTableBody");
    if (tbody) {
        tbody.innerHTML = `
            <tr>
                <td colspan="100" class="text-center py-5 text-muted small">
                    <div class="spinner-border spinner-border-sm text-dark me-2" role="status"></div>
                    Syncing database entries...
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
            currentPage = 1;
            applyFiltersAndRender();
        });
    }

    const pageSizeSelect = document.getElementById("printPageSizeSelect");
    if (pageSizeSelect) {
        pageSizeSelect.addEventListener("change", (e) => {
            pageSize = e.target.value === "ALL" ? "ALL" : parseInt(e.target.value, 10);
            currentPage = 1;
            renderPrintTable(filteredPrintCache);
        });
    }

    // Print Button Handler: switches temporarily to show ALL items so print is complete
    const triggerPrintBtn = document.getElementById("triggerPrintBtn");
    if (triggerPrintBtn) {
        triggerPrintBtn.addEventListener("click", () => {
            document.getElementById("lblPrintTimestamp").textContent = new Date().toLocaleString([], {
                year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
            });
            document.getElementById("lblPrintTotalCount").textContent = filteredPrintCache.length;

            const previousPageSize = pageSize;
            pageSize = "ALL";
            renderPrintTable(filteredPrintCache);

            window.print();

            pageSize = previousPageSize;
            renderPrintTable(filteredPrintCache);
        });
    }

    const liveSearch = document.getElementById("liveSearchQuery");
    const vehicleClassSelect = document.getElementById("filterVehicleClass");
    const toggleDl = document.getElementById("toggleDlIssuedVisibility");
    const targetDate = document.getElementById("filterTargetDate");
    const startDate = document.getElementById("filterStartDate");
    const endDate = document.getElementById("filterEndDate");

    [liveSearch, vehicleClassSelect, toggleDl, targetDate, startDate, endDate].forEach(el => {
        if (el) {
            el.addEventListener("input", () => {
                currentPage = 1;
                applyFiltersAndRender();
            });
            el.addEventListener("change", () => {
                currentPage = 1;
                applyFiltersAndRender();
            });
        }
    });

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
    activeColumns.forEach((col) => {
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

    document.querySelectorAll(".column-toggle-chk").forEach(chk => {
        chk.addEventListener("change", (e) => {
            const colId = e.target.getAttribute("data-col-id");
            const targetCol = activeColumns.find(c => c.id === colId);
            if (targetCol) {
                targetCol.visible = e.target.checked;
                renderPrintTable(filteredPrintCache);
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
        alert("This column is already included in your layout.");
        return;
    }

    const labelText = select.options[select.selectedIndex].text;
    activeColumns.push({ id: val, label: labelText, visible: true });

    buildColumnConfigModalUI();
    renderPrintTable(filteredPrintCache);
    select.selectedIndex = 0;
}

// 5. Accurate All-Fields Filtering Engine
function applyFiltersAndRender() {
    const filterMode = document.getElementById("filterTypeDropdown")?.value || "ALL";
    const targetDateVal = document.getElementById("filterTargetDate")?.value || "";
    const startDateVal = document.getElementById("filterStartDate")?.value || "";
    const endDateVal = document.getElementById("filterEndDate")?.value || "";
    const vehicleClassVal = document.getElementById("filterVehicleClass")?.value || "ALL";
    const rawSearch = (document.getElementById("liveSearchQuery")?.value || "").toLowerCase().trim();
    const hideDlIssued = document.getElementById("toggleDlIssuedVisibility")?.checked || false;

    filteredPrintCache = masterPrintCache.filter(row => {
        // 1. Hide DL Issued filter
        if (hideDlIssued && row.dl_issued === "Yes") return false;

        // 2. Accurate Search Across ALL Fields
        if (rawSearch) {
            const tokens = rawSearch.split(/\s+/);
            const concatenatedRowData = Object.values(row)
                .filter(v => v !== null && v !== undefined)
                .map(v => String(v).toLowerCase())
                .join(" ");

            const match = tokens.every(t => concatenatedRowData.includes(t));
            if (!match) return false;
        }

        // 3. Vehicle Classification Filter
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
        if (issueParts.length === 3) {
            issueDateISO = `${issueParts[2]}-${issueParts[1]}-${issueParts[0]}`;
        }

        if (filterMode === "SINGLE_DATE" && targetDateVal) {
            if (issueDateISO !== targetDateVal) return false;
        } else if (filterMode === "CUSTOM_RANGE") {
            if (startDateVal && issueDateISO < startDateVal) return false;
            if (endDateVal && issueDateISO > endDateVal) return false;
        } else if (filterMode === "ELIMINATED_31DAYS") {
            const daysPassed = calculateDaysPassed(row.issue_date);
            if (daysPassed < 30) return false;
        }

        return true;
    });

    renderPrintTable(filteredPrintCache);
}

// 6. Table UI Rendering with DataTables-style Pagination
function renderPrintTable(records) {
    const thead = document.getElementById("tableHeaderSelectors");
    const tbody = document.getElementById("printTableBody");
    const previewTitle = document.getElementById("previewTitle");

    if (!thead || !tbody) return;

    const visibleCols = activeColumns.filter(c => c.visible);

    if (previewTitle) {
        previewTitle.innerHTML = `<i class="bi bi-eye-fill"></i> Operational Print Manifest Preview <span class="badge bg-light text-dark ms-2 font-monospace" style="font-size: 0.75rem;">${records.length} Entries</span>`;
    }

    // Build Table Header
    let headerHTML = `<tr><th class="ps-3" style="width: 45px;">#</th>`;
    visibleCols.forEach(col => {
        headerHTML += `<th class="text-nowrap">${col.label}</th>`;
    });
    headerHTML += `</tr>`;
    thead.innerHTML = headerHTML;

    tbody.innerHTML = "";
    if (records.length === 0) {
        tbody.innerHTML = `<tr><td colspan="100" class="text-center py-5 text-muted fw-semibold small">No records found matching current manifest filters.</td></tr>`;
        updatePrintPagination(0, 0, 0);
        return;
    }

    // Pagination Slicing
    const totalRecords = records.length;
    let paginatedItems = records;
    let startIdx = 0;
    let endIdx = totalRecords;

    if (pageSize !== "ALL") {
        const totalPages = Math.ceil(totalRecords / pageSize) || 1;
        if (currentPage > totalPages) currentPage = totalPages;
        if (currentPage < 1) currentPage = 1;

        startIdx = (currentPage - 1) * pageSize;
        endIdx = Math.min(startIdx + pageSize, totalRecords);
        paginatedItems = records.slice(startIdx, endIdx);
        updatePrintPagination(totalRecords, totalPages, startIdx + 1, endIdx);
    } else {
        updatePrintPagination(totalRecords, 1, 1, totalRecords);
    }

    // Build Table Rows
    paginatedItems.forEach((row, idx) => {
        const tr = document.createElement("tr");
        let rowHTML = `<td class="ps-3 text-muted small fw-medium">${startIdx + idx + 1}</td>`;

        visibleCols.forEach(col => {
            let val = row[col.id] || "-";

            if (col.id === "llr_number") {
                rowHTML += `
                    <td class="text-nowrap">
                        <div class="llr-nowrap">
                            <span class="font-monospace fw-bold text-primary" onclick="copyToClipboard('${val}')" title="Click to copy LLR" style="cursor: pointer;">
                                ${val}
                            </span>
                        
                        </div>
                    </td>
                `;
            } else if (col.id === "name") {
                rowHTML += `<td class="fw-semibold text-dark text-nowrap">${val}</td>`;
            } else if (["date_of_birth", "issue_date", "expiry_date"].includes(col.id)) {
                rowHTML += `<td class="font-monospace date-highlight">${val}</td>`;
            } else if (col.id === "dl_issued") {
                const isYes = val === "Yes";
                rowHTML += `
                    <td>
                        <span class="status-pill ${isYes ? 'status-pill-yes' : 'status-pill-no'}">
                            <span>${val}</span>
                        </span>
                    </td>
                `;
            } else if (col.id === "vehicle_class") {
                rowHTML += `<td><span class="badge bg-light text-dark border px-2 py-1 font-monospace" style="font-size: 0.72rem;">${val}</span></td>`;
            } else if (col.id === "mobile_number") {
                rowHTML += `
                    <td>
                        <span class="font-monospace text-dark fw-medium text-nowrap" onclick="copyToClipboard('${val}')" style="cursor: pointer;">
                            ${val}
                        </span>
                    </td>
                `;
            } else {
                rowHTML += `<td>${val}</td>`;
            }
        });

        tr.innerHTML = rowHTML;
        tbody.appendChild(tr);
    });
}

// 7. Pagination Controls
function updatePrintPagination(totalRecords, totalPages, showingStart = 0, showingEnd = 0) {
    const infoTop = document.getElementById("pageRecordsInfoTop");
    const infoBottom = document.getElementById("pageRecordsInfoBottom");
    const btnGroup = document.getElementById("paginationBtnGroup");

    const infoString = `Showing <strong>${showingStart}-${showingEnd}</strong> of <strong>${totalRecords}</strong> entries`;
    if (infoTop) infoTop.innerHTML = infoString;
    if (infoBottom) infoBottom.innerHTML = infoString;
    if (!btnGroup) return;

    btnGroup.innerHTML = "";
    if (totalRecords === 0 || pageSize === "ALL") return;

    // Previous Button
    const prevBtn = document.createElement("button");
    prevBtn.className = "btn btn-outline-secondary";
    prevBtn.disabled = currentPage <= 1;
    prevBtn.innerHTML = `<i class="bi bi-chevron-left"></i> Prev`;
    prevBtn.onclick = () => { currentPage--; renderPrintTable(filteredPrintCache); };
    btnGroup.appendChild(prevBtn);

    // Page Display
    const pageBtn = document.createElement("button");
    pageBtn.className = "btn btn-outline-secondary disabled fw-bold text-dark";
    pageBtn.textContent = `Page ${currentPage} of ${totalPages || 1}`;
    btnGroup.appendChild(pageBtn);

    // Next Button
    const nextBtn = document.createElement("button");
    nextBtn.className = "btn btn-outline-secondary";
    nextBtn.disabled = currentPage >= totalPages;
    nextBtn.innerHTML = `Next <i class="bi bi-chevron-right"></i>`;
    nextBtn.onclick = () => { currentPage++; renderPrintTable(filteredPrintCache); };
    btnGroup.appendChild(nextBtn);
}

// Clipboard Helper
function copyToClipboard(text) {
    if (!text || text === "-") return;
    navigator.clipboard.writeText(text).then(() => {
        console.log(`Copied: ${text}`);
    });
}