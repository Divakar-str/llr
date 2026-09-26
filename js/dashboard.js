// js/dashboard.js - Analytics Dashboard Engine for Cloudflare D1 Backend
document.addEventListener("DOMContentLoaded", () => {
    initDashboard();
});

let chartsCache = {};

async function initDashboard() {
    try {
        const response = await fetch(`${ENV.SHEET_API_URL}?action=readAll`, {
            headers: getAuthHeaders()
        });

        if (response.status === 401) {
            alert("Session expired or unauthorized. Please log in again.");
            window.location.href = "login.html";
            return;
        }

        if (!response.ok) throw new Error(`Server returned status: ${response.status}`);

        const data = await response.json();
        const records = Array.isArray(data) ? data : (data.data || []);

        processDashboardMetrics(records);

        // Hide loading and show dashboard view
        document.getElementById("loadingView").classList.add("d-none");
        document.getElementById("dashboardView").classList.remove("d-none");
    } catch (error) {
        console.error("Dashboard Error:", error);
        document.getElementById("loadingView").innerHTML = `
            <div class="text-center text-danger">
                <i class="bi bi-exclamation-triangle-fill fs-1 mb-2"></i>
                <p class="fw-bold">Failed to load analytics metrics: ${error.message}</p>
            </div>
        `;
    }
}

function processDashboardMetrics(records) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let totalLlr = records.length;
    let activeLlr = 0;
    let expiredLlr = 0;
    let expiringSoon = 0;
    let dlIssuedCount = 0;
    let dlPendingCount = 0;
    let todayLlrCount = 0;
    let todayDlCount = 0;
    let monthLlrCount = 0;
    let monthDlCount = 0;
    let emergencyWith = 0;
    let emergencyWithout = 0;

    const todayStr = new Date().toLocaleDateString('en-GB').replace(/\//g, '-'); // DD-MM-YYYY

    let vehicleClassMap = {};
    let bloodGroupMap = {};
    let ageGroupMap = { "Under 20": 0, "20-30": 0, "31-40": 0, "41-50": 0, "50+": 0 };
    let relativeTypeMap = {};
    let addressMap = {};
    let dailyTrendMap = {};
    let monthlyTrendMap = {};

    records.forEach(row => {
        // DL Issued Status
        if (row.dl_issued === "Yes") {
            dlIssuedCount++;
            if (row.approved_date === todayStr) todayDlCount++;
        } else {
            dlPendingCount++;
        }

        // Emergency Mobile
        if (row.emergency_mobile && row.emergency_mobile.trim() !== "" && row.emergency_mobile !== "-") {
            emergencyWith++;
        } else {
            emergencyWithout++;
        }

        // Issue Date & Monthly/Daily check
        if (row.issue_date === todayStr) todayLlrCount++;

        const issueParts = (row.issue_date || "").split("-");
        if (issueParts.length === 3) {
            const issueDateObj = new Date(`${issueParts[2]}-${issueParts[1]}-${issueParts[0]}`);
            if (!isNaN(issueDateObj)) {
                if (issueDateObj.getMonth() === today.getMonth() && issueDateObj.getFullYear() === today.getFullYear()) {
                    monthLlrCount++;
                }
                const monthKey = `${issueParts[1]}-${issueParts[2]}`;
                monthlyTrendMap[monthKey] = (monthlyTrendMap[monthKey] || 0) + 1;
                dailyTrendMap[row.issue_date] = (dailyTrendMap[row.issue_date] || 0) + 1;
            }
        }

        // Expiry & Active Status check
        const expiryParts = (row.expiry_date || "").split("-");
        if (expiryParts.length === 3) {
            const expiryDateObj = new Date(`${expiryParts[2]}-${expiryParts[1]}-${expiryParts[0]}`);
            if (!isNaN(expiryDateObj)) {
                if (expiryDateObj < today) {
                    expiredLlr++;
                } else {
                    activeLlr++;
                    const diffDays = (expiryDateObj - today) / (1000 * 60 * 60 * 24);
                    if (diffDays <= 30 && diffDays >= 0) {
                        expiringSoon++;
                    }
                }
            }
        } else {
            activeLlr++; // Default fallback if expiry format missing
        }

        // Vehicle Class
        const vClass = (row.vehicle_class || "Unknown").trim();
        vehicleClassMap[vClass] = (vehicleClassMap[vClass] || 0) + 1;

        // Blood Group
        const bGroup = (row.blood_group || "Not Specified").trim();
        bloodGroupMap[bGroup] = (bloodGroupMap[bGroup] || 0) + 1;

        // Relative Type
        const relType = (row.relative_type || "Father").trim();
        relativeTypeMap[relType] = (relativeTypeMap[relType] || 0) + 1;

        // Age Group Computation from DOB (DD-MM-YYYY)
        const dobParts = (row.date_of_birth || "").split("-");
        if (dobParts.length === 3) {
            const birthYear = parseInt(dobParts[2], 10);
            if (!isNaN(birthYear)) {
                const age = today.getFullYear() - birthYear;
                if (age < 20) ageGroupMap["Under 20"]++;
                else if (age <= 30) ageGroupMap["20-30"]++;
                else if (age <= 40) ageGroupMap["31-40"]++;
                else if (age <= 50) ageGroupMap["41-50"]++;
                else ageGroupMap["50+"]++;
            }
        }

        // Address mapping (Simple extraction of district/city token or default)
        const addr = (row.present_address || row.permanent_address || "Other").trim();
        const shortAddr = addr.length > 15 ? addr.substring(0, 15) + "..." : addr;
        addressMap[shortAddr] = (addressMap[shortAddr] || 0) + 1;
    });

    // Populate Top Stat Boxes
    document.getElementById("statTotalLlr").textContent = totalLlr;
    document.getElementById("statActiveLlr").textContent = activeLlr;
    document.getElementById("statExpiredLlr").textContent = expiredLlr;
    document.getElementById("statExpiringSoon").textContent = expiringSoon;
    document.getElementById("statDlIssued").textContent = dlIssuedCount;
    document.getElementById("statDlPending").textContent = dlPendingCount;
    document.getElementById("statTodayLlr").textContent = todayLlrCount;
    document.getElementById("statTodayDl").textContent = todayDlCount;
    document.getElementById("statMonthLlr").textContent = monthLlrCount;
    document.getElementById("statMonthDl").textContent = monthDlCount;
    document.getElementById("statEmergencyWith").textContent = emergencyWith;
    document.getElementById("statEmergencyWithout").textContent = emergencyWithout;

    // DL Conversion Rate Gauge Calculation
    const conversionRate = totalLlr > 0 ? Math.round((dlIssuedCount / totalLlr) * 100) : 0;
    document.getElementById("txtConversionPercent").textContent = `${conversionRate}%`;

    // Render Tables
    populateTables(records);

    // Render Charts
    renderCharts({
        vehicleClassMap,
        bloodGroupMap,
        ageGroupMap,
        relativeTypeMap,
        addressMap,
        dailyTrendMap,
        monthlyTrendMap,
        emergencyWith,
        emergencyWithout,
        conversionRate
    });
}

