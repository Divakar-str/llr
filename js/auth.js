// js/auth.js - Centralized Environment-Driven Authentication Guard
const WORKER_AUTH_URL = (typeof ENV !== 'undefined' && ENV.SHEET_API_URL) ? ENV.SHEET_API_URL : (window.ENV?.SHEET_API_URL || "");

(function () {
    // 1. Immediate Execution (Pre-Render Guard to avoid content flash)
    const currentPath = window.location.pathname.split("/").pop() || "index.html";
    const isLoginPage = currentPath.toLowerCase() === "login.html";
    const savedAuth = sessionStorage.getItem("authBasic");

    if (!savedAuth && !isLoginPage) {
        // Not authenticated -> Redirect to login immediately
        window.location.replace("login.html");
        return;
    }

    if (savedAuth && isLoginPage) {
        // Already authenticated -> Redirect to portal index
        window.location.replace("index.html");
        return;
    }

    // 2. DOM Ready Checks
    document.addEventListener("DOMContentLoaded", () => {
        if (savedAuth && !isLoginPage) {
            verifyAuthTokenSilently(savedAuth);
        }
    });
})();

/**
 * Validates the stored token against Cloudflare D1 without downloading heavy datasets.
 */
async function verifyAuthTokenSilently(token) {
    if (!WORKER_AUTH_URL) return;

    try {
        // Use a lightweight action or HEAD/ping check if supported; fallback to readAll with AbortSignal
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000);

        const response = await fetch(`${WORKER_AUTH_URL}?action=ping`, {
            method: "GET",
            headers: { 
                "Authorization": token 
            },
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        // If backend does not support "ping" and returns 404 or 400, auth header was still accepted.
        // Only 401 Unauthorized strictly denotes an invalid/expired session.
        if (response.status === 401) {
            handleSessionExpiration();
        }
    } catch (err) {
        // Suppress benign network failures or offline states so users can still view local caches
        if (err.name !== "AbortError") {
            console.debug("Background auth check bypassed due to network state:", err.message);
        }
    }
}

/**
 * Returns standard authentication headers for all fetch queries across the portal.
 */
function getAuthHeaders() {
    const token = sessionStorage.getItem("authBasic") || "";
    return {
        "Content-Type": "application/json",
        "Authorization": token
    };
}

/**
 * Centralized sign-out routine clearing active sessions and states.
 */
function purgeUserSession() {
    sessionStorage.removeItem("authBasic");
    sessionStorage.removeItem("activeUser");
    window.location.replace("login.html");
}

/**
 * Handles graceful logout when token is rejected by the server.
 */
function handleSessionExpiration() {
    // Dispatch global event in case active forms want to preserve unsaved draft work
    window.dispatchEvent(new CustomEvent("portal:session_expired"));

    sessionStorage.removeItem("authBasic");
    sessionStorage.removeItem("activeUser");

    // Check if an alert helper exists on the current page
    if (typeof showCustomToast === "function") {
        showCustomToast("Session expired. Please log in again.", "danger");
    } else if (typeof showStyledAlert === "function") {
        showStyledAlert("Session expired. Please log in again.", "danger");
    }

    setTimeout(() => {
        window.location.replace("login.html");
    }, 1200);
}