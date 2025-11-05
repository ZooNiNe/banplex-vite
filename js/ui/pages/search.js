import { appState } from '../../state/appState.js';
import { $, $$ } from '../../utils/dom.js';
import { emit, on } from '../../state/eventBus.js';
import { getEmptyStateHTML } from '../components/emptyState.js';
import { createUnifiedCard } from '../components/cards.js';
import { formatDate, fmtIDR } from '../../utils/formatters.js';

// Helper function to create Lucide SVG Icon
function createIcon(iconName, size = 22, classes = '') {
    const icons = {
        arrow_back: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-left ${classes}"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>`,
        search: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-search ${classes}"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>`,
        close: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x ${classes}"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,
    };
    return icons[iconName] || '';
}

let searchPageContainer = null;

function highlight(text, term) {
    if (!term || !text) return text || '';
    const regex = new RegExp(`(${term.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')})`, 'gi');
    return text.replace(regex, '<mark class="search-result-highlight">$1</mark>');
}

async function performSearch(term) {
    const resultsContainer = searchPageContainer.querySelector('.search-results-container');
    if (!term) {
        resultsContainer.innerHTML = getEmptyStateHTML({
            icon: 'search',
            title: 'Mulai Mencari',
            desc: 'Ketik kata kunci untuk mencari data di seluruh aplikasi.'
        });
        return;
    }

    const lowerTerm = term.toLowerCase();
    const results = [];
    const searchNumber = parseInt(lowerTerm.replace(/[^0-9]/g, ''), 10);

    const allData = [...(appState.bills || []), ...(appState.expenses || [])];
    const uniqueIds = new Set();

    allData.forEach(item => {
        if (uniqueIds.has(item.id)) return;

        let matchScore = 0;
        let matchedFields = [];

        if (item.description?.toLowerCase().includes(lowerTerm)) {
            matchScore += 10;
            matchedFields.push(`Deskripsi: ${highlight(item.description, term)}`);
        }
        if (item.id?.toLowerCase().includes(lowerTerm)) {
            matchScore += 5;
        }
        if (!isNaN(searchNumber) && searchNumber > 1000 && String(item.amount || 0).includes(String(searchNumber))) {
            matchScore += 8;
            matchedFields.push(`Jumlah: ${fmtIDR(item.amount)}`);
        }

        const expense = item.expenseId ? appState.expenses.find(e => e.id === item.expenseId) : item;
        if (expense) {
            const supplier = appState.suppliers.find(s => s.id === expense.supplierId);
            if (supplier?.supplierName.toLowerCase().includes(lowerTerm)) {
                matchScore += 7;
                matchedFields.push(`Supplier: ${highlight(supplier.supplierName, term)}`);
            }

            const project = appState.projects.find(p => p.id === expense.projectId);
             if (project?.projectName.toLowerCase().includes(lowerTerm)) {
                matchScore += 6;
                matchedFields.push(`Proyek: ${highlight(project.projectName, term)}`);
            }
        }

        if (item.type === 'gaji' && item.workerDetails?.some(w => w.name.toLowerCase().includes(lowerTerm))) {
             matchScore += 7;
             matchedFields.push(`Pekerja: ${highlight(item.workerDetails.find(w => w.name.toLowerCase().includes(lowerTerm)).name, term)}`);
        }

        if (expense?.items?.some(i => i.name.toLowerCase().includes(lowerTerm))) {
            matchScore += 8;
            matchedFields.push(`Material: ${highlight(expense.items.find(i => i.name.toLowerCase().includes(lowerTerm)).name, term)}`);
        }


        if (matchScore > 0) {
            results.push({ item, score: matchScore, matchedFields });
            uniqueIds.add(item.id);
        }
    });

    results.sort((a, b) => b.score - a.score);

    if (results.length === 0) {
        resultsContainer.innerHTML = getEmptyStateHTML({
            icon: 'search_off',
            title: 'Tidak Ditemukan',
            desc: `Tidak ada hasil yang cocok untuk "${term}".`
        });
        return;
    }

    resultsContainer.innerHTML = results.slice(0, 50).map(({ item, matchedFields }) => {
        const isBill = 'dueDate' in item;
        const type = isBill ? 'bill' : 'expense';
         const title = item.description;
         const date = formatDate(item.dueDate || item.date);
         const amount = fmtIDR(item.amount);
         const status = item.status || 'N/A';
         const statusClass = status === 'paid' ? 'positive' : (status === 'unpaid' ? 'warn' : '');

        return `
            <div class="search-result-item" data-action="open-search-result" data-id="${item.id}" data-type="${type}" data-expense-id="${item.expenseId || item.id}">
                <div class="result-main">
                    <span class="result-title">${highlight(title, term)}</span>
                    <div class="result-meta">${matchedFields.slice(0, 2).join(' &bull; ')}</div>
                </div>
                <div class="result-secondary">
                    <span class="result-amount">${amount}</span>
                    <span class="result-date">${date}</span>
                </div>
            </div>
        `;
    }).join('');

    // Micro animation: stagger results in
    const items = resultsContainer.querySelectorAll('.search-result-item');
    items.forEach((el, idx) => {
        el.classList.add('item-entering');
        el.style.animationDelay = `${Math.min(idx, 20) * 22}ms`;
    });
}


function closeSearchPage() {
    if (!searchPageContainer) return;
    searchPageContainer.classList.remove('show');
    searchPageContainer.addEventListener('transitionend', () => {
        searchPageContainer.remove();
        searchPageContainer = null;
        document.body.classList.remove('global-search-active');
    }, { once: true });
}

