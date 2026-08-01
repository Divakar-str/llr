document.addEventListener("DOMContentLoaded", initializeReportsEnginePipeline);

let masterRegistryData = []; 
let targetCompiledReportRows = []; 

/** 
 * Attaches real-time settings loops, triggers progress trackers, and handles asset ingestion. 
 */ 
async function initializeReportsEnginePipeline() { 
    const savedTheme = localStorage.getItem("llr-theme") || "light"; 
    document.documentElement.setAttribute("data-theme", savedTheme); 
    updateThemeToggleIcon(savedTheme); 

    const themeToggleBtn = document.getElementById("themeToggleBtn"); 
    if (themeToggleBtn) themeToggleBtn.addEventListener("click", toggleLayoutThemeProfile); 

    // Dynamic real-time change triggers for inputs bar configuration elements 
    const searchInput = document.getElementById("filterSearchQuery"); 
    const fromDateInput = document.getElementById("filterFromDate"); 
    const toDateInput = document.getElementById("filterToDate"); 
    const classSelect = document.getElementById("filterVehicleClass"); 
    const templateSelect = document.getElementById("reportTypeSelect"); 

    if (searchInput) searchInput.addEventListener("input", executeLiveFilterPipeline); 
    if (fromDateInput) fromDateInput.addEventListener("change", executeLiveFilterPipeline); 
    if (toDateInput) toDateInput.addEventListener("change", executeLiveFilterPipeline); 
    if (classSelect) classSelect.addEventListener("change", executeLiveFilterPipeline); 
    if (templateSelect) templateSelect.addEventListener("change", executeLiveFilterPipeline); 

    const btnGenerate = document.getElementById("generateReportBtn");
    if (btnGenerate) btnGenerate.addEventListener("click", processReportTemplateMapping);
    
    const btnExcel = document.getElementById("exportExcelBtn");
    if (btnExcel) btnExcel.addEventListener("click", exportActiveTableToExcelFile);
    
    const btnCsv = document.getElementById("exportCsvBtn");
    if (btnCsv) btnCsv.addEventListener("click", exportActiveTableToCsvFile);
    
    const btnPrint = document.getElementById("printReportBtn");
    if (btnPrint) btnPrint.addEventListener("click", triggerLandscapePrintProcess); 

    // LIVE LOG INGESTION STATUS BAR WRAPPER INITIALIZATION 
    const statusTray = document.getElementById("connectionStatusStatusTray"); 
    const traySpinner = document.getElementById("statusTraySpinner"); 
    const trayIcon = document.getElementById("statusTrayIcon"); 
    const trayMessage = document.getElementById("statusTrayMessage"); 

    if (statusTray) {
        statusTray.style.setProperty("display", "flex", "important"); 
        statusTray.className = "alert alert-info d-flex align-items-center gap-2 py-2 px-3 border-custom shadow-sm scale-in"; 
    }

    const googleSheetEndpoint = (typeof ENV !== "undefined" && ENV.SHEET_API_URL) ? ENV.SHEET_API_URL : ""; 
    
    try { 
        if (!googleSheetEndpoint) throw new Error("API endpoint URL missing in configuration.");

        const response = await fetch(`${googleSheetEndpoint}?action=readAll`, { method: "GET", mode: "cors" }); 
        if (!response.ok) throw new Error("HTTP error " + response.status); 

        masterRegistryData = await response.json(); 

        // SUCCESS HANDLING
        if (traySpinner) traySpinner.classList.add("d-none"); 
        if (trayIcon) trayIcon.className = "bi bi-check-circle-fill text-success fs-5"; 
        if (statusTray) {
            statusTray.className = "alert bg-success-subtle d-flex align-items-center gap-2 py-2 px-3 shadow-sm scale-in"; 
            trayMessage.innerHTML = `<strong>Connected!</strong> Successfully loaded <span class="badge bg-success px-2 py-1">${masterRegistryData.length} records</span>.`; 
            setTimeout(() => { statusTray.style.setProperty("display", "none", "important"); }, 4000); 
        }
    } catch (e) { 
        if (traySpinner) traySpinner.classList.add("d-none"); 
        if (trayIcon) trayIcon.className = "bi bi-exclamation-triangle-fill text-danger fs-5"; 
        if (statusTray) {
            statusTray.className = "alert bg-danger-subtle d-flex align-items-center gap-2 py-2 px-3 shadow-sm scale-in"; 
            trayMessage.innerHTML = `<strong>Fetch Error!</strong> ${e.message || "Could not read database records."}`; 
        }
    } 
} 

