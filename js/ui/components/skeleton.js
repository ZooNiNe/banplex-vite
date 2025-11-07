// js/ui/components/skeleton.js

import { createTabsHTML } from "./tabs.js";
import { appState } from "../../state/appState.js";

// Minimal mobile sidebar toggle placeholder used across skeleton toolbars
const mobileToggleBtn = `<button class="btn-icon mobile-sidebar-toggle" data-action="toggle-sidebar" data-tooltip="Menu"><div class="skeleton" style="width:22px;height:22px;border-radius:4px;"></div></button>`;

// --- [HELPER GENERIC] ---
// (Fungsi createListSkeletonHTML Anda yang sudah ada, tetap dipertahankan)
export const createListSkeletonHTML = (count = 5) => {
    const itemTemplate = `
        <div class="wa-card-v2-wrapper skeleton-item">
            <div class="wa-card-v2">
                <div class="wa-card-v2__main">
                    <div class="wa-card-v2__header">
                        <span class="skeleton skeleton-text" style="width: 60%; height: 18px;"></span>
                    </div>
                    <div class="wa-card-v2__body">
                        <span class="skeleton skeleton-text" style="width: 40%; height: 14px;"></span>
                        <span class="skeleton skeleton-text" style="width: 50%; height: 14px;"></span>
                    </div>
                </div>
                <div class="wa-card-v2__meta">
                    <span class="skeleton skeleton-text" style="width: 70px; height: 14px;"></span>
                    <span class="skeleton skeleton-text" style="width: 100px; height: 18px;"></span>
                </div>
            </div>
        </div>
    `;
    return Array(count).fill(itemTemplate).join('');
};

// (Fungsi-fungsi skeleton Master Data Anda yang sudah ada)
export function createMasterDataGridSkeletonHTML() {
    const item = `<div class="master-data-grid-item skeleton" style="height: 150px;"></div>`;
    return `<div class="master-data-grid">${Array(6).fill(item).join('')}</div>`;
}

export function createMasterDataListSkeletonHTML() {
    const item = `<div class="master-data-item skeleton" style="height: 50px;"></div>`;
    return `<div class="master-data-list">${Array(5).fill(item).join('')}</div>`;
}

export function createMasterDataFormSkeletonHTML() {
    const field = `
        <div class="form-group">
            <div class="skeleton" style="height: 12px; width: 40%; margin-bottom: 4px;"></div>
            <div class="skeleton" style="height: 42px;"></div>
        </div>`;
    return `
        <div class="card card-pad skeleton-wrapper" style="gap: 1rem; padding: 0;">
            ${Array(3).fill(field).join('')}
            <div class="form-footer-actions" style="padding-top: 1rem; border-top: 1px solid var(--line); display:flex; justify-content: flex-end;">
                <div class="skeleton" style="height: 42px; width: 120px; border-radius: 8px;"></div>
            </div>
        </div>
    `;
}

// --- [HELPER SKELETON SPESIFIK HALAMAN BARU] ---

function createToolbarSkeleton(title = 'Memuat...') {
    return `
        <div class="toolbar sticky-toolbar">
            <div class="toolbar-standard-actions">
                <div class="page-label">
                    ${mobileToggleBtn}
                    <div class="title-group"><h4 class="page-name">${title}</h4></div>
                </div>
                <div id="sync-indicator" class="sync-indicator"></div>
                <div class="header-actions">
                    <div class="skeleton skeleton-button" style="width: 40px; height: 40px; border-radius: 12px; margin-left: 8px;"></div>
                    <div class="skeleton skeleton-button" style="width: 40px; height: 40px; border-radius: 12px; margin-left: 8px;"></div>
                </div>
            </div>
        </div>
    `;
}

function createHeroSkeleton(height = '110px') {
    return `<div class="dashboard-hero-carousel skeleton" style="height: ${height}; margin-bottom: 1.5rem; border-radius: var(--radius-lg);"></div>`;
}

function createTabsSkeleton(count = 3) {
    const classes = count === 2 ? 'two-tabs' : 'three-tabs';
    const items = Array(count).fill('<div class="skeleton-text"></div>').join('');
    return `<div class="sub-nav tabs-underline ${classes} skeleton-tabs">${items}</div>`;
}

