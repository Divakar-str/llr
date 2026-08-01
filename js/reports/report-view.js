import { reportState } from './report-state.js';

export function renderReportTable(headers, dataRows) {
    const headerNode = document.getElementById("reportDataTableHeader");
    const bodyNode = document.getElementById("reportDataTableBody");

    if (!headerNode || !bodyNode) return;

    headerNode.innerHTML = "";
    bodyNode.innerHTML = "";

    // 1. Column Sorting Engine
    let processedRows = [...dataRows];
    if (reportState.sortColumn) {
        processedRows.sort((a, b) => {
            let valA = a[reportState.sortColumn] !== undefined ? a[reportState.sortColumn] : "";
            let valB = b[reportState.sortColumn] !== undefined ? b[reportState.sortColumn] : "";

            if (!isNaN(valA) && !isNaN(valB) && valA !== "" && valB !== "") {
                valA = Number(valA);
                valB = Number(valB);
            } else {
                valA = String(valA).toLowerCase();
                valB = String(valB).toLowerCase();
            }

            if (valA < valB) return reportState.sortDirection === 'asc' ? -1 : 1;
            if (valA > valB) return reportState.sortDirection === 'asc' ? 1 : -1;
            return 0;
        });
    }

    // 2. Render Header Controls
    const trHead = document.createElement("tr");
    const thCheck = document.createElement("th");
    thCheck.className = "text-center no-print";
    thCheck.style.width = "45px";
    thCheck.innerHTML = `<input type="checkbox" class="form-check-input" id="masterPrintCheckbox" checked>`;
    trHead.appendChild(thCheck);

    headers.forEach(headerText => {
        const th = document.createElement("th");
        th.className = "sortable-header user-select-none";
        th.style.cursor = "pointer";

        let sortIcon = '<i class="bi bi-arrow-down-up ms-1 text-muted opacity-50 small"></i>';
        if (reportState.sortColumn === headerText) {
            sortIcon = reportState.sortDirection === 'asc' 
                ? '<i class="bi bi-sort-alpha-down ms-1 text-primary fw-bold"></i>'
                : '<i class="bi bi-sort-alpha-down-alt ms-1 text-primary fw-bold"></i>';
        }

        th.innerHTML = `<span>${headerText}</span>${sortIcon}`;

        th.addEventListener("click", () => {
            if (reportState.sortColumn === headerText) {
                reportState.sortDirection = reportState.sortDirection === 'asc' ? 'desc' : 'asc';
            } else {
                reportState.sortColumn = headerText;
                reportState.sortDirection = 'asc';
            }
            renderReportTable(headers, dataRows);
        });

        trHead.appendChild(th);
    });
    headerNode.appendChild(trHead);

    document.getElementById("masterPrintCheckbox")?.addEventListener("change", (e) => {
        const flag = e.target.checked;
        document.querySelectorAll(".row-print-checkbox").forEach(cb => {
            cb.checked = flag;
            cb.closest("tr")?.classList.toggle("hide-row-on-print", !flag);
        });
    });

    // 3. Pagination Calculations
    const isPrintMode = reportState.isPrintMode || false;
    const totalRecords = processedRows.length;
    let pageRows = [];
    let startIndex = 0;
    let endIndex = totalRecords;
    let totalPages = 1;

    if (isPrintMode) {
        pageRows = processedRows;
    } else {
        const pageSize = parseInt(reportState.pageSize, 10);
        totalPages = Math.ceil(totalRecords / pageSize) || 1;

        if (reportState.currentPage > totalPages) reportState.currentPage = totalPages;
        if (reportState.currentPage < 1) reportState.currentPage = 1;

        startIndex = (reportState.currentPage - 1) * pageSize;
        endIndex = Math.min(startIndex + pageSize, totalRecords);
        pageRows = processedRows.slice(startIndex, endIndex);
    }

    // 4. Render Table Rows with Copy & Double Click
    if (pageRows.length === 0) {
        bodyNode.innerHTML = `<tr><td colspan="${headers.length + 1}" class="text-center text-muted py-4 fw-semibold">No matching records found.</td></tr>`;
    } else {
        pageRows.forEach((row, idx) => {
            const tr = document.createElement("tr");
            const rowIdx = isPrintMode ? idx : startIndex + idx;
            tr.id = `report-row-${rowIdx}`;
            tr.className = "editable-table-row";
            tr.title = "Double-click row to edit status/remarks";

            // Double Click Row Listener to Edit Modal
            tr.addEventListener("dblclick", () => {
                openEditDlModal(row);
            });

            const tdCheck = document.createElement("td");
            tdCheck.className = "text-center no-print";
            tdCheck.innerHTML = `<input type="checkbox" class="form-check-input row-print-checkbox" data-target="report-row-${rowIdx}" checked>`;
            tr.appendChild(tdCheck);

            headers.forEach(h => {
                const td = document.createElement("td");
                let val = row[h] !== undefined ? row[h] : "-";
                const valStr = String(val);

                // Copyable Text Cells
                if (["LLR Number", "Permanent DL Number", "Mobile Number", "Date of Birth"].includes(h) && val !== "-") {
                    td.className = "copyable-cell";
                    td.title = "Click to copy";
                    td.innerHTML = `<span class="fw-bold text-primary">${val}</span>`;
                    td.addEventListener("click", (e) => {
                        e.stopPropagation(); // Prevents dblclick trigger
                        copyToClipboard(valStr, h);
                    });
                } 
                else if (valStr.includes("Converted") || valStr.includes("Ready") || valStr.includes("Active")) {
                    td.innerHTML = `<span class="badge bg-success-subtle text-success px-2 py-1">${val}</span>`;
                } 
                else if (valStr.includes("Warning") || valStr.includes("Duplicate")) {
                    td.innerHTML = `<span class="badge bg-warning-subtle text-dark px-2 py-1">${val}</span>`;
                } 
                else if (valStr.includes("Alert") || valStr.includes("Expired") || valStr.includes("Overdue") || valStr.includes("Missing")) {
                    td.innerHTML = `<span class="badge bg-danger-subtle text-danger px-2 py-1">${val}</span>`;
                } 
                else if (h === "Remarks") {
                    td.innerHTML = `<span class="text-secondary small">${val}</span>`;
                } 
                else {
                    td.innerText = val;
                }

                tr.appendChild(td);
            });

            bodyNode.appendChild(tr);
        });

        document.querySelectorAll(".row-print-checkbox").forEach(cb => {
            cb.addEventListener("change", (e) => {
                const targetId = e.target.getAttribute("data-target");
                document.getElementById(targetId)?.classList.toggle("hide-row-on-print", !e.target.checked);
            });
        });
    }

    if (!isPrintMode) {
        renderPaginationBar(totalRecords, startIndex, endIndex, totalPages);
    }

    document.getElementById("reportLoaderView")?.classList.add("d-none");
    document.getElementById("reportDisplayView")?.classList.remove("d-none");
}

