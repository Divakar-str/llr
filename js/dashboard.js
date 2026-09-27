/**
 * LLR Analytics Engine - Production Master Edition
 * Cloudflare D1 / Workers Data Layer
 */
document.addEventListener("DOMContentLoaded", () => DashboardApp.init());

const DashboardApp = (() => {
  "use strict";

  const charts = new Map();
  let masterRecords = [];
  const availableTimeMap = new Map();

  let tableCaches = {
    recentLlr: [],
    recentDl: [],
    expired: [],
    upcoming: []
  };

  const cardFilters = {
    chartVehicleClass: { month: "all", year: "all" },
    chartBloodGroup: { month: "all", year: "all" },
    chartAgeGroup: { month: "all", year: "all" },
    chartRelativeType: { month: "all", year: "all" },
    chartEmergencyAvailability: { month: "all", year: "all" },
    chartAddressDistribution: { month: "all", year: "all" },
    chartTopVehicles: { month: "all", year: "all" }
  };

  const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  const COLOR_PALETTE = [
    "#2563eb", "#059669", "#d97706", "#7c3aed", 
    "#dc2626", "#0891b2", "#ea580c", "#475569", 
    "#16a34a", "#db2777"
  ];

  const vehicleColorCache = new Map();
  const getVehicleColor = (vClass) => {
    const key = (vClass || "Other").trim().toUpperCase();
    if (!vehicleColorCache.has(key)) {
      const idx = vehicleColorCache.size % COLOR_PALETTE.length;
      vehicleColorCache.set(key, COLOR_PALETTE[idx]);
    }
    return vehicleColorCache.get(key);
  };

  const escapeHTML = (val) => {
    if (val === null || val === undefined) return "-";
    return String(val)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  };

  const parseDateNormalized = (str) => {
    if (!str) return null;
    if (str instanceof Date) return isNaN(str.getTime()) ? null : str;

    const trimmed = String(str).trim();
    if (/^\d{2}[-/.]\d{2}[-/.]\d{4}$/.test(trimmed)) {
      const [d, m, y] = trimmed.split(/[-/.]/).map(Number);
      return new Date(y, m - 1, d);
    }
    const standard = new Date(trimmed);
    return isNaN(standard.getTime()) ? null : standard;
  };

  const getLocalDateKey = (d) => {
    return `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;
  };

  const renderPhoneActions = (mobile, name, type = "expiring") => {
    if (!mobile || mobile === "-" || mobile === "0") return "-";
    const cleanNum = String(mobile).replace(/\D/g, "");
    if (cleanNum.length < 10) return escapeHTML(mobile);

    const fullNum = cleanNum.length === 10 ? `91${cleanNum}` : cleanNum;
    const msg = type === "expiring"
      ? `Dear ${name || "Applicant"}, your Learner License is nearing its expiry date. Please complete your DL slot booking.`
      : `Dear ${name || "Applicant"}, your Learner License has expired. Please apply for re-test or contact the office.`;

    const waLink = `https://wa.me/${fullNum}?text=${encodeURIComponent(msg)}`;

    return `
      <div class="d-flex align-items-center gap-2">
        <a href="tel:${cleanNum}" class="text-decoration-none font-monospace fw-semibold text-dark">${escapeHTML(mobile)}</a>
        <a href="${waLink}" target="_blank" rel="noopener noreferrer" class="badge bg-success-subtle text-success p-1 text-decoration-none" title="Send WhatsApp Notice">
          <i class="bi bi-whatsapp"></i>
        </a>
      </div>
    `;
  };

  const classifyVehicleApplication = (rawInput) => {
    if (!rawInput) return "Other";

    const str = String(rawInput).toUpperCase();
    const tokens = str
      .split(/[,+/&| -]+/)
      .map(t => t.trim())
      .filter(Boolean);

    const has = (code) => tokens.includes(code);

    const isMCWOG = has("MCWOG");
    const isMCWG = has("MCWG") && !isMCWOG;
    const isLMV = has("LMV");
    const isTRANS = has("TRANS") || has("TRANSPORT");

    if (isMCWG && isLMV && !isMCWOG && !isTRANS) return "(MCWG,LMV)";
    if (isMCWOG && isLMV && !isMCWG && !isTRANS) return "(MCWOG,LMV)";
    if (isMCWOG && !isLMV && !isTRANS && !isMCWG) return "MCWOG";
    if (isMCWG && !isLMV && !isTRANS && !isMCWOG) return "MCWG";
    if (isLMV && !isMCWG && !isMCWOG && !isTRANS) return "LMV";
    if (isTRANS && !isMCWG && !isMCWOG && !isLMV) return "TRANS";

    if (/MCWOG.*LMV|LMV.*MCWOG/.test(str)) return "(MCWOG,LMV)";
    if (/MCWG.*LMV|LMV.*MCWG/.test(str)) return "(MCWG,LMV)";
    if (/^MCWOG$/.test(str)) return "MCWOG";
    if (/^MCWG$/.test(str)) return "MCWG";
    if (/^LMV$/.test(str)) return "LMV";
    if (/TRANS/.test(str)) return "TRANS";

    return "Other";
  };

  const renderChart = (id, type, config) => {
    const canvas = document.getElementById(id);
    if (!canvas) return;

    if (charts.has(id)) {
      charts.get(id).destroy();
      charts.delete(id);
    }

    const instance = new Chart(canvas, {
      type,
      ...config,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 250 },
        plugins: {
          legend: { labels: { boxWidth: 10, font: { size: 11, family: "Inter, sans-serif" } } },
          tooltip: { cornerRadius: 4, padding: 8 }
        },
        ...config.options
      }
    });

    charts.set(id, instance);
  };

  const init = async () => {
    const loading = document.getElementById("loadingView");
    const dashboard = document.getElementById("dashboardView");
    const errorState = document.getElementById("errorView");

    try {
      loading?.classList.remove("d-none");
      dashboard?.classList.add("d-none");
      errorState?.classList.add("d-none");

      const res = await fetch(`${ENV.SHEET_API_URL}?action=readAll`, {
        headers: typeof getAuthHeaders === "function" ? getAuthHeaders() : {}
      });

      if (res.status === 401) {
        sessionStorage.clear();
        window.location.replace("login.html");
        return;
      }

      if (!res.ok) throw new Error(`HTTP Error ${res.status}: ${res.statusText}`);

      const body = await res.json();
      masterRecords = Array.isArray(body) ? body : (body.data || []);

      buildAvailableTimeIndex(masterRecords);
      initializeAllDropdowns();
      analyzeAndRender(masterRecords);

      loading?.classList.add("d-none");
      dashboard?.classList.remove("d-none");
    } catch (err) {
      console.error("[DashboardEngine Error]", err);
      loading?.classList.add("d-none");
      if (errorState) {
        errorState.classList.remove("d-none");
        const msg = document.getElementById("errorMessage");
        if (msg) msg.textContent = err.message || "Failed to query registry.";
      }
    }
  };

  const buildAvailableTimeIndex = (records) => {
    availableTimeMap.clear();

    records.forEach(r => {
      const d = parseDateNormalized(r.issue_date) || parseDateNormalized(r.approved_date);
      if (d) {
        const yr = d.getFullYear();
        const mo = d.getMonth();
        if (!availableTimeMap.has(yr)) {
          availableTimeMap.set(yr, new Set());
        }
        availableTimeMap.get(yr).add(mo);
      }
    });
  };

  const initializeAllDropdowns = () => {
    Object.keys(cardFilters).forEach(chartKey => {
      syncDropdownsForCard(chartKey);
    });
  };

  const syncDropdownsForCard = (chartKey) => {
    const yearSelect = document.querySelector(`.filter-year-select[data-target="${chartKey}"]`);
    const monthSelect = document.querySelector(`.filter-month-select[data-target="${chartKey}"]`);
    if (!yearSelect || !monthSelect) return;

    const currentYearVal = cardFilters[chartKey].year;
    const currentMonthVal = cardFilters[chartKey].month;

    const sortedYears = Array.from(availableTimeMap.keys()).sort((a, b) => b - a);
    yearSelect.innerHTML = '<option value="all">Year: All</option>';
    sortedYears.forEach(y => {
      const opt = document.createElement("option");
      opt.value = y;
      opt.textContent = y;
      yearSelect.appendChild(opt);
    });
    yearSelect.value = sortedYears.includes(Number(currentYearVal)) ? currentYearVal : "all";
    cardFilters[chartKey].year = yearSelect.value;

    populateMonthOptionsForCard(chartKey, monthSelect, currentMonthVal);
  };

  const populateMonthOptionsForCard = (chartKey, monthSelect, preferredMonthVal) => {
    const selectedYear = cardFilters[chartKey].year;
    let availableMonths = new Set();

    if (selectedYear === "all") {
      availableTimeMap.forEach(monthSet => {
        monthSet.forEach(m => availableMonths.add(m));
      });
    } else {
      const monthSet = availableTimeMap.get(Number(selectedYear));
      if (monthSet) {
        monthSet.forEach(m => availableMonths.add(m));
      }
    }

    const sortedMonths = Array.from(availableMonths).sort((a, b) => a - b);
    monthSelect.innerHTML = '<option value="all">Month: All</option>';
    sortedMonths.forEach(mIdx => {
      const opt = document.createElement("option");
      opt.value = mIdx;
      opt.textContent = MONTH_NAMES[mIdx];
      monthSelect.appendChild(opt);
    });

    monthSelect.value = sortedMonths.includes(Number(preferredMonthVal)) ? preferredMonthVal : "all";
    cardFilters[chartKey].month = monthSelect.value;
  };

  const getFilteredSubset = (chartKey) => {
    const filter = cardFilters[chartKey];
    if (!filter || (filter.month === "all" && filter.year === "all")) {
      return masterRecords;
    }

    return masterRecords.filter(r => {
      const d = parseDateNormalized(r.issue_date) || parseDateNormalized(r.approved_date);
      if (!d) return false;

      if (filter.year !== "all" && d.getFullYear() !== Number(filter.year)) return false;
      if (filter.month !== "all" && d.getMonth() !== Number(filter.month)) return false;
      return true;
    });
  };

  const analyzeAndRender = (records) => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEpoch = today.getTime();
    const todayStr = getLocalDateKey(today);
    const msInDay = 86400000;

    let totalConversionLagDays = 0;
    let conversionLagCount = 0;

    const stats = {
      total: records.length,
      active: 0,
      expired: 0,
      expiringSoon: 0,
      dlIssued: 0,
      dlPending: 0,
      todayLlr: 0,
      todayDl: 0,
      monthLlr: 0,
      monthDl: 0,
      emergencyValid: 0,
      emergencyMissing: 0,
      cooldown30d: 0,
      eligibleWindow: 0,
      criticalDanger: 0
    };

    const distributions = {
      dailyLlrTrend: Object.create(null),
      dailyDlTrend: Object.create(null),
      monthlyTrend: Object.create(null)
    };

    tableCaches = {
      recentLlr: [],
      recentDl: [],
      expired: [],
      upcoming: []
    };

    for (let i = 0; i < records.length; i++) {
      const r = records[i];
      const isDlIssued = String(r.dl_issued || "").trim().toLowerCase() === "yes";
      const approvedDate = parseDateNormalized(r.approved_date);
      const issueDate = parseDateNormalized(r.issue_date);
      const expDate = parseDateNormalized(r.expiry_date);

      if (isDlIssued) {
        stats.dlIssued++;
        tableCaches.recentDl.push({
          ...r,
          _approvedTime: approvedDate ? approvedDate.getTime() : 0
        });

        if (approvedDate) {
          const dlDateKey = getLocalDateKey(approvedDate);
          distributions.dailyDlTrend[dlDateKey] = (distributions.dailyDlTrend[dlDateKey] || 0) + 1;
          if (dlDateKey === todayStr) stats.todayDl++;
          if (approvedDate.getMonth() === today.getMonth() && approvedDate.getFullYear() === today.getFullYear()) {
            stats.monthDl++;
          }

          if (issueDate) {
            const lagDays = Math.max(0, Math.floor((approvedDate.getTime() - issueDate.getTime()) / msInDay));
            totalConversionLagDays += lagDays;
            conversionLagCount++;
          }
        }
      } else {
        stats.dlPending++;
      }

      if (issueDate) {
        const issueTime = issueDate.getTime();
        const issueKey = getLocalDateKey(issueDate);
        if (issueKey === todayStr) stats.todayLlr++;
        if (issueDate.getMonth() === today.getMonth() && issueDate.getFullYear() === today.getFullYear()) {
          stats.monthLlr++;
        }
        distributions.dailyLlrTrend[issueKey] = (distributions.dailyLlrTrend[issueKey] || 0) + 1;
        const monthKey = `${String(issueDate.getMonth() + 1).padStart(2, "0")}-${issueDate.getFullYear()}`;
        distributions.monthlyTrend[monthKey] = (distributions.monthlyTrend[monthKey] || 0) + 1;

        if (!isDlIssued) {
          const daysSinceIssue = Math.floor((todayEpoch - issueTime) / msInDay);
          if (daysSinceIssue < 30) {
            stats.cooldown30d++;
          } else if (daysSinceIssue <= 150) {
            stats.eligibleWindow++;
          } else if (daysSinceIssue <= 180) {
            stats.criticalDanger++;
          }
        }
      }

      tableCaches.recentLlr.push({
        ...r,
        _issueTime: issueDate ? issueDate.getTime() : 0
      });

      if (expDate) {
        const diffDays = Math.floor((expDate.getTime() - todayEpoch) / msInDay);
        if (diffDays < 0) {
          stats.expired++;
          if (!isDlIssued) tableCaches.expired.push({ ...r, _diffDays: diffDays });
        } else {
          stats.active++;
          if (diffDays <= 30) {
            stats.expiringSoon++;
            if (!isDlIssued) tableCaches.upcoming.push({ ...r, _diffDays: diffDays });
          }
        }
      } else {
        stats.active++;
      }

      const em = (r.emergency_mobile || "").trim();
      if (em && em !== "-" && em !== "0" && em.replace(/\D/g, "").length >= 10) {
        stats.emergencyValid++;
      } else {
        stats.emergencyMissing++;
      }
    }

    tableCaches.recentLlr.sort((a, b) => b._issueTime - a._issueTime);
    tableCaches.recentDl.sort((a, b) => b._approvedTime - a._approvedTime);
    tableCaches.upcoming.sort((a, b) => a._diffDays - b._diffDays);
    tableCaches.expired.sort((a, b) => b._diffDays - a._diffDays);

    stats.avgLagDays = conversionLagCount > 0 ? Math.round(totalConversionLagDays / conversionLagCount) : 0;

    updateUIElements(stats);
    renderAllTables();
    renderTimelineAndFunnelCharts(distributions, stats);

    renderCardVehicleClass();
    renderCardBloodGroup();
    renderCardAgeGroup();
    renderCardRelativeType();
    renderCardEmergencyAvailability();
    renderCardAddressDistribution();
    renderCardTopVehicles();
  };

  const updateUIElements = (s) => {
    const bind = (id, num) => {
      const el = document.getElementById(id);
      if (el) el.textContent = Number(num).toLocaleString();
    };

    bind("statTotalLlr", s.total);
    bind("statActiveLlr", s.active);
    bind("statExpiredLlr", s.expired);
    bind("statExpiringSoon", s.expiringSoon);
    bind("statDlIssued", s.dlIssued);
    bind("statDlPending", s.dlPending);
    bind("statTodayLlr", s.todayLlr);
    bind("statTodayDl", s.todayDl);
    bind("statMonthLlr", s.monthLlr);
    bind("statMonthDl", s.monthDl);
    bind("statEmergencyWith", s.emergencyValid);
    bind("statEmergencyWithout", s.emergencyMissing);

    bind("funnelCooldown", s.cooldown30d);
    bind("funnelEligible", s.eligibleWindow);
    bind("funnelCritical", s.criticalDanger);
    bind("statAvgLagDays", s.avgLagDays);

    const conv = s.total > 0 ? Math.round((s.dlIssued / s.total) * 100) : 0;
    const txtConv = document.getElementById("txtConversionPercent");
    if (txtConv) txtConv.textContent = `${conv}%`;
  };

  const renderCardVehicleClass = () => {
    const dataset = getFilteredSubset("chartVehicleClass");
    const vClassMap = Object.create(null);

    dataset.forEach(r => {
      const rawClasses = String(r.vehicle_class || "Unspecified").split(/[,+/]/);
      rawClasses.forEach(c => {
        const token = c.trim().toUpperCase();
        if (token) vClassMap[token] = (vClassMap[token] || 0) + 1;
      });
    });

    const labels = Object.keys(vClassMap);
    const colors = labels.map(cls => getVehicleColor(cls));

    renderChart("chartVehicleClass", "doughnut", {
      data: {
        labels: labels.length ? labels : ["No Records"],
        datasets: [{ data: labels.length ? Object.values(vClassMap) : [0], backgroundColor: labels.length ? colors : ["#e2e8f0"] }]
      }
    });
  };

  const renderCardBloodGroup = () => {
    const dataset = getFilteredSubset("chartBloodGroup");
    const bloodMap = Object.create(null);

    dataset.forEach(r => {
      const bg = (r.blood_group || "Unknown").trim().toUpperCase();
      bloodMap[bg] = (bloodMap[bg] || 0) + 1;
    });

    renderChart("chartBloodGroup", "bar", {
      data: {
        labels: Object.keys(bloodMap),
        datasets: [{ data: Object.values(bloodMap), backgroundColor: "#2563eb", borderRadius: 4 }]
      },
      options: { plugins: { legend: { display: false } } }
    });
  };

  const renderCardAgeGroup = () => {
    const dataset = getFilteredSubset("chartAgeGroup");
    const ageMap = { "Under 20": 0, "20-30": 0, "31-40": 0, "41-50": 0, "50+": 0 };
    const currentYear = new Date().getFullYear();

    dataset.forEach(r => {
      const dob = parseDateNormalized(r.date_of_birth);
      if (dob) {
        const age = currentYear - dob.getFullYear();
        if (age < 20) ageMap["Under 20"]++;
        else if (age <= 30) ageMap["20-30"]++;
        else if (age <= 40) ageMap["31-40"]++;
        else if (age <= 50) ageMap["41-50"]++;
        else ageMap["50+"]++;
      }
    });

    renderChart("chartAgeGroup", "pie", {
      data: {
        labels: Object.keys(ageMap),
        datasets: [{ data: Object.values(ageMap), backgroundColor: COLOR_PALETTE.slice(0, 5) }]
      }
    });
  };

  const renderCardRelativeType = () => {
    const dataset = getFilteredSubset("chartRelativeType");
    const relMap = Object.create(null);

    dataset.forEach(r => {
      const rel = (r.relative_type || "Father").trim();
      relMap[rel] = (relMap[rel] || 0) + 1;
    });

    renderChart("chartRelativeType", "polarArea", {
      data: {
        labels: Object.keys(relMap),
        datasets: [{ data: Object.values(relMap), backgroundColor: COLOR_PALETTE }]
      }
    });
  };

  const renderCardEmergencyAvailability = () => {
    const dataset = getFilteredSubset("chartEmergencyAvailability");
    let valid = 0, missing = 0;

    dataset.forEach(r => {
      const em = (r.emergency_mobile || "").trim();
      if (em && em !== "-" && em !== "0" && em.replace(/\D/g, "").length >= 10) valid++;
      else missing++;
    });

    renderChart("chartEmergencyAvailability", "pie", {
      data: {
        labels: ["Provided", "Missing"],
        datasets: [{ data: [valid, missing], backgroundColor: ["#059669", "#dc2626"] }]
      }
    });
  };

  const renderCardAddressDistribution = () => {
    const dataset = getFilteredSubset("chartAddressDistribution");
    const addressMap = Object.create(null);

    dataset.forEach(r => {
      const full = `${r.present_address || ""} ${r.permanent_address || ""}`.toLowerCase();
      let region = "Other";
      if (/thangamariamman/.test(full)) region = "Thangamariamman";
      else if (/sankari|sankagiri|edanganasalai|thevur|aiveli|vaikuntam/.test(full)) region = "Sankagiri";
      else if (/pakkanadu/.test(full)) region = "Pakkanadu";
      else if (/edappadi|edappady|erupalli|avaniperur|poolampatti/.test(full)) region = "Edappadi";
      addressMap[region] = (addressMap[region] || 0) + 1;
    });

    const topAddresses = Object.entries(addressMap).sort((a, b) => b[1] - a[1]).slice(0, 6);

    renderChart("chartAddressDistribution", "bar", {
      data: {
        labels: topAddresses.map(a => a[0]),
        datasets: [{ data: topAddresses.map(a => a[1]), backgroundColor: "#7c3aed", borderRadius: 4 }]
      },
      options: { indexAxis: "y", plugins: { legend: { display: false } } }
    });
  };

  const renderCardTopVehicles = () => {
    const dataset = getFilteredSubset("chartTopVehicles");

    const CANONICAL_KEYS = [
      "MCWOG",
      "MCWG",
      "LMV",
      "TRANS",
      "(MCWG,LMV)",
      "(MCWOG,LMV)",
      "Other"
    ];

    const volumeCounts = {
      "MCWOG": 0,
      "MCWG": 0,
      "LMV": 0,
      "TRANS": 0,
      "(MCWG,LMV)": 0,
      "(MCWOG,LMV)": 0,
      "Other": 0
    };

    dataset.forEach(r => {
      const bucket = classifyVehicleApplication(r.vehicle_class);
      volumeCounts[bucket] = (volumeCounts[bucket] || 0) + 1;
    });

    const activeLabels = CANONICAL_KEYS.filter(k => k !== "Other" || volumeCounts["Other"] > 0);
    const activeData = activeLabels.map(k => volumeCounts[k]);
    const activeColors = activeLabels.map(k => getVehicleColor(k));

    renderChart("chartTopVehicles", "bar", {
      data: {
        labels: activeLabels,
        datasets: [{
          data: activeData,
          backgroundColor: activeColors,
          borderRadius: 4
        }]
      },
      options: {
        plugins: { 
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => ` Applications: ${ctx.parsed.y || ctx.parsed.x}`
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: { precision: 0 }
          }
        }
      }
    });
  };

  const renderTimelineAndFunnelCharts = (dist, stats) => {
    const convRate = stats.total > 0 ? Math.round((stats.dlIssued / stats.total) * 100) : 0;

    const allTrendDates = Array.from(
      new Set([...Object.keys(dist.dailyLlrTrend), ...Object.keys(dist.dailyDlTrend)])
    )
    .map(str => {
      const [d, m, y] = str.split("-").map(Number);
      return { str, time: new Date(y, m - 1, d).getTime() };
    })
    .sort((a, b) => a.time - b.time)
    .slice(-10)
    .map(x => x.str);

    renderChart("chartDailyTrend", "line", {
      data: {
        labels: allTrendDates,
        datasets: [
          {
            label: "LLR Issued",
            data: allTrendDates.map(k => dist.dailyLlrTrend[k] || 0),
            borderColor: "#0f172a",
            backgroundColor: "rgba(15, 23, 42, 0.05)",
            borderWidth: 2,
            tension: 0.3,
            fill: true
          },
          {
            label: "DL Issued",
            data: allTrendDates.map(k => dist.dailyDlTrend[k] || 0),
            borderColor: "#2563eb",
            backgroundColor: "rgba(37, 99, 235, 0.05)",
            borderWidth: 2,
            tension: 0.3,
            fill: true
          }
        ]
      }
    });

    const mKeys = Object.keys(dist.monthlyTrend);
    renderChart("chartMonthlyTrend", "bar", {
      data: {
        labels: mKeys,
        datasets: [{ data: mKeys.map(k => dist.monthlyTrend[k]), backgroundColor: "#059669", borderRadius: 4 }]
      },
      options: { plugins: { legend: { display: false } } }
    });

    renderChart("chartExpiryTrend", "bar", {
      data: {
        labels: ["Active", "Expiring (30d)", "Expired"],
        datasets: [{
          data: [stats.active, stats.expiringSoon, stats.expired],
          backgroundColor: ["#059669", "#d97706", "#dc2626"],
          borderRadius: 4
        }]
      },
      options: { plugins: { legend: { display: false } } }
    });

    renderChart("chartDlConversion", "doughnut", {
      data: {
        labels: ["Converted", "Pending"],
        datasets: [{
          data: [convRate, Math.max(0, 100 - convRate)],
          backgroundColor: ["#2563eb", "#f1f5f9"],
          borderWidth: 0
        }]
      },
      options: { cutout: "76%" }
    });
  };

  const renderAllTables = (filterKeyword = "") => {
    const kw = filterKeyword.trim().toLowerCase();

    const matches = (r) => {
      if (!kw) return true;
      return (
        String(r.llr_number || "").toLowerCase().includes(kw) ||
        String(r.name || "").toLowerCase().includes(kw) ||
        String(r.mobile_number || "").includes(kw) ||
        String(r.dl_number || "").toLowerCase().includes(kw)
      );
    };

    const fill = (elId, dataset, cols) => {
      const container = document.getElementById(elId);
      if (!container) return;
      const filtered = dataset.filter(matches);
      if (!filtered.length) {
        container.innerHTML = `<tr><td colspan="${cols.length}" class="text-center py-3 text-muted">No records match criteria</td></tr>`;
        return;
      }
      container.innerHTML = filtered.slice(0, 15).map(r => `
        <tr>
          ${cols.map(c => `<td>${c(r)}</td>`).join("")}
        </tr>
      `).join("");
    };

    fill("tableRecentLlr", tableCaches.recentLlr, [
      r => `<span class="font-monospace fw-bold">${escapeHTML(r.llr_number)}</span>`,
      r => `<span class="text-truncate d-inline-block" style="max-width:140px;">${escapeHTML(r.name)}</span>`,
      r => escapeHTML(r.issue_date),
      r => `<span class="badge bg-light text-dark border">${escapeHTML(r.vehicle_class)}</span>`
    ]);

    fill("tableRecentDl", tableCaches.recentDl, [
      r => `<span class="font-monospace fw-bold">${escapeHTML(r.llr_number)}</span>`,
      r => `<span class="text-truncate d-inline-block" style="max-width:160px;">${escapeHTML(r.name)}</span>`,
      r => `<span class="font-monospace text-primary fw-bold">${escapeHTML(r.dl_number)}</span>`
    ]);

    fill("tableRecentlyExpired", tableCaches.expired, [
      r => `<span class="font-monospace fw-bold">${escapeHTML(r.llr_number)}</span>`,
      r => `<span class="text-truncate d-inline-block" style="max-width:130px;">${escapeHTML(r.name)}</span>`,
      r => `<span class="text-danger fw-bold">${escapeHTML(r.expiry_date)}</span>`,
      r => renderPhoneActions(r.mobile_number, r.name, "expired")
    ]);

    fill("tableUpcomingExpiries", tableCaches.upcoming, [
      r => `<span class="font-monospace fw-bold">${escapeHTML(r.llr_number)}</span>`,
      r => `<span class="text-truncate d-inline-block" style="max-width:130px;">${escapeHTML(r.name)}</span>`,
      r => `<span class="text-warning-emphasis fw-bold">${escapeHTML(r.expiry_date)}</span> <small class="text-muted">(${r._diffDays}d)</small>`,
      r => renderPhoneActions(r.mobile_number, r.name, "expiring")
    ]);
  };

  const updateCardFilter = (chartKey, type, value) => {
    if (!cardFilters[chartKey]) return;
    cardFilters[chartKey][type] = value;

    if (type === "year") {
      const monthSelect = document.querySelector(`.filter-month-select[data-target="${chartKey}"]`);
      if (monthSelect) {
        populateMonthOptionsForCard(chartKey, monthSelect, cardFilters[chartKey].month);
      }
    }

    switch (chartKey) {
      case "chartVehicleClass":
        renderCardVehicleClass();
        break;
      case "chartBloodGroup":
        renderCardBloodGroup();
        break;
      case "chartAgeGroup":
        renderCardAgeGroup();
        break;
      case "chartRelativeType":
        renderCardRelativeType();
        break;
      case "chartEmergencyAvailability":
        renderCardEmergencyAvailability();
        break;
      case "chartAddressDistribution":
        renderCardAddressDistribution();
        break;
      case "chartTopVehicles":
        renderCardTopVehicles();
        break;
    }
  };

  const exportTableCSV = (type) => {
    const dataset = tableCaches[type] || [];
    if (!dataset.length) {
      alert("No data available to export.");
      return;
    }

    const headers = ["LLR Number", "Applicant Name", "Issue Date", "Expiry Date", "DL Number", "Mobile"];
    const rows = dataset.map(r => [
      `"${r.llr_number || ''}"`,
      `"${r.name || ''}"`,
      `"${r.issue_date || ''}"`,
      `"${r.expiry_date || ''}"`,
      `"${r.dl_number || ''}"`,
      `"${r.mobile_number || ''}"`
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const encoded = encodeURI(csvContent);
    const a = document.createElement("a");
    a.href = encoded;
    a.download = `LLR_${type}_${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const applySearch = (val) => {
    renderAllTables(val);
  };

  return { init, updateCardFilter, exportTableCSV, applySearch };
})();