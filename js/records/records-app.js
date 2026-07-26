document.addEventListener("DOMContentLoaded", () => {
    const modalEl = document.getElementById('editRecordModal');
    if (modalEl) bootstrapModalInstance = bootstrap.Modal.getOrCreateInstance(modalEl);

    // Initial local-first load
    fetchActiveSheetCollectionData(false);

    // DOM References
    const refreshBtn = document.getElementById("refreshDataBtn");
    const searchInput = document.getElementById("tableSearchInput");
    const startDateInput = document.getElementById("filterStartDate");
    const endDateInput = document.getElementById("filterEndDate");
    const modalEditForm = document.getElementById("modalEditForm");
    const manualInsertForm = document.getElementById("manualInsertForm");
    
    const addLlrInput = document.getElementById("addLlrNumber");
    const addMobileInput = document.getElementById("addMobile");

    // Force Sync on Refresh Button
    if (refreshBtn) refreshBtn.addEventListener("click", () => fetchActiveSheetCollectionData(true));

    // Debounced Search Input
    if (searchInput) {
        let debounceTimer;
        searchInput.addEventListener("input", () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(runLiveClientFiltersPipeline, 150);
        });
    }

    if (startDateInput) startDateInput.addEventListener("change", runLiveClientFiltersPipeline);
    if (endDateInput) endDateInput.addEventListener("change", runLiveClientFiltersPipeline);
    if (modalEditForm) modalEditForm.addEventListener("submit", commitRowAuditsToServer);
    if (manualInsertForm) manualInsertForm.addEventListener("submit", commitManualInsertToServer);

    // Live Duplicate Scanners
    if (addLlrInput) addLlrInput.addEventListener("input", triggerDuplicateScanOnInput);
    if (addMobileInput) addMobileInput.addEventListener("input", triggerDuplicateScanOnInput);

    // Attach auto-capitalization listeners
attachAutoCapitalizationListeners();

// Auto-calculate Expiry (+6 Months) on Issue Date typing
const addIssueDateInput = document.getElementById("addIssueDate");
if (addIssueDateInput) {
    addIssueDateInput.addEventListener("blur", (e) => {
        autoCalculateExpiryDate(e.target.value, "addExpiryDate");
    });
}
});