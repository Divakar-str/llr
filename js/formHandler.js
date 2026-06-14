document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("llrVerificationForm").addEventListener("submit", syncAuditedPayloadToRemoteDatabase);
    document.getElementById("backToStep1Btn").addEventListener("click", revertWizardToStep1);
});

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

    // Reset telephone fields and ensure clean entry states
    document.getElementById("formMobile").value = "";
    document.getElementById("formEmergencyMobile").value = "";
    document.getElementById("formDlIssued").value = "No";
    document.getElementById("formDlNumber").value = "";

    // Open view frames panels layout transitions
    document.getElementById("step1View").classList.add("d-none");
    document.getElementById("step2View").classList.remove("d-none");
    document.getElementById("pill-step1").classList.remove("active");
    document.getElementById("pill-step2").classList.add("active");
};

function revertWizardToStep1() {
    document.getElementById("step2View").classList.add("d-none");
    document.getElementById("step1View").classList.remove("d-none");
    document.getElementById("pill-step2").classList.remove("active");
    document.getElementById("pill-step1").classList.add("active");
    
    document.getElementById("formMobile").value = "";
    document.getElementById("formEmergencyMobile").value = "";
    document.getElementById("formDlIssued").value = "No";
    document.getElementById("formDlNumber").value = "";
}

async function syncAuditedPayloadToRemoteDatabase(event) {
    event.preventDefault();
    
    // Front-end sanity confirmation checks
    const mobileValue = document.getElementById("formMobile").value.trim();
    if (mobileValue.length !== 10 || isNaN(mobileValue)) {
        alert("Validation Fault: Please enter an active 10-digit primary Mobile Number before saving.");
        return;
    }

    const targetForm = event.target;
    const submitButton = targetForm.querySelector('button[type="submit"]');
    const compiledFormPayload = new FormData(targetForm);
    
    // Force transmission parameter to map to 'insert' logic routine blocks explicitly
    compiledFormPayload.append("action", "insert");

    // Dynamic environmental resolution variable reference point allocation mapping
    const googleSheetEndpoint = ENV.SHEET_API_URL;

    // Mutex Lockout: Disables submit button to prevent double clicks from sending data twice
    submitButton.disabled = true;
    submitButton.innerText = "Synchronizing Registry Records Matrix...";

    try {
        const response = await fetch(googleSheetEndpoint, {
            method: "POST",
            body: compiledFormPayload,
            mode: "cors"
        });

        if (!response.ok) {
            throw new Error(`HTTP Error Status Level Encountered: ${response.status}`);
        }

        const result = await response.json();

        // Evaluate return codes from Google Apps Script
        if (result.status === "success") {
            alert(`✓ Record stored perfectly! Added inside Sheet row index positioning location: ${result.row}`);
            
            // Wipe forms clean and return view to text parsing step
            document.getElementById("pdfText").value = "";
            targetForm.reset();
            revertWizardToStep1();
            
        } else if (result.status === "duplicate") {
            // DUPLICATE RECORD BLOCKED LOGIC TRAIL DISPATCH
            alert(`⚠️ Duplicate Entry Error:\n${result.message}`);
            // Keep user on the form page so they can review their entries or modify fields
            
        } else {
            throw new Error(result.message || "An unhandled execution exception signature returned from server.");
        }

    } catch (connectionFault) {
        console.error("Database Synchronization Error Stack:", connectionFault);
        alert(`❌ Data Write Interrupted:\n${connectionFault.message}\n\nVerify that the target sheet is accessible and your deployment variable link matches.`);
    } finally {
        // Always re-enable the submit button once processing concludes
        submitButton.disabled = false;
        submitButton.innerText = "Submit and Save to Database ✓";
    }
}