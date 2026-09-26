document.addEventListener("DOMContentLoaded", () => {
    const extractBtn = document.getElementById("extractBtn");
    const clearBtn = document.getElementById("clearBtn");
    const mobileInput = document.getElementById("formMobile");
    const emergencyMobileInput = document.getElementById("formEmergencyMobile");

    if (extractBtn) extractBtn.addEventListener("click", executeTextParsingEngine);
    if (clearBtn) clearBtn.addEventListener("click", () => {
        const inputArea = document.getElementById("pdfText");
        if (inputArea) inputArea.value = "";
    });

    [mobileInput, emergencyMobileInput].forEach(inp => {
        if (inp) {
            inp.addEventListener("input", (e) => {
                e.target.value = e.target.value.replace(/\D/g, "").slice(0, 10);
            });
        }
    });
});

/**
 * Normalizes spacing inconsistencies without erasing structural line breaks.
 */
function cleanText(text) {
    return text.replace(/["]/g, "").replace(/[ \t]+/g, " ").trim();
}

/**
 * Normalizes vehicle classifications into a standard sorted sequence.
 */
function normalizeVehicleClass(vehicleStr) {
    if (!vehicleStr || vehicleStr === "-") return "-";

    const weights = { "MCWOG": 1, "MCWG": 2, "LMV": 3, "LMV-NT": 4, "LMV-TR": 5, "TRANS": 6 };
    let clean = vehicleStr.toUpperCase().replace(/[\s\.,\-\+_\*]+/g, " ").trim();
    let detected = new Set();

    if (/\bMCWOG\b/.test(clean)) detected.add("MCWOG");
    if (/\bMCWG\b/.test(clean)) detected.add("MCWG");
    if (/\bLMV\b/.test(clean)) detected.add("LMV");
    if (/\bTRANS\b/.test(clean)) detected.add("TRANS");

    let sorted = Array.from(detected).sort((a, b) => {
        return (weights[a] || 9) - (weights[b] || 9);
    });

    return sorted.length > 0 ? sorted.join(",") : clean.replace(/\s*,\s*/g, ",");
}

/**
 * Normalizes date blocks into structured DD-MM-YYYY strings.
 */
function formatToStandardDate(dateStr) {
    if (!dateStr || dateStr === "-") return "-";
    let normalized = dateStr.replace(/\s+/g, "").replace(/\//g, "-");
    let match = normalized.match(/(\d{2,4})-(\d{2})-(\d{2,4})/);
    if (match) {
        if (match[1].length === 4) {
            return `${match[3].padStart(2, "0")}-${match[2].padStart(2, "0")}-${match[1]}`;
        }
        return `${match[1].padStart(2, "0")}-${match[2].padStart(2, "0")}-${match[3]}`;
    }
    return normalized.trim();
}

/**
 * Specialized Tamil Nadu Form 3 LLR parsing engine.
 */
function executeTextParsingEngine() {
    const rawEl = document.getElementById("pdfText");
    if (!rawEl) return;
    const rawText = rawEl.value;
    if (!rawText.trim()) {
        alert("Please paste the LLR text block first.");
        return;
    }

    const flat = rawText.replace(/\s+/g, " ").replace(/"/g, "").trim();
    const data = {};

    // 1. LLR Number (e.g., TN52 /0006383/2026 or TN52 /0006832/2026)
    let llrMatch = flat.match(/\b(TN\s*\d{2})\s*\/([0-9\/]+)\b/i);
    data["llr_number"] = llrMatch ? `${llrMatch[1].replace(/\s+/g, "").toUpperCase()} /${llrMatch[2].replace(/\s+/g, "")}` : "-";

    // 2. Fees Invoice Number (e.g., TN26Z/2723255 or TN26Z/2912461)
    let appMatch = flat.match(/\b(TN\d{2}[A-Z]\s*\/[0-9]+)\b/i);
    if (!appMatch) appMatch = flat.match(/\/(TN\d{2}[A-Z]\/[0-9]+)/i);
    data["fees_number"] = appMatch ? (appMatch[1] || appMatch[0]).replace(/[\/\s]/g, m => m === "/" ? "/" : "").toUpperCase() : "-";

    // 3. Fee Amount
    let feeMatch = flat.match(/Rs\.?\s*([\d.]+)/i);
    data["fee_amount"] = feeMatch ? feeMatch[1] : "-";

    // 4. Date of Birth
    let dobMatch = flat.match(/\b(\d{2}[-\/]\d{2}[-\/]\d{4})\b/);
    data["date_of_birth"] = dobMatch ? formatToStandardDate(dobMatch[1]) : "-";

    // 5. Blood Group Extraction & Fused Prefix Decoupler
    let bloodGroupVal = "-";
    let rawAddressStartOffset = 0;

    if (dobMatch) {
        let dobPos = flat.indexOf(dobMatch[1]);
        let postDobChunk = flat.substring(dobPos + dobMatch[1].length).trim();

        // Check for character fusion: e.g. "ODNO", "O-DNO", "A-DNO", "B-DNO"
        let fusedMatch = postDobChunk.match(/^([ABO]|A1|A2|A1B|A2B)\s*([+-])?\s*(?:-?\s*DNO|ODNO)\b/i);

        if (fusedMatch) {
            let group = fusedMatch[1].toUpperCase();
            let sign = fusedMatch[2] || "-";
            bloodGroupVal = `${group}${sign}`;
            rawAddressStartOffset = postDobChunk.indexOf("DNO");
        } else {
            const bloodRegex = /(?:^|\s)(A1B|A2B|A1|A2|AB|A|B|O)\s*([+-])(?=\s|[0-9]|$)/i;
            let match = postDobChunk.substring(0, 50).match(bloodRegex);
            if (match) {
                bloodGroupVal = `${match[1].toUpperCase()}${match[2]}`;
            }
        }
    }

    if (bloodGroupVal === "-") {
        const globalBloodRegex = /(?:^|\s)(A1B|A2B|A1|A2|AB|A|B|O)\s*([+-])(?=\s|[0-9]|$)/i;
        let globalMatch = flat.match(globalBloodRegex);
        if (globalMatch) {
            bloodGroupVal = `${globalMatch[1].toUpperCase()}${globalMatch[2]}`;
        }
    }
    data["blood_group"] = bloodGroupVal;

    // 6. Name and Kin Details
    let name = "-", relativeName = "-";
    if (llrMatch && dobMatch) {
        let startPos = flat.indexOf(llrMatch[0]) + llrMatch[0].length;
        let endPos = flat.indexOf(dobMatch[1], startPos);

        if (endPos > startPos) {
            let nameChunk = flat.substring(startPos, endPos)
                .replace(/Fee Details.*?(?=[A-Z])/i, "")
                .replace(/Licence No|Father'?s?\s*Name|Date of Birth|Name/gi, "")
                .trim();

            let tokens = nameChunk.split(/\s+/).filter(t => t.length > 0 && !/^\d+$/.test(t) && !/^[1-8]\.$/.test(t));
            if (tokens.length >= 3) {
                if (tokens[1].length === 1) {
                    name = `${tokens[0]} ${tokens[1]}`;
                    relativeName = tokens.slice(2).join(" ");
                } else if (tokens[tokens.length - 1] === tokens[tokens.length - 2]) {
                    relativeName = tokens[tokens.length - 1];
                    name = tokens.slice(0, tokens.length - 2).join(" ");
                } else {
                    let half = Math.ceil(tokens.length / 2);
                    name = tokens.slice(0, half).join(" ");
                    relativeName = tokens.slice(half).join(" ");
                }
            } else if (tokens.length === 2) {
                name = tokens[0];
                relativeName = tokens[1];
            } else if (tokens.length === 1) {
                name = tokens[0];
            }
        }
    }
    data["name"] = name;
    data["relative_name"] = relativeName;
    data["relative_type"] = flat.toUpperCase().includes("HUSBAND") ? "Husband" : "Father";

    // 7 & 8. Scoped Address & Precise Marks Splitting
    let addressText = "-", idMark1 = "-", idMark2 = "-";

    if (dobMatch) {
        let dobEnd = flat.indexOf(dobMatch[1]) + dobMatch[1].length;

        // Hard stop before CMV Rule text begins
        let footerLimitIdx = flat.search(/\bis licenced to drive\b/i);
        if (footerLimitIdx === -1) footerLimitIdx = flat.indexOf("This Licence is valid");
        if (footerLimitIdx === -1) footerLimitIdx = flat.length;

        let middleSection = flat.substring(dobEnd, footerLimitIdx);

        // Find all 6-digit Tamil Nadu PIN codes (600xxx-643xxx)
        let pinMatches = [...middleSection.matchAll(/\b(6\d{5})\b/g)];
        let marksChunk = "";

        if (pinMatches.length > 0) {
            let firstPinEnd = pinMatches[0].index + 6;
            let lastPinEnd = pinMatches[pinMatches.length - 1].index + 6;

            // Address is from start of middleSection up to first PIN code
            let addrChunk = middleSection.substring(0, firstPinEnd).trim();

            if (rawAddressStartOffset > 0) {
                addrChunk = addrChunk.substring(rawAddressStartOffset).trim();
            } else if (bloodGroupVal !== "-") {
                let bgEsc = bloodGroupVal.replace("+", "\\+").replace("-", "\\-");
                addrChunk = addrChunk.replace(new RegExp(`^\\s*${bgEsc}\\s*`, "i"), "").trim();
            }
            addressText = addrChunk;

            // Marks chunk starts strictly after the final PIN code occurrence
            marksChunk = middleSection.substring(lastPinEnd).trim();
        } else {
            // Fallback delimiter splitting
            let markHeaderMatch = middleSection.match(/(?:Marks\s*of\s*Identification|\b(?=A\s+(?:MOLE|SCAR|WOUND|STITCH|BURN|TATTOO|MARK|BLACK)))/i);
            let addrBoundaryIdx = markHeaderMatch ? markHeaderMatch.index : -1;
            addressText = addrBoundaryIdx !== -1 ? middleSection.substring(0, addrBoundaryIdx).trim() : middleSection.trim();
            marksChunk = addrBoundaryIdx !== -1 ? middleSection.substring(addrBoundaryIdx).trim() : "";
        }

        // Clean label noise from marksChunk
        marksChunk = marksChunk.replace(/^.*?Marks\s*of\s*Identification(?:\s*\(1\))?/i, "")
                               .replace(/^\(1\)\s*/i, "")
                               .trim();

        // Split cleanly on "(2)"
        let splitParts = marksChunk.split(/\s*\(2\)\s*/i);

        if (splitParts.length >= 2) {
            idMark1 = splitParts[0].trim();
            idMark2 = splitParts[1].trim();
        } else if (splitParts.length === 1 && splitParts[0].length > 0) {
            // If "(2)" was absent, check for multiple physical markers like "A SCAR", "A MOLE"
            let directMarks = [...splitParts[0].matchAll(/\b(A\s+(?:MOLE|SCAR|WOUND|STITCH|BURN|TATTOO|BLACK\s*MOLE)[^,\.\n]+)/gi)];
            if (directMarks.length >= 2) {
                idMark1 = directMarks[0][1].trim();
                idMark2 = directMarks[1][1].trim();
            } else if (directMarks.length === 1) {
                idMark1 = directMarks[0][1].trim();
            } else {
                idMark1 = splitParts[0].trim();
            }
        }
    }

    data["present_address"] = addressText;
    data["permanent_address"] = addressText;
    data["identification_mark_1"] = idMark1.replace(/\s+/g, " ");
    data["identification_mark_2"] = idMark2.replace(/\s+/g, " ");

    // 9. Vehicle Class (e.g., LMV, MCWG)
    let vehicleMatch = flat.match(/(?:description)\s+([A-Z0-9,\s\-+/]+?)(?=\s*\.|\s*The holder|\s*\*|$)/i);
    data["vehicle_class"] = normalizeVehicleClass(vehicleMatch ? vehicleMatch[1] : flat);

    // 10. Dates & Validity
    let rawIssue = "-", rawExpiry = "-";
    let validMatch = flat.match(/valid\s*from\s*(?:date\s*)?(\d{2}[\/\-]\d{2}[\/\-]\d{4})\s*(?:To|to)\s*(\d{2}[\/\-]\d{2}[\/\-]\d{4})/i);
    if (validMatch) {
        rawIssue = validMatch[1];
        rawExpiry = validMatch[2];
    }
    data["issue_date"] = formatToStandardDate(rawIssue);
    data["expiry_date"] = formatToStandardDate(rawExpiry);

    // 11. Approval Datetime
    let appDateMatch = flat.match(/Approved\s*Date:\s*([\d\s\-:\/A-Za-z]*)/i);
    let rawApproved = "-";
    if (appDateMatch) {
        let dOnly = appDateMatch[1].match(/(\d{2,4}[-\/]\d{2}[-\/]\d{2,4})/);
        if (dOnly) rawApproved = dOnly[1];
    }
    if (rawApproved === "-" && data["issue_date"] !== "-") rawApproved = data["issue_date"];
    data["approved_date"] = formatToStandardDate(rawApproved);

    // Bind values to UI Form
    if (typeof window.bindFormFields === "function") {
        window.bindFormFields(data);
    }

    setTimeout(() => {
        const m = document.getElementById("formMobile");
        if (m) { m.focus(); m.select(); }
    }, 100);

    return data;
}