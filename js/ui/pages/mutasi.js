import { $ } from '../../utils/dom.js';
import { createPageToolbarHTML } from '../components/toolbar.js';
import { getEmptyStateHTML, getEndOfListPlaceholderHTML } from '../components/emptyState.js';
import { initInfiniteScroll, cleanupInfiniteScroll } from '../components/infiniteScroll.js';
import { createListSkeletonHTML } from '../components/skeleton.js';
import { fmtIDR, formatDate } from '../../utils/formatters.js';
import { db, incomesCol, fundingSourcesCol } from '../../config/firebase.js';
import { 
    getDocs, collectionGroup, query, orderBy, limit, startAfter, where,
    getAggregateFromServer, sum, Timestamp
} from 'https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js';
import { on, off } from '../../state/eventBus.js';
import { showPaymentSuccessPreviewPanel } from '../../services/data/uiInteractionService.js';

const BATCH_SIZE = 15;
let pageAbortController = null;
let observerInstance = null;

const ICONS = {
    tag: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 256 256"><path d="M216,40H40A16,16,0,0,0,24,56V200a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A16,16,0,0,0,216,40Zm0,160H40V56H216V200Zm-24-24H64a8,8,0,0,1,0-16H192a8,8,0,0,1,0,16Z"></path></svg>`,
    clock: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 256 256"><path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm0,192a88,88,0,1,1,88-88A88.1,88.1,0,0,1,128,216Zm64-88a8,8,0,0,1-8,8H128a8,8,0,0,1-8-8V72a8,8,0,0,1,16,0v48h48A8,8,0,0,1,192,128Z"></path></svg>`,
    check: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="#ffffff" viewBox="0 0 256 256"><path d="M229.66,58.34a8,8,0,0,0-11.32,0l-136,136L29.66,141.66a8,8,0,0,0-11.32,11.32l56,56a8,8,0,0,0,11.32,0l144-144A8,8,0,0,0,229.66,58.34Z"></path></svg>`
};

let state = {
    isLoading: false,
    dateRange: { start: null, end: null },
    cursors: { payment: null, income: null, loan: null },
    hasMore: { payment: true, income: true, loan: true },
    mergedItems: [],
    totals: { in: 0, out: 0 }
};

const clean = (str) => (str && typeof str === 'string' && str.trim() !== '') ? str.trim() : null;

// --- 1. RESOLVE DATE (Sama seperti sebelumnya, ini sudah bagus) ---
function resolveDate(data) {
    const parse = (val) => {
        if (!val) return null;
        if (typeof val.toDate === 'function') return val.toDate();
        if (val instanceof Date) return val;
        if (typeof val === 'string') return new Date(val);
        if (typeof val === 'number') return new Date(val);
        return null;
    };
    return parse(data.date) || parse(data.transactionDate) || parse(data.paymentDate) || parse(data.receivedDate) || parse(data.createdAt) || parse(data.timestamp) || new Date();
}

// --- 2. RESOLVE TITLE (DISESUAIKAN DENGAN FIELD BARU) ---
function resolveTitle(type, data) {
    if (type === 'income') { 
        // Prioritaskan field 'projectName' yang baru kita tambah di Service
        return clean(data.projectName) || clean(data.name) || clean(data.title) || 'Pemasukan Proyek';
    } 
    else if (type === 'loan') { 
        // Prioritaskan 'creditorName'
        return clean(data.creditorName) || clean(data.sourceName) || clean(data.description) || 'Dana Masuk';
    } 
    else if (type === 'payment') { 
        // Prioritas field yang tersimpan langsung di dokumen pembayaran/pengeluaran
        
        // 1. Cek workerName (Gaji)
        if (clean(data.workerName)) return `${data.workerName}`;

        // 2. Cek recipientName (Hasil edit PaymentService untuk Tagihan Umum)
        if (clean(data.recipientName)) return data.recipientName;

        // 3. Cek supplierName (Hasil edit PengeluaranService)
        if (clean(data.supplierName)) return data.supplierName;

        // 4. Cek storeName (Kadang dipakai di nota manual)
        if (clean(data.storeName)) return data.storeName;

        // 5. Cek Item Name (Jika belanja material)
        if (Array.isArray(data.items) && data.items.length > 0) {
            const firstItem = data.items[0];
            const itemName = clean(firstItem.name) || clean(firstItem.itemName);
            if (itemName) return data.items.length > 1 ? `${itemName} (+${data.items.length - 1})` : itemName;
        }

        // 6. Fallback ke Deskripsi
        return clean(data.description) || clean(data.notes) || 'Pengeluaran';
    }
    return 'Transaksi';
}

