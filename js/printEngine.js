// CONTROLLER FOR ADVANCED COLUMN SELECTIONS AND AUTOMATED OVERLAY PRINT ENGINE
const SHEET_API_URL = ENV.SHEET_API_URL;

let localCacheRecordsCollection = [];

// Default active starting columns list structure maps
let MASTER_TABLE_COLUMNS_SCHEMA = [
    { key: "llr_number", label: "LLR Number", isDynamicAdded: false },
    { key: "name", label: "Applicant Name", isDynamicAdded: false },
    { key: "date_of_birth", label: "Date of Birth", isDynamicAdded: false },
    { key: "vehicle_class", label: "Vehicle Class", isDynamicAdded: false },
    { key: "mobile_number", label: "Mobile Number", isDynamicAdded: false },
    { key: "issue_date", label: "Issue Date", isDynamicAdded: false },
    { key: "expiry_date", label: "Expiry Date", isDynamicAdded: false },
    { key: "dl_issued", label: "DL Issued", isDynamicAdded: true }
];

let localColumnsVisibilityState = {};

document.addEventListener("DOMContentLoaded", () => {
    const rawToday = new Date();
    const formattedToday = `${String(rawToday.getDate()).padStart(2, '0')}-${String(rawToday.getMonth() + 1).padStart(2, '0')}-${rawToday.getFullYear()}`;
    document.body.setAttribute("data-print-date", formattedToday);

    syncSchemaVisibilityTrackingLookup();
    renderOverlayModalColumnChecklist();
    fetchActiveRegistryPrintCollectionData();

    // Wire up runtime event triggers handles hooks
    document.getElementById("refreshBtn").addEventListener("click", fetchActiveRegistryPrintCollectionData);
    document.getElementById("triggerPrintBtn").addEventListener("click", executeBrowserPrintSystemCall);
    document.getElementById("addCustomColumnBtn").addEventListener("click", executeAddOptionalLlrColumnField);
    document.getElementById("toggleDlIssuedVisibility").addEventListener("change", runLiveClientFiltersPipeline);
    
    // CONTROLLING INPUT DOM ELEMENT VISIBILITY VIA FILTER MODES
    document.getElementById("filterTypeDropdown").addEventListener("change", (e) => {
        const outerDateBox = document.getElementById("conditionalDateContainer");
        const singleDateWrapper = document.getElementById("wrapperSingleDate");
        const rangeDateWrapper = document.getElementById("wrapperDateRange");
        const vehicleColumn = document.getElementById("vehicleFilterColumn");

        // First step: clear values and reset visibility settings layout classes completely
        outerDateBox.classList.add("d-none");
        singleDateWrapper.classList.add("d-none");
        rangeDateWrapper.classList.add("d-none");
        
        // Re-adjust column grid balance for crisp layout spacing
        vehicleColumn.className = "col-12 col-md-3";

        if (e.target.value === "SINGLE_DATE") {
            vehicleColumn.className = "col-12 col-md-3";
            outerDateBox.className = "col-12 col-md-5";
            outerDateBox.classList.remove("d-none");
            singleDateWrapper.classList.remove("d-none");
        } else if (e.target.value === "CUSTOM_RANGE") {
            vehicleColumn.className = "col-12 col-md-3";
            outerDateBox.className = "col-12 col-md-5";
            outerDateBox.classList.remove("d-none");
            rangeDateWrapper.classList.remove("d-none");
        }

        runLiveClientFiltersPipeline();
    });

    document.getElementById("filterTargetDate").addEventListener("change", runLiveClientFiltersPipeline);
    document.getElementById("filterStartDate").addEventListener("change", runLiveClientFiltersPipeline);
    document.getElementById("filterEndDate").addEventListener("change", runLiveClientFiltersPipeline);
    document.getElementById("filterVehicleClass").addEventListener("change", runLiveClientFiltersPipeline);
    document.getElementById("liveSearchQuery").addEventListener("input", runLiveClientFiltersPipeline);
});

function syncSchemaVisibilityTrackingLookup() {
    MASTER_TABLE_COLUMNS_SCHEMA.forEach(col => {
        if (localColumnsVisibilityState[col.key] === undefined) {
            localColumnsVisibilityState[col.key] = true;
        }
    });
}

function renderOverlayModalColumnChecklist() {
    const modalContainer = document.getElementById("modalColumnContainer");
    modalContainer.innerHTML = "";

    MASTER_TABLE_COLUMNS_SCHEMA.forEach(col => {
        const labelRow = document.createElement("label");
        labelRow.className = "popup-checkbox-row";
        labelRow.setAttribute("for", `pop-chk-${col.key}`);

        const trashBtnHtml = col.isDynamicAdded ? 
            `<button class="btn btn-sm btn-link text-danger p-0 ms-auto border-0" onclick="event.preventDefault(); dropDynamicColumnByKey('${col.key}')"><i class="bi bi-trash3-fill"></i></button>` : '';

        labelRow.innerHTML = `
            <div class="form-check m-0">
                <input class="form-check-input modal-col-checkbox" type="checkbox" id="pop-chk-${col.key}" data-col-key="${col.key}" ${localColumnsVisibilityState[col.key] ? 'checked' : ''} style="cursor: pointer;">
                <span class="small fw-bold text-dark ms-1">${col.label}</span>
            </div>
            ${trashBtnHtml}
        `;

        labelRow.querySelector("input").addEventListener("change", (e) => {
            const key = e.target.getAttribute("data-col-key");
            localColumnsVisibilityState[key] = e.target.checked;
            applyRuntimeTableColumnVisibilityToggles();
        });

        modalContainer.appendChild(labelRow);
    });
}