function createCategoryNavSkeleton() {
    return `
        <div class="category-sub-nav skeleton-tabs" style="justify-content: flex-start; gap: 8px;">
            <div class="skeleton-text" style="width: 60px"></div>
            <div class="skeleton-text" style="width: 80px"></div>
            <div class="skeleton-text" style="width: 70px"></div>
            <div class="skeleton-text" style="width: 90px"></div>
        </div>
    `;
}

// --- [FUNGSI SKELETON SPESIFIK HALAMAN] ---

export function createTagihanPageSkeletonHTML() {
    return `
        <div class="content-panel">
            <div class="panel-header">
                ${createToolbarSkeleton('Tagihan')}
                ${createHeroSkeleton('110px')}
                ${createTabsSkeleton(3)}
                ${createCategoryNavSkeleton()}
            </div>
            <div id="sub-page-content" class="panel-body scrollable-content">
                <div class="date-group-header skeleton" style="width: 150px; height: 16px; margin-bottom: 8px;"></div>
                ${createListSkeletonHTML(3)}
                <div class="date-group-header skeleton" style="width: 150px; height: 16px; margin-top: 1.5rem; margin-bottom: 8px;"></div>
                ${createListSkeletonHTML(2)}
            </div>
        </div>
    `;
}

export function createPengeluaranPageSkeletonHTML() {
    const activeTab = appState.activeSubPage.get('pengeluaran') || 'operasional';

    const formSkeleton = `
        <div class="card card-pad skeleton-wrapper" style="gap: 1rem; padding: 1.5rem;">
            <div class="skeleton" style="height: 100px; width: 100%; border-radius: 12px; margin-bottom: 1rem;"></div>
            <div class="form-grid-2col" style="display:grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                <div class="form-group"><div class="skeleton" style="height: 12px; width: 60%;"></div><div class="skeleton" style="height: 40px; width: 100%;"></div></div>
                <div class="form-group"><div class="skeleton" style="height: 12px; width: 60%;"></div><div class="skeleton" style="height: 40px; width: 100%;"></div></div>
            </div>

            ${activeTab === 'material' ? `
                <div class="skeleton" style="height: 20px; width: 120px; margin-top: 1rem;"></div>
                <div class="skeleton-list-item" style="height: 100px; border-radius: 12px;"></div>
            ` : `
                <div class="form-grid-2col" style="display:grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-top: 1rem;">
                    <div class="form-group"><div class="skeleton" style="height: 12px; width: 60%;"></div><div class="skeleton" style="height: 40px; width: 100%;"></div></div>
                    <div class="form-group"><div class="skeleton" style="height: 12px; width: 60%;"></div><div class="skeleton" style="height: 40px; width: 100%;"></div></div>
                </div>
            `}

            <div class="form-group" style="margin-top: 1.5rem;">
                 <div class="skeleton" style="height: 12px; width: 30%;"></div>
                 <div class="skeleton" style="height: 80px; width: 100%; border-radius: 8px;"></div>
            </div>
            
            <div class="skeleton" style="height: 120px; width: 100%; border-radius: 12px; margin-top: 1rem;"></div>

            <div class="form-footer-actions" style="padding-top: 1rem; border-top: 1px solid var(--line); display:flex; justify-content: flex-end;">
                <div class="skeleton" style="height: 42px; width: 120px; border-radius: 8px;"></div>
            </div>
        </div>
    `;

    return `
        <div class="content-panel">
            <div class="panel-header">
                ${createToolbarSkeleton('Input Pengeluaran')}
                ${createTabsSkeleton(3)}
            </div>
            <div id="sub-page-content" class="panel-body scrollable-content">
                ${formSkeleton}
            </div>
        </div>
    `;
}

