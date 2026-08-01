/**
 * Local Date Parsing and Range Utilities
 */

export function parseCustomDate(dateStr) {
    if (!dateStr || dateStr === "-" || String(dateStr).trim() === "") return null;
    const pieces = String(dateStr).trim().split("-");
    if (pieces.length !== 3) return null;

    const day = parseInt(pieces[0], 10);
    const month = parseInt(pieces[1], 10) - 1;
    const year = parseInt(pieces[2], 10);

    if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
    return new Date(year, month, day);
}

export function getDifferenceInDays(startDate, endDate) {
    if (!startDate || !endDate) return 0;
    return Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
}