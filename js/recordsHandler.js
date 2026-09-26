// js/recordsHandler.js - Ultimate Edition with Pagination, Global Search, CSV Export & Date Clearers
document.addEventListener("DOMContentLoaded", () => {
    fetchAndRecordWithLoader();

    // Event Listeners
    const refreshBtn = document.getElementById("refreshDataBtn");
    if (refreshBtn) refreshBtn.addEventListener("click", fetchAndRecordWithLoader);

    const searchInput = document.getElementById("tableSearchInput");
    if (searchInput) searchInput.addEventListener("input", () => { currentPage = 1; filterTableRecords(); });

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
});

let globalRecordsCache = [];
let filteredRecordsCache = [];
let isTodayFilterActive = false;
let currentViewedRecord = null;
let currentPage = 1;
const pageSize = 10;

// 1. Fetch Records & Maintain Active Filters
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

// 2. Render Table Rows with Pagination & Copiable Fields
function renderTableRows() {
    const tbody = document.getElementById("recordsTableBody");
    const badge = document.getElementById("recordCountBadge");
    if (!tbody) return;

    tbody.innerHTML = "";
    if (badge) badge.textContent = `${filteredRecordsCache.length} Records Found`;

    if (filteredRecordsCache.length === 0) {
        tbody.innerHTML = `<tr><td colspan="10" class="text-center py-5 text-muted fw-semibold">No records found matching criteria.</td></tr>`;
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
        tr.title = "Double-click to view full profile";

        tr.innerHTML = `
            <td class="ps-4 fw-bold font-monospace text-primary">
                <span onclick="copyToClipboard('${row.llr_number || ""}')" title="Click to copy LLR" style="cursor: pointer;">
                    ${row.llr_number || "-"} <i class="bi bi-clipboard small text-muted"></i>
                </span>
            </td>
            <td class="fw-semibold text-dark">${row.name || "-"}</td>
            <td>
                <span onclick="copyToClipboard('${row.date_of_birth || ""}')" title="Click to copy DOB" style="cursor: pointer;">
                    ${row.date_of_birth || "-"} <i class="bi bi-clipboard small text-muted"></i>
                </span>
            </td>
            <td><span class="badge bg-light text-dark border px-2 py-1">${row.vehicle_class || "-"}</span></td>
            <td class="font-monospace">
                <span onclick="copyToClipboard('${row.mobile_number || ""}')" title="Click to copy Mobile" style="cursor: pointer;">
                    ${row.mobile_number || "-"} <i class="bi bi-clipboard small text-muted"></i>
                </span>
            </td>
            <td>${row.issue_date || "-"}</td>
            <td>${row.expiry_date || "-"}</td>
            <td>
                <span class="badge ${row.dl_issued === 'Yes' ? 'bg-success bg-opacity-10 text-success border border-success' : 'bg-warning bg-opacity-10 text-warning border border-warning'} px-2 py-1">
                    ${row.dl_issued || 'No'}
                </span>
            </td>
            <td>${row.remarks && row.remarks !== '-' ? row.remarks : '<span class="text-muted">-</span>'}</td>
            <td class="text-center pe-4" onclick="event.stopPropagation()">
                <div class="btn-group btn-group-sm shadow-sm">
                    <button class="btn btn-white border text-dark" onclick='openViewModal(${JSON.stringify(row).replace(/'/g, "&#39;")})' title="View Profile"><i class="bi bi-eye-fill"></i></button>
                    <button class="btn btn-white border text-primary" onclick='openEditModal(${JSON.stringify(row).replace(/'/g, "&#39;")})' title="Edit Record"><i class="bi bi-pencil-fill"></i></button>
                    <button class="btn btn-white border text-danger" onclick="deleteDatabaseRecord('${row.llr_number}')" title="Delete Record"><i class="bi bi-trash-fill"></i></button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });

    updatePaginationNav(totalRecords, totalPages, startIdx + 1, endIdx);
}

// Update Pagination Footer UI & Controls
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

// 3. Global Search Across ALL Columns & Active State Highlight
function filterTableRecords() {
    const searchInput = document.getElementById("tableSearchInput");
    const query = searchInput.value.toLowerCase().trim();
    const startDate = document.getElementById("filterStartDate").value;
    const endDate = document.getElementById("filterEndDate").value;

    if (query !== "") {
        searchInput.classList.add("border-primary", "shadow-sm", "bg-light");
    } else {
        searchInput.classList.remove("border-primary", "shadow-sm", "bg-light");
    }

    filteredRecordsCache = globalRecordsCache.filter(row => {
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

    currentPage = 1;
    renderTableRows();
}

// Clear individual date filter helper
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

// Modern Toggleable "Today's Issue" Filter Button
function injectTodayFilterButton() {
    const filterContainer = document.querySelector("#filterEndDate")?.closest(".row");
    if (filterContainer && !document.getElementById("filterTodayBtn")) {
        const col = document.createElement("div");
        col.className = "col-12 col-md-2 d-flex align-items-end";
        col.innerHTML = `
            <button id="filterTodayBtn" type="button" class="btn btn-outline-dark w-100 py-2.5 shadow-sm rounded-pill fw-semibold transition-all">
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
                btn.className = "btn btn-dark w-100 py-2.5 shadow-sm rounded-pill fw-semibold active shadow";
                btn.innerHTML = `<i class="bi bi-calendar-check-fill me-1"></i> Showing Today`;
                showCustomAlert("Filtered by today's issue date.", "info");
            } else {
                startInput.value = "";
                endInput.value = "";
                isTodayFilterActive = false;
                btn.className = "btn btn-outline-dark w-100 py-2.5 shadow-sm rounded-pill fw-semibold";
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
            btn.className = "btn btn-outline-dark w-100 py-2.5 shadow-sm rounded-pill fw-semibold";
            btn.innerHTML = `<i class="bi bi-calendar-check me-1"></i> Today's Issue`;
        }
    }
}

