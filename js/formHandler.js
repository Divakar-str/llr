document.addEventListener("DOMContentLoaded", () => {
    const verificationForm = document.getElementById("llrVerificationForm");
    const backBtn = document.getElementById("backToStep1Btn");
    
    if (verificationForm) verificationForm.addEventListener("submit", syncAuditedPayloadToRemoteDatabase);
    if (backBtn) backBtn.addEventListener("click", revertWizardToStep1);
});

/**
 * Centrally positioned custom toast notification helper using friendly everyday language.
 */
function showCustomToast(message, type = "success") {
    let container = document.getElementById("toastContainer");
    if (!container) {
        container = document.createElement("div");
        container.id = "toastContainer";
        // Centered container positioning at the top of the viewport
        container.className = "toast-container position-fixed top-0 start-50 translate-middle-x p-3";
        container.style.zIndex = "1080";
        document.body.appendChild(container);
    }

    const bgClass = type === "success" ? "bg-dark text-white shadow-lg" : type === "warning" ? "bg-warning text-dark shadow-lg" : "bg-danger text-white shadow-lg";
    const icon = type === "success" ? "bi-check-circle-fill text-success" : type === "warning" ? "bi-exclamation-triangle-fill text-dark" : "bi-x-circle-fill text-white";

    const toastEl = document.createElement("div");
    toastEl.className = `toast align-items-center ${bgClass} border-0`;
    toastEl.setAttribute("role", "alert");
    toastEl.setAttribute("aria-live", "assertive");
    toastEl.setAttribute("aria-atomic", "true");

    toastEl.innerHTML = `
        <div class="d-flex">
            <div class="toast-body d-flex align-items-center gap-2 py-3 px-3 fs-6">
                <i class="bi ${icon} fs-4"></i>
                <span>${message}</span>
            </div>
            <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
        </div>
    `;

    container.appendChild(toastEl);
    const bsToast = new bootstrap.Toast(toastEl, { delay: 4000 });
    bsToast.show();

    toastEl.addEventListener('hidden.bs.toast', () => {
        toastEl.remove();
    });
}

/**
 * Binds extracted data payload to verification inputs and focuses mobile input.
 */
window.bindFormFields = function(data, suggestions = {}) {
    document.getElementById("formLlrNumber").value = data.llr_number || "-";
    document.getElementById("formFeesNumber").value = data.fees_number || "-";
    document.getElementById("formFee").value = data.fee_amount || "-";
    document.getElementById("formVehicleClass").value = data.vehicle_class || "-";
    document.getElementById("formBloodGroup").value = data.blood_group || "-";
    document.getElementById("formName").value = data.name || "-";
    document.getElementById("formDob").value = data.date_of_birth || "-";
    document.getElementById("formRelativeType").value = data.relative_type || "Father";
    document.getElementById("formRelativeName").value = data.relative_name || "-";
    document.getElementById("formPresentAddress").value = data.present_address || "-";
    document.getElementById("formPermanentAddress").value = data.permanent_address || "-";
    document.getElementById("formIdMark1").value = data.identification_mark_1 || "-";
    document.getElementById("formIdMark2").value = data.identification_mark_2 || "-";
    document.getElementById("formIssueDate").value = data.issue_date || "-";
    document.getElementById("formExpiryDate").value = data.expiry_date || "-";
    document.getElementById("formApprovedDate").value = data.approved_date || "-";

    const suggestionBox = document.getElementById("aiSuggestionBox");
    const suggestionBadges = document.getElementById("suggestionBadges");
    if (suggestionBadges) suggestionBadges.innerHTML = "";

    if (suggestionBox && suggestionBadges && suggestions && Object.keys(suggestions).length > 0) {
        suggestionBox.classList.remove("d-none");
        for (let [fieldKey, altValues] of Object.entries(suggestions)) {
            altValues.forEach(val => {
                let badge = document.createElement("button");
                badge.type = "button";
                badge.className = "btn btn-sm btn-outline-dark bg-white";
                badge.innerHTML = `<i class="bi bi-check2-square text-success"></i> Use alternative ${fieldKey}: <strong>${val}</strong>`;
                badge.onclick = () => {
                    const mapKeyToId = {
                        "date_of_birth": "formDob",
                        "issue_date": "formIssueDate",
                        "expiry_date": "formExpiryDate"
                    };
                    if (mapKeyToId[fieldKey]) {
                        document.getElementById(mapKeyToId[fieldKey]).value = val;
                        badge.remove();
                        if (suggestionBadges.children.length === 0) {
                            suggestionBox.classList.add("d-none");
                        }
                    }
                };
                suggestionBadges.appendChild(badge);
            });
        }
    } else if (suggestionBox) {
        suggestionBox.classList.add("d-none");
    }

    document.getElementById("formMobile").value = "";
    document.getElementById("formEmergencyMobile").value = "";
    document.getElementById("formDlIssued").value = "No";
    document.getElementById("formDlNumber").value = "";
    document.getElementById("formremarks").value = "";

    document.getElementById("step1View").classList.add("d-none");
    document.getElementById("step2View").classList.remove("d-none");
    document.getElementById("pill-step1").classList.remove("active");
    document.getElementById("pill-step2").classList.add("active");

    // Focus cursor directly on the mobile number field when Step 2 opens
    setTimeout(() => {
        const mobileField = document.getElementById("formMobile");
        if (mobileField) {
            mobileField.focus();
            mobileField.select();
        }
    }, 150);
};