function toggleLayoutThemeProfile() { 
    const currentTheme = document.documentElement.getAttribute("data-theme"); 
    const nextTheme = currentTheme === "dark" ? "light" : "dark"; 
    document.documentElement.setAttribute("data-theme", nextTheme); 
    localStorage.setItem("llr-theme", nextTheme); 
    updateThemeToggleIcon(nextTheme); 
} 

function updateThemeToggleIcon(theme) { 
    const btn = document.getElementById("themeToggleBtn"); 
    if (!btn) return; 
    btn.innerHTML = theme === "dark" ? `<i class="bi bi-sun-fill text-warning"></i>` : `<i class="bi bi-moon-stars-fill"></i>`; 
} 

function parseCustomDate(dateStr) { 
    if (!dateStr || dateStr === "-" || String(dateStr).trim() === "") return null; 
    const pieces = String(dateStr).trim().split("-"); 
    if (pieces.length !== 3) return null; 
    
    const day = parseInt(pieces[0], 10);
    const month = parseInt(pieces[1], 10) - 1;
    const year = parseInt(pieces[2], 10);

    if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
    return new Date(year, month, day); 
} 

function executeLiveFilterPipeline() { 
    const templateSelectValue = document.getElementById("reportTypeSelect").value; 
    if (templateSelectValue !== "") { 
        processReportTemplateMapping(); 
    } 
} 

function evaluateRowLogicalStatus(row, currentTimestamp) { 
    const exp = parseCustomDate(row.expiry_date); 
    const iss = parseCustomDate(row.issue_date); 
    const isDlIssued = row.dl_issued && String(row.dl_issued).trim().toUpperCase() === "YES"; 

    const state = { 
        isActive: false, isExpired: false, isExpiringSoon: false, 
        isExpiring7Days: false, passed30Days: false, isDlEligible: false, 
        daysRemaining: 0, daysExpired: 0, daysSinceIssue: 0 
    }; 

    if (iss) { 
        state.daysSinceIssue = Math.floor((currentTimestamp - iss) / (1000 * 60 * 60 * 24)); 
        if (state.daysSinceIssue >= 30) state.passed30Days = true; 
    } 

    if (exp) { 
        const deltaDays = Math.ceil((exp - currentTimestamp) / (1000 * 60 * 60 * 24)); 
        if (deltaDays >= 0) { 
            state.isActive = true; 
            state.daysRemaining = deltaDays; 
            if (deltaDays <= 30) state.isExpiringSoon = true; 
            if (deltaDays <= 7) state.isExpiring7Days = true; 
        } else { 
            state.isExpired = true; 
            state.daysExpired = Math.abs(deltaDays); 
        } 
    } 
    
    if (state.passed30Days && !isDlIssued) state.isDlEligible = true; 

    return state; 
} 

function matchMinimalFilters(row) { 
    const classFilter = document.getElementById("filterVehicleClass").value; 
    const fromDateStr = document.getElementById("filterFromDate").value; 
    const toDateStr = document.getElementById("filterToDate").value; 
    const query = document.getElementById("filterSearchQuery").value.trim().toUpperCase(); 

    // Enhanced search matching including relative and identification marks
    if (query !== "") { 
        const nameMatch = (row.name || "").toUpperCase().includes(query); 
        const llrMatch = (row.llr_number || "").toUpperCase().includes(query); 
        const dlMatch = (row.dl_number || "").toUpperCase().includes(query); 
        const mobMatch = (row.mobile_number || "").toUpperCase().includes(query); 
        const relMatch = (row.relative_name || "").toUpperCase().includes(query); 
        const markMatch = (row.identification_mark_1 || "").toUpperCase().includes(query) || 
                          (row.identification_mark_2 || "").toUpperCase().includes(query);

        if (!nameMatch && !llrMatch && !dlMatch && !mobMatch && !relMatch && !markMatch) return false; 
    } 

    if (classFilter !== "ALL") { 
        if (!row.vehicle_class || row.vehicle_class === "-") return false; 
        const currentClassString = row.vehicle_class.toUpperCase().trim(); 

        switch (classFilter) { 
            case "MCWG_ONLY": if (currentClassString !== "MCWG") return false; break; 
            case "MCWOG_ONLY": if (currentClassString !== "MCWOG") return false; break; 
            case "LMV_ONLY": if (currentClassString !== "LMV") return false; break; 
            case "TRANS_ONLY": if (currentClassString !== "TRANS") return false; break; 
            case "MCWG_LMV": if (currentClassString !== "MCWG,LMV" && currentClassString !== "LMV,MCWG") return false; break; 
            case "MCWOG_LMV": if (currentClassString !== "MCWOG,LMV" && currentClassString !== "LMV,MCWOG") return false; break; 
        } 
    } 

    const iss = parseCustomDate(row.issue_date); 
    if (fromDateStr && iss) { 
        const start = new Date(fromDateStr + "T00:00:00"); 
        if (iss < start) return false; 
    } 
    if (toDateStr && iss) { 
        const end = new Date(toDateStr + "T23:59:59"); 
        if (iss > end) return false; 
    } 

    return true; 
} 

