import { parseCustomDate } from '../utils/dateUtils.js';

let mobileFrequencyMap = new Map();

export function buildMobileFrequencyIndex(dataset) {
    mobileFrequencyMap.clear();
    dataset.forEach(row => {
        const mob = (row.mobile_number || "").replace(/\D/g, "");
        if (mob && mob.length >= 8) {
            mobileFrequencyMap.set(mob, (mobileFrequencyMap.get(mob) || 0) + 1);
        }
    });
}

export function evaluateRowStatus(row, today) {
    const exp = parseCustomDate(row.expiry_date);
    const iss = parseCustomDate(row.issue_date);
    const isDlIssued = row.dl_issued && String(row.dl_issued).trim().toUpperCase() === "YES";

    const state = {
        isActive: false, isExpired: false, isDlEligible: false,
        isDlIssued: isDlIssued, daysRemaining: 0, daysExpired: 0, daysSinceIssue: 0
    };

    if (iss) {
        state.daysSinceIssue = Math.floor((today - iss) / (1000 * 60 * 60 * 24));
        if (state.daysSinceIssue >= 30 && !isDlIssued) state.isDlEligible = true;
    }

    if (exp) {
        const deltaDays = Math.ceil((exp - today) / (1000 * 60 * 60 * 24));
        if (deltaDays >= 0) {
            state.isActive = true;
            state.daysRemaining = deltaDays;
        } else {
            state.isExpired = true;
            state.daysExpired = Math.abs(deltaDays);
        }
    }

    return state;
}

export function compileReportByTemplate(reportKey, serialNo, row, state) {
    let headers = ["S.No.", "LLR Number", "Applicant Name", "Vehicle Class", "Mobile Number", "Issue Date", "Expiry Date", "Remarks"];
    let entry = {
        "S.No.": serialNo,
        "LLR Number": row.llr_number || "-",
        "Applicant Name": row.name || "-",
        "Vehicle Class": row.vehicle_class || "-",
        "Mobile Number": row.mobile_number || "-",
        "Issue Date": row.issue_date || "-",
        "Expiry Date": row.expiry_date || "-",
        "Remarks": row.remarks || "-"
    };

    switch (reportKey) {
        case "COMPLETE_REGISTER":
            headers = ["S.No.", "LLR Number", "Applicant Name", "Vehicle Class", "Mobile Number", "Issue Date", "Expiry Date", "Date of Birth", "Blood Group", "Address Details", "DL Status", "Remarks"];
            Object.assign(entry, {
                "Date of Birth": row.date_of_birth || "-",
                "Blood Group": row.blood_group || "-",
                "Address Details": row.present_address || "-",
                "DL Status": state.isDlIssued ? `Issued (${row.dl_number || 'DL Done'})` : "Pending DL"
            });
            break;

        case "ACTIVE_LLR":
            if (state.isDlIssued || !state.isActive) return null;
            break;

        case "EXPIRED_LLR":
            if (state.isDlIssued || !state.isExpired) return null;
            headers = ["S.No.", "LLR Number", "Applicant Name", "Vehicle Class", "Mobile Number", "Issue Date", "Expiry Date", "Days Expired", "Remarks"];
            entry["Days Expired"] = `${state.daysExpired} Days Overdue`;
            break;

        case "EXPIRY_REGISTER":
            if (state.isDlIssued) return null;
            headers = ["S.No.", "LLR Number", "Applicant Name", "Vehicle Class", "Mobile Number", "Issue Date", "Expiry Date", "Current Status", "Days Left/Over", "Remarks"];
            entry["Current Status"] = state.isActive ? "Active" : "Expired";
            entry["Days Left/Over"] = state.isActive ? `${state.daysRemaining} Days Left` : `${state.daysExpired} Days Overdue`;
            break;

        case "PASSED_30_DAYS":
            if (state.isDlIssued || !state.daysSinceIssue || state.daysSinceIssue < 30) return null;
            headers = ["S.No.", "LLR Number", "Applicant Name", "Vehicle Class", "Mobile Number", "Issue Date", "Expiry Date", "Days Since Issue", "Remarks"];
            entry["Days Since Issue"] = `${state.daysSinceIssue} Days Ago`;
            break;

        case "ELIGIBLE_FOR_DL":
            if (state.isDlIssued || !state.isDlEligible) return null;
            headers = ["S.No.", "LLR Number", "Applicant Name", "Vehicle Class", "Mobile Number", "Issue Date", "Expiry Date", "Status", "Remarks"];
            entry["Status"] = "Ready for DL Test";
            break;

        case "PENDING_DL":
            if (state.isDlIssued) return null;
            headers = ["S.No.", "LLR Number", "Applicant Name", "Vehicle Class", "Mobile Number", "Issue Date", "Expiry Date", "Current Stage", "Remarks"];
            entry["Current Stage"] = state.isDlEligible ? "Ready for DL Test" : "In Learning Period";
            break;

        case "DL_ISSUED":
            if (!state.isDlIssued) return null;
            headers = ["S.No.", "LLR Number", "Applicant Name", "Vehicle Class", "Mobile Number", "Permanent DL Number", "Remarks"];
            entry["Permanent DL Number"] = row.dl_number || "-";
            break;

        case "LLR_TO_DL_CONVERSION":
            headers = ["S.No.", "LLR Number", "Applicant Name", "Vehicle Class", "Mobile Number", "Conversion Status", "Permanent DL Number", "Remarks"];
            entry["Conversion Status"] = state.isDlIssued ? "Converted to DL" : "Pending Conversion";
            entry["Permanent DL Number"] = state.isDlIssued ? (row.dl_number || "Issued") : "Not Issued";
            break;

        case "EXPIRING_7_DAYS":
            if (state.isDlIssued || !state.isActive || state.daysRemaining > 7) return null;
            headers = ["S.No.", "LLR Number", "Applicant Name", "Vehicle Class", "Mobile Number", "Issue Date", "Expiry Date", "Time Left", "Remarks"];
            entry["Time Left"] = `${state.daysRemaining} Days Left`;
            break;

        case "EXPIRING_30_DAYS":
            if (state.isDlIssued || !state.isActive || state.daysRemaining > 30) return null;
            headers = ["S.No.", "LLR Number", "Applicant Name", "Vehicle Class", "Mobile Number", "Issue Date", "Expiry Date", "Time Left", "Remarks"];
            entry["Time Left"] = `${state.daysRemaining} Days Left`;
            break;

        case "DUPLICATE_MOBILE":
            const cleanMob = (row.mobile_number || "").replace(/\D/g, "");
            const occurrences = mobileFrequencyMap.get(cleanMob) || 0;
            if (occurrences <= 1) return null;

            headers = ["S.No.", "LLR Number", "Applicant Name", "Vehicle Class", "Mobile Number", "Duplicate Status", "Remarks"];
            entry["Duplicate Status"] = `Warning: ${occurrences} Entries Found`;
            break;

        case "MISSING_INFORMATION":
            let missing = [];
            if (!row.mobile_number || row.mobile_number === "-") missing.push("Mobile");
            if (!row.blood_group || row.blood_group === "-") missing.push("Blood Group");
            if (missing.length === 0) return null;

            headers = ["S.No.", "LLR Number", "Applicant Name", "Vehicle Class", "Mobile Number", "Missing Details", "Remarks"];
            entry["Missing Details"] = `Alert: Missing ${missing.join(", ")}`;
            break;
    }

    return { headers, entry };
}