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
 * Pro-Level Multi-Strategy Tamil Nadu LLR Parsing Engine with Mandatory Field Validation.
 */
function executeTextParsingEngine() {
    const rawEl = document.getElementById("pdfText");
    if (!rawEl) return;
    const rawText = rawEl.value;
    if (!rawText.trim()) {
        showCustomToast("Hey there! Please paste your LLR text block before trying to parse.", "warning");
        return;
    }

    const flat = rawText.replace(/\s+/g, " ").replace(/"/g, "").trim();
    const data = {};
    const suggestions = {};

    // 1. LLR Number Multi-Strategy
    let llrMatch = flat.match(/\b(TN\s*\d{2})\s*\/([0-9\/]+)\b/i);
    if (!llrMatch) llrMatch = flat.match(/\b(TN\d{2}\/[0-9]+\/\d{4})\b/i);
    data["llr_number"] = llrMatch ? (llrMatch[2] ? `${llrMatch[1].replace(/\s+/g, "").toUpperCase()} /${llrMatch[2]}` : llrMatch[1].toUpperCase()) : "-";

    // 2. Fees Invoice Number Strategy
    let appMatch = flat.match(/\b(TN\d{2}[A-Z]\s*\/[0-9]+)\b/i) || flat.match(/\/(TN\d{2}[A-Z]\/[0-9]+)/i);
    data["fees_number"] = appMatch ? (appMatch[1] || appMatch[0]).replace(/[\/\s]/g, m => m === "/" ? "/" : "").toUpperCase() : "-";

    // 3. Fee Amount Strategy
    let feeMatch = flat.match(/Rs\.?\s*([\d.]+)/i) || flat.match(/(\d+[\d,.]*)\/-\s*\/[A-Z]/);
    data["fee_amount"] = feeMatch ? feeMatch[1] : "-";

    // 4. Date of Birth Multi-Strategy & Suggestion Builder
    let allDates = [...flat.matchAll(/\b(\d{2}[-\/]\d{2}[-\/]\d{4})\b/g)];
    let dobVal = "-";
    let dobCandidates = [];
    
    for (let dMatch of allDates) {
        let dateStr = dMatch[1];
        let parts = dateStr.split(/[-\/]/);
        let year = parseInt(parts[2]);
        if (year < 2020) {
            dobCandidates.push(formatToStandardDate(dateStr));
        }
    }
    dobVal = dobCandidates.length > 0 ? dobCandidates[0] : (allDates.length > 0 ? formatToStandardDate(allDates[0][1]) : "-");
    data["date_of_birth"] = dobVal;
    if (dobCandidates.length > 1) {
        suggestions["date_of_birth"] = dobCandidates.filter(d => d !== dobVal);
    }

    // 5. Blood Group Extraction
    let bloodGroupVal = "-";
    const globalBloodRegex = /(?:^|\s)(A1B|A2B|A1|A2|AB|A|B|O)\s*([+-])(?=\s|[0-9]|$)/i;
    let globalMatch = flat.match(globalBloodRegex);
    if (globalMatch) {
        bloodGroupVal = `${globalMatch[1].toUpperCase()}${globalMatch[2]}`;
    }
    data["blood_group"] = bloodGroupVal;

    // 6. Name and Kin Details Multi-Strategy
    let name = "-", relativeName = "-";
    let nameMatch = flat.match(/(?:Name|Licence No[^\/]*\/[0-9\/]+)\s*(?:Fee Details.*?)?([A-Z\s]{4,35})(?=\b\d{2}[-\/]\d{2}[-\/]\d{4}\b|[A-O]\+)/i);
    if (!nameMatch) {
        nameMatch = flat.match(/([A-Z]{3,}\s+[A-Z\s]{2,})\s+\d{2}[-\/]\d{2}[-\/]\d{4}/);
    }
    
    if (nameMatch) {
        let cleanNameChunk = nameMatch[1].replace(/Licence No|Name|Father'?s?\s*Name|Optional|Blood Group/gi, "").trim();
        let tokens = cleanNameChunk.split(/\s+/).filter(t => t.length > 0 && !/^\d+$/.test(t));
        if (tokens.length >= 2) {
            if (tokens.length >= 3 && tokens[1].length === 1) {
                name = `${tokens[0]} ${tokens[1]}`;
                relativeName = tokens.slice(2).join(" ");
            } else {
                let half = Math.ceil(tokens.length / 2);
                name = tokens.slice(0, half).join(" ");
                relativeName = tokens.slice(half).join(" ");
            }
        } else if (tokens.length === 1) {
            name = tokens[0];
        }
    }
    data["name"] = name;
    data["relative_name"] = relativeName;
    data["relative_type"] = flat.toUpperCase().includes("HUSBAND") ? "Husband" : "Father";

    // 7 & 8. Addresses & Marks Multi-Strategy with Strict Boilerplate Filtering
    let addressText = "-", idMark1 = "-", idMark2 = "-";
    let pinMatch = flat.match(/\b(6\d{5})\b/);
    
    if (pinMatch) {
        let pinIdx = pinMatch.index + 6;
        let addressStartIdx = bloodGroupVal !== "-" && flat.indexOf(bloodGroupVal) !== -1 ? flat.indexOf(bloodGroupVal) + bloodGroupVal.length : 0;
        let addrChunk = flat.substring(addressStartIdx, pinIdx).replace(/Present Address|Permanent/gi, "").trim();
        addressText = addrChunk;

        let marksSection = flat.substring(pinIdx);
        let stopBoundaryIdx = marksSection.search(/is\s+licenced\s+to\s+drive|This\s+LL\s+Certificate|Warning:/i);
        if (stopBoundaryIdx !== -1) {
            marksSection = marksSection.substring(0, stopBoundaryIdx);
        }

        let mark1Match = marksSection.match(/\(1\)\s*([^()]+)/i) || marksSection.match(/A\s+(?:MOLE|SCAR|WOUND|STITCH|BURN|TATTOO)[^,\.\n]+/i);
        let mark2Match = marksSection.match(/\(2\)\s*([^()]+)/i);

        if (mark1Match) idMark1 = (mark1Match[1] || mark1Match[0]).trim();
        if (mark2Match) idMark2 = mark2Match[1].trim();
    }
    
    data["present_address"] = addressText;
    data["permanent_address"] = addressText;
    data["identification_mark_1"] = idMark1.replace(/\s+/g, " ").replace(/\(2\).*/, "").trim();
    data["identification_mark_2"] = idMark2.replace(/\s+/g, " ").trim();

    // 9. Vehicle Class Multi-Strategy
    let vehicleMatch = flat.match(/(?:description)\s+([A-Z0-9,\s\-+/]+?)(?=\.|\*The holder|$)/i);
    let rawVehicle = vehicleMatch ? vehicleMatch[1] : "";
    let allCodes = flat.match(/\b(MCWOG|MCWG|LMV|LMV-NT|LMV-TR|TRANS)\b/gi);
    if (allCodes) {
        rawVehicle = [...new Set([...rawVehicle.split(','), ...allCodes])].filter(Boolean).join(", ");
    }
    data["vehicle_class"] = normalizeVehicleClass(rawVehicle);

    // 10. Issue Date & Expiry Date Multi-Strategy
    let rawIssue = "-", rawExpiry = "-";
    let validityMatch = flat.match(/valid\s*from[^\d]*(\d{2}[\/\-]\d{2}[\/\-]\d{4})\s*(?:To|to|-)\s*(\d{2}[\/\-]\d{2}[\/\-]\d{4})/i);
    
    if (!validityMatch && allDates.length >= 3) {
        rawIssue = allDates[allDates.length - 2][1];
        rawExpiry = allDates[allDates.length - 1][1];
    } else if (validityMatch) {
        rawIssue = validityMatch[1];
        rawExpiry = validityMatch[2];
    }

    data["issue_date"] = formatToStandardDate(rawIssue);
    data["expiry_date"] = formatToStandardDate(rawExpiry);

    // 11. Approved Date
    let appDateMatch = flat.match(/(?:Approved\s*Date|LLR\s*Approved\s*Date)[:\s]*([\d\s\-:\/]*)/i);
    let rawApproved = "-";
    if (appDateMatch) {
        let dOnly = appDateMatch[1].match(/(\d{2,4}[-\/]\d{2}[-\/]\d{2,4})/);
        if (dOnly) rawApproved = dOnly[1];
    }
    if (rawApproved === "-" && data["issue_date"] !== "-") rawApproved = data["issue_date"];
    data["approved_date"] = formatToStandardDate(rawApproved);

    // STRICT MANDATORY FIELD CHECK
    const missingFields = [];
    if (!data["llr_number"] || data["llr_number"] === "-") missingFields.push("LLR Number");
    if (!data["name"] || data["name"] === "-") missingFields.push("Applicant Name");
    if (!data["date_of_birth"] || data["date_of_birth"] === "-") missingFields.push("Date of Birth");
    if (!data["issue_date"] || data["issue_date"] === "-") missingFields.push("Issue Date");
    if (!data["expiry_date"] || data["expiry_date"] === "-") missingFields.push("Expiry Date");

    if (missingFields.length > 0) {
        showCustomToast(`⚠️ Some key info couldn't be found: ${missingFields.join(", ")}. Please fill them in manually.`, "warning");
    } else {
        showCustomToast("✨ LLR text successfully parsed! Review details below.", "success");
    }

    if (typeof window.bindFormFields === "function") {
        window.bindFormFields(data, suggestions);
    }

    return data;
}