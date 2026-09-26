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

     // Reset customer telephone fields and temporary entry states
     document.getElementById("formMobile").value = "";
     document.getElementById("formEmergencyMobile").value = "";
     document.getElementById("formDlIssued").value = "No";
     document.getElementById("formDlNumber").value = "";
     document.getElementById("formremarks").value = "";

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
     document.getElementById("formremarks").value = "";
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

     // Build regular payload object matching exact database field names
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
         dl_number: document.getElementById("formDlNumber").value.trim(), // Fixed ID to match extractor.html
         remarks: document.getElementById("formremarks").value.trim()
     };

     // Resolve registry service endpoint reference point from environmental configs or window fallback
     const cloudflareEndpoint = (typeof ENV !== 'undefined' && ENV.SHEET_API_URL) ? ENV.SHEET_API_URL : window.ENV?.SHEET_API_URL;
     
     if (!cloudflareEndpoint) {
         alert("Configuration Error: Database link could not be found.");
         return;
     }

     // Mutex Lock: Disables submit button to prevent duplicate database write events
     submitButton.disabled = true;
     submitButton.innerHTML = `<span>Saving to database...</span> <i class="bi bi-hourglass-split"></i>`;

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
             alert("Session expired or unauthorized. Please log in again.");
             window.location.reload();
             return;
         }

         if (!response.ok) {
             throw new Error(`Server returned error status code: ${response.status}`);
         }

         const result = await response.json();

         // Process application validation execution status codes from remote Cloudflare Worker
         if (result.status === "success") {
             alert(`✓ Data saved successfully to Cloudflare D1 database!`);
             document.getElementById("pdfText").value = "";
             targetForm.reset();
             revertWizardToStep1();
         } else if (result.status === "duplicate") {
             alert(`⚠️ Duplicate Entry Found:\n${result.message}`);
         } else {
             throw new Error(result.message || "An unexpected system error occurred on the server.");
         }
     } catch (connectionFault) {
         console.error("Database Synchronization Error Stack:", connectionFault);
         alert(`❌ Saving Failed:\n${connectionFault.message}\n\nPlease check your internet connection.`);
     } finally {
         // Clear mutex controls lock tracking to allow form interactive triggers again
         submitButton.disabled = false;
         submitButton.innerHTML = `<span>Save to Registry</span> <i class="bi bi-cloud-arrow-up-fill"></i>`;
     }
}