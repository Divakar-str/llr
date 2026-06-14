// ADVANCED PRINT MANIFEST COMPILATION LOGIC CONTROLLER
const SHEET_API_URL = ENV.SHEET_API_URL;

let rawDatabaseCache = [];

// Complete list of headers used to build column toggles
const STRUCTURAL_COLUMNS_MAP = [
    { id: "llr_number", label: "LLR Number" },
    { id: "name", label: "Applicant Name" },
    { id: "date_of_birth", label: "DOB" },
    { id: "relative_name", label: "Relative Name" },
    { id: "vehicle_class", label: "Vehicle Class" },
    { id: "relative_type", label: "Relative Type" },
    { id: "mobile_number", label: "Mobile" },
    { id: "emergency_mobile", label: "Emergency Mobile" },
    { id: "issue_date", label: "Issue Date" },
    { id: "approved_date", label: "Approved Date" },
    { id: "expiry_date", label: "Expiry Date" },
    { id: "blood_group", label: "Blood Group" },
    { id: "present_address", label: "Present Address" },
    { id: "permanent_address", label: "Permanent Address" },
    { id: "identification_mark_1", label: "ID Mark 1" },
    { id: "identification_mark_2", label: "ID Mark 2" },
    { id: "dl_issued", label: "DL Status" },
    { id: "dl_number", label: "DL Number" }
];

// --- COMPLIANCE WHITELIST INITIALIZATION ---
const DEFAULT_CHECKED_COLUMNS = [
    "llr_number", 
    "name", 
    "date_of_birth", 
    "relative_name", 
    "vehicle_class", 
    "mobile_number", 
    "emergency_mobile", 
    "issue_date", 
    "expiry_date", 
];

let columnsVisibilityState = {};
STRUCTURAL_COLUMNS_MAP.forEach(col => { 
    columnsVisibilityState[col.id] = DEFAULT_CHECKED_COLUMNS.includes(col.id); 
});

document.addEventListener("DOMContentLoaded", () => {
    const todayStr = new Date().toLocaleDateString('en-IN', { dateStyle: 'long' });
    document.body.setAttribute('data-print-date', todayStr);
    
    initializeWorkspaceControls();
    fetchSpreadsheetRecords();
});

function initializeWorkspaceControls() {
    const checkboxesContainer = document.getElementById("columnCheckboxesContainer");
    let checkboxesHtml = "";
    
    STRUCTURAL_COLUMNS_MAP.forEach(col => {
        const isChecked = columnsVisibilityState[col.id] ? "checked" : "";
        checkboxesHtml += `
            <div class="form-check form-check-inline bg-light px-3 py-2 rounded-3 border mb-2">
                <input class="form-check-input col-toggle-chk" type="checkbox" id="chk-${col.id}" data-col="${col.id}" ${isChecked} style="cursor:pointer;">
                <label class="form-check-label small fw-bold text-dark" for="chk-${col.id}" style="cursor:pointer; user-select:none;">${col.label}</label>
            </div>`;
    });
    checkboxesContainer.innerHTML = checkboxesHtml;

    document.querySelectorAll(".col-toggle-chk").forEach(chk => {
        chk.addEventListener("change", (e) => {
            const colId = e.target.getAttribute("data-col");
            columnsVisibilityState[colId] = e.target.checked;
            executeFilterAndRenderPipeline();
        });
    });

    document.getElementById("refreshBtn").addEventListener("click", fetchSpreadsheetRecords);
    document.getElementById("filterTypeDropdown").addEventListener("change", executeFilterAndRenderPipeline);
    document.getElementById("filterStartDate").addEventListener("change", executeFilterAndRenderPipeline);
    document.getElementById("filterEndDate").addEventListener("change", executeFilterAndRenderPipeline);
    document.getElementById("filterVehicleClass").addEventListener("change", executeFilterAndRenderPipeline);
    document.getElementById("filterDlStatus").addEventListener("change", executeFilterAndRenderPipeline);
    document.getElementById("liveSearchQuery").addEventListener("input", executeFilterAndRenderPipeline);
    
    // SAFE EXECUTION PRINT ROUTINE: Guarantees full orientation reset before running native system dialogs
    document.getElementById("triggerPrintBtn").addEventListener("click", () => {
        window.scrollTo(0,0);
        setTimeout(() => {
            window.print();
        }, 50);
    });
}

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

async function fetchSpreadsheetRecords() {
    try {
        const res = await fetch(SHEET_API_URL);
        const json = await res.json();
        if (json.status !== "success") throw new Error(json.message);
        
        rawDatabaseCache = json.data || [];
        executeFilterAndRenderPipeline();
    } catch (err) {
        console.error("Print core connection break:", err);
        document.getElementById("printTableBody").innerHTML = `<tr><td colspan="100" class="text-center text-danger py-4 fw-bold">❌ Connection Interrupted: ${err.message}</td></tr>`;
    }
}

