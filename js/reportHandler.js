// js/reportHandler.js - Reports Engine Console for Cloudflare D1 Backend
document.addEventListener("DOMContentLoaded", () => {
    initReportConsole();
});

let masterRecordsCache = [];

async function initReportConsole() {
    setupEventListeners();
    await fetchReportDataRegistry();
}

// 1. Fetch Master Registry Data from Cloudflare Worker
async function fetchReportDataRegistry() {
    toggleStatusTray(true, "Connecting to Cloudflare D1 backend...", "info");

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

        toggleStatusTray(false, `Successfully synced ${masterRecordsCache.length} records.`, "success");
    } catch (error) {
        console.error("Fetch Error:", error);
        toggleStatusTray(false, "Failed to connect to database backend.", "danger");
        showStyledAlert("Failed to fetch records: " + error.message, "danger");
    }
}

// 2. Setup Event Listeners for UI Interactions
function setupEventListeners() {
    const reportTypeSelect = document.getElementById("reportTypeSelect");
    if (reportTypeSelect) {
        reportTypeSelect.addEventListener("change", executeReportGeneration);
    }

    const searchInput = document.getElementById("filterSearchQuery");
    const fromDateInput = document.getElementById("filterFromDate");
    const toDateInput = document.getElementById("filterToDate");
    
    [searchInput, fromDateInput, toDateInput].forEach(el => {
        if (el) {
            el.addEventListener("input", () => {
                if (document.getElementById("reportTypeSelect").value) {
                    executeReportGeneration();
                }
            });
        }
    });

    const printBtn = document.getElementById("printReportBtn");
    if (printBtn) {
        printBtn.addEventListener("click", () => {
            document.getElementById("lblPrintTimestamp").textContent = `Created On: ${new Date().toLocaleString()}`;
            const activeTitle = document.getElementById("lblRenderedReportTitle").textContent.replace("Active Filter", "").trim();
            document.getElementById("lblPrintReportTitle").textContent = activeTitle || "Active Database Registry Log";
            window.print();
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
                executeReportGeneration();
            }
        });
    });

    const saveModalBtn = document.getElementById("btnSaveDlModal");
    if (saveModalBtn) saveModalBtn.addEventListener("click", handleModalUpdateSubmit);
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

// 4. Execute Report Generation & Filtering Logic
async function executeReportGeneration() {
    const reportTypeSelect = document.getElementById("reportTypeSelect");
    const reportType = reportTypeSelect.value;

    if (!reportType) {
        showStyledAlert("⚠️ Please select a Report Format Template from the dropdown first.", "warning");
        return;
    }

    const placeholder = document.getElementById("reportPlaceholderView");
    const loader = document.getElementById("reportLoaderView");
    const displayView = document.getElementById("reportDisplayView");

    placeholder.classList.add("d-none");
    displayView.classList.add("d-none");
    loader.classList.remove("d-none");

    setTimeout(() => {
        const filteredData = filterRecordsByCriteria(reportType);
        renderReportTable(filteredData, reportType);
        updateSummaryRibbon(filteredData);

        loader.classList.add("d-none");
        displayView.classList.remove("d-none");
    }, 250);
}

