// js/reportHandler.js - Reports Engine Console for Cloudflare D1 Backend
document.addEventListener("DOMContentLoaded", () => {
    initReportConsole();
});

let masterRecordsCache = [];
let currentFilteredData = [];
let currentSortColumn = "llr_number";
let currentSortDirection = "asc";

// Pagination State
let currentPage = 1;
let pageSize = 25;

async function initReportConsole() {
    setupEventListeners();
    await fetchReportDataRegistry();
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
async function fetchReportDataRegistry() {
    toggleStatusTray(true, "Connecting to Cloudflare D1 backend...");

    try {
        const response = await fetch(`${ENV.SHEET_API_URL}?action=readAll`, {
            headers: getAuthHeaders()
        });

        if (response.status === 401) {
            showStyledAlert("Session expired or unauthorized. Redirecting to login...", "danger");
            setTimeout(() => window.location.href = "login.html", 1500);
            return;
        }

        if (!response.ok) throw new Error(`Server returned status: ${response.status}`);

        const data = await response.json();
        masterRecordsCache = Array.isArray(data) ? data : (data.data || []);
        toggleStatusTray(false);
    } catch (error) {
        console.error("Fetch Error:", error);
        toggleStatusTray(false);
        showStyledAlert("Failed to fetch report records: " + error.message, "danger");
    }
}

// 2. Setup Event Listeners
function setupEventListeners() {
    const reportTypeSelect = document.getElementById("reportTypeSelect");
    if (reportTypeSelect) {
        reportTypeSelect.addEventListener("change", () => {
            currentPage = 1;
            executeReportGeneration();
        });
    }

    const pageSizeSelect = document.getElementById("reportPageSizeSelect");
    if (pageSizeSelect) {
        pageSizeSelect.addEventListener("change", (e) => {
            pageSize = e.target.value === "ALL" ? "ALL" : parseInt(e.target.value, 10);
            currentPage = 1;
            renderReportTable(currentFilteredData, document.getElementById("reportTypeSelect").value);
        });
    }

    const searchInput = document.getElementById("filterSearchQuery");
    const fromDateInput = document.getElementById("filterFromDate");
    const toDateInput = document.getElementById("filterToDate");

    [searchInput, fromDateInput, toDateInput].forEach(el => {
        if (el) {
            el.addEventListener("input", () => {
                if (document.getElementById("reportTypeSelect").value) {
                    currentPage = 1;
                    executeReportGeneration();
                }
            });
        }
    });

    // Formal Browser Print Trigger
    const printBtn = document.getElementById("printReportBtn");
    if (printBtn) {
        printBtn.addEventListener("click", () => {
            const reportSelect = document.getElementById("reportTypeSelect");
            const activeTitle = reportSelect.options[reportSelect.selectedIndex]?.text || "LLR MASTER REGISTER";
            
            document.getElementById("lblPrintReportTitle").textContent = activeTitle;
            document.getElementById("lblPrintTimestamp").textContent = new Date().toLocaleString([], { 
                year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' 
            });
            document.getElementById("lblPrintTotalCount").textContent = currentFilteredData.length;
            
            // Render all items for print output, then restore pagination
            const previousPageSize = pageSize;
            pageSize = "ALL";
            renderReportTable(currentFilteredData, reportSelect.value);

            window.print();

            pageSize = previousPageSize;
            renderReportTable(currentFilteredData, reportSelect.value);
        });
    }

    const excelBtn = document.getElementById("exportExcelBtn");
    if (excelBtn) excelBtn.addEventListener("click", () => exportTableData("excel"));

    const csvBtn = document.getElementById("exportCsvBtn");
    if (csvBtn) csvBtn.addEventListener("click", () => exportTableData("csv"));

    const trigger = document.getElementById("multiselectTrigger");
    const menu = document.getElementById("multiselectMenu");
    if (trigger && menu) {
        trigger.addEventListener("click", () => menu.classList.toggle("d-none"));
        document.addEventListener("click", (e) => {
            if (!document.getElementById("vehicleClassMultiselect").contains(e.target)) {
                menu.classList.add("d-none");
            }
        });
    }

    const checkboxes = document.querySelectorAll(".vehicle-checkbox");
    checkboxes.forEach(chk => {
        chk.addEventListener("change", (e) => {
            handleVehicleCheckboxChange(e);
            if (document.getElementById("reportTypeSelect").value) {
                currentPage = 1;
                executeReportGeneration();
            }
        });
    });

    const quickForm = document.getElementById("quickReportDlForm");
    if (quickForm) quickForm.addEventListener("submit", handleQuickDlSubmit);
}

// 3. Multiselect Checkbox Logic
function handleVehicleCheckboxChange(e) {
    const allChk = document.getElementById("chk_ALL");
    const checkboxes = document.querySelectorAll(".vehicle-checkbox");

    if (e.target.id === "chk_ALL" && e.target.checked) {
        checkboxes.forEach(c => { if (c.id !== "chk_ALL") c.checked = false; });
    } else if (e.target.checked) {
        allChk.checked = false;
    }

    updateMultiselectTagsDisplay();
}

function updateMultiselectTagsDisplay() {
    const holder = document.getElementById("multiselectTagsHolder");
    const checked = document.querySelectorAll(".vehicle-checkbox:checked");

    if (checked.length === 0 || document.getElementById("chk_ALL").checked) {
        holder.innerHTML = `<span class="placeholder-text text-muted small">Show All Vehicle Classes</span>`;
        return;
    }

    holder.innerHTML = "";
    checked.forEach(c => {
        const label = document.querySelector(`label[for="${c.id}"]`).textContent;
        const tag = document.createElement("span");
        tag.className = "badge bg-dark text-white me-1 mb-1 px-2 py-1 rounded-2 fw-semibold";
        tag.style.fontSize = "0.75rem";
        tag.textContent = label;
        holder.appendChild(tag);
    });
}

// 4. Report Generation & Filter Execution
function executeReportGeneration() {
    const reportTypeSelect = document.getElementById("reportTypeSelect");
    const reportType = reportTypeSelect.value;

    if (!reportType) {
        showStyledAlert("Please select a Register Template from the dropdown first.", "warning");
        return;
    }

    const placeholder = document.getElementById("reportPlaceholderView");
    const loader = document.getElementById("reportLoaderView");
    const displayView = document.getElementById("reportDisplayView");

    placeholder.classList.add("d-none");
    displayView.classList.add("d-none");
    loader.classList.remove("d-none");

    setTimeout(() => {
        currentFilteredData = filterRecordsByCriteria(reportType);
        sortReportData();
        renderReportTable(currentFilteredData, reportType);
        updateSummaryRibbon(currentFilteredData);

        loader.classList.add("d-none");
        displayView.classList.remove("d-none");
    }, 150);
}

function handleReportSort(col) {
    if (currentSortColumn === col) {
        currentSortDirection = currentSortDirection === "asc" ? "desc" : "asc";
    } else {
        currentSortColumn = col;
        currentSortDirection = "asc";
    }
    sortReportData();
    renderReportTable(currentFilteredData, document.getElementById("reportTypeSelect").value);
}

function sortReportData() {
    currentFilteredData.sort((a, b) => {
        let valA = a[currentSortColumn] || "";
        let valB = b[currentSortColumn] || "";

        if (["issue_date", "expiry_date", "date_of_birth"].includes(currentSortColumn)) {
            const partsA = valA.split("-");
            const partsB = valB.split("-");
            if (partsA.length === 3) valA = `${partsA[2]}${partsA[1]}${partsA[0]}`;
            if (partsB.length === 3) valB = `${partsB[2]}${partsB[1]}${partsB[0]}`;
        }

        if (typeof valA === "string") valA = valA.toLowerCase();
        if (typeof valB === "string") valB = valB.toLowerCase();

        if (valA < valB) return currentSortDirection === "asc" ? -1 : 1;
        if (valA > valB) return currentSortDirection === "asc" ? 1 : -1;
        return 0;
    });
}

// 5. Accurate All-Fields & Strict Data-Quality Criteria Filtering
function filterRecordsByCriteria(reportType) {
    const rawSearchQuery = document.getElementById("filterSearchQuery").value.toLowerCase().trim();
    const fromDate = document.getElementById("filterFromDate").value;
    const toDate = document.getElementById("filterToDate").value;

    const allChecked = document.getElementById("chk_ALL").checked;
    const selectedVehicles = Array.from(document.querySelectorAll(".vehicle-checkbox:checked"))
        .map(chk => chk.value)
        .filter(val => val !== "ALL");

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return masterRecordsCache.filter(row => {
        // Accurate Search in ALL Fields
        if (rawSearchQuery) {
            const searchTokens = rawSearchQuery.split(/\s+/);
            const rowValuesConcat = Object.values(row)
                .filter(val => val !== null && val !== undefined)
                .map(val => String(val).toLowerCase())
                .join(" ");

            const allTokensMatch = searchTokens.every(token => rowValuesConcat.includes(token));
            if (!allTokensMatch) return false;
        }

        // Vehicle Filter
        if (!allChecked && selectedVehicles.length > 0) {
            const rowClass = (row.vehicle_class || "").toUpperCase();
            let matchesVehicle = false;

            selectedVehicles.forEach(vFilter => {
                if (vFilter === "MCWG_ONLY" && rowClass === "MCWG") matchesVehicle = true;
                if (vFilter === "MCWOG_ONLY" && rowClass === "MCWOG") matchesVehicle = true;
                if (vFilter === "LMV_ONLY" && rowClass === "LMV") matchesVehicle = true;
                if (vFilter === "TRANS_ONLY" && rowClass === "TRANS") matchesVehicle = true;
                if (vFilter === "MCWG_LMV" && (rowClass.includes("MCWG") && rowClass.includes("LMV"))) matchesVehicle = true;
                if (vFilter === "MCWOG_LMV" && (rowClass.includes("MCWOG") && rowClass.includes("LMV"))) matchesVehicle = true;
            });

            if (!matchesVehicle) return false;
        }

        // Date Range Matching
        if (fromDate || toDate) {
            const parts = (row.issue_date || "").split("-");
            if (parts.length === 3) {
                const rowDateISO = `${parts[2]}-${parts[1]}-${parts[0]}`;
                if (fromDate && rowDateISO < fromDate) return false;
                if (toDate && rowDateISO > toDate) return false;
            }
        }

        const expiryParts = (row.expiry_date || "").split("-");
        let expiryDateObj = null;
        if (expiryParts.length === 3) {
            expiryDateObj = new Date(`${expiryParts[2]}-${expiryParts[1]}-${expiryParts[0]}`);
        }

        const daysPassed = calculateDaysPassed(row.issue_date);
        const todayStr = new Date().toLocaleDateString('en-GB').replace(/\//g, '-');

        // Focused Practical Registers
        switch (reportType) {
            case "COMPLETE_REGISTER":
                return true;

            case "ELIGIBLE_FOR_DL":
                return daysPassed >= 30 && row.dl_issued !== "Yes" && (!expiryDateObj || expiryDateObj >= today);

            case "PENDING_30_DAYS":
                return daysPassed < 30 && row.dl_issued !== "Yes";

            case "DL_ISSUED":
                return row.dl_issued === "Yes";

            case "EXPIRING_15_DAYS":
                if (!expiryDateObj || row.dl_issued === "Yes") return false;
                const diffDays15 = (expiryDateObj - today) / (1000 * 60 * 60 * 24);
                return diffDays15 >= 0 && diffDays15 <= 15;

            case "EXPIRED_LLR":
                return expiryDateObj && expiryDateObj < today && row.dl_issued !== "Yes";

            case "TODAYS_ISSUED":
                return row.issue_date === todayStr;

            case "DUPLICATE_MOBILE":
                const mobile = row.mobile_number;
                if (!mobile || mobile === "-") return false;
                return masterRecordsCache.filter(r => r.mobile_number === mobile).length > 1;

            case "MISSING_INFORMATION":
                // 1. Core Profile Details Missing
                const isBasicMissing = !row.name || row.name === "-" ||
                                       !row.date_of_birth || row.date_of_birth === "-" ||
                                       !row.mobile_number || row.mobile_number === "-";

                // 2. Critical Dates Missing
                const isDateMissing = !row.issue_date || row.issue_date === "-" ||
                                      !row.expiry_date || row.expiry_date === "-";

                // 3. Inconsistency: DL Issued = YES, but Permanent DL Number is missing
                const isDlMissing = (row.dl_issued === "Yes") && (!row.dl_number || row.dl_number === "-" || row.dl_number.trim() === "");

                return isBasicMissing || isDateMissing || isDlMissing;

            default:
                return true;
        }
    });
}

// 6. Render Report Table with DataTables-style Pagination
function renderReportTable(data, reportType) {
    const header = document.getElementById("reportDataTableHeader");
    const tbody = document.getElementById("reportDataTableBody");
    const titleLbl = document.getElementById("lblRenderedReportTitle");
    const countLbl = document.getElementById("lblRenderedReportCount");

    const selectedOptionText = document.querySelector(`#reportTypeSelect option[value="${reportType}"]`)?.textContent || "Register Output";
    titleLbl.innerHTML = `${selectedOptionText} <span class="badge bg-dark fs-6 ms-2 px-2 py-1 align-middle">Active Register</span>`;
    countLbl.textContent = `${data.length} Records`;

    const getSortIcon = (col) => {
        if (currentSortColumn !== col) return '<i class="bi bi-arrow-down-up small ms-1 text-muted"></i>';
        return currentSortDirection === "asc" ? '<i class="bi bi-sort-down-alt small ms-1 text-primary"></i>' : '<i class="bi bi-sort-down small ms-1 text-primary"></i>';
    };

    header.innerHTML = `
        <tr>
            <th class="ps-3" style="width: 40px;">#</th>
            <th class="sortable text-nowrap" onclick="handleReportSort('llr_number')">LLR Number ${getSortIcon('llr_number')}</th>
            <th class="sortable text-nowrap" onclick="handleReportSort('name')">Applicant Name ${getSortIcon('name')}</th>
            <th class="sortable text-nowrap" onclick="handleReportSort('date_of_birth')">DOB ${getSortIcon('date_of_birth')}</th>
            <th class="text-nowrap">Class</th>
            <th class="text-nowrap">Mobile</th>
            <th class="sortable text-nowrap" onclick="handleReportSort('issue_date')">Issue Date ${getSortIcon('issue_date')}</th>
            <th class="sortable text-nowrap" onclick="handleReportSort('expiry_date')">Expiry Date ${getSortIcon('expiry_date')}</th>
            <th class="sortable text-nowrap" onclick="handleReportSort('dl_issued')">DL Status ${getSortIcon('dl_issued')}</th>
            <th class="pe-3 text-nowrap">Remarks</th>
        </tr>
    `;

    tbody.innerHTML = "";
    if (data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="10" class="text-center py-5 text-muted fw-semibold">No records found matching this register criteria.</td></tr>`;
        updateReportPagination(0, 0, 0);
        return;
    }

    // Pagination Slicing
    const totalRecords = data.length;
    let paginatedItems = data;
    let startIdx = 0;
    let endIdx = totalRecords;

    if (pageSize !== "ALL") {
        const totalPages = Math.ceil(totalRecords / pageSize) || 1;
        if (currentPage > totalPages) currentPage = totalPages;
        if (currentPage < 1) currentPage = 1;

        startIdx = (currentPage - 1) * pageSize;
        endIdx = Math.min(startIdx + pageSize, totalRecords);
        paginatedItems = data.slice(startIdx, endIdx);
        updateReportPagination(totalRecords, totalPages, startIdx + 1, endIdx);
    } else {
        updateReportPagination(totalRecords, 1, 1, totalRecords);
    }

    paginatedItems.forEach((row, idx) => {
        const tr = document.createElement("tr");
        const isDlIssued = row.dl_issued === "Yes";
        const daysPassed = calculateDaysPassed(row.issue_date);
        const isEligible = daysPassed >= 30;
        const daysRemaining = 30 - daysPassed;

        tr.ondblclick = () => openQuickDlModal(row);
        tr.title = isEligible || isDlIssued ? "Double-click to update status" : `Waiting period: ${daysRemaining} days left`;
        tr.style.cursor = "pointer";

        // Highlight incomplete missing fields in red when inspecting Incomplete register
        const isMissingDlNumber = isDlIssued && (!row.dl_number || row.dl_number === "-");
        const isMissingDates = (!row.issue_date || row.issue_date === "-") || (!row.expiry_date || row.expiry_date === "-");

        tr.innerHTML = `
            <td class="ps-3 text-muted small">${startIdx + idx + 1}</td>
            <td class="text-nowrap">
                <div class="llr-nowrap">
                    <span class="font-monospace fw-bold text-danger" onclick="copyToClipboard('${row.llr_number || ""}')" title="Click to copy LLR">
                        ${row.llr_number || "-"}
                    </span>
                    
                </div>
            </td>
            <td>
                <div class="fw-semibold text-dark text-nowrap">${row.name || '<span class="text-danger fw-bold">Missing Name</span>'}</div>
                <div class="text-muted small" style="font-size: 0.72rem;">${row.relative_type || "Father"}: ${row.relative_name || "-"}</div>
            </td>
            <td class="font-monospace date-highlight">${row.date_of_birth && row.date_of_birth !== '-' ? row.date_of_birth : '<span class="text-danger fw-bold">Missing</span>'}</td>
            <td><span class="badge bg-light text-dark border px-2 py-1 font-monospace" style="font-size: 0.72rem;">${row.vehicle_class || "-"}</span></td>
            <td>
                <span class="font-monospace text-dark fw-medium text-nowrap" onclick="copyToClipboard('${row.mobile_number || ""}')" style="cursor: pointer;">
                    ${row.mobile_number && row.mobile_number !== '-' ? row.mobile_number : '<span class="text-danger fw-bold">Missing</span>'}
                </span>
            </td>
            <td class="font-monospace date-highlight">${row.issue_date && row.issue_date !== '-' ? row.issue_date : '<span class="text-danger fw-bold">Missing</span>'}</td>
            <td class="font-monospace date-highlight">${row.expiry_date && row.expiry_date !== '-' ? row.expiry_date : '<span class="text-danger fw-bold">Missing</span>'}</td>
            <td>
                <span class="status-pill ${isDlIssued ? 'status-pill-yes' : 'status-pill-no'}">
                    <span>${isDlIssued ? 'Approved' : 'Pending'}</span>
                </span>
                ${isMissingDlNumber ? `
                    <div class="mt-1 no-print">
                        <span class="badge bg-danger text-white" style="font-size:0.65rem;" title="Marked as Approved but DL number was not provided">
                            No DL Number
                        </span>
                    </div>
                ` : ''}
                ${!isEligible && !isDlIssued ? `
                    <div class="mt-1 no-print">
                        <span class="eligibility-pill">
                            <i class="bi bi-clock-history"></i> ${daysRemaining}d left
                        </span>
                    </div>
                ` : ''}
            </td>
            <td class="pe-3">
                <span class="text-truncate d-inline-block text-muted" style="max-width: 140px; font-size: 0.75rem;" title="${row.remarks || ""}">
                    ${row.remarks && row.remarks !== '-' ? row.remarks : '-'}
                </span>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// 7. Pagination Controls
function updateReportPagination(totalRecords, totalPages, showingStart = 0, showingEnd = 0) {
    const infoTop = document.getElementById("pageRecordsInfoTop");
    const infoBottom = document.getElementById("pageRecordsInfoBottom");
    const btnGroup = document.getElementById("paginationBtnGroup");

    const infoString = `Showing <strong>${showingStart}-${showingEnd}</strong> of <strong>${totalRecords}</strong> records`;
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
    prevBtn.onclick = () => { currentPage--; renderReportTable(currentFilteredData, document.getElementById("reportTypeSelect").value); };
    btnGroup.appendChild(prevBtn);

    // Page Display Button
    const pageBtn = document.createElement("button");
    pageBtn.className = "btn btn-outline-secondary disabled fw-bold text-dark";
    pageBtn.textContent = `Page ${currentPage} of ${totalPages || 1}`;
    btnGroup.appendChild(pageBtn);

    // Next Button
    const nextBtn = document.createElement("button");
    nextBtn.className = "btn btn-outline-secondary";
    nextBtn.disabled = currentPage >= totalPages;
    nextBtn.innerHTML = `Next <i class="bi bi-chevron-right"></i>`;
    nextBtn.onclick = () => { currentPage++; renderReportTable(currentFilteredData, document.getElementById("reportTypeSelect").value); };
    btnGroup.appendChild(nextBtn);
}

function updateSummaryRibbon(data) {
    let dlReady = 0, waiting = 0, expired = 0, dlIssued = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    data.forEach(row => {
        if (row.dl_issued === "Yes") {
            dlIssued++;
        } else {
            const days = calculateDaysPassed(row.issue_date);
            if (days >= 30) {
                dlReady++;
            } else {
                waiting++;
            }
        }

        const expiryParts = (row.expiry_date || "").split("-");
        if (expiryParts.length === 3) {
            const exp = new Date(`${expiryParts[2]}-${expiryParts[1]}-${expiryParts[0]}`);
            if (exp < today && row.dl_issued !== "Yes") expired++;
        }
    });

    document.getElementById("ribbonDlReadyCount").textContent = dlReady;
    document.getElementById("ribbonWaitingCount").textContent = waiting;
    document.getElementById("ribbonExpiredCount").textContent = expired;
    document.getElementById("ribbonDlIssuedCount").textContent = dlIssued;
}

// 8. Quick DL Modal Handling
function openQuickDlModal(row) {
    const daysPassed = calculateDaysPassed(row.issue_date);
    if (daysPassed < 30 && row.dl_issued !== "Yes") {
        showStyledAlert(`Cannot issue Permanent DL: ${30 - daysPassed} day(s) remaining for 30-day requirement.`, "warning");
        return;
    }

    document.getElementById("editRowLlrNumber").value = row.llr_number || "";
    document.getElementById("editApplicantNameText").textContent = row.name || "Applicant";
    document.getElementById("editVehicleText").textContent = row.vehicle_class || "LMV";
    document.getElementById("editLlrText").textContent = row.llr_number || "-";
    document.getElementById("editIssueText").textContent = row.issue_date || "-";

    document.getElementById("editDlIssuedSelect").value = row.dl_issued === "Yes" ? "Yes" : "No";
    document.getElementById("editDlNumberInput").value = (row.dl_number && row.dl_number !== "-") ? row.dl_number : "";
    document.getElementById("editApprovedDateInput").value = formatDateToISO(row.approved_date) || "";
    document.getElementById("editRemarksInput").value = (row.remarks && row.remarks !== "-") ? row.remarks : "";

    const modal = new bootstrap.Modal(document.getElementById("editDlStatusModal"));
    modal.show();
}

function setReportDateToday() {
    const todayISO = new Date().toISOString().split("T")[0];
    document.getElementById("editApprovedDateInput").value = todayISO;
}

async function handleQuickDlSubmit(event) {
    event.preventDefault();
    const llrNumber = document.getElementById("editRowLlrNumber").value;
    const dlIssued = document.getElementById("editDlIssuedSelect").value;
    const dlNumber = document.getElementById("editDlNumberInput").value.trim();
    let approvedDate = document.getElementById("editApprovedDateInput").value;
    const remarks = document.getElementById("editRemarksInput").value.trim();
    const spinner = document.getElementById("saveModalSpinner");

    if (approvedDate) approvedDate = formatDateToDisplay(approvedDate);

    spinner.classList.remove("d-none");

    const targetRow = masterRecordsCache.find(r => r.llr_number === llrNumber);
    if (!targetRow) {
        showStyledAlert("Record not found in local cache.", "danger");
        spinner.classList.add("d-none");
        return;
    }

    const payload = {
        ...targetRow,
        action: "update",
        dl_issued: dlIssued,
        dl_number: dlNumber || "-",
        approved_date: approvedDate || targetRow.approved_date || "-",
        remarks: remarks || targetRow.remarks || "-"
    };

    try {
        const response = await fetch(ENV.SHEET_API_URL, {
            method: "POST",
            headers: getAuthHeaders(),
            body: JSON.stringify(payload)
        });

        const result = await response.json();
        if (result.status === "success") {
            showStyledAlert("✓ DL Status updated successfully!", "success");
            bootstrap.Modal.getInstance(document.getElementById("editDlStatusModal")).hide();
            await fetchReportDataRegistry();
            executeReportGeneration();
        } else {
            throw new Error(result.message);
        }
    } catch (err) {
        showStyledAlert("Update failed: " + err.message, "danger");
    } finally {
        spinner.classList.add("d-none");
    }
}

// 9. Export Helpers
function exportTableData(type) {
    const table = document.getElementById("reportDataTable");
    if (!table || table.rows.length <= 1) {
        showStyledAlert("No table data available to export.", "warning");
        return;
    }

    if (type === "excel") {
        const wb = XLSX.utils.table_to_book(table, { sheet: "Register Log" });
        XLSX.writeFile(wb, "LLR_Register_Export.xlsx");
    } else if (type === "csv") {
        const wb = XLSX.utils.table_to_book(table, { sheet: "Register Log" });
        XLSX.writeFile(wb, "LLR_Register_Export.csv");
    }
}

// Helpers
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

function copyToClipboard(text) {
    if (!text || text === "-") return;
    navigator.clipboard.writeText(text).then(() => {
        showStyledAlert(`Copied to clipboard: ${text}`, "info");
    });
}

function toggleStatusTray(show, message) {
    const tray = document.getElementById("connectionStatusStatusTray");
    const msg = document.getElementById("statusTrayMessage");
    const spinner = document.getElementById("statusTraySpinner");

    if (!tray) return;

    if (show) {
        tray.style.cssText = "display: flex !important; background-color: #f8fafc; border: 1px solid #e2e8f0; color: #0f172a;";
        msg.textContent = message;
        if (spinner) spinner.classList.remove("d-none");
    } else {
        tray.style.cssText = "display: none !important;";
        if (spinner) spinner.classList.add("d-none");
    }
}

function showStyledAlert(message, type = "success") {
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