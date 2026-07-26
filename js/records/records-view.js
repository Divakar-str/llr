let viewRecordModalInstance = null;

/**
 * VISUAL ENHANCEMENT: Calculates status badges and expiry countdowns
 */
function calculateRowStatusBadge(item) {
    const isDlIssued = item.dl_issued && item.dl_issued.toUpperCase() === "YES";
    if (isDlIssued) {
        return `<span class="badge bg-success shadow-sm"><i class="bi bi-patch-check-fill"></i> DL Issued </span>`;
    }

    const expDate = parseStringToJsDate(item.expiry_date);
    if (!expDate) {
        return `<span class="badge bg-secondary text-white">Learner Stage</span>`;
    }

    const now = new Date();
    const diffDays = Math.ceil((expDate - now) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
        return `<span class="badge bg-danger shadow-sm"><i class="bi bi-exclamation-octagon-fill"></i> Expired (${Math.abs(diffDays)}d ago)</span>`;
    } else if (diffDays <= 7) {
        return `<span class="badge bg-danger border border-light shadow-sm"><i class="bi bi-alarm-fill"></i> Expiring (${diffDays}d left)</span>`;
    } else if (diffDays <= 30) {
        return `<span class="badge bg-warning text-dark shadow-sm"><i class="bi bi-clock-history"></i> Expiring Soon (${diffDays}d)</span>`;
    } else {
        return `<span class="badge bg-info text-dark shadow-sm"><i class="bi bi-info-circle-fill"></i> No</span>`;
    }
}

/**
 * Paginated Table View Builder with Double-Click View & Quick Communication
 */
function renderGridTableRows(recordsArray) {
    const tableBody = document.getElementById("recordsTableBody");
    if (!tableBody) return;

    if (recordsArray.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="9" class="text-center text-muted py-5"><h5 class="mt-2 fw-semibold">No Matching Records Found</h5><p class="small text-muted mb-0">Try typing a different search word or changing your filter dates.</p></td></tr>`;
        renderPaginationControls(0, 1, 1);
        return;
    }

    const totalPages = Math.ceil(recordsArray.length / rowsPerPage);
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    const startIndex = (currentPage - 1) * rowsPerPage;
    const endIndex = Math.min(startIndex + rowsPerPage, recordsArray.length);
    const paginatedSlice = recordsArray.slice(startIndex, endIndex);

    const fragment = document.createDocumentFragment();

    for (let i = 0; i < paginatedSlice.length; i++) {
        const item = paginatedSlice[i];
        const tr = document.createElement("tr");
        tr.id = `row-ref-${item.row_index}`;
        tr.style.cursor = "pointer";
        tr.title = "Double-click to view full record details";

        const statusBadgeHTML = calculateRowStatusBadge(item);
        const cleanMobile = (item.mobile_number || "").toString().replace(/[^0-9]/g, "");

        const waText = encodeURIComponent(`Hello ${item.name || 'Applicant'}, this is a reminder regarding your LLR (${item.llr_number || ''}). Expiry date: ${cleanIncomingDate(item.expiry_date)}.`);
        const waUrl = cleanMobile.length === 10 ? `https://wa.me/91${cleanMobile}?text=${waText}` : `#`;

        tr.innerHTML = `
            <td class="ps-4 fw-bold text-dark">${item.llr_number || "-"}</td>
            <td class="fw-semibold text-secondary">${item.name || "-"}</td>
            <td class="small font-monospace text-muted">${cleanIncomingDate(item.date_of_birth)}</td>
            <td><span class="badge bg-primary px-2.5 py-1.5">${item.vehicle_class || "-"}</span></td>
            <td class="small font-monospace fw-medium">
                ${item.mobile_number || "-"}
                ${cleanMobile.length === 10 ? `
                    <div class="d-inline-flex ms-1 gap-1 align-items-center">
                        <a href="tel:${cleanMobile}" class="text-success small ms-1" title="Call Mobile"><i class="bi bi-telephone-fill"></i></a>
                        <a href="${waUrl}" target="_blank" class="text-success small" title="WhatsApp Reminder"><i class="bi bi-whatsapp"></i></a>
                    </div>
                ` : ''}
            </td>
            <td class="small text-secondary">${cleanIncomingDate(item.issue_date)}</td>
            <td class="small text-secondary">${cleanIncomingDate(item.expiry_date)}</td>
            <td>${statusBadgeHTML}</td>
            <td class="text-center pe-4" onclick="event.stopPropagation()">
                <button class="btn btn-sm btn-outline-info fw-semibold me-1" onclick="window.triggerViewFullDetailsModal(${item.row_index})" title="View Details"><i class="bi bi-eye-fill"></i></button>
                <button class="btn btn-sm btn-outline-primary fw-semibold me-1" onclick="triggerInPlaceEditModal(${item.row_index})" title="Edit Record"><i class="bi bi-pencil-square"></i></button>
                <button class="btn btn-sm btn-outline-danger fw-semibold" onclick="triggerRowDeletionRequest(${item.row_index})" title="Delete"><i class="bi bi-trash3-fill"></i></button>
            </td>
        `;

        // Double click anywhere on the row to view full details
        tr.addEventListener("dblclick", () => {
            window.triggerViewFullDetailsModal(item.row_index);
        });

        fragment.appendChild(tr);
    }

    tableBody.innerHTML = "";
    tableBody.appendChild(fragment);

    renderPaginationControls(recordsArray.length, currentPage, totalPages);
}

