document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("llrVerificationForm").addEventListener("submit", syncAuditedPayloadToRemoteDatabase);
    document.getElementById("backToStep1Btn").addEventListener("click", revertWizardToStep1);
});

/**
 * Binds extracted data payload to the verification form inputs
 * and handles wizard step navigation styling.
 */
window.bindFormFields = function(data) {
    document.getElementById("formLlrNumber").value = data.llr_number || "-";
    document.getElementById("formFeesNumber").value = data.fees_number || "-";
    document.getElementById("formFee").value = data.fee || "-";
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

    // Reset customer telephone fields and temporary entry states
    document.getElementById("formMobile").value = "";
    document.getElementById("formEmergencyMobile").value = "";
    document.getElementById("formDlIssued").value = "No";
    document.getElementById("formDlNumber").value = "";

    // Toggle viewport container display cards and navigation wizard progress pills
    document.getElementById("step1View").classList.add("d-none");
    document.getElementById("step2View").classList.remove("d-none");
    document.getElementById("pill-step1").classList.remove("active");
    document.getElementById("pill-step2").classList.add("active");
};

/**
 * Returns wizard interface view states back to Step 1 (Paste Text).
 */
function revertWizardToStep1() {
    document.getElementById("step2View").classList.add("d-none");
    document.getElementById("step1View").classList.remove("d-none");
    document.getElementById("pill-step2").classList.remove("active");
    document.getElementById("pill-step1").classList.add("active");
         
    // Clear user contact entries and driving license status states
    document.getElementById("formMobile").value = "";
    document.getElementById("formEmergencyMobile").value = "";
    document.getElementById("formDlIssued").value = "No";
    document.getElementById("formDlNumber").value = "";
}

/**
 * Transmits the verified form dataset down to the deployed database sheet.
 */
async function syncAuditedPayloadToRemoteDatabase(event) {
    event.preventDefault();
         
    // Client-side phone data validation parameters validation
    const mobileValue = document.getElementById("formMobile").value.trim();
    if (mobileValue.length !== 10 || isNaN(mobileValue)) {
        alert("Please enter a valid 10-digit primary mobile number before saving.");
        return;
    }

    const targetForm = event.target;
    const submitButton = targetForm.querySelector('button[type="submit"]');
    const compiledFormPayload = new FormData(targetForm);
         
    // Direct backend router tracking keyword parameter mapping assignment
    compiledFormPayload.append("action", "insert");
    
    // Resolve registry service endpoint reference point from environmental configs
    const googleSheetEndpoint = ENV.SHEET_API_URL;
    if (!googleSheetEndpoint) {
        alert("Configuration Error: Database link could not be found. Please check your env.js file setup.");
        return;
    }

    // Mutex Lock: Disables submit button to prevent duplicate database write events
    submitButton.disabled = true;
    submitButton.innerHTML = `<span>Saving to database...</span> <i class="bi bi-hourglass-split"></i>`;
         
    try {
        const response = await fetch(googleSheetEndpoint, {
            method: "POST",
            body: compiledFormPayload,
            mode: "cors"
        });

        if (!response.ok) {
            throw new Error(`Server returned error status code: ${response.status}`);
        }

        const result = await response.json();
         
        // Process application validation execution status codes from remote sheets
        if (result.status === "success") {
            alert(`✓ Data saved successfully! Added to sheet row index: ${result.row}`);
            
            // Clear layout terminal values and jump wizard workflow backwards
            document.getElementById("pdfText").value = "";
            targetForm.reset();
            revertWizardToStep1();
                     
        } else if (result.status === "duplicate") {
            alert(`⚠️ Duplicate Entry Found:\n${result.message}`);
            // Retains user layout instance context on screen for verification tweaks
                     
        } else {
            throw new Error(result.message || "An unexpected system error occurred on the server.");
        }
    } catch (connectionFault) {
        console.error("Database Synchronization Error Stack:", connectionFault);
        alert(`❌ Saving Failed:\n${connectionFault.message}\n\nPlease check your internet connection or ensure your database sheet is online.`);
    } finally {
        // Clear mutex controls lock tracking to allow form interactive triggers again
        submitButton.disabled = false;
        submitButton.innerHTML = `<span>Save to Registry</span> <i class="bi bi-cloud-arrow-up-fill"></i>`;
    }
}