function executeFilterAndRenderPipeline() {
    const today = new Date(); today.setHours(0,0,0,0);
    
    const filterType = document.getElementById("filterTypeDropdown").value;
    const startStr = document.getElementById("filterStartDate").value;
    const endStr = document.getElementById("filterEndDate").value;
    const vehicleClass = document.getElementById("filterVehicleClass").value;
    const dlStatus = document.getElementById("filterDlStatus").value;
    const searchKeyword = document.getElementById("liveSearchQuery").value.toLowerCase().trim();

    document.body.setAttribute('data-print-scope', `Filter: ${filterType} | Class: ${vehicleClass} | DL: ${dlStatus}`);

    let filteredDataset = rawDatabaseCache.filter(item => {
        if (dlStatus === "PENDING" && item.dl_issued === "Yes") return false;
        if (dlStatus === "ISSUED" && item.dl_issued !== "Yes") return false;

        if (vehicleClass !== "ALL") {
            if (!item.vehicle_class) return false;
            const recordClass = item.vehicle_class.toUpperCase().replace(/\s+/g, "");
            
            if (vehicleClass === "COMBINED") {
                const combinedMatch = (recordClass.includes("MCWOG") && recordClass.includes("LMV")) || 
                                      (recordClass.includes("MCWG") && recordClass.includes("LMV"));
                if (!combinedMatch) return false;
            } else if (!recordClass.includes(vehicleClass)) {
                return false;
            }
        }

        const issueDateObj = parseDatabaseDate(item.issue_date);
        const expiryDateObj = parseDatabaseDate(item.expiry_date);
        
        let targetDateForRangeCheck = null;
        if (filterType === "ISSUE_RANGE") targetDateForRangeCheck = issueDateObj;
        if (filterType === "EXPIRY_RANGE") targetDateForRangeCheck = expiryDateObj;

        if (targetDateForRangeCheck && startStr && endStr) {
            const rangeStart = new Date(startStr); rangeStart.setHours(0,0,0,0);
            const rangeEnd = new Date(endStr); rangeEnd.setHours(23,59,59,999);
            
            if (targetDateForRangeCheck.getTime() < rangeStart.getTime() || targetDateForRangeCheck.getTime() > rangeEnd.getTime()) {
                return false;
            }
        }

        if (filterType === "ELIMINATED_31DAYS") {
            if (!issueDateObj || !expiryDateObj) return false;
            const daysPassed = Math.floor((today.getTime() - issueDateObj.getTime()) / (1000 * 60 * 60 * 24));
            
            const passed31Days = daysPassed >= 31;
            const isStillValid = expiryDateObj.getTime() >= today.getTime();
            if (!passed31Days || !isStillValid) return false;
        }

        if (searchKeyword) {
            const matchString = `${item.name} ${item.llr_number} ${item.mobile_number} ${item.relative_name} ${item.blood_group}`.toLowerCase();
            if (!matchString.includes(searchKeyword)) return false;
        }

        return true;
    });

    document.getElementById("previewTitle").innerText = `Data Ledger Preview Manifest (${filteredDataset.length} Records Loaded)`;
    renderPrintGridTable(filteredDataset);
}

function renderPrintGridTable(dataset) {
    const headerRow = document.getElementById("tableHeaderSelectors");
    const tableBody = document.getElementById("printTableBody");

    let headerHtml = "<tr>";
    STRUCTURAL_COLUMNS_MAP.forEach(col => {
        const hiddenClass = columnsVisibilityState[col.id] ? "" : "col-hidden";
        headerHtml += `<th class="${hiddenClass} ${col.id === 'llr_number' ? 'ps-3' : ''}">${col.label}</th>`;
    });
    headerHtml += "</tr>";
    headerRow.innerHTML = headerHtml;

    if (dataset.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="100" class="text-center py-5 text-muted fw-semibold">No operational records match your active query configuration profile.</td></tr>`;
        return;
    }

    let bodyHtml = "";
    dataset.forEach(item => {
        bodyHtml += "<tr>";
        STRUCTURAL_COLUMNS_MAP.forEach(col => {
            const hiddenClass = columnsVisibilityState[col.id] ? "" : "col-hidden";
            let cellValue = item[col.id] || "-";
            
            let customStyle = "";
            if (col.id === 'llr_number') customStyle = 'fw-bold text-dark ps-3';
            if (col.id === 'name') customStyle = 'fw-semibold text-secondary';
            if (col.id === 'dl_issued') customStyle = `fw-bold ${item.dl_issued === 'Yes' ? 'text-success' : 'text-warning'}`;

            bodyHtml += `<td class="${hiddenClass} ${customStyle}">${cellValue}</td>`;
        });
        bodyHtml += "</tr>";
    });
    tableBody.innerHTML = bodyHtml;
}