/**
 * FEATURE: Click / Double-Click to View Full Applicant Profile
 */
window.triggerViewFullDetailsModal = function(rowIndex) {
    const item = localCacheRecordsCollection.find(r => Number(r.row_index) === Number(rowIndex));
    if (!item) return;

    const modalBody = document.getElementById("viewRecordModalBody");
    if (!modalBody) return;

    modalBody.innerHTML = `
        <div class="row g-3">
            <div class="col-12 border-bottom pb-2 mb-2">
                <span class="badge bg-dark fs-6">${item.vehicle_class || 'Class N/A'}</span>
                <h4 class="fw-bold text-primary mb-0 mt-2">${item.name || '-'}</h4>
                <small class="text-muted font-monospace">LLR No: ${item.llr_number || '-'}</small>
            </div>
            
            <div class="col-6 col-md-4"><strong>Date of Birth:</strong><br>${cleanIncomingDate(item.date_of_birth)}</div>
            <div class="col-6 col-md-4"><strong>Blood Group:</strong><br>${item.blood_group || '-'}</div>
            <div class="col-6 col-md-4"><strong>Mobile:</strong><br>${item.mobile_number || '-'}</div>
            
            <div class="col-6 col-md-4"><strong>Relative:</strong><br>${item.relative_type || 'Relative'}: ${item.relative_name || '-'}</div>
            <div class="col-6 col-md-4"><strong>Emergency Tel:</strong><br>${item.emergency_mobile || '-'}</div>
            <div class="col-6 col-md-4"><strong>DL Issued:</strong><br>${item.dl_issued || 'No'} (${item.dl_number || 'N/A'})</div>

            <div class="col-6 col-md-4"><strong>Issue Date:</strong><br>${cleanIncomingDate(item.issue_date)}</div>
            <div class="col-6 col-md-4"><strong>Expiry Date:</strong><br>${cleanIncomingDate(item.expiry_date)}</div>
            <div class="col-6 col-md-4"><strong>Approved Date:</strong><br>${cleanIncomingDate(item.approved_date)}</div>

            <div class="col-12 border-top pt-2 mt-2">
                <strong>Present Address:</strong><br><p class="small text-secondary mb-2">${item.present_address || '-'}</p>
                <strong>Permanent Address:</strong><br><p class="small text-secondary mb-0">${item.permanent_address || '-'}</p>
            </div>

            <div class="col-12 border-top pt-2 mt-2">
                <strong>Identification Mark 1:</strong> <span class="small text-muted">${item.identification_mark_1 || '-'}</span><br>
                <strong>Identification Mark 2:</strong> <span class="small text-muted">${item.identification_mark_2 || '-'}</span>
            </div>

            <div class="col-12 bg-light p-2 rounded mt-2">
                <small class="text-muted">Fees Receipt: <strong>${item.fees_number || '-'}</strong> | Amount: <strong>₹${item.fee || '0'}</strong></small>
            </div>
        </div>
    `;

    const viewModalEl = document.getElementById("viewRecordModal");
    if (viewModalEl) {
        viewRecordModalInstance = bootstrap.Modal.getOrCreateInstance(viewModalEl);
        viewRecordModalInstance.show();
    }
};

