// js/recordsHandler.js - Clean, Zero-Lag Registry Handler with Dynamic Filters & Edge-Case Fixes
document.addEventListener("DOMContentLoaded", () => {
    fetchAndRecordWithLoader();

    const refreshBtn = document.getElementById("refreshDataBtn");
    if (refreshBtn) refreshBtn.addEventListener("click", fetchAndRecordWithLoader);

    const searchInput = document.getElementById("tableSearchInput");
    let searchDebounceTimer;
    if (searchInput) {
        searchInput.addEventListener("input", () => {
            clearTimeout(searchDebounceTimer);
            searchDebounceTimer = setTimeout(filterTableRecords, 180);
        });
    }

    const classFilter = document.getElementById("filterVehicleClass");
    if (classFilter) classFilter.addEventListener("change", filterTableRecords);

    const yearFilter = document.getElementById("filterIssueYear");
    if (yearFilter) {
        yearFilter.addEventListener("change", () => {
            populateMonthDropdown(yearFilter.value);
            filterTableRecords();
        });
    }

    const monthFilter = document.getElementById("filterIssueMonth");
    if (monthFilter) monthFilter.addEventListener("change", filterTableRecords);

    const statusFilter = document.getElementById("filterDlStatus");
    if (statusFilter) statusFilter.addEventListener("change", filterTableRecords);

    const startDateInput = document.getElementById("filterStartDate");
    const endDateInput = document.getElementById("filterEndDate");
    if (startDateInput) {
        startDateInput.addEventListener("change", () => {
            resetTodayButtonState();
            filterTableRecords();
        });
    }
    if (endDateInput) {
        endDateInput.addEventListener("change", () => {
            resetTodayButtonState();
            filterTableRecords();
        });
    }

    const resetFiltersBtn = document.getElementById("resetAllFiltersBtn");
    if (resetFiltersBtn) resetFiltersBtn.addEventListener("click", resetAllFilters);

    const viewModalBody = document.getElementById("viewRecordModalBody");
    if (viewModalBody) {
        viewModalBody.addEventListener("click", (e) => {
            const copyBtn = e.target.closest("[data-copy-text]");
            if (copyBtn) copyToClipboard(copyBtn.dataset.copyText);
        });
    }

    injectTodayFilterButton();
    setupTableEventDelegation();

    const manualForm = document.getElementById("manualInsertForm");
    if (manualForm) manualForm.addEventListener("submit", handleManualInsert);

    const editForm = document.getElementById("modalEditForm");
    if (editForm) editForm.addEventListener("submit", handleModalEditSubmit);

    const quickForm = document.getElementById("quickDlForm");
    if (quickForm) quickForm.addEventListener("submit", handleQuickDlSubmit);
});

let globalRecordsCache = [];
let recordLookupMap = new Map();
let filteredRecordsCache = [];
let isTodayFilterActive = false;
let currentViewedRecord = null;
let currentPage = 1;
const pageSize = 10;

let sortColumn = "llr_number";
let sortDirection = "desc";

const MONTH_NAMES = {
    "01": "January", "02": "February", "03": "March", "04": "April",
    "05": "May", "06": "June", "07": "July", "08": "August",
    "09": "September", "10": "October", "11": "November", "12": "December"
};

