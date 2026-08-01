export async function fetchMasterRegistryData() {
    const statusTray = document.getElementById("connectionStatusStatusTray");
    const traySpinner = document.getElementById("statusTraySpinner");
    const trayIcon = document.getElementById("statusTrayIcon");
    const trayMessage = document.getElementById("statusTrayMessage");

    if (statusTray) {
        statusTray.style.setProperty("display", "flex", "important");
        statusTray.className = "alert alert-info d-flex align-items-center gap-2 py-2 px-3 border-custom shadow-sm scale-in";
    }

    const googleSheetEndpoint = (typeof window !== "undefined" && window.ENV && window.ENV.SHEET_API_URL)
        ? window.ENV.SHEET_API_URL
        : (typeof ENV !== "undefined" && ENV.SHEET_API_URL ? ENV.SHEET_API_URL : "");

    try {
        if (!googleSheetEndpoint || googleSheetEndpoint.includes("YOUR_DEPLOYED_SCRIPT_ID")) {
            throw new Error("SHEET_API_URL is missing or unconfigured in env.js!");
        }

        const response = await fetch(`${googleSheetEndpoint}?action=readAll`, { method: "GET", mode: "cors" });
        if (!response.ok) throw new Error("HTTP Error " + response.status);

        const rawData = await response.json();

        // Ensure every record has a valid row_index (Data starts at row 2 in Google Sheets)
        const data = (Array.isArray(rawData) ? rawData : []).map((row, idx) => {
            return {
                ...row,
                row_index: row.row_index ? parseInt(row.row_index, 10) : idx + 2
            };
        });

        if (traySpinner) traySpinner.classList.add("d-none");
        if (trayIcon) trayIcon.className = "bi bi-check-circle-fill text-success fs-5";
        if (statusTray) {
            statusTray.className = "alert bg-success-subtle d-flex align-items-center gap-2 py-2 px-3 shadow-sm scale-in";
            trayMessage.innerHTML = `<strong>Connected!</strong> Successfully loaded <span class="badge bg-success px-2 py-1">${data.length} records</span>.`;
            setTimeout(() => { statusTray.style.setProperty("display", "none", "important"); }, 4000);
        }

        return data;
    } catch (e) {
        console.error("Data Fetch Error:", e);
        if (traySpinner) traySpinner.classList.add("d-none");
        if (trayIcon) trayIcon.className = "bi bi-exclamation-triangle-fill text-danger fs-5";
        if (statusTray) {
            statusTray.className = "alert bg-danger-subtle d-flex align-items-center gap-2 py-2 px-3 shadow-sm scale-in";
            trayMessage.innerHTML = `<strong>Fetch Error!</strong> ${e.message || "Could not read database records."}`;
        }
        return [];
    }
}
/**
 * Update Record in Google Sheet Backend (Matches existing code.gs e.parameter format)
 */
export async function updateMasterRegistryRecord(updatedRecord) {
    if (!updatedRecord) {
        alert("Validation Error: Record object is missing.");
        return false;
    }

    if (!updatedRecord.row_index || isNaN(parseInt(updatedRecord.row_index, 10))) {
        alert("Validation Error: Field 'row_index' is missing or invalid.");
        return false;
    }

    const googleSheetEndpoint = (typeof window !== "undefined" && window.ENV && window.ENV.SHEET_API_URL)
        ? window.ENV.SHEET_API_URL
        : (typeof ENV !== "undefined" && ENV.SHEET_API_URL ? ENV.SHEET_API_URL : "");

    try {
        if (!googleSheetEndpoint || googleSheetEndpoint.includes("YOUR_DEPLOYED_SCRIPT_ID")) {
            throw new Error("SHEET_API_URL is missing or unconfigured in env.js!");
        }

        // Convert record object into URL Form Parameters for e.parameter in code.gs
        const formParams = new URLSearchParams();
        formParams.append("action", "update");
        formParams.append("row_index", String(updatedRecord.row_index));

        // Append all key-value pairs
        Object.keys(updatedRecord).forEach(key => {
            if (updatedRecord[key] !== undefined && updatedRecord[key] !== null && key !== "row_index") {
                formParams.append(key, String(updatedRecord[key]).trim());
            }
        });

        // Ensure llr_number key is explicitly present
        const llrVal = updatedRecord.llr_number || updatedRecord["LLR Number"] || updatedRecord["LLR No."];
        if (llrVal) {
            formParams.append("llr_number", String(llrVal).trim());
        }

        const response = await fetch(googleSheetEndpoint, {
            method: "POST",
            mode: "cors",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded;charset=utf-8"
            },
            body: formParams.toString()
        });

        if (!response.ok) throw new Error("HTTP Error " + response.status);
        const result = await response.json();

        if (result.status && result.status !== "success") {
            throw new Error(result.message || "Failed to update record on sheet.");
        }

        return true;
    } catch (e) {
        console.error("Sheet Update Error:", e);
        alert("Error saving to Google Sheet: " + e.message);
        return false;
    }
}