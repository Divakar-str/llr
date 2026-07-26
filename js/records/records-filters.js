/**
 * Advanced Filtering Pipeline
 */
function runLiveClientFiltersPipeline() {
    const searchEl = document.getElementById("tableSearchInput");
    const startEl = document.getElementById("filterStartDate");
    const endEl = document.getElementById("filterEndDate");

    const textTerm = searchEl ? searchEl.value.toLowerCase().trim() : "";
    const startRangeStr = startEl ? startEl.value : "";
    const endRangeStr = endEl ? endEl.value : "";

    let processedDataset = localCacheRecordsCollection;

    // 1. Text Search
    if (textTerm !== "") {
        processedDataset = processedDataset.filter(row =>
            (row.llr_number && row.llr_number.toLowerCase().includes(textTerm)) ||
            (row.name && row.name.toLowerCase().includes(textTerm)) ||
            (row.mobile_number && row.mobile_number.toString().includes(textTerm)) ||
            (row.vehicle_class && row.vehicle_class.toLowerCase().includes(textTerm))
        );
    }

    // 2. Date Filtering
    if (startRangeStr !== "" || endRangeStr !== "") {
        const startThreshold = startRangeStr ? new Date(startRangeStr).setHours(0, 0, 0, 0) : null;
        const endThreshold = endRangeStr ? new Date(endRangeStr).setHours(23, 59, 59, 999) : null;

        processedDataset = processedDataset.filter(row => {
            const currentIssueDate = parseStringToJsDate(row.issue_date);
            if (!currentIssueDate) return false;

            const time = currentIssueDate.getTime();
            if (startThreshold && time < startThreshold) return false;
            if (endThreshold && time > endThreshold) return false;

            return true;
        });
    }

    const badge = document.getElementById("recordCountBadge");
    if (badge) badge.innerText = `${processedDataset.length} Records Found`;

    renderGridTableRows(processedDataset);
}

/**
 * Resets search & date filters
 */
function resetFiltersAndRefreshUI() {
    const searchInput = document.getElementById("tableSearchInput");
    const startDateInput = document.getElementById("filterStartDate");
    const endDateInput = document.getElementById("filterEndDate");

    if (searchInput) searchInput.value = "";
    if (startDateInput) startDateInput.value = "";
    if (endDateInput) endDateInput.value = "";

    currentPage = 1;
    const badge = document.getElementById("recordCountBadge");
    if (badge) badge.innerText = `${localCacheRecordsCollection.length} Records Loaded`;

    renderGridTableRows(localCacheRecordsCollection);
}

/**
 * Scans local memory for duplicates
 */
function checkForDuplicateEntries(llrVal, mobileVal) {
    const cleanLlr = (llrVal || "").trim().toLowerCase();
    const cleanMob = (mobileVal || "").trim();

    const existingLlr = cleanLlr !== "" ? localCacheRecordsCollection.find(r => (r.llr_number || "").trim().toLowerCase() === cleanLlr) : null;
    const existingMob = cleanMob.length === 10 ? localCacheRecordsCollection.find(r => (r.mobile_number || "").toString().trim() === cleanMob) : null;

    return {
        duplicateLlr: existingLlr || null,
        duplicateMobile: existingMob || null
    };
}

/**
 * Live Duplicate Warning Banner
 */
function triggerDuplicateScanOnInput() {
    const llrVal = document.getElementById("addLlrNumber")?.value || "";
    const mobVal = document.getElementById("addMobile")?.value || "";
    const warningBox = document.getElementById("insertDuplicateWarning");
    const warningText = document.getElementById("insertDuplicateWarningText");

    if (!warningBox || !warningText) return;

    const dup = checkForDuplicateEntries(llrVal, mobVal);

    if (dup.duplicateLlr) {
        warningText.innerText = `⚠️ Duplicate Match: LLR "${llrVal}" is registered to ${dup.duplicateLlr.name || 'another applicant'}.`;
        warningBox.classList.remove("d-none");
        warningBox.classList.add("d-flex");
    } else if (dup.duplicateMobile) {
        warningText.innerText = `⚠️ Duplicate Match: Mobile ${mobVal} is registered to ${dup.duplicateMobile.name || 'another applicant'}.`;
        warningBox.classList.remove("d-none");
        warningBox.classList.add("d-flex");
    } else {
        warningBox.classList.add("d-none");
        warningBox.classList.remove("d-flex");
    }
}

/**
 * SMART INPUT ENHANCEMENT 1: Auto-Calculate Expiry Date (+6 Months)
 */
function autoCalculateExpiryDate(inputDateStr, targetExpiryInputId) {
    const expiryInput = document.getElementById(targetExpiryInputId);
    if (!expiryInput || !inputDateStr) return;

    const dateObj = parseStringToJsDate(inputDateStr);
    if (!dateObj || isNaN(dateObj.getTime())) return;

    // Add 6 calendar months
    dateObj.setMonth(dateObj.getMonth() + 6);

    const dd = String(dateObj.getDate()).padStart(2, '0');
    const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
    const yyyy = dateObj.getFullYear();

    expiryInput.value = `${dd}-${mm}-${yyyy}`;
}

/**
 * SMART INPUT ENHANCEMENT 2: Same as Present Address Checkbox
 */
function mirrorPresentAddressToPermanent(checkboxEl, presentId, permanentId) {
    const presentVal = document.getElementById(presentId)?.value || "";
    const permanentEl = document.getElementById(permanentId);
    if (permanentEl && checkboxEl.checked) {
        permanentEl.value = presentVal.toUpperCase();
    }
}

/**
 * SMART INPUT ENHANCEMENT 3: Real-Time Auto Capitalization
 */
function attachAutoCapitalizationListeners() {
    const fieldsToCapitalize = [
        "addLlrNumber", "addName", "addRelativeName", "addPresentAddress", "addPermanentAddress", "addIdMark1", "addIdMark2", "addDlNumber",
        "editLlrNumber", "editName", "editRelativeName", "editPresentAddress", "editPermanentAddress", "editIdMark1", "editIdMark2", "editDlNumber"
    ];

    fieldsToCapitalize.forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            input.addEventListener("input", (e) => {
                const start = e.target.selectionStart;
                const end = e.target.selectionEnd;
                e.target.value = e.target.value.toUpperCase();
                e.target.setSelectionRange(start, end);
            });
        }
    });
}