function openSearchPage({ target }) {
    if (searchPageContainer) return;

    document.body.classList.add('global-search-active');
    searchPageContainer = document.createElement('div');
    searchPageContainer.id = 'global-search-page';
    searchPageContainer.className = 'global-search-page';
    searchPageContainer.innerHTML = `
        <div class="search-page-header">
            <button class="btn-icon" data-action="close-global-search">${createIcon('arrow_back')}</button>
            <div class="search-input-capsule">
                ${createIcon('search', 20)}
                <input type="search" id="global-search-input" placeholder="Cari di seluruh data...">
                <button class="btn-icon" id="clear-search-btn" style="display:none;">${createIcon('close', 18)}</button>
            </div>
        </div>
        <div class="search-results-container"></div>
    `;
    document.body.appendChild(searchPageContainer);

    const rect = target.getBoundingClientRect();
    searchPageContainer.style.transformOrigin = `${rect.left + rect.width / 2}px ${rect.top + rect.height / 2}px`;

    requestAnimationFrame(() => {
        searchPageContainer.classList.add('show');
    });

    const searchInput = $('#global-search-input', searchPageContainer);
    const clearButton = $('#clear-search-btn', searchPageContainer);

    searchInput.focus();
    performSearch('');

    let debounceTimer;
    searchInput.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            performSearch(searchInput.value);
        }, 250);
        clearButton.style.display = searchInput.value ? 'flex' : 'none';
    });

    clearButton.addEventListener('click', () => {
        searchInput.value = '';
        searchInput.focus();
        clearButton.style.display = 'none';
        performSearch('');
    });

    searchPageContainer.addEventListener('click', (e) => {
        const actionTarget = e.target.closest('[data-action]');
        if (!actionTarget) return;

        const action = actionTarget.dataset.action;
        if (action === 'close-global-search') {
            closeSearchPage();
        } else if (action === 'open-search-result') {
            // Only close the global search overlay; do not open any detail directly
            closeSearchPage();
        }
    });
}

export function initGlobalSearch() {
    on('ui.search.open', openSearchPage);
    on('ui.comments.openSearch', openCommentsSearchPage);
}

function openCommentsSearchPage({ target } = {}) {
    if (searchPageContainer) return;

    document.body.classList.add('global-search-active');
    searchPageContainer = document.createElement('div');
    searchPageContainer.id = 'global-search-page';
    searchPageContainer.className = 'global-search-page';
    searchPageContainer.innerHTML = `
        <div class="search-page-header">
            <button class="btn-icon" data-action="close-global-search">${createIcon('arrow_back')}</button>
            <div class="search-input-capsule">
                ${createIcon('search', 20)}
                <input type="search" id="global-search-input" placeholder="Cari komentar...">
                <button class="btn-icon" id="clear-search-btn" style="display:none;">${createIcon('close', 18)}</button>
            </div>
        </div>
        <div class="search-results-container chat-search-results"></div>
    `;
    document.body.appendChild(searchPageContainer);

    try {
        if (target) {
            const rect = target.getBoundingClientRect();
            searchPageContainer.style.transformOrigin = `${rect.left + rect.width / 2}px ${rect.top + rect.height / 2}px`;
        }
    } catch(_) {}

    requestAnimationFrame(() => {
        searchPageContainer.classList.add('show');
    });

    const searchInput = $('#global-search-input', searchPageContainer);
    const clearButton = $('#clear-search-btn', searchPageContainer);
    const resultsContainer = searchPageContainer.querySelector('.search-results-container');

    function render(term = '') {
        const q = (term || '').toLowerCase();
        const comments = (appState.comments || []).filter(c => !c.isDeleted && (q ? (c.content||'').toLowerCase().includes(q) : true));
        comments.sort((a,b) => (b.createdAt?.seconds || +new Date(b.createdAt)) - (a.createdAt?.seconds || +new Date(a.createdAt)));
        if (comments.length === 0) {
            resultsContainer.innerHTML = getEmptyStateHTML({ icon:'search', title:'Tidak ada komentar', desc:'Coba kata kunci lain.' });
            return;
        }
        resultsContainer.innerHTML = comments.slice(0,80).map(c => {
            const ts = (c.createdAt?.seconds ? new Date(c.createdAt.seconds*1000) : new Date(c.createdAt || Date.now()));
            const timeStr = ts.toLocaleString('id-ID', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' });
            const dir = (c.userId === appState.currentUser?.uid) ? 'outgoing' : 'incoming';
            const preview = (c.content || '').slice(0, 140).replace(/</g,'&lt;');
            return `
                <div class="chat-search-result" data-action="open-comments-view" data-parent-id="${c.parentId}" data-parent-type="${c.parentType}">
                    <div class="msg ${dir}">
                        <div class="bubble"><div class="content">${highlight(preview, term)}</div><div class="meta"><time>${timeStr}</time></div></div>
                    </div>
                </div>`;
        }).join('');
    }

    searchInput.focus();
    render('');
    let debounceTimer;
    searchInput.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => render(searchInput.value), 200);
        clearButton.style.display = searchInput.value ? 'flex' : 'none';
    });
    clearButton.addEventListener('click', () => { searchInput.value = ''; render(''); clearButton.style.display='none'; searchInput.focus(); });

    searchPageContainer.addEventListener('click', (e) => {
        const t = e.target.closest('[data-action]');
        if (!t) return;
        const action = t.dataset.action;
        if (action === 'close-global-search') closeSearchPage();
        else if (action === 'open-comments-view') { closeSearchPage(); }
    });
}