function escapeHtml(value) {
    if (value === null || value === undefined) return "";
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function getLocalTodayISO() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

/**
 * Parses DD-MM-YYYY, DD/MM/YYYY, or YYYY-MM-DD into { year, month, day, iso, ms } or null.
 */
function parseRecordDate(dateStr) {
    if (!dateStr || typeof dateStr !== "string") return null;
    const trimmed = dateStr.trim();
    if (!trimmed || trimmed === "-") return null;

    const sep = trimmed.includes("/") ? "/" : trimmed.includes("-") ? "-" : null;
    if (!sep) return null;

    const parts = trimmed.split(sep);
    if (parts.length !== 3) return null;

    let year, month, day;
    if (parts[0].length === 4) {
        year = parts[0];
        month = parts[1].padStart(2, "0");
        day = parts[2].padStart(2, "0");
    } else if (parts[2].length === 4) {
        day = parts[0].padStart(2, "0");
        month = parts[1].padStart(2, "0");
        year = parts[2];
    } else {
        return null;
    }

    const iso = `${year}-${month}-${day}`;
    const ms = new Date(`${iso}T00:00:00`).getTime();
    if (isNaN(ms)) return null;

    return { year, month, day, iso, ms };
}

function preprocessRecords(rawList) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayMs = today.getTime();

    recordLookupMap.clear();

    const processed = rawList.map((row) => {
        const parsedIssue = parseRecordDate(row.issue_date);
        const parsedExpiry = parseRecordDate(row.expiry_date);
        const parsedDob = parseRecordDate(row.date_of_birth);

        const daysPassed = parsedIssue ? Math.floor((todayMs - parsedIssue.ms) / 86400000) : 0;

        const searchIndex = Object.values(row)
            .filter((v) => v !== null && v !== undefined)
            .join(" ")
            .toLowerCase();

        const enriched = {
            ...row,
            _daysPassed: daysPassed,
            _isEligible: daysPassed >= 30,
            _daysRemaining: Math.max(0, 30 - daysPassed),
            _issueIso: parsedIssue ? parsedIssue.iso : "",
            _issueYear: parsedIssue ? parsedIssue.year : "",
            _issueMonth: parsedIssue ? parsedIssue.month : "",
            _sort_issue_date: parsedIssue ? parsedIssue.iso : "",
            _sort_expiry_date: parsedExpiry ? parsedExpiry.iso : "",
            _sort_date_of_birth: parsedDob ? parsedDob.iso : "",
            _searchIndex: searchIndex
        };

        if (row.llr_number) {
            recordLookupMap.set(String(row.llr_number), enriched);
        }
        return enriched;
    });

    populateDynamicFilterDropdowns(processed);
    return processed;
}

function populateDynamicFilterDropdowns(records) {
    const classSelect = document.getElementById("filterVehicleClass");
    const yearSelect = document.getElementById("filterIssueYear");

    const prevClass = classSelect ? classSelect.value : "ALL";
    const prevYear = yearSelect ? yearSelect.value : "ALL";

    const classes = new Set();
    const years = new Set();

    for (const r of records) {
        if (r.vehicle_class && String(r.vehicle_class).trim() !== "" && r.vehicle_class !== "-") {
            classes.add(String(r.vehicle_class).trim().toUpperCase());
        }
        if (r._issueYear) {
            years.add(r._issueYear);
        }
    }

    if (classSelect) {
        const sortedClasses = Array.from(classes).sort();
        classSelect.innerHTML = `<option value="ALL">All Classes (${sortedClasses.length})</option>`;
        for (const vc of sortedClasses) {
            const safeVc = escapeHtml(vc);
            classSelect.innerHTML += `<option value="${safeVc}">${safeVc}</option>`;
        }
        classSelect.value = sortedClasses.includes(prevClass) ? prevClass : "ALL";
    }

    if (yearSelect) {
        const sortedYears = Array.from(years).sort((a, b) => b.localeCompare(a));
        yearSelect.innerHTML = `<option value="ALL">All Years</option>`;
        for (const yr of sortedYears) {
            const safeYr = escapeHtml(yr);
            yearSelect.innerHTML += `<option value="${safeYr}">${safeYr}</option>`;
        }
        yearSelect.value = sortedYears.includes(prevYear) ? prevYear : "ALL";
    }

    populateMonthDropdown(yearSelect ? yearSelect.value : "ALL");
}

function populateMonthDropdown(selectedYear) {
    const monthSelect = document.getElementById("filterIssueMonth");
    if (!monthSelect) return;

    const prevMonth = monthSelect.value;
    const months = new Set();

    for (const r of globalRecordsCache) {
        if (!r._issueMonth) continue;
        if (selectedYear && selectedYear !== "ALL" && r._issueYear !== selectedYear) continue;
        months.add(r._issueMonth);
    }

    const sortedMonths = Array.from(months).sort();
    monthSelect.innerHTML = `<option value="ALL">All Months</option>`;
    for (const m of sortedMonths) {
        const label = MONTH_NAMES[m] ? `${MONTH_NAMES[m]} (${m})` : m;
        monthSelect.innerHTML += `<option value="${escapeHtml(m)}">${escapeHtml(label)}</option>`;
    }

    monthSelect.value = sortedMonths.includes(prevMonth) ? prevMonth : "ALL";
}

function updateActiveFilterBadge() {
    const badge = document.getElementById("activeFilterCountBadge");
    if (!badge) return;

    let count = 0;
    if ((document.getElementById("filterVehicleClass")?.value || "ALL") !== "ALL") count++;
    if ((document.getElementById("filterIssueYear")?.value || "ALL") !== "ALL") count++;
    if ((document.getElementById("filterIssueMonth")?.value || "ALL") !== "ALL") count++;
    if ((document.getElementById("filterDlStatus")?.value || "ALL") !== "ALL") count++;
    if (document.getElementById("filterStartDate")?.value) count++;
    if (document.getElementById("filterEndDate")?.value) count++;

    if (count > 0) {
        badge.textContent = count;
        badge.classList.remove("d-none");
    } else {
        badge.classList.add("d-none");
    }
}

