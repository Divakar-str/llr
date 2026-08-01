import { reportState } from './report-state.js';
import { matchReportFilters } from './report-filters.js';
import { evaluateRowStatus, compileReportByTemplate, buildMobileFrequencyIndex } from './report-engine.js';
import { renderReportTable, triggerPrint, exportExcel, exportCsv } from './report-view.js';
import { fetchMasterRegistryData, updateMasterRegistryRecord } from '../services/dataService.js';

document.addEventListener("DOMContentLoaded", initializeReportApp);

function debounce(func, delay = 300) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => func.apply(this, args), delay);
    };
}

async function initializeReportApp() {
    setupMultiselectDropdownUI();

    const changeControls = ["filterFromDate", "filterToDate", "reportTypeSelect"];
    changeControls.forEach(id => {
        document.getElementById(id)?.addEventListener("change", executeReportPipeline);
    });

    const searchInput = document.getElementById("filterSearchQuery");
    if (searchInput) {
        searchInput.addEventListener("input", debounce(executeReportPipeline, 300));
    }

    document.getElementById("generateReportBtn")?.addEventListener("click", executeReportPipeline);
    document.getElementById("printReportBtn")?.addEventListener("click", triggerPrint);
    document.getElementById("exportExcelBtn")?.addEventListener("click", () => exportExcel(reportState.targetCompiledReportRows));
    document.getElementById("exportCsvBtn")?.addEventListener("click", () => exportCsv(reportState.targetCompiledReportRows));
    
    // Save Modal Listener
    document.getElementById("btnSaveDlModal")?.addEventListener("click", saveDlStatusChanges);

    try {
        const rawData = await fetchMasterRegistryData();
        reportState.setMasterData(rawData);
        buildMobileFrequencyIndex(rawData);

        const selectedTemplate = document.getElementById("reportTypeSelect")?.value;
        if (selectedTemplate) {
            executeReportPipeline();
        } else {
            showPlaceholderView();
        }
    } catch (err) {
        console.error("Initialization Error:", err);
        showPlaceholderView();
    }
}

/**
 * Save Record Updates directly to Google Sheet Backend
 */
async function saveDlStatusChanges() {
    const llrInputNode = document.getElementById("editRowLlrNumber");
    const rawLlrInput = llrInputNode?.value;
    const rowIndexVal = llrInputNode?.getAttribute("data-row-index");

    if (!rawLlrInput || String(rawLlrInput).trim() === "") {
        alert("Validation Error: LLR Number is missing. Cannot save changes.");
        return;
    }

    if (!rowIndexVal || isNaN(parseInt(rowIndexVal, 10))) {
        alert("Validation Error: Row index could not be resolved. Please reload the page.");
        return;
    }

    const cleanLlrNum = String(rawLlrInput).trim();
    const isDlIssued = document.getElementById("editDlIssuedSelect")?.value || "NO";
    const dlNum = document.getElementById("editDlNumberInput")?.value || "";
    const remarks = document.getElementById("editRemarksInput")?.value || "";

    // Find record in master memory
    let record = reportState.masterRegistryData.find(r => {
        const val = r.llr_number || r["LLR Number"] || r["LLR No."] || r["llrNo"];
        return val && String(val).trim() === cleanLlrNum;
    });

    if (!record) {
        alert("Error: Corresponding record could not be found.");
        return;
    }

    // Apply updates to local state
    record.llr_number = cleanLlrNum;
    record.dl_issued = isDlIssued;
    record.dl_number = dlNum;
    record.remarks = remarks;
    record.row_index = parseInt(rowIndexVal, 10);

    // UI Loading state
    const spinner = document.getElementById("saveModalSpinner");
    const saveBtn = document.getElementById("btnSaveDlModal");
    if (spinner) spinner.classList.remove("d-none");
    if (saveBtn) saveBtn.disabled = true;

    try {
        const success = await updateMasterRegistryRecord(record);

        if (success) {
            const modalEl = document.getElementById("editDlStatusModal");
            const modal = bootstrap.Modal.getInstance(modalEl);
            if (modal) modal.hide();

            executeReportPipeline();
        }
    } finally {
        if (spinner) spinner.classList.add("d-none");
        if (saveBtn) saveBtn.disabled = false;
    }
}
/**
 * Custom Multi-Select UI Controller
 */
function setupMultiselectDropdownUI() {
    const trigger = document.getElementById("multiselectTrigger");
    const menu = document.getElementById("multiselectMenu");
    const container = document.getElementById("vehicleClassMultiselect");
    const checkboxes = document.querySelectorAll(".vehicle-checkbox");
    const allCheckbox = document.getElementById("chk_ALL");

    if (!trigger || !menu) return;

    trigger.addEventListener("click", (e) => {
        e.stopPropagation();
        menu.classList.toggle("d-none");
        trigger.classList.toggle("active-ring");
    });

    document.addEventListener("click", (e) => {
        if (container && !container.contains(e.target)) {
            menu.classList.add("d-none");
            trigger.classList.remove("active-ring");
        }
    });

    checkboxes.forEach(cb => {
        cb.addEventListener("change", (e) => {
            if (e.target.value === "ALL" && e.target.checked) {
                checkboxes.forEach(c => { if (c.value !== "ALL") c.checked = false; });
            } else if (e.target.value !== "ALL" && e.target.checked) {
                if (allCheckbox) allCheckbox.checked = false;
            }

            const anyChecked = Array.from(checkboxes).some(c => c.checked);
            if (!anyChecked && allCheckbox) allCheckbox.checked = true;

            updateMultiselectTagsDisplay();
            executeReportPipeline();
        });
    });
}

