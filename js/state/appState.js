export const appState = {
    currentUser: null,
    userRole: 'Guest',
    userStatus: null,
    justLoggedIn: false,
    pendingUsersCount: 0,
    activePage: localStorage.getItem('lastActivePage') || 'dashboard',
    activeSubPage: new Map(),
    isOnline: navigator.onLine,
    isSyncing: false,
    isSilentSync: false, // PERBAIKAN 2: Tambahkan flag silent sync
    comments: [],
    projects: [],
    clients: [],
    fundingCreditors: [],
    operationalCategories: [],
    materialCategories: [],
    otherCategories: [],
    suppliers: [],
    workers: [],
    professions: [],
    incomes: [],
    fundingSources: [],
    expenses: [],
    bills: [],
    attendance: new Map(),
    users: [],
    materials: [],
    stockTransactions: [],
    attendanceRecords: [],
    staff: [],
    tagihan: {
        currentList: [],
    },
    pemasukan: {
        currentList: [],
    },
    jurnal: {
        currentList: [],
    },
    recycleBin: {
        currentList: [],
    },
    selectionMode: {
        active: false,
        selectedIds: new Set(),
        pageContext: '',
        lastSelectedId: null,
    },
    manualAttendanceSelectionMap: new Map(),
    pendingAttendance: new Map(),
    billsFilter: {
        searchTerm: '',
        projectId: 'all',
        supplierId: 'all',
        sortBy: 'dueDate',
        sortDirection: 'desc',
        category: 'all',
        status: 'all',
        dateStart: '',
        dateEnd: ''
    },
    pagination: {
        bills_tagihan: { isLoading: false, hasMore: true, page: 0 },
        bills_lunas: { isLoading: false, hasMore: true, page: 0 },
        bills_surat_jalan: { isLoading: false, hasMore: true, page: 0 },
        pemasukan_termin: { isLoading: false, hasMore: true, page: 0 },
        pemasukan_pinjaman: { isLoading: false, hasMore: true, page: 0 },
        jurnalHarian: { isLoading: false, hasMore: true, page: 0 },
        jurnalPerPekerja: { isLoading: false, hasMore: true, page: 0 },
        stokDaftar: { isLoading: false, hasMore: true, page: 0 },
        stokRiwayat: { isLoading: false, hasMore: true, page: 0 },
        Komentar: { isLoading: false, hasMore: true, page: 0 },
        logAktivitas: { isLoading: false, hasMore: true, page: 0 },
        recycleBin: { isLoading: false, hasMore: true, page: 0 }
    },
    dashboardTotals: {
        labaBersih: 0,
        totalUnpaid: 0,
    },
    pdfSettings: null,
    simulasiState: {
        selectedPayments: new Map()
    },
    syncProgress: {
        active: false,
        total: 0,
        completed: 0,
        percentage: 0
    },
    detailPaneHistory: [],
    activeListeners: new Map(),
    formStateCache: null,
    recycledItemsCache: null,
    rooms: [],
    masterDataLastRefreshed: {},
    defaultAttendanceProjectId: (function(){ try { return localStorage.getItem('attendance.defaultProjectId') || ''; } catch(_) { return ''; } })(),
    defaultAttendanceDate: (function(){
        try {
            return localStorage.getItem('attendance.defaultDate') || new Date().toISOString().slice(0,10);
        } catch(_) { return new Date().toISOString().slice(0,10); }
    })(),
    manualAttendanceSelectedProjectId: (function(){
        try { return localStorage.getItem('attendance.manualSelectedProjectId') || ''; } catch(_) { return ''; }
    })(),
    absensi: {
        manualWorkerListCache: null,
        manualListNeedsUpdate: true,
    },
    manualRoleSelectionByWorker: {},
    visitedPages: new Set(),
};
