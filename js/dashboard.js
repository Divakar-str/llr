document.addEventListener("DOMContentLoaded", initializeDashboardAnalyticsPipeline);

/**
 * Validates environmental endpoints and initiates database stream collection.
 */
async function initializeDashboardAnalyticsPipeline() {
    const googleSheetEndpoint = ENV.SHEET_API_URL;
    if (!googleSheetEndpoint) {
        alert("Configuration Error: API Link could not be found. Check your env.js setup.");
        return;
    }

    try {
        const response = await fetch(`${googleSheetEndpoint}?action=readAll`, { method: "GET", mode: "cors" });
        if (!response.ok) throw new Error(`HTTP Error Status: ${response.status}`);
        
        const responseData = await response.json();
        processDashboardMetricsEngine(responseData);
    } catch (connectionError) {
        console.error("Dashboard Extraction Crash Stack:", connectionError);
        alert("Failed to compile dashboard metrics data. Ensure your API link is operational.");
    }
}

/**
 * Safely parses custom string fragments back into standard Date objects.
 */
function parseCustomDate(dateStr) {
    if (!dateStr || dateStr === "-" || dateStr.trim() === "") return null;
    const pieces = dateStr.split("-");
    if (pieces.length !== 3) return null;
    return new Date(parseInt(pieces[2], 10), parseInt(pieces[1], 10) - 1, parseInt(pieces[0], 10));
}

/**
 * Calculates exact age down to day constraints relative to current runtime limits.
 */
function calculateExactAge(dobStr) {
    const dob = parseCustomDate(dobStr);
    if (!dob) return 0;
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const monthDiff = today.getMonth() - dob.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
        age--;
    }
    return age;
}

/**
 * Parses address parameters to isolate the target operational district layer context.
 */

function extractCityDistrict(addressStr) {
    if (!addressStr || addressStr.trim() === "" || addressStr === "-") {
        return "Unknown";
    }

    const upperAddr = addressStr.toUpperCase();
    const matchesWord = (word) => new RegExp(`\\b${word}\\b`, "i").test(upperAddr);

    // Tier 1: Driving School / Specific Anchors (MUST be checked FIRST)
    const isThangamariammanAnchor = (
        /THANGAMARI\s*AMMAN\b|THANGAMARIAMMAN\b|THANGAMARIAMMA\b|THANGAMARI\b/i.test(upperAddr) ||
        /\b(?:HEAVY\s+DS|MOTOR\s+DS|DRIVING\s+SCHOOL|DRIVING\s+ACADEMY)\b/i.test(upperAddr) ||
        /\b(?:THANGAMARIAMMAN\s+(?:DS|SCHOOL|HEAVY|MOTOR|ACADEMY))\b/i.test(upperAddr)
    );

    if (isThangamariammanAnchor) {
        return "Thangamariamman";
    }

    // Tier 2: Specific Town / RTO Regions
    if (matchesWord("EDAPPADI") || matchesWord("EDAPPADY")) {
        return "Edappady";
    }
    
    if (matchesWord("SANGAGIRI") || matchesWord("SANKARI") || matchesWord("SANAGIRI")) {
        return "Sankagiri";
    }

    // Tier 3: District Headquarter Fallback
    if (matchesWord("SALEM")) {
        return "Salem";
    }

    // Tier 4: Dynamic Regex Extraction (e.g., "NAMAKKAL DT", "TIRUCHENGODE TK")
    const dynamicMatch = upperAddr.match(/([A-Z\s]{2,20}?)\s*(?:TK|TALUK|DT|DISTRICT|DIST)\b/i);
    if (dynamicMatch) {
        const extracted = dynamicMatch[1].trim();
        if (extracted.length > 2) {
            return extracted.charAt(0).toUpperCase() + extracted.slice(1).toLowerCase();
        }
    }

    return "Other District";
}
/**
 * Processes data metrics pipelines and renders visualization elements.
 */
