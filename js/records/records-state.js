// Global State Storage
const SHEET_API_URL = typeof ENV !== "undefined" ? ENV.SHEET_API_URL : "";
let localCacheRecordsCollection = [];
let bootstrapModalInstance = null;

// Pagination State
let currentPage = 1;
const rowsPerPage = 20;

const CACHE_KEY = "llr_registry_cache";
const CACHE_TIME_KEY = "llr_registry_cache_time";
const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes TTL

/**
 * Reads records from localStorage if valid
 */
function getCachedData() {
    try {
        const cached = localStorage.getItem(CACHE_KEY);
        const cacheTime = localStorage.getItem(CACHE_TIME_KEY);
        if (cached && cacheTime && (Date.now() - parseInt(cacheTime, 10) < CACHE_DURATION_MS)) {
            return JSON.parse(cached);
        }
    } catch (e) { console.warn("Cache read skipped:", e); }
    return null;
}

/**
 * Saves records array to localStorage
 */
function setCachedData(records) {
    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(records));
        localStorage.setItem(CACHE_TIME_KEY, Date.now().toString());
    } catch (e) { console.warn("Cache write skipped:", e); }
}

/**
 * High-performance Date parser
 */
function parseStringToJsDate(dateStr) {
    if (!dateStr || dateStr === "-") return null;
    const str = dateStr.toString().trim();
    if (!str) return null;

    const cleanStr = str.indexOf(" ") !== -1 ? str.substring(0, str.indexOf(" ")) : str;
    const parts = cleanStr.includes("/") ? cleanStr.split("/") : cleanStr.split("-");

    if (parts.length === 3) {
        let year, month, day;
        if (parts[0].length === 4) {
            year = parseInt(parts[0], 10);
            month = parseInt(parts[1], 10) - 1;
            day = parseInt(parts[2], 10);
        } else if (parts[2].length === 4) {
            day = parseInt(parts[0], 10);
            month = parseInt(parts[1], 10) - 1;
            year = parseInt(parts[2], 10);
        } else {
            return null;
        }
        return new Date(year, month, day);
    }
    return null;
}

/**
 * Clean Date Formatter
 */
function cleanIncomingDate(dateStr) {
    if (!dateStr || dateStr === "-" || dateStr.toString().trim() === "") return "-";
    const str = dateStr.toString().trim();
    if (str.includes("T")) {
        const clean = str.split("T")[0];
        const parts = clean.split("-");
        if (parts.length === 3 && parts[0].length === 4) {
            return `${parts[2]}-${parts[1]}-${parts[0]}`;
        }
    }
    return str.replace(/\//g, "-").split(" ")[0].trim();
}