// Skeleton form untuk Pemasukan Baru
export function createPemasukanFormPageSkeletonHTML() {
    // Kita cek tab aktif untuk 'pemasukan_form'
    const activeTab = appState.activeSubPage.get('pemasukan_form') || 'termin';

    // Struktur skeleton ini meniru 'createPengeluaranPageSkeletonHTML'
    const formSkeleton = `
        <div class="card card-pad skeleton-wrapper" style="gap: 1rem; padding: 1.5rem;">
            <div class="skeleton" style="height: 100px; width: 100%; border-radius: 12px; margin-bottom: 1rem;"></div>
            
            <div class="form-grid-2col" style="display:grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                <div class="form-group"><div class="skeleton" style="height: 12px; width: 60%;"></div><div class="skeleton" style="height: 40px; width: 100%;"></div></div>
                <div class="form-group"><div class="skeleton" style="height: 12px; width: 60%;"></div><div class="skeleton" style="height: 40px; width: 100%;"></div></div>
            </div>

            <div class="form-grid-2col" style="display:grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-top: 1rem;">
                <div class="form-group"><div class="skeleton" style="height: 12px; width: 60%;"></div><div class="skeleton" style="height: 40px; width: 100%;"></div></div>
                ${activeTab === 'pinjaman' ? `
                    <div class="form-group"><div class="skeleton" style="height: 12px; width: 60%;"></div><div class="skeleton" style="height: 40px; width: 100%;"></div></div>
                ` : '<div class="form-group"></div>'}
            </div>

            <div class="form-group" style="margin-top: 1.5rem;">
                 <div class="skeleton" style="height: 12px; width: 30%;"></div>
                 <div class="skeleton" style="height: 80px; width: 100%; border-radius: 8px;"></div>
            </div>
            
            ${activeTab === 'pinjaman' ? `
                <div class="skeleton" style="height: 100px; width: 100%; border-radius: 12px; margin-top: 1rem;"></div>
            ` : `
                <div class="skeleton" style="height: 60px; width: 100%; border-radius: 12px; margin-top: 1rem;"></div>
            `}

            <div class="form-footer-actions" style="padding-top: 1rem; border-top: 1px solid var(--line); display:flex; justify-content: flex-end;">
                <div class="skeleton" style="height: 42px; width: 120px; border-radius: 8px;"></div>
            </div>
        </div>
    `;

    return `
        <div class="content-panel">
            <div class="panel-header">
                ${createToolbarSkeleton('Input Pemasukan')}
                ${createTabsSkeleton(2)} 
            </div>
            <div id="sub-page-content" class="panel-body scrollable-content">
                ${formSkeleton}
            </div>
        </div>
    `;
}

export function createPengaturanPageSkeletonHTML() {
    const profileSkeleton = `
        <div class="profile-card-settings card skeleton-wrapper" style="gap: 1rem; padding: 1.25rem; align-items: center;">
            <div class="skeleton skeleton-avatar" style="width: 64px; height: 64px;"></div>
            <div class="skeleton" style="height: 20px; width: 60%;"></div>
            <div class="skeleton" style="height: 16px; width: 80%;"></div>
            <div class="skeleton" style="height: 24px; width: 40%; border-radius: 999px;"></div>
        </div>
    `;

    const settingsGroupSkeleton = (count = 2) => `
        <div class="settings-section skeleton-wrapper" style="gap: 0.75rem;">
            <div class="skeleton" style="height: 12px; width: 30%; margin-left: 0.5rem;"></div>
            <div class="settings-list" style="display: flex; flex-direction: column; gap: 0.5rem;">
                ${Array(count).fill('<div class="skeleton" style="height: 60px; border-radius: var(--radius);"></div>').join('')}
            </div>
        </div>
    `;

    const body = profileSkeleton + settingsGroupSkeleton(1) + settingsGroupSkeleton(3) + settingsGroupSkeleton(1);
    return `
        <div class="content-panel settings-panel">
            <div class="panel-header">
                ${createToolbarSkeleton('Pengaturan')}
            </div>
            <div id="sub-page-content" class="scrollable-content" style="padding: 1.5rem;">
                ${body}
            </div>
        </div>
    `;
}

export function createPemasukanPageSkeletonHTML() {
    return `
        <div class="content-panel">
            <div class="panel-header">
                ${createToolbarSkeleton('Pemasukan')}
                ${createHeroSkeleton('110px')}
                ${createTabsSkeleton(2)}
            </div>
            <div id="sub-page-content" class="panel-body scrollable-content">
                <div class="date-group-header skeleton" style="width: 150px; height: 16px; margin-bottom: 8px;"></div>
                ${createListSkeletonHTML(3)}
            </div>
        </div>
    `;
}

