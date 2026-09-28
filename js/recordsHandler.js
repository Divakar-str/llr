// js/recordsHandler.js - Advanced Sorting, Filtering, Quick DL Editing & Professional UI Alignment
document.addEventListener("DOMContentLoaded", () => {
    fetchAndRecordWithLoader();

    // Event Listeners
    const refreshBtn = document.getElementById("refreshDataBtn");
    if (refreshBtn) refreshBtn.addEventListener("click", fetchAndRecordWithLoader);

    const searchInput = document.getElementById("tableSearchInput");
    if (searchInput) searchInput.addEventListener("input", () => { currentPage = 1; filterTableRecords(); });

    const statusFilter = document.getElementById("filterDlStatus");
    if (statusFilter) statusFilter.addEventListener("change", () => { currentPage = 1; filterTableRecords(); });

    const startDateInput = document.getElementById("filterStartDate");
    const endDateInput = document.getElementById("filterEndDate");
    if (startDateInput) startDateInput.addEventListener("change", () => { resetTodayButtonState(); currentPage = 1; filterTableRecords(); });
    if (endDateInput) endDateInput.addEventListener("change", () => { resetTodayButtonState(); currentPage = 1; filterTableRecords(); });

    injectTodayFilterButton();

    // Form Submissions
    const manualForm = document.getElementById("manualInsertForm");
    if (manualForm) manualForm.addEventListener("submit", handleManualInsert);

    const editForm = document.getElementById("modalEditForm");
    if (editForm) editForm.addEventListener("submit", handleModalEditSubmit);

    const quickForm = document.getElementById("quickDlForm");
    if (quickForm) quickForm.addEventListener("submit", handleQuickDlSubmit);
});

let globalRecordsCache = [];
let filteredRecordsCache = [];
let isTodayFilterActive = false;
let currentViewedRecord = null;
let currentPage = 1;
const pageSize = 10;

// Sorting State Tracker
let sortColumn = "llr_number";
let sortDirection = "desc";

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

// 1. Fetch Records
async function fetchAndRecordWithLoader() {
    const tbody = document.getElementById("recordsTableBody");
    const badge = document.getElementById("recordCountBadge");

    if (tbody) {
        tbody.innerHTML = `
            <tr>
                <td colspan="10" class="text-center py-5">
                    <div class="spinner-border text-primary" role="status">
                        <span class="visually-hidden">Loading...</span>
                    </div>
                    <p class="text-muted small mt-2 fw-medium">Syncing database records...</p>
                </td>
            </tr>
        `;
    }
    if (badge) badge.textContent = "Syncing...";

    try {
        const response = await fetch(`${ENV.SHEET_API_URL}?action=readAll`, {
            headers: getAuthHeaders()
        });

        if (response.status === 401) {
            showCustomAlert("Session expired or unauthorized. Redirecting to login...", "danger");
            setTimeout(() => window.location.href = "login.html", 1500);
            return;
        }

        if (!response.ok) throw new Error(`Server returned status: ${response.status}`);

        const data = await response.json();
        globalRecordsCache = Array.isArray(data) ? data : (data.data || []);

        filterTableRecords();
        showCustomAlert("Database synchronized successfully!", "success");
    } catch (error) {
        console.error("Fetch Error:", error);
        if (badge) badge.textContent = "Error";
        showCustomAlert("Failed to fetch records: " + error.message, "danger");
        if (tbody) tbody.innerHTML = `<tr><td colspan="10" class="text-center py-4 text-danger">Failed to load data from server.</td></tr>`;
    }
}

// 2. Multi-Column Sorting
function handleSort(columnKey) {
    if (sortColumn === columnKey) {
        sortDirection = sortDirection === "asc" ? "desc" : "asc";
    } else {
        sortColumn = columnKey;
        sortDirection = "asc";
    }

    document.querySelectorAll("th.sortable i").forEach(icon => {
        icon.className = "bi bi-arrow-down-up small ms-1 text-muted";
    });

    const activeIcon = document.getElementById(`sort-${columnKey}`);
    if (activeIcon) {
        activeIcon.className = sortDirection === "asc" 
            ? "bi bi-sort-down-alt small ms-1 text-primary fw-bold" 
            : "bi bi-sort-down small ms-1 text-primary fw-bold";
    }

    applySorting();
    renderTableRows();
}

