/**
 * Multi-Select Dropdown Match & Filter Engine
 */
import { parseCustomDate } from '../utils/dateUtils.js';

export function getSelectedVehicleClasses() {
    const checkboxes = document.querySelectorAll(".vehicle-checkbox:checked");
    const values = Array.from(checkboxes).map(cb => cb.value);
    return values.length > 0 ? values : ["ALL"];
}

export function matchReportFilters(row) {
    const selectedClasses = getSelectedVehicleClasses();
    const fromDateStr = document.getElementById("filterFromDate")?.value || "";
    const toDateStr = document.getElementById("filterToDate")?.value || "";
    const rawQuery = document.getElementById("filterSearchQuery")?.value || "";

    // 1. Full-Text Multi-Token Search
    if (rawQuery.trim() !== "") {
        const queryTokens = rawQuery.trim().toUpperCase().split(/\s+/);
        const cleanMobile = (row.mobile_number || "").replace(/\D/g, "");
        const cleanEmergency = (row.emergency_mobile || "").replace(/\D/g, "");

        const searchableText = [
            row.name, row.llr_number, row.dl_number,
            cleanMobile, cleanEmergency, row.relative_name,
            row.identification_mark_1, row.identification_mark_2,
            row.present_address, row.permanent_address,
            row.vehicle_class, row.blood_group, row.remarks
        ].map(val => (val !== undefined && val !== null ? String(val).toUpperCase() : "")).join(" ");

        const matchesAllTokens = queryTokens.every(token => {
            const cleanToken = token.replace(/\D/g, "");
            if (cleanToken.length >= 4 && (cleanMobile.includes(cleanToken) || cleanEmergency.includes(cleanToken))) {
                return true;
            }
            return searchableText.includes(token);
        });

        if (!matchesAllTokens) return false;
    }

    // 2. Multi-Select Vehicle Class Filtering
    if (!selectedClasses.includes("ALL") && selectedClasses.length > 0) {
        if (!row.vehicle_class || row.vehicle_class === "-") return false;

        const rowClasses = String(row.vehicle_class)
            .toUpperCase()
            .split(",")
            .map(c => c.trim());

        const matchesSelected = selectedClasses.some(sel => {
            if (sel === "MCWG_ONLY") return rowClasses.length === 1 && rowClasses[0] === "MCWG";
            if (sel === "MCWOG_ONLY") return rowClasses.length === 1 && rowClasses[0] === "MCWOG";
            if (sel === "LMV_ONLY") return rowClasses.length === 1 && rowClasses[0] === "LMV";
            if (sel === "TRANS_ONLY") return rowClasses.some(c => ["TRANS", "HMV", "HGMV"].includes(c));
            if (sel === "MCWG_LMV") return rowClasses.includes("MCWG") && rowClasses.includes("LMV");
            if (sel === "MCWOG_LMV") return rowClasses.includes("MCWOG") && rowClasses.includes("LMV");
            return false;
        });

        if (!matchesSelected) return false;
    }

    // 3. Timezone-Safe Date Boundaries
    const issueDate = parseCustomDate(row.issue_date);
    if (fromDateStr && issueDate) {
        const start = new Date(fromDateStr + "T00:00:00.000");
        if (issueDate < start) return false;
    }
    if (toDateStr && issueDate) {
        const end = new Date(toDateStr + "T23:59:59.999");
        if (issueDate > end) return false;
    }

    return true;
}