export function createJurnalPageSkeletonHTML() {
    return `
        <div class="content-panel">
            <div class="panel-header">
                ${createToolbarSkeleton('Jurnal')}
                ${createHeroSkeleton('110px')}
                ${createTabsSkeleton(2)}
            </div>
            <div id="sub-page-content" class="panel-body scrollable-content">
                <div class="date-group-header skeleton" style="width: 150px; height: 16px; margin-bottom: 8px;"></div>
                ${createListSkeletonHTML(4)}
            </div>
        </div>
    `;
}

export function createAbsensiPageSkeletonHTML() {
    const selectionToolbar = `<div id="attendance-selection-toolbar" class="skeleton" style="height:48px; border-radius:12px; margin-top:8px;"></div>`;
    const dateDisplay = `<div id="attendance-date-display" class="attendance-date-display skeleton" style="height: 54px;"></div>`;
    
    return `
        <div class="content-panel page-absensi">
            <div class="panel-header">
                ${createToolbarSkeleton('Absensi')}
                <div class="attendance-info-bar">
                    ${dateDisplay}
                    ${selectionToolbar}
                </div>
                ${createTabsSkeleton(2)}
            </div>
            <div id="sub-page-content-wrapper" class="panel-body scrollable-content">
                <div id="sub-page-content">
                    ${createListSkeletonHTML(6)}
                </div>
            </div>
        </div>
    `;
}

export function createLaporanPageSkeletonHTML() {
    const cardSkeleton = (height = '180px') => `
        <div class="dashboard-card card-full-width skeleton-wrapper">
            <div class="card-header">
                <div class="skeleton" style="width: 40px; height: 40px; border-radius: 8px;"></div>
                <div class="skeleton skeleton-text" style="width: 150px; height: 20px;"></div>
            </div>
            <div class="card-body">
                <div class="skeleton" style="width: 100%; height: ${height}; border-radius: 8px;"></div>
            </div>
        </div>
    `;
    
    return `
        <div class="content-panel">
            <div class="panel-header">
                ${createToolbarSkeleton('Laporan')}
                ${createHeroSkeleton('110px')}
            </div>
            <div id="sub-page-content" class="panel-body scrollable-content">
                <div class="card card-pad skeleton" id="report-filter-card" style="height: 80px; margin-bottom: 1rem;"></div>
                <div class="report-summary-header skeleton" id="report-summary-header" style="height: 50px; margin-bottom: 1rem;"></div>
                <div class="dashboard-grid-layout" id="report-summary-grid">
                    ${cardSkeleton('220px')}
                    ${cardSkeleton('250px')}
                    ${cardSkeleton('250px')}
                </div>
            </div>
        </div>
    `;
}

export function createDashboardPageSkeletonHTML() {
    const statCard = `<div class="stat-item skeleton" style="height: 120px; border-radius: var(--radius);"></div>`;
    const chartCard = (height = '250px') => `
        <div class="dashboard-card card-full-width skeleton" style="height: ${height}; border-radius: var(--radius);">
            <div class="card-header skeleton" style="height: 40px; width: 60%; margin: 0.5rem 0 1rem 0.5rem; border-radius: 6px;"></div>
            <div class="card-body skeleton" style="flex-grow: 1; border-radius: 8px; margin: 0.5rem;"></div>
        </div>`;

    return `
        ${createToolbarSkeleton('Dashboard')}
        <div id="sub-page-content" class="scrollable-content" style="padding: 1rem;">
            ${createHeroSkeleton('110px')}
            <div class="dashboard-stats-grid" style="margin-bottom: 1.5rem;">
                ${statCard}${statCard}${statCard}${statCard}
            </div>
            <div class="dashboard-hero quote-hero skeleton" style="height: 130px; margin-bottom: 1.5rem; border-radius: var(--radius-lg);"></div>
            <div class="dashboard-card card-full-width skeleton" id="dashboard-card-budgets" style="height: 200px; margin-bottom: 1.5rem; border-radius: var(--radius);"></div>
            <div class="dashboard-worker-stats-grid" style="margin-bottom: 1.5rem;">
                ${statCard}${statCard}${statCard}${statCard}
            </div>
            <div class="info-hero-card skeleton" style="height: 100px; margin-bottom: 1.5rem; border-radius: var(--radius-lg);"></div>
            <div class="dashboard-grid-layout">
                ${chartCard('300px')}
                ${chartCard('300px')}
            </div>
        </div>
    `;
}