function resetAllFilters() {
    const classSelect = document.getElementById("filterVehicleClass");
    const yearSelect = document.getElementById("filterIssueYear");
    const monthSelect = document.getElementById("filterIssueMonth");
    const statusSelect = document.getElementById("filterDlStatus");
    const startInput = document.getElementById("filterStartDate");
    const endInput = document.getElementById("filterEndDate");

    if (classSelect) classSelect.value = "ALL";
    if (yearSelect) yearSelect.value = "ALL";
    populateMonthDropdown("ALL");
    if (monthSelect) monthSelect.value = "ALL";
    if (statusSelect) statusSelect.value = "ALL";
    if (startInput) startInput.value = "";
    if (endInput) endInput.value = "";

    resetTodayButtonState();
    filterTableRecords();
    showCustomAlert("All filters cleared.", "info");
}

// 1. Fetch Records
async function fetchAndRecordWithLoader() {
    const tbody = document.getElementById("recordsTableBody");
    const badge = document.getElementById("recordCountBadge");
    const refreshIcon = document.querySelector("#refreshDataBtn i");

    if (refreshIcon) refreshIcon.classList.add("spin-icon");

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
            setTimeout(() => (window.location.href = "login.html"), 1500);
            return;
        }

        if (!response.ok) throw new Error(`Server returned status: ${response.status}`);

        const data = await response.json();
        const rawList = Array.isArray(data) ? data : data.data || [];
        globalRecordsCache = preprocessRecords(rawList);

        filterTableRecords();
        showCustomAlert("Database synchronized successfully!", "success");
    } catch (error) {
        console.error("Fetch Error:", error);
        if (badge) badge.textContent = "Error";
        showCustomAlert("Failed to fetch records: " + escapeHtml(error.message), "danger");
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="10" class="text-center py-4 text-danger">Failed to load data from server.</td></tr>`;
        }
    } finally {
        if (refreshIcon) refreshIcon.classList.remove("spin-icon");
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

    document.querySelectorAll("th.sortable i.sort-indicator").forEach((icon) => {
        icon.className = "bi bi-arrow-down-up small ms-1 text-muted sort-indicator";
    });

    const activeIcon = document.getElementById(`sort-${columnKey}`);
    if (activeIcon) {
        activeIcon.className =
            sortDirection === "asc"
                ? "bi bi-sort-down-alt small ms-1 text-primary fw-bold sort-indicator"
                : "bi bi-sort-down small ms-1 text-primary fw-bold sort-indicator";
    }

    applySorting();
    renderTableRows();
}

function applySorting() {
    const isDateCol = ["issue_date", "expiry_date", "date_of_birth"].includes(sortColumn);
    const sortKey = isDateCol ? `_sort_${sortColumn}` : sortColumn;
    const dir = sortDirection === "asc" ? 1 : -1;

    filteredRecordsCache.sort((a, b) => {
        let valA = a[sortKey] ?? "";
        let valB = b[sortKey] ?? "";

        if (typeof valA === "string") valA = valA.toLowerCase();
        if (typeof valB === "string") valB = valB.toLowerCase();

        if (valA < valB) return -1 * dir;
        if (valA > valB) return 1 * dir;
        return 0;
    });
}

// 3. Event Delegation
function setupTableEventDelegation() {
    const tbody = document.getElementById("recordsTableBody");
    if (!tbody) return;

    tbody.addEventListener("click", (e) => {
        const actionBtn = e.target.closest("[data-action]");
        if (!actionBtn) return;

        e.stopPropagation();
        const action = actionBtn.dataset.action;
        const llr = actionBtn.dataset.llr || "";
        const copyVal = actionBtn.dataset.copy || "";

        if (action === "copy") {
            copyToClipboard(copyVal);
            return;
        }

        const record = recordLookupMap.get(llr);
        if (!record) return;

        if (action === "view") openViewModal(record);
        else if (action === "quick-dl") openQuickDlModal(record);
        else if (action === "edit") openEditModal(record);
        else if (action === "delete") deleteDatabaseRecord(llr);
    });

    tbody.addEventListener("dblclick", (e) => {
        const tr = e.target.closest("tr[data-llr]");
        if (!tr) return;
        const record = recordLookupMap.get(tr.dataset.llr || "");
        if (record) openViewModal(record);
    });
}

// 4. Render Table Rows
function renderTableRows() {
    const tbody = document.getElementById("recordsTableBody");
    const badge = document.getElementById("recordCountBadge");
    if (!tbody) return;

    const totalRecords = filteredRecordsCache.length;
    if (badge) badge.textContent = `${totalRecords} Active Records`;

    if (totalRecords === 0) {
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

    const totalPages = Math.ceil(totalRecords / pageSize) || 1;
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    const startIdx = (currentPage - 1) * pageSize;
    const endIdx = Math.min(startIdx + pageSize, totalRecords);
    const paginatedItems = filteredRecordsCache.slice(startIdx, endIdx);

    const fragment = document.createDocumentFragment();

    for (let i = 0; i < paginatedItems.length; i++) {
        const row = paginatedItems[i];
        const tr = document.createElement("tr");
        const safeLlr = escapeHtml(row.llr_number || "");
        tr.dataset.llr = safeLlr;
        tr.style.cursor = "pointer";
        tr.title = "Double-click to open record drawer";

        const isDlIssued = row.dl_issued === "Yes";
        const isEligibleForDl = row._isEligible;
        const daysRemaining = row._daysRemaining;

        tr.innerHTML = `
            <td class="ps-4 text-nowrap">
                <div class="llr-nowrap">
                    <span class="font-monospace fw-bold text-danger" data-action="copy" data-copy="${safeLlr}" title="Click to copy LLR" style="cursor: pointer;">
                        ${safeLlr || "-"}
                    </span>
                </div>
            </td>

            <td>
                <div class="fw-semibold text-dark text-nowrap">${escapeHtml(row.name) || "-"}</div>
                <div class="text-muted" style="font-size: 0.72rem;">${escapeHtml(row.relative_type) || "Father"}: ${escapeHtml(row.relative_name) || "-"}</div>
            </td>

            <td class="font-monospace date-highlight text-nowrap">${escapeHtml(row.date_of_birth) || "-"}</td>

            <td>
                <span class="badge bg-light text-dark border px-2 py-1 font-monospace" style="font-size: 0.72rem;">
                    ${escapeHtml(row.vehicle_class) || "-"}
                </span>
            </td>

            <td>
                <span class="font-monospace text-dark fw-medium text-nowrap" data-action="copy" data-copy="${escapeHtml(row.mobile_number || "")}" title="Click to copy mobile" style="cursor: pointer;">
                    ${escapeHtml(row.mobile_number) || "-"}
                </span>
            </td>

            <td class="font-monospace date-highlight text-nowrap">${escapeHtml(row.issue_date) || "-"}</td>

            <td class="font-monospace date-highlight text-nowrap">${escapeHtml(row.expiry_date) || "-"}</td>

            <td>
                <span class="status-pill ${isDlIssued ? "status-pill-yes" : "status-pill-no"} ${isEligibleForDl ? "cursor-pointer" : ""}"
                      ${isEligibleForDl ? `data-action="quick-dl" data-llr="${safeLlr}"` : ""}
                      title="${isEligibleForDl ? "Click to toggle status" : `Eligible in ${daysRemaining} day(s)`}">
                    <i class="bi bi-circle-fill" style="font-size: 0.45rem;"></i>
                    <span>${isDlIssued ? "Yes" : "No"}</span>
                    ${
                        !isEligibleForDl && !isDlIssued
                            ? `<span class="eligibility-pill" title="Cannot apply for permanent DL until 30 days complete">
                                   <i class="bi bi-clock-history"></i> ${daysRemaining}d
                               </span>`
                            : ""
                    }
                </span>
            </td>

            <td>
                <span class="text-truncate d-inline-block text-muted" style="max-width: 140px; font-size: 0.75rem;" title="${escapeHtml(row.remarks || "")}">
                    ${row.remarks && row.remarks !== "-" ? escapeHtml(row.remarks) : "-"}
                </span>
            </td>

            <td class="text-end pe-4 text-nowrap">
                <div class="d-inline-flex align-items-center gap-1">
                    <button class="btn-action-icon" data-action="view" data-llr="${safeLlr}" title="View Profile">
                        <i class="bi bi-eye"></i>
                    </button>
                    ${
                        isEligibleForDl
                            ? `<button class="btn-action-icon text-warning" data-action="quick-dl" data-llr="${safeLlr}" title="Quick Status Update">
                                   <i class="bi bi-lightning-charge"></i>
                               </button>`
                            : ""
                    }
                    <button class="btn-action-icon text-primary" data-action="edit" data-llr="${safeLlr}" title="Edit Full Profile">
                        <i class="bi bi-pencil"></i>
                    </button>
                    <button class="btn-action-icon text-danger" data-action="delete" data-llr="${safeLlr}" title="Delete">
                        <i class="bi bi-trash"></i>
                    </button>
                </div>
            </td>
        `;
        fragment.appendChild(tr);
    }

    tbody.replaceChildren(fragment);
    updatePaginationNav(totalRecords, totalPages, startIdx + 1, endIdx);
}

// 5. Quick-Edit DL Modal
function openQuickDlModal(row) {
    document.getElementById("quickLlrNumber").value = row.llr_number || "";
    document.getElementById("quickLlrText").textContent = row.llr_number || "-";
    document.getElementById("quickNameText").textContent = row.name || "Applicant";
    document.getElementById("quickVehicleText").textContent = row.vehicle_class || "LMV";
    document.getElementById("quickDobText").textContent = row.date_of_birth || "-";

    document.getElementById("quickDlIssued").value = row.dl_issued === "Yes" ? "Yes" : "No";
    document.getElementById("quickDlNumber").value = row.dl_number && row.dl_number !== "-" ? row.dl_number : "";
    const parsedApproved = parseRecordDate(row.approved_date);
    document.getElementById("quickApprovedDate").value = parsedApproved ? parsedApproved.iso : "";

    bootstrap.Modal.getOrCreateInstance(document.getElementById("quickDlModal")).show();
}

function setQuickDateToday() {
    document.getElementById("quickApprovedDate").value = getLocalTodayISO();
}

function stripInternalFields(record) {
    const clean = {};
    for (const [key, val] of Object.entries(record)) {
        if (!key.startsWith("_")) clean[key] = val;
    }
    return clean;
}

async function handleQuickDlSubmit(event) {
    event.preventDefault();
    const submitBtn = document.getElementById("quickSaveBtn");
    const llrNumber = document.getElementById("quickLlrNumber").value;
    const dlIssued = document.getElementById("quickDlIssued").value;
    const dlNumber = document.getElementById("quickDlNumber").value.trim();
    let approvedDate = document.getElementById("quickApprovedDate").value;

    if (approvedDate) approvedDate = formatDateToDisplay(approvedDate);

    const existing = recordLookupMap.get(llrNumber);
    if (!existing) {
        showCustomAlert("Error: Record not found in local cache.", "danger");
        return;
    }

    const payload = {
        ...stripInternalFields(existing),
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
            showCustomAlert(`DL status updated for ${escapeHtml(existing.name || llrNumber)}!`, "success");
            bootstrap.Modal.getInstance(document.getElementById("quickDlModal")).hide();
            fetchAndRecordWithLoader();
        } else {
            throw new Error(result.message || "Failed to update DL status.");
        }
    } catch (err) {
        showCustomAlert("Error saving quick status: " + escapeHtml(err.message), "danger");
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `<span>Update Status</span> <i class="bi bi-check2"></i>`;
    }
}

// 6. Combined Search & Filtering
function filterTableRecords() {
    const searchInput = document.getElementById("tableSearchInput");
    const query = searchInput ? searchInput.value.toLowerCase().trim() : "";
    const classFilter = document.getElementById("filterVehicleClass")?.value || "ALL";
    const yearFilter = document.getElementById("filterIssueYear")?.value || "ALL";
    const monthFilter = document.getElementById("filterIssueMonth")?.value || "ALL";
    const statusFilter = document.getElementById("filterDlStatus")?.value || "ALL";
    const startDate = document.getElementById("filterStartDate")?.value || "";
    const endDate = document.getElementById("filterEndDate")?.value || "";

    updateActiveFilterBadge();

    if (searchInput) {
        searchInput.classList.toggle("border-primary", query !== "");
        searchInput.classList.toggle("shadow-sm", query !== "");
        searchInput.classList.toggle("bg-light", query !== "");
    }

    filteredRecordsCache = globalRecordsCache.filter((row) => {
        if (classFilter !== "ALL" && String(row.vehicle_class || "").trim().toUpperCase() !== classFilter) {
            return false;
        }

        if (yearFilter !== "ALL" && row._issueYear !== yearFilter) {
            return false;
        }

        if (monthFilter !== "ALL" && row._issueMonth !== monthFilter) {
            return false;
        }

        if (statusFilter !== "ALL") {
            const rowStatus = row.dl_issued === "Yes" ? "Yes" : "No";
            if (rowStatus !== statusFilter) return false;
        }

        if (query !== "" && !row._searchIndex.includes(query)) {
            return false;
        }

        if ((startDate || endDate) && row._issueIso) {
            if (startDate && row._issueIso < startDate) return false;
            if (endDate && row._issueIso > endDate) return false;
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
            <button class="btn btn-outline-secondary" ${currentPage <= 1 ? "disabled" : ""} onclick="changePage(${currentPage - 1})">
                <i class="bi bi-chevron-left"></i> Prev
            </button>
            <button class="btn btn-outline-secondary disabled fw-bold text-dark">Page ${currentPage} of ${totalPages || 1}</button>
            <button class="btn btn-outline-secondary" ${currentPage >= totalPages ? "disabled" : ""} onclick="changePage(${currentPage + 1})">
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
    navigator.clipboard
        .writeText(text)
        .then(() => {
            showCustomAlert(`Copied to clipboard: <strong>${escapeHtml(text)}</strong>`, "info");
        })
        .catch((err) => console.error("Failed to copy:", err));
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

    const rows = [headers.join(",")];
    for (const row of dataToExport) {
        const line = headers.map((header) => {
            let val = row[header] !== null && row[header] !== undefined ? String(row[header]) : "";
            val = val.replace(/"/g, '""');
            return val.includes(",") || val.includes("\n") || val.includes('"') ? `"${val}"` : val;
        });
        rows.push(line.join(","));
    }

    const blob = new Blob([rows.join("\r\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showCustomAlert(`Successfully exported ${dataToExport.length} records to CSV!`, "success");
}

// Date Format Converters
function formatDateToDisplay(isoDate) {
    if (!isoDate) return "";
    const parts = isoDate.split("-");
    return parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : isoDate;
}

function formatDateToISO(displayDate) {
    const parsed = parseRecordDate(displayDate);
    return parsed ? parsed.iso : "";
}

// Today Filter Button
function injectTodayFilterButton() {
    const slot = document.getElementById("quickFilterSlot");
    if (slot && !document.getElementById("filterTodayBtn")) {
        slot.innerHTML = `
            <button id="filterTodayBtn" type="button" class="btn btn-sm btn-outline-dark px-3 py-1.5 rounded-3 fw-semibold">
                <i class="bi bi-calendar-check me-1"></i> Today's Issue
            </button>
        `;

        document.getElementById("filterTodayBtn").addEventListener("click", () => {
            const startInput = document.getElementById("filterStartDate");
            const endInput = document.getElementById("filterEndDate");
            const btn = document.getElementById("filterTodayBtn");

            if (!isTodayFilterActive) {
                const todayISO = getLocalTodayISO();
                startInput.value = todayISO;
                endInput.value = todayISO;
                isTodayFilterActive = true;
                btn.className = "btn btn-sm btn-dark px-3 py-1.5 rounded-3 fw-semibold active";
                btn.innerHTML = `<i class="bi bi-calendar-check-fill me-1"></i> Showing Today`;
                showCustomAlert("Filtered by today's issue date.", "info");
            } else {
                startInput.value = "";
                endInput.value = "";
                isTodayFilterActive = false;
                btn.className = "btn btn-sm btn-outline-dark px-3 py-1.5 rounded-3 fw-semibold";
                btn.innerHTML = `<i class="bi bi-calendar-check me-1"></i> Today's Issue`;
                showCustomAlert("Filter cleared. Showing all records.", "info");
            }
            filterTableRecords();
        });
    }
}

