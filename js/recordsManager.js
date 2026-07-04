/**
 * LLR REGISTRY PORTAL - MAIN OPERATIONS ENGINE
 */
const SHEET_API_URL = ENV.SHEET_API_URL; 
let localCacheRecordsCollection = [];
let bootstrapModalInstance = null;

document.addEventListener("DOMContentLoaded", () => {
    // Mount the Bootstrap edit window popup
    const modalEl = document.getElementById('editRecordModal');
    if (modalEl) bootstrapModalInstance = new bootstrap.Modal(modalEl);
    
    // Initial download of data rows from the sheet
    fetchActiveSheetCollectionData();
    
    // Connect screen actions to the code logic
    document.getElementById("refreshDataBtn").addEventListener("click", fetchActiveSheetCollectionData);
    document.getElementById("tableSearchInput").addEventListener("input", runLiveClientFiltersPipeline);
    document.getElementById("filterStartDate").addEventListener("change", runLiveClientFiltersPipeline);
    document.getElementById("filterEndDate").addEventListener("change", runLiveClientFiltersPipeline);
    document.getElementById("modalEditForm").addEventListener("submit", commitRowAuditsToServer);
    document.getElementById("manualInsertForm").addEventListener("submit", commitManualInsertToServer);
});

/**
 * Normalizes input date strings into a standard format the browser can understand
 */