function processReportTemplateMapping() { 
    const reportEngineKey = document.getElementById("reportTypeSelect").value; 
    if (reportEngineKey === "") return; 

    const btnSpinner = document.getElementById("btnSpinner"); 
    const btnIcon = document.getElementById("btnIcon"); 

    if (btnIcon) btnIcon.classList.add("d-none"); 
    if (btnSpinner) btnSpinner.classList.remove("d-none"); 

    document.getElementById("reportPlaceholderView").classList.add("d-none"); 
    document.getElementById("reportDisplayView").classList.add("d-none"); 
    document.getElementById("reportLoaderView").classList.remove("d-none"); 

    const today = new Date(); 
    today.setHours(0,0,0,0);
    
    targetCompiledReportRows = []; 

    let ribbonTallies = { active: 0, expired: 0, dlReady: 0, dlIssued: 0 }; 
    let displaySerialNo = 1; 

    const commonHeaders = ["S.No.", "LLR Number", "Applicant Name", "Vehicle Class", "Mobile Number", "Issue Date", "Expiry Date"]; 
    let activeHeaderTemplate = commonHeaders; 

    masterRegistryData.forEach(row => { 
        const state = evaluateRowLogicalStatus(row, today); 
        if (!matchMinimalFilters(row)) return; 

        const issueDateObj = parseCustomDate(row.issue_date); 

        if (state.isActive) ribbonTallies.active++; 
        if (state.isExpired) ribbonTallies.expired++; 
        if (state.isDlEligible) ribbonTallies.dlReady++; 
        if (row.dl_issued && String(row.dl_issued).toUpperCase() === "YES") ribbonTallies.dlIssued++; 

        let entry = { 
            "S.No.": displaySerialNo, 
            "LLR Number": row.llr_number || "-", 
            "Applicant Name": row.name || "-", 
            "Vehicle Class": row.vehicle_class || "-", 
            "Mobile Number": row.mobile_number || "-", 
            "Issue Date": row.issue_date || "-", 
            "Expiry Date": row.expiry_date || "-" 
        }; 

        switch (reportEngineKey) { 
            case "COMPLETE_REGISTER": 
                activeHeaderTemplate = [...commonHeaders, "Relative Name", "Date of Birth", "Blood Group", "Address Details", "Remarks"]; 
                Object.assign(entry, { 
                    "Relative Name": row.relative_name ? `${row.relative_type || 'S/D/W'} ${row.relative_name}` : "-",
                    "Date of Birth": row.date_of_birth || "-", 
                    "Blood Group": row.blood_group || "-", 
                    "Address Details": row.present_address || "-",
                    "Remarks": row.remarks || "-"
                }); 
                break; 

            // LOW-LEVEL REPORT 1: Counter Identification & Identity Scrutiny Register
            case "IDENTITY_SCRUTINY":
                activeHeaderTemplate = ["S.No.", "LLR Number", "Applicant Name", "Relative Details", "DOB", "Blood Group", "Identification Mark 1", "Identification Mark 2"];
                entry = {
                    "S.No.": displaySerialNo,
                    "LLR Number": row.llr_number || "-",
                    "Applicant Name": row.name || "-",
                    "Relative Details": row.relative_name ? `${row.relative_type || 'S/D/W'} ${row.relative_name}` : "-",
                    "DOB": row.date_of_birth || "-",
                    "Blood Group": row.blood_group || "-",
                    "Identification Mark 1": row.identification_mark_1 || "-",
                    "Identification Mark 2": row.identification_mark_2 || "-"
                };
                break;

            // LOW-LEVEL REPORT 2: Ground Test & MVI Inspection Log
            case "MVI_TEST_LOG":
                activeHeaderTemplate = ["S.No.", "LLR Number", "Applicant Name", "Vehicle Class", "Mark 1", "Mobile Number", "Approval Date", "Remarks"];
                entry = {
                    "S.No.": displaySerialNo,
                    "LLR Number": row.llr_number || "-",
                    "Applicant Name": row.name || "-",
                    "Vehicle Class": row.vehicle_class || "-",
                    "Mark 1": row.identification_mark_1 || "-",
                    "Mobile Number": row.mobile_number || "-",
                    "Approval Date": row.approved_date || "-",
                    "Remarks": row.remarks || "Pending Evaluation"
                };
                break;

            // LOW-LEVEL REPORT 3: Physical Address Ledger
            case "ADDRESS_VERIFICATION":
                activeHeaderTemplate = ["S.No.", "LLR Number", "Applicant Name", "Mobile Number", "Emergency Contact", "Present Address", "Permanent Address"];
                entry = {
                    "S.No.": displaySerialNo,
                    "LLR Number": row.llr_number || "-",
                    "Applicant Name": row.name || "-",
                    "Mobile Number": row.mobile_number || "-",
                    "Emergency Contact": row.emergency_mobile || "-",
                    "Present Address": row.present_address || "-",
                    "Permanent Address": row.permanent_address || "-"
                };
                break;

            case "ACTIVE_LLR": 
                if (!state.isActive) return; 
                break; 

            case "EXPIRED_LLR": 
                if (!state.isExpired) return; 
                activeHeaderTemplate = [...commonHeaders, "Days Since Expired"]; 
                entry["Days Since Expired"] = `${state.daysExpired} Days`; 
                break; 

            case "EXPIRY_REGISTER": 
                activeHeaderTemplate = [...commonHeaders, "Current Status", "Days Left/Over"]; 
                entry["Current Status"] = state.isActive ? "Active" : "Expired"; 
                entry["Days Left/Over"] = state.isActive ? `${state.daysRemaining} Days Left` : `${state.daysExpired} Days Overdue`; 
                break; 

            case "PASSED_30_DAYS": 
                if (!state.passed30Days) return; 
                activeHeaderTemplate = [...commonHeaders, "Days Since Issue"]; 
                entry["Days Since Issue"] = `${state.daysSinceIssue} Days Ago`; 
                break; 

            case "ELIGIBLE_FOR_DL": 
                if (!state.isDlEligible) return; 
                activeHeaderTemplate = [...commonHeaders, "License Status"]; 
                entry["License Status"] = "Ready for DL Test"; 
                break; 

            case "PENDING_DL": 
                if (row.dl_issued && String(row.dl_issued).toUpperCase() === "YES") return; 
                activeHeaderTemplate = [...commonHeaders, "Current Stage"]; 
                entry["Current Stage"] = state.isDlEligible ? "Waiting for DL Test" : "Learning Period"; 
                break; 

            case "DL_ISSUED": 
                if (!row.dl_issued || String(row.dl_issued).toUpperCase() !== "YES") return; 
                activeHeaderTemplate = [...commonHeaders, "Permanent DL Number", "Approval Date"]; 
                entry["Permanent DL Number"] = row.dl_number || "-"; 
                entry["Approval Date"] = row.approved_date || "-"; 
                break; 

            case "LLR_TO_DL_CONVERSION": 
                activeHeaderTemplate = [...commonHeaders, "Permanent DL Status"]; 
                entry["Permanent DL Status"] = (row.dl_issued && String(row.dl_issued).toUpperCase() === "YES") ? `License Done (${row.dl_number})` : "Learner Stage Only"; 
                break; 

            case "EXPIRING_7_DAYS": 
                if (!state.isExpiring7Days) return; 
                activeHeaderTemplate = [...commonHeaders, "Time Left"]; 
                entry["Time Left"] = `${state.daysRemaining} Days Left`; 
                break; 

            case "EXPIRING_30_DAYS": 
                if (!state.isExpiringSoon) return; 
                activeHeaderTemplate = [...commonHeaders, "Time Left"]; 
                entry["Time Left"] = `${state.daysRemaining} Days Left`; 
                break; 

            case "TODAYS_ISSUED": 
                if (!issueDateObj) return;
                if (issueDateObj.getDate() !== today.getDate() || 
                    issueDateObj.getMonth() !== today.getMonth() || 
                    issueDateObj.getFullYear() !== today.getFullYear()) return; 
                break; 

            case "MONTHLY_ISSUED": 
                if (!issueDateObj || issueDateObj.getMonth() !== today.getMonth() || issueDateObj.getFullYear() !== today.getFullYear()) return; 
                break; 

            case "DUPLICATE_MOBILE": 
                const mCount = masterRegistryData.filter(x => x.mobile_number && x.mobile_number === row.mobile_number).length; 
                if (mCount <= 1) return; 
                activeHeaderTemplate = [...commonHeaders, "Double Entry Matches"]; 
                entry["Double Entry Matches"] = `${mCount} Times Used`; 
                break; 

            case "MISSING_INFORMATION": 
                let missing = []; 
                if (!row.mobile_number || row.mobile_number === "-") missing.push("Mobile"); 
                if (!row.blood_group || row.blood_group === "-") missing.push("Blood Group"); 
                if (!row.identification_mark_1 || row.identification_mark_1 === "-") missing.push("Identity Mark 1");
                if (missing.length === 0) return; 
                activeHeaderTemplate = [...commonHeaders, "Missing Information"]; 
                entry["Missing Information"] = missing.join(", "); 
                break; 
        } 

        targetCompiledReportRows.push(entry); 
        displaySerialNo++; 
    }); 

    setTimeout(() => { 
        const selectNode = document.getElementById("reportTypeSelect"); 
        const activeTextTitle = selectNode.options[selectNode.selectedIndex].text; 

        document.getElementById("lblRenderedReportTitle").innerText = activeTextTitle; 
        document.getElementById("lblRenderedReportCount").innerText = `${targetCompiledReportRows.length} Records`; 
        document.getElementById("lblPrintReportTitle").innerText = activeTextTitle.toUpperCase(); 

        document.getElementById("ribbonActiveCount").innerText = ribbonTallies.active; 
        document.getElementById("ribbonExpiredCount").innerText = ribbonTallies.expired; 
        document.getElementById("ribbonDlReadyCount").innerText = ribbonTallies.dlReady; 
        document.getElementById("ribbonDlIssuedCount").innerText = ribbonTallies.dlIssued; 

        renderCompiledReportTableToView(activeHeaderTemplate, targetCompiledReportRows); 

        if (btnSpinner) btnSpinner.classList.add("d-none"); 
        if (btnIcon) btnIcon.classList.remove("d-none"); 
    }, 100); 
} 

