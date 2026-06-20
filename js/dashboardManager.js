// CONTROLLER LOGIC HUB FOR SYSTEM OPERATION TELEMETRY MATRIX DYNAMICS
const SHEET_API_URL = ENV.SHEET_API_URL;

let localCacheTelemetryCollection = [];

document.addEventListener("DOMContentLoaded", () => {
    // Stamp local layout date target attributes onto document body root node for print structures
    const rawToday = new Date();
    const formattedToday = `${String(rawToday.getDate()).padStart(2, '0')}-${String(rawToday.getMonth() + 1).padStart(2, '0')}-${rawToday.getFullYear()}`;
    document.body.setAttribute("data-print-date", formattedToday);

    // Wire up telemetry execution trigger clicks handles hooks
    fetchActiveTelemetryDashboardData();
    document.getElementById("refreshDashboardBtn").addEventListener("click", fetchActiveTelemetryDashboardData);
    document.getElementById("exportCsvBtn").addEventListener("click", executeSpreadsheetDataExporterRoutine);
    document.getElementById("printPdfBtn").addEventListener("click", () => window.print());
    document.getElementById("dashStartDate").addEventListener("change", evaluateRealtimeTimeframeFilters);
    document.getElementById("dashEndDate").addEventListener("change", evaluateRealtimeTimeframeFilters);
    
    document.getElementById("clearDashFilterBtn").addEventListener("click", () => {
        document.getElementById("dashStartDate").value = "";
        document.getElementById("dashEndDate").value = "";
        processAndRenderTelemetry(localCacheTelemetryCollection);
    });
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

async function fetchActiveTelemetryDashboardData() {
    const tableBody = document.getElementById("criticalActionTableBody");
    tableBody.innerHTML = `<tr><td colspan="5" class="text-center py-5 text-muted small"><div class="spinner-border spinner-border-sm text-dark me-2"></div>Syncing live database telemetry metrics parameters...</td></tr>`;

    try {
        const response = await fetch(SHEET_API_URL);
        if (!response.ok) throw new Error(`HTTP data stream link connection breakdown: ${response.status}`);
        
        const parseResult = await response.json();
        if (parseResult.status === "success") {
            localCacheTelemetryCollection = parseResult.data || [];
            processAndRenderTelemetry(localCacheTelemetryCollection);
        } else {
            throw new Error(parseResult.message || "Database engine tracking matrices logs mapping refused.");
        }
    } catch (fault) {
        console.error("Dashboard calculation stack trace fault error:", fault);
        tableBody.innerHTML = `<tr><td colspan="5" class="text-center text-danger py-4 fw-bold">❌ Telemetry Offline<br><span class="small fw-normal text-muted">${fault.message}</span></td></tr>`;
    }
}

function evaluateRealtimeTimeframeFilters() {
    const startRangeStr = document.getElementById("dashStartDate").value;
    const endRangeStr = document.getElementById("dashEndDate").value;

    if (!startRangeStr || !endRangeStr) return;

    const startThreshold = new Date(startRangeStr).setHours(0,0,0,0);
    const endThreshold = new Date(endRangeStr).setHours(23,59,59,999);

    const isolatedFilteredDataset = localCacheTelemetryCollection.filter(row => {
        const currentIssueDate = parseStringToJsDate(row.issue_date);
        return currentIssueDate && currentIssueDate.getTime() >= startThreshold && currentIssueDate.getTime() <= endThreshold;
    });

    processAndRenderTelemetry(isolatedFilteredDataset);
}

// =========================================================================
// OPERATIONAL ANALYTICS AND COMPILATION RENDER PROCESSING MATRIX
// =========================================================================
function processAndRenderTelemetry(targetDatasetArray) {
    const rightNow = new Date();
    
    let totalLlrCount = targetDatasetArray.length;
    let expiredCount = 0, expiringSoonCount = 0, dlIssuedCount = 0;
    
    let vehicleClassDistributionMap = {};
    let attentionPriorityList = [];
    
    // Initialize Category 1 Workload arrays allocation slots strictly
    let weeklyDaysCountersMap = { "Sunday": 0, "Monday": 0, "Tuesday": 0, "Wednesday": 0, "Thursday": 0, "Friday": 0, "Saturday": 0 };

    targetDatasetArray.forEach(item => {
        if (item.dl_issued === "Yes") dlIssuedCount++;

        // Unify split category inversion patterns safely alphabetical remapping
        let rawClass = item.vehicle_class ? item.vehicle_class.toString().trim() : "Unclassed";
        if (rawClass.includes(",")) {
            rawClass = rawClass.split(",").map(str => str.trim()).sort().join(", "); 
        }
        vehicleClassDistributionMap[rawClass] = (vehicleClassDistributionMap[rawClass] || 0) + 1;

        // Process Weekly Workload Allocation distribution targets matches
        const jsIssueDate = parseStringToJsDate(item.issue_date);
        if (jsIssueDate) {
            const dayNameIndex = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][jsIssueDate.getDay()];
            weeklyDaysCountersMap[dayNameIndex]++;
        }

        const jsExpiry = parseStringToJsDate(item.expiry_date);
        if (jsExpiry) {
            const msLeft = jsExpiry.getTime() - rightNow.getTime();
            const daysLeft = Math.ceil(msLeft / (1000 * 60 * 60 * 24));

            if (daysLeft < 0) {
                expiredCount++;
                if (item.dl_issued !== "Yes") {
                    attentionPriorityList.push({ item, daysLeft, label: "EXPIRED" });
                }
            } else if (daysLeft <= 30) {
                expiringSoonCount++;
                if (item.dl_issued !== "Yes") {
                    attentionPriorityList.push({ item, daysLeft, label: "CRITICAL" });
                }
            }
        }
    });

    // Populate Matrix Counter Text Fields Values
    document.getElementById("metricTotalLlr").innerText = totalLlrCount;
    document.getElementById("metricExpired").innerText = expiredCount;
    document.getElementById("metricExpiringSoon").innerText = expiringSoonCount;
    document.getElementById("metricDlIssued").innerText = dlIssuedCount;

    // 1. RENDER ACTIVITY GRID MATRIX BAR CHART CHANNELS (Category 1 Volume)
    const workloadGridContainer = document.getElementById("weeklyWorkloadGrid");
    workloadGridContainer.innerHTML = "";
    
    // Discover peak workday index to scale relative widths cleanly
    const peakDayVolumeMax = Math.max(...Object.values(weeklyDaysCountersMap), 1);
    
    Object.entries(weeklyDaysCountersMap).forEach(([dayName, dayTotalCount]) => {
        const percentageWorkloadWidth = Math.round((dayTotalCount / peakDayVolumeMax) * 100);
        workloadGridContainer.innerHTML += `
            <div class="matrix-grid-row">
                <div class="matrix-day-label">${dayName.substring(0, 3)}</div>
                <div class="matrix-bar-track">
                    <div class="matrix-bar-fill" style="width: ${percentageWorkloadWidth}%;"></div>
                    <div class="matrix-bar-value">${dayTotalCount} forms</div>
                </div>
            </div>`;
    });

    // 2. RENDER SHIFT DISTRIBUTIONS PROGRESS METRIC SHARE (Category 6)
    const distContainer = document.getElementById("distributionContainer");
    distContainer.innerHTML = "";

    if (Object.keys(vehicleClassDistributionMap).length === 0) {
        distContainer.innerHTML = `<div class="text-muted text-center small py-4">No categories recorded inside current timeframe bounds.</div>`;
    } else {
        Object.entries(vehicleClassDistributionMap).forEach(([className, totalVolume]) => {
            const percentageUsedShare = totalLlrCount > 0 ? Math.round((totalVolume / totalLlrCount) * 100) : 0;
            distContainer.innerHTML += `
                <div class="distribution-row">
                    <div class="d-flex justify-content-between small fw-bold text-dark">
                        <span><i class="bi bi-car-front-fill me-1 text-secondary"></i> ${className}</span>
                        <span class="text-secondary">${totalVolume} items (${percentageUsedShare}%)</span>
                    </div>
                    <div class="distribution-progress-track">
                        <div class="distribution-progress-bar" style="width: ${percentageUsedShare}%;"></div>
                    </div>
                </div>`;
        });
    }

    // 3. RENDER PURE CSS CONIC DONUT RING CHART MATRIX
    const validityContainer = document.getElementById("validityBalanceContainer");
    const functionalValidTotal = totalLlrCount - expiredCount;
    const generalValidPercentage = totalLlrCount > 0 ? Math.round((functionalValidTotal / totalLlrCount) * 100) : 0;
    const exceptionExpiredPercentage = totalLlrCount > 0 ? 100 - generalValidPercentage : 0;
    const conicDegreesEndValue = Math.round((generalValidPercentage / 100) * 360);

    validityContainer.innerHTML = `
        <div class="validity-donut-chart" style="background: conic-gradient(#198754 0deg ${conicDegreesEndValue}deg, #dc3545 ${conicDegreesEndValue}deg 360deg)">
            <div class="validity-donut-center">
                <span>${generalValidPercentage}%</span>
                <span class="text-muted text-uppercase fw-bold" style="font-size: 0.65rem; letter-spacing: 0.05em;">Valid Balance</span>
            </div>
        </div>
        <div class="d-flex justify-content-center gap-4 mt-2">
            <div class="small fw-bold text-success"><i class="bi bi-circle-fill me-1"></i> Valid (${generalValidPercentage}%)</div>
            <div class="small fw-bold text-danger"><i class="bi bi-circle-fill me-1"></i> Expired (${exceptionExpiredPercentage}%)</div>
        </div>`;

    // 4. HYDRATE HIGH PRIORITY EXPRIATION DATA ROWS TABLE
    const tableBody = document.getElementById("criticalActionTableBody");
    if (attentionPriorityList.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-4 small">Everything clear! No high-priority expiration actions flagged.</td></tr>`;
        return;
    }

    attentionPriorityList.sort((first, second) => first.daysLeft - second.daysLeft);

    let rowsHtml = "";
    attentionPriorityList.forEach(node => {
        let statusStringLabel = "";
        if (node.label === "EXPIRED") {
            statusStringLabel = `<span class="text-danger fw-bold font-monospace">Expired (${Math.abs(node.daysLeft)}d ago)</span>`;
        } else {
            statusStringLabel = `<span class="text-warning fw-bold font-monospace">Critical (${node.daysLeft}d left)</span>`;
        }

        rowsHtml += `
            <tr>
                <td class="ps-4 fw-bold text-dark small">${node.item.llr_number || "-"}</td>
                <td class="fw-semibold text-secondary">${node.item.name || "-"}</td>
                <td class="small font-monospace">${node.item.mobile_number || "-"}</td>
                <td class="small text-muted">${node.item.expiry_date || "-"}</td>
                <td class="pe-4 text-end small">${statusStringLabel}</td>
            </tr>`;
    });
    tableBody.innerHTML = rowsHtml;
}

// =========================================================================
// SPREADSHEET INGESTION EXPORTER SYSTEM AUTOMATED FILE DOWNLOADER
// =========================================================================
function executeSpreadsheetDataExporterRoutine() {
    if (localCacheTelemetryCollection.length === 0) {
        alert("Action Aborted: No valid data fields loaded available to export.");
        return;
    }

    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "LLR Number,Applicant Name,Vehicle Class,Mobile Number,Expiry Date,DL Issued Status\n";

    localCacheTelemetryCollection.forEach(row => {
        const llr = row.llr_number || "-";
        const name = row.name || "-";
        const vClass = row.vehicle_class || "-";
        const mobile = row.mobile_number || "-";
        const expiry = row.expiry_date || "-";
        const dl = row.dl_issued || "No";
        csvContent += `"${llr}","${name}","${vClass}","${mobile}","${expiry}","${dl}"\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", encodedUri);
    downloadAnchor.setAttribute("download", `LLR_Global_Analytics_Telemetry_${document.body.getAttribute("data-print-date")}.csv`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    document.body.removeChild(downloadAnchor);
}