// --- 3. RESOLVE CATEGORY (DISESUAIKAN) ---
function resolveCategory(type, data) {
    if (type === 'income') return 'Termin Proyek';
    if (type === 'loan') return 'Pinjaman / Modal';
    
    if (type === 'payment') {
        if (clean(data.workerName) || data.workerId || data.paymentType === 'salary') return 'Gaji & Upah';
        if (clean(data.supplierName) || clean(data.storeName) || (Array.isArray(data.items) && data.items.length > 0)) return 'Material & Logistik';
        if (data.paymentType === 'loan' || clean(data.creditorName)) return 'Bayar Pinjaman'; // Kategori baru untuk bayar hutang
        
        const dbCat = clean(data.category);
        if (dbCat && dbCat.toLowerCase() !== 'operasional') return dbCat;

        return 'Operasional';
    }
    return 'Umum';
}

// --- HTML GENERATORS (Sama, tapi pastikan list visible) ---
function createHeroGridHTML() {
    return `
        <div class="mutasi-panel-grid">
            <div class="mutasi-stat-card bg-soft-success">
                <div class="mutasi-stat-label text-success">Total Masuk</div>
                <div class="mutasi-stat-value text-success" id="hero-total-in">
                    <div class="skeleton-line" style="width: 60px;"></div>
                </div>
            </div>
            <div class="mutasi-stat-card bg-soft-danger">
                <div class="mutasi-stat-label text-danger">Total Keluar</div>
                <div class="mutasi-stat-value text-danger" id="hero-total-out">
                    <div class="skeleton-line" style="width: 60px;"></div>
                </div>
            </div>
        </div>
        
        <div class="mutasi-filter-bar">
            <input type="date" id="date-start" value="${state.dateRange.start}">
            <span class="mutasi-filter-sep">-</span>
            <input type="date" id="date-end" value="${state.dateRange.end}">
            
            <button id="btn-apply-filter" class="ripple" aria-label="Terapkan Filter">
                ${ICONS.check}
            </button>
        </div>
    `;
}

function createDateGroupedListHTML(items) {
    if (items.length === 0) return '';

    const groups = new Map();
    items.forEach(item => {
        const d = item.date;
        const dateKey = formatDate(d, { day: 'numeric', month: 'long', year: 'numeric' });
        if (!groups.has(dateKey)) groups.set(dateKey, { label: dateKey, items: [] });
        groups.get(dateKey).items.push(item);
    });

    let html = '';
    groups.forEach((group, dateLabel) => {
        html += `
            <section class="mutasi-date-group" data-label="${dateLabel}">
                <div class="mutasi-group-header">${dateLabel}</div>
                <div class="mutasi-group-body">
        `;
        html += group.items.map(item => {
            const isIn = item.type === 'in';
            const colorClass = isIn ? 'text-success' : 'text-danger';
            const borderColor = isIn ? 'var(--success, #10b981)' : 'var(--danger, #ef4444)';
            const amountPrefix = isIn ? '+' : '-';
            
            return `
                <div class="mutasi-card-wrapper mutasi-fade-in" 
                     data-id="${item.id}" data-type="${item.originalSource}">
                    <div class="mutasi-card" style="border-left: 4px solid ${borderColor};">
                          <div class="mutasi-item-row">
                              <span class="mutasi-title">${item.title}</span>
                              <span class="mutasi-amount ${colorClass}">
                                 ${amountPrefix} ${fmtIDR(item.amount)}
                              </span>
                          </div>
                          <div class="mutasi-meta-row">
                              <div class="mutasi-meta-item">
                                 ${ICONS.tag}
                                 <span>${item.category}</span>
                              </div>
                              <div class="mutasi-meta-item">
                                 ${ICONS.clock}
                                 <span>${formatDate(item.date, { hour: '2-digit', minute:'2-digit' })}</span>
                              </div>
                          </div>
                    </div>
                </div>
            `;
        }).join('');
        html += `</div></section>`;
    });
    return html;
}