function renderCompiledReportTableToView(headers, dataRows) { 
    const headerNode = document.getElementById("reportDataTableHeader"); 
    const bodyNode = document.getElementById("reportDataTableBody"); 

    headerNode.innerHTML = ""; 
    bodyNode.innerHTML = ""; 

    const trHead = document.createElement("tr"); 

    const thCheck = document.createElement("th"); 
    thCheck.className = "th-select-all-col text-center no-print"; 
    thCheck.style.width = "45px"; 
    thCheck.innerHTML = `<input type="checkbox" class="form-check-input shadow-none" id="masterPrintCheckbox" checked>`; 
    trHead.appendChild(thCheck); 

    headers.forEach(headerText => { 
        const th = document.createElement("th"); 
        th.innerText = headerText; 
        trHead.appendChild(th); 
    }); 
    headerNode.appendChild(trHead); 

    const masterCheckbox = document.getElementById("masterPrintCheckbox");
    if (masterCheckbox) {
        masterCheckbox.addEventListener("change", (event) => { 
            const globalCheckedFlag = event.target.checked; 
            document.querySelectorAll(".row-print-checkbox").forEach(checkbox => { 
                checkbox.checked = globalCheckedFlag; 
                const rowTargetElement = checkbox.closest("tr"); 
                if (globalCheckedFlag) { 
                    rowTargetElement.classList.remove("hide-row-on-print"); 
                } else { 
                    rowTargetElement.classList.add("hide-row-on-print"); 
                } 
            }); 
        }); 
    }

    if (dataRows.length === 0) { 
        bodyNode.innerHTML = `<tr><td colspan="${headers.length + 1}" class="text-center text-muted py-4 fw-semibold">No records found matching your search.</td></tr>`; 
    } else { 
        dataRows.forEach((row, index) => { 
            const tr = document.createElement("tr"); 
            tr.id = `llr-print-row-id-${index}`; 

            const tdCheck = document.createElement("td"); 
            tdCheck.className = "text-center row-print-checkbox-col no-print"; 
            tdCheck.innerHTML = `<input type="checkbox" class="form-check-input row-print-checkbox shadow-none" data-row-element-id="llr-print-row-id-${index}" checked>`; 
            tr.appendChild(tdCheck); 

            headers.forEach(h => { 
                const td = document.createElement("td"); 
                let cellVal = row[h] !== undefined && row[h] !== null ? row[h] : "-"; 

                if (h === "LLR Number") { 
                    td.innerHTML = `<span class="fw-bold text-primary">${cellVal}</span>`; 
                } else if (h === "S.No.") { 
                    td.className = "fw-bold text-muted text-center"; 
                    td.innerText = cellVal; 
                } else if (cellVal === "Active" || cellVal.toString().includes("Days Left")) { 
                    td.innerHTML = `<span class="badge bg-success-subtle text-success">${cellVal}</span>`; 
                } else if (cellVal === "Expired" || cellVal.toString().includes("Overdue") || cellVal.toString().includes("Past")) { 
                    td.innerHTML = `<span class="badge bg-danger-subtle text-danger">${cellVal}</span>`; 
                } else if (cellVal.toString().includes("Ready") || cellVal.toString().includes("Waiting") || cellVal.toString().includes("Learning")) { 
                    td.innerHTML = `<span class="badge bg-warning-subtle text-warning-custom">${cellVal}</span>`; 
                } else { 
                    td.innerText = cellVal; 
                } 
                tr.appendChild(td); 
            }); 

            bodyNode.appendChild(tr); 
        }); 

        document.querySelectorAll(".row-print-checkbox").forEach(cb => { 
            cb.addEventListener("change", (e) => { 
                const boundRowDOMId = e.target.getAttribute("data-row-element-id"); 
                const rowDomNode = document.getElementById(boundRowDOMId); 
                if (e.target.checked) { 
                    rowDomNode.classList.remove("hide-row-on-print"); 
                } else { 
                    rowDomNode.classList.add("hide-row-on-print"); 
                } 
            }); 
        }); 
    } 

    document.getElementById("reportLoaderView").classList.add("d-none"); 
    document.getElementById("reportDisplayView").classList.remove("d-none"); 
} 

