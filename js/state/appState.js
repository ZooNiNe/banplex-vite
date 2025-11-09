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
    fileStorage: {
        list: [],
        filters: {
            search: '',
            gender: 'all',
            jenjang: 'all',
        },
        isLoading: false,
        view: {
            perPage: 20,
            currentPage: 1,
        },
        selection: {
            ids: new Set(),
        },
        editingRecord: null,
    },
    hrdApplicants: {
        list: [],
        filters: {
            search: '',
            gender: 'all',
        },
        isLoading: false,
        view: {
            perPage: 20,
            currentPage: 1,
        },
        selection: {
            ids: new Set(),
        },
        editingRecord: null,
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
    setUser(userData = null) {
        if (userData && typeof userData.role === 'string') {
            userData.role = userData.role.toLowerCase();
        }
        this.currentUser = userData;
        return this.currentUser;
    },
    getUser() {
        return this.currentUser;
    },
    clearUser() {
        this.setUser(null);
        this.userRole = 'Guest';
        this.userStatus = null;
        this.justLoggedIn = false;
        try { sessionStorage.removeItem('lastActivePage'); } catch (_) {}
        try { localStorage.removeItem('lastActivePage'); } catch (_) {}
        this.activePage = 'dashboard';
    },
    isPrivileged() {
        const user = this.getUser();
        if (!user) return false;
        if (user.email && user.email.toLowerCase() === 'dq060412@gmail.com') return true;
        return (user.role || '').toLowerCase() === 'admin';
    },
    isAdministrasi() {
        const user = this.getUser();
        return !!(user && (user.role || '').toLowerCase() === 'administrasi');
    },
    isLapangan() {
        const user = this.getUser();
        return !!(user && (user.role || '').toLowerCase() === 'lapangan');
    },
    isViewerRole() {
        const user = this.getUser();
        return !!(user && (user.role || '').toLowerCase() === 'viewer');
    },
    canWriteAdministrasi() {
        return this.isPrivileged() || this.isAdministrasi();
    },
    canWriteLapangan() {
        return this.isPrivileged() || this.isLapangan();
    },
    canRead() {
        return !!this.getUser();
    },
};

if (typeof window !== 'undefined') {
    window.appState = appState;
}