function applySorting() {
    filteredRecordsCache.sort((a, b) => {
        let valA = a[sortColumn] || "";
        let valB = b[sortColumn] || "";

        if (["issue_date", "expiry_date", "date_of_birth"].includes(sortColumn)) {
            const partsA = valA.split("-");
            const partsB = valB.split("-");
            if (partsA.length === 3) valA = `${partsA[2]}${partsA[1]}${partsA[0]}`;
            if (partsB.length === 3) valB = `${partsB[2]}${partsB[1]}${partsB[0]}`;
        }

        if (typeof valA === "string") valA = valA.toLowerCase();
        if (typeof valB === "string") valB = valB.toLowerCase();

        if (valA < valB) return sortDirection === "asc" ? -1 : 1;
        if (valA > valB) return sortDirection === "asc" ? 1 : -1;
        return 0;
    });
}

// 3. Render Table Rows with Professional Enterprise Layout & 30-Day Eligibility Rule
function renderTableRows() {
    const tbody = document.getElementById("recordsTableBody");
    const badge = document.getElementById("recordCountBadge");
    if (!tbody) return;

    tbody.innerHTML = "";
    if (badge) badge.textContent = `${filteredRecordsCache.length} Active Records`;

    if (filteredRecordsCache.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="10" class="text-center py-5">
                    <div class="py-4">
                        <i class="bi bi-inbox text-muted fs-1 d-block mb-2"></i>
                        <span class="text-secondary fw-medium">No matching registry records found</span>
                    </div>
                </td>
            </tr>
        `;
        updatePaginationNav(0, 0);
        return;
    }

    const totalRecords = filteredRecordsCache.length;
    const totalPages = Math.ceil(totalRecords / pageSize) || 1;
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    const startIdx = (currentPage - 1) * pageSize;
    const endIdx = Math.min(startIdx + pageSize, totalRecords);
    const paginatedItems = filteredRecordsCache.slice(startIdx, endIdx);

    paginatedItems.forEach((row) => {
        const tr = document.createElement("tr");
        tr.ondblclick = () => openViewModal(row);
        tr.style.cursor = "pointer";
        tr.title = "Double-click to open record drawer";

        const isDlIssued = row.dl_issued === "Yes";
        const daysPassed = calculateDaysPassed(row.issue_date);
        const isEligibleForDl = daysPassed >= 30;
        const daysRemaining = 30 - daysPassed;

        tr.innerHTML = `
            <!-- 1. Single-Line LLR Number -->
            <td class="ps-4 text-nowrap">
                <div class="llr-nowrap">
                    <span class="font-monospace fw-bold text-danger" onclick="copyToClipboard('${row.llr_number || ""}')" title="Click to copy LLR" style="cursor: pointer;">
                        ${row.llr_number || "-"}
                    </span>
                   
                </div>
            </td>

            <!-- Applicant Name -->
            <td>
                <div class="fw-semibold text-dark text-nowrap">${row.name || "-"}</div>
                <div class="text-muted" style="font-size: 0.72rem;">${row.relative_type || "Father"}: ${row.relative_name || "-"}</div>
            </td>

            <!-- 2. Bolder Date of Birth -->
            <td class="font-monospace date-highlight">${row.date_of_birth || "-"}</td>

            <!-- Vehicle Class -->
            <td>
                <span class="badge bg-light text-dark border px-2 py-1 font-monospace" style="font-size: 0.72rem;">
                    ${row.vehicle_class || "-"}
                </span>
            </td>

            <!-- Mobile Number -->
            <td>
                <span class="font-monospace text-dark fw-medium text-nowrap" onclick="copyToClipboard('${row.mobile_number || ""}')" title="Click to copy mobile" style="cursor: pointer;">
                    ${row.mobile_number || "-"}
                </span>
            </td>

            <!-- 2. Bolder Issue Date -->
            <td class="font-monospace date-highlight">${row.issue_date || "-"}</td>

            <!-- 2. Bolder Expiry Date -->
            <td class="font-monospace date-highlight">${row.expiry_date || "-"}</td>

            <!-- Status Pill: If <30 days and not issued, quick edit is locked -->
            <td>
                <span class="status-pill ${isDlIssued ? 'status-pill-yes' : 'status-pill-no'} ${isEligibleForDl ? 'cursor-pointer' : ''}" 
                      ${isEligibleForDl ? `onclick='event.stopPropagation(); openQuickDlModal(${JSON.stringify(row).replace(/'/g, "&#39;")})'` : ''}
                      title="${isEligibleForDl ? 'Click to toggle status' : `Eligible in ${daysRemaining} day(s)`}">
                    <i class="bi bi-circle-fill" style="font-size: 0.45rem;"></i>
                    <span>${isDlIssued ? 'Yes' : 'No'}</span>
                     ${!isEligibleForDl && !isDlIssued ? `
                    
                        <span class="eligibility-pill" title="Cannot apply for permanent DL until 30 days complete">
                            <i class="bi bi-clock-history"></i> ${daysRemaining}d
                        </span>
                    
                ` : ''}
                </span>
               
            </td>

            <!-- Remarks -->
            <td>
                <span class="text-truncate d-inline-block text-muted" style="max-width: 140px; font-size: 0.75rem;" title="${row.remarks || ""}">
                    ${row.remarks && row.remarks !== '-' ? row.remarks : '-'}
                </span>
            </td>

            <!-- Actions: Quick status hidden if < 30 days -->
            <td class="text-end pe-4 text-nowrap" onclick="event.stopPropagation()">
                <div class="d-inline-flex align-items-center gap-1">
                    <button class="btn-action-icon" onclick='openViewModal(${JSON.stringify(row).replace(/'/g, "&#39;")})' title="View Profile">
                        <i class="bi bi-eye"></i>
                    </button>

                    ${isEligibleForDl ? `
                        <button class="btn-action-icon text-warning" onclick='openQuickDlModal(${JSON.stringify(row).replace(/'/g, "&#39;")})' title="Quick Status Update">
                            <i class="bi bi-lightning-charge"></i>
                        </button>
                    ` : ''}

                    <button class="btn-action-icon text-primary" onclick='openEditModal(${JSON.stringify(row).replace(/'/g, "&#39;")})' title="Edit Full Profile">
                        <i class="bi bi-pencil"></i>
                    </button>
                    <button class="btn-action-icon text-danger" onclick="deleteDatabaseRecord('${row.llr_number}')" title="Delete">
                        <i class="bi bi-trash"></i>
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });

    updatePaginationNav(totalRecords, totalPages, startIdx + 1, endIdx);
}