function populateTables(records) {
    const recentLlrBody = document.getElementById("tableRecentLlr");
    const recentDlBody = document.getElementById("tableRecentDl");
    const recentlyExpiredBody = document.getElementById("tableRecentlyExpired");
    const upcomingExpiriesBody = document.getElementById("tableUpcomingExpiries");

    recentLlrBody.innerHTML = "";
    recentDlBody.innerHTML = "";
    recentlyExpiredBody.innerHTML = "";
    upcomingExpiriesBody.innerHTML = "";

    // Sort copies for table presentation
    const byIssue = [...records].reverse().slice(0, 15);
    byIssue.forEach(r => {
        recentLlrBody.innerHTML += `
            <tr>
                <td class="font-monospace fw-bold">${r.llr_number || "-"}</td>
                <td>${r.name || "-"}</td>
                <td>${r.issue_date || "-"}</td>
                <td><span class="badge bg-light text-dark border">${r.vehicle_class || "-"}</span></td>
            </tr>
        `;
    });

    const dlIssuedList = records.filter(r => r.dl_issued === "Yes").reverse().slice(0, 15);
    dlIssuedList.forEach(r => {
        recentDlBody.innerHTML += `
            <tr>
                <td class="font-monospace fw-bold">${r.llr_number || "-"}</td>
                <td>${r.name || "-"}</td>
                <td>${r.approved_date || "-"}</td>
                <td class="font-monospace text-primary">${r.dl_number || "-"}</td>
            </tr>
        `;
    });

    const today = new Date();
    today.setHours(0,0,0,0);

    const expiredList = records.filter(r => {
        const parts = (r.expiry_date || "").split("-");
        if (parts.length === 3) {
            const exp = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
            return !isNaN(exp) && exp < today;
        }
        return false;
    }).slice(0, 15);

    expiredList.forEach(r => {
        recentlyExpiredBody.innerHTML += `
            <tr>
                <td class="font-monospace fw-bold">${r.llr_number || "-"}</td>
                <td>${r.name || "-"}</td>
                <td class="text-danger fw-semibold">${r.expiry_date || "-"}</td>
                <td class="font-monospace">${r.mobile_number || "-"}</td>
            </tr>
        `;
    });

    const upcomingList = records.filter(r => {
        const parts = (r.expiry_date || "").split("-");
        if (parts.length === 3) {
            const exp = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
            const diff = (exp - today) / (1000 * 60 * 60 * 24);
            return !isNaN(exp) && diff >= 0 && diff <= 30;
        }
        return false;
    }).slice(0, 15);

    upcomingList.forEach(r => {
        upcomingExpiriesBody.innerHTML += `
            <tr>
                <td class="font-monospace fw-bold">${r.llr_number || "-"}</td>
                <td>${r.name || "-"}</td>
                <td class="text-warning fw-semibold">${r.expiry_date || "-"}</td>
                <td class="font-monospace">${r.mobile_number || "-"}</td>
            </tr>
        `;
    });
}

