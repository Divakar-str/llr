// js/auth.js - Centralized environment-driven auth guard
const WORKER_URL = (typeof ENV !== 'undefined' && ENV.SHEET_API_URL) ? ENV.SHEET_API_URL : "";

document.addEventListener("DOMContentLoaded", function () {
    const savedAuth = sessionStorage.getItem("authBasic");
    if (!savedAuth) {
        if (!window.location.pathname.endsWith("login.html")) {
            window.location.href = "login.html";
        }
    } else {
        verifyAuthTokenSilently(savedAuth);
    }
});

async function verifyAuthTokenSilently(token) {
    try {
        const response = await fetch(`${WORKER_URL}?action=readAll`, {
            headers: { "Authorization": token }
        });
        if (response.status === 401) {
            sessionStorage.removeItem("authBasic");
            window.location.href = "login.html";
        }
    } catch (e) {
        // Suppress network errors during offline checks
    }
}

function getAuthHeaders() {
    return {
        "Content-Type": "application/json",
        "Authorization": sessionStorage.getItem("authBasic") || ""
    };
}