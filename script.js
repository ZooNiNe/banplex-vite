/* global Chart, html2canvas, jspdf, Dexie */
// @ts-check

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-app.js";
import { getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";
import { getFirestore, collection, doc, getDoc, setDoc, updateDoc, serverTimestamp, onSnapshot, query, getDocs, addDoc, orderBy, deleteDoc, where, runTransaction, writeBatch, increment, Timestamp, initializeFirestore, persistentLocalCache, limit, startAfter } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";
import { getStorage, ref, uploadBytesResumable, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-storage.js";
import { logoData } from './logo-data.js';
  
async function triggerNotification(message, userName, type) {
    if (!navigator.onLine) return;

    // Cek kondisi lingkungan development
    const isLocalDev = (location.hostname === 'localhost' || location.hostname === '127.0.0.1');
    const isGitHubPages = /\.github\.io$/i.test(location.hostname);
    
    // Tentukan endpoint
    const endpoint = (typeof window !== 'undefined' && window.NOTIFY_ENDPOINT)
        ? window.NOTIFY_ENDPOINT
        : ((isGitHubPages || isLocalDev) ? null : '/api/notify');

    if (!endpoint) {
        // Hening di local dev atau GitHub pages tanpa endpoint eksplisit
        return;
    }

    try {
        await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message, userName, type }),
        });
    } catch (error) {
        // Tetap catat sebagai warning jika fetch gagal karena alasan lain (mis. server down)
        console.warn('Failed to trigger notification:', error);
    }
}

function listenForNotifications() {
    try {
        const notificationsCol = collection(db, 'notifications');
        const q = query(notificationsCol, where("createdAt", ">", new Date()), orderBy("createdAt", "desc"));

        onSnapshot(q, (snapshot) => {
            snapshot.docChanges().forEach((change) => {
                if (change.type === "added") {
                    const notification = change.doc.data();
                    if (appState?.currentUser?.displayName && notification.userName !== appState.currentUser.displayName) {
                        toast('info', notification.message, 5000);
                    }
                }
            });
        }, (error) => {
            console.error("Failed to listen for notifications:", error);
        });
    } catch (e) {
        console.error('Failed to setup notifications listener:', e);
    }
}

// -----------------------------------------------------------------------------
// BAGIAN 1: KONFIGURASI, STATE, & VARIABEL GLOBAL
// -----------------------------------------------------------------------------

const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID
};
const TEAM_ID = 'main';
const OWNER_EMAIL = 'dq060412@gmail.com';

const ALL_NAV_LINKS = [
    { id: 'dashboard', icon: 'dashboard', label: 'Dashboard', roles: ['Owner', 'Editor', 'Viewer'] },
    { id: 'pemasukan', icon: 'account_balance_wallet', label: 'Pemasukan', roles: ['Owner'] },
    { id: 'pengeluaran', icon: 'post_add', label: 'Pengeluaran', roles: ['Owner', 'Editor'] },
    { id: 'absensi', icon: 'person_check', label: 'Absensi', roles: ['Owner', 'Editor'] },
    { id: 'jurnal', icon: 'summarize', label: 'Jurnal', roles: ['Owner', 'Editor', 'Viewer'] },
    { id: 'stok', icon: 'inventory_2', label: 'Stok', roles: ['Owner', 'Editor', 'Viewer'] },
    { id: 'tagihan', icon: 'receipt_long', label: 'Tagihan', roles: ['Owner', 'Editor', 'Viewer'] },
    { id: 'komentar', icon: 'chat', label: 'Komentar', roles: ['Owner', 'Editor', 'Viewer'] }, // <-- BARIS BARU
    { id: 'laporan', icon: 'monitoring', label: 'Laporan', roles: ['Owner', 'Viewer'] },
    { id: 'simulasi', icon: 'payments', label: 'Simulasi Bayar', roles: ['Owner'] },
    { id: 'pengaturan', icon: 'settings', label: 'Pengaturan', roles: ['Owner', 'Editor', 'Viewer'] },
];

const BOTTOM_NAV_BY_ROLE = {
    Owner: ['dashboard', 'jurnal', 'tagihan', 'pemasukan', 'pengaturan'],
    Editor: ['dashboard', 'jurnal', 'tagihan', 'pengaturan'],
    Viewer: ['dashboard', 'jurnal', 'tagihan', 'laporan', 'pengaturan']
};

// Auto-rebase settings for sync conflicts
const AUTO_REBASE_TABLES = new Set(['expenses', 'bills', 'incomes', 'funding_sources']);

const appState = {
    currentUser: null,
    userRole: 'Guest',
    userStatus: null,
    justLoggedIn: false,
    pendingUsersCount: 0,
    activePage: localStorage.getItem('lastActivePage') || 'dashboard',
    activeSubPage: new Map(),
    isOnline: navigator.onLine,
    isSyncing: false,
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
    selectionMode: {
        active: false,
        selectedIds: new Set(),
        pageContext: ''
    },
    billsFilter: {
        searchTerm: '',
        projectId: 'all',
        supplierId: 'all',
        sortBy: 'dueDate',
        sortDirection: 'desc',
        category: 'all'
    },
    pagination: {
        bills: {
            lastVisible: null,
            isLoading: false,
            hasMore: true
        }
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
};

const localDB = new Dexie('BanPlexDevLocalDB');

let db;
let membersCol, projectsCol, fundingCreditorsCol, opCatsCol, matCatsCol, otherCatsCol,
    suppliersCol, workersCol, professionsCol, attendanceRecordsCol, incomesCol,
    fundingSourcesCol, expensesCol, billsCol, logsCol, materialsCol,
    stockTransactionsCol, staffCol, commentsCol, settingsDocRef;

let interactiveReportChart = null;
let currentFeedbackModal = null;
let pointerDownTarget = null;
let pointerStartX = 0;
let pointerStartY = 0;
let _suppressClickUntil = 0; // Prevent click from firing after handled pointerup

// -----------------------------------------------------------------------------
// BAGIAN 2: FUNGSI-FUNGSI APLIKASI
// -----------------------------------------------------------------------------

function showUpdateNotification(reg) {
    if (document.getElementById('update-notification')) {
        return;
    }
    const notificationHTML = `
      <div class="update-card">
        <div class="update-info">
          <h4>Aplikasi telah diperbarui</h4>
          <p>Mulai ulang untuk versi terbaru.</p>
        </div>
        <button class="btn" id="restart-app-btn">Mulai Ulang</button>
      </div>
    `;
    const notificationElement = document.createElement('div');
    notificationElement.id = 'update-notification';
    notificationElement.innerHTML = notificationHTML;
    document.body.appendChild(notificationElement);

    const restartBtn = document.getElementById('restart-app-btn');
    if (restartBtn && reg && reg.waiting) {
        restartBtn.addEventListener('click', () => {
            restartBtn.disabled = true;
            restartBtn.textContent = 'Memuat ulang...';
            reg.waiting.postMessage({ action: 'skipWaiting' });
        });
    }
    setTimeout(() => {
        notificationElement.classList.add('show');
    }, 100);
}

function getLastSyncTimestamp() {
    const stored = localStorage.getItem('lastSyncTimestamp');
    return stored ? new Date(parseInt(stored)) : new Date(0);
}

function setLastSyncTimestamp() {
    localStorage.setItem('lastSyncTimestamp', Date.now().toString());
}

// -----------------------------------------------------------------------------
// BAGIAN 3: FUNGSI UTAMA & INISIALISASI
// -----------------------------------------------------------------------------

async function main() {
    localDB.version(15).stores({
        expenses: '&id, projectId, date, type, status, isDeleted, attachmentNeedsSync, syncState, category',
        bills: '&id, expenseId, status, dueDate, type, isDeleted, syncState',
        incomes: '&id, projectId, date, isDeleted, syncState',
        funding_sources: '&id, creditorId, status, isDeleted, syncState',
        attendance_records: '&id, [workerId+isDeleted], workerId, date, isPaid, isDeleted, syncState',
        stock_transactions: '&id, materialId, date, type, isDeleted, syncState',
        comments: '&id, parentId, parentType, createdAt, isDeleted, syncState, [parentId+parentType]',
        files: 'id',
        projects: '&id, projectName',
        suppliers: '&id, supplierName',
        workers: '&id, workerName',
        materials: '&id, materialName',
        staff: '&id, staffName',
        professions: '&id, professionName',
        operational_categories: '&id, categoryName',
        material_categories: '&id, categoryName',
        other_categories: '&id, categoryName',
        funding_creditors: '&id, creditorId',
        pending_payments: '++id, billId, workerId, date, [billId+workerId]',
        pending_logs: '++id, action, createdAt',
        pending_conflicts: '++id, table, docId'
    }).upgrade(tx => {
        console.log("Menjalankan migrasi database ke versi 14...");
        return tx.table('expenses').toCollection().modify(expense => {
            if (expense.category === undefined) {
                expense.category = 'lainnya';
            }
        });
    });

    const app = initializeApp(firebaseConfig);
    const auth = getAuth(app);
    const storage = getStorage(app);

    try {
        await setPersistence(auth, browserLocalPersistence);
    } catch (e) {
        console.warn("Persistence failed", e.code);
    }

    try {
        db = initializeFirestore(app, {
            cache: persistentLocalCache({
                tabManager: 'MEMORY_CACHE_TAB_MANAGER'
            })
        });
    } catch (e) {
        db = getFirestore(app);
    }

    membersCol = collection(db, 'teams', TEAM_ID, 'members');
    projectsCol = collection(db, 'teams', TEAM_ID, 'projects');
    fundingCreditorsCol = collection(db, 'teams', TEAM_ID, 'funding_creditors');
    opCatsCol = collection(db, 'teams', TEAM_ID, 'operational_categories');
    matCatsCol = collection(db, 'teams', TEAM_ID, 'material_categories');
    otherCatsCol = collection(db, 'teams', TEAM_ID, 'other_categories');
    suppliersCol = collection(db, 'teams', TEAM_ID, 'suppliers');
    workersCol = collection(db, 'teams', TEAM_ID, 'workers');
    professionsCol = collection(db, 'teams', TEAM_ID, 'professions');
    attendanceRecordsCol = collection(db, 'teams', TEAM_ID, 'attendance_records');
    incomesCol = collection(db, 'teams', TEAM_ID, 'incomes');
    fundingSourcesCol = collection(db, 'teams', TEAM_ID, 'funding_sources');
    expensesCol = collection(db, 'teams', TEAM_ID, 'expenses');
    billsCol = collection(db, 'teams', TEAM_ID, 'bills');
    logsCol = collection(db, 'teams', TEAM_ID, 'logs');
    materialsCol = collection(db, 'teams', TEAM_ID, 'materials');
    stockTransactionsCol = collection(db, 'teams', TEAM_ID, 'stock_transactions');
    staffCol = collection(db, 'teams', TEAM_ID, 'staff');
    commentsCol = collection(db, 'teams', TEAM_ID, 'comments');
    settingsDocRef = doc(db, 'teams', TEAM_ID, 'settings', 'pdf');
            
    // =======================================================
  //          SEKSI 2: UTILITAS, MODAL & AUTENTIKASI
  // =======================================================
  const $ = (s, context = document) => context.querySelector(s);
  const $$ = (s, context = document) => Array.from(context.querySelectorAll(s));
  const fmtIDR = (n) => new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0
  }).format(Number(n || 0));
const _terbilang = (n) => {
    const bilangan = ["", "satu", "dua", "tiga", "empat", "lima", "enam", "tujuh", "delapan", "sembilan", "sepuluh", "sebelas"];
    if (n < 12) return bilangan[n];
    if (n < 20) return _terbilang(n - 10) + " belas";
    if (n < 100) return _terbilang(Math.floor(n / 10)) + " puluh " + _terbilang(n % 10);
    if (n < 200) return "seratus " + _terbilang(n - 100);
    if (n < 1000) return _terbilang(Math.floor(n / 100)) + " ratus " + _terbilang(n % 100);
    if (n < 2000) return "seribu " + _terbilang(n - 1000);
    if (n < 1000000) return _terbilang(Math.floor(n / 1000)) + " ribu " + _terbilang(n % 1000);
    if (n < 1000000000) return _terbilang(Math.floor(n / 1000000)) + " juta " + _terbilang(n % 1000000);
    return "";
};

function createMasterDataSelect(id, label, options, selectedValue = '', masterType = null) {
    const selectedOption = options.find(opt => opt.value === selectedValue);
    const selectedText = selectedOption ? selectedOption.text : 'Pilih...';
    const finalSelectedValue = selectedOption ? selectedValue : '';
    const showMasterButton = masterType && masterType !== 'projects' && !isViewer();

    return `
        <div class="form-group">
            <label>${label}</label>
            <div class="master-data-select">
                <div class="custom-select-wrapper" data-master-type="${masterType || ''}">
                    <input type="hidden" id="${id}" name="${id}" value="${finalSelectedValue}">
                    <button type="button" class="custom-select-trigger" ${isViewer() ? 'disabled' : ''}>
                        <span>${selectedText}</span>
                        <span class="material-symbols-outlined">arrow_drop_down</span>
                    </button>
                    <div class="custom-select-options">
                        <div class="custom-select-search-wrapper">
                            <input type="search" class="custom-select-search" placeholder="Cari..." autocomplete="off">
                        </div>
                        <div class="custom-select-options-list">
                        ${options.map(opt => `
                            <div class="custom-select-option" data-value="${opt.value}">${opt.text}</div>
                        `).join('')}
                        </div>
                    </div>
                </div>
                ${showMasterButton ? `<button type="button" class="btn-icon master-data-trigger" data-action="manage-master" data-type="${masterType}"><span class="material-symbols-outlined">database</span></button>` : ''}
            </div>
        </div>
    `;
};

const centerTextPlugin = {
      id: 'centerText',
      afterDraw: function(chart) {
          if (chart.config.type !== 'doughnut') return;
          
          const ctx = chart.ctx;
          const chartArea = chart.chartArea;
          const centerX = (chartArea.left + chartArea.right) / 2;
          const centerY = (chartArea.top + chartArea.bottom) / 2;
          
          ctx.save();
          
          let labelToDraw = "Total";
          let textToDraw = "";
          
          const total = chart.data.datasets[0].data.reduce((a, b) => a + b, 0);
          textToDraw = fmtIDR(total);
  
          // [LOGIKA INTERAKTIF] Cek apakah ada bagian yang sedang aktif (disentuh/hover)
          const activeElements = chart.getActiveElements();
          if (activeElements.length > 0) {
              const activeIndex = activeElements[0].index;
              const activeData = chart.data.datasets[0].data[activeIndex];
              const activeLabel = chart.data.labels[activeIndex];
              
              labelToDraw = activeLabel;
              textToDraw = fmtIDR(activeData);
          }
  
          // Tampilkan label (mis. "Material")
          ctx.font = '600 0.8rem Inter';
          ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--text-dim').trim();
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(labelToDraw, centerX, centerY - 10);
  
          // Tampilkan jumlah nominal (mis. "Rp 71.688.000")
          ctx.font = '700 1.1rem Inter';
          ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--text').trim();
          ctx.fillText(textToDraw, centerX, centerY + 12);
  
          ctx.restore();
      }
  };
  Chart.register(centerTextPlugin);

  function _createToolbarHTML(config) {
    const { idPrefix, searchPlaceholder, showFilter = true, showSort = true } = config;

    const filterBtnHTML = showFilter ? `
        <button class="btn-icon" id="${idPrefix}-filter-btn" title="Filter">
            <span class="material-symbols-outlined">filter_list</span>
        </button>` : '';

    const sortBtnHTML = showSort ? `
        <button class="btn-icon" id="${idPrefix}-sort-btn" title="Urutkan">
            <span class="material-symbols-outlined">sort</span>
        </button>` : '';

    return `
        <div class="toolbar sticky-toolbar" id="${idPrefix}-toolbar">
            <div class="search">
                <span class="material-symbols-outlined">search</span>
                <input type="search" id="${idPrefix}-search-input" placeholder="${searchPlaceholder}">
            </div>
            ${filterBtnHTML}
            ${sortBtnHTML}
        </div>
    `;
}

function _createPaymentHistoryHTML(payments, billId) {
    if (!payments || payments.length === 0) {
        return '';
    }

    const sorted = [...payments].sort((a, b) => _getJSDate(b.date) - _getJSDate(a.date));
    const latest = sorted[0];
    const totalPaid = sorted.reduce((sum, p) => sum + (p.amount || 0), 0);

    const latestDateShort = latest?.date 
        ? _getJSDate(latest.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) 
        : '-';

    return `
      <div class="payment-history-section">
          <div class="payment-history-summary card card-pad">
              <div class="summary-info">
                  <span>${sorted.length} Pembayaran • Total <strong>${fmtIDR(totalPaid)}</strong></span>
                  <small style="color: var(--text-dim);">
                      Terakhir: ${fmtIDR(latest?.amount || 0)} pada ${latestDateShort}
                  </small>
              </div>
          </div>
      </div>
    `;
}
function _createPaymentHistoryListHTML(payments) {
    if (!payments || payments.length === 0) {
        return _getEmptyStateHTML({ icon: 'receipt', title: 'Belum Ada Riwayat', desc: 'Belum ada pembayaran yang tercatat untuk tagihan ini.' });
    }

    const sorted = [...payments].sort((a, b) => _getJSDate(b.date) - _getJSDate(a.date));

    const historyItems = sorted.map(p => {
        const dt = p.date ? _getJSDate(p.date) : null;
        const paymentDate = dt ? dt.toLocaleString('id-ID', { 
            day: 'numeric', 
            month: 'long', 
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        }) : 'Tanggal tidak valid';
        const recipientName = p.workerName || 'Pembayaran Umum';

        return `
            <div class="payment-history-item">
                <div class="payment-details">
                    <span class="payment-date">${paymentDate}</span>
                    <span class="payment-recipient">${recipientName}</span>
                </div>
                <strong class="payment-amount">${fmtIDR(p.amount)}</strong>
            </div>`;
    }).join('');

    return `<div class="detail-list custom-payment-history">${historyItems}</div>`;
}

async function handleOpenPaymentHistoryModal(dataset) {
    const { billId } = dataset;
    if (!billId) return;

    const bill = appState.bills.find(b => b.id === billId);
    if (!bill) {
        toast('error', 'Data tagihan tidak ditemukan.');
        return;
    }

    toast('syncing', 'Memuat riwayat pembayaran...');

    try {
        let payments = [];
        if (navigator.onLine) {
            const paymentsSnap = await getDocs(query(collection(db, 'teams', TEAM_ID, 'bills', billId, 'payments'), orderBy("date", "desc")));
            payments.push(...paymentsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        }
        const queued = await localDB.pending_payments.where('billId').equals(billId).toArray();
        payments.push(...queued.map(p => ({ ...p, isOfflineQueued: true })));

        const contentHTML = _createPaymentHistoryListHTML(payments);
        const footerHTML = `<button class="btn btn-secondary" data-close-modal>Tutup</button>`;

        hideToast();
        createModal('dataDetail', {
            title: `Riwayat Pembayaran`,
            content: contentHTML,
            footer: footerHTML
        });

    } catch (error) {
        hideToast();
        toast('error', 'Gagal memuat riwayat pembayaran.');
        console.error("Gagal memuat riwayat pembayaran:", error);
    }
}
function handleServerCleanUp() {
    createModal('confirmUserAction', {
        message: 'PERINGATAN: Aksi ini akan memindai data di server dan secara PERMANEN menghapus Tagihan Yatim serta mereset status Absensi Lunas yang tidak memiliki tagihan. Aksi ini tidak dapat dibatalkan. Lanjutkan?',
        onConfirm: () => _runServerDataIntegrityCheck()
    });
}

// GANTI SELURUH FUNGSI INI DI script.js
async function handleOpenItemActionsModal(dataset = {}) {
    const { id, type, expenseId, date } = dataset;
    if (!id && !date) return;

    const viewer = isViewer();
    let actions = [];

    // --- LOGIKA DINAMIS UNTUK MEMBANGUN DAFTAR AKSI ---

    if (type === 'bill' || (expenseId != null)) {
        const bill = id ? (appState.bills.find(b => b.id === id) || {}) : {};
        const isPaid = bill.status === 'paid';
        const expense = appState.expenses.find(e => e.id === (bill.expenseId || expenseId));

        // Aksi Default untuk semua tagihan
        actions.push({ label: 'Lihat Detail', action: 'open-bill-detail', icon: 'visibility', id, expenseId });
        
        // Aksi Pembayaran
        if (!viewer && !isPaid && id) {
            const actionLabel = bill.type === 'gaji' ? 'Bayar Gaji' : 'Bayar/Cicil Tagihan';
            actions.push({ label: actionLabel, action: 'pay-bill', icon: 'payment', id });
        }

        // Aksi Riwayat Pembayaran (jika sudah ada pembayaran)
        if (bill.paidAmount > 0 || isPaid) {
            actions.push({ label: 'Riwayat Pembayaran', action: 'open-payment-history-modal', icon: 'history', billId: id });
        }
        
        // Aksi khusus untuk Tipe Material
        if (expense && expense.type === 'material' && expense.items && expense.items.length > 0) {
            actions.push({ label: 'Rincian Faktur', action: 'view-invoice-items', icon: 'list_alt', id: expense.id });
        }

        // Aksi Lihat Lampiran
        if (expense && (expense.attachmentUrl || expense.localAttachmentId || expense.invoiceUrl || expense.deliveryOrderUrl)) {
            actions.push({ label: 'Lihat Lampiran', action: 'view-attachment-detail', icon: 'attachment', expenseId: expense.id });
        }
        
        // Aksi Edit & Hapus
        if (!viewer) {
            if (bill.type !== 'gaji') {
                actions.push({ label: 'Edit Data', action: 'edit-item', icon: 'edit', id, type: 'bill' });
            }
            actions.push({ label: 'Hapus', action: 'delete-item', icon: 'delete', id, type: 'bill' });
        }

    } else if (type === 'termin' || type === 'pinjaman' || type === 'loan') {
        actions.push({ label: 'Lihat Detail', action: 'open-detail', icon: 'visibility', id, type });
        if (!viewer && (type === 'pinjaman' || type === 'loan') && id) {
            actions.push({ label: 'Bayar Cicilan', action: 'pay-loan', icon: 'payment', id, type: 'pinjaman' });
        }
        if (!viewer && id) {
            actions.push({ label: 'Edit Data', action: 'edit-item', icon: 'edit', id, type });
            actions.push({ label: 'Hapus', action: 'delete-item', icon: 'delete', id, type });
        }
    } else if (date) {
        actions.push({ label: 'Lihat Jurnal Harian', action: 'view-jurnal-harian', icon: 'visibility', date });
    }

    // --- RENDER MODAL DENGAN AKSI YANG SUDAH DIKUMPULKAN ---
    const content = `
        <div class="dense-list-container">
            ${actions.map(a => `
                <button class="dense-list-item btn btn-ghost item-action-btn" data-close-modal
                    data-action="${a.action}"
                    ${a.id ? `data-id="${a.id}"` : ''}
                    ${a.type ? `data-type="${a.type}"` : ''}
                    ${a.expenseId ? `data-expense-id="${a.expenseId}"` : ''}
                    ${a.date ? `data-date="${a.date}"` : ''}
                    ${a.billId ? `data-bill-id="${a.billId}"` : ''}>
                    <div class="item-main-content">
                        <div class="action-item-primary">
                            <span class="material-symbols-outlined">${a.icon}</span>
                            <strong class="item-title">${a.label}</strong>
                        </div>
                    </div>
                </button>
            `).join('')}
        </div>`;

    const modalEl = createModal('actionsPopup', {
        title: 'Pilih Aksi',
        content
    });

    modalEl?.querySelectorAll('.item-action-btn').forEach(btn => {
        btn.addEventListener('click', (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            const action = btn.dataset.action;
            try {
                if (action === 'open-bill-detail') {
                    handleOpenBillDetail(btn.dataset.id || null, btn.dataset.expenseId || null);
                } else if (action === 'open-detail') {
                    handleOpenPemasukanDetail({ dataset: { id: btn.dataset.id, type: btn.dataset.type } });
                } else if (action === 'pay-bill') {
                    handlePayBillModal(btn.dataset.id);
                } else if (action === 'pay-loan') {
                    handlePaymentModal(btn.dataset.id, 'pinjaman');
                } else if (action === 'edit-item') {
                    handleEditItem(btn.dataset.id, btn.dataset.type);
                } else if (action === 'delete-item') {
                    handleDeleteItem(btn.dataset.id, btn.dataset.type);
                } else if (action === 'view-invoice-items') {
                    handleViewInvoiceItems({ dataset: { id: btn.dataset.id } });
                } else if (action === 'open-payment-history-modal') {
                    handleOpenPaymentHistoryModal(btn.dataset);
                } else if (action === 'view-attachment-detail') {
                    handleViewAttachmentModal(btn.dataset);
                }
            } catch(_) {}
            const modal = btn.closest('.modal-bg');
            if (modal) closeModal(modal);
        }, { once: true });
    });
}

async function handleRestoreOrphanLoans() {
    toast('syncing', 'Memindai dan memulihkan pinjaman...');
    try {
        // 1) Ambil daftar kreditur lokal sebagai referensi
        const creditors = await localDB.funding_creditors.toArray();
        const validCreditorIds = new Set(creditors.map(c => c.id));

        // 2) Kandidat: funding_sources yang ditandai terhapus (soft delete) namun memiliki creditorId
        const softDeletedLoans = await localDB.funding_sources.where('isDeleted').equals(1).toArray();

        // 3) Tentukan mana yang bisa dipulihkan berdasarkan referensi kreditur
        let toRestore = softDeletedLoans.filter(l => l.creditorId && validCreditorIds.has(l.creditorId));

        // 4) Jika online, validasi tambahan terhadap server untuk kasus di mana kreditur belum tersalin ke lokal
        if (navigator.onLine) {
            for (const loan of softDeletedLoans) {
                if (loan.creditorId && !validCreditorIds.has(loan.creditorId)) {
                    try {
                        const snap = await getDoc(doc(fundingCreditorsCol, loan.creditorId));
                        if (snap.exists()) {
                            toRestore.push(loan);
                        }
                    } catch (_) {
                        // Abaikan kegagalan jaringan; hanya pulihkan jika sudah terbukti ada di lokal/server
                    }
                }
            }
        }

        // Hilangkan duplikat jika ada
        const map = new Map();
        toRestore.forEach(l => map.set(l.id, l));
        toRestore = Array.from(map.values());

        if (toRestore.length === 0) {
            hideToast();
            return toast('info', 'Tidak ada pinjaman yang perlu dipulihkan.');
        }

        // 5) Pulihkan di Dexie dan tandai untuk sinkronisasi
        const ids = toRestore.map(l => l.id);
        await localDB.funding_sources.where('id').anyOf(ids).modify({
            isDeleted: 0,
            syncState: 'pending_update',
            updatedAt: new Date()
        });

        // 6) Segarkan state & UI
        await loadAllLocalDataToState();
        _calculateAndCacheDashboardTotals();
        if (appState.activePage === 'pemasukan') {
            try { await renderPageContent(); } catch (_) {}
        }

        hideToast();
        await toast('success', `${toRestore.length} pinjaman berhasil dipulihkan.`);

        // 7) Sinkronkan ke server bila online
        if (navigator.onLine) {
            await syncToServer({ silent: true });
        }
    } catch (error) {
        hideToast();
        console.error('Gagal memulihkan pinjaman yatim:', error);
        toast('error', 'Gagal memulihkan pinjaman.');
    }
}

// Tawarkan pemulihan pinjaman yatim satu kali setelah sinkron awal
async function _offerRestoreOrphanLoansOnce() {
    try {
        if (localStorage.getItem('offeredRestoreOrphanLoans') === '1') return;
    } catch (_) {}

    try {
        const creditors = await localDB.funding_creditors.toArray();
        const validCreditorIds = new Set(creditors.map(c => c.id));
        const softDeletedLoans = await localDB.funding_sources.where('isDeleted').equals(1).toArray();

        let count = softDeletedLoans.filter(l => l.creditorId && validCreditorIds.has(l.creditorId)).length;

        if (count === 0 && navigator.onLine) {
            for (const loan of softDeletedLoans) {
                if (!loan.creditorId || validCreditorIds.has(loan.creditorId)) continue;
                try {
                    const snap = await getDoc(doc(fundingCreditorsCol, loan.creditorId));
                    if (snap.exists()) count++;
                } catch (_) { /* ignore network errors */ }
                if (count >= 1) break; // we only need to know there is at least one
            }
        }

        if (count > 0) {
            // Mark offered to avoid repeated prompts
            try { localStorage.setItem('offeredRestoreOrphanLoans', '1'); } catch (_) {}
            toast('info', `Terdapat ${count} pinjaman yang dapat dipulihkan.`, 8000, {
                actionText: 'Pulihkan',
                onAction: () => handleRestoreOrphanLoans()
            });
        }
    } catch (e) {
        // Non-fatal; just skip prompting
        console.warn('Gagal memeriksa pemulihan pinjaman:', e);
    }
}

async function _runServerDataIntegrityCheck() {
    toast('syncing', 'Memindai data server...');
    console.log("Memulai pemindaian integritas data server...");

    let billsDeletedCount = 0;
    let recordsResetCount = 0;

    try {
        // Langkah 1: Ambil semua ID yang valid sebagai referensi
        const expenseSnaps = await getDocs(expensesCol);
        const validExpenseIds = new Set(expenseSnaps.docs.map(d => d.id));

        const billSnaps = await getDocs(billsCol);
        const billsData = billSnaps.docs.map(d => ({ id: d.id, ...d.data() }));
        const validBillIds = new Set(billsData.map(b => b.id));
        console.log(`Ditemukan ${validExpenseIds.size} expenses dan ${validBillIds.size} bills yang valid.`);

        // Langkah 2: Temukan Tagihan Yatim (bill tanpa expense yang valid)
        const billsToDeleteRefs = [];
        billsData.forEach(bill => {
            const isOrphan = bill.expenseId && !['gaji', 'fee'].includes(bill.type) && !validExpenseIds.has(bill.expenseId);
            if (isOrphan) {
                billsToDeleteRefs.push(doc(billsCol, bill.id));
            }
        });

        if (billsToDeleteRefs.length > 0) {
            console.warn(`Ditemukan ${billsToDeleteRefs.length} Tagihan Yatim untuk dihapus.`);
        }

        // Langkah 3: Temukan Absensi Lunas Yatim (attendance 'paid' tanpa bill yang valid)
        const recordsToUpdateRefs = [];
        const paidAttendanceQuery = query(attendanceRecordsCol, where('isPaid', '==', true));
        const paidAttendanceSnaps = await getDocs(paidAttendanceQuery);
        
        paidAttendanceSnaps.forEach(docSnap => {
            const record = docSnap.data();
            const isOrphan = record.billId && !validBillIds.has(record.billId);
            if (isOrphan) {
                recordsToUpdateRefs.push(docSnap.ref);
            }
        });

        if (recordsToUpdateRefs.length > 0) {
            console.warn(`Ditemukan ${recordsToUpdateRefs.length} Absensi Lunas Yatim untuk direset.`);
        }

        const totalOperations = billsToDeleteRefs.length + recordsToUpdateRefs.length;

        if (totalOperations === 0) {
            hideToast();
            toast('success', 'Data server bersih, tidak ada masalah ditemukan.');
            console.log("Pemeriksaan selesai. Tidak ada inkonsistensi data di server.");
            return;
        }

        toast('syncing', `Memperbaiki ${totalOperations} item data...`);

        // Langkah 4: Eksekusi perbaikan menggunakan batch untuk efisiensi
        const allWritePromises = [];
        const BATCH_SIZE = 400; // Batas aman di bawah 500
        
        for (let i = 0; i < billsToDeleteRefs.length; i += BATCH_SIZE) {
            const batch = writeBatch(db);
            const chunk = billsToDeleteRefs.slice(i, i + BATCH_SIZE);
            chunk.forEach(ref => batch.delete(ref));
            allWritePromises.push(batch.commit());
            billsDeletedCount += chunk.length;
        }

        for (let i = 0; i < recordsToUpdateRefs.length; i += BATCH_SIZE) {
            const batch = writeBatch(db);
            const chunk = recordsToUpdateRefs.slice(i, i + BATCH_SIZE);
            chunk.forEach(ref => batch.update(ref, { isPaid: false, billId: null }));
            allWritePromises.push(batch.commit());
            recordsResetCount += chunk.length;
        }
        
        await Promise.all(allWritePromises);

        hideToast();
        await toast('success', `Pembersihan server selesai! ${billsDeletedCount} tagihan dihapus & ${recordsResetCount} absensi direset.`);
        console.log(`Pembersihan server berhasil: ${billsDeletedCount} tagihan dihapus, ${recordsResetCount} absensi direset.`);

        // Opsional: Muat ulang data lokal setelah membersihkan server
        localStorage.removeItem('lastSyncTimestamp');
        await syncFromServer();
        await renderPageContent();

    } catch (error) {
        hideToast();
        console.error("Gagal menjalankan pembersihan data server:", error);
        toast('error', 'Gagal membersihkan data server. Cek console untuk detail.');
    }
}
function _addItemToListWithAnimation(containerSelector, itemHtml, position = 'prepend') {
    const container = $(containerSelector);
    if (!container) return;

    const emptyState = container.querySelector('.empty-state');
    if (emptyState) {
        container.innerHTML = '';
    }

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = itemHtml;
    const newItem = tempDiv.firstElementChild;

    if (!newItem) return;

    newItem.classList.add('item-entering');

    if (position === 'prepend') {
        container.prepend(newItem);
    } else {
        container.append(newItem);
    }
}

async function _removeItemFromListWithAnimation(itemId) {
    return new Promise((resolve) => {
        const itemElement = document.querySelector(`[data-id="${itemId}"]`);
        if (!itemElement) {
            resolve();
            return;
        }

        itemElement.classList.add('item-exiting');

        setTimeout(() => {
            itemElement.remove();
            resolve();
        }, 400);
    });
}

function _updateItemInListWithAnimation(itemId, newInnerHtml) {
    const itemElement = $(`[data-id="${itemId}"]`);
    if (itemElement) {
        const contentWrapper = itemElement.querySelector('.wa-card-v2, .dense-list-item, .jurnal-card');
        if (contentWrapper) {
            contentWrapper.innerHTML = newInnerHtml;
            contentWrapper.classList.add('item-updated-flash');
            contentWrapper.addEventListener('animationend', () => {
                contentWrapper.classList.remove('item-updated-flash');
            }, { once: true });
            try {
                const normalizedId = String(itemId).startsWith('expense-') ? String(itemId).slice('expense-'.length) : String(itemId);
                if (appState._recentlyEditedIds && appState._recentlyEditedIds.has(normalizedId)) {
                    toast('success', 'Item diperbarui', 1500);
                    appState._recentlyEditedIds.delete(normalizedId);
                }
            } catch (_) {}
        }
    }
}
function _getFilteredReportData() {
    const { start, end } = appState.reportFilter || {};
    const startDate = start ? new Date(start + 'T00:00:00') : null;
    const endDate = end ? new Date(end + 'T23:59:59') : null;

    const inRange = (date) => {
        if (!date) return false;
        const dt = _getJSDate(date);
        if (startDate && dt < startDate) return false;
        if (endDate && dt > endDate) return false;
        return true;
    };

    // Filter semua data relevan dari appState sekali, pastikan !isDeleted
    const incomes = (appState.incomes || []).filter(i => !i.isDeleted && inRange(i.date));
    const expenses = (appState.expenses || []).filter(e => !e.isDeleted && inRange(e.date));
    const fundingSources = (appState.fundingSources || []).filter(f => !f.isDeleted && inRange(f.date));
    
    // Untuk bills dan attendance, kita filter berdasarkan isDeleted dulu, lalu filter tanggal lebih spesifik nanti
    const allBills = (appState.bills || []).filter(b => !b.isDeleted);
    const allAttendance = (appState.attendanceRecords || []).filter(r => !r.isDeleted);

    return {
        incomes,
        expenses,
        fundingSources,
        allBills,
        allAttendance,
        inRange // Kirim fungsi inRange untuk kemudahan penggunaan
    };
}
  function _createFormGroupHTML(id, labelText, inputHTML) {
      const inputWithId = inputHTML.includes(' id=') ? inputHTML : inputHTML.replace(/<(\w+)/, `<$1 id="${id}"`);
  
      return `
          <div class="form-group">
              <label for="${id}">${labelText}</label>
              ${inputWithId}
          </div>
      `;
  }
  
  function _serializeForm(form) {
      const fd = new FormData(form);
      const data = {};
      for (const [k, v] of fd.entries()) {
          if (data[k] !== undefined) {
              if (!Array.isArray(data[k])) data[k] = [data[k]];
              data[k].push(v);
          } else {
              data[k] = v;
          }
      }
      return data;
  }
  function _createCustomDateInputHTML(id, labelText) {
    return `
        <div class="filter-group">
            <label for="${id}">${labelText}</label>
            <div class="custom-date-input-wrapper">
                <span id="${id}-display" class="date-display-text placeholder">Pilih Tanggal</span>
                <span class="material-symbols-outlined">calendar_month</span>
                <input type="date" id="${id}" data-display-target="${id}-display">
            </div>
        </div>
    `;
}
function _initCustomDateInputs(context = document) {
    context.querySelectorAll('input[type="date"][data-display-target]').forEach(input => {
        const displayTarget = document.getElementById(input.dataset.displayTarget);
        if (!displayTarget) return;

        const updateDisplay = () => {
            if (input.value) {
                const date = new Date(input.value);
                const options = { day: 'numeric', month: 'short', year: 'numeric' };
                displayTarget.textContent = date.toLocaleDateString('id-ID', options);
                displayTarget.classList.remove('placeholder');
            } else {
                displayTarget.textContent = 'Pilih Tanggal';
                displayTarget.classList.add('placeholder');
            }
        };

        input.addEventListener('change', updateDisplay);
        
        updateDisplay();
    });
}
function _validateAndPrepareData(data, indexedFields, defaults) {
    const cleanData = { ...data };
    for (const field of indexedFields) {
        if (cleanData[field] === undefined) {
            cleanData[field] = defaults[field] !== undefined ? defaults[field] : null;
        }
    }
    if (!cleanData.id) {
        cleanData.id = generateUUID();
    }
    return cleanData;
}
async function _verifyDataIntegrity() {
    console.log("Memeriksa integritas data lokal...");
    let itemsFixed = 0;

    try {
        const allExpenseIds = new Set((await localDB.expenses.where('isDeleted').notEqual(1).toArray()).map(e => e.id));
        const orphanedBills = await localDB.bills.filter(bill => {
            return bill.isDeleted !== 1 && bill.expenseId && !allExpenseIds.has(bill.expenseId) && bill.type !== 'gaji';
        }).toArray();

        if (orphanedBills.length > 0) {
            console.error(`DETEKSI KORUPSI: Ditemukan ${orphanedBills.length} tagihan 'yatim'. Menandai sebagai terhapus & menyiapkan sinkronisasi...`, orphanedBills);
            const idsToSoftDelete = orphanedBills.map(b => b.id).filter(Boolean);
            const recordIds = orphanedBills.flatMap(b => Array.isArray(b.recordIds) ? b.recordIds : []);
            if (idsToSoftDelete.length > 0) {
                await localDB.transaction('rw', localDB.bills, localDB.attendance_records, async () => {
                    await localDB.bills.where('id').anyOf(idsToSoftDelete).modify({
                        isDeleted: 1,
                        syncState: 'pending_update',
                        updatedAt: new Date()
                    });
                    if (recordIds.length > 0) {
                        await localDB.attendance_records.where('id').anyOf(recordIds).modify({
                            isPaid: false,
                            billId: null,
                            syncState: 'pending_update'
                        });
                    }
                });
                itemsFixed += idsToSoftDelete.length + recordIds.length;
                console.log(`${idsToSoftDelete.length} tagihan yatim ditandai isDeleted:1 dan ${recordIds.length} absensi terkait direset.`);
            }
        }

        try {
            const validProjectIds = new Set(((await localDB.projects.toArray()).filter(p => p.isDeleted !== 1)).map(p => p.id));
            const orphanIncomes = await localDB.incomes.filter(inc => inc.isDeleted !== 1 && inc.projectId && !validProjectIds.has(inc.projectId)).toArray();
            if (orphanIncomes.length > 0) {
                console.error(`DETEKSI KORUPSI: Ditemukan ${orphanIncomes.length} pemasukan 'yatim' (project hilang). Menandai sebagai terhapus & menyiapkan sinkronisasi...`, orphanIncomes);
                const ids = orphanIncomes.map(i => i.id).filter(Boolean);
                await localDB.incomes.where('id').anyOf(ids).modify({
                    isDeleted: 1,
                    syncState: 'pending_update',
                    updatedAt: new Date()
                });
                itemsFixed += ids.length;
            }
        } catch (e) { console.warn('[integrity] Gagal memproses orphan incomes:', e); }

        try {
            const creditors = await localDB.funding_creditors.toArray();
            const validCreditorIds = new Set(creditors.map(c => c.id));
            const hasCreditorCatalog = creditors.length > 0;
            const lastSync = getLastSyncTimestamp();
            const hasInitialSync = lastSync && lastSync.getTime() > 0;

            if (!hasCreditorCatalog && !hasInitialSync) {
                console.log('[integrity] Lewati cek pinjaman yatim: katalog kreditur kosong dan belum sync awal.');
            } else {
                let orphanLoans = await localDB.funding_sources
                    .filter(l => 
                        l.isDeleted !== 1 &&
                        l.creditorId && 
                        !validCreditorIds.has(l.creditorId) &&
                        (!l.syncState || l.syncState === 'synced' || l.syncState === 'conflict')
                    )
                    .toArray();
                    if (orphanLoans.length > 0 && navigator.onLine) {
                    const verified = [];
                    for (const l of orphanLoans) {
                        try {
                            const snap = await getDoc(doc(fundingCreditorsCol, l.creditorId));
                            if (!snap.exists()) verified.push(l);
                        } catch (_) {
                            verified.push(l);
                        }
                    }
                    orphanLoans = verified;
                }

                if (orphanLoans.length > 0) {
                    console.warn(`DETEKSI: ${orphanLoans.length} pinjaman tanpa kreditur terdeteksi. Menandai sebagai terhapus (soft delete).`, orphanLoans);
                    const ids = orphanLoans.map(l => l.id).filter(Boolean);
                    await localDB.funding_sources.where('id').anyOf(ids).modify({
                        isDeleted: 1,
                        syncState: 'pending_update',
                        updatedAt: new Date()
                    });
                    itemsFixed += ids.length;
                }
            }
        } catch (e) { console.warn('[integrity] Gagal memproses orphan funding_sources:', e); }

        try {
            const validMaterialIds = new Set(((await localDB.materials.toArray()).filter(m => m.isDeleted !== 1)).map(m => m.id));
            const orphanStock = await localDB.stock_transactions.filter(t => t.isDeleted !== 1 && t.materialId && !validMaterialIds.has(t.materialId)).toArray();
            if (orphanStock.length > 0) {
                console.error(`DETEKSI KORUPSI: Ditemukan ${orphanStock.length} transaksi stok 'yatim' (material hilang). Menandai sebagai terhapus...`, orphanStock);
                const ids = orphanStock.map(t => t.id).filter(Boolean);
                await localDB.stock_transactions.where('id').anyOf(ids).modify({
                    isDeleted: 1,
                    syncState: 'pending_update',
                    updatedAt: new Date()
                });
                itemsFixed += ids.length;
            }
        } catch (e) { console.warn('[integrity] Gagal memproses orphan stock_transactions:', e); }

        console.log("Memeriksa absensi 'yatim'...");
        const allValidBillIds = new Set((await localDB.bills.where('isDeleted').notEqual(1).toArray()).map(b => b.id));
        
        const allAttendanceRecords = await localDB.attendance_records.toArray();
        const orphanedAttendance = allAttendanceRecords.filter(record => 
            record.isPaid === true && record.billId && !allValidBillIds.has(record.billId)
        );

        if (orphanedAttendance.length > 0) {
            console.error(`DETEKSI KORUPSI: Ditemukan ${orphanedAttendance.length} absensi 'lunas' tanpa tagihan. Mereset status...`);
            
            const idsToReset = orphanedAttendance.map(rec => rec.id).filter(Boolean);
            if(idsToReset.length > 0){
                await localDB.attendance_records.where('id').anyOf(idsToReset).modify({
                    isPaid: false,
                    billId: null,
                    syncState: 'pending_update'
                });
                itemsFixed += idsToReset.length;
                console.log(`${idsToReset.length} data absensi berhasil direset.`);
            }
        }

        // Orphan comments: parent (expense/bill) missing
        try {
            const orphanComments = await localDB.comments
                .where('isDeleted').notEqual(1)
                .toArray();
            const toSoftDelete = orphanComments.filter(c => (
                (c.parentType === 'expense' && !allExpenseIds.has(c.parentId)) ||
                (c.parentType === 'bill' && !allValidBillIds.has(c.parentId))
            ));
            if (toSoftDelete.length > 0) {
                console.error(`DETEKSI KORUPSI: Ditemukan ${toSoftDelete.length} komentar 'yatim'. Menandai sebagai terhapus & menyiapkan sinkronisasi...`, toSoftDelete);
                const ids = toSoftDelete.map(c => c.id).filter(Boolean);
                await localDB.comments.where('id').anyOf(ids).modify({
                    isDeleted: 1,
                    syncState: 'pending_update',
                    updatedAt: new Date()
                });
                itemsFixed += ids.length;
            }
        } catch (e) { console.warn('[integrity] Gagal memproses orphan comments:', e); }

        // Validasi referensi master untuk expenses: projectId/supplierId harus valid, jika tidak set ke null
        try {
            // Avoid index requirement on projects/suppliers by filtering in JS
            const validProjectIds2 = new Set(((await localDB.projects.toArray()).filter(p => p.isDeleted !== 1)).map(p => p.id));
            const validSupplierIds2 = new Set(((await localDB.suppliers.toArray()).filter(s => s.isDeleted !== 1)).map(s => s.id));
            const badExpenses = await localDB.expenses.where('isDeleted').notEqual(1).toArray();
            const toFix = badExpenses.filter(e => (e.projectId && !validProjectIds2.has(e.projectId)) || (e.supplierId && !validSupplierIds2.has(e.supplierId)));
            if (toFix.length > 0) {
                const ids = toFix.map(e => e.id);
                await localDB.expenses.where('id').anyOf(ids).modify(exp => {
                    if (exp.projectId && !validProjectIds2.has(exp.projectId)) exp.projectId = null;
                    if (exp.supplierId && !validSupplierIds2.has(exp.supplierId)) exp.supplierId = null;
                    exp.syncState = 'pending_update';
                    exp.updatedAt = new Date();
                });
                itemsFixed += ids.length;
            }
        } catch (e) { console.warn('[integrity] Gagal memperbaiki referensi expense:', e); }

        // Samakan tipe bill dengan tipe expense parent bila perlu (kecuali gaji)
        try {
            const activeExpenses = await localDB.expenses.where('isDeleted').notEqual(1).toArray();
            const expMap = new Map(activeExpenses.map(e => [e.id, e]));
            const activeBills = await localDB.bills.where('isDeleted').notEqual(1).toArray();
            const mismatch = activeBills.filter(b => b.type !== 'gaji' && b.expenseId && expMap.has(b.expenseId) && expMap.get(b.expenseId).type && b.type !== expMap.get(b.expenseId).type);
            if (mismatch.length > 0) {
                await localDB.bills.where('id').anyOf(mismatch.map(b => b.id)).modify(b => {
                    const exp = expMap.get(b.expenseId);
                    b.type = exp.type;
                    b.syncState = 'pending_update';
                    b.updatedAt = new Date();
                });
                itemsFixed += mismatch.length;
            }
        } catch (e) { console.warn('[integrity] Gagal menyamakan tipe bill:', e); }

        if (itemsFixed > 0) {
            toast('info', `${itemsFixed} data bermasalah telah dibersihkan & diperbaiki secara otomatis.`);
            await loadAllLocalDataToState();
            _calculateAndCacheDashboardTotals();
        } else {
            console.log("Pemeriksaan integritas selesai. Tidak ada masalah ditemukan.");
        }

    } catch (e) {
        toast('error', 'Gagal menjalankan perbaikan data otomatis.');
        console.error("Pemeriksaan dan perbaikan integritas data GAGAL TOTAL:", e);
    }
}


function _getSyncIndicatorHTML(item) {
    if (!item.syncState || item.syncState === 'synced') {
        return '';
    }
    
    let icon = 'cloud_upload';
    let title = 'Menunggu untuk dikirim';
    let color = 'var(--text-dim)';

    if (item.syncState === 'pending_delete') {
        icon = 'delete_forever';
        title = 'Menunggu untuk dihapus';
        color = 'var(--danger)';
    } else if (item.syncState === 'error') {
        icon = 'error';
        title = 'Gagal sinkronisasi. Klik untuk opsi.';
        color = 'var(--danger)';
    }

    return `<div class="card-sync-indicator" title="${title}">
                <span class="material-symbols-outlined" style="color: ${color};">${icon}</span>
            </div>`;
}
async function _safeFirestoreWrite(writeFunction, successMessage, failureMessage = 'Operasi gagal.', loadingMessage = 'Menyimpan...') {
    if (_isQuotaExceeded()) {
        await toast('error', 'Kuota server habis. Operasi ditunda.');
        return false;
    }

    // Tampilkan toast loading jika ada pesannya
    if (loadingMessage) {
        toast('syncing', loadingMessage);
    }

    try {
        await writeFunction();
        _setQuotaExceededFlag(false);
        // Tampilkan toast sukses (ini akan otomatis menutup toast loading)
        await toast('success', successMessage);
        return true;
    } catch (error) {
        // Tampilkan toast error (ini juga akan otomatis menutup toast loading)
        if (error.code === 'resource-exhausted') {
            _setQuotaExceededFlag(true);
            await toast('error', 'Kuota server habis. Operasi ditunda.');
        } else {
            console.error("Firestore Write Error:", error);
            await toast('error', failureMessage);
        }
        return false;
    }
}
function _setQuotaExceededFlag(isExceeded) {
    try {
        if (isExceeded) {
            console.warn("KUOTA FIRESTORE HABIS. Sinkronisasi ditunda.");
            localStorage.setItem('firestoreQuotaExceeded', 'true');
        } else {
            console.log("Mereset flag kuota. Sinkronisasi akan dicoba kembali.");
            localStorage.removeItem('firestoreQuotaExceeded');
        }
    } catch (e) {
        console.error("Gagal mengatur flag kuota di localStorage.", e);
    }
}

function _isQuotaExceeded() {
    try {
        return localStorage.getItem('firestoreQuotaExceeded') === 'true';
    } catch (e) {
        return false;
    }
}
  async function _submitFormAsync(form) {
      const endpoint = form.getAttribute('action') || form.dataset.endpoint;
      if (!endpoint) throw new Error('Endpoint form tidak ditemukan');
      const method = (form.getAttribute('method') || 'POST').toUpperCase();
      const isMultipart = (form.getAttribute('enctype') || '').includes('multipart/form-data') || form.querySelector('input[type="file"]');
      let body;
      const headers = { 'Accept': 'application/json' };
      try {
          const isDevStatic = (location.hostname === '127.0.0.1' || location.hostname === 'localhost') && (location.port === '5500' || location.port === '5501');
          const isAppApi = typeof endpoint === 'string' && endpoint.startsWith('/api/');
          if (isDevStatic && isAppApi) {
              throw new Error('DEV_NO_API');
          }
      } catch (_) { /* ignore if location is unavailable */ }
      if (isMultipart) {
          body = new FormData(form);
      } else {
          headers['Content-Type'] = 'application/json';
          const built = _buildApiPayload(form);
          body = JSON.stringify(built ?? _serializeForm(form));
      }
      const res = await fetch(endpoint, { method, body, headers });
      if (!res.ok) {
          const text = await res.text().catch(() => '');
          throw new Error(text || `HTTP ${res.status}`);
      }
      // Try parse JSON, fallback to text
      let data = null;
      try { data = await res.json(); } catch (_) { data = await res.text().catch(() => ({})); }
      return data;
  }
  
  function _buildApiPayload(form) {
      const id = form.id;
      const type = form.dataset.type;
      // Helper getters within form
      const g = (sel) => form.querySelector(sel);
      const gv = (sel) => g(sel)?.value;
      if (id === 'pemasukan-form') {
          if (type === 'termin') {
              const amount = parseFormattedNumber(gv('#pemasukan-jumlah'));
              const date = new Date(gv('#pemasukan-tanggal'));
              const projectId = gv('#pemasukan-proyek');
              const feeChecks = $$('.fee-alloc-checkbox:checked');
              const feeAllocations = feeChecks.map(cb => ({ staffId: cb.dataset.staffId, amount: Number(cb.dataset.amount || 0) }));
              return { amount, date, projectId, feeAllocations };
          } else if (type === 'pinjaman') {
              return {
                  amount: parseFormattedNumber(gv('#pemasukan-jumlah')),
                  date: new Date(gv('#pemasukan-tanggal')),
                  creditorId: gv('#pemasukan-kreditur'),
                  interestType: gv('#loan-interest-type'),
                  rate: Number(gv('#loan-rate') || 0),
                  tenor: Number(gv('#loan-tenor') || 0)
              };
          }
      }
      if (id === 'pengeluaran-form') {
          return {
              type,
              projectId: gv('#expense-project'),
              categoryId: gv('#expense-category') || null,
              supplierId: gv('#supplier-id') || null,
              amount: parseFormattedNumber(gv('#pengeluaran-jumlah')),
              description: gv('#pengeluaran-deskripsi') || '',
              date: new Date(gv('#pengeluaran-tanggal')),
              status: form.querySelector('input[name="status"]')?.value || 'unpaid'
          };
      }
      if (id === 'material-invoice-form') {
          const items = $$('#invoice-items-container .invoice-item-row', form).map(row => {
              const mId = row.querySelector('[name="materialId"], [data-material-id]')?.value || row.dataset.materialId || null;
              // Support both legacy names and new inputs
              const qtyRaw = row.querySelector('input[name="itemQty"], [name="quantity"], .item-qty, .qty')?.value || row.dataset.qty || 0;
              const qty = parseLocaleNumber(qtyRaw);
              const price = parseFormattedNumber(row.querySelector('input[name="itemPrice"], [name="price"], .item-price, .price')?.value || '0');
              return { materialId: mId, qty, price };
          });
          return {
              projectId: gv('#project-id'),
              supplierId: gv('#supplier-id'),
              date: new Date(gv('#pengeluaran-tanggal')),
              formType: gv('input[name="formType"]') || 'faktur',
              items
          };
      }
      if (id === 'payment-form') {
          const billId = form.dataset.id || form.dataset.billId;
          if (type === 'bill') {
              return { billId, amount: parseFormattedNumber(form.elements.amount.value), date: new Date(form.elements.date.value) };
          } else if (type === 'pinjaman' || type === 'loan') {
              return { loanId: billId, amount: parseFormattedNumber(form.elements.amount.value), date: new Date(form.elements.date.value) };
          } else if (type === 'individual-salary') {
              return {
                  billId: form.dataset.billId,
                  workerId: form.dataset.workerId,
                  amount: parseFormattedNumber(form.elements.amount?.value || '0'),
                  date: new Date(form.elements.date?.value || new Date())
              };
          }
      }
      if (id === 'stok-in-form') {
          return {
              materialId: form.dataset.id,
              quantity: Number(form.elements.quantity.value),
              price: parseFormattedNumber(form.elements.price.value),
              date: new Date(form.elements.date.value)
          };
      }
      if (id === 'stok-out-form') {
          return {
              materialId: form.dataset.id,
              quantity: Number(form.elements.quantity.value),
              projectId: form.elements.projectId.value,
              date: new Date(form.elements.date.value)
          };
      }
      if (id === 'manual-attendance-form') {
          const dateStr = gv('#manual-attendance-date');
          const projectId = gv('#manual-attendance-project');
          const records = $$('.attendance-status-selector', form).map(sel => {
              const workerId = sel.dataset.workerId;
              const status = sel.querySelector('input:checked')?.value || 'absent';
              const pay = Number(sel.closest('.manual-attendance-item')?.querySelector('.worker-wage')?.dataset?.pay || 0);
              return { workerId, status, pay };
          });
          return { projectId, date: new Date(dateStr), records };
      }
      if (id === 'edit-attendance-form') {
          const recordId = form.dataset.id;
          if (type === 'manual') {
              return { id: recordId, type, status: form.elements.status.value };
          }
          if (type === 'timestamp') {
              return { id: recordId, type, checkIn: form.elements.checkIn.value, checkOut: form.elements.checkOut.value };
          }
      }
      if (id === 'edit-stock-form') {
          const q = Number(form.elements.quantity.value);
          const payload = { id: form.dataset.id, type: form.dataset.type, quantity: q };
          if (form.dataset.type === 'out') payload.projectId = form.elements.projectId.value;
          return payload;
      }
      if (id === 'add-master-item-form') {
        const t = form.dataset.type;
        const name = form.elements.itemName.value.trim();
        const base = { type: t, name };
        if (t === 'materials') base.unit = form.elements.itemUnit.value.trim();
        if (t === 'suppliers') base.category = form.elements.itemCategory.value;
        if (t === 'projects') { base.projectType = form.elements.projectType.value; base.budget = parseFormattedNumber(form.elements.budget.value); }
        if (t === 'staff') {
            base.paymentType = form.elements.paymentType.value;
            base.salary = parseFormattedNumber(form.elements.salary.value) || 0;
            base.feePercentage = Number(form.elements.feePercentage.value) || 0;
            base.feeAmount = parseFormattedNumber(form.elements.feeAmount.value) || 0;
        }
        if (t === 'workers') {
            base.professionId = form.elements.professionId.value;
            base.status = form.elements.workerStatus.value;
            // REVISI DIMULAI: Mengganti 'projectWages' menjadi 'wages'
            const wages = {}; 
            appState.projects.forEach(p => { 
                const v = parseFormattedNumber(form.elements[`project_wage_${p.id}`]?.value || '0'); 
                if (v > 0) wages[p.id] = v; 
            });
            base.projectWages = wages;
            // REVISI SELESAI
        }
        return base;
    }
          if (id === 'edit-master-form') {
          const t = form.dataset.type; const base = { id: form.dataset.id, type: t, name: form.elements.itemName.value.trim() };
          if (t === 'materials') { base.unit = form.elements.unit.value.trim(); base.reorderPoint = Number(form.elements.reorderPoint.value) || 0; }
          if (t === 'suppliers') base.category = form.elements.itemCategory.value;
          if (t === 'projects') { base.projectType = form.elements.projectType.value; base.budget = parseFormattedNumber(form.elements.budget.value); }
          if (t === 'staff') { base.paymentType = form.elements.paymentType.value; base.salary = parseFormattedNumber(form.elements.salary.value) || 0; base.feePercentage = Number(form.elements.feePercentage.value) || 0; base.feeAmount = parseFormattedNumber(form.elements.feeAmount.value) || 0; }
          if (t === 'workers') { base.professionId = form.elements.professionId.value; base.status = form.elements.workerStatus.value; const wages={}; appState.projects.forEach(p=>{const v=parseFormattedNumber(form.elements[`project_wage_${p.id}`]?.value || '0'); if (v>0) wages[p.id]=v;}); base.projectWages = wages; }
          return base;
      }
      if (id === 'edit-item-form') {
          const t = form.dataset.type;
          const payload = { id: form.dataset.id, type: t };
          if (t === 'expense') {
              payload.amount = parseFormattedNumber(form.elements.amount.value);
              payload.description = form.elements.description.value;
              if (form.elements.categoryId) payload.categoryId = form.elements.categoryId.value;
              payload.date = new Date(form.elements.date.value);
          } else if (t === 'loan') {
              payload.totalAmount = parseFormattedNumber(form.elements.totalAmount.value);
              payload.date = new Date(form.elements.date.value);
              payload.creditorId = form.elements.creditorId.value;
              payload.interestType = form.elements.interestType.value;
              payload.rate = Number(form.elements.rate.value || 0);
              payload.tenor = Number(form.elements.tenor.value || 0);
          } else if (t === 'fee_bill') {
              payload.description = form.elements.description.value;
              payload.amount = parseFormattedNumber(form.elements.amount.value);
          }
          return payload;
      }
      // Default fallback to JSON of form inputs
      return _serializeForm(form);
  }
  
  function _applyTheme(theme) {
      const root = document.documentElement;
      root.classList.add('theme-animating');
      root.classList.toggle('dark-theme', theme === 'dark');
      localStorage.setItem('banplex_theme', theme);
      setTimeout(() => root.classList.remove('theme-animating'), 300);
      // Update icon jika ada tombol
      const btn = document.getElementById('theme-toggle-btn');
      if (btn) {
          const iconEl = btn.querySelector('.material-symbols-outlined');
          if (iconEl) iconEl.textContent = root.classList.contains('dark-theme') ? 'dark_mode' : 'light_mode';
      }
  }
  
  function toggleTheme() {
      const isDark = document.documentElement.classList.contains('dark-theme');
      _applyTheme(isDark ? 'light' : 'dark');
  }
  
  async function _fallbackLocalFormHandler(form) {
      const id = form.id;
      const type = form.dataset.type;
      const fakeEvent = { preventDefault() {}, target: form };
      try {
          if (id === 'pemasukan-form') {
              return await handleAddPemasukan(fakeEvent);
          }
          if (id === 'pengeluaran-form') {
              return await handleAddPengeluaran(fakeEvent, type);
          }
          if (id === 'material-invoice-form') {
              return await handleAddPengeluaran(fakeEvent, 'material');
          }
          if (id === 'add-master-item-form') {
              return await handleAddMasterItem(form);
          }
          if (id === 'edit-master-form') {
              return await handleUpdateMasterItem(form);
          }
          if (id === 'payment-form') {
              if (type === 'bill') return await handleProcessBillPayment(form);
              if (type === 'pinjaman' || type === 'loan') return await handleProcessPayment(form);
              if (type === 'individual-salary') return await handleProcessIndividualSalaryPayment(form);
          }
          if (id === 'edit-item-form') {
              return await handleUpdateItem(form);
          }
          if (id === 'edit-attendance-form') {
              return await handleUpdateAttendance(form);
          }
          if (id === 'manual-attendance-form') {
              return await handleSaveManualAttendance(fakeEvent);
          }
          if (id === 'stok-in-form') {
              return await processStokIn(form);
          }
          if (id === 'stok-out-form') {
              return await processStokOut(form);
          }
          if (id === 'edit-stock-form') {
              return await _processStockTransactionUpdate(form);
          }
          // Tidak ada fallback yang cocok
          throw new Error(`No fallback handler for form id=${id}`);
      } catch (e) {
          console.warn('Fallback handler gagal:', e);
          throw e;
      }
  }
  
  // --- Generic API helpers for CRUD ---
  async function _apiRequest(method, url, payload = null) {
      const headers = { 'Accept': 'application/json' };
      let body;
      if (payload instanceof FormData) {
          body = payload;
      } else if (payload != null) {
          headers['Content-Type'] = 'application/json';
          body = JSON.stringify(payload);
      }
      const res = await fetch(url, { method, headers, body });
      if (!res.ok) throw new Error(`API ${method} ${url} -> ${res.status}`);
      try { return await res.json(); } catch (_) { return null; }
  }
  
  function _mapDeleteEndpoint(entity, id) {
      if (entity === 'termin' || entity === 'income') return `/api/incomes/${id}`;
      if (entity === 'pinjaman' || entity === 'loan') return `/api/loans/${id}`;
      if (entity === 'expense') return `/api/expenses/${id}`;
      if (entity === 'bill') return `/api/bills/${id}`;
      if (entity === 'attendance') return `/api/attendance/${id}`;
      if (entity === 'stock_transaction') return `/api/stock/transactions/${id}`;
      // master: entity formatted as master:{type}
      if (entity.startsWith('master:')) {
          const t = entity.split(':')[1];
          return `/api/master/${t}/${id}`;
      }
      return null;
  }
  
  const generateUUID = () => {
      try {
          if (crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
      } catch (_) {}
      // Fallback RFC4122 v4
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
          const r = Math.random() * 16 | 0,
              v = c === 'x'?r : (r & 0x3 | 0x8);
          return v.toString(16);
      });
  };
  
  async function optimisticUpdateDoc(colRef, id, partialChanges) {
      const ref = doc(colRef, id);
      await runTransaction(db, async (transaction) => {
          const snap = await transaction.get(ref);
          if (!snap.exists()) throw new Error('Dokumen tidak ditemukan');
          const currentRev = snap.data().rev || 0;
          const nextRev = currentRev + 1;
          transaction.update(ref, { ...partialChanges,
              rev: nextRev,
              updatedAt: serverTimestamp()
          });
      });
  }
  
  // Breadcrumbs removed
  
  async function _enforceLocalFileStorageLimit(maxBytes = 50 * 1024 * 1024, maxFiles = 300) {
      try {
          const files = await localDB.files.toArray();
          let totalBytes = 0;
          files.forEach(f => {
              totalBytes += (f.size || (f.file && f.file.size) || 0);
          });
          if (files.length <= maxFiles && totalBytes <= maxBytes) return;
          const sorted = files.slice().sort((a, b) => new Date(a.addedAt || 0) - new Date(b.addedAt || 0));
          while ((sorted.length > maxFiles) || (totalBytes > maxBytes)) {
              const oldest = sorted.shift();
              totalBytes -= (oldest.size || (oldest.file && oldest.file.size) || 0);
              await localDB.files.delete(oldest.id);
          }
      } catch (e) {
          console.warn('Gagal menegakkan batas storage lokal:', e);
      }
  }
  
  async function getPendingSyncCounts() {
      const tables = ['expenses', 'bills', 'incomes', 'funding_sources', 'attendance_records', 'stock_transactions'];
      let needs = 0,
          deletes = 0;
      for (const t of tables) {
          needs += await localDB[t].where('needsSync').equals(1).count();
          deletes += await localDB[t].where('isDeleted').equals(1).count();
      }
      const qPay = await localDB.pending_payments.count();
      const qLogs = await localDB.pending_logs.count();
      const qConf = await localDB.pending_conflicts.count();
      return {
          needs,
          deletes,
          qPay,
          qLogs,
          qConf,
          total: needs + deletes + qPay + qLogs + qConf
      };
  }
  
// GANTI SELURUH FUNGSI INI
async function updateSyncIndicator() {
    const el = document.getElementById('sync-indicator');
    if (!el) return;

    const { active, percentage, currentAction } = appState.syncProgress;
    const isOnline = navigator.onLine;

    // Tentukan kelas untuk titik berdasarkan status
    let dotClass = 'offline';
    if (isOnline) {
        dotClass = (appState.isSyncing || active) ? 'syncing' : 'online';
    }

    // Buat HTML dasar dengan titik dan kontainer detail (awalnya tersembunyi)
    el.innerHTML = `
        <div class="sync-progress-details">
            <div class="spinner"></div>
            <span id="sync-action-text">Sync...</span>
            <span id="sync-percentage-text">0%</span>
        </div>
        <div class="sync-dot ${dotClass}"></div>
    `;

    // Jika sinkronisasi sedang aktif, tampilkan detailnya
    if (active) {
        const detailsEl = el.querySelector('.sync-progress-details');
        const actionTextEl = el.querySelector('#sync-action-text');
        const percentageTextEl = el.querySelector('#sync-percentage-text');

        if (detailsEl) {
            // Isi dengan data terbaru
            actionTextEl.textContent = currentAction || 'Syncing...';
            percentageTextEl.textContent = `${Math.round(percentage)}%`;

            // Tambahkan kelas .show untuk memicu animasi CSS
            setTimeout(() => detailsEl.classList.add('show'), 10);
        }
    }
}

const _getJSDate = (dateObject) => {
      // 1. Jika objeknya null atau undefined, langsung kembalikan tanggal saat ini
      if (!dateObject) {
          return new Date();
      }
      // 2. Cek jika ini adalah objek Timestamp Firestore asli
      if (typeof dateObject.toDate === 'function') {
          return dateObject.toDate();
      }
      // 3. Cek jika ini adalah objek Timestamp dari IndexedDB ({seconds: ...})
      //    Penting: Cek juga apakah nilai seconds-nya valid.
      if (dateObject && typeof dateObject.seconds === 'number') {
          // Buat objek Date dari milidetik
          const d = new Date(dateObject.seconds * 1000);
          // Jika hasilnya tanggal yang tidak valid (misal, dari seconds: null), kembalikan tanggal saat ini
          if (isNaN(d.getTime())) {
              return new Date();
          }
          return d;
      }
      // 4. Cek jika ini sudah merupakan objek Date
      if (dateObject instanceof Date) {
          // Jika tanggalnya tidak valid, kembalikan tanggal saat ini
          if (isNaN(dateObject.getTime())) {
              return new Date();
          }
          return dateObject;
      }
      // 5. Sebagai fallback terakhir, coba parsing jika formatnya string. Jika gagal, kembalikan tanggal saat ini.
      const parsedDate = new Date(dateObject);
      if (isNaN(parsedDate.getTime())) {
          return new Date();
      }
      return parsedDate;
  };
  
  const parseFormattedNumber = (str) => Number(String(str).replace(/[^0-9]/g, ''));
  
  // Parse decimal with local comma support (e.g., "0,5" -> 0.5)
  function parseLocaleNumber(val) {
    if (val == null) return 0;
    let s = String(val).trim();
    if (!s) return 0;
    // Normalize comma to dot for decimals
    s = s.replace(/,/g, '.');
    // Strip spaces
    s = s.replace(/\s+/g, '');
    // If multiple dots (thousand separators), keep the last as decimal separator
    const parts = s.split('.');
    if (parts.length > 2) {
      const dec = parts.pop();
      s = parts.join('') + '.' + dec;
    }
    const n = Number(s);
    return isNaN(n) ? 0 : n;
  }
  const isViewer = () => appState.userRole === 'Viewer';
  let toastTimeout = null;
  let isPageTransitioning = false;
  
  function _resolveUserDisplay(ref) {
    try {
      if (!ref) return null;
      const s = String(ref).trim();
      const sLower = s.toLowerCase();
      const users = Array.isArray(appState.users) ? appState.users : [];
      let u = users.find(x => x && (x.id === s || String(x.id || '').toLowerCase() === sLower));
      if (!u) u = users.find(x => x && typeof x.email === 'string' && x.email.toLowerCase() === sLower);
      if (!u) u = users.find(x => x && typeof x.name === 'string' && x.name.toLowerCase() === sLower);
      if (u) return { name: u.name || s, photoURL: u.photoURL || '' };
      return { name: s, photoURL: '' };
    } catch (_) { return ref ? { name: String(ref), photoURL: '' } : null; }
  }

function updateOnlineStatusUI() {
    const isOffline = !navigator.onLine;
    document.body.classList.toggle('is-offline', isOffline);
    console.log(`Aplikasi sekarang ${isOffline ? 'OFFLINE' : 'ONLINE'}.`);
}

window.addEventListener('online', updateOnlineStatusUI);
window.addEventListener('offline', updateOnlineStatusUI);
updateOnlineStatusUI(); // Panggil saat aplikasi pertama kali dimuat

function upsertCommentInUI(commentData, changeType) {
    try {
        const activeDetailPane = document.querySelector('#detail-pane.detail-view-active, #detail-pane.detail-pane-open');
        if (!activeDetailPane) return;

        const list = activeDetailPane.querySelector('.chat-thread[role="log"]');
        if (!list) return;

        const sendButton = activeDetailPane.querySelector('[data-action="post-comment"]');
        if (!sendButton || sendButton.dataset.parentId !== commentData.parentId) {
            return;
        }

        const existing = list.querySelector(`.msg-group[data-msg-id="${commentData.id}"]`);

        if (changeType === 'removed' || commentData.isDeleted) {
            if (existing) {
                existing.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
                existing.style.opacity = '0';
                existing.style.transform = 'scale(0.95)';
                setTimeout(() => existing.remove(), 300);
            }
            return;
        }

        // --- BLOK PERBAIKAN UTAMA ADA DI SINI ---
        if (existing) {
            // Jika elemen komentar sudah ada di layar...
            const isSynced = !commentData.syncState || commentData.syncState === 'synced';
            const isMyMessage = commentData.userId === appState.currentUser?.uid;

            // Periksa apakah ini pesan kita yang baru saja berhasil terkirim ke server
            if (isMyMessage && isSynced) {
                const ticksIcon = existing.querySelector('.ticks .material-symbols-outlined');
                // Ganti ikon 'mengirim' (schedule) menjadi 'terkirim' (done_all)
                if (ticksIcon && ticksIcon.textContent !== 'done_all') {
                    ticksIcon.textContent = 'done_all';
                }
            }
            return; 
        }
        
        // Kode di bawah ini hanya akan berjalan jika komentar belum ada di layar
        const currentUid = appState.currentUser?.uid || 'user-guest';
        const ts = _getJSDate(commentData.createdAt).getTime();
        const dir = (commentData.userId === currentUid) ? 'outgoing' : 'incoming';
        const timeStr = new Date(ts).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
        const contentWithMentions = (commentData.content || '').replace(/</g, '&lt;');
        const emojiRegex = /^\p{Emoji}$/u;
        const isJumbo = commentData.content && emojiRegex.test(commentData.content);

        const lastMsgGroup = list.querySelector('.msg-group:last-child');
        const prevUser = lastMsgGroup ? lastMsgGroup.dataset.userId : null;
        const prevTime = lastMsgGroup ? parseInt(lastMsgGroup.dataset.timestamp || '0') : 0;
        const FIVE_MIN = 5 * 60 * 1000;
        const isGrouped = (prevUser === String(commentData.userId)) && (ts - prevTime <= FIVE_MIN);

        let newHtmlParts = [];
        newHtmlParts.push(`<div class="msg-group ${dir} ${isGrouped ? 'grouped' : ''}" data-msg-id="${commentData.id}" data-user-id="${commentData.userId}" data-timestamp="${ts}" tabindex="0" style="opacity:0; transform: translateY(10px);">`);
        if (dir === 'incoming' && !isGrouped) {
            const initials = (commentData.userName || 'U').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
            newHtmlParts.push(`<div class="avatar">${initials}</div>`);
        }
        newHtmlParts.push(`<article class="msg ${dir} ${isJumbo ? 'is-jumbo-emoji' : ''}" data-id="${commentData.id}"><div class="bubble">`);
        if (dir === 'incoming' && !isGrouped) newHtmlParts.push(`<div class="sender">${commentData.userName || 'Pengguna'}</div>`);
        if (commentData.content) newHtmlParts.push(`<div class="content selectable-text">${contentWithMentions}</div>`); // Menambahkan kembali kelas selectable-text
        if (commentData.attachments) newHtmlParts.push(_getAttachmentHTML(commentData.attachments));
        newHtmlParts.push(`<div class="meta"><time>${timeStr}</time>`);
        if (dir === 'outgoing') {
            const syncIcon = commentData.syncState === 'pending_create' ? 'schedule' : 'done_all';
            newHtmlParts.push(`<span class="ticks"><span class="material-symbols-outlined">${syncIcon}</span></span>`);
        }
        newHtmlParts.push(`</div></div></article></div>`);
        
        list.insertAdjacentHTML('beforeend', newHtmlParts.join(''));
        const newItem = list.lastElementChild;
        requestAnimationFrame(() => {
            newItem.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
            newItem.style.opacity = '1';
            newItem.style.transform = 'translateY(0)';
            try { list.scrollTop = list.scrollHeight; } catch(_) {}
        });

    } catch (e) {
        console.warn('upsertCommentInUI error', e);
    }
}
function _setLastCommentViewTimestamp(parentId) {
    if (!parentId) return;
    try {
      const key = `comment_view_ts_${parentId}`;
      localStorage.setItem(key, Date.now().toString());
      console.log(`Timestamp komentar untuk ${parentId} diperbarui.`);
    } catch (e) {
      console.error("Gagal menyimpan timestamp komentar:", e);
    }
  }
  function _getUnreadCommentCount(parentId, commentsList) {
    if (!parentId || !commentsList || commentsList.length === 0) return 0;
    try {
      const key = `comment_view_ts_${parentId}`;
      const lastViewed = parseInt(localStorage.getItem(key) || '0', 10);
      
      const unreadCount = commentsList.filter(comment => {
        const commentTimestamp = _getJSDate(comment.createdAt).getTime();
        return commentTimestamp > lastViewed;
      }).length;
  
      return unreadCount;
    } catch (e) {
      console.error("Gagal menghitung komentar belum dibaca:", e);
      return 0;
    }
  }

  function _renderCommentsViewChat(parentId, parentType) {
    const all = (appState.comments || [])
        .filter(c => c.parentId === parentId && c.parentType === parentType && !c.isDeleted)
        .sort((a, b) => _getJSDate(a.createdAt) - _getJSDate(a.createdAt));

    let parentItem = (parentType === 'bill') ? appState.bills.find(b => b.id === parentId) : appState.expenses.find(e => e.id === parentId);
    const threadTitle = parentItem?.description || 'Diskusi Item';
    const currentUid = appState.currentUser?.uid || 'user-guest';
    const subtitle = `${all.length} Komentar`;
    
    // [PERUBAHAN KUNCI 1] Regex untuk mendeteksi emoji tunggal
    const emojiRegex = /^\p{Emoji}$/u;

    const dayKey = d => _getJSDate(d).toISOString().split('T')[0];
    const humanDay = dt => {
        const d = _getJSDate(dt);
        const today = new Date();
        if (dayKey(d) === dayKey(today)) return 'Hari Ini';
        const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
        if (dayKey(d) === dayKey(yesterday)) return 'Kemarin';
        return d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' });
    };
    const FIVE_MIN = 5 * 60 * 1000;
    let prevUser = null, prevTime = 0, lastDay = '';
    let htmlParts = [];
    for (const c of all) {
        const ts = _getJSDate(c.createdAt).getTime();
        const dir = (c.userId === currentUid) ? 'outgoing' : 'incoming';
        const timeStr = new Date(ts).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
        const contentWithMentions = (c.content || '').replace(/</g, '&lt;');
        const thisDay = dayKey(ts);
        if (thisDay !== lastDay) {
            htmlParts.push(`<div class="date-pill">${humanDay(ts)}</div>`);
            lastDay = thisDay; prevUser = null; prevTime = 0;
        }
        const isGrouped = (prevUser === c.userId) && (ts - prevTime <= FIVE_MIN);
        
        // [PERUBAHAN KUNCI 2] Tambahkan kelas 'is-jumbo-emoji' jika kontennya hanya 1 emoji
        const isJumbo = c.content && emojiRegex.test(c.content);
        
        htmlParts.push(`<div class="msg-group ${dir} ${isGrouped ? 'grouped' : ''}" data-msg-id="${c.id}" tabindex="0">`);
        if (dir === 'incoming' && !isGrouped) {
            const initials = (c.userName || 'U').split(' ').map(n => n[0]).join('').substring(0,2).toUpperCase();
            htmlParts.push(`<div class="avatar">${initials}</div>`);
        }
        
        htmlParts.push(`<article class="msg ${dir} ${isJumbo ? 'is-jumbo-emoji' : ''}" data-id="${c.id}"><div class="bubble">`);

        if (dir === 'incoming' && !isGrouped) htmlParts.push(`<div class="sender">${c.userName || 'Pengguna'}</div>`);
        if(c.content) htmlParts.push(`<div class="content">${contentWithMentions}</div>`);
        if(c.attachments) htmlParts.push(_getAttachmentHTML(c.attachments));
        // Bagian lain seperti link preview, audio, dll tetap ada jika kamu punya fungsinya
        // if(c.linkPreview) htmlParts.push(_getLinkPreviewHTML(c.linkPreview));
        // if(c.audio) htmlParts.push(_getAudioPlayerHTML(c.audio, dir));
        // if(c.poll) htmlParts.push(_getPollHTML(c.poll));
        
        htmlParts.push(`<div class="meta"><time>${timeStr}</time>`);
        if(dir === 'outgoing' && c.syncState && c.syncState !== 'synced') htmlParts.push(`<span class="ticks pending"><span class="material-symbols-outlined">schedule</span></span>`);
        else if(dir === 'outgoing') htmlParts.push(`<span class="ticks read"><span class="material-symbols-outlined">done_all</span></span>`);
        htmlParts.push(`</div>`);
        htmlParts.push(`</div></article></div>`);
        prevUser = c.userId; prevTime = ts;
    }

    const contentHTML = `
        <main class="chat-thread" role="log" aria-live="polite">${htmlParts.join('')}</main>
    `;

    const footerHTML = `
        <div class="composer-wrapper">
            <div id="attachment-preview-dock" class="attachments-dock" hidden></div>
            <footer class="composer" role="group" aria-label="Tulis komentar">
              <div class="composer-row">
                <div class="composer-capsule">
                    <button class="btn-icon" data-action="toggle-emoji-picker"><span class="material-symbols-outlined">mood</span></button>
                    <textarea class="composer-input" rows="1" placeholder="Tulis komentar..."></textarea>
                    <button class="btn-icon" data-action="attach-file" aria-label="Lampirkan File"><span class="material-symbols-outlined">attach_file</span></button>
                    <button class="btn send" disabled data-action="post-comment" data-parent-id="${parentId}" data-parent-type="${parentType}"><span class="material-symbols-outlined">send</span></button>
                </div>
              </div>
              <div class="emoji-picker">${['😀','👍','🔥','🎉','❤️','🙏'].map(ch => `<button type="button" class="emoji-btn" data-action="insert-emoji" data-char="${ch}">${ch}</button>`).join('')}</div>
            </footer>
        </div>
    `;

    return { 
        title: threadTitle, 
        subtitle: subtitle,
        headerActions: `<button class="icon-btn" aria-label="More"><span class="material-symbols-outlined">more_vert</span></button>`,
        content: contentHTML, 
        footer: footerHTML 
    };
}

function _initChatViewInteractions(parentId) {
    // [PERBAIKAN KUNCI] Selector diubah menjadi lebih sederhana dan pasti ditemukan
    const viewContainer = document.getElementById('detail-pane');
    if (!viewContainer) {
        console.error("Kesalahan Kritis: Panel detail (#detail-pane) tidak ditemukan. Interaksi chat dibatalkan.");
        return;
    }

    const thread = viewContainer.querySelector('.chat-thread');
    const composer = viewContainer.querySelector('.composer');
    const textarea = composer?.querySelector('.composer-input');
    const sendBtn = composer?.querySelector('.btn.send');
    const attachBtn = composer?.querySelector('[data-action="attach-file"]');
    
    if (!thread || !composer || !textarea || !sendBtn) {
        console.warn("Satu atau lebih elemen UI chat tidak ditemukan, interaksi dibatalkan.");
        return;
    }

    // Scroll ke pesan terakhir saat dibuka
    setTimeout(() => { thread.scrollTop = thread.scrollHeight; }, 100);

    const updateComposerState = () => {
        const val = textarea.value.trim();
        const hasAttachment = sendBtn.dataset.attachment !== undefined;

        textarea.style.height = 'auto';
        const maxHeight = 120; // Batas tinggi maksimal textarea
        textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
        
        sendBtn.disabled = !val && !hasAttachment;
    };

    textarea.addEventListener('input', updateComposerState);
    textarea.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (!sendBtn.disabled) sendBtn.click();
        }
    });

    updateComposerState(); // Panggil saat inisialisasi

    // --- PENGAKTIFAN SEMUA TOMBOL ---

    // Hapus listener lama untuk mencegah duplikasi jika fungsi ini terpanggil lagi
    if (viewContainer._chatClickHandler) {
        viewContainer.removeEventListener('click', viewContainer._chatClickHandler);
    }

    // Buat satu handler utama untuk semua aksi klik di dalam panel
    viewContainer._chatClickHandler = async (e) => {
        const actionTarget = e.target.closest('[data-action]');
        if (!actionTarget) return;

        const action = actionTarget.dataset.action;

        switch (action) {
            case 'post-comment':
                {
                    let attachmentData = null;
                    if (sendBtn.dataset.attachment) {
                        try {
                            attachmentData = JSON.parse(sendBtn.dataset.attachment);
                        } catch (err) {
                            console.error("Gagal parsing data lampiran");
                        }
                    }
                    handlePostComment(sendBtn.dataset, attachmentData);
                    delete sendBtn.dataset.attachment;
                    updateComposerState();
                    break;
                }

            case 'attach-file':
                {
                    const fileInput = document.createElement('input');
                    fileInput.type = 'file';
                    fileInput.accept = "image/*,application/pdf,.doc,.docx,.xls,.xlsx";
                    fileInput.onchange = async (ev) => {
                        const file = ev.target.files[0];
                        if (!file) return;

                        const previewDock = document.getElementById('attachment-preview-dock');
                        previewDock.hidden = false;
                        previewDock.innerHTML = `<div class="file-tile"><div class="spinner"></div><div><div class="file-name">Mengunggah ${file.name}...</div></div></div>`;
                        updateComposerState();

                        const url = await _uploadFileToCloudinary(file);
                        if (url) {
                            const isImage = file.type.startsWith('image/');
                            const attachmentData = isImage ?
                                { type: 'image-grid', urls: [url] } :
                                { type: 'file', name: file.name, size: `${(file.size / 1024 / 1024).toFixed(2)} MB`, url: url };

                            previewDock.innerHTML = isImage ?
                                `<div class="image-grid"><img class="img-thumb" src="${url}"></div>` :
                                `<div class="file-tile"><div class="file-icon"><span class="material-symbols-outlined">description</span></div><div><div class="file-name">${file.name}</div></div></div>`;

                            sendBtn.dataset.attachment = JSON.stringify(attachmentData);
                        } else {
                            previewDock.hidden = true;
                            previewDock.innerHTML = '';
                            delete sendBtn.dataset.attachment;
                        }
                        updateComposerState();
                    };
                    fileInput.click();
                    break;
                }

            case 'toggle-emoji-picker':
                {
                    e.stopPropagation();
                    const picker = composer.querySelector('.emoji-picker');
                    if (picker) picker.classList.toggle('active');
                    break;
                }

            case 'insert-emoji':
                {
                    e.stopPropagation();
                    const char = actionTarget.dataset.char;
                    const { parentId, parentType } = sendBtn.dataset;
                    if (!char || !parentId || !parentType) return;

                    const quickComment = {
                        id: generateUUID(), parentId, parentType, content: char,
                        userId: appState.currentUser.uid, userName: appState.currentUser.displayName || 'Pengguna',
                        createdAt: new Date(), syncState: 'pending_create', isDeleted: 0
                    };

                    await localDB.comments.add(quickComment);
                    appState.comments.push(quickComment);
                    upsertCommentInUI(quickComment, 'added');
                    syncToServer({ silent: true });

                    const picker = actionTarget.closest('.emoji-picker');
                    if (picker) picker.classList.remove('active');
                    break;
                }
        }
    };

    // Pasang handler utama
    viewContainer.addEventListener('click', viewContainer._chatClickHandler);
}

function _getAuthScreenHTML() {
    let lastUser = null;
    try {
        lastUser = JSON.parse(localStorage.getItem('lastActiveUser'));
    } catch (e) {
        lastUser = null;
    }
    if (lastUser && lastUser.displayName) {
        return `
            <div class="auth-card returning-user">
                <div class="card-body">
                    <img src="${lastUser.photoURL || 'icons-logo.png'}" alt="Avatar" class="profile-avatar-large">
                    <p class="welcome-back-text">Selamat datang kembali,</p>
                    <h4 class="returning-user-name">${lastUser.displayName}</h4>
                    <button class="btn btn-primary btn-block" data-action="auth-action">
                        Lanjutkan sebagai ${lastUser.displayName.split(' ')[0]}
                    </button>
                    <button class="btn btn-secondary btn-block" data-action="login-different-account">
                        Gunakan akun lain
                    </button>
                </div>
            </div>`;
    }
    return `
        <div class="auth-card">
            <div class="card-header"><h3>Selamat Datang di BanPlex</h3></div>
            <div class="card-body">
                <p>Silakan masuk menggunakan akun Google Anda untuk melanjutkan.</p>
                <button class="btn btn-primary" data-action="auth-action"><span class="material-symbols-outlined">login</span> Masuk dengan Google</button>
            </div>
        </div>`;
}

function _getPollHTML(poll) {
    const totalVotes = poll.totalVotes || Object.values(poll.options).reduce((a, b) => a + b, 0);
    const optionsHTML = Object.entries(poll.options).map(([option, votes]) => {
        const percentage = totalVotes > 0 ? (votes / totalVotes) * 100 : 0;
        return `
        <div class="poll-option ${poll.voted === option ? 'voted' : ''}" role="radio" aria-checked="${poll.voted === option}">
            <div class="progress" style="width: ${percentage}%;"></div>
            <div class="option-content">
                <span class="option-label">${option}</span>
                <span>${Math.round(percentage)}% (${votes})</span>
            </div>
        </div>`;
    }).join('');
    return `<div class="poll">
        <h4>${poll.title}</h4>
        ${optionsHTML}
        <div class="poll-footer">${totalVotes} suara • ${poll.state === 'closed' ? 'Ditutup' : 'Buka'}</div>
    </div>`;
}

function _getTaskChipHTML(task) {
    const isOverdue = task.due && new Date(task.due) < new Date();
    const statusClass = task.status ? task.status.toLowerCase().replace(/\s/g, '-') : 'open';
    return `
    <div class="task-chip" data-task-id="${task.id}">
        <div class="title">${task.title}</div>
        <div class="status ${statusClass}">${task.status}</div>
        <div class="assignees">
            ${(task.assignees || []).map(uid => `<div class="avatar">${uid[0].toUpperCase()}</div>`).join('')}
        </div>
        <div class="due ${isOverdue ? 'overdue' : ''}">${task.due ? new Date(task.due).toLocaleDateString('id-ID', {day:'numeric', month:'short'}) : 'Tanpa Batas'}</div>
    </div>`;
}

function _getThreadChipHTML(thread) {
    if (thread.collapsed && thread.replies && thread.replies.length > 0) {
        const replyCount = thread.replies.length;
        const remaining = replyCount - 2;
        return `
        <div class="thread-chip expanded" data-action="toggle-replies" role="button" aria-expanded="true">
            <span>${replyCount} balasan</span>
            <span class="material-symbols-outlined">expand_less</span>
        </div>
        <div class="collapsed-replies">
            ${thread.replies.slice(0, 2).map(r => `<div class="mini-reply"><strong>${r.userName || r.userId}:</strong> ${r.content}</div>`).join('')}
            ${remaining > 0 ? `<button class="show-more-replies" data-action="toggle-replies">${remaining} balasan lainnya...</button>` : ''}
        </div>`;
    }
    return `<div class="thread-chip" data-action="open-thread-sheet" role="button">${thread.count || 0} balasan <span class="material-symbols-outlined">arrow_forward</span></div>`;
}

function _getQuickFiltersHTML() {
    const filters = [
        { id: 'all', label: 'All', count: 210 }, { id: 'unread', label: 'Unread', count: 3 },
        { id: 'starred', label: 'Starred', count: 1 }, { id: 'mentions', label: 'Mentions', count: 1 },
        { id: 'media', label: 'Media', count: 1 }, { id: 'files', label: 'Files', count: 1 },
        { id: 'tasks', label: 'Tasks', count: 1 }, { id: 'polls', label: 'Polls', count: 1 }
    ];
    return `<div class="quick-filters">${filters.map(f => `
        <button class="quick-filter-chip ${f.id === 'all' ? 'active': ''}" role="checkbox" aria-checked="${f.id === 'all'}">
            ${f.label} <span class="count">${f.count}</span>
        </button>
    `).join('')}<div class="mini-stats"><div class="stat-chip"><span class="material-symbols-outlined">person</span> 3</div><div class="stat-chip"><span class="material-symbols-outlined">attachment</span> 5</div></div></div>`;
}

function _getSLAChipHTML(sla) {
    let stateClass = 'ontrack';
    if (sla.state === 'due-soon') stateClass = 'warn';
    if (sla.state === 'overdue') stateClass = 'danger';
    return `<div class="sla-chip ${stateClass}">
        <span class="material-symbols-outlined">timer</span>
        <span>${sla.countdown || 'Selesai'}</span>
    </div>`;
}

function _getAnalyticsFooterHTML(analytics) {
    return `<div class="analytics-footer">
        <span>${analytics.words || 0}w · ${analytics.chars || 0}c</span>
        <span>Baca: ${analytics.readTime || 0}s</span>
        <span>Balasan: ${analytics.replies || 0}</span>
    </div>`;
}

function _getApprovalHTML(approval) {
    if (approval.state !== 'open') {
        const stateClass = approval.state === 'approved' ? 'success' : 'danger';
        return `<div class="approval-summary ${stateClass}">${approval.state.toUpperCase()} oleh ${approval.resolvedBy?.name || 'seseorang'}</div>`;
    }
    return `<div class="approval-block">
        <p>Membutuhkan persetujuan Anda</p>
        <div class="approval-actions">
            <button class="btn btn-danger">Tolak</button>
            <button class="btn btn-success">Setujui</button>
        </div>
    </div>`;
}

function _getMediaCarouselHTML(attachments) {
    const items = attachments.urls || [];
    return `<div class="media-carousel">
        <div class="carousel-main">
            <div class="carousel-slides">${items.map((url, i) => `<div class="slide" data-index="${i}"><img src="${url}" alt="Attachment ${i+1}"></div>`).join('')}</div>
            <button class="icon-btn carousel-nav prev"><span class="material-symbols-outlined">chevron_left</span></button>
            <button class="icon-btn carousel-nav next"><span class="material-symbols-outlined">chevron_right</span></button>
            <div class="carousel-info">1 / ${items.length}</div>
        </div>
        <div class="filmstrip">${items.map((url, i) => `<img src="${url}" class="filmstrip-thumb ${i === 0 ? 'active' : ''}" data-index="${i}" alt="Thumbnail ${i+1}">`).join('')}</div>
    </div>`;
}

function _getRoomsRailHTML(rooms, activeRoomId) {
    const roomItems = rooms.map(room => `
        <div class="room-item ${room.id === activeRoomId ? 'active' : ''}" data-room-id="${room.id}">
            <div class="avatar">${room.name[0]}</div>
            <div class="room-title">${room.name}</div>
            <div class="room-meta">${room.lastActivityAt ? new Date(room.lastActivityAt.seconds * 1000).toLocaleTimeString('id-ID', {hour:'2-digit', minute:'2-digit'}) : ''}</div>
            <div class="room-snippet">${room.lastMessageSnippet || ''}</div>
        </div>
    `).join('');
    return `<div class="rooms-rail-header"><input type="search" placeholder="Cari Ruangan..."></div><div class="rooms-list">${roomItems}</div>`;
}

function _getActivitySheetHTML(activities) {
    const activityItems = (activities || []).map(act => `<div class="activity-item">${act.text}</div>`).join('');
    return `<div class="chat-header"><h5>Aktivitas</h5></div><div class="activity-list">${activityItems}</div>`;
}

function _getKanbanSheetHTML(tasks) {
    const columns = { Backlog: [], 'In progress': [], Review: [], Done: [] };
    (tasks || []).forEach(task => {
        if (columns[task.status]) columns[task.status].push(task);
    });
    const columnsHTML = Object.entries(columns).map(([title, taskItems]) => `
        <div class="kanban-column">
            <div class="kanban-header">${title}</div>
            <div class="kanban-cards">${taskItems.map(t => `<div class="kanban-card">${t.title}</div>`).join('')}</div>
        </div>
    `).join('');
    return `<div class="chat-header"><h5>Ringkasan Kanban</h5></div><div class="kanban-board">${columnsHTML}</div>`;
}

function _getHeatmapHTML(data) {
    const cells = Array.from({length: 90}).map((_, i) => {
        const level = Math.floor(Math.random() * 5);
        return `<div class="heatmap-cell" data-level="${level}" title="Activity on day ${i+1}"></div>`;
    }).join('');
    return `<div class="heatmap-grid">${cells}</div>`;
}

async function _generateExport(format, scope) {
    const items = scope || appState.messages[appState.activeRoomId] || [];
    if (format === 'csv') {
        const headers = "index,datetime_iso,sender,text,attachments";
        const rows = items.map((msg, i) => {
            const row = [
                i + 1,
                (msg.createdAt?.toDate ? msg.createdAt.toDate().toISOString() : new Date(msg.createdAt).toISOString()),
                `"${(msg.author?.name || '').replace(/"/g, '""')}"`,
                `"${(msg.content || '').replace(/"/g, '""')}"`,
                `"${(msg.attachments || []).map(a => a.name).join(';')}"`
            ];
            return row.join(',');
        });
        return `${headers}\n${rows.join('\n')}`;
    }
    if (format === 'markdown') {
        return items.map(msg => `**${msg.author?.name || 'User'}** - _${new Date(msg.createdAt?.toDate ? msg.createdAt.toDate() : msg.createdAt).toLocaleTimeString('id-ID')}_  \n${msg.content || ''}`).join('\n\n---\n\n');
    }
    return '';
}

function _initVirtualization(container, allMessages) {
    if (!container) return;
    container.innerHTML = '<div id="virtual-spacer-top"></div><div id="virtual-spacer-bottom"></div>';
    const topSpacer = document.getElementById('virtual-spacer-top');
    const bottomSpacer = document.getElementById('virtual-spacer-bottom');
    const ITEM_HEIGHT = 80;
    const RENDER_AHEAD = 20;

    let renderTimeout;
    const renderWindow = () => {
        clearTimeout(renderTimeout);
        renderTimeout = setTimeout(() => {
            const scrollTop = container.scrollTop;
            const containerHeight = container.clientHeight;
            const totalHeight = allMessages.length * ITEM_HEIGHT;
            
            let startIndex = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - RENDER_AHEAD);
            let endIndex = Math.min(allMessages.length, Math.ceil((scrollTop + containerHeight) / ITEM_HEIGHT) + RENDER_AHEAD);
            
            topSpacer.style.height = `${startIndex * ITEM_HEIGHT}px`;
            bottomSpacer.style.height = `${totalHeight - (endIndex * ITEM_HEIGHT)}px`;
            
            const visibleItemsHTML = allMessages.slice(startIndex, endIndex).map(msg => {
                const dir = (msg.author?.uid === (appState.currentUser?.uid || 'user1')) ? 'outgoing' : 'incoming';
                return `<div class="msg-group ${dir}" style="height:${ITEM_HEIGHT}px" data-msg-id="${msg.id}">${msg.content || '...'}</div>`;
            }).join('');
            
            const currentItems = Array.from(container.querySelectorAll('.msg-group'));
            currentItems.forEach(item => item.remove());
            topSpacer.insertAdjacentHTML('afterend', visibleItemsHTML);

        }, 16);
    };

    container.addEventListener('scroll', renderWindow);
    renderWindow();
    return () => container.removeEventListener('scroll', renderWindow);
}

function _getAttachmentHTML(attachment) {
    if (attachment.type === 'file') {
        return `<div class="attachments"><div class="file-tile"><div class="file-icon"><span class="material-symbols-outlined">description</span></div><div><div class="file-name">${attachment.name}</div><div class="file-size">${attachment.size}</div></div></div></div>`;
    }
    if (attachment.type === 'image-grid') {
        return `<div class="attachments"><div class="image-grid">${attachment.urls.map(url => `<img class="img-thumb" src="${url}" alt="attachment" loading="lazy" decoding="async">`).join('')}</div></div>`;
    }
    return '';
}

function _getLinkPreviewHTML(link) {
    if (link.loading) {
        return `<div class="link-card skeleton"><div></div><div></div></div>`;
    }
    return `<a class="link-card" href="https://www.ikea.co.id/in/produk/pencahayaan/lampu-plafon/ranarp-lampu-plafon-hitam-70396255" target="_blank" rel="noopener noreferrer">
        <img src="https://www.ikea.co.id/ico/favicon.ico" class="favicon" alt="">
        <div>
            <div class="link-domain">ikea.co.id</div>
            <div class="link-title">RANARP Lampu plafon, hitam</div>
            <div class="link-description">Memberi cahaya terarah. Cocok untuk menerangi meja makan atau bar.</div>
        </div>
    </a>`;
}

function _getAudioPlayerHTML(audio, direction) {
    const waveformHTML = Array(25).fill(0).map(() => `<div style="--h: ${Math.random() * 0.8 + 0.2}"></div>`).join('');
    return `<div class="audio-player">
        <button class="play-btn"><span class="material-symbols-outlined">play_arrow</span></button>
        <div class="waveform">${waveformHTML}</div>
        <div class="audio-meta">
            <span>${audio.duration}</span>
            ${direction === 'outgoing' ? `<span class="ticks read"><span class="material-symbols-outlined">done_all</span></span>` : ''}
        </div>
    </div>`;
}

function _getReactionsHTML(reactions, currentUid) {
    return `<div class="reactions">${Object.entries(reactions).map(([emoji, users]) => 
        `<div class="rx ${users.includes(currentUid) ? 'me':''}" role="button" aria-pressed="${users.includes(currentUid)}">${emoji} <span class="count">${users.length}</span></div>`
    ).join('')}</div>`;
}

function _getPinnedRailHTML(messages, currentUid) {
    return `<div class="pinned-rail">${messages.map(m => `
        <div class="pinned-chip" data-target-id="${m.id}" tabindex="0">
            <div class="avatar">${(m.userName || 'U')[0]}</div>
            <span class="pinned-text">${m.content}</span>
        </div>
    `).join('')}</div>`;
}

function openCommentsViewWithPrefill(parentId, parentType, prefilledText = '') {
    document.body.classList.add('comments-view-active');
    
    const chatData = _renderCommentsViewChat(parentId, parentType);
    
    const viewConfig = {
        title: chatData.title,
        subtitle: chatData.subtitle,
        headerActions: chatData.headerActions,
        content: chatData.content,
        footer: chatData.footer 
    };
    showDetailPane(viewConfig);

    _setLastCommentViewTimestamp(parentId);

    setTimeout(() => {
        _initChatViewInteractions(parentId);
        
        const textarea = document.querySelector('.composer-input');
        if(textarea) {
            textarea.value = prefilledText;
            textarea.focus();
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }, 150);
}

function _renderCommentsView(parentId, parentType, prefilledText = '') {
    const commentsForThisItem = (appState.comments || [])
        .filter(c => c.parentId === parentId && !c.isDeleted)
        .sort((a, b) => _getJSDate(a.createdAt) - _getJSDate(b.createdAt));

    let lastUserId = null;
    const commentsHTML = commentsForThisItem.map(c => {
        const isCurrentUser = appState.currentUser && appState.currentUser.uid === c.userId;
        const when = _getJSDate(c.createdAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
        const canDelete = !!appState.currentUser && (isCurrentUser || appState.userRole === 'Owner');
        const safeText = String(c.content || '').replace(/</g, '&lt;');
        const initials = (c.userName || 'U').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
        
        const isConsecutive = lastUserId === c.userId;
        lastUserId = c.userId;
        
        const showAvatar = !isCurrentUser && !isConsecutive;
        const showUser = !isCurrentUser && !isConsecutive;

        return `
            <div class="comment-item ${isCurrentUser ? 'is-current-user' : ''}" data-id="${c.id}" data-user-id="${c.userId}">
                ${showAvatar ? `<div class="comment-avatar">${initials}</div>` : ''}
                <div class="comment-bubble">
                    <div class="comment-meta">
                        ${showUser ? `<span class="comment-user">${c.userName || 'Pengguna'}</span>` : ''}
                        ${canDelete ? `<button class="btn-icon btn-icon-danger comment-delete" data-action="delete-comment" data-id="${c.id}" title="Hapus"><span class="material-symbols-outlined">delete</span></button>` : ''}
                    </div>
                    <div class="comment-text">${safeText}</div>
                    <div class="comment-date">${when}</div>
                </div>
            </div>
        `;
    }).join('');

    const disabled = isViewer();
    const content = `<div class="comments-view"><div class="comments-view-list" id="comments-list-container">${commentsHTML}</div></div>`;
    
    const emojiList = ['😀','😁','😂','🤣','😊','😍','😎','🤔','🙌','👍','🔥','🎉','✨','💯','❤️','🥳','🚀','🎯','💡','😅'];
    const emojiButtons = emojiList.map(ch => `<button type="button" class="emoji-btn" data-action="insert-emoji" data-char="${ch}">${ch}</button>`).join('');
    
    const footer = `
    <div class="comment-input-row">
        <div class="comment-input-capsule">
            <button class="btn-icon" data-action="toggle-emoji-picker" title="Emoji" ${disabled ? 'disabled' : ''}><span class="material-symbols-outlined">mood</span></button>
            <textarea rows="1" placeholder="Tulis komentar..." ${disabled ? 'disabled' : ''}
              oninput="this.style.height='auto';this.style.height=this.scrollHeight+'px'; const btn=this.closest('.comment-input-row').querySelector('.comment-submit'); if(btn) btn.disabled=(this.value.trim().length===0);"
              onkeydown="if(event.key==='Enter' && !event.shiftKey){ event.preventDefault(); const btn=this.closest('.comment-input-row').querySelector('.comment-submit'); if(btn && !btn.disabled) btn.click(); }">${prefilledText}</textarea>
        </div>
        <button class="comment-submit" data-action="post-comment" aria-label="Kirim" data-parent-id="${parentId}" data-parent-type="${parentType}" ${disabled ? 'disabled' : ''} disabled>
            <span class="material-symbols-outlined">send</span>
        </button>
        <div class="emoji-picker">${emojiButtons}</div>
    </div>
    `;
    
    return { content, footer };
}

function animateNumber(element, to) {
      if (!element || to == null || isNaN(Number(to))) return;
      const currentText = element.textContent || '0';
      let from = parseFormattedNumber(currentText);
      if (from === to && !element.dataset.animated) {
          from = 0;
      }
      if (from === to) return;
      const duration = 600;
      const startTime = performance.now();
      element.dataset.animated = '1';
  
      function step(now) {
          const elapsed = now - startTime;
          if (elapsed >= duration) {
              element.textContent = fmtIDR(to);
              return;
          }
          const progress = elapsed / duration;
          const current = Math.round(from + (to - from) * progress);
          element.textContent = fmtIDR(current);
          requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
  }
  async function _animateDetailPaneDeletion(detailPaneEl) {
    return new Promise(resolve => {
        if (!detailPaneEl) {
            resolve();
            return;
        }

        // 1. Temukan area konten di dalam panel
        const contentArea = detailPaneEl.querySelector('.mobile-detail-content');
        if (!contentArea) {
            // Jika tidak ada konten, langsung tutup saja
            hideMobileDetailPage();
            resolve();
            return;
        }

        // 2. Terapkan kelas CSS untuk memulai animasi "menghilang"
        contentArea.classList.add('detail-content-deleted');

        // 3. Tunggu animasi selesai (sekitar 400ms, sesuai durasi transisi di CSS)
        setTimeout(() => {
            // 4. Tutup panel detail
            hideMobileDetailPage();
            
            // 5. Hapus kelas setelah panel tertutup agar siap untuk item berikutnya
            setTimeout(() => {
                contentArea.classList.remove('detail-content-deleted');
                resolve();
            }, 350); // Delay tambahan untuk transisi penutupan panel

        }, 400);
    });
}
  function _markInvalid(input, message) {
      input.classList.add('is-invalid');
      let msg = input.parentElement?.querySelector?.('.input-error-text');
      if (!msg) {
          msg = document.createElement('small');
          msg.className = 'input-error-text';
          input.parentElement?.appendChild(msg);
      }
      msg.textContent = message || 'Input tidak valid';
  }
  function _clearInvalid(input) {
      input.classList.remove('is-invalid');
      const msg = input.parentElement?.querySelector?.('.input-error-text');
      if (msg) msg.remove();
  }
  function _attachClientValidation(form) {
      if (!form) return;
      // Example validators for Pengeluaran form
      const validators = {
          'pengeluaran-jumlah': (el) => {
              const val = parseFormattedNumber(el.value);
              return val > 0 ? null : 'Jumlah harus lebih dari 0';
          },
          'pengeluaran-deskripsi': (el) => el.value.trim() ? null : 'Deskripsi wajib diisi',
          'pengeluaran-tanggal': (el) => el.value ? null : 'Tanggal wajib diisi'
      };
      Object.keys(validators).forEach(id => {
          const el = form.querySelector(`#${id}`);
          if (!el) return;
          el.addEventListener('blur', () => {
              const error = validators[id](el);
              if (error) _markInvalid(el, error); else _clearInvalid(el);
          });
          el.addEventListener('input', () => _clearInvalid(el));
      });
      // On submit, block if invalid
      form.addEventListener('submit', (e) => {
          let firstInvalid = null;
          Object.keys(validators).forEach(id => {
              const el = form.querySelector(`#${id}`);
              if (!el) return;
              const error = validators[id](el);
              if (error) {
                  _markInvalid(el, error);
                  if (!firstInvalid) firstInvalid = el;
              }
          });
          if (firstInvalid) {
              e.preventDefault();
              firstInvalid.focus();
          }
      }, true);
  }
  
  function _getEmptyStateHTML({ icon = 'inbox', title = 'Tidak Ada Data', desc = 'Belum ada data untuk ditampilkan di sini.', action, actionLabel, actionData = {}, size = '' } = {}) {
    const dataAttributes = Object.entries(actionData).map(([key, value]) => `data-${key}="${value}"`).join(' ');

    const actionButtonHTML = (action && actionLabel)
        ? `<div class="empty-state-actions">
             <button class="btn btn-primary" data-action="${action}" ${dataAttributes}>
               <span class="material-symbols-outlined">${icon === 'inbox' ? 'add' : 'add_circle'}</span>
               <span>${actionLabel}</span>
             </button>
           </div>`
        : '';
    
    const sizeClass = size === 'small' ? 'empty-state-small' : '';

    return `
        <div class="empty-state ${sizeClass}">
            <span class="material-symbols-outlined empty-state-icon">${icon}</span>
            <div class="empty-state-title">${title}</div>
            <p class="empty-state-description">${desc}</p>
            ${actionButtonHTML}
        </div>
    `;
}

function _getSkeletonForListPage() {
    const listItem = `
        <div class="skeleton-list-item">
            <div class="skeleton-text-container">
                <div class="skeleton skeleton-text" style="width: 60%;"></div>
                <div class="skeleton skeleton-text skeleton-text-sm" style="width: 40%;"></div>
            </div>
            <div class="skeleton skeleton-text" style="width: 25%; height: 24px;"></div>
        </div>
    `;
    return `
        <div class="skeleton-wrapper">
            <div class="skeleton-toolbar">
                <div class="skeleton skeleton-search"></div>
                <div class="skeleton skeleton-button"></div>
            </div>
            <div class="skeleton-toolbar" style="height: 36px; gap: 0.5rem;">
                <div class="skeleton" style="width: 100px; height: 100%;"></div>
                <div class="skeleton" style="width: 100px; height: 100%;"></div>
                <div class="skeleton" style="width: 100px; height: 100%;"></div>
            </div>
            <div>
                ${Array(5).fill(listItem).join('')}
            </div>
        </div>
    `;
}

function _getSkeletonLoaderHTML(pageType) {
    const _getSkeletonForListPage = () => {
        const listItem = `
            <div class="skeleton-list-item">
                <div class="skeleton-text-container">
                    <div class="skeleton skeleton-text" style="width: 60%;"></div>
                    <div class="skeleton skeleton-text skeleton-text-sm" style="width: 40%;"></div>
                </div>
                <div class="skeleton skeleton-text" style="width: 25%; height: 24px;"></div>
            </div>
        `;
        return `
            <div class="skeleton-wrapper">
                <div class="skeleton-toolbar">
                    <div class="skeleton skeleton-search"></div>
                    <div class="skeleton skeleton-button"></div>
                </div>
                <div class="skeleton-toolbar" style="height: 36px; gap: 0.5rem;">
                    <div class="skeleton" style="width: 100px; height: 100%;"></div>
                    <div class="skeleton" style="width: 100px; height: 100%;"></div>
                    <div class="skeleton" style="width: 100px; height: 100%;"></div>
                </div>
                <div>
                    ${Array(5).fill(listItem).join('')}
                </div>
            </div>
        `;
    };

    switch (pageType) {
        case 'dashboard':
            return `
                <div class="skeleton-wrapper">
                    <div class="dashboard-balance-grid">
                        <div class="skeleton skeleton-card" style="height: 100px;"></div>
                        <div class="skeleton skeleton-card" style="height: 100px;"></div>
                    </div>
                    <div class="dashboard-actions-grid" style="margin-top: 1rem; margin-bottom: 1rem;">
                        ${Array(5).fill('').map(() => `
                            <div>
                                <div class="skeleton skeleton-icon"></div>
                                <div class="skeleton skeleton-text skeleton-text-sm" style="width: 100%; margin: 0 auto;"></div>
                            </div>
                        `).join('')}
                    </div>
                    <div class="skeleton skeleton-title"></div>
                    <div class="skeleton skeleton-card" style="height: 150px;"></div>
                </div>
            `;
        case 'tagihan':
        case 'jurnal':
        case 'stok':
        case 'pemasukan':
        case 'log_aktivitas':
            return _getSkeletonForListPage();
        case 'pengeluaran':
        case 'absensi':
            const formRow = `
                <div style="display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 1rem;">
                    <div class="skeleton skeleton-text-sm" style="width: 30%;"></div>
                    <div class="skeleton skeleton-text" style="height: 40px;"></div>
                </div>
            `;
            return `
                <div class="skeleton-wrapper">
                    <div class="skeleton-toolbar" style="height: 36px; gap: 0.5rem;">
                        <div class="skeleton" style="width: 100px; height: 100%;"></div>
                        <div class="skeleton" style="width: 100px; height: 100%;"></div>
                    </div>
                    <div class="skeleton skeleton-card" style="padding: 1rem;">
                        ${Array(3).fill(formRow).join('')}
                        <div class="skeleton" style="height: 44px; margin-top: 1rem;"></div>
                    </div>
                </div>
            `;
        case 'laporan':
            return `
                <div class="skeleton-wrapper">
                    <div class="skeleton skeleton-card" style="height: 60px;"></div>
                    <div class="skeleton skeleton-card" style="height: 250px;"></div>
                    <div class="skeleton skeleton-card" style="height: 200px;"></div>
                </div>
            `;
        case 'pengaturan':
            const settingItem = `
                <div class="skeleton-list-item">
                    <div class="skeleton skeleton-avatar" style="width: 40px; height: 40px; border-radius: 10px;"></div>
                    <div class="skeleton-text-container">
                        <div class="skeleton skeleton-text" style="width: 50%;"></div>
                    </div>
                </div>
            `;
            return `
                <div class="skeleton-wrapper">
                    <div style="display: flex; flex-direction: column; align-items: center; gap: 1rem; background-color: var(--panel); border: 1px solid var(--line); padding: 1.5rem; border-radius: var(--radius-lg);">
                        <div class="skeleton skeleton-avatar" style="width: 64px; height: 64px;"></div>
                        <div class="skeleton skeleton-text" style="width: 40%;"></div>
                        <div class="skeleton skeleton-text-sm" style="width: 60%;"></div>
                    </div>
                     <div class="skeleton skeleton-title" style="width: 30%;"></div>
                    <div>${Array(4).fill(settingItem).join('')}</div>
                </div>
            `;
        default:
            return '<div class="loader-container"><div class="loader-spinner"></div></div>';
    }
}

  async function initializeAppSession(user) {
      appState.currentUser = user;
      const userDocRef = doc(membersCol, user.uid);
      try {
          let userDoc = await getDoc(userDocRef);
          if (!userDoc.exists()) {
              const isOwner = user.email.toLowerCase() === OWNER_EMAIL.toLowerCase();
              const initialData = {
                  email: user.email,
                  name: user.displayName,
                  photoURL: user.photoURL,
                  role: isOwner ? 'Owner' : 'Viewer',
                  status: isOwner ? 'active' : 'pending',
                  createdAt: serverTimestamp(),
                  updatedAt: serverTimestamp()
              };
              await setDoc(userDocRef, initialData);
              userDoc = await getDoc(userDocRef);
          }
          const userData = userDoc.data();
          Object.assign(appState, {
              userRole: userData.role,
              userStatus: userData.status
          });
          attachRoleListener(userDocRef);
          if (appState.userRole === 'Owner') listenForPendingUsers();
          localDB.pending_conflicts.count(count => {
            appState.pendingConflictsCount = count;
            renderBottomNav();
            renderSidebar();
        });

          $('#global-loader').style.display = 'none';
          $('#app-shell').style.display = 'flex';
          await loadAllLocalDataToState();
          await _verifyDataIntegrity();
          // Perbaiki data lama yang sempat tidak tersinkron (bill tidak mengikuti expense)
          await _repairStaleBillsFromExpenses();
          _calculateAndCacheDashboardTotals();
          renderUI();
          updateSyncIndicator();
          if (appState.justLoggedIn) {
              toast('success', `Selamat datang kembali, ${userData.name}!`);
              appState.justLoggedIn = false;
          }
          if (navigator.onLine) {
              await syncFromServer();
              // Tawarkan pemulihan pinjaman yatim sekali setelah sinkron awal
              try { await _offerRestoreOrphanLoansOnce(); } catch(_) {}
              await syncToServer({ silent: true }); 
              subscribeToMasterData(); 
              listenForNotifications();
          } else {
              toast('info', 'Anda sedang offline. Menampilkan data yang tersimpan di perangkat.');
          }
      } catch (error) {
          console.error("Gagal inisialisasi sesi:", error);
          toast('error', 'Gagal memuat profil. Menggunakan mode terbatas.');
          $('#global-loader').style.display = 'none';
          $('#app-shell').style.display = 'flex';
          renderUI();
      }
  }
  
function toast(type, message, duration = 4000, options = {}) {
    if (currentFeedbackModal) {
        currentFeedbackModal.close();
    }

    const isSnackbar = type === 'info' || !!options.actionText;
    const modalBg = document.createElement('div');
    modalBg.className = 'feedback-modal-bg';
    if (isSnackbar) {
        modalBg.classList.add('is-snackbar');
    }

    const modalContent = document.createElement('div');
    modalContent.className = 'feedback-modal-content';

    let promiseResolver;
    let timeoutId = null;

    const close = () => {
        clearTimeout(timeoutId);
        modalBg.classList.remove('show');
        modalBg.addEventListener('transitionend', () => {
            modalBg.remove();
            if (currentFeedbackModal && currentFeedbackModal.element === modalBg) {
                currentFeedbackModal = null;
            }
            if (promiseResolver) {
                promiseResolver({ dismissed: true });
                promiseResolver = null;
            }
        }, { once: true });
    };

    if (isSnackbar) {
        // Gmail-like snackbar: dark surface, message + link-style action + close X
        const variant = options.variant || null;

        const textEl = document.createElement('p');
        textEl.className = 'feedback-message';
        textEl.textContent = message;
        modalContent.appendChild(textEl);

        if (options.actionText && options.onAction) {
            const actionButton = document.createElement('button');
            actionButton.className = 'feedback-action-btn';
            actionButton.textContent = options.actionText;
            actionButton.addEventListener('click', (e) => {
                e.stopPropagation();
                options.onAction();
                close();
            });
            modalContent.appendChild(actionButton);
        }

        const closeButton = document.createElement('button');
        closeButton.className = 'snackbar-close';
        closeButton.innerHTML = '<span class="material-symbols-outlined">close</span>';
        closeButton.addEventListener('click', (e) => { e.stopPropagation(); close(); });
        modalContent.appendChild(closeButton);

        // Countdown progress bar at bottom
        const progress = document.createElement('div');
        progress.className = 'snackbar-progress';
        const bar = document.createElement('div');
        bar.className = 'snackbar-progress-bar';
        bar.style.animationDuration = `${duration}ms`;
        progress.appendChild(bar);
        modalContent.appendChild(progress);

        // Auto close
        timeoutId = setTimeout(close, duration);

        // Swipe-to-dismiss (touch)
        let startX = 0;
        let currentX = 0;
        let isDragging = false;
        const onTouchStart = (e) => {
            if (timeoutId) clearTimeout(timeoutId);
            startX = e.touches[0].clientX;
            currentX = startX;
            isDragging = true;
            modalContent.style.transition = 'none';
        };
        const onTouchMove = (e) => {
            if (!isDragging) return;
            currentX = e.touches[0].clientX;
            const diffX = currentX - startX;
            modalContent.style.transform = `translateY(0) translateX(${diffX}px)`;
        };
        const onTouchEnd = () => {
            if (!isDragging) return;
            isDragging = false;
            const diffX = currentX - startX;
            const threshold = modalContent.offsetWidth * 0.35;
            modalContent.style.transition = 'transform 0.25s ease, opacity 0.2s ease';
            if (Math.abs(diffX) > threshold) {
                const direction = diffX > 0 ? 1 : -1;
                modalContent.style.opacity = '0';
                modalContent.style.transform = `translateY(0) translateX(${direction * (modalContent.offsetWidth + 40)}px)`;
                setTimeout(() => close(), 220);
            } else {
                modalContent.style.transform = 'translateY(0) translateX(0)';
                timeoutId = setTimeout(close, Math.max(1500, duration * 0.4));
            }
        };
        modalContent.addEventListener('touchstart', onTouchStart, { passive: true });
        modalContent.addEventListener('touchmove', onTouchMove, { passive: true });
        modalContent.addEventListener('touchend', onTouchEnd);

    } else { // Ini adalah mode modal feedback layar penuh (syncing, success, error)
        const iconContainer = document.createElement('div');
        iconContainer.className = 'feedback-icon';
        const textEl = document.createElement('p');
        textEl.className = 'feedback-message';
        textEl.textContent = message;

        if (type === 'syncing') {
            iconContainer.innerHTML = '<div class="spinner"></div>';
        } else if (type === 'success') {
            iconContainer.innerHTML = `<svg viewBox="0 0 100 100"><circle class="success-animation-circle" cx="50" cy="50" r="42" stroke="#22c55e" stroke-width="8" fill="transparent" /><polyline class="success-animation-checkmark" points="30,55 45,70 70,40" stroke="#22c55e" stroke-width="8" fill="transparent" stroke-linecap="round" stroke-linejoin="round" /></svg>`;
        } else if (type === 'error') {
            iconContainer.innerHTML = `<svg viewBox="0 0 100 100"><circle class="error-animation-circle" cx="50" cy="50" r="42" stroke="#ef4444" stroke-width="8" fill="transparent" /><line class="error-animation-cross-1" x1="35" y1="35" x2="65" y2="65" stroke="#ef4444" stroke-width="8" stroke-linecap="round" /><line class="error-animation-cross-2" x1="65" y1="35" x2="35" y2="65" stroke="#ef4444" stroke-width="8" stroke-linecap="round" /></svg>`;
        } else {
            iconContainer.innerHTML = `<span class="material-symbols-outlined" style="font-size: 72px; color: var(--primary);">${type === 'info' ? 'info' : 'notifications'}</span>`;
        }

        modalContent.appendChild(iconContainer);
        modalContent.appendChild(textEl);

        if (type !== 'syncing') {
            timeoutId = setTimeout(close, duration);
        }
    }

    modalBg.appendChild(modalContent);
    document.body.appendChild(modalBg);
    setTimeout(() => modalBg.classList.add('show'), 10);

    modalBg.addEventListener('click', (e) => {
        if (e.target === modalBg) close();
    });
    currentFeedbackModal = { element: modalBg, close };

    if (type === 'syncing') {
        return { close: currentFeedbackModal.close };
    } else {
        return new Promise(resolve => {
            promiseResolver = resolve;
        });
    }
}

function hideToast() {
    if (currentFeedbackModal) {
        currentFeedbackModal.close();
    }
}

function _initToastSwipeHandler() {
      const container = $('#popup-container');
      if (!container) return;
  
      let startX = 0;
      let currentX = 0;
      let isDragging = false;
      let animationFrameId = null;
  
      // Fungsi untuk mengupdate posisi toast saat digeser
      const updatePosition = () => {
          if (!isDragging) return;
          const diffX = currentX - startX;
          container.style.transform = `translateX(calc(-50% + ${diffX}px))`; // Geser toast sesuai gerakan jari
          animationFrameId = requestAnimationFrame(updatePosition);
      };
  
      container.addEventListener('touchstart', (e) => {
          // Hanya mulai jika ada notifikasi yang tampil
          if (!container.classList.contains('show')) return;
          
          // Hapus timeout otomatis jika pengguna mulai berinteraksi
          if (toastTimeout) clearTimeout(toastTimeout);
  
          startX = e.touches[0].clientX;
          isDragging = true;
          
          // Hapus transisi agar pergerakan mengikuti jari secara langsung
          container.style.transition = 'none';
          
          // Mulai loop animasi untuk pergerakan yang mulus
          animationFrameId = requestAnimationFrame(updatePosition);
      }, { passive: true });
  
      container.addEventListener('touchmove', (e) => {
          if (!isDragging) return;
          currentX = e.touches[0].clientX;
      }, { passive: true });
  
      container.addEventListener('touchend', (e) => {
          if (!isDragging) return;
          
          isDragging = false;
          cancelAnimationFrame(animationFrameId); // Hentikan loop animasi
  
          const diffX = e.changedTouches[0].clientX - startX;
          const threshold = container.offsetWidth * 0.4; // Harus digeser sejauh 40% dari lebar toast
  
          // Kembalikan transisi untuk animasi kembali atau keluar
          container.style.transition = 'transform 0.3s ease, opacity 0.3s ease, bottom 0.35s ease';
  
          if (Math.abs(diffX) > threshold) {
              // Jika swipe cukup jauh, geser keluar dan hilangkan
              const direction = diffX > 0 ? 1 : -1;
              container.style.transform = `translateX(calc(-50% + ${direction * container.offsetWidth}px))`;
              container.style.opacity = '0';
              
              // Panggil hideToast setelah animasi keluar selesai
              setTimeout(() => {
                  hideToast();
                  // Reset style setelah hilang
                  container.style.transform = 'translateX(-50%)';
                  container.style.opacity = '1';
              }, 300);
  
          } else {
              // Jika tidak cukup jauh, kembalikan ke posisi semula
              container.style.transform = 'translateX(-50%)';
          }
      });
  }
  
  async function loadAllLocalDataToState() {
      console.log("Memuat data dari database lokal ke state...");
      try {
          const data = await localDB.transaction('r', localDB.tables, async () => {
              const results = {};
              const tablesToLoad = {
                  projects: localDB.projects,
                  suppliers: localDB.suppliers,
                  workers: localDB.workers,
                  materials: localDB.materials,
                  staff: localDB.staff,
                  professions: localDB.professions,
                  operational_categories: localDB.operational_categories,
                  material_categories: localDB.material_categories,
                  other_categories: localDB.other_categories,
                  fundingCreditors: localDB.funding_creditors
              };
              for (const key in tablesToLoad) {
                  results[key] = await tablesToLoad[key].toArray();
              }
              results.incomes = await localDB.incomes.where('isDeleted').notEqual(1).and(item => item.syncState !== 'pending_delete').toArray();
              results.fundingSources = await localDB.funding_sources.where('isDeleted').notEqual(1).and(item => item.syncState !== 'pending_delete').toArray();
              results.expenses = await localDB.expenses.where('isDeleted').notEqual(1).and(item => item.syncState !== 'pending_delete').filter(item => !!item.date).toArray();
              results.bills = await localDB.bills.where('isDeleted').notEqual(1).and(item => item.syncState !== 'pending_delete').filter(item => !!item.dueDate).toArray();
              results.attendanceRecords = await localDB.attendance_records.where('isDeleted').notEqual(1).and(item => item.syncState !== 'pending_delete').filter(item => !!item.date).toArray();
              results.stockTransactions = await localDB.stock_transactions.where('isDeleted').notEqual(1).and(item => item.syncState !== 'pending_delete').filter(item => !!item.date).toArray();              
              return results;
          });
          Object.assign(appState, data);
          console.log("Data lokal berhasil dimuat.");
      } catch (error) {
          console.error("Gagal memuat data lokal:", error);
      }
  }
  
  async function syncFromServer() {
    if (!navigator.onLine) return;
    console.log("Memulai sinkronisasi cerdas dari server...");

    const lastSync = getLastSyncTimestamp();
    console.log(`Hanya akan mengambil data yang berubah setelah: ${lastSync.toISOString()}`);

    try {
        const collectionsToSync = {
            projects: projectsCol,
            suppliers: suppliersCol,
            workers: workersCol,
            materials: materialsCol,
            staff: staffCol,
            professions: professionsCol,
            operational_categories: opCatsCol,
            material_categories: matCatsCol,
            other_categories: otherCatsCol,
            funding_creditors: fundingCreditorsCol,
            expenses: expensesCol,
            bills: billsCol,
            incomes: incomesCol,
            funding_sources: fundingSourcesCol,
            attendance_records: attendanceRecordsCol,
            stock_transactions: stockTransactionsCol,
            comments: commentsCol
        };

        let needsDashboardRecalc = false;

        for (const [tableName, collectionRef] of Object.entries(collectionsToSync)) {
            const q = query(collectionRef, where("updatedAt", ">", lastSync));
            const snapshot = await getDocs(q);

            if (!snapshot.empty) {
                console.log(`Sinkronisasi: Menerima ${snapshot.size} pembaruan dari '${tableName}'.`);
                const changes = snapshot.docs.map(doc => ({
                    type: doc.data().isDeleted === 1 ? 'removed' : 'modified',
                    doc: { id: doc.id, ...doc.data() }
                }));

                await _applyChangesToStateAndUI(changes, tableName);

                if (['incomes', 'expenses', 'bills', 'attendance_records'].includes(tableName)) {
                    needsDashboardRecalc = true;
                }
            }
        }

        if (needsDashboardRecalc) {
            _calculateAndCacheDashboardTotals();
        }

        setLastSyncTimestamp();
        updateSyncIndicator();

    } catch (e) {
        console.error("Sinkronisasi dari server gagal:", e);
    }
}

  window.syncFromServer = syncFromServer;

  // Attempt to auto-rebase local changes on top of latest server data
  async function _autoRebaseOnConflict(tableName, docRef, localPayload) {
    try {
      const serverSnap = await getDoc(docRef);
      if (!serverSnap.exists()) return false;
      const serverData = serverSnap.data() || {};
      // Do not auto-rebase if server has been soft-deleted
      if (serverData.isDeleted === 1 && localPayload?.isDeleted !== 1) return false;

      // Build a shallow merged record: server wins for protected fields, local overrides others
      const protectedKeys = new Set(['id', 'rev', 'updatedAt', 'createdAt']);
      const merged = { ...serverData };
      for (const [k, v] of Object.entries(localPayload || {})) {
        if (protectedKeys.has(k)) continue;
        if (v === undefined) continue;
        merged[k] = v;
      }
      merged.id = serverData.id || localPayload.id;

      await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(docRef);
        const base = snap.exists() ? (snap.data() || {}) : {};
        const nextRev = (base.rev || 0) + 1;
        transaction.set(docRef, { ...merged, rev: nextRev, updatedAt: serverTimestamp() }, { merge: true });
      });

      // Align local copy with server after rebase
      const finalSnap = await getDoc(docRef);
      if (finalSnap.exists()) {
        const final = finalSnap.data();
        await localDB[tableName].update(merged.id, {
          syncState: 'synced',
          serverRev: (final.rev || 0),
          updatedAt: _getJSDate(final.updatedAt)
        });
        // Also reflect in-memory state if present
        try {
          const idx = (appState[tableName] || []).findIndex(it => it.id === merged.id);
          if (idx > -1) appState[tableName][idx] = { ...(appState[tableName][idx] || {}), ...merged, serverRev: (final.rev || 0) };
        } catch {}
      }
      return true;
    } catch (err) {
      console.warn('[auto-rebase] failed:', err);
      return false;
    }
  }

  async function syncToServer(options = {}) {
    if (!navigator.onLine || appState.isSyncing || _isQuotaExceeded()) {
        if (_isQuotaExceeded()) console.error('Kuota server habis. Sinkronisasi ditunda.');
        return;
    }

    appState.isSyncing = true;
    
    try {
        const progress = appState.syncProgress;
        progress.completed = 0;
        progress.total = 0;
        progress.currentAction = 'Menghitung...'; // BARU: Teks awal

        const tablesToCount = ['expenses', 'bills', 'incomes', 'funding_sources', 'attendance_records', 'stock_transactions', 'comments'];
        for (const table of tablesToCount) {
            progress.total += await localDB[table].where('syncState').anyOf('pending_create', 'pending_update', 'pending_delete').count();
        }
        progress.total += await localDB.pending_payments.count();
        
        if (progress.total === 0) {
            appState.isSyncing = false;
            updateSyncIndicator();
            return;
        }

        progress.active = true;
        updateSyncIndicator();
        
        const pendingPayments = await localDB.pending_payments.toArray();
        if (pendingPayments.length > 0) {
            for (const payment of pendingPayments) {
                try {
                    const billRef = doc(billsCol, payment.billId);
                    const paymentRef = doc(collection(billRef, 'payments'));
                    
                    let attachmentUrl = null;
                    if (payment.localAttachmentId) {
                        const fileRecord = await localDB.files.get(payment.localAttachmentId);
                        if (fileRecord && fileRecord.file) {
                            attachmentUrl = await _uploadFileToCloudinary(fileRecord.file);
                            if (attachmentUrl) await localDB.files.delete(payment.localAttachmentId);
                        }
                    }

                    const paymentData = {
                        amount: payment.amount,
                        date: Timestamp.fromDate(payment.date),
                        createdAt: Timestamp.fromDate(payment.createdAt),
                        ...(payment.workerId && { workerId: payment.workerId }),
                        ...(payment.workerName && { workerName: payment.workerName }),
                        ...(attachmentUrl && { attachmentUrl: attachmentUrl }),
                    };
                    await setDoc(paymentRef, paymentData);
                    await localDB.pending_payments.delete(payment.id);
                    progress.completed++;
                } catch (e) {
                    console.error(`Gagal mengirim pembayaran tertunda untuk billId ${payment.billId}:`, e);
                }
            }
        }

        for (const tableName of tablesToCount) {
            progress.currentAction = `Sync ${tableName.replace(/_/g, ' ')}...`;
            updateSyncIndicator();
    
            const collectionRef = collection(db, 'teams', TEAM_ID, tableName);

            const itemsToDeletePermanently = await localDB[tableName].where('syncState').equals('pending_delete').toArray();
            if (itemsToDeletePermanently.length > 0) {
                const deleteBatch = writeBatch(db);
                itemsToDeletePermanently.forEach(item => deleteBatch.delete(doc(collectionRef, item.id)));
                await deleteBatch.commit();
                await localDB[tableName].bulkDelete(itemsToDeletePermanently.map(item => item.id));
                progress.completed += itemsToDeletePermanently.length;
            }

            const itemsToSync = await localDB[tableName].where('syncState').anyOf('pending_create', 'pending_update').toArray();
            for (const item of itemsToSync) {
                const { syncState, serverRev: localBaseRev = 0, ...firestoreData } = item;
                const isSoftDeleteOperation = (syncState === 'pending_update' && firestoreData.isDeleted === 1);
                
                if (firestoreData.attachmentNeedsSync === 1 && firestoreData.localAttachmentId) {
                    const fileRecord = await localDB.files.get(firestoreData.localAttachmentId);
                    if (fileRecord && fileRecord.file) {
                        const uploadedUrl = await _uploadFileToCloudinary(fileRecord.file);
                        if (uploadedUrl) {
                            firestoreData.attachmentUrl = uploadedUrl;
                            firestoreData.attachmentNeedsSync = 0;
                            await localDB.files.delete(firestoreData.localAttachmentId);
                            firestoreData.localAttachmentId = null;
                        } else {
                            console.warn(`Gagal mengunggah lampiran untuk ${tableName}:${firestoreData.id}, sinkronisasi item ini ditunda.`);
                            continue;
                        }
                    }
                }
                
                Object.keys(firestoreData).forEach(key => { if (firestoreData[key] === undefined) delete firestoreData[key]; });

                const docRef = doc(collectionRef, firestoreData.id);
                
                try {
                    await runTransaction(db, async (transaction) => {
                        const serverSnap = await transaction.get(docRef);
                        const serverRev = serverSnap.exists() ? (serverSnap.data().rev || 0) : 0;
                        
                        if (serverSnap.exists() && serverRev > localBaseRev && syncState === 'pending_update' && !isSoftDeleteOperation) {
                            throw new Error(`Conflict detected on ${tableName}:${firestoreData.id}.`);
                        } else {
                            const nextRev = serverRev + 1;
                            transaction.set(docRef, { ...firestoreData, rev: nextRev, updatedAt: serverTimestamp() }, { merge: true });
                        }
                    });
                    
                    if (isSoftDeleteOperation) {
                        await localDB[tableName].update(firestoreData.id, {
                            syncState: 'synced',
                            updatedAt: new Date()
                        });
                        console.log(`[syncToServer] Soft delete untuk ${tableName}:${firestoreData.id} berhasil disinkronkan. Item dipertahankan di lokal dengan flag isDeleted:1.`);
                    } else {
                        const finalDocSnap = await getDoc(docRef);
                        if (finalDocSnap.exists()) {
                            const finalServerData = finalDocSnap.data();
                            await localDB[tableName].update(firestoreData.id, {
                                syncState: 'synced',
                                serverRev: finalServerData.rev,
                                updatedAt: _getJSDate(finalServerData.updatedAt) 
                            });
                        } else {
                             await localDB[tableName].delete(firestoreData.id);
                        }
                    }
                } catch (e) {
                    if (e.message.includes("Conflict detected")) {
                        let handled = false;
                        if (AUTO_REBASE_TABLES.has(tableName)) {
                            handled = await _autoRebaseOnConflict(tableName, docRef, firestoreData);
                        }
                        if (!handled) {
                            const key = `${tableName}:${firestoreData.id}`;
                            if (!appState._conflictLogSet) appState._conflictLogSet = new Set();
                            if (!appState._conflictLogSet.has(key)) {
                                console.error(e.message);
                                appState._conflictLogSet.add(key);
                            }
                            await localDB.pending_conflicts.add({
                                table: tableName, docId: firestoreData.id, payload: firestoreData,
                                baseRev: localBaseRev, serverRev: (await getDoc(docRef)).data()?.rev || 0, when: new Date()
                            });
                            await localDB[tableName].update(firestoreData.id, { syncState: 'conflict' });
                            if (!appState._conflictToastShown) {
                                appState._conflictToastShown = true;
                                toast('info', 'Konflik sinkron terdeteksi.', 6000, {
                                    actionText: 'Lihat',
                                    onAction: () => handleOpenConflictsPanel()
                                });
                            }
                        }
                    } else {
                        throw e;
                    }
                }
                progress.completed++;
            }
        }
        
        _setQuotaExceededFlag(false);
    } catch (error) {
        console.error("Sync to server error:", error);
        if (error.code === 'resource-exhausted') {
            _setQuotaExceededFlag(true);
        }
    } finally {
        appState.isSyncing = false;
        appState.syncProgress.active = false;
        appState.syncProgress.currentAction = ''; // BARU: Reset teks aksi
        updateSyncIndicator();
    }
}
window.addEventListener('online', syncToServer);

async function _applyChangesToStateAndUI(changes, collectionName) {
    if (!appState[collectionName]) return;

    for (const change of changes) {
        const incomingData = change.doc;
        const incomingServerRev = (incomingData && (incomingData.rev || incomingData.serverRev)) || 0;
        const localTable = localDB[collectionName];
        if (!localTable) continue;

        const isMarkedAsDeleted = incomingData.isDeleted === 1;

        if (change.type === "removed" || isMarkedAsDeleted) {
            if (isMarkedAsDeleted) {
                await localTable.put({ ...(await localTable.get(incomingData.id) || {}), ...incomingData, serverRev: incomingServerRev, syncState: 'synced' });

                const index = appState[collectionName].findIndex(item => item.id === incomingData.id);
                if (index > -1) {
                    appState[collectionName][index] = { ...appState[collectionName][index], ...incomingData, serverRev: incomingServerRev };
                }
                console.log(`[applyChanges] Menerima update soft delete untuk ${collectionName}:${incomingData.id}. Item dipertahankan dengan flag.`);
            } else {
                await localTable.delete(incomingData.id);
                const index = appState[collectionName].findIndex(item => item.id === incomingData.id);
                if (index > -1) appState[collectionName].splice(index, 1);
            }
            
            if (appState.activePage === 'tagihan' && collectionName === 'bills') _removeItemFromListWithAnimation(incomingData.id);
            if (appState.activePage === 'pemasukan' && (collectionName === 'incomes' || collectionName === 'funding_sources')) _removeItemFromListWithAnimation(incomingData.id);

        } else {
            const existingItemInDB = await localTable.get(incomingData.id);

            if (existingItemInDB && existingItemInDB.syncState && existingItemInDB.syncState.startsWith('pending_')) {
                const mergedData = { ...existingItemInDB, ...incomingData, serverRev: incomingServerRev, syncState: 'synced' };
                await localTable.put(mergedData);

                const index = appState[collectionName].findIndex(item => item.id === incomingData.id);
                if (index > -1) {
                    appState[collectionName][index] = mergedData;
                }
                if (collectionName === 'comments') {
                    upsertCommentInUI(mergedData, 'modified'); // Kirim sebagai 'modified'
                }
                continue; // Hentikan proses di sini agar tidak dieksekusi lagi di bawah
            }            
            const mergedData = { ...(existingItemInDB || {}), ...incomingData, serverRev: incomingServerRev, syncState: 'synced' };
            await localTable.put(mergedData);
            
            const index = appState[collectionName].findIndex(item => item.id === incomingData.id);
            if (index > -1) {
                appState[collectionName][index] = mergedData;
                if (appState.activePage === 'tagihan' && collectionName === 'bills') {
                    _updateItemInListWithAnimation(mergedData.id, _getBillsListHTML([mergedData]));
                }
                if (appState.activePage === 'pemasukan' && (collectionName === 'incomes' || collectionName === 'funding_sources')) {
                    const type = collectionName === 'incomes' ? 'termin' : 'pinjaman';
                    _updateItemInListWithAnimation(mergedData.id, _getSinglePemasukanHTML(mergedData, type));
                }
                if (appState.activePage === 'tagihan' && collectionName === 'expenses') {
                    const targetId = `expense-${mergedData.id}`;
                    const doItem = {
                        id: targetId,
                        expenseId: mergedData.id,
                        description: mergedData.description,
                        amount: 0,
                        dueDate: mergedData.date,
                        status: 'delivery_order',
                        type: mergedData.type,
                        projectId: mergedData.projectId,
                        paidAmount: 0,
                        isDeleted: mergedData.isDeleted || 0
                    };
                    const el = document.querySelector(`[data-id="${targetId}"]`);
                    if (mergedData.status === 'delivery_order') {
                        if (el) {
                            _updateItemInListWithAnimation(targetId, _getBillsListHTML([doItem]));
                        } else {
                            try { await _renderTagihanContent(); } catch {}
                        }
                    } else if (el) {
                        await _removeItemFromListWithAnimation(targetId);
                    }
                }

            } else {
                appState[collectionName].unshift(mergedData);
                 if (appState.activePage === 'tagihan' && collectionName === 'bills') {
                    _addItemToListWithAnimation('#sub-page-content .dense-list-container', _getBillsListHTML([mergedData]));
                }
                 if (appState.activePage === 'pemasukan' && (collectionName === 'incomes' || collectionName === 'funding_sources')) {
                    const type = collectionName === 'incomes' ? 'termin' : 'pinjaman';
                    _addItemToListWithAnimation('#pemasukan-list-container', _getSinglePemasukanHTML(mergedData, type));
                }
                 if (appState.activePage === 'tagihan' && collectionName === 'expenses' && mergedData.status === 'delivery_order') {
                    const doItem = {
                        id: `expense-${mergedData.id}`,
                        expenseId: mergedData.id,
                        description: mergedData.description,
                        amount: 0,
                        dueDate: mergedData.date,
                        status: 'delivery_order',
                        type: mergedData.type,
                        projectId: mergedData.projectId,
                        paidAmount: 0,
                        isDeleted: mergedData.isDeleted || 0
                    };
                    _addItemToListWithAnimation('#sub-page-content .dense-list-container', _getBillsListHTML([doItem]));
                 }
            }
        }
    }
}

async function _uploadFileToFirebaseStorage(file, folder = 'attachments') {
      if (!file) return null;
      if (isViewer()) {
          toast('error', 'Viewer tidak dapat mengunggah file.');
          return null;
      }
      toast('syncing', `Mengunggah ${file.name}...`);
      try {
          const timestamp = Date.now();
          const uniqueFileName = `${timestamp}-${file.name}`;
          const storageRef = ref(storage, `${folder}/${uniqueFileName}`);
          const uploadTask = await uploadBytesResumable(storageRef, file);
          const downloadURL = await getDownloadURL(uploadTask.ref);
          hideToast();
          return downloadURL;
      } catch (error) {
          console.error("Upload error:", error);
          toast('error', 'Gagal mengunggah file.');
          return null;
      }
  }
  
  const fetchAndCacheData = async (key, col, order = 'createdAt') => {
    try {
        const snap = await getDocs(query(col, orderBy(order, 'desc')));
        const firestoreData = snap.docs.map(d => ({ 
            id: d.id, 
            ...d.data(),
            syncState: 'synced' // Tandai sebagai sudah sinkron
        }));

        if (localDB[key]) {
            await localDB[key].bulkPut(firestoreData);
        }

        appState[key] = firestoreData;

    } catch (e) {
        console.error(`Gagal memuat data untuk ${key}:`, e);
        if(localDB[key]) {
            appState[key] = await localDB[key].toArray();
        } else {
            appState[key] = appState[key] || [];
        }
        toast('error', `Gagal memuat data ${key}.`);
    }
};  
  const masterDataConfig = {
      'projects': {
          collection: projectsCol,
          stateKey: 'projects',
          nameField: 'projectName',
          title: 'Proyek'
      },
      'creditors': {
          collection: fundingCreditorsCol,
          stateKey: 'fundingCreditors',
          nameField: 'creditorName',
          title: 'Kreditur'
      },
      'op-cats': {
          collection: opCatsCol,
          stateKey: 'operationalCategories',
          nameField: 'categoryName',
          title: 'Kategori Operasional'
      },
      'other-cats': {
          collection: otherCatsCol,
          stateKey: 'otherCategories',
          nameField: 'categoryName',
          title: 'Kategori Lainnya'
      },
      'suppliers': {
          collection: suppliersCol,
          stateKey: 'suppliers',
          nameField: 'supplierName',
          title: 'Supplier'
      },
      'professions': {
          collection: professionsCol,
          stateKey: 'professions',
          nameField: 'professionName',
          title: 'Profesi'
      },
      'workers': {
          collection: workersCol,
          stateKey: 'workers',
          nameField: 'workerName',
          title: 'Pekerja'
      },
      'staff': {
          collection: collection(db, 'teams', TEAM_ID, 'staff'),
          stateKey: 'staff',
          nameField: 'staffName',
          title: 'Staf Inti'
      },
      'materials': {
          collection: materialsCol,
          stateKey: 'materials',
          nameField: 'materialName',
          title: 'Material'
      },
  };
  
  async function handleRecalculateUsageCount() {
      createModal('confirmUserAction', {
          message: 'Aksi ini akan membaca semua histori faktur material dan menghitung ulang frekuensi penggunaan untuk semua master data. Proses ini hanya perlu dilakukan sekali. Lanjutkan?',
          onConfirm: () => _recalculateAndApplyUsageCounts()
      });
  }
  async function _notifyDataChange() {
    console.log("Perubahan data terdeteksi, memperbarui state aplikasi...");
    await loadAllLocalDataToState();
    _calculateAndCacheDashboardTotals();
    console.log("State aplikasi berhasil diperbarui.");
}
  async function _recalculateAndApplyUsageCounts() {
      toast('syncing', 'Membaca semua faktur material...');
      console.log('Memulai perhitungan ulang frekuensi penggunaan material...');
      try {
          // 1. Ambil semua data master material dan expense material
          await fetchAndCacheData('materials', materialsCol);
          const q = query(expensesCol, where("type", "==", "material"));
          const expenseSnap = await getDocs(q);
          const materialExpenses = expenseSnap.docs.map(d => d.data());
          console.log(`Ditemukan ${materialExpenses.length} faktur material untuk dianalisis.`);
          // 2. Buat peta untuk menghitung penggunaan setiap material
          const usageMap = new Map();
          materialExpenses.forEach(expense => {
              if (expense.items && Array.isArray(expense.items)) {
                  expense.items.forEach(item => {
                      if (item.materialId) { // Memastikan materialId ada
                          const currentCount = usageMap.get(item.materialId) || 0;
                          usageMap.set(item.materialId, currentCount + 1);
                      }
                  });
              }
          });
          console.log('Peta penggunaan selesai dihitung:', usageMap);
          if (appState.materials.length === 0) {
              toast('info', 'Tidak ada data master material untuk diperbarui.');
              return;
          }
          toast('syncing', `Menghitung dan memperbarui ${appState.materials.length} material...`);
          // 3. Siapkan batch update ke Firestore
          const batch = writeBatch(db);
          appState.materials.forEach(material => {
              const materialRef = doc(materialsCol, material.id);
              const newCount = usageMap.get(material.id) || 0;
              // Hanya update jika ada perubahan untuk efisiensi
              if (material.usageCount !== newCount) {
                  batch.update(materialRef, {
                      usageCount: newCount
                  });
              }
          });
          // 4. Jalankan update
          console.log('Menerapkan pembaruan batch ke Firestore...');
          await batch.commit();
          console.log('Pembaruan batch berhasil.');
          toast('success', 'Perhitungan ulang selesai! Semua data material telah diperbarui.');
          // Sembunyikan tombol setelah berhasil dijalankan untuk mencegah eksekusi berulang
          const recalcButton = $(`[data-action="recalculate-usage"]`);
          if (recalcButton) recalcButton.style.display = 'none';
      } catch (error) {
          console.error("Gagal menghitung ulang:", error);
          toast('error', 'Terjadi kesalahan saat perhitungan ulang.');
      }
  }
  
  function _initSelectionMode(containerSelector, pageContext) {
    const container = $(containerSelector);
    if (!container) return;

    // Hapus listener lama untuk menghindari duplikasi saat render ulang
    if (container._selectionHandlers) {
        container.removeEventListener('pointerdown', container._selectionHandlers.start);
    }

    let pressTimer = null;
    let hasMoved = false;
    let isLongPress = false; // Flag untuk menandai jika long press terjadi
    let startX = 0;
    let startY = 0;

    const handlePointerDown = (e) => {
        const cardWrapper = e.target.closest('.wa-card-v2-wrapper');
        // Abaikan jika bukan di kartu atau jika tombol aksi/centang yang ditekan
        if (!cardWrapper || e.target.closest('.item-actions, .swipe-actions, .selection-checkmark')) {
            return;
        }

        hasMoved = false;
        isLongPress = false; // Reset flag setiap kali ada event press baru
        startX = e.pageX;
        startY = e.pageY;

        const handlePointerMove = (moveEvent) => {
            // Jika jari bergerak lebih dari 10px, ini dianggap swipe/drag
            if (Math.abs(moveEvent.pageX - startX) > 10 || Math.abs(moveEvent.pageY - startY) > 10) {
                hasMoved = true;
                if (pressTimer) clearTimeout(pressTimer);
            }
        };

        const handlePointerUp = (upEvent) => {
            // Bersihkan semua listener sementara
            document.removeEventListener('pointermove', handlePointerMove);
            document.removeEventListener('pointerup', handlePointerUp);
            if (pressTimer) clearTimeout(pressTimer);

            // Jika ini adalah akhir dari long press, hentikan semua aksi lanjutan.
            if (isLongPress) {
                upEvent.preventDefault(); // Mencegah event 'click' susulan
                return;
            }
            
            // Jika ini adalah tap singkat (bukan long press & bukan swipe)
            if (!hasMoved) {
                // Dan jika mode seleksi sudah aktif, maka toggle item yang di-tap.
                if (appState.selectionMode.active) {
                    upEvent.preventDefault(); // Mencegah aksi klik lain (seperti membuka modal)
                    _toggleCardSelection(cardWrapper);
                }
                // Jika mode seleksi tidak aktif, biarkan event 'click' standar berjalan.
            }
        };

        document.addEventListener('pointermove', handlePointerMove);
        document.addEventListener('pointerup', handlePointerUp, { once: true });

        // Atur timer untuk long-press HANYA jika mode seleksi belum aktif.
        if (!appState.selectionMode.active) {
            pressTimer = setTimeout(() => {
                // Jika jari tidak bergerak setelah 500ms, aktifkan mode seleksi.
                if (!hasMoved) {
                    isLongPress = true; // Tandai bahwa long press telah terjadi
                    _activateSelectionMode(pageContext, cardWrapper);
                }
            }, 500); // Durasi long-press 500 milidetik
        }
    };
    
    // Simpan referensi handler untuk bisa dihapus nanti
    container._selectionHandlers = { start: handlePointerDown };
    container.addEventListener('pointerdown', handlePointerDown);
}

function _activateSelectionMode(pageContext, initialCard) {
    if (appState.selectionMode.active) return;
    appState.selectionMode.active = true;
    appState.selectionMode.pageContext = pageContext;
    document.body.classList.add('selection-active');
    if (initialCard) {
        _toggleCardSelection(initialCard);
    }
    _updateSelectionToolbar();
}

function _deactivateSelectionMode() {
    appState.selectionMode.active = false;
    appState.selectionMode.selectedIds.clear();
    document.body.classList.remove('selection-active');
    $$('.wa-card-v2-wrapper.selected').forEach(card => card.classList.remove('selected'));
    _updateSelectionToolbar();
}

function _toggleCardSelection(cardWrapper) {
    if (!cardWrapper || !cardWrapper.dataset.id) return;
    const id = cardWrapper.dataset.id;
    const { selectedIds } = appState.selectionMode;

    if (selectedIds.has(id)) {
        selectedIds.delete(id);
        cardWrapper.classList.remove('selected');
    } else {
        selectedIds.add(id);
        cardWrapper.classList.add('selected');
    }

    if (appState.selectionMode.active && selectedIds.size === 0) {
        _deactivateSelectionMode();
    }
    
    _updateSelectionToolbar();
}

function _handleSelectAll() {
    const container = $('#sub-page-content, #recycle-bin-content');
    if (!container) return;

    const allVisibleItems = $$('.wa-card-v2-wrapper', container);
    const areAllSelected = allVisibleItems.length > 0 && allVisibleItems.every(card => appState.selectionMode.selectedIds.has(card.dataset.id));

    if (areAllSelected) {
        allVisibleItems.forEach(card => {
            appState.selectionMode.selectedIds.delete(card.dataset.id);
            card.classList.remove('selected');
        });
    } else {
        allVisibleItems.forEach(card => {
            appState.selectionMode.selectedIds.add(card.dataset.id);
            card.classList.add('selected');
        });
    }

    if (appState.selectionMode.selectedIds.size === 0) {
         _deactivateSelectionMode();
    } else {
        _updateSelectionToolbar();
    }
}

function _updateSelectionToolbar() {
    const toolbar = $('.toolbar.sticky-toolbar');
    if (!toolbar) return;

    const { active, selectedIds } = appState.selectionMode;
    const selectionToolbar = toolbar.querySelector('.toolbar-selection-actions');
    if (!selectionToolbar) return;
    
    if (active && selectedIds.size > 0) {
        const countEl = selectionToolbar.querySelector('#selection-count-text');
        if(countEl) countEl.textContent = `${selectedIds.size}`;
    }
}

async function handleOpenSelectionSummaryModal() {
    const { selectedIds, pageContext } = appState.selectionMode;
    if (selectedIds.size === 0) return;

    let totalTagihan = 0;
    let totalDibayar = 0;
    let totalSisa = 0;

    let items;
    if (pageContext === 'tagihan') items = appState.tagihan.currentList;
    else if (pageContext === 'pemasukan') {
        const activeTab = appState.activeSubPage.get('pemasukan');
        items = activeTab === 'termin' ? appState.incomes : appState.fundingSources;
    } else {
        toast('info', 'Ringkasan tidak tersedia untuk halaman ini.');
        return;
    }

    selectedIds.forEach(id => {
        const item = items.find(i => i.id === id);
        if (item) {
            totalTagihan += item.amount || item.totalAmount || 0;
            totalDibayar += item.paidAmount || 0;
            totalSisa += (item.amount || item.totalAmount || 0) - (item.paidAmount || 0);
        }
    });

    const content = `
        <dl class="detail-list">
            <div><dt>Total Tagihan</dt><dd>${fmtIDR(totalTagihan)}</dd></div>
            <div><dt>Total Dibayar</dt><dd class="positive">${fmtIDR(totalDibayar)}</dd></div>
            <div class="summary-row"><dt>Total Sisa</dt><dd class="negative">${fmtIDR(totalSisa)}</dd></div>
        </dl>
    `;

    createModal('dataDetail', {
        title: `Ringkasan (${selectedIds.size} Item)`,
        content: content
    });
}

function _createPageToolbarHTML(pageContext) {
    let standardActionsHTML = '';
    let selectionActionsHTML = '';

    if (pageContext === 'tagihan' || pageContext === 'pemasukan') {
        const searchPlaceholder = pageContext === 'tagihan' ? 'Cari di Tagihan...' : 'Cari di Pemasukan...';
        standardActionsHTML = `
            <div class="toolbar-standard-actions">
                <div class="search">
                    <span class="material-symbols-outlined">search</span>
                    <input type="search" id="${pageContext}-search-input" placeholder="${searchPlaceholder}">
                </div>
                <div class="toolbar-actions-group">
                    <button class="btn-icon" data-action="open-filter-modal" title="Filter"><span class="material-symbols-outlined">filter_list</span></button>
                    <button class="btn-icon" data-action="open-sort-modal" title="Urutkan"><span class="material-symbols-outlined">sort</span></button>
                </div>
            </div>
        `;
        selectionActionsHTML = `
            <div class="toolbar-selection-actions">
                <div class="selection-info">
                    <button class="btn-icon" data-action="close-selection-mode" title="Tutup"><span class="material-symbols-outlined">close</span></button>
                    <span id="selection-count-text">0</span>
                    <span class="selection-info-label">Item Terpilih</span>
                </div>
                <div class="selection-actions-group">
                    <button class="btn-icon" data-action="forward-to-comments" title="Diskusikan Item Ini"><span class="material-symbols-outlined">add_comment</span></button>
                    <button class="btn-icon" data-action="select-all-items" title="Pilih Semua / Batal Pilih"><span class="material-symbols-outlined">select_all</span></button>
                    <button class="btn-icon" data-action="open-selection-summary" title="Lihat Ringkasan"><span class="material-symbols-outlined">info</span></button>
                    <button class="btn-icon" data-action="delete-selected-items" title="Hapus Item Terpilih"><span class="material-symbols-outlined">delete</span></button>
                </div>
            </div>
        `;
        } else if (pageContext === 'sampah') {
        standardActionsHTML = `
             <div class="toolbar-standard-actions">
                 <h4 class="page-title" style="margin:0;">Sampah</h4>
                 <div class="toolbar-actions-group">
                    <input id="trash-search" type="search" placeholder="Cari di Sampah..." class="toolbar-search-input">
                    <button class="btn-icon btn-icon-danger" data-action="empty-trash" title="Kosongkan Sampah"><span class="material-symbols-outlined">delete_sweep</span></button>
                 </div>
            </div>
        `;
         selectionActionsHTML = `
            <div class="toolbar-selection-actions">
                <div class="selection-info">
                    <button class="btn-icon" data-action="close-selection-mode"><span class="material-symbols-outlined">close</span></button>
                    <span id="selection-count-text">0</span>
                    <span class="selection-info-label">Item Terpilih</span>
                </div>
                <div class="selection-actions-group">
                    <button class="btn-icon" data-action="restore-selected" title="Pulihkan"><span class="material-symbols-outlined">restore_from_trash</span></button>
                    <button class="btn-icon" data-action="delete-permanent-selected" title="Hapus Permanen"><span class="material-symbols-outlined">delete_forever</span></button>
                </div>
            </div>
        `;
    }

    return `
        <div class="toolbar sticky-toolbar" id="${pageContext}-toolbar">
            ${standardActionsHTML}
            ${selectionActionsHTML}
        </div>
    `;
}
async function _handleDeleteSelectedItems() {
    const { selectedIds, pageContext } = appState.selectionMode;
    if (selectedIds.size === 0) return;

    let itemType = '';
    if (pageContext === 'tagihan') itemType = 'bill';
    else if (pageContext === 'pemasukan') {
        const activeTab = appState.activeSubPage.get('pemasukan');
        itemType = activeTab === 'termin' ? 'termin' : 'pinjaman';
    }

    createModal('confirmDelete', {
        message: `Anda yakin ingin memindahkan ${selectedIds.size} item ini ke Sampah?`,
        onConfirm: async () => {
            toast('syncing', `Memindahkan ${selectedIds.size} item...`);
            for (const id of selectedIds) {
                await _performSoftDelete(id, itemType, true);
                await _removeItemFromListWithAnimation(id);
            }
            _deactivateSelectionMode();
            await loadAllLocalDataToState();
            _calculateAndCacheDashboardTotals();
            toast('success', `${selectedIds.size} item dipindahkan ke Sampah.`);
            syncToServer({ silent: true });
        }
    });
}

function _renderSparklineChart(canvasId, data, isPositiveGood) {
      const canvas = document.getElementById(canvasId);
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      const positiveColor = 'rgba(34, 197, 94, 0.8)';
      const negativeColor = 'rgba(239, 68, 68, 0.8)';
      // Gradasi untuk area di bawah garis
      const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
      const mainColor = isPositiveGood?positiveColor : negativeColor;
      gradient.addColorStop(0, mainColor.replace('0.8', '0.2')); // Warna atas (lebih transparan)
      gradient.addColorStop(1, mainColor.replace('0.8', '0')); // Warna bawah (sangat transparan)
      new Chart(ctx, {
          type: 'line',
          data: {
              labels: Array(data.length).fill(''),
              datasets: [{
                  data: data,
                  borderColor: mainColor,
                  borderWidth: 2,
                  fill: true,
                  backgroundColor: gradient,
                  tension: 0.4 // Membuat garis lebih melengkung halus
              }]
          },
          options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                  legend: {
                      display: false
                  },
                  tooltip: {
                      enabled: false
                  }
              },
              elements: {
                  point: {
                      radius: 0
                  }
              },
              scales: {
                  x: {
                      display: false
                  },
                  y: {
                      display: false
                  }
              }
          }
      });
  }
  
function _getDashboardTrendData() {
    const trends = {
        profit: Array(7).fill(0),
        bills: Array(7).fill(0)
    };
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    for (let i = 0; i < 7; i++) {
        const date = new Date(today);
        date.setDate(today.getDate() - i);
        const dateString = date.toISOString().slice(0, 10);
        
        const dailyIncome = appState.incomes
            .filter(inc => !inc.isDeleted && _getJSDate(inc.date).toISOString().slice(0, 10) === dateString) // TAMBAHKAN !inc.isDeleted
            .reduce((sum, inc) => sum + inc.amount, 0);
        const dailyExpense = appState.expenses
            .filter(exp => !exp.isDeleted && _getJSDate(exp.date).toISOString().slice(0, 10) === dateString) // TAMBAHKAN !exp.isDeleted
            .reduce((sum, exp) => sum + exp.amount, 0);
        trends.profit[6 - i] = dailyIncome - dailyExpense;
        
        const dailyUnpaidBills = appState.bills
            .filter(b => !b.isDeleted && b.status === 'unpaid' && _getJSDate(b.dueDate) <= date) // TAMBAHKAN !b.isDeleted
            .reduce((sum, b) => sum + (b.amount - (b.paidAmount || 0)), 0);
        trends.bills[6 - i] = dailyUnpaidBills;
    }
    return trends;
}

async function _logActivity(action, details = {}) {
    if (!appState.currentUser || isViewer()) return;

    let actionType = 'info'; // default
    if (action.toLowerCase().includes('menambah') || action.toLowerCase().includes('membuat')) {
        actionType = 'add';
    } else if (action.toLowerCase().includes('mengedit') || action.toLowerCase().includes('memperbarui')) {
        actionType = 'edit';
    } else if (action.toLowerCase().includes('menghapus') || action.toLowerCase().includes('membatalkan')) {
        actionType = 'delete';
    }

    const logData = {
        action: action, // Deskripsi lengkap: "Menambah Pengeluaran (Lokal): Gaji"
        actionType: actionType, // Tipe aksi: 'add', 'edit', 'delete'
        details: details, // Data detail seperti { amount: 50000, targetId: 'bill-xxx', targetType: 'bill' }
        userId: appState.currentUser.uid,
        userName: appState.currentUser.displayName,
        createdAt: serverTimestamp()
    };
    
    try {
        await addDoc(logsCol, logData);
        const notificationMessage = `${appState.currentUser.displayName} baru saja ${action.toLowerCase()}.`;
        triggerNotification(notificationMessage, appState.currentUser.displayName, actionType);
    } catch (error) {
        console.error("Gagal mencatat aktivitas:", error);
        try {
            await localDB.pending_logs.add({ ...logData, createdAt: new Date() });
        } catch (e2) {
            console.warn('Gagal antre log offline:', e2);
        }
    }
}

function subscribeToMasterData() {
      const master = [{
          key: 'projects',
          col: projectsCol
      }, {
          key: 'suppliers',
          col: suppliersCol
      }, {
          key: 'workers',
          col: workersCol
      }, {
          key: 'professions',
          col: professionsCol
      }, {
          key: 'operational_categories',
          col: opCatsCol
      }, {
          key: 'material_categories',
          col: matCatsCol
      }, {
          key: 'other_categories',
          col: otherCatsCol
      }, {
          key: 'materials',
          col: materialsCol
      }, {
          key: 'staff',
          col: staffCol
      }, ];
      master.forEach(({
          key,
          col
      }) => {
          onSnapshot(col, async (snap) => {
              const incoming = snap.docs.map(d => ({ ...d.data(),
                  id: d.id,
                  serverRev: (d.data().rev || 0)
              }));
              try {
                  if (incoming.length > 0) await localDB[key].bulkPut(incoming);
                  appState[key] = incoming;
              } catch (e) {
                  console.warn('Gagal menerapkan snapshot untuk', key, e);
              }
          }, (err) => console.warn('Snapshot error', key, err));
      });
  }
  function _setActiveListeners(pageSpecificListeners = []) {
    const collectionRefs = {
        'bills': billsCol,
        'expenses': expensesCol,
        'incomes': incomesCol,
        'attendance_records': attendanceRecordsCol,
        'comments': commentsCol,
    };
    
    // [PERBAIKAN] Jadikan 'comments' sebagai listener global yang selalu aktif
    const globalListeners = new Set(['comments']);
    
    const requiredListeners = new Set([...globalListeners, ...pageSpecificListeners]);
    const currentActive = new Set(appState.activeListeners.keys());

    currentActive.forEach(listenerName => {
        if (!requiredListeners.has(listenerName)) {
            const unsubscribe = appState.activeListeners.get(listenerName);
            if (typeof unsubscribe === 'function') {
                unsubscribe();
            }
            appState.activeListeners.delete(listenerName);
            console.log(`- Listener untuk '${listenerName}' dinonaktifkan.`);
        }
    });

    requiredListeners.forEach(listenerName => {
        if (!currentActive.has(listenerName)) {
            const collectionRef = collectionRefs[listenerName];
            if (collectionRef) {
                const q = query(collectionRef);
                const unsubscribe = onSnapshot(q, (snapshot) => {
                    // Jangan proses jika snapshot kosong & dari cache saat pertama load
                    if (snapshot.empty && snapshot.metadata.fromCache) return;
                    
                    console.log(`Menerima ${snapshot.docChanges().length} pembaruan dari: ${listenerName}`);
                    _processRealtimeChanges(snapshot.docChanges(), listenerName);
                }, (error) => {
                    console.error(`Gagal mendengarkan ${listenerName}:`, error);
                });

                appState.activeListeners.set(listenerName, unsubscribe);
                console.log(`+ Listener untuk '${listenerName}' diaktifkan.`);
            }
        }
    });
}

function _calculateAndCacheDashboardTotals() {
    console.log("Calculating dashboard totals from appState...");
    
    const validIncomes = (appState.incomes || []).filter(item => !item.isDeleted);
    const validExpenses = (appState.expenses || []).filter(item => !item.isDeleted);
    const validBills = (appState.bills || []).filter(item => !item.isDeleted);
    const validAttendanceRecords = (appState.attendanceRecords || []).filter(item => !item.isDeleted);

    const mainProject = appState.projects.find(p => p.projectType === 'main_income');
    const internalProjects = appState.projects.filter(p => p.id !== mainProject?.id);

    const pendapatan = validIncomes.filter(i => i.projectId === mainProject?.id).reduce((sum, i) => sum + i.amount, 0);
    const hpp_material = validExpenses.filter(e => e.projectId === mainProject?.id && e.type === 'material').reduce((sum, e) => sum + e.amount, 0);

    let hpp_gaji = 0;
    let bebanGajiInternal = 0;
    const paidSalaryBills = validBills.filter(b => b.type === 'gaji' && b.status === 'paid');
    const attendanceMap = new Map(validAttendanceRecords.map(rec => [rec.id, rec]));

    paidSalaryBills.forEach(bill => {
        (bill.recordIds || []).forEach(recordId => {
            const record = attendanceMap.get(recordId);
            if (record) {
                if (record.projectId === mainProject?.id) {
                    hpp_gaji += record.totalPay || 0;
                } else {
                    bebanGajiInternal += record.totalPay || 0;
                }
            }
        });
    });

    const hpp_lainnya = validExpenses.filter(e => e.projectId === mainProject?.id && e.type === 'lainnya').reduce((sum, e) => sum + e.amount, 0);
    const hpp = hpp_material + hpp_gaji + hpp_lainnya;
    const labaKotor = pendapatan - hpp;

    // Kalkulasi Beban
    const bebanOperasional = validExpenses.filter(e => e.projectId === mainProject?.id && e.type === 'operasional').reduce((sum, e) => sum + e.amount, 0);
    const bebanExpenseInternal = validExpenses.filter(e => internalProjects.some(p => p.id === e.projectId)).reduce((sum, e) => sum + e.amount, 0);
    const bebanInternal = bebanExpenseInternal + bebanGajiInternal;

    // Kalkulasi Final
    const labaBersih = labaKotor - bebanOperasional - bebanInternal;
    const totalUnpaid = validBills.filter(b => b.status === 'unpaid').reduce((sum, b) => sum + (b.amount - (b.paidAmount || 0)), 0);

    const projectsWithBudget = (appState.projects || []).filter(p => p.budget && p.budget > 0).map(p => {
        const actual = validExpenses
            .filter(e => e.projectId === p.id)
            .reduce((sum, e) => sum + e.amount, 0);
        const remaining = p.budget - actual;
        const percentage = p.budget > 0 ? (actual / p.budget) * 100 : 0;
        return { ...p, actual, remaining, percentage };
    });
    appState.dashboardTotals.labaBersih = labaBersih;
    appState.dashboardTotals.totalUnpaid = totalUnpaid;
    appState.dashboardTotals.projectsWithBudget = projectsWithBudget; // <-- Simpan data anggaran
    
    console.log("Dashboard totals recalculated and cached:", appState.dashboardTotals);
    
    if (appState.activePage === 'dashboard') {
        const labaEl = document.querySelector('.dashboard-balance-card .value.positive');
        const unpaidEl = document.querySelector('.dashboard-balance-card .value.negative');
        if (labaEl) animateNumber(labaEl, labaBersih);
        if (unpaidEl) animateNumber(unpaidEl, totalUnpaid);

        const budgetContainer = document.querySelector('#project-budget-container');
        if (budgetContainer) {
            budgetContainer.innerHTML = projectsWithBudget.length > 0 ? projectsWithBudget.map(p => `
                <div class="budget-item">
                    <div class="budget-info">
                        <span class="project-name">${p.projectName}</span>
                        <strong class="remaining-amount ${p.remaining < 0 ? 'negative' : ''}">${fmtIDR(p.remaining)}</strong>
                    </div>
                    <div class="progress-bar-container">
                        <div class="progress-bar" style="width: ${Math.min(p.percentage, 100)}%; background-image: ${p.percentage > 100 ? 'var(--grad-danger)' : 'var(--grad)'};"></div>
                    </div>
                    <div class="budget-details">
                        <span>Terpakai: ${fmtIDR(p.actual)}</span>
                        <span>Anggaran: ${fmtIDR(p.budget)}</span>
                    </div>
                </div>
            `).join('') : '<p class="empty-state-small">Tidak ada proyek dengan anggaran.</p>';
        }
    }
}

async function _processRealtimeChanges(docChanges, collectionName) {
    // [PERBAIKAN KUNCI] Logika khusus untuk komentar agar real-time
    if (collectionName === 'comments') {
        const changesForUI = docChanges.map(change => ({
            type: change.type,
            doc: { id: change.doc.id, ...change.doc.data() }
        }));
        
        // Update state di background
        await _applyChangesToStateAndUI(changesForUI, collectionName);

        // Jika halaman utama "Komentar" sedang terbuka, render ulang daftar chatnya
        if (appState.activePage === 'komentar') {
            const searchInput = document.getElementById('komentar-search-input');
            _renderChatList(searchInput ? searchInput.value.toLowerCase() : '');
        }

        // Panggil fungsi upsert untuk setiap perubahan di detail chat yang sedang terbuka
        changesForUI.forEach(change => {
            upsertCommentInUI(change.doc, change.type);
        });
        
        return; // Hentikan eksekusi di sini khusus untuk komentar
    }
    
    // Logika lama untuk koleksi lain tetap berjalan
    let hasChanged = false;
    let needsUiRefresh = false;

    const changesForUI = docChanges.map(change => ({
        type: change.type,
        doc: { id: change.doc.id, ...change.doc.data() }
    }));

    if (changesForUI.length > 0) {
        hasChanged = true;
        await _applyChangesToStateAndUI(changesForUI, collectionName);
    }
    
    if (!hasChanged) return;

    const transactionalCollections = ['incomes', 'expenses', 'bills', 'attendance_records', 'funding_sources'];
    if (transactionalCollections.includes(collectionName)) {
        needsUiRefresh = true;
        _calculateAndCacheDashboardTotals();
    }
    
    if (needsUiRefresh) {
        const pagesToRefresh = ['dashboard', 'laporan', 'jurnal', 'tagihan', 'pemasukan'];
        if (pagesToRefresh.includes(appState.activePage)) {
            console.log(`Perubahan real-time terdeteksi di '${collectionName}', me-render ulang halaman '${appState.activePage}'.`);
            renderPageContent();
        }
    }
    
    updateSyncIndicator();
    setLastSyncTimestamp();
}

async function handleOpenConflictsPanel() {
      const conflicts = await localDB.pending_conflicts.toArray();
      const itemsHTML = conflicts.length === 0?'<p class="empty-state-small">Tidak ada konflik yang tertunda.</p>' : conflicts.map(c => {
          const when = new Date(c.when || Date.now()).toLocaleString('id-ID');
          return `
              <div class="dense-list-item" data-id="${c.id}">
                  <div class="item-main-content">
                      <strong class="item-title">${c.table} / ${c.docId}</strong>
                      <span class="item-subtitle">Rev Lokal: ${c.baseRev || 0} | Rev Server: ${c.serverRev || 0} | ${when}</span>
                  </div>
                  <div class="item-actions">
                      <button class="btn btn-sm btn-primary" data-action="apply-conflict" data-conflict-id="${c.id}">Pakai Data Lokal</button>
                      <button class="btn btn-sm btn-secondary" data-action="discard-conflict" data-conflict-id="${c.id}">Pakai Data Server</button>
                  </div>
              </div>`;
      }).join('');
      const content = `<div class="dense-list-container">${itemsHTML}</div>`;
      createModal('dataDetail', {
          title: 'Konflik Sinkron',
          content
      });
  }
  
  async function resolveConflict(conflictId, useLocal) {
      try {
          const c = await localDB.pending_conflicts.get(Number(conflictId));
          if (!c) return;
          const colMap = {
              expenses: expensesCol,
              bills: billsCol,
              incomes: incomesCol,
              funding_sources: fundingSourcesCol,
              attendance_records: attendanceRecordsCol,
              stock_transactions: stockTransactionsCol,
          };
          const dexieTable = localDB[c.table];
          const col = colMap[c.table];
          const ref = doc(col, c.docId);
          if (useLocal) {
              await runTransaction(db, async (transaction) => {
                  const snap = await transaction.get(ref);
                  const nextRev = (snap.exists()?(snap.data().rev || 0) : 0) + 1;
                  const data = { ...(c.payload || {}),
                      id: c.docId,
                      rev: nextRev,
                      updatedAt: serverTimestamp()
                  };
                  if (snap.exists()) transaction.update(ref, data);
                  else transaction.set(ref, data);
              });
              try {
                  if (dexieTable) {
                      await dexieTable.update(c.docId, { serverRev: nextRev, syncState: 'synced', updatedAt: new Date() });
                  }
              } catch {}
              if (dexieTable && c.localId != null) await dexieTable.update(c.localId, { needsSync: 0 });
          } else {
              const snap = await getDoc(ref);
              if (snap.exists()) {
                  try {
                      if (dexieTable) {
                          await dexieTable.update(c.docId, { ...snap.data(), serverRev: (snap.data().rev || 0), syncState: 'synced', updatedAt: new Date() });
                      }
                  } catch {}
              }
          }
          await localDB.pending_conflicts.delete(c.id);
          toast('success', 'Konflik berhasil diproses.');
          closeModal($('#dataDetail-modal'));
      } catch (e) {
          console.error('Gagal memproses konflik:', e);
          toast('error', 'Gagal memproses konflik.');
      }
  }
  
  async function handleOpenStorageStats() {
      try {
          const files = await localDB.files.toArray();
          const counts = await getPendingSyncCounts();
          const totalBytes = files.reduce((s, f) => s + (f.size || (f.file && f.file.size) || 0), 0);
          const toMB = (b) => (b / 1024 / 1024).toFixed(2) + ' MB';
          const statsHTML = `
                  <div class="card card-pad">
                      <h5>Statistik Storage Offline</h5>
                      <div class="stats-grid">
                          <div><span class="label">Jumlah File</span><strong>${files.length}</strong></div>
                          <div><span class="label">Total Ukuran</span><strong>${toMB(totalBytes)}</strong></div>
                          <div><span class="label">Antrian Sync</span><strong>${counts.total} item</strong></div>
                          <div><span class="label">Konflik</span><strong>${counts.qConf}</strong></div>
                      </div>
                      <div class="storage-actions" style="margin-top:1rem;display:flex;gap:.5rem;">
                          <button class="btn btn-secondary" data-action="evict-storage">Bersihkan Sekarang</button>
                      </div>
                  </div>`;
          const modal = createModal('dataDetail', {
              title: 'Statistik Storage',
              content: statsHTML
          });
          if (modal) {
              $('[data-action="evict-storage"]', modal)?.addEventListener('click', async () => {
                  await _enforceLocalFileStorageLimit();
                  toast('success', 'Pembersihan selesai.');
                  closeModal(modal);
              });
          }
      } catch (e) {
          console.error('Gagal membuka statistik storage:', e);
          toast('error', 'Gagal memuat statistik storage.');
      }
  }
  
  async function _collectPendingItems() {
      const tables = ['expenses','bills','incomes','funding_sources','attendance_records','stock_transactions'];
      const results = [];
      for (const t of tables) {
          try {
              const items = await localDB[t].where('needsSync').equals(1).toArray();
              for (const it of items) {
                  results.push({
                      group: 'table', table: t, localId: it.localId, id: it.id,
                      label: it.description || it.projectName || it.workerName || it.materialName || it.type || t,
                      extra: (it.amount != null?`Rp ${Number(it.amount).toLocaleString('id-ID')}`:'')
                  });
              }
          } catch (_) {}
      }
      try {
          const pp = await localDB.pending_payments.toArray();
          pp.forEach(p => results.push({ group: 'pending_payments', id: p.id, label: p.workerName || p.billId || 'Pembayaran Tertunda', extra: p.amount != null?`Rp ${Number(p.amount).toLocaleString('id-ID')}`:'' }));
      } catch (_) {}
      try {
          const pl = await localDB.pending_logs.toArray();
          pl.forEach(l => results.push({ group: 'pending_logs', id: l.id, label: l.action || 'Log Offline', extra: '' }));
      } catch (_) {}
      try {
          const pc = await localDB.pending_conflicts.toArray();
          pc.forEach(c => results.push({ group: 'pending_conflicts', id: c.id, label: `Konflik ${c.table}:${c.docId}`, extra: '' }));
      } catch (_) {}
      return results;
  }

  // =======================================================
  //          SEKSI 2.5: FUNGSI MODAL & AUTENTIKASI
  // =======================================================

  function createModal(type, data = {}) {
    // PERBAIKAN BUG 2 (BAGIAN 1): Sembunyikan FAB setiap kali modal dibuka.
    const fabContainer = $('#fab-container');
    if (fabContainer) {
        fabContainer.innerHTML = '';
    }

    // PERBAIKAN BUG 1: Pindahkan 'reportGenerator' dari detailPageTypes ke bottomSheetTypes
    const detailPageTypes = [ 'dataDetail', 'payment', 'manageMaster', 'editMaster', 'editItem', 'editAttendance', 'manageUsers', 'invoiceItemsDetail', 'billActionsModal' ];
    const simpleModalTypes = ['confirmDelete', 'confirmPayment', 'confirmEdit', 'confirmPayBill', 'confirmGenerateBill', 'confirmUserAction', 'confirmDeleteAttachment', 'confirmDeleteRecap', 'login', 'confirmLogout', 'uploadSource', 'confirmExpense'];
    const bottomSheetTypes = ['actionsPopup', 'reportGenerator']; // <-- 'reportGenerator' dipindahkan ke sini

    if (detailPageTypes.includes(type)) {
        const modalHTML = getModalContent(type, data);
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = modalHTML;
        
        const contentEl = tempDiv.querySelector('.modal-content');
        if (!contentEl) return;

        const title = contentEl.querySelector('.modal-header h4')?.textContent || data.title || 'Detail';
        const content = contentEl.querySelector('.modal-body')?.innerHTML || '';
        const footer = contentEl.querySelector('.modal-footer')?.innerHTML || data.footer || '';
        const headerActions = data.headerActions || '';
        
        const viewConfig = { title, content, footer, headerActions };

        showDetailPane(viewConfig);
        
        const activePane = document.getElementById('detail-pane');
        if (activePane) {
            attachModalEventListeners(type, data, handleDetailPaneBack, activePane);
        }
        return activePane;
    }

    let modalContainer = $('#modal-container');
    if (!modalContainer) {
      modalContainer = document.createElement('div');
      modalContainer.id = 'modal-container';
      document.body.appendChild(modalContainer);
    }
    document.body.classList.add('modal-open');
    const modalEl = document.createElement('div');
    modalEl.id = `${type}-modal`;
    modalEl.className = 'modal-bg';
    
    if (simpleModalTypes.includes(type)) {
        modalEl.classList.add('is-simple-dialog');
    } else if (bottomSheetTypes.includes(type)) {
        modalEl.classList.add('is-bottom-sheet');
    }
    
    modalEl.innerHTML = getModalContent(type, data);
    modalContainer.appendChild(modalEl);  
    setTimeout(() => modalEl.classList.add('show'), 10);
  
    const closeModalFunc = () => closeModal(modalEl);
  
    modalEl.addEventListener('click', e => {
        if (e.target === modalEl) closeModalFunc();
    });
    modalEl.querySelectorAll('[data-close-modal]').forEach(btn => btn.addEventListener('click', closeModalFunc));
  
    attachModalEventListeners(type, data, closeModalFunc, modalEl);
    return modalEl;
}

function closeModal(modalEl) {
    if (!modalEl) return;
    try {
      if (history.state && history.state.modal === true) {
        history.back();
        return;
      }
    } catch(_) {}
    _closeModalImmediate(modalEl);
}
  
function _closeModalImmediate(modalEl) {
    if (!modalEl) return;
    modalEl.classList.remove('show');
    setTimeout(() => {
        modalEl.remove();
        if (document.querySelectorAll('.modal-bg.show').length === 0) {
            document.body.classList.remove('modal-open');
            // PERBAIKAN BUG 2 (BAGIAN 2): Kembalikan FAB saat modal terakhir ditutup.
            _restorePageFab();
        }
    }, 300);
}
function showMobileDetailPage({ title, subtitle, content, footer, headerActions, fabHTML }, isGoingBack = false) {
    const detailPane = $('.detail-pane');
    if (!detailPane) return;
    if (!isGoingBack) {
        try {
            history.pushState({ detailView: true, page: appState.activePage }, '');
        } catch (_) {}
    }
    if (!isGoingBack && document.body.classList.contains('detail-view-active')) {
        const currentFabHTML = detailPane.querySelector('.fab')?.outerHTML || '';
        const previousState = {
            title: detailPane.querySelector('.breadcrumb-nav')?.innerHTML || '', // Simpan innerHTML agar bisa merestore subtitle
            subtitle: detailPane.querySelector('.chat-subtitle')?.textContent || null,
            content: detailPane.querySelector('.mobile-detail-content')?.innerHTML || '',
            footer: detailPane.querySelector('.modal-footer')?.innerHTML || '',
            headerActions: detailPane.querySelector('.header-actions')?.innerHTML || '',
            fabHTML: currentFabHTML
        };
        appState.detailPaneHistory.push(previousState);
    }
    
    let titleHTML;
    if (subtitle) {
        titleHTML = `
            <div class="title-wrap">
                <strong class="chat-title">${title}</strong>
                <span class="chat-subtitle">${subtitle}</span>
            </div>
        `;
    } else {
        titleHTML = `<strong>${title}</strong>`;
    }

    const headerHTML = `
    <div class="mobile-detail-header">
        <button class="btn-icon" data-action="detail-pane-back">
            <span class="material-symbols-outlined">arrow_back</span>
        </button>
        <div class="breadcrumb-nav">
            ${titleHTML} 
        </div>
        <div class="header-actions">${headerActions || ''}</div>
    </div>`;

    const contentHTML = `<div class="mobile-detail-content">${content}</div>`;
    const footerHTML = footer ? `<div class="modal-footer">${footer}</div>` : '';

    detailPane.innerHTML = headerHTML + contentHTML + footerHTML;
    
    if (fabHTML && typeof fabHTML === 'string') {
        detailPane.insertAdjacentHTML('beforeend', fabHTML);
    }
    
    document.body.classList.add('detail-view-active');
    
    _initCustomSelects(detailPane);
    detailPane.querySelectorAll('input[inputmode="numeric"]').forEach(i => i.addEventListener('input', _formatNumberInput));
    if (detailPane.querySelector('[data-type="staff"]')) _attachStaffFormListeners(detailPane);
}

function hideMobileDetailPage() {
    document.body.classList.remove('detail-view-active');
    document.body.classList.remove('comments-view-active'); // <-- BARIS KUNCI PERBAIKAN
    appState.detailPaneHistory = []; // Also clear history on full close
    _restorePageFab(); // Restore the main FAB
}

function closeAllModals() {
    const container = $('#modal-container');
    if (container) {
        const openModals = container.querySelectorAll('.modal-bg.show');
        openModals.forEach(modal => _closeModalImmediate(modal));
    }
    // Menutup juga panel detail jika sedang terbuka di tampilan desktop
    if (document.body.classList.contains('detail-pane-open')) {
        closeDetailPane();
    }
}
  
function getModalContent(type, data) {
    if (type === 'imageView') {
        return `<div class="image-view-modal" data-close-modal>
                        <img src="${data.src}" alt="Lampiran">
                        <button class="btn-icon image-view-close" data-close-modal>
                            <span class="material-symbols-outlined">close</span>
                        </button>
                    </div>`;
    }
  
    const modalWithHeader = (title, content, footerContent = '') => {
        const footerHTML = footerContent ? `<div class="modal-footer">${footerContent}</div>` : '';
        return `<div class="modal-content"><div class="modal-header"><h4>${title}</h4><button class="btn-icon" data-close-modal><span class="material-symbols-outlined">close</span></button></div><div class="modal-body">${content}</div>${footerHTML}</div>`;
    };
    const simpleModal = (title, content, footer) => `<div class="modal-content"><div class="modal-header"><h4>${title}</h4></div><div class="modal-body">${content}</div><div class="modal-footer">${footer}</div></div>`;
    
    if (type === 'actionsPopup') {
        return `
            <div class="modal-content">
                <div class="modal-header">
                    <h4>${data.title || 'Pilih Aksi'}</h4>
                </div>
                <div class="modal-body">
                    ${data.content || ''}
                </div>
            </div>
        `;
    }

    if (type === 'login') return simpleModal('Login', '<p>Gunakan akun Google Anda.</p>', '<button id="google-login-btn" class="btn btn-primary">Masuk dengan Google</button>');
    if (type === 'confirmLogout') return simpleModal('Keluar', '<p>Anda yakin ingin keluar?</p>', '<button class="btn btn-ghost" data-close-modal>Batal</button><button id="confirm-logout-btn" class="btn btn-danger">Keluar</button>');
    if (type === 'uploadSource') {
        return simpleModal(data.title, data.content, '<button class="btn btn-secondary" data-close-modal>Batal</button>');
    }
    if (type === 'confirmDelete' || type === 'confirmPayment' || type === 'confirmEdit' || type === 'confirmPayBill' || type === 'confirmGenerateBill' || type === 'confirmUserAction' || type === 'confirmDeleteAttachment' || type === 'confirmDeleteRecap') {
        const titles = {
            confirmDelete: 'Konfirmasi Hapus',
            confirmPayment: 'Konfirmasi Pembayaran',
            confirmEdit: 'Konfirmasi Perubahan',
            confirmPayBill: 'Konfirmasi Pembayaran',
            confirmGenerateBill: 'Konfirmasi Buat Tagihan',
            confirmUserAction: 'Konfirmasi Aksi',
            confirmDeleteAttachment: 'Hapus Lampiran',
            confirmDeleteRecap: 'Hapus Rekap Gaji'
        };
        const messages = {
            confirmDelete: 'Anda yakin ingin menghapus data ini?',
            confirmPayment: 'Anda yakin ingin melanjutkan pembayaran?',
            confirmEdit: 'Anda yakin ingin menyimpan perubahan?',
            confirmPayBill: 'Anda yakin ingin melanjutkan pembayaran ini?',
            confirmGenerateBill: 'Anda akan membuat tagihan gaji untuk pekerja ini. Lanjutkan?',
            confirmUserAction: 'Apakah Anda yakin?',
            confirmDeleteAttachment: 'Anda yakin ingin menghapus lampiran ini?',
            confirmDeleteRecap: 'Menghapus rekap ini akan menghapus data absensi terkait. Aksi ini tidak dapat dibatalkan. Lanjutkan?'
        };
        const confirmTexts = {
            confirmDelete: 'Hapus',
            confirmPayment: 'Ya, Bayar',
            confirmEdit: 'Ya, Simpan',
            confirmPayBill: 'Ya, Bayar',
            confirmGenerateBill: 'Ya, Buat Tagihan',
            confirmUserAction: 'Ya, Lanjutkan',
            confirmDeleteAttachment: 'Ya, Hapus',
            confirmDeleteRecap: 'Ya, Hapus'
        };
        const confirmClasses = {
            confirmDelete: 'btn-danger',
            confirmPayment: 'btn-primary',
            confirmEdit: 'btn-primary',
            confirmPayBill: 'btn-primary',
            confirmGenerateBill: 'btn-primary',
            confirmUserAction: 'btn-primary',
            confirmDeleteAttachment: 'btn-danger',
            confirmDeleteRecap: 'btn-danger'
        };
  
        return simpleModal(
            titles[type],
            `<p class="confirm-modal-text">${data.message || messages[type]}</p>`,
            `<button class="btn btn-ghost" data-close-modal>Batal</button><button id="confirm-btn" class="btn ${confirmClasses[type]}">${confirmTexts[type]}</button>`
        );
    }
  
    if (type === 'confirmExpense') {
        return simpleModal(
            'Konfirmasi Status Pengeluaran',
            '<p>Apakah pengeluaran ini sudah dibayar atau akan dijadikan tagihan?</p>',
            `<button class="btn btn-secondary" id="confirm-bill-btn">Jadikan Tagihan</button><button id="confirm-paid-btn" class="btn btn-success">Sudah, Lunas</button>`
        );
    }
    if (type === 'dataDetail' || type === 'payment' || type === 'manageMaster' || type === 'editMaster' || type === 'editItem' || type === 'editAttendance' || type === 'imageView' || type === 'manageUsers') {
        return modalWithHeader(data.title, data.content, data.footer);
    }
    if (type === 'reportGenerator') {
        return modalWithHeader(data.title || 'Buat Laporan', data.content, data.footer || '');
    }
    if (type === 'actionsMenu') {
        const {
            actions,
            targetRect
        } = data;
        const top = targetRect.bottom + 8;
        const right = window.innerWidth - targetRect.right - 8;
        return `
                <div class="actions-menu" style="top:${top}px; right:${right}px;">
                ${actions.map(action => `<button class="actions-menu-item" data-action="${action.action}" data-id="${action.id}" data-table="${action.table}" data-expense-id="${action.expenseId || ''}"><span class="material-symbols-outlined">${action.icon}</span><span>${action.label}</span></button>`).join('')}
                </div>`;
    }
    if (type === 'invoiceItemsDetail') {
        const {
            items,
            totalAmount
        } = data;
        const itemsHTML = (items || []).map(item => {
            const material = appState.materials.find(m => m.id === item.materialId);
            const itemName = material?material.materialName : 'Material Dihapus';
            const itemUnit = material?`(${material.unit})` : '';
            return `
                <div class="invoice-detail-item">
                    <div class="item-main-info">
                        <span class="item-name">${itemName}</span>
                        <span class="item-total">${fmtIDR(item.total)}</span>
                    </div>
                    <div class="item-sub-info">
                        <span>${item.qty} ${itemUnit} x ${fmtIDR(item.price)}</span>
                    </div>
                </div>`;
        }).join('');
  
        return modalWithHeader('Rincian Faktur', `
                <div class="invoice-detail-list">${itemsHTML}</div>
                <div class="invoice-detail-summary">
                    <span>Total Faktur</span>
                    <strong>${fmtIDR(totalAmount)}</strong>
                </div>
            `);
    }
  
    if (type === 'billActionsModal') {
        const {
            bill,
            actions
        } = data;
        const supplierName = appState.suppliers.find(s => s.id === (appState.expenses.find(e => e.id === bill.expenseId)?.supplierId))?.supplierName || '';
        const modalBody = `
                <div class="actions-modal-header">
                    <h4>${bill.description}</h4>
                    ${supplierName?`<span>${supplierName}</span>` : ''}
                    <strong>${fmtIDR(bill.amount)}</strong>
                </div>
                <div class="actions-modal-list">
                    ${actions.map(action => `<button class="actions-menu-item" data-action="${action.action}" data-id="${action.id}" data-type="${action.type}" data-expense-id="${action.expenseId || ''}"><span class="material-symbols-outlined">${action.icon}</span><span>${action.label}</span></button>`).join('')}
                </div>
            `;
        const modalFooter = `<button class="btn btn-secondary" data-close-modal>Tutup</button>`;
        return `<div class="modal-content"><div class="modal-body">${modalBody}</div><div class="modal-footer">${modalFooter}</div></div>`;
    }
    return `<div>Konten tidak ditemukan</div>`;
}

  function attachModalEventListeners(type, data, closeModalFunc, contextElement = document) {
    const $ = (selector) => contextElement.querySelector(selector);
    const $$ = (selector) => Array.from(contextElement.querySelectorAll(selector));

    if (type === 'login') $('#google-login-btn')?.addEventListener('click', signInWithGoogle);
    if (type === 'confirmLogout') $('#google-login-btn')?.addEventListener('click', handleLogout);

    if (type.startsWith('confirm') && type !== 'confirmExpense') {
        const confirmBtn = $('#confirm-btn');
        if (confirmBtn) {
            confirmBtn.addEventListener('click', () => {
                if (data.onConfirm) {
                    data.onConfirm();
                }
                closeModalFunc();
            });
        }
    }

    if (type === 'confirmExpense') {
        $('#confirm-paid-btn')?.addEventListener('click', () => { if (data.onConfirm) data.onConfirm('paid'); closeModalFunc(); });
        $('#confirm-bill-btn')?.addEventListener('click', () => { if (data.onConfirm) data.onConfirm('unpaid'); closeModalFunc(); });
    }

    if (type === 'payment') {
        const form = $('#payment-form');
        if (!form) return;
        $$('input[inputmode="numeric"]', form).forEach(input => input.addEventListener('input', _formatNumberInput));
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const amount = fmtIDR(parseFormattedNumber(e.target.elements.amount.value));
            let onConfirm;
            const t = e.target.dataset.type;
            if (t === 'bill') onConfirm = () => handleProcessBillPayment(e.target);
            else if (t === 'pinjaman' || t === 'loan') onConfirm = () => handleProcessPayment(e.target);
            else if (t === 'individual-salary') onConfirm = () => handleProcessIndividualSalaryPayment(e.target);
            else onConfirm = () => {};
            createModal('confirmPayBill', {
                message: `Anda akan membayar sebesar ${amount}. Lanjutkan?`,
                onConfirm: async () => {
                    const success = await onConfirm();
                    if (success) {
                       closeModalFunc();
                    }
                }
            });
        });
        $$('input[inputmode="numeric"]')?.forEach(input => input.addEventListener('input', _formatNumberInput));
    }

    if (type === 'actionsMenu') {
        $$('.actions-menu-item').forEach(btn => btn.addEventListener('click', () => closeModalFunc()));
    }

    if (type === 'manageMaster' || type === 'editMaster') {
        const formId = (type === 'manageMaster') ? '#add-master-item-form' : '#edit-master-form';
        const form = $(formId);
        _initCustomSelects(contextElement);
        $$('input[inputmode="numeric"]').forEach(i => i.addEventListener('input', _formatNumberInput));
        if ($('[data-type="staff"]')) _attachStaffFormListeners(contextElement);
    }

    if (type === 'editItem') {
        _initCustomSelects(contextElement);
        $$('input[inputmode="numeric"]').forEach(input => input.addEventListener('input', _formatNumberInput));
        
        $('#edit-item-form')?.addEventListener('submit', (e) => {
            e.preventDefault();
            const form = e.target;
            
            createModal('confirmEdit', {
                onConfirm: async () => {
                    const savingToast = toast('syncing', 'Menyimpan...');
                    const success = await handleUpdateItem(form);
                    savingToast.close();
    
                    if (success) {
                        const { id, type } = form.dataset;
                        
                        await loadAllLocalDataToState(); // Selalu muat ulang state dari Dexie
    
                        let updatedItemForUI, uiCardId, htmlGenerator;
    
                        if (type === 'expense') {
                            const updatedExpense = appState.expenses.find(ex => ex.id === id);
                            if (updatedExpense?.status === 'delivery_order') {
                                uiCardId = `expense-${id}`;
                                updatedItemForUI = { id: uiCardId, expenseId: id, ...updatedExpense };
                                htmlGenerator = (item) => _getBillsListHTML([item]);
                            } else {
                                updatedItemForUI = appState.bills.find(b => b.expenseId === id);
                                uiCardId = updatedItemForUI?.id;
                                htmlGenerator = (item) => _getBillsListHTML([item]);
                            }
                        } else if (type === 'bill' || type === 'fee_bill') {
                            updatedItemForUI = appState.bills.find(b => b.id === id);
                            uiCardId = id;
                            htmlGenerator = (item) => _getBillsListHTML([item]);
                        } else if (type === 'termin') {
                            updatedItemForUI = appState.incomes.find(i => i.id === id);
                            uiCardId = id;
                            htmlGenerator = (item) => _getSinglePemasukanHTML(item, 'termin');
                        } else if (type === 'pinjaman' || type === 'loan') {
                            updatedItemForUI = appState.fundingSources.find(f => f.id === id);
                            uiCardId = id;
                            htmlGenerator = (item) => _getSinglePemasukanHTML(item, 'pinjaman');
                        }
    
                        if (updatedItemForUI && uiCardId && htmlGenerator) {
                            const fullCardHtml = htmlGenerator(updatedItemForUI);
                            const tempDiv = document.createElement('div');
                            tempDiv.innerHTML = fullCardHtml;
                            const contentWrapper = tempDiv.querySelector('.wa-card-v2, .dense-list-item');
                            if (contentWrapper) {
                                _updateItemInListWithAnimation(uiCardId, contentWrapper.innerHTML);
                            }
                        }
    
                        const isDetailOpen = document.body.classList.contains('detail-view-active') || document.body.classList.contains('detail-pane-open');
                        if (isDetailOpen) {
                            if (type === 'expense' || type === 'bill' || type === 'fee_bill') {
                                const billToOpen = appState.bills.find(b => b.expenseId === id || b.id === id);
                                handleOpenBillDetail(billToOpen?.id, (type === 'expense' ? id : billToOpen?.expenseId));
                            } else if (type === 'termin' || type === 'pinjaman' || type === 'loan') {
                                handleOpenPemasukanDetail({ dataset: { id, type } });
                            }
                        }
                        
                        const editModal = document.getElementById('editItem-modal');
                        if (editModal) closeModal(editModal);
    
                        _calculateAndCacheDashboardTotals();
                        syncToServer({ silent: true });
                        toast('success', 'Perubahan berhasil disimpan!');
                    } else {
                        console.error(`[EDIT CONFIRMED] handleUpdateItem() GAGAL.`);
                    }
                }
            });
        });
        if ($('#material-invoice-form') || $('#edit-item-form[data-type="expense"] #invoice-items-container')) {
            _attachPengeluaranFormListeners('material', contextElement);
        }
    }
    
    if (type === 'editAttendance') {
        $('#edit-attendance-form')?.addEventListener('submit', (e) => {
            e.preventDefault();
            handleUpdateAttendance(e.target);
        });
    }
    // --- Tambahkan kode ini di dalam fungsi attachModalEventListeners ---

document.body.addEventListener('click', e => {
    // Event handler untuk menambah item di form faktur/surat jalan
    if (e.target && e.target.id === 'add-invoice-item') {
        e.preventDefault();
        const container = $('#invoice-items-container');
        if (container) {
            const newRow = _createNewInvoiceItemRow(appState.materials);
            container.insertAdjacentHTML('beforeend', newRow);
            initMasMoney();
            const lastRow = container.lastElementChild;
            if(lastRow) initCustomSelect(lastRow.querySelector('.custom-select-wrapper'));
        }
    }
    
    // Event handler untuk menghapus item
    if (e.target && e.target.classList.contains('remove-item-btn')) {
        e.preventDefault();
        e.target.closest('.multi-item-row')?.remove();
    }
});
}
onAuthStateChanged(auth, (user) => {
    if (user) {
        initializeAppSession(user);
    } else {
        Object.assign(appState, {
            currentUser: null,
            userRole: 'Guest',
            userStatus: null,
            justLoggedIn: false
        });
        $('#global-loader').style.display = 'none';
        $('#app-shell').style.display = 'flex';
        renderUI();
        _setActiveListeners([]); // Matikan semua listener saat logout
      }
  });
  
  async function signInWithGoogle() {
    const provider = new GoogleAuthProvider();
    try {
        await signInWithPopup(auth, provider);
        toast('success', 'Login berhasil. Menyiapkan akun...');
    } catch (error) {
        console.error('Popup sign-in failed:', error);
        toast('error', 'Login gagal. Coba lagi.');
    }
  }
  
  async function handleLogout() {
    closeModal($('#confirmLogout-modal'));
    toast('syncing', 'Keluar...');
    try {
        const user = auth.currentUser;
        if (user) {
            const lastActiveUser = {
                displayName: user.displayName,
                photoURL: user.photoURL,
                email: user.email // Simpan email juga untuk info
            };
            localStorage.setItem('lastActiveUser', JSON.stringify(lastActiveUser));
        }
        
        await signOut(auth);
        toast('success', 'Anda telah keluar.');
        renderUI();
    } catch (error) {
        toast('error', `Gagal keluar.`);
    }
}  
  function attachRoleListener(userDocRef) {
    onSnapshot(userDocRef, (docSnap) => {
        if (docSnap.exists()) {
            const {
                role,
                status
            } = docSnap.data();
            if (appState.userRole !== role || appState.userStatus !== status) {
                Object.assign(appState, {
                    userRole: role,
                    userStatus: status
                });
                renderUI();
            }
        }
    });
  }
  
  async function listenForPendingUsers() {
    onSnapshot(query(membersCol, where("status", "==", "pending")), (snapshot) => {
        appState.pendingUsersCount = snapshot.size;
        renderBottomNav();
        renderSidebar();
    });
  }

function _attachRecycleBinListeners() {
    const container = $('.page-container');

    container.addEventListener('input', e => {
        const input = e.target.closest('#trash-search');
        if (!input) return;
        _renderSampahList(input.value || '');
    });

    container.addEventListener('click', e => {
        const actionTarget = e.target.closest('[data-action]');
        if (!actionTarget) return;

        if (actionTarget.dataset.action === 'empty-trash') {
            _handleEmptyRecycleBin();
            return;
        }

        const itemCard = actionTarget.closest('.recycle-bin-item');
        if (itemCard && actionTarget.dataset.action === 'open-trash-item-actions') {
            const existingMenu = document.getElementById('actionsMenu-modal');
            if (existingMenu) {
                existingMenu.remove();
            }
            const { id, table } = itemCard.dataset;
            const actions = [
                { action: 'restore-item', label: 'Pulihkan', icon: 'restore_from_trash', id, table },
                { action: 'delete-permanent-item', label: 'Hapus Permanen', icon: 'delete_forever', id, table }
            ];
            createModal('actionsMenu', { actions, targetRect: actionTarget.getBoundingClientRect() });
        }
    });
}

// =======================================================
  //          SEKSI 3: FUNGSI-FUNGSI HALAMAN
  // =======================================================
  
  // --- SUB-SEKSI 3.1: DASHBOARD & PENGATURAN ---
async function renderDashboardPage() {
    document.body.classList.remove('page-has-unified-panel');
    const container = $('.page-container');
    
    _calculateAndCacheDashboardTotals();

    const { labaBersih, totalUnpaid, projectsWithBudget } = appState.dashboardTotals;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todaysExpenses = appState.expenses.filter(e => _getJSDate(e.date) >= today);
    const dailyRecap = todaysExpenses.reduce((recap, expense) => {
        const projectName = appState.projects.find(p => p.id === expense.projectId)?.projectName || 'Lainnya';
        if (!recap[projectName]) recap[projectName] = 0;
        recap[projectName] += expense.amount;
        return recap;
    }, {});
    
    const trendData = _getDashboardTrendData();

    const balanceCardsHTML = `
        <div class="dashboard-balance-grid">
            <div class="dashboard-balance-card clickable" data-action="navigate" data-nav="laporan">
                <span class="label">Estimasi Laba Bersih</span>
                <strong class="value positive">${fmtIDR(labaBersih)}</strong>
                <div class="sparkline-container"><canvas id="profit-sparkline-chart"></canvas></div>
            </div>
            <div class="dashboard-balance-card clickable" data-action="navigate" data-nav="tagihan">
                <span class="label">Tagihan Belum Lunas</span>
                <strong class="value negative">${fmtIDR(totalUnpaid)}</strong>
                <div class="sparkline-container"><canvas id="bills-sparkline-chart"></canvas></div>
            </div>
        </div>`;

    const projectBudgetHTML = `
        <h5 class="section-title-owner">Sisa Anggaran Proyek</h5>
        <div class="card card-pad" id="project-budget-container">
            ${projectsWithBudget && projectsWithBudget.length > 0 ? projectsWithBudget.map(p => `
                <div class="budget-item">
                    <div class="budget-info">
                        <span class="project-name">${p.projectName}</span>
                        <strong class="remaining-amount ${p.remaining < 0 ? 'negative' : ''}">${fmtIDR(p.remaining)}</strong>
                    </div>
                    <div class="progress-bar-container">
                        <div class="progress-bar" style="width: ${Math.min(p.percentage, 100)}%; background-image: ${p.percentage > 100 ? 'var(--grad-danger)' : 'var(--grad)'};"></div>
                    </div>
                    <div class="budget-details">
                        <span>Terpakai: ${fmtIDR(p.actual)}</span>
                        <span>Anggaran: ${fmtIDR(p.budget)}</span>
                    </div>
                </div>
            `).join('') : '<p class="empty-state-small">Tidak ada proyek dengan anggaran.</p>'}
        </div>`;

    const dailyRecapHTML = `
         <h5 class="section-title-owner">Rekap Pengeluaran Hari Ini</h5>
         <div class="card card-pad">
            ${Object.keys(dailyRecap).length > 0 ? Object.entries(dailyRecap).map(([projectName, total]) => `
                <div class="daily-recap-item">
                    <span>${projectName}</span>
                    <strong>${fmtIDR(total)}</strong>
                </div>
            `).join('') : '<p class="empty-state-small">Tidak ada pengeluaran hari ini.</p>'}
         </div>`;

    const quickActionLinks = ALL_NAV_LINKS.filter(link => link.id !== 'dashboard' && link.id !== 'pengaturan' && link.roles.includes(appState.userRole));
    const preferredOrder = ['tagihan', 'pengeluaran', 'absensi', 'laporan', 'stok', 'pemasukan', 'jurnal', 'simulasi'];
    const sortedActionLinks = quickActionLinks.sort((a, b) => { const indexA = preferredOrder.indexOf(a.id); const indexB = preferredOrder.indexOf(b.id); if (indexA === -1) return 1; if (indexB === -1) return -1; return indexA - indexB; }).slice(0, 8);
    const createActionItemHTML = (link) => `<button class="dashboard-action-item" data-action="navigate" data-nav="${link.id}"><div class="icon-wrapper"><span class="material-symbols-outlined">${link.icon}</span></div><span class="label">${link.label}</span></button>`;
    let quickActionsHTML = '';
    if (sortedActionLinks.length > 0) {
        quickActionsHTML = `<section class="quick-actions-section"><h5 class="section-title-owner">Aksi Cepat</h5><div id="quick-actions-grid" class="dashboard-actions-grid">${sortedActionLinks.map(link => createActionItemHTML(link)).join('')}</div></section>`;
    }
    
    await _transitionContent(container, balanceCardsHTML + quickActionsHTML + projectBudgetHTML + dailyRecapHTML);

    try {
        const values = container.querySelectorAll('.dashboard-balance-card .value');
        if (values[0]) animateNumber(values[0], labaBersih);
        if (values[1]) animateNumber(values[1], totalUnpaid);
    } catch(_) {}
    
    _renderSparklineChart('profit-sparkline-chart', trendData.profit, true);
    _renderSparklineChart('bills-sparkline-chart', trendData.bills, false);
    
    _setActiveListeners(['incomes', 'expenses', 'bills', 'attendance_records']);
}
async function renderPengaturanPage() {
    document.body.classList.remove('page-has-unified-panel'); // [REVISI] Hapus penanda
    const container = $('.page-container');    const { currentUser, userRole } = appState;
    const photo = currentUser?.photoURL || `https://placehold.co/80x80/e2e8f0/64748b?text=${(currentUser?.displayName||'U')[0]}`;
  
    const isDark = document.documentElement.classList.contains('dark-theme');
    
    const ownerOnlyActions = [
        { action: 'manage-master', type: 'projects', icon: 'foundation', label: 'Kelola Proyek' },
        { action: 'manage-master', type: 'staff', icon: 'manage_accounts', label: 'Kelola Staf Inti' },
        { action: 'manage-users', type: null, icon: 'group', label: 'Manajemen User' },
        { action: 'restore-orphan-loans', icon: 'published_with_changes', label: 'Pulihkan Pinjaman Yatim' },
        { action: 'server-cleanup', icon: 'cleaning_services', label: 'Bersihkan Data Server' },
        { action: 'navigate', nav: 'recycle_bin', icon: 'recycling', label: 'Sampah' } 
    ];

    const ownerAndEditorActions = [
        { action: 'manage-master-global', type: null, icon: 'database', label: 'Master Data Lain' },
        { action: 'navigate', nav: 'log_aktivitas', icon: 'history', label: 'Log Aktivitas' },
    ];

    const createActionItemHTML = act => `
        <div class="settings-list-item" data-action="${act.action}" ${act.type?`data-type="${act.type}"` : ''} ${act.nav?`data-nav="${act.nav}"` : ''}>
            <div class="icon-wrapper"><span class="material-symbols-outlined">${act.icon}</span></div>
            <span class="label">${act.label}</span>
        </div>`;

    let adminSectionHTML = '';
    if (userRole === 'Owner' || userRole === 'Editor') {
        let actionItemsHTML = ownerAndEditorActions.map(createActionItemHTML).join('');
        if (userRole === 'Owner') {
            actionItemsHTML = ownerOnlyActions.map(createActionItemHTML).join('') + actionItemsHTML;
        }
        const resetDataHTML = `
            <div class="settings-list-item" data-action="reset-local-data" style="color: var(--danger);">
                <div class="icon-wrapper"><span class="material-symbols-outlined">dangerous</span></div>
                <span class="label">Reset Data Lokal</span>
            </div>
        `;

        adminSectionHTML = `
            <div id="admin-settings">
                <h5 class="section-title-owner">Administrasi</h5>
                <div class="settings-list">${actionItemsHTML}${userRole === 'Owner' ? resetDataHTML : ''}</div>
            </div>
        `;
    }
    
    await _transitionContent(container, `
        <div class="profile-card-settings">
            <button id="theme-toggle-btn" class="btn-icon theme-toggle-btn" data-action="toggle-theme" title="Ubah Tema">
                <span class="material-symbols-outlined">${isDark?'dark_mode':'light_mode'}</span>
            </button>
            <img src="${photo}" alt="Avatar" class="profile-avatar">
            <strong class="profile-name">${currentUser?.displayName || 'Pengguna'}</strong>
            <span class="profile-email">${currentUser?.email || ''}</span>
            <div class="profile-role-badge">${userRole}</div>
            <div class="profile-actions">
                <button class="btn btn-secondary" data-action="auth-action">
                    <span class="material-symbols-outlined">${currentUser?'logout' : 'login'}</span>
                    <span>${currentUser?'Keluar' : 'Masuk'}</span>
                </button>
            </div>
        </div>
        ${adminSectionHTML}
    `);
    _setActiveListeners([]);
}
async function renderKomentarPage() {
    document.body.classList.add('page-has-unified-panel');
    const container = $('.page-container');
    container.classList.add('full-bleed');
    _deactivateSelectionMode();
    const fabContainer = $('#fab-container');
    if (fabContainer) fabContainer.innerHTML = '';
    container.innerHTML = `
        <div class="content-panel">
            <div class="toolbar sticky-toolbar">
                <div class="search">
                    <span class="material-symbols-outlined">search</span>
                    <input type="search" id="komentar-search-input" placeholder="Cari di komentar...">
                </div>
            </div>
            <div id="sub-page-content">${_getSkeletonLoaderHTML('jurnal')}</div>
        </div>
    `;
    await loadAllLocalDataToState();
    _renderChatList();
    $('#komentar-search-input').addEventListener('input', (e) => {
        _renderChatList(e.target.value.toLowerCase());
    });
    _setActiveListeners(['comments', 'bills', 'expenses']);
}
function _renderChatList(searchTerm = '') {
    const contentContainer = $("#sub-page-content");
    if (!contentContainer) return;

    // 1. Kelompokkan komentar berdasarkan parentId
    const commentsByParent = (appState.comments || []).reduce((acc, comment) => {
        if (!comment.isDeleted) {
            if (!acc[comment.parentId]) {
                acc[comment.parentId] = [];
            }
            acc[comment.parentId].push(comment);
        }
        return acc;
    }, {});

    // 2. Buat objek "thread" untuk setiap grup
    const chatThreads = Object.entries(commentsByParent).map(([parentId, comments]) => {
        const parentItem = 
            appState.bills.find(b => b.id === parentId) || 
            appState.expenses.find(e => e.id === parentId) || 
            appState.incomes.find(i => i.id === parentId) || 
            appState.fundingSources.find(f => f.id === parentId);

        if (!parentItem) return null;

        comments.sort((a, b) => _getJSDate(b.createdAt) - _getJSDate(a.createdAt));
        const latestComment = comments[0];
        
        return {
            parentId,
            parentType: latestComment.parentType,
            parentTitle: parentItem.description || parentItem.projectName || 'Item',
            latestCommentText: latestComment.content,
            latestCommentUser: latestComment.userName,
            latestTimestamp: _getJSDate(latestComment.createdAt),
            unreadCount: _getUnreadCommentCount(parentId, comments)
        };
    }).filter(Boolean); // Hapus thread yang parent-nya tidak ditemukan

    // 3. Urutkan thread berdasarkan komentar terbaru
    chatThreads.sort((a, b) => b.latestTimestamp - a.latestTimestamp);
    
    // 4. Filter berdasarkan pencarian
    const filteredThreads = searchTerm
        ? chatThreads.filter(thread => 
            thread.parentTitle.toLowerCase().includes(searchTerm) ||
            thread.latestCommentText.toLowerCase().includes(searchTerm) ||
            thread.latestCommentUser.toLowerCase().includes(searchTerm)
          )
        : chatThreads;

    // 5. Render HTML
    if (filteredThreads.length === 0) {
        contentContainer.innerHTML = _getEmptyStateHTML({
            icon: 'chat',
            title: 'Belum Ada Diskusi',
            desc: 'Mulai diskusi dengan memilih item dari halaman Tagihan atau Pemasukan, lalu tekan tombol komentar.'
        });
        return;
    }

    const listHTML = filteredThreads.map(thread => {
        const time = thread.latestTimestamp.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

        return `
            <div class="wa-card-v2-wrapper chat-list-item" data-id="${thread.parentId}" data-type="${thread.parentType}">
                <div class="wa-card-v2" data-action="open-comments-view" data-parent-id="${thread.parentId}" data-parent-type="${thread.parentType}">
                    <div class="wa-card-v2__main">
                        <div class="wa-card-v2__header">
                            <div class="wa-card-v2__title">${thread.parentTitle}</div>
                            <div class="wa-card-v2__header-meta">${time}</div>
                        </div>
                        <div class="wa-card-v2__body">
                            ${thread.latestCommentUser}: ${thread.latestCommentText}
                        </div>
                    </div>
                    ${thread.unreadCount > 0 ? `
                    <div class="wa-card-v2__meta">
                        <span class="chat-list-item__unread-badge">${thread.unreadCount}</span>
                    </div>` : ''}
                </div>
            </div>
        `;
    }).join('');
    
    contentContainer.innerHTML = `<div class="dense-list-container">${listHTML}</div>`;
}
async function renderLogAktivitasPage() {
    document.body.classList.add('page-has-unified-panel'); // [REVISI] Tambahkan penanda
    const container = $('.page-container');
    container.innerHTML = _getSkeletonLoaderHTML('log_aktivitas');
    
        const q = query(logsCol, orderBy("createdAt", "desc"), limit(200));
        const logSnap = await getDocs(q);
        const allLogs = logSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    
        let currentFilters = {
            searchTerm: '',
            userId: 'all',
            actionType: 'all',
            startDate: '',
            endDate: ''
        };
    
        const getIconForAction = (actionType) => {
            const icons = { add: 'add', edit: 'edit', delete: 'delete' };
            return icons[actionType] || 'info';
        };
    
        const groupLogsByDate = (logList) => {
            if (!logList || logList.length === 0) return {};
            const today = new Date().toISOString().slice(0, 10);
            const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    
            return logList.reduce((acc, log) => {
                const date = _getJSDate(log.createdAt);
                const dateStr = date.toISOString().slice(0, 10);
                
                let displayDate;
                if (dateStr === today) displayDate = 'Hari Ini';
                else if (dateStr === yesterday) displayDate = 'Kemarin';
                else displayDate = date.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' });
                
                if (!acc[displayDate]) acc[displayDate] = [];
                acc[displayDate].push(log);
                return acc;
            }, {});
        };
    
        const renderLogs = (logList) => {
            const logListContainer = $('#log-list-container');
            if (!logListContainer) return;
    
            if (Object.keys(groupLogsByDate(logList)).length === 0) {
                logListContainer.innerHTML = _getEmptyStateHTML({ icon: 'search_off', title: 'Tidak Ada Aktivitas', desc: 'Tidak ada aktivitas yang cocok dengan kriteria filter Anda.' });
                return;
            }
    
            logListContainer.innerHTML = Object.entries(groupLogsByDate(logList)).map(([date, logsOnDate]) => `
                <div class="log-day-group">
                    <div class="log-day-header">${date}</div>
                    ${logsOnDate.map(log => {
                        const time = _getJSDate(log.createdAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                        const hasTarget = log.details && log.details.targetId && log.details.targetType;
                        
                        return `
                        <div class="log-item-card ${hasTarget ? 'clickable' : ''}" 
                             ${hasTarget ? `data-action="view-log-detail" data-target-id="${log.details.targetId}" data-target-type="${log.details.targetType}"` : ''}>
                            <div class="log-item-icon ${log.actionType || 'info'}">
                                <span class="material-symbols-outlined">${getIconForAction(log.actionType)}</span>
                            </div>
                            <div class="log-item-content">
                                <span class="log-item-title">${log.action}</span>
                                <span class="log-item-subtitle"><span class="badge" style="font-size:.75rem; padding:.1rem .4rem;">${log.userName}</span><span style="color:var(--text-dim); margin-left:.35rem;">${time}</span></span>
                            </div>
                            <div class="log-item-timestamp" style="display:none;">${time}</div>
                        </div>`;
                    }).join('')}
                </div>
            `).join('');
        };
    
        const applyFiltersAndRender = () => {
            const { searchTerm, userId, actionType, startDate, endDate } = currentFilters;
            
            const filteredLogs = allLogs.filter(log => {
                const logDate = _getJSDate(log.createdAt);
                const isAfterStartDate = !startDate || logDate >= new Date(startDate + 'T00:00:00');
                const isBeforeEndDate = !endDate || logDate <= new Date(endDate + 'T23:59:59');
                
                return (
                    (log.action.toLowerCase().includes(searchTerm) || log.userName.toLowerCase().includes(searchTerm)) &&
                    (userId === 'all' || log.userId === userId) &&
                    (actionType === 'all' || log.actionType === actionType) &&
                    isAfterStartDate &&
                    isBeforeEndDate
                );
            });
            renderLogs(filteredLogs);
            _updateSummaryCounts(filteredLogs);
        };
        
        const uniqueUsers = [...new Map(allLogs.map(log => [log.userId, { id: log.userId, name: log.userName }])).values()];
        const userOptions = [{ value: 'all', text: 'Semua Pengguna' }, ...uniqueUsers.map(user => ({ value: user.id, text: user.name }))];
        const typeOptions = [
            { value: 'all', text: 'Semua Tipe' }, { value: 'add', text: 'Tambah' },
            { value: 'edit', text: 'Edit' }, { value: 'delete', text: 'Hapus' }
        ];
    
        // Build dynamic summary card like Billing
        const _countLogs = (logs) => logs.reduce((acc, log) => {
            const t = (log.actionType || 'other');
            acc[t] = (acc[t] || 0) + 1; return acc;
        }, {});
        const _renderSummaryCard = (logs) => {
            const countsByType = _countLogs(logs);
            return `
                <div class="summary-card">
                    <div class="summary-card-title">Ringkasan Aktivitas</div>
                    <div class="summary-card-grid">
                        <div class="summary-card-item"><div class="label">Total</div><div id="log-total-count" class="amount">${logs.length}</div></div>
                        <div class="summary-card-item"><div class="label">Tambah</div><div id="log-add-count" class="amount">${countsByType.add || 0}</div></div>
                        <div class="summary-card-item"><div class="label">Edit</div><div id="log-edit-count" class="amount">${countsByType.edit || 0}</div></div>
                        <div class="summary-card-item"><div class="label">Hapus</div><div id="log-delete-count" class="amount">${countsByType.delete || 0}</div></div>
                    </div>
                </div>`;
        };

        const toolbarHTML = `
            <div class="toolbar sticky-toolbar" id="log-toolbar">
                <div class="search-row">
                    <div class="filter-group" style="min-width: 220px;">
                        <label for="log-search-input">Cari Aktivitas</label>
                        <div class="search"><span class="material-symbols-outlined">search</span><input type="search" id="log-search-input" placeholder="Ketik deskripsi atau nama..."></div>
                    </div>
                </div>
                <div class="filters-row">
                    ${createMasterDataSelect('log-user-filter', 'Pengguna', userOptions, 'all')}
                    ${createMasterDataSelect('log-type-filter', 'Tipe Aktivitas', typeOptions, 'all')}
                    ${_createCustomDateInputHTML('log-start-date', 'Dari Tanggal')}
                    ${_createCustomDateInputHTML('log-end-date', 'Sampai Tanggal')}
                </div>
            </div>
        `;

        container.innerHTML = `${_renderSummaryCard(allLogs)}<div class="content-panel">${toolbarHTML}<div class="dense-list-container" id="log-list-container"></div></div>`;
        
        const _updateSummaryCounts = (logs) => {
            const counts = _countLogs(logs);
            const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = String(val); };
            set('log-total-count', logs.length);
            set('log-add-count', counts.add || 0);
            set('log-edit-count', counts.edit || 0);
            set('log-delete-count', counts.delete || 0);
        };

        applyFiltersAndRender();
        _updateSummaryCounts(allLogs);
        
        const updateFilters = () => {
            currentFilters.searchTerm = $('#log-search-input').value.toLowerCase();
            currentFilters.userId = $('#log-user-filter').value;
            currentFilters.actionType = $('#log-type-filter').value;
            currentFilters.startDate = $('#log-start-date').value;
            currentFilters.endDate = $('#log-end-date').value;
            applyFiltersAndRender();
        };
    
        $('#log-search-input').addEventListener('input', updateFilters);
        $('#log-user-filter').addEventListener('change', updateFilters);
        $('#log-type-filter').addEventListener('change', updateFilters);
        $('#log-start-date').addEventListener('change', updateFilters);
        $('#log-end-date').addEventListener('change', updateFilters);
    
        _initCustomSelects(container);
        _initCustomDateInputs(container);
    
        _setActiveListeners([]);
    }

    async function _performSoftDelete(id, type, isSoftDelete = true) {
        console.log(`[_performSoftDelete] Memulai proses soft delete untuk tipe: "${type}", ID: ${id}`);
    
        const localMark = { isDeleted: isSoftDelete ? 1 : 0, syncState: 'pending_update', updatedAt: new Date() };
        const tablesToUpdate = new Set();
        const affectedRecords = [];
        
        try {
            let undoAction = async () => {}; 
    
            await localDB.transaction('rw', localDB.tables, async () => {
                const originalItems = [];
                
                const backupItem = async (table, itemId) => {
                    const item = await table.get(itemId);
                    if (item) originalItems.push({ table, item });
                };
    
                const isBillOrExpense = ['bill', 'bills', 'expense', 'expenses'].includes(type);
    
                if (isBillOrExpense) {
                    console.log(`[_performSoftDelete] Masuk ke logika khusus 'bill'/'expense'.`);
                    let bill, expense;
                    
                    const normalizedType = type.startsWith('bill') ? 'bill' : 'expense';
    
                    if (normalizedType === 'bill') {
                        bill = await localDB.bills.get(id);
                        if (bill && bill.expenseId) {
                            expense = await localDB.expenses.get(bill.expenseId);
                            console.log(`[_performSoftDelete] Memproses 'bill'. Ditemukan 'expense' pasangan dengan ID: ${bill.expenseId}`);
                        } else if (bill) {
                            console.warn(`[_performSoftDelete] Memproses 'bill' (ID: ${id}) yang tidak memiliki expenseId (contoh: gaji).`);
                        }
                    } else { // normalizedType === 'expense'
                        expense = await localDB.expenses.get(id);
                        if (expense) {
                            bill = await localDB.bills.where({ expenseId: id }).first();
                            console.log(`[_performSoftDelete] Memproses 'expense'. Ditemukan 'bill' pasangan dengan ID: ${bill?.id}`);
                        }
                    }
    
                    if (bill) {
                        await backupItem(localDB.bills, bill.id);
                        await localDB.bills.update(bill.id, localMark);
                        tablesToUpdate.add(localDB.bills);
                        affectedRecords.push({ table: 'bills', id: bill.id });
                        console.log(`[_performSoftDelete] BERHASIL menandai 'bills' (ID: ${bill.id}) sebagai isDeleted: ${localMark.isDeleted}`);
                    }
                    if (expense) {
                        await backupItem(localDB.expenses, expense.id);
                        await localDB.expenses.update(expense.id, localMark);
                        tablesToUpdate.add(localDB.expenses);
                        affectedRecords.push({ table: 'expenses', id: expense.id });
                        console.log(`[_performSoftDelete] BERHASIL menandai 'expenses' (ID: ${expense.id}) sebagai isDeleted: ${localMark.isDeleted}`);
                    } 
                } else if (type === 'gaji' || (await localDB.bills.get(id))?.type === 'gaji') {
                    const bill = await localDB.bills.get(id);
                    if (!bill) throw new Error('Tagihan gaji tidak ditemukan.');
                    
                    await backupItem(localDB.bills, bill.id);
                    await localDB.bills.update(id, localMark);
                    tablesToUpdate.add(localDB.bills);
                    affectedRecords.push({ table: 'bills', id });
    
                    if (bill.recordIds && bill.recordIds.length > 0) {
                         const records = await localDB.attendance_records.where('id').anyOf(bill.recordIds).toArray();
                         for(const r of records) { await backupItem(localDB.attendance_records, r.id); }
    
                        const attendanceUpdate = isSoftDelete ? { isPaid: false, billId: null } : { isPaid: true, billId: id };
                        await localDB.attendance_records.where('id').anyOf(bill.recordIds).modify({...attendanceUpdate, syncState: 'pending_update'});
                        tablesToUpdate.add(localDB.attendance_records);
                        for (const rid of bill.recordIds) affectedRecords.push({ table: 'attendance_records', id: rid });
                    }
                } else if (type === 'pinjaman' || type === 'termin' || type === 'funding_sources') {
                    const tableName = (type === 'pinjaman' || type === 'funding_sources') ? 'funding_sources' : 'incomes';                
                    const table = localDB[tableName];
                    if (table) {
                        await backupItem(table, id);
                        await table.update(id, localMark);
                        tablesToUpdate.add(table);
                        affectedRecords.push({ table: tableName, id });
                    } else {
                        throw new Error(`Tabel database '${tableName}' tidak ditemukan.`);
                    }
                } else {
                    const table = localDB[type];
                    if (table) {
                        await backupItem(table, id);
                        await table.update(id, localMark);
                        tablesToUpdate.add(table);
                        affectedRecords.push({ table: type, id });
                    } else {
                        throw new Error(`Tipe data tidak valid: ${type}`);
                    }
                }            
                undoAction = async () => {
                    await localDB.transaction('rw', Array.from(tablesToUpdate), async () => {
                        for (const { table, item } of originalItems) {
                            await table.put(item);
                        }
                    });
                };
            });
    
            if (!isSoftDelete && affectedRecords.length > 0) {
                const seen = new Set();
                for (const rec of affectedRecords) {
                    const key = rec.table + ':' + rec.id;
                    if (seen.has(key)) continue; seen.add(key);
                    try {
                        const docRef = doc(db, 'teams', TEAM_ID, rec.table, rec.id);
                        const snap = await getDoc(docRef);
                        const serverRev = snap.exists() ? (snap.data().rev || 0) : 0;
                        if (serverRev >= 0) {
                            await localDB[rec.table].update(rec.id, { serverRev });
                        }
                    } catch (e) {
                        console.warn('[softDelete-alignRev] Gagal mengambil rev server untuk', rec, e);
                    }
                }
            }

            return { success: true, undoAction };
    
        } catch (error) {
            console.error(`[_performSoftDelete] GAGAL TOTAL untuk ${type}:${id}`, error);
            return { success: false, undoAction: async () => {} };
        }
    }
    
function _groupItemsByDeleteDate(items) {
    const today = new Date(); today.setHours(0,0,0,0);
    const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
    const startOfWeek = new Date(today); startOfWeek.setDate(today.getDate() - today.getDay());
    const groups = { 'Hari ini': [], 'Kemarin': [], 'Minggu ini': [], 'Lebih lama': [] };
    for (const it of items) {
        const dt = _getJSDate(it.updatedAt || it.createdAt);
        const d0 = new Date(dt); d0.setHours(0,0,0,0);
        if (d0.getTime() === today.getTime()) groups['Hari ini'].push(it);
        else if (d0.getTime() === yesterday.getTime()) groups['Kemarin'].push(it);
        else if (d0 >= startOfWeek) groups['Minggu ini'].push(it);
        else groups['Lebih lama'].push(it);
    }
    return Object.entries(groups).filter(([,arr]) => arr.length > 0).map(([label, arr]) => ({ label, items: arr }));
}

function _renderSampahList(query = '') {
    const contentContainer = $('#recycle-bin-content');
    const items = appState.recycledItemsCache || [];
    const term = (query || '').trim().toLowerCase();
    const typeToIcon = {
        bills: 'receipt_long',
        expenses: 'credit_card',
        incomes: 'account_balance_wallet',
        funding_sources: 'payments',
        attendance_records: 'person_check'
    };

    const filtered = term ? items.filter((item) => {
        const table = item.originalTable;
        const expense = table === 'bills' && item.expenseId ? appState.expenses.find(e => e.id === item.expenseId) : (table === 'expenses' ? item : null);
        const supplierName = expense ? (appState.suppliers.find(s => s.id === expense.supplierId)?.supplierName || '') : '';
        const projectName = expense ? (appState.projects.find(p => p.id === expense.projectId)?.projectName || '') : (table === 'incomes' ? (appState.projects.find(p => p.id === item.projectId)?.projectName || '') : (table === 'attendance_records' ? (appState.projects.find(p => p.id === item.projectId)?.projectName || '') : ''));
        const creditorName = table === 'funding_sources' ? (appState.fundingCreditors.find(c => c.id === item.creditorId)?.creditorName || '') : '';
        const hay = [item.description, item.workerName, supplierName, projectName, creditorName].filter(Boolean).join(' ').toLowerCase();
        return hay.includes(term);
    }) : items;

    const groups = _groupItemsByDeleteDate(filtered);

    const buildSubtitle = (it) => {
        const table = it.originalTable;
        const deletedDateText = `Dihapus pada: ${_getJSDate(it.updatedAt).toLocaleDateString('id-ID')}`;

        if (table === 'bills' || table === 'expenses') {
            const exp = table === 'bills' && it.expenseId ? appState.expenses.find(e => e.id === it.expenseId) : it;
            const supplier = exp ? (appState.suppliers.find(s => s.id === exp.supplierId)?.supplierName || '') : '';
            return [supplier, deletedDateText].filter(Boolean).join(' • ');
        } 
        else if (it.originalTable === 'incomes' || it.originalTable === 'attendance_records' || it.originalTable === 'funding_sources') {
             return deletedDateText;
        }
        return '';
    };

    const html = groups.length === 0 ? _getEmptyStateHTML({ icon: 'delete', title: 'Sampah Kosong', desc: 'Semua item yang Anda hapus akan muncul di sini.' }) : groups.map(group => {
        const itemsHTML = group.items.map(item => {
            const tableType = item.originalTable;
            const icon = typeToIcon[tableType] || 'inventory_2';
            let title = item.description || (item.workerName ? `Absensi: ${item.workerName}` : (tableType === 'funding_sources' ? 'Pinjaman' : (tableType === 'incomes' ? 'Pemasukan' : 'Item')));
            if (item.type === 'gaji' && !item.description) title = 'Rekap Gaji';
            const amount = item.amount || item.totalAmount || item.totalPay || 0;
            const subtitle = buildSubtitle(item);

            return `
            <div class="wa-card-v2-wrapper recycle-bin-item" data-id="${item.id}" data-table="${tableType}">
              <div class="selection-checkmark" data-action="toggle-selection">
                  <span class="material-symbols-outlined">check</span>
              </div>
              <div class="wa-card-v2" data-action="item-tap">
                <div class="wa-card-v2__main">
                  <div class="wa-card-v2__header">
                    <div class="wa-card-v2__title"><span class="material-symbols-outlined" style="font-size:1.2rem;margin-right:8px;">${icon}</span>${title}</div>
                  </div>
                  ${subtitle ? `<div class="wa-card-v2__body">${subtitle}</div>` : ''}
                </div>
                <div class="wa-card-v2__meta">
                  <div class="wa-card-v2__amount">${amount > 0 ? fmtIDR(amount) : ''}</div>
                </div>
              </div>
            </div>`;
        }).join('');
        return `<h5 class="list-group-header">${group.label}</h5><div class="dense-list-container">${itemsHTML}</div>`;
    }).join('');

    contentContainer.innerHTML = html;
}
function _updateRecycleBinToolbar() {
    const toolbar = $('#recycle-bin-toolbar');
    const contentContainer = $('#recycle-bin-content');
    if (!toolbar || !contentContainer) return;

    const selectedCount = appState.selectionMode.selectedIds.size;

    if (selectedCount > 0) {
        contentContainer.classList.add('selection-mode-active');
    } else {
        toolbar.innerHTML = `
            <div class="toolbar-left">
                <h4 class="page-title" style="margin:0;">Sampah</h4>
            </div>
            <div class="toolbar-actions">
                <div class="input-group">

                  <input id="trash-search" type="search" placeholder="Cari di Sampah..." />
                </div>
                <button class="btn-icon btn-icon-danger" data-action="empty-trash" title="Kosongkan Sampah">
                    <span class="material-symbols-outlined">delete_forever</span>
                </button>
            </div>`;
        contentContainer.classList.remove('selection-mode-active');
        $('#trash-search', toolbar).addEventListener('input', (e) => _renderSampahList(e.target.value || ''));
    }
}

async function renderRecycleBinPage() {
    document.body.classList.add('page-has-unified-panel');
    const container = $('.page-container');
    container.classList.add('full-bleed');
    _deactivateSelectionMode();

    container.innerHTML = `
        <div class="content-panel">
            ${_createPageToolbarHTML('sampah')}
            <div id="recycle-bin-content">${_getSkeletonLoaderHTML('jurnal')}</div>
        </div>
    `;

    const contentContainer = $('#recycle-bin-content');

    try {
        const deletedExpenses = await localDB.expenses.where('isDeleted').equals(1).toArray();
        const deletedBills = await localDB.bills.where('isDeleted').equals(1).toArray();
        const deletedIncomes = await localDB.incomes.where('isDeleted').equals(1).toArray();
        const deletedFundingSources = await localDB.funding_sources.where('isDeleted').equals(1).toArray();
        const deletedAttendance = await localDB.attendance_records.where('isDeleted').equals(1).toArray();

        const deletedExpenseMap = new Map(deletedExpenses.map(e => [e.id, e]));
        const finalItemsToShow = [];

        for (const bill of deletedBills) {
            if (bill.expenseId && deletedExpenseMap.has(bill.expenseId)) {
                finalItemsToShow.push({ ...bill, originalTable: 'bills' });
                deletedExpenseMap.delete(bill.expenseId);
            } else {
                finalItemsToShow.push({ ...bill, originalTable: 'bills' });
            }
        }

        for (const expense of deletedExpenseMap.values()) {
            finalItemsToShow.push({ ...expense, originalTable: 'expenses' });
        }

        finalItemsToShow.push(...deletedIncomes.map(item => ({ ...item, originalTable: 'incomes' })));
        finalItemsToShow.push(...deletedFundingSources.map(item => ({ ...item, originalTable: 'funding_sources' })));
        finalItemsToShow.push(...deletedAttendance.map(item => ({ ...item, originalTable: 'attendance_records' })));

        const sortedItems = finalItemsToShow.sort((a, b) => _getJSDate(b.updatedAt || b.createdAt) - _getJSDate(a.updatedAt || a.createdAt));

        appState.recycledItemsCache = sortedItems;
        _renderSampahList('');
        _attachRecycleBinListeners();
        _initSelectionMode('#recycle-bin-content', 'sampah');

    } catch (error) {
        console.error("Gagal merender Sampah:", error);
        contentContainer.innerHTML = _getEmptyStateHTML({ icon: 'error', title: 'Gagal Memuat Data', desc: error.message });
    }
}

async function _updateTagihanTabCounts() {
    const categoryNavContainer = $('#category-sub-nav-container');
    if (!categoryNavContainer) return;

    const tabId = $('#main-tabs-container .sub-nav-item.active')?.dataset.tab || 'unpaid';
    const billsForCurrentTab = await localDB.bills.where('status').equals(tabId).filter(b => b.isDeleted !== 1).toArray();
    
    const counts = billsForCurrentTab.reduce((acc, b) => {
        const type = b.type || 'lainnya';
        acc[type] = (acc[type] || 0) + 1;
        return acc;
    }, { material: 0, operasional: 0, gaji: 0, fee: 0, lainnya: 0 });

    counts.all = billsForCurrentTab.length;

    categoryNavContainer.querySelectorAll('.sub-nav-item').forEach(tab => {
        const category = tab.dataset.category;
        const count = counts[category] || 0;
        const countEl = tab.querySelector('.tab-count');
        
        if (countEl) {
            countEl.textContent = count;
        }
        
        if (category !== 'all' && count === 0) {
            tab.style.display = 'none';
        }
    });
}

async function _handleRestoreItems(items) {
    if (items.length === 0) return;
    const loadingToast = toast('syncing', `Memulihkan ${items.length} item...`);
    try {
        for (const item of items) {
            await _performSoftDelete(item.id, item.table, false);
        }

        appState.recycledItemsCache = null; // <-- TAMBAHKAN INI
        loadingToast.close();
        // Show undo-capable toast
        toast('info', items.length === 1 ? 'Item dipulihkan.' : `${items.length} item dipulihkan.`, 6000, {
            actionText: 'Urungkan',
            onAction: async () => {
                for (const item of items) {
                    await _performSoftDelete(item.id, item.table, true);
                }
                renderRecycleBinPage();
                syncToServer({ silent: true });
            }
        });
        renderRecycleBinPage();
        syncToServer({ silent: true });
    } catch (e) {
        loadingToast.close();
        toast('error', 'Gagal memulihkan item.');
        console.error(e);
    }
}

async function _handleDeletePermanentItems(items) {
    if (items.length === 0) return;

    createModal('confirmUserAction', {
        message: `Anda akan menghapus ${items.length} item secara PERMANEN. Aksi ini tidak dapat dibatalkan. Yakin ingin melanjutkan?`,
        onConfirm: async () => {
            toast('syncing', `Menghapus ${items.length} item secara permanen...`);
            try {

                // Kumpulkan semua dokumen untuk dihapus (remote + lokal) termasuk pasangan bill/expense
                const deleteBatch = writeBatch(db);
                const localDeletions = new Set(); // `${table}:${id}`

                const queueLocalDelete = (table, id) => { if (table && id) localDeletions.add(`${table}:${id}`); };
                const queueRemoteDelete = (table, id) => { if (table && id) deleteBatch.delete(doc(db, 'teams', TEAM_ID, table, id)); };

                for (const item of items) {
                    const table = item.table; const id = item.id; if (!table || !id) continue;
                    if (table === 'bills') {
                        const localBill = await localDB.bills.get(id);
                        queueRemoteDelete('bills', id); queueLocalDelete('bills', id);
                        if (localBill?.expenseId) { queueRemoteDelete('expenses', localBill.expenseId); queueLocalDelete('expenses', localBill.expenseId); }
                    } else if (table === 'expenses') {
                        const relatedBill = await localDB.bills.where({ expenseId: id }).first();
                        queueRemoteDelete('expenses', id); queueLocalDelete('expenses', id);
                        if (relatedBill) { queueRemoteDelete('bills', relatedBill.id); queueLocalDelete('bills', relatedBill.id); }
                    } else {
                        queueRemoteDelete(table, id); queueLocalDelete(table, id);
                    }
                }

                const tablesToLock = [...new Set([...localDeletions].map(k => k.split(':')[0]))].map(t => localDB[t]).filter(Boolean);
                await localDB.transaction('rw', tablesToLock, async () => {
                    for (const key of localDeletions) { const [t, id] = key.split(':'); if (localDB[t]) await localDB[t].delete(id); }
                });
                await deleteBatch.commit();
                
                appState.recycledItemsCache = null; // <-- TAMBAHKAN INI

                toast('success', 'Item berhasil dihapus permanen.');
                renderRecycleBinPage();

            } catch (e) {
                toast('error', 'Gagal menghapus item secara permanen.');
                console.error(e);
            }
        }
    });
}

// --- SUB-SEKSI 3.2: PEMASUKAN ---
// GANTI SELURUH FUNGSI INI
async function renderPemasukanPage() {
    try { await _repairStaleBillsFromExpenses(); } catch (_) {}
    document.body.classList.add('page-has-unified-panel');
    const container = $('.page-container');
    container.classList.add('full-bleed');
    _deactivateSelectionMode();

    const tabs = [{ id: 'termin', label: 'Termin Proyek' }, { id: 'pinjaman', label: 'Pinjaman & Pendanaan' }];
    
    container.innerHTML = `
        <div class="content-panel">
            ${_createPageToolbarHTML('pemasukan')}
            <div class="sub-nav two-tabs">
                ${tabs.map((tab, i) => `<button class="sub-nav-item ${i === 0 ? 'active' : ''}" data-tab="${tab.id}">${tab.label}</button>`).join('')}
            </div>
            <div id="sub-page-content">${_getSkeletonLoaderHTML('pemasukan')}</div>
        </div>
    `;

    const fabContainer = $('#fab-container');
    if (fabContainer && !isViewer()) {
        fabContainer.innerHTML = `<button class="fab" data-action="open-pemasukan-form" title="Tambah Pemasukan Baru"><span class="material-symbols-outlined">add</span></button>`;
    }

    const renderTabContent = async (tabId) => {
        appState.activeSubPage.set('pemasukan', tabId);
        await _rerenderPemasukanList(tabId); 
    };

    $('.sub-nav', container).addEventListener('click', e => {
        const tabBtn = e.target.closest('.sub-nav-item');
        const currentActive = $('.sub-nav .active', container);
        if (tabBtn && tabBtn !== currentActive) {
            const direction = Array.from(tabBtn.parentElement.children).indexOf(tabBtn) > Array.from(currentActive.parentElement.children).indexOf(currentActive) ? 'forward' : 'backward';
            if (currentActive) currentActive.classList.remove('active');
            tabBtn.classList.add('active');
            _animateTabSwitch($('#sub-page-content'), () => renderTabContent(tabBtn.dataset.tab), direction);
        }
    });

    await loadAllLocalDataToState();

    const lastSubPage = appState.activeSubPage.get('pemasukan') || tabs[0].id;
    const initialTabButton = $(`.sub-nav-item[data-tab="${lastSubPage}"]`, container);
    if(initialTabButton) {
        const currentActive = $('.sub-nav .active', container);
        if (currentActive) currentActive.classList.remove('active');
        initialTabButton.classList.add('active');
    }
    
    await renderTabContent(lastSubPage);

    _setActiveListeners(['incomes', 'funding_sources']);
}

async function _rerenderPemasukanList(type) {
    let listContainer = $('#sub-page-content');
    if (!listContainer) return;

    listContainer.innerHTML = _getSkeletonLoaderHTML('pemasukan');
    
    await _transitionContent(listContainer, _getListPemasukanHTML(type));
    
    _initSelectionMode('#sub-page-content', 'pemasukan');
}

// One-time repair: align bills with their originating expenses for stale historical edits
async function _repairStaleBillsFromExpenses() {
    try {
        // Collect active (non-deleted) bills and expenses without relying on non-indexed where() clauses
        const [allBills, allExpenses] = await Promise.all([
            localDB.bills.toArray(),
            localDB.expenses.toArray()
        ]);
        const activeBills = allBills.filter(b => b && b.isDeleted !== 1 && b.expenseId && b.type !== 'gaji');
        const activeExpensesMap = new Map(allExpenses.filter(e => e && e.isDeleted !== 1).map(e => [e.id, e]));

        const toUpdate = [];
        for (const bill of activeBills) {
            const exp = activeExpensesMap.get(bill.expenseId);
            if (!exp) continue;
            // If any critical fields differ, update bill to follow expense
            const shouldUpdate = (bill.amount !== exp.amount) || (bill.description !== exp.description);
            if (shouldUpdate) {
                toUpdate.push({ id: bill.id, amount: exp.amount, description: exp.description });
            }
        }

        if (toUpdate.length === 0) return; // nothing to fix

        await localDB.transaction('rw', localDB.bills, async () => {
            for (const upd of toUpdate) {
                await localDB.bills.update(upd.id, {
                    amount: upd.amount,
                    description: upd.description,
                    syncState: 'pending_update',
                    updatedAt: new Date()
                });
            }
        });

        // Refresh in-memory state and caches so UI becomes consistent immediately
        await loadAllLocalDataToState();
        try {
            if (appState.tagihan) {
                const fix = (list) => Array.isArray(list) ? list.map(b => {
                    const m = toUpdate.find(x => x.id === b.id);
                    return m ? { ...b, amount: m.amount, description: m.description } : b;
                }) : list;
                appState.tagihan.fullList = fix(appState.tagihan.fullList);
                appState.tagihan.currentList = fix(appState.tagihan.currentList);
            }
        } catch (_) {}

        // Trigger background sync to push repaired bills to server
        syncToServer({ silent: true });
    } catch (e) {
        console.warn('[repair] Gagal memperbaiki data tagihan yang kedaluwarsa:', e);
    }
}

function _getSinglePemasukanHTML(item, type) {
    const isTermin = type === 'termin';
    const title = isTermin
        ? (appState.projects.find(p => p.id === item.projectId)?.projectName || 'Termin Proyek')
        : (appState.fundingCreditors.find(c => c.id === item.creditorId)?.creditorName || 'Pinjaman');
    
    const amount = item.amount || item.totalAmount || 0; 
    const date = item.date ? _getJSDate(item.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }) : 'Tanggal tidak valid';
    const isPaid = item.status === 'paid';

    let statusInfo = '';
    if (!isTermin) {
        const totalPayable = item.totalRepaymentAmount || amount;
        const paidAmount = item.paidAmount || 0;
        const remainingAmount = totalPayable - paidAmount;
        statusInfo = isPaid
            ? `<span class="status-badge positive">Lunas</span>`
            : `<span class="status-badge warn">Sisa: ${fmtIDR(remainingAmount)}</span>`;
    }

    const isPending = item.syncState && item.syncState !== 'synced';

    return `
    <div class="wa-card-v2-wrapper ${isPending ? 'pending-sync' : ''}" data-id="${item.id}">
        <div class="selection-checkmark" data-action="toggle-selection">
            <span class="material-symbols-outlined">check</span>
        </div>
        <div class="wa-card-v2" data-action="item-tap">
            <div class="wa-card-v2__main">
                <div class="wa-card-v2__header">
                    <div class="wa-card-v2__title">${title}</div>
                    <div class="wa-card-v2__header-meta">${date}</div>
                </div>
                <div class="wa-card-v2__body">${isTermin ? 'Pemasukan Termin' : 'Pinjaman Dana'}</div>
            </div>
            <div class="wa-card-v2__meta">
                <div class="wa-card-v2__amount positive">${fmtIDR(amount)}</div>
                <div class="wa-card-v2__status">${statusInfo}</div>
            </div>
            <div class="item-actions">
                <button class="btn-icon" data-action="open-item-actions-modal" data-id="${item.id}" data-type="${type}" title="Aksi lainnya">
                    <span class="material-symbols-outlined">more_vert</span>
                </button>
            </div>
        </div>
    </div>`;
}
async function handleOpenPemasukanDetail(target) {
    if (!target) return;
    const { id, type } = target.dataset;
    if (!id || !type) return;

    await fetchAndCacheData('fundingCreditors', fundingCreditorsCol, 'creditorName');

    let initialTitle = (type === 'termin') ? 'Detail Termin Proyek' : 'Detail Pinjaman';
    // Langkah 1: Buka panel dengan skeleton loader.
    showDetailPane({
        title: `Memuat ${initialTitle}...`,
        content: _getSkeletonLoaderHTML('laporan'),
        footer: '',
        headerActions: ''
    });

    try {
        let item = null;
        if (type === 'termin') {
            item = appState.incomes.find(i => i.id === id) || await localDB.incomes.get(id);
        } else if (type === 'pinjaman') {
            item = appState.fundingSources.find(f => f.id === id) || await localDB.funding_sources.get(id);
        }

        if (!item) {
            throw new Error('Data pemasukan tidak dapat ditemukan.');
        }        
        const content = _createDetailContentHTML(item, type);
        let title = (type === 'termin') ? 'Detail Termin Proyek' : 'Detail Pinjaman';
        
        // [PERBAIKAN KUNCI] Update panel yang sudah ada dengan konten final.
        const detailPane = document.getElementById('detail-pane');
        if (detailPane) {
            const titleEl = detailPane.querySelector('h4, .breadcrumb-nav strong');
            const bodyContainer = detailPane.querySelector('.detail-pane-body, .mobile-detail-content');
            if(titleEl) titleEl.textContent = title;
            if(bodyContainer) bodyContainer.innerHTML = content;
        }

    } catch (error) {
        console.error("Gagal memuat detail pemasukan:", error);
        toast('error', error.message);
        const detailPane = document.getElementById('detail-pane');
        const bodyContainer = detailPane.querySelector('.detail-pane-body, .mobile-detail-content');
        if(bodyContainer) {
            bodyContainer.innerHTML = _getEmptyStateHTML({ icon: 'error', title: 'Gagal Memuat', desc: error.message });
        }
    }
}

function _getFormPemasukanHTML(type, itemData = null) {
    const isEdit = !!itemData;
    const formId = isEdit ? 'edit-item-form' : 'pemasukan-form';
    const formActionAttrs = isEdit 
        ? `data-id="${itemData.id}" data-type="${type}"` 
        : `data-type="${type}" data-async="true" method="POST" data-endpoint="/api/incomes" data-success-msg="Pemasukan tersimpan"`;
    const submitText = isEdit ? 'Simpan Perubahan' : 'Simpan';
    const today = new Date();
    const offset = today.getTimezoneOffset();
    const todayLocal = new Date(today.getTime() - (offset * 60 * 1000));
    const todayString = todayLocal.toISOString().split('T')[0];

    let formHTML = '';

    if (type === 'termin') {
        const projectOptions = appState.projects
            .filter(p => p.projectType === 'main_income')
            .map(p => ({
                value: p.id,
                text: p.projectName
            }));

        const amountValue = isEdit ? new Intl.NumberFormat('id-ID').format(itemData.amount) : '';
        const dateValue = isEdit ? _getJSDate(itemData.date).toISOString().slice(0, 10) : todayString;
        const selectedProjectId = isEdit ? itemData.projectId : '';

        formHTML = `
            <div class="card card-pad desktop-form-layout">
                <form id="${formId}" ${formActionAttrs}>
                    ${createMasterDataSelect('pemasukan-proyek', 'Proyek Terkait', projectOptions, selectedProjectId, 'projects')}
                    <div class="form-group">
                        <label>Jumlah Termin Diterima</label>
                        <input type="text" inputmode="numeric" id="pemasukan-jumlah" name="amount" required placeholder="mis. 50.000.000" value="${amountValue}">
                    </div>
                    <div class="form-group">
                        <label>Tanggal</label>
                        <input type="date" id="pemasukan-tanggal" name="date" value="${dateValue}" required>
                    </div>
                    <div id="fee-allocation-container" style="margin-top: 1.5rem;" class="full-width"></div>
                    
                    <div class="form-footer-actions">
                        <button type="submit" class="btn btn-primary">${submitText}</button>
                    </div>
                </form>
            </div>
        `;
    } else if (type === 'pinjaman') {
        const creditorOptions = appState.fundingCreditors.map(c => ({
            value: c.id,
            text: c.creditorName
        }));
        const loanTypeOptions = [
            { value: 'none', text: 'Tanpa Bunga' },
            { value: 'interest', text: 'Berbunga' }
        ];

        const amountValue = isEdit ? new Intl.NumberFormat('id-ID').format(itemData.totalAmount) : '';
        const dateValue = isEdit ? _getJSDate(itemData.date).toISOString().slice(0, 10) : todayString;
        const selectedCreditorId = isEdit ? itemData.creditorId : '';
        const selectedInterestType = isEdit ? itemData.interestType : 'none';
        const rateValue = isEdit ? itemData.rate || '' : '';
        const tenorValue = isEdit ? itemData.tenor || '' : '';

        formHTML = `
            <div class="card card-pad desktop-form-layout">
                <form id="${formId}" ${formActionAttrs}>
                    <div class="form-grid-2col">
                        <div class="form-group">
                            <label>Jumlah</label>
                            <input type="text" inputmode="numeric" id="pemasukan-jumlah" name="totalAmount" required placeholder="mis. 5.000.000" value="${amountValue}">
                        </div>
                        <div class="form-group">
                            <label>Tanggal</label>
                            <input type="date" id="pemasukan-tanggal" name="date" value="${dateValue}" required>
                        </div>
                        
                        ${createMasterDataSelect('pemasukan-kreditur', 'Kreditur', creditorOptions, selectedCreditorId, 'creditors')}
                        
                        ${createMasterDataSelect('loan-interest-type', 'Jenis Pinjaman', loanTypeOptions, selectedInterestType)}
                    </div>
                    
                    <div class="loan-details ${selectedInterestType === 'none' ? 'hidden' : ''} full-width">
                        <div class="form-group">
                            <label>Suku Bunga (% per bulan)</label>
                            <input type="number" id="loan-rate" name="rate" placeholder="mis. 10" step="0.01" min="1" value="${rateValue}">
                        </div>
                        <div class="form-group">
                            <label>Tenor (bulan)</label>
                            <input type="number" id="loan-tenor" name="tenor" placeholder="mis. 3" min="1" value="${tenorValue}">
                        </div>
                        <div id="loan-calculation-result" class="loan-calculation-result"></div>
                    </div>
    
                    <div class="form-footer-actions">
                        <button type="submit" class="btn btn-primary">${submitText} Pinjaman</button>
                    </div>
                </form>
            </div>
        `;
    }
    
    return formHTML;
}

function _getListPemasukanHTML(type) {
    const list = type === 'termin' ? appState.incomes : appState.fundingSources;
    if (!list || list.length === 0) {
        return _getEmptyStateHTML({
            icon: 'account_balance_wallet',
            title: 'Belum Ada Pemasukan',
            desc: 'Catat pemasukan atau pinjaman untuk mulai melacak arus kas.',
        });
    }

    const sortedList = [...list].sort((a, b) => _getJSDate(b.date) - _getJSDate(a.date));

    let listHTML = '';
    let lastGroupLabel = '';
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
    const startOfWeek = new Date(today); startOfWeek.setDate(today.getDate() - (today.getDay() === 0 ? 6 : today.getDay() - 1));

    const getGroupLabel = (date) => {
        const d0 = new Date(date); d0.setHours(0, 0, 0, 0);
        if (d0.getTime() === today.getTime()) return 'Hari ini';
        if (d0.getTime() === yesterday.getTime()) return 'Kemarin';
        if (d0 >= startOfWeek) return 'Minggu ini';
        return d0.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
    };

    sortedList.forEach(item => {
        const itemDate = _getJSDate(item.date);
        const currentGroupLabel = getGroupLabel(itemDate);
        
        if (currentGroupLabel !== lastGroupLabel) {
            listHTML += `<h5 class="list-group-header">${currentGroupLabel}</h5>`;
            lastGroupLabel = currentGroupLabel;
        }
        listHTML += _getSinglePemasukanHTML(item, type);
    });

    return `<div id="pemasukan-list-container" class="dense-list-container">${listHTML}</div>`;
}

function _attachSwipeHandlers(containerSelector) {
    return;
    const container = document.querySelector(containerSelector);
    if (!container) return;

    if (container._swipeHandlers) {
        container.removeEventListener('touchstart', container._swipeHandlers.start, { passive: true });
    }
    
    let openCardWrapper = null;

    const closeOpenCard = () => {
        if (openCardWrapper) {
            const content = openCardWrapper.querySelector('.wa-card-v2');
            if(content) content.style.transform = ''; // Kembalikan ke posisi awal
            openCardWrapper.classList.remove('swipe-open');
            openCardWrapper = null;
        }
    };

    const onTouchStart = e => {
        if (appState.selectionMode.active) return;

        const itemWrapper = e.target.closest('.wa-card-v2-wrapper');
        
        if (openCardWrapper && openCardWrapper !== itemWrapper) {
            closeOpenCard();
        }

        if (!itemWrapper || !itemWrapper.querySelector('.swipe-actions')) return;

        const content = itemWrapper.querySelector('.wa-card-v2');
        if (!content) return;
        
        content.dataset.startX = e.touches[0].clientX;
        content.dataset.currentX = content.dataset.startX;
        content.dataset.isSwiping = 'true';
        content.style.transition = 'none'; // Hapus transisi saat digeser
    };

    const onTouchMove = e => {
        const content = e.target.closest('.wa-card-v2');
        if (!content || content.dataset.isSwiping !== 'true') return;

        content.dataset.currentX = e.touches[0].clientX;
        const dx = parseFloat(content.dataset.currentX) - parseFloat(content.dataset.startX);
        const actionsWidth = 160; // LEBAR BARU SESUAI CSS

        if (dx < 0) {
            const limitedDx = Math.max(dx, -actionsWidth - 20); 
            content.style.transform = `translateX(${limitedDx}px)`;
        }
    };

    const onTouchEnd = e => {
        const itemWrapper = e.target.closest('.wa-card-v2-wrapper');
        const content = e.target.closest('.wa-card-v2');
        if (!content || content.dataset.isSwiping !== 'true') return;
        
        content.dataset.isSwiping = 'false';
        content.style.transition = ''; // Kembalikan transisi untuk animasi
        
        const dx = parseFloat(content.dataset.currentX) - parseFloat(content.dataset.startX);
        const actionsWidth = 160; // LEBAR BARU SESUAI CSS

        if (dx < -(actionsWidth * 0.4)) {
            itemWrapper.classList.add('swipe-open');
            openCardWrapper = itemWrapper;
        } else {
            content.style.transform = '';
            itemWrapper.classList.remove('swipe-open');
            if(openCardWrapper === itemWrapper) {
                openCardWrapper = null;
            }
        }
    };

    container.removeEventListener('touchstart', onTouchStart, { passive: true });
    container.removeEventListener('touchmove', onTouchMove, { passive: true });
    container.removeEventListener('touchend', onTouchEnd);
    
    container.addEventListener('touchstart', onTouchStart, { passive: true });
    document.body.addEventListener('touchmove', onTouchMove, { passive: true });
    document.body.addEventListener('touchend', onTouchEnd);

    container._swipeHandlers = { start: onTouchStart }; // Simpan referensi untuk bisa dihapus nanti
    
    if (!window.globalSwipeCloseListener) {
        document.addEventListener('touchstart', (e) => {
            if (openCardWrapper && !e.target.closest('.wa-card-v2-wrapper.swipe-open')) {
                closeOpenCard();
            }
        }, true); // Gunakan `true` untuk event capturing
        window.globalSwipeCloseListener = true;
    }
}
function _createDetailContentHTML(item, type) {
    const details = [];
    const formatDate = (date) => date ? _getJSDate(date).toLocaleDateString('id-ID', {
        day: 'numeric', month: 'long', year: 'numeric'
    }) : '-';

    if (type === 'termin') {
        const projectName = appState.projects.find(p => p.id === item.projectId)?.projectName || 'Tidak ditemukan';
        details.push({ label: 'Proyek', value: projectName });
        details.push({ label: 'Jumlah', value: fmtIDR(item.amount) });
        details.push({ label: 'Tanggal Pemasukan', value: formatDate(item.date) });
    } else { // type === 'pinjaman'
        const creditorName = appState.fundingCreditors.find(c => c.id === item.creditorId)?.creditorName || 'Tidak ditemukan';
        const totalAmount = item.totalAmount || 0;
        const totalPayable = item.totalRepaymentAmount || totalAmount;
        const paidAmount = item.paidAmount || 0;
        const remainingAmount = totalPayable - paidAmount;

        details.push({ label: 'Kreditur', value: creditorName });
        details.push({ label: 'Jumlah Pinjaman', value: fmtIDR(totalAmount) });
        details.push({ label: 'Tanggal Pinjaman', value: formatDate(item.date) });
        details.push({ label: 'Jenis Pinjaman', value: item.interestType === 'interest' ? 'Berbunga' : 'Tanpa Bunga' });

        if (item.interestType === 'interest') {
            details.push({ label: 'Suku Bunga', value: `${item.rate || 0}% per bulan` });
            details.push({ label: 'Tenor', value: `${item.tenor || 0} bulan` });
            details.push({ label: 'Total Tagihan', value: fmtIDR(totalPayable) });
        }

        details.push({ label: 'Sudah Dibayar', value: fmtIDR(paidAmount) });
        details.push({ label: 'Sisa Tagihan', value: fmtIDR(remainingAmount) });
        details.push({ label: 'Status', value: item.status === 'paid' ? 'Lunas' : 'Belum Lunas' });
    }

    const summaryItems = details.slice(0, 4);
    const detailItems = details.slice(4);

    const summaryHTML = `
        <div class="detail-section" style="margin-top:0;">
            <div class="detail-summary-grid">
                ${summaryItems.map(d => `
                    <div class="summary-item">
                        <span class="label">${d.label}</span>
                        <strong class="value">${d.value}</strong>
                    </div>
                `).join('')}
            </div>
        </div>
    `;

    let createdMetaHTML = '';
    if (type === 'pinjaman') {
        const createdDt = item?.createdAt ? _getJSDate(item.createdAt) : null;
        const createdOn = createdDt ? `${createdDt.toLocaleDateString('id-ID', { day:'numeric', month:'long', year:'numeric' })} ${createdDt.toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit', second:'2-digit' })}` : '-';
        const createdByName = item?.createdByName;
        const createdByUID = item?.createdBy;
        let createdByHTML = '-';
        if (createdByName) {
            createdByHTML = `<span class="badge" style="font-size:.8rem; padding:.25rem .6rem;">${createdByName}</span>`;
        }
        
            createdMetaHTML = `
            <div class="detail-section">
                <dl class="detail-list">
                    <div><dt>Dibuat Pada</dt><dd>${createdOn}</dd></div>
                    <div><dt>Dibuat Oleh</dt><dd>${createdByHTML}</dd></div>
                </dl>
            </div>
        `;
    }

    const detailsHTML = detailItems.length > 0 ? `
        <div class="detail-section">
            <dl class="detail-list">
                ${detailItems.map(d => `<div><dt>${d.label}</dt><dd>${d.value}</dd></div>`).join('')}
            </dl>
        </div>
    ` : '';
    
    return summaryHTML + createdMetaHTML + detailsHTML;
}

  function _initAutocomplete(context = document) {
    const wrappers = $$('.autocomplete-wrapper', context);
  
    wrappers.forEach(wrapper => {
        const input = $('input.autocomplete-input', wrapper);
        const idInput = $('input.autocomplete-id', wrapper);
        const suggestionsContainer = $('.autocomplete-suggestions', wrapper);
        const clearBtn = $('.autocomplete-clear-btn', wrapper);
        if (wrapper.dataset.initialized) return;
        wrapper.dataset.initialized = 'true';
  
        input.addEventListener('input', async () => {
            const searchTerm = input.value.toLowerCase();
            idInput.value = '';
            input.readOnly = false;
            if (searchTerm.length < 1) { // Tampilkan saran bahkan dari 1 huruf
                suggestionsContainer.innerHTML = '';
                suggestionsContainer.classList.remove('active');
                return;
            }
            if (!appState.materials || appState.materials.length === 0) {
                await fetchAndCacheData('materials', collection(db, 'teams', TEAM_ID, 'materials'), 'materialName');
            }
            const filteredMaterials = appState.materials.filter(m =>
                m.materialName.toLowerCase().includes(searchTerm)
            );
  
            if (filteredMaterials.length > 0) {
                suggestionsContainer.innerHTML = filteredMaterials.map(m => {
                    const highlightedName = m.materialName.replace(
                        new RegExp(searchTerm, 'gi'),
                        (match) => `<span class="match-highlight">${match}</span>`
                    );
                    return `
                        <div class="suggestion-item" data-id="${m.id}" data-name="${m.materialName}">
                            <strong class="suggestion-name">${highlightedName}</strong>
                            <span class="unit-badge">${m.unit || '-'}</span>
                        </div>
                    `;
                }).join('');
                suggestionsContainer.classList.add('active');
            } else {
                suggestionsContainer.classList.remove('active');
            }
        });
  
        suggestionsContainer.addEventListener('click', (e) => {
            const selectedItem = e.target.closest('.suggestion-item');
            if (selectedItem) {
                const materialId = selectedItem.dataset.id;
                const materialName = selectedItem.dataset.name;
                input.value = selectedItem.dataset.name;
                idInput.value = selectedItem.dataset.id;
                input.readOnly = true;
                suggestionsContainer.classList.remove('active');
                if (clearBtn) clearBtn.style.display = 'flex';
                const row = wrapper.closest('.invoice-item-row');
                if (row) {
                    const unitSpan = row.querySelector('.item-unit');
                    if (unitSpan) {
                        const mat = appState.materials.find(m => m.id === materialId);
                        unitSpan.textContent = mat?.unit || '';
                    }
                }
            }
        });
  
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                input.value = ''; // 1. Kosongkan input nama
                idInput.value = ''; // 2. Kosongkan input ID
                input.readOnly = false; // 3. Buka kunci input
                clearBtn.style.display = 'none'; // 4. Sembunyikan tombol hapus
                input.focus();
                const row = wrapper.closest('.invoice-item-row');
                const unitSpan = row?.querySelector('.item-unit');
                if (unitSpan) unitSpan.textContent = '';
            });
        }
    });
  
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.autocomplete-wrapper')) {
            $$('.autocomplete-suggestions.active').forEach(s => s.classList.remove('active'));
        }
    });
  }
  
  function _updateLoanCalculation() {
    const resultEl = $('#loan-calculation-result');
    if (!resultEl) return;
  
    const amount = parseFormattedNumber($('#pemasukan-jumlah')?.value || '0');
    const rate = Number($('#loan-rate')?.value || '0');
    const tenor = Number($('#loan-tenor')?.value || '0');
  
    if (amount > 0 && rate > 0 && tenor > 0) {
        const totalInterest = amount * (rate / 100) * tenor;
        const totalRepayment = amount + totalInterest;
  
        resultEl.innerHTML = `
                <span class="label">Total Tagihan Pinjaman</span>
                <span class="amount">${fmtIDR(totalRepayment)}</span>
            `;
        resultEl.style.display = 'block';
    } else {
        resultEl.style.display = 'none';
    }
  }
  
  function _formatNumberInput(e) {
    const input = e.target;
    let selectionStart = input.selectionStart;
    const originalLength = input.value.length;
    const rawValue = parseFormattedNumber(input.value);
  
    if (isNaN(rawValue)) {
        input.value = '';
        return;
    }
  
    const formattedValue = new Intl.NumberFormat('id-ID').format(rawValue);
  
    if (input.value !== formattedValue) {
        input.value = formattedValue;
        const newLength = formattedValue.length;
        const diff = newLength - originalLength;
        if (selectionStart !== null) {
            input.setSelectionRange(selectionStart + diff, selectionStart + diff);
        }
    }
  }

function _initCustomSelects(context = document) {
    const closeAllSelects = () => {
        document.querySelectorAll('.cloned-select-options').forEach(clone => clone.remove());
    };

    // Listener global untuk menutup dropdown saat klik di luar
    document.removeEventListener('mousedown', closeAllSelects);
    document.addEventListener('mousedown', closeAllSelects);

    context.querySelectorAll('.custom-select-wrapper:not([data-custom-select-init])').forEach(wrapper => {
        wrapper.dataset.customSelectInit = 'true';
        const trigger = wrapper.querySelector('.custom-select-trigger');
        const hiddenInput = wrapper.querySelector('input[type="hidden"]');
        const triggerSpan = trigger.querySelector('span:first-child');

        wrapper.addEventListener('mousedown', e => e.stopPropagation());

        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            closeAllSelects(); // Selalu tutup semua dropdown lain sebelum membuka yang baru

            const optionsContainer = wrapper.querySelector('.custom-select-options');
            if (!optionsContainer) return;
            
            // 1. Kloning Pilihan & Tambahkan ke Body
            const clone = optionsContainer.cloneNode(true);
            clone.classList.add('cloned-select-options');
            clone.addEventListener('mousedown', e => e.stopPropagation());
            (trigger.closest('.modal-bg') || document.body).appendChild(clone);

            const optionsListEl = clone.querySelector('.custom-select-options-list');
            const searchInputClone = clone.querySelector('.custom-select-search');
            const allOptionNodes = Array.from(clone.querySelectorAll('.custom-select-option'));

            // 2. Logika untuk Menyesuaikan Posisi & Ukuran
            const adjustPosition = () => {
                const triggerRect = trigger.getBoundingClientRect();
                const viewportHeight = window.innerHeight;
                const margin = 10;
                const searchH = searchInputClone ? searchInputClone.parentElement.offsetHeight : 0;
                const itemHeight = allOptionNodes.length > 0 ? allOptionNodes[0].offsetHeight : 40;
                
                // Tinggi ideal adalah 5.5 item atau tinggi konten, mana yang lebih kecil
                const idealHeight = searchH + (itemHeight * 5.5) + 10; // 10 untuk padding

                const availableBelow = viewportHeight - triggerRect.bottom - margin;
                const availableAbove = triggerRect.top - margin;

                let finalHeight = idealHeight;
                let placeAbove = false;

                if (availableBelow < idealHeight && availableAbove > availableBelow) {
                    finalHeight = Math.min(idealHeight, availableAbove);
                    placeAbove = true;
                } else {
                    finalHeight = Math.min(idealHeight, availableBelow);
                }

                clone.style.width = `${triggerRect.width}px`;
                clone.style.left = `${triggerRect.left}px`;
                if (placeAbove) {
                    clone.style.bottom = `${viewportHeight - triggerRect.top}px`;
                    clone.style.top = 'auto';
                } else {
                    clone.style.top = `${triggerRect.bottom}px`;
                    clone.style.bottom = 'auto';
                }
                clone.style.maxHeight = `${finalHeight}px`;
                optionsListEl.style.maxHeight = `${finalHeight - searchH}px`;
            };

            adjustPosition();
            if (searchInputClone) searchInputClone.focus();

            // 3. Event Listeners untuk Interaksi
            clone.addEventListener('click', e => {
                const option = e.target.closest('.custom-select-option');
                if (option) {
                    hiddenInput.value = option.dataset.value;
                    triggerSpan.textContent = option.textContent.trim();
                    hiddenInput.dispatchEvent(new Event('change', { bubbles: true }));
                    closeAllSelects();
                }
            });

            if (searchInputClone) {
                searchInputClone.addEventListener('input', () => {
                    const searchTerm = searchInputClone.value.toLowerCase();
                    const fragment = document.createDocumentFragment();
                    allOptionNodes.forEach(node => {
                        if (node.textContent.toLowerCase().includes(searchTerm)) {
                            fragment.appendChild(node);
                        }
                    });
                    optionsListEl.innerHTML = '';
                    optionsListEl.appendChild(fragment);
                });
            }
        });
    });
}

function _attachPemasukanFormListeners(modal) {
    if (!modal) return;
    
    _initCustomSelects(modal);
  
    modal.querySelector('#loan-interest-type')?.addEventListener('change', () => {
        modal.querySelector('.loan-details')?.classList.toggle('hidden', modal.querySelector('#loan-interest-type').value === 'none');
    });
  
    const amountInput = modal.querySelector('#pemasukan-jumlah');
    const rateInput = modal.querySelector('#loan-rate');
    const tenorInput = modal.querySelector('#loan-tenor');
  
    if (amountInput) {
        amountInput.addEventListener('input', _formatNumberInput);
        amountInput.addEventListener('input', () => {
            const formType = modal.querySelector('#pemasukan-form')?.dataset.type;
            if (formType === 'termin') _calculateAndDisplayFees();
            else _updateLoanCalculation();
        });
    }
    rateInput?.addEventListener('input', _updateLoanCalculation);
    tenorInput?.addEventListener('input', _updateLoanCalculation);
}

  async function _calculateAndDisplayFees() {
    const container = $('#fee-allocation-container');
    const amount = parseFormattedNumber($('#pemasukan-jumlah').value);
    if (!container || amount <= 0) {
        if (container) container.innerHTML = '';
        return;
    }
  
    await fetchAndCacheData('staff', collection(db, 'teams', TEAM_ID, 'staff'), 'staffName');
    const allStaff = appState.staff || [];
    const relevantStaff = allStaff.filter(s => s.paymentType === 'per_termin' || s.paymentType === 'fixed_per_termin');
    if (relevantStaff.length === 0) return;
  
    let totalFee = 0;
    const allocationHTML = relevantStaff.map(staff => {
        let feeAmount = 0;
        const isFixed = staff.paymentType === 'fixed_per_termin';
  
        if (isFixed) {
            feeAmount = staff.feeAmount || 0;
        } else { // per_termin
            feeAmount = amount * ((staff.feePercentage || 0) / 100);
        }
  
        return `
                <div class="detail-list-item">
                    ${isFixed?`<label class="custom-checkbox-label"><input type="checkbox" class="fee-alloc-checkbox" data-amount="${feeAmount}" data-staff-id="${staff.id}" checked><span class="custom-checkbox-visual"></span></label>` : '<div style="width: 20px;"></div>'}
                    <div class="item-main">
                        <span class="item-date">${staff.staffName} ${isFixed?'' : `(${staff.feePercentage}%)`}</span>
                        <span class="item-project">${isFixed?'Fee Tetap' : 'Fee Persentase'}</span>
                    </div>
                    <div class="item-secondary">
                        <strong class="item-amount positive">${fmtIDR(feeAmount)}</strong>
                    </div>
                </div>
            `;
    }).join('');
  
    container.innerHTML = `
            <h5 class="invoice-section-title">Alokasi Fee Tim</h5>
            <div class="detail-list-container">${allocationHTML}</div>
            <div class="invoice-total">
                <span>Total Alokasi Fee:</span>
                <strong id="total-fee-amount">${fmtIDR(totalFee)}</strong>
            </div>
        `;
  
    const updateTotalFee = () => {
        let currentTotal = allStaff.filter(s => s.paymentType === 'per_termin').reduce((sum, s) => sum + (amount * ((s.feePercentage || 0) / 100)), 0);
        $$('.fee-alloc-checkbox:checked').forEach(cb => {
            currentTotal += Number(cb.dataset.amount);
        });
        $('#total-fee-amount').textContent = fmtIDR(currentTotal);
    };
  
    $$('.fee-alloc-checkbox').forEach(cb => cb.addEventListener('change', updateTotalFee));
    updateTotalFee();
  }
  
async function handleAddPemasukan(e) {
    e.preventDefault();
    const form = e.target;
    const type = form.dataset.type;
    let data, localTable, logMessage, configTitle, stateKey;

    try {
        const createdByInfo = {
            createdBy: appState.currentUser.uid,
            createdByName: appState.currentUser.displayName,
            createdAt: new Date(),
            updatedAt: new Date()
        };

        if (type === 'termin') {
            const amount = parseFormattedNumber(form.elements['pemasukan-jumlah'].value);
            const date = new Date(form.elements['pemasukan-tanggal'].value);
            const projectId = form.elements['pemasukan-proyek'].value;
            if (!projectId || !date.valueOf() || amount <= 0) throw new Error('Proyek, Tanggal, dan Jumlah harus diisi.');
            data = { id: generateUUID(), amount, date, projectId, isDeleted: 0, syncState: 'pending_create', ...createdByInfo };
            localTable = localDB.incomes; 
            stateKey = 'incomes';
            logMessage = 'Menambah Termin'; 
            configTitle = 'Pemasukan Termin';
        } else if (type === 'pinjaman') {
            const amount = parseFormattedNumber(form.elements['pemasukan-jumlah'].value);
            const date = new Date(form.elements['pemasukan-tanggal'].value);
            const creditorId = form.elements['pemasukan-kreditur'].value;
            const interestType = form.elements['loan-interest-type'].value;
            const rate = Number(form.elements['loan-rate'].value || 0);
            const tenor = Number(form.elements['loan-tenor'].value || 0);

            if (!creditorId || !date.valueOf() || amount <= 0) throw new Error('Kreditur, Tanggal, dan Jumlah harus diisi.');
            
            data = { 
                id: generateUUID(), 
                creditorId, 
                totalAmount: amount, 
                date, 
                status: 'unpaid', 
                paidAmount: 0, 
                isDeleted: 0, 
                syncState: 'pending_create',
                interestType,
                rate,
                tenor,
                ...createdByInfo
            };

            if (interestType === 'interest' && rate > 0 && tenor > 0) {
                const totalInterest = amount * (rate / 100) * tenor;
                data.totalRepaymentAmount = amount + totalInterest;
            }

            localTable = localDB.funding_sources; 
            stateKey = 'fundingSources';
            logMessage = 'Menambah Pinjaman'; 
            configTitle = 'Pinjaman';
        }
    } catch (error) {
        toast('error', error.message);
        return;
    }

    const loadingToast = toast('syncing', 'Menyimpan...');

    try {
        await localTable.put(data);
        appState[stateKey].unshift(data);
        
        _logActivity(`${logMessage} (Lokal)`, { amount: data.amount || data.totalAmount, targetId: data.id });
        
        if (navigator.onLine) {
            await syncToServer({ silent: true });
        }
        
        loadingToast.close();
        await toast('success', `${configTitle} berhasil disimpan & disinkronkan.`);
        handleNavigation('pemasukan');
        
        _calculateAndCacheDashboardTotals();

    } catch (error) {
        loadingToast.close();
        toast('error', 'Gagal menyimpan data di perangkat.');
        console.error("Gagal menyimpan offline:", error);
    }
}
// --- SUB-SEKSI 3.3: PENGELUARAN & STOK ---
  
  async function renderPengeluaranPage() {
      const container = $('.page-container');
      const tabs = [{
          id: 'operasional',
          label: 'Operasional'
      }, {
          id: 'material',
          label: 'Material'
      }, {
          id: 'lainnya',
          label: 'Lainnya'
      }];
      container.innerHTML = `
          <div class="content-panel">
              <div class="sub-nav three-tabs">
            ${tabs.map((tab, index) => `<button class="sub-nav-item ${index === 0?'active' : ''}" data-tab="${tab.id}">${tab.label}</button>`).join('')}
            </div>
              <div id="sub-page-content"></div>
            </div>
              `;
  
              const renderTabContent = async (tabId) => {
                appState.activeSubPage.set('pengeluaran', tabId);
                const contentContainer = $("#sub-page-content");
                contentContainer.innerHTML = _getSkeletonLoaderHTML('pengeluaran');

                // Prefetch categories to ensure options appear even on cold cache
                try {
                    await Promise.all([
                        fetchAndCacheData('operationalCategories', opCatsCol, 'categoryName'),
                        fetchAndCacheData('otherCategories', otherCatsCol, 'categoryName')
                    ]);
                } catch (_) {}

		        await loadAllLocalDataToState();
  
		        let formHTML;
		        if (tabId === 'material') {
		            formHTML = _getFormFakturMaterialHTML();
		        } else {
		            let categoryOptions = [],
		                categoryMasterType = '',
		                categoryLabel = '',
		                categoryType = '';
                    if (tabId === 'operasional') {
                        const opCats = (appState.operational_categories || appState.operationalCategories || []);
                        categoryOptions = opCats.map(c => ({ value: c.id, text: c.categoryName }));
		                categoryMasterType = 'op-cats';
		                categoryLabel = 'Kategori Operasional';
		                categoryType = 'Operasional';
                    } else if (tabId === 'lainnya') {
                        const otherCats = (appState.other_categories || appState.otherCategories || []);
                        categoryOptions = otherCats.map(c => ({ value: c.id, text: c.categoryName }));
		                categoryMasterType = 'other-cats';
		                categoryLabel = 'Kategori Lainnya';
		                categoryType = 'Lainnya';
		            }
		            const supplierOptions = appState.suppliers.filter(s => s.category === categoryType).map(s => ({ value: s.id, text: s.supplierName }));
		            const projectOptions = appState.projects.map(p => ({ value: p.id, text: p.projectName }));
		            formHTML = _getFormPengeluaranHTML(tabId, categoryOptions, categoryMasterType, categoryLabel, supplierOptions, projectOptions);
		        }
  
		        const finalHTML = isViewer() ? _getEmptyStateHTML({ icon:'lock', title:'Akses Terbatas', desc:'Halaman ini khusus untuk input data.' }) : formHTML;
		        await _transitionContent(contentContainer, finalHTML);

		        if (!isViewer()) {
		            const formEl = $('#pengeluaran-form') || $('#material-invoice-form');
		            if (formEl) {
		                formEl.setAttribute('data-draft-key', `pengeluaran-${tabId}`);
		                _attachFormDraftPersistence(formEl);
		            }
		            _attachPengeluaranFormListeners(tabId);
		        }
		    };

      const subNavItems = $$('.sub-nav-item');
      subNavItems.forEach((btn, index) => {
          btn.addEventListener('click', (e) => {
              const currentActive = $('.sub-nav-item.active');
              if (currentActive === btn) return;
  
              const currentIndex = Array.from(subNavItems).indexOf(currentActive);
              const direction = index > currentIndex ? 'forward' : 'backward';
  
              if(currentActive) currentActive.classList.remove('active');
              btn.classList.add('active');
  
              _animateTabSwitch(
                  $("#sub-page-content"),
                  () => renderTabContent(btn.dataset.tab),
                  direction
              );
          });
      });
  
      const lastSubPage = appState.activeSubPage.get('pengeluaran') || tabs[0].id;
      const initialTab = $(`.sub-nav-item[data-tab="${lastSubPage}"]`);
      if (initialTab) {
          $$('.sub-nav-item').forEach(b => b.classList.remove('active'));
          initialTab.classList.add('active');
      }
      await renderTabContent(lastSubPage);
      _setActiveListeners(['expenses', 'bills', 'comments']);
  }

function _getFormPengeluaranHTML(type, categoryOptions, categoryMasterType, categoryLabel, supplierOptions, projectOptions, itemData = null) {
    const isEdit = !!itemData;
    const formId = isEdit ? 'edit-item-form' : 'pengeluaran-form';
    const formActionAttrs = isEdit 
        ? `data-id="${itemData.id}" data-type="expense"`
        : `data-type="${type}" data-async="true" method="POST" data-endpoint="/api/expenses" data-success-msg="Pengeluaran tersimpan"`;
    const submitText = isEdit ? 'Simpan Perubahan' : 'Simpan Pengeluaran';

    const today = new Date();
    const offset = today.getTimezoneOffset();
    const todayLocal = new Date(today.getTime() - (offset * 60 * 1000));
    
    const amountValue = isEdit ? new Intl.NumberFormat('id-ID').format(itemData.amount) : '';
    const dateValue = isEdit ? _getJSDate(itemData.date).toISOString().slice(0, 10) : todayLocal.toISOString().split('T')[0];
    const descriptionValue = isEdit ? itemData.description : '';
    const selectedProjectId = isEdit ? itemData.projectId : '';
    const selectedCategoryId = isEdit ? itemData.categoryId : '';
    const selectedSupplierId = isEdit ? itemData.supplierId : '';

    const paymentStatusHTML = !isEdit ? `
        <div class="form-group full-width">
            <label>Status Pembayaran</label>
            <div class="sort-direction">
                <button type="button" class="btn-status-payment active" data-status="unpaid">Jadikan Tagihan</button>
                <button type="button" class="btn-status-payment" data-status="paid">Sudah Lunas</button>
            </div>
            <input type="hidden" name="status" value="unpaid">
        </div>
    ` : `<p class="form-notice full-width">Untuk mengubah status pembayaran (misal: membayar tagihan), silakan lakukan dari halaman **Tagihan**.</p>`;
    
    const attachmentHTML = isEdit 
    ? _createAttachmentManagerHTML(itemData, null, 'edit')
            : `
            <h5 class="invoice-section-title full-width" style="margin-top:1.5rem;">Lampiran (Opsional)</h5>
            <div class="form-group full-width">
                <input type="file" name="attachmentFileCamera" accept="image/*" capture="environment" class="hidden-file-input" data-target-display="attachmentFile-display">
                <input type="file" name="attachmentFileGallery" accept="image/*" class="hidden-file-input" data-target-display="attachmentFile-display">
                <div class="upload-buttons">
                    <button type="button" class="btn btn-secondary" data-action="trigger-file-input" data-target="attachmentFileCamera"><span class="material-symbols-outlined">photo_camera</span> Kamera</button>
                    <button type="button" class="btn btn-secondary" data-action="trigger-file-input" data-target="attachmentFileGallery"><span class="material-symbols-outlined">image</span> Galeri</button>
                </div>
                <div class="file-name-display" id="attachmentFile-display">Belum ada file dipilih</div>
            </div>
        `;

    return `
        <div class="card card-pad desktop-form-layout">
            <form id="${formId}" ${formActionAttrs}>
                <div class="form-grid-2col">
                    ${createMasterDataSelect('expense-project', 'Proyek', projectOptions, selectedProjectId, 'projects')}
                    ${createMasterDataSelect('expense-category', categoryLabel, categoryOptions, selectedCategoryId, categoryMasterType)}
                    
                    <div class="form-group">
                        <label>Jumlah</label>
                        <input type="text" id="pengeluaran-jumlah" name="amount" inputmode="numeric" required placeholder="mis. 50.000" value="${amountValue}">
                    </div>
                    <div class="form-group">
                        <label>Tanggal</label>
                        <input type="date" id="pengeluaran-tanggal" name="date" value="${dateValue}" required>
                    </div>

                    <div class="form-group full-width">
                        <label>Deskripsi</label>
                        <input type="text" id="pengeluaran-deskripsi" name="description" required placeholder="mis. Beli ATK" value="${descriptionValue}">
                    </div>
                    
                    ${createMasterDataSelect('expense-supplier', 'Supplier/Penerima', supplierOptions, selectedSupplierId, 'suppliers')}
                </div>

                ${attachmentHTML}
                ${paymentStatusHTML}

                <div class="form-footer-actions">
                    <button type="submit" class="btn btn-primary">${submitText}</button>
                </div>
            </form>
        </div>
    `;
}
function _getFormFakturMaterialHTML(itemData = null) {
    const isEdit = !!itemData;
    const formId = isEdit ? 'edit-item-form' : 'material-invoice-form';
    const formActionAttrs = isEdit 
        ? `data-id="${itemData.id}" data-type="expense"`
        : `data-type="material" data-async="true" method="POST" data-endpoint="/api/invoices/material" data-success-msg="Faktur material tersimpan"`;
    const submitText = isEdit ? 'Simpan Perubahan' : 'Simpan';

    // Menyiapkan nilai default untuk mode tambah atau edit
    const dateValue = isEdit ? _getJSDate(itemData.date).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
    const descriptionValue = isEdit ? itemData.description : _generateInvoiceNumber();
    const selectedProjectId = isEdit ? itemData.projectId : '';
    const selectedSupplierId = isEdit ? itemData.supplierId : '';
    const formType = isEdit ? (itemData.formType || 'faktur') : 'faktur';

    const supplierOptions = appState.suppliers.filter(s => s.category === 'Material').map(s => ({ value: s.id, text: s.supplierName }));
    const projectOptions = appState.projects.map(p => ({ value: p.id, text: p.projectName }));
    const materialOptions = (appState.materials || []).map(m => ({ value: m.id, text: m.materialName }));
    
    // Logika untuk merender baris item yang sudah ada
    const itemsHTML = isEdit ? (itemData.items || []).map((item, index) => {
        const material = appState.materials.find(m => m.id === item.materialId);
        const priceNum = item.price || 0;
        const qtyNum = item.qty || 0;

        const materialDropdownHTML = createMasterDataSelect(`materialId_${index}`, '', materialOptions, item.materialId, null)
            .replace('<div class="form-group">', '').replace('</div>', '');

        return `
            <div class="multi-item-row" data-index="${index}">
                <div class="multi-item-main-line">
                    <div class="item-name-wrapper" style="flex-grow:1;">${materialDropdownHTML}</div>
                    <button type="button" class="btn-icon btn-icon-danger remove-item-btn"><span class="material-symbols-outlined">delete</span></button>
                </div>
                <div class="multi-item-details-line">
                    <div class="form-group">
                        <label>Qty</label>
                        <input type="text" inputmode="decimal" pattern="[0-9]+([\\.,][0-9]+)?" name="itemQty" placeholder="Qty" class="item-qty" value="${qtyNum || '1'}" required>
                    </div>
                    <div class="form-group ${formType === 'surat_jalan' ? 'hidden' : ''}">
                        <label>Harga Satuan</label>
                        <input type="text" inputmode="numeric" name="itemPrice" placeholder="Harga" class="item-price" value="${priceNum ? new Intl.NumberFormat('id-ID').format(priceNum) : ''}" required>
                    </div>
                </div>
            </div>
        `;
    }).join('') : '';

    const formTypeToggleHTML = !isEdit ? `
        <div class="form-group full-width">
            <label>Jenis Input</label>
            <div class="sort-direction" id="form-type-selector">
                <button type="button" class="form-type-btn active" data-type="faktur">Faktur Lengkap</button>
                <button type="button" class="form-type-btn" data-type="surat_jalan">Surat Jalan</button>
            </div>
            <input type="hidden" name="formType" value="faktur">
        </div>
    ` : `
        <div class="form-group full-width">
            <label>Jenis Input</label>
            <p class="form-notice" style="padding:0; margin-top:0.25rem; font-size:1rem;"><strong>${formType === 'faktur' ? 'Faktur Lengkap' : 'Surat Jalan'}</strong> (tidak dapat diubah)</p>
        </div>
    `;

    const paymentStatusHTML = !isEdit ? `
        <div id="payment-status-wrapper" class="form-group">
            <label>Status Pembayaran</label>
            <div class="sort-direction">
                <button type="button" class="btn-status-payment active" data-status="unpaid">Jadikan Tagihan</button>
                <button type="button" class="btn-status-payment" data-status="paid">Sudah Lunas</button>
            </div>
            <input type="hidden" name="status" value="unpaid">
        </div>
    ` : '';

    const attachmentHTML = isEdit
    ? _createAttachmentManagerHTML(itemData, null, 'edit') 
        : `
        <h5 class="invoice-section-title">Lampiran (Opsional)</h5>
        <div class="form-group">
            <label id="attachment-label">Upload Bukti Faktur</label>
            <input type="file" name="attachmentFileCamera" accept="image/*" capture="environment" class="hidden-file-input" data-target-display="attachmentFile-display">
            <input type="file" name="attachmentFileGallery" accept="image/*" class="hidden-file-input" data-target-display="attachmentFile-display">
            <div class="upload-buttons">
                <button type="button" class="btn btn-secondary" data-action="trigger-file-input" data-target="attachmentFileCamera"><span class="material-symbols-outlined">photo_camera</span> Kamera</button>
                <button type="button" class="btn btn-secondary" data-action="trigger-file-input" data-target="attachmentFileGallery"><span class="material-symbols-outlined">image</span> Galeri</button>
            </div>
            <div class="file-name-display" id="attachmentFile-display">Belum ada file dipilih</div>
        </div>
        `;

    return `
        <div class="card card-pad desktop-form-layout">
            <form id="${formId}" ${formActionAttrs}>
                ${formTypeToggleHTML}
                <div class="form-grid-2col">
                    ${createMasterDataSelect('project-id', 'Proyek', projectOptions, selectedProjectId, 'projects')}
                    ${createMasterDataSelect('supplier-id', 'Supplier', supplierOptions, selectedSupplierId)}
                    <div class="form-group">
                        <label>No. Faktur/Surat Jalan</label>
                        <input type="text" name="description" value="${descriptionValue}" ${!isEdit ? 'readonly class="readonly-input"' : ''}>
                    </div>
                    <div class="form-group">
                        <label>Tanggal</label>
                        <input type="date" name="date" value="${dateValue}" required>
                    </div>
                </div>

                <div class="section-header-flex">
                    <h5 class="invoice-section-title">Rincian Barang</h5>
                    <button type="button" class="btn btn-secondary" data-action="add-new-material-header">
                        <span class="material-symbols-outlined">add</span><span>Tambah Master</span>
                    </button>
                </div>
                <div id="invoice-items-container">${itemsHTML}</div>
                <div class="add-item-action">
                    <button type="button" id="add-invoice-item-btn" class="btn-icon" title="Tambah Barang"><span class="material-symbols-outlined">add_circle</span></button>
                </div>

                <div class="invoice-total ${formType === 'surat_jalan' ? 'hidden' : ''}" id="total-faktur-wrapper">
                    <span>Total Faktur:</span>
                    <strong id="invoice-total-amount">${fmtIDR(isEdit ? itemData.amount : 0)}</strong>
                </div>

                ${paymentStatusHTML}
                ${attachmentHTML}

                <div class="form-footer-actions">
                    <button type="submit" class="btn btn-primary">${submitText}</button>
                </div>
            </form>
        </div>
    `;
}
function _attachPengeluaranFormListeners(type, context = document) {
    _initCustomSelects(context);

    const form = (type === 'material') 
        ? context.querySelector('#material-invoice-form, #edit-item-form') 
        : context.querySelector('#pengeluaran-form');

    if (!form) return;

    form.querySelectorAll('.btn-status-payment').forEach(btn => {
        btn.addEventListener('click', () => {
            form.querySelectorAll('.btn-status-payment').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            if (form.querySelector('input[name="status"]')) {
                form.querySelector('input[name="status"]').value = btn.dataset.status;
            }
        });
    });

    if (type === 'material') {
        _initAutocomplete(form); // Inisialisasi autocomplete untuk baris yang sudah ada (saat edit)

        form.addEventListener('click', (e) => {
            const btn = e.target.closest('#add-invoice-item-btn');
            if (btn) {
                _addInvoiceItemRow(form);
            }
        });        
        
        const itemsContainer = form.querySelector('#invoice-items-container');
        if (itemsContainer) {
            itemsContainer.addEventListener('input', (e) => _handleInvoiceItemChange(e, form));
        }

        const invoiceNumberInput = form.querySelector('input[name="description"]');
        if (invoiceNumberInput && form.id === 'material-invoice-form') {
            invoiceNumberInput.value = _generateInvoiceNumber();
        }

        if (form.id === 'material-invoice-form' && form.querySelectorAll('#invoice-items-container .invoice-item-row').length === 0) {
            _addInvoiceItemRow(form);
        }

        const typeSelector = form.querySelector('#form-type-selector');
        if (typeSelector) {
            typeSelector.querySelectorAll('.form-type-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    typeSelector.querySelectorAll('.form-type-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    const mode = btn.dataset.type;
                    const hidden = form.querySelector('input[name="formType"]');
                    if (hidden) hidden.value = mode;
                    _switchMaterialFormMode(form, mode);
                });
            });
        }
    } else {
        const amountInput = form.querySelector('#pengeluaran-jumlah');
        if(amountInput) amountInput.addEventListener('input', _formatNumberInput);
        _attachClientValidation(form);
    }
}

function _switchMaterialFormMode(form, mode) {
      const totalWrapper = $('#total-faktur-wrapper', form);
      const paymentWrapper = $('#payment-status-wrapper', form);
      const itemsContainer = $('#invoice-items-container', form);
      const attachmentLabel = $('#attachment-label', form);
  
      const isSuratJalan = mode === 'surat_jalan';
      if (totalWrapper) totalWrapper.classList.toggle('hidden', isSuratJalan);
      if (paymentWrapper) paymentWrapper.classList.toggle('hidden', isSuratJalan);
  
      if (attachmentLabel) {
          attachmentLabel.textContent = isSuratJalan ? 'Upload Bukti Surat Jalan' : 'Upload Bukti Faktur';
      }
  
      const existingItems = [];
      $$('.invoice-item-row', form).forEach(row => {
          existingItems.push({
              name: row.querySelector('input[name="itemName"]')?.value || '',
              id: row.querySelector('input[name="materialId"]')?.value || '',
              qty: row.querySelector('input[name="itemQty"]')?.value || '1',
              price: row.querySelector('input[name="itemPrice"]')?.value || ''
          });
      });
  
      itemsContainer.innerHTML = '';
      existingItems.forEach(itemData => {
          _addInvoiceItemRow(form); // Fungsi ini sudah pintar, ia akan membuat baris sesuai mode yang aktif
          const newRow = itemsContainer.lastElementChild;
          if (newRow) {
              const nameInput = newRow.querySelector('input[name="itemName"]');
              const idInput = newRow.querySelector('input[name="materialId"]');
              const qtyInput = newRow.querySelector('input[name="itemQty"]');
              const priceInput = newRow.querySelector('input[name="itemPrice"]');
  
              if (nameInput) nameInput.value = itemData.name;
              if (idInput) idInput.value = itemData.id;
              if (qtyInput) qtyInput.value = itemData.qty;
              if (priceInput) priceInput.value = itemData.price;
              
              if(itemData.id) {
                  if (nameInput) nameInput.readOnly = true;
                  const clearBtn = newRow.querySelector('.autocomplete-clear-btn');
                  if(clearBtn) clearBtn.style.display = 'flex';
              }
          }
      });
  
      _initAutocomplete(form); // Penting untuk mengaktifkan kembali autocomplete pada baris baru
      _updateInvoiceTotal(form); // Hitung ulang total
  }
  
async function handleAddPengeluaran(e, type) {
    e.preventDefault();
    const form = e.target;
    const loadingToast = toast('syncing', 'Menyimpan...');

    try {
        const projectId = form.elements['expense-project']?.value || form.elements['project-id']?.value;
        if (!projectId) {
            throw new Error('Proyek harus dipilih.');
        }

        const attachmentFile = form.elements.attachmentFileCamera?.files[0] || form.elements.attachmentFileGallery?.files[0];
        const status = form.querySelector('input[name="status"]')?.value || 'unpaid';
        const date = new Date(form.elements['pengeluaran-tanggal']?.value || form.elements['date']?.value);
        let expenseDetails = {};
        let itemsToUpdateStock = [];

        if (type === 'material') {
            const formMode = form.elements['formType']?.value || 'faktur';
            const items = [];
            
            if (formMode === 'surat_jalan') {
                $$('.invoice-item-row', form).forEach(row => {
                    const materialIdInput = row.querySelector('.custom-select-wrapper input[type="hidden"]');
                    const materialId = materialIdInput ? materialIdInput.value : null;
                    const qty = parseLocaleNumber(row.querySelector('input[name="itemQty"]').value);
                    
                    if (materialId && qty > 0) {
                        const mat = appState.materials.find(m => m.id === materialId);
                        items.push({ name: mat?.materialName || 'Barang', price: 0, qty, total: 0, materialId });
                        itemsToUpdateStock.push({ materialId, qty, price: 0 });
                    }
                });
                if (items.length === 0) { throw new Error('Harap tambahkan minimal satu barang.'); }
                expenseDetails = { amount: 0, description: form.elements['description'].value.trim() || 'Surat Jalan', supplierId: form.elements['supplier-id'].value, items };
            } else { 
                $$('.invoice-item-row', form).forEach(row => {
                    const materialIdInput = row.querySelector('.custom-select-wrapper input[type="hidden"]');
                    const materialId = materialIdInput ? materialIdInput.value : null;
                    const material = materialId ? appState.materials.find(m => m.id === materialId) : null;
                    
                    const name = material ? material.materialName : 'Barang Manual';
                    const price = parseFormattedNumber(row.querySelector('input[name="itemPrice"]').value);
                    const qty = parseLocaleNumber(row.querySelector('input[name="itemQty"]').value);

                    if ((materialId || name) && price > 0 && qty > 0) {
                        items.push({ name, price, qty, total: price * qty, materialId });
                        if (materialId) itemsToUpdateStock.push({ materialId, qty, price });
                    }
                });
                if (items.length === 0) { throw new Error('Harap tambahkan minimal satu barang.'); }
                expenseDetails = { amount: items.reduce((sum, item) => sum + item.total, 0), description: form.elements['description'].value.trim() || `Faktur ${items[0].name}`, supplierId: form.elements['supplier-id'].value, items };
            }
        } else {
            expenseDetails = { amount: parseFormattedNumber(form.elements['pengeluaran-jumlah'].value), description: form.elements['pengeluaran-deskripsi'].value.trim(), supplierId: form.elements['expense-supplier'].value, categoryId: form.elements['expense-category']?.value || '' };
        }

        const newExpenseId = generateUUID();

        const expenseToStore = {
            ...expenseDetails,
            id: newExpenseId,
            type,
            projectId,
            formType: (type === 'material') ? (form.elements['formType']?.value || 'faktur') : undefined,
            date,
            createdBy: appState.currentUser.uid, // <-- DATA PEMBUAT DITAMBAHKAN
            createdByName: appState.currentUser.displayName, // <-- DATA PEMBUAT DITAMBAHKAN
            createdAt: new Date(),
            updatedAt: new Date(),
            syncState: 'pending_create',
            isDeleted: 0,
            attachmentUrl: '',
            attachmentNeedsSync: 0,
            localAttachmentId: null,
            attachmentStatus: null
        };

        if (attachmentFile) {
            if (navigator.onLine) {
                const downloadURL = await _uploadFileToCloudinary(attachmentFile);
                if (downloadURL) {
                    expenseToStore.attachmentUrl = downloadURL;
                } else {
                    toast('info', 'Upload gagal, lampiran disimpan di perangkat untuk dicoba lagi nanti.');
                    const fileId = `file_${Date.now()}_${attachmentFile.name}`;
                    await localDB.files.put({ id: fileId, file: attachmentFile, addedAt: new Date(), size: attachmentFile.size });
                    expenseToStore.localAttachmentId = fileId;
                    expenseToStore.attachmentNeedsSync = 1;
                }
            } else {
                const fileId = `file_${Date.now()}_${attachmentFile.name}`;
                await localDB.files.put({ id: fileId, file: attachmentFile, addedAt: new Date(), size: attachmentFile.size });
                expenseToStore.localAttachmentId = fileId;
                expenseToStore.attachmentNeedsSync = 1;
            }
        }

        await localDB.transaction('rw', localDB.expenses, localDB.bills, localDB.stock_transactions, localDB.materials, async () => {
            if (type === 'material' && expenseToStore.status === 'delivery_order') {
                expenseToStore.status = 'delivery_order';
            }
            await localDB.expenses.add(expenseToStore);
            appState.expenses.unshift(expenseToStore);

            if (!(type === 'material' && expenseToStore.status === 'delivery_order')) {
                const billData = {
                    id: generateUUID(),
                    expenseId: expenseToStore.id,
                    description: expenseDetails.description,
                    amount: expenseDetails.amount,
                    dueDate: date,
                    status: status,
                    type: type,
                    projectId: projectId,
                    supplierId: expenseDetails.supplierId,
                    createdBy: appState.currentUser.uid, // <-- DATA PEMBUAT DITAMBAHKAN
                    createdByName: appState.currentUser.displayName, // <-- DATA PEMBUAT DITAMBAHKAN
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    paidAmount: status === 'paid' ? expenseDetails.amount : 0,
                    ...(status === 'paid' && { paidAt: new Date() }),
                    syncState: 'pending_create',
                    isDeleted: 0
                };
                await localDB.bills.add(billData);
                appState.bills.unshift(billData);
            }
        });

        _logActivity(`Menambah Pengeluaran (Lokal): ${expenseDetails.description}`, { amount: expenseDetails.amount });
        
        if (navigator.onLine) {
            await syncToServer({ silent: true });
        }
        
        loadingToast.close();
        await toast('success', 'Pengeluaran berhasil disimpan.');
        
        handleNavigation('tagihan');

    } catch (error) {
        loadingToast.close();
        console.error("Error saving expense locally:", error);
        toast('error', `Gagal menyimpan: ${error.message}`);
    }
}

function _addInvoiceItemRow(context = document) {
    const container = $('#invoice-items-container', context);
    if (!container) return;
    const index = container.children.length;
    const mode = context?.querySelector?.('input[name="formType"]')?.value || 'faktur';

    const materialOptions = (appState.materials || []).map(m => ({ value: m.id, text: m.materialName }));

    const materialDropdownHTML = createMasterDataSelect(
        `materialId_${index}`, '', materialOptions, '', null // <-- Ubah 'materials' menjadi null di sini
    ).replace('<div class="form-group">', '').replace('</div>', '');

    let itemHTML = `
    <div class="multi-item-row" data-index="${index}">
        <div class="multi-item-main-line">
            <div class="item-name-wrapper" style="flex-grow:1;">${materialDropdownHTML}</div>
            <button type="button" class="btn-icon btn-icon-danger remove-item-btn"><span class="material-symbols-outlined">delete</span></button>
        </div>
        <div class="multi-item-details-line ${mode === 'surat_jalan' ? 'hidden' : ''}">
            <div class="form-group">
                <label>Qty</label>
                <input type="text" inputmode="decimal" pattern="[0-9]+([\\.,][0-9]+)?" name="itemQty" placeholder="Qty" class="item-qty" value="1" required>
            </div>
            <div class="form-group">
                <label>Harga Satuan</label>
                <input type="text" inputmode="numeric" name="itemPrice" placeholder="Harga" class="item-price" required>
            </div>
        </div>
    </div>`;

    container.insertAdjacentHTML('beforeend', itemHTML);
    const newRow = container.lastElementChild;
    
    _initCustomSelects(newRow); // Inisialisasi dropdown kustom HANYA untuk baris baru
    
    // Animasikan baris baru
    newRow.classList.add('new-item');
    newRow.querySelector('.remove-item-btn')?.addEventListener('click', () => {
        newRow.style.transition = 'opacity 0.3s ease, transform 0.3s ease, max-height 0.3s ease, padding 0.3s ease, margin 0.3s ease';
        newRow.style.opacity = '0';
        setTimeout(() => {
            newRow.remove();
            _updateInvoiceTotal(context);
        }, 300);
    });

    // Tambahkan listener format angka
    newRow.querySelectorAll('input[inputmode="numeric"]').forEach(input => {
        input.addEventListener('input', _formatNumberInput);
    });
}
function _handleInvoiceItemChange(e, context = document) {
    const row = e.target.closest('.multi-item-row');
    if (!row) return;

    const priceEl = row.querySelector('.item-price');
    const qtyEl = row.querySelector('.item-qty');

    if (priceEl && qtyEl) {
        const price = parseFormattedNumber(priceEl.value);
        const qty = parseLocaleNumber(qtyEl.value);
        }
    
    _updateInvoiceTotal(context);
}

function _updateInvoiceTotal(context = document) {
    let totalAmount = 0;
    const rows = $$('.multi-item-row', context);
    
    rows.forEach(row => {
        const priceEl = row.querySelector('.item-price');
        const qtyEl = row.querySelector('.item-qty');
        if (!priceEl || !qtyEl) return;

        const price = parseFormattedNumber(priceEl.value);
        const qty = parseLocaleNumber(qtyEl.value);
        totalAmount += price * qty;
    });

    const totalEl = $('#invoice-total-amount', context);
    if (totalEl) totalEl.textContent = fmtIDR(totalAmount);
}

  function _generateInvoiceNumber() {
      const date = new Date();
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const randomPart = Math.random().toString(36).substring(2, 7).toUpperCase();
      return `INV/${year}${month}${day}/${randomPart}`;
  }
  
  async function handleOpenMaterialSelector(dataset) {
      const {
          index
      } = dataset;
      const sortedMaterials = [...appState.materials].sort((a, b) => {
          const countA = a.usageCount || 0;
          const countB = b.usageCount || 0;
          if (countB !== countA) {
              return countB - countA;
          }
          return a.materialName.localeCompare(b.materialName);
      });
      const renderList = (items) => items.map(mat => `
          <div class="material-list-item" data-id="${mat.id}" data-name="${mat.materialName}" data-unit="${mat.unit || ''}">
              <div class="item-info">
                  <strong>${mat.materialName}</strong>
                  <span>Satuan: ${mat.unit || '-'}</span>
              </div>
              <div class="item-stock">Stok: ${mat.currentStock || 0}</div>
          </div>
      `).join('');
      const modalHeader = `<h4>Pilih Material</h4><button class="btn-icon" data-close-modal><span class="material-symbols-outlined">close</span></button>`;
      const searchBar = `<div class="modal-search-bar"><div class="search"><span class="material-symbols-outlined">search</span><input type="search" id="material-search-input" placeholder="Cari nama material..."></div></div>`;
      const modalBody = `<div class="material-list" id="material-list-container">${renderList(sortedMaterials)}</div>`;
      const modalContent = `<div class="modal-content"><div class="modal-header">${modalHeader}</div>${searchBar}<div class="modal-body">${modalBody}</div></div>`;
  
      const modalContainer = $('#modal-container');
      modalContainer.innerHTML = `<div id="materialSelectorModal" class="modal-bg material-selector-modal">${modalContent}</div>`;
  
      const modalEl = $('#materialSelectorModal');
      setTimeout(() => modalEl.classList.add('show'), 10);
      const closeModalFunc = () => closeModal(modalEl);
      modalEl.addEventListener('click', e => {
          if (e.target === modalEl) closeModalFunc();
      });
      modalEl.querySelectorAll('[data-close-modal]').forEach(btn => btn.addEventListener('click', closeModalFunc));
      $('#material-list-container', modalEl).addEventListener('click', e => {
          const itemEl = e.target.closest('.material-list-item');
          if (!itemEl) return;
          const {
              id,
              name,
              unit
          } = itemEl.dataset;
          const row = $(`#material-invoice-form .invoice-item-row[data-index="${index}"]`) || $(`#edit-item-form .invoice-item-row[data-index="${index}"]`);
          if (row) {
              // [PERUBAHAN] Update input tersembunyi, teks tombol, DAN teks satuan
              row.querySelector('input[name="materialId"]').value = id;
              row.querySelector('.custom-select-trigger span').textContent = name;
              row.querySelector('.item-unit').textContent = unit || '';
          }
          closeModalFunc();
      });
      $('#material-search-input', modalEl).addEventListener('input', e => {
          const searchTerm = e.target.value.toLowerCase();
          const filtered = sortedMaterials.filter(mat => mat.materialName.toLowerCase().includes(searchTerm));
          $('#material-list-container', modalEl).innerHTML = renderList(filtered);
      });
  }
  
  async function renderStokPage() {
    document.body.classList.add('page-has-unified-panel'); // [REVISI] Tambahkan penanda
    const container = $('.page-container');
    

    const tabs = [{ id: 'daftar', label: 'Daftar Stok' }, { id: 'estimasi', label: 'Estimasi Belanja' }, { id: 'riwayat', label: 'Riwayat Stok' }];

    // [REVISI] Panggil fungsi _createToolbarHTML
    const toolbarHTML = _createToolbarHTML({
        idPrefix: 'stok',
        searchPlaceholder: 'Cari nama material...'
    });

    container.innerHTML = `
        <div class="content-panel">
            ${toolbarHTML}
            <div class="sub-nav three-tabs">
                ${tabs.map((tab, index) => `<button class="sub-nav-item ${index === 0 ? 'active' : ''}" data-tab="${tab.id}">${tab.label}</button>`).join('')}
            </div>
            <div id="sub-page-content"></div>
        </div>
    `;

    $('#stok-filter-btn').addEventListener('click', () => {
        toast('info', 'Fitur filter stok (misal: stok menipis) akan segera hadir.');
    });
    $('#stok-sort-btn').addEventListener('click', () => {
        toast('info', 'Fitur urutkan stok akan segera hadir.');
    });

    const renderTabContent = async (tabId) => {
        appState.activeSubPage.set('stok', tabId);
        const contentContainer = $("#sub-page-content");
        contentContainer.innerHTML = _getSkeletonLoaderHTML('stok');
        await fetchAndCacheData('materials', materialsCol, 'materialName');
        if (tabId === 'daftar') await _renderDaftarStokView(contentContainer);
        else if (tabId === 'estimasi') await _renderEstimasiBelanjaView(contentContainer);
        else if (tabId === 'riwayat') await _renderRiwayatStokView(contentContainer);
    };

    const subNavItems = $$('.sub-nav-item');
    subNavItems.forEach((btn, index) => {
        btn.addEventListener('click', (e) => {
            const currentActive = $('.sub-nav-item.active');
            if (currentActive === btn) return;
            const currentIndex = Array.from(subNavItems).indexOf(currentActive);
            const direction = index > currentIndex ? 'forward' : 'backward';
            if(currentActive) currentActive.classList.remove('active');
            btn.classList.add('active');
            _animateTabSwitch($("#sub-page-content"), () => renderTabContent(btn.dataset.tab), direction);
        });
    });

    const lastSubPage = appState.activeSubPage.get('stok') || tabs[0].id;
    $(`.sub-nav-item[data-tab="${lastSubPage}"]`)?.classList.add('active');
    await renderTabContent(lastSubPage);
    _setActiveListeners(['stock_transactions']);
}

  async function _renderDaftarStokView(container) {
      const materials = appState.materials || [];
      const listHTML = materials.map(item => {
        const stockLevel = item.currentStock || 0;
        const reorderPoint = item.reorderPoint || 0;
        const isLowStock = stockLevel <= reorderPoint;
    
        
    
        return `
            <div class="wa-card-v2-wrapper">
                <div class="wa-card-v2">
                    <div class="wa-card-v2__main">
                        <div class="wa-card-v2__header">
                            <div class="wa-card-v2__title">${item.materialName}</div>
                            <div class="wa-card-v2__header-meta">${item.unit || ''}</div>
                        </div>
                        <div class="wa-card-v2__body" style="${isLowStock ? 'color: var(--danger); font-weight: 500;' : ''}">
                            ${isLowStock ? '<span class="material-symbols-outlined" style="font-size: 1rem;">warning</span>' : ''}
                            Stok Tersedia: ${stockLevel}
                        </div>
                    </div>
                    <div class="wa-card-v2__meta">
                        <div class="wa-card-v2__amount">${fmtIDR(item.lastPrice || 0)}</div>
                        <div class="wa-card-v2__status"><span class="badge">Harga Terakhir</span></div>
                    </div>
                </div>
            </div>`;
    }).join('');

      await _transitionContent(container, `
              <div class="dense-list-container">
                  ${materials.length > 0?listHTML : _getEmptyStateHTML({ icon:'inventory_2', title:'Belum Ada Material', desc:'Tambah material agar stok dapat dikelola.' })}
              </div>
          `);
  }
  async function _renderEstimasiBelanjaView(container) {
      const lowStockItems = (appState.materials || []).filter(item => (item.currentStock || 0) <= (item.reorderPoint || 0));

      if (lowStockItems.length === 0) {
          container.innerHTML = _getEmptyStateHTML({ icon:'inventory', title:'Stok Aman', desc:'Semua persediaan berada pada level yang sehat.' });
          return;
      }

      const listHTML = lowStockItems.map(item => `
            <div class="dense-list-item estimasi-item" data-price="${item.lastPrice || 0}">
                <div class="item-main-content">
                    <strong class="item-title">${item.materialName}</strong>
                    <span class="item-subtitle">Stok: ${item.currentStock || 0} / Min: ${item.reorderPoint || 0} ${item.unit || ''}</span>
                </div>
                <div class="item-actions">
                    <input type="number" class="qty-beli" placeholder="Qty" min="0" style="width:90px;">
                    <strong class="item-amount estimasi-subtotal">Rp 0</strong>
                </div>
            </div>
          `).join('');

      await _transitionContent(container, `
            <div class="dense-list-container" id="estimasi-list">${listHTML}</div>
            <div class="invoice-total" style="margin-top:1.0rem;">
                <span>Grand Total Estimasi</span>
                <strong id="estimasi-grand-total">Rp 0</strong>
            </div>
          `);

      const updateTotal = () => {
          let grandTotal = 0;
          $$('.estimasi-item').forEach(item => {
              const price = Number(item.dataset.price);
              const qty = Number(item.querySelector('.qty-beli').value);
              const subtotal = price * qty;
              item.querySelector('.estimasi-subtotal').textContent = fmtIDR(subtotal);
              grandTotal += subtotal;
          });
          $('#estimasi-grand-total').textContent = fmtIDR(grandTotal);
      };

      $$('.qty-beli').forEach(input => input.addEventListener('input', updateTotal));
  }
  
  function _createStockTransactionDetailHTML(trans) {
      const material = appState.materials.find(m => m.id === trans.materialId);
      const project = trans.projectId?appState.projects.find(p => p.id === trans.projectId) : null;
      const date = _getJSDate(trans.date).toLocaleDateString('id-ID', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
      });
      const isStokIn = trans.type === 'in';
      const details = [{
          label: 'Nama Material',
          value: material?.materialName || 'Material Dihapus'
      }, {
          label: 'Jumlah',
          value: `${trans.quantity} ${material?.unit || ''}`
      }, {
          label: 'Jenis Transaksi',
          value: isStokIn?'Stok Masuk' : 'Stok Keluar (Pemakaian)'
      }, {
          label: 'Tanggal',
          value: date
      }];
      if (isStokIn && trans.pricePerUnit > 0) {
          details.push({
              label: 'Harga per Satuan',
              value: fmtIDR(trans.pricePerUnit)
          });
          details.push({
              label: 'Total Nilai',
              value: fmtIDR(trans.pricePerUnit * trans.quantity)
          });
      }
      if (!isStokIn && project) {
          details.push({
              label: 'Digunakan untuk Proyek',
              value: project.projectName
          });
      }
      return `
              <dl class="detail-list">
                  ${details.map(d => `<div><dt>${d.label}</dt><dd>${d.value}</dd></div>`).join('')}
              </dl>
          `;
  }

  async function _renderRiwayatStokView(container) {
      const transactions = appState.stockTransactions.sort((a, b) => _getJSDate(b.date) - _getJSDate(a.date));
  
      if (transactions.length === 0) {
          container.innerHTML = _getEmptyStateHTML({ icon:'receipt_long', title:'Belum Ada Riwayat', desc:'Transaksi stok yang terjadi akan tampil di sini.' });
          return;
      }
  
      const listHTML = transactions.map(trans => {
          const material = appState.materials.find(m => m.id === trans.materialId);
          const project = appState.projects.find(p => p.id === trans.projectId);
          const date = _getJSDate(trans.date).toLocaleDateString('id-ID', {
              day: '2-digit',
              month: 'short'
          });
          const isStokIn = trans.type === 'in';
          return `
                  <div class="jurnal-item card" data-action="open-stock-detail-and-actions-modal" data-local-id="${trans.localId}">
                      <div class="jurnal-item-content">
                          <div class="jurnal-item-header">
                              <strong>${material?.materialName || 'Material Dihapus'}</strong>
                              <strong class="${isStokIn?'positive' : 'negative'}">${isStokIn?'+' : '-'}${trans.quantity} ${material?.unit || ''}</strong>
                          </div>
                          <div class="jurnal-item-details">
                              <span>Tanggal: ${date}</span>
                              <span>${isStokIn?'Stok Masuk' : `Digunakan untuk: ${project?.projectName || '-'}`}</span>
                          </div>
                      </div>
                  </div>`;
      }).join('');
      await _transitionContent(container, `<div class="jurnal-list">${listHTML}</div>`);
  }

async function handleEditStockTransaction(dataset) {
    const { id, type, qty, materialId, projectId } = dataset;
    const material = appState.materials.find(m => m.id === materialId);
    if (!material) return toast('error', 'Master material tidak ditemukan.');
    
    let content = '';
    let footer = ''; // [PERBAIKAN] Siapkan variabel untuk footer

    const formId = "edit-stock-form"; // Definisikan ID form untuk di-link oleh tombol footer

    if (type === 'out') {
        const projectOptions = appState.projects.map(p => ({
            value: p.id,
            text: p.projectName
        }));
        content = `
            <form id="${formId}" data-id="${id}" data-type="${type}" data-old-qty="${qty}" data-material-id="${materialId}" data-async="true" method="PUT" data-endpoint="/api/stock/transactions/${id}" data-success-msg="Riwayat stok diperbarui">
                <p>Mengubah data pemakaian untuk <strong>${material.materialName}</strong>.</p>
                <div class="form-group"><label>Jumlah Keluar (dalam ${material.unit})</label><input type="number" name="quantity" value="${qty}" required min="1"></div>
                ${createMasterDataSelect('projectId', 'Digunakan untuk Proyek', projectOptions, projectId)}
            </form>
        `;
    } else { // type 'in'
        content = `
            <form id="${formId}" data-id="${id}" data-type="${type}" data-old-qty="${qty}" data-material-id="${materialId}" data-async="true" method="PUT" data-endpoint="/api/stock/transactions/${id}" data-success-msg="Riwayat stok diperbarui">
                <p>Mengubah data stok masuk untuk <strong>${material.materialName}</strong>.</p>
                <div class="form-group"><label>Jumlah Masuk (dalam ${material.unit})</label><input type="number" name="quantity" value="${qty}" required min="1"></div>
            </form>
        `;
    }
    footer = `<button type="submit" class="btn btn-primary" form="${formId}">Simpan Perubahan</button>`;

    const modalEl = createModal('dataDetail', {
        title: 'Edit Riwayat Stok',
        content,
        footer: footer // <-- Footer diteruskan ke modal
    });

    const form = (modalEl || document.getElementById('detail-pane')).querySelector(`#${formId}`);
    _initCustomSelects(form.parentElement);
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        _processStockTransactionUpdate(e.target);
        closeModal(e.target.closest('.modal-bg') || document.getElementById('detail-pane'));
    });
}

  function handleDeleteStockTransaction(dataset) {
      createModal('confirmDelete', {
          message: 'Menghapus riwayat ini juga akan mengembalikan jumlah stok. Aksi ini tidak dapat dibatalkan. Lanjutkan?',
          onConfirm: () => _processStockTransactionDelete(dataset)
      });
  }
  
async function _processStockTransactionUpdate(form) {
    const { id, type, oldQty, materialId } = form.dataset;
    const newQty = Number(form.elements.quantity.value);
    const qtyDifference = newQty - Number(oldQty);
    
    if (qtyDifference === 0 && type === 'in') {
        return;
    }

    try {
        const transRef = doc(stockTransactionsCol, id);
        const materialRef = doc(materialsCol, materialId);
        const dataToUpdate = { quantity: newQty };
        if (type === 'out') {
            dataToUpdate.projectId = form.elements.projectId.value;
        }
        await runTransaction(db, async (transaction) => {
            transaction.update(transRef, dataToUpdate);
            const stockAdjustment = type === 'out' ? -qtyDifference : qtyDifference;
            const mSnap = await transaction.get(materialRef);
            const mRev = mSnap.exists() ? (mSnap.data().rev || 0) : 0;
            transaction.update(materialRef, {
                currentStock: increment(stockAdjustment),
                rev: mRev + 1,
                updatedAt: serverTimestamp()
            });
        });
        _logActivity('Mengedit Riwayat Stok', {
            transactionId: id,
            newQty
        });
        renderStokPage();
    } catch (error) {
        console.error(error);
        throw error;
    }
}

async function _processStockTransactionDelete(dataset) {
      const {
          id,
          type,
          qty,
          materialId
      } = dataset;
      toast('syncing', 'Menghapus transaksi...');
      try {
          // Coba API delete terlebih dahulu
          let apiOk = false;
          try {
              await _apiRequest('DELETE', _mapDeleteEndpoint('stock_transaction', id));
              apiOk = true;
          } catch (_) {}
          if (!apiOk) {
              const transRef = doc(stockTransactionsCol, id);
              await runTransaction(db, async (transaction) => {
                  let materialRef;
                  let matDoc = null; // Inisialisasi matDoc sebagai null
                  if (materialId && materialId !== 'undefined') {
                      materialRef = doc(materialsCol, materialId);
                      matDoc = await transaction.get(materialRef);
                  }
                  transaction.delete(transRef);
                  if (matDoc && matDoc.exists()) {
                      const stockAdjustment = type === 'in'?-Number(qty) : Number(qty);
                      transaction.update(materialRef, {
                          currentStock: increment(stockAdjustment)
                      });
                  } else if (materialId && materialId !== 'undefined') {
                      console.warn(`Master material dengan ID ${materialId} tidak ditemukan. Melewatkan pembaruan stok.`);
                  }
              });
          }
  
          _logActivity('Menghapus Riwayat Stok', {
              transactionId: id
          });
          toast('success', 'Riwayat stok berhasil dihapus.');
          renderStokPage();
      } catch (error) {
          toast('error', 'Gagal menghapus riwayat.');
          console.error(error);
      }
  }
  
  async function _updateStockAfterInvoice(items) {
      if (!items || items.length === 0) return;
  
      try {
          const batch = writeBatch(db);
          const stockTransCol = collection(db, 'teams', TEAM_ID, 'stock_transactions');
  
          for (const item of items) {
              if (item.materialId) { // Lakukan hanya jika ada ID Material
                  const materialRef = doc(db, 'teams', TEAM_ID, 'materials', item.materialId);
  
                  // 1. Tambah jumlah stok di master material
                  batch.update(materialRef, {
                      currentStock: increment(item.qty)
                  }); // rev bump not possible in batch without read
  
                  // 2. Buat catatan transaksi stok
                  const transRef = doc(stockTransCol);
                  batch.set(transRef, {
                      materialId: item.materialId,
                      quantity: item.qty,
                      type: 'in',
                      date: serverTimestamp()
                  });
              }
          }
          await batch.commit();
          console.log('Stok berhasil diperbarui secara otomatis.');
      } catch (error) {
          console.error('Gagal update stok otomatis:', error);
          toast('error', 'Gagal memperbarui stok secara otomatis.');
      }
  }
  
  async function handleStokInModal(materialId) {
      const material = appState.materials.find(m => m.id === materialId);
      if (!material) return toast('error', 'Material tidak ditemukan.');
      const content = `
              <form id="stok-in-form" data-id="${materialId}" data-async="true" method="POST" data-endpoint="/api/stock/in" data-success-msg="Stok masuk tersimpan">
                  <p>Mencatat pembelian untuk <strong>${material.materialName}</strong>.</p>
                  <div class="form-group"><label>Jumlah Masuk (dalam ${material.unit || 'satuan'})</label><input type="number" name="quantity" required min="1"></div>
                  <div class="form-group"><label>Harga per Satuan</label><input type="text" name="price" inputmode="numeric" required></div>
                  <div class="form-group"><label>Tanggal Pembelian</label><input type="date" name="date" value="${new Date().toISOString().slice(0,10)}" required></div>
                  <button type="submit" class="btn btn-primary">Simpan</button>
              </form>
          `;
      createModal('dataDetail', {
          title: 'Form Stok Masuk',
          content
      });
      $('#stok-in-form input[name="price"]').addEventListener('input', _formatNumberInput);
      $('#stok-in-form').addEventListener('submit', (e) => {
          e.preventDefault();
          processStokIn(e.target);
          closeModal($('#dataDetail-modal'));
      });
  }
  async function handleStokOutModal(materialId) {
      const material = appState.materials.find(m => m.id === materialId);
      if (!material) return toast('error', 'Material tidak ditemukan.');
      const projectOptions = appState.projects.map(p => ({
          value: p.id,
          text: p.projectName
      }));
      const content = `
              <form id="stok-out-form" data-id="${materialId}" data-async="true" method="POST" data-endpoint="/api/stock/out" data-success-msg="Stok keluar tersimpan">
                  <p>Mencatat pemakaian untuk <strong>${material.materialName}</strong>.</p>
                  <div class="form-group"><label>Jumlah Keluar (dalam ${material.unit || 'satuan'})</label><input type="number" name="quantity" required min="1" max="${material.currentStock || 0}"></div>
                  ${createMasterDataSelect('projectId', 'Digunakan untuk Proyek', projectOptions, '', 'projects')}
                  <div class="form-group"><label>Tanggal Pemakaian</label><input type="date" name="date" value="${new Date().toISOString().slice(0,10)}" required></div>
                  <button type="submit" class="btn btn-primary">Simpan</button>
              </form>
          `;
      createModal('dataDetail', {
          title: 'Form Stok Keluar',
          content
      });
      _initCustomSelects($('#dataDetail-modal'));
      $('#stok-out-form').addEventListener('submit', (e) => {
          e.preventDefault();
          processStokOut(e.target);
          closeModal($('#dataDetail-modal'));
      });
  }
async function processStokIn(form) {
    const materialId = form.dataset.id;
    const quantity = Number(form.elements.quantity.value);
    const price = parseFormattedNumber(form.elements.price.value);
    const date = new Date(form.elements.date.value);

    try {
        const materialRef = doc(materialsCol, materialId);
        const transRef = doc(stockTransactionsCol);
        await runTransaction(db, async (transaction) => {
            const mSnap2 = await transaction.get(materialRef);
            const mRev2 = mSnap2.exists() ? (mSnap2.data().rev || 0) : 0;
            transaction.update(materialRef, {
                currentStock: increment(quantity),
                rev: mRev2 + 1,
                updatedAt: serverTimestamp()
            });
            transaction.set(transRef, {
                materialId,
                quantity,
                date: Timestamp.fromDate(date),
                type: 'in',
                pricePerUnit: price,
                createdAt: serverTimestamp()
            });
        });
        _logActivity('Mencatat Stok Masuk', {
            materialId,
            quantity
        });
        renderStokPage();
    } catch (error) {
        console.error(error);
        throw error;
    }
}

async function processStokOut(form) {
    const materialId = form.dataset.id;
    const quantity = Number(form.elements.quantity.value);
    const projectId = form.elements.projectId.value;
    const date = new Date(form.elements.date.value);
    
    if (!projectId) {
        // Lemparkan error jika proyek tidak dipilih
        throw new Error('Proyek harus dipilih.');
    }

    try {
        const materialRef = doc(materialsCol, materialId);
        const transRef = doc(stockTransactionsCol);
        await runTransaction(db, async (transaction) => {
            const matDoc = await transaction.get(materialRef);
            if (!matDoc.exists() || (matDoc.data().currentStock || 0) < quantity) {
                throw new Error("Stok tidak mencukupi!");
            }
            const mSnap3 = await transaction.get(materialRef);
            const mRev3 = mSnap3.exists() ? (mSnap3.data().rev || 0) : 0;
            transaction.update(materialRef, {
                currentStock: increment(-quantity),
                rev: mRev3 + 1,
                updatedAt: serverTimestamp()
            });
            transaction.set(transRef, {
                materialId,
                quantity,
                date: Timestamp.fromDate(date),
                type: 'out',
                projectId,
                createdAt: serverTimestamp()
            });
        });
        _logActivity('Mencatat Stok Keluar', {
            materialId,
            quantity,
            projectId
        });
        renderStokPage();
    } catch (error) {
        console.error(error);
        throw error;
    }
}  
  // --- SUB-SEKSI 3.4: ABSENSI & JURNAL ---
async function renderAbsensiPage() {
    const container = $('.page-container');
    const tabs = [{
        id: 'manual',
        label: 'Input Manual'
    }, {
        id: 'harian',
        label: 'Absensi Harian'
    }];

    container.innerHTML = `
        <div class="content-panel">
            <div class="sub-nav two-tabs">
                ${tabs.map((tab, index) => `<button class="sub-nav-item ${index === 0 ? 'active' : ''}" data-tab="${tab.id}">${tab.label}</button>`).join('')}
            </div>
            <div id="sub-page-content"></div>
        </div>
    `;

    const renderTabContent = async (tabId) => {
        appState.activeSubPage.set('absensi', tabId);
        const contentContainer = $("#sub-page-content");
        const fabContainer = $('#fab-container'); // Ambil container FAB

        contentContainer.innerHTML = _getSkeletonLoaderHTML('absensi');

        if (tabId === 'manual' && !isViewer()) {
            fabContainer.innerHTML = `
                <button type="submit" form="manual-attendance-form" class="fab fab-extended">
                    <span class="material-symbols-outlined">save</span>
                </button>
            `;
        } else {
            fabContainer.innerHTML = ''; // Kosongkan jika bukan tab manual
        }

        await Promise.all([
            fetchAndCacheData('workers', workersCol, 'workerName'),
            fetchAndCacheData('professions', professionsCol, 'professionName'),
            fetchAndCacheData('projects', projectsCol, 'projectName')
        ]);

        if (tabId === 'harian') {
            await _fetchTodaysAttendance();
            await _transitionContent(contentContainer, _getDailyAttendanceHTML());
            _initCustomSelects(contentContainer);
            contentContainer.querySelector('#attendance-profession-filter')?.addEventListener('change', () => _rerenderAttendanceList());
            contentContainer.querySelector('#attendance-project-id')?.addEventListener('change', () => _rerenderAttendanceList());
        } else if (tabId === 'manual') {
            await _transitionContent(contentContainer, _getManualAttendanceHTML());
            _initCustomSelects(contentContainer);
            const dateInput = $('#manual-attendance-date', contentContainer);
            const projectInput = $('#manual-attendance-project', contentContainer);
            dateInput.addEventListener('change', () => _renderManualAttendanceList(dateInput.value, projectInput.value));
            projectInput.addEventListener('change', () => _renderManualAttendanceList(dateInput.value, projectInput.value));
            
            _renderManualAttendanceList(dateInput.value, projectInput.value);
        }
    };

    const subNavItems = $$('.sub-nav-item');
    subNavItems.forEach((btn, index) => {
        btn.addEventListener('click', (e) => {
            const currentActive = $('.sub-nav-item.active');
            if (currentActive === btn) return;

            const currentIndex = Array.from(subNavItems).indexOf(currentActive);
            const direction = index > currentIndex ? 'forward' : 'backward';

            if(currentActive) currentActive.classList.remove('active');
            btn.classList.add('active');

            _animateTabSwitch(
                $("#sub-page-content"),
                () => renderTabContent(btn.dataset.tab),
                direction
            );
        });
    });

    const lastSubPage = appState.activeSubPage.get('absensi') || tabs[0].id;
    const initialTab = $(`.sub-nav-item[data-tab="${lastSubPage}"]`);
    if(initialTab){
        $$('.sub-nav-item').forEach(b => b.classList.remove('active'));
        initialTab.classList.add('active');
    }
    await renderTabContent(lastSubPage);
    _setActiveListeners(['attendance_records']);
}

function _getDailyAttendanceHTML() {
    const today = new Date().toLocaleDateString('id-ID', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
    const projectOptions = appState.projects.map(p => ({
        value: p.id,
        text: p.projectName
    }));
    const professionOptions = [{
        value: 'all',
        text: 'Semua Profesi'
    }, ...appState.professions.map(p => ({
        value: p.id,
        text: p.professionName
    }))];

    let content = (appState.workers.length === 0) ?
        _getEmptyStateHTML({
            icon: 'engineering',
            title: 'Belum Ada Pekerja',
            desc: 'Tambahkan data pekerja di menu Pengaturan untuk mulai mencatat absensi.'
        }) :
        `<div class="attendance-grid" id="attendance-grid-container">${_renderAttendanceGrid()}</div>`;
    return `
        <div class="card card-pad">
            <div class="attendance-daily-header">
                <h5 class="section-title-owner">Absensi Harian</h5>
                <p>${today}</p>
            </div>
            <div class="attendance-controls">
                ${createMasterDataSelect('attendance-project-id', 'Proyek Hari Ini', projectOptions, appState.projects[0]?.id || '')}
                ${createMasterDataSelect('attendance-profession-filter', 'Filter Profesi', professionOptions, 'all')}
            </div>
        </div>
        ${content}
    `;
}  
  function _rerenderAttendanceList() {
    $('#attendance-grid-container').innerHTML = _renderAttendanceGrid();
  }
  
  function _renderAttendanceGrid() {
    const professionFilter = $('#attendance-profession-filter')?.value;
    const projectId = $('#attendance-project-id')?.value;
    const activeWorkers = appState.workers.filter(w => w.status === 'active');
    const filteredWorkers = (professionFilter === 'all') ?
        activeWorkers :
        activeWorkers.filter(w => w.professionId === professionFilter);
    if (filteredWorkers.length === 0) {
        return `<p class="empty-state-small" style="grid-column: 1 / -1;">Tidak ada pekerja yang cocok.</p>`;
    }
    return filteredWorkers.map(worker => {
        const attendance = appState.attendance.get(worker.id);
        const profession = appState.professions.find(p => p.id === worker.professionId)?.professionName || 'Tanpa Profesi';
        const dailyWage = worker.projectWages?.[projectId] || 0;
        let statusHTML = '';
        const wageHTML = `<span class="worker-wage">${fmtIDR(dailyWage)} / hari</span>`;
        if (attendance) {
            const checkInTime = _getJSDate(attendance.checkIn).toLocaleTimeString('id-ID', {
                hour: '2-digit',
                minute: '2-digit'
            });
            const earnedPayHTML = attendance.totalPay?`<strong> (${fmtIDR(attendance.totalPay)})</strong>` : '';
            if (attendance.status === 'checked_in') {
                statusHTML = `
                        <div class="attendance-status checked-in">Masuk: ${checkInTime}</div>
                        ${isViewer()?'' : `<button class="btn btn-danger" data-action="check-out" data-id="${attendance.id}">Check Out</button>`}
                    `;
            } else { // completed
                const checkOutTime = _getJSDate(attendance.checkOut).toLocaleTimeString('id-ID', {
                    hour: '2-digit',
                    minute: '2-digit'
                });
                statusHTML = `
                        <div class="attendance-status">Masuk: ${checkInTime} | Keluar: ${checkOutTime}</div>
                        <div class="attendance-status completed">Total: ${attendance.workHours.toFixed(1)} jam ${earnedPayHTML}</div>
                        ${isViewer()?'' : `<button class="btn-icon" data-action="edit-attendance" data-id="${attendance.id}" title="Edit Waktu"><span class="material-symbols-outlined">edit_calendar</span></button>`}
                    `;
            }
        } else {
            statusHTML = isViewer()?'<div class="attendance-status">Belum Hadir</div>' : `<button class="btn btn-success" data-action="check-in" data-id="${worker.id}">Check In</button>`;
        }
  
        return `
                <div class="card attendance-card">
                    <div class="attendance-worker-info">
                        <strong>${worker.workerName}</strong>
                        <span>${profession}</span>
                        ${wageHTML}
                    </div>
                    <div class="attendance-actions">${statusHTML}</div>
                </div>`;
    }).join('');
  }
  
  async function _fetchTodaysAttendance() {
    appState.attendance.clear();
    const today = new Date();
    const startOfDay = new Date(today.setHours(0, 0, 0, 0));
    const endOfDay = new Date(today.setHours(23, 59, 59, 999));
  
    const q = query(attendanceRecordsCol,
        where('date', '>=', startOfDay),
        where('date', '<=', endOfDay)
    );
    const snap = await getDocs(q);
    snap.forEach(doc => {
        const data = doc.data();
        appState.attendance.set(data.workerId, {
            id: doc.id,
            ...data
        });
    });
  }
  
  async function handleCheckIn(workerId) {
    const projectId = $('#attendance-project-id')?.value;
    if (!projectId) {
        toast('error', 'Silakan pilih proyek terlebih dahulu.');
        return;
    }
  
    toast('syncing', 'Mencatat jam masuk lokal...');
    try {
        const worker = appState.workers.find(w => w.id === workerId);
        if (!worker) throw new Error('Pekerja tidak ditemukan');
  
        const dailyWage = worker.projectWages?.[projectId] || 0;
        const hourlyWage = dailyWage / 8;
        const now = new Date();
        const attendanceData = {
            workerId,
            projectId,
            workerName: worker.workerName,
            hourlyWage,
            date: now,
            checkIn: now,
            status: 'checked_in',
            type: 'timestamp',
            needsSync: 1,
            isPaid: false
        };
  
        if (!attendanceData.id) attendanceData.id = generateUUID();
        await localDB.attendance_records.add(attendanceData);
  
        _logActivity(`Check-in Pekerja (Lokal): ${worker.workerName}`, {
            workerId,
            projectId
        });
        toast('success', `${worker.workerName} berhasil check in.`);
  
        await loadAllLocalDataToState();
        _rerenderAttendanceList();
  
        syncToServer({ silent: true });
    } catch (error) {
        toast('error', 'Gagal melakukan check in.');
        console.error(error);
    }
  }
  
  async function handleCheckOut(recordLocalId) {
    toast('syncing', 'Mencatat jam keluar lokal...');
    try {
        const record = await localDB.attendance_records.get(Number(recordLocalId));
        if (!record) throw new Error('Data absensi tidak ditemukan di lokal');
  
        const now = new Date();
        const checkOutTime = now;
        const checkInTime = record.checkIn;
  
        const hours = (checkOutTime.seconds - checkInTime.seconds) / 3600;
        const normalHours = Math.min(hours, 8);
        const overtimeHours = Math.max(0, hours - 8);
  
        const hourlyWage = record.hourlyWage || 0;
        const normalPay = normalHours * hourlyWage;
        const overtimePay = overtimeHours * hourlyWage * 1.5;
        const totalPay = normalPay + overtimePay;
  
        const dataToUpdate = {
            checkOut: checkOutTime,
            status: 'completed',
            workHours: hours,
            normalHours,
            overtimeHours,
            totalPay,
            needsSync: 1
        };
  
        await localDB.attendance_records.update(Number(recordLocalId), dataToUpdate);
  
        _logActivity(`Check-out Pekerja (Lokal): ${record.workerName}`, {
            recordId: record.id,
            totalPay
        });
        toast('success', `${record.workerName} berhasil check out.`);
  
        await loadAllLocalDataToState();
        _rerenderAttendanceList();
  
        syncToServer({ silent: true });
    } catch (error) {
        toast('error', 'Gagal melakukan check out.');
        console.error(error);
    }
  }
  
function _getManualAttendanceHTML() {
    const today = new Date();
    const offset = today.getTimezoneOffset();
    const todayLocal = new Date(today.getTime() - (offset * 60 * 1000));
    const todayString = todayLocal.toISOString().split('T')[0];

    const projectOptions = appState.projects.map(p => ({
        value: p.id,
        text: p.projectName
    }));
    
    return `
        <form id="manual-attendance-form" data-async="true" method="POST" data-endpoint="/api/attendance/manual" data-success-msg="Absensi disimpan">
            
            <div class="card card-pad desktop-form-layout">
                <div class="form-group">
                    <label for="manual-attendance-date">Tanggal</label>
                    <input type="date" id="manual-attendance-date" value="${todayString}" required ${isViewer() ? 'disabled' : ''}>
                </div>
                ${createMasterDataSelect('manual-attendance-project', 'Proyek', projectOptions, appState.projects[0]?.id || '')}
            </div>

            <div id="manual-attendance-list-container" style="margin-top: 1.5rem;"></div>
            
            </form>
    `;
}
async function _renderManualAttendanceList(dateStr, projectId) {
    const container = $('#manual-attendance-list-container');
    if (!container) return;
    if (!dateStr || !projectId) {
        container.innerHTML = _getEmptyStateHTML({
            icon: 'event_available',
            title: 'Pilih Tanggal & Proyek',
            desc: 'Pilih tanggal dan proyek di atas untuk menampilkan daftar pekerja.'
        });
        return;
    }

    container.innerHTML = _getSkeletonLoaderHTML('absensi');
    
    const activeWorkers = appState.workers.filter(w => w.status === 'active');
    
    if (activeWorkers.length === 0) {
        container.innerHTML = _getEmptyStateHTML({
            icon: 'engineering',
            title: 'Belum Ada Pekerja Aktif',
            desc: 'Tambahkan data pekerja di menu Pengaturan untuk dapat mencatat absensi.'
        });
        return;
    }
    const date = new Date(dateStr);
    const startOfDay = new Date(new Date(date).setHours(0, 0, 0, 0));
    const endOfDay = new Date(new Date(date).setHours(23, 59, 59, 999));

    const existingRecords = new Map();
    const recordsOnDate = await localDB.attendance_records
        .where('date').between(startOfDay, endOfDay)
        .and(rec => rec.projectId === projectId && rec.type === 'manual' && !rec.isDeleted)
        .toArray();
    recordsOnDate.forEach(rec => existingRecords.set(rec.workerId, rec));
    const isDesktop = window.matchMedia('(min-width: 992px)').matches;

    const desktopCardStyle = isDesktop ? `
        display: grid;
        grid-template-columns: 1fr 1fr;
        grid-template-areas: 'left right' 'bottom bottom';
        gap: 0.75rem 1.5rem;
        align-items: center;
    ` : '';

    const listHTML = activeWorkers.map(worker => {
        const existing = existingRecords.get(worker.id);
        const currentStatus = existing?.attendanceStatus || 'absent';
        const currentJobRole = existing?.jobRole || '';

        const wageOptions = worker.projectWages?.[projectId] || {};
        let defaultWage = 0;
        let defaultRole = '';

        if (Object.keys(wageOptions).length > 0) {
            defaultRole = Object.keys(wageOptions)[0];
            defaultWage = wageOptions[defaultRole];
        }
        
        let calculatedPay = 0;
        if(currentStatus === 'full_day') calculatedPay = defaultWage;
        if(currentStatus === 'half_day') calculatedPay = defaultWage / 2;
        
        return `
        <div class="manual-attendance-item card">
            <div class="attendance-card-main">
                <div class="worker-info">
                    <strong class="worker-name">${worker.workerName}</strong>
                    <span class="worker-wage" data-pay="${calculatedPay}">${fmtIDR(calculatedPay)}</span>
                </div>
                <div class="worker-role">
                    <label>Peran / Tugas Hari Ini</label>
                    <div class="custom-select-wrapper">
                        <input type="hidden" class="wage-role-value" name="wage_role_selector_${worker.id}" value="${defaultWage}">
                        <button type="button" class="custom-select-trigger" ${isViewer() ? 'disabled' : ''}>
                            <span>${defaultRole || 'Tidak ada tarif'}</span>
                            <span class="material-symbols-outlined">arrow_drop_down</span>
                        </button>
                        <div class="custom-select-options">
                             <div class="custom-select-options-list">
                                ${Object.keys(wageOptions).length > 0 ? Object.entries(wageOptions).map(([roleName, wageAmount]) => `
                                    <div class="custom-select-option" data-value="${wageAmount}">${roleName}</div>
                                `).join('') : '<div class="custom-select-option" data-value="0">Tidak ada tarif</div>'}
                             </div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="attendance-status-selector" data-worker-id="${worker.id}">
                <label>
                    <input type="radio" name="status_${worker.id}" value="full_day" ${currentStatus === 'full_day'?'checked' : ''} ${isViewer()?'disabled' : ''}>
                    <span>Hadir</span>
                </label>
                <label>
                    <input type="radio" name="status_${worker.id}" value="half_day" ${currentStatus === 'half_day'?'checked' : ''} ${isViewer()?'disabled' : ''}>
                    <span>1/2 Hari</span>
                </label>
                <label>
                    <input type="radio" name="status_${worker.id}" value="absent" ${currentStatus === 'absent'?'checked' : ''} ${isViewer()?'disabled' : ''}>
                    <span>Absen</span>
                </label>
            </div>
        </div>
    `;
    }).join('');

    await _transitionContent(container, listHTML);

    const styleSheet = document.createElement("style");
    styleSheet.innerText = `
        .attendance-status-selector label:has(input:checked) {
            background-color: var(--panel) !important;
            color: var(--primary) !important;
            font-weight: 600 !important;
            box-shadow: var(--shadow-sm) !important;
            border-color: var(--line) !important;
        }
    `;
    document.head.appendChild(styleSheet);
    
    if (!isViewer()) {
        const _updatePay = (el) => {
            const card = el.closest('.manual-attendance-item');
            if (!card) return;
            const hiddenInput = card.querySelector('.wage-role-value');
            const status = card.querySelector('input[type="radio"]:checked')?.value || 'absent';
            const wageEl = card.querySelector('.worker-wage');
            if (!hiddenInput || !wageEl) return;
            const selectedWage = parseFloat(hiddenInput.value);
            let newPay = 0;
            if (status === 'full_day') newPay = selectedWage;
            else if (status === 'half_day') newPay = selectedWage / 2;
            wageEl.textContent = fmtIDR(newPay);
            wageEl.dataset.pay = newPay;
        };
        container.querySelectorAll('.attendance-status-selector input').forEach(el => {
            el.addEventListener('change', (e) => _updatePay(e.target));
        });
        _initCustomSelects(container);
        container.querySelectorAll('.wage-role-value').forEach(hiddenInput => {
            hiddenInput.addEventListener('change', (e) => _updatePay(e.target));
        });
    }
}
  
// GANTI SELURUH FUNGSI INI
async function handleDeleteSingleAttendance(recordId) {
    const record = appState.attendanceRecords.find(r => r.id === recordId);
    if (!record) return;
    const worker = appState.workers.find(w => w.id === record.workerId);
    const message = worker ?
        `Hapus absensi untuk <strong>${worker.workerName}</strong> pada tanggal ${_getJSDate(record.date).toLocaleDateString('id-ID')}?` :
        'Hapus data absensi ini?';
        
    createModal('confirmDelete', {
        message,
        onConfirm: async () => {
            try {
                // [PERBAIKAN KONSISTENSI UX]
                // 1. Tandai sebagai terhapus di database lokal
                await localDB.attendance_records.update(recordId, { isDeleted: 1, syncState: 'pending_update', updatedAt: new Date() });

                // 2. Animasikan item keluar dari daftar di tampilan detail
                await _removeItemFromListWithAnimation(recordId);

                // 3. Update state & kalkulasi ulang total Dashboard di latar belakang
                await loadAllLocalDataToState();
                _calculateAndCacheDashboardTotals();

                // 4. Update ringkasan (Total Upah & Pekerja) di dalam tampilan detail yang sedang terbuka
                const detailPane = document.querySelector('#detail-pane.detail-view-active, #detail-pane.detail-pane-open');
                if (detailPane) {
                    const recordsOnDate = (appState.attendanceRecords || []).filter(rec => _getJSDate(rec.date).toISOString().slice(0, 10) === _getJSDate(record.date).toISOString().slice(0, 10) && !rec.isDeleted);
                    const totalUpah = recordsOnDate.reduce((sum, rec) => sum + (rec.totalPay || 0), 0);
                    const workerCount = new Set(recordsOnDate.map(r => r.workerId)).size;
                    
                    const workerCountEl = detailPane.querySelector('.summary-item:nth-child(1) .value');
                    const totalUpahEl = detailPane.querySelector('.summary-item:nth-child(2) .value');

                    if (workerCountEl) workerCountEl.textContent = `${workerCount} Orang`;
                    if (totalUpahEl) totalUpahEl.textContent = fmtIDR(totalUpah);

                    // Jika tidak ada data tersisa, tampilkan empty state
                    if (recordsOnDate.length === 0) {
                        const projectSections = detailPane.querySelectorAll('.detail-section');
                        projectSections.forEach((section, index) => {
                            if (index > 0) section.remove(); // Hapus semua section kecuali summary
                        });
                         detailPane.querySelector('.detail-pane-body, .mobile-detail-content').insertAdjacentHTML('beforeend', _getEmptyStateHTML({ icon: 'event_busy', title: 'Tidak Ada Absensi Tersisa' }));
                    }
                }
                
                toast('success', 'Absensi berhasil dipindahkan ke Sampah.');
                _logActivity('Memindahkan Absensi ke Sampah', { recordId, workerName: worker?.workerName });
                syncToServer({ silent: true });

            } catch (error) {
                toast('error', 'Gagal menghapus absensi.');
                console.error(error);
            }
        }
    });
}

async function handleEditManualAttendanceModal(recordId) {
    const record = appState.attendanceRecords.find(r => r.id === recordId);
    if (!record) {
        toast('error', 'Data absensi tidak ditemukan.');
        return;
    }
    await Promise.all([
        fetchAndCacheData('workers', workersCol, 'workerName'),
        fetchAndCacheData('projects', projectsCol, 'projectName')
    ]);

    const worker = appState.workers.find(w => w.id === record.workerId);
    if (!worker) {
        toast('error', 'Data pekerja terkait tidak ditemukan.');
        return;
    }

    let content = '';
    const dateString = _getJSDate(record.date).toLocaleDateString('id-ID', {day: 'numeric', month: 'long', year: 'numeric'});

    if (record.type === 'manual') {
        const projectOptions = appState.projects.map(p => ({ value: p.id, text: p.projectName }));
        
        const currentWageOptions = worker.projectWages?.[record.projectId] || {};
        const roleOptions = Object.keys(currentWageOptions).map(roleName => ({
            value: roleName,
            text: `${roleName} - ${fmtIDR(currentWageOptions[roleName])}`
        }));

        // REVISI: Seluruh struktur HTML diubah untuk konsistensi dan pratinjau upah
        content = `
            <form id="edit-attendance-form" data-id="${recordId}" data-type="manual">
                <div class="card card-pad desktop-form-layout">
                    <p class="edit-attendance-intro">Mengedit absensi untuk <strong>${worker.workerName}</strong> pada tanggal <strong>${dateString}</strong>.</p>
                    
                    ${createMasterDataSelect('edit-attendance-project', 'Ubah Proyek', projectOptions, record.projectId)}
                    
                    <div id="edit-attendance-role-container">
                        ${createMasterDataSelect('edit-attendance-role', 'Ubah Peran/Tugas', roleOptions, record.jobRole)}
                    </div>

                    <div class="form-group">
                        <label>Upah Kustom (Isi untuk menimpa upah peran)</label>
                        <input type="text" name="customWage" inputmode="numeric" placeholder="mis. 200.000" value="${record.customWage ? new Intl.NumberFormat('id-ID').format(record.customWage) : ''}">
                    </div>

                    <div class="form-group">
                        <label>Status Kehadiran</label>
                        <div class="attendance-status-selector">
                            <label><input type="radio" name="status" value="full_day" ${record.attendanceStatus === 'full_day' ? 'checked' : ''}><span>Hadir</span></label>
                            <label><input type="radio" name="status" value="half_day" ${record.attendanceStatus === 'half_day' ? 'checked' : ''}><span>1/2 Hari</span></label>
                            <label><input type="radio" name="status" value="absent" ${record.attendanceStatus === 'absent' ? 'checked' : ''}><span>Absen</span></label>
                        </div>
                    </div>
                </div>

                <div class="card card-pad" style="margin-top:1rem;">
                    <div class="attendance-edit-summary">
                        <span>Estimasi Upah Hari Ini</span>
                        <strong id="edit-attendance-pay-preview">Rp 0</strong>
                    </div>
                </div>
                
                <div class="form-footer-actions">
                    <button type="submit" class="btn btn-primary">Simpan Perubahan</button>
                </div>
            </form>`;
        
    } else { // type === 'timestamp'
        // ... (kode untuk absensi harian tidak berubah)
        const checkInTime = _getJSDate(record.checkIn).toTimeString().slice(0, 5);
        const checkOutTime = record.checkOut ? _getJSDate(record.checkOut).toTimeString().slice(0, 5) : '';
        content = `
            <form id="edit-attendance-form" data-id="${recordId}" data-type="timestamp">
                <div class="card card-pad desktop-form-layout">
                    <p>Mengedit absensi untuk <strong>${worker?.workerName || '-'}</strong> pada tanggal <strong>${dateString}</strong>.</p>
                    <div class="form-group"><label>Jam Masuk</label><input type="time" name="checkIn" value="${checkInTime}" required></div>
                    <div class="form-group"><label>Jam Keluar</label><input type="time" name="checkOut" value="${checkOutTime}"></div>
                </div>
                <div class="form-footer-actions">
                    <button type="submit" class="btn btn-primary">Simpan Perubahan</button>
                 </div>
             </form>`;
    }

    const modalEl = createModal('editAttendance', { title: 'Edit Absensi', content, footer: '' });

    if (modalEl) {
        const form = (modalEl || document.getElementById('detail-pane')).querySelector('#edit-attendance-form');
        form.addEventListener('submit', (e) => {
             e.preventDefault();
             handleUpdateAttendance(e.target);
        });

        if (record.type === 'manual') {
            _initCustomSelects(modalEl);
            
            // REVISI: Fungsi baru untuk menghitung dan menampilkan pratinjau upah
            const _updateEditAttendancePreview = () => {
                const previewEl = $('#edit-attendance-pay-preview', modalEl);
                if (!previewEl) return;

                const newProjectId = $('#edit-attendance-project', modalEl).value;
                const newJobRole = $('#edit-attendance-role', modalEl).value;
                const customWage = parseFormattedNumber($('input[name="customWage"]', modalEl).value);
                const newStatus = $('input[name="status"]:checked', modalEl)?.value || 'absent';
                
                let baseWage = 0;
                if (customWage > 0) {
                    baseWage = customWage;
                } else if (newProjectId && newJobRole) {
                    baseWage = worker?.projectWages?.[newProjectId]?.[newJobRole] || 0;
                }

                let newTotalPay = 0;
                if (newStatus === 'full_day') newTotalPay = baseWage;
                else if (newStatus === 'half_day') newTotalPay = baseWage / 2;
                
                previewEl.textContent = fmtIDR(newTotalPay);
            };

            // REVISI: Pasang event listener ke semua input yang relevan
            $('input[name="customWage"]', modalEl).addEventListener('input', () => {
                _formatNumberInput({ target: $('input[name="customWage"]', modalEl) });
                _updateEditAttendancePreview();
            });
            $('#edit-attendance-project', modalEl).addEventListener('change', (e) => {
                const newProjectId = e.target.value;
                const newWageOptions = worker.projectWages?.[newProjectId] || {};
                const newRoleOptions = Object.keys(newWageOptions).map(roleName => ({
                    value: roleName,
                    text: `${roleName} - ${fmtIDR(newWageOptions[roleName])}`
                }));
                const roleContainer = $('#edit-attendance-role-container', modalEl);
                roleContainer.innerHTML = createMasterDataSelect('edit-attendance-role', 'Ubah Peran/Tugas', newRoleOptions, '');
                _initCustomSelects(roleContainer);
                
                // Pasang lagi listener untuk role dropdown yang baru dibuat
                $('#edit-attendance-role', roleContainer).addEventListener('change', _updateEditAttendancePreview);

                _updateEditAttendancePreview();
            });
            $('#edit-attendance-role', modalEl).addEventListener('change', _updateEditAttendancePreview);
            $$('input[name="status"]', modalEl).forEach(radio => {
                radio.addEventListener('change', _updateEditAttendancePreview);
            });

            // Panggil sekali saat modal pertama kali dibuka untuk menampilkan nilai awal
            _updateEditAttendancePreview();
        }
    }
}

async function handleUpdateAttendance(form) {
    createModal('confirmEdit', {
        onConfirm: async () => {
            const recordId = form.dataset.id;
            const recordType = form.dataset.type;
            const record = appState.attendanceRecords.find(r => r.id === recordId);
            if (!record) {
                toast('error', 'Data absensi asli tidak ditemukan.');
                return;
            }

            toast('syncing', 'Memperbarui absensi...');
            try {
                const dataToUpdate = {};
                if (recordType === 'manual') {
                    const newStatus = form.elements.status.value;
                    const newProjectId = form.elements['edit-attendance-project'].value;
                    const newJobRole = form.elements['edit-attendance-role'].value;
                    const customWage = parseFormattedNumber(form.elements.customWage.value);
                    let newTotalPay = 0;
                    let baseWage = 0;
                    if (customWage > 0) {
                        baseWage = customWage;
                    } else if (newProjectId && newJobRole) {
                        const worker = appState.workers.find(w => w.id === record.workerId);
                        baseWage = worker?.projectWages?.[newProjectId]?.[newJobRole] || 0;
                    }
                    if (newStatus === 'full_day') newTotalPay = baseWage;
                    else if (newStatus === 'half_day') newTotalPay = baseWage / 2;
                    dataToUpdate.attendanceStatus = newStatus;
                    dataToUpdate.totalPay = newTotalPay;
                    dataToUpdate.projectId = newProjectId;
                    dataToUpdate.jobRole = newJobRole;
                    dataToUpdate.customWage = customWage > 0 ? customWage : null;
                    dataToUpdate.dailyWage = customWage > 0 ? 0 : baseWage;
                } else {
                    const date = _getJSDate(record.date);
                    const [inH, inM] = form.elements.checkIn.value.split(':');
                    const newCheckIn = new Date(date);
                    newCheckIn.setHours(inH, inM);
                    dataToUpdate.checkIn = Timestamp.fromDate(newCheckIn);
                    if (form.elements.checkOut.value) {
                        const [outH, outM] = form.elements.checkOut.value.split(':');
                        const newCheckOut = new Date(date);
                        newCheckOut.setHours(outH, outM);
                        if (newCheckOut < newCheckIn) {
                            toast('error', 'Jam keluar tidak boleh lebih awal dari jam masuk.');
                            return;
                        }
                        const hours = (newCheckOut - newCheckIn) / 3600000;
                        const normalHours = Math.min(hours, 8);
                        const overtimeHours = Math.max(0, hours - 8);
                        const hourlyWage = record.hourlyWage || 0;
                        const normalPay = normalHours * hourlyWage;
                        const overtimePay = overtimeHours * hourlyWage * 1.5;
                        dataToUpdate.checkOut = Timestamp.fromDate(newCheckOut);
                        dataToUpdate.workHours = hours;
                        dataToUpdate.normalHours = normalHours;
                        dataToUpdate.overtimeHours = overtimeHours;
                        dataToUpdate.totalPay = normalPay + overtimePay;
                        dataToUpdate.status = 'completed';
                    } else {
                        dataToUpdate.checkOut = null;
                        dataToUpdate.workHours = 0;
                        dataToUpdate.totalPay = 0;
                        dataToUpdate.status = 'checked_in';
                    }
                }

                await localDB.attendance_records.where('id').equals(recordId).modify({ ...dataToUpdate, syncState: 'pending_update' });
                syncToServer({ silent: true });
                await _logActivity('Mengedit Absensi', { recordId, ...dataToUpdate });
                await toast('success', 'Absensi berhasil diperbarui.');

                closeAllModals();
                
                await loadAllLocalDataToState(); 
                
                const detailJurnalTerbuka = appState.detailPaneHistory.some(h => h.title?.includes('Jurnal Harian'));
                if (detailJurnalTerbuka) {
                    appState.detailPaneHistory = []; 
                    handleViewJurnalHarianModal(_getJSDate(record.date).toISOString().slice(0, 10));
                } else {
                    renderPageContent();
                }

            } catch (error) {
                toast('error', 'Gagal memperbarui absensi.');
                console.error(error);
            }
        }
    });
}

async function handleSaveManualAttendance(e) {
    e.preventDefault();
    const form = e.target;
    const dateStr = form.querySelector('#manual-attendance-date').value;
    const projectId = form.querySelector('#manual-attendance-project').value;
    const date = new Date(dateStr);

    if (!projectId) {
        toast('error', 'Proyek harus dipilih.');
        return;
    }

    const loadingToast = toast('syncing', 'Menyimpan absensi...');

    try {
        await localDB.transaction('rw', localDB.attendance_records, async () => {
            const workersOnForm = $$('.attendance-status-selector', form);
            const startOfDay = new Date(new Date(date).setHours(0, 0, 0, 0));
            const endOfDay = new Date(new Date(date).setHours(23, 59, 59, 999));
    
            const existingRecordsOnDate = await localDB.attendance_records
                .where('date').between(startOfDay, endOfDay)
                .and(rec => rec.projectId === projectId && rec.type === 'manual')
                .toArray();
            const existingRecordsMap = new Map(existingRecordsOnDate.map(rec => [rec.workerId, rec]));
    
            for (const workerEl of workersOnForm) {
                const workerId = workerEl.dataset.workerId;
                const statusInput = workerEl.querySelector('input:checked');
                if (!statusInput) continue;
    
                const status = statusInput.value;
                const card = workerEl.closest('.manual-attendance-item');
                
                const hiddenInput = card.querySelector('.wage-role-value');
                const triggerSpan = card.querySelector('.custom-select-trigger span');
                
                if (!hiddenInput || !triggerSpan) {
                    console.error('Elemen dropdown kustom tidak ditemukan untuk pekerja:', workerId);
                    continue; 
                }
    
                const selectedRole = triggerSpan.textContent.trim();
                const worker = appState.workers.find(w => w.id === workerId);
                const pay = Number(card.querySelector('.worker-wage')?.dataset?.pay || 0);
                const existingRecord = existingRecordsMap.get(workerId);
    
                if (existingRecord) {
                    if (status === 'absent') {
                        const validatedUpdate = _validateAndPrepareData({ isDeleted: 1, syncState: 'pending_delete' }, ['isDeleted', 'syncState'], {});
                        await localDB.attendance_records.update(existingRecord.localId, validatedUpdate);
                    } else {
                        const updateData = {
                            attendanceStatus: status,
                            totalPay: pay,
                            jobRole: selectedRole,
                            isDeleted: 0,
                            syncState: 'pending_update'
                        };
                        const validatedUpdate = _validateAndPrepareData(updateData, ['isDeleted', 'syncState'], {});
                        await localDB.attendance_records.update(existingRecord.localId, validatedUpdate);
                    }
                } else {
                    if (status !== 'absent') {
                        const newRecord = {
                            workerId,
                            workerName: worker.workerName,
                            projectId,
                            date,
                            attendanceStatus: status,
                            totalPay: pay,
                            jobRole: selectedRole,
                            isPaid: false,
                            type: 'manual',
                            status: 'completed',
                            createdAt: new Date()
                        };
                        
                        const validatedRecord = _validateAndPrepareData(
                            newRecord,
                            ['id', 'workerId', 'date', 'isPaid', 'isDeleted', 'syncState'],
                            { isPaid: false, isDeleted: 0, syncState: 'pending_create' }
                        );
                        await localDB.attendance_records.add(validatedRecord);
                    }
                }
            }
        });
    
        _logActivity(`Menyimpan Absensi Manual (Lokal)`, { date: dateStr, projectId });
        
        await loadAllLocalDataToState();
        
        if (navigator.onLine) {
            await syncToServer({ silent: true });
        }

        loadingToast.close();
        await toast('success', 'Absensi berhasil disimpan & disinkronkan.');
        handleNavigation('jurnal');
    
    } catch (error) {
        loadingToast.close();
        console.error("Gagal menyimpan absensi manual:", error);
        toast('error', 'Gagal menyimpan absensi.');
    }
}

async function renderJurnalPage() {
    document.body.classList.add('page-has-unified-panel'); // [REVISI] Tambahkan penanda
    const container = $('.page-container');
    

    const mainTabs = [{ id: 'jurnal_absensi', label: 'Jurnal Absensi' }, { id: 'rekap_gaji', label: 'Rekap Gaji' }];
    
    const fabContainer = $('#fab-container');
    if (fabContainer && !isViewer()) {
        fabContainer.innerHTML = `
            <button class="fab" data-action="navigate" data-nav="absensi" title="Input Absensi">
                <span class="material-symbols-outlined">person_add</span>
            </button>
        `;
    }

    const toolbarHTML = _createToolbarHTML({
        idPrefix: 'jurnal',
        searchPlaceholder: 'Cari...', // Placeholder tidak akan terlihat
        showFilter: true,
        showSort: false // Kita sembunyikan tombol sort
    });

    container.innerHTML = `
        <div class="content-panel">
            ${toolbarHTML}
            <div id="jurnal-main-nav" class="sub-nav two-tabs">
                ${mainTabs.map((tab, index) => `<button class="sub-nav-item ${index === 0 ? 'active' : ''}" data-tab="${tab.id}">${tab.label}</button>`).join('')}
            </div>
            <div id="sub-page-content"></div>
        </div>
    `;

    // Tambahkan event listener untuk tombol filter Jurnal yang baru
    $('#jurnal-filter-btn').addEventListener('click', () => {
        toast('info', 'Fitur filter tanggal untuk Jurnal akan segera hadir.');
        // Di sini nanti kita bisa panggil modal untuk filter rentang tanggal
    });

    const renderMainTabContent = async (mainTabId) => {
        const mainLabel = mainTabs.find(t => t.id === mainTabId)?.label || '';
        appState.activeSubPage.set('jurnal', mainTabId);
        const contentContainer = $("#sub-page-content");
        contentContainer.innerHTML = _getSkeletonLoaderHTML('jurnal');
        if (mainTabId === 'jurnal_absensi') {
            _renderJurnalAbsensiTabs(contentContainer);
        } else if (mainTabId === 'rekap_gaji') {
            _renderRekapGajiTabs(contentContainer);
        }
    };

    const mainNavItems = $$('#jurnal-main-nav .sub-nav-item');
    mainNavItems.forEach((btn, index) => {
        btn.addEventListener('click', (e) => {
            const currentActive = $('#jurnal-main-nav .sub-nav-item.active');
            if (currentActive === btn) return;
            const currentIndex = Array.from(mainNavItems).indexOf(currentActive);
            const direction = index > currentIndex ? 'forward' : 'backward';
            if(currentActive) currentActive.classList.remove('active');
            btn.classList.add('active');
            _animateTabSwitch($("#sub-page-content"), () => renderMainTabContent(btn.dataset.tab), direction);
        });
    });
      
    const lastMainTab = appState.activeSubPage.get('jurnal') || mainTabs[0].id;
    $(`.sub-nav-item[data-tab="${lastMainTab}"]`)?.classList.add('active');
    await renderMainTabContent(lastMainTab);
    _setActiveListeners(['attendance_records', 'bills']);
}

  function _renderJurnalAbsensiTabs(container) {
      const tabs = [{
          id: 'harian',
          label: 'Harian'
      }, {
          id: 'per_pekerja',
          label: 'Per Pekerja'
      }];
      container.innerHTML = `
              <div id="jurnal-absensi-sub-nav" class="sub-nav two-tabs">
                   ${tabs.map((tab, index) => `<button class="sub-nav-item ${index === 0?'active' : ''}" data-tab="${tab.id}">${tab.label}</button>`).join('')}
              </div>
              <div id="jurnal-absensi-content"></div>
          `;
  
      const renderSubTab = async (tabId) => {
          const content = $('#jurnal-absensi-content');
          content.innerHTML = '<div class="loader-container"><div class="spinner"></div></div>';
          if (tabId === 'harian') await _renderJurnalHarianView(content);
          else if (tabId === 'per_pekerja') await _renderJurnalPerPekerjaView(content);
      };
  
      // [PERUBAHAN] Menerapkan event listener animasi pada sub-tab Jurnal Absensi
      const subNavItems = $$('#jurnal-absensi-sub-nav .sub-nav-item');
      subNavItems.forEach((btn, index) => {
          btn.addEventListener('click', (e) => {
              const currentActive = $('#jurnal-absensi-sub-nav .sub-nav-item.active');
              if (currentActive === btn) return;
  
              const currentIndex = Array.from(subNavItems).indexOf(currentActive);
              const direction = index > currentIndex ? 'forward' : 'backward';
  
              if(currentActive) currentActive.classList.remove('active');
              btn.classList.add('active');
  
              _animateTabSwitch(
                  $("#jurnal-absensi-content"),
                  () => renderSubTab(btn.dataset.tab),
                  direction
              );
          });
      });
  
      renderSubTab(tabs[0].id);
  }
  
async function _renderJurnalHarianView(container) {
    await loadAllLocalDataToState();

    const groupedByDay = _groupAttendanceByDay(appState.attendanceRecords);
    const sortedDays = Object.entries(groupedByDay).sort((a, b) => new Date(b[0]) - new Date(a[0]));

    if (sortedDays.length === 0) {
        container.innerHTML = _getEmptyStateHTML({
            icon: 'event_busy',
            title: 'Belum Ada Data Absensi',
            desc: 'Semua catatan absensi harian akan muncul di sini.'
        });
        return;
    }

    let listHTML = '';
    let lastGroupLabel = '';
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
    const startOfWeek = new Date(today); startOfWeek.setDate(today.getDate() - (today.getDay() === 0 ? 6 : today.getDay() - 1));

    const getGroupLabel = (date) => {
        const d0 = new Date(date); d0.setHours(0, 0, 0, 0);
        if (d0.getTime() === today.getTime()) return 'Hari ini';
        if (d0.getTime() === yesterday.getTime()) return 'Kemarin';
        if (d0 >= startOfWeek) return 'Minggu ini';
        return d0.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
    };

    sortedDays.forEach(([date, data]) => {
        const dayDate = new Date(date);
        const currentGroupLabel = getGroupLabel(dayDate);
        
        if (currentGroupLabel !== lastGroupLabel) {
            listHTML += `<h5 class="list-group-header">${currentGroupLabel}</h5>`;
            lastGroupLabel = currentGroupLabel;
        }
        
        const formattedDate = dayDate.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
        const projectNames = [...new Set(data.records.map(r => appState.projects.find(p => p.id === r.projectId)?.projectName).filter(Boolean))].join(', ');
    
        listHTML += `
            <div class="wa-card-v2-wrapper">
                <div class="wa-card-v2" data-action="view-jurnal-harian" data-date="${date}">
                    <div class="wa-card-v2__main">
                        <div class="wa-card-v2__header">
                            <div class="wa-card-v2__title">${formattedDate}</div>
                        </div>
                        <div class="wa-card-v2__body">${projectNames || 'Tidak ada proyek'} • ${data.workerCount} Pekerja Hadir</div>
                    </div>
                    <div class="wa-card-v2__meta">
                        <div class="wa-card-v2__amount negative">${fmtIDR(data.totalUpah)}</div>
                        <div class="wa-card-v2__status"><span class="badge">Total Upah</span></div>
                    </div>
                </div>
            </div>`;
    });

    await _transitionContent(container, `<div class="jurnal-list">${listHTML}</div>`);
}

function _groupAttendanceByDay(records) {
    return (records || []).reduce((acc, rec) => {
        const dateStr = _getJSDate(rec?.date).toISOString().slice(0, 10);
        if (!acc[dateStr]) {
            acc[dateStr] = {
                records: [],
                totalUpah: 0,
                workerCount: 0
            };
        }
        acc[dateStr].records.push(rec);
        acc[dateStr].totalUpah += (rec.totalPay || 0);
        if ((rec.totalPay || 0) > 0) acc[dateStr].workerCount++;
        return acc;
    }, {});
  }
  
  async function handleViewWorkerRecapModal(workerId) {
    const worker = appState.workers.find(w => w.id === workerId) || await localDB.workers.get(workerId);
    if (!worker) {
        toast('error', 'Data pekerja tidak ditemukan.');
        return;
    }

    // LANGKAH 1: Tampilkan panel dengan skeleton
    showDetailPane({
        title: `Buku Besar Gaji: ${worker.workerName}`,
        content: _getSkeletonLoaderHTML('laporan'),
        footer: ''
    });

    try {
        // LANGKAH 2: Ambil data di latar belakang
        const relatedRecords = await localDB.attendance_records.where({ workerId: workerId, isDeleted: 0 }).toArray();
        const salaryBillsForWorker = await localDB.bills.where('type').equals('gaji').filter(bill => {
            return (bill.workerDetails && bill.workerDetails.some(detail => (detail.id === workerId || detail.workerId === workerId))) || bill.workerId === workerId;
        }).toArray();
        const allPaymentsForWorker = await localDB.pending_payments.where('workerId').equals(workerId).toArray();

        // ... (semua logika perhitungan upah tetap sama) ...
        const totalEarned = relatedRecords.reduce((sum, rec) => sum + (rec.totalPay || 0), 0);
        const totalPaid = allPaymentsForWorker.reduce((sum, p) => sum + (p.amount || 0), 0);
        
        let estimatedPaidFromBills = 0;
        salaryBillsForWorker.forEach(bill => {
            if (bill.status === 'paid') {
                 const workerDetail = bill.workerDetails?.find(d => d.id === workerId || d.workerId === workerId);
                 if (workerDetail && !allPaymentsForWorker.some(p => p.billId === bill.id)) {
                    estimatedPaidFromBills += workerDetail.amount;
                 } else if (bill.workerId === workerId && !allPaymentsForWorker.some(p => p.billId === bill.id)) {
                    estimatedPaidFromBills += bill.amount;
                }
            }
        });

        const finalTotalPaid = totalPaid + estimatedPaidFromBills;
        const totalUnpaid = totalEarned - finalTotalPaid;
        const formattedSisaGaji = totalUnpaid < 0 ? `-${fmtIDR(Math.abs(totalUnpaid))}` : fmtIDR(totalUnpaid);

        // LANGKAH 3: Buat HTML sebenarnya
        const summaryHTML = `
            <div class="detail-section">
                <div class="detail-summary-grid">
                    <div class="summary-item"><span class="label">Total Upah Dihasilkan</span><strong class="value">${fmtIDR(totalEarned)}</strong></div>
                    <div class="summary-item"><span class="label">Total Telah Dibayar</span><strong class="value positive">${fmtIDR(finalTotalPaid)}</strong></div>
                    <div class="summary-item"><span class="label">Sisa Gaji (Tagihan)</span><strong class="value ${totalUnpaid > 0 ? 'negative' : ''}">${formattedSisaGaji}</strong></div>
                </div>
            </div>`;
        const sortedRecords = relatedRecords.sort((a, b) => _getJSDate(b.date) - _getJSDate(a.date));
        const attendanceHistoryHTML = sortedRecords.length > 0 ? sortedRecords.map(rec => {
            const project = appState.projects.find(p => p.id === rec.projectId);
            return `<div class="detail-list-item-card"><div class="item-main"><strong class="item-title">${_getJSDate(rec.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'long' })}</strong><span class="item-subtitle">${project?.projectName || '-'}</span></div><strong class="item-secondary">${fmtIDR(rec.totalPay || 0)}</strong></div>`;
        }).join('') : '<p class="empty-state-small">Belum ada riwayat absensi.</p>';
        const paymentHistoryHTML = allPaymentsForWorker.length > 0 ? _createPaymentHistoryHTML(allPaymentsForWorker) : '<p class="empty-state-small">Belum ada riwayat pembayaran.</p>';
        const content = summaryHTML +
            `<div class="detail-section"><h5 class="detail-section-title">Riwayat Absensi (Upah Dihasilkan)</h5>${attendanceHistoryHTML}</div>` +
            `<div class="detail-section"><h5 class="detail-section-title">Riwayat Pembayaran Gaji</h5>${paymentHistoryHTML}</div>`;
        
        // LANGKAH 4: Update panel yang sudah ada
        const detailPane = document.getElementById('detail-pane');
        if (detailPane) {
            const bodyContainer = detailPane.querySelector('.detail-pane-body, .mobile-detail-content');
            if (bodyContainer) {
                bodyContainer.innerHTML = content;
                // No comments section for worker recap detail
            }
        }

    } catch (error) {
        console.error("Gagal membuat rekap detail pekerja:", error);
        const detailPane = document.getElementById('detail-pane');
        if(detailPane) {
            const bodyContainer = detailPane.querySelector('.detail-pane-body, .mobile-detail-content');
            if (bodyContainer) bodyContainer.innerHTML = _getEmptyStateHTML({ icon: 'error', title: 'Gagal Memuat', desc: 'Gagal memuat riwayat lengkap dari database lokal.' });
        }
    }
}  
  async function _renderJurnalPerPekerjaView(container) {
      await Promise.all([
          fetchAndCacheData('workers', workersCol, 'workerName'),
          fetchAndCacheData('professions', collection(db, 'teams', TEAM_ID, 'professions'), 'professionName')
      ]);
      const activeWorkers = appState.workers.filter(w => w.status === 'active');
      if (activeWorkers.length === 0) {
          container.innerHTML = '<p class="empty-state">Belum ada data pekerja aktif.</p>';
          return;
      }
const listHTML = activeWorkers.map(worker => {
    const profession = appState.professions.find(p => p.id === worker.professionId)?.professionName || 'Tanpa Profesi';
    
    // Menghitung total gaji yang belum dibayar untuk pekerja ini
    const unpaidWages = appState.attendanceRecords
        .filter(rec => rec.workerId === worker.id && !rec.isPaid)
        .reduce((sum, rec) => sum + (rec.totalPay || 0), 0);
    
    return `
        <div class="wa-card-v2-wrapper">
             <div class="wa-card-v2" data-action="view-worker-recap" data-worker-id="${worker.id}">
                <div class="wa-card-v2__main">
                    <div class="wa-card-v2__header">
                        <div class="wa-card-v2__title">${worker.workerName}</div>
                    </div>
                    <div class="wa-card-v2__body">${profession}</div>
                </div>
                <div class="wa-card-v2__meta">
                    <div class="wa-card-v2__amount negative">${unpaidWages > 0 ? fmtIDR(unpaidWages) : ''}</div>
                    <div class="wa-card-v2__status">
                        ${unpaidWages > 0 ? '<span class="status-badge negative">Belum Dibayar</span>' : '<span class="status-badge positive">Lunas</span>'}
                    </div>
                </div>
            </div>
        </div>`;
}).join('');

await _transitionContent(container, `<div class="jurnal-list">${listHTML}</div>`);
    }
  
    async function handleViewJurnalHarianModal(dateStr) {
        const date = new Date(dateStr);
        const formattedDate = date.toLocaleDateString('id-ID', {
            weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC'
        });
    
        showDetailPane({
            title: `Jurnal Harian: ${formattedDate}`,
            content: _getSkeletonLoaderHTML('jurnal'),
            footer: ''
        });
    
        try {
            const startOfDay = new Date(date);
            startOfDay.setUTCHours(0, 0, 0, 0);
            const endOfDay = new Date(date);
            endOfDay.setUTCHours(23, 59, 59, 999);
    
            const recordsOnDate = (appState.attendanceRecords || []).filter(rec => {
                const recDate = _getJSDate(rec.date);
                return recDate >= startOfDay && recDate <= endOfDay && !rec.isDeleted;
            });
    
            const detailPane = document.getElementById('detail-pane');
            if (!detailPane) return;
            const bodyContainer = detailPane.querySelector('.detail-pane-body, .mobile-detail-content');
            if (!bodyContainer) return;
    
            if (recordsOnDate.length === 0) {
                bodyContainer.innerHTML = _getEmptyStateHTML({
                    icon: 'event_busy',
                    title: 'Tidak Ada Absensi',
                    desc: 'Tidak ada data absensi yang tercatat pada tanggal ini.'
                });
                return;
            }
    
            const totalUpah = recordsOnDate.reduce((sum, rec) => sum + (rec.totalPay || 0), 0);
            const workerCount = new Set(recordsOnDate.map(r => r.workerId)).size;
    
            const summaryHTML = `
                <div class="detail-section">
                    <div class="detail-summary-grid">
                        <div class="summary-item">
                            <span class="label">Total Pekerja Hadir</span>
                            <strong class="value">${workerCount} Orang</strong>
                        </div>
                        <div class="summary-item">
                            <span class="label">Total Beban Upah</span>
                            <strong class="value negative">${fmtIDR(totalUpah)}</strong>
                        </div>
                    </div>
                </div>`;
            
            const workersByProject = recordsOnDate.reduce((acc, rec) => {
                const projectId = rec.projectId || 'tanpa_proyek';
                if (!acc[projectId]) acc[projectId] = [];
                acc[projectId].push(rec);
                return acc;
            }, {});
            
            const projectSectionsHTML = Object.entries(workersByProject).map(([projectId, records]) => {
                const projectName = appState.projects.find(p => p.id === projectId)?.projectName || 'Proyek Tidak Diketahui';
                const workersHTML = records.sort((a,b) => (a.workerName || '').localeCompare(b.workerName || '')).map(rec => {
                    let statusBadge = `<span class="status-badge status-absen">Absen</span>`;
                    if (rec.attendanceStatus === 'full_day') statusBadge = `<span class="status-badge status-hadir">Hadir</span>`;
                    else if (rec.attendanceStatus === 'half_day') statusBadge = `<span class="status-badge status-setengah">1/2 Hari</span>`;
                    
                    const editButtonHTML = isViewer() ? '' : `<button class="btn-icon" data-action="edit-attendance" data-id="${rec.id}" title="Edit Absensi"><span class="material-symbols-outlined">edit</span></button>`;
    
                    return `
                    <div class="detail-list-item-card" data-id="${rec.id}">
                        <div class="item-main"><strong class="item-title">${rec.workerName || 'Pekerja Dihapus'}</strong></div>
                        <div class="item-secondary" style="display: flex; align-items: center; gap: 1rem;">
                            <span>${fmtIDR(rec.totalPay || 0)}</span>
                            ${statusBadge}
                            ${editButtonHTML}
                        </div>
                    </div>`;
                }).join('');
                
                return `<div class="detail-section"><h5 class="detail-section-title">${projectName}</h5>${workersHTML}</div>`;
            }).join('');
        
            bodyContainer.innerHTML = summaryHTML + projectSectionsHTML;
            
        } catch (error) {
            console.error("Gagal memuat detail jurnal harian:", error);
            const detailPane = document.getElementById('detail-pane');
            if (detailPane) {
                const bodyContainer = detailPane.querySelector('.detail-pane-body, .mobile-detail-content');
                if (bodyContainer) bodyContainer.innerHTML = _getEmptyStateHTML({ icon: 'error', title: 'Gagal Memuat', desc: error.message });
            }
        }
    }  
    async function _renderRekapGajiTabs(container) {
      const tabs = [{
          id: 'buat_rekap',
          label: 'Buat Rekap Baru'
      }, {
          id: 'riwayat_rekap',
          label: 'Riwayat Rekap'
      }];
      container.innerHTML = `
              <div id="rekap-gaji-sub-nav" class="sub-nav two-tabs">
                   ${tabs.map((tab, index) => `<button class="sub-nav-item ${index === 0?'active' : ''}" data-tab="${tab.id}">${tab.label}</button>`).join('')}
              </div>
              <div id="rekap-gaji-content"></div>
          `;
  
      const renderSubTab = async (tabId) => {
          const content = $('#rekap-gaji-content');
          content.innerHTML = '<div class="loader-container"><div class="spinner"></div></div>';
          if (tabId === 'buat_rekap') {
              content.innerHTML = `<div class="content-panel">${_getSalaryRecapHTML()}</div>`;
              if (!isViewer()) {
                  $('#generate-recap-btn')?.addEventListener('click', () => {
                      const startDate = $('#recap-start-date').value;
                      const endDate = $('#recap-end-date').value;
                      if (startDate && endDate) generateSalaryRecap(new Date(startDate), new Date(endDate));
                      else toast('error', 'Silakan pilih rentang tanggal.');
                  });
              } else {
                  generateSalaryRecap(new Date(new Date().getFullYear(), new Date().getMonth(), 1), new Date());
              }
          } else if (tabId === 'riwayat_rekap') {
              await _renderRiwayatRekapView(content);
          }
      };
  
      // [PERUBAHAN] Menerapkan event listener animasi pada sub-tab Rekap Gaji
      const subNavItems = $$('#rekap-gaji-sub-nav .sub-nav-item');
      subNavItems.forEach((btn, index) => {
          btn.addEventListener('click', (e) => {
              const currentActive = $('#rekap-gaji-sub-nav .sub-nav-item.active');
              if (currentActive === btn) return;
  
              const currentIndex = Array.from(subNavItems).indexOf(currentActive);
              const direction = index > currentIndex ? 'forward' : 'backward';
  
              if(currentActive) currentActive.classList.remove('active');
              btn.classList.add('active');
  
              _animateTabSwitch(
                  $("#rekap-gaji-content"),
                  () => renderSubTab(btn.dataset.tab),
                  direction
              );
          });
      });
      
      await renderSubTab(tabs[0].id);
  }
  
  function _getSalaryRecapHTML() {
      const today = new Date();
      const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
      const todayStr = today.toISOString().slice(0, 10);
      return `
          <div class="card card-pad">
              <h5 class="section-title-owner" style="margin-top:0;">Pilih Periode Rekap</h5>
              <div class="rekap-filters">
                  <div class="form-group"><label>Tanggal Mulai</label><input type="date" id="recap-start-date" value="${firstDayOfMonth}" ${isViewer()?'disabled' : ''}></div>
                  <div class="form-group"><label>Tanggal Selesai</label><input type="date" id="recap-end-date" value="${todayStr}" ${isViewer()?'disabled' : ''}></div>
              </div>
              ${isViewer()?'' : `
                <div class="form-footer-actions">
                  <button id="generate-recap-btn" class="btn btn-primary">Tampilkan Rekap</button>
                  <button id="fix-stuck-data-btn" class="btn btn-danger" data-action="fix-stuck-attendance"><span class="material-symbols-outlined">build_circle</span> Hitung Ulang & Perbaiki</button>
                </div>
              `}
          </div>
          <div id="recap-actions-container" class="card card-pad hidden">
            <div class="form-footer-actions">
              <button id="generate-selected-btn" class="btn btn-secondary" data-action="generate-selected-salary-bill" disabled>Buat Tagihan (Terpilih)</button>
              <button id="generate-all-btn" class="btn btn-primary" data-action="generate-all-salary-bill">Buat Tagihan (Semua)</button>
            </div>
          </div>
          <div id="recap-results-container" class="recap-results"></div>
      `;
    }
  
    async function handleRecalculateWages() {
      const startDateStr = $('#recap-start-date').value;
      const endDateStr = $('#recap-end-date').value;
  
      if (!startDateStr || !endDateStr) {
          toast('error', 'Silakan pilih rentang tanggal terlebih dahulu.');
          return;
      }
  
      createModal('confirmUserAction', {
          message: 'Anda akan menghitung ulang upah untuk semua absensi yang BELUM DIBAYAR dalam periode ini menggunakan tarif terbaru dari master data. Ini akan memperbaiki data lama yang upahnya 0. Lanjutkan?',
          onConfirm: async () => {
              toast('syncing', 'Mencari & menghitung ulang upah...');
              const startDate = new Date(startDateStr);
              const endDate = new Date(endDateStr);
              endDate.setHours(23, 59, 59, 999);
  
              try {
                  await fetchAndCacheData('workers', workersCol, 'workerName');
  
                  const q = query(attendanceRecordsCol,
                      where('isPaid', '==', false),
                      where('date', '>=', startDate),
                      where('date', '<=', endDate)
                  );
                  const snapshot = await getDocs(q);
  
                  if (snapshot.empty) {
                      toast('info', 'Tidak ditemukan absensi yang perlu dihitung ulang.');
                      return;
                  }
  
                  const batch = writeBatch(db);
                  let updatedCount = 0;
  
                  snapshot.forEach(doc => {
                      const record = { id: doc.id, ...doc.data() };
                      const worker = appState.workers.find(w => w.id === record.workerId);
                      if (!worker) return;
  
                      // Gunakan logika cerdas yang sama seperti di generateSalaryRecap
                      let baseWage = 0;
                      const projectWages = worker.projectWages?.[record.projectId];
                      if (typeof projectWages === 'object' && projectWages !== null) {
                          baseWage = projectWages[record.jobRole] || Object.values(projectWages)[0] || 0;
                      } else if (typeof projectWages === 'number') {
                          baseWage = projectWages;
                      }
                      
                      let newTotalPay = 0;
                      if (record.type === 'manual') {
                          if (record.attendanceStatus === 'full_day') newTotalPay = baseWage;
                          else if (record.attendanceStatus === 'half_day') newTotalPay = baseWage / 2;
                      } else if (record.type === 'timestamp') {
                          const hourlyWage = baseWage / 8;
                          newTotalPay = ((record.normalHours || 0) * hourlyWage) + ((record.overtimeHours || 0) * hourlyWage * 1.5);
                      }
                      
                      if (Math.round(newTotalPay) !== Math.round(record.totalPay || 0)) {
                          batch.update(doc.ref, { totalPay: newTotalPay });
                          updatedCount++;
                      }
                  });
  
                  if (updatedCount > 0) {
                      await batch.commit();
                      toast('success', `${updatedCount} data upah berhasil dikoreksi dan diperbarui!`);
                      await fetchAndCacheData('attendanceRecords', attendanceRecordsCol, 'date');
                      generateSalaryRecap(startDate, endDate); // Tampilkan ulang rekap dengan data baru
                  } else {
                      toast('info', 'Semua data upah sudah sesuai dengan tarif terbaru.');
                  }
  
              } catch (error) {
                  console.error("Gagal menghitung ulang upah:", error);
                  toast('error', 'Terjadi kesalahan saat proses hitung ulang.');
              }
          }
      });
  }
  
  async function generateSalaryRecap(startDate, endDate) {
      const resultsContainer = $('#recap-results-container');
      const actionsContainer = $('#recap-actions-container');
      if (!resultsContainer || !actionsContainer) return;
      
      resultsContainer.innerHTML = '<div class="loader-container"><div class="spinner"></div></div>';
      actionsContainer.classList.add('hidden');
  
      toast('syncing', 'Memuat data master & absensi...');
  
      await fetchAndCacheData('workers', workersCol, 'workerName');
      
      endDate.setHours(23, 59, 59, 999);
      
      const q = query(attendanceRecordsCol,
          where('status', '==', 'completed'),
          where('isPaid', '==', false),
          where('date', '>=', startDate),
          where('date', '<=', endDate)
      );
  
      const snap = await getDocs(q);
      
      if (snap.empty) {
          hideToast();
          resultsContainer.innerHTML = `<p class="empty-state">Tidak ada data gaji yang belum dibayar pada periode ini.</p>`;
          return;
      }
      
      toast('syncing', 'Menghitung upah berdasarkan data terbaru...');
      const salaryRecap = new Map();
  
      snap.forEach(doc => {
          const record = { id: doc.id, ...doc.data() };
          const worker = appState.workers.find(w => w.id === record.workerId);
          if (!worker) return;
  
          // [PERBAIKAN KUNCI] Logika pencarian upah yang lebih cerdas
          let baseWage = 0;
          const projectWages = worker.projectWages?.[record.projectId];
  
          if (typeof projectWages === 'object' && projectWages !== null) {
              // Coba format BARU (multi-peran)
              baseWage = projectWages[record.jobRole] || 0;
              // Jika gagal (jobRole tidak ada), coba cari peran 'default'
              if (baseWage === 0) {
                  const defaultRole = Object.keys(projectWages).find(k => k.toLowerCase().includes('default'));
                  baseWage = projectWages[defaultRole] || 0;
              }
          } else if (typeof projectWages === 'number') {
              // Fallback ke format LAMA (satu upah per proyek)
              baseWage = projectWages;
          }
          
          let finalPay = 0;
          if (record.type === 'manual') {
              if (record.attendanceStatus === 'full_day') finalPay = baseWage;
              else if (record.attendanceStatus === 'half_day') finalPay = baseWage / 2;
          } else if (record.type === 'timestamp') {
              const hourlyWage = baseWage / 8;
              const normalPay = (record.normalHours || 0) * hourlyWage;
              const overtimePay = (record.overtimeHours || 0) * hourlyWage * 1.5;
              finalPay = normalPay + overtimePay;
          }
          
          const workerId = record.workerId;
          if (!salaryRecap.has(workerId)) {
              salaryRecap.set(workerId, {
                  workerName: worker.workerName,
                  totalPay: 0,
                  recordIds: [],
                  workerId: workerId
              });
          }
          const workerData = salaryRecap.get(workerId);
          workerData.totalPay += finalPay;
          workerData.recordIds.push(record.id);
      });
  
      hideToast();
  
      const recapData = [...salaryRecap.values()];
      const totalWorkers = recapData.length;
      const totalUpah = recapData.reduce((sum, w) => sum + (w.totalPay || 0), 0);
      const summaryCardHTML = `
      <div class="summary-card">
          <div class="summary-card-title">Ringkasan Rekap</div>
          <div class="summary-card-grid">
              <div class="summary-card-item"><div class="label">Pekerja</div><div class="amount">${totalWorkers}</div></div>
              <div class="summary-card-item"><div class="label">Total Upah</div><div class="amount">${fmtIDR(totalUpah)}</div></div>
              <div class="summary-card-item"><div class="label">Terpilih</div><div id="recap-selected-count" class="amount">0</div></div>
          </div>
      </div>`;
      const tableHTML = `
      <div class="card card-pad">
          <div class="recap-table-wrapper">
              <table class="recap-table" id="salary-recap-table">
                  <thead>
                      <tr>
                           ${isViewer() ? '' : `<th><label class="custom-checkbox-label"><input type="checkbox" id="select-all-recap"><span class="custom-checkbox-visual"></span></label></th>`}
                          <th>Nama Pekerja</th>
                          <th>Total Upah</th>
                      </tr>
                  </thead>
                  <tbody>
                      ${recapData.map(worker => `
                          <tr data-worker-id="${worker.workerId}" data-worker-name="${worker.workerName}" data-total-pay="${worker.totalPay}" data-record-ids="${worker.recordIds.join(',')}" class="recap-row">
                               ${isViewer() ? '' : `<td><label class="custom-checkbox-label"><input type="checkbox" class="recap-checkbox"><span class="custom-checkbox-visual"></span></label></td>`}
                              <td>${worker.workerName}</td>
                              <td><strong class="recap-amount">${fmtIDR(worker.totalPay)}</strong></td>
                          </tr>
                      `).join('')}
                  </tbody>
              </table>
          </div>
      </div>
  `;
      resultsContainer.innerHTML = summaryCardHTML + tableHTML;
      actionsContainer.classList.remove('hidden');
      if (!isViewer()) _attachRecapTableListeners(recapData);
  }
  // TAMBAHKAN DUA FUNGSI BARU INI DI script.js

function handleEditWorkerRecapAmount(targetButton) {
    const row = targetButton.closest('tr');
    const { workerId, workerName, totalPay } = row.dataset;

    const content = `
        <form id="edit-recap-amount-form">
            <p>Edit jumlah upah terakumulasi untuk <strong>${workerName}</strong> sebelum membuat tagihan.</p>
            <div class="form-group">
                <label>Jumlah Upah Baru</label>
                <input type="text" name="newAmount" inputmode="numeric" value="${new Intl.NumberFormat('id-ID').format(totalPay)}" required>
            </div>
        </form>
    `;
    const footer = `
        <button class="btn btn-secondary" data-close-modal>Batal</button>
        <button class="btn btn-primary" type="submit" form="edit-recap-amount-form">Simpan</button>
    `;

    const modal = createModal('dataDetail', { title: 'Edit Upah Rekap', content, footer });
    
    const form = $('#edit-recap-amount-form', modal);
    const amountInput = form.querySelector('input[name="newAmount"]');
    amountInput.addEventListener('input', _formatNumberInput);

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const newAmount = parseFormattedNumber(amountInput.value);
        
        // Update data di tabel
        row.dataset.totalPay = newAmount;
        row.querySelector('.recap-amount').textContent = fmtIDR(newAmount);

        toast('success', `Upah untuk ${workerName} diperbarui.`);
        closeModal(modal);
    });
}

function handlePaySingleWorkerFromRecap(targetButton) {
    const row = targetButton.closest('tr');
    const { workerId, workerName, totalPay, recordIds } = row.dataset;
    const recordsArray = recordIds.split(',');
    
    const startDate = new Date($('#recap-start-date').value);
    const endDate = new Date($('#recap-end-date').value);

    const singleWorkerData = {
        workerId,
        workerName,
        totalPay: parseFloat(totalPay),
        recordIds: recordsArray
    };

    createModal('confirmUserAction', {
        message: `Buat tagihan individual untuk <strong>${workerName}</strong> sebesar <strong>${fmtIDR(singleWorkerData.totalPay)}</strong>?`,
        onConfirm: async () => {
            await handleGenerateBulkSalaryBill([singleWorkerData], startDate, endDate);
            
            row.style.transition = 'opacity 0.3s, transform 0.3s';
            row.style.opacity = '0';
            row.style.transform = 'translateX(-20px)';
            setTimeout(() => row.remove(), 300);
        }
    });
}
  function _attachRecapTableListeners(recapData) {
    const table = $('#salary-recap-table');
    if (!table) return;
    const selectAll = $('#select-all-recap');
    const checkBoxes = $$('.recap-checkbox');
    const generateSelectedBtn = $('#generate-selected-btn');
    const updateButtonState = () => {
        const selectedCount = $$('.recap-checkbox:checked').length;
        generateSelectedBtn.disabled = selectedCount === 0;
        generateSelectedBtn.textContent = `Buat Tagihan (${selectedCount} Terpilih)`;
        const selEl = document.getElementById('recap-selected-count');
        if (selEl) selEl.textContent = String(selectedCount);
    };
    selectAll.addEventListener('change', () => {
        checkBoxes.forEach(cb => cb.checked = selectAll.checked);
        updateButtonState();
    });
    checkBoxes.forEach(cb => {
        cb.addEventListener('change', () => {
            const allChecked = checkBoxes.every(c => c.checked);
            selectAll.checked = allChecked;
            updateButtonState();
        });
    });
    updateButtonState();
  }
  
  async function handleGenerateBulkSalaryBill(selectedWorkers, startDate, endDate) {
    if (selectedWorkers.length === 0) {
        toast('error', 'Tidak ada pekerja yang dipilih.');
        return;
    }

    const grandTotal = selectedWorkers.reduce((sum, worker) => sum + worker.totalPay, 0);
    const allRecordIds = selectedWorkers.flatMap(worker => worker.recordIds);
    const description = selectedWorkers.length === 1 ?
    `Gaji ${selectedWorkers[0].workerName}` :
    `Gaji Gabungan ${selectedWorkers.length} pekerja`;

    createModal('confirmGenerateBill', {
        message: `Anda akan membuat 1 tagihan gabungan sebesar <strong>${fmtIDR(grandTotal)}</strong> untuk <strong>${selectedWorkers.length} pekerja</strong>. Lanjutkan?`,
        onConfirm: async () => { 
        toast('syncing', 'Membuat tagihan gaji massal...');
            try {
                const billId = generateUUID();
                const newBillData = {
                    id: billId,
                    description, // Deskripsi yang sudah disingkat
                    startDate: startDate, // [TAMBAHAN BARU] Simpan tanggal mulai
                    endDate: endDate,     // [TAMBAHAN BARU] Simpan tanggal selesai
                    amount: grandTotal,                    paidAmount: 0,
                    dueDate: new Date(),
                    status: 'unpaid',
                    type: 'gaji',
                    workerDetails: selectedWorkers.map(w => ({ id: w.workerId, name: w.workerName, amount: w.totalPay, recordIds: w.recordIds })),
                    recordIds: allRecordIds,
                    createdAt: new Date(),
                    isDeleted: 0,
                    syncState: 'pending_create'
                };

                await localDB.transaction('rw', localDB.bills, localDB.attendance_records, async () => {
                    await localDB.bills.add(newBillData);
                    await localDB.attendance_records.where('id').anyOf(allRecordIds).modify({ isPaid: true, billId: billId });
                });
                
                _logActivity(`Membuat Tagihan Gaji Massal (Lokal)`, { billId, amount: grandTotal });
                toast('success', 'Tagihan gaji gabungan berhasil dibuat.');
                
                syncToServer({ silent: true });
                await loadAllLocalDataToState();

                const riwayatTabButton = document.querySelector('#rekap-gaji-sub-nav .sub-nav-item[data-tab="riwayat_rekap"]');
                if (riwayatTabButton) {
                    riwayatTabButton.click();
                }

            } catch (error) {
                toast('error', 'Gagal membuat tagihan gaji.');
                console.error('Error generating bulk salary bill:', error);
            }
        }
    });
}
  
  async function _renderRiwayatRekapView(container) {
      const salaryBills = appState.bills.filter(b => b.type === 'gaji').sort((a, b) => _getJSDate(b.createdAt) - _getJSDate(a.createdAt));
  
      if (salaryBills.length === 0) {
          container.innerHTML = '<p class="empty-state">Belum ada riwayat rekap gaji yang dibuat.</p>';
          return;
      }
  
      const listHTML = salaryBills.map(bill => {
          const date = _getJSDate(bill.createdAt).toLocaleDateString('id-ID', {day:'numeric', month:'long', year:'numeric'});
          const statusClass = bill.status === 'paid' ? 'positive' : 'negative';
          const statusText = bill.status === 'paid' ? 'Lunas' : 'Belum Lunas';
          const isTouch = (('ontouchstart' in window) || (navigator.maxTouchPoints||0)>0);
  
          return `
              <div class="dense-list-item" data-id="${bill.id}" style="position:relative; overflow:hidden;">
                  <div class="item-main-content" data-action="open-bill-detail" data-id="${bill.id}" data-type="bill">
                      <strong class="item-title">${bill.description}</strong>
                      <span class="item-subtitle">Dibuat pada: ${date}</span>
                      <div class="item-details">
                          <strong class="item-amount">${fmtIDR(bill.amount)}</strong>
                          <span class="status-badge ${statusClass}">${statusText}</span>
                      </div>
                  </div>
              </div>
          `;
      }).join('');
  
      container.innerHTML = `<div class="content-panel"><div class="dense-list-container">${listHTML}</div></div>`;
      
      // Swipe gestures removed; no initialization needed
  }
  
  async function handleRemoveWorkerFromRecap(billId, workerId) {
      const bill = appState.bills.find(b => b.id === billId);
      const worker = bill?.workerDetails?.find(w => (w.id === workerId || w.workerId === workerId));
      
      if (!bill || !worker) {
          toast('error', 'Data tagihan atau pekerja tidak ditemukan.');
          return;
      }
  
      createModal('confirmUserAction', {
          message: `Anda yakin ingin mengeluarkan <strong>${worker.name}</strong> dari rekap ini? Tagihan akan disesuaikan dan absensi pekerja ini akan bisa direkap ulang.`,
          onConfirm: async () => {
              toast('syncing', `Memproses pengeluaran ${worker.name}...`);
              try {
                  const billRef = doc(billsCol, billId);
  
                  // 1. PENGAMAN: Cek apakah sudah ada pembayaran
                  const paymentsColRef = collection(billRef, 'payments');
                  const paymentsSnap = await getDocs(paymentsColRef);
                  const hasPaymentForWorker = !paymentsSnap.empty && paymentsSnap.docs.some(doc => doc.data().workerId === workerId);
                  
                  if (bill.status === 'paid' || hasPaymentForWorker) {
                      toast('error', `Pekerja tidak bisa dikeluarkan karena pembayaran sudah tercatat untuknya atau tagihan sudah lunas.`);
                      return;
                  }
  
                  // 2. Siapkan data untuk diupdate
                  const workerToRemove = bill.workerDetails.find(w => (w.id === workerId || w.workerId === workerId));
                  const amountToRemove = workerToRemove.amount || 0;
                  const recordIdsToReset = workerToRemove.recordIds || [];
                  
                  const newWorkerDetails = bill.workerDetails.filter(w => (w.id !== workerId && w.workerId !== workerId));
                  const newRecordIds = newWorkerDetails.flatMap(w => w.recordIds || []);
  
                  const batch = writeBatch(db);
  
                  // 3. Update Tagihan Gabungan
                  batch.update(billRef, {
                      amount: increment(-amountToRemove),
                      workerDetails: newWorkerDetails,
                      recordIds: newRecordIds
                  });
  
                  // 4. Reset absensi pekerja yang dikeluarkan
                  recordIdsToReset.forEach(id => {
                      const recordRef = doc(attendanceRecordsCol, id);
                      batch.update(recordRef, { billId: null });
                  });
  
                  await batch.commit();
  
                  await _logActivity(`Mengeluarkan Pekerja dari Rekap: ${worker.name}`, { billId, workerId });
                  toast('success', `${worker.name} berhasil dikeluarkan dari rekap.`);
                  
                  // 5. Muat ulang data dan refresh tampilan
                  await fetchAndCacheData('bills', billsCol);
                  closeModal($('#dataDetail-modal')); // Tutup modal lama
                  renderPageContent(); // Render ulang halaman Jurnal/Tagihan
  
              } catch (error) {
                  toast('error', 'Gagal memproses. Coba lagi.');
                  console.error('Error removing worker from recap:', error);
              }
          }
      });
  }
  
  async function handleDeleteSalaryBill(billId) {
    createModal('confirmDelete', {
        message: 'Membatalkan rekap akan menghapus tagihan ini dan mengembalikan status absensi terkait menjadi "belum dibayar". Lanjutkan?',
        onConfirm: async () => {
            toast('syncing', 'Membatalkan rekap...');
            try {
                const bill = await localDB.bills.get(billId);
                if (!bill) throw new Error('Tagihan tidak ditemukan');
                
                const hasPayments = await localDB.pending_payments.where({billId}).count() > 0;
                if(hasPayments){
                     throw new Error(`Tagihan ini tidak bisa dibatalkan karena sudah memiliki riwayat pembayaran.`);
                }
                
                const recordIds = bill.recordIds || [];
                
                await localDB.transaction('rw', localDB.bills, localDB.attendance_records, async () => {
                    await localDB.bills.delete(billId);
                    if (recordIds.length > 0) {
                        await localDB.attendance_records.where('id').anyOf(recordIds).modify({ isPaid: false, billId: null, syncState: 'pending_update' });
                    }
                });
                
                _logActivity(`Membatalkan Rekap Gaji (Lokal)`, { billId });
                syncToServer({ silent: true });
                toast('success', 'Rekap gaji berhasil dibatalkan.');
                
                const itemElement = document.querySelector(`.dense-list-item[data-id="${billId}"]`);
                if (itemElement) {
                    itemElement.style.transition = 'opacity 0.3s, transform 0.3s';
                    itemElement.style.opacity = '0';
                    setTimeout(() => itemElement.remove(), 300);
                }

            } catch (error) {
                console.error('Error deleting salary bill:', error);
                toast('error', error.message || 'Gagal membatalkan rekap.');
            }
        }
    });
}
  async function handleFixStuckAttendanceModal() {
    await fetchAndCacheData('workers', workersCol, 'workerName');
    const workerOptions = [{
        value: 'all',
        text: '� Semua Pekerja �'
    }, ...appState.workers.filter(w => w.status === 'active').map(w => ({
        value: w.id,
        text: w.workerName
    }))];
    const content = `
            <form id="fix-attendance-form">
                <p class="confirm-modal-text">Fitur ini akan secara paksa mereset status absensi yang 'lunas' tanpa tagihan menjadi 'belum lunas'.</p>
                ${createMasterDataSelect('fix-worker-id', 'Pilih Pekerja (atau Semua)', workerOptions, 'all')}
                <div class="recap-filters" style="padding:0; margin-top: 1rem;">
                    <div class="form-group"><label>Dari Tanggal</label><input type="date" name="startDate" required></div>
                    <div class="form-group"><label>Sampai Tanggal</label><input type="date" name="endDate" required></div>
                </div>
                <div class="modal-footer" style="margin-top: 1.5rem;"><button type="button" class="btn btn-secondary" data-close-modal>Batal</button><button type="submit" class="btn btn-danger">Jalankan Perbaikan</button></div>
            </form>
        `;
    createModal('dataDetail', {
        title: 'Perbaiki Data Absensi',
        content
    });
    _initCustomSelects($('#dataDetail-modal'));
    $('#fix-attendance-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const workerId = e.target.elements['fix-worker-id'].value;
        let msg = 'Anda yakin ingin mereset status absensi untuk pekerja dan periode ini?';
        if (workerId === 'all') {
            msg = 'PERINGATAN: Anda akan mereset status LUNAS menjadi BELUM LUNAS untuk SEMUA pekerja pada periode ini. Lanjutkan hanya jika Anda yakin.';
        }
        createModal('confirmUserAction', {
            message: msg,
            onConfirm: () => _forceResetAttendanceStatus(e.target)
        });
    });
  }
  // --- [TAMBAHKAN KEMBALI FUNGSI-FUNGSI INI] ---
  
  // Fungsi untuk kompresi gambar
  async function _compressImage(file, quality = 0.85, maxWidth = 1024) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let {
                    width,
                    height
                } = img;
                if (width > maxWidth) {
                    height = (maxWidth / width) * height;
                    width = maxWidth;
                }
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                canvas.toBlob((blob) => {
                    if (blob) {
                        resolve(new File([blob], file.name, {
                            type: file.type
                        }));
                    } else {
                        reject(new Error('Gagal membuat blob gambar.'));
                    }
                }, file.type, quality);
            };
            img.onerror = reject;
        };
        reader.onerror = reject;
    });
  }
  async function _uploadFileToCloudinary(file) {
    const CLOUDINARY_CLOUD_NAME = "dcjp0fxvb";
    const CLOUDINARY_UPLOAD_PRESET = "BanPlex-UploadDev";
    const url = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;
    try {
        const compressedFile = await _compressImage(file);
        const formData = new FormData();
        formData.append('file', compressedFile);
        formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
        toast('syncing', `Mengupload ${file.name}...`, 999999);
        const response = await fetch(url, {
            method: 'POST',
            body: formData
        });
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error.message);
        }
        const data = await response.json();
        toast('success', `${file.name} berhasil diupload!`);
        return data.secure_url; // Mengembalikan URL gambar yang aman
    } catch (error) {
        console.error(`Cloudinary upload error:`, error);
        toast('error', `Upload ${file.name} gagal.`);
        return null;
    }
  }
  
  async function _forceResetAttendanceStatus(form) {
    const workerId = form.elements['fix-worker-id'].value;
    const startDateStr = form.elements.startDate.value;
    const endDateStr = form.elements.endDate.value;
    if (!workerId || !startDateStr || !endDateStr) {
        toast('error', 'Harap lengkapi semua field.');
        return;
    }
    toast('syncing', `Memperbaiki data absensi...`);
    const startDate = new Date(startDateStr);
    const endDate = new Date(endDateStr);
    endDate.setHours(23, 59, 59, 999);
    let queryConstraints = [where('isPaid', '==', true), where('date', '>=', startDate), where('date', '<=', endDate)];
    if (workerId !== 'all') {
        queryConstraints.push(where('workerId', '==', workerId));
    }
    const q = query(attendanceRecordsCol, ...queryConstraints);
    try {
        const attendanceSnap = await getDocs(q);
        if (attendanceSnap.empty) {
            toast('info', 'Tidak ditemukan data berstatus lunas untuk diperbaiki.');
            return;
        }
        const batch = writeBatch(db);
        attendanceSnap.docs.forEach(doc => {
            batch.update(doc.ref, {
                isPaid: false,
                billId: null
            });
        });
        await batch.commit();
        toast('success', `${attendanceSnap.size} data absensi berhasil direset!`);
        closeModal($('#dataDetail-modal'));
        closeModal($('#confirmUserAction-modal'));
    } catch (error) {
        toast('error', 'Gagal memperbaiki data.');
        console.error('Gagal force reset data:', error);
    }
  }
  
  // --- SUB-SEKSI 3.5: TAGIHAN & SIMULASI ---
async function renderTagihanPage() {

    document.body.classList.add('page-has-unified-panel');
    const container = $('.page-container');
    container.classList.add('full-bleed');
    _deactivateSelectionMode(); // Reset selection mode

    const fabContainer = $('#fab-container');
    if (fabContainer && !isViewer()) {
        fabContainer.innerHTML = `<button class="fab" data-action="navigate" data-nav="pengeluaran" title="Tambah Pengeluaran Baru"><span class="material-symbols-outlined">add</span></button>`;
    }

    container.innerHTML = `
        <div class="content-panel">
            ${_createPageToolbarHTML('tagihan')}
            <div id="main-tabs-container" class="sub-nav two-tabs">
                <button class="sub-nav-item active" data-tab="unpaid">Belum Lunas</button>
                <button class="sub-nav-item" data-tab="paid">Lunas</button>
            </div>
            <div id="category-sub-nav-container" class="category-sub-nav"></div>
            <div id="sub-page-content">${_getSkeletonLoaderHTML('tagihan')}</div>
        </div>
    `;
    
    _setActiveListeners(['bills', 'expenses', 'comments']);
    _initTagihanInteractiveListeners(); 
    await _renderTagihanContent();
}
async function _renderTagihanContent() {
    console.log(`--- [_renderTagihanContent] MEMULAI RENDER KONTEN TAGIHAN ---`);
    const contentContainer = $("#sub-page-content");
    if (!contentContainer) {
        console.warn("Membatalkan render TagihanContent karena container tidak ditemukan.");
        return;
    }
    
    contentContainer.innerHTML = _getSkeletonLoaderHTML('tagihan');
      
    await Promise.all([
        fetchAndCacheData('projects', projectsCol, 'projectName'),
        fetchAndCacheData('suppliers', suppliersCol, 'supplierName')
    ]);

    const tabId = $('#main-tabs-container .sub-nav-item.active')?.dataset.tab || 'unpaid';

    const billsFromState = (appState.bills || []).filter(b => b.status === tabId);
    console.log(`[DATA SOURCE] Menggunakan appState. Ditemukan ${billsFromState.length} tagihan untuk tab '${tabId}'.`);

    const billedExpenseIds = new Set(billsFromState.map(b => b.expenseId).filter(Boolean));
  
    let deliveryOrders = [];
    if (tabId === 'unpaid') {
        const doFromState = (appState.expenses || []).filter(e => e.status === 'delivery_order' && !billedExpenseIds.has(e.id));
        deliveryOrders = doFromState.map(d => ({
            id: `expense-${d.id}`, expenseId: d.id, description: d.description, amount: 0,
            dueDate: d.date, status: 'delivery_order', type: d.type,
            projectId: d.projectId, paidAmount: 0, isDeleted: 0
        }));
    }
      
    appState.tagihan.fullList = [...deliveryOrders, ...billsFromState].filter(item => !item.isDeleted);
    console.log(`[RENDER] Total item yang akan diproses untuk rendering: ${appState.tagihan.fullList.length}`);
  
    const initialCounts = { material: 0, operasional: 0, gaji: 0, fee: 0, lainnya: 0 };
    const counts = appState.tagihan.fullList.reduce((acc, b) => {
        const type = b.type || 'lainnya';
        acc[type] = (acc[type] || 0) + 1;
        return acc;
    }, initialCounts);
    
    counts.all = appState.tagihan.fullList.length;
      
    const categories = [{ id: 'all', label: 'Semua' }, { id: 'material', label: 'Material' }, { id: 'operasional', label: 'Operasional' }, { id: 'gaji', label: 'Gaji' }, { id: 'fee', label: 'Fee' }, { id: 'lainnya', label: 'Lainnya' }];
    const categoryNavContainer = $('#category-sub-nav-container');
    if (categoryNavContainer) {
        categoryNavContainer.innerHTML = categories
            .filter(cat => counts[cat.id] > 0 || cat.id === 'all')
            .map(cat => {
                const count = counts[cat.id] || 0;
                return `<button class="sub-nav-item ${appState.billsFilter.category === cat.id ? 'active' : ''}" data-category="${cat.id}">
                          ${cat.label} 
                          <span class="tab-count">${count}</span>
                        </button>`;
            })
            .join('');
    }
  
    _renderFilteredAndPaginatedBills();
}

async function _renderFilteredAndPaginatedBills(loadMore = false) {
    const PAGE_SIZE = 20;
    const contentContainer = $("#sub-page-content");
    if (!contentContainer) return;

    const pagination = appState.pagination.bills;

    if (pagination.isLoading || (loadMore && !pagination.hasMore)) return;
    pagination.isLoading = true;

    if (!loadMore) {
        // Tampilkan skeleton loader SEGERA untuk memberikan feedback ke pengguna
        contentContainer.innerHTML = _getSkeletonLoaderHTML('tagihan');
        appState.tagihan.currentList = [];
    } else {
        contentContainer.insertAdjacentHTML('beforeend', '<div class="loader-container" id="load-more-spinner"><div class="spinner"></div></div>');
    }

    // --- KUNCI PERBAIKAN ---
    // Beri jeda sesaat agar browser sempat me-render skeleton loader sebelum memulai proses berat.
    await new Promise(resolve => setTimeout(resolve, 50));

    try {
        const { searchTerm, projectId, supplierId, category, sortBy, sortDirection } = appState.billsFilter;
        let filteredBills = appState.tagihan.fullList;

        // Logika filter dan sort tetap sama, namun sekarang berjalan secara asinkron
        if (category !== 'all') {
            filteredBills = filteredBills.filter(bill => bill.type === category);
        }
        if (projectId !== 'all') {
            filteredBills = filteredBills.filter(bill => {
                const expense = appState.expenses.find(e => e.id === bill.expenseId);
                return bill.projectId === projectId || (expense && expense.projectId === projectId);
            });
        }
        if (supplierId !== 'all') {
            filteredBills = filteredBills.filter(bill => {
                const expense = appState.expenses.find(e => e.id === bill.expenseId);
                return expense && expense.supplierId === supplierId;
            });
        }
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            filteredBills = filteredBills.filter(bill => {
                const expense = appState.expenses.find(e => e.id === bill.expenseId);
                const supplier = expense ? appState.suppliers.find(s => s.id === expense.supplierId) : null;
                const remainingAmount = (bill.amount || 0) - (bill.paidAmount || 0);
                return ((bill.description || '').toLowerCase().includes(term) || (supplier?.supplierName || '').toLowerCase().includes(term) || (bill.type || '').toLowerCase().includes(term) || String(bill.amount).includes(term) || String(remainingAmount).includes(term));
            });
        }
        
        filteredBills.sort((a, b) => {
            const valA = (sortBy === 'amount') ? (a.amount - (a.paidAmount || 0)) : _getJSDate(a.dueDate).getTime();
            const valB = (sortBy === 'amount') ? (b.amount - (b.paidAmount || 0)) : _getJSDate(b.dueDate).getTime();
            return sortDirection === 'asc' ? valA - valB : valB - valA;
        });

        const offset = loadMore ? appState.tagihan.currentList.length : 0;
        const pageOfBills = filteredBills.slice(offset, offset + PAGE_SIZE);
        
        if (!loadMore && pageOfBills.length === 0) {
            const emptyHTML = _getEmptyStateHTML({ icon: 'receipt_long', title: 'Tidak Ada Tagihan', desc: 'Tidak ada tagihan yang cocok dengan filter yang Anda pilih.' });
            await _transitionContent(contentContainer, emptyHTML); // Transisi halus
            pagination.hasMore = false;
            if (infiniteScrollObserver) infiniteScrollObserver.disconnect();
        } else {
            let lastGroupLabel = loadMore ? contentContainer.dataset.lastGroupLabel || '' : '';
            const today = new Date(); today.setHours(0, 0, 0, 0);
            const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
            const startOfWeek = new Date(today); startOfWeek.setDate(today.getDate() - (today.getDay() === 0 ? 6 : today.getDay() - 1));

            const getGroupLabel = (date) => {
                const d0 = new Date(date); d0.setHours(0, 0, 0, 0);
                if (d0.getTime() === today.getTime()) return 'Hari ini';
                if (d0.getTime() === yesterday.getTime()) return 'Kemarin';
                if (d0 >= startOfWeek) return 'Minggu ini';
                return d0.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
            };

            let newHtml = '';
            pageOfBills.forEach(bill => {
                const billDate = _getJSDate(bill.dueDate);
                const currentGroupLabel = getGroupLabel(billDate);

                if (currentGroupLabel !== lastGroupLabel) {
                    newHtml += `<h5 class="list-group-header">${currentGroupLabel}</h5>`;
                    lastGroupLabel = currentGroupLabel;
                }
                newHtml += _getBillsListHTML([bill]);
            });
            
            contentContainer.dataset.lastGroupLabel = lastGroupLabel;
            
            if (loadMore) {
                contentContainer.querySelector('.dense-list-container')?.insertAdjacentHTML('beforeend', newHtml);
            } else {
                $('#scroll-sentinel')?.remove();
                const finalHTML = `<div class="dense-list-container">${newHtml}</div><div id="scroll-sentinel"></div>`;
                await _transitionContent(contentContainer, finalHTML); // Transisi halus
                _initInfiniteScrollObserver();
            }
            
            appState.tagihan.currentList = loadMore ? [...appState.tagihan.currentList, ...pageOfBills] : pageOfBills;
            pagination.hasMore = appState.tagihan.currentList.length < filteredBills.length;
            
            const sentinel = $('#scroll-sentinel');
            if (sentinel && !pagination.hasMore) {
                sentinel.style.display = 'none';
            }
        }

    } catch (error) {
        console.error("Gagal memuat tagihan:", error);
        contentContainer.innerHTML = _getEmptyStateHTML({ icon: 'error', title: 'Gagal Memuat Data' });
    } finally {
        pagination.isLoading = false;
        $('#load-more-spinner')?.remove();
    }
}
let infiniteScrollObserver;
  
  function _initInfiniteScrollObserver() {
      if (infiniteScrollObserver) {
          infiniteScrollObserver.disconnect();
      }
      
      const sentinel = document.getElementById('scroll-sentinel');
      if (!sentinel) return;
  
      const options = {
          root: null, // amati viewport
          rootMargin: '0px',
          threshold: 0.1 // picu saat 10% elemen terlihat
      };
  
      infiniteScrollObserver = new IntersectionObserver((entries) => {
          if (entries[0].isIntersecting) {
              console.log('Sentinel terlihat, memuat lebih banyak tagihan...');
              _renderFilteredAndPaginatedBills(true); // Panggil fungsi dengan loadMore = true
          }
      }, options);
  
      infiniteScrollObserver.observe(sentinel);
  }
  
  function _initTagihanInteractiveListeners() {
      _initSelectionMode('#sub-page-content', 'tagihan');
      // Swipe gestures removed; no initialization
  }
  
  function _initTagihanPageListeners() {
      document.body.addEventListener('input', (e) => {
          if (e.target.id === 'tagihan-search-input') {
              appState.billsFilter.searchTerm = e.target.value;
              _renderFilteredAndPaginatedBills();
          }
      });
  
      document.body.addEventListener('click', (e) => {
          const filterSortBtn = e.target.closest('#tagihan-filter-btn, #tagihan-sort-btn');
          if (filterSortBtn) {
              // Langsung panggil fungsi modal tanpa mengirim data
              if (filterSortBtn.id === 'tagihan-filter-btn') {
                  _showBillsFilterModal(_renderFilteredAndPaginatedBills); // ✅ Tidak mengirimkan data lagi
              } else if (filterSortBtn.id === 'tagihan-sort-btn') {
                  _showBillsSortModal(_renderFilteredAndPaginatedBills);
              }
              return;
          }
  
          // Cek #2: Apakah yang diklik adalah tombol tab?
          const tabBtn = e.target.closest('.sub-nav-item');
          // Pastikan klik terjadi di dalam container tab dan tombol tab itu sendiri
          if (tabBtn && e.target.closest('#main-tabs-container, #category-sub-nav-container')) {
              if (tabBtn.classList.contains('active')) return; // Jangan lakukan apa-apa jika tab sudah aktif
              
              const tabContainer = e.target.closest('#main-tabs-container, #category-sub-nav-container');
              const isMainTab = tabContainer.id === 'main-tabs-container';
              const allTabs = $$('.sub-nav-item', tabContainer);
              const currentActive = $('.sub-nav-item.active', tabContainer);
              const currentIndex = Array.from(allTabs).indexOf(currentActive);
              const newIndex = Array.from(allTabs).indexOf(tabBtn);
              const direction = newIndex > currentIndex ? 'forward' : 'backward';
  
              if (currentActive) currentActive.classList.remove('active');
              tabBtn.classList.add('active');
  
              if (isMainTab) {
                  appState.billsFilter.category = 'all'; 
                  _animateTabSwitch($("#sub-page-content"), _renderTagihanContent, direction);
              } else {
                  appState.billsFilter.category = tabBtn.dataset.category;
                  _animateTabSwitch($("#sub-page-content"), _renderFilteredAndPaginatedBills, direction);
              }
          }
      });
  }
  
function showDetailPane({ title, content, footer, headerActions, fabHTML }, isGoingBack = false) {
    const isMobile = window.matchMedia('(max-width: 599px)').matches;
    
    if (isMobile) {
        showMobileDetailPage({ title, content, footer, headerActions, fabHTML }, isGoingBack);
        return;
    }
    
    try { const fab = document.getElementById('fab-container'); if (fab) fab.innerHTML = ''; } catch(_) {}

    const detailPane = document.getElementById('detail-pane');
    if (!detailPane) return;

    // KUNCI PERBAIKAN (BAGIAN 1): Simpan state panel detail desktop saat ini
    if (!isGoingBack && document.body.classList.contains('detail-pane-open')) {
        const fabEl = detailPane.querySelector('.fab');
        const previousState = {
            title: detailPane.querySelector('.detail-pane-header h4')?.textContent,
            content: detailPane.querySelector('.detail-pane-body')?.innerHTML,
            footer: detailPane.querySelector('.detail-pane-footer')?.innerHTML,
            headerActions: detailPane.querySelector('.header-actions')?.innerHTML || '',
            fabHTML: fabEl ? fabEl.outerHTML : '' // Simpan HTML dari FAB
        };
        appState.detailPaneHistory.push(previousState);
    }

    const hasHistory = appState.detailPaneHistory.length > 0;
    const closeButtonHTML = hasHistory
        ? `<button class="btn-icon" data-action="detail-pane-back" title="Kembali"><span class="material-symbols-outlined">arrow_back</span></button>`
        : `<button class="btn-icon" data-action="close-detail-pane" title="Tutup"><span class="material-symbols-outlined">close</span></button>`;

    detailPane.innerHTML = `
        <div class="detail-pane-header">
            <h4>${title}</h4>
            <div class="header-actions">${headerActions || ''}</div>
            ${closeButtonHTML}
        </div>
        <div class="detail-pane-body">${content}</div>
        ${footer ? `<div class="detail-pane-footer">${footer}</div>` : ''}
    `;

    // KUNCI PERBAIKAN (BAGIAN 2): Render kembali FAB jika ada di riwayat
    if (fabHTML && typeof fabHTML === 'string') {
        detailPane.insertAdjacentHTML('beforeend', fabHTML);
    }

    document.body.classList.add('detail-pane-open');
}

function _restorePageFab() {
    // Restore page-level FAB depending on current active page
    const fabContainer = document.getElementById('fab-container');
    if (!fabContainer) return;
    // If viewer mode, hide FAB globally
    if (typeof isViewer === 'function' && isViewer()) {
        fabContainer.innerHTML = '';
        return;
    }
    const page = appState.activePage;
    if (page === 'pemasukan') {
        fabContainer.innerHTML = `
            <button class="fab" data-action="open-pemasukan-form" title="Tambah Pemasukan Baru">
                <span class="material-symbols-outlined">add</span>
            </button>
        `;
    } else if (page === 'tagihan') {
        fabContainer.innerHTML = `
            <button class="fab" data-action="navigate" data-nav="pengeluaran" title="Tambah Pengeluaran Baru">
                <span class="material-symbols-outlined">add</span>
            </button>
        `;
    } else if (page === 'laporan') {
        const isMobile = window.matchMedia('(max-width: 599px)').matches;
        fabContainer.innerHTML = isMobile ? '' : `
            <button class="fab" data-action="open-report-generator" title="Buat/Unduh Laporan">
                <span class="material-symbols-outlined">download</span>
            </button>`;
    } else {
        // Default: no FAB
        fabContainer.innerHTML = '';
    }
}

function closeDetailPane() {
    const detailPane = document.getElementById('detail-pane');
    if (detailPane) {
        detailPane.innerHTML = `
            <div class="detail-pane-body">
                ${_getEmptyStateHTML({
                    icon: 'inbox_customize',
                    title: 'Pilih Item untuk Dilihat',
                    desc: 'Rincian item yang Anda pilih dari daftar di sebelah kiri akan muncul di sini.'
                })}
            </div>
        `;
    }
    document.body.classList.remove('detail-pane-open');
    appState.detailPaneHistory = []; // <-- TAMBAHKAN BARIS INI
    // After closing, restore page-level FAB
    _restorePageFab();
}

function handleDetailPaneBack() {
    history.back();
}
function initResizer() {
    const resizer = document.getElementById('resizer');
    if (!resizer) return;
    
    const handleMouseMove = (e) => {
        let newWidth = e.clientX - 250; // 250 adalah lebar sidebar
        if (newWidth < 400) newWidth = 400; // Lebar minimum
        if (newWidth > window.innerWidth * 0.6) newWidth = window.innerWidth * 0.6; // Lebar maksimum
        document.documentElement.style.setProperty('--list-pane-width', `${newWidth}px`);
    };

    const handleMouseUp = () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.classList.remove('is-resizing');
    };

    resizer.addEventListener('mousedown', (e) => {
        e.preventDefault();
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        document.body.classList.add('is-resizing');
    });
}

async function handleOpenBillDetail(billId, expenseId) {
    // Langkah 1: Buka panel dengan skeleton loader. Ini adalah satu-satunya panggilan ke showDetailPane.
    showDetailPane({
        title: 'Memuat Detail Tagihan...',
        content: _getSkeletonLoaderHTML('laporan'),
        footer: '',
        headerActions: ''
    });

    try {
        let bill = null;
        if (billId) {
            bill = appState.bills.find(b => b.id === billId) || await localDB.bills.get(billId);
        }

        if (!bill && expenseId) {
            bill = appState.bills.find(b => b.expenseId === expenseId) || await localDB.bills.where({ expenseId: expenseId }).first();
            if (bill) billId = bill.id;
        }

        let targetExpenseId = expenseId || bill?.expenseId;
        let expenseData = null;
        if (targetExpenseId && (!bill || bill.type !== 'gaji')) {
            expenseData = appState.expenses.find(e => e.id === targetExpenseId) || await localDB.expenses.get(targetExpenseId);
        }

        if (!bill && !expenseData) {
            throw new Error('Data detail tidak dapat ditemukan di database lokal.');
        }
        if (bill && bill.type !== 'gaji' && !expenseData) {
            throw new Error('Data pengeluaran terkait untuk tagihan ini tidak ditemukan.');
        }

        let payments = [];
        if (bill && billId) {
             if (navigator.onLine) {
                const paymentsSnap = await getDocs(query(collection(db, 'teams', TEAM_ID, 'bills', billId, 'payments'), orderBy("date", "desc")));
                payments.push(...paymentsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
            }
            const queued = await localDB.pending_payments.where('billId').equals(billId).toArray();
            payments.push(...queued.map(p => ({ ...p, isOfflineQueued: true })));
        }

        let content, title;
        if (bill && bill.type === 'gaji') {
            content = _createSalaryBillDetailContentHTML(bill, payments);
            title = `Detail Tagihan Gaji`;
        } else {
            content = await _createBillDetailContentHTML(bill, expenseData, payments);
            title = `Detail: ${expenseData?.description || bill?.description}`;
        }
        
        // [PERBAIKAN KUNCI] Alih-alih memanggil showDetailPane lagi, kita update panel yang sudah terbuka.
        const detailPane = document.getElementById('detail-pane');
        if (detailPane) {
            const titleEl = detailPane.querySelector('h4, .breadcrumb-nav strong');
            const bodyContainer = detailPane.querySelector('.detail-pane-body, .mobile-detail-content');
            if(titleEl) titleEl.textContent = title;
            if(bodyContainer) bodyContainer.innerHTML = content;
        }

        const parentId = expenseData ? expenseData.id : (bill ? bill.id : null);
        const parentType = expenseData ? 'expense' : 'bill';
        
        // Tetap tambahkan FAB Komentar
        try {
            const overlay = document.querySelector('.detail-pane') || document.querySelector('.modal-bg');
            if (overlay && parentId) {
                let fab = overlay.querySelector('.fab[data-action="open-comments-view"]');
                if (!fab) {
                    fab = document.createElement('button');
                    fab.className = 'fab fab-pop-in';
                    fab.title = 'Komentar';
                    fab.setAttribute('data-action', 'open-comments-view');
                    overlay.appendChild(fab);
                }
                fab.dataset.parentId = parentId;
                fab.dataset.parentType = parentType;
                fab.innerHTML = '<span class="material-symbols-outlined">forum</span>';
            }
        } catch(_) {}
        
    } catch (error) {
        console.error("Gagal memuat detail tagihan:", error);
        toast('error', error.message);
        const detailPane = document.getElementById('detail-pane');
        const bodyContainer = detailPane.querySelector('.detail-pane-body, .mobile-detail-content');
        if(bodyContainer) {
            bodyContainer.innerHTML = _getEmptyStateHTML({ icon: 'error', title: 'Gagal Memuat', desc: error.message });
        }
    }
}
async function handleViewAttachmentModal(dataset) {
    const { expenseId } = dataset;
    if (!expenseId) return;

    const expense = appState.expenses.find(e => e.id === expenseId) || await localDB.expenses.get(expenseId);
    if (!expense) {
        toast('error', 'Data pengeluaran tidak ditemukan.');
        return;
    }
    
    let localPreviewUrl = null;
    if (expense.localAttachmentId && !expense.attachmentUrl) {
        try {
            const fileRecord = await localDB.files.get(expense.localAttachmentId);
            if (fileRecord && fileRecord.file) {
                localPreviewUrl = URL.createObjectURL(fileRecord.file);
            }
        } catch (e) { console.warn("Gagal membuat URL preview lampiran lokal:", e); }
    }

    const content = _createAttachmentManagerHTML(expense, localPreviewUrl, 'detail');

    if (!content) {
        toast('info', 'Tidak ada lampiran untuk ditampilkan.');
        return;
    }

    createModal('dataDetail', {
        title: 'Detail Lampiran',
        content: content,
        footer: '<button class="btn btn-secondary" data-close-modal>Tutup</button>'
    });
}
async function handleViewInvoiceItems(target) {
    const { id } = target.dataset;
    let expense = appState.expenses.find(e => e.id === id);
    if (!expense || !expense.items) {
        try { expense = await localDB.expenses.get(id); } catch { expense = null; }
    }
    if (expense && expense.items && expense.items.length > 0) {
        createModal('invoiceItemsDetail', {
            items: expense.items,
            totalAmount: expense.amount
        });
    } else {
        toast('error', 'Rincian item untuk faktur ini tidak ditemukan.');
    }
}

function _createAttachmentManagerHTML(expenseData, localPreviewUrl = null, context = 'detail') {
    if (!expenseData) return '';
    const isEditMode = context === 'edit';

    const createItemHTML = (url, field, title) => {
        if (!url && !localPreviewUrl && !isEditMode) {
            return '';
        }

        if (expenseData.attachmentStatus === 'uploading' && field === 'attachmentUrl') {
            return `
            <div class="attachment-manager-item placeholder">
                <div class="placeholder-icon"><div class="spinner"></div></div>
                <strong>${title}</strong>
                <span>Sedang mengunggah...</span>
            </div>`;
        }
        
        if (localPreviewUrl && expenseData.localAttachmentId && (field === 'attachmentUrl' || (expenseData.type === 'material' && field === 'invoiceUrl'))) {
             return `
            <div class="attachment-manager-item">
                <img src="${localPreviewUrl}" alt="${title} (Lokal)" class="attachment-preview-thumb is-local-preview" data-action="view-attachment" data-src="${localPreviewUrl}">
                <strong>${title}</strong>
                <div class="attachment-manager-overlay">
                    <span class="material-symbols-outlined">cloud_upload</span>
                    <span>Menunggu diunggah</span>
                </div>
            </div>`;
        }

        const hasFile = url && url.startsWith('http');

        if (hasFile) {
            return `
            <div class="attachment-manager-item">
                <img src="${url}" alt="${title}" class="attachment-preview-thumb" data-action="view-attachment" data-src="${url}">
                <strong>${title}</strong>
                <div class="attachment-manager-actions">
                    ${isEditMode && !isViewer() ? `
                        <button type="button" class="btn btn-sm btn-secondary" data-action="upload-attachment" data-id="${expenseData.id}" data-field="${field}">Ganti</button>
                        <button type="button" class="btn-icon btn-icon-danger" data-action="delete-attachment" data-id="${expenseData.id}" data-field="${field}" title="Hapus"><span class="material-symbols-outlined">delete</span></button>
                    ` : `
                        <button type="button" class="btn btn-sm btn-secondary" data-action="view-attachment" data-src="${url}">Lihat</button>
                        <button type="button" class="btn-icon" data-action="download-attachment" data-url="${url}" data-filename="${title.replace(/\s+/g,'_')}.jpg" title="Unduh"><span class="material-symbols-outlined">download</span></button>
                    `}
                </div>
            </div>`;
        } else if (isEditMode && !isViewer()) {
            return `
            <div class="attachment-manager-item placeholder">
                <div class="placeholder-icon"><span class="material-symbols-outlined">add_photo_alternate</span></div>
                <strong>${title}</strong>
                <span>Belum ada file</span>
                <button type="button" class="btn btn-sm btn-primary" data-action="upload-attachment" data-id="${expenseData.id}" data-field="${field}">Upload</button>
            </div>`;
        }
        return '';
    };

    let managerHTML = '';
    managerHTML += createItemHTML(expenseData.attachmentUrl, 'attachmentUrl', 'Lampiran Utama');
    managerHTML += createItemHTML(expenseData.invoiceUrl, 'invoiceUrl', 'Bukti Faktur');
    managerHTML += createItemHTML(expenseData.deliveryOrderUrl, 'deliveryOrderUrl', 'Surat Jalan');

    if (managerHTML) {
        return `
            <h5 class="detail-section-title">Lampiran</h5>
            <div class="attachment-manager-container">${managerHTML}</div>`;
    }

    return ''; // Kembalikan string kosong jika tidak ada lampiran sama sekali
}

function _createSalaryBillDetailContentHTML(bill, payments) {
    // --- 1. Data Preparation (Sama seperti di Bill Detail) ---
    const totalAmount = bill.amount || 0;
    const paidAmount = bill.paidAmount || 0;
    const remainingAmount = totalAmount - paidAmount;
    const percentPaid = totalAmount > 0 ? Math.min(100, Math.max(0, Math.round((paidAmount / totalAmount) * 100))) : 0;
    const percentUnpaid = 100 - percentPaid;
    const now = new Date();
    const dueDt = bill?.dueDate ? _getJSDate(bill.dueDate) : null;

    // --- 2. Main Status Badge Logic (Sama seperti di Bill Detail) ---
    let statusLabel = 'Belum Lunas';
    let statusClass = 'warn';
    if (bill?.status === 'paid') {
        statusLabel = 'Lunas';
        statusClass = 'positive';
    } else if (dueDt && dueDt < now) {
        statusLabel = 'Terlambat';
        statusClass = 'negative';
    }
    const statusBadgeHTML = `<span class="status-badge ${statusClass}">${statusLabel}</span>`;

    // --- 3. [DESAIN BARU] Summary Card yang Konsisten ---
    const mainPaymentSection = `
        <div id="detail-pembayaran-utama">
            <div class="card card-pad">
                <div class="detail-summary-grid">
                    <div class="summary-item">
                        <span class="label">Total Gaji</span>
                        <div class="total-with-percent">
                            <strong class="value">${fmtIDR(totalAmount)}</strong>
                            ${statusBadgeHTML}
                        </div>
                    </div>
                    <div class="summary-item">
                        <span class="label">Sudah Dibayar</span>
                        <div class="total-with-percent">
                            <strong class="value positive">${fmtIDR(paidAmount)}</strong>
                            <span class="percent-badge">${percentPaid}%</span>
                        </div>
                    </div>
                    <div class="summary-item">
                        <span class="label">Sisa Gaji</span>
                        <div class="total-with-percent">
                            <strong class="value ${remainingAmount > 0 ? 'negative' : ''}">${fmtIDR(remainingAmount)}</strong>
                            <span class="percent-badge">${percentUnpaid}%</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    // --- 4. Riwayat Pembayaran (Tetap Sama) ---
    const paymentHistoryHTML = _createPaymentHistoryHTML(payments, bill.id);

    // --- 5. Rincian Gaji per Pekerja (Tetap Sama) ---
    let detailsHTML = '';
    if (bill.workerDetails && bill.workerDetails.length > 0) {
        const workerListHTML = bill.workerDetails.map(worker => {
            const paidByWorker = (payments || []).filter(p => p.workerId === (worker.id || worker.workerId)).reduce((sum, p) => sum + (p.amount || 0), 0);
            const totalForWorker = worker.amount || 0;
            const remainingForWorker = Math.max(0, totalForWorker - paidByWorker);
            
            let actionButtons = `
                <button class="btn-icon" data-action="cetak-kwitansi-individu" data-bill-id="${bill.id}" data-worker-id="${worker.id || worker.workerId}" title="Cetak Kwitansi ${worker.name}">
                    <span class="material-symbols-outlined">print</span>
                </button>
            `;
            if (!isViewer() && bill.status !== 'paid') {
                 actionButtons += `
                    <button class="btn-icon" data-action="pay-individual-salary" data-bill-id="${bill.id}" data-worker-id="${worker.id || worker.workerId}" title="Bayar Gaji ${worker.name}">
                        <span class="material-symbols-outlined">payments</span>
                    </button>
                 `;
            }
             actionButtons += `
                <button class="btn-icon btn-icon-danger" data-action="remove-worker-from-recap" data-bill-id="${bill.id}" data-worker-id="${worker.id || worker.workerId}" title="Keluarkan dari Rekap">
                    <span class="material-symbols-outlined">person_remove</span>
                </button>
            `;

            return `
                <div class="detail-list-item-card">
                    <div class="item-main">
                        <span class="item-title">${worker.name}</span>
                        <span class="item-subtitle">Terbayar: ${fmtIDR(paidByWorker)} / Sisa: ${fmtIDR(remainingForWorker)}</span>
                    </div>
                    <div class="item-secondary">
                        <strong>${fmtIDR(totalForWorker)}</strong>
                        <div class="individual-payment-actions">
                            ${actionButtons}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
        
        const collectiveButton = `
            <div class="rekap-actions" style="margin-top: 1.5rem;">
                 <button class="btn btn-secondary" data-action="cetak-kwitansi-kolektif" data-bill-id="${bill.id}">
                    <span class="material-symbols-outlined">collections_bookmark</span>
                    Cetak Kwitansi Kolektif
                </button>
            </div>
        `;
        
        detailsHTML = `<div class="detail-section">
            <h5 class="detail-section-title">Rincian Gaji per Pekerja</h5>
            ${workerListHTML}
            ${collectiveButton}
        </div>`;
    }

    // --- 6. Gabungkan Semua Bagian ---
    return mainPaymentSection + paymentHistoryHTML + detailsHTML;
}

async function _createBillDetailContentHTML(bill, expenseData, payments) {
    // --- 1. Data Preparation ---
    const remainingAmount = bill ? (bill.amount || 0) - (bill.paidAmount || 0) : 0;
    const project = expenseData ? appState.projects.find(p => p.id === expenseData.projectId) : null;
    const supplier = (expenseData && expenseData.supplierId) ? appState.suppliers.find(s => s.id === expenseData.supplierId) : null;

    const totalAmount = expenseData?.amount || bill?.amount || 0;
    const paidAmount = bill ? (bill.paidAmount || 0) : 0;
    const percentPaid = totalAmount > 0 ? Math.min(100, Math.max(0, Math.round((paidAmount / totalAmount) * 100))) : 0;
    const percentUnpaid = 100 - percentPaid;

    const now = new Date();
    const dueDt = bill?.dueDate ? _getJSDate(bill.dueDate) : null;

    // --- 2. Build Individual HTML Components based on the new design ---

    // a. Main Status Badge Logic
    let statusLabel = 'Belum Lunas';
    let statusClass = 'warn';
    if (bill?.status === 'paid') {
        statusLabel = 'Lunas';
        statusClass = 'positive';
    }
    const statusBadgeHTML = `<span class="status-badge ${statusClass}">${statusLabel}</span>`;


    // b. Redesigned Summary Card with Status Badge inside
    const mainPaymentSection = `
        <div id="detail-pembayaran-utama">
            <div class="card card-pad">
                <div class="detail-summary-grid">
                    <div class="summary-item">
                        <span class="label">Total Pengeluaran</span>
                        <div class="total-with-percent">
                            <strong class="value">${fmtIDR(expenseData.amount)}</strong>
                            ${statusBadgeHTML}
                        </div>
                    </div>
                    <div class="summary-item">
                        <span class="label">Sudah Dibayar</span>
                        <div class="total-with-percent">
                            <strong class="value positive">${fmtIDR(paidAmount)}</strong>
                            <span class="percent-badge">${percentPaid}%</span>
                        </div>
                    </div>
                    <div class="summary-item">
                        <span class="label">Sisa Tagihan</span>
                        <div class="total-with-percent">
                            <strong class="value ${remainingAmount > 0 ? 'negative' : ''}">${fmtIDR(remainingAmount)}</strong>
                            <span class="percent-badge">${percentUnpaid}%</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    // c. Payment History Summary
    const paymentHistoryHTML = _createPaymentHistoryHTML(payments, bill.id);

    // d. Detail Transaksi section with Due Date and new Category badge
    const createdDt = bill?.createdAt ? _getJSDate(bill.createdAt) : (expenseData?.createdAt ? _getJSDate(expenseData.createdAt) : null);
    const createdOn = createdDt ? `${createdDt.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })} ${createdDt.toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit', second:'2-digit' })}` : '-';
    const createdByName = expenseData?.createdByName || bill?.createdByName;
    const createdByUID = expenseData?.createdBy || bill?.createdBy;
    let createdByHTML = '-';
    if (createdByName) {
        createdByHTML = `<span class="badge" style="font-size:.8rem; padding:.25rem .6rem;">${createdByName}</span>`;
    }
    const dueDateText = (() => {
        if (!dueDt) return '-';
        const dueStr = dueDt.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
        const dayDiff = Math.ceil((dueDt - now) / (1000 * 60 * 60 * 24));
        
        // Kelas CSS baru untuk teks detail yang lebih kecil
        const smallerTextClass = "due-date-detail-text";

        if (bill?.status === 'paid') return dueStr;
        if (dayDiff < 0) return `${dueStr} <span class="${smallerTextClass} negative">(Lewat ${Math.abs(dayDiff)} hari)</span>`;
        if (dayDiff === 0) return `${dueStr} <span class="${smallerTextClass} warn">(Hari Ini)</span>`;
        if (dayDiff > 0 && dayDiff <= 7) return `${dueStr} <span class="${smallerTextClass} warn">(dalam ${dayDiff} hari)</span>`;
        if (dayDiff > 7) return `${dueStr} <span class="${smallerTextClass}">(dalam ${dayDiff} hari)</span>`;
        return dueStr;
    })();

    const typeName = (expenseData?.type || bill?.type || '').toLowerCase();
    const categoryBadgeHTML = typeName ? `<span class="badge ${typeName}">${typeName.charAt(0).toUpperCase() + typeName.slice(1)}</span>` : '-';

    const metaDetailsHTML = `
        <div class="detail-section">
            <h5 class="detail-section-title">Detail Transaksi</h5>
            <dl class="detail-list">
                ${project ? `<div><dt>Proyek</dt><dd>${project.projectName}</dd></div>` : ''}
                ${supplier ? `<div><dt>Supplier</dt><dd>${supplier.supplierName}</dd></div>` : ''}
                ${typeName ? `<div><dt>Kategori</dt><dd>${categoryBadgeHTML}</dd></div>` : ''}
                ${dueDt ? `<div><dt>Jatuh Tempo</dt><dd class="due-date-dd">${dueDateText}</dd></div>` : ''}
                <div><dt>Dibuat Pada</dt><dd>${createdOn}</dd></div>
                <div><dt>Dibuat Oleh</dt><dd>${createdByHTML}</dd></div>
            </dl>
        </div>
    `;
    return mainPaymentSection + paymentHistoryHTML + metaDetailsHTML;
}

function _createCommentsSectionHTML(parentId, parentType) {
    try {
        const items = (appState.comments || [])
            .filter(c => c.parentId === parentId && c.parentType === parentType && !c.isDeleted)
            .sort((a, b) => _getJSDate(a.createdAt) - _getJSDate(a.createdAt));

        let lastUserId = null; // Lacak user ID terakhir untuk pesan berurutan
        const listHTML = items.length > 0 ? items.map(c => {
            const isCurrentUser = appState.currentUser && appState.currentUser.uid === c.userId;
            const when = _getJSDate(c.createdAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
            const canDelete = !!appState.currentUser && (isCurrentUser || appState.userRole === 'Owner');
            const safeText = String(c.content || '').replace(/</g, '&lt;');
            const initials = (c.userName || 'U').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

            // Cek apakah pesan ini dari user yang sama dengan pesan sebelumnya
            const isConsecutive = lastUserId === c.userId;
            lastUserId = c.userId; // Update user ID terakhir

            // Tampilkan avatar dan nama hanya jika ini pesan pertama dari user dalam satu urutan
            const showAvatar = !isCurrentUser && !isConsecutive;
            const showUser = !isCurrentUser && !isConsecutive;

            return `
                <div class="comment-item ${isCurrentUser ? 'is-current-user' : ''}" data-id="${c.id}" data-user-id="${c.userId}">
                    ${showAvatar ? `<div class="comment-avatar">${initials}</div>` : ''}
                    <div class="comment-bubble">
                        <div class="comment-meta">
                            ${showUser ? `<span class="comment-user">${c.userName || 'Pengguna'}</span>` : '<span></span>'}
                            ${canDelete ? `<button class="btn-icon btn-icon-danger comment-delete" data-action="delete-comment" data-id="${c.id}" title="Hapus"><span class="material-symbols-outlined">delete</span></button>` : ''}
                        </div>
                        <div class="comment-text">${safeText}</div>
                        <div class="comment-date">${when}</div>
                    </div>
                </div>
            `;
        }).join('') : _getEmptyStateHTML({ icon: 'forum', title: 'Belum Ada Komentar', desc: 'Jadilah yang pertama memulai diskusi.', size: 'small'});

        const disabled = (appState.userRole === 'Viewer') || !appState.currentUser || appState.userStatus !== 'active';
        
        // [PERUBAHAN STRUKTUR INPUT DI SINI]
        const emojiList = ['😀','😁','😂','🤣','😊','😍','😎','🤔','🙌','👍','🔥','🎉','✨','💯','❤️','🥳','🚀','🎯','💡','😅'];
        const emojiButtons = emojiList.map(ch => `<button type="button" class="emoji-btn" data-action="insert-emoji" data-char="${ch}">${ch}</button>`).join('');
        return `
            <div class="comments-section" data-parent-id="${parentId}" data-parent-type="${parentType}">
                <h5 class="detail-section-title">Komentar</h5>
                <div class="comments-list">${listHTML}</div>
                <div class="comment-input-row" style="margin-top: 1.5rem;">
                    <div class="comment-input-capsule">
                        <button class="btn-icon" data-action="toggle-emoji-picker" title="Emoji" ${disabled ? 'disabled' : ''}><span class="material-symbols-outlined">mood</span></button>
                        <textarea rows="1" placeholder="Tulis komentar..." ${disabled ? 'disabled' : ''}
                          oninput="this.style.height='auto';this.style.height=this.scrollHeight+'px'; const btn=this.closest('.comment-input-row').querySelector('.comment-submit'); if(btn) btn.disabled=(this.value.trim().length===0);"
                          onkeydown="if(event.key==='Enter' && !event.shiftKey){ event.preventDefault(); const btn=this.closest('.comment-input-row').querySelector('.comment-submit'); if(btn && !btn.disabled) btn.click(); }"></textarea>
                        <button class="btn-icon" data-action="attach-file" title="Lampirkan File" ${disabled ? 'disabled' : ''}><span class="material-symbols-outlined">attach_file</span></button>
                    </div>
                    <button class="comment-submit" data-action="post-comment" aria-label="Kirim" data-parent-id="${parentId}" data-parent-type="${parentType}" ${disabled ? 'disabled' : ''} disabled>
                        <span class="material-symbols-outlined">send</span>
                    </button>
                    <div class="emoji-picker">${emojiButtons}</div>
                </div>
            </div>`;
    } catch (e) {
        console.warn('Render komentar gagal', e);
        return '';
    }
}

// GANTI SELURUH FUNGSI LAMA DENGAN VERSI INI
async function handlePostComment(dataset, attachmentData = null) {
    try {
        const { parentId, parentType } = dataset;
        const composerWrapper = document.querySelector('.composer-wrapper');
        const ta = composerWrapper ? composerWrapper.querySelector('textarea') : null;
        
        if (!ta || !parentId || !parentType) return;

        const content = ta.value.trim();
        if (!content && !attachmentData) { 
            toast('error', 'Komentar tidak boleh kosong.'); 
            return; 
        }
        if (!appState.currentUser) { 
            toast('error', 'Anda harus masuk untuk berkomentar.'); 
            return; 
        }

        // Nonaktifkan tombol kirim sementara
        const sendButton = composerWrapper.querySelector('.btn.send');
        if (sendButton) sendButton.disabled = true;

        // Siapkan data komentar lokal
        const item = {
            id: generateUUID(),
            parentId,
            parentType,
            content,
            userId: appState.currentUser.uid,
            userName: appState.currentUser.displayName || 'Pengguna',
            createdAt: new Date(),
            syncState: 'pending_create', // Penting untuk menampilkan ikon "mengirim"
            isDeleted: 0
        };

        if (attachmentData) {
            item.attachments = attachmentData;
        }

        // Simpan ke database lokal dan state
        await localDB.comments.add(item);
        appState.comments.push(item);
        
        // Reset input form
        ta.value = '';
        ta.style.height = 'auto';
        ta.dispatchEvent(new Event('input', { bubbles: true }));

        const previewDock = document.getElementById('attachment-preview-dock');
        if (previewDock) {
            previewDock.hidden = true;
            previewDock.innerHTML = '';
        }
        
        // [PERBAIKAN KUNCI] Panggil upsertCommentInUI untuk menampilkan bubble chat secara instan
        upsertCommentInUI(item, 'added'); 
        
        // Kirim ke server di latar belakang
        syncToServer({ silent: true });

    } catch (e) {
        console.error('Gagal menambah komentar', e);
        toast('error', 'Gagal menambah komentar.');
        // Jika gagal, aktifkan kembali tombol kirim
        const sendButton = document.querySelector('.composer .btn.send');
        if (sendButton) sendButton.disabled = false;
    }
}

async function handleDeleteComment(dataset) {
    try {
        const { id } = dataset;
        if (!id) return;
        const c = (appState.comments || []).find(x => x.id === id);
        await localDB.comments.where('id').equals(id).modify({ isDeleted: 1, needsSync: 1 });
        appState.comments = (appState.comments || []).filter(x => x.id !== id);
        const commentsListOpen = document.getElementById('comments-list-container');
        if (commentsListOpen) {
            try {
                const { content, footer } = _renderCommentsView(c.parentId, c.parentType);
                const container = document.querySelector('.detail-pane-body, .mobile-detail-content');
                const footerContainer = document.querySelector('.detail-pane-footer, .modal-footer');
                if (container) container.innerHTML = content;
                if (footerContainer) footerContainer.innerHTML = footer;
            } catch (_) {}
        } else {
            if (c?.parentType === 'expense') handleOpenBillDetail(null, c.parentId);
            else if (c?.parentType === 'bill') handleOpenBillDetail(c.parentId, null);
        }
        syncToServer({ silent: true });
    } catch (e) {
        console.error('Gagal menghapus komentar', e);
        toast('error', 'Gagal menghapus komentar.');
    }
  }
  
  function _injectExpenseThumbnails(expenses) {
    try {
        const mapById = new Map(expenses.map(e => [e.id, e]));
        $$('.card.card-list-item[data-type="expense"]').forEach(card => {
            const id = card.getAttribute('data-id');
            const item = mapById.get(id);
            if (!item || item.type !== 'material') return;
            const url = item.invoiceUrl || item.deliveryOrderUrl;
            const content = $('.card-list-item-content', card);
            const details = $('.card-list-item-details', card);
            const amount = $('.card-list-item-amount-wrapper', card);
            if (!content || !details || !amount) return;
            if ($('.card-left', content)) return;
            const left = document.createElement('div');
            left.className = 'card-left';
            if (url) {
                const img = document.createElement('img');
                img.className = 'expense-thumb';
                img.alt = 'Lampiran';
                img.src = url;
                left.appendChild(img);
            }
            left.appendChild(details);
            content.insertBefore(left, amount);
        });
    } catch (err) {
        console.warn('Failed to inject thumbnails', err);
    }
  }

  async function _prefetchExpenseThumbnails(expenses) {
    try {
        const urls = Array.from(new Set(expenses.flatMap(e => [e.invoiceUrl, e.deliveryOrderUrl].filter(Boolean))));
        if (urls.length === 0) return;
        await Promise.all(urls.map(u => fetch(u, {
            mode: 'no-cors',
            cache: 'force-cache'
        }).catch(() => {})));
    } catch (_) {}
  }

// GANTI SELURUH FUNGSI INI
async function handleDeleteAttachment(dataset) {
    const { id, field } = dataset;
  
    createModal('confirmDeleteAttachment', {
        onConfirm: async () => {
            toast('syncing', 'Menghapus lampiran...');
            try {
                // Hapus URL dari Firestore
                await optimisticUpdateDoc(expensesCol, id, {
                    [field]: ''
                });

                // [PERBAIKAN KUNCI] Update state lokal secara manual
                // 1. Update di appState (memori)
                const expenseIndex = appState.expenses.findIndex(e => e.id === id);
                if (expenseIndex > -1) {
                    appState.expenses[expenseIndex][field] = '';
                }
                // 2. Update di localDB (penyimpanan perangkat)
                await localDB.expenses.update(id, { [field]: '' });

                _logActivity(`Menghapus Lampiran`, {
                    expenseId: id,
                    field
                });
  
                toast('success', 'Lampiran berhasil dihapus.');

                // Tutup modal konfirmasi
                const confirmModal = document.getElementById('confirmDeleteAttachment-modal');
                if (confirmModal) closeModal(confirmModal);
                
                // Refresh tampilan detail dengan data yang sudah diperbarui
                handleOpenBillDetail(null, id);

            } catch (error) {
                toast('error', 'Gagal menghapus lampiran.');
                console.error("Attachment deletion error:", error);
            }
        }
    });
}
async function handleUploadAttachment(dataset) {
    const { id, field } = dataset;
    const isDesktop = window.matchMedia('(min-width: 600px)').matches;

    // Fungsi untuk memproses file setelah dipilih
    const processFileSelection = (file) => {
        if (file) {
            _processAndUploadFile(file, id, field);
        }
        // Hapus input sementara setelah digunakan
        document.getElementById('modalUploadCamera')?.remove();
        document.getElementById('modalUploadGallery')?.remove();
    };

    if (isDesktop) {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.style.display = 'none';
        input.onchange = (e) => processFileSelection(e.target.files[0]);
        document.body.appendChild(input);
        input.click();
        document.body.removeChild(input);
    } else {
        // [PERBAIKAN] Hapus input lama jika ada untuk mencegah duplikasi
        document.getElementById('modalUploadCamera')?.remove();
        document.getElementById('modalUploadGallery')?.remove();

        // Buat input tersembunyi untuk kamera
        const inputCamera = document.createElement('input');
        inputCamera.type = 'file';
        inputCamera.id = 'modalUploadCamera';
        inputCamera.name = 'modalUploadCamera'; // Penting untuk selector
        inputCamera.accept = 'image/*';
        inputCamera.capture = 'environment';
        inputCamera.style.display = 'none';
        inputCamera.onchange = (e) => processFileSelection(e.target.files[0]);
        document.body.appendChild(inputCamera);

        // Buat input tersembunyi untuk galeri
        const inputGallery = document.createElement('input');
        inputGallery.type = 'file';
        inputGallery.id = 'modalUploadGallery';
        inputGallery.name = 'modalUploadGallery'; // Penting untuk selector
        inputGallery.accept = 'image/*';
        inputGallery.style.display = 'none';
        inputGallery.onchange = (e) => processFileSelection(e.target.files[0]);
        document.body.appendChild(inputGallery);

        // Sekarang tampilkan modal dengan tombol-tombolnya
        const content = `
            <div class="upload-buttons modal-upload-buttons" style="flex-direction: column; gap: 0.75rem;">
                <button type="button" class="btn btn-secondary" data-action="trigger-file-input" data-target="modalUploadCamera">
                    <span class="material-symbols-outlined">photo_camera</span> Buka Kamera
                </button>
                <button type="button" class="btn btn-secondary" data-action="trigger-file-input" data-target="modalUploadGallery">
                    <span class="material-symbols-outlined">image</span> Pilih dari Galeri
                </button>
            </div>
        `;
        
        createModal('uploadSource', {
            title: 'Pilih Sumber Gambar',
            content: content
        });
    }
}
async function _processAndUploadFile(file, expenseId, field) {
    if (!file || !expenseId || !field) return;

    const downloadURL = await _uploadFileToCloudinary(file);

    if (downloadURL) {
        try {
            await optimisticUpdateDoc(expensesCol, expenseId, {
                [field]: downloadURL
            });

            const expenseIndex = appState.expenses.findIndex(e => e.id === expenseId);
            if (expenseIndex > -1) {
                appState.expenses[expenseIndex][field] = downloadURL;
            }
            await localDB.expenses.update(expenseId, { [field]: downloadURL });

            toast('success', 'Lampiran berhasil diperbarui!');

            handleEditItem(expenseId, 'expense'); 

            const uploadModal = document.getElementById('uploadSource-modal');
            if(uploadModal) {
                closeModal(uploadModal);
            }

        } catch (error) {
            toast('error', 'Gagal menyimpan lampiran.');
            console.error("Attachment update error:", error);
        }
    }
}

function handlePayBillModal(billId) {
    const bill = appState.bills.find(i => i.id === billId);
    if (!bill) {
        toast('error', 'Data tagihan tidak ditemukan.');
        return;
    }

    const remainingAmount = (bill.amount || 0) - (bill.paidAmount || 0);
    const amountFormatted = new Intl.NumberFormat('id-ID').format(remainingAmount);
    const todayString = new Date().toISOString().slice(0, 10);

    const content = `
        <div class="payment-modal-header">
            <span class="label">Sisa Tagihan</span>
            <strong class="payment-main-amount" id="payment-remaining-amount" data-raw-amount="${remainingAmount}">
                ${fmtIDR(remainingAmount)}
            </strong>
        </div>

        <div class="quick-pay-actions">
            <button type="button" class="btn btn-secondary" data-action="set-payment-full">Bayar Lunas</button>
            <button type="button" class="btn btn-secondary" data-action="set-payment-half">Bayar Setengah</button>
        </div>

        <form id="payment-form" data-id="${billId}" data-type="bill">
            <div class="payment-form-body">
                <div class="form-group">
                    <label>Jumlah Pembayaran</label>
                    <input type="text" name="amount" id="payment-input-amount" inputmode="numeric" required value="${amountFormatted}">
                </div>
                <div class="form-group">
                    <label>Tanggal Pembayaran</label>
                    <input type="date" name="date" value="${todayString}" required>
                </div>
                <div class="form-group">
                    <label>Lampiran (Opsional)</label>
                    <input type="file" name="paymentAttachment" accept="image/*" class="hidden-file-input" data-target-display="payment-attachment-display">
                    <div class="upload-buttons">
                        <button type="button" class="btn btn-secondary" data-action="trigger-file-input" data-target="paymentAttachment"><span class="material-symbols-outlined">attach_file</span> Pilih File</button>
                    </div>
                    <div class="file-name-display" id="payment-attachment-display">Belum ada file dipilih</div>
                </div>
            </div>
            <div class="form-footer-actions">
                <button type="submit" class="btn btn-primary" form="payment-form">
                    <span class="material-symbols-outlined">payment</span> Konfirmasi Pembayaran
                </button>
            </div>
        </form>
    `;

    const footer = `
        <button type="button" class="btn btn-secondary" data-close-modal>Batal</button>
    `;
    
    createModal('payment', {
        title: `Bayar: ${bill.description}`,
        content: content,
        footer: footer,
        paymentType: 'bill'
    });
}

async function _showBillsFilterModal(onApply) {
    const allBillsEver = await localDB.bills.toArray();
    const allExpenses = await localDB.expenses.where('isDeleted').notEqual(1).toArray();
    const allSuppliers = await localDB.suppliers.toArray();

    const expenseMap = new Map(allExpenses.map(e => [e.id, e]));
    
    const relevantSupplierIds = new Set();
    allBillsEver.forEach(bill => {
        const expense = expenseMap.get(bill.expenseId);
        if (expense && expense.supplierId) {
            relevantSupplierIds.add(expense.supplierId);
        }
    });

    const projectOptions = [{ value: 'all', text: 'Semua Proyek' }, ...appState.projects.map(p => ({ value: p.id, text: p.projectName }))];
    
    const supplierOptions = [{ value: 'all', text: 'Semua Supplier' }, 
        ...allSuppliers
            .filter(s => relevantSupplierIds.has(s.id))
            .map(s => ({ value: s.id, text: s.supplierName }))
    ];

    const content = `
        <form id="bills-filter-form">
            ${createMasterDataSelect('filter-project-id', 'Filter Berdasarkan Proyek', projectOptions, appState.billsFilter.projectId)}
            ${createMasterDataSelect('filter-supplier-id', 'Filter Berdasarkan Supplier', supplierOptions, appState.billsFilter.supplierId)}
            <div class="filter-modal-footer">
                <button type="button" id="reset-filter-btn" class="btn btn-secondary">Reset</button>
                <button type="submit" class="btn btn-primary">Terapkan</button>
            </div>
        </form>
    `;
    
    // KUNCI PERBAIKAN: Tangkap elemen panel yang dikembalikan oleh createModal
    const modalEl = createModal('dataDetail', { title: 'Filter Tagihan', content });
    if (!modalEl) return; // Guard clause untuk keamanan

    // Panggil _initCustomSelects dengan konteks yang benar
    _initCustomSelects(modalEl);

    // Gunakan modalEl untuk mencari elemen di dalamnya
    $('#bills-filter-form', modalEl).addEventListener('submit', (e) => {
        e.preventDefault();
        appState.billsFilter.projectId = $('#filter-project-id', modalEl).value;
        appState.billsFilter.supplierId = $('#filter-supplier-id', modalEl).value;
        onApply();
        handleDetailPaneBack(); // Gunakan fungsi yang benar untuk menutup panel
    });

    $('#reset-filter-btn', modalEl).addEventListener('click', () => {
        appState.billsFilter.projectId = 'all';
        appState.billsFilter.supplierId = 'all';
        onApply();
        handleDetailPaneBack(); // Gunakan fungsi yang benar untuk menutup panel
    });
}
function _showBillsSortModal(onApply) {
    const { sortBy, sortDirection } = appState.billsFilter;
    const content = `
        <form id="bills-sort-form">
            <div class="sort-options">
                <div class="sort-option">
                    <input type="radio" id="sort-due-date" name="sortBy" value="dueDate" ${sortBy === 'dueDate'?'checked' : ''}>
                    <label for="sort-due-date">Tanggal Dicatat</label>
                </div>
                <div class="sort-option">
                    <input type="radio" id="sort-amount" name="sortBy" value="amount" ${sortBy === 'amount'?'checked' : ''}>
                    <label for="sort-amount">Jumlah Tagihan</label>
                </div>
            </div>
            <div class="form-group" style="margin-top: 1rem;">
                <label>Arah Pengurutan</label>
                <div class="sort-direction">
                    <button type="button" data-dir="desc" class="${sortDirection === 'desc'?'active' : ''}">Terbaru/Tertinggi</button>
                    <button type="button" data-dir="asc" class="${sortDirection === 'asc'?'active' : ''}">Terlama/Terendah</button>
                </div>
            </div>
            <div class="filter-modal-footer" style="grid-template-columns: 1fr;">
                 <button type="submit" class="btn btn-primary">Terapkan</button>
            </div>
        </form>
    `;
  
    // KUNCI PERBAIKAN: Tangkap elemen panel yang dikembalikan
    const modalEl = createModal('dataDetail', {
        title: 'Urutkan Tagihan',
        content
    });
    if (!modalEl) return; // Guard clause

    // Gunakan modalEl untuk mencari form di dalamnya
    const form = $('#bills-sort-form', modalEl);
    if (!form) return; // Guard clause

    form.querySelectorAll('.sort-direction button').forEach(btn => {
        btn.addEventListener('click', () => {
            form.querySelectorAll('.sort-direction button').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });
  
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        appState.billsFilter.sortBy = form.querySelector('input[name="sortBy"]:checked').value;
        appState.billsFilter.sortDirection = form.querySelector('.sort-direction button.active').dataset.dir;
        onApply();
        handleDetailPaneBack(); // Gunakan fungsi yang benar untuk menutup panel
    });
}  
function _getBillsListHTML(items) {
    if (!items || items.length === 0) {
        return '';
    }

    return items.map(item => {
        if (!item) return '';

        // --- Persiapan Data ---
        const expense = appState.expenses.find(e => e.id === item.expenseId);
        const hasAttachment = expense && (expense.attachmentUrl || expense.attachmentNeedsSync === 1);
        const isPending = item.syncState && item.syncState !== 'synced';
        const title = item.description;
        const date = item.dueDate ? _getJSDate(item.dueDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }) : '-';
        const supplierId = item.supplierId || expense?.supplierId;
        const supplier = supplierId ? appState.suppliers.find(s => s.id === supplierId) : null;
        const remainingAmount = (item.amount || 0) - (item.paidAmount || 0);
        const isFullyPaid = remainingAmount <= 0 && item.status !== 'delivery_order';

        // --- Ikon Indikator ---
        const syncIconHTML = isPending ? `<span class="material-symbols-outlined sync-indicator-icon" title="Menunggu sinkronisasi">sync</span>` : '';
        const attachmentIconHTML = hasAttachment ? `<span class="material-symbols-outlined attachment-indicator" title="Ada lampiran">attachment</span>` : '';

        // --- Subtitle / Meta Badges ---
        let bodyContentHTML = '';
        if (supplier) {
            bodyContentHTML += `<span class="meta-badge"><span class="material-symbols-outlined">storefront</span><span>${supplier.supplierName}</span></span>`;
        }
        if (item.type === 'gaji' && item.startDate && item.endDate) {
            const startDateFormatted = _getJSDate(item.startDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
            const endDateFormatted = _getJSDate(item.endDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
            bodyContentHTML += `<span class="meta-badge"><span class="material-symbols-outlined">date_range</span><span>${startDateFormatted} - ${endDateFormatted}</span></span>`;
        }

        // --- Status HTML ---
        let statusHTML = '';
        if (item.status === 'delivery_order') {
            statusHTML = `<span class="status-badge warn">Surat Jalan</span>`;
        } else if (isFullyPaid) {
            statusHTML = `<span class="paid-indicator"><span class="material-symbols-outlined">check_circle</span>Lunas</span>`;
        } else if (item.paidAmount > 0) {
            statusHTML = `<span class="card-list-item-repayment-info">Sisa ${fmtIDR(remainingAmount)}</span>`;
        }
        
        // [PERUBAHAN] Menambahkan elemen untuk checkmark
        return `
        <div class="wa-card-v2-wrapper" data-id="${item.id || item.localId}" data-expense-id="${item.expenseId || ''}">
            <div class="selection-checkmark" data-action="toggle-selection">
                <span class="material-symbols-outlined">check</span>
            </div>
            <div class="wa-card-v2" data-action="item-tap">
                <div class="wa-card-v2__main">
                    <div class="wa-card-v2__header">
                        <div class="wa-card-v2__title">
                            ${syncIconHTML}
                            ${attachmentIconHTML}
                            <span>${title}</span>
                        </div>
                        <div class="wa-card-v2__header-meta">${date}</div>
                    </div>
                    <div class="wa-card-v2__body">
                        ${bodyContentHTML}
                    </div>
                </div>
                <div class="wa-card-v2__meta">
                    <div class="wa-card-v2__amount ${isFullyPaid ? '' : (remainingAmount > 0 ? 'negative' : '')}">
                        ${item.status === 'delivery_order' ? '' : fmtIDR(item.amount)}
                    </div>
                    <div class="wa-card-v2__status">
                        ${statusHTML}
                    </div>
                </div>
                <div class="item-actions">
                    <button class="btn-icon" data-action="open-item-actions-modal" data-id="${item.id}" data-expense-id="${item.expenseId || ''}" data-type="bill" title="Aksi lainnya">
                        <span class="material-symbols-outlined">more_vert</span>
                    </button>
                </div>
            </div>
        </div>`;
    }).join('');
}function _getEditFormFakturMaterialHTML(item) {
    const supplierOptions = appState.suppliers
        .filter(s => s.category === 'Material')
        .map(s => ({
            value: s.id,
            text: s.supplierName
        }));
    const projectOptions = appState.projects.map(p => ({
        value: p.id,
        text: p.projectName
    }));
    const date = _getJSDate(item.date).toISOString().slice(0, 10);
    const itemsHTML = (item.items || []).map((itemRow, index) => {
        const material = appState.materials.find(m => m.id === itemRow.materialId);
        const unit = material?.unit || '';
        const priceNum = itemRow.price || 0;
        const qtyNum = itemRow.qty || 0;
        const totalNum = priceNum * qtyNum;
        return `
        <div class="invoice-item-row" data-index="${index}">
            <div class="autocomplete-wrapper item-name-wrapper">
                <input type="text" name="itemName" placeholder="Ketik nama material..." class="autocomplete-input item-name" value="${itemRow.name || ''}" required autocomplete="off" ${itemRow.materialId?'readonly' : ''}>
                <input type="hidden" name="materialId" class="autocomplete-id" value="${itemRow.materialId || ''}">
                <button type="button" class="autocomplete-clear-btn" style="display: ${itemRow.materialId?'flex' : 'none'};" title="Hapus Pilihan">
                    <span class="material-symbols-outlined">close</span>
                </button>
                <div class="autocomplete-suggestions"></div>
            </div>
            <div class="item-details">
                <input type="text" inputmode="numeric" name="itemPrice" placeholder="Harga" class="item-price" value="${priceNum?fmtIDR(priceNum):''}" required>
                <span>x</span>
                <input type="text" inputmode="decimal" pattern="[0-9]+([\\.,][0-9]+)?" name="itemQty" placeholder="Qty" class="item-qty" value="${qtyNum || ''}" required>
                <span class="item-unit" style="margin-left: 0.25rem;">${unit}</span>
                <button type="button" class="btn-icon add-master-btn" data-action="add-new-material" title="Tambah Master Material"><span class="material-symbols-outlined">add</span></button>
            </div>
            <span class="item-total">${fmtIDR(totalNum)}</span>
            <button type="button" class="btn-icon btn-icon-danger remove-item-btn"><span class="material-symbols-outlined">delete</span></button>
        </div>`;
    }).join('');
    return `
    <form id="edit-item-form" data-id="${item.id}" data-type="expense">
        ${createMasterDataSelect('project-id', 'Proyek', projectOptions, item.projectId)}
        <div class="form-group">
            <label>No. Faktur/Deskripsi</label>
            <input type="text" name="description" value="${item.description}" required>
        </div>
        ${createMasterDataSelect('supplier-id', 'Supplier', supplierOptions, item.supplierId)}
        <div class="form-group">
            <label>Tanggal Faktur</label>
            <input type="date" name="date" value="${date}" required>
        </div>
        <h5 class="invoice-section-title">Rincian Barang</h5>
        <div id="invoice-items-container">${itemsHTML}</div>
        <div class="add-item-action">
            <button type="button" id="add-invoice-item-btn" class="btn-icon" title="Tambah Barang">
                <span class="material-symbols-outlined">add_circle</span>
            </button>
        </div>
        <div class="invoice-total">
            <span>Total Faktur:</span>
            <strong id="invoice-total-amount">${fmtIDR(item.amount)}</strong>
        </div>
        <div class="form-footer-actions">
            <button type="submit" class="btn btn-primary">Simpan Perubahan Faktur</button>
        </div>
    </form>
    `;
  }
  
  async function handleEditSuratJalanModal(expenseId) {
    const expense = appState.expenses.find(e => e.id === expenseId);
    if (!expense) return toast('error', 'Data surat jalan tidak ditemukan.');
  
    const content = _getEditFormFakturMaterialHTML(expense, true); // true = mode edit surat jalan
    const modalEl = createModal('editItem', {
        title: `Input Harga: ${expense.description}`,
        content
    });

    if (modalEl) {
        // Add Save FAB for this edit modal as well
        try {
            const fab = document.createElement('button');
            fab.className = 'fab fab-pop-in';
            fab.title = 'Simpan';
            fab.setAttribute('aria-label', 'Simpan perubahan');
            fab.setAttribute('data-tooltip', 'Simpan');
            fab.innerHTML = '<span class="material-symbols-outlined">save</span>';
            fab.addEventListener('click', () => {
                const form = modalEl.querySelector('#edit-item-form');
                if (form) { form.requestSubmit ? form.requestSubmit() : form.submit(); }
            });
            const modalBg = document.getElementById('editItem-modal') || modalEl.closest('.modal-bg') || modalEl;
            modalBg.appendChild(fab);
        } catch (_) {}
        _initAutocomplete(modalEl);
        // Format harga saat input di modal edit faktur dari surat jalan
        $$('#invoice-items-container input[inputmode="numeric"]', modalEl).forEach(inp => inp.addEventListener('input', _formatNumberInput));
        $('#add-invoice-item-btn', modalEl).addEventListener('click', () => _addInvoiceItemRow(modalEl));
        $('#invoice-items-container', modalEl).addEventListener('input', (e) => _handleInvoiceItemChange(e, modalEl));
        $$('.remove-item-btn', modalEl).forEach(btn => btn.addEventListener('click', (e) => {
            e.target.closest('.invoice-item-row').remove();
            _updateInvoiceTotal(modalEl);
        }));
  
        $('#edit-item-form', modalEl).addEventListener('submit', (e) => {
            e.preventDefault();
            handleUpdateSuratJalan(e.target);
        });
    }
  }
  
  async function handleUpdateSuratJalan(form) {
    const expenseId = form.dataset.id;
    const status = form.querySelector('input[name="status"]').value || 'unpaid';
  
    const items = [];
    $$('.invoice-item-row', form).forEach(row => {
        const materialId = row.querySelector('input[name="materialId"]').value;
        const price = parseFormattedNumber(row.querySelector('input[name="itemPrice"]').value);
        const qty = parseLocaleNumber(row.querySelector('input[name="itemQty"]').value);
        if (materialId && qty > 0 && price > 0) {
            items.push({
                materialId,
                price,
                qty,
                total: price * qty
            });
        }
    });
  
    if (items.length === 0) {
        return toast('error', 'Harap isi harga untuk minimal satu barang.');
    }
  
    const newAmount = items.reduce((sum, item) => sum + item.total, 0);
  
    toast('syncing', 'Menyimpan faktur...');
    try {
        await runTransaction(db, async (transaction) => {
            const expenseRef = doc(expensesCol, expenseId);
            const billRef = doc(billsCol, generateUUID());
            const expenseSnap = await transaction.get(expenseRef);
            const expenseData = expenseSnap.data();
            const curRev = expenseSnap.exists()?(expenseSnap.data().rev || 0) : 0;
            transaction.update(expenseRef, {
              amount: newAmount,
              items: items,
              status: status,
              rev: curRev + 1,
              updatedAt: serverTimestamp()
          });
  
            // 2. Buat dokumen bill baru
            transaction.set(billRef, {
                expenseId: expenseId,
                description: form.elements.description.value,
                amount: newAmount,
                dueDate: new Date(form.elements.date.value),
                status: status,
                type: 'material',
                projectId: form.elements['project-id'].value,
                supplierId: expenseData.supplierId || null,
                createdAt: serverTimestamp(),
                rev: 1,
                paidAmount: status === 'paid'?newAmount : 0,
                ...(status === 'paid' && {
                    paidAt: serverTimestamp()
                })
            });
  
            // 3. Perbarui harga di stock_transactions
            for (const item of items) {
                const q = query(stockTransactionsCol, where("expenseId", "==", expenseId), where("materialId", "==", item.materialId));
                const transSnap = await getDocs(q); // getDocs bisa di dalam transaction
                if (!transSnap.empty) {
                    const transRef = transSnap.docs[0].ref;
                    transaction.update(transRef, {
                        pricePerUnit: item.price
                    });
                }
            }
        });
  
        _logActivity('Menyelesaikan Surat Jalan', {
            docId: expenseId,
            newAmount
        });
        toast('success', 'Faktur berhasil disimpan dan tagihan telah dibuat!');
        try {
            if (!appState._recentlyEditedIds) appState._recentlyEditedIds = new Set();
            appState._recentlyEditedIds.add(expenseId);
        } catch (_) {}
        closeModal($('#editItem-modal'));
        renderTagihanPage();
    } catch (error) {
        toast('error', 'Gagal memperbarui data.');
        console.error("Error updating delivery order:", error);
    }
  }
  async function handleEditDeliveryOrderItemsModal(expenseId) {
    const expense = appState.expenses.find(e => e.id === expenseId);
    if (!expense) return toast('error', 'Data surat jalan tidak ditemukan.');
    const content = _getEditFormSuratJalanItemsHTML(expense);
    const modalEl = createModal('editItem', {
        title: `Edit Item: ${expense.description}`,
        content
    });
    if (modalEl) {
        _initAutocomplete(modalEl);
        $('#add-invoice-item-btn', modalEl).addEventListener('click', () => _addInvoiceItemRow(modalEl));
        $('#invoice-items-container', modalEl).addEventListener('input', (e) => _handleInvoiceItemChange(e, modalEl));
        $$('.remove-item-btn', modalEl).forEach(btn => btn.addEventListener('click', (e) => {
            e.target.closest('.invoice-item-row').remove();
        }));
  
        $('#edit-item-form', modalEl).addEventListener('submit', (e) => {
            e.preventDefault();
            handleUpdateDeliveryOrderItems(e.target);
        });
    }
  }
  
function _getEditFormSuratJalanItemsHTML(item) {
    const itemsHTML = (item.items || []).map((subItem, index) => {
        const material = appState.materials.find(m => m.id === subItem.materialId);
        const materialName = material ? `${material.materialName}` : '';
        return `
            <div class="invoice-item-row" data-index="${index}">
                <div class="autocomplete-wrapper item-name-wrapper">
                    <input type="text" name="itemName" placeholder="Ketik nama material..." class="autocomplete-input item-name" value="${materialName}" required autocomplete="off" ${subItem.materialId ? 'readonly' : ''}>
                    <input type="hidden" name="materialId" class="autocomplete-id" value="${subItem.materialId || ''}">
                    <button type="button" class="autocomplete-clear-btn" style="display: ${subItem.materialId ? 'flex' : 'none'};" title="Hapus Pilihan">
                        <span class="material-symbols-outlined">close</span>
                    </button>
                    <div class="autocomplete-suggestions"></div>
                </div>
                <div class="item-details">
                    <input type="text" inputmode="decimal" pattern="[0-9]+([\\.,][0-9]+)?" name="itemQty" placeholder="Qty" class="item-qty" value="${subItem.qty}" required>
                    <span class="item-unit" style="margin-left: 0.25rem;">${material?.unit || ''}</span>
                    <button type="button" class="btn-icon add-master-btn" data-action="add-new-material" title="Tambah Master Material"><span class="material-symbols-outlined">add</span></button>
                </div>
                <button type="button" class="btn-icon btn-icon-danger remove-item-btn"><span class="material-symbols-outlined">delete</span></button>
            </div>
        `;
    }).join('');
    return `
            <form id="edit-item-form" data-id="${item.id}" data-type="delivery_order_items">
                <h5 class="invoice-section-title">Rincian Barang (Tanpa Harga)</h5>
                <div id="invoice-items-container">${itemsHTML}</div>
                <div class="add-item-action">
                    <button type="button" id="add-invoice-item-btn" class="btn-icon" title="Tambah Barang"><span class="material-symbols-outlined">add_circle</span></button>
                </div>
                <button type="submit" class="btn btn-primary" style="margin-top: 1.5rem;">Simpan Perubahan Item</button>
            </form>
        `;
  }
  async function handleUpdateDeliveryOrderItems(form) {
    const expenseId = form.dataset.id;
    toast('syncing', 'Memperbarui item surat jalan...');
    try {
        const oldExpenseSnap = await getDoc(doc(expensesCol, expenseId));
        if (!oldExpenseSnap.exists()) throw new Error('Surat jalan asli tidak ditemukan');
        const oldItems = oldExpenseSnap.data().items || [];
        const newItems = [];
        $$('.invoice-item-row', form).forEach(row => {
            const materialId = row.querySelector('input[name="materialId"]').value;
            const qty = parseLocaleNumber(row.querySelector('input[name="itemQty"]').value);
            if (materialId && qty > 0) newItems.push({
                materialId,
                qty,
                price: 0,
                total: 0
            });
        });
        if (newItems.length === 0) {
            toast('error', 'Surat jalan harus memiliki minimal satu item.');
            return;
        }
        await runTransaction(db, async (transaction) => {
            const stockAdjustments = new Map();
            oldItems.forEach(item => {
                stockAdjustments.set(item.materialId, (stockAdjustments.get(item.materialId) || 0) - item.qty);
            });
            newItems.forEach(item => {
                stockAdjustments.set(item.materialId, (stockAdjustments.get(item.materialId) || 0) + item.qty);
            });
  
            for (const [materialId, qtyChange] of stockAdjustments.entries()) {
                if (qtyChange !== 0) {
                    const materialRef = doc(materialsCol, materialId);
                    transaction.update(materialRef, {
                        currentStock: increment(-qtyChange)
                    });
                }
            }
  
            const q = query(stockTransactionsCol, where("expenseId", "==", expenseId));
            const oldTransSnap = await getDocs(q);
            oldTransSnap.forEach(doc => transaction.delete(doc.ref));
            newItems.forEach(item => {
                const newTransRef = doc(collection(db, 'teams', TEAM_ID, 'stock_transactions'));
                transaction.set(newTransRef, {
                    materialId: item.materialId,
                    quantity: item.qty,
                    date: oldExpenseSnap.data().date,
                    type: 'out',
                    expenseId: expenseId,
                    projectId: oldExpenseSnap.data().projectId,
                    createdAt: serverTimestamp()
                });
            });
  
            transaction.update(doc(expensesCol, expenseId), {
                items: newItems
            });
        });
        _logActivity('Mengedit Item Surat Jalan', {
            docId: expenseId
        });
        toast('success', 'Item surat jalan berhasil diperbarui!');
        closeModal($('#editItem-modal'));
        renderTagihanPage();
    } catch (error) {
        toast('error', 'Gagal memperbarui item.');
        console.error(error);
    }
  }

async function handleProcessBillPayment(form) {
    const billId = form.dataset.id;
    const amountToPay = parseFormattedNumber(form.elements.amount.value);
    // Preserve selected date but include current time to avoid 07:00 default
    const dateInput = new Date(form.elements.date.value);
    const now = new Date();
    const date = new Date(dateInput.getFullYear(), dateInput.getMonth(), dateInput.getDate(), now.getHours(), now.getMinutes(), 0, 0);

    if (amountToPay <= 0) {
        toast('error', 'Jumlah pembayaran harus lebih dari nol.');
        return false;
    }

    const file = form.elements.paymentAttachment?.files?.[0];
    if (navigator.onLine && !_isQuotaExceeded()) {
        const loadingToast = toast('syncing', 'Memproses pembayaran ke server...');
        try {
            const billRef = doc(billsCol, billId);
            
            let attachmentUrl = null;
            if (file) {
                attachmentUrl = await _uploadFileToCloudinary(file);
                if (!attachmentUrl) throw new Error("Gagal mengunggah lampiran.");
            }

            await runTransaction(db, async (transaction) => {
                const billSnap = await transaction.get(billRef);
                if (!billSnap.exists()) throw new Error("Tagihan tidak ditemukan di server.");
                
                const billData = billSnap.data();
                const newPaidAmount = (billData.paidAmount || 0) + amountToPay;
                const isNowPaid = newPaidAmount >= billData.amount;

                // KUNCI PERBAIKAN: Tambahkan paidAt saat lunas
                transaction.update(billRef, {
                    paidAmount: newPaidAmount,
                    status: isNowPaid ? 'paid' : 'unpaid',
                    rev: (billData.rev || 0) + 1,
                    updatedAt: serverTimestamp(),
                    ...(isNowPaid && { paidAt: Timestamp.fromDate(date) })
                });

                const paymentRef = doc(collection(billRef, 'payments'));
                const paymentData = {
                    amount: amountToPay,
                    date: Timestamp.fromDate(date),
                    createdAt: serverTimestamp(),
                    ...(attachmentUrl && { attachmentUrl: attachmentUrl }),
                };
                transaction.set(paymentRef, paymentData);
            });

            await syncFromServer();
            await loadAllLocalDataToState();

            loadingToast.close();
            await toast('success', 'Pembayaran berhasil dicatat & disinkronkan.');
            
            handleOpenBillDetail(billId, null);
            renderPageContent();
            _calculateAndCacheDashboardTotals();

            return true;

        } catch (error) {
            loadingToast.close();
            console.error("Gagal memproses pembayaran online:", error);
            toast('error', `Gagal: ${error.message}`);
            return false;
        }

    } else {
        const loadingToast = toast('syncing', 'Menyimpan pembayaran di perangkat...');
        try {
            let isNowPaid = false;
            await localDB.transaction('rw', localDB.bills, localDB.expenses, localDB.attendance_records, localDB.pending_payments, localDB.files, async () => {
                const bill = await localDB.bills.get(billId);
                if (!bill) throw new Error("Tagihan tidak ditemukan di perangkat.");

                let localAttachmentId = null;
                if (file) {
                    const compressed = await _compressImage(file, 0.85, 1280);
                    const blob = compressed || file;
                    localAttachmentId = `payment-${billId}-${Date.now()}`;
                    await localDB.files.put({ id: localAttachmentId, file: blob, addedAt: new Date(), size: blob.size || 0 });
                }

                const newPaidAmount = (bill.paidAmount || 0) + amountToPay;
                isNowPaid = newPaidAmount >= bill.amount;
                
                // KUNCI PERBAIKAN: Tambahkan paidAt saat lunas untuk offline
                await localDB.bills.where('id').equals(billId).modify({
                    paidAmount: newPaidAmount,
                    status: isNowPaid ? 'paid' : 'unpaid',
                    syncState: 'pending_update',
                    updatedAt: new Date(),
                    ...(isNowPaid && { paidAt: date })
                });

                if (isNowPaid && bill.expenseId) await localDB.expenses.where('id').equals(bill.expenseId).modify({ status: 'paid', syncState: 'pending_update' });
                if (isNowPaid && bill.type === 'gaji') await localDB.attendance_records.where('billId').equals(billId).modify({ isPaid: true, syncState: 'pending_update' });

                await localDB.pending_payments.add({ billId, amount: amountToPay, date, localAttachmentId, createdAt: new Date() });
            });

            _logActivity(`Membayar Tagihan Cicilan (Offline)`, { billId, amount: amountToPay });
            await loadAllLocalDataToState();
            loadingToast.close();
            toast('success', 'Pembayaran berhasil dicatat di perangkat (offline).');

            if (isNowPaid && ($('#main-tabs-container .sub-nav-item.active')?.dataset.tab || 'unpaid') === 'unpaid') {
                _removeItemFromListWithAnimation(billId);
            }
            handleOpenBillDetail(billId, null);
            _calculateAndCacheDashboardTotals();
            
            return true;
        } catch (error) {
            loadingToast.close();
            console.error("Gagal memproses pembayaran offline:", error);
            toast('error', `Gagal: ${error.message}`);
            return false;
        }
    }
}

function handlePaymentModal(id, type) {
    let item, remainingAmount, title, paymentType;
    if (type === 'pinjaman') {
        item = appState.fundingSources.find(i => i.id === id);
        if (!item) {
            toast('error', 'Data pinjaman tidak ditemukan.');
            return;
        }
        const totalPayable = item.totalRepaymentAmount || item.totalAmount;
        remainingAmount = totalPayable - (item.paidAmount || 0);
        title = 'Pembayaran Cicilan Pinjaman';
        paymentType = 'loan';
    } else {
        return;
    }

    const amountFormatted = new Intl.NumberFormat('id-ID').format(remainingAmount);
    const todayString = new Date().toISOString().slice(0, 10);

    const content = `
        <div class="payment-modal-header">
            <span class="label">Sisa Tagihan Pinjaman</span>
            <strong class="payment-main-amount" id="payment-remaining-amount" data-raw-amount="${remainingAmount}">
                ${fmtIDR(remainingAmount)}
            </strong>
        </div>

        <div class="quick-pay-actions">
            <button type="button" class="btn btn-secondary" data-action="set-payment-full">Bayar Lunas</button>
            <button type="button" class="btn btn-secondary" data-action="set-payment-half">Bayar Setengah</button>
        </div>

        <form id="payment-form" data-id="${id}" data-type="${type}">
            <div class="payment-form-body">
                <div class="form-group">
                    <label>Jumlah Pembayaran</label>
                    <input type="text" name="amount" id="payment-input-amount" inputmode="numeric" required value="${amountFormatted}">
                </div>
                <div class="form-group">
                    <label>Tanggal Pembayaran</label>
                    <input type="date" name="date" value="${todayString}" required>
                </div>
                <div class="form-group">
                    <label>Lampiran (Opsional)</label>
                    <input type="file" name="paymentAttachment" accept="image/*" class="hidden-file-input" data-target-display="payment-attachment-display">
                    <div class="upload-buttons">
                        <button type="button" class="btn btn-secondary" data-action="trigger-file-input" data-target="paymentAttachment"><span class="material-symbols-outlined">attach_file</span> Pilih File</button>
                    </div>
                    <div class="file-name-display" id="payment-attachment-display">Belum ada file dipilih</div>
                </div>
            </div>
            <div class="form-footer-actions">
                <button type="submit" class="btn btn-primary" form="payment-form">
                    <span class="material-symbols-outlined">payment</span> Konfirmasi Pembayaran
                </button>
            </div>
        </form>
    `;

    const footer = `
        <button type="button" class="btn btn-secondary" data-close-modal>Batal</button>
    `;

    createModal('payment', {
        title,
        content,
        footer,
        paymentType // Menggunakan 'paymentType' yang sudah didefinisikan
    });
}

async function handleProcessPayment(form) {
    const { id, type } = form.dataset;
    if (type !== 'pinjaman' && type !== 'loan') return false;

    const amountToPay = parseFormattedNumber(form.elements.amount.value);
    const dateInput = new Date(form.elements.date.value);
    const now = new Date();
    const date = new Date(dateInput.getFullYear(), dateInput.getMonth(), dateInput.getDate(), now.getHours(), now.getMinutes(), 0, 0);

    if (amountToPay <= 0) {
        toast('error', 'Jumlah pembayaran harus lebih dari nol.');
        return false;
    }

    const loan = await localDB.funding_sources.get(id);
    if (!loan) {
        toast('error', 'Data pinjaman tidak ditemukan di perangkat.');
        return false;
    }

    const totalPayable = loan.totalRepaymentAmount || loan.totalAmount;
    const newPaidAmount = (loan.paidAmount || 0) + amountToPay;
    const isPaid = newPaidAmount >= totalPayable;

    const updatedLoanData = {
        ...loan,
        paidAmount: newPaidAmount,
        status: isPaid ? 'paid' : 'unpaid',
        updatedAt: new Date(),
        ...(isPaid && { paidAt: date })
    };
    
    // [LOGIKA BARU] Fungsi untuk mengantrekan pembayaran secara lokal
    const queueLocalPayment = async () => {
        await localDB.pending_payments.add({
            billId: id, // Menggunakan billId untuk ID pinjaman agar konsisten
            amount: amountToPay,
            date,
            createdAt: new Date()
        });
    };


    if (navigator.onLine && !_isQuotaExceeded()) {
        const loadingToast = toast('syncing', 'Memproses pembayaran...');
        try {
            await runTransaction(db, async (transaction) => {
                const loanRef = doc(fundingSourcesCol, id);
                const loanSnap = await transaction.get(loanRef);
                if (!loanSnap.exists()) throw new Error("Data pinjaman tidak ditemukan di server.");
                const loanData = loanSnap.data();
                
                transaction.update(loanRef, {
                    paidAmount: newPaidAmount,
                    status: isPaid ? 'paid' : 'unpaid',
                    rev: (loanData.rev || 0) + 1,
                    updatedAt: serverTimestamp(),
                    ...(isPaid && { paidAt: Timestamp.fromDate(date) })
                });

                // [LOGIKA BARU] Buat catatan pembayaran di sub-koleksi
                const paymentRef = doc(collection(loanRef, 'payments'));
                transaction.set(paymentRef, {
                    amount: amountToPay,
                    date: Timestamp.fromDate(date),
                    createdAt: serverTimestamp()
                });
            });

            await localDB.funding_sources.put({ ...updatedLoanData, syncState: 'synced' });
            loadingToast.close();
            toast('success', 'Pembayaran berhasil disinkronkan.');

        } catch (error) {
            loadingToast.close();
            toast('error', `Gagal: ${error.message}. Disimpan ke perangkat.`);
            await localDB.funding_sources.put({ ...updatedLoanData, syncState: 'pending_update' });
            await queueLocalPayment(); // Tetap antrekan pembayaran jika server gagal
        }
    } else {
        await localDB.funding_sources.put({ ...updatedLoanData, syncState: 'pending_update' });
        await queueLocalPayment(); // Antrekan pembayaran saat offline
        toast('info', 'Offline. Pembayaran disimpan di perangkat.');
    }

    _logActivity(`Membayar Cicilan (Lokal)`, { loanId: id, amount: amountToPay });
    await loadAllLocalDataToState();
    if (appState.activePage === 'pemasukan') {
        await _rerenderPemasukanList(appState.activeSubPage.get('pemasukan'));
    }
    _calculateAndCacheDashboardTotals();
    
    return true;
}

function _createNestedAccordionHTML(title, items) {
    if (!items || items.length === 0) return '';
    const totalSectionAmount = items.reduce((sum, item) => sum + item.remainingAmount, 0);
    const groupedItems = items.reduce((acc, item) => {
        const key = item.groupId || 'lainnya';
        if (!acc[key]) {
            acc[key] = {
                name: item.groupName || 'Lainnya',
                items: [],
                total: 0
            };
        }
        acc[key].items.push(item);
        acc[key].total += item.remainingAmount;
        return acc;
    }, {});
    const createPaymentCard = (item) => `
        <div class="card simulasi-item" data-id="${item.id}" data-full-amount="${item.remainingAmount}" data-partial-allowed="true" data-title="${item.title || '-'}" data-description="${item.description}">
            <div class="simulasi-info">
                <div class="simulasi-title">${item.description}</div>
            </div>
            <div class="simulasi-amount">${fmtIDR(item.remainingAmount)}</div>
        </div>`;
    const subAccordionsHTML = Object.values(groupedItems).map(group => `
        <div class="simulasi-subsection">
            <button class="simulasi-subsection-header">
                <div class="header-info">
                    <span class="header-title">${group.name}</span>
                    <span class="header-total">${fmtIDR(group.total)}</span>
                </div>
                <span class="material-symbols-outlined header-icon">expand_more</span>
            </button>
            <div class="simulasi-subsection-content">
                ${group.items.map(createPaymentCard).join('')}
            </div>
        </div>
    `).join('');
    return `
        <div class="card simulasi-section">
            <button class="simulasi-section-header">
                 <div class="header-info">
                    <span class="header-title">${title}</span>
                    <span class="header-total">${items.length} Tagihan - Total ${fmtIDR(totalSectionAmount)}</span>
                </div>
                <span class="material-symbols-outlined header-icon">expand_more</span>
            </button>
            <div class="simulasi-section-content">
                ${subAccordionsHTML}
            </div>
        </div>`;
  }
  async function renderSimulasiBayarPage() {
    const container = $('.page-container');
    container.innerHTML = _getSkeletonLoaderHTML('simulasi');
    appState.simulasiState.selectedPayments.clear();    // 1. Ambil semua data yang diperlukan
    await Promise.all([
        fetchAndCacheData('bills', billsCol), fetchAndCacheData('fundingSources', fundingSourcesCol),
        fetchAndCacheData('workers', workersCol, 'workerName'), fetchAndCacheData('suppliers', suppliersCol, 'supplierName'),
        fetchAndCacheData('expenses', expensesCol), fetchAndCacheData('fundingCreditors', fundingCreditorsCol, 'creditorName'),
        fetchAndCacheData('staff', staffCol, 'staffName'), fetchAndCacheData('projects', projectsCol)
    ]);
    const unpaidBills = appState.bills.filter(b => b.status === 'unpaid');
    const unpaidLoans = appState.fundingSources.filter(f => f.status === 'unpaid');
    const staffFees = unpaidBills.filter(b => b.type === 'fee').map(b => {
        const staff = appState.staff.find(s => s.id === b.staffId);
        return {
            id: `bill-${b.id}`,
            title: staff?.staffName,
            description: b.description,
            remainingAmount: b.amount - (b.paidAmount || 0),
            groupId: b.staffId || 'lainnya',
            groupName: staff?.staffName || 'Fee Lainnya'
        };
    });
    const workerSalaries = unpaidBills.filter(b => b.type === 'gaji').map(b => {
        const worker = appState.workers.find(w => w.id === b.workerId);
        return {
            id: `bill-${b.id}`,
            title: worker?.workerName,
            description: b.description,
            remainingAmount: b.amount - (b.paidAmount || 0),
            groupId: b.workerId || 'lainnya',
            groupName: worker?.workerName || 'Gaji Lainnya'
        };
    });
  
    const createBillItem = (b, type) => {
        const expense = appState.expenses.find(e => e.id === b.expenseId);
        const supplier = appState.suppliers.find(s => s.id === expense?.supplierId);
        return {
            id: `bill-${b.id}`,
            title: supplier?.supplierName,
            description: b.description,
            remainingAmount: b.amount - (b.paidAmount || 0),
            groupId: expense?.supplierId || 'lainnya',
            groupName: supplier?.supplierName || 'Lainnya'
        };
    };
    const materialBills = unpaidBills.filter(b => b.type === 'material').map(b => createBillItem(b));
    const operasionalBills = unpaidBills.filter(b => b.type === 'operasional').map(b => createBillItem(b));
    const lainnyaBills = unpaidBills.filter(b => b.type === 'lainnya').map(b => createBillItem(b));
    const loans = unpaidLoans.map(l => {
        const creditor = appState.fundingCreditors.find(c => c.id === l.creditorId);
        return {
            id: `loan-${l.id}`,
            title: creditor?.creditorName,
            description: 'Cicilan Pinjaman',
            remainingAmount: (l.totalRepaymentAmount || l.totalAmount) - (l.paidAmount || 0),
            groupId: l.creditorId || 'lainnya',
            groupName: creditor?.creditorName || 'Pinjaman Lainnya'
        };
    });
    await _transitionContent(container, `
        <div class="card card-pad simulasi-summary">
            <div class="form-group">
                <label>Dana Masuk (Uang di Tangan)</label>
                <input type="text" id="simulasi-dana-masuk" inputmode="numeric" placeholder="mis. 10.000.000">
            </div>
            <div class="simulasi-totals">
                <div><span class="label">Total Alokasi</span><strong id="simulasi-total-alokasi">Rp 0</strong></div>
                <div><span class="label">Sisa Dana</span><strong id="simulasi-sisa-dana">Rp 0</strong></div>
            </div>
            <div class="rekap-actions"><button id="simulasi-buat-pdf" class="btn btn-primary"><span class="material-symbols-outlined">picture_as_pdf</span> Buat Laporan PDF</button></div>
        </div>
        <div id="simulasi-utang-list">
             ${_createNestedAccordionHTML('Gaji Staf & Fee', staffFees)}
             ${_createNestedAccordionHTML('Tagihan Gaji Pekerja', workerSalaries)}
             ${_createNestedAccordionHTML('Tagihan Material', materialBills)}
             ${_createNestedAccordionHTML('Tagihan Operasional', operasionalBills)}
             ${_createNestedAccordionHTML('Tagihan Lainnya', lainnyaBills)}
             ${_createNestedAccordionHTML('Cicilan Pinjaman', loans)}
        </div>
    `);
    $$('.simulasi-section-header, .simulasi-subsection-header').forEach(header => {
        header.addEventListener('click', () => header.parentElement.classList.toggle('open'));
    });
    $('#simulasi-utang-list').addEventListener('click', (e) => {
        const card = e.target.closest('.simulasi-item');
        if (card) _openSimulasiItemActionsModal(card.dataset);
    });
    $('#simulasi-dana-masuk').addEventListener('input', _updateSimulasiTotals);
    $('#simulasi-dana-masuk').addEventListener('input', _formatNumberInput);
    $('#simulasi-buat-pdf').addEventListener('click', _createSimulasiPDF);
      _setActiveListeners([]);
  }
  
function _openSimulasiItemActionsModal(dataset) {
    const { id, title, description, fullAmount, partialAllowed } = dataset;
    const isSelected = appState.simulasiState.selectedPayments.has(id);

    // [PERBAIKAN 1] Siapkan daftar aksi (actions) seperti di modal lain
    const actions = [];

    if (isSelected) {
        actions.push({ label: 'Batalkan Pilihan', action: 'cancel', icon: 'cancel' });
    } else {
        actions.push({ label: 'Pilih & Bayar Penuh', action: 'pay_full', icon: 'check_circle' });
        if (partialAllowed === 'true') {
            actions.push({ label: 'Bayar Sebagian', action: 'pay_partial', icon: 'pie_chart' });
        }
    }

    // [PERBAIKAN 2] Buat konten HTML menggunakan format dense-list-container
    const content = `
        <div class="dense-list-container">
            ${actions.map(a => `
                <button class="dense-list-item btn btn-ghost" data-action="${a.action}">
                    <div class="item-main-content">
                        <div class="action-item-primary">
                            <span class="material-symbols-outlined">${a.icon}</span>
                            <strong class="item-title">${a.label}</strong>
                        </div>
                    </div>
                </button>
            `).join('')}
        </div>`;

    // [PERBAIKAN 3] Panggil createModal dengan tipe 'actionsPopup'
    const modal = createModal('actionsPopup', {
        title: `${title}: ${description}`, // Judul yang lebih deskriptif
        content
    });

    if (modal) {
        modal.querySelectorAll('.btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const card = $(`.simulasi-item[data-id="${id}"]`);
                if (!card) return;
        
                const action = btn.dataset.action;
                const parentModal = btn.closest('.modal-bg');

                if (action === 'pay_partial') {
                    if (parentModal) closeModal(parentModal);
                    setTimeout(() => {
                        _openSimulasiPartialPaymentModal(dataset);
                    }, 300);
                    return;
                }
      
                if (action === 'pay_full') {
                    appState.simulasiState.selectedPayments.set(id, parseFormattedNumber(fullAmount));
                    card.classList.add('selected');
                } else if (action === 'cancel') {
                    appState.simulasiState.selectedPayments.delete(id);
                    card.classList.remove('selected');
                }
                
                if (parentModal) closeModal(parentModal);

                setTimeout(() => {
                    _updateSimulasiTotals();
                }, 300);
            });
        });
    }
}
function _openSimulasiPartialPaymentModal(dataset) {
    const { id, title, fullAmount } = dataset;
    const fullAmountNum = parseFormattedNumber(fullAmount);
    
    const formId = `partial-payment-form-${id}`; 

    const content = `
        <form id="${formId}">
            <div class="simulasi-actions-modal-header">
                <h5>${title}</h5>
                <p>Total tagihan penuh: <strong>${fmtIDR(fullAmountNum)}</strong></p>
            </div>
            ${_createFormGroupHTML(
              'partial-payment-amount',
              'Jumlah Pembayaran Parsial',
              '<input type="text" name="amount" inputmode="numeric" required placeholder="mis. 500.000">'
            )}
            
            <div class="form-footer-actions">
                <button type="submit" class="btn btn-primary">Simpan</button>
                <button type="button" class="btn btn-secondary" data-action="close-modal-or-pane">Batal</button>
            </div>
        </form>
    `;
    
    // [PERBAIKAN KUNCI 1] Panggil createModal dengan tipe 'actionsPopup'
    const modal = createModal('actionsPopup', {
        title: 'Pembayaran Parsial',
        content: content
        // Footer tidak lagi diperlukan karena tombol ada di dalam 'content'
    });
    
    // Sisa dari fungsi ini tidak perlu diubah
    const context = modal; // Di mobile, konteksnya selalu modal itu sendiri
    
    if(context){
        const form = $(`#${formId}`, context); 
        const amountInput = form.querySelector('input[name="amount"]');
        const closeModalBtn = $('[data-action="close-modal-or-pane"]', context);
      
        amountInput.addEventListener('input', _formatNumberInput);

        const closeCurrentView = () => {
            closeModal(modal); // Cukup tutup modal saat ini

            // Setelah animasi tutup, buka kembali modal aksi sebelumnya
            setTimeout(() => {
                _openSimulasiItemActionsModal(dataset);
            }, 350);
        };

        closeModalBtn.addEventListener('click', closeCurrentView);

        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const amountToPay = parseFormattedNumber(amountInput.value);
            if (amountToPay <= 0) {
                toast('error', 'Jumlah harus lebih besar dari nol.');
                return;
            }
            if (amountToPay > fullAmountNum) {
                toast('error', `Jumlah tidak boleh melebihi total tagihan ${fmtIDR(fullAmountNum)}.`);
                return;
            }
            const card = $(`.simulasi-item[data-id="${id}"]`);
            if (card) {
                appState.simulasiState.selectedPayments.set(id, amountToPay);
                card.classList.add('selected');
            }
            
            // Tutup modal ini terlebih dahulu
            closeModal(modal);
            
            // Jalankan update total setelah animasi tutup selesai
            setTimeout(() => {
                _updateSimulasiTotals();
            }, 350);
        });
    }
}

function _updateSimulasiTotals() {
    const danaMasukEl = $('#simulasi-dana-masuk');
    const totalAlokasiEl = $('#simulasi-total-alokasi');
    const sisaDanaEl = $('#simulasi-sisa-dana');
  
    if (!danaMasukEl || !totalAlokasiEl || !sisaDanaEl) return;
    const danaMasuk = parseFormattedNumber(danaMasukEl.value);
    let totalAlokasi = 0;
    // Hitung total alokasi dari state
    for (const amount of appState.simulasiState.selectedPayments.values()) {
        totalAlokasi += amount;
    }
    const sisaDana = danaMasuk - totalAlokasi;
    // Update UI with animated numbers
    animateNumber(totalAlokasiEl, totalAlokasi);
    animateNumber(sisaDanaEl, sisaDana);
  
    // Atur warna sisa dana
    sisaDanaEl.classList.remove('positive', 'negative');
    if (sisaDana >= 0) {
        sisaDanaEl.classList.add('positive');
    } else {
        sisaDanaEl.classList.add('negative');
    }
    // Sinkronisasi tampilan visual setiap kartu dengan state
    $$('.simulasi-item').forEach(card => {
        const cardId = card.dataset.id;
        const amountEl = card.querySelector('.simulasi-amount');
  
        if (appState.simulasiState.selectedPayments.has(cardId)) {
            card.classList.add('selected');
            const selectedAmount = appState.simulasiState.selectedPayments.get(cardId);
            const fullAmount = parseFormattedNumber(card.dataset.fullAmount);
            // Tampilkan jumlah yang dipilih jika berbeda dari jumlah penuh
            if (selectedAmount < fullAmount) {
                amountEl.innerHTML = `<span class="partial-amount">${fmtIDR(selectedAmount)}</span> / ${fmtIDR(fullAmount)}`;
            }
        } else {
            card.classList.remove('selected');
            // Kembalikan ke tampilan jumlah penuh
            amountEl.innerHTML = fmtIDR(card.dataset.fullAmount);
        }
    });
  }
  
  // --- SUB-SEKSI 3.6: LAPORAN & PDF ---
async function renderLaporanPage() {
    document.body.classList.remove('page-has-unified-panel');
    const container = $('.page-container');

    const tabs = [
      { id: 'ringkasan', label: 'Ringkasan Laporan' },
      { id: 'riwayat_pembayaran', label: 'Riwayat Pembayaran' }
    ];

    container.innerHTML = `
      <div class="content-panel">
        <div class="sub-nav two-tabs">
          ${tabs.map((t, i) => `<button class="sub-nav-item ${i === 0 ? 'active' : ''}" data-tab="${t.id}">${t.label}</button>`).join('')}
        </div>
        <div id="sub-page-content">${_getSkeletonLoaderHTML('laporan')}</div>
      </div>
    `;

    const fab = $('#fab-container');
    if (fab) {
      // Kondisi !isMobile dihapus agar FAB muncul di semua ukuran layar
      if (!isViewer()) {
        fab.innerHTML = `<button class="fab" data-action="open-report-generator" title="Buat/Unduh Laporan"><span class="material-symbols-outlined">download</span></button>`;
      } else {
        fab.innerHTML = '';
      }
    }
    const renderTabContent = async (tabId) => {
      const contentContainer = $('#sub-page-content');
      if (!contentContainer) return;
      appState.activeSubPage.set('laporan', tabId);
      
      // KUNCI REAL-TIME: Aktifkan listener saat halaman laporan dibuka
      _setActiveListeners(['incomes', 'expenses', 'bills', 'attendance_records', 'funding_sources']);
      
      if (tabId === 'ringkasan') {
        contentContainer.innerHTML = _getSkeletonLoaderHTML('laporan');
        await loadAllLocalDataToState(); // Selalu ambil data terbaru sebelum render
        
        const reportData = _getFilteredReportData(); // Ambil data yang sudah bersih
        const { incomeData, expenseData } = _getDailyFinancialDataForChart(); // Untuk tren 7 hari
        const totalIncome = incomeData.reduce((a, b) => a + b, 0);
        const totalExpense = expenseData.reduce((a, b) => a + b, 0);
        const filterStart = appState.reportFilter?.start || '';
        const filterEnd = appState.reportFilter?.end || '';

        contentContainer.innerHTML = `
          <div class="card card-pad" style="margin-bottom: 1rem;">
            <div class="report-filter">
              <div class="date-range-group">
                <input type="date" id="report-start-date" value="${filterStart}">
                <span>s.d.</span>
                <input type="date" id="report-end-date" value="${filterEnd}">
              </div>
              <button class="btn btn-secondary" id="apply-report-filter">Terapkan</button>
            </div>
          </div>
          <section class="card card-pad" style="margin-bottom:1rem;">
            <h5 class="section-title-owner" style="margin-top:0;">Tren Pemasukan vs Pengeluaran (7 Hari Terakhir)</h5>
            <div class="chart-summary-grid">
              <div class="summary-stat-card"><span class="label">Total Pemasukan</span><strong class="value positive">${fmtIDR(totalIncome)}</strong></div>
              <div class="summary-stat-card"><span class="label">Total Pengeluaran</span><strong class="value negative">${fmtIDR(totalExpense)}</strong></div>
            </div>
            <div style="height: 250px; position: relative;"><canvas id="interactive-bar-chart"></canvas></div>
          </section>
          <div class="report-cards-grid">
            <div id="laba-rugi-card" class="report-card card card-pad"></div>
            <div id="analisis-beban-card" class="report-card card card-pad"></div>
            <div id="arus-kas-card" class="report-card card card-pad"></div>
          </div>
        `;

        // Render semua kartu dengan data yang sudah bersih
        await _renderLabaRugiCard($('#laba-rugi-card'), reportData);
        await _renderAnalisisBeban($('#analisis-beban-card'), reportData);
        await _renderLaporanArusKas($('#arus-kas-card'), reportData);
        _renderInteractiveBarChart();

        $('#apply-report-filter')?.addEventListener('click', () => {
          appState.reportFilter = { start: $('#report-start-date')?.value || '', end: $('#report-end-date')?.value || '' };
          renderTabContent('ringkasan'); // Render ulang tab ini dengan filter baru
        });

      } else if (tabId === 'riwayat_pembayaran') {
        await _renderRiwayatPembayaranView(contentContainer);
      }
    };

    $('.sub-nav', container).addEventListener('click', e => {
      const tabBtn = e.target.closest('.sub-nav-item');
      const currentActive = $('.sub-nav .active', container);
      if (tabBtn && tabBtn !== currentActive) {
        const children = Array.from(tabBtn.parentElement.children);
        const direction = children.indexOf(tabBtn) > children.indexOf(currentActive) ? 'forward' : 'backward';
        if (currentActive) currentActive.classList.remove('active');
        tabBtn.classList.add('active');
        _animateTabSwitch($('#sub-page-content'), () => renderTabContent(tabBtn.dataset.tab), direction);
      }
    });

    const lastSubPage = appState.activeSubPage.get('laporan') || tabs[0].id;
    const initialTabButton = $(`.sub-nav-item[data-tab="${lastSubPage}"]`, container);
    if (initialTabButton) {
      $(`.sub-nav .active`, container)?.classList.remove('active');
      initialTabButton.classList.add('active');
    }
    await renderTabContent(lastSubPage);
}
async function _renderRiwayatPembayaranView(container) {
    await loadAllLocalDataToState(); // Pastikan state terbaru
    toast('syncing', 'Memuat riwayat pembayaran...');

    try {
        let allPayments = [];

        // Langkah 1: Ambil data dari antrean pembayaran LOKAL (yang dibuat saat offline)
        const localPayments = await localDB.pending_payments.toArray();
        allPayments.push(...localPayments);

        // Langkah 2: Jika ONLINE, ambil juga semua data pembayaran dari SERVER
        if (navigator.onLine) {
            // Ambil semua ID dari bill dan pinjaman yang TIDAK ditandai hapus
            const parentIds = [
                ...appState.bills.filter(b => !b.isDeleted).map(b => b.id),
                ...appState.fundingSources.filter(f => !f.isDeleted).map(f => f.id)
            ];

            const paymentPromises = parentIds.map(parentId => {
                // Asumsi ID pinjaman juga ada di koleksi 'bills' untuk sub-koleksi 'payments'
                const parentDocRef = doc(db, 'teams', TEAM_ID, 'bills', parentId);
                const paymentsColRef = collection(parentDocRef, 'payments');
                return getDocs(paymentsColRef).then(snapshot => 
                    snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id, billId: parentId }))
                );
            });

            const onlinePaymentsArrays = await Promise.all(paymentPromises);
            allPayments.push(...onlinePaymentsArrays.flat());
        }

        // Langkah 3: Gabungkan, hilangkan duplikasi berdasarkan ID, lalu urutkan
        const uniquePayments = Array.from(new Map(allPayments.map(p => [p.id, p])).values());
        const sortedPayments = uniquePayments.sort((a, b) => _getJSDate(b.date) - _getJSDate(a.date));

        hideToast();

        if (sortedPayments.length === 0) {
            container.innerHTML = _getEmptyStateHTML({
                icon: 'history',
                title: 'Belum Ada Riwayat Pembayaran',
                desc: 'Setiap pembayaran yang Anda catat akan muncul di sini.'
            });
            return;
        }

        // Langkah 4: Render HTML (logika Anda sebelumnya sudah benar)
        const listHTML = sortedPayments.map(payment => {
            const parentBill = appState.bills.find(b => b.id === payment.billId);
            const parentLoan = appState.fundingSources.find(f => f.id === payment.billId);

            let description = 'Informasi tagihan tidak ditemukan.';
            let recipient = payment.workerName || '-';
            let parentType = '';
            
            if (parentBill) {
                parentType = 'bill';
                description = parentBill.description;
                if (parentBill.type !== 'gaji') {
                    const expense = appState.expenses.find(e => e.id === parentBill.expenseId);
                    const supplier = appState.suppliers.find(s => s.id === expense?.supplierId);
                    recipient = supplier?.supplierName || 'Supplier';
                } else if (payment.workerName) {
                    recipient = payment.workerName;
                }
            } else if (parentLoan) {
                parentType = 'pinjaman';
                description = 'Cicilan Pinjaman';
                const creditor = appState.fundingCreditors.find(c => c.id === parentLoan.creditorId);
                recipient = creditor?.creditorName || 'Kreditur';
            }

            const paymentDate = _getJSDate(payment.date).toLocaleString('id-ID', {
                day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
            });

            const kwitansiData = {
                nomor: `PAY-${payment.id?.substring(0, 8) || Date.now()}`,
                tanggal: _getJSDate(payment.date).toLocaleDateString('id-ID', {day:'numeric',month:'long',year:'numeric'}),
                namaPenerima: recipient,
                jumlah: payment.amount,
                deskripsi: `Pembayaran untuk: ${description}`
                // Properti isLunas, dll, akan ditambahkan saat tombol cetak diklik
            };

            return `
            <div class="jurnal-card" style="cursor: default;">
                <div class="jurnal-card-main">
                    <strong class="title">${recipient}</strong>
                    <span class="subtitle">${paymentDate}</span>
                    <p style="font-size: 0.8rem; margin: 4px 0 0 0;">Untuk: ${description}</p>
                </div>
                <div class="jurnal-card-secondary">
                    <strong class="amount">${fmtIDR(payment.amount)}</strong>
                    <div class="jurnal-item-actions" style="margin-top: 8px; display: flex; gap: 4px;">
                        <button class="btn btn-secondary btn-sm" data-action="lihat-tagihan-induk" data-parent-id="${payment.billId}" data-parent-type="${parentType}">
                            Lihat Induk
                        </button>
                        <button class="btn btn-primary btn-sm" data-action="cetak-kwitansi-pembayaran" data-kwitansi='${JSON.stringify(kwitansiData)}'>
                            Cetak
                        </button>
                    </div>
                </div>
            </div>`;
        }).join('');

        container.innerHTML = `<div class="jurnal-list" style="padding: 1rem;">${listHTML}</div>`;

    } catch (error) {
        hideToast();
        console.error("Gagal total memuat riwayat pembayaran:", error);
        container.innerHTML = _getEmptyStateHTML({
            icon: 'error',
            title: 'Gagal Memuat Riwayat',
            desc: 'Terjadi kesalahan saat mengambil data pembayaran. Silakan coba lagi.'
        });
    }
}
async function _renderFinancialSummaryChart() {
    const canvas = $('#financial-summary-chart');
    if (!canvas) return;
    await Promise.all([fetchAndCacheData('projects', projectsCol), fetchAndCacheData('incomes', incomesCol), fetchAndCacheData('expenses', expensesCol), fetchAndCacheData('fundingSources', fundingSourcesCol)]);
    const mainProject = appState.projects.find(p => p.projectType === 'main_income');
    const inRange = (d) => {
        const { start, end } = appState.reportFilter || {};
        const dt = _getJSDate(d);
        if (start && dt < new Date(start + 'T00:00:00')) return false;
        if (end && dt > new Date(end + 'T23:59:59')) return false;
        return true;
    };
    const pureIncome = appState.incomes.filter(inc => inc.projectId === mainProject?.id && inRange(inc.date)).reduce((sum, inc) => sum + inc.amount, 0);
    const totalExpenses = appState.expenses.filter(exp => inRange(exp.date)).reduce((sum, exp) => sum + exp.amount, 0);
    const totalFunding = appState.fundingSources.filter(fund => inRange(fund.date)).reduce((sum, fund) => sum + fund.totalAmount, 0);
    const ctx = canvas.getContext('2d');
    if (window.financialChart) window.financialChart.destroy();
  
    const textColor = getComputedStyle(document.body).getPropertyValue('--text').trim();
    window.financialChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Pemasukan Murni', 'Pengeluaran', 'Pendanaan'],
            datasets: [{
                data: [pureIncome, totalExpenses, totalFunding],
                backgroundColor: ['#28a745', '#f87171', '#ffca2c'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '70%',
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: textColor,
                        boxWidth: 12,
                        padding: 20,
                        font: {
                            weight: '500'
                        }
                    }
                }
            },
            // [IMPROVE-UI/UX]: drill-down on click
            onClick: (evt, elements) => {
                const el = elements && elements[0];
                if (!el) return;
                const index = el.index;
                const label = window.financialChart.data.labels[index];
                if (label === 'Pengeluaran') handleNavigation('tagihan', { source: 'quick' });
            }
        }
    });
  }

function _getDailyFinancialDataForChart() {
    const labels = [];
    const incomeData = Array(7).fill(0);
    const expenseData = Array(7).fill(0);
    const inRange = (d) => {
        const { start, end } = appState.reportFilter || {};
        const dt = _getJSDate(d);
        if (start && dt < new Date(start + 'T00:00:00')) return false;
        if (end && dt > new Date(end + 'T23:59:59')) return false;
        return true;
    };
    for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        labels.push(date.toLocaleDateString('id-ID', { weekday: 'short' }));
        const dateString = date.toISOString().slice(0, 10);
        
        (appState.incomes || []).filter(item => !item.isDeleted).forEach(income => {
            const d = _getJSDate(income.date);
            if (inRange(d) && d.toISOString().slice(0, 10) === dateString) {
                incomeData[6 - i] += income.amount || 0;
            }
        });
        (appState.expenses || []).filter(item => !item.isDeleted).forEach(expense => {
            const d = _getJSDate(expense.date);
            if (inRange(d) && d.toISOString().slice(0, 10) === dateString) {
                expenseData[6 - i] += expense.amount || 0;
            }
        });
    }
    return { labels, incomeData, expenseData };
}

async function _renderInteractiveBarChart() {
      const canvas = document.getElementById('interactive-bar-chart');
      if (!canvas) return;
      const { labels, incomeData, expenseData } = _getDailyFinancialDataForChart();
      if (interactiveReportChart) {
          interactiveReportChart.destroy();
      }
      const ctx = canvas.getContext('2d');
      interactiveReportChart = new Chart(ctx, {
          type: 'bar',
          data: {
              labels,
              datasets: [
                  { label: 'Pemasukan', data: incomeData, backgroundColor: 'rgba(34, 197, 94, 0.8)' },
                  { label: 'Pengeluaran', data: expenseData, backgroundColor: 'rgba(239, 68, 68, 0.8)' }
              ]
          },
          options: {
              indexAxis: 'y',
              responsive: true,
              maintainAspectRatio: false,
              scales: { 
                  x: { beginAtZero: true, ticks: { callback: v => fmtIDR(v) } },
                  y: { grid: { display: false } } // Sembunyikan grid di sumbu y (sekarang label hari)
              },
              plugins: { tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${fmtIDR(ctx.raw)}` } } },
              onClick: (event, elements) => {
                  if (elements && elements.length > 0) {
                      const idx = elements[0].index;
                      const clickedDate = new Date();
                      clickedDate.setDate(clickedDate.getDate() - (6 - idx));
                      _showDailyTransactionDetailsModal(clickedDate);
                  }
              }
          }
      });
  }
  
  function animateCountUp(element, endValue) {
      if (!element) return;
      
      const startValue = 0;
      const duration = 1500; // Durasi animasi dalam milidetik
      const startTime = performance.now();
  
      const step = (currentTime) => {
          const elapsedTime = currentTime - startTime;
          const progress = Math.min(elapsedTime / duration, 1);
          
          // Menggunakan easing function untuk efek perlambatan di akhir
          const easedProgress = 1 - Math.pow(1 - progress, 3);
          const currentValue = Math.round(startValue + (endValue * easedProgress));
  
          element.textContent = fmtIDR(currentValue);
  
          if (progress < 1) {
              requestAnimationFrame(step);
          } else {
              // Pastikan nilai akhir selalu tepat
              element.textContent = fmtIDR(endValue);
          }
      };
  
      requestAnimationFrame(step);
  }
  const countUpObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach(entry => {
          if (entry.isIntersecting) {
              const element = entry.target;
              const endValue = parseFloat(element.dataset.countupTo);
              
              animateCountUp(element, endValue);
              
              // Hentikan pengamatan setelah animasi berjalan sekali
              observer.unobserve(element);
          }
      });
  }, {
      threshold: 0.5 // Memicu saat 50% elemen terlihat
  });
  
  function _showDailyTransactionDetailsModal(date) {
      const dateString = date.toISOString().slice(0, 10);
      const formattedDate = date.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      
      const dailyIncomes = (appState.incomes || []).filter(i => _getJSDate(i.date).toISOString().slice(0, 10) === dateString);
      const dailyExpenses = (appState.expenses || []).filter(e => _getJSDate(e.date).toISOString().slice(0, 10) === dateString);
      
      const createListHTML = (items, type) => {
          if (items.length === 0) return '';
          const listItemsHTML = items.map(item => {
              const title = item.description || (type === 'Pemasukan' ? 'Penerimaan Termin' : 'Pengeluaran Umum');
              const amountClass = type === 'Pemasukan' ? 'positive' : 'negative';
              return `
                  <div class="dense-list-item">
                      <div class="item-main-content">
                          <strong class="item-title">${title}</strong>
                      </div>
                      <div class="item-actions">
                          <strong class="item-amount ${amountClass}">${fmtIDR(item.amount)}</strong>
                      </div>
                  </div>
              `;
          }).join('');
          return `<h5 class="detail-section-title">${type}</h5><div class="dense-list-container">${listItemsHTML}</div>`;
      };
  
      const hasTransactions = dailyIncomes.length > 0 || dailyExpenses.length > 0;
      const emptyStateHTML = !hasTransactions ? _getEmptyStateHTML({ icon: 'receipt_long', title: 'Tidak Ada Transaksi', desc: 'Tidak ada pemasukan atau pengeluaran pada tanggal ini.' }) : '';
  
      const modalContent = `
          <div style="margin-top: -1rem;">
              ${createListHTML(dailyIncomes, 'Pemasukan')}
              ${createListHTML(dailyExpenses, 'Pengeluaran')}
              ${emptyStateHTML}
          </div>
      `;
  
      createModal('dataDetail', { title: `Rincian Transaksi - ${formattedDate}`, content: modalContent });
  }
  
async function _renderLabaRugiCard(container, reportData) {
    if (!container) return;
    
    // Gunakan data yang sudah difilter dari reportData
    const { incomes, expenses, allBills, allAttendance, fundingSources, inRange } = reportData;

    const mainProject = appState.projects.find(p => p.projectType === 'main_income');
    const internalProjects = appState.projects.filter(p => p.id !== mainProject?.id);

    const pendapatan = incomes.filter(i => i.projectId === mainProject?.id).reduce((s,i)=>s+i.amount,0);
    const hpp_material = expenses.filter(e => e.projectId === mainProject?.id && e.type==='material').reduce((s,e)=>s+e.amount,0);
    
    let hpp_gaji = 0, bebanGajiInternal = 0;
    const paidSalaryBills = allBills.filter(b => b.type === 'gaji' && b.status === 'paid' && inRange(b.paidAt));
    const attendanceMap = new Map(allAttendance.map(rec => [rec.id, rec]));

    paidSalaryBills.forEach(bill => { 
        (bill.recordIds||[]).forEach(recordId => { 
            const r = attendanceMap.get(recordId); 
            if (r && inRange(r.date)) { 
                if (r.projectId === mainProject?.id) hpp_gaji += r.totalPay||0; 
                else bebanGajiInternal += r.totalPay||0; 
            } 
        }); 
    });

    const hpp_lainnya = expenses.filter(e => e.projectId === mainProject?.id && e.type==='lainnya').reduce((s,e)=>s+e.amount,0);
    const hpp = hpp_material + hpp_gaji + hpp_lainnya;
    const bebanOperasional = expenses.filter(e => e.projectId === mainProject?.id && e.type==='operasional').reduce((s,e)=>s+e.amount,0);
    const bebanExpenseInternal = expenses.filter(e => internalProjects.some(p=>p.id===e.projectId)).reduce((s,e)=>s+e.amount,0);
    const bebanInternal = bebanExpenseInternal + bebanGajiInternal;
    const labaKotor = pendapatan - hpp;
    
    let bebanBunga = 0;
    fundingSources.forEach(s => {
        if (s.interestType === 'interest') {
            const monthlyInterest = (s.totalAmount || 0) * ((s.rate || 0) / 100);
            bebanBunga += monthlyInterest * (s.tenor || 0);
        }
    });
  
    const labaBersih = labaKotor - bebanOperasional - bebanInternal - bebanBunga;

    container.innerHTML = `
      <h5 class="report-title">Laba Rugi</h5>
      <div class="report-card-content">
        <dl class="detail-list report-card-details">
          <div class="detail-list-item interactive" data-action="show-report-detail" data-type="income"><dt>Pendapatan</dt><dd class="positive">${fmtIDR(pendapatan)}</dd></div>
          <div class="detail-list-item"><dt>HPP (Total)</dt><dd class="negative">- ${fmtIDR(hpp)}</dd></div>
          <div class="detail-list-item interactive sub-item" data-action="show-report-detail" data-type="expense" data-category="material"><dt>• Material</dt><dd class="negative">- ${fmtIDR(hpp_material)}</dd></div>
          <div class="detail-list-item interactive sub-item" data-action="show-report-detail" data-type="expense" data-category="gaji"><dt>• Gaji</dt><dd class="negative">- ${fmtIDR(hpp_gaji)}</dd></div>
          <div class="detail-list-item interactive sub-item" data-action="show-report-detail" data-type="expense" data-category="lainnya"><dt>• Lainnya</dt><dd class="negative">- ${fmtIDR(hpp_lainnya)}</dd></div>
          <div class="summary-row"><dt>Laba Kotor</dt><dd>${fmtIDR(labaKotor)}</dd></div>
          <div class="detail-list-item interactive" data-action="show-report-detail" data-type="expense" data-category="operasional"><dt>Beban Operasional</dt><dd class="negative">- ${fmtIDR(bebanOperasional)}</dd></div>
          <div class="detail-list-item"><dt>Beban Bunga</dt><dd class="negative">- ${fmtIDR(bebanBunga)}</dd></div>
          <div class="summary-row final"><dt>Laba Bersih</dt><dd class="${labaBersih>=0?'positive':'negative'}">${fmtIDR(labaBersih)}</dd></div>
        </dl>
        <div class="report-card-chart"><canvas id="laba-rugi-donut-chart"></canvas></div>
      </div>
    `;
    setTimeout(() => {
        _renderMiniDonut('laba-rugi-donut-chart', ['Material','Gaji','Operasional', 'Lainnya', 'Bunga'], [hpp_material, hpp_gaji, bebanOperasional, hpp_lainnya, bebanBunga], ['#60a5fa','#f59e0b','#34d399','#a78bfa', '#ef4444']);
    }, 0);
}    async function _renderAnalisisBeban(container) {
      if (!container) return;
      
      await Promise.all([
          fetchAndCacheData('projects', projectsCol),
          fetchAndCacheData('bills', billsCol),
          fetchAndCacheData('attendanceRecords', attendanceRecordsCol, 'date')
      ]);
    
      const totals = {
          main: { material: { paid: 0, unpaid: 0 }, operasional: { paid: 0, unpaid: 0 }, lainnya: { paid: 0, unpaid: 0 }, gaji: { paid: 0, unpaid: 0 } },
          internal: { material: { paid: 0, unpaid: 0 }, operasional: { paid: 0, unpaid: 0 }, lainnya: { paid: 0, unpaid: 0 }, gaji: { paid: 0, unpaid: 0 } }
      };
      const mainProject = appState.projects.find(p => p.projectType === 'main_income');
      const mainProjectId = mainProject?.id;

      const validAttendanceRecords = (appState.attendanceRecords || []).filter(r => !r.isDeleted);
      const attendanceMap = new Map(validAttendanceRecords.map(rec => [rec.id, rec]));

      appState.bills.filter(b => !b.isDeleted).forEach(bill => {          if (bill.type === 'gaji') {
              (bill.recordIds || []).forEach(recordId => {
                  const record = attendanceMap.get(recordId);
                  if (record) {
                      const projectGroup = (record.projectId === mainProjectId) ? 'main' : 'internal';
                      const statusGroup = bill.status === 'paid' ? 'paid' : 'unpaid';
                      totals[projectGroup].gaji[statusGroup] += record.totalPay || 0;
                  }
              });
          } else {
              const projectGroup = (bill.projectId === mainProjectId) ? 'main' : 'internal';
              if (totals[projectGroup] && totals[projectGroup][bill.type]) {
                  if (bill.status === 'paid') totals[projectGroup][bill.type]['paid'] += (bill.amount || 0);
                  else totals[projectGroup][bill.type]['unpaid'] += (bill.amount || 0);
              }
          }
      });
    
      const generateBebanRowsHTML = (data) => {
          const categories = [{ key: 'material', label: 'Beban Material' }, { key: 'gaji', label: 'Beban Gaji' }, { key: 'operasional', label: 'Beban Operasional' }, { key: 'lainnya', label: 'Beban Lainnya' }];
          return categories.map(cat => {
              const item = data[cat.key];
              const total = item.paid + item.unpaid;
              if (total === 0) return '';
              return `<div class="category-title"><dt>${cat.label}</dt><dd class="negative">- ${fmtIDR(total)}</dd></div><div class="sub-item"><dt>• Lunas</dt><dd>${fmtIDR(item.paid)}</dd></div><div class="sub-item"><dt>• Belum Lunas</dt><dd>${fmtIDR(item.unpaid)}</dd></div>`;
          }).join('');
      };
    
      const totalBebanMain = Object.values(totals.main).reduce((sum, cat) => sum + cat.paid + cat.unpaid, 0);
      const totalBebanInternal = Object.values(totals.internal).reduce((sum, cat) => sum + cat.paid + cat.unpaid, 0);
      
      container.innerHTML = `
      <h5 class="report-title">Analisis Beban Proyek</h5>
      <div class="report-card-content">
        <dl class="detail-list report-card-details">
            <div class="category-title"><dt>Beban Proyek Utama (${mainProject?.projectName || '-'})</dt><dd></dd></div>
            ${generateBebanRowsHTML(totals.main)}
            <div class="summary-row">
                <dt>Total Beban Proyek Utama</dt>
                <dd class="negative" data-countup-to="${totalBebanMain}">- Rp 0</dd>
            </div>
            <div class="category-title"><dt>Beban Proyek Internal</dt><dd></dd></div>
            ${generateBebanRowsHTML(totals.internal)}
            <div class="summary-row">
                <dt>Total Beban Proyek Internal</dt>
                <dd class="negative" data-countup-to="${totalBebanInternal}">- Rp 0</dd>
            </div>
        </dl>
        <div class="report-card-chart">
          <canvas id="beban-utama-donut-chart"></canvas>
        </div>
      </div>
    `;
    setTimeout(() => {
        _renderMiniDonut('beban-utama-donut-chart', ['Material', 'Gaji', 'Operasional', 'Lainnya'], [totals.main.material.paid + totals.main.material.unpaid, totals.main.gaji.paid + totals.main.gaji.unpaid, totals.main.operasional.paid + totals.main.operasional.unpaid, totals.main.lainnya.paid + totals.main.lainnya.unpaid], ['#60a5fa', '#f59e0b', '#34d399', '#a78bfa']);
    }, 0);
    
    container.querySelectorAll('[data-countup-to]').forEach(el => countUpObserver.observe(el));
}  
async function _renderLaporanArusKas(container, reportData) {
    if (!container) return;
   
    const { incomes, fundingSources, allBills, inRange } = reportData;
    
    // ARUS KAS MASUK: Logika ini sudah benar.
    const kasMasukTermin = (incomes || []).reduce((sum, i) => sum + (i.amount || 0), 0);
    const kasMasukPinjaman = (fundingSources || []).reduce((sum, f) => sum + (f.totalAmount || 0), 0);
    const totalKasMasuk = kasMasukTermin + kasMasukPinjaman;
    
    // --- [LOGIKA BARU UNTUK ARUS KAS KELUAR] ---

    // 1. Ambil semua pembayaran individual dari antrean lokal (offline)
    const localPayments = await localDB.pending_payments.toArray();
    const paymentsInDateRange = localPayments.filter(p => inRange(p.date));

    // 2. Tambahkan pembayaran dari server (jika online)
    if (navigator.onLine) {
        for (const bill of allBills) {
            try {
                const paymentsSnap = await getDocs(query(collection(db, 'teams', TEAM_ID, 'bills', bill.id, 'payments')));
                paymentsSnap.forEach(doc => {
                    const payment = { ...doc.data(), billId: bill.id };
                    if (inRange(payment.date)) {
                        paymentsInDateRange.push(payment);
                    }
                });
            } catch (e) {
                console.warn(`Gagal mengambil pembayaran untuk bill ${bill.id}:`, e);
            }
        }
        for (const loan of fundingSources) {
             try {
                const paymentsSnap = await getDocs(query(collection(db, 'teams', TEAM_ID, 'funding_sources', loan.id, 'payments')));
                paymentsSnap.forEach(doc => {
                    const payment = { ...doc.data(), billId: loan.id }; // Gunakan billId untuk konsistensi
                    if (inRange(payment.date)) {
                        paymentsInDateRange.push(payment);
                    }
                });
            } catch (e) {
                 console.warn(`Gagal mengambil pembayaran untuk pinjaman ${loan.id}:`, e);
            }
        }
    }

    // 3. Kategorikan setiap pembayaran
    let kasKeluarMaterial = 0, kasKeluarGaji = 0, kasKeluarOperasional = 0, kasKeluarLainnya = 0, kasKeluarCicilanPinjaman = 0;

    for (const payment of paymentsInDateRange) {
        const parentBill = allBills.find(b => b.id === payment.billId);
        const parentLoan = fundingSources.find(l => l.id === payment.billId);

        if (parentBill) {
            switch(parentBill.type) {
                case 'material': kasKeluarMaterial += payment.amount; break;
                case 'gaji': kasKeluarGaji += payment.amount; break;
                case 'operasional': kasKeluarOperasional += payment.amount; break;
                default: kasKeluarLainnya += payment.amount; break;
            }
        } else if (parentLoan) {
            kasKeluarCicilanPinjaman += payment.amount;
        }
    }

    const totalKasKeluar = kasKeluarMaterial + kasKeluarGaji + kasKeluarOperasional + kasKeluarLainnya + kasKeluarCicilanPinjaman;
    const arusKasBersih = totalKasMasuk - totalKasKeluar;
    
    // 4. Render HTML dengan kategori baru
    container.innerHTML = `
      <h5 class="report-title">Arus Kas (Cash Flow)</h5>
      <div class="report-card-content">
        <dl class="detail-list report-card-details">
          <div class="category-title"><dt>Arus Kas Masuk</dt><dd></dd></div>
          <div class="sub-item"><dt>• Penerimaan Termin</dt><dd class="positive">${fmtIDR(kasMasukTermin)}</dd></div>
          <div class="sub-item"><dt>• Penerimaan Pinjaman</dt><dd class="positive">${fmtIDR(kasMasukPinjaman)}</dd></div>
          <div class="summary-row"><dt>Total Kas Masuk</dt><dd class="positive">${fmtIDR(totalKasMasuk)}</dd></div>
          
          <div class="category-title"><dt>Arus Kas Keluar (Pembayaran)</dt><dd></dd></div>
          <div class="sub-item"><dt>• Bayar Material</dt><dd class="negative">- ${fmtIDR(kasKeluarMaterial)}</dd></div>
          <div class="sub-item"><dt>• Bayar Gaji</dt><dd class="negative">- ${fmtIDR(kasKeluarGaji)}</dd></div>
          <div class="sub-item"><dt>• Bayar Operasional</dt><dd class="negative">- ${fmtIDR(kasKeluarOperasional)}</dd></div>
          <div class="sub-item"><dt>• Bayar Lainnya</dt><dd class="negative">- ${fmtIDR(kasKeluarLainnya)}</dd></div>
          <div class="sub-item"><dt>• Bayar Cicilan Pinjaman</dt><dd class="negative">- ${fmtIDR(kasKeluarCicilanPinjaman)}</dd></div>
          <div class="summary-row"><dt>Total Kas Keluar</dt><dd class="negative">- ${fmtIDR(totalKasKeluar)}</dd></div>
          
          <div class="summary-row final"><dt>Arus Kas Bersih</dt><dd class="${arusKasBersih >= 0 ? 'positive' : 'negative'}">${fmtIDR(arusKasBersih)}</dd></div>
        </dl>
        <div class="report-card-chart"><canvas id="arus-kas-donut-chart"></canvas></div>
      </div>
    `;
      
    _renderMiniDonut('arus-kas-donut-chart', ['Kas Masuk', 'Kas Keluar'], [totalKasMasuk, totalKasKeluar], ['#22c55e', '#ef4444']);     
    container.querySelectorAll('[data-countup-to]').forEach(el => countUpObserver.observe(el));
}

function _renderMiniDonut(canvasId, labels, data, colors) {
      const c = document.getElementById(canvasId);
      if (!c) return;
  
      if (c._chart) c._chart.destroy();
      
      c._chart = new Chart(c.getContext('2d'), {
          type: 'doughnut',
          data: { 
              labels: labels, 
              datasets: [{ 
                  data: data, 
                  backgroundColor: colors, 
                  borderWidth: 0,
                  hoverOffset: 8
              }] 
          },
          options: {
              responsive: true,
              maintainAspectRatio: false,
              cutout: '70%',
              // [PERBAIKAN] Tambahkan event handler onClick
              onClick: (evt, elements) => {
                  const chart = c._chart;
                  if (!elements.length) return;
  
                  const index = elements[0].index;
                  const label = chart.data.labels[index];
                  
                  // Logika untuk menentukan tipe dan kategori berdasarkan label
                  let type = 'expense';
                  let category = label.toLowerCase();
  
                  if (label.toLowerCase() === 'pemasukan') {
                      type = 'income';
                      category = null;
                  } else if (label.toLowerCase() === 'pengeluaran') {
                      type = 'expense';
                      category = null;
                  }
                  
                  _showChartDrillDownModal(label, type, category);
              },
              plugins: {
                  legend: { display: false },
                  tooltip: {
                      enabled: true,
                      callbacks: {
                          label: function(context) {
                              const total = context.chart.data.datasets[0].data.reduce((a, b) => a + b, 0);
                              const label = context.label || '';
                              const value = context.raw || 0;
                              const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                              return `${label}: ${percentage}%`;
                          }
                      }
                  }
              }
          }
      });
  }
  
  // [TAMBAHAN BARU] Fungsi untuk menampilkan modal rincian dari klik chart
  function _showChartDrillDownModal(title, type, category) {
      const { start, end } = appState.reportFilter || {};
      const inRange = (d) => {
          const dt = _getJSDate(d);
          if (start && dt < new Date(start + 'T00:00:00')) return false;
          if (end && dt > new Date(end + 'T23:59:59')) return false;
          return true;
      };
  
      let items = [];
      if (type === 'income') {
          items = (appState.incomes || []).filter(i => inRange(i.date));
      } else if (type === 'expense') {
          if (category === 'gaji') {
              items = (appState.bills || []).filter(b => b.type === 'gaji' && inRange(b.dueDate || b.createdAt)).map(b => ({
                  description: b.description || 'Gaji',
                  date: b.dueDate || b.createdAt || new Date(),
                  amount: b.amount || 0
              }));
          } else {
              items = (appState.expenses || []).filter(e => (!category || e.type === category) && inRange(e.date));
          }
      }
  
      const content = items.length ? 
          `<div class="dense-list-container">${items.map(it => `
              <div class="dense-list-item">
                  <div class="item-main-content">
                      <strong class="item-title">${it.description || (type==='income'?'Pemasukan':'Pengeluaran')}</strong>
                      <span class="item-subtitle">${_getJSDate(it.date).toLocaleDateString('id-ID')}</span>
                  </div>
                  <div class="item-actions"><strong class="${type==='income'?'positive':'negative'}">${fmtIDR(it.amount || 0)}</strong></div>
              </div>`).join('')}</div>` 
          : _getEmptyStateHTML({ icon:'insights', title:'Tidak Ada Data', desc:'Tidak ada transaksi pada periode ini.' });
  
      createModal('dataDetail', { title: `Rincian: ${title}`, content });
  }
  
  async function handleGenerateReportModal() {
    const reportTypeOptions = [{
        value: '',
        text: '-- Pilih Jenis Laporan --'
    }, {
        value: 'analisis_beban',
        text: 'Laporan Analisis Beban (PDF)'
    }, {
        value: 'rekapan',
        text: 'Rekapan Transaksi (PDF)'
    }, {
        value: 'upah_pekerja',
        text: 'Laporan Rinci Upah Pekerja (PDF)'
    }, {
        value: 'material_supplier',
        text: 'Laporan Rinci Material (PDF)'
    }, {
        value: 'material_usage_per_project',
        text: 'Laporan Pemakaian Material per Proyek (PDF)'
    }];
    const content = `
        <form id="report-generator-form">
            ${createMasterDataSelect('report-type-selector', 'Jenis Laporan', reportTypeOptions, '')}
            <div id="report-dynamic-filters"></div>
        </form>
    `;

    // Minimalist sticky footer action (full-width on mobile)
    const footer = `
        <button id="download-report-btn" class="btn btn-primary" disabled>
            <span class="material-symbols-outlined">download</span>
            <span>Unduh</span>
        </button>`;

    const modalEl = createModal('reportGenerator', {
        title: 'Buat Laporan Rinci',
        content,
        footer
    });

    if (modalEl) {
        _initCustomSelects(modalEl);
        const form = $('#report-generator-form', modalEl);
        const submitButton = $('#download-report-btn', modalEl);
        
        $('#report-type-selector', modalEl).addEventListener('change', (e) => {
            _renderDynamicReportFilters(e.target.value);
            submitButton.disabled = e.target.value === '';
        });
        
        // Minimalist action: use sticky footer button instead of form submit
        submitButton.addEventListener('click', (e) => {
            e.preventDefault();
            const reportType = $('#report-type-selector', modalEl).value;
            _handleDownloadReport('pdf', reportType);
        });
    }
}

async function _renderDynamicReportFilters(reportType) {
    const container = $('#report-dynamic-filters');
    container.innerHTML = '';
    const today = new Date();
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
    const todayStr = today.toISOString().slice(0, 10);
    let filtersHTML = '';
    if (reportType && reportType !== 'analisis_beban') {
        filtersHTML += `
                <div class="rekap-filters" style="padding:0; margin-top: 1rem;">
                    <div class="form-group"><label>Dari Tanggal</label><input type="date" id="report-start-date" value="${firstDayOfMonth}"></div>
                    <div class="form-group"><label>Sampai Tanggal</label><input type="date" id="report-end-date" value="${todayStr}"></div>
                </div>`;
    }
    if (reportType === 'rekapan') {
        await fetchAndCacheData('projects', projectsCol, 'projectName');
        const projectOptions = [{
            value: 'all',
            text: 'Semua Proyek'
        }, ...appState.projects.map(p => ({
            value: p.id,
            text: p.projectName
        }))];
        filtersHTML += createMasterDataSelect('report-project-id', 'Filter Proyek', projectOptions, 'all');
    } else if (reportType === 'material_supplier') {
        await fetchAndCacheData('suppliers', suppliersCol, 'supplierName');
        const supplierOptions = [{
            value: 'all',
            text: 'Semua Supplier'
        }, ...appState.suppliers.filter(s => s.category === 'Material').map(s => ({
            value: s.id,
            text: s.supplierName
        }))];
        filtersHTML += createMasterDataSelect('report-supplier-id', 'Filter Supplier', supplierOptions, 'all');
    } else if (reportType === 'material_usage_per_project') {
        await fetchAndCacheData('projects', projectsCol, 'projectName');
        const projectOptions = appState.projects.map(p => ({
            value: p.id,
            text: p.projectName
        }));
        // Tambahkan opsi "Pilih Proyek" sebagai placeholder
        projectOptions.unshift({
            value: '',
            text: '-- Pilih Proyek --'
        });
        filtersHTML += createMasterDataSelect('report-project-id', 'Pilih Proyek', projectOptions, '');
    }
    container.innerHTML = filtersHTML;
    _initCustomSelects(container);
  }
  
  async function _handleDownloadReport(format, reportType) { // async tetap dibutuhkan di sini
    if (format === 'csv') {
        toast('info', 'Fitur unduh CSV sedang dalam pengembangan.');
        return;
    }
    let reportConfig = {};
  
    switch (reportType) {
        case 'analisis_beban':
            reportConfig = await _prepareAnalisisBebanDataForPdf();
            break;
        case 'upah_pekerja':
            reportConfig = await _prepareUpahPekerjaDataForPdf();
            break;
        case 'material_supplier':
            reportConfig = await _prepareMaterialSupplierDataForPdf();
            break;
        case 'rekapan':
            reportConfig = await _prepareRekapanDataForPdf();
            break;
        case 'material_usage_per_project':
            reportConfig = await _prepareMaterialUsageDataForPdf();
            break;
        default:
            toast('error', 'Tipe laporan ini belum didukung.');
            return;
    }
  
    if (reportConfig && reportConfig.sections && reportConfig.sections.length > 0) {
        await generatePdfReport(reportConfig);
    } else {
        toast('info', 'Tidak ada data untuk ditampilkan pada kriteria yang dipilih.');
    }
  }
  
  async function _prepareUpahPekerjaDataForPdf() {
    const startDateStr = $('#report-start-date').value;
    const endDateStr = $('#report-end-date').value;

    if (!startDateStr || !endDateStr) {
        toast('error', 'Silakan pilih rentang tanggal laporan terlebih dahulu.');
        return null; // Hentikan proses jika tanggal kosong
    }

    const startDate = new Date(startDateStr);
    const endDate = new Date(endDateStr);
    endDate.setHours(23, 59, 59, 999);
    await Promise.all([fetchAndCacheData('workers', workersCol, 'workerName'), fetchAndCacheData('projects', projectsCol, 'projectName')]);
  
    const q = query(attendanceRecordsCol, where('date', '>=', startDate), where('date', '<=', endDate), where('status', '==', 'completed'), orderBy('date', 'asc'));
    const snap = await getDocs(q);
    if (snap.empty) return null;
    const bodyRows = snap.docs.map(doc => {
        const rec = doc.data();
        const worker = appState.workers.find(w => w.id === rec.workerId);
        const project = appState.projects.find(p => p.id === rec.projectId);
        let statusText = (rec.attendanceStatus === 'full_day')?'Hadir' : '1/2 Hari';
  
        return [_getJSDate(rec?.date).toLocaleDateString('id-ID'), worker?.workerName || '-', project?.projectName || '-', statusText, fmtIDR(rec.totalPay || 0), rec.isPaid?'Lunas' : 'Belum Dibayar'];
    });
    return {
        title: 'Laporan Rincian Upah Pekerja',
        subtitle: `Periode: ${startDate.toLocaleDateString('id-ID')} s/d ${endDate.toLocaleDateString('id-ID')}`,
        filename: `Laporan-Upah-${new Date().toISOString().slice(0, 10)}.pdf`,
        sections: [{
            headers: ["Tanggal", "Pekerja", "Proyek", "Status", "Upah", "Status Bayar"],
            body: bodyRows
        }]
    };
  }
  async function _prepareMaterialSupplierDataForPdf() {
    const startDateStr = $('#report-start-date').value;
    const endDateStr = $('#report-end-date').value;
    if (!startDateStr || !endDateStr) {
        toast('error', 'Silakan pilih rentang tanggal laporan terlebih dahulu.');
        return null; // Hentikan proses jika tanggal kosong
    }

    const startDate = new Date(startDateStr);
    const endDate = new Date(endDateStr);
    const supplierId = $('#report-supplier-id').value;
    endDate.setHours(23, 59, 59, 999);
  
    await Promise.all([fetchAndCacheData('suppliers', suppliersCol, 'supplierName'), fetchAndCacheData('projects', projectsCol, 'projectName')]);
    let queryConstraints = [where('type', '==', 'material'), where('date', '>=', startDate), where('date', '<=', endDate), orderBy('date', 'asc')];
    
    if (supplierId !== 'all') queryConstraints.push(where('supplierId', '==', supplierId));
  
    const q = query(expensesCol, ...queryConstraints);
    const snap = await getDocs(q);
    if (snap.empty) return null;
    const bodyRows = snap.docs.flatMap(doc => {
        const exp = doc.data();
        if (!exp.items || exp.items.length === 0) return [];
  
        const supplier = appState.suppliers.find(s => s.id === exp.supplierId);
        const project = appState.projects.find(p => p.id === exp.projectId);
        return exp.items.map(item => {
            const material = appState.materials.find(m => m.id === item.materialId);
            return [_getJSDate(exp.date).toLocaleDateString('id-ID'), supplier?.supplierName || '-', project?.projectName || '-', material?.materialName || '-', item.qty, fmtIDR(item.price), fmtIDR(item.total)];
        });
    });
    if (bodyRows.length === 0) return null;
    const supplierName = supplierId !== 'all'?appState.suppliers.find(s => s.id === supplierId)?.supplierName : 'Semua Supplier';
    return {
        title: 'Laporan Rincian Material per Supplier',
        subtitle: `Supplier: ${supplierName} | Periode: ${startDate.toLocaleDateString('id-ID')} s/d ${endDate.toLocaleDateString('id-ID')}`,
        filename: `Laporan-Material-${new Date().toISOString().slice(0, 10)}.pdf`,
        sections: [{
            headers: ["Tanggal", "Supplier", "Proyek", "Barang", "Qty", "Harga", "Total"],
            body: bodyRows
        }]
    };
  }
  async function _prepareRekapanDataForPdf() {
    const startDate = new Date($('#report-start-date').value);
    const endDate = new Date($('#report-end-date').value);
    const projectId = $('#report-project-id').value;
    endDate.setHours(23, 59, 59, 999);
  
    await Promise.all([fetchAndCacheData('incomes', incomesCol), fetchAndCacheData('expenses', expensesCol)]);
  
    let transactions = [];
    appState.incomes.forEach(i => transactions.push({
        date: _getJSDate(i.date),
        type: 'Pemasukan',
        description: 'Penerimaan Termin',
        amount: i.amount,
        projectId: i.projectId
    }));
    appState.expenses.forEach(e => transactions.push({
        date: _getJSDate(e.date),
        type: 'Pengeluaran',
        description: e.description,
        amount: -e.amount,
        projectId: e.projectId
    }));
  
    const filtered = transactions.filter(t => (projectId === 'all' || t.projectId === projectId) && (t.date >= startDate && t.date <= endDate)).sort((a, b) => a.date - b.date);
    if (filtered.length === 0) return null;
    let balance = 0;
    const bodyRows = filtered.map(t => {
        balance += t.amount;
        return [t.date.toLocaleDateString('id-ID'), t.description, t.amount > 0?fmtIDR(t.amount) : '-', t.amount < 0?fmtIDR(t.amount) : '-', fmtIDR(balance)];
    });
    const totalPemasukan = filtered.filter(t => t.amount > 0).reduce((sum, t) => sum + t.amount, 0);
    const totalPengeluaran = filtered.filter(t => t.amount < 0).reduce((sum, t) => sum + t.amount, 0);
    const footRow = ["Total", "", fmtIDR(totalPemasukan), fmtIDR(totalPengeluaran), fmtIDR(balance)];
    const projectName = projectId !== 'all'?appState.projects.find(p => p.id === projectId)?.projectName : 'Semua Proyek';
    return {
        title: 'Laporan Rekapan Transaksi',
        subtitle: `Proyek: ${projectName} | Periode: ${startDate.toLocaleDateString('id-ID')} s/d ${endDate.toLocaleDateString('id-ID')}`,
        filename: `Rekapan-${new Date().toISOString().slice(0, 10)}.pdf`,
        sections: [{
            headers: ["Tanggal", "Deskripsi", "Pemasukan", "Pengeluaran", "Saldo"],
            body: bodyRows,
            foot: footRow
        }]
    };
  }
  async function _prepareMaterialUsageDataForPdf() {
    const projectId = $('#report-project-id').value;
    if (!projectId) {
        toast('error', 'Silakan pilih proyek terlebih dahulu.');
        return null;
    }
    const q = query(stockTransactionsCol, where("type", "==", "out"), where("projectId", "==", projectId));
    const snap = await getDocs(q);
    if (snap.empty) return null;
    // Kelompokkan dan jumlahkan pemakaian per material
    const usageByMaterial = snap.docs.reduce((acc, doc) => {
        const trans = doc.data();
        if (!acc[trans.materialId]) {
            acc[trans.materialId] = {
                quantity: 0,
                ...appState.materials.find(m => m.id === trans.materialId)
            };
        }
        acc[trans.materialId].quantity += trans.quantity;
        return acc;
    }, {});
    const bodyRows = Object.values(usageByMaterial).map(item => {
        return [item.materialName, item.unit, item.quantity];
    });
    const projectName = appState.projects.find(p => p.id === projectId)?.projectName || '-';
    return {
        title: 'Laporan Pemakaian Material per Proyek',
        subtitle: `Proyek: ${projectName}`,
        filename: `Pemakaian-Material-${projectName.replace(/\s+/g, '-')}.pdf`,
        sections: [{
            headers: ["Nama Material", "Satuan", "Total Pemakaian"],
            body: bodyRows
        }]
    };
  }
  async function _prepareAnalisisBebanDataForPdf() {
    await Promise.all([fetchAndCacheData('projects', projectsCol), fetchAndCacheData('bills', billsCol)]);
    const totals = {
        main: {
            material: {
                paid: 0,
                unpaid: 0
            },
            operasional: {
                paid: 0,
                unpaid: 0
            },
            lainnya: {
                paid: 0,
                unpaid: 0
            },
            gaji: {
                paid: 0,
                unpaid: 0
            }
        },
        internal: {
            material: {
                paid: 0,
                unpaid: 0
            },
            operasional: {
                paid: 0,
                unpaid: 0
            },
            lainnya: {
                paid: 0,
                unpaid: 0
            },
            gaji: {
                paid: 0,
                unpaid: 0
            }
        }
    };
    const mainProject = appState.projects.find(p => p.projectType === 'main_income');
    const mainProjectId = mainProject?mainProject.id : null;
    appState.bills.forEach(bill => {
        const projectGroup = (bill.projectId === mainProjectId)?'main' : 'internal';
        if (totals[projectGroup] && totals[projectGroup][bill.type]) {
            totals[projectGroup][bill.type][bill.status] += (bill.amount || 0);
        }
    });
    const sections = [];
    const categories = [{
        key: 'material',
        label: 'Beban Material'
    }, {
        key: 'gaji',
        label: 'Beban Gaji'
    }, {
        key: 'operasional',
        label: 'Beban Operasional'
    }, {
        key: 'lainnya',
        label: 'Beban Lainnya'
    }];
    const mainProjectBody = categories.map(cat => {
        const data = totals.main[cat.key];
        const total = data.paid + data.unpaid;
        return [cat.label, fmtIDR(data.paid), fmtIDR(data.unpaid), fmtIDR(total)];
    }).filter(row => parseFormattedNumber(row[3]) > 0);
    const totalBebanMain = Object.values(totals.main).reduce((sum, cat) => sum + cat.paid + cat.unpaid, 0);
    if (mainProjectBody.length > 0) {
        sections.push({
            sectionTitle: `Proyek Utama (${mainProject?.projectName || '-'})`,
            headers: ["Kategori Beban", "Lunas", "Belum Lunas", "Total"],
            body: mainProjectBody,
            foot: ["Total Beban Proyek Utama", "", "", fmtIDR(totalBebanMain)]
        });
    }
    const internalProjectBody = categories.map(cat => {
        const data = totals.internal[cat.key];
        const total = data.paid + data.unpaid;
        return [cat.label, fmtIDR(data.paid), fmtIDR(data.unpaid), fmtIDR(total)];
    }).filter(row => parseFormattedNumber(row[3]) > 0);
    const totalBebanInternal = Object.values(totals.internal).reduce((sum, cat) => sum + cat.paid + cat.unpaid, 0);
    if (internalProjectBody.length > 0) {
        sections.push({
            sectionTitle: `Total Semua Proyek Internal`,
            headers: ["Kategori Beban", "Lunas", "Belum Lunas", "Total"],
            body: internalProjectBody,
            foot: ["Total Beban Proyek Internal", "", "", fmtIDR(totalBebanInternal)]
        });
    }
  
    const grandTotalBeban = totalBebanMain + totalBebanInternal;
    sections.push({
        sectionTitle: `Ringkasan Total`,
        headers: ["Deskripsi", "Jumlah"],
        body: [
            ['Total Beban Proyek Utama', fmtIDR(totalBebanMain)],
            ['Total Beban Proyek Internal', fmtIDR(totalBebanInternal)],
        ],
        foot: ["Grand Total Semua Beban", fmtIDR(grandTotalBeban)]
    });
    return {
        title: 'Laporan Analisis Beban',
        subtitle: `Ringkasan Total Keseluruhan`,
        filename: `Analisis-Beban-${new Date().toISOString().slice(0, 10)}.pdf`,
        sections: sections
    };
  }
async function generatePdfReport(config) {
    const {
        title,
        subtitle,
        filename,
        sections
    } = config;
  
    if (!sections || sections.length === 0) {
        toast('error', 'Data tidak lengkap untuk PDF.');
        return;
    }
  
    toast('syncing', 'Membuat laporan PDF...');
    try {
        if (!appState.pdfSettings) {
            const docSnap = await getDoc(settingsDocRef);
            if (docSnap.exists()) {
                appState.pdfSettings = docSnap.data();
            } else {
                appState.pdfSettings = {};
            }
        }
  
        const defaults = {
            companyName: 'CV. ALAM BERKAH ABADI',
            headerColor: '#26a69a'
        };
        const settings = { ...defaults,
            ...appState.pdfSettings
        };
  
        const {
            jsPDF
        } = window.jspdf;
        const pdf = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a4'
        });
        const totalPagesExp = '{total_pages_count_string}';
        let lastY = 0;
        const pageWidth = pdf.internal.pageSize.width;
  
        const hexToRgb = (hex) => {
            const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
            return result?[parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)] : [38, 166, 154];
        };
        const headerRgbColor = hexToRgb(settings.headerColor);
  
        if (logoData && logoData.startsWith('data:image')) {
            pdf.addImage(logoData, 'PNG', 14, 12, 22, 22);
        }
  
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(14);
        pdf.setTextColor(44, 62, 80);
        pdf.text(settings.companyName, 40, 18);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(10);
        pdf.text(title, 40, 24);
        if (subtitle) {
            pdf.setFontSize(9);
            pdf.setTextColor(100, 100, 100);
            pdf.text(subtitle, 40, 29);
        }
        pdf.setDrawColor(220, 220, 220);
        pdf.line(14, 38, pageWidth - 14, 38);
        lastY = 45;
  
        const didDrawPage = (data) => {
            pdf.setFontSize(8);
            pdf.setTextColor(150, 150, 150);
            pdf.text(`Halaman ${data.pageNumber} dari ${totalPagesExp}`, 14, pdf.internal.pageSize.height - 10);
            const reportDate = new Date().toLocaleString('id-ID', {
                dateStyle: 'long',
                timeStyle: 'short'
            });
            pdf.text(`Dicetak: ${reportDate}`, pageWidth - 14, pdf.internal.pageSize.height - 10, {
                align: 'right'
            });
        };
  
        const tableConfig = {
            theme: 'grid',
            headStyles: {
                fillColor: headerRgbColor,
                textColor: 255,
                fontStyle: 'bold'
            },
            footStyles: {
                fillColor: [41, 128, 185],
                textColor: 255,
                fontStyle: 'bold'
            },
            alternateRowStyles: {
                fillColor: [245, 245, 245]
            },
            styles: {
                fontSize: 8,
                cellPadding: 2.5,
                valign: 'middle'
            },
        };
  
        sections.forEach((section, index) => {
            if (section.sectionTitle) {
                if (index > 0) lastY += 10;
                pdf.setFontSize(11).setFont(undefined, 'bold');
                pdf.setTextColor(44, 62, 80);
                pdf.text(section.sectionTitle, 14, lastY);
                lastY += 5;
            }
            pdf.autoTable({
                ...tableConfig,
                head: [section.headers],
                body: section.body,
                // [PERBAIKAN KUNCI DI SINI] Menghapus array tambahan yang membungkus section.foot
                foot: section.foot || [], 
                startY: lastY,
                didDrawPage: didDrawPage,
                margin: {
                    top: 40
                }
            });
            lastY = pdf.autoTable.previous.finalY;
        });
  
        if (typeof pdf.putTotalPages === 'function') {
            pdf.putTotalPages(totalPagesExp);
        }
  
        pdf.save(filename);
        toast('success', 'PDF berhasil dibuat!');
    } catch (error) {
        console.error("Gagal membuat PDF:", error);
        toast('error', 'Terjadi kesalahan saat membuat PDF.');
    }
  }
  
  function _prepareSimulasiData() {
    const allItems = [];
    let totalAlokasi = 0;

    appState.simulasiState.selectedPayments.forEach((amount, id) => {
        // [PERBAIKAN KUNCI 1] Cara baru yang lebih aman untuk memisahkan ID
        const firstHyphenIndex = id.indexOf('-');
        if (firstHyphenIndex === -1) return; // Lewati jika format ID salah
        const itemType = id.substring(0, firstHyphenIndex);
        const itemId = id.substring(firstHyphenIndex + 1);

        let details = {};

        if (itemType === 'bill') {
            const bill = appState.bills.find(b => b.id === itemId);
            if (!bill) return;

            const expense = appState.expenses.find(e => e.id === bill.expenseId);
            const project = appState.projects.find(p => p.id === (expense?.projectId || bill.projectId));

            details = {
                projectName: project?.projectName || 'Tanpa Proyek',
                description: bill.description,
                amount: amount,
                category: bill.type || 'lainnya',
            };

            if (bill.type === 'gaji') {
                const worker = appState.workers.find(w => w.id === bill.workerId);
                details.recipient = worker?.workerName || 'Pekerja';
            } else if (bill.type === 'fee') {
                const staff = appState.staff.find(s => s.id === bill.staffId);
                details.recipient = staff?.staffName || 'Staf';
            } else {
                const supplier = appState.suppliers.find(s => s.id === expense?.supplierId);
                details.recipient = supplier?.supplierName || 'Supplier';
            }

        } else if (itemType === 'loan') {
            const loan = appState.fundingSources.find(l => l.id === itemId);
            if (!loan) return;
            const creditor = appState.fundingCreditors.find(c => c.id === loan.creditorId);
            details = {
                projectName: 'Tanpa Proyek',
                description: 'Cicilan Pinjaman',
                amount: amount,
                category: 'pinjaman',
                recipient: creditor?.creditorName || 'Kreditur',
            };
        }

        if (Object.keys(details).length > 0) {
            allItems.push(details);
            totalAlokasi += amount;
        }
    });

    const categoryLabels = {
        gaji: 'Gaji Pekerja', fee: 'Fee Staf', material: 'Tagihan Material',
        operasional: 'Tagihan Operasional', lainnya: 'Tagihan Lainnya', pinjaman: 'Cicilan Pinjaman'
    };
    
    const groupedByCategory = allItems.reduce((acc, item) => {
        const categoryKey = item.category || 'lainnya';
        if (!acc[categoryKey]) {
            acc[categoryKey] = {
                categoryName: categoryLabels[categoryKey] || categoryKey.toUpperCase(),
                items: [],
                total: 0
            };
        }
        acc[categoryKey].items.push(item);
        acc[categoryKey].total += item.amount;
        return acc;
    }, {});
    
    return {
        groupedByCategory,
        totalAlokasi
    };
}

async function _createSimulasiPDF() {
    const danaMasuk = parseFormattedNumber($('#simulasi-dana-masuk').value);
    if (danaMasuk <= 0 || appState.simulasiState.selectedPayments.size === 0) {
        toast('error', 'Isi dana masuk dan pilih minimal satu tagihan.');
        return;
    }

    toast('syncing', 'Mempersiapkan Laporan PDF...');

    try {
        const { jsPDF } = window.jspdf;
        if (!jsPDF) throw new Error('Library PDF belum siap.');

        const { groupedByCategory, totalAlokasi } = _prepareSimulasiData();
        const sisaDana = danaMasuk - totalAlokasi;

        const sections = [];

        // Bagian 1: Ringkasan Global
        // [PERBAIKAN KUNCI 2] Menyederhanakan format data untuk menghindari error [object Object]
        sections.push({
            sectionTitle: 'Ringkasan Alokasi Dana',
            headers: ['Deskripsi', 'Jumlah'],
            body: [
                ['Dana Masuk (Uang di Tangan)', fmtIDR(danaMasuk)],
                ['Total Alokasi Pembayaran', fmtIDR(totalAlokasi)]
            ],
            foot: [['Sisa Dana', fmtIDR(sisaDana)]]
        });

        // Bagian 2: Rincian detail untuk setiap Kategori
        const categoryLabels = {
            gaji: 'Gaji Pekerja', fee: 'Fee Staf', material: 'Tagihan Material',
            operasional: 'Tagihan Operasional', lainnya: 'Tagihan Lainnya', pinjaman: 'Cicilan Pinjaman'
        };

        for (const categoryKey in groupedByCategory) {
            const categoryData = groupedByCategory[categoryKey];
            
            const bodyRows = categoryData.items.map(item => {
                const description = `${item.description} (${item.projectName})`;
                return [
                    item.recipient,
                    description,
                    { content: fmtIDR(item.amount), styles: { halign: 'right' } }
                ];
            });
            
            sections.push({
                sectionTitle: `Rincian Alokasi: ${categoryData.categoryName}`,
                headers: ['Penerima', 'Deskripsi (Proyek)', { content: 'Jumlah', styles: { halign: 'right' } }],
                body: bodyRows,
                foot: [['Total Kategori', '', { content: fmtIDR(categoryData.total), styles: { halign: 'right' } }]]
            });
        }

        generatePdfReport({
            title: 'Laporan Simulasi Alokasi Dana',
            subtitle: `Dibuat pada: ${new Date().toLocaleDateString('id-ID', {day:'numeric', month:'long', year:'numeric'})}`,
            filename: `Simulasi-Alokasi-Dana-${new Date().toISOString().slice(0, 10)}.pdf`,
            sections: sections
        });

    } catch (error) {
        toast('error', 'Gagal membuat PDF. Coba lagi.');
        console.error("Gagal membuat PDF Simulasi:", error);
    }
}
function _getKwitansiHTML(data) {
      const terbilang = (n) => {
          const bilangan = ["", "satu", "dua", "tiga", "empat", "lima", "enam", "tujuh", "delapan", "sembilan", "sepuluh", "sebelas"];
          if (n < 12) return bilangan[n];
          if (n < 20) return terbilang(n - 10) + " belas";
          if (n < 100) return terbilang(Math.floor(n / 10)) + " puluh " + terbilang(n % 10);
          if (n < 200) return "seratus " + terbilang(n - 100);
          if (n < 1000) return terbilang(Math.floor(n / 100)) + " ratus " + terbilang(n % 100);
          if (n < 2000) return "seribu " + terbilang(n - 1000);
          if (n < 1000000) return terbilang(Math.floor(n / 1000)) + " ribu " + terbilang(n % 1000);
          if (n < 1000000000) return terbilang(Math.floor(n / 1000000)) + " juta " + terbilang(n % 1000000);
          return "";
      };
      const jumlahTerbilang = (terbilang(data.jumlah).trim() + " rupiah").replace(/\s+/g, ' ').replace(/^\w/, c => c.toUpperCase());
      return `
          <div class="kwitansi-container">
              <div class="kwitansi-header">
                  <h3>KWITANSI</h3>
                  <div class="kwitansi-nomor">No: ${data.nomor}</div>
              </div>
              <div class="kwitansi-body">
                  <dl>
                      <div><dt>Telah diterima dari</dt><dd>: CV. ALAM BERKAH ABADI</dd></div>
                      <div><dt>Uang Sejumlah</dt><dd class="terbilang">: ${jumlahTerbilang}</dd></div>
                      <div><dt>Untuk Pembayaran</dt><dd>: ${data.deskripsi}</dd></div>
                  </dl>
              </div>
              <div class="kwitansi-footer">
                  <div class="kwitansi-jumlah-box">${fmtIDR(data.jumlah)}</div>
                  <div class="kwitansi-ttd">
                      <p>Cijiwa, ${data.tanggal}</p>
                      <p class="penerima">Penerima,</p>
                      <p class="nama-penerima">${data.namaPenerima}</p>
                  </div>
              </div>
          </div>
      `;
  }

async function handleCetakKwitansi(billId) {
    toast('syncing', 'Mempersiapkan kwitansi...');
    const bill = appState.bills.find(b => b.id === billId);
    if (!bill) {
        toast('error', 'Data tagihan tidak ditemukan.');
        return;
    }
    let recipientName = '-';
    if (bill.type === 'gaji') {
        if (bill.workerDetails && bill.workerDetails.length === 1) {
            recipientName = bill.workerDetails[0].name;
        } else if (bill.workerDetails && bill.workerDetails.length > 1) {
            recipientName = "Beberapa Pekerja";
        } else {
            const worker = appState.workers.find(w => w.id === bill.workerId);
            recipientName = worker?.workerName || 'Pekerja Dihapus';
        }
    } else if (bill.expenseId) {
        const expense = appState.expenses.find(e => e.id === bill.expenseId);
        const supplier = expense ? appState.suppliers.find(s => s.id === expense.supplierId) : null;
        recipientName = supplier?.supplierName || 'Supplier';
    }

    const __paidAtDate = bill.paidAt ? _getJSDate(bill.paidAt) : new Date();
    const kwitansiData = {
        nomor: `KW-${bill.id.substring(0, 5).toUpperCase()}`,
        tanggal: __paidAtDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }),
        namaPenerima: recipientName,
        jumlah: bill.amount,
        deskripsi: bill.description,
        isLunas: (bill.status === 'paid') || Math.max(0, (bill.amount || 0) - (bill.paidAmount || 0)) === 0,
        date: __paidAtDate.toISOString(),
        recipient: recipientName,
        amount: bill.amount,
        totalTagihan: bill.amount || 0,
        sisaTagihan: Math.max(0, (bill.amount || 0) - (bill.paidAmount || 0)),
    };

    const contentHTML = `
        <div id="kwitansi-printable-area" style="position: relative;">
            ${_getUniversalKwitansiHTML(kwitansiData)}
            <div class="kwitansi-actions">
                <button class="btn-icon" data-action="download-image" title="Unduh sebagai Gambar">
                    <span class="material-symbols-outlined">image</span>
                </button>
                <button class="btn-icon" data-action="download-pdf" title="Unduh sebagai PDF">
                    <span class="material-symbols-outlined">picture_as_pdf</span>
                </button>
            </div>
        </div>`;

    const footerHTML = `<button class="btn btn-secondary" data-close-modal>Tutup</button>`;

    const modal = createModal('dataDetail', {
        title: kwitansiData.isLunas ? 'Kwitansi Pelunasan' : 'Tanda Terima Pembayaran',
        content: contentHTML,
        footer: footerHTML
    });

    hideToast();

    const context = modal || document.getElementById('detail-pane');
    if (context) {
        context.querySelector('[data-action="download-image"]').addEventListener('click', () => _downloadUniversalKwitansiAsImage(kwitansiData));
        context.querySelector('[data-action="download-pdf"]').addEventListener('click', () => _downloadUniversalKwitansiAsPDF(kwitansiData));
    }
}
async function handleCetakKwitansiIndividu(dataset) {
    const { billId, workerId } = dataset;
    toast('syncing', 'Mempersiapkan kwitansi...');
    
    const bill = appState.bills.find(b => b.id === billId);
    if (!bill || !bill.workerDetails) {
        toast('error', 'Data tagihan gabungan tidak ditemukan.');
        return;
    }

    const workerDetail = bill.workerDetails.find(w => w.id === workerId || w.workerId === workerId);
    if (!workerDetail) {
        toast('error', 'Data pekerja di tagihan ini tidak ditemukan.');
        return;
    }

    const __paidAtDate = bill.paidAt ? _getJSDate(bill.paidAt) : new Date();
    const kwitansiData = {
        nomor: `KW-G-${bill.id.substring(0, 4)}-${workerId.substring(0, 4)}`.toUpperCase(),
        tanggal: __paidAtDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }),
        namaPenerima: workerDetail.name,
        jumlah: workerDetail.amount,
        deskripsi: `Pembayaran ${bill.description}`,
        isLunas: true,
        date: __paidAtDate.toISOString(),
        recipient: workerDetail.name,
        amount: workerDetail.amount,
        totalTagihan: workerDetail.amount,
        sisaTagihan: 0,
    };

    const contentHTML = `
        <div id="kwitansi-printable-area" style="position: relative;">
            ${_getUniversalKwitansiHTML(kwitansiData)}
            <div class="kwitansi-actions">
                <button class="btn-icon" data-action="download-image" title="Unduh sebagai Gambar">
                    <span class="material-symbols-outlined">image</span>
                </button>
                <button class="btn-icon" data-action="download-pdf" title="Unduh sebagai PDF">
                    <span class="material-symbols-outlined">picture_as_pdf</span>
                </button>
            </div>
        </div>`;
        
    const footerHTML = `<button class="btn btn-secondary" data-close-modal>Tutup</button>`;

    const modal = createModal('dataDetail', {
        title: 'Kwitansi Pembayaran Pekerja',
        content: contentHTML,
        footer: footerHTML
    });

    hideToast();

    const context = modal || document.getElementById('detail-pane');
    if (context) {
        context.querySelector('[data-action="download-image"]').addEventListener('click', () => _downloadUniversalKwitansiAsImage(kwitansiData));
        context.querySelector('[data-action="download-pdf"]').addEventListener('click', () => _downloadUniversalKwitansiAsPDF(kwitansiData));
    }
}
async function handleCetakKwitansiKolektif(dataset) {
    const { billId } = dataset;
    toast('syncing', 'Mengumpulkan data pembayaran...');

    const bill = appState.bills.find(b => b.id === billId);
    if (!bill || !bill.workerDetails) {
        toast('error', 'Data tagihan gabungan tidak ditemukan.');
        return;
    }

    let allPaymentsForBill = [];
    try {
        if (navigator.onLine) {
            const paymentsSnap = await getDocs(collection(db, 'teams', TEAM_ID, 'bills', billId, 'payments'));
            allPaymentsForBill.push(...paymentsSnap.docs.map(d => d.data()));
        }
        const queuedPayments = await localDB.pending_payments.where({ billId }).toArray();
        allPaymentsForBill.push(...queuedPayments);
    } catch (e) {
        toast('error', 'Gagal mengambil riwayat pembayaran.');
        console.error("Gagal fetch payments:", e);
        return;
    }

    if (allPaymentsForBill.length === 0) {
        toast('info', 'Belum ada pembayaran yang tercatat untuk tagihan ini.');
        return;
    }

    const paymentsByWorker = allPaymentsForBill.reduce((acc, payment) => {
        if (payment.workerId) {
            acc[payment.workerId] = (acc[payment.workerId] || 0) + payment.amount;
        }
        return acc;
    }, {});
    
    const allKwitansiData = Object.keys(paymentsByWorker).map(workerId => {
        const workerDetail = bill.workerDetails.find(w => (w.id === workerId || w.workerId === workerId));
        if (!workerDetail) return null; // Lewati jika pekerja tidak ada di detail tagihan ini

        const totalGajiPeriodeIni = workerDetail.amount;
        const totalSudahDibayar = paymentsByWorker[workerId];
        const sisaTagihan = totalGajiPeriodeIni - totalSudahDibayar;

        return {
            nomor: `KW-G-${bill.id.substring(0, 4)}-${workerId.substring(0, 4)}`.toUpperCase(),
            tanggal: new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }),
            namaPenerima: workerDetail.name,
            jumlahDibayar: totalSudahDibayar, // Ini adalah jumlah total yang sudah dibayar
            totalGaji: totalGajiPeriodeIni,
            sisaTagihan: sisaTagihan,
            deskripsi: `Pembayaran Gaji (Periode: ${new Date(bill.description.split(' ').pop()).toLocaleDateString('id-ID')})`
        };
    }).filter(Boolean); // Menghapus entri null jika ada

    if (allKwitansiData.length === 0) {
        toast('info', 'Tidak ada pembayaran yang cocok untuk dicetak.');
        return;
    }

    await _downloadKwitansiKolektifAsPDF(allKwitansiData, bill);
    hideToast();
}

async function _downloadKwitansiKolektifAsPDF(allData, bill) {
    try {
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a6' });

        allData.forEach((data, index) => {
            if (index > 0) {
                pdf.addPage();
            }
            
            const margin = 10;
            let y = 15;

            pdf.setFont('Courier', 'bold').setFontSize(16).text('KWITANSI', margin, y);
            pdf.setFont('Courier', 'normal').setFontSize(9).text(`No: ${data.nomor}`, pdf.internal.pageSize.getWidth() - margin, y, { align: 'right' });
            y += 7;
            pdf.setLineWidth(0.5).line(margin, y, pdf.internal.pageSize.getWidth() - margin, y);
            y += 8;

            pdf.setFontSize(10);
            pdf.text('Telah diterima dari', margin, y);
            pdf.text(': CV. ALAM BERKAH ABADI', margin + 35, y);
            y += 7;
            
            pdf.text('Uang Sejumlah', margin, y);
            pdf.setFont('Courier', 'bold').text(`: ${fmtIDR(data.jumlahDibayar)}`, margin + 35, y);
            y += 7;

            pdf.setFont('Courier', 'normal');
            pdf.text('Untuk Pembayaran', margin, y);
            const deskripsiLines = pdf.splitTextToSize(data.deskripsi, pdf.internal.pageSize.getWidth() - (margin + 40));
            pdf.text(deskripsiLines, margin + 35, y);
            y += (deskripsiLines.length * 5) + 5;

            pdf.setLineDashPattern([1, 1], 0); // Garis putus-putus
            pdf.line(margin, y, pdf.internal.pageSize.getWidth() - margin, y);
            pdf.setLineDashPattern([], 0); // Kembali ke garis solid
            y += 6;

            pdf.setFontSize(9);
            pdf.text('Total Upah Periode Ini', margin, y);
            pdf.text(`: ${fmtIDR(data.totalGaji)}`, margin + 45, y);
            y += 5;
            pdf.text('Jumlah Dibayar', margin, y);
            pdf.setFont('Courier', 'bold').text(`: ${fmtIDR(data.jumlahDibayar)}`, margin + 45, y);
            y += 5;
            pdf.setFont('Courier', 'normal');
            pdf.text('Sisa Tagihan', margin, y);
            pdf.setFont('Courier', 'bold').text(`: ${fmtIDR(data.sisaTagihan)}`, margin + 45, y);
            y += 8;

            const ttdX = pdf.internal.pageSize.getWidth() - margin;
            pdf.setFontSize(10).setFont('Courier', 'normal');
            pdf.text(`Cijiwa, ${data.tanggal}`, ttdX, y, { align: 'right' });
            y += 15;
            pdf.text('Penerima,', ttdX, y, { align: 'right' });
            y += 18;
            pdf.setFont('Courier', 'bold').text(data.namaPenerima, ttdX, y, { align: 'right' });
        });
        
        pdf.save(`Kwitansi-Kolektif-Terbayar-${bill.id.substring(0, 8)}.pdf`);
        toast('success', `${allData.length} kwitansi berhasil dibuat!`);

    } catch (error) {
        console.error("Gagal membuat PDF Kolektif:", error);
        toast('error', 'Terjadi kesalahan saat membuat PDF.');
    }
}

async function handlePayIndividualSalaryModal(dataset) {
    const { billId, workerId } = dataset;
    const bill = appState.bills.find(b => b.id === billId);
    const workerDetail = bill?.workerDetails.find(w => w.id === workerId || w.workerId === workerId); // Penyesuaian untuk ID
    if (!workerDetail) {
        toast('error', 'Data pekerja tidak ditemukan.');
        return;
    }

    // Hitung sisa gaji untuk pekerja ini
    let paidByWorker = 0;
    try {
        if (navigator.onLine) {
            const paymentsColRef = collection(db, 'teams', TEAM_ID, 'bills', billId, 'payments');
            const paymentsSnap = await getDocs(query(paymentsColRef, where("workerId", "==", workerId)));
            paidByWorker += paymentsSnap.docs.map(d => d.data().amount || 0).reduce((sum, amount) => sum + amount, 0);
        }
        const queued = await localDB.pending_payments.where({ billId, workerId }).toArray();
        paidByWorker += (queued || []).reduce((s, p) => s + (p.amount || 0), 0);

    } catch (e) {
        console.warn('Gagal menghitung pembayaran sebelumnya untuk pekerja:', e);
    }

    const totalForWorker = workerDetail.amount || 0;
    const remaining = Math.max(0, totalForWorker - paidByWorker);
    const amountFormatted = new Intl.NumberFormat('id-ID').format(remaining);
    const todayString = new Date().toISOString().slice(0, 10);

    // [DESAIN BARU] Mengadopsi struktur HTML dari handlePayBillModal
    const content = `
        <div class="payment-modal-header">
            <span class="label">Sisa Gaji</span>
            <strong class="payment-main-amount" id="payment-remaining-amount" data-raw-amount="${remaining}">
                ${fmtIDR(remaining)}
            </strong>
        </div>

        <div class="quick-pay-actions">
            <button type="button" class="btn btn-secondary" data-action="set-payment-full">Bayar Lunas</button>
            <button type="button" class="btn btn-secondary" data-action="set-payment-half">Bayar Setengah</button>
        </div>

        <form id="payment-form" data-type="individual-salary" data-bill-id="${billId}" data-worker-id="${workerId}">
            <div class="payment-form-body">
                <div class="form-group">
                    <label>Jumlah Pembayaran</label>
                    <input type="text" name="amount" id="payment-input-amount" inputmode="numeric" required value="${amountFormatted}">
                </div>
                <div class="form-group">
                    <label>Tanggal Pembayaran</label>
                    <input type="date" name="date" value="${todayString}" required>
                </div>
                <div class="form-group">
                    <label>Lampiran (Opsional)</label>
                    <input type="file" name="paymentAttachment" accept="image/*" class="hidden-file-input" data-target-display="payment-attachment-display">
                    <div class="upload-buttons">
                        <button type="button" class="btn btn-secondary" data-action="trigger-file-input" data-target="paymentAttachment"><span class="material-symbols-outlined">attach_file</span> Pilih File</button>
                    </div>
                    <div class="file-name-display" id="payment-attachment-display">Belum ada file dipilih</div>
                </div>
            </div>
            <div class="form-footer-actions">
                <button type="submit" class="btn btn-primary" form="payment-form">
                    <span class="material-symbols-outlined">payment</span> Konfirmasi Pembayaran
                </button>
            </div>
        </form>
    `;

    const footer = `<button type="button" class="btn btn-secondary" data-close-modal>Batal</button>`;

    createModal('payment', {
        title: `Bayar Gaji: ${workerDetail.name}`,
        content: content,
        footer: footer,
        paymentType: 'individual-salary'
    });
}

async function _processIndividualSalaryPayment(bill, workerDetail, amountToPayOverride) {
      if (!navigator.onLine) {
          try {
              const local = await localDB.bills.where('id').equals(bill.id).first();
              const baseAmount = local?.amount ?? bill.amount ?? 0;
              const currentPaid = local?.paidAmount ?? bill.paidAmount ?? 0;
              const amountToPay = amountToPayOverride || workerDetail.amount;
              const newPaidAmount = currentPaid + amountToPay;
              const isPaid = newPaidAmount >= baseAmount;
              if (local) {
                  await localDB.bills.update(local.localId, {
                      paidAmount: newPaidAmount,
                      status: isPaid?'paid' : 'unpaid',
                      ...(isPaid?{
                          paidAt: new Date()
                      } : {}),
                      needsSync: 1
                  });
              } else {
                  await localDB.bills.add({
                      id: bill.id,
                      expenseId: bill.expenseId || null,
                      amount: baseAmount,
                      dueDate: bill.dueDate || new Date(),
                      status: isPaid?'paid' : 'unpaid',
                      type: bill.type,
                      projectId: bill.projectId || null,
                      paidAmount: newPaidAmount,
                      needsSync: 1
                  });
              }
              await localDB.pending_payments.add({
                  billId: bill.id,
                  amount: amountToPay,
                  date: new Date(),
                  workerId: workerDetail.id,
                  workerName: workerDetail.name,
                  createdAt: new Date()
              });
              _logActivity(`Membayar Gaji Individual (Offline): ${workerDetail.name}`, {
                  billId: bill.id,
                  amount: amountToPay
              });
              // [IMPROVE-UI/UX]: clearer offline feedback
              toast('info', 'Info: Offline. Data disimpan di perangkat & akan disinkronkan nanti.');
              await loadAllLocalDataToState();
              closeModal($('#dataDetail-modal'));
              handleOpenBillDetail(bill.id, null);
              return;
          } catch (e) {
              toast('error', 'Gagal menyimpan pembayaran offline.');
              console.error(e);
              return;
          }
      }
      toast('syncing', 'Memproses pembayaran...');
      try {
          const billRef = doc(billsCol, bill.id);
          await runTransaction(db, async (transaction) => {
              const billSnap = await transaction.get(billRef);
              if (!billSnap.exists()) throw new Error("Tagihan tidak ditemukan");
              const billData = billSnap.data();
              const amountToPay = amountToPayOverride || workerDetail.amount;
              const newPaidAmount = (billData.paidAmount || 0) + amountToPay;
              const isFullyPaid = newPaidAmount >= billData.amount;
  
              transaction.update(billRef, {
                  paidAmount: increment(amountToPay),
                  status: isFullyPaid?'paid' : 'unpaid',
                  rev: (billData.rev || 0) + 1,
                  ...(isFullyPaid && {
                      paidAt: serverTimestamp()
                  })
              });
              const paymentRef = doc(collection(billRef, 'payments'));
              transaction.set(paymentRef, {
                  amount: amountToPay,
                  date: Timestamp.now(),
                  workerId: workerDetail.id,
                  workerName: workerDetail.name,
                  createdAt: serverTimestamp()
              });
          });
          _logActivity(`Membayar Gaji Individual: ${workerDetail.name}`, {
              billId: bill.id,
              amount: amountToPayOverride || workerDetail.amount
          });
          toast('success', 'Pembayaran berhasil dicatat.');
          // Muat ulang data & buka kembali modal
          await fetchAndCacheData('bills', billsCol);
          closeModal($('#dataDetail-modal'));
          handleOpenBillDetail(bill.id, null);
      } catch (error) {
          toast('error', `Gagal memproses pembayaran.`);
          console.error('Individual Salary Payment error:', error);
      }
  }
async function handleProcessIndividualSalaryPayment(form) {
    const billId = form.dataset.billId;
    const workerId = form.dataset.workerId;
    const amountToPay = parseFormattedNumber(form.elements.amount.value);
    const dateInput = new Date(form.elements.date.value);
    const now = new Date();
    const date = new Date(dateInput.getFullYear(), dateInput.getMonth(), dateInput.getDate(), now.getHours(), now.getMinutes(), 0, 0);
    if (amountToPay <= 0) {
        toast('error', 'Jumlah pembayaran harus lebih dari nol.');
        return;
    }
    const bill = appState.bills.find(b => b.id === billId);
    const workerDetail = bill?.workerDetails.find(w => w.id === workerId);
    if (!bill || !workerDetail) {
        toast('error', 'Data tidak ditemukan.');
        return;
    }

    const fallbackToLocal = async () => {
        try {
            let localAttachmentId = null;
            const file = form.elements.paymentAttachment?.files?.[0];
            if (file) {
                const compressed = await _compressImage(file, 0.85, 1280);
                const blob = compressed || file;
                localAttachmentId = `payment-${billId}-${workerId}-${Date.now()}`;
                await localDB.files.put({ id: localAttachmentId, file: blob, addedAt: new Date(), size: blob.size || 0 });
                await _enforceLocalFileStorageLimit();
            }
            const local = await localDB.bills.where('id').equals(bill.id).first();
            const baseAmount = local?.amount ?? bill.amount ?? 0;
            const currentPaid = local?.paidAmount ?? bill.paidAmount ?? 0;
            const newPaidAmount = currentPaid + amountToPay;
            const isPaid = newPaidAmount >= baseAmount;
            if (local) {
                await localDB.bills.update(local.localId, {
                    paidAmount: newPaidAmount, status: isPaid ? 'paid' : 'unpaid',
                    ...(isPaid ? { paidAt: date } : {}), needsSync: 1
                });
            } else {
                await localDB.bills.add({
                    id: bill.id, expenseId: bill.expenseId || null, amount: baseAmount,
                    dueDate: bill.dueDate || new Date(), status: isPaid ? 'paid' : 'unpaid', type: bill.type,
                    projectId: bill.projectId || null, paidAmount: newPaidAmount,
                    ...(isPaid ? { paidAt: date } : {}), needsSync: 1
                });
            }
            await localDB.pending_payments.add({
                billId: bill.id, amount: amountToPay, date, workerId: workerDetail.id,
                workerName: workerDetail.name, localAttachmentId, createdAt: new Date()
            });
            _logActivity(`Membayar Gaji Individual (Offline): ${workerDetail.name}`, { billId, amount: amountToPay });
            toast('info', 'Info: Offline atau kuota habis. Data disimpan di perangkat.');
            await loadAllLocalDataToState();
            closeModal($('#payment-modal'));
            closeModal($('#dataDetail-modal'));
            handleOpenBillDetail(bill.id, null);
        } catch (e) {
            console.error(e);
            toast('error', 'Gagal menyimpan pembayaran offline.');
        }
    };
    
    if (!navigator.onLine || _isQuotaExceeded()) {
        return fallbackToLocal();
    }
    
    toast('syncing', 'Memproses pembayaran...');

    const writeOperation = async () => {
        const billRef = doc(billsCol, bill.id);
        let attachmentUrl = null;
        const file = form.elements.paymentAttachment?.files?.[0];
        if (file) {
            attachmentUrl = await _uploadFileToCloudinary(file);
        }
        await runTransaction(db, async (transaction) => {
            const billSnap = await transaction.get(billRef);
            if (!billSnap.exists()) throw new Error('Tagihan tidak ditemukan');
            const billData = billSnap.data();
            const newPaidAmount = (billData.paidAmount || 0) + amountToPay;
            const isFullyPaid = newPaidAmount >= billData.amount;
            transaction.update(billRef, {
                paidAmount: increment(amountToPay), status: isFullyPaid ? 'paid' : 'unpaid',
                rev: (billData.rev || 0) + 1, ...(isFullyPaid && { paidAt: serverTimestamp() })
            });
            const paymentRef = doc(collection(billRef, 'payments'));
            const paymentData = {
                amount: amountToPay, date: Timestamp.fromDate(date), workerId: workerDetail.id,
                workerName: workerDetail.name, createdAt: serverTimestamp()
            };
            if (attachmentUrl) paymentData.attachmentUrl = attachmentUrl;
            transaction.set(paymentRef, paymentData);
        });
        _logActivity(`Membayar Gaji Individual: ${workerDetail.name}`, { billId, amount: amountToPay });
    };

    const success = await _safeFirestoreWrite(writeOperation, 'Pembayaran berhasil dicatat.', 'Gagal memproses pembayaran.');

    if (success) {
        await fetchAndCacheData('bills', billsCol);
        closeModal($('#payment-modal'));
        closeModal($('#dataDetail-modal'));
        handleOpenBillDetail(bill.id, null);
    } else if (_isQuotaExceeded()) {
        await fallbackToLocal();
    }
}

  async function _downloadKwitansiAsPDF(data) {
    toast('syncing', 'Membuat PDF Kwitansi...');

    try {
        const { jsPDF } = window.jspdf;
        if (!jsPDF) {
            toast('error', 'Library PDF belum siap. Coba lagi sesaat.');
            return;
        }

        const pdf = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a6'
        });

        const pageWidth = pdf.internal.pageSize.getWidth();
        const margin = 10;
        let y = 15;

        pdf.setFont('Courier', 'normal');

        const terbilang = (n) => {
            const bilangan = ["", "satu", "dua", "tiga", "empat", "lima", "enam", "tujuh", "delapan", "sembilan", "sepuluh", "sebelas"];
            if (n < 12) return bilangan[n];
            if (n < 20) return terbilang(n - 10) + " belas";
            if (n < 100) return terbilang(Math.floor(n / 10)) + " puluh " + terbilang(n % 10);
            if (n < 200) return "seratus " + terbilang(n - 100);
            if (n < 1000) return terbilang(Math.floor(n / 100)) + " ratus " + terbilang(n % 100);
            if (n < 2000) return "seribu " + terbilang(n - 1000);
            if (n < 1000000) return terbilang(Math.floor(n / 1000)) + " ribu " + terbilang(n % 1000);
            if (n < 1000000000) return terbilang(Math.floor(n / 1000000)) + " juta " + terbilang(n % 1000000);
            return "";
        };

        // --- HEADER ---
        pdf.setFont('Courier', 'bold');
        pdf.setFontSize(18);
        pdf.text('KWITANSI', margin, y);
        
        pdf.setFontSize(10);
        pdf.setFont('Courier', 'normal');
        pdf.text(`No: ${data.nomor}`, pageWidth - margin, y, { align: 'right' });
        
        y += 4;
        pdf.setLineWidth(0.6);
        pdf.line(margin, y, pageWidth - margin, y);
        y += 0.8;
        pdf.setLineWidth(0.2);
        pdf.line(margin, y, pageWidth - margin, y);
        y += 10;

        // --- BODY DENGAN TATA LETAK 2 KOLOM ---
        pdf.setFontSize(10);
        // Definisikan 2 kolom utama
        const labelX = margin;
        const valueX = margin + 35; // Posisi X untuk kolom isi
        const valueMaxWidth = pageWidth - valueX - margin;

        // --- Baris 1: Telah diterima dari ---
        let currentY = y;
        pdf.text(['Telah diterima', 'dari'], labelX, currentY);
        pdf.text([': CV. ALAM', '  BERKAH ABADI'], valueX, currentY);
        y += 14; // Maju ke baris berikutnya

        // --- Baris 2: Uang Sejumlah ---
        currentY = y;
        pdf.text('Uang Sejumlah', labelX, currentY);
        pdf.text(':', valueX - 2, currentY);
        
        const jumlahTerbilang = (terbilang(data.jumlah).trim() + " rupiah").replace(/\s+/g, ' ').replace(/^\w/, c => c.toUpperCase());
        const terbilangLines = pdf.splitTextToSize(jumlahTerbilang, valueMaxWidth - 4); // Kurangi lebar untuk padding
        const terbilangHeight = (pdf.getTextDimensions(terbilangLines).h) + 4;

        pdf.setFillColor(238, 238, 238); // Warna abu-abu
        pdf.rect(valueX, currentY - 3.5, valueMaxWidth, terbilangHeight, 'F');
        
        pdf.setFont('Courier', 'bolditalic');
        pdf.text(terbilangLines, valueX + 2, currentY);
        pdf.setFont('Courier', 'normal');
        y += terbilangHeight + 3;

        // --- Baris 3: Untuk Pembayaran ---
        currentY = y;
        pdf.text('Untuk\nPembayaran', labelX, currentY);
        pdf.text(':', valueX - 2, currentY);
        const deskripsiLines = pdf.splitTextToSize(data.deskripsi, valueMaxWidth);
        pdf.text(deskripsiLines, valueX, currentY);
        const deskripsiHeight = pdf.getTextDimensions(deskripsiLines).h;
        y += deskripsiHeight;

        // --- FOOTER (Bagian bawah) ---
        y += 15; // Jarak antara body dan footer

        // Gambar kotak nominal terlebih dahulu
        pdf.setLineWidth(0.8);
        pdf.setDrawColor(0, 0, 0);
        pdf.rect(margin, y, 55, 12, 'D');
        pdf.setFontSize(12);
        pdf.setFont('Courier', 'bold');
        pdf.text(fmtIDR(data.jumlah), margin + 5, y + 7.5);

        // [FIX] Majukan posisi Y ke BAWAH kotak nominal sebelum menggambar tanda tangan
        y += 12 + 8; // Tinggi kotak (12mm) + spasi (8mm)

        // Gambar blok tanda tangan di posisi Y yang baru
        const ttdX = pageWidth - margin;
        pdf.setFontSize(10);
        pdf.setFont('Courier', 'normal');
        pdf.text(`Cijiwa, ${data.tanggal}`, ttdX, y, { align: 'right' });

        y += 15;
        pdf.text('Penerima,', ttdX, y, { align: 'right' });

        y += 18;
        pdf.setFont('Courier', 'bold');
        pdf.text(data.namaPenerima, ttdX, y, { align: 'right' });

        // --- SIMPAN FILE PDF ---
        pdf.save(`Kwitansi-${data.namaPenerima.replace(/\s+/g, '-')}-${data.tanggal}.pdf`);
        toast('success', 'PDF Kwitansi berhasil dibuat!');

    } catch (error) {
        console.error("Gagal membuat PDF:", error);
        toast('error', 'Terjadi kesalahan saat membuat PDF.');
    }
}
  async function _downloadKwitansiAsImage(data) {
    toast('syncing', 'Membuat gambar kwitansi...');
    const kwitansiElement = $('#kwitansi-printable-area');
    if (!kwitansiElement) {
        toast('error', 'Gagal menemukan elemen kwitansi.');
        return;
    }
    try {
        // [PERBAIKAN] Ambil library dari window object
        const html2canvas = window.html2canvas;

        if (!html2canvas) {
            toast('error', 'Library Canvas belum siap. Coba lagi sesaat.');
            return;
        }

        const canvas = await html2canvas(kwitansiElement, {
            scale: 3,
            useCORS: true,
            backgroundColor: '#ffffff'
        });
        const link = document.createElement('a');
        link.href = canvas.toDataURL('image/jpeg', 0.95);
        link.download = `Kwitansi-${data.namaPenerima.replace(/\s+/g, '-')}-${data.tanggal}.jpg`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast('success', 'Gambar kwitansi berhasil diunduh!');
    } catch (error) {
        console.error("Gagal membuat gambar dari HTML:", error);
        toast('error', 'Terjadi kesalahan saat membuat gambar.');
    }
}

  function _attachStaffFormListeners(modal) {
      const paymentTypeSelect = modal.querySelector('input[name="paymentType"]');
      if (!paymentTypeSelect) return;
      const salaryGroup = modal.querySelector('#staff-salary-group');
      const feePercentGroup = modal.querySelector('#staff-fee-percent-group');
      const feeAmountGroup = modal.querySelector('#staff-fee-amount-group');
      const toggleFields = () => {
          const selectedType = paymentTypeSelect.value;
          salaryGroup.classList.toggle('hidden', selectedType !== 'fixed_monthly');
          feePercentGroup.classList.toggle('hidden', selectedType !== 'per_termin');
          feeAmountGroup.classList.toggle('hidden', selectedType !== 'fixed_per_termin');
      };
      paymentTypeSelect.addEventListener('change', toggleFields);
  
      toggleFields();
  }

function _getUniversalKwitansiHTML(data = {}) {
    const {
        nomor = `INV-${Date.now()}`,
        tanggal = new Date().toLocaleDateString('id-ID', {day:'numeric',month:'long',year:'numeric'}),
        namaPenerima = 'Penerima Tidak Dikenal',
        jumlah = 0,
        deskripsi = 'Pembayaran tagihan/lainnya',
        isLunas = false,
    } = data;

    const namaPencetak = appState.currentUser?.displayName || 'Pengguna';

    const terbilangText = _terbilang(jumlah);
    const formattedJumlah = fmtIDR(jumlah);

    const companyLogo = logoData;
    const companyName = 'CV. ALAM BERKAH ABADI';
    const companyAddress = 'Cijiwa, Sukabumi';

    return `
    <div class="invoice-container">
        <header class="invoice-header">
            <div class="company-info">
                <img src="${companyLogo}" alt="Logo" class="company-logo">
                <div>
                    <h2 class="company-name">${companyName}</h2>
                    <p class="company-address">${companyAddress}</p>
                </div>
            </div>
            <div class="invoice-details">
                <h1 class="invoice-title">${isLunas ? 'KWITANSI LUNAS' : 'TANDA TERIMA PEMBAYARAN'}</h1>
                <p><strong>No. Kwitansi:</strong> ${nomor}</p>
                <p><strong>Tanggal:</strong> ${tanggal}</p>
            </div>
        </header>

        <main class="invoice-body">
            <section class="recipient-info">
                <p class="section-label">DIBAYARKAN KEPADA:</p>
                <p class="recipient-name">${namaPenerima}</p>
            </section>

            <section class="payment-details">
                <table>
                    <thead>
                        <tr>
                            <th>Deskripsi Pembayaran</th>
                            <th class="text-right">Jumlah</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>${deskripsi}</td>
                            <td class="text-right">${formattedJumlah}</td>
                        </tr>
                    </tbody>
                </table>
            </section>

            <section class="terbilang-info">
                <p><strong>TERBILANG:</strong> "${terbilangText.trim().toUpperCase()} RUPIAH"</p>
            </section>
        </main>

        <footer class="invoice-footer">
            <div class="signature-area">
                <p>Cijiwa, ${tanggal}</p>
                <p class="signature-title">Hormat Kami,</p>
                <div class="signature-space"></div>
                
                <p class="signature-name">${namaPencetak}</p>
                
            </div>
            <div class="status-stamp ${isLunas ? 'lunas' : 'tanda-terima'}">
                ${isLunas ? 'TANDA TERIMA' : 'TANDA TERIMA'}
            </div>
        </footer>
    </div>
    `;
}
async function _downloadUniversalKwitansiAsPDF(data = {}) {
    toast('syncing', 'Membuat PDF Kwitansi...');
    try {
        const { jsPDF } = window.jspdf || {};
        if (!jsPDF) {
            toast('error', 'Library PDF belum siap.');
            return;
        }

        const container = document.createElement('div');
        container.style.position = 'fixed';
        container.style.left = '-9999px';
        container.style.width = '105mm'; // Lebar kertas A6
        container.innerHTML = _getUniversalKwitansiHTML(data);
        document.body.appendChild(container);
        
        const kwitansiElement = container.querySelector('.invoice-container'); 
        if (!kwitansiElement) throw new Error('Elemen kwitansi tidak ditemukan.');

        // Gunakan html2canvas untuk mengubah HTML menjadi gambar
        const canvas = await html2canvas(kwitansiElement, {
            scale: 3, // Skala tinggi untuk kualitas cetak yang tajam
            useCORS: true,
            backgroundColor: '#ffffff'
        });
        
        document.body.removeChild(container); // Hapus elemen sementara

        // Buat PDF dan masukkan gambar hasil render
        const pdf = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a6' // Ukuran kwitansi standar
        });

        const pdfWidth = pdf.internal.pageSize.getWidth();
        const canvasAspectRatio = canvas.width / canvas.height;
        const imgWidth = pdfWidth; 
        const imgHeight = imgWidth / canvasAspectRatio;

        pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, imgWidth, imgHeight);

        // Simpan PDF
        const dt = data.date ? _getJSDate(data.date) : new Date();
        const recipient = data.recipient || data.namaPenerima || '-';
        const safeName = recipient.replace(/\s+/g, '-');
        const fileName = `${data.isLunas ? 'Kwitansi-Lunas' : 'Tanda-Terima'}-${safeName}-${dt.toISOString().slice(0,10)}.pdf`;

        pdf.save(fileName);
        toast('success', 'PDF Kwitansi berhasil dibuat!');

    } catch (err) {
        console.error('Gagal membuat PDF universal:', err);
        toast('error', 'Gagal membuat PDF.');
    }
}

async function _downloadUniversalKwitansiAsImage(data = {}) {
    toast('syncing', 'Membuat gambar kwitansi...');
    
    const el = document.querySelector('#kwitansi-printable-area .invoice-container');
    if (!el) {
        toast('error', 'Gagal menemukan elemen kwitansi.');
        return;
    }
    try {
        const html2canvas = window.html2canvas;
        if (!html2canvas) {
            toast('error', 'Library Canvas belum siap.');
            return;
        }
        const dt = data.date ? _getJSDate(data.date) : new Date();
        const recipient = data.recipient || data.namaPenerima || '-';
        const safeName = recipient.replace(/\s+/g, '-');
        
        const canvas = await html2canvas(el, { scale: 3, useCORS: true, backgroundColor: '#ffffff' });
        const link = document.createElement('a');
        link.href = canvas.toDataURL('image/jpeg', 0.95);
        link.download = `${data.isLunas ? 'Kwitansi-Lunas' : 'Tanda-Terima'}-${safeName}-${dt.toISOString().slice(0,10)}.jpg`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast('success', 'Gambar kwitansi berhasil diunduh!');
    } catch (err) {
        console.error('Gagal render gambar universal:', err);
        toast('error', 'Gagal membuat gambar.');
    }
}

// --- SUB-SEKSI 3.7: FUNGSI CRUD (CREATE, READ, UPDATE, DELETE) ---
  async function handleManageMasterData(type, options = {}) {
    const config = masterDataConfig[type];
    if (!config) return;

    const onSelect = options.onSelect;

    await Promise.all([
        fetchAndCacheData(config.stateKey, config.collection, config.nameField),
        fetchAndCacheData('professions', professionsCol, 'professionName'),
        fetchAndCacheData('projects', projectsCol, 'projectName')
    ]);

    const modalContentHTML = `
        <div class="content-panel" style="background:transparent; border:none; box-shadow:none;">
            <div class="sub-nav two-tabs">
                <button class="sub-nav-item active" data-tab="list">Daftar ${config.title}</button>
                ${isViewer() ? '' : `<button class="sub-nav-item" data-tab="form">Tambah Baru</button>`}
            </div>
            <div id="master-data-content" style="padding-top: 1rem;"></div>
        </div>
    `;

    const modalEl = createModal('manageMaster', {
        title: onSelect ? `Pilih ${config.title}` : `Kelola ${config.title}`,
        content: modalContentHTML,
        footer: ''
    });

    const contentContainer = modalEl.querySelector('#master-data-content');
    const tabButtons = modalEl.querySelectorAll('.sub-nav-item');
    
    const renderTabContent = async (tabId) => {
        if (tabId === 'list') {
            if (type === 'suppliers') {
                const categories = [ { id: 'all', label: 'Semua' }, { id: 'Material', label: 'Material' }, { id: 'Operasional', label: 'Operasional' }, { id: 'Lainnya', label: 'Lainnya' } ];
                contentContainer.innerHTML = `<div class="category-sub-nav hide-scrollbar">${categories.map(cat => `<button class="sub-nav-item ${cat.id === 'all' ? 'active' : ''}" data-category="${cat.id}">${cat.label}</button>`).join('')}</div><div id="filtered-supplier-list"></div>`;
                const renderSupplierList = (category) => {
                    const listContainer = contentContainer.querySelector('#filtered-supplier-list');
                    const filteredSuppliers = category === 'all' ? appState.suppliers : appState.suppliers.filter(s => s.category === category);
                    listContainer.innerHTML = _getMasterDataListHTML(type, onSelect, filteredSuppliers);
                };
                contentContainer.querySelector('.category-sub-nav').addEventListener('click', e => {
                    const tab = e.target.closest('.sub-nav-item');
                    if (tab) {
                        contentContainer.querySelectorAll('.category-sub-nav .sub-nav-item').forEach(b => b.classList.remove('active'));
                        tab.classList.add('active');
                        renderSupplierList(tab.dataset.category);
                    }
                });
                renderSupplierList('all');
            } else {
                contentContainer.innerHTML = _getMasterDataListHTML(type, onSelect);
            }
            if (onSelect) {
                contentContainer.querySelectorAll('[data-action="select-item"]').forEach(itemEl => {
                    itemEl.onclick = () => {
                        const selectedItem = appState[config.stateKey].find(i => i.id === itemEl.dataset.id);
                        if (selectedItem) { onSelect(selectedItem); closeModal(modalEl); }
                    };
                });
            }
        } else if (tabId === 'form') {
            contentContainer.innerHTML = _getMasterDataFormHTML(type);
            const form = contentContainer.querySelector('#add-master-item-form');
            _initCustomSelects(form);
            form.querySelectorAll('input[inputmode="numeric"]').forEach(i => i.addEventListener('input', _formatNumberInput));
            if (type === 'staff') _attachStaffFormListeners(form);
        }
    };

    contentContainer.addEventListener('submit', async (e) => {
        if (e.target.matches('#add-master-item-form')) {
            e.preventDefault();
            const form = e.target;
            const success = await handleAddMasterItem(form);

            if (success) {
                hideToast(); // Secara eksplisit tutup semua toast
                
                await renderTabContent('form');
            }
        }
    });


    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            if (button.classList.contains('active')) return;
            const currentActive = modalEl.querySelector('.sub-nav-item.active');
            const newTabId = button.dataset.tab;
            _animateTabSwitch(contentContainer, () => renderTabContent(newTabId), 
                Array.from(tabButtons).indexOf(button) > Array.from(tabButtons).indexOf(currentActive) ? 'forward' : 'backward'
            );
            currentActive.classList.remove('active');
            button.classList.add('active');
        });
    });

    renderTabContent('list');
}
function _getMasterDataListHTML(type, onSelect, itemsToRender) {
    const config = masterDataConfig[type];
    if (!config) return '';

    const listItems = itemsToRender || appState[config.stateKey] || [];

    const getListItemContent = (item, type) => {
        let content = `<span>${item[config.nameField]}</span>`;
        if (type === 'materials' && item.unit) {
            content += `<span class="category-badge category-internal">${item.unit}</span>`;
        }
        if (type === 'suppliers' && item.category) {
            content += `<span class="category-badge category-${item.category.toLowerCase()}">${item.category}</span>`;
        }
        if (type === 'projects') {
            if (item.projectType === 'main_income') content += `<span class="category-badge category-main">Utama</span>`;
            else if (item.projectType === 'internal_expense') content += `<span class="category-badge category-internal">Internal</span>`;
        }
        return `<div class="master-data-item-info">${content}</div>`;
    };

    if (listItems.length === 0) {
        return _getEmptyStateHTML({ icon: 'database', title: `Belum Ada ${config.title}`, desc: 'Data yang Anda tambahkan akan muncul di sini.' });
    }

    return `
        <div class="master-data-list">
            ${listItems.map(item => `
                <div class="master-data-item" data-id="${item.id}" data-type="${type}" ${onSelect ? 'data-action="select-item" style="cursor: pointer;"' : ''}>
                    ${getListItemContent(item, type)}
                    ${!onSelect && !isViewer() ? `
                    <div class="master-data-item-actions">
                        <button class="btn-icon" data-action="edit-master-item"><span class="material-symbols-outlined">edit</span></button>
                        <button class="btn-icon btn-icon-danger" data-action="delete-master-item"><span class="material-symbols-outlined">delete</span></button>
                    </div>` : ''}
                </div>
            `).join('')}
        </div>
    `;
}
function _getSingleMasterDataItemContentHTML(item, type) {
    const config = masterDataConfig[type];
    if (!config) return '';

    let content = `<span>${item[config.nameField]}</span>`;
    if (type === 'materials' && item.unit) {
        content += `<span class="category-badge category-internal">${item.unit}</span>`;
    }
    if (type === 'suppliers' && item.category) {
        content += `<span class="category-badge category-${item.category.toLowerCase()}">${item.category}</span>`;
    }
    if (type === 'projects') {
        if (item.projectType === 'main_income') content += `<span class="category-badge category-main">Utama</span>`;
        else if (item.projectType === 'internal_expense') content += `<span class="category-badge category-internal">Internal</span>`;
    }
    return content;
}
function _getMasterDataFormHTML(type) {
    const config = masterDataConfig[type];
    if (!config) return '';

    const fields = [];

    fields.push(`
        <div class="form-group">
            <label>Nama ${config.title}</label>
            <input type="text" name="itemName" placeholder="Masukkan nama..." required>
        </div>
    `);

    if (type === 'materials') {
        fields.push(`
            <div class="form-group"><label>Satuan (mis. Pcs, Kg, m³)</label><input type="text" name="itemUnit" placeholder="Masukkan satuan..." required></div>
            <div class="form-group"><label>Titik Pemesanan Ulang (Reorder Point)</label><input type="number" name="reorderPoint" placeholder="mis. 10" value="0" required></div>
        `);
    } else if (type === 'staff') {
        const paymentTypeOptions = [ { value: 'fixed_monthly', text: 'Gaji Bulanan Tetap' }, { value: 'per_termin', text: 'Fee per Termin (%)' }, { value: 'fixed_per_termin', text: 'Fee Tetap per Termin' } ];
        fields.push(createMasterDataSelect('paymentType', 'Tipe Pembayaran', paymentTypeOptions, 'fixed_monthly'));
        fields.push(`
            <div class="form-group" id="staff-salary-group"><label>Gaji Bulanan</label><input type="text" inputmode="numeric" name="salary" placeholder="mis. 5.000.000"></div>
            <div class="form-group hidden" id="staff-fee-percent-group"><label>Persentase Fee (%)</label><input type="number" name="feePercentage" placeholder="mis. 5 untuk 5%"></div>
            <div class="form-group hidden" id="staff-fee-amount-group"><label>Jumlah Fee Tetap</label><input type="text" inputmode="numeric" name="feeAmount" placeholder="mis. 10.000.000"></div>
        `);
    } else if (type === 'suppliers') {
        const categoryOptions = [ { value: 'Operasional', text: 'Operasional' }, { value: 'Material', text: 'Material' }, { value: 'Lainnya', text: 'Lainnya' }, ];
        fields.push(createMasterDataSelect('itemCategory', 'Kategori Supplier', categoryOptions, 'Operasional'));
    } else if (type === 'projects') {
        const projectTypeOptions = [ { value: 'main_income', text: 'Pemasukan Utama' }, { value: 'internal_expense', text: 'Proyek Internal' } ];
        fields.push(`
            <div class="form-group"><label>Anggaran Proyek</label><input type="text" inputmode="numeric" name="budget" placeholder="mis. 100.000.000"></div>
            ${createMasterDataSelect('projectType', 'Jenis Proyek', projectTypeOptions, 'main_income')}
            <div class="form-group"><label class="custom-checkbox-label" style="flex-direction: row; align-items: center; gap: 0.75rem; padding: 0.5rem 0;"><input type="checkbox" name="isWageAssignable" checked><span class="custom-checkbox-visual"></span><span>Proyek ini bisa diberikan upah harian ke pekerja.</span></label></div>
        `);
    } else if (type === 'workers') {
        const professionOptions = appState.professions.map(p => ({ value: p.id, text: p.professionName }));
        const statusOptions = [{ value: 'active', text: 'Aktif' }, { value: 'inactive', text: 'Tidak Aktif' }];
    
        fields.push(`
            ${createMasterDataSelect('professionId', 'Profesi', professionOptions, '', 'professions')}
            ${createMasterDataSelect('workerStatus', 'Status', statusOptions, 'active')}
            <div class="section-header-flex">
                <h5 class="invoice-section-title">Upah Harian per Proyek</h5>
                <button type="button" class="btn btn-secondary btn-sm" data-action="add-worker-wage">
                    <span class="material-symbols-outlined">add</span> Tambah
                </button>
            </div>
            <div id="worker-wages-summary-list">
                <p class="empty-state-small" style="text-align: left; padding: 0.5rem;">Belum ada pengaturan upah.</p>
            </div>
        `);
    }
    return `
        <form id="add-master-item-form" data-type="${type}" class="desktop-form-layout" data-async="true">
            ${fields.join('')}
            <div class="form-footer-actions">
                <button type="submit" class="btn btn-primary">Tambah ${config.title}</button>
            </div>
        </form>
    `;
}
function _attachDynamicWageFormListeners(form) {
    const addBtn = form.querySelector('[data-action="add-project-wage-form"]');
    const container = form.querySelector('#project-wages-container');
    const hiddenInput = form.querySelector('#add-wage-project-selector');

    if (!addBtn || !hiddenInput || !container) return;
    
    const wrapper = hiddenInput.closest('.custom-select-wrapper');
    const optionsList = wrapper.querySelector('.custom-select-options-list');
    const triggerSpan = wrapper.querySelector('.custom-select-trigger span');
    const defaultTriggerText = 'Pilih Proyek untuk Ditambahkan';

    const generateFieldsetHTML = (projectId, projectName) => {
        return `
            <fieldset id="project-wage-group-${projectId}" class="project-wage-group dynamic" data-project-id="${projectId}" data-project-name="${projectName}">
                <legend>
                    <span>Upah Harian - ${projectName}</span>
                    <button type="button" class="btn-icon btn-icon-danger remove-project-wage-btn" title="Hapus Proyek Ini">
                        <span class="material-symbols-outlined">delete</span>
                    </button>
                </legend>
                <div class="role-wage-list"></div>
                <button type="button" class="btn btn-secondary btn-sm" data-action="add-role-wage-row" data-project-id="${projectId}">
                    <span class="material-symbols-outlined">add</span> Tambah Peran/Upah
                </button>
            </fieldset>
        `;
    };

    addBtn.addEventListener('click', () => {
        const projectId = hiddenInput.value;
        if (!projectId) {
            toast('error', 'Silakan pilih proyek terlebih dahulu.');
            return;
        }

        const optionToRemove = optionsList.querySelector(`.custom-select-option[data-value="${projectId}"]`);
        const projectName = optionToRemove ? optionToRemove.textContent : '';

        if (container.querySelector(`#project-wage-group-${projectId}`)) {
            toast('info', 'Proyek tersebut sudah ditambahkan.');
            return;
        }

        container.insertAdjacentHTML('beforeend', generateFieldsetHTML(projectId, projectName));

        if (optionToRemove) {
            optionToRemove.remove();
        }

        hiddenInput.value = '';
        triggerSpan.textContent = defaultTriggerText;
    });

    container.addEventListener('click', e => {
        const addRoleBtn = e.target.closest('[data-action="add-role-wage-row"]');
        const removeProjectBtn = e.target.closest('.remove-project-wage-btn');
        const removeRoleBtn = e.target.closest('.remove-role-btn');

        if (addRoleBtn) {
            const projectId = addRoleBtn.dataset.projectId;
            const listContainer = form.querySelector(`#project-wage-group-${projectId} .role-wage-list`);
            const newRow = document.createElement('div');
            newRow.className = 'role-wage-row';
            newRow.innerHTML = `
                <input type="text" name="role_name" placeholder="Nama Peran (mis. Tukang)">
                <input type="text" name="role_wage" inputmode="numeric" placeholder="Nominal Upah">
                <button type="button" class="btn-icon btn-icon-danger remove-role-btn"><span class="material-symbols-outlined">delete</span></button>
            `;
            listContainer.appendChild(newRow);
            newRow.querySelector('input[name="role_wage"]').addEventListener('input', _formatNumberInput);
        }

        if (removeProjectBtn) {
            const fieldset = removeProjectBtn.closest('.project-wage-group');
            const projectId = fieldset.dataset.projectId;
            const projectName = fieldset.dataset.projectName;
            
            const newOptionDiv = document.createElement('div');
            newOptionDiv.className = 'custom-select-option';
            newOptionDiv.dataset.value = projectId;
            newOptionDiv.textContent = projectName;
            optionsList.appendChild(newOptionDiv);
            
            fieldset.remove();
        }

        if (removeRoleBtn) {
            removeRoleBtn.closest('.role-wage-row').remove();
        }
    });
}
function _renderWorkerWagesSummary(container, wagesData) {
    if (!container) return;
    const projectIds = Object.keys(wagesData || {});

    if (projectIds.length === 0) {
        container.innerHTML = `<p class="empty-state-small" style="text-align: left; padding: 0.5rem;">Belum ada pengaturan upah per proyek.</p>`;
        return;
    }

    container.innerHTML = projectIds.map(projectId => {
        const project = appState.projects.find(p => p.id === projectId);
        const rolesData = wagesData[projectId];
        const rolesCount = Object.keys(rolesData).length;
        const wagesSummary = Object.values(rolesData).slice(0, 2).map(fmtIDR).join(', ');

        return `
            <div class="detail-list-item-card worker-wage-summary-item" data-project-id="${projectId}" data-wages='${JSON.stringify(rolesData)}'>
                <div class="item-main">
                    <strong class="item-title">${project?.projectName || 'Proyek Dihapus'}</strong>
                    <span class="item-subtitle">${rolesCount} Peran: ${wagesSummary}${rolesCount > 2 ? '...' : ''}</span>
                </div>
                <div class="item-secondary">
                    <button type="button" class="btn btn-secondary btn-sm" data-action="edit-worker-wage">Edit</button>
                </div>
            </div>
        `;
    }).join('');
}

// GANTI SELURUH FUNGSI LAMA DENGAN INI
// GANTI SELURUH FUNGSI LAMA DENGAN VERSI DEBUGGING INI
function _openWorkerWageDetailModal({ projectId, existingWages = {}, onSave }) {
    const isEditing = !!projectId;
    // DEBUG: Cek mode saat fungsi dipanggil
    console.log(`[DEBUG] Membuka modal upah. Mode: ${isEditing ? 'EDIT' : 'TAMBAH'}`);

    let contentHTML;
    let title = isEditing ? 'Edit Upah Proyek' : 'Tambah Upah Proyek';

    const createRoleRowsHTML = (roles) => {
        return Object.entries(roles).map(([roleName, roleWage]) => `
            <div class="role-wage-row">
                <input type="text" name="role_name" placeholder="Nama Peran (mis. Tukang)" value="${roleName}">
                <input type="text" name="role_wage" inputmode="numeric" placeholder="Nominal Upah" value="${new Intl.NumberFormat('id-ID').format(roleWage)}">
                <button type="button" class="btn-icon btn-icon-danger" data-action="remove-role-wage-row"><span class="material-symbols-outlined">delete</span></button>
            </div>
        `).join('');
    };

    if (isEditing) {
        const project = appState.projects.find(p => p.id === projectId);
        title = `Edit Upah: ${project?.projectName}`;
        contentHTML = `
            <div class="role-wage-list">${createRoleRowsHTML(existingWages)}</div>
            <button type="button" class="btn btn-secondary btn-sm" data-action="add-role-wage-row" style="width:100%; margin-top:1rem;">
                <span class="material-symbols-outlined">add</span> Tambah Peran/Upah
            </button>
        `;
    } else { 
        const assignedProjectIds = Object.keys(existingWages);
        const projectOptions = appState.projects
            .filter(p => p.isWageAssignable !== false && !assignedProjectIds.includes(p.id)) 
            .map(p => ({ value: p.id, text: p.projectName }));
        
        contentHTML = `
            <div id="wage-project-selector-container">
                ${createMasterDataSelect('wage-detail-project-selector', 'Pilih Proyek', projectOptions, '')}
            </div>
            <div id="wage-roles-input-container" class="hidden">
                <div class="role-wage-list"></div>
                <button type="button" class="btn btn-secondary btn-sm" data-action="add-role-wage-row" style="width:100%; margin-top:1rem;">
                    <span class="material-symbols-outlined">add</span> Tambah Peran/Upah
                </button>
            </div>
        `;
    }

    const formId = `worker-wage-detail-form-${generateUUID()}`; 
    const finalContent = `<form id="${formId}">${contentHTML}</form>`;
    const headerActionsHTML = `<button type="submit" class="btn btn-primary" form="${formId}">Simpan</button>`;
    
    const viewPane = createModal('dataDetail', { 
        title, 
        content: finalContent, 
        footer: '',
        headerActions: headerActionsHTML 
    });
    
    if (viewPane) {
        _initCustomSelects(viewPane);
        viewPane.querySelectorAll('input[inputmode="numeric"]').forEach(inp => inp.addEventListener('input', _formatNumberInput));

        const projectSelector = viewPane.querySelector('#wage-detail-project-selector');
        if (projectSelector) {
            // DEBUG: Konfirmasi bahwa event listener berhasil dipasang
            console.log("[DEBUG] Memasang listener 'change' pada dropdown proyek.");

            projectSelector.addEventListener('change', (e) => {
                const selectedProjectId = e.target.value;
                // DEBUG: Lihat ID proyek yang dipilih
                console.log(`[DEBUG] Dropdown proyek berubah. ID Proyek terpilih: ${selectedProjectId}`);

                if (selectedProjectId) {
                    const project = appState.projects.find(p => p.id === selectedProjectId);
                    const titleEl = viewPane.querySelector('h4, .breadcrumb-nav strong');
                    if(titleEl) titleEl.textContent = `Tambah Upah: ${project.projectName}`;
                    
                    const form = viewPane.querySelector(`#${formId}`);
                    form.dataset.selectedProjectId = selectedProjectId;

                    const selectorContainer = viewPane.querySelector('#wage-project-selector-container');
                    const rolesContainer = viewPane.querySelector('#wage-roles-input-container');

                    // DEBUG: Cek sebelum mengubah class 'hidden'
                    console.log("[DEBUG] Akan menyembunyikan dropdown dan menampilkan input upah.");
                    selectorContainer.classList.add('hidden');
                    rolesContainer.classList.remove('hidden');

                    // DEBUG: Cek setelah mengubah class 'hidden'
                    console.log(`[DEBUG] Status 'hidden' dropdown SEKARANG: ${selectorContainer.classList.contains('hidden')}`);
                    console.log(`[DEBUG] Status 'hidden' input upah SEKARANG: ${rolesContainer.classList.contains('hidden')}`);
                }
            });
        }

        const formEl = viewPane.querySelector(`#${formId}`);
        formEl.addEventListener('submit', e => {
            e.preventDefault();
            // DEBUG: Konfirmasi form submit
            console.log("[DEBUG] Tombol 'Simpan' pada form upah diklik.");
            
            const finalProjectId = isEditing ? projectId : formEl.dataset.selectedProjectId;
            console.log(`[DEBUG] ID Proyek Final untuk disimpan: ${finalProjectId}`);

            if (!finalProjectId) {
                toast('error', 'Silakan pilih proyek terlebih dahulu.');
                return;
            }
            const roles = {};
            viewPane.querySelectorAll('.role-wage-row').forEach(row => {
                const roleName = row.querySelector('input[name="role_name"]').value.trim();
                const roleWage = parseFormattedNumber(row.querySelector('input[name="role_wage"]').value);
                if (roleName && roleWage > 0) { roles[roleName] = roleWage; }
            });
            // DEBUG: Lihat data yang berhasil dikumpulkan
            console.log("[DEBUG] Data upah yang terkumpul dari form:", roles);

            if (Object.keys(roles).length === 0) {
                toast('error', 'Harap tambahkan minimal satu peran dengan upah yang valid.');
                return;
            }

            // DEBUG: Konfirmasi sebelum memanggil callback
            console.log("[DEBUG] Memanggil fungsi onSave...");
            onSave({ projectId: finalProjectId, roles });
            
            // DEBUG: Konfirmasi sebelum kembali
            console.log("[DEBUG] Memanggil fungsi handleDetailPaneBack...");
            handleDetailPaneBack();
        });
    }
}
async function handleAddMasterItem(form) {
    const type = form.dataset.type;
    const config = masterDataConfig[type];
    const itemName = form.elements.itemName.value.trim();
    if (!config || !itemName) return false;

    const dataToAdd = {
        [config.nameField]: itemName,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
    };
    
    if (type === 'staff') {
        dataToAdd.paymentType = form.elements.paymentType.value;
        dataToAdd.salary = parseFormattedNumber(form.elements.salary.value) || 0;
        dataToAdd.feePercentage = Number(form.elements.feePercentage.value) || 0;
        dataToAdd.feeAmount = parseFormattedNumber(form.elements.feeAmount.value) || 0;
    }
    if (type === 'suppliers') {
        dataToAdd.category = form.elements.itemCategory.value;
    }
    if (type === 'projects') {
        dataToAdd.projectType = form.elements.projectType.value;
        dataToAdd.budget = parseFormattedNumber(form.elements.budget.value);
        dataToAdd.isWageAssignable = form.elements.isWageAssignable.checked;
    }
    if (type === 'materials') {
        dataToAdd.unit = form.elements.itemUnit.value.trim();
        dataToAdd.reorderPoint = Number(form.elements.reorderPoint.value) || 0;
        dataToAdd.currentStock = 0;
        dataToAdd.lastPrice = 0;
        dataToAdd.usageCount = 0;
    } else if (type === 'workers') {
        dataToAdd.professionId = form.elements.professionId.value;
        dataToAdd.status = form.elements.workerStatus.value;
        const projectWages = {};
        form.querySelectorAll('.worker-wage-summary-item').forEach(itemEl => {
            const projectId = itemEl.dataset.projectId;
            const wages = JSON.parse(itemEl.dataset.wages);
            if (projectId && wages) {
                projectWages[projectId] = wages;
            }
        });
        dataToAdd.projectWages = projectWages;
    }
    
    const newDocRef = doc(config.collection); // Buat referensi dokumen baru untuk mendapatkan ID-nya
    
    const writeOperation = async () => {
        if (type === 'projects' && dataToAdd.projectType === 'main_income') {
            await runTransaction(db, async (transaction) => {
                const q = query(projectsCol, where("projectType", "==", "main_income"));
                const mainProjectsSnap = await getDocs(q);
                mainProjectsSnap.forEach(docSnap => {
                    const docData = docSnap.data();
                    transaction.update(docSnap.ref, { projectType: 'internal_expense', rev: (docData.rev || 0) + 1, updatedAt: serverTimestamp() });
                });
                transaction.set(newDocRef, dataToAdd);
            });
        } else {
            await setDoc(newDocRef, dataToAdd);
        }
    };

    const success = await _safeFirestoreWrite(
        writeOperation, 
        `${config.title} baru berhasil ditambahkan.`, 
        `Gagal menambah ${config.title}.`,
        `Menambah ${config.title}...`
    );

    if (success) {
        const newItem = { ...dataToAdd, id: newDocRef.id };
        delete newItem.createdAt; 
        delete newItem.updatedAt;
        appState[config.stateKey].unshift(newItem);

        _logActivity(`Menambah Master Data: ${config.title}`, { name: itemName });
        form.reset();
        return true;
    } else {
        return false;
    }
}

async function handleEditMasterItem(id, type) {
    const config = masterDataConfig[type];
    if (!config) return;

    await Promise.all([
        fetchAndCacheData('professions', professionsCol, 'professionName'),
        fetchAndCacheData('projects', projectsCol, 'projectName')
    ]);

    const item = appState[config.stateKey].find(i => i.id === id);
    if (!item) {
        toast('error', 'Data tidak ditemukan untuk diedit.');
        return;
    }

    let formFieldsHTML = `<div class="form-group"><label>Nama ${config.title}</label><input type="text" name="itemName" value="${item[config.nameField]}" required></div>`;

    if (type === 'staff') {
        const paymentTypeOptions = [
            { value: 'fixed_monthly', text: 'Gaji Bulanan Tetap' },
            { value: 'per_termin', text: 'Fee per Termin (%)' },
            { value: 'fixed_per_termin', text: 'Fee Tetap per Termin' }
        ];
        formFieldsHTML += `
            ${createMasterDataSelect('paymentType', 'Tipe Pembayaran', paymentTypeOptions, item.paymentType || 'fixed_monthly')}
            <div class="form-group" id="staff-salary-group"><label>Gaji Bulanan</label><input type="text" inputmode="numeric" name="salary" value="${item.salary ? new Intl.NumberFormat('id-ID').format(item.salary) : ''}"></div>
            <div class="form-group hidden" id="staff-fee-percent-group"><label>Persentase Fee (%)</label><input type="number" name="feePercentage" value="${item.feePercentage || ''}"></div>
            <div class="form-group hidden" id="staff-fee-amount-group"><label>Jumlah Fee Tetap</label><input type="text" inputmode="numeric" name="feeAmount" value="${item.feeAmount ? new Intl.NumberFormat('id-ID').format(item.feeAmount) : ''}"></div>
        `;
    } else if (type === 'suppliers') {
        const categoryOptions = [
            { value: 'Operasional', text: 'Operasional' },
            { value: 'Material', text: 'Material' },
            { value: 'Lainnya', text: 'Lainnya' }
        ];
        formFieldsHTML += createMasterDataSelect('itemCategory', 'Kategori Supplier', categoryOptions, item.category || 'Operasional');
    } else if (type === 'projects') {
        const projectTypeOptions = [
            { value: 'main_income', text: 'Pemasukan Utama' },
            { value: 'internal_expense', text: 'Proyek Internal' }
        ];
        const budget = item.budget ? new Intl.NumberFormat('id-ID').format(item.budget) : '';
        const isChecked = item.isWageAssignable !== false ? 'checked' : '';
        formFieldsHTML += `
            <div class="form-group"><label>Anggaran Proyek</label><input type="text" inputmode="numeric" name="budget" placeholder="mis. 100.000.000" value="${budget}"></div>
            ${createMasterDataSelect('projectType', 'Jenis Proyek', projectTypeOptions, item.projectType || 'main_income')}
            <div class="form-group"><label class="custom-checkbox-label"><input type="checkbox" name="isWageAssignable" ${isChecked}><span class="custom-checkbox-visual"></span><span>Proyek ini bisa diberikan upah harian.</span></label></div>
        `;
    } else if (type === 'workers') {
        const professionOptions = appState.professions.map(p => ({ value: p.id, text: p.professionName }));
        const statusOptions = [{ value: 'active', text: 'Aktif' }, { value: 'inactive', text: 'Tidak Aktif' }];
        formFieldsHTML = `
            <div class="form-group"><label>Nama ${config.title}</label><input type="text" name="itemName" value="${item[config.nameField]}" required></div>
            ${createMasterDataSelect('professionId', 'Profesi', professionOptions, item.professionId || '', 'professions')}
            ${createMasterDataSelect('workerStatus', 'Status', statusOptions, item.status || 'active')}
            <div class="section-header-flex">
                <h5 class="invoice-section-title">Upah Harian per Proyek</h5>
                <button type="button" class="btn btn-secondary btn-sm" data-action="add-worker-wage"><span class="material-symbols-outlined">add</span> Tambah</button>
            </div>
            <div id="worker-wages-summary-list"></div>
        `;
    } else if (type === 'materials') {
        formFieldsHTML += `
            <div class="form-group"><label>Satuan</label><input type="text" name="unit" value="${item.unit || ''}" required></div>
            <div class="form-group"><label>Titik Pemesanan Ulang</label><input type="number" name="reorderPoint" value="${item.reorderPoint || 0}" required></div>
        `;
    }

    const content = `
        <form id="edit-master-form" data-id="${id}" data-type="${type}" data-async="true">
            ${formFieldsHTML}
            <div class="form-footer-actions">
                <button type="submit" class="btn btn-primary">Simpan Perubahan</button>
            </div>
        </form>
    `;

    const viewPane = createModal('editMaster', { title: `Edit ${config.title}`, content: content, footer: '' });

    if (viewPane) {
        const form = viewPane.querySelector('#edit-master-form');
        if (form) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                createModal('confirmEdit', {
                    onConfirm: async () => {
                        const success = await handleUpdateMasterItem(form);
                        
                        if (success) {
                            handleDetailPaneBack(); // 1. Tutup panel edit
                            
                            setTimeout(() => {
                                const mainModal = document.getElementById('manageMaster-modal');
                                const listTabButton = mainModal?.querySelector('[data-tab="list"]');
                                if (listTabButton) {
                                    listTabButton.click(); // 2. Pindah ke tab daftar
                                }
                            }, 100); // Delay kecil untuk stabilitas
                        }
                    }
                });
            });
        }        
        _initCustomSelects(viewPane);
        viewPane.querySelectorAll('input[inputmode="numeric"]').forEach(inp => inp.addEventListener('input', _formatNumberInput));
        if (type === 'staff') {
            _attachStaffFormListeners(viewPane);
        }
        if (type === 'workers') {
            const summaryContainer = viewPane.querySelector('#worker-wages-summary-list');
            _renderWorkerWagesSummary(summaryContainer, item.projectWages);
        }
    }
}

async function handleUpdateMasterItem(form) {
    const { id, type } = form.dataset;
    const config = masterDataConfig[type];
    if (!config) return false;

    const newName = form.elements.itemName.value.trim();
    if (!newName) return false;
    let dataToUpdate = { [config.nameField]: newName };

    if (type === 'staff') {
        dataToUpdate.paymentType = form.elements.paymentType.value;
        dataToUpdate.salary = parseFormattedNumber(form.elements.salary.value) || 0;
        dataToUpdate.feePercentage = Number(form.elements.feePercentage.value) || 0;
        dataToUpdate.feeAmount = parseFormattedNumber(form.elements.feeAmount.value) || 0;
    }
    if (type === 'suppliers') {
        dataToUpdate.category = form.elements.itemCategory.value;
    }
    if (type === 'projects') {
        dataToUpdate.projectType = form.elements.projectType.value;
        dataToUpdate.budget = parseFormattedNumber(form.elements.budget.value);
        dataToUpdate.isWageAssignable = form.elements.isWageAssignable.checked;
    }
    if (type === 'materials') {
        dataToUpdate.unit = form.elements.unit.value.trim();
        dataToUpdate.reorderPoint = Number(form.elements.reorderPoint.value) || 0;
    }
    if (type === 'workers') {
        dataToUpdate.professionId = form.elements.professionId.value;
        dataToUpdate.status = form.elements.workerStatus.value;
        const projectWages = {};
        form.querySelectorAll('.worker-wage-summary-item').forEach(itemEl => {
            const projectId = itemEl.dataset.projectId;
            const wages = JSON.parse(itemEl.dataset.wages);
            if (projectId && wages) {
                projectWages[projectId] = wages;
            }
        });
        dataToUpdate.projectWages = projectWages;
    }
    
    if (navigator.onLine && !_isQuotaExceeded()) {
        const loadingToast = toast('syncing', `Memperbarui ${config.title}...`);
        try {
            await runTransaction(db, async (transaction) => {
                const docRef = doc(config.collection, id);
                const serverSnap = await transaction.get(docRef);
                if (!serverSnap.exists()) throw new Error("Data tidak ditemukan di server.");
                const serverData = serverSnap.data();
                transaction.update(docRef, { ...dataToUpdate, rev: (serverData.rev || 0) + 1, updatedAt: serverTimestamp() });
            });
            await syncFromServer(); // Ambil perubahan terbaru
            await loadAllLocalDataToState();
            loadingToast.close();
            _logActivity(`Memperbarui Master: ${config.title}`, { docId: id });
            return true;
        } catch (error) {
            loadingToast.close();
            toast('error', `Gagal update di server: ${error.message}`);
            return false;
        }
    } else {
        const loadingToast = toast('syncing', `Menyimpan perubahan ${config.title} di perangkat...`);
        try {
            await localDB[config.stateKey].update(id, { ...dataToUpdate, syncState: 'pending_update', updatedAt: new Date() });
            await loadAllLocalDataToState();
            loadingToast.close();
            _logActivity(`Memperbarui Master (Offline): ${config.title}`, { docId: id });
            return true;
        } catch(error) {
            loadingToast.close();
            toast('error', `Gagal menyimpan di perangkat: ${error.message}`);
            return false;
        }
    }
}
async function _saveNewMasterMaterial(data) {
      try {
          const docRef = await addDoc(collection(db, 'teams', TEAM_ID, 'materials'), {
              materialName: data.name,
              unit: data.unit,
              currentStock: 0,
              createdAt: serverTimestamp()
          });
          return {
              id: docRef.id,
              materialName: data.name,
              unit: data.unit
          };
      } catch (error) {
          console.error("Gagal menyimpan master material baru:", error);
          toast('error', 'Gagal menyimpan data baru.');
          return null;
      }
  }

  function handleAddNewMaterialModal(targetWrapper = null) {
    const content = `
        <form id="add-new-material-form">
            <div class="form-group">
                <label>Nama Material Baru</label>
                <input type="text" name="materialName" required placeholder="Contoh: Semen Tiga Roda">
            </div>
            <div class="form-group">
                <label>Satuan</label>
                <input type="text" name="unit" required placeholder="Contoh: Zak, Pcs, m³">
            </div>
        </form>
    `;
    const footer = `
        <button type="button" class="btn btn-secondary" data-close-modal>Batal</button>
        <button type="submit" class="btn btn-primary" form="add-new-material-form">Simpan & Pilih</button>
    `;

    const modalEl = createModal('dataDetail', {
        title: 'Tambah Master Material',
        content: content,
        footer: footer
    });

    $('#add-new-material-form', modalEl)?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const form = e.target;
        const newName = form.elements.materialName.value.trim();
        const newUnit = form.elements.unit.value.trim();
        if (!newName || !newUnit) {
            toast('error', 'Nama dan Satuan harus diisi.');
            return;
        }
        toast('syncing', 'Menyimpan material baru...');
        const newMaterial = await _saveNewMasterMaterial({ name: newName, unit: newUnit });

        if (newMaterial) {
            appState.materials.push(newMaterial);
            toast('success', 'Material baru berhasil disimpan!');
            closeModal(modalEl);

            if (targetWrapper) {
                const nameInput = $('.autocomplete-input', targetWrapper);
                const idInput = $('.autocomplete-id', targetWrapper);
                const clearBtn = $('.autocomplete-clear-btn', targetWrapper);

                nameInput.value = newMaterial.materialName;
                idInput.value = newMaterial.id;
                nameInput.readOnly = true;
                if (clearBtn) clearBtn.style.display = 'flex';

                const row = targetWrapper.closest('.invoice-item-row');
                const unitSpan = row?.querySelector('.item-unit');
                if (unitSpan) unitSpan.textContent = newMaterial.unit || '';
            }
        }
    });
}

// GANTI FUNGSI LAMA handleDeleteMasterItem DENGAN INI

async function handleDeleteMasterItem(id, type) {
    const config = masterDataConfig[type];
    if (!config) return;
    
    const item = appState[config.stateKey].find(i => i.id === id);
    if (!item) {
        toast('error', 'Item tidak ditemukan.'); // Notifikasi error cepat jika item tidak ada
        return;
    }

    createModal('confirmDelete', {
        message: `Anda yakin ingin menghapus ${config.title} "${item[config.nameField]}" ini?`,
        onConfirm: async () => {
            toast('syncing', `Menghapus ${config.title}...`);
        
            try {
                await deleteDoc(doc(config.collection, id));
                _logActivity(`Menghapus Master Data: ${config.title}`, { docId: id, name: item[config.nameField] });
        
                await toast('success', `${config.title} berhasil dihapus.`);
        
                const itemElement = document.querySelector(`.master-data-item[data-id="${id}"]`);
                if (itemElement) {
                    itemElement.style.transition = 'opacity 0.3s, transform 0.3s';
                    itemElement.style.opacity = '0';
                    itemElement.style.transform = 'translateX(-20px)';
                    setTimeout(() => itemElement.remove(), 300);
                }
                appState[config.stateKey] = appState[config.stateKey].filter(i => i.id !== id);
        
            } catch (error) {
                console.error(`Gagal menghapus master data ${type}:`, error);
                await toast('error', `Gagal menghapus ${config.title}.`);
            }
        }
    
    });
}
  function _getFormDraftKey(form) {
      const k = form.getAttribute('data-draft-key');
      return k?`draft:${k}` : null;
  }
  
  function _saveFormDraft(form) {
      try {
          const key = _getFormDraftKey(form);
          if (!key) return;
          const data = {};
          form.querySelectorAll('input, select, textarea').forEach(el => {
              if (el.type === 'file') return;
              const name = el.name || el.id;
              if (!name) return;
              if (el.type === 'checkbox' || el.type === 'radio') {
                  if (el.checked) data[name] = el.value || true;
              } else {
                  data[name] = el.value;
              }
          });
          sessionStorage.setItem(key, JSON.stringify(data));
      } catch (e) {
          console.warn('Gagal menyimpan draf', e);
      }
  }
  
  function _restoreFormDraft(form) {
      try {
          const key = _getFormDraftKey(form);
          if (!key) return;
          const raw = sessionStorage.getItem(key);
          if (!raw) return;
          const data = JSON.parse(raw);
          Object.entries(data).forEach(([name, val]) => {
              const el = form.querySelector(`[name="${name}"]`) || form.querySelector(`#${name}`);
              if (!el) return;
              if (el.type === 'checkbox' || el.type === 'radio') {
                  const candidate = form.querySelector(`[name="${name}"][value="${val}"]`);
                  if (candidate) candidate.checked = true;
              } else {
                  el.value = val;
              }
          });
      } catch (e) {
          console.warn('Gagal memulihkan draf', e);
      }
  }
  
  function _clearFormDraft(form) {
      try {
          const key = _getFormDraftKey(form);
          if (key) sessionStorage.removeItem(key);
      } catch (e) {
          console.warn('Gagal menghapus draf', e);
      }
  }
  
  function _attachFormDraftPersistence(form) {
      if (!form) return;
      _restoreFormDraft(form);
      const handler = () => _saveFormDraft(form);
      form.addEventListener('input', handler);
      form.addEventListener('change', handler, true);
      form._clearDraft = () => _clearFormDraft(form);
  }
  

  async function handleEditItem(id, type) {
    const headerSaveButtonHTML = `<button type="submit" class="btn btn-primary" form="edit-item-form">Simpan</button>`;

    toast('syncing', 'Mempersiapkan form edit...');
    
    try {
        await Promise.all([
            fetchAndCacheData('projects', projectsCol, 'projectName'),
            fetchAndCacheData('fundingCreditors', fundingCreditorsCol, 'creditorName'),
            fetchAndCacheData('operationalCategories', opCatsCol, 'categoryName'),
            fetchAndCacheData('otherCategories', otherCatsCol, 'categoryName'),
            fetchAndCacheData('suppliers', suppliersCol, 'supplierName'),
            fetchAndCacheData('materials', materialsCol, 'materialName'),
            fetchAndCacheData('staff', staffCol, 'staffName')
        ]);

        let item = null;
        let originalType = type;

        if (type === 'termin') {
            item = await localDB.incomes.get(id);
        } else if (type === 'pinjaman') {
            item = await localDB.funding_sources.get(id);
        } else if (type === 'bill') {
            const bill = await localDB.bills.get(id);
            if (bill && bill.expenseId) {
                originalType = 'expense'; // Ubah tipe asli ke expense
                item = await localDB.expenses.get(bill.expenseId);
            } else if (bill && bill.type === 'fee') {
                originalType = 'fee_bill';
                item = bill;
            } else {
                item = bill;
            }
        } else if (type === 'expense') {
            item = await localDB.expenses.get(id);
        }

        if (!item) throw new Error('Data tidak ditemukan untuk diedit.');

        let formHTML = 'Form tidak tersedia.';

        if (originalType === 'termin' || originalType === 'pinjaman') {
            formHTML = _getFormPemasukanHTML(originalType, item);
        } else if (originalType === 'expense') {
            if (item.type === 'material') {
                formHTML = _getFormFakturMaterialHTML(item);
            } else {
                const categoryOptions = item.type === 'operasional' ?
                    appState.operationalCategories.map(c => ({ value: c.id, text: c.categoryName })) :
                    appState.otherCategories.map(c => ({ value: c.id, text: c.categoryName }));
                const masterType = item.type === 'operasional' ? 'op-cats' : 'other-cats';
                const categoryLabel = item.type === 'operasional' ? 'Kategori Operasional' : 'Kategori Lainnya';
                const categoryType = item.type === 'operasional' ? 'Operasional' : 'Lainnya';
                const supplierOptions = appState.suppliers
                    .filter(s => s.category === categoryType)
                    .map(s => ({ value: s.id, text: s.supplierName }));
                const projectOptions = appState.projects.map(p => ({ value: p.id, text: p.projectName }));
                formHTML = _getFormPengeluaranHTML(item.type, categoryOptions, masterType, categoryLabel, supplierOptions, projectOptions, item);
            }
        } else if (originalType === 'fee_bill') {
            formHTML = `
                <form id="edit-item-form" data-id="${item.id}" data-type="fee_bill">
                    <div class="form-group"><label>Deskripsi</label><input type="text" name="description" value="${item.description}" required></div>
                    <div class="form-group"><label>Jumlah Fee</label><input type="text" inputmode="numeric" name="amount" value="${new Intl.NumberFormat('id-ID').format(item.amount)}" required></div>
                    <p class="form-notice">Mengedit tagihan ini tidak akan mengubah catatan pemasukan asli.</p>
                </form>
            `;
        }

        hideToast();
        const modalEl = createModal('editItem', { 
            title: `Edit Data`, 
            content: formHTML, 
            footer: ''
        });

        const contextElement = modalEl || document.getElementById('detail-pane');
        if (contextElement) {
            _initCustomSelects(contextElement);
            contextElement.querySelectorAll('input[inputmode="numeric"]').forEach(input => input.addEventListener('input', _formatNumberInput));

            if (originalType === 'termin') _calculateAndDisplayFees();
            if (originalType === 'pinjaman') {
                _updateLoanCalculation();
                const form = contextElement.querySelector('form');
                form.querySelector('#loan-interest-type')?.addEventListener('change', () => {
                    form.querySelector('.loan-details')?.classList.toggle('hidden', form.querySelector('#loan-interest-type').value === 'none');
                });
                form.querySelector('input[name="totalAmount"]')?.addEventListener('input', _updateLoanCalculation);
                form.querySelector('input[name="rate"]')?.addEventListener('input', _updateLoanCalculation);
                form.querySelector('input[name="tenor"]')?.addEventListener('input', _updateLoanCalculation);
            }
            if (originalType === 'expense' && item.type === 'material') {
                _attachPengeluaranFormListeners('material', contextElement);
            }

            // Floating Save FAB inside modal
            try {
                const fab = document.createElement('button');
                fab.className = 'fab fab-pop-in';
                fab.title = 'Simpan';
                fab.setAttribute('aria-label', 'Simpan perubahan');
                fab.setAttribute('data-tooltip', 'Simpan');
                fab.innerHTML = '<span class="material-symbols-outlined">save</span>';
                fab.addEventListener('click', () => {
                    const form = contextElement.querySelector('#edit-item-form');
                    if (form) { form.requestSubmit ? form.requestSubmit() : form.submit(); }
                });
                const modalBg = document.getElementById('editItem-modal') || contextElement.closest('.modal-bg') || contextElement;
                if (modalBg) modalBg.appendChild(fab);
            } catch (_) {}
        }
    } catch (error) {
        hideToast();
        toast('error', `Gagal memuat form edit: ${error.message}`);
        console.error("handleEditItem Error:", error);
    }
}


async function handleUpdateItem(form) {
    const { id, type } = form.dataset;
    let dataToUpdate = {}, config = { title: 'Data' }, collectionRef, table;

    try {
        const fileInput = form.elements['attachment'];
        if (fileInput && fileInput.files[0]) {
            const loadingToast = toast('syncing', 'Mengunggah lampiran...');
            try {
                const file = fileInput.files[0];
                dataToUpdate.attachmentURL = await handleFileUpload(file, 'attachments');
                dataToUpdate.attachmentName = file.name;
            } catch (uploadError) {
                loadingToast.close();
                toast('error', `Gagal unggah file: ${uploadError.message}`);
                return false;
            }
            loadingToast.close();
        }

        switch (type) {
            case 'termin':
                table = localDB.incomes; collectionRef = incomesCol; config.title = 'Pemasukan Termin';
                dataToUpdate = { ...dataToUpdate, amount: parseFormattedNumber(form.elements['pemasukan-jumlah'].value), date: new Date(form.elements['pemasukan-tanggal'].value), projectId: form.elements['pemasukan-proyek'].value };
                break;
            
            case 'loan': case 'pinjaman':
                table = localDB.funding_sources; collectionRef = fundingSourcesCol; config.title = 'Pinjaman';
                const interestType = form.elements['loan-interest-type'].value;
                dataToUpdate = { ...dataToUpdate, totalAmount: parseFormattedNumber(form.elements.totalAmount.value), date: new Date(form.elements.date.value), creditorId: form.elements['pemasukan-kreditur'].value, interestType, rate: interestType === 'interest' ? Number(form.elements.rate.value || 0) : 0, tenor: interestType === 'interest' ? Number(form.elements.tenor.value || 0) : 0 };
                if (dataToUpdate.interestType === 'interest') {
                    const amount = dataToUpdate.totalAmount;
                    const totalInterest = amount * (dataToUpdate.rate / 100) * dataToUpdate.tenor;
                    dataToUpdate.totalRepaymentAmount = amount + totalInterest;
                }
                break;

            case 'fee_bill':
                table = localDB.bills; collectionRef = billsCol; config.title = 'Tagihan Fee';
                dataToUpdate = { ...dataToUpdate, description: form.elements.description.value.trim(), amount: parseFormattedNumber(form.elements.amount.value) };
                break;

            case 'expense':
                table = localDB.expenses; collectionRef = expensesCol; config.title = 'Pengeluaran';
                if (form.querySelector('#invoice-items-container')) {
                    const items = [];
                    $$('.multi-item-row', form).forEach(row => {
                        const materialId = row.querySelector('input[name="materialId"]')?.value || null;
                        const priceInput = row.querySelector('input[name="itemPrice"]');
                        const qtyInput = row.querySelector('input[name="itemQty"]');
                        if (materialId && qtyInput?.value) {
                            const qty = parseLocaleNumber(qtyInput.value);
                            const price = priceInput ? parseFormattedNumber(priceInput.value) : 0;
                            items.push({ name: row.querySelector('.custom-select-trigger span')?.textContent || 'Barang', price, qty, total: price * qty, materialId });
                        }
                    });
                    if (items.length === 0) throw new Error('Faktur harus memiliki minimal satu barang.');
                    dataToUpdate = { ...dataToUpdate, projectId: form.elements['project-id'].value, supplierId: form.elements['supplier-id'].value, description: form.elements.description.value, date: new Date(form.elements.date.value), items: items, amount: items.reduce((sum, item) => sum + item.total, 0) };
                } else {
                    dataToUpdate = { ...dataToUpdate, amount: parseFormattedNumber(form.elements['pengeluaran-jumlah'].value), description: form.elements['pengeluaran-deskripsi'].value, date: new Date(form.elements['pengeluaran-tanggal'].value), projectId: form.elements['expense-project'].value, supplierId: form.elements['expense-supplier'].value, categoryId: form.elements['expense-category']?.value || '' };
                }
                break;
            default: throw new Error('Tipe data untuk update tidak dikenal.');
        }
    } catch (e) {
        toast('error', e.message);
        return false;
    }

    const currentItem = await table.get(id);
    if (!currentItem) {
        toast('error', 'Item asli tidak ditemukan di database lokal.');
        return false;
    }
    
    const dataToStore = { ...currentItem, ...dataToUpdate, updatedAt: new Date() };

    if (navigator.onLine && !_isQuotaExceeded()) {
        const loadingToast = toast('syncing', `Memperbarui ${config.title}...`);
        try {
            await runTransaction(db, async (transaction) => {
                const docRef = doc(collectionRef, id);
                const serverSnap = await transaction.get(docRef);
                const localBaseRev = currentItem.serverRev || 0;
                const serverRev = serverSnap.exists() ? (serverSnap.data().rev || 0) : 0;
                const isSoftDeleteOperation = dataToUpdate.isDeleted === 1;
                if (serverSnap.exists() && serverRev > localBaseRev && currentItem.syncState === 'pending_update' && !isSoftDeleteOperation) { throw new Error(`Conflict detected on ${type}:${id}.`); }
                const nextRev = serverRev + 1;
                const firestoreData = { ...dataToStore, syncState: 'synced', serverRev: nextRev };
                delete firestoreData.localId;
                transaction.set(docRef, { ...firestoreData, rev: nextRev, updatedAt: serverTimestamp() }, { merge: true });
                if (type === 'expense') {
                    const localBill = await localDB.bills.where({ expenseId: id }).first();
                    if (localBill) {
                        const billRef = doc(billsCol, localBill.id);
                        const serverBillSnap = await transaction.get(billRef);
                        if (serverBillSnap.exists()) {
                            const serverBillData = serverBillSnap.data();
                            transaction.update(billRef, { amount: dataToUpdate.amount, description: dataToUpdate.description, dueDate: dataToUpdate.date || serverBillData.dueDate || serverTimestamp(), rev: (serverBillData.rev || 0) + 1, updatedAt: serverTimestamp() });
                        }
                    }
                }
            });
            await table.put({ ...dataToStore, syncState: 'synced' });
            if (type === 'expense') {
                const localBill = await localDB.bills.where({ expenseId: id }).first();
                if (localBill) { await localDB.bills.update(localBill.id, { amount: dataToUpdate.amount, description: dataToUpdate.description, dueDate: dataToUpdate.date || new Date(), syncState: 'synced', updatedAt: new Date() }); }
            }
            await loadAllLocalDataToState();
            loadingToast.close();
            return true;
        } catch (error) {
            loadingToast.close();
            toast('error', `Gagal update di server: ${error.message}. Perubahan disimpan lokal.`);
            await table.put({ ...dataToStore, syncState: 'pending_update' });
            await syncToServer({ silent: true });
            return true;
        }
    } else {
        try {
            await table.put({ ...dataToStore, syncState: 'pending_update' });
            if (type === 'expense') {
                const localBill = await localDB.bills.where({ expenseId: id }).first();
                if (localBill) { await localDB.bills.update(localBill.id, { amount: dataToUpdate.amount, description: dataToUpdate.description, dueDate: dataToUpdate.date || new Date(), syncState: 'pending_update', updatedAt: new Date() }); }
            }
            _logActivity(`Memperbarui Data (Offline): ${config.title}`, { docId: id });
            await loadAllLocalDataToState();
            return true;
        } catch(error) {
            toast('error', `Gagal menyimpan di perangkat: ${error.message}`);
            return false;
        }
    }
}
async function handleDeleteItem(id, type) {
    const itemMap = {
        bill: { name: 'Tagihan', list: appState.bills },
        expense: { name: 'Pengeluaran', list: appState.expenses },
        termin: { name: 'Pemasukan', list: appState.incomes },
        pinjaman: { name: 'Pinjaman', list: appState.fundingSources },
        attendance: { name: 'Absensi', list: appState.attendanceRecords },
    };
    const config = itemMap[type];
    if (!config) return;

    // --- MATA-MATA ---
    console.log(`[handleDeleteItem] Menerima permintaan hapus untuk tipe: "${type}" dengan ID: ${id}`);
    
    const itemIndex = config.list.findIndex(i => i.id === id);
    if (itemIndex === -1) {
        // --- MATA-MATA ---
        console.error(`[handleDeleteItem] GAGAL: Item dengan ID ${id} tidak ditemukan di appState.${type}. Proses dibatalkan.`);
        return; 
    }

    const item = config.list[itemIndex];
    const itemName = item?.description || item?.workerName || config.name;

    const { success, undoAction } = await _performSoftDelete(id, type, true);

    if (!success) {
        toast('error', `Gagal menghapus ${config.name}.`);
        // --- MATA-MATA ---
        console.error(`[handleDeleteItem] _performSoftDelete melaporkan kegagalan untuk item ID: ${id}.`);
        return; 
    }

    // --- MATA-MATA ---
    console.log(`[handleDeleteItem] SUKSES: Soft delete berhasil untuk item ID: ${id}. Melanjutkan ke UI...`);

    if (document.body.classList.contains('detail-view-active')) {
        const detailPane = document.querySelector('.detail-pane');
        await _animateDetailPaneDeletion(detailPane);
    } else {
        await _removeItemFromListWithAnimation(id);
    }    
    config.list.splice(itemIndex, 1);
    appState.recycledItemsCache = null;

    _logActivity(`Memindahkan ke Sampah: ${itemName}`, { docId: id });
    _calculateAndCacheDashboardTotals();
    syncToServer({ silent: true });

    const deleteMessages = {
        bill: 'Tagihan dipindahkan ke Sampah.',
        expense: 'Pengeluaran dipindahkan ke Sampah.',
        termin: 'Pemasukan dipindahkan ke Sampah.',
        pinjaman: 'Pinjaman dipindahkan ke Sampah.',
        attendance: 'Absensi dipindahkan ke Sampah.'
    };
    const deleteMsg = deleteMessages[type] || 'Item dipindahkan ke Sampah.';
    toast('info', deleteMsg, 6000, {
        actionText: 'Urungkan',
        variant: 'delete',
        onAction: async () => {
            toast('syncing', 'Mengembalikan...');
            await undoAction();
            await loadAllLocalDataToState();
            renderPageContent(); 
            toast('success', 'Aksi dibatalkan.');
        }
    });
}

// Empty all items in Sampah
async function _handleEmptyRecycleBin() {
    try {
        // Collect all soft-deleted items across tables
        const [exps, bills, incomes, loans, atts] = await Promise.all([
            localDB.expenses.where('isDeleted').equals(1).toArray(),
            localDB.bills.where('isDeleted').equals(1).toArray(),
            localDB.incomes.where('isDeleted').equals(1).toArray(),
            localDB.funding_sources.where('isDeleted').equals(1).toArray(),
            localDB.attendance_records.where('isDeleted').equals(1).toArray(),
        ]);
        const items = [
            ...exps.map(i => ({ id: i.id, table: 'expenses' })),
            ...bills.map(i => ({ id: i.id, table: 'bills' })),
            ...incomes.map(i => ({ id: i.id, table: 'incomes' })),
            ...loans.map(i => ({ id: i.id, table: 'funding_sources' })),
            ...atts.map(i => ({ id: i.id, table: 'attendance_records' })),
        ];
        if (items.length === 0) {
            toast('info', 'Sampah sudah kosong.');
            return;
        }
        createModal('confirmUserAction', {
            message: 'Anda akan MENGHAPUS PERMANEN semua item di Sampah. Tindakan ini tidak dapat dibatalkan. Lanjutkan?',
            onConfirm: () => _handleDeletePermanentItems(items)
        });
    } catch (e) {
        console.error('Gagal memproses kosongkan sampah:', e);
        toast('error', 'Gagal mengosongkan Sampah.');
    }
}

async function handleManageUsers() {
      toast('syncing', 'Memuat data pengguna...');
      try {
          const pendingQuery = query(membersCol, where("status", "==", "pending"));
          const pendingSnap = await getDocs(pendingQuery);
          const pendingUsers = pendingSnap.docs.map(d => ({
              id: d.id,
              ...d.data()
          }));
          const otherUsersQuery = query(membersCol, where("status", "!=", "pending"));
          const otherUsersSnap = await getDocs(otherUsersQuery);
          const otherUsers = otherUsersSnap.docs.map(d => ({
              id: d.id,
              ...d.data()
          }));
          appState.users = [...pendingUsers, ...otherUsers];
          const createUserHTML = (user) => {
              const userRole = user.role || 'viewer';
              const userStatus = user.status || 'pending';
              return `
                      <div class="master-data-item">
                          <div class="user-info-container">
                              <strong>${user.name}</strong>
                              <span class="user-email">${user.email}</span>
                              <div class="user-badges">
                                  <span class="user-badge role-${userRole.toLowerCase()}">${userRole}</span>
                                  <span class="user-badge status-${userStatus.toLowerCase()}">${userStatus}</span>
                              </div>
                          </div>
                          <div class="master-data-item-actions">
                              ${user.status === 'pending'?`
                                  <button class="btn-icon btn-icon-success" data-action="user-action" data-id="${user.id}" data-type="approve" title="Setujui"><span class="material-symbols-outlined">check_circle</span></button>
                                  <button class="btn-icon btn-icon-danger" data-action="user-action" data-id="${user.id}" data-type="delete" title="Tolak/Hapus"><span class="material-symbols-outlined">cancel</span></button>
                              ` : ''}
                              ${user.status === 'active' && user.role !== 'Owner'?`
                                  ${user.role !== 'Editor'?`<button class="btn-icon" data-action="user-action" data-id="${user.id}" data-type="make-editor" title="Jadikan Editor"><span class="material-symbols-outlined">edit_note</span></button>`:''}
                                  ${user.role !== 'Viewer'?`<button class="btn-icon" data-action="user-action" data-id="${user.id}" data-type="make-viewer" title="Jadikan Viewer"><span class="material-symbols-outlined">visibility</span></button>`:''}
                                  <button class="btn-icon btn-icon-danger" data-action="user-action" data-id="${user.id}" data-type="delete" title="Hapus"><span class="material-symbols-outlined">delete</span></button>
                              `: ''}
                          </div>
                      </div>`;
          };
  
          const pendingUsersHTML = pendingUsers.length > 0 ?
              `<h5 class="detail-section-title" style="margin-top: 0;">Menunggu Persetujuan</h5>${pendingUsers.map(createUserHTML).join('')}` :
              '';
          const otherUsersSorted = otherUsers.sort((a, b) => (a.role === 'Owner'?-1 : 1));
          const otherUsersHTML = otherUsers.length > 0 ?
              `<h5 class="detail-section-title" style="${pendingUsers.length > 0?'' : 'margin-top: 0;'}">Pengguna Terdaftar</h5>${otherUsersSorted.map(createUserHTML).join('')}` :
              '';
          const noUsersHTML = appState.users.length === 0?'<p class="empty-state-small">Tidak ada pengguna lain.</p>' : '';
          createModal('manageUsers', {
              title: 'Manajemen Pengguna',
              content: `
                  <div class="master-data-list">
                      ${noUsersHTML}
                      ${pendingUsersHTML}
                      ${otherUsersHTML}
                  </div>
              `
          });
          toast('success', 'Data pengguna dimuat.');
      } catch (e) {
          console.error("Gagal mengambil data pengguna:", e);
          toast('error', 'Gagal memuat data pengguna.');
          return;
      }
  }
async function handleUserAction(dataset) {
    const { id, type } = dataset;
    const user = appState.users.find(u => u.id === id);
    if (!user) return;

    const actionMap = {
        'approve': { message: `Setujui <strong>${user.name}</strong> sebagai Viewer?`, data: { status: 'active', role: 'Viewer' } },
        'make-editor': { message: `Ubah peran <strong>${user.name}</strong> menjadi Editor?`, data: { role: 'Editor' } },
        'make-viewer': { message: `Ubah peran <strong>${user.name}</strong> menjadi Viewer?`, data: { role: 'Viewer' } },
        'delete': { message: `Hapus atau tolak pengguna <strong>${user.name}</strong>? Aksi ini tidak dapat dibatalkan.`, data: null }
    };
    const action = actionMap[type];
    if (!action) return;

    createModal('confirmUserAction', {
        message: action.message,
        onConfirm: async () => {
            toast('syncing', 'Memproses...');

            try {
                const userRef = doc(membersCol, id);
                if (type === 'delete') {
                    await deleteDoc(userRef);
                } else {
                    await updateDoc(userRef, action.data);
                }

                _logActivity(`Aksi Pengguna: ${type}`, {
                    targetUserId: id,
                    targetUserName: user.name
                });
                
                handleManageUsers(); // Muat ulang daftar pengguna
                toast('success', 'Aksi berhasil dilakukan.');

            } catch (error) {
                console.error('User action error:', error);
                toast('error', 'Gagal memproses aksi.');
            }
        }
    });
}
async function _downloadAttachment(url, filename) {
    if (!url) return;
    toast('syncing', `Mengunduh ${filename}...`);
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error('Gagal mengunduh file dari server.');
        
        const blob = await response.blob();
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename || 'lampiran.jpg';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href); // Membersihkan memori
        hideToast();
    } catch (error) {
        console.error("Gagal mengunduh lampiran:", error);
        toast('error', 'Gagal mengunduh file.');
    }
}
  async function handleEditPdfSettings() {
      toast('syncing', 'Memuat pengaturan...');
      let currentSettings = {};
      try {
          const docSnap = await getDoc(settingsDocRef);
          if (docSnap.exists()) {
              currentSettings = docSnap.data();
          }
          hideToast();
      } catch (e) {
          toast('error', 'Gagal memuat pengaturan.');
          console.error("Gagal memuat pengaturan PDF:", e);
      }
      // Definisikan nilai default jika pengaturan belum ada
      const companyName = currentSettings.companyName || 'CV. ALAM BERKAH ABADI';
      const logoUrl = currentSettings.logoUrl || 'https://i.ibb.co/mRp1s1W/logo-cv-aba.png';
      const headerColor = currentSettings.headerColor || '#26a69a';
      // Buat konten HTML untuk modal form
      const content = `
              <form id="pdf-settings-form">
                  <p>Ubah detail yang akan muncul di header semua laporan PDF.</p>
                  <div class="form-group">
                      <label>Nama Perusahaan</label>
                      <input type="text" name="companyName" value="${companyName}" required>
                  </div>
                  <div class="form-group">
                      <label>URL Logo (PNG/JPG)</label>
                      <input type="url" name="logoUrl" value="${logoUrl}" placeholder="https://contoh.com/logo.png">
                  </div>
                  <div class="form-group">
                      <label>Warna Header Tabel</label>
                      <input type="color" name="headerColor" value="${headerColor}" style="width: 100%; height: 40px;">
                  </div>
                  <div class="modal-footer" style="margin-top: 1.5rem;">
                      <button type="submit" class="btn btn-primary">Simpan Pengaturan</button>
                  </div>
              </form>
          `;
      const modal = createModal('dataDetail', {
          title: 'Pengaturan Laporan PDF',
          content
      });
      // Tambahkan listener untuk menyimpan form
      $('#pdf-settings-form', modal).addEventListener('submit', async (e) => {
          e.preventDefault();
          toast('syncing', 'Menyimpan pengaturan...');
          const form = e.target;
          const newSettings = {
              companyName: form.elements.companyName.value.trim(),
              logoUrl: form.elements.logoUrl.value.trim(),
              headerColor: form.elements.headerColor.value,
          };
          try {
              await setDoc(settingsDocRef, newSettings);
              appState.pdfSettings = newSettings; // Update cache di state
              toast('success', 'Pengaturan PDF berhasil disimpan.');
              closeModal(modal);
          } catch (error) {
              toast('error', 'Gagal menyimpan pengaturan.');
              console.error(error);
          }
      });
  }
  
  // =======================================================
  //          SEKSI 4: RENDER UI UTAMA & EVENT LISTENERS
  // =======================================================

function renderUI() {
    const { currentUser, userStatus } = appState;
    const container = $('#page-container');
    if (!container) {
        console.error("Elemen #page-container tidak ditemukan!");
        return;
    }
    if (!currentUser || userStatus !== 'active') {
        document.body.classList.add('guest-mode');
        let screenHTML = '';
        if (userStatus === 'pending') {
            document.body.classList.add('pending-mode');
            screenHTML = getPendingScreenHTML();
        } else {
            document.body.classList.remove('pending-mode');
            screenHTML = getAuthScreenHTML();
        }
        container.innerHTML = screenHTML;
        const titleEl = $('#page-label-name');
        if (titleEl) titleEl.textContent = '';
        const bn = $('#bottom-nav');
        if (bn) bn.innerHTML = '';
        const sidebar = $('#sidebar-nav');
        if (sidebar) sidebar.innerHTML = '';
    } else {
        document.body.classList.remove('guest-mode');
        document.body.classList.remove('pending-mode');
        container.innerHTML = '';
        try {
            const collapsedPref = localStorage.getItem('sidebarCollapsed') === '1';
            document.body.classList.toggle('sidebar-collapsed', collapsedPref);
        } catch (_) {}
        renderBottomNav();
        renderSidebar();
        renderPageContent();
        initHistoryNavigation();
    }
}

async function _transitionContent(container, newHtml) {
    if (!container) return;

    // 1. Lakukan fade out pada konten yang ada (skeleton)
    container.classList.add('content-fade-out');
    
    // Tunggu animasi fade out selesai
    await new Promise(resolve => setTimeout(resolve, 150));

    // 2. Ganti konten HTML
    container.innerHTML = newHtml;
    container.classList.remove('content-fade-out'); // Siapkan untuk fade in
    container.classList.add('content-fade-in');

    // 3. Terapkan animasi 'pop-in' pada setiap kartu atau item daftar
    const itemsToAnimate = container.querySelectorAll('.card, .dense-list-item, .jurnal-card, .log-item');
    itemsToAnimate.forEach((item, index) => {
        item.classList.add('card-item-enter');
        // Atur delay animasi agar item muncul satu per satu
        item.style.animationDelay = `${index * 50}ms`;
    });
    
    // Hapus kelas transisi setelah selesai
    setTimeout(() => {
        container.classList.remove('content-fade-in');
    }, 300);
}
function getAuthScreenHTML() {
    let lastUser = null;
    try {
        lastUser = JSON.parse(localStorage.getItem('lastActiveUser'));
    } catch (e) {
        lastUser = null;
    }

    if (lastUser && lastUser.displayName) {
        return `
            <div class="auth-card returning-user">
                <div class="card-body">
                    <img src="${lastUser.photoURL || 'icons-logo.png'}" alt="Avatar" class="profile-avatar-large">
                    <p class="welcome-back-text">Selamat datang kembali,</p>
                    <h4 class="returning-user-name">${lastUser.displayName}</h4>
                    <button class="btn btn-primary btn-block" data-action="auth-action">
                        Lanjutkan sebagai ${lastUser.displayName.split(' ')[0]}
                    </button>
                    <button class="btn btn-secondary btn-block" data-action="login-different-account">
                        Gunakan akun lain
                    </button>
                </div>
            </div>`;
    } 
    
    else {
        return `
            <div class="auth-card">
                <div class="card-header">
                    <h3>Selamat Datang di BanPlex</h3>
                </div>
                <div class="card-body">
                    <p>Silakan masuk menggunakan akun Google Anda untuk melanjutkan.</p>
                    <button class="btn btn-primary" data-action="auth-action">
                        <span class="material-symbols-outlined">login</span> Masuk dengan Google
                    </button>
                </div>
            </div>`;
    }
}

function getPendingScreenHTML() {
    const user = auth.currentUser;
    return `
        <div class="pending-card">
            <div class="card-body" style="display: flex; flex-direction: column; align-items: center; gap: 1rem; padding: 2rem 1.5rem; text-align: center;">
                <span class="material-symbols-outlined" style="font-size: 48px; color: var(--warning);">
                    hourglass_top
                </span>
                <h4 style="margin: 0;">Menunggu Persetujuan</h4>
                <p style="margin: 0; color: var(--text-dim);">
                    Akun Anda (${user?.email || ''}) telah terdaftar dan sedang menunggu persetujuan dari Owner. Silakan coba lagi nanti.
                </p>
                <button class="btn btn-secondary" data-action="auth-action" style="margin-top: 1rem;">
                    <span class="material-symbols-outlined">logout</span> Logout
                </button>
            </div>
        </div>
    `;
}
function renderBottomNav() {
    const navContainer = $('#bottom-nav');
    if (!navContainer) return;

    const role = appState.userRole;
    const excludedLinks = ['pengeluaran', 'absensi'];
    let accessibleLinks = ALL_NAV_LINKS.filter(link => link.roles.includes(role) && !excludedLinks.includes(link.id));

    const bottomNavIds = (BOTTOM_NAV_BY_ROLE[role] || []).filter(id => !excludedLinks.includes(id));
    
    if (bottomNavIds.length > 0) {
        accessibleLinks = accessibleLinks
            .filter(link => bottomNavIds.includes(link.id))
            .sort((a, b) => bottomNavIds.indexOf(a.id) - bottomNavIds.indexOf(b.id));
    } else {
        accessibleLinks = accessibleLinks.slice(0, 5);
    }

    const navItemsHTML = accessibleLinks.map(link => {
        const isActive = appState.activePage === link.id;
        return `
            <button class="nav-item ${isActive ? 'active' : ''}" data-nav="${link.id}">
                <span class="material-symbols-outlined">${link.icon}</span>
                <span class="nav-label">${link.label}</span>
            </button>
        `;
    }).join('');

    navContainer.innerHTML = navItemsHTML;
}
function renderSidebar() {
    const sidebar = $('#sidebar-nav');
    if (!sidebar) return;

    const { currentUser, userStatus } = appState;
    if (!currentUser || userStatus !== 'active') {
        sidebar.innerHTML = '';
        return;
    }

    const links = ALL_NAV_LINKS.filter(l => l.roles.includes(appState.userRole));
    const isCollapsed = document.body.classList.contains('sidebar-collapsed');
    const itemsHTML = links.map(link => {
        const isActive = appState.activePage === link.id;
        return `
            <button class="sidebar-nav-item ${isActive ? 'active' : ''}" data-nav="${link.id}">
                <span class="material-symbols-outlined">${link.icon}</span>
                <span class="nav-text">${link.label}</span>
            </button>
        `;
    }).join('');

    const user = appState.currentUser;
    const profileHTML = user ? `
        <div class="sidebar-profile">
            <div class="sidebar-profile-info">
                <img class="profile-avatar-sm" src="${user.photoURL || 'icons-logo.png'}" alt="${user.displayName || 'User'}" />
                <div class="profile-text">
                    <span class="profile-name-sm">${user.displayName || 'Pengguna'}</span>
                    <span class="profile-email-sm">${user.email || ''}</span>
                </div>
            </div>
        </div>
    ` : '';

    sidebar.innerHTML = `
        <div class="sidebar-header">
            <img class="sidebar-logo" src="icons-logo.png" alt="BanPlex" />
            <span class="sidebar-app-name">BanPlex</span>
            <button class="sidebar-toggle" data-action="toggle-sidebar" title="${isCollapsed ? 'Buka sidebar' : 'Tutup sidebar'}" aria-label="Toggle sidebar">
                <span class="material-symbols-outlined">${isCollapsed ? 'menu' : 'menu_open'}</span>
            </button>
        </div>
        <div class="sidebar-nav-list">
            ${itemsHTML}
        </div>
        ${profileHTML}
    `;
}

async function renderPageContent() {
    const { activePage, userStatus } = appState;
    if (userStatus !== 'active') return;

    const fabContainer = $('#fab-container');
    if (fabContainer) {
        fabContainer.innerHTML = ''; // Selalu bersihkan FAB sebelum render
        if (activePage === 'dashboard' && !isViewer()) {
            const unreadCount = (appState.comments || [])
                .filter(c => !c.isDeleted && _getUnreadCommentCount(c.parentId, appState.comments) > 0)
                .length;

            fabContainer.innerHTML = `
                <button class="fab" data-action="navigate" data-nav="komentar" title="Lihat Komentar">
                    <span class="material-symbols-outlined">chat</span>
                    ${unreadCount > 0 ? `<span class="badge">${unreadCount}</span>` : ''}
                </button>
            `;
        }
    }

    const pageLink = ALL_NAV_LINKS.find(link => link.id === activePage);
    $('#page-label-name').textContent = pageLink ? pageLink.label : '';

    const container = $('.page-container');
    
    const fullBleedPages = ['pemasukan', 'tagihan', 'jurnal', 'stok', 'log_aktivitas', 'komentar']; // <-- 'komentar' ditambahkan
    const hasUnifiedPanelPages = ['tagihan', 'jurnal', 'stok', 'log_aktivitas', 'pemasukan', 'komentar']; // <-- 'komentar' ditambahkan

    container.classList.toggle('full-bleed', fullBleedPages.includes(activePage));
    document.body.classList.toggle('page-has-unified-panel', hasUnifiedPanelPages.includes(activePage));
    
    container.innerHTML = _getSkeletonLoaderHTML(activePage);

    await new Promise(resolve => setTimeout(resolve, 50));

    const pageRenderers = {
        'dashboard': renderDashboardPage,
        'pemasukan': renderPemasukanPage,
        'pengeluaran': renderPengeluaranPage,
        'absensi': renderAbsensiPage,
        'jurnal': renderJurnalPage,
        'stok': renderStokPage,
        'tagihan': renderTagihanPage,
        'komentar': renderKomentarPage, // <-- Renderer baru ditambahkan
        'laporan': renderLaporanPage,
        'simulasi': renderSimulasiBayarPage,
        'pengaturan': renderPengaturanPage,
        'log_aktivitas': renderLogAktivitasPage,
        'recycle_bin': renderRecycleBinPage
    };

    const renderFunc = pageRenderers[activePage];
    if (typeof renderFunc === 'function') {
        return renderFunc();
    } else {
        const emptyHTML = `<p class="empty-state">Halaman tidak ditemukan.</p>`;
        return _transitionContent(container, emptyHTML);
    }
}

function _getSingleJurnalHarianCardHTML(dateStr, dayData) {
      const dayDate = new Date(dateStr);
      const formattedDate = dayDate.toLocaleDateString('id-ID', {
          weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC'
      });
  
      return `
          <div class="card card-list-item" data-action="view-jurnal-harian" data-date="${dateStr}" style="opacity:0; transform: translateY(10px); transition: opacity 0.4s ease, transform 0.4s ease;">
              <div class="card-list-item-content">
                  <div class="card-list-item-details">
                      <h5 class="card-list-item-title">${formattedDate}</h5>
                      <p class="card-list-item-subtitle">${dayData.workerCount} Pekerja Hadir</p>
                  </div>
                  <div class="card-list-item-amount-wrapper">
                      <strong class="card-list-item-amount negative">${fmtIDR(dayData.totalUpah)}</strong>
                      <p class="card-list-item-repayment-info">Total Beban Upah</p>
                  </div>
              </div>
          </div>
      `;
  }
  function upsertJurnalHarianCardInUI(dateStr) {
      const container = document.querySelector('#jurnal-absensi-content div, #sub-page-content div');
      if (!container) return;
  
      const groupedByDay = _groupAttendanceByDay(appState.attendanceRecords);
      const dayData = groupedByDay[dateStr];
  
      if (!dayData) {
          removeJurnalHarianCardFromUI(dateStr);
          return;
      }
  
      const existingCard = container.querySelector(`.card-list-item[data-date="${dateStr}"]`);
      
      if (existingCard) {
          console.log(`Memperbarui UI untuk Jurnal Harian tanggal: ${dateStr}`);
          const tempDiv = document.createElement('div');
          tempDiv.innerHTML = _getSingleJurnalHarianCardHTML(dateStr, dayData);
          existingCard.innerHTML = tempDiv.firstElementChild.innerHTML;
      } else {
          console.log(`Data baru untuk Jurnal Harian tanggal: ${dateStr}. Merender ulang list.`);
          _renderJurnalHarianView(container);
      }
  }
  
  function removeJurnalHarianCardFromUI(dateStr) {
      const cardElement = document.querySelector(`.card-list-item[data-date="${dateStr}"]`);
      if (cardElement) {
          console.log(`Menghapus kartu Jurnal Harian dari UI untuk tanggal: ${dateStr}`);
          cardElement.style.opacity = '0';
          cardElement.style.transform = 'scale(0.95)';
          setTimeout(() => cardElement.remove(), 400);
      }
  }
  
  function _getSingleBillRowHTML(item) {
      let supplierName = '';
      const expense = appState.expenses.find(e => e.id === item.expenseId);
      if (expense && expense.supplierId) {
          supplierName = appState.suppliers.find(s => s.id === expense.supplierId)?.supplierName || '';
      } else if (item.type === 'gaji') {
          const workerDetail = item.workerDetails ? item.workerDetails[0] : null;
          supplierName = workerDetail?.name || item.description;
      }
  
      const date = item.dueDate ? _getJSDate(item.dueDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }) : '-';
      const subtitle = supplierName ? `${supplierName} - Dicatat: ${date}` : `Dicatat: ${date}`;
      const remainingAmount = (item.amount || 0) - (item.paidAmount || 0);
      const isFullyPaid = remainingAmount <= 0;
  
      let statusHTML = '';
      if (isFullyPaid) {
          statusHTML = `<span class="status-badge positive">Lunas</span>`;
      } else if (item.paidAmount > 0) {
          statusHTML = `<span class="status-badge warn">Sisa ${fmtIDR(remainingAmount)}</span>`;
      } else {
          statusHTML = `<span class="status-badge negative">Belum Dibayar</span>`;
      }
  
      return `
          <div class="dense-list-item" data-id="${item.id}" data-expense-id="${item.expenseId || ''}" style="opacity:0; transform: translateY(10px); transition: opacity 0.4s ease, transform 0.4s ease;">
              <div class="item-main-content" data-action="open-bill-detail">
                  <strong class="item-title">${item.description}</strong>
                  <span class="item-subtitle">${subtitle}</span>
                  <div class="item-details">
                      <strong class="item-amount">${fmtIDR(item.amount)}</strong>
                      ${statusHTML}
                  </div>
              </div>
              <div class="item-actions">
                  <button class="btn-icon" data-action="open-bill-actions-modal" data-id="${item.id}" data-expense-id="${item.expenseId || ''}">
                      <span class="material-symbols-outlined">more_vert</span>
                  </button>
              </div>
          </div>
      `;
  }
  
  function upsertBillRowInUI(billData) {
      const container = document.querySelector('#sub-page-content .dense-list-container');
      if (!container) return;
  
      const existingRow = container.querySelector(`.dense-list-item[data-id="${billData.id}"]`);
      
      if (existingRow) {
          console.log(`Memperbarui UI untuk tagihan ID: ${billData.id}`);
          const newRowHTML = _getSingleBillRowHTML(billData);
          const tempDiv = document.createElement('div');
          tempDiv.innerHTML = newRowHTML;
          existingRow.innerHTML = tempDiv.firstElementChild.innerHTML; // Hanya ganti konten dalamnya
      } else {
          console.log(`Menambahkan tagihan baru ke UI dengan ID: ${billData.id}`);
          const newRowHTML = _getSingleBillRowHTML(billData);
          container.insertAdjacentHTML('afterbegin', newRowHTML);
          setTimeout(() => {
              const newElement = container.querySelector(`.dense-list-item[data-id="${billData.id}"]`);
              if(newElement) {
                  newElement.style.opacity = '1';
                  newElement.style.transform = 'translateY(0)';
              }
          }, 50);
      }
  }
  
  function removeBillRowFromUI(billId) {
      const rowElement = document.querySelector(`.dense-list-item[data-id="${billId}"]`);
      if (rowElement) {
          console.log(`Menghapus tagihan dari UI dengan ID: ${billId}`);
          rowElement.style.opacity = '0';
          rowElement.style.transform = 'translateX(-20px)';
          setTimeout(() => rowElement.remove(), 400);
      }
  }
  
  async function handleNavigation(navId, opts = {}) {
    if (document.body.classList.contains('detail-view-active')) {
        hideMobileDetailPage();
    }
    if (document.body.classList.contains('detail-pane-open')) {
        closeDetailPane();
    }

    closeAllModals();
    if (!navId || appState.activePage === navId || isPageTransitioning) return;    isPageTransitioning = true;
    setTimeout(() => { isPageTransitioning = false; }, 500);
    const container = document.querySelector('.list-pane .page-container');
    container.classList.add('page-exit');
    container.addEventListener('animationend', async function onPageExit() {
        container.removeEventListener('animationend', onPageExit);
        container.classList.remove('page-exit');
        appState.activePage = navId;
        localStorage.setItem('lastActivePage', navId);
        if (opts.push !== false) {
            try { history.pushState({ page: navId }, '', window.location.href); } catch (_) {}
        }
        renderBottomNav();
        renderSidebar();
        await renderPageContent();
        container.classList.add('page-enter');
        container.addEventListener('animationend', function onPageEnter() {
            container.removeEventListener('animationend', onPageEnter);
            container.classList.remove('page-enter');
        }, { once: true });
    }, { once: true });
}
async function _animateTabSwitch(contentContainer, renderNewContentFunc, direction = 'forward') {
    if (!contentContainer) return;
    const exitClass = direction === 'forward' ? 'sub-page-exit-to-left' : 'sub-page-exit-to-right';
    const enterClass = direction === 'forward' ? 'sub-page-enter-from-right' : 'sub-page-enter-from-left';
    contentContainer.classList.add(exitClass);
    contentContainer.addEventListener('animationend', async function onExitAnimationEnd() {
        contentContainer.removeEventListener('animationend', onExitAnimationEnd);
        contentContainer.classList.remove(exitClass);
        await renderNewContentFunc();
        contentContainer.classList.add(enterClass);
        contentContainer.addEventListener('animationend', function onEnterAnimationEnd() {
            contentContainer.removeEventListener('animationend', onEnterAnimationEnd);
            contentContainer.classList.remove(enterClass);
        }, { once: true });
    }, { once: true });
}

  function MapsTo(pageId) {
      return handleNavigation(pageId, { source: 'map', push: true });
  }
  
  function initHistoryNavigation() {
      if (window.__banplex_history_init) return; // avoid double init
      window.__banplex_history_init = true;
      try {
          if ('replaceState' in history) {
              const initial = { page: appState.activePage };
              history.replaceState(initial, '', window.location.href);
          }
      } catch (_) {}
      window.addEventListener('popstate', (e) => {
        // Prioritas 1: Tutup modal jika ada
        const modalContainer = $('#modal-container');
        if (modalContainer) {
            const topModal = Array.from(modalContainer.querySelectorAll('.modal-bg.show')).pop();
            if (topModal) {
                _closeModalImmediate(topModal);
                // Tambahkan kembali state yang baru saja dihapus oleh 'back'
                history.pushState(e.state, '', window.location.href);
                return;
            }
        }
    
        // Prioritas 2: Periksa apakah kita harus menutup panel detail
        const isDetailViewOpen = document.body.classList.contains('detail-view-active');
        // Jika state riwayat BUKAN untuk detail view TAPI panelnya MASIH terbuka,
        // berarti kita harus menutupnya.
        if (isDetailViewOpen && (!e.state || !e.state.detailView)) {
            if (appState.detailPaneHistory.length > 0) {
                // Jika ada riwayat internal, kembali ke state sebelumnya
                const previousState = appState.detailPaneHistory.pop();
                showMobileDetailPage(previousState, true); // `true` menandakan ini navigasi 'kembali'
            } else {
                // Jika tidak ada riwayat, tutup panel sepenuhnya
                hideMobileDetailPage();
            }
            return; // Hentikan di sini
        }
    
        // Prioritas 3: Navigasi halaman utama (logika lama)
        const targetPage = e.state && e.state.page ? e.state.page : 'dashboard'; // Fallback ke dashboard
        if (appState.activePage !== targetPage) {
            handleNavigation(targetPage, { source: 'history', push: false });
        }
    });  
      // Optional: edge-swipe back gesture for Android-like UX inside the PWA
      const EDGE = 24; // px from left/right edge to start tracking
      const THRESH_X = 60; // required horizontal travel
      const THRESH_Y = 40; // vertical tolerance
      let tracking = false, startX = 0, startY = 0, fromLeft = false, fromRight = false;
  
      window.addEventListener('pointerdown', (e) => {
          try {
              if (e.pointerType !== 'touch') return;
          } catch (_) { /* older browsers */ }
          const x = e.clientX, y = e.clientY;
          fromLeft = x <= EDGE; fromRight = (window.innerWidth - x) <= EDGE;
          if (!fromLeft && !fromRight) return;
          tracking = true; startX = x; startY = y;
      }, { passive: true });
  
      window.addEventListener('pointermove', (e) => {
          if (!tracking) return;
          const dx = e.clientX - startX; const dy = e.clientY - startY;
          if (Math.abs(dx) >= THRESH_X && Math.abs(dy) <= THRESH_Y) {
              // left-edge swipe right OR right-edge swipe left
              if ((fromLeft && dx > 0) || (fromRight && dx < 0)) {
                  tracking = false;
                  // Trigger back if there is history to go back to
                  if (history.length > 1) {
                      history.back();
                  }
              }
          }
      }, { passive: true });
  
      const reset = () => { tracking = false; fromLeft = false; fromRight = false; };
      window.addEventListener('pointerup', reset, { passive: true });
      window.addEventListener('pointercancel', reset, { passive: true });
  }

// HAPUS FUNGSI SEBELUMNYA DAN GANTI DENGAN KODE LENGKAP INI
async function _runDeepCleanV4() {
    console.log("Memulai Pembersihan V4 (Metode Brute Force)...");
    toast('syncing', 'Membaca seluruh data tanpa indeks...');

    try {
        let fixedBills = 0;
        let fixedRecords = 0;

        await localDB.transaction('rw', localDB.expenses, localDB.bills, localDB.attendance_records, async () => {
            
            // --- BAGIAN 1: Membersihkan Tagihan Yatim (Bills) ---
            console.log("Membaca seluruh tabel tagihan (bills)...");
            // Membaca seluruh tabel ke memori tanpa menggunakan .where()
            const allBills = await localDB.bills.toArray();
            const billsToDelete = [];

            const validExpenseIds = new Set(
                (await localDB.expenses.toArray()).filter(e => e.isDeleted !== 1).map(e => e.id)
            );

            // Melakukan filter di memori (JavaScript), bukan di database
            for (const bill of allBills) {
                if (bill.isDeleted !== 1 && bill.expenseId && bill.type !== 'gaji' && bill.type !== 'fee') {
                    if (!validExpenseIds.has(bill.expenseId)) {
                        billsToDelete.push(bill.id);
                    }
                }
            }

            if (billsToDelete.length > 0) {
                console.log(`Menemukan ${billsToDelete.length} tagihan yatim untuk dihapus:`, billsToDelete);
                await localDB.bills.bulkDelete(billsToDelete);
                fixedBills = billsToDelete.length;
            }

            // --- BAGIAN 2: Mereset Status Absensi Yatim ---
            console.log("Membaca seluruh tabel absensi (attendance_records)...");
            // Membaca seluruh tabel absensi ke memori
            const allRecords = await localDB.attendance_records.toArray();
            const recordsToReset = [];

            // Membaca ulang tagihan setelah potensi penghapusan
            const currentValidBillIds = new Set(
                (await localDB.bills.toArray()).filter(b => b.isDeleted !== 1 && b.type === 'gaji').map(b => b.id)
            );

            for (const record of allRecords) {
                if (record.isPaid === true && record.billId) {
                    if (!currentValidBillIds.has(record.billId)) {
                        // Kumpulkan ID yang valid (bukan null/undefined)
                        if (record.id) recordsToReset.push(record.id);
                    }
                }
            }

            if (recordsToReset.length > 0) {
                console.log(`Menemukan ${recordsToReset.length} record absensi untuk direset statusnya.`);
                await localDB.attendance_records.where('id').anyOf(recordsToReset).modify({
                    isPaid: false,
                    billId: null,
                    syncState: 'pending_update'
                });
                fixedRecords = recordsToReset.length;
            }
        });

        const totalFixed = fixedBills + fixedRecords;
        if (totalFixed > 0) {
            hideToast();
            await toast('success', `Pembersihan selesai! ${totalFixed} data diperbaiki.`);
        } else {
            hideToast();
            await toast('info', 'Tidak ada data tersangkut yang ditemukan.');
        }

        await loadAllLocalDataToState();
        _calculateAndCacheDashboardTotals();
        renderPageContent();
        
        alert("Pembersihan brute-force selesai. Halaman akan dimuat ulang dengan data yang bersih.");

    } catch (error) {
        console.error('Proses pembersihan V4 gagal:', error);
        hideToast();
        toast('error', 'Gagal membersihkan data.');
        alert('Proses pembersihan gagal. Error: ' + error.message);
    }
}
window._runDeepCleanV4 = _runDeepCleanV4;

function attachEventListeners() {
    _initTagihanPageListeners();

    document.body.addEventListener('pointerdown', (e) => {
        pointerDownTarget = e.target;
        pointerStartX = e.clientX;
        pointerStartY = e.clientY;
    });

    document.body.addEventListener('pointerup', (e) => {
        const isTap = Math.abs(e.clientX - pointerStartX) < 10 && Math.abs(e.clientY - pointerStartY) < 10;
        if (!isTap || !pointerDownTarget) {
            pointerDownTarget = null;
            return;
        }

        if (Date.now() < _suppressClickUntil) {
            pointerDownTarget = null;
            return;
        }

        const target = e.target.closest('[data-action]');
        if (!target) {
            pointerDownTarget = null;
            return;
        }
    
        const action = target.dataset.action;
    
        // Aksi cepat untuk "tap" di mobile
        const tapActions = {
            'view-jurnal-harian': () => handleViewJurnalHarianModal(target.dataset.date),
            'view-worker-recap': () => handleViewWorkerRecapModal(target.dataset.workerId),
            'view-log-detail': () => {
                const { targetId, targetType } = target.dataset;
                if (targetId && targetType && (targetType === 'bill' || targetType === 'expense')) {
                    handleOpenBillDetail(targetType === 'bill' ? targetId : null, targetType === 'expense' ? targetId : null);
                }
            },
        };
    
        if (tapActions[action]) {
            tapActions[action]();
            _suppressClickUntil = Date.now() + 350;
            e.preventDefault(); 
            e.stopImmediatePropagation();
        }
    
        pointerDownTarget = null;
    });

    document.body.addEventListener('click', (e) => {
        if (Date.now() < _suppressClickUntil) {
            e.preventDefault();
            e.stopImmediatePropagation();
            return;
        }

        const target = e.target.closest('[data-action]');
        if (!target) return;

        const action = target.dataset.action;
        const cardWrapper = target.closest('.wa-card-v2-wrapper');

        if (action === 'item-tap') {
            if (!appState.selectionMode.active) {
                const isDesktop = window.matchMedia('(min-width: 600px)').matches;
                
                if (appState.activePage === 'tagihan') {
                    if (isDesktop) {
                        handleOpenBillDetail(cardWrapper.dataset.id, cardWrapper.dataset.expenseId);
                    } else {
                        handleOpenItemActionsModal({ id: cardWrapper.dataset.id, type: 'bill', expenseId: cardWrapper.dataset.expenseId });
                    }
                } else if (appState.activePage === 'pemasukan') {
                    const type = appState.activeSubPage.get('pemasukan');
                    if (isDesktop) {
                        handleOpenPemasukanDetail({ dataset: { id: cardWrapper.dataset.id, type } });
                    } else {
                        handleOpenItemActionsModal({ id: cardWrapper.dataset.id, type });
                    }
                }
            }
            return;
        }
        
        if (action === 'toggle-selection') {
            _toggleCardSelection(cardWrapper);
            return;
        }

        const { id, type, nav } = target.dataset;

        const clickActions = {
            'navigate': () => handleNavigation(nav),
            'auth-action': () => appState.currentUser ? createModal('confirmLogout', { onConfirm: handleLogout }) : signInWithGoogle(),
            'toggle-theme': toggleTheme,
            'manage-master': () => handleManageMasterData(type),
            'open-report-generator': () => handleGenerateReportModal(),
            
            'close-selection-mode': _deactivateSelectionMode,
            'select-all-items': () => _handleSelectAll(),
            'delete-selected-items': _handleDeleteSelectedItems,
            'open-selection-summary': handleOpenSelectionSummaryModal,

            'open-filter-modal': () => _showBillsFilterModal(_renderFilteredAndPaginatedBills),
            'open-sort-modal': () => _showBillsSortModal(_renderFilteredAndPaginatedBills),
            
            'open-item-actions-modal': () => handleOpenItemActionsModal(target.dataset),

            'view-jurnal-harian': () => handleViewJurnalHarianModal(target.dataset.date),
            'manage-master-global': () => {
                const globalTypes = ['suppliers', 'workers', 'professions', 'materials', 'op-cats', 'other-cats', 'creditors'];
                const content = globalTypes.map(t => {
                    const config = masterDataConfig[t];
                    return `<div class="settings-list-item" data-action="manage-master" data-type="${t}"><div class="icon-wrapper"><span class="material-symbols-outlined">${config.icon || 'database'}</span></div><span class="label">${config.title}</span></div>`;
                }).join('');
                createModal('dataDetail', { title: 'Kelola Master Data', content: `<div class="settings-list">${content}</div>` });
            },
            'reset-local-data': () => {
                createModal('confirmUserAction', {
                    message: 'PERINGATAN: Aksi ini akan menghapus semua data di perangkat Anda dan mengunduh ulang dari server. Semua perubahan yang belum tersinkron akan hilang. Yakin ingin melanjutkan?',
                    onConfirm: () => {
                        toast('syncing', 'Mereset database lokal...');
                        Dexie.delete('BanPlexDevLocalDB').then(() => {
                            alert('Database lokal berhasil dihapus. Aplikasi akan dimuat ulang.');
                            location.reload();
                        });
                    }
                });
            },
            'restore-item': (target) => {
                const { id, table } = target.dataset;
                if (id && table) {
                    _handleRestoreItems([{ id, table }]);
                    closeAllModals();
                }
            },
            'delete-permanent-item': (target) => {
                const { id, table } = target.dataset;
                if (id && table) {
                    _handleDeletePermanentItems([{ id, table }]);
                    closeAllModals();
                }
            }, 
           'restore-selected': () => {
                const selectedItems = Array.from(appState.selectionMode.selectedIds).map(id => {
                    const card = document.querySelector(`.recycle-bin-item[data-id="${id}"]`);
                    return { id: card.dataset.id, table: card.dataset.table };
                });
                _handleRestoreItems(selectedItems);
            },
            'delete-permanent-selected': () => {
                const selectedItems = Array.from(appState.selectionMode.selectedIds).map(id => {
                    const card = document.querySelector(`.recycle-bin-item[data-id="${id}"]`);
                    return { id: card.dataset.id, table: card.dataset.table };
                });
                _handleDeletePermanentItems(selectedItems);
            },
            'open-payment-history-modal': () => handleOpenPaymentHistoryModal(target.dataset),
            'sync-all-pending': syncToServer,
            'manage-users': handleManageUsers,
            'restore-orphan-loans': handleRestoreOrphanLoans,
            'server-cleanup': handleServerCleanUp,
            'user-action': () => handleUserAction(target.dataset),
            'recalculate-usage': handleRecalculateUsageCount,
            'open-conflicts': handleOpenConflictsPanel,
            'open-storage-stats': handleOpenStorageStats,
            'toggle-payment-history': () => {
                const section = target.closest('.payment-history-section');
                if (section) {
                    section.classList.toggle('open');
                }
            },
            'apply-conflict': () => resolveConflict(target.dataset.conflictId, true),
            'discard-conflict': () => resolveConflict(target.dataset.conflictId, false),
            'detail-pane-back': handleDetailPaneBack,
            'close-detail-pane': closeDetailPane,
            'edit-master-item': () => {
                const itemEl = target.closest('.master-data-item');
                if (itemEl) handleEditMasterItem(itemEl.dataset.id, itemEl.dataset.type);
            },
            'delete-master-item': () => {
                const itemEl = target.closest('.master-data-item');
                if (itemEl) handleDeleteMasterItem(itemEl.dataset.id, itemEl.dataset.type);
            },
            'add-worker-wage': () => {
                const context = target.closest('form');
                if (!context) return;
                appState.formStateCache = _serializeForm(context);
                const existingWages = Array.from(context.querySelectorAll('.worker-wage-summary-item')).reduce((acc, itemEl) => {
                    acc[itemEl.dataset.projectId] = JSON.parse(itemEl.dataset.wages);
                    return acc;
                }, {});
                _openWorkerWageDetailModal({
                    existingWages,
                    onSave: (newData) => {
                        toast('success', 'Upah proyek berhasil ditambahkan ke form.');
                        if (appState.detailPaneHistory.length > 0) {
                            const lastState = appState.detailPaneHistory[appState.detailPaneHistory.length - 1];
                            const tempDiv = document.createElement('div');
                            tempDiv.innerHTML = lastState.content;
                            const cachedData = appState.formStateCache;
                            if (cachedData) {
                                Object.entries(cachedData).forEach(([name, value]) => {
                                    const inputInHistory = tempDiv.querySelector(`[name="${name}"]`);
                                    if (inputInHistory) {
                                        inputInHistory.value = value;
                                        inputInHistory.setAttribute('value', value);
                                        const wrapper = inputInHistory.closest('.custom-select-wrapper');
                                        if (wrapper) {
                                            const selectedOption = wrapper.querySelector(`.custom-select-option[data-value="${value}"]`);
                                            const displaySpan = wrapper.querySelector('.custom-select-trigger > span:first-child');
                                            if (selectedOption && displaySpan) {
                                                displaySpan.textContent = selectedOption.textContent.trim();
                                            }
                                        }
                                    }
                                });
                            }
                            appState.formStateCache = null;
                            const summaryContainerInHistory = tempDiv.querySelector('#worker-wages-summary-list');
                            if (summaryContainerInHistory) {
                                const wagesInHistory = {};
                                summaryContainerInHistory.querySelectorAll('.worker-wage-summary-item').forEach(itemEl => {
                                    wagesInHistory[itemEl.dataset.projectId] = JSON.parse(itemEl.dataset.wages);
                                });
                                const updatedWages = { ...wagesInHistory,
                                    [newData.projectId]: newData.roles
                                };
                                _renderWorkerWagesSummary(summaryContainerInHistory, updatedWages);
                                lastState.content = tempDiv.innerHTML;
                            }
                        }
                    },
                });
            },
            'edit-worker-wage': () => {
                const context = target.closest('form');
                if (!context) return;
                const itemWrapper = target.closest('.worker-wage-summary-item');
                const projectId = itemWrapper.dataset.projectId;
                const existingWages = JSON.parse(itemWrapper.dataset.wages);
                _openWorkerWageDetailModal({
                    projectId,
                    existingWages,
                    onSave: (newData) => {
                        const mainForm = document.querySelector('#edit-master-form, #add-master-item-form');
                        if (!mainForm) return;
                        const summaryContainer = mainForm.querySelector('#worker-wages-summary-list');
                        if (!summaryContainer) return;
                        const allWages = {};
                        mainForm.querySelectorAll('.worker-wage-summary-item').forEach(el => {
                            const pId = el.dataset.projectId;
                            allWages[pId] = (pId === newData.projectId) ? newData.roles : JSON.parse(el.dataset.wages);
                        });
                        _renderWorkerWagesSummary(summaryContainer, allWages);
                        if (appState.detailPaneHistory.length > 0) {
                            const lastState = appState.detailPaneHistory[appState.detailPaneHistory.length - 1];
                            const tempDiv = document.createElement('div');
                            tempDiv.innerHTML = lastState.content;
                            const activeForm = document.querySelector('#add-master-item-form, #edit-master-form');
                            if (activeForm) {
                                activeForm.querySelectorAll('input, select, textarea').forEach(activeInput => {
                                    const historyInput = tempDiv.querySelector(`[name="${activeInput.name}"]`);
                                    if (historyInput) {
                                        if (activeInput.type === 'checkbox') {
                                            historyInput.checked = activeInput.checked;
                                        } else {
                                            historyInput.value = activeInput.value;
                                        }
                                    }
                                });
                            }
                            const summaryInHistory = tempDiv.querySelector('#worker-wages-summary-list');
                            if (summaryInHistory) {
                                summaryInHistory.innerHTML = summaryContainer.innerHTML;
                            }
                            lastState.content = tempDiv.innerHTML;
                        }
                    }
                });
            },
            'add-role-wage-row': () => {
                const list = target.previousElementSibling;
                if (!list || !list.classList.contains('role-wage-list')) return;
                const newRow = document.createElement('div');
                newRow.className = 'role-wage-row';
                newRow.innerHTML = `<input type="text" name="role_name" placeholder="Nama Peran"><input type="text" name="role_wage" inputmode="numeric" placeholder="Nominal Upah"><button type="button" class="btn-icon btn-icon-danger" data-action="remove-role-wage-row"><span class="material-symbols-outlined">delete</span></button>`;
                list.appendChild(newRow);
                newRow.querySelector('input[name="role_wage"]').addEventListener('input', _formatNumberInput);
            },
            'remove-role-wage-row': () => {
                target.closest('.role-wage-row')?.remove();
            },
            'open-pemasukan-form': async () => {
                toast('syncing', 'Mempersiapkan form...');
                await Promise.all([
                    fetchAndCacheData('projects', projectsCol, 'projectName'),
                    fetchAndCacheData('fundingCreditors', fundingCreditorsCol, 'creditorName')
                ]);
                const activeTab = appState.activeSubPage.get('pemasukan') || 'termin';
                const formHTML = _getFormPemasukanHTML(activeTab);
                hideToast();
                const modal = createModal('dataDetail', {
                    title: `Tambah ${activeTab === 'termin' ? 'Termin Baru' : 'Pinjaman Baru'}`,
                    content: formHTML
                });
                if (modal) {
                    _attachPemasukanFormListeners(modal);
                    }
                },
                'open-comments-view': () => {
                    const { parentId, parentType } = target.dataset;
                    if (parentId && parentType) {
                        openCommentsViewWithPrefill(parentId, parentType);
                    }
                },
                'forward-to-comments': async () => {
                    const { selectedIds, pageContext } = appState.selectionMode;
                    if (selectedIds.size === 0) {
                        toast('error', 'Pilih minimal satu item untuk didiskusikan.');
                        return;
                    }
    
                    // 1. Ambil detail untuk semua item yang dipilih
                    const summaryLines = [];
                    let firstItemData = null;
                    
                    let items;
                    if (pageContext === 'tagihan') items = appState.tagihan.currentList;
                    else if (pageContext === 'pemasukan') {
                        const activeTab = appState.activeSubPage.get('pemasukan');
                        items = activeTab === 'termin' ? appState.incomes : appState.fundingSources;
                    }
    
                    for (const id of selectedIds) {
                        const item = items.find(i => i.id === id);
                        if (!item) continue;
                        
                        if (!firstItemData) {
                            const cardWrapper = document.querySelector(`.wa-card-v2-wrapper[data-id="${id}"]`);
                            const expenseId = cardWrapper?.dataset.expenseId;
                            const parentType = (pageContext === 'pemasukan') ? appState.activeSubPage.get('pemasukan') : (expenseId ? 'expense' : 'bill');
                            const parentId = (parentType === 'expense' && expenseId) ? expenseId : id;
                            firstItemData = { parentId, parentType };
                        }
                        
                        const amount = item.amount || item.totalAmount || 0;
                        summaryLines.push(`- ${item.description || item.projectName || 'Item'} (${fmtIDR(amount)})`);
                    }
    
                    if (!firstItemData) {
                        toast('error', 'Gagal mendapatkan detail item yang dipilih.');
                        return;
                    }
    
                    // 2. Buat teks ringkasan
                    const summaryText = `Berikut adalah ringkasan item yang perlu didiskusikan:\n${summaryLines.join('\n')}`;
    
                    _deactivateSelectionMode();
    
                    // 3. Buka halaman chat dengan teks ringkasan
                    openCommentsViewWithPrefill(firstItemData.parentId, firstItemData.parentType, summaryText);
                },
                'lihat-tagihan-induk': () => {
                    const { parentId, parentType } = target.dataset;
                    if (!parentId) return;
            
                    if (parentType === 'bill') {
                        handleOpenBillDetail(parentId, null);
                    } else if (parentType === 'pinjaman') {
                        handleOpenPemasukanDetail({ dataset: { id: parentId, type: 'pinjaman' } });
                    } else {
                        toast('error', 'Tagihan induk tidak ditemukan.');
                    }
                },
                'cetak-kwitansi-pembayaran': () => {
                    try {
                        const paymentData = JSON.parse(target.dataset.kwitansi);
                        
                        let kwitansiData = {
                            ...paymentData,
                            isLunas: false,
                            totalTagihan: null,
                            sisaTagihan: null
                        };

                        const parentBill = appState.bills.find(b => b.id === paymentData.billId);
                        if (parentBill) {
                            const newPaidAmount = (parentBill.paidAmount || 0) + paymentData.jumlah;
                            kwitansiData.isLunas = newPaidAmount >= parentBill.amount;
                            kwitansiData.totalTagihan = parentBill.amount;
                            kwitansiData.sisaTagihan = parentBill.amount - newPaidAmount;
                        }

                        const contentHTML = `
                            <div id="kwitansi-printable-area" style="position: relative;">
                                ${_getUniversalKwitansiHTML(kwitansiData)}
                                <div class="kwitansi-actions">
                                    <button class="btn-icon" data-action="download-image" title="Unduh sebagai Gambar">
                                        <span class="material-symbols-outlined">image</span>
                                    </button>
                                    <button class="btn-icon" data-action="download-pdf" title="Unduh sebagai PDF">
                                        <span class="material-symbols-outlined">picture_as_pdf</span>
                                    </button>
                                </div>
                            </div>`;

                        const footerHTML = `
                            <button class="btn btn-secondary" data-close-modal>Tutup</button>
                        `;

                        const modal = createModal('dataDetail', {
                            title: kwitansiData.isLunas ? 'Kwitansi Pelunasan' : 'Tanda Terima Pembayaran',
                            content: contentHTML,
                            footer: footerHTML
                        });

                        modal.querySelector('[data-action="download-image"]').addEventListener('click', () => _downloadUniversalKwitansiAsImage(kwitansiData));
                        modal.querySelector('[data-action="download-pdf"]').addEventListener('click', () => _downloadUniversalKwitansiAsPDF(kwitansiData));

                    } catch (e) {
                        console.error("Gagal membuka kwitansi universal:", e);
                        toast('error', 'Gagal membuat pratinjau kwitansi. Data mungkin tidak valid.');
                    }
                },
                'toggle-emoji-picker': () => {
                    const row = target.closest('.comment-input-row');
                    if (!row) return;
                    
                    document.querySelectorAll('.emoji-picker.active').forEach(p => { 
                        if (!row.contains(p)) p.classList.remove('active'); 
                    });
                    
                    const picker = row.querySelector('.emoji-picker');
                    if (picker) picker.classList.toggle('active');
                },
                'insert-emoji': () => {
                const ch = target.dataset.char || '';
                const row = target.closest('.comment-input-row');
                const ta = row ? row.querySelector('textarea') : null;
                if (!ta || !ch) return;
                const start = ta.selectionStart ?? ta.value.length;
                const end = ta.selectionEnd ?? ta.value.length;
                const before = ta.value.slice(0, start);
                const after = ta.value.slice(end);
                ta.value = before + ch + after;
                const newPos = start + ch.length;
                try { ta.setSelectionRange(newPos, newPos); } catch(_) {}
                ta.dispatchEvent(new Event('input', { bubbles: true }));
                const picker = row.querySelector('.emoji-picker');
                if (picker) picker.classList.remove('active');
                ta.focus();
            },
            'back-to-detail': () => {
                const { parentId, parentType } = target.dataset;
                if (parentType === 'expense') {
                    handleOpenBillDetail(null, parentId);
                } else if (parentType === 'bill') {
                    handleOpenBillDetail(parentId, null);
                }
            },
            'edit-item': () => handleEditItem(id, type),
            'delete-item': () => handleDeleteItem(id, type),
            'pay-loan': () => handlePaymentModal(id, 'pinjaman'),
            'pay-bill': () => handlePayBillModal(id),
            'view-invoice-items': async () => {
                let expense = appState.expenses.find(e => e.id === id);
                if (!expense || !expense.items) {
                    try {
                        expense = await localDB.expenses.get(id);
                    } catch (dbError) {
                        expense = null;
                    }
                }
                if (expense && expense.items && expense.items.length > 0) {
                    createModal('invoiceItemsDetail', {
                        items: expense.items,
                        totalAmount: expense.amount
                    });
                } else {
                    toast('error', 'Rincian item untuk faktur ini tidak ditemukan.');
                }
            },
            'show-report-detail': () => {
                const type = target.dataset.type;
                const category = target.dataset.category;
                const {
                    start,
                    end
                } = appState.reportFilter || {};
                const inRange = (d) => {
                    const dt = _getJSDate(d);
                    if (start && dt < new Date(start + 'T00:00:00')) return false;
                    if (end && dt > new Date(end + 'T23:59:59')) return false;
                    return true;
                };
                let items = [];
                if (type === 'income') {
                    items = (appState.incomes || []).filter(i => inRange(i.date));
                } else if (type === 'expense') {
                    if (category === 'gaji') {
                        items = (appState.bills || []).filter(b => b.type === 'gaji' && inRange(b.dueDate || b.createdAt)).map(b => ({
                            description: b.description || 'Gaji',
                            date: b.dueDate || b.createdAt || new Date(),
                            amount: b.amount || 0
                        }));
                    } else {
                        items = (appState.expenses || []).filter(e => (!category || e.type === category) && inRange(e.date));
                    }
                }
                const content = items.length ? `<div class="dense-list-container">${items.map(it => `<div class="dense-list-item"><div class="item-main-content"><strong class="item-title">${it.description || (type==='income'?'Pemasukan':'Pengeluaran')}</strong><span class="item-subtitle">${_getJSDate(it.date).toLocaleDateString('id-ID')}</span></div><div class="item-actions"><strong class="${type==='income'?'positive':'negative'}">${fmtIDR(it.amount || it.totalAmount || 0)}</strong></div></div>`).join('')}</div>` : _getEmptyStateHTML({
                    icon: 'insights',
                    title: 'Tidak Ada Data',
                    desc: 'Tidak ada transaksi pada periode ini.'
                });
                createModal('dataDetail', {
                    title: 'Rincian Transaksi',
                    content
                });
            },
            'edit-surat-jalan': () => handleEditSuratJalanModal(id),
            'view-attachment': () => createModal('imageView', {
                src: target.dataset.src
            }),
            'upload-attachment': () => handleUploadAttachment(target.dataset),
            'delete-attachment': () => handleDeleteAttachment(target.dataset),
            'download-attachment': () => _downloadAttachment(target.dataset.url, target.dataset.filename),
            'post-comment': () => handlePostComment(target.dataset),
            'delete-comment': () => handleDeleteComment(target.dataset),
            'check-in': () => handleCheckIn(id),
            'check-out': () => handleCheckOut(id),
            'edit-attendance': () => handleEditManualAttendanceModal(id),
            'delete-attendance': () => handleDeleteSingleAttendance(id),
            'pay-single-worker': () => handlePaySingleWorkerFromRecap(target),
            'edit-recap-amount': () => handleEditWorkerRecapAmount(target),
            'generate-all-salary-bill': () => {
                const startDate = new Date($('#recap-start-date').value);
                const endDate = new Date($('#recap-end-date').value);
                const rows = $$('#salary-recap-table tbody tr');
                const allWorkersData = Array.from(rows).map(row => ({
                    workerId: row.dataset.workerId,
                    workerName: row.dataset.workerName,
                    totalPay: parseFloat(row.dataset.totalPay),
                    recordIds: row.dataset.recordIds.split(',')
                }));
                handleGenerateBulkSalaryBill(allWorkersData, startDate, endDate);
            },
            'generate-selected-salary-bill': () => {
                const startDate = new Date($('#recap-start-date').value);
                const endDate = new Date($('#recap-end-date').value);
                const rows = $$('#salary-recap-table tbody tr');
                const selectedWorkers = Array.from(rows).filter(row => row.querySelector('.recap-checkbox:checked')).map(row => ({
                    workerId: row.dataset.workerId,
                    workerName: row.dataset.workerName,
                    totalPay: parseFloat(row.dataset.totalPay),
                    recordIds: row.dataset.recordIds.split(',')
                }));
                handleGenerateBulkSalaryBill(selectedWorkers, startDate, endDate);
            },
            'set-payment-full': () => {
                const amountEl = $('#payment-remaining-amount');
                const inputEl = $('#payment-input-amount');
                if (amountEl && inputEl) {
                    const rawAmount = amountEl.dataset.rawAmount;
                    inputEl.value = new Intl.NumberFormat('id-ID').format(rawAmount);
                }
            },
            'set-payment-half': () => {
                const amountEl = $('#payment-remaining-amount');
                const inputEl = $('#payment-input-amount');
                if (amountEl && inputEl) {
                    const rawAmount = parseFloat(amountEl.dataset.rawAmount);
                    const halfAmount = Math.floor(rawAmount / 2);
                    inputEl.value = new Intl.NumberFormat('id-ID').format(halfAmount);
                }
            },
            'fix-stuck-attendance': handleFixStuckAttendanceModal,
            'cetak-kwitansi': () => handleCetakKwitansi(id),
            'cetak-kwitansi-individu': () => handleCetakKwitansiIndividu(target.dataset),
            'cetak-kwitansi-kolektif': () => handleCetakKwitansiKolektif(target.dataset),
            'pay-individual-salary': () => handlePayIndividualSalaryModal(target.dataset),
            'open-report-generator': handleGenerateReportModal,
            'stok-in': () => handleStokInModal(id),
            'stok-out': () => handleStokOutModal(id),
            'edit-stock': () => handleEditStockTransaction(target.dataset),
            'delete-stock': () => handleDeleteStockTransaction(target.dataset),
            'add-new-material-header': () => handleManageMasterData('materials'),            'add-new-material': () => {
                const row = target.closest('.invoice-item-row');
                const wrapper = row?.querySelector('.custom-select-wrapper');
                if (wrapper) handleAddNewMaterialModal(wrapper);
            },
            'toggle-more-actions': () => $('#quick-actions-grid').classList.toggle('actions-collapsed'),
            'force-full-sync': () => {
                createModal('confirmUserAction', {
                    message: 'Aksi ini akan mengunduh ulang semua data dari server. Lanjutkan?',
                    onConfirm: async () => {
                        localStorage.removeItem('lastSyncTimestamp');
                        await syncFromServer();
                    }
                })
            },
            'remove-worker-from-recap': () => {
                if (isViewer()) return;
                handleRemoveWorkerFromRecap(target.dataset.billId, target.dataset.workerId);
            },
            'delete-salary-bill': () => {
                if (isViewer()) return;
                handleDeleteSalaryBill(target.dataset.id);
            },
            
            'login-different-account': () => {
                localStorage.removeItem('lastActiveUser');
                signInWithGoogle();
            },
            'trigger-file-input': (e) => {
                const targetInputName = target.dataset.target;
                const inputEl = document.querySelector(`input[name="${targetInputName}"]`);
                if (inputEl) {
                    inputEl.click();
                    inputEl.addEventListener('change', () => {
                        const displayId = inputEl.dataset.targetDisplay;
                        if (displayId) {
                            const displayEl = document.getElementById(displayId);
                            if (displayEl) {
                                const file = inputEl.files[0];
                                displayEl.textContent = file ? file.name : 'Belum ada file dipilih';
                                displayEl.classList.toggle('has-file', !!file);
                            }
                        }
                    }, {
                        once: true
                    });
                    const sourceModal = document.getElementById('uploadSource-modal');
                    if (sourceModal) {
                        closeModal(sourceModal);
                    }
                } else {
                    toast('error', 'Gagal menemukan elemen input file.');
                }
            },
        };

        if (clickActions[action]) {
            clickActions[action](target);
        } else {
        }
    });
    document.addEventListener('submit', async (e) => {
        const form = e.target;
        if (!(form instanceof HTMLFormElement)) return;

        // Support both explicit async forms and known app forms (in case data-async is missing)
        const isAsync = form.matches('form[data-async]');
        const knownAppFormIds = new Set([
            'pemasukan-form', 'pengeluaran-form', 'material-invoice-form',
            'manual-attendance-form', 'stok-in-form', 'stok-out-form',
            'payment-form', 'edit-attendance-form', 'add-master-item-form', 'edit-master-form'
        ]);
        if (!isAsync && !knownAppFormIds.has(form.id)) return;

        e.preventDefault();
        // Use regular stopPropagation to avoid blocking other validation listeners completely
        e.stopPropagation();

        const loadingBtn = form.querySelector('[type="submit"], .btn-primary');
        if (loadingBtn) loadingBtn.disabled = true;

        try {
            // Always use the resilient offline-first local handler
            await _fallbackLocalFormHandler(form);
            const successMsg = form.dataset.successMsg || 'Berhasil disimpan.';
            if (!successMsg.toLowerCase().includes('diperbarui')) {
                toast('success', successMsg);
            }

            if (form._clearDraft) form._clearDraft();
            const modal = form.closest('.modal-bg, .detail-pane');

            if (form.id !== 'add-master-item-form' && form.id !== 'edit-master-form') {
                renderPageContent();
            }

            if (modal && modal.classList.contains('modal-bg')) {
                 closeModal(modal);
            }

            updateSyncIndicator();
        } catch (err) {
            console.error('Submit form async gagal:', err);
            toast('error', err.message || 'Gagal menyimpan, coba lagi.');
        } finally {
            if (loadingBtn) loadingBtn.disabled = false;
        }
    }, true);

    $('#bottom-nav').addEventListener('click', (e) => {
        const navItem = e.target.closest('.nav-item');
        if (navItem) handleNavigation(navItem.dataset.nav);
    });

    const sidebarEl = $('#sidebar-nav');
    if (sidebarEl) {
        sidebarEl.addEventListener('click', (e) => {
            const toggleBtn = e.target.closest('[data-action="toggle-sidebar"]');
            if (toggleBtn) {
                const nowCollapsed = !document.body.classList.contains('sidebar-collapsed');
                document.body.classList.toggle('sidebar-collapsed', nowCollapsed);
                try { localStorage.setItem('sidebarCollapsed', nowCollapsed ? '1' : '0'); } catch (_) {}
                // Re-render sidebar to update toggle icon/state
                renderSidebar();
                return;
            }
            const item = e.target.closest('.sidebar-nav-item');
            if (item) handleNavigation(item.dataset.nav);
        });
    }

    window.addEventListener('online', () => { appState.isOnline = true; updateSyncIndicator(); syncToServer({ silent: true }); });
    window.addEventListener('offline', () => { appState.isOnline = false; updateSyncIndicator(); });
}

function _initQuotaResetScheduler() {
    const CHECK_INTERVAL = 30 * 60 * 1000;
    const RESET_HOUR = 15;

    setInterval(async () => {
        console.log("Scheduler: Mengecek status kuota...");
        if (!_isQuotaExceeded()) {
            console.log("Scheduler: Kuota aman, tidak ada aksi.");
            return;
        }

        const now = new Date();
        const lastResetAttempt = parseInt(localStorage.getItem('lastResetAttempt') || '0');
        const todayMarker = new Date(now).setHours(0,0,0,0); // Penanda untuk hari ini

        if (now.getHours() >= RESET_HOUR && lastResetAttempt < todayMarker) {
            console.log("Scheduler: Waktu reset kuota tercapai. Mencoba sinkronisasi ulang...");
            toast('info', 'Mencoba sinkronisasi ulang setelah kuota direset...');
            
            localStorage.setItem('lastResetAttempt', Date.now().toString());
            
            _setQuotaExceededFlag(false); // Matikan flag agar sync bisa berjalan
            await syncToServer({ silent: true }); // Panggil fungsi sinkronisasi
        } else {
            console.log("Scheduler: Belum waktunya reset atau sudah mencoba hari ini.");
        }

    }, CHECK_INTERVAL);
}


// =======================================================
  //          SEKSI 5: INISIALISASI APLIKASI
  // =======================================================
  attachEventListeners();
  _initToastSwipeHandler();
  initResizer();
  _initQuotaResetScheduler();
  
}
  main()

