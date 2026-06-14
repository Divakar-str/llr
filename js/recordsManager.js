// CONTROLLER LOGIC ENGINE FOR LIVE DATABASE GRID MANAGEMENT
const SHEET_API_URL = ENV.SHEET_API_URL;

let localCacheRecordsCollection = [];
let bootstrapModalInstance = null;

document.addEventListener("DOMContentLoaded", () => {
    // Initialize the Bootstrap modal overlay block component
    bootstrapModalInstance = new bootstrap.Modal(document.getElementById('editRecordModal'));
    
    // Wire up runtime user interactive event triggers
    fetchActiveSheetCollectionData();
    document.getElementById("refreshDataBtn").addEventListener("click", fetchActiveSheetCollectionData);
    document.getElementById("tableSearchInput").addEventListener("input", runLiveClientTableFiltering);
    document.getElementById("modalEditForm").addEventListener("submit", commitRowAuditsToServer);
});

/**
 * UTILITY HELPER: Cleans up messy ISO timestamps served by Google API
 * e.g., "2026-11-11T18:30:00.000Z" -> "11-11-2026"
 */
function cleanIncomingDate(dateStr) {
    if (!dateStr || dateStr === "-" || dateStr.toString().trim() === "") return "-";
    
    // Check if the string pattern represents an ISO string timestamp block containing 'T'
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
            console.error("Internal timestamp parsing recovery bypass:", e);
        }
    }
    
    // Fallback normalization: strip clock strings out if present and enforce hyphens
    return dateStr.toString().replace(/\//g, "-").split(" ")[0].trim();
}

// =========================================================================
// READ OPERATION: Queries records out from your script engine instance
// =========================================================================
async function fetchActiveSheetCollectionData() {
    const tableBody = document.getElementById("recordsTableBody");
    const badge = document.getElementById("recordCountBadge");
    
    // Keep badge processing state tracking readable
    badge.innerText = "Syncing...";

    try {
        const queryResponse = await fetch(SHEET_API_URL);
        
        if (!queryResponse.ok) {
            throw new Error(`HTTP network error code encountered: ${queryResponse.status}`);
        }
        
        const parseResult = await queryResponse.json();

        if (parseResult.status === "success") {
            localCacheRecordsCollection = parseResult.data || [];
            badge.innerText = `${localCacheRecordsCollection.length} Records Loaded`;
            renderGridTableRows(localCacheRecordsCollection);
        } else {
            throw new Error(parseResult.message || "Failed to compile sheet cell arrays data logs.");
        }
    } catch (fault) {
        console.error("API Read Execution Failure Stack:", fault);
        tableBody.innerHTML = `
            <tr>
                <td colspan="10" class="text-center text-danger py-5 fw-bold">
                    ❌ Data Fetch Connection Pipeline Interrupted<br>
                    <span class="small fw-normal text-muted">${fault.message}. Check browser console or env.js parameter keys.</span>
                </td>
            </tr>`;
        badge.innerText = "Error Fetching Data";
    }
}

/**
 * DATA RENDER ENGINE: Generates row components strictly ordered to layout expectations:
 * llr_number -> name -> date_of_birth -> vehicle_class -> mobile_number -> issue_date -> expiry_date -> approved_date -> dl_issued -> pipeline_actions
 */
