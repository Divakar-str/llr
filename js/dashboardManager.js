// OPERATIONAL ANALYTICS CORE LIFECYCLE CONTROLLER
const SHEET_API_URL = ENV.SHEET_API_URL;

let chartInstancesCollection = {
    vehicleChart: null,
    validityChart: null
};

// SAFE TIMING TRACKER INTERACTION ENTRANCE INITIALIZATION LOOP
document.addEventListener("DOMContentLoaded", () => {
    // Verify structural dependency frameworks are loaded on window context safely first
    if (typeof bootstrap !== 'undefined' && typeof Chart !== 'undefined') {
        initializeDashboardApp();
    } else {
        console.warn("Libraries initialization lagging behind script. Polling engine fallback activated...");
        const safetyPollerInterval = setInterval(() => {
            if (typeof bootstrap !== 'undefined' && typeof Chart !== 'undefined') {
                clearInterval(safetyPollerInterval);
                initializeDashboardApp();
            }
        }, 100);
    }
});

function initializeDashboardApp() {
    executeMetricsPipelineSync();
    const refreshBtn = document.getElementById("refreshDashboardBtn");
    if (refreshBtn) {
        refreshBtn.addEventListener("click", executeMetricsPipelineSync);
    }
}

/**
 * MANDATORY FIXED DD-MM-YYYY DATE PARSER:
 * Decouples elements row values by index mapping arrays to completely eliminate
 * system runtime zone offsets and cross-browser calculation interpretation anomalies.
 */