// --- [FUNGSI SKELETON HALAMAN BARU] ---

function createStokPageSkeletonHTML() {
    return `
        <div class="content-panel">
            <div class="panel-header">
                ${createToolbarSkeleton('Manajemen Stok')}
                ${createTabsSkeleton(2)}
            </div>
            <div id="sub-page-content" class="panel-body scrollable-content">
                ${createListSkeletonHTML(6)}
            </div>
        </div>
    `;
}

function createSimulasiPageSkeletonHTML() {
    const summaryCard = `
        <div class="simulasi-summary card card-pad skeleton-wrapper" style="gap: 1rem;">
            <div class="form-group"><div class="skeleton" style="height: 12px; width: 60%;"></div><div class="skeleton" style="height: 40px; width: 100%;"></div></div>
            <div class="simulasi-totals sim-totals-rows" style="display: flex; flex-direction: column; gap: 0.5rem;">
                <div class="skeleton" style="height: 20px; width: 80%;"></div>
                <div class="skeleton" style="height: 24px; width: 60%;"></div>
            </div>
            <div class="sim-actions" style="display:flex; gap:.5rem;">
                <div class="skeleton" style="height: 40px; width: 120px; border-radius: 8px;"></div>
                <div class="skeleton" style="height: 40px; width: 40px; border-radius: 8px;"></div>
            </div>
        </div>
    `;
    const listCard = `
        <div class="card card-pad skeleton-wrapper" style="margin-top: 1rem; gap: 1rem;">
            <div class="skeleton" style="height: 30px; width: 70%; border-radius: 8px;"></div>
            <div class="skeleton" style="height: 40px; width: 100%; border-radius: 8px;"></div>
            <div class="skeleton" style="height: 40px; width: 100%; border-radius: 8px;"></div>
            <div class="skeleton" style="height: 30px; width: 60%; border-radius: 8px; margin-top: 1rem;"></div>
            <div class="skeleton" style="height: 40px; width: 100%; border-radius: 8px;"></div>
        </div>
    `;
    return `
        <div class="content-panel">
            ${createToolbarSkeleton('Simulasi Pembayaran')}
            <div id="sub-page-content" class="scrollable-content" style="padding: 1rem;">
                ${summaryCard}
                ${listCard}
            </div>
        </div>
    `;
}

function createLogAktivitasPageSkeletonHTML() {
    return `
        <div class="content-panel">
            <div class="panel-header">
                ${createToolbarSkeleton('Log Aktivitas')}
                ${createHeroSkeleton('110px')}
                ${createTabsSkeleton(2)}
            </div>
            <div id="sub-page-content" class="panel-body scrollable-content">
                <div class="date-group-header skeleton" style="width: 150px; height: 16px; margin-bottom: 8px;"></div>
                ${createListSkeletonHTML(3)}
            </div>
        </div>
    `;
}

function createRecycleBinPageSkeletonHTML() {
    return `
        <div class="content-panel">
            <div class="panel-header">
                ${createToolbarSkeleton('Keranjang Sampah')}
                ${createHeroSkeleton('110px')}
                ${createCategoryNavSkeleton()}
            </div>
            <div id="sub-page-content" class="panel-body scrollable-content">
                ${createListSkeletonHTML(6)}
            </div>
        </div>
    `;
}