function updateMultiselectTagsDisplay() {
    const tagsHolder = document.getElementById("multiselectTagsHolder");
    const checkboxes = document.querySelectorAll(".vehicle-checkbox:checked");
    if (!tagsHolder) return;

    tagsHolder.innerHTML = "";
    const checkedValues = Array.from(checkboxes).map(c => c.value);

    if (checkedValues.includes("ALL") || checkedValues.length === 0) {
        tagsHolder.innerHTML = `<span class="placeholder-text">Show All Vehicle Classes</span>`;
        return;
    }

    checkboxes.forEach(cb => {
        const labelText = cb.nextElementSibling ? cb.nextElementSibling.innerText : cb.value;
        const tag = document.createElement("span");
        tag.className = "multiselect-tag-badge";
        tag.innerHTML = `${labelText} <span class="tag-remove-btn" data-value="${cb.value}">&times;</span>`;

        tag.querySelector(".tag-remove-btn")?.addEventListener("click", (e) => {
            e.stopPropagation();
            cb.checked = false;
            const anyChecked = Array.from(document.querySelectorAll(".vehicle-checkbox:checked")).length > 0;
            if (!anyChecked) {
                const allCb = document.getElementById("chk_ALL");
                if (allCb) allCb.checked = true;
            }
            updateMultiselectTagsDisplay();
            executeReportPipeline();
        });

        tagsHolder.appendChild(tag);
    });
}

function showPlaceholderView() {
    document.getElementById("reportLoaderView")?.classList.add("d-none");
    document.getElementById("reportDisplayView")?.classList.add("d-none");
    document.getElementById("reportPlaceholderView")?.classList.remove("d-none");
}

function executeReportPipeline() {
    const reportKey = document.getElementById("reportTypeSelect")?.value;
    if (!reportKey) {
        showPlaceholderView();
        return;
    }

    const btnSpinner = document.getElementById("btnSpinner");
    const btnIcon = document.getElementById("btnIcon");

    if (btnIcon) btnIcon.classList.add("d-none");
    if (btnSpinner) btnSpinner.classList.remove("d-none");

    document.getElementById("reportPlaceholderView")?.classList.add("d-none");
    document.getElementById("reportDisplayView")?.classList.add("d-none");
    document.getElementById("reportLoaderView")?.classList.remove("d-none");

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    reportState.resetTallies();
    reportState.resetPagination();
    reportState.targetCompiledReportRows = [];

    let serialNo = 1;
    let activeHeaders = [];

    if (!reportState.masterRegistryData || reportState.masterRegistryData.length === 0) {
        setTimeout(() => {
            renderReportTable(["S.No.", "LLR Number", "Applicant Name"], []);
            if (btnSpinner) btnSpinner.classList.add("d-none");
            if (btnIcon) btnIcon.classList.remove("d-none");
        }, 300);
        return;
    }

    reportState.masterRegistryData.forEach(row => {
        const state = evaluateRowStatus(row, today);
        if (!matchReportFilters(row)) return;

        if (state.isDlIssued) {
            reportState.ribbonTallies.dlIssued++;
        } else {
            if (state.isActive) reportState.ribbonTallies.active++;
            if (state.isExpired) reportState.ribbonTallies.expired++;
            if (state.isDlEligible) reportState.ribbonTallies.dlReady++;
        }

        const compiled = compileReportByTemplate(reportKey, serialNo, row, state);
        if (!compiled) return;

        activeHeaders = compiled.headers;
        reportState.targetCompiledReportRows.push(compiled.entry);
        serialNo++;
    });

    reportState.activeHeaders = activeHeaders;

    setTimeout(() => {
        const selectNode = document.getElementById("reportTypeSelect");
        const activeTextTitle = selectNode && selectNode.selectedIndex >= 0 ? selectNode.options[selectNode.selectedIndex].text : "Report";

        const titleLbl = document.getElementById("lblRenderedReportTitle");
        const countLbl = document.getElementById("lblRenderedReportCount");
        const printTitleLbl = document.getElementById("lblPrintReportTitle");

        if (titleLbl) titleLbl.innerText = activeTextTitle;
        if (countLbl) countLbl.innerText = `${reportState.targetCompiledReportRows.length} Total Records`;
        if (printTitleLbl) printTitleLbl.innerText = activeTextTitle.toUpperCase();

        const actCnt = document.getElementById("ribbonActiveCount");
        const expCnt = document.getElementById("ribbonExpiredCount");
        const rdyCnt = document.getElementById("ribbonDlReadyCount");
        const issCnt = document.getElementById("ribbonDlIssuedCount");

        if (actCnt) actCnt.innerText = reportState.ribbonTallies.active;
        if (expCnt) expCnt.innerText = reportState.ribbonTallies.expired;
        if (rdyCnt) rdyCnt.innerText = reportState.ribbonTallies.dlReady;
        if (issCnt) issCnt.innerText = reportState.ribbonTallies.dlIssued;

        renderReportTable(activeHeaders, reportState.targetCompiledReportRows);

        if (btnSpinner) btnSpinner.classList.add("d-none");
        if (btnIcon) btnIcon.classList.remove("d-none");
    }, 100);
}