// ... SISA KODE (fetchTotals, fetchTransactions, initMutasiPage) TETAP SAMA DENGAN VERSI TERAKHIR YANG SAYA BERIKAN ...
// Pastikan fetchTotals dan fetchTransactions menggunakan query yang benar.

async function fetchTotals() {
    const start = Timestamp.fromDate(new Date(state.dateRange.start + "T00:00:00"));
    const end = Timestamp.fromDate(new Date(state.dateRange.end + "T23:59:59"));

    try {
        const promises = [
            getAggregateFromServer(query(incomesCol, where('date', '>=', start), where('date', '<=', end)), { total: sum('amount') }),
            getAggregateFromServer(query(fundingSourcesCol, where('date', '>=', start), where('date', '<=', end)), { total: sum('totalAmount') }),
            getAggregateFromServer(query(collectionGroup(db, 'payments'), where('date', '>=', start), where('date', '<=', end)), { total: sum('amount') })
                .catch(err => { console.warn("Payment agg failed", err); return { data: () => ({ total: 0 }) }; })
        ];

        const [inSnap, loanSnap, paySnap] = await Promise.all(promises);
        
        state.totals.in = (inSnap.data().total || 0) + (loanSnap.data().total || 0);
        state.totals.out = paySnap.data().total || 0;

        const elIn = $('#hero-total-in');
        const elOut = $('#hero-total-out');
        if(elIn) elIn.textContent = fmtIDR(state.totals.in);
        if(elOut) elOut.textContent = fmtIDR(state.totals.out);

    } catch (e) {
        console.error("Totals Error:", e);
    }
}

async function fetchTransactions(isLoadMore) {
    if (state.isLoading) return;
    state.isLoading = true;

    const start = Timestamp.fromDate(new Date(state.dateRange.start + "T00:00:00"));
    const end = Timestamp.fromDate(new Date(state.dateRange.end + "T23:59:59"));

    const buildQuery = (ref, cursor) => {
        let q = query(ref, where('date', '>=', start), where('date', '<=', end), orderBy('date', 'desc'), limit(BATCH_SIZE));
        if (cursor) q = query(q, startAfter(cursor));
        return q;
    };

    try {
        const tasks = [];
        if (state.hasMore.income) tasks.push(getDocs(buildQuery(incomesCol, state.cursors.income)).then(s => ({ type: 'income', s })));
        if (state.hasMore.loan) tasks.push(getDocs(buildQuery(fundingSourcesCol, state.cursors.loan)).then(s => ({ type: 'loan', s })));
        if (state.hasMore.payment) {
            tasks.push(
                getDocs(buildQuery(collectionGroup(db, 'payments'), state.cursors.payment))
                .then(s => ({ type: 'payment', s }))
                .catch(e => ({ type: 'payment', error: e }))
            );
        }

        const results = await Promise.all(tasks);
        let batchItems = [];

        results.forEach(res => {
            if (res.error) {
                state.hasMore[res.type] = false;
                return;
            }
            const docs = res.s.docs;
            if (docs.length < BATCH_SIZE) state.hasMore[res.type] = false;
            if (docs.length > 0) state.cursors[res.type] = docs[docs.length - 1];

            docs.forEach(doc => {
                const data = doc.data();
                
                let amount = 0;
                if (res.type === 'income') amount = Number(data.amount ?? data.totalAmount ?? 0);
                else if (res.type === 'loan') amount = Number(data.totalAmount ?? data.amount ?? 0);
                else if (res.type === 'payment') amount = Number(data.amount ?? 0);

                const finalDate = resolveDate(data);
                const finalTitle = resolveTitle(res.type, data);
                const finalCategory = resolveCategory(res.type, data);

                batchItems.push({
                    id: doc.id,
                    originalSource: res.type,
                    date: finalDate, 
                    amount: amount,
                    type: res.type === 'payment' ? 'out' : 'in',
                    title: finalTitle, 
                    category: finalCategory,
                    description: data.description || ''
                });
            });
        });

        state.mergedItems = [...state.mergedItems, ...batchItems].sort((a, b) => b.date - a.date);
        return batchItems.length > 0;

    } finally {
        state.isLoading = false;
    }
}