function resetTodayButtonState() {
    if (isTodayFilterActive) {
        isTodayFilterActive = false;
        const btn = document.getElementById("filterTodayBtn");
        if (btn) {
            btn.className = "btn btn-sm btn-outline-dark px-3 py-1.5 rounded-3 fw-semibold";
            btn.innerHTML = `<i class="bi bi-calendar-check me-1"></i> Today's Issue`;
        }
    }
}

// 7. Manual Insert
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
            showCustomAlert("New record saved successfully!", "success");
            form.reset();
            fetchAndRecordSwitchToTable();
        } else if (result.status === "duplicate") {
            showCustomAlert(`Duplicate Entry: LLR Number '${escapeHtml(payload.llr_number)}' already exists.`, "warning");
        } else {
            throw new Error(result.message || "Failed to save record.");
        }
    } catch (err) {
        showCustomAlert("Error saving record: " + escapeHtml(err.message), "danger");
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `<span>Save New Record</span> <i class="bi bi-cloud-arrow-up-fill ms-1"></i>`;
    }
}

// 8. Full Edit Modal
function openEditModal(row) {
    document.getElementById("editRowIndex").value = row.row_index ?? "";
    document.getElementById("editLlrNumber").value = row.llr_number || "";
    document.getElementById("editVehicleClass").value = row.vehicle_class || "LMV";
    document.getElementById("editIssueDate").value = formatDateToISO(row.issue_date);
    document.getElementById("editExpiryDate").value = formatDateToISO(row.expiry_date);
    document.getElementById("editApprovedDate").value = formatDateToISO(row.approved_date);
    document.getElementById("editName").value = row.name || "";
    document.getElementById("editDob").value = formatDateToISO(row.date_of_birth);
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

    bootstrap.Modal.getOrCreateInstance(document.getElementById("editRecordModal")).show();
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
            showCustomAlert("Record updated successfully!", "success");
            bootstrap.Modal.getInstance(document.getElementById("editRecordModal")).hide();
            fetchAndRecordWithLoader();
        } else {
            throw new Error(result.message || "Failed to update record.");
        }
    } catch (err) {
        showCustomAlert("Error updating record: " + escapeHtml(err.message), "danger");
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `<span>Save Changes</span> <i class="bi bi-cloud-arrow-up-fill ms-1"></i>`;
    }
}

