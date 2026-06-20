// CONTROLLER INTERFACE ENGINE FOR ADVANCED RECORDS COMPLIANCE REPORTING
const SHEET_API_URL = ENV.SHEET_API_URL;

let localCacheRecordsCollection = [];
let activeReportFilterMode = "31DAYS"; // Global scope active track

document.addEventListener("DOMContentLoaded", () => {
    // Generate layout timestamp string attributes passed to print nodes
    const rawToday = new Date();
    const formattedToday = `${String(rawToday.getDate()).padStart(2, '0')}-${String(rawToday.getMonth() + 1).padStart(2, '0')}-${rawToday.getFullYear()}`;
    document.body.setAttribute("data-print-date", formattedToday);

    // Dynamic runtime UI event binds passing variables targets
    fetchActiveReportSheetData();
    document.getElementById("refreshReportBtn").addEventListener("click", fetchActiveReportSheetData);
    document.getElementById("neglectDlIssuedCheckbox").addEventListener("change", runLiveClientFiltersPipeline);
    document.getElementById("selectVehicleClassFilter").addEventListener("change", runLiveClientFiltersPipeline);
    document.getElementById("rangeStartDate").addEventListener("change", runLiveClientFiltersPipeline);
    document.getElementById("rangeEndDate").addEventListener("change", runLiveClientFiltersPipeline);
    
    // Category 7 Event Bind routines triggers hooks
    document.getElementById("exportCsvBtn").addEventListener("click", executeSpreadsheetCsvDownloader);
    document.getElementById("printReportBtn").addEventListener("click", triggerTargetedBatchPrintingRoutine);
    
    document.getElementById("selectAllRowsCheckbox").addEventListener("change", (e) => {
        const checkedState = e.target.checked;
        document.querySelectorAll(".row-select-checkbox").forEach(box => box.checked = checkedState);
    });

    // Tab Filter Selector Bind Setup Matrix Loops
    document.getElementById("btnFilter31Days").addEventListener("click", (e) => switchActiveReportTab("31DAYS", e.currentTarget));
    document.getElementById("btnFilter60Days").addEventListener("click", (e) => switchActiveReportTab("60DAYS", e.currentTarget));
    document.getElementById("btnFilterOverdue").addEventListener("click", (e) => switchActiveReportTab("OVERDUE", e.currentTarget));
    document.getElementById("btnFilterCustomRange").addEventListener("click", (e) => switchActiveReportTab("CUSTOM_RANGE", e.currentTarget));
});