function executeAddOptionalLlrColumnField() {
    const selector = document.getElementById("customColumnSelect");
    const chosenFieldKey = selector.value;

    if (!chosenFieldKey) {
        alert("Selection Required: Please pick an unlisted LLR data field from the dropdown selection box list.");
        return;
    }

    const chosenFieldLabel = selector.options[selector.selectedIndex].text;
    const isAlreadyPresent = MASTER_TABLE_COLUMNS_SCHEMA.some(col => col.key === chosenFieldKey);
    if (isAlreadyPresent) {
        alert(`Attention: The "${chosenFieldLabel}" data column field is already active.`);
        return;
    }

    MASTER_TABLE_COLUMNS_SCHEMA.push({ key: chosenFieldKey, label: chosenFieldLabel, isDynamicAdded: true });
    localColumnsVisibilityState[chosenFieldKey] = true;
    selector.value = "";

    renderOverlayModalColumnChecklist();
    runLiveClientFiltersPipeline();
}

window.dropDynamicColumnByKey = function(targetKey) {
    MASTER_TABLE_COLUMNS_SCHEMA = MASTER_TABLE_COLUMNS_SCHEMA.filter(col => col.key !== targetKey);
    delete localColumnsVisibilityState[targetKey];
    
    renderOverlayModalColumnChecklist();
    runLiveClientFiltersPipeline();
};

async function fetchActiveRegistryPrintCollectionData() {
    const tableBody = document.getElementById("printTableBody");
    tableBody.innerHTML = `<tr><td colspan="100" class="text-center py-5 text-muted small"><div class="spinner-border spinner-border-sm text-dark me-2"></div>Syncing master database entries from cloud channels...</td></tr>`;

    try {
        const response = await fetch(SHEET_API_URL);
        if (!response.ok) throw new Error(`HTTP data connection pipeline down: ${response.status}`);
        
        const parseResult = await response.json();
        if (parseResult.status === "success") {
            localCacheRecordsCollection = parseResult.data || [];
            runLiveClientFiltersPipeline();
        } else {
            throw new Error(parseResult.message || "Remote sheet script engine denied entry arrays request.");
        }
    } catch (fault) {
        tableBody.innerHTML = `<tr><td colspan="100" class="text-center text-danger py-4 fw-bold">❌ Connection Interrupted<br><span class="small fw-normal text-muted">${fault.message}</span></td></tr>`;
    }
}

function runLiveClientFiltersPipeline() {
    const rightNow = new Date();
    
    const filterType = document.getElementById("filterTypeDropdown").value;
    const classFilter = document.getElementById("filterVehicleClass").value;
    const hideDlIssued = document.getElementById("toggleDlIssuedVisibility").checked;
    const targetSingleDateStr = document.getElementById("filterTargetDate").value;
    const startRangeStr = document.getElementById("filterStartDate").value;
    const endRangeStr = document.getElementById("filterEndDate").value;
    const query = document.getElementById("liveSearchQuery").value.toLowerCase().trim();

    let dataset = localCacheRecordsCollection;

    // 1. FILTER STAGE A: Toggle Row Switch Constraints
    if (hideDlIssued) {
        dataset = dataset.filter(row => row.dl_issued !== "Yes");
    }

    // 2. FILTER STAGE B: Core 4-Tier Filter Logic Pipeline
    if (filterType === "SINGLE_DATE" && targetSingleDateStr) {
        const thresholdTargetTimestamp = new Date(targetSingleDateStr).setHours(0,0,0,0);
        dataset = dataset.filter(row => {
            const currentIssueJsDate = parseStringToJsDate(row.issue_date);
            return currentIssueJsDate && currentIssueJsDate.setHours(0,0,0,0) === thresholdTargetTimestamp;
        });
    } else if (filterType === "CUSTOM_RANGE" && startRangeStr && endRangeStr) {
        const tsStart = new Date(startRangeStr).setHours(0,0,0,0);
        const tsEnd = new Date(endRangeStr).setHours(23,59,59,999);
        dataset = dataset.filter(row => {
            const issue = parseStringToJsDate(row.issue_date);
            return issue && issue.getTime() >= tsStart && issue.getTime() <= tsEnd;
        });
    } else if (filterType === "ELIMINATED_31DAYS") {
        dataset = dataset.filter(row => {
            const issue = parseStringToJsDate(row.issue_date);
            if (!issue) return false;
            return Math.floor((rightNow.getTime() - issue.getTime()) / (1000 * 60 * 60 * 24)) >= 31;
        });
    }

    // 3. FILTER STAGE C: Class Filters
    if (classFilter !== "ALL") {
        if (classFilter === "COMBINED") {
            dataset = dataset.filter(row => {
                const val = String(row.vehicle_class).toUpperCase();
                return (val.includes("MCWOG") || val.includes("MCWG")) && val.includes("LMV");
            });
        } else {
            dataset = dataset.filter(row => String(row.vehicle_class).toUpperCase() === classFilter);
        }
    }

    // 4. FILTER STAGE D: Live Global Queries
    if (query) {
        dataset = dataset.filter(row => {
            return (row.llr_number && row.llr_number.toLowerCase().includes(query)) ||
                   (row.name && row.name.toLowerCase().includes(query)) ||
                   (row.vehicle_class && row.vehicle_class.toLowerCase().includes(query)) ||
                   (row.mobile_number && row.mobile_number.toString().includes(query));
        });
    }

    let scopeLabelDescription = `Filter Rule Mode Selection [${filterType}]`;
    if (filterType === "SINGLE_DATE" && targetSingleDateStr) scopeLabelDescription += ` | Date Point: ${targetSingleDateStr}`;
    if (classFilter !== "ALL") scopeLabelDescription += ` | Transit Class: ${classFilter}`;
    document.body.setAttribute("data-print-scope", scopeLabelDescription);

    renderPrintTargetMasterGridRows(dataset);
}