function parseStringToJsDate(dateStr) {
    if (!dateStr || dateStr === "-") return null;
    let cleanStr = dateStr.toString().split(" ")[0].trim().replace(/\//g, "-");
    if (cleanStr.includes("T")) cleanStr = cleanStr.split("T")[0];
    
    let elements = cleanStr.split("-");
    if (elements.length === 3) {
        // Handle YYYY-MM-DD
        if (elements[0].length === 4) {
            return new Date(parseInt(elements[0], 10), parseInt(elements[1], 10) - 1, parseInt(elements[2], 10));
        }
        // Handle DD-MM-YYYY
        if (elements[2].length === 4) {
            return new Date(parseInt(elements[2], 10), parseInt(elements[1], 10) - 1, parseInt(elements[0], 10));
        }
    }
    return null;
}

/**
 * Cleans up and reformats incoming dates into a standard DD-MM-YYYY layout
 */
function cleanIncomingDate(dateStr) {
    if (!dateStr || dateStr === "-" || dateStr.toString().trim() === "") return "-";
    if (dateStr.toString().includes("T")) {
        try {
            const dateObj = new Date(dateStr);
            if (!isNaN(dateObj.getTime())) {
                return `${String(dateObj.getDate()).padStart(2, '0')}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${dateObj.getFullYear()}`;
            }
        } catch (e) { console.error("Date format alignment skipped:", e); }
    }
    return dateStr.toString().replace(/\//g, "-").split(" ")[0].trim();
}

/**
 * Downloads live data rows from the Google Sheet URL
 */
async function fetchActiveSheetCollectionData() {
    const tableBody = document.getElementById("recordsTableBody");
    const badge = document.getElementById("recordCountBadge");
    if (!tableBody || !badge) return;

    badge.innerText = "Syncing...";
    
    // Show loading rows while waiting for data
    tableBody.innerHTML = Array(5).fill(`
        <tr>
            <td class="ps-4"><div class="shimmer-line" style="width: 80%;"></div></td>
            <td><div class="shimmer-line" style="width: 70%;"></div></td>
            <td><div class="shimmer-line" style="width: 60%;"></div></td>
            <td><div class="shimmer-line" style="width: 50%;"></div></td>
            <td><div class="shimmer-line" style="width: 65%;"></div></td>
            <td><div class="shimmer-line" style="width: 60%;"></div></td>
            <td><div class="shimmer-line" style="width: 60%;"></div></td>
            <td><div class="shimmer-line" style="width: 40%;"></div></td>
            <td class="text-center pe-4"><div class="shimmer-line" style="width: 80px;"></div></td>
        </tr>`).join('');

    try {
        const queryResponse = await fetch(SHEET_API_URL);
        if (!queryResponse.ok) throw new Error(`Data download failed: ${queryResponse.status}`);
        const parseResult = await queryResponse.json();
        
        if (parseResult.status === "success") {
            localCacheRecordsCollection = parseResult.data || [];
            badge.innerText = `${localCacheRecordsCollection.length} Records Loaded`;
            renderGridTableRows(localCacheRecordsCollection);
        } else {
            throw new Error(parseResult.message || "Unknown error parsing data from database.");
        }
    } catch (fault) {
        tableBody.innerHTML = `<tr><td colspan="9" class="text-center text-danger py-5 fw-bold">❌ Connection Interrupted<br><span class="small fw-normal text-muted">${fault.message}. Please check your env.js setups.</span></td></tr>`;
        badge.innerText = "Error Syncing";
    }
}

/**
 * Builds and draws the table rows onto the screen dashboard
 */
function renderGridTableRows(recordsArray) {
    const tableBody = document.getElementById("recordsTableBody");
    if (!tableBody) return;

    if (recordsArray.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="9" class="text-center text-muted py-5"><h5 class="mt-2 fw-semibold">No Matching Records Found</h5><p class="small text-muted mb-0">Try typing a different search word or changing your filter dates.</p></td></tr>`;
        return;
    }

    tableBody.innerHTML = recordsArray.map(item => {
        const dlBadgeClass = item.dl_issued === "Yes" ? "bg-success" : "bg-warning text-dark";
        return `
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
    }).join('');
}

/**
 * Advanced Filtering Pipeline (Handles text search & single/double date parameters)
 */
function runLiveClientFiltersPipeline() {
    const textTerm = document.getElementById("tableSearchInput").value.toLowerCase().trim();
    const startRangeStr = document.getElementById("filterStartDate").value;
    const endRangeStr = document.getElementById("filterEndDate").value;
    
    let processedDataset = localCacheRecordsCollection;

    // 1. Live Text Filtering Logic
    if (textTerm) {
        processedDataset = processedDataset.filter(row => 
            (row.llr_number && row.llr_number.toLowerCase().includes(textTerm)) ||
            (row.name && row.name.toLowerCase().includes(textTerm)) ||
            (row.mobile_number && row.mobile_number.toString().includes(textTerm)) ||
            (row.vehicle_class && row.vehicle_class.toLowerCase().includes(textTerm))
        );
    }

    // 2. Flexible Date Filtering Logic (Works even if only one date box is filled)
    if (startRangeStr || endRangeStr) {
        processedDataset = processedDataset.filter(row => {
            const currentIssueDate = parseStringToJsDate(row.issue_date);
            if (!currentIssueDate) return false;

            let matchesStart = true;
            let matchesEnd = true;

            if (startRangeStr) {
                const startThreshold = new Date(startRangeStr).setHours(0, 0, 0, 0);
                matchesStart = currentIssueDate.getTime() >= startThreshold;
            }

            if (endRangeStr) {
                const endThreshold = new Date(endRangeStr).setHours(23, 59, 59, 999);
                matchesEnd = currentIssueDate.getTime() <= endThreshold;
            }

            return matchesStart && matchesEnd;
        });
    }

    // Update screen badge count and draw filtered table content
    document.getElementById("recordCountBadge").innerText = `${processedDataset.length} Records Found`;
    renderGridTableRows(processedDataset);
}

/**
 * Gathers record details and loads them into the edit popup box fields
 */
window.triggerInPlaceEditModal = function(rowIndex) {
    const activeTargetRow = localCacheRecordsCollection.find(item => item.row_index === rowIndex);
    if (!activeTargetRow || !bootstrapModalInstance) return;

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

/**
 * Saves changes edited inside the window popup back to the sheet server
 */
async function commitRowAuditsToServer(event) {
    event.preventDefault();
    const saveButton = document.getElementById("saveEditBtn");
    saveButton.disabled = true;
    saveButton.innerText = "Saving...";

    try {
        const response = await fetch(SHEET_API_URL, { method: "POST", body: new FormData(event.target) });
        if (!response.ok) throw new Error(`Save failed: ${response.status}`);
        const statusReport = await response.json();
        
        if (statusReport.status === "success") {
            alert("✓ Changes saved successfully!");
            bootstrapModalInstance.hide();
            await fetchActiveSheetCollectionData();
        } else {
            throw new Error(statusReport.message || "Database rejected form update values.");
        }
    } catch (err) { alert("❌ Error saving configurations:\n" + err.message); }
    finally {
        saveButton.disabled = false;
        saveButton.innerHTML = `<span>Update Sheet Record</span> <i class="bi bi-cloud-arrow-up-fill"></i>`;
    }
}

/**
 * Saves a brand new manual form registration entry to the database
 */
async function commitManualInsertToServer(event) {
    event.preventDefault();
    const saveButton = document.getElementById("saveInsertBtn");
    const mobileValue = document.getElementById("addMobile").value.trim();

    if (mobileValue.length !== 10 || isNaN(mobileValue)) {
        alert("Validation Error: The phone number field must contain exactly 10 digits.");
        return;
    }

    saveButton.disabled = true;
    saveButton.innerText = "Saving Record...";

    try {
        const response = await fetch(SHEET_API_URL, { method: "POST", body: new FormData(event.target) });
        if (!response.ok) throw new Error(`Submission failed: ${response.status}`);
        const result = await response.json();
        
        if (result.status === "success") {
            alert(`✓ Record added successfully at row index: ${result.row}`);
            event.target.reset();
            // Automatically switch back to the main table screen tab view
            new bootstrap.Tab(document.getElementById('view-table-tab')).show();
            await fetchActiveSheetCollectionData();
        } else {
            throw new Error(result.message || "Database rejected new item submission.");
        }
    } catch (err) { alert(`❌ Save Blocked:\n${err.message}`); }
    finally {
        saveButton.disabled = false;
        saveButton.innerHTML = `<span>Commit Entry to Sheet</span> <i class="bi bi-cloud-arrow-up-fill"></i>`;
    }
}

/**
 * Handles permanent record deletion actions
 */
window.triggerRowDeletionRequest = async function(rowIndex) {
    if (!confirm("Are you absolutely sure you want to delete this record permanently?")) return;
    const deletionPacket = new FormData();
    deletionPacket.append("action", "delete");
    deletionPacket.append("row_index", rowIndex);

    try {
        const response = await fetch(SHEET_API_URL, { method: "POST", body: deletionPacket });
        if (!response.ok) throw new Error(`Server returned error code: ${response.status}`);
        const payloadStatus = await response.json();
        
        if (payloadStatus.status === "success") {
            alert("✓ Entry deleted successfully out of database repository rows!");
            await fetchActiveSheetCollectionData();
        } else {
            throw new Error(payloadStatus.message || "Engine denied data removal.");
        }
    } catch (faultErr) { alert("❌ Failed to delete row:\n" + faultErr.message); }
};