// 9. Delete Routine
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
            showCustomAlert("Failed to delete: " + escapeHtml(result.message), "danger");
        }
    } catch (err) {
        showCustomAlert("Network error during deletion: " + escapeHtml(err.message), "danger");
    }
}

// 10. Profile View Modal
function openViewModal(row) {
    currentViewedRecord = row;
    const body = document.getElementById("viewRecordModalBody");
    const isDlIssued = row.dl_issued === "Yes";
    const safeLlr = escapeHtml(row.llr_number || "");

    body.innerHTML = `
        <div class="container-fluid p-0">
            <div class="d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center bg-light p-3 rounded-3 border mb-3 gap-2">
                <div>
                    <div class="d-flex align-items-center gap-2 mb-1">
                        <h5 class="fw-bold text-dark mb-0">${escapeHtml(row.name) || "N/A"}</h5>
                        <span class="badge bg-dark font-monospace">${escapeHtml(row.vehicle_class) || "N/A"}</span>
                        <span class="status-pill ${isDlIssued ? "status-pill-yes" : "status-pill-no"}">
                            <i class="bi bi-circle-fill" style="font-size: 0.45rem;"></i>
                            ${isDlIssued ? "DL Issued" : "Pending LLR"}
                        </span>
                    </div>
                    <div class="font-monospace text-muted small">
                        LLR: <span class="text-primary fw-bold">${safeLlr || "-"}</span> 
                        &bull; Invoice: <span>${escapeHtml(row.fees_number) || "-"}</span>
                    </div>
                </div>
                <div class="d-flex gap-2">
                    <button type="button" class="btn btn-sm btn-outline-dark" data-copy-text="${safeLlr}">
                        <i class="bi bi-clipboard me-1"></i> Copy LLR
                    </button>
                    <button type="button" class="btn btn-sm btn-primary px-3 fw-medium" onclick="switchToEditFromView()">
                        <i class="bi bi-pencil-square me-1"></i> Edit Profile
                    </button>
                </div>
            </div>

            <div class="row g-3">
                <div class="col-12 col-md-6">
                    <div class="p-3 border rounded-3 bg-white h-100 shadow-sm">
                        <div class="mb-3 pb-2 border-bottom">
                            <h6 class="fw-bold text-dark mb-0 small text-uppercase">Applicant Bio</h6>
                        </div>
                        <div class="row g-2">
                            <div class="col-6">
                                <div class="meta-label">Date of Birth</div>
                                <div class="meta-value font-monospace">${escapeHtml(row.date_of_birth) || "-"}</div>
                            </div>
                            <div class="col-6">
                                <div class="meta-label">Blood Group</div>
                                <div class="meta-value font-monospace text-danger fw-bold">${escapeHtml(row.blood_group) || "-"}</div>
                            </div>
                            <div class="col-6">
                                <div class="meta-label">Relation</div>
                                <div class="meta-value">${escapeHtml(row.relative_type) || "Father"}</div>
                            </div>
                            <div class="col-6">
                                <div class="meta-label">Relative Name</div>
                                <div class="meta-value">${escapeHtml(row.relative_name) || "-"}</div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="col-12 col-md-6">
                    <div class="p-3 border rounded-3 bg-white h-100 shadow-sm">
                        <div class="mb-3 pb-2 border-bottom">
                            <h6 class="fw-bold text-dark mb-0 small text-uppercase">License & Contact</h6>
                        </div>
                        <div class="row g-2">
                            <div class="col-6">
                                <div class="meta-label">Primary Mobile</div>
                                <div class="meta-value font-monospace">${escapeHtml(row.mobile_number) || "-"}</div>
                            </div>
                            <div class="col-6">
                                <div class="meta-label">Emergency Contact</div>
                                <div class="meta-value font-monospace">${escapeHtml(row.emergency_mobile) || "-"}</div>
                            </div>
                            <div class="col-6">
                                <div class="meta-label">Permanent DL No</div>
                                <div class="meta-value font-monospace text-success fw-bold">${row.dl_number && row.dl_number !== "-" ? escapeHtml(row.dl_number) : "Not Generated"}</div>
                            </div>
                            <div class="col-6">
                                <div class="meta-label">Approved Date</div>
                                <div class="meta-value font-monospace">${escapeHtml(row.approved_date) || "-"}</div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="col-12">
                    <div class="p-3 border rounded-3 bg-white shadow-sm">
                        <div class="mb-3 pb-2 border-bottom">
                            <h6 class="fw-bold text-dark mb-0 small text-uppercase">Address & Marks</h6>
                        </div>
                        <div class="row g-2">
                            <div class="col-12 col-md-6">
                                <div class="meta-label">Present Address</div>
                                <div class="meta-value text-muted" style="line-height: 1.45;">${escapeHtml(row.present_address) || "-"}</div>
                            </div>
                            <div class="col-12 col-md-6">
                                <div class="meta-label">Permanent Address</div>
                                <div class="meta-value text-muted" style="line-height: 1.45;">${escapeHtml(row.permanent_address) || "-"}</div>
                            </div>
                            <div class="col-12 col-md-6 mt-2">
                                <div class="meta-label">Mark 1</div>
                                <div class="meta-value small">${escapeHtml(row.identification_mark_1) || "-"}</div>
                            </div>
                            <div class="col-12 col-md-6 mt-2">
                                <div class="meta-label">Mark 2</div>
                                <div class="meta-value small">${escapeHtml(row.identification_mark_2) || "-"}</div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="col-12">
                    <div class="p-3 border rounded-3 bg-light d-flex flex-wrap justify-content-between align-items-center gap-3">
                        <div>
                            <div class="meta-label">Validity Period</div>
                            <div class="meta-value font-monospace small">
                                <span class="text-success">${escapeHtml(row.issue_date) || "-"}</span> &rarr; <span class="text-danger">${escapeHtml(row.expiry_date) || "-"}</span>
                            </div>
                        </div>
                        <div>
                            <div class="meta-label">Fees Paid</div>
                            <div class="meta-value font-monospace">₹${escapeHtml(row.fee_amount) || "0"}</div>
                        </div>
                        <div class="flex-grow-1 text-md-end">
                            <div class="meta-label">Audit Remarks</div>
                            <div class="meta-value small text-muted">${row.remarks && row.remarks !== "-" ? escapeHtml(row.remarks) : "No remarks attached"}</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    bootstrap.Modal.getOrCreateInstance(document.getElementById("viewRecordModal")).show();
}

function switchToEditFromView() {
    const viewModalEl = document.getElementById("viewRecordModal");
    const modalInstance = bootstrap.Modal.getInstance(viewModalEl);
    if (modalInstance) modalInstance.hide();

    if (currentViewedRecord) {
        openEditModal(currentViewedRecord);
    }
}

// 11. Toast Alerts
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
    const bgColors = {
        success: "bg-dark text-white",
        danger: "bg-danger text-white",
        warning: "bg-warning text-dark",
        info: "bg-dark text-white"
    };
    const icons = {
        success: "bi-check-circle-fill text-success",
        danger: "bi-exclamation-triangle-fill text-white",
        warning: "bi-exclamation-octagon-fill text-dark",
        info: "bi-info-circle-fill text-info"
    };

    const alertEl = document.createElement("div");
    alertEl.id = alertId;
    alertEl.className = `alert ${bgColors[type] || "bg-dark text-white"} shadow-lg border-0 rounded-4 p-3 d-flex align-items-center gap-3 alert-dismissible fade show`;
    alertEl.innerHTML = `
        <i class="bi ${icons[type] || "bi-bell-fill"} fs-4"></i>
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
    }, 3500);
}

function fetchAndRecordSwitchToTable() {
    fetchAndRecordWithLoader();
    const tableTab = document.getElementById("view-table-tab");
    if (tableTab) bootstrap.Tab.getOrCreateInstance(tableTab).show();
}