function parseStringToJsDate(dateStr) {
    if (!dateStr || dateStr === "-" || dateStr.toString().trim() === "") return null;
    
    let cleanStr = dateStr.toString().split(" ")[0].trim();
    
    // Check and neutralize accidental fallback ISO text dumps from Google (YYYY-MM-DD)
    if (cleanStr.includes("T")) {
        let parts = cleanStr.split("T")[0].split("-");
        if (parts.length === 3 && parts[0].length === 4) {
            return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
        }
    }
    
    // Enforce uniform hyphen tracking configurations
    cleanStr = cleanStr.replace(/\//g, "-");
    let elements = cleanStr.split("-");
    
    // STRICT INDEX MAPPING: [0]=Day, [1]=Month, [2]=Year
    if (elements.length === 3 && elements[2].length === 4) {
        let day = parseInt(elements[0], 10);
        let month = parseInt(elements[1], 10) - 1; // JS 0-Indexed Month Rules (0=Jan, 6=July)
        let year = parseInt(elements[2], 10);
        
        let dateObj = new Date(year, month, day);
        if (!isNaN(dateObj.getTime())) return dateObj;
    }
    
    return null;
}

/**
 * MASTER DATA RETRIEVAL ROUTINE: Pulls sheet values and triggers evaluation pipelines
 */
async function executeMetricsPipelineSync() {
    const refreshBtn = document.getElementById("refreshDashboardBtn");
    if (refreshBtn) {
        refreshBtn.disabled = true;
        refreshBtn.innerText = "Syncing Telemetry...";
    }

    try {
        const networkResponse = await fetch(SHEET_API_URL);
        if (!networkResponse.ok) throw new Error(`HTTP status failure response code: ${networkResponse.status}`);
        
        const payloadData = await networkResponse.json();
        if (payloadData.status !== "success") throw new Error(payloadData.message || "Telemetry mismatch exception.");

        const activeRowsArray = payloadData.data || [];
        processComplianceMetricsEngine(activeRowsArray);

    } catch (faultTrace) {
        console.error("Dashboard engine failed to compile metrics visual assets:", faultTrace);
        alert("Failed to sync structural monitoring metrics matrix rows: " + faultTrace.message);
    } finally {
        if (refreshBtn) {
            refreshBtn.disabled = false;
            refreshBtn.innerText = "🔄 Refresh Telemetry";
        }
    }
}

/**
 * COMPLIANCE METRICS PROCESSOR: Runs time-horizon analysis over rows array sets
 */
function processComplianceMetricsEngine(records) {
    const rightNow = new Date();
    // Normalize rightNow to midnight to keep day calculation math exact
    rightNow.setHours(0,0,0,0);
    
    let totalCount = records.length;
    let expiredCount = 0;
    let expiringSoonCount = 0;
    let activeDlCount = 0;
    
    let mapVehicleCounts = { "MCWOG": 0, "MCWG": 0, "LMV": 0, "TRANS": 0 };
    let highPriorityRecordsArray = [];

    records.forEach(item => {
        if (item.dl_issued === "Yes") activeDlCount++;

        // Evaluate calendar parameters based on strict index matching output maps
        const expiryDateObj = parseStringToJsDate(item.expiry_date);
        let timelineStatusLabel = "";
        let badgeStyleClass = "";
        let isCritical = false;

        if (expiryDateObj) {
            expiryDateObj.setHours(0,0,0,0);
            const timeDeltaMs = expiryDateObj.getTime() - rightNow.getTime();
            const daysRemaining = Math.ceil(timeDeltaMs / (1000 * 60 * 60 * 24));

            if (daysRemaining < 0) {
                expiredCount++;
                timelineStatusLabel = `Expired (${Math.abs(daysRemaining)} Days Ago)`;
                badgeStyleClass = "bg-danger text-white";
                isCritical = true;
            } else if (daysRemaining <= 30) {
                expiringSoonCount++;
                timelineStatusLabel = `Expiring in ${daysRemaining} Days`;
                badgeStyleClass = "bg-warning text-dark";
                isCritical = true;
            }
        }

        if (isCritical) {
            highPriorityRecordsArray.push({
                llr_number: item.llr_number || "-",
                name: item.name || "-",
                mobile_number: item.mobile_number || "-",
                expiry_date: item.expiry_date || "-",
                statusLabel: timelineStatusLabel,
                badgeClass: badgeStyleClass
            });
        }

        // Aggregate classification counters metrics mapping
        if (item.vehicle_class && item.vehicle_class !== "-") {
            const categories = item.vehicle_class.split(",");
            categories.forEach(tag => {
                const cleanKey = tag.trim().toUpperCase();
                if (cleanKey !== "" && mapVehicleCounts[cleanKey] !== undefined) {
                    mapVehicleCounts[cleanKey]++;
                }
            });
        }
    });

    // Populate scorecard numerical displays
    document.getElementById("metricTotalLlr").innerText = totalCount;
    document.getElementById("metricExpired").innerText = expiredCount;
    document.getElementById("metricExpiringSoon").innerText = expiringSoonCount;
    document.getElementById("metricDlIssued").innerText = activeDlCount;

    // Render data tables lists and update canvas blocks
    populateAttentionBoardTable(highPriorityRecordsArray);
    buildGraphicalTelemetryCharts(mapVehicleCounts, expiredCount, expiringSoonCount, (totalCount - expiredCount - expiringSoonCount));
}

function populateAttentionBoardTable(criticalRecords) {
    const tableBody = document.getElementById("criticalActionTableBody");
    
    if (criticalRecords.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="5" class="text-center text-success py-4 fw-semibold">✓ All documents are fully compliant and healthy!</td></tr>`;
        return;
    }

    let compiledHtmlRows = "";
    criticalRecords.forEach(row => {
        compiledHtmlRows += `
            <tr>
                <td class="ps-3 fw-bold text-dark">${row.llr_number}</td>
                <td class="fw-medium">${row.name}</td>
                <td class="small font-monospace">${row.mobile_number}</td>
                <td class="small text-secondary">${row.expiry_date}</td>
                <td class="pe-3"><span class="badge ${row.badgeClass} fw-bold px-2.5 py-1.5">${row.statusLabel}</span></td>
            </tr>`;
    });
    tableBody.innerHTML = compiledHtmlRows;
}

function buildGraphicalTelemetryCharts(vehicleMap, expired, expiring, healthy) {
    if (chartInstancesCollection.vehicleChart) chartInstancesCollection.vehicleChart.destroy();
    if (chartInstancesCollection.validityChart) chartInstancesCollection.validityChart.destroy();

    const vehicleLabels = Object.keys(vehicleMap);
    const vehicleValues = Object.values(vehicleMap);

    // --- CHART A: VEHICLE SPLITS BAR VISUALIZATION ---
    const vehicleCtx = document.getElementById('chartVehicleDistribution').getContext('2d');
    chartInstancesCollection.vehicleChart = new Chart(vehicleCtx, {
        type: 'bar',
        data: {
            labels: vehicleLabels,
            datasets: [{
                label: 'Active Registrations Volume',
                data: vehicleValues,
                backgroundColor: 'rgba(33, 37, 41, 0.78)',
                borderColor: '#212529',
                borderWidth: 1.5,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
        }
    });

    // --- CHART B: COMPLIANCE RATIO DONUT VISUALIZATION ---
    const validityCtx = document.getElementById('chartValidityRatio').getContext('2d');
    chartInstancesCollection.validityChart = new Chart(validityCtx, {
        type: 'doughnut',
        data: {
            labels: ['Expired', 'Expiring Soon', 'Valid / Safe'],
            datasets: [{
                data: [expired, expiring, healthy],
                backgroundColor: ['#dc3545', '#ffc107', '#198754'],
                borderColor: ['#fff', '#fff', '#fff'],
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom', labels: { boxWidth: 10, padding: 12, font: { size: 11, weight: 'bold' } } }
            }
        }
    });
}