function renderGridTableRows(recordsArray) {
    const tableBody = document.getElementById("recordsTableBody");
    
    if (recordsArray.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="10" class="text-center text-muted py-5">
                    <h5 class="mt-2 fw-semibold text-secondary">No Records Found</h5>
                    <p class="small text-muted mb-0">Your Google Sheets database contains no valid operational row data logs.</p>
                </td>
            </tr>`;
        return;
    }

    let compiledHtmlRows = "";
    recordsArray.forEach((item) => {
        const dlBadgeClass = item.dl_issued === "Yes" ? "bg-success" : "bg-warning text-dark";
        
        compiledHtmlRows += `
            <tr id="row-ref-${item.row_index}">
                <td class="ps-3 fw-bold text-dark">${item.llr_number || "-"}</td>
                <td class="fw-semibold text-secondary">${item.name || "-"}</td>
                <td class="small font-monospace text-muted">${cleanIncomingDate(item.date_of_birth)}</td>
                <td><span class="badge bg-primary px-2.5 py-1.5">${item.vehicle_class || "-"}</span></td>
                <td class="small font-monospace fw-medium">${item.mobile_number || "-"}</td>
                <td class="small text-secondary">${cleanIncomingDate(item.issue_date)}</td>
                <td class="small text-secondary">${cleanIncomingDate(item.expiry_date)}</td>
                
                <td><span class="badge ${dlBadgeClass}">${item.dl_issued || "No"}</span></td>
                <td class="text-center pe-3">
                    <button class="btn btn-sm btn-outline-primary fw-semibold me-1" onclick="triggerInPlaceEditModal(${item.row_index})">Edit</button>
                    <button class="btn btn-sm btn-outline-danger fw-semibold" onclick="triggerRowDeletionRequest(${item.row_index})">Delete</button>
                </td>
            </tr>
        `;
    });
    tableBody.innerHTML = compiledHtmlRows;
}

// =========================================================================
// REAL-TIME CLIENT SEARCH ENGINE (Filters instantly as you type)
// =========================================================================
function runLiveClientTableFiltering(event) {
    const term = event.target.value.toLowerCase().trim();
    if (!term) {
        renderGridTableRows(localCacheRecordsCollection);
        return;
    }

    const matchedCollection = localCacheRecordsCollection.filter(row => {
        return (row.llr_number && row.llr_number.toLowerCase().includes(term)) ||
               (row.fees_number && row.fees_number.toLowerCase().includes(term)) ||
               (row.name && row.name.toLowerCase().includes(term)) ||
               (row.vehicle_class && row.vehicle_class.toLowerCase().includes(term)) ||
               (row.mobile_number && row.mobile_number.toString().includes(term));
    });
    renderGridTableRows(matchedCollection);
}

// =========================================================================
// UPDATE OPERATION: Opens overlay popup form and populates current fields
// =========================================================================
window.triggerInPlaceEditModal = function(rowIndex) {
    const activeTargetRow = localCacheRecordsCollection.find(item => item.row_index === rowIndex);
    if (!activeTargetRow) return;

    // Directly hydrate form elements values inside modal inputs securely
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
    
    const targetForm = event.target;
    const saveButton = document.getElementById("saveEditBtn");
    const updatePayload = new FormData(targetForm);

    // Lock save button input states during runtime upload lifecycle processing transitions
    saveButton.disabled = true;
    saveButton.innerText = "Saving Changes...";

    try {
        const response = await fetch(SHEET_API_URL, {
            method: "POST",
            body: updatePayload
        });
        
        if (!response.ok) {
            throw new Error(`HTTP write failure encountered status code: ${response.status}`);
        }
        
        const statusReport = await response.json();

        if (statusReport.status === "success") {
            alert("✓ Database sheet entry row parameters updated and synchronized cleanly!");
            bootstrapModalInstance.hide();
            await fetchActiveSheetCollectionData(); // Force live re-sync grid database mapping matrix array
        } else {
            throw new Error(statusReport.message || "An unexpected error broke backend data mapping streams.");
        }
    } catch (err) {
        console.error("Mutation Error Logging Pipeline Trace:", err);
        alert("❌ Execution processing interrupted during save routines:\n" + err.message);
    } finally {
        saveButton.disabled = false;
        saveButton.innerText = "Update Database Record ✓";
    }
}

// =========================================================================
// DELETE OPERATION: Removes the record row out of the spreadsheet layout grid
// =========================================================================
window.triggerRowDeletionRequest = async function(rowIndex) {
    if (!confirm("⚠️ WARNING:\nAre you absolutely certain you want to purge this record entry out of spreadsheet matrix indexes permanently? This cannot be undone.")) return;

    const deletionPacket = new FormData();
    deletionPacket.append("action", "delete");
    deletionPacket.append("row_index", rowIndex);

    try {
        const response = await fetch(SHEET_API_URL, {
            method: "POST",
            body: deletionPacket
        });
        
        if (!response.ok) {
            throw new Error(`HTTP deletion connection fault exception status code: ${response.status}`);
        }
        
        const payloadStatus = await response.json();

        if (payloadStatus.status === "success") {
            alert("✓ Entry deleted successfully out of database repository files mapping rows!");
            await fetchActiveSheetCollectionData(); // Refresh structural row identifiers alignment maps cleanly
        } else {
            throw new Error(payloadStatus.message || "Spreadsheet interface engine denied data removal request.");
        }
    } catch (faultErr) {
        console.error("Deletion Pipeline Failure:", faultErr);
        alert("❌ Failed to execute row exclusion routing:\n" + faultErr.message);
    }
};


// =========================================================================
// INSERT OPERATION: Validates and pushes a completely new manual entry
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
    
    // Front-end Sanity Validation Checks
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
    
    // Debounce Flag Lockout: Block double clicks instantly
    saveButton.disabled = true;
    saveButton.innerText = "Synchronizing Registry Record Matrix...";

    try {
        const response = await fetch(SHEET_API_URL, {
            method: "POST",
            body: insertPayload
        });
        
        if (!response.ok) {
            throw new Error(`HTTP data pipeline error status: ${response.status}`);
        }
        
        const result = await response.json();

        if (result.status === "success") {
            alert(`✓ Record written successfully! Added at spreadsheet row index: ${result.row}`);
            
            targetForm.reset(); // Wipe inputs clean
            
            // Auto-navigate user back to the View Registry pane layout cleanly
            const viewTabTrigger = new bootstrap.Tab(document.getElementById('view-table-tab'));
            viewTabTrigger.show();
            
            await fetchActiveSheetCollectionData(); // Trigger fresh background re-sync
            
        } else if (result.status === "duplicate") {
            alert(`⚠️ Duplicate Entry Error:\n${result.message}`);
        } else {
            throw new Error(result.message || "An unhandled execution mismatch occurred on server.");
        }
    } catch (err) {
        console.error("Manual Entry Creation Failure:", err);
        alert(`❌ Write Blocked:\n${err.message}`);
    } finally {
        saveButton.disabled = false;
        saveButton.innerText = "Commit Entry to Sheet ✓";
    }
}