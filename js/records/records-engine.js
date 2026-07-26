/**
 * Local-First Data Loader Pipeline
 */
async function fetchActiveSheetCollectionData(forceRefresh = false) {
    const tableBody = document.getElementById("recordsTableBody");
    const badge = document.getElementById("recordCountBadge");
    if (!tableBody || !badge) return;

    const cachedData = getCachedData();
    if (!forceRefresh && cachedData && cachedData.length > 0) {
        localCacheRecordsCollection = cachedData;
        badge.innerText = `${localCacheRecordsCollection.length} Records Loaded (Cached)`;
        renderGridTableRows(localCacheRecordsCollection);
        return;
    }

    badge.innerText = "Syncing...";

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
            <td class="text-center pe-4"><div class="shimmer-line" style="width: 80px%;"></div></td>
        </tr>`).join('');

    try {
        const queryResponse = await fetch(SHEET_API_URL);
        if (!queryResponse.ok) throw new Error(`Data download failed: ${queryResponse.status}`);
        const parseResult = await queryResponse.json();

        if (parseResult.status === "success") {
            localCacheRecordsCollection = parseResult.data || [];
            setCachedData(localCacheRecordsCollection);
            badge.innerText = `${localCacheRecordsCollection.length} Records Loaded`;
            renderGridTableRows(localCacheRecordsCollection);
        } else {
            throw new Error(parseResult.message || "Unknown error parsing data from database.");
        }
    } catch (fault) {
        if (localCacheRecordsCollection.length > 0) {
            badge.innerText = `${localCacheRecordsCollection.length} Records (Offline)`;
            renderGridTableRows(localCacheRecordsCollection);
        } else {
            tableBody.innerHTML = `<tr><td colspan="9" class="text-center text-danger py-5 fw-bold">❌ Connection Interrupted<br><span class="small fw-normal text-muted">${fault.message}. Please check your env.js setups.</span></td></tr>`;
            badge.innerText = "Error Syncing";
        }
    }
}

/**
 * FIXED: Handles Form Edits without getting stuck on loading
 */
async function commitRowAuditsToServer(event) {
    event.preventDefault();
    const saveButton = document.getElementById("saveEditBtn");
    saveButton.disabled = true;
    saveButton.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span> Saving...`;

    const formData = new FormData(event.target);
    const rowIndex = parseInt(formData.get("row_index"), 10);

    const originalIndex = localCacheRecordsCollection.findIndex(r => Number(r.row_index) === Number(rowIndex));
    const originalRecord = originalIndex !== -1 ? { ...localCacheRecordsCollection[originalIndex] } : null;

    // Optimistic UI update
    if (originalIndex !== -1) {
        for (let [key, val] of formData.entries()) {
            localCacheRecordsCollection[originalIndex][key] = val;
        }
        setCachedData(localCacheRecordsCollection);
        renderGridTableRows(localCacheRecordsCollection);
    }

    try {
        const response = await fetch(SHEET_API_URL, { method: "POST", body: formData });
        if (!response.ok) throw new Error(`Save failed: ${response.status}`);
        const statusReport = await response.json();

        if (statusReport.status === "success") {
            if (bootstrapModalInstance) {
                bootstrapModalInstance.hide();
            }
            showToastNotification("✓ Record updated successfully!", true);
            
            // Background sync fresh data
            fetchActiveSheetCollectionData(true);
        } else {
            throw new Error(statusReport.message || "Database rejected form update values.");
        }
    } catch (err) {
        // Rollback on failure
        if (originalIndex !== -1 && originalRecord) {
            localCacheRecordsCollection[originalIndex] = originalRecord;
            setCachedData(localCacheRecordsCollection);
            renderGridTableRows(localCacheRecordsCollection);
        }
        showToastNotification("❌ Error saving changes: " + err.message, false);
    } finally {
        saveButton.disabled = false;
        saveButton.innerHTML = `<span>Save Changes</span> <i class="bi bi-cloud-arrow-up-fill"></i>`;
    }
}

/**
 * Handles New Insert
 */
async function commitManualInsertToServer(event) {
    event.preventDefault();
    const saveButton = document.getElementById("saveInsertBtn");
    const llrValue = document.getElementById("addLlrNumber")?.value || "";
    const mobileValue = document.getElementById("addMobile")?.value.trim() || "";

    if (mobileValue.length !== 10 || isNaN(mobileValue)) {
        showToastNotification("Validation Error: Phone number must be 10 digits.", false);
        return;
    }

    const dupCheck = checkForDuplicateEntries(llrValue, mobileValue);
    if (dupCheck.duplicateLlr) {
        if (!confirm(`⚠️ Warning: An entry with LLR Number "${llrValue}" already exists for ${dupCheck.duplicateLlr.name || 'another applicant'}.\n\nDo you still want to proceed?`)) {
            return;
        }
    } else if (dupCheck.duplicateMobile) {
        if (!confirm(`⚠️ Warning: Mobile number ${mobileValue} is registered under ${dupCheck.duplicateMobile.name || 'another applicant'}.\n\nDo you still want to proceed?`)) {
            return;
        }
    }

    saveButton.disabled = true;
    saveButton.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span> Saving...`;

    try {
        const response = await fetch(SHEET_API_URL, { method: "POST", body: new FormData(event.target) });
        if (!response.ok) throw new Error(`Submission failed: ${response.status}`);
        const result = await response.json();

        if (result.status === "success") {
            showToastNotification(`✓ Record added successfully at row index: ${result.row}`, true);
            event.target.reset();
            const viewTabBtn = document.getElementById('view-table-tab');
            if (viewTabBtn) {
                const tab = bootstrap.Tab.getOrCreateInstance(viewTabBtn);
                tab.show();
            }
            await fetchActiveSheetCollectionData(true);
        } else {
            throw new Error(result.message || "Database rejected new item submission.");
        }
    } catch (err) { showToastNotification(`❌ Save Blocked: ${err.message}`, false); }
    finally {
        saveButton.disabled = false;
        saveButton.innerHTML = `<span>Save New Record</span> <i class="bi bi-cloud-arrow-up-fill"></i>`;
    }
}

/**
 * Handles Permanent Row Deletion
 */
window.triggerRowDeletionRequest = async function(rowIndex) {
    if (!confirm("Are you absolutely sure you want to delete this record permanently?")) return;

    const originalCollection = [...localCacheRecordsCollection];
    localCacheRecordsCollection = localCacheRecordsCollection.filter(r => Number(r.row_index) !== Number(rowIndex));
    setCachedData(localCacheRecordsCollection);
    renderGridTableRows(localCacheRecordsCollection);

    const deletionPacket = new FormData();
    deletionPacket.append("action", "delete");
    deletionPacket.append("row_index", rowIndex);

    try {
        const response = await fetch(SHEET_API_URL, { method: "POST", body: deletionPacket });
        if (!response.ok) throw new Error(`Server returned error code: ${response.status}`);
        const payloadStatus = await response.json();

        if (payloadStatus.status === "success") {
            showToastNotification("✓ Entry deleted successfully!", true);
        } else {
            throw new Error(payloadStatus.message || "Engine denied data removal.");
        }
    } catch (faultErr) {
        localCacheRecordsCollection = originalCollection;
        setCachedData(localCacheRecordsCollection);
        renderGridTableRows(localCacheRecordsCollection);
        showToastNotification("❌ Failed to delete row: " + faultErr.message, false);
    }
};