function filterRecordsByCriteria(reportType) {
    const searchQuery = document.getElementById("filterSearchQuery").value.toLowerCase();
    const fromDate = document.getElementById("filterFromDate").value;
    const toDate = document.getElementById("filterToDate").value;
    
    const allChecked = document.getElementById("chk_ALL").checked;
    const selectedVehicles = Array.from(document.querySelectorAll(".vehicle-checkbox:checked"))
        .map(chk => chk.value)
        .filter(val => val !== "ALL");

    const today = new Date();
    today.setHours(0,0,0,0);

    return masterRecordsCache.filter(row => {
        const matchesQuery = !searchQuery || 
            (row.llr_number && row.llr_number.toLowerCase().includes(searchQuery)) ||
            (row.name && row.name.toLowerCase().includes(searchQuery)) ||
            (row.mobile_number && row.mobile_number.toLowerCase().includes(searchQuery));

        if (!matchesQuery) return false;

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

        const issueParts = (row.issue_date || "").split("-");
        let issueDateObj = null;
        if (issueParts.length === 3) {
            issueDateObj = new Date(`${issueParts[2]}-${issueParts[1]}-${issueParts[0]}`);
        }

        const todayStr = new Date().toLocaleDateString('en-GB').replace(/\//g, '-');

        switch (reportType) {
            case "COMPLETE_REGISTER":
                return true;
            case "ACTIVE_LLR":
                return row.dl_issued !== "Yes" && (!expiryDateObj || expiryDateObj >= today);
            case "EXPIRED_LLR":
                return expiryDateObj && expiryDateObj < today;
            case "DL_ISSUED":
            case "LLR_TO_DL_CONVERSION":
                return row.dl_issued === "Yes";
            case "PENDING_DL":
                return row.dl_issued !== "Yes";
            case "TODAYS_ISSUED":
                return row.issue_date === todayStr;
            case "MONTHLY_ISSUED":
                if (!issueDateObj) return false;
                return issueDateObj.getMonth() === today.getMonth() && issueDateObj.getFullYear() === today.getFullYear();
            case "EXPIRING_7_DAYS":
                if (!expiryDateObj) return false;
                const diffDays7 = (expiryDateObj - today) / (1000 * 60 * 60 * 24);
                return diffDays7 >= 0 && diffDays7 <= 7;
            case "EXPIRING_30_DAYS":
                if (!expiryDateObj) return false;
                const diffDays30 = (expiryDateObj - today) / (1000 * 60 * 60 * 24);
                return diffDays30 >= 0 && diffDays30 <= 30;
            case "PASSED_30_DAYS":
            case "ELIGIBLE_FOR_DL":
                if (!issueDateObj) return false;
                const daysSinceIssue = (today - issueDateObj) / (1000 * 60 * 60 * 24);
                return daysSinceIssue >= 30 && row.dl_issued !== "Yes";
            case "DUPLICATE_MOBILE":
                const mobile = row.mobile_number;
                if (!mobile || mobile === "-") return false;
                const count = masterRecordsCache.filter(r => r.mobile_number === mobile).length;
                return count > 1;
            case "MISSING_INFORMATION":
                return !row.name || !row.mobile_number || !row.date_of_birth || row.mobile_number === "-" || row.name === "-";
            default:
                return true;
        }
    });
}

// 5. Render Table & Metrics Ribbon with Styled Elements
function renderReportTable(data, reportType) {
    const header = document.getElementById("reportDataTableHeader");
    const tbody = document.getElementById("reportDataTableBody");
    const titleLbl = document.getElementById("lblRenderedReportTitle");
    const countLbl = document.getElementById("lblRenderedReportCount");

    const selectedOptionText = document.querySelector(`#reportTypeSelect option[value="${reportType}"]`)?.textContent || "Custom Report";
    titleLbl.innerHTML = `${selectedOptionText} <span class="badge bg-dark fs-6 ms-2 px-2 py-1 align-middle">Active Filter</span>`;
    countLbl.textContent = `${data.length} Records`;

    header.innerHTML = `
        <tr>
            <th class="ps-3 text-secondary uppercase fw-bold" style="font-size:0.75rem;">#</th>
            <th class="text-secondary uppercase fw-bold" style="font-size:0.75rem;">LLR Number</th>
            <th class="text-secondary uppercase fw-bold" style="font-size:0.75rem;">Applicant Name</th>
            <th class="text-secondary uppercase fw-bold" style="font-size:0.75rem;">DOB</th>
            <th class="text-secondary uppercase fw-bold" style="font-size:0.75rem;">Vehicle Class</th>
            <th class="text-secondary uppercase fw-bold" style="font-size:0.75rem;">Mobile</th>
            <th class="text-secondary uppercase fw-bold" style="font-size:0.75rem;">Issue Date</th>
            <th class="text-secondary uppercase fw-bold" style="font-size:0.75rem;">Expiry Date</th>
            <th class="text-secondary uppercase fw-bold" style="font-size:0.75rem;">DL Status</th>
            <th class="pe-3 text-secondary uppercase fw-bold" style="font-size:0.75rem;">Remarks</th>
        </tr>
    `;

    tbody.innerHTML = "";
    if (data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="10" class="text-center py-5 text-muted fw-semibold">No records match the selected template and filter parameters.</td></tr>`;
        return;
    }

    data.forEach((row, idx) => {
        const tr = document.createElement("tr");
        tr.ondblclick = () => openEditModal(row);
        tr.title = "Double-click to update record status";
        tr.style.cursor = "pointer";

        tr.innerHTML = `
            <td class="ps-3 text-muted small fw-medium">${idx + 1}</td>
            <td class="font-monospace fw-bold text-dark">${row.llr_number || "-"}</td>
            <td class="fw-semibold text-primary">${row.name || "-"}</td>
            <td class="small text-secondary">${row.date_of_birth || "-"}</td>
            <td><span class="badge bg-light text-dark border px-2 py-1 fw-semibold">${row.vehicle_class || "-"}</span></td>
            <td class="font-monospace small text-secondary">${row.mobile_number || "-"}</td>
            <td class="small text-secondary">${row.issue_date || "-"}</td>
            <td class="small text-secondary">${row.expiry_date || "-"}</td>
            <td><span class="badge ${row.dl_issued === 'Yes' ? 'bg-success bg-opacity-10 text-success border border-success' : 'bg-warning bg-opacity-10 text-warning border border-warning'} px-2 py-1">${row.dl_issued || 'No'}</span></td>
            <td class="pe-3 text-muted small">${row.remarks || "-"}</td>
        `;
        tbody.appendChild(tr);
    });
}

function updateSummaryRibbon(data) {
    let active = 0, expired = 0, dlReady = 0, dlIssued = 0;

    data.forEach(row => {
        if (row.dl_issued === "Yes") {
            dlIssued++;
        } else {
            active++;
        }
    });

    document.getElementById("ribbonActiveCount").textContent = active;
    document.getElementById("ribbonExpiredCount").textContent = expired;
    document.getElementById("ribbonDlReadyCount").textContent = active;
    document.getElementById("ribbonDlIssuedCount").textContent = dlIssued;
}

// 6. Modal Record Update Handler
function openEditModal(row) {
    document.getElementById("editRowLlrNumber").value = row.llr_number;
    document.getElementById("editApplicantName").value = row.name;
    document.getElementById("editDlIssuedSelect").value = row.dl_issued === "Yes" ? "YES" : "NO";
    document.getElementById("editDlNumberInput").value = row.dl_number || "";
    document.getElementById("editRemarksInput").value = row.remarks || "";

    const modal = new bootstrap.Modal(document.getElementById("editDlStatusModal"));
    modal.show();
}

async function handleModalUpdateSubmit() {
    const llrNumber = document.getElementById("editRowLlrNumber").value;
    const dlIssued = document.getElementById("editDlIssuedSelect").value === "YES" ? "Yes" : "No";
    const dlNumber = document.getElementById("editDlNumberInput").value.trim();
    const remarks = document.getElementById("editRemarksInput").value.trim();
    const spinner = document.getElementById("saveModalSpinner");

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
        dl_number: dlNumber,
        remarks: remarks
    };

    try {
        const response = await fetch(ENV.SHEET_API_URL, {
            method: "POST",
            headers: getAuthHeaders(),
            body: JSON.stringify(payload)
        });

        const result = await response.json();
        if (result.status === "success") {
            showToast("Record updated successfully!");
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

// 7. Export Data (Excel & CSV)
function exportTableData(type) {
    const table = document.getElementById("reportDataTable");
    if (!table || table.rows.length <= 1) {
        showStyledAlert("No table data available to export.", "warning");
        return;
    }

    if (type === "excel") {
        const wb = XLSX.utils.table_to_book(table, { sheet: "Report Log" });
        XLSX.writeFile(wb, "LLR_Report_Export.xlsx");
    } else if (type === "csv") {
        const wb = XLSX.utils.table_to_book(table, { sheet: "Report Log" });
        XLSX.writeFile(wb, "LLR_Report_Export.csv");
    }
}

// Utility Helpers & Custom Styled Alerts
function toggleStatusTray(show, message, type) {
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
        alertContainer.style.cssText = "position: fixed; top: 24px; right: 24px; z-index: 1080; display: flex; flex-direction: column; gap: 12px;";
        document.body.appendChild(alertContainer);
    }

    const alertId = "alert-" + Date.now();
    const bgColors = { success: "bg-success", danger: "bg-danger", warning: "bg-warning text-dark", info: "bg-dark text-white" };
    const icons = { success: "bi-check-circle-fill", danger: "bi-exclamation-triangle-fill", warning: "bi-exclamation-octagon-fill", info: "bi-info-circle-fill" };

    const alertEl = document.createElement("div");
    alertEl.id = alertId;
    alertEl.className = `alert ${bgColors[type] || 'bg-dark'} text-white shadow-lg border-0 rounded-4 p-3 d-flex align-items-center gap-3 alert-dismissible fade show`;
    alertEl.style.cssText = "min-width: 320px; backdrop-filter: blur(12px); font-size: 0.9rem; font-weight: 600;";
    alertEl.innerHTML = `
        <i class="bi ${icons[type] || 'bi-bell-fill'} fs-4"></i>
        <div class="flex-grow-1">${message}</div>
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

function showToast(message) {
    document.getElementById("copyToastMessage").textContent = message;
    const toast = new bootstrap.Toast(document.getElementById("copyToast"));
    toast.show();
}