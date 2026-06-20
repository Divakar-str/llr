document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("extractBtn").addEventListener("click", executeTextParsingEngine);
    document.getElementById("clearBtn").addEventListener("click", () => document.getElementById("pdfText").value = "");
});

function cleanText(text) {
    return text.replace(/\s+/g, " ").replace(/"/g, "").trim();
}

// Global Date Normalization Function (Forces DD-MM-YYYY layout)
function formatToStandardDate(dateStr) {
    if (!dateStr || dateStr === "-") return "-";

    // Convert forward slashes cleanly into standard hyphens
    let normalized = dateStr.replace(/\//g, "-");

    // Extract purely the core date array elements, dropping trailing clock timestamps
    let match = normalized.match(/(\d{2,4})-(\d{2})-(\d{2,4})/);
    if (match) {
        let pieces = [match[1], match[2], match[3]];
        // If it extracted in YYYY-MM-DD reverse order
        if (pieces[0].length === 4) {
            return `${pieces[2].padStart(2, '0')}-${pieces[1].padStart(2, '0')}-${pieces[0]}`;
        }
        return `${pieces[0].padStart(2, '0')}-${pieces[1].padStart(2, '0')}-${pieces[2]}`;
    }
    return normalized.trim();
}

function executeTextParsingEngine() {
    const rawText = document.getElementById("pdfText").value;
    if (!rawText.trim()) {
        alert("Please paste the LLR text block first.");
        return;
    }

    const text = cleanText(rawText);
    const data = {};

    // 1. LLR Number
    const llrMatch = text.match(/([A-Z]{2}\d{2})\s*\/([0-9\/]+)/i);
    data["llr_number"] = llrMatch ? `${llrMatch[1].toUpperCase()} /${llrMatch[2]}` : "-";

    // 2. Application Number
    const appMatch = text.match(/[A-Z]{2}\d{2}Z\s*\/[0-9]+/i);
    data["fees_number"] = appMatch ? cleanText(appMatch[0]).replace(/\s+/g, "") : "-";

    // 3. Fee
    const feeMatch = text.match(/Rs\.?\s*([\d.]+)/i);
    data["fee"] = feeMatch ? feeMatch[1] : "-";

    // 4. Date of Birth
    const dobMatch = text.match(/(\d{2}[-\/]\d{2}[-\/]\d{4})/);
    data["date_of_birth"] = dobMatch ? formatToStandardDate(dobMatch[1]) : "-";

    // 5. Blood Group 
    const bloodMatch = text.match(/\b(A|B|AB|O|A1|A2|A1B|A2B)\s*([\+\-])/i);
    const bloodGroup = bloodMatch ? `${bloodMatch[1].toUpperCase()}${bloodMatch[2]}` : "-";
    data["blood_group"] = bloodGroup;

    // 6. Name & Relative Token Engine
    let name = "-", relativeName = "-";
    const coreBlockMatch = text.match(/\/\d{4}\s+([A-Z\s\.]+?)\s+\d{2}-\d{2}-\d{4}/i);
    if (coreBlockMatch) {
        let tokens = cleanText(coreBlockMatch[1]).split(" ");
        if (tokens.length >= 2) {
            if (tokens[tokens.length - 1] === tokens[tokens.length - 2]) {
                name = tokens.slice(0, tokens.length - 1).join(" "); relativeName = tokens[tokens.length - 1];
            } else if (tokens.length === 4 && tokens[1].length === 1 && tokens[3].length === 1) {
                name = tokens.slice(0, 2).join(" "); relativeName = tokens.slice(2).join(" ");
            } else {
                let half = Math.ceil(tokens.length / 2);
                if (tokens.length > 2 && tokens[1].length === 1 && tokens.length % 2 === 0) half = 2;
                name = tokens.slice(0, half).join(" "); relativeName = tokens.slice(half).join(" ");
            }
        } else { name = tokens[0]; }
    }
    data["name"] = name;
    data["relative_name"] = relativeName;
    data["relative_type"] = text.toUpperCase().includes("HUSBAND") ? "Husband" : "Father";

    // 7. Dynamic Address Engine 
    let addressText = "-", idMark1 = "-";
    if (bloodGroup !== "-") {
        const bloodIndex = text.indexOf(bloodGroup) + bloodGroup.length;
        let absoluteAddressEndIdx = -1;
        const markStartMatch = text.slice(bloodIndex).match(/(A\s+SCAR|A\s+MOLE)/i);

        if (markStartMatch) {
            absoluteAddressEndIdx = text.indexOf(markStartMatch[0], bloodIndex);
            const id2Index = text.indexOf("(2)");
            idMark1 = id2Index > absoluteAddressEndIdx ? cleanText(text.slice(absoluteAddressEndIdx, id2Index)) : cleanText(text.slice(absoluteAddressEndIdx, text.indexOf("is licenced")));
        } else {
            const pincodeMatch = text.slice(bloodIndex).match(/\b\d{6}\b/g);
            if (pincodeMatch && pincodeMatch.length >= 2) {
                absoluteAddressEndIdx = text.indexOf(pincodeMatch[1], text.indexOf(pincodeMatch[0], bloodIndex) + 6) + 6;
            } else if (pincodeMatch && pincodeMatch.length === 1) {
                absoluteAddressEndIdx = text.indexOf(pincodeMatch[0], bloodIndex) + 6;
            } else {
                const decMatch = text.slice(bloodIndex).match(/is licenc[e|e]d/i);
                if (decMatch) absoluteAddressEndIdx = text.indexOf(decMatch[0], bloodIndex);
            }
        }

        if (absoluteAddressEndIdx > bloodIndex) {
            let block = text.slice(bloodIndex, absoluteAddressEndIdx).trim().replace(/^\(1\)\s*/i).replace(/Present Address|Permanent Address|Marks of Identification/gi, "").trim();
            const mid = Math.floor(block.length / 2);
            let f = block.substring(0, mid).trim(), s = block.substring(mid).trim();
            addressText = (f === s || s.includes("TAMIL NADU") || s.includes("DT") || s.includes("TK") || /\d{6}$/.test(s)) ? cleanText(s) : cleanText(block);
        }
    }
    data["present_address"] = addressText;
    data["permanent_address"] = addressText;
    data["identification_mark_1"] = idMark1;

    // 8. Identification Mark 2
    const id2Match = text.match(/\(2\)\s*(.*?)\s*(?:is licenced|is licensed|throughout)/i);
    data["identification_mark_2"] = id2Match ? cleanText(id2Match[1]) : "-";

    // 9. Vehicle Class
    const vehicleMatch = text.match(/description\s+([A-Z0-9,\s\-+/]+?)(?:\s\.\.\.\.|\s\*|_)/i);
    data["vehicle_class"] = vehicleMatch ? cleanText(vehicleMatch[1]).replace(/[\s\.,]+$/, "") : "-";

    // 10. Validity Dates
    let rawIssueDate = "-";
    let rawExpiryDate = "-";
    const validityMatch = text.match(/(\d{2}[-\/]\d{2}[-\/]\d{4})\s*To\s*(\d{2}[-\/]\d{2}[-\/]\d{4})/i);

    if (validityMatch) {
        rawIssueDate = validityMatch[1];
        rawExpiryDate = validityMatch[2];
    } else {
        const allDates = text.match(/(\d{2}[-\/]\d{2}[-\/]\d{4})/g);
        if (allDates && allDates.length >= 2) {
            if (allDates.length >= 3) {
                rawIssueDate = allDates[1];
                rawExpiryDate = allDates[2];
            } else {
                rawIssueDate = allDates[0];
                rawExpiryDate = allDates[1];
            }
        }
    }
    data["issue_date"] = formatToStandardDate(rawIssueDate);
    data["expiry_date"] = formatToStandardDate(rawExpiryDate);

    // 11. Approved Date (FIXED FOR TIMESTAMP RANGE & CHARACTERS)
    const approvedMatch = text.match(/LLR\s+Approved\s+Date:\s*([\d\s\-:\/A-Za-z]*)/i);
    let rawApprovedDate = "-";

    if (approvedMatch && approvedMatch[1].trim().length > 0) {
        let extractedStamp = approvedMatch[1].trim();
        let dateOnlyMatch = extractedStamp.match(/(\d{2,4}[-\/]\d{2}[-\/]\d{2,4})/);
        if (dateOnlyMatch) {
            let coreDate = dateOnlyMatch[1].replace(/\//g, "-"); 
            let pieces = coreDate.split("-");

            if (pieces[0].length === 4) {
                rawApprovedDate = `${pieces[2].padStart(2, '0')}-${pieces[1].padStart(2, '0')}-${pieces[0]}`;
            } else {
                rawApprovedDate = `${pieces[0].padStart(2, '0')}-${pieces[1].padStart(2, '0')}-${pieces[2]}`;
            }
        }
    }
    data["approved_date"] = rawApprovedDate;

    // Dynamic external form binding pass
    if (typeof window.bindFormFields === "function") {
        window.bindFormFields(data);
    }

    // DYNAMIC AUTO-FOCUS CONSOLE TRIGGER
    setTimeout(() => {
        const mobileInput = document.getElementById("editMobile") || 
                            document.getElementById("addMobile") || 
                            document.querySelector("input[type='tel']");
        if (mobileInput) {
            mobileInput.focus();
            mobileInput.select(); // Selects any extracted numbers so user can quickly type over if needed
        }
    }, 80);
}