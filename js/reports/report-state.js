/**
 * Global Application State
 */

export const reportState = {
    masterRegistryData: [],
    targetCompiledReportRows: [],
    activeHeaders: [],
    ribbonTallies: { active: 0, expired: 0, dlReady: 0, dlIssued: 0 },
    
    // Pagination Controls
    currentPage: 1,
    pageSize: 10,
    isPrintMode: false,

    // Column Sorting
    sortColumn: null,
    sortDirection: 'asc',

    setMasterData(data) {
        this.masterRegistryData = data || [];
    },

    resetTallies() {
        this.ribbonTallies = { active: 0, expired: 0, dlReady: 0, dlIssued: 0 };
    },

    resetPagination() {
        this.currentPage = 1;
    }
};