function processDashboardMetricsEngine(rows) {
    if (!Array.isArray(rows)) return;

    const today = new Date();
    const todayDay = String(today.getDate()).padStart(2, '0');
    const todayMonth = String(today.getMonth() + 1).padStart(2, '0');
    const todayYear = today.getFullYear();
    const todayStr = `${todayDay}-${todayMonth}-${todayYear}`;
    
    const currentMonthIndex = today.getMonth();
    const currentYearValue = today.getFullYear();

    let totalRecords = rows.length;
    let activeCount = 0, expiredCount = 0, expiringSoonCount = 0;
    let dlIssuedCount = 0, dlPendingCount = 0;
    let todayLlr = 0, todayDl = 0;
    let monthLlr = 0, monthDl = 0;
    let emergencyWith = 0, emergencyWithout = 0;

    // Exact Map structure as requested
    const vehicleClassMap = {
        "MCWOG": 0, 
        "MCWG": 0,
        "LMV": 0,
        "MCWOG,LMV": 0,  
        "MCWG,LMV": 0,  
        "TRANS": 0 
    };
    
    const bloodGroupMap = {};
    const relativeTypeMap = {};
    const addressSpreadMap = {};
    const ageGroupMap = { "18-20": 0,"20-25": 0,"26-35": 0, "36-50": 0, "Above 50": 0, "Under 18": 0 };
    
    const dailyIssueMap = {}, monthlyIssueMap = {}, expiryTimelineMap = {};

    rows.forEach(row => {
        const issueDateObj = parseCustomDate(row.issue_date);
        const expiryDateObj = parseCustomDate(row.expiry_date);
        const approvedDateObj = parseCustomDate(row.approved_date);

        if (expiryDateObj) {
            const trackingTimeDiff = expiryDateObj - today;
            const remainingDays = Math.ceil(trackingTimeDiff / (1000 * 60 * 60 * 24));
            
            if (remainingDays < 0) {
                expiredCount++;
            } else {
                activeCount++;
                if (remainingDays <= 30) expiringSoonCount++;
            }

            if (row.expiry_date && row.expiry_date !== "-") {
                expiryTimelineMap[row.expiry_date] = (expiryTimelineMap[row.expiry_date] || 0) + 1;
            }
        }

        if (row.dl_issued && row.dl_issued.toUpperCase() === "YES") {
            dlIssuedCount++;
            if (row.approved_date && row.approved_date.split(" ")[0] === todayStr) todayDl++;
            if (approvedDateObj && approvedDateObj.getMonth() === currentMonthIndex && approvedDateObj.getFullYear() === currentYearValue) monthDl++;
        } else {
            dlPendingCount++;
        }

        if (row.issue_date === todayStr) todayLlr++;
        if (issueDateObj && issueDateObj.getMonth() === currentMonthIndex && issueDateObj.getFullYear() === currentYearValue) monthLlr++;
        
        if (row.issue_date && row.issue_date !== "-") {
            dailyIssueMap[row.issue_date] = (dailyIssueMap[row.issue_date] || 0) + 1;
            
            if (issueDateObj) {
                const monthlyTokenKey = `${String(issueDateObj.getMonth() + 1).padStart(2, '0')}-${issueDateObj.getFullYear()}`;
                monthlyIssueMap[monthlyTokenKey] = (monthlyIssueMap[monthlyTokenKey] || 0) + 1;
            }
        }

        // --- ENHANCED VEHICLE CLASS TALLYING ---
        if (row.vehicle_class && row.vehicle_class !== "-") {
            const rawClass = row.vehicle_class.trim().toUpperCase();

            // 1. Direct match check (Catches exact combined strings like "MCWG,LMV" or "MCWOG,LMV")
            if (vehicleClassMap[rawClass] !== undefined) {
                vehicleClassMap[rawClass]++;
            } else {
                // 2. Token split fallback (In case tokens appear in different orders or unknown categories)
                row.vehicle_class.split(",").forEach(cls => {
                    const formattedClass = cls.trim().toUpperCase();
                    if (vehicleClassMap[formattedClass] !== undefined) {
                        vehicleClassMap[formattedClass]++;
                    } else if (formattedClass !== "") {
                        vehicleClassMap[formattedClass] = (vehicleClassMap[formattedClass] || 0) + 1;
                    }
                });
            }
        }

        if (row.blood_group && row.blood_group !== "-") {
            const bg = row.blood_group.toUpperCase().trim();
            bloodGroupMap[bg] = (bloodGroupMap[bg] || 0) + 1;
        }

        const calculatedAge = calculateExactAge(row.date_of_birth);
        if (calculatedAge > 0) {
            if (calculatedAge < 18) ageGroupMap["Under 18"]++;
            else if (calculatedAge <= 20) ageGroupMap["18-20"]++;
            else if (calculatedAge <= 25) ageGroupMap["20-25"]++;
            else if (calculatedAge <= 35) ageGroupMap["26-35"]++;
            else if (calculatedAge <= 50) ageGroupMap["36-50"]++;
            else ageGroupMap["Above 50"]++;
        }

        if (row.relative_type && row.relative_type !== "-") {
            const rt = row.relative_type.trim();
            relativeTypeMap[rt] = (relativeTypeMap[rt] || 0) + 1;
        }

        if (row.emergency_mobile && row.emergency_mobile.trim() !== "" && row.emergency_mobile !== "-") {
            emergencyWith++;
        } else {
            emergencyWithout++;
        }

        const district = extractCityDistrict(row.present_address);
        addressSpreadMap[district] = (addressSpreadMap[district] || 0) + 1;
    });

    document.getElementById("statTotalLlr").innerText = totalRecords;
    document.getElementById("statActiveLlr").innerText = activeCount;
    document.getElementById("statExpiredLlr").innerText = expiredCount;
    document.getElementById("statExpiringSoon").innerText = expiringSoonCount;
    document.getElementById("statDlIssued").innerText = dlIssuedCount;
    document.getElementById("statDlPending").innerText = dlPendingCount;
    document.getElementById("statTodayLlr").innerText = todayLlr;
    document.getElementById("statTodayDl").innerText = todayDl;
    document.getElementById("statMonthLlr").innerText = monthLlr;
    document.getElementById("statMonthDl").innerText = monthDl;
    document.getElementById("statEmergencyWith").innerText = emergencyWith;
    document.getElementById("statEmergencyWithout").innerText = emergencyWithout;

    const conversionRatePercent = totalRecords > 0 ? Math.round((dlIssuedCount / totalRecords) * 100) : 0;
    document.getElementById("txtConversionPercent").innerText = `${conversionRatePercent}%`;

    const sortedDailyLabels = Object.keys(dailyIssueMap).sort((a,b) => parseCustomDate(a) - parseCustomDate(b));
    const sortedDailyData = sortedDailyLabels.map(lbl => dailyIssueMap[lbl]);

    const sortedExpiryLabels = Object.keys(expiryTimelineMap).sort((a,b) => parseCustomDate(a) - parseCustomDate(b));
    const sortedExpiryData = sortedExpiryLabels.map(lbl => expiryTimelineMap[lbl]);

    // Color palette updated to comfortably fit 6+ categories
    const chartColors = ['#0f172a', '#3b82f6', '#10b981', '#f59e0b', '#6366f1', '#ec4899', '#8b5cf6'];

    renderPieChart("chartVehicleClass", Object.keys(vehicleClassMap), Object.values(vehicleClassMap), chartColors);
    renderBarChart("chartBloodGroup", Object.keys(bloodGroupMap), Object.values(bloodGroupMap), "#ef4444");
    renderBarChart("chartAgeGroup", Object.keys(ageGroupMap), Object.values(ageGroupMap), "#3b82f6");
    renderLineChart("chartDailyTrend", "Daily Issuance", sortedDailyLabels, sortedDailyData, "#0f172a");
    renderLineChart("chartMonthlyTrend", "Monthly Issuance", Object.keys(monthlyIssueMap), Object.values(monthlyIssueMap), "#6366f1");
    renderLineChart("chartExpiryTrend", "Expiries Sequence", sortedExpiryLabels, sortedExpiryData, "#f59e0b");
    renderDonutGauge("chartDlConversion", conversionRatePercent);
    renderPieChart("chartRelativeType", Object.keys(relativeTypeMap), Object.values(relativeTypeMap), ['#0f172a','#3b82f6','#10b981','#f59e0b','#6366f1']);
    renderDonutChart("chartEmergencyAvailability", ["With Contact", "Without Contact"], [emergencyWith, emergencyWithout], ["#10b981", "#cbd5e1"]);
    renderBarChart("chartAddressDistribution", Object.keys(addressSpreadMap), Object.values(addressSpreadMap), "#14b8a6");

    const sortedTopVehicles = Object.entries(vehicleClassMap).sort((a,b) => b[1] - a[1]);
    renderHorizontalBarChart("chartTopVehicles", sortedTopVehicles.map(x=>x[0]), sortedTopVehicles.map(x=>x[1]), "#64748b");

    populateDashboardDataTables(rows, today);

    document.getElementById("loadingView").classList.add("d-none");
    document.getElementById("dashboardView").classList.remove("d-none");
}