function createChatPageSkeletonHTML() {
    const bubble = (align) => `
        <div class="msg-group skeleton-item" style="align-self: ${align}; max-width: 70%; width: 100%;">
            <div class="comment-main" style="align-items: ${align};">
                <div class="comment-content">
                    <div class="skeleton" style="height: 50px; width: ${Math.random() * 50 + 150}px; border-radius: 12px;"></div>
                </div>
            </div>
        </div>`;
    
    const composer = `
        <div class="composer-wrapper skeleton-wrapper">
            <footer class="composer">
                <div class="composer-row">
                    <div class="composer-capsule" style="padding: 0.5rem 1rem;">
                        <div class="skeleton" style="height: 24px; flex-grow: 1; border-radius: 6px;"></div>
                        <div class="skeleton" style="height: 36px; width: 36px; border-radius: 50%; margin-left: 8px;"></div>
                    </div>
                </div>
            </footer>
        </div>
    `;

    return `
        <div class="content-panel chat-page-panel">
            <div class="toolbar sticky-toolbar">
                <div class="toolbar-standard-actions">
                    <div class="page-label" style="display: flex; align-items: center; gap: 8px;">
                        <div class="skeleton" style="width: 32px; height: 32px; border-radius: 50%;"></div>
                        <div class="title-group">
                            <div class="skeleton" style="height: 16px; width: 150px; border-radius: 4px;"></div>
                            <div class="skeleton" style="height: 12px; width: 80px; border-radius: 4px; margin-top: 4px;"></div>
                        </div>
                    </div>
                    <div class="header-actions">
                        <div class="skeleton" style="width: 32px; height: 32px; border-radius: 8px;"></div>
                    </div>
                </div>
            </div>
            <div id="sub-page-content" class="panel-body scrollable-content" style="padding: 0;">
                <div class="chat-view">
                    <main class="chat-thread" role="log">
                        ${bubble('flex-start')}
                        ${bubble('flex-end')}
                        ${bubble('flex-start')}
                        ${bubble('flex-start')}
                        ${bubble('flex-end')}
                    </main>
                </div>
            </div>
            ${composer}
        </div>
    `;
}


// --- PERBAIKAN DI SINI ---
// Skeleton baru untuk Halaman Master Data
function createMasterDataPageSkeletonHTML() {
    const listSkeleton = createListSkeletonHTML(6); // Default list view
    
    return `
        <div class="content-panel">
            <div class="panel-header">
                ${createToolbarSkeleton('Kelola Master Data')}
                ${createCategoryNavSkeleton()}
                ${createTabsSkeleton(2)}
            </div>
            <div id="sub-page-content" class="panel-body scrollable-content">
                ${listSkeleton}
            </div>
        </div>
    `;
}
// --- AKHIR PERBAIKAN ---


// --- [FUNGSI ROUTER UTAMA] ---
export const _getSkeletonLoaderHTML = (type = 'page') => {
    switch (type) {
        case 'dashboard':
            return createDashboardPageSkeletonHTML();
        case 'tagihan':
            return createTagihanPageSkeletonHTML();
        case 'pengeluaran':
            return createPengeluaranPageSkeletonHTML();
        case 'pemasukan_form':
            return createPemasukanFormPageSkeletonHTML();
        case 'pemasukan':
            return createPemasukanPageSkeletonHTML();
        case 'jurnal':
            return createJurnalPageSkeletonHTML();
        case 'absensi':
            return createAbsensiPageSkeletonHTML();
        case 'laporan':
            return createLaporanPageSkeletonHTML();
        case 'pengaturan':
            return createPengaturanPageSkeletonHTML();
        
        // --- [SKELETON BARU DITAMBAHKAN] ---
        case 'stok':
            return createStokPageSkeletonHTML();
        case 'simulasi':
            return createSimulasiPageSkeletonHTML();
        case 'log_aktivitas':
            return createLogAktivitasPageSkeletonHTML();
        case 'recycle_bin':
            return createRecycleBinPageSkeletonHTML();
        case 'chat':
            return createChatPageSkeletonHTML();
        
        // --- PERBAIKAN DI SINI ---
        case 'master_data':
            return createMasterDataPageSkeletonHTML(); // Gunakan skeleton baru
        // --- AKHIR PERBAIKAN ---

        case 'komentar': // Halaman Komentar Desktop
             return `
                <div class="content-panel">
                    ${createToolbarSkeleton('Semua Komentar')}
                    <div id="komentar-list-container" class="panel-body scrollable-content">
                        ${createListSkeletonHTML(8)}
                    </div>
                </div>
            `;
        // --- [AKHIR SKELETON BARU] ---
            
        case 'page':
        default:
            return `
                <div class="content-panel">
                    ${createToolbarSkeleton()}
                    <div id="sub-page-content" class="panel-body scrollable-content">
                        ${createListSkeletonHTML(8)}
                    </div>
                </div>
            `;
    }
};