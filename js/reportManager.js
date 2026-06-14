// DECUPLED COMPLIANCE REPORTS CONTROLLER LOGIC ENGINE
const SHEET_API_URL = ENV.SHEET_API_URL;

let localDatabaseRecordsCache = [];
let operationalActiveFilter = "31DAYS"; // Default active selector target parameter 

document.addEventListener("DOMContentLoaded", () => {
    const todayStr = new Date().toLocaleDateString('en-IN', { dateStyle: 'long' });
    document.body.setAttribute('data-print-date', todayStr);

    fetchRemoteDataAndCompileReports();
    
    // Wire up interactive controller triggers
    document.getElementById("refreshReportBtn").addEventListener("click", fetchRemoteDataAndCompileReports);
    document.getElementById("btnFilter31Days").addEventListener("click", () => setReportSelectionView("31DAYS"));
    document.getElementById("btnFilterCurrentMonth").addEventListener("click", () => setReportSelectionView("CURR_MONTH"));
    
    document.getElementById("neglectDlIssuedCheckbox").addEventListener("change", () => {
        executeReportFilteringPipeline();
        calculateFloatingBadgeNotificationCounters();
    });

    document.getElementById("selectVehicleClassFilter").addEventListener("change", (e) => {
        if(e.target.value !== "ALL") setReportSelectionView("CLASS");
        else setReportSelectionView("ALL");
    });
    
    document.getElementById("rangeStartDate").addEventListener("change", () => setReportSelectionView("RANGE"));
    document.getElementById("rangeEndDate").addEventListener("change", () => setReportSelectionView("RANGE"));
    document.getElementById("printReportBtn").addEventListener("click", () => window.print());
});

/**
 * STRICT MANUAL PARSER: Converts standard DD-MM-YYYY strings accurately into evaluatable JS dates
 */