function renderPieChart(id, labels, data, optionalColors) {
    const defaultColors = ['#0f172a','#3b82f6','#10b981','#f59e0b','#6366f1','#ec4899','#14b8a6'];
    new Chart(document.getElementById(id), {
        type: 'pie',
        data: { labels: labels, datasets: [{ data: data, backgroundColor: optionalColors || defaultColors }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 12 } } } }
    });
}

function renderDonutChart(id, labels, data, colors) {
    new Chart(document.getElementById(id), {
        type: 'doughnut',
        data: { labels: labels, datasets: [{ data: data, backgroundColor: colors }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 12 } } } }
    });
}

function renderBarChart(id, labels, data, hexColor) {
    new Chart(document.getElementById(id), {
        type: 'bar',
        data: { labels: labels, datasets: [{ data: data, backgroundColor: hexColor, borderRadius: 6 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
    });
}

function renderHorizontalBarChart(id, labels, data, hexColor) {
    new Chart(document.getElementById(id), {
        type: 'bar',
        data: { labels: labels, datasets: [{ data: data, backgroundColor: hexColor, borderRadius: 6 }] },
        options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, ticks: { precision: 0 } } } }
    });
}

function renderLineChart(id, labelToken, labels, data, hexColor) {
    new Chart(document.getElementById(id), {
        type: 'line',
        data: { labels: labels, datasets: [{ label: labelToken, data: data, borderColor: hexColor, backgroundColor: hexColor + "10", tension: 0.15, fill: true }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
    });
}

function renderDonutGauge(id, percent) {
    new Chart(document.getElementById(id), {
        type: 'doughnut',
        data: { labels: ['Converted', 'Remaining'], datasets: [{ data: [percent, 100 - percent], backgroundColor: ['#10b981', '#f1f5f9'], borderWidth: 0 }] },
        options: { cutout: '78%', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });
}

function populateDashboardDataTables(rows, today) {
    const tableRecentLlr = document.getElementById("tableRecentLlr");
    const tableRecentDl = document.getElementById("tableRecentDl");
    const tableRecentlyExpired = document.getElementById("tableRecentlyExpired");
    const tableUpcomingExpiries = document.getElementById("tableUpcomingExpiries");

    tableRecentLlr.innerHTML = "";
    tableRecentDl.innerHTML = "";
    tableRecentlyExpired.innerHTML = "";
    tableUpcomingExpiries.innerHTML = "";

    const structuralRecentLlrRows = [...rows].filter(r => r.issue_date && r.issue_date !== "-").reverse().slice(0, 15);
    structuralRecentLlrRows.forEach(row => {
        tableRecentLlr.innerHTML += `<tr><td class="fw-bold text-dark">${row.llr_number}</td><td>${row.name}</td><td>${row.issue_date}</td><td><span class="badge bg-dark">${row.vehicle_class}</span></td></tr>`;
    });

    const structuralRecentDlRows = [...rows].filter(r => r.dl_issued && r.dl_issued.toUpperCase() === "YES").reverse().slice(0, 15);
    structuralRecentDlRows.forEach(row => {
        tableRecentDl.innerHTML += `<tr><td class="fw-bold text-primary">${row.llr_number}</td><td>${row.name}</td><td>${row.approved_date ? row.approved_date.split(" ")[0] : "-"}</td><td class="fw-bold">${row.dl_number || "-"}</td></tr>`;
    });

    const structuralRecentlyExpiredRows = rows.filter(row => {
        const exp = parseCustomDate(row.expiry_date);
        if (!exp) return false;
        return (exp - today) < 0;
    }).sort((a,b) => parseCustomDate(b.expiry_date) - parseCustomDate(a.expiry_date)).slice(0, 15);

    structuralRecentlyExpiredRows.forEach(row => {
        tableRecentlyExpired.innerHTML += `<tr><td class="fw-bold text-danger">${row.llr_number}</td><td>${row.name}</td><td class="text-danger fw-bold">${row.expiry_date}</td><td>${row.mobile_number || "-"}</td></tr>`;
    });

    const structuralUpcomingExpiriesRows = rows.filter(row => {
        const exp = parseCustomDate(row.expiry_date);
        if (!exp) return false;
        const gap = Math.ceil((exp - today) / (1000 * 60 * 60 * 24));
        return gap >= 0 && gap <= 30;
    }).sort((a,b) => parseCustomDate(a.expiry_date) - parseCustomDate(b.expiry_date)).slice(0, 15);

    structuralUpcomingExpiriesRows.forEach(row => {
        tableUpcomingExpiries.innerHTML += `<tr><td class="fw-bold text-warning">${row.llr_number}</td><td>${row.name}</td><td class="text-warning fw-bold">${row.expiry_date}</td><td>${row.mobile_number || "-"}</td></tr>`;
    });
}