async function renderMutasi(isLoadMore = false) {
    const container = $('#mutasi-list-container');
    if (!container) return;

    if (!isLoadMore) {
        state.mergedItems = [];
        state.cursors = { payment: null, income: null, loan: null };
        state.hasMore = { payment: true, income: true, loan: true };
        container.innerHTML = createListSkeletonHTML(3);
        await fetchTotals(); 
    } else {
        container.insertAdjacentHTML('beforeend', `<div id="load-more-skel">${createListSkeletonHTML(1)}</div>`);
    }

    await fetchTransactions(isLoadMore);

    $('#load-more-skel')?.remove();
    if (!isLoadMore) container.innerHTML = '';

    if (state.mergedItems.length === 0) {
        container.innerHTML = getEmptyStateHTML({ icon: 'calendar-x', title: 'Tidak Ada Transaksi', desc: 'Coba ubah filter tanggal.' });
        return;
    }

    container.innerHTML = createDateGroupedListHTML(state.mergedItems);

    const anyMore = Object.values(state.hasMore).some(v => v);
    const oldSentinel = document.getElementById('mutasi-sentinel');
    if (oldSentinel) oldSentinel.remove();

    if (anyMore) {
        const sentinel = document.createElement('div');
        sentinel.id = 'mutasi-sentinel';
        sentinel.style.height = '20px';
        container.appendChild(sentinel);
        
        if (observerInstance) observerInstance.disconnect();
        observerInstance = initInfiniteScroll('#sub-page-content', () => renderMutasi(true));
        if (observerInstance) observerInstance.observe(sentinel);
    } else {
        container.insertAdjacentHTML('beforeend', getEndOfListPlaceholderHTML());
    }
}

function initMutasiPage() {
    const container = $('.page-container');
    const today = new Date();
    
    if (!state.dateRange.start) {
        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        state.dateRange.start = startOfMonth.toISOString().split('T')[0];
        state.dateRange.end = endOfMonth.toISOString().split('T')[0];
    }

    container.innerHTML = `
        <div class="content-panel">
            <div class="panel-header">
                ${createPageToolbarHTML({ title: 'Mutasi & Arus Kas' })}
            </div>
            <div id="sub-page-content" class="panel-body p-3 scrollable-content">
                ${createHeroGridHTML()}
                <div id="mutasi-list-container" class="mt-2 pb-5"></div>
            </div>
        </div>
    `;

    $('#btn-apply-filter').addEventListener('click', () => {
        const startVal = $('#date-start').value;
        const endVal = $('#date-end').value;
        if(startVal && endVal) {
            state.dateRange.start = startVal;
            state.dateRange.end = endVal;
            renderMutasi(false);
        }
    });

    $('#mutasi-list-container').addEventListener('click', (e) => {
        const header = e.target.closest('.mutasi-group-header');
        if (header) {
            const groupBody = header.nextElementSibling;
            if (groupBody && groupBody.classList.contains('mutasi-group-body')) {
                const isHidden = groupBody.style.display === 'none';
                groupBody.style.display = isHidden ? 'flex' : 'none';
                header.classList.toggle('collapsed', !isHidden);
            }
            return;
        }

        const card = e.target.closest('.mutasi-card-wrapper');
        if (card) {
            const item = state.mergedItems.find(i => i.id === card.dataset.id);
            if (item) {
                showPaymentSuccessPreviewPanel({
                    title: item.title,
                    amount: item.amount,
                    date: item.date,
                    recipient: item.category,
                    description: item.description,
                    isLunas: true
                }, 'mutasi');
            }
        }
    });

    renderMutasi(false);

    on('app.unload.mutasi', () => {
        if(observerInstance) observerInstance.disconnect();
        cleanupInfiniteScroll();
    });
}

export { initMutasiPage };