// 4. Manual Insert with Validation
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

// 5. Edit Modal Handling
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

// 6. Delete Routine
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

// 7. Profile View Modal
function openViewModal(row) {
    currentViewedRecord = row;
    const body = document.getElementById("viewRecordModalBody");

    body.innerHTML = `
        <div class="container-fluid p-0">
            <div class="d-flex justify-content-between align-items-center bg-light p-3 rounded-4 border mb-3">
                <div>
                    <h5 class="fw-bold text-dark mb-0"><i class="bi bi-person-circle text-primary me-2"></i> ${row.name || "N/A"}</h5>
                    <span class="text-muted small font-monospace">LLR: ${row.llr_number || "N/A"}</span>
                </div>
                <button type="button" class="btn btn-primary px-4 rounded-pill fw-semibold shadow-sm" onclick="switchToEditFromView()">
                    <i class="bi bi-pencil-square me-1"></i> Edit Profile
                </button>
            </div>
            <div class="row g-3">
                <div class="col-12 col-md-6">
                    <div class="p-3 border rounded-3 bg-white h-100">
                        <h6 class="text-muted small fw-bold text-uppercase mb-2"><i class="bi bi-info-circle me-1"></i> General Details</h6>
                        <p class="mb-1"><strong>DOB:</strong> ${row.date_of_birth || "-"}</p>
                        <p class="mb-1"><strong>Vehicle Class:</strong> <span class="badge bg-secondary">${row.vehicle_class || "-"}</span></p>
                        <p class="mb-1"><strong>Blood Group:</strong> <span class="text-danger fw-bold">${row.blood_group || "-"}</span></p>
                        <p class="mb-0"><strong>Relative:</strong> ${row.relative_type || "Father"}: ${row.relative_name || "-"}</p>
                    </div>
                </div>
                <div class="col-12 col-md-6">
                    <div class="p-3 border rounded-3 bg-white h-100">
                        <h6 class="text-muted small fw-bold text-uppercase mb-2"><i class="bi bi-telephone me-1"></i> Contact Information</h6>
                        <p class="mb-1"><strong>Mobile:</strong> <span class="font-monospace">${row.mobile_number || "-"}</span></p>
                        <p class="mb-1"><strong>Emergency:</strong> <span class="font-monospace">${row.emergency_mobile || "-"}</span></p>
                        <p class="mb-1"><strong>DL Issued:</strong> <span class="badge ${row.dl_issued === 'Yes' ? 'bg-success' : 'bg-warning text-dark'}">${row.dl_issued || "No"}</span></p>
                        <p class="mb-0"><strong>DL Number:</strong> <span class="font-monospace">${row.dl_number || "-"}</span></p>
                    </div>
                </div>
                <div class="col-12">
                    <div class="p-3 border rounded-3 bg-white">
                        <h6 class="text-muted small fw-bold text-uppercase mb-2"><i class="bi bi-geo-alt me-1"></i> Addresses & Marks</h6>
                        <p class="mb-1"><strong>Present Address:</strong> ${row.present_address || "-"}</p>
                        <p class="mb-1"><strong>Permanent Address:</strong> ${row.permanent_address || "-"}</p>
                        <p class="mb-1"><strong>Identification Mark 1:</strong> ${row.identification_mark_1 || "-"}</p>
                        <p class="mb-0"><strong>Identification Mark 2:</strong> ${row.identification_mark_2 || "-"}</p>
                    </div>
                </div>
                <div class="col-12">
                    <div class="p-3 border rounded-3 bg-white">
                        <h6 class="text-muted small fw-bold text-uppercase mb-2"><i class="bi bi-receipt me-1"></i> Financials & Validity</h6>
                        <p class="mb-1"><strong>Fee Reference:</strong> ${row.fees_number || "-"} | ₹${row.fee_amount || "-"}</p>
                        <p class="mb-1"><strong>Validity:</strong> From ${row.issue_date || "-"} To ${row.expiry_date || "-"}</p>
                        <p class="mb-0"><strong>Remarks:</strong> ${row.remarks || "-"}</p>
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

// 8. Custom Toast Alert Notifications
function showCustomAlert(message, type = "success") {
    let alertContainer = document.getElementById("customAlertContainer");
    if (!alertContainer) {
        alertContainer = document.createElement("div");
        alertContainer.id = "customAlertContainer";
        alertContainer.style.cssText = "position: fixed; top: 20px; right: 20px; z-index: 1055; max-width: 380px;";
        document.body.appendChild(alertContainer);
    }

    const alertId = "alert-" + Date.now();
    const bgColors = { success: "bg-success", danger: "bg-danger", warning: "bg-warning text-dark", info: "bg-dark text-white" };
    const icons = { success: "bi-check-circle-fill", danger: "bi-exclamation-triangle-fill", warning: "bi-exclamation-octagon-fill", info: "bi-info-circle-fill" };

    const alertEl = document.createElement("div");
    alertEl.id = alertId;
    alertEl.className = `alert ${bgColors[type] || 'bg-dark'} text-white shadow-lg border-0 rounded-4 p-3 d-flex align-items-center gap-3 alert-dismissible fade show`;
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