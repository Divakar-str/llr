document.addEventListener("DOMContentLoaded", () => {
    const extractBtn = document.getElementById("extractBtn");
    const clearBtn = document.getElementById("clearBtn");
    const mobileInput = document.getElementById("formMobile");
    const emergencyMobileInput = document.getElementById("formEmergencyMobile");

    if (extractBtn) extractBtn.addEventListener("click", executeTextParsingEngine);
    if (clearBtn) clearBtn.addEventListener("click", () => document.getElementById("pdfText").value = "");

    // Restrict inputs to numeric digits only and cap at 10 characters
    [mobileInput, emergencyMobileInput].forEach(input => {
        if (input) {
            input.addEventListener("input", (e) => {
                e.target.value = e.target.value.replace(/\D/g, "").slice(0, 10);
            });
        }
    });
});

/**
 * Normalizes spacing inconsistencies without completely erasing structural line breaks.
 */
function cleanText(text) {
    return text.replace(/["]/g, "").replace(/[ \t]+/g, " ").trim();
}

/**
 * Normalizes vehicle classifications into a standard sorted sequence.
 * Groups, sorts, and joins codes strictly using a comma with no surrounding spaces (e.g., "MCWG,LMV,TRANS").
 */
function normalizeVehicleClass(vehicleStr) {
    if (!vehicleStr || vehicleStr === "-") return "-";
    
    // Convert to uppercase and strip out punctuation artifacts, replacing them with standard spaces
    let cleanStr = vehicleStr.toUpperCase().replace(/[\s\.,\-\+_\*]+/g, " ").trim();
    let tokens = cleanStr.split(" ");
    
    let classes = [];
    if (tokens.includes("MCWG")) classes.push("MCWG");
    if (tokens.includes("LMV")) classes.push("LMV");
    if (tokens.includes("MCWOG")) classes.push("MCWOG");
    if (tokens.includes("TRANS")) classes.push("TRANS");
    
    if (classes.length > 0) {
        // Strict deterministic sorting rule: Motorcycle classes first, LMV second, TRANS last
        classes.sort((a, b) => {
            const weights = { "MCWG": 1, "MCWOG": 1, "LMV": 2, "TRANS": 3 };
            const weightA = weights[a] || 9;
            const weightB = weights[b] || 9;
            
            if (weightA !== weightB) {
                return weightA - weightB;
            }
            return a.localeCompare(b);
        });
        return classes.join(",");
    }
    
    // Fallback cleanup if token matches are missing but commas exist
    return cleanStr.replace(/\s*,\s*/g, ",");
}

/**
 * Normalizes date blocks into structured DD-MM-YYYY strings.
 */
function formatToStandardDate(dateStr) {
    if (!dateStr || dateStr === "-") return "-";
    
    let normalized = dateStr.replace(/\s+/g, "").replace(/\//g, "-");
    let match = normalized.match(/(\d{2,4})-(\d{2})-(\d{2,4})/);
    
    if (match) {
        let pieces = [match[1], match[2], match[3]];
        if (pieces[0].length === 4) {
            return `${pieces[2].padStart(2, '0')}-${pieces[1].padStart(2, '0')}-${pieces[0]}`;
        }
        return `${pieces[0].padStart(2, '0')}-${pieces[1].padStart(2, '0')}-${pieces[2]}`;
    }
    return normalized.trim();
}

/**
 * Processes text strings via dual extraction logic pathways.
 */
function executeTextParsingEngine() {
    const rawText = document.getElementById("pdfText").value;
    if (!rawText.trim()) {
        alert("Please paste the LLR text block first.");
        return;
    }

    const structuralText = cleanText(rawText);
    const flattenedText = rawText.replace(/\s+/g, " ").replace(/"/g, "").trim();
    const data = {};

    // 1. LLR Number (Cascading match routine)
    let llrMatch = structuralText.match(/([A-Z]{2}\d{2})\s*\/([0-9\/ ]+)/i);
    if (!llrMatch) llrMatch = flattenedText.match(/([A-Z]{2}\d{2})\s*\/([0-9\/]+)/i);
    data["llr_number"] = llrMatch ? `${llrMatch[1].toUpperCase()} /${llrMatch[2].replace(/\s+/g, "")}` : "-";

    // 2. Application/Fees Invoice Reference Identification
    let appMatch = structuralText.match(/[A-Z]{2}\d{2}Z\s*\/[0-9]+/i);
    if (!appMatch) appMatch = flattenedText.match(/[A-Z]{2}\d{2}Z\s*\/[0-9]+/i);
    data["fees_number"] = appMatch ? appMatch[0].replace(/\s+/g, "") : "-";

    // 3. Fee Amounts Capture
    const feeMatch = flattenedText.match(/Rs\.?\s*([\d.]+)/i);
    data["fee"] = feeMatch ? feeMatch[1] : "-";

    // 4. Date of Birth parsing loop block
    let dobMatch = flattenedText.match(/(\d{2}\s*[-\/]\s*\d{2}\s*[-\/]\s*\d{4})/);
    if (!dobMatch) {
        let splitDateMatch = structuralText.replace(/\r?\n|\r/g, " ").match(/(\d{2})\s+(\d{2}-\d{4})/);
        if (splitDateMatch) {
            data["date_of_birth"] = formatToStandardDate(`${splitDateMatch[1]}-${splitDateMatch[2]}`);
        } else {
            data["date_of_birth"] = "-";
        }
    } else {
        data["date_of_birth"] = formatToStandardDate(dobMatch[1]);
    }

    // 5. Blood Group Type Evaluation
    const bloodMatch = flattenedText.match(/\b(A|B|AB|O|A1|A2|A1B|A2B)\s*([\+\-])/i);
    const bloodGroup = bloodMatch ? `${bloodMatch[1].toUpperCase()}${bloodMatch[2]}` : "-";
    data["blood_group"] = bloodGroup;

    // 6. Applicant Name & Kin Relations Extraction Matrix
    let name = "-", relativeName = "-";
    let coreBlockMatch = flattenedText.match(/\/\d{4}\s+([A-Z\s\.]+?)\s+\d{2}-\d{2}-\d{4}/i);
    
    if (!coreBlockMatch) {
        const lines = rawText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        const dobIdx = lines.findIndex(l => l.match(/\d{2}-\d{2}-\d{4}/));
        
        if (dobIdx !== -1) {
            if (dobIdx > 0 && dobIdx + 1 < lines.length && !lines[dobIdx - 1].includes("Name")) {
                // Handle multi-column dump format (Relative name above DOB, Applicant name below)
                relativeName = lines[dobIdx - 1];
                name = lines[dobIdx + 1];
            } else if (dobIdx >= 2) {
                // Standard stacked layout
                name = lines[dobIdx - 2];
                relativeName = lines[dobIdx - 1];
            }
        }
    } else {
        let tokens = coreBlockMatch[1].trim().split(/\s+/);
        if (tokens.length >= 2) {
            if (tokens[tokens.length - 1] === tokens[tokens.length - 2]) {
                name = tokens.slice(0, tokens.length - 1).join(" "); 
                relativeName = tokens[tokens.length - 1];
            } else if (tokens.length === 4 && tokens[1].length === 1 && tokens[3].length === 1) {
                name = tokens.slice(0, 2).join(" "); 
                relativeName = tokens.slice(2).join(" ");
            } else {
                let half = Math.ceil(tokens.length / 2);
                if (tokens.length > 2 && tokens[1].length === 1 && tokens.length % 2 === 0) half = 2;
                name = tokens.slice(0, half).join(" "); 
                relativeName = tokens.slice(half).join(" ");
            }
        } else { 
            name = tokens[0]; 
        }
    }
    data["name"] = name;
    data["relative_name"] = relativeName;
    data["relative_type"] = flattenedText.toUpperCase().includes("HUSBAND") ? "Husband" : "Father";

    // 7 & 8. Address Structures & Biometric Scars Processing Space
    let addressText = "-", idMark1 = "-", idMark2 = "-";

    // A. IDENTIFICATION MARKS EXTRACTION
    const rawLines = rawText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const markLines = rawLines.filter(l => /^(?:A\s+SCAR|A\s+MOLE|AMOLE)\b/i.test(l));

    if (markLines.length > 0) {
        idMark1 = markLines[0];
        if (markLines.length > 1) {
            idMark2 = markLines[1];
        }
    } else {
        const markRegex = /(?:A\s+SCAR|A\s+MOLE|AMOLE)\b[^(\n\r]*/gi;
        const extractedMarks = flattenedText.match(markRegex);

        if (extractedMarks && extractedMarks.length > 0) {
            idMark1 = extractedMarks[0].replace(/\s+(?:TN\d{2}|Husband|Father|is licenced|RTO|Fee Details).*/i, "").trim();
            if (extractedMarks.length > 1) {
                idMark2 = extractedMarks[1].replace(/\s+(?:TN\d{2}|Husband|Father|is licenced|RTO|Fee Details).*/i, "").trim();
            }
        }
    }

    idMark1 = idMark1.replace(/^\(1\)\s*/i, "").replace(/\s*\(2\).*/i, "").trim();
    idMark2 = idMark2.replace(/^\(2\)\s*/i, "").trim();

    // B. ADDRESS EXTRACTION (With Primary Slicing + Clean Line Fallback)
    if (bloodGroup !== "-") {
        const bloodIndex = flattenedText.indexOf(bloodGroup) + bloodGroup.length;
        let absoluteAddressEndIdx = -1;
        const markStartMatch = flattenedText.slice(bloodIndex).match(/(A\s+SCAR|A\s+MOLE|AMOLE)/i);

        if (markStartMatch) {
            absoluteAddressEndIdx = flattenedText.indexOf(markStartMatch[0], bloodIndex);
        }

        if (absoluteAddressEndIdx > bloodIndex) {
            let block = flattenedText.slice(bloodIndex, absoluteAddressEndIdx).trim()
                                    .replace(/^\(1\)\s*/i, "")
                                    .replace(/Present Address|Permanent Address|Marks of Identification/gi, "")
                                    .trim();
            
            const mid = Math.floor(block.length / 2);
            let f = block.substring(0, mid).trim(), s = block.substring(mid).trim();
            addressText = (f === s || s.includes("TAMIL NADU") || s.includes("SALEM") || /\d{6}$/.test(s)) ? s : block;
        }
    }

    // Line-by-line address fallback if primary slice resulted in empty/invalid block
    if (addressText === "-" || addressText === "") {
        const cleanAddrLines = rawLines.filter(l => {
            const isNoise = /^(Husband Name|Father Name|RTO|LLR|Fee|Warning|This Licence|is licenced|\d{2}\/\d{2}\/\d{4})/i.test(l) ||
                            /^[A-Z]{2}\d{2}\s*\/[0-9\/]+/i.test(l);
            if (isNoise) return false;

            return /\d{1,4}\/\d{1,4}/.test(l) || 
                   /\b(?:PO|TK|DT|DIST|STREET|ROAD|NAGAR|EARIKADU|KARUMAPURAM|TIRUCHENGODE|SANKARI|NAMAKKAL)\b/i.test(l) || 
                   /\b\d{6}(?:,\d{6})?\b/.test(l);
        });

        if (cleanAddrLines.length > 0) {
            let combined = cleanAddrLines.join(" ").replace(/\s+/g, " ").trim();
            const mid = Math.floor(combined.length / 2);
            let firstHalf = combined.substring(0, mid).trim();
            let secondHalf = combined.substring(mid).trim();
            addressText = (firstHalf === secondHalf) ? firstHalf : combined;
        }
    }

    data["present_address"] = addressText;
    data["permanent_address"] = addressText;
    data["identification_mark_1"] = idMark1.replace(/\s+/g, " ");
    data["identification_mark_2"] = idMark2.replace(/\s+/g, " ");

    // 9. Vehicle Designation Class with Space Strip Regular Expression
    let vehicleMatch = flattenedText.match(/(?:description|following description)\s+([A-Z0-9,\s\-+/]+?)(?:\s\.\.\.\.|\s\*|_)/i);
    if (!vehicleMatch) {
        vehicleMatch = flattenedText.match(/\b(?:MCWOG|MCWG|LMV|TRANS)(?:\s*,\s*(?:MCWOG|MCWG|LMV|TRANS))*\b/i);
    }
    let extractedVehicle = vehicleMatch ? (vehicleMatch[1] || vehicleMatch[0]) : "-";
    data["vehicle_class"] = normalizeVehicleClass(extractedVehicle);

    // 11. Final Form Approved Datetime Target Mapping
    const approvedMatch = flattenedText.match(/Approved\s+Date:\s*([\d\s\-:\/A-Za-z]*)/i);
    let rawApprovedDate = "-";
    if (approvedMatch && approvedMatch[1].trim().length > 0) {
        let dateOnlyMatch = approvedMatch[1].match(/(\d{2,4}[-\/]\d{2}[-\/]\d{2,4})/);
        if (dateOnlyMatch) rawApprovedDate = dateOnlyMatch[1];
    }

    // 10. Validity Scale Ranges Tracking
    let rawIssueDate = "-";
    let rawExpiryDate = "-";

    const validityMatch = flattenedText.match(/valid\s+from\s+.*?(\d{2}[-\/]\d{2}[-\/]\d{4})\s+(?:To\s+)?(\d{2}[-\/]\d{2}[-\/]\d{4})/i);

    if (validityMatch) {
        rawIssueDate = validityMatch[1];
        rawExpiryDate = validityMatch[2];
    } else {
        const allDates = flattenedText.match(/(\d{2}[-\/]\d{2}[-\/]\d{4})/g);
        if (allDates) {
            const normDob = formatToStandardDate(data["date_of_birth"]);
            const normApp = formatToStandardDate(rawApprovedDate);
            
            const validCandidates = allDates.filter(d => {
                const std = formatToStandardDate(d);
                return std !== normDob && std !== normApp;
            });

            if (validCandidates.length >= 2) {
                rawIssueDate = validCandidates[0];
                rawExpiryDate = validCandidates[1];
            } else if (allDates.length >= 2) {
                rawIssueDate = allDates[allDates.length - 2];
                rawExpiryDate = allDates[allDates.length - 1];
            }
        }
    }
    data["issue_date"] = formatToStandardDate(rawIssueDate);
    data["expiry_date"] = formatToStandardDate(rawExpiryDate);

    if (rawApprovedDate === "-" && data["issue_date"] !== "-") {
        rawApprovedDate = data["issue_date"];
    }
    data["approved_date"] = formatToStandardDate(rawApprovedDate);

    // Dynamic external form interface UI synchronization callback
    if (typeof window.bindFormFields === "function") {
        window.bindFormFields(data);
    }

    // Auto-focus user cell phone element
    setTimeout(() => {
        const mobileField = document.getElementById("formMobile");
        if (mobileField) {
            mobileField.focus();
            mobileField.select();
        }
    }, 100);
}