function parseDatabaseDate(dateStr) {
    if (!dateStr || dateStr === "-" || dateStr.toString().trim() === "") return null;
    let cleanStr = dateStr.toString().split(" ")[0].trim();
    
    if (cleanStr.includes("T")) {
        let parts = cleanStr.split("T")[0].split("-");
        if (parts.length === 3 && parts[0].length === 4) {
            return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
        }
    }
    
    cleanStr = cleanStr.replace(/\//g, "-");
    let elements = cleanStr.split("-");
    if (elements.length === 3 && elements[2].length === 4) {
        return new Date(parseInt(elements[2], 10), parseInt(elements[1], 10) - 1, parseInt(elements[0], 10));
    }
    return null;
}

/**
 * DATA PIPELINE FETCHER: Pulls data from spreadsheet core API web deployment
 */
async function fetchRemoteDataAndCompileReports() {
    const tableBody = document.getElementById("reportTableBody");
    const refreshBtn = document.getElementById("refreshReportBtn");

    refreshBtn.disabled = true;
    refreshBtn.innerText = "Syncing Data...";

    try {
        const response = await fetch(SHEET_API_URL);
        if (!response.ok) throw new Error(`HTTP data stream pipe down: ${response.status}`);
        
        const resObj = await response.json();
        if (resObj.status !== "success") throw new Error(resObj.message || "Invalid payload mapping signature.");

        localDatabaseRecordsCache = resObj.data || [];
        
        calculateFloatingBadgeNotificationCounters();
        executeReportFilteringPipeline();

    } catch (fault) {
        console.error("Reports matrix compilation crash:", fault);
        tableBody.innerHTML = `<tr><td colspan="7" class="text-center text-danger py-5 fw-bold">❌ Connection Interrupted: ${fault.message}</td></tr>`;
    } finally {
        refreshBtn.disabled = false;
        refreshBtn.innerText = "🔄 Sync Data Rows";
    }
}

/**
 * FLOATING NOTIFICATION BADGES COUNTER WORKSPACE
 */
function calculateFloatingBadgeNotificationCounters() {
    const today = new Date(); today.setHours(0,0,0,0);
    const hideDlIssued = document.getElementById("neglectDlIssuedCheckbox").checked;
    
    let count31Days = 0;
    let countThisMonth = 0;

    localDatabaseRecordsCache.forEach(item => {
        if (hideDlIssued && item.dl_issued === "Yes") return;

        const issueDate = parseDatabaseDate(item.issue_date);
        if (issueDate) {
            const timeDeltaMs = today.getTime() - issueDate.getTime();
            const daysPassed = Math.floor(timeDeltaMs / (1000 * 60 * 60 * 24));
            if (daysPassed >= 31) count31Days++;
        }

        const expiryDate = parseDatabaseDate(item.expiry_date);
        if (expiryDate) {
            if (expiryDate.getMonth() === today.getMonth() && expiryDate.getFullYear() === today.getFullYear()) {
                countThisMonth++;
            }
        }
    });

    const b31 = document.getElementById("badge31Days");
    const bMonth = document.getElementById("badgeCurrentMonth");

    if(count31Days > 0) { b31.innerText = count31Days; b31.classList.remove("d-none"); } else { b31.classList.add("d-none"); }
    if(countThisMonth > 0) { bMonth.innerText = countThisMonth; bMonth.classList.remove("d-none"); } else { bMonth.classList.add("d-none"); }
}

/**
 * VISUAL CONTROLLER LAYER ACTION VIEW BUFFER
 */
function setReportSelectionView(targetFilter) {
    operationalActiveFilter = targetFilter;
    
    document.querySelectorAll(".report-selector-btn").forEach(btn => btn.classList.remove("active"));
    
    if (targetFilter === "31DAYS") document.getElementById("btnFilter31Days").classList.add("active");
    if (targetFilter === "CURR_MONTH") document.getElementById("btnFilterCurrentMonth").classList.add("active");
    
    executeReportFilteringPipeline();
}

/**
 * COMPLIANCE EXECUTION LOGIC MATRIX PIPELINE
 */
function executeReportFilteringPipeline() {
    const today = new Date(); today.setHours(0,0,0,0);
    const hideDlIssued = document.getElementById("neglectDlIssuedCheckbox").checked;
    
    let baseWorkingDataset = localDatabaseRecordsCache;
    if (hideDlIssued) {
        baseWorkingDataset = localDatabaseRecordsCache.filter(item => item.dl_issued !== "Yes");
    }

    let filteredResults = [];
    let titleString = "Master Pending Registry Output";

    switch (operationalActiveFilter) {
        
        case "31DAYS":
            titleString = "📅 Milestone Met: Passed 31 Days From Issue Date";
            filteredResults = baseWorkingDataset.filter(item => {
                const issueDate = parseDatabaseDate(item.issue_date);
                if (!issueDate) return false;
                const daysPassed = Math.floor((today.getTime() - issueDate.getTime()) / (1000 * 60 * 60 * 24));
                return daysPassed >= 31;
            });
            break;

        case "CURR_MONTH":
            titleString = "🚨 Critical Scope: Expiring within Current Month Horizon";
            filteredResults = baseWorkingDataset.filter(item => {
                const expiryDate = parseDatabaseDate(item.expiry_date);
                return expiryDate && expiryDate.getMonth() === today.getMonth() && expiryDate.getFullYear() === today.getFullYear();
            });
            break;

        case "CLASS":
            const targetClassValue = document.getElementById("selectVehicleClassFilter").value;
            titleString = `🚗 Classification Audit Matrix Breakdown: [ ${targetClassValue.replace(/_/g, " ")} ]`;
            
            filteredResults = baseWorkingDataset.filter(item => {
                if (!item.vehicle_class) return false;
                const recordClass = item.vehicle_class.toUpperCase().replace(/\s+/g, "");

                // COMPREHENSIVE COMBINATION PATTERN FILTER LOOKUPS
                if (targetClassValue === "MCWOG_OR_MCWG_AND_LMV") {
                    return (recordClass.includes("MCWOG") && recordClass.includes("LMV")) || 
                           (recordClass.includes("MCWG") && recordClass.includes("LMV"));
                }
                
                // Strict isolated classifications scanner rules path
                return recordClass === targetClassValue;
            });
            break;

        case "RANGE":
            const startStr = document.getElementById("rangeStartDate").value;
            const endStr = document.getElementById("rangeEndDate").value;
            if(!startStr || !endStr) return; 
            
            const startDate = new Date(startStr); startDate.setHours(0,0,0,0);
            const endDate = new Date(endStr); endDate.setHours(23,59,59,999);
            
            titleString = `🔍 Custom Issue Range (Crossed 31 Days): [ ${startStr} ] to [ ${endStr} ]`;
            
            // FILTER RULE 1: Not expired yet, but has crossed the 31-day milestone inside the selected range boundaries
            filteredResults = baseWorkingDataset.filter(item => {
                const issueDate = parseDatabaseDate(item.issue_date);
                const expiryDate = parseDatabaseDate(item.expiry_date);
                
                if (!issueDate || !expiryDate) return false;

                // Enforce range boundaries check directly on the core issue date
                const fitsInSelectedRange = issueDate.getTime() >= startDate.getTime() && issueDate.getTime() <= endDate.getTime();
                
                // Enforce 31-day threshold verification path checks
                const timeDeltaMs = today.getTime() - issueDate.getTime();
                const daysPassedSinceIssue = Math.floor(timeDeltaMs / (1000 * 60 * 60 * 24));
                
                const hasCrossed31Days = daysPassedSinceIssue >= 31;
                const isNotExpiredYet = expiryDate.getTime() >= today.getTime();

                return fitsInSelectedRange && hasCrossed31Days && isNotExpiredYet;
            });
            break;

        default:
            titleString = "Master Registry Data Rows Ledgers";
            filteredResults = baseWorkingDataset;
            break;
    }

    document.getElementById("reportTableTitle").innerText = `${titleString} (${filteredResults.length} Items Listed)`;
    renderReportRowsToGrid(filteredResults);
}

/**
 * INTERFACE INJECTOR DATA GRID STREAM RENDERER
 */
function renderReportRowsToGrid(dataList) {
    const tableBody = document.getElementById("reportTableBody");
    const today = new Date(); today.setHours(0,0,0,0);

    if (dataList.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="7" class="text-center py-5 text-muted fw-semibold">No operational records match the chosen reporting parameters filter rules.</td></tr>`;
        return;
    }

    let html = "";
    dataList.forEach(item => {
        const expDate = parseDatabaseDate(item.expiry_date);
        let timelineText = "Valid";
        let textStyleClass = "text-success fw-bold";

        if (expDate) {
            expDate.setHours(0,0,0,0);
            const diffDays = Math.ceil((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
            if (diffDays < 0) {
                timelineText = `Expired (${Math.abs(diffDays)} Days Ago)`;
                textStyleClass = "text-danger fw-bold";
            } else if (diffDays <= 30) {
                timelineText = `Expiring in ${diffDays} Days`;
                textStyleClass = "text-warning fw-bold";
            } else {
                timelineText = `Healthy (${diffDays} Days Remaining)`;
            }
        }

        html += `
            <tr>
                <td class="ps-3 fw-bold text-dark">${item.llr_number || "-"}</td>
                <td class="fw-semibold">${item.name || "-"}</td>
                <td><span class="badge bg-dark">${item.vehicle_class || "-"}</span></td>
                <td class="font-monospace small">${item.mobile_number || "-"}</td>
                <td class="small text-secondary">${item.issue_date || "-"}</td>
                <td class="small text-secondary fw-bold">${item.expiry_date || "-"}</td>
                <td class="pe-3 ${textStyleClass} small">${timelineText}</td>
            </tr>`;
    });

    tableBody.innerHTML = html;
}