function copyToClipboard(text, fieldName) {
    navigator.clipboard.writeText(text).then(() => {
        const toastEl = document.getElementById("copyToast");
        const msgEl = document.getElementById("copyToastMessage");
        if (toastEl && msgEl) {
            msgEl.innerText = `Copied ${fieldName}: ${text}`;
            const toast = new bootstrap.Toast(toastEl, { delay: 2000 });
            toast.show();
        }
    }).catch(err => console.error("Clipboard Copy Error:", err));
}

function openEditDlModal(row) {
    const targetLlr = row.llr_number || row["LLR Number"] || row["LLR No."] || row["ID / Number"];

    if (!targetLlr || String(targetLlr).trim() === "" || targetLlr === "-") {
        alert("Cannot edit record: LLR Number missing from this row.");
        return;
    }

    const cleanTargetLlr = String(targetLlr).trim();

    // Match record index in master dataset
    const recordIndex = reportState.masterRegistryData.findIndex(r => {
        const val = r.llr_number || r["LLR Number"] || r["LLR No."] || r["llrNo"];
        return val && String(val).trim() === cleanTargetLlr;
    });

    if (recordIndex === -1) {
        alert(`Error: Record with LLR '${cleanTargetLlr}' not found in local memory.`);
        return;
    }

    const record = reportState.masterRegistryData[recordIndex];

    // Calculated Fallback: Index + 2 (Header is row 1)
    const computedRowIndex = record.row_index ? parseInt(record.row_index, 10) : recordIndex + 2;

    // Populate modal inputs and store row_index
    const llrInputNode = document.getElementById("editRowLlrNumber");
    if (llrInputNode) {
        llrInputNode.value = cleanTargetLlr;
        llrInputNode.setAttribute("data-row-index", computedRowIndex);
    }

    document.getElementById("editApplicantName").value = record.name || row["Applicant Name"] || "-";
    document.getElementById("editDlIssuedSelect").value = (record.dl_issued && String(record.dl_issued).toUpperCase() === "YES") ? "YES" : "NO";
    document.getElementById("editDlNumberInput").value = record.dl_number || "";
    document.getElementById("editRemarksInput").value = record.remarks || "";

    const modal = new bootstrap.Modal(document.getElementById("editDlStatusModal"));
    modal.show();
}