// 4. Quick-Edit DL Modal Controls
function openQuickDlModal(row) {
    document.getElementById("quickLlrNumber").value = row.llr_number || "";
    document.getElementById("quickLlrText").textContent = row.llr_number || "-";
    document.getElementById("quickNameText").textContent = row.name || "Applicant";
    document.getElementById("quickVehicleText").textContent = row.vehicle_class || "LMV";
    document.getElementById("quickDobText").textContent = row.date_of_birth || "-";

    document.getElementById("quickDlIssued").value = row.dl_issued === "Yes" ? "Yes" : "No";
    document.getElementById("quickDlNumber").value = (row.dl_number && row.dl_number !== "-") ? row.dl_number : "";
    document.getElementById("quickApprovedDate").value = formatDateToISO(row.approved_date) || "";

    const modal = new bootstrap.Modal(document.getElementById("quickDlModal"));
    modal.show();
}

function setQuickDateToday() {
    const todayISO = new Date().toISOString().split("T")[0];
    document.getElementById("quickApprovedDate").value = todayISO;
}

async function handleQuickDlSubmit(event) {
    event.preventDefault();
    const submitBtn = document.getElementById("quickSaveBtn");
    const llrNumber = document.getElementById("quickLlrNumber").value;
    const dlIssued = document.getElementById("quickDlIssued").value;
    const dlNumber = document.getElementById("quickDlNumber").value.trim();
    let approvedDate = document.getElementById("quickApprovedDate").value;

    if (approvedDate) approvedDate = formatDateToDisplay(approvedDate);

    const existing = globalRecordsCache.find(r => r.llr_number === llrNumber);
    if (!existing) {
        showCustomAlert("Error: Record not found in local cache.", "danger");
        return;
    }

    const payload = {
        ...existing,
        action: "update",
        dl_issued: dlIssued,
        dl_number: dlNumber || "-",
        approved_date: approvedDate || existing.approved_date || "-"
    };

    submitBtn.disabled = true;
    submitBtn.innerHTML = `<span>Updating...</span> <span class="spinner-border spinner-border-sm"></span>`;

    try {
        const response = await fetch(ENV.SHEET_API_URL, {
            method: "POST",
            headers: getAuthHeaders(),
            body: JSON.stringify(payload)
        });

        const result = await response.json();
        if (result.status === "success") {
            showCustomAlert(`✓ DL status updated for ${existing.name || llrNumber}!`, "success");
            bootstrap.Modal.getInstance(document.getElementById("quickDlModal")).hide();
            fetchAndRecordWithLoader();
        } else {
            throw new Error(result.message || "Failed to update DL status.");
        }
    } catch (err) {
        showCustomAlert("Error saving quick status: " + err.message, "danger");
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `<span>Update Status</span> <i class="bi bi-check2"></i>`;
    }
}