function parseStringToJsDate(dateStr) {
    if (!dateStr || dateStr === "-") return null;
    let cleanStr = dateStr.toString().split(" ")[0].trim().replace(/\//g, "-");
    
    if (cleanStr.includes("T")) {
        cleanStr = cleanStr.split("T")[0];
        let parts = cleanStr.split("-");
        if (parts.length === 3 && parts[0].length === 4) {
            return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
        }
    }
    
    let elements = cleanStr.split("-");
    if (elements.length === 3 && elements[2].length === 4) {
        return new Date(parseInt(elements[2], 10), parseInt(elements[1], 10) - 1, parseInt(elements[0], 10));
    }
    return null;
}

function switchActiveReportTab(filterMode, targetButtonElement) {
    document.querySelectorAll(".report-selector-btn").forEach(btn => btn.classList.remove("active"));
    targetButtonElement.classList.add("active");
    activeReportFilterMode = filterMode;
    
    const titleTarget = document.getElementById("reportTableTitle");
    if (filterMode === "31DAYS") titleTarget.innerHTML = `<i class="bi bi-calendar-check"></i> Passed 31 Days Milestone Log`;
    else if (filterMode === "60DAYS") titleTarget.innerHTML = `<i class="bi bi-hourglass-split"></i> 60-Day Renewal Notification Tracking`;
    else if (filterMode === "OVERDUE") titleTarget.innerHTML = `<i class="bi bi-slash-circle"></i> Breached Expiry Exception Ledger`;
    else if (filterMode === "CUSTOM_RANGE") titleTarget.innerHTML = `<i class="bi bi-calendar-date-fill"></i> Custom Date Range Report Summary`;

    runLiveClientFiltersPipeline();
}

async function fetchActiveReportSheetData() {
    const tableBody = document.getElementById("reportTableBody");
    tableBody.innerHTML = `<tr><td colspan="9" class="text-center py-5 text-muted small"><div class="spinner-border spinner-border-sm text-dark me-2"></div>Syncing records rows collections from sheet data streams...</td></tr>`;

    try {
        const response = await fetch(SHEET_API_URL);
        if (!response.ok) throw new Error(`Network response error code: ${response.status}`);
        
        const parseResult = await response.json();
        if (parseResult.status === "success") {
            localCacheRecordsCollection = parseResult.data || [];
            calculateTopPanelDashboardMetrics();
            runLiveClientFiltersPipeline();
        } else {
            throw new Error(parseResult.message || "Database execution fault response string mapping.");
        }
    } catch (fault) {
        tableBody.innerHTML = `<tr><td colspan="9" class="text-center text-danger py-5 fw-bold">❌ Connection Interrupted<br><span class="small fw-normal text-muted">${fault.message}</span></td></tr>`;
    }
}

function calculateTopPanelDashboardMetrics() {
    const rightNow = new Date();
    const formattedToday = `${String(rightNow.getDate()).padStart(2, '0')}-${String(rightNow.getMonth() + 1).padStart(2, '0')}-${rightNow.getFullYear()}`;
    
    let processedToday = 0, activeCount = 0, expiredCount = 0;
    let badge31Count = 0, badge60Count = 0, badgeOverdueCount = 0;

    localCacheRecordsCollection.forEach(row => {
        const isDlIssued = row.dl_issued === "Yes";
        
        if (row.approved_date && cleanIncomingDateString(row.approved_date) === formattedToday) {
            processedToday++;
        }

        const jsIssue = parseStringToJsDate(row.issue_date);
        const jsExpiry = parseStringToJsDate(row.expiry_date);

        if (jsExpiry) {
            if (jsExpiry.getTime() >= rightNow.getTime()) activeCount++;
            else expiredCount++;
            
            const msLeft = jsExpiry.getTime() - rightNow.getTime();
            const daysLeft = Math.ceil(msLeft / (1000 * 60 * 60 * 24));
            
            if (jsIssue) {
                const daysPassed = Math.floor((rightNow.getTime() - jsIssue.getTime()) / (1000 * 60 * 60 * 24));
                if (daysPassed >= 31 && !isDlIssued) badge31Count++;
            }
            if (daysLeft > 0 && daysLeft <= 60 && !isDlIssued) badge60Count++;
            if (daysLeft < 0 && !isDlIssued) badgeOverdueCount++;
        }
    });

    document.getElementById("metricProcessedToday").innerText = processedToday;
    document.getElementById("metricActiveTotal").innerText = activeCount;
    document.getElementById("metricExpiredTotal").innerText = expiredCount;

    updateBadgeElement("badge31Days", badge31Count);
    updateBadgeElement("badge60Days", badge60Count);
    updateBadgeElement("badgeOverdue", badgeOverdueCount);
}

function updateBadgeElement(elementId, valueCount) {
    const el = document.getElementById(elementId);
    if (valueCount > 0) { el.innerText = valueCount; el.classList.remove("d-none"); }
    else { el.classList.add("d-none"); }
}

function cleanIncomingDateString(dateStr) {
    return dateStr.toString().split(" ")[0].replace(/\//g, "-").trim();
}

function runLiveClientFiltersPipeline() {
    const tableBody = document.getElementById("reportTableBody");
    const rightNow = new Date();

    const hideDlIssued = document.getElementById("neglectDlIssuedCheckbox").checked;
    const classFilter = document.getElementById("selectVehicleClassFilter").value;
    const startRange = document.getElementById("rangeStartDate").value;
    const endRange = document.getElementById("rangeEndDate").value;

    let dataset = localCacheRecordsCollection;

    if (hideDlIssued) dataset = dataset.filter(row => row.dl_issued !== "Yes");

    // 1. Core Tab Modes Allocations Routing Check
    if (activeReportFilterMode === "31DAYS") {
        dataset = dataset.filter(row => {
            const issue = parseStringToJsDate(row.issue_date);
            if (!issue) return false;
            return Math.floor((rightNow.getTime() - issue.getTime()) / (1000 * 60 * 60 * 24)) >= 31;
        });
    } else if (activeReportFilterMode === "60DAYS") {
        dataset = dataset.filter(row => {
            const expiry = parseStringToJsDate(row.expiry_date);
            if (!expiry) return false;
            const diff = Math.ceil((expiry.getTime() - rightNow.getTime()) / (1000 * 60 * 60 * 24));
            return diff > 0 && diff <= 60;
        });
    } else if (activeReportFilterMode === "OVERDUE") {
        dataset = dataset.filter(row => {
            const expiry = parseStringToJsDate(row.expiry_date);
            if (!expiry) return false;
            return Math.ceil((expiry.getTime() - rightNow.getTime()) / (1000 * 60 * 60 * 24)) < 0;
        });
    } else if (activeReportFilterMode === "CUSTOM_RANGE") {
        if (startRange && endRange) {
            const tsStart = new Date(startRange).setHours(0,0,0,0);
            const tsEnd = new Date(endRange).setHours(23,59,59,999);
            dataset = dataset.filter(row => {
                const issue = parseStringToJsDate(row.issue_date);
                return issue && issue.getTime() >= tsStart && issue.getTime() <= tsEnd;
            });
            document.getElementById("rangeStartDate").parentElement.parentElement.classList.add("range-active-glow");
        } else {
            document.getElementById("rangeStartDate").parentElement.parentElement.classList.remove("range-active-glow");
        }
    }

    // 2. Vehicle Classification Check
    if (classFilter !== "ALL") {
        if (classFilter === "MCWOG_OR_MCWG_AND_LMV") {
            dataset = dataset.filter(row => {
                const val = String(row.vehicle_class).toUpperCase();
                return (val.includes("MCWOG") || val.includes("MCWG")) && val.includes("LMV");
            });
        } else {
            dataset = dataset.filter(row => String(row.vehicle_class).toUpperCase() === classFilter);
        }
    }

    // 3. Update Custom Range Tab Badge Counters
    if (activeReportFilterMode === "CUSTOM_RANGE") {
        const badgeCustom = document.getElementById("badgeCustomRange");
        if (dataset.length > 0 && startRange && endRange) {
            badgeCustom.innerText = dataset.length;
            badgeCustom.classList.remove("d-none");
        } else {
            badgeCustom.classList.add("d-none");
        }
    }

    // Render Data Elements
    if (dataset.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="9" class="text-center py-5 text-muted small">No records match the current filter matrix splits parameters.</td></tr>`;
        return;
    }

    let html = "";
    dataset.forEach(row => {
        const jsIssue = parseStringToJsDate(row.issue_date);
        const jsExpiry = parseStringToJsDate(row.expiry_date);
        
        let visualProgressHtml = "-", timeRemainingText = "-";
        
        if (jsIssue && jsExpiry) {
            const totalLifespanMs = jsExpiry.getTime() - jsIssue.getTime();
            const elapsedMs = rightNow.getTime() - jsIssue.getTime();
            
            let percentageUsed = Math.min(100, Math.max(0, Math.floor((elapsedMs / totalLifespanMs) * 100)));
            let colorBarClass = "bg-success";
            
            if (percentageUsed >= 85) colorBarClass = "bg-danger";
            else if (percentageUsed >= 60) colorBarClass = "bg-warning";
            
            const daysLeft = Math.ceil((jsExpiry.getTime() - rightNow.getTime()) / (1000 * 60 * 60 * 24));
            timeRemainingText = daysLeft < 0 ? `Expired (${Math.abs(daysLeft)}d ago)` : `${daysLeft}d left`;

            visualProgressHtml = `
                <div class="small text-muted mb-0 font-monospace">${percentageUsed}% tracking usage scale</div>
                <div class="lifespan-progress-container">
                    <div class="lifespan-progress-bar ${colorBarClass}" style="width: ${percentageUsed}%;"></div>
                </div>
            `;
        }

        html += `
            <tr data-row-idx="${row.row_index}">
                <td class="text-center ps-3">
                    <input type="checkbox" class="form-check-input row-select-checkbox" data-llr="${row.llr_number || '-'}" style="cursor: pointer;">
                </td>
                <td class="fw-bold text-dark small">${row.llr_number || "-"}</td>
                <td class="fw-semibold text-secondary">${row.name || "-"}</td>
                <td><span class="badge bg-light text-dark border px-2.5 py-1.5">${row.vehicle_class || "-"}</span></td>
                <td class="small font-monospace fw-medium">${row.mobile_number || "-"}</td>
                <td class="small text-muted">${row.issue_date || "-"}</td>
                <td class="small text-muted">${row.expiry_date || "-"}</td>
                <td>${visualProgressHtml}</td>
                <td class="pe-4 text-end small fw-bold text-dark font-monospace">${timeRemainingText}</td>
            </tr>`;
    });
    tableBody.innerHTML = html;
}

function executeSpreadsheetCsvDownloader() {
    if (localCacheRecordsCollection.length === 0) {
        alert("Action Aborted: No valid data array fields loaded available to export.");
        return;
    }

    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "LLR Number,Applicant Name,Vehicle Class,Mobile Number,Issue Date,Expiry Date,DL Issued Status\n";

    document.querySelectorAll("#reportTableBody tr").forEach(tr => {
        const checkbox = tr.querySelector(".row-select-checkbox");
        if (checkbox) {
            const llr = tr.cells[1].innerText;
            const name = tr.cells[2].innerText;
            const vClass = tr.cells[3].innerText;
            const mobile = tr.cells[4].innerText;
            const issue = tr.cells[5].innerText;
            const expiry = tr.cells[6].innerText;
            
            const matchedRowCache = localCacheRecordsCollection.find(r => r.llr_number === llr);
            const dl = matchedRowCache ? matchedRowCache.dl_issued : "No";

            csvContent += `"${llr}","${name}","${vClass}","${mobile}","${issue}","${expiry}","${dl}"\n`;
        }
    });

    const encodedUri = encodeURI(csvContent);
    const linkContainer = document.createElement("a");
    linkContainer.setAttribute("href", encodedUri);
    linkContainer.setAttribute("download", `LLR_Registry_Report_${document.body.getAttribute("data-print-date")}.csv`);
    document.body.appendChild(linkContainer);
    linkContainer.click();
    document.body.removeChild(linkContainer);
}

function triggerTargetedBatchPrintingRoutine() {
    const selectedCheckboxes = document.querySelectorAll(".row-select-checkbox:checked");
    
    if (selectedCheckboxes.length === 0) {
        alert("Selection Required:\nPlease check at least one record row box inside the ledger grid table layout to initialize print commands.");
        return;
    }

    document.querySelectorAll("#reportTableBody tr").forEach(tr => {
        const check = tr.querySelector(".row-select-checkbox");
        if (check && !check.checked) tr.classList.add("d-none-print-bypass");
        else tr.classList.remove("d-none-print-bypass");
    });

    let styleTag = document.getElementById("print-isolation-styles");
    if (!styleTag) {
        styleTag = document.createElement("style");
        styleTag.id = "print-isolation-styles";
        document.head.appendChild(styleTag);
    }
    styleTag.innerHTML = "@media print { .d-none-print-bypass { display: none !important; } }";

    window.print();
}