function renderPrintTargetMasterGridRows(compiledDatasetArray) {
    const headContainer = document.getElementById("tableHeaderSelectors");
    const bodyContainer = document.getElementById("printTableBody");

    let headerHtmlRow = "<tr>";
    MASTER_TABLE_COLUMNS_SCHEMA.forEach(col => {
        headerHtmlRow += `<th data-header-key="${col.key}">${col.label}</th>`;
    });
    headerHtmlRow += "</tr>";
    headContainer.innerHTML = headerHtmlRow;

    if (compiledDatasetArray.length === 0) {
        bodyContainer.innerHTML = `<tr><td colspan="100" class="text-center text-muted py-5 small fw-medium">No active record rows matches discovered matching current conditions.</td></tr>`;
        return;
    }

    let bodyHtmlRows = "";
    compiledDatasetArray.forEach(row => {
        bodyHtmlRows += `<tr data-row-index-id="${row.row_index}">`;
        
        MASTER_TABLE_COLUMNS_SCHEMA.forEach(col => {
            let valueFieldData = row[col.key] !== undefined ? row[col.key] : "-";
            
            if (col.key.includes("date") || col.key === "date_of_birth") {
                valueFieldData = cleanIncomingDate(valueFieldData);
            }

            if (col.key === "llr_number") {
                bodyHtmlRows += `<td data-cell-key="${col.key}" class="fw-bold text-dark small">${valueFieldData}</td>`;
            } else if (col.key === "name") {
                bodyHtmlRows += `<td data-cell-key="${col.key}" class="fw-semibold text-secondary small">${valueFieldData}</td>`;
            } else if (col.key === "dl_issued") {
                bodyHtmlRows += `<td data-cell-key="${col.key}"><span class="badge ${valueFieldData === 'Yes' ? 'bg-success' : 'bg-warning text-dark'}">${valueFieldData}</span></td>`;
            } else {
                bodyHtmlRows += `<td data-cell-key="${col.key}" class="small text-secondary">${valueFieldData}</td>`;
            }
        });
        
        bodyHtmlRows += "</tr>";
    });
    bodyContainer.innerHTML = bodyHtmlRows;

    applyRuntimeTableColumnVisibilityToggles();
}

function applyRuntimeTableColumnVisibilityToggles() {
    MASTER_TABLE_COLUMNS_SCHEMA.forEach(col => {
        const isVisible = localColumnsVisibilityState[col.key];
        
        const thElement = document.querySelector(`th[data-header-key="${col.key}"]`);
        if (thElement) {
            if (isVisible) thElement.classList.remove("col-hidden");
            else thElement.classList.add("col-hidden");
        }

        const tdCellsElementsList = document.querySelectorAll(`td[data-cell-key="${col.key}"]`);
        tdCellsElementsList.forEach(td => {
            if (isVisible) td.classList.remove("col-hidden");
            else td.classList.add("col-hidden");
        });
    });
}

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

function cleanIncomingDate(dateStr) {
    if (!dateStr || dateStr === "-" || dateStr.toString().trim() === "") return "-";
    if (dateStr.toString().includes("T")) {
        try {
            const dateObj = new Date(dateStr);
            if (!isNaN(dateObj.getTime())) {
                const day = String(dateObj.getDate()).padStart(2, '0');
                const month = String(dateObj.getMonth() + 1).padStart(2, '0');
                const year = dateObj.getFullYear();
                return `${day}-${month}-${year}`;
            }
        } catch (e) {}
    }
    return dateStr.toString().replace(/\//g, "-").split(" ")[0].trim();
}

function executeBrowserPrintSystemCall() {
    if (document.querySelector("#printTableBody td[colspan]")) {
        alert("Action Aborted:\nThere are currently no filtered row entries inside the preview manifest grid available to print.");
        return;
    }
    window.print();
}