// 5. Combined Search & Filtering
function filterTableRecords() {
    const searchInput = document.getElementById("tableSearchInput");
    const query = searchInput.value.toLowerCase().trim();
    const statusFilter = document.getElementById("filterDlStatus") ? document.getElementById("filterDlStatus").value : "ALL";
    const startDate = document.getElementById("filterStartDate").value;
    const endDate = document.getElementById("filterEndDate").value;

    if (query !== "") {
        searchInput.classList.add("border-primary", "shadow-sm", "bg-light");
    } else {
        searchInput.classList.remove("border-primary", "shadow-sm", "bg-light");
    }

    filteredRecordsCache = globalRecordsCache.filter(row => {
        if (statusFilter !== "ALL") {
            const rowStatus = row.dl_issued === "Yes" ? "Yes" : "No";
            if (rowStatus !== statusFilter) return false;
        }

        const matchesQuery = query === "" || Object.values(row).some(val =>
            val !== null && val !== undefined && String(val).toLowerCase().includes(query)
        );
        if (!matchesQuery) return false;

        if (startDate || endDate) {
            const parts = (row.issue_date || "").split("-");
            if (parts.length === 3) {
                const rowDateISO = `${parts[2]}-${parts[1]}-${parts[0]}`;
                if (startDate && rowDateISO < startDate) return false;
                if (endDate && rowDateISO > endDate) return false;
            }
        }
        return true;
    });

    applySorting();
    currentPage = 1;
    renderTableRows();
}

// Pagination Controls
function updatePaginationNav(total, totalPages, showingStart = 0, showingEnd = 0) {
    const nav = document.getElementById("tablePaginationNav");
    if (!nav) return;

    nav.innerHTML = `
        <span class="small text-muted">Showing <strong>${showingStart}-${showingEnd}</strong> of <strong>${total}</strong> records</span>
        <div class="btn-group btn-group-sm">
            <button class="btn btn-outline-secondary" ${currentPage <= 1 ? 'disabled' : ''} onclick="changePage(${currentPage - 1})">
                <i class="bi bi-chevron-left"></i> Prev
            </button>
            <button class="btn btn-outline-secondary disabled fw-bold text-dark">Page ${currentPage} of ${totalPages || 1}</button>
            <button class="btn btn-outline-secondary" ${currentPage >= totalPages ? 'disabled' : ''} onclick="changePage(${currentPage + 1})">
                Next <i class="bi bi-chevron-right"></i>
            </button>
        </div>
    `;
}

function changePage(targetPage) {
    currentPage = targetPage;
    renderTableRows();
}

function clearDateFilter(elementId) {
    const input = document.getElementById(elementId);
    if (input) {
        input.value = "";
        resetTodayButtonState();
        filterTableRecords();
    }
}

// Clipboard Helper
function copyToClipboard(text) {
    if (!text || text === "-") return;
    navigator.clipboard.writeText(text).then(() => {
        showCustomAlert(`Copied to clipboard: <strong>${text}</strong>`, "info");
    }).catch(err => {
        console.error("Failed to copy:", err);
    });
}