/**
 * Creates / updates pagination controls
 */
function renderPaginationControls(totalRecords, page, totalPages) {
    const navContainer = document.getElementById("tablePaginationNav");
    if (!navContainer) return;

    if (totalRecords === 0) {
        navContainer.innerHTML = `
            <span class="small text-muted">Showing 0 of 0 records</span>
            <div class="btn-group btn-group-sm">
                <button class="btn btn-outline-secondary" disabled><i class="bi bi-chevron-left"></i> Prev</button>
                <button class="btn btn-outline-secondary" disabled>Page 1 of 1</button>
                <button class="btn btn-outline-secondary" disabled>Next <i class="bi bi-chevron-right"></i></button>
            </div>
        `;
        return;
    }

    const start = (page - 1) * rowsPerPage + 1;
    const end = Math.min(page * rowsPerPage, totalRecords);

    navContainer.innerHTML = `
        <span class="small text-muted">Showing <strong>${start}-${end}</strong> of <strong>${totalRecords}</strong> records</span>
        <div class="btn-group btn-group-sm">
            <button class="btn btn-outline-secondary" ${page === 1 ? "disabled" : ""} onclick="window.changePage(${page - 1})"><i class="bi bi-chevron-left"></i> Prev</button>
            <button class="btn btn-outline-secondary" disabled>Page ${page} of ${totalPages}</button>
            <button class="btn btn-outline-secondary" ${page === totalPages ? "disabled" : ""} onclick="window.changePage(${page + 1})">Next <i class="bi bi-chevron-right"></i></button>
        </div>
    `;
}

window.changePage = function(newPage) {
    currentPage = newPage;
    runLiveClientFiltersPipeline();
};

/**
 * VISUAL ENHANCEMENT: Non-blocking Toast Notification System
 */
function showToastNotification(message, isSuccess = true) {
    let toastContainer = document.getElementById("globalToastContainer");
    if (!toastContainer) {
        toastContainer = document.createElement("div");
        toastContainer.id = "globalToastContainer";
        toastContainer.className = "toast-container position-fixed bottom-0 end-0 p-3";
        toastContainer.style.zIndex = "9999";
        document.body.appendChild(toastContainer);
    }

    const bgClass = isSuccess ? "bg-success" : "bg-danger";
    const iconClass = isSuccess ? "bi-check-circle-fill" : "bi-exclamation-triangle-fill";

    const toastEl = document.createElement("div");
    toastEl.className = `toast align-items-center text-white ${bgClass} border-0 show shadow-lg mb-2`;
    toastEl.setAttribute("role", "alert");
    toastEl.innerHTML = `
        <div class="d-flex">
            <div class="toast-body d-flex align-items-center gap-2">
                <i class="bi ${iconClass} fs-5"></i>
                <span>${message}</span>
            </div>
            <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
        </div>
    `;

    toastContainer.appendChild(toastEl);
    setTimeout(() => {
        toastEl.classList.remove("show");
        setTimeout(() => toastEl.remove(), 300);
    }, 3500);
}

/**
 * Populates Edit Modal Fields
 */
window.triggerInPlaceEditModal = function(rowIndex) {
    const activeTargetRow = localCacheRecordsCollection.find(item => Number(item.row_index) === Number(rowIndex));
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