function renderPaginationBar(totalRecords, startIndex, endIndex, totalPages) {
    let paginationContainer = document.getElementById("reportPaginationFooter");
    
    if (!paginationContainer) {
        paginationContainer = document.createElement("div");
        paginationContainer.id = "reportPaginationFooter";
        paginationContainer.className = "d-flex flex-column flex-md-row justify-content-between align-items-center mt-3 pt-3 border-top no-print gap-2";
        const viewport = document.getElementById("tableFrameViewport");
        if (viewport && viewport.parentNode) {
            viewport.parentNode.appendChild(paginationContainer);
        }
    }

    const startNum = totalRecords === 0 ? 0 : startIndex + 1;

    paginationContainer.innerHTML = `
        <div class="d-flex align-items-center gap-2">
            <span class="text-muted small">Showing <strong>${startNum} - ${endIndex}</strong> of <strong>${totalRecords}</strong> entries</span>
            <select id="pageSizeSelect" class="form-select form-select-sm ms-2" style="width: 80px;">
                <option value="10" ${reportState.pageSize == 10 ? 'selected' : ''}>10</option>
                <option value="25" ${reportState.pageSize == 25 ? 'selected' : ''}>25</option>
                <option value="50" ${reportState.pageSize == 50 ? 'selected' : ''}>50</option>
                <option value="100" ${reportState.pageSize == 100 ? 'selected' : ''}>100</option>
            </select>
        </div>
        <div class="d-flex align-items-center gap-1">
            <button class="btn btn-sm btn-outline-secondary px-3" id="btnPrevPage" ${reportState.currentPage <= 1 ? 'disabled' : ''}>
                <i class="bi bi-chevron-left"></i> Prev
            </button>
            <span class="px-3 small fw-bold">Page ${reportState.currentPage} of ${totalPages}</span>
            <button class="btn btn-sm btn-outline-secondary px-3" id="btnNextPage" ${reportState.currentPage >= totalPages ? 'disabled' : ''}>
                Next <i class="bi bi-chevron-right"></i>
            </button>
        </div>
    `;

    document.getElementById("pageSizeSelect")?.addEventListener("change", (e) => {
        reportState.pageSize = parseInt(e.target.value, 10);
        reportState.currentPage = 1;
        renderReportTable(reportState.activeHeaders, reportState.targetCompiledReportRows);
    });

    document.getElementById("btnPrevPage")?.addEventListener("click", () => {
        if (reportState.currentPage > 1) {
            reportState.currentPage--;
            renderReportTable(reportState.activeHeaders, reportState.targetCompiledReportRows);
        }
    });

    document.getElementById("btnNextPage")?.addEventListener("click", () => {
        if (reportState.currentPage < totalPages) {
            reportState.currentPage++;
            renderReportTable(reportState.activeHeaders, reportState.targetCompiledReportRows);
        }
    });
}

export function triggerPrint() {
    const node = document.getElementById("lblPrintTimestamp");
    if (node) node.innerText = `Printed On: ${new Date().toLocaleString()}`;

    reportState.isPrintMode = true;
    renderReportTable(reportState.activeHeaders, reportState.targetCompiledReportRows);

    setTimeout(() => {
        window.print();
        reportState.isPrintMode = false;
        renderReportTable(reportState.activeHeaders, reportState.targetCompiledReportRows);
    }, 150);
}

export function exportExcel(data) {
    if (!data || data.length === 0) return;
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Report Data");
    XLSX.writeFile(wb, `Report_Export_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export function exportCsv(data) {
    if (!data || data.length === 0) return;
    const ws = XLSX.utils.json_to_sheet(data);
    const csv = XLSX.utils.sheet_to_csv(ws);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", `Report_Export_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}