// Export Filtered Records to CSV
function exportTableToCSV(filename) {
    const dataToExport = filteredRecordsCache.length > 0 ? filteredRecordsCache : globalRecordsCache;

    if (!dataToExport || dataToExport.length === 0) {
        showCustomAlert("No records available to export.", "warning");
        return;
    }

    const headers = [
        "llr_number", "name", "date_of_birth", "vehicle_class",
        "mobile_number", "emergency_mobile", "blood_group",
        "relative_type", "relative_name", "issue_date", "expiry_date",
        "approved_date", "dl_issued", "dl_number", "fees_number",
        "fee_amount", "present_address", "permanent_address",
        "identification_mark_1", "identification_mark_2", "remarks"
    ];

    let csvContent = "";
    csvContent += headers.join(",") + "\r\n";

    dataToExport.forEach(row => {
        let rowValues = headers.map(header => {
            let val = row[header] !== null && row[header] !== undefined ? String(row[header]) : "";
            val = val.replace(/"/g, '""');
            if (val.includes(",") || val.includes("\n") || val.includes('"')) {
                val = `"${val}"`;
            }
            return val;
        });
        csvContent += rowValues.join(",") + "\r\n";
    });

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showCustomAlert(`Successfully exported ${dataToExport.length} records to CSV!`, "success");
}

// Date Format Converters
function formatDateToDisplay(isoDate) {
    if (!isoDate) return "";
    const parts = isoDate.split("-");
    if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
    return isoDate;
}

function formatDateToISO(displayDate) {
    if (!displayDate) return "";
    const parts = displayDate.split("-");
    if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
    return displayDate;
}

// Today Filter Injection Button
function injectTodayFilterButton() {
    const filterContainer = document.querySelector("#filterEndDate")?.closest(".row");
    if (filterContainer && !document.getElementById("filterTodayBtn")) {
        const col = document.createElement("div");
        col.className = "col-12 col-md-2 d-flex align-items-end";
        col.innerHTML = `
            <button id="filterTodayBtn" type="button" class="btn btn-outline-dark w-100 py-2 shadow-sm rounded-3 fw-semibold transition-all">
                <i class="bi bi-calendar-check me-1"></i> Today's Issue
            </button>
        `;
        filterContainer.appendChild(col);

        document.getElementById("filterTodayBtn").addEventListener("click", () => {
            const startInput = document.getElementById("filterStartDate");
            const endInput = document.getElementById("filterEndDate");
            const btn = document.getElementById("filterTodayBtn");

            if (!isTodayFilterActive) {
                const todayISO = new Date().toISOString().split("T")[0];
                startInput.value = todayISO;
                endInput.value = todayISO;
                isTodayFilterActive = true;
                btn.className = "btn btn-dark w-100 py-2 shadow-sm rounded-3 fw-semibold active";
                btn.innerHTML = `<i class="bi bi-calendar-check-fill me-1"></i> Showing Today`;
                showCustomAlert("Filtered by today's issue date.", "info");
            } else {
                startInput.value = "";
                endInput.value = "";
                isTodayFilterActive = false;
                btn.className = "btn btn-outline-dark w-100 py-2 shadow-sm rounded-3 fw-semibold";
                btn.innerHTML = `<i class="bi bi-calendar-check me-1"></i> Today's Issue`;
                showCustomAlert("Filter cleared. Showing all records.", "info");
            }
            currentPage = 1;
            filterTableRecords();
        });
    }
}

function resetTodayButtonState() {
    if (isTodayFilterActive) {
        isTodayFilterActive = false;
        const btn = document.getElementById("filterTodayBtn");
        if (btn) {
            btn.className = "btn btn-outline-dark w-100 py-2 shadow-sm rounded-3 fw-semibold";
            btn.innerHTML = `<i class="bi bi-calendar-check me-1"></i> Today's Issue`;
        }
    }
}

// 6. Manual Insert with Validation
async function handleManualInsert(event) {
    event.preventDefault();
    const form = event.target;
    const submitBtn = document.getElementById("saveInsertBtn");

    const mobileVal = document.getElementById("addMobile").value.trim();
    if (mobileVal.length !== 10 || isNaN(mobileVal)) {
        showCustomAlert("Please enter a valid 10-digit mobile number.", "warning");
        return;
    }

    const formData = new FormData(form);
    const payload = Object.fromEntries(formData.entries());

    if (payload.issue_date) payload.issue_date = formatDateToDisplay(payload.issue_date);
    if (payload.expiry_date) payload.expiry_date = formatDateToDisplay(payload.expiry_date);
    if (payload.approved_date) payload.approved_date = formatDateToDisplay(payload.approved_date);
    if (payload.date_of_birth) payload.date_of_birth = formatDateToDisplay(payload.date_of_birth);

    payload.action = "insert";

    submitBtn.disabled = true;
    submitBtn.innerHTML = `<span>Saving...</span> <span class="spinner-border spinner-border-sm"></span>`;

    try {
        const response = await fetch(ENV.SHEET_API_URL, {
            method: "POST",
            headers: getAuthHeaders(),
            body: JSON.stringify(payload)
        });

        const result = await response.json();
        if (result.status === "success") {
            showCustomAlert("✓ New record saved successfully!", "success");
            form.reset();
            fetchAndRecordSwitchToTable();
        } else if (result.status === "duplicate") {
            showCustomAlert(`⚠️ Duplicate Entry: LLR Number '${payload.llr_number}' already exists.`, "warning");
        } else {
            throw new Error(result.message || "Failed to save record.");
        }
    } catch (err) {
        showCustomAlert("Error saving record: " + err.message, "danger");
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `<span>Save New Record</span> <i class="bi bi-cloud-arrow-up-fill"></i>`;
    }
}

// 7. Full Edit Modal Handling
function openEditModal(row) {
    document.getElementById("editLlrNumber").value = row.llr_number || "";
    document.getElementById("editVehicleClass").value = row.vehicle_class || "LMV";
    document.getElementById("editIssueDate").value = formatDateToISO(row.issue_date) || "";
    document.getElementById("editExpiryDate").value = formatDateToISO(row.expiry_date) || "";
    document.getElementById("editApprovedDate").value = formatDateToISO(row.approved_date) || "";
    document.getElementById("editName").value = row.name || "";
    document.getElementById("editDob").value = formatDateToISO(row.date_of_birth) || "";
    document.getElementById("editRelativeType").value = row.relative_type || "Father";
    document.getElementById("editRelativeName").value = row.relative_name || "";
    document.getElementById("editMobile").value = row.mobile_number || "";
    document.getElementById("editEmergencyMobile").value = row.emergency_mobile || "";
    document.getElementById("editBloodGroup").value = row.blood_group || "";
    document.getElementById("editPresentAddress").value = row.present_address || "";
    document.getElementById("editPermanentAddress").value = row.permanent_address || "";
    document.getElementById("editIdMark1").value = row.identification_mark_1 || "";
    document.getElementById("editIdMark2").value = row.identification_mark_2 || "";
    document.getElementById("editDlIssued").value = row.dl_issued || "No";
    document.getElementById("editDlNumber").value = row.dl_number || "";
    document.getElementById("editremarks").value = row.remarks || "";
    document.getElementById("editFeesNumber").value = row.fees_number || "";
    document.getElementById("editFee").value = row.fee_amount || "";

    const modal = new bootstrap.Modal(document.getElementById("editRecordModal"));
    modal.show();
}

async function handleModalEditSubmit(event) {
    event.preventDefault();
    const form = event.target;
    const submitBtn = document.getElementById("saveEditBtn");

    const formData = new FormData(form);
    const payload = Object.fromEntries(formData.entries());

    if (payload.issue_date) payload.issue_date = formatDateToDisplay(payload.issue_date);
    if (payload.expiry_date) payload.expiry_date = formatDateToDisplay(payload.expiry_date);
    if (payload.approved_date) payload.approved_date = formatDateToDisplay(payload.approved_date);
    if (payload.date_of_birth) payload.date_of_birth = formatDateToDisplay(payload.date_of_birth);

    payload.action = "update";

    submitBtn.disabled = true;
    submitBtn.innerHTML = `<span>Updating...</span> <span class="spinner-border spinner-border-sm"></span>`;

    try {
        const response = await fetch(ENV.SHEET_API_URL, {
            method: "POST",
            headers: getAuthHeaders(),
            body: JSON.stringify(payload)
        });

        const result = await response.json();
        if (result.status === "success") {
            showCustomAlert("✓ Record updated successfully!", "success");
            bootstrap.Modal.getInstance(document.getElementById("editRecordModal")).hide();
            fetchAndRecordWithLoader();
        } else {
            throw new Error(result.message || "Failed to update record.");
        }
    } catch (err) {
        showCustomAlert("Error updating record: " + err.message, "danger");
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `<span>Save Changes</span> <i class="bi bi-cloud-arrow-up-fill"></i>`;
    }
}

// 8. Delete Routine
async function deleteDatabaseRecord(llrNumber) {
    if (!confirm(`Are you sure you want to delete LLR record: ${llrNumber}?`)) return;

    try {
        const response = await fetch(ENV.SHEET_API_URL, {
            method: "POST",
            headers: getAuthHeaders(),
            body: JSON.stringify({ action: "delete", llr_number: llrNumber })
        });

        const result = await response.json();
        if (result.status === "success") {
            showCustomAlert("Record successfully deleted.", "success");
            fetchAndRecordWithLoader();
        } else {
            showCustomAlert("Failed to delete: " + result.message, "danger");
        }
    } catch (err) {
        showCustomAlert("Network error during deletion: " + err.message, "danger");
    }
}

// 9. Profile View Modal (Symmetrical Enterprise UI)
function openViewModal(row) {
    currentViewedRecord = row;
    const body = document.getElementById("viewRecordModalBody");
    const isDlIssued = row.dl_issued === "Yes";

    body.innerHTML = `
        <div class="container-fluid p-0">
            <!-- Header Identity Card -->
            <div class="d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center bg-light p-3 rounded-3 border mb-3 gap-2">
                <div>
                    <div class="d-flex align-items-center gap-2 mb-1">
                        <h5 class="fw-bold text-dark mb-0">${row.name || "N/A"}</h5>
                        <span class="badge bg-dark font-monospace">${row.vehicle_class || "N/A"}</span>
                        <span class="status-pill ${isDlIssued ? 'status-pill-yes' : 'status-pill-no'}">
                            <i class="bi bi-circle-fill" style="font-size: 0.45rem;"></i>
                            ${isDlIssued ? 'DL Issued' : 'Pending LLR'}
                        </span>
                    </div>
                    <div class="font-monospace text-muted small">
                        LLR: <span class="text-primary fw-bold">${row.llr_number || "-"}</span> 
                        &bull; Invoice: <span>${row.fees_number || "-"}</span>
                    </div>
                </div>
                <div class="d-flex gap-2">
                    <button type="button" class="btn btn-sm btn-outline-dark" onclick="copyToClipboard('${row.llr_number || ""}')">
                        <i class="bi bi-clipboard me-1"></i> Copy LLR
                    </button>
                    <button type="button" class="btn btn-sm btn-primary px-3 fw-medium" onclick="switchToEditFromView()">
                        <i class="bi bi-pencil-square me-1"></i> Edit Profile
                    </button>
                </div>
            </div>

            <!-- Two-Column Symmetric Spec Sheet -->
            <div class="row g-3">
                <!-- Personal Credentials -->
                <div class="col-12 col-md-6">
                    <div class="p-3 border rounded-3 bg-white h-100 shadow-sm">
                        <div class="d-flex align-items-center gap-2 mb-3 pb-2 border-bottom">
                            <i class="bi bi-person-vcard text-primary"></i>
                            <h6 class="fw-bold text-dark mb-0 small text-uppercase">Applicant Bio</h6>
                        </div>
                        <div class="row g-2">
                            <div class="col-6">
                                <div class="meta-label">Date of Birth</div>
                                <div class="meta-value font-monospace">${row.date_of_birth || "-"}</div>
                            </div>
                            <div class="col-6">
                                <div class="meta-label">Blood Group</div>
                                <div class="meta-value font-monospace text-danger fw-bold">${row.blood_group || "-"}</div>
                            </div>
                            <div class="col-6">
                                <div class="meta-label">Relation</div>
                                <div class="meta-value">${row.relative_type || "Father"}</div>
                            </div>
                            <div class="col-6">
                                <div class="meta-label">Relative Name</div>
                                <div class="meta-value">${row.relative_name || "-"}</div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Contact & Validity Status -->
                <div class="col-12 col-md-6">
                    <div class="p-3 border rounded-3 bg-white h-100 shadow-sm">
                        <div class="d-flex align-items-center gap-2 mb-3 pb-2 border-bottom">
                            <i class="bi bi-shield-check text-success"></i>
                            <h6 class="fw-bold text-dark mb-0 small text-uppercase">License & Contact</h6>
                        </div>
                        <div class="row g-2">
                            <div class="col-6">
                                <div class="meta-label">Primary Mobile</div>
                                <div class="meta-value font-monospace">${row.mobile_number || "-"}</div>
                            </div>
                            <div class="col-6">
                                <div class="meta-label">Emergency Contact</div>
                                <div class="meta-value font-monospace">${row.emergency_mobile || "-"}</div>
                            </div>
                            <div class="col-6">
                                <div class="meta-label">Permanent DL No</div>
                                <div class="meta-value font-monospace text-success fw-bold">${row.dl_number && row.dl_number !== '-' ? row.dl_number : 'Not Generated'}</div>
                            </div>
                            <div class="col-6">
                                <div class="meta-label">Approved Date</div>
                                <div class="meta-value font-monospace">${row.approved_date || "-"}</div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Complete Address Section -->
                <div class="col-12">
                    <div class="p-3 border rounded-3 bg-white shadow-sm">
                        <div class="d-flex align-items-center gap-2 mb-3 pb-2 border-bottom">
                            <i class="bi bi-geo-alt text-dark"></i>
                            <h6 class="fw-bold text-dark mb-0 small text-uppercase">Address & Marks</h6>
                        </div>
                        <div class="row g-2">
                            <div class="col-12 col-md-6">
                                <div class="meta-label">Present Address</div>
                                <div class="meta-value text-muted" style="line-height: 1.45;">${row.present_address || "-"}</div>
                            </div>
                            <div class="col-12 col-md-6">
                                <div class="meta-label">Permanent Address</div>
                                <div class="meta-value text-muted" style="line-height: 1.45;">${row.permanent_address || "-"}</div>
                            </div>
                            <div class="col-12 col-md-6 mt-2">
                                <div class="meta-label">Mark 1</div>
                                <div class="meta-value small">${row.identification_mark_1 || "-"}</div>
                            </div>
                            <div class="col-12 col-md-6 mt-2">
                                <div class="meta-label">Mark 2</div>
                                <div class="meta-value small">${row.identification_mark_2 || "-"}</div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Financial Ledger & Validity -->
                <div class="col-12">
                    <div class="p-3 border rounded-3 bg-light d-flex flex-wrap justify-content-between align-items-center gap-3">
                        <div>
                            <div class="meta-label">Validity Period</div>
                            <div class="meta-value font-monospace small">
                                <span class="text-success">${row.issue_date || "-"}</span> &rarr; <span class="text-danger">${row.expiry_date || "-"}</span>
                            </div>
                        </div>
                        <div>
                            <div class="meta-label">Fees Paid</div>
                            <div class="meta-value font-monospace">₹${row.fee_amount || "0"}</div>
                        </div>
                        <div class="flex-grow-1 text-md-end">
                            <div class="meta-label">Audit Remarks</div>
                            <div class="meta-value small text-muted">${row.remarks && row.remarks !== '-' ? row.remarks : 'No remarks attached'}</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    const modal = new bootstrap.Modal(document.getElementById("viewRecordModal"));
    modal.show();
}

function switchToEditFromView() {
    const viewModalEl = document.getElementById("viewRecordModal");
    const modalInstance = bootstrap.Modal.getInstance(viewModalEl);
    if (modalInstance) modalInstance.hide();

    if (currentViewedRecord) {
        openEditModal(currentViewedRecord);
    }
}

// 10. Centralized Toast Alerts
function showCustomAlert(message, type = "success") {
    let alertContainer = document.getElementById("customAlertContainer");
    if (!alertContainer) {
        alertContainer = document.createElement("div");
        alertContainer.id = "customAlertContainer";
        alertContainer.className = "toast-container position-fixed top-0 start-50 translate-middle-x p-3";
        alertContainer.style.zIndex = "1080";
        document.body.appendChild(alertContainer);
    }

    const alertId = "alert-" + Date.now();
    const bgColors = { success: "bg-dark text-white", danger: "bg-danger text-white", warning: "bg-warning text-dark", info: "bg-dark text-white" };
    const icons = { success: "bi-check-circle-fill text-success", danger: "bi-exclamation-triangle-fill text-white", warning: "bi-exclamation-octagon-fill text-dark", info: "bi-info-circle-fill text-info" };

    const alertEl = document.createElement("div");
    alertEl.id = alertId;
    alertEl.className = `alert ${bgColors[type] || 'bg-dark text-white'} shadow-lg border-0 rounded-4 p-3 d-flex align-items-center gap-3 alert-dismissible fade show`;
    alertEl.innerHTML = `
        <i class="bi ${icons[type] || 'bi-bell-fill'} fs-4"></i>
        <div class="flex-grow-1 small fw-semibold">${message}</div>
        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="alert" aria-label="Close"></button>
    `;

    alertContainer.appendChild(alertEl);

    setTimeout(() => {
        const item = document.getElementById(alertId);
        if (item) {
            item.classList.remove("show");
            setTimeout(() => item.remove(), 300);
        }
    }, 4000);
}

function fetchAndRecordSwitchToTable() {
    fetchAndRecordWithLoader();
    const tableTab = document.getElementById("view-table-tab");
    if (tableTab) new bootstrap.Tab(tableTab).show();
}