function triggerLandscapePrintProcess() { 
    const timestampNode = document.getElementById("lblPrintTimestamp"); 
    if (timestampNode) { 
        timestampNode.innerText = `Printed On: ${new Date().toLocaleString()}`; 
    } 
    window.print(); 
} 

function exportActiveTableToExcelFile() { 
    if (targetCompiledReportRows.length === 0) return; 
    const worksheet = XLSX.utils.json_to_sheet(targetCompiledReportRows); 
    const workbook = XLSX.utils.book_new(); 
    XLSX.utils.book_append_sheet(workbook, worksheet, "LLR List Data"); 
    XLSX.writeFile(workbook, `LLR_List_${new Date().toISOString().slice(0, 10)}.xlsx`); 
} 

function exportActiveTableToCsvFile() { 
    if (targetCompiledReportRows.length === 0) return; 
    const worksheet = XLSX.utils.json_to_sheet(targetCompiledReportRows); 
    const csvOutput = XLSX.utils.sheet_to_csv(worksheet); 
    const blobObject = new Blob([csvOutput], { type: "text/csv;charset=utf-8;" }); 
    const link = document.createElement("a"); 
    link.href = URL.createObjectURL(blobObject); 
    link.setAttribute("download", `LLR_List_Export_${new Date().toISOString().slice(0, 10)}.csv`); 
    document.body.appendChild(link); 
    link.click(); 
    document.body.removeChild(link); 
}