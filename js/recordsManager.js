// CONTROLLER LOGIC ENGINE FOR LIVE DATABASE GRID MANAGEMENT
const SHEET_API_URL = ENV.SHEET_API_URL;

let localCacheRecordsCollection = [];
let bootstrapModalInstance = null;

document.addEventListener("DOMContentLoaded", () => {
    bootstrapModalInstance = new bootstrap.Modal(document.getElementById('editRecordModal'));
    
    // Wire up runtime event triggers
    fetchActiveSheetCollectionData();
    document.getElementById("refreshDataBtn").addEventListener("click", fetchActiveSheetCollectionData);
    document.getElementById("tableSearchInput").addEventListener("input", runLiveClientFiltersPipeline);
    document.getElementById("filterStartDate").addEventListener("change", runLiveClientFiltersPipeline);
    document.getElementById("filterEndDate").addEventListener("change", runLiveClientFiltersPipeline);
    document.getElementById("modalEditForm").addEventListener("submit", commitRowAuditsToServer);
});

/**
 * PARSER UTILITY: Standardizes DD-MM-YYYY string formats to Javascript evaluatable date timestamps
 */
function parseStringToJsDate(dateStr) {
    if (!dateStr || dateStr === "-") return null;
    
    // Handle incoming formats containing an ISO 'T' timestamp string layout
    let cleanStr = dateStr.toString().split(" ")[0].trim();
    if (cleanStr.includes("T")) {
        cleanStr = cleanStr.split("T")[0];
        let parts = cleanStr.split("-");
        if (parts.length === 3 && parts[0].length === 4) {
            return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
        }
    }
    
    cleanStr = cleanStr.replace(/\//g, "-");
    let elements = cleanStr.split("-");
    if (elements.length === 3) {
        // Evaluate if pattern is layout structure components match (DD-MM-YYYY)
        if (elements[2].length === 4) {
            return new Date(parseInt(elements[2], 10), parseInt(elements[1], 10) - 1, parseInt(elements[0], 10));
        }
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
        } catch (e) {
            console.error("Date normalization error recovery:", e);
        }
    }
    return dateStr.toString().replace(/\//g, "-").split(" ")[0].trim();
}

async function fetchActiveSheetCollectionData() {
    const tableBody = document.getElementById("recordsTableBody");
    const badge = document.getElementById("recordCountBadge");
    
    badge.innerText = "Syncing...";
    
    // Render loading shimmer templates block
    let skeletons = '';
    for(let i=0; i<5; i++) {
        skeletons += `
            <tr>
                <td class="ps-4"><div class="shimmer-line" style="width: 85%;"></div></td>
                <td><div class="shimmer-line" style="width: 70%;"></div></td>
                <td><div class="shimmer-line" style="width: 60%;"></div></td>
                <td><div class="shimmer-line" style="width: 50%;"></div></td>
                <td><div class="shimmer-line" style="width: 65%;"></div></td>
                <td><div class="shimmer-line" style="width: 60%;"></div></td>
                <td><div class="shimmer-line" style="width: 60%;"></div></td>
                <td><div class="shimmer-line" style="width: 40%;"></div></td>
                <td class="text-center pe-4"><div class="shimmer-line" style="width: 80px;"></div></td>
            </tr>`;
    }
    tableBody.innerHTML = skeletons;

    try {
        const queryResponse = await fetch(SHEET_API_URL);
        if (!queryResponse.ok) throw new Error(`HTTP data connection pipeline down: ${queryResponse.status}`);
        
        const parseResult = await queryResponse.json();

        if (parseResult.status === "success") {
            localCacheRecordsCollection = parseResult.data || [];
            badge.innerText = `${localCacheRecordsCollection.length} Records Loaded`;
            renderGridTableRows(localCacheRecordsCollection);
        } else {
            throw new Error(parseResult.message || "Engine denied tracking logs sync parameters mapping.");
        }
    } catch (fault) {
        console.error("API Read Execution Failure Stack:", fault);
        tableBody.innerHTML = `
            <tr>
                <td colspan="9" class="text-center text-danger py-5 fw-bold">
                    ❌ Data Fetch Connection Pipeline Interrupted<br>
                    <span class="small fw-normal text-muted">${fault.message}. Check your env.js setups.</span>
                </td>
            </tr>`;
        badge.innerText = "Error Syncing";
    }
}

function renderGridTableRows(recordsArray) {
    const tableBody = document.getElementById("recordsTableBody");
    
    if (recordsArray.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="9" class="text-center text-muted py-5">
                    <h5 class="mt-2 fw-semibold text-secondary">No Matching Records</h5>
                    <p class="small text-muted mb-0">No entries matched your combined text queries or date boundaries parameters.</p>
                </td>
            </tr>`;
        return;
    }

    let compiledHtmlRows = "";
    recordsArray.forEach((item) => {
        const dlBadgeClass = item.dl_issued === "Yes" ? "bg-success" : "bg-warning text-dark";
        
        compiledHtmlRows += `
            <tr id="row-ref-${item.row_index}">
                <td class="ps-4 fw-bold text-dark">${item.llr_number || "-"}</td>
                <td class="fw-semibold text-secondary">${item.name || "-"}</td>
                <td class="small font-monospace text-muted">${cleanIncomingDate(item.date_of_birth)}</td>
                <td><span class="badge bg-primary px-2.5 py-1.5">${item.vehicle_class || "-"}</span></td>
                <td class="small font-monospace fw-medium">${item.mobile_number || "-"}</td>
                <td class="small text-secondary">${cleanIncomingDate(item.issue_date)}</td>
                <td class="small text-secondary">${cleanIncomingDate(item.expiry_date)}</td>
                <td><span class="badge ${dlBadgeClass}">${item.dl_issued || "No"}</span></td>
                <td class="text-center pe-4">
                    <button class="btn btn-sm btn-outline-primary fw-semibold me-1" onclick="triggerInPlaceEditModal(${item.row_index})"><i class="bi bi-pencil-square"></i></button>
                    <button class="btn btn-sm btn-outline-danger fw-semibold" onclick="triggerRowDeletionRequest(${item.row_index})"><i class="bi bi-trash3-fill"></i></button>
                </td>
            </tr>`;
    });
    tableBody.innerHTML = compiledHtmlRows;
}

// =========================================================================
// REAL-TIME COMBINED FILTER PIPELINE (Processes search & issue dates)
// =========================================================================
function runLiveClientFiltersPipeline() {
    const textTerm = document.getElementById("tableSearchInput").value.toLowerCase().trim();
    const startRangeStr = document.getElementById("filterStartDate").value;
    const endRangeStr = document.getElementById("filterEndDate").value;

    let processedDataset = localCacheRecordsCollection;

    // 1. Apply Text Query Filtering Layout Passthrough
    if (textTerm) {
        processedDataset = processedDataset.filter(row => {
            return (row.llr_number && row.llr_number.toLowerCase().includes(textTerm)) ||
                   (row.fees_number && row.fees_number.toLowerCase().includes(textTerm)) ||
                   (row.name && row.name.toLowerCase().includes(textTerm)) ||
                   (row.vehicle_class && row.vehicle_class.toLowerCase().includes(textTerm)) ||
                   (row.mobile_number && row.mobile_number.toString().includes(textTerm));
        });
    }

    // 2. Apply Strict Issue Date Dynamic Timeline Bounds Check
    if (startRangeStr && endRangeStr) {
        const startThreshold = new Date(startRangeStr); startThreshold.setHours(0,0,0,0);
        const endThreshold = new Date(endRangeStr); endThreshold.setHours(23,59,59,999);

        processedDataset = processedDataset.filter(row => {
            const currentIssueDate = parseStringToJsDate(row.issue_date);
            if (!currentIssueDate) return false;
            return currentIssueDate.getTime() >= startThreshold.getTime() && currentIssueDate.getTime() <= endThreshold.getTime();
        });
    }

    document.getElementById("recordCountBadge").innerText = `${processedDataset.length} Records Found`;
    renderGridTableRows(processedDataset);
}

window.triggerInPlaceEditModal = function(rowIndex) {
    const activeTargetRow = localCacheRecordsCollection.find(item => item.row_index === rowIndex);
    if (!activeTargetRow) return;

    document.getElementById("editRowIndex").value = activeTargetRow.row_index;
    document.getElementById("editLlrNumber").value = activeTargetRow.llr_number || "";
    document.getElementById("editName").value = activeTargetRow.name || "";
    document.getElementById("editDob").value = cleanIncomingDate(activeTargetRow.date_of_birth);
    document.getElementById("editVehicleClass").value = activeTargetRow.vehicle_class || "LMV";
    document.getElementById("editMobile").value = activeTargetRow.mobile_number || "";
    
    document.getElementById("editIssueDate").value = cleanIncomingDate(activeTargetRow.issue_date);
    document.getElementById("editExpiryDate").value = cleanIncomingDate(activeTargetRow.expiry_date);
    document.getElementById("editApprovedDate").value = cleanIncomingDate(activeTargetRow.approved_date);
    
    document.getElementById("editFeesNumber").value = activeTargetRow.fees_number || "";
    document.getElementById("editFee").value = activeTargetRow.fee || "";
    document.getElementById("editBloodGroup").value = activeTargetRow.blood_group || "";
    document.getElementById("editRelativeType").value = activeTargetRow.relative_type || "Father";
    document.getElementById("editRelativeName").value = activeTargetRow.relative_name || "";
    document.getElementById("editPresentAddress").value = activeTargetRow.present_address || "";
    document.getElementById("editPermanentAddress").value = activeTargetRow.permanent_address || "";
    document.getElementById("editIdMark1").value = activeTargetRow.identification_mark_1 || "";
    document.getElementById("editIdMark2").value = activeTargetRow.identification_mark_2 || "";
    document.getElementById("editEmergencyMobile").value = activeTargetRow.emergency_mobile || "";
    document.getElementById("editDlIssued").value = activeTargetRow.dl_issued === "Yes" ? "Yes" : "No";
    document.getElementById("editDlNumber").value = activeTargetRow.dl_number || "";

    bootstrapModalInstance.show();
};

async function commitRowAuditsToServer(event) {
    event.preventDefault();
    const saveButton = document.getElementById("saveEditBtn");
    const updatePayload = new FormData(event.target);

    saveButton.disabled = true;
    saveButton.innerText = "Saving Changes...";

    try {
        const response = await fetch(SHEET_API_URL, { method: "POST", body: updatePayload });
        if (!response.ok) throw new Error(`HTTP write failure: ${response.status}`);
        
        const statusReport = await response.json();
        if (statusReport.status === "success") {
            alert("✓ Database sheet row parameters updated successfully!");
            bootstrapModalInstance.hide();
            await fetchActiveSheetCollectionData();
        } else {
            throw new Error(statusReport.message || "Backend data stream mismatch.");
        }
    } catch (err) {
        alert("❌ Error saving configurations:\n" + err.message);
    } finally {
        saveButton.disabled = false;
        saveButton.innerText = "Update Database Record ✓";
    }
}

window.triggerRowDeletionRequest = async function(rowIndex) {
    if (!confirm("Are you certain you want to purge this record entry permanently?")) return;

    const deletionPacket = new FormData();
    deletionPacket.append("action", "delete");
    deletionPacket.append("row_index", rowIndex);

    try {
        const response = await fetch(SHEET_API_URL, { method: "POST", body: deletionPacket });
        if (!response.ok) throw new Error(`HTTP fault exception: ${response.status}`);
        
        const payloadStatus = await response.json();
        if (payloadStatus.status === "success") {
            alert("✓ Entry deleted successfully out of database repository rows!");
            await fetchActiveSheetCollectionData();
        } else {
            throw new Error(payloadStatus.message || "Engine denied data removal.");
        }
    } catch (faultErr) {
        alert("❌ Failed to delete row:\n" + faultErr.message);
    }
};

// =========================================================================
// INSERT OPERATION: Manual Ingestion Logic Subsystem
// =========================================================================
document.addEventListener("DOMContentLoaded", () => {
    const manualForm = document.getElementById("manualInsertForm");
    if (manualForm) {
        manualForm.addEventListener("submit", commitManualInsertToServer);
    }
});

async function commitManualInsertToServer(event) {
    event.preventDefault();
    const targetForm = event.target;
    const saveButton = document.getElementById("saveInsertBtn");
    
    const llrValue = document.getElementById("addLlrNumber").value.trim();
    const mobileValue = document.getElementById("addMobile").value.trim();
    
    if (!llrValue || llrValue === "-") {
        alert("Validation Fault: Please enter a valid LLR Number key.");
        return;
    }
    if (mobileValue.length !== 10 || isNaN(mobileValue)) {
        alert("Validation Fault: Primary mobile number must contain exactly 10 digits.");
        return;
    }

    const insertPayload = new FormData(targetForm);
    saveButton.disabled = true;
    saveButton.innerText = "Synchronizing Matrix...";

    try {
        const response = await fetch(SHEET_API_URL, { method: "POST", body: insertPayload });
        if (!response.ok) throw new Error(`HTTP error status: ${response.status}`);
        
        const result = await response.json();
        if (result.status === "success") {
            alert(`✓ Record added successfully at row index: ${result.row}`);
            targetForm.reset();
            
            const viewTabTrigger = new bootstrap.Tab(document.getElementById('view-table-tab'));
            viewTabTrigger.show();
            await fetchActiveSheetCollectionData();
        } else if (result.status === "duplicate") {
            alert(`⚠️ Duplicate Entry Error:\n${result.message}`);
        } else {
            throw new Error(result.message || "Server exception execution error.");
        }
    } catch (err) {
        alert(`❌ Write Blocked:\n${err.message}`);
    } finally {
        saveButton.disabled = false;
        saveButton.innerText = "Commit Entry to Sheet ✓";
    }
}