function renderCharts(data) {
    // 1. Vehicle Class Distribution Doughnut
    new Chart(document.getElementById("chartVehicleClass"), {
        type: 'doughnut',
        data: {
            labels: Object.keys(data.vehicleClassMap),
            datasets: [{ data: Object.values(data.vehicleClassMap), backgroundColor: ['#0f172a', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'] }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });

    // 2. Blood Group Bar Chart
    new Chart(document.getElementById("chartBloodGroup"), {
        type: 'bar',
        data: {
            labels: Object.keys(data.bloodGroupMap),
            datasets: [{ label: 'Applicants', data: Object.values(data.bloodGroupMap), backgroundColor: '#3b82f6' }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });

    // 3. Age Group Pie Chart
    new Chart(document.getElementById("chartAgeGroup"), {
        type: 'pie',
        data: {
            labels: Object.keys(data.ageGroupMap),
            datasets: [{ data: Object.values(data.ageGroupMap), backgroundColor: ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#64748b'] }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });

    // 4. Daily Trend Line Chart
    const dailyKeys = Object.keys(data.dailyTrendMap).slice(-10);
    new Chart(document.getElementById("chartDailyTrend"), {
        type: 'line',
        data: {
            labels: dailyKeys,
            datasets: [{ label: 'LLRs Issued', data: dailyKeys.map(k => data.dailyTrendMap[k]), borderColor: '#0f172a', tension: 0.3, fill: true, backgroundColor: 'rgba(15, 23, 42, 0.05)' }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });

    // 5. Monthly Trend Bar Chart
    const monthlyKeys = Object.keys(data.monthlyTrendMap);
    new Chart(document.getElementById("chartMonthlyTrend"), {
        type: 'bar',
        data: {
            labels: monthlyKeys,
            datasets: [{ label: 'Monthly Issues', data: monthlyKeys.map(k => data.monthlyTrendMap[k]), backgroundColor: '#10b981' }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });

    // 6. Expiry Trend Mapping Bar Chart
    new Chart(document.getElementById("chartExpiryTrend"), {
        type: 'bar',
        data: {
            labels: ['Active', 'Expiring Soon', 'Expired'],
            datasets: [{ data: [data.activeLlr || 0, data.expiringSoon || 0, data.expiredLlr || 0], backgroundColor: ['#10b981', '#f59e0b', '#ef4444'] }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });

    // 7. DL Conversion Gauge (Doughnut representation)
    new Chart(document.getElementById("chartDlConversion"), {
        type: 'doughnut',
        data: {
            labels: ['Converted', 'Pending'],
            datasets: [{ data: [data.conversionRate, 100 - data.conversionRate], backgroundColor: ['#3b82f6', '#e2e8f0'] }]
        },
        options: { responsive: true, maintainAspectRatio: false, cutout: '75%' }
    });

    // 8. Relative Type Distribution
    new Chart(document.getElementById("chartRelativeType"), {
        type: 'polarArea',
        data: {
            labels: Object.keys(data.relativeTypeMap),
            datasets: [{ data: Object.values(data.relativeTypeMap), backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444'] }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });

    // 9. Emergency Contact Availability
    new Chart(document.getElementById("chartEmergencyAvailability"), {
        type: 'pie',
        data: {
            labels: ['Provided', 'Missing'],
            datasets: [{ data: [data.emergencyWith, data.emergencyWithout], backgroundColor: ['#10b981', '#ef4444'] }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });

    // 10. Address Distribution Bar Chart
    const topAddresses = Object.entries(data.addressMap).sort((a,b) => b[1] - a[1]).slice(0, 5);
    new Chart(document.getElementById("chartAddressDistribution"), {
        type: 'bar',
        data: {
            labels: topAddresses.map(item => item[0]),
            datasets: [{ label: 'Count', data: topAddresses.map(item => item[1]), backgroundColor: '#8b5cf6' }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });

    // 11. Top Vehicle Classes Bar Chart
    const topVehicles = Object.entries(data.vehicleClassMap).sort((a,b) => b[1] - a[1]).slice(0, 5);
    new Chart(document.getElementById("chartTopVehicles"), {
        type: 'bar',
        data: {
            labels: topVehicles.map(item => item[0]),
            datasets: [{ label: 'Count', data: topVehicles.map(item => item[1]), backgroundColor: '#0f172a' }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });
}