/**
 * Returns wizard interface view states back to Step 1.
 */
function revertWizardToStep1() {
    document.getElementById("step2View").classList.add("d-none");
    document.getElementById("step1View").classList.remove("d-none");
    document.getElementById("pill-step2").classList.remove("active");
    document.getElementById("pill-step1").classList.add("active");

    document.getElementById("formMobile").value = "";
    document.getElementById("formEmergencyMobile").value = "";
    document.getElementById("formDlIssued").value = "No";
    document.getElementById("formDlNumber").value = "";
    document.getElementById("formremarks").value = "";
    showCustomToast("Switched back to the text entry screen.", "warning");
}

/**
 * Transmits verified dataset to cloud storage.
 */
async function syncAuditedPayloadToRemoteDatabase(event) {
    event.preventDefault();

    const mobileValue = document.getElementById("formMobile").value.trim();
    if (mobileValue.length !== 10 || isNaN(mobileValue)) {
        showCustomToast("Please check the mobile number and enter a valid 10-digit number.", "danger");
        document.getElementById("formMobile").focus();
        return;
    }

    const targetForm = event.target;
    const submitButton = targetForm.querySelector('button[type="submit"]');

    const payloadObject = {
        action: "insert",
        llr_number: document.getElementById("formLlrNumber").value.trim(),
        fees_number: document.getElementById("formFeesNumber").value.trim(),
        fee_amount: document.getElementById("formFee").value.trim(),
        vehicle_class: document.getElementById("formVehicleClass").value.trim(),
        blood_group: document.getElementById("formBloodGroup").value.trim(),
        name: document.getElementById("formName").value.trim(),
        date_of_birth: document.getElementById("formDob").value.trim(),
        relative_type: document.getElementById("formRelativeType").value.trim(),
        relative_name: document.getElementById("formRelativeName").value.trim(),
        mobile_number: mobileValue,
        emergency_mobile: document.getElementById("formEmergencyMobile").value.trim(),
        present_address: document.getElementById("formPresentAddress").value.trim(),
        permanent_address: document.getElementById("formPermanentAddress").value.trim(),
        identification_mark_1: document.getElementById("formIdMark1").value.trim(),
        identification_mark_2: document.getElementById("formIdMark2").value.trim(),
        issue_date: document.getElementById("formIssueDate").value.trim(),
        expiry_date: document.getElementById("formExpiryDate").value.trim(),
        approved_date: document.getElementById("formApprovedDate").value.trim(),
        dl_issued: document.getElementById("formDlIssued").value.trim(),
        dl_number: document.getElementById("formDlNumber").value.trim(),
        remarks: document.getElementById("formremarks").value.trim()
    };

    const cloudflareEndpoint = (typeof ENV !== 'undefined' && ENV.SHEET_API_URL) ? ENV.SHEET_API_URL : window.ENV?.SHEET_API_URL;

    if (!cloudflareEndpoint) {
        showCustomToast("Setup issue: We couldn't find the connection link.", "danger");
        return;
    }

    submitButton.disabled = true;
    submitButton.innerHTML = `<span>Saving record...</span> <i class="bi bi-hourglass-split"></i>`;

    try {
        const response = await fetch(cloudflareEndpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": sessionStorage.getItem("authBasic") || ""
            },
            body: JSON.stringify(payloadObject)
        });

        if (response.status === 401) {
            showCustomToast("Your login session has expired. Please sign in again.", "danger");
            setTimeout(() => window.location.reload(), 2000);
            return;
        }

        if (!response.ok) {
            throw new Error(`Server status code: ${response.status}`);
        }

        const result = await response.json();

        if (result.status === "success") {
            const liveName = document.getElementById("formName").value.trim() || "Applicant";
            const liveLlr = document.getElementById("formLlrNumber").value.trim() || "LLR";
            const currentTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

            showCustomToast(`Great! ${liveName}'s record (${liveLlr}) was successfully saved at ${currentTime}.`, "success");
            
            document.getElementById("pdfText").value = "";
            targetForm.reset();
            revertWizardToStep1();
        } else if (result.status === "duplicate") {
            const liveLlr = document.getElementById("formLlrNumber").value.trim() || "LLR";
            showCustomToast(`This record (${liveLlr}) is already saved in the system.`, "warning");
        } else {
            throw new Error(result.message || "Something went wrong on the server.");
        }
    } catch (connectionFault) {
        console.error("Connection Error:", connectionFault);
        showCustomToast("Could not save right now. Please check your internet connection.", "danger");
    } finally {
        submitButton.disabled = false;
        submitButton.innerHTML = `<span>Save to Registry</span> <i class="bi bi-cloud-arrow-up-fill"></i>`;
    }
}