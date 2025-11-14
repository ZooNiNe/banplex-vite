import { appState } from '../../state/appState.js';
import { $, $$ } from '../../utils/dom.js';
import { createPageToolbarHTML } from '../components/toolbar.js';
import { createUnifiedCard } from '../components/cards.js';
import { getEmptyStateHTML } from '../components/emptyState.js';
import { formatDate, fmtIDR } from '../../utils/formatters.js';
import { emit, on, off } from '../../state/eventBus.js';
import { getJSDate, isViewer, parseLocalDate, getLocalDayBounds } from '../../utils/helpers.js';
import { createMasterDataSelect, initCustomSelects } from '../components/forms/index.js';
import { createTabsHTML } from '../components/tabs.js';
import { fetchAndCacheData } from '../../services/data/fetch.js';
import { localDB, loadDataForPage } from '../../services/localDbService.js';
import { _activateSelectionMode, deactivateSelectionMode } from '../components/selection.js';
import { createListSkeletonHTML } from '../components/skeleton.js';
import { createModal, closeModal, closeModalImmediate } from '../components/modal.js';
import { toast } from '../components/toast.js';
import { handleSaveAllPendingAttendance, setManualAttendanceProject } from '../../services/data/attendanceService.js';
import { liveQueryMulti } from '../../state/liveQuery.js';
import { projectsCol, workersCol, professionsCol, attendanceRecordsCol } from '../../config/firebase.js';

let pageDataController = null;
let pageEventListenerController = null;
let unsubscribeLiveQuery = null;
let debouncedRender = null;

function createIcon(iconName, size = 18, classes = '') {
  const icons = {
      edit: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-pencil ${classes}"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>`,
      work: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-briefcase ${classes}"><rect width="20" height="14" x="2" y="7" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>`,
      hammer: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-hammer-icon lucide-hammer ${classes}"><path d="m15 12-9.373 9.373a1 1 0 0 1-3.001-3L12 9"/><path d="m18 15 4-4"/><path d="m21.5 11.5-1.914-1.914A2 2 0 0 1 19 8.172v-.344a2 2 0 0 0-.586-1.414l-1.657-1.657A6 6 0 0 0 12.516 3H9l1.243 1.243A6 6 0 0 1 12 8.485V10l2 2h1.172a2 2 0 0 1 1.414.586L18.5 14.5"/></svg>`,
      pickaxe: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-pickaxe-icon lucide-pickaxe"><path d="m14 13-8.381 8.38a1 1 0 0 1-3.001-3L11 9.999"/><path d="M15.973 4.027A13 13 0 0 0 5.902 2.373c-1.398.342-1.092 2.158.277 2.601a19.9 19.9 0 0 1 5.822 3.024"/><path d="M16.001 11.999a19.9 19.9 0 0 1 3.024 5.824c.444 1.369 2.26 1.676 2.603.278A13 13 0 0 0 20 8.069"/><path d="M18.352 3.352a1.205 1.205 0 0 0-1.704 0l-5.296 5.296a1.205 1.205 0 0 0 0 1.704l2.296 2.296a1.205 1.205 0 0 0 1.704 0l5.296-5.296a1.205 1.205 0 0 0 0-1.704z"/></svg>`,
      engineering: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-hard-hat-icon lucide-hard-hat"><path d="M10 10V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5"/><path d="M14 6a6 6 0 0 1 6 6v3"/><path d="M4 15v-3a6 6 0 0 1 6-6"/><rect x="2" y="15" width="20" height="4" rx="1"/></svg>`,
      save: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-save ${classes}"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>`,
      filter_list: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-filter ${classes}"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>`,
      sort: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-up-down ${classes}"><path d="m21 16-4 4-4-4"/><path d="M17 20V4"/><path d="m3 8 4-4 4 4"/><path d="M7 4v16"/></svg>`,
      badge: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-badge ${classes}"><path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z"/></svg>`,
      settings: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-settings ${classes}"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 0 2l-.15.1a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1 0-2l.15-.1a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>`,
      'check-check': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check-check ${classes}"><path d="M18 6 7 17l-5-5"/><path d="m22 10-7.5 7.5L13 16"/></svg>`,
      'list-checks': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-list-checks ${classes}"><path d="m3 17 2 2 4-4"/><path d="m3 7 2 2 4-4"/><path d="M13 6h8"/><path d="M13 12h8"/><path d="M13 18h8"/></svg>`,
      'chevron-right': `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-right-icon lucide-chevron-right"><path d="m9 18 6-6-6-6"/></svg>`,
      'chevron-left': `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-left-icon lucide-chevron-left"><path d="m15 18-6-6 6-6"/></svg>`,
      'hard-hat': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-hard-hat ${classes}"><path d="M10 10V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5"/><path d="M14 6a6 6 0 0 1 6 6v3"/><path d="M4 15v-3a6 6 0 0 1 6-6"/><rect x="2" y="15" width="20" height="4" rx="1"/></svg>`,
      error: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-alert-triangle ${classes}"><path d="m21.73 18-8-14a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`,
      'calendar-x-2': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-calendar-x-2 ${classes}"><path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/><path d="m14.5 14.5-5 5"/><path d="m9.5 14.5 5 5"/></svg>`,
      'chevron-down': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-down ${classes}"><path d="m6 9 6 6 6-6"/></svg>`,
      'more-vertical': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-more-vertical ${classes}"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>`,
  };
  return icons[iconName] || '';
}

async function _renderManualAttendanceForm() {
    const container = $('#sub-page-content');
    if (!container) return;

    if (!container.innerHTML.trim() || container.querySelector('.skeleton-wrapper')) {
        container.innerHTML = `<div class="wa-card-list-wrapper" id="manual-attendance-list-container">${createListSkeletonHTML(3)}</div>`;
    }
    await _renderWorkerListForManualAttendance();
}

async function _renderWorkerListForManualAttendance() {
    const listContainer = $('#manual-attendance-list-container');
    if (!listContainer) return;

    pageDataController?.abort();
    pageDataController = new AbortController();
    const signal = pageDataController.signal;

    const dateStr = appState.defaultAttendanceDate || new Date().toISOString().slice(0,10);
    const { startOfDay, endOfDay } = getLocalDayBounds(dateStr);
    const pendingAttendanceMap = new Map(appState.pendingAttendance || []);
    
    let workersToShow = (appState.workers || []).filter(w => w.status === 'active' && !w.isDeleted);
    
    if (signal?.aborted) throw new DOMException('Operation aborted', 'AbortError');

    const existingRecordsOnDate = (appState.attendanceRecords || []).filter(rec => {
        if (rec.isDeleted === 1) return false;
        const recDate = getJSDate(rec.date);
        return recDate >= startOfDay && recDate <= endOfDay;
    });

    const existingRecordMap = new Map(); 
    const assignedElsewhereWorkerIds = new Set();
    existingRecordsOnDate.forEach(rec => { 
        const list = existingRecordMap.get(rec.workerId) || [];
        list.push(rec);
        existingRecordMap.set(rec.workerId, list);
        
        if (rec.attendanceStatus === 'full_day' || rec.attendanceStatus === 'half_day') {
            assignedElsewhereWorkerIds.add(rec.workerId);
        }
    });
    
    const attendanceFilter = appState.attendanceFilter || {};
    appState.attendanceFilter = attendanceFilter;
    const fallbackProjectFilter = attendanceFilter.projectId || appState.manualAttendanceSelectedProjectId || appState.defaultAttendanceProjectId || 'all';
    attendanceFilter.projectId = fallbackProjectFilter;
    const { sortBy = 'status', sortDirection = 'desc' } = attendanceFilter;

    if (fallbackProjectFilter && fallbackProjectFilter !== 'all') {
        workersToShow = workersToShow.filter(w => {
            if (w.defaultProjectId) {
                return w.defaultProjectId === fallbackProjectFilter;
            }
            return !!(w.projectWages && w.projectWages[fallbackProjectFilter]);
        });
    }

    workersToShow.sort((a, b) => {
        const pendingA = pendingAttendanceMap.get(a.id);
        const pendingB = pendingAttendanceMap.get(b.id);
        const attendanceA = existingRecordMap.get(a.id);
        const attendanceB = existingRecordMap.get(b.id);
        const elsewhereA = assignedElsewhereWorkerIds.has(a.id);
        const elsewhereB = assignedElsewhereWorkerIds.has(b.id);

        const getStatusVal = (pending, recordList, elsewhere) => {
            if (elsewhere) return 0; 
            if (pending) return 4;
            if (recordList && recordList.some(r => r.attendanceStatus === 'full_day' || r.attendanceStatus === 'half_day')) return 3;
            if (recordList && recordList.some(r => r.attendanceStatus === 'absent')) return 2;
            return 1;
        };

        const statusValA = getStatusVal(pendingA, attendanceA, elsewhereA);
        const statusValB = getStatusVal(pendingB, attendanceB, elsewhereB);
        
        let comparison = 0;
        if (sortBy === 'status') {
            comparison = statusValA - statusValB;
            if (comparison === 0) comparison = (a.workerName || '').localeCompare(b.workerName || '');
        } else {
            comparison = (a.workerName || '').localeCompare(b.workerName || '');
            if (comparison === 0) comparison = statusValA - statusValB;
        }
        return sortDirection === 'desc' ? comparison : -comparison;
    });

    const cardsHTML = workersToShow.map(worker => {
        const isAssignedElsewhere = assignedElsewhereWorkerIds.has(worker.id);
        const existingRecords = existingRecordMap.get(worker.id); 
        const pendingData = pendingAttendanceMap.get(worker.id);
        let headerMetaText = 'Belum Absen';
        let isSelected = false;
        let customClasses = '';
        const badges = [];
        
        const showMoreAction = !isViewer();
        const action = 'open-manual-attendance-modal'; 

        if (isAssignedElsewhere) {
            const otherProject = appState.projects.find(p => p.id === existingRecords[0]?.projectId);
            headerMetaText = `Hadir di ${otherProject?.projectName || 'proyek lain'}`;
            customClasses = 'is-assigned-elsewhere';
        
        } else if (pendingData) {
            customClasses = 'is-pending-save';
            const entries = Array.isArray(pendingData) ? pendingData : [pendingData];
            const presentEntries = entries.filter(e => e.status !== 'absent');
            
            isSelected = presentEntries.length > 0; 

            if (entries.length > 1) {
                headerMetaText = 'Siap Disimpan (Multi-Proyek)';
                badges.push({
                    icon: null, 
                    text: `${entries.length} Proyek`,
                    action: action, 
                    tooltip: 'Edit Multi-Proyek'
                });
            } else if (entries.length === 1) {
                const entry = entries[0];
                if (entry.status === 'absent') {
                     headerMetaText = 'Siap Disimpan (Absen)';
                     customClasses = 'is-pending-save is-absent';
                     isSelected = false;
                } else {
                    headerMetaText = `Siap Disimpan (${entry.status === 'full_day' ? 'Hadir' : '1/2 Hari'})`;
                }
                
                const projectName = appState.projects.find(p => p.id === entry.projectId)?.projectName || 'P?';
                const projectInitials = projectName.split(' ').map(s => s.charAt(0)).join('').substring(0, 3).toUpperCase();
                const roleText = entry.role || 'Peran?';
                const badgeText = `[${projectInitials}] ${roleText}`;
                
                badges.push({
                    icon: null, 
                    text: badgeText, 
                    action: action,
                    tooltip: 'Edit Absensi'
                });
                if (entry.status !== 'absent') {
                    badges.push({
                        icon: null, 
                        text: fmtIDR(entry.pay),
                        action: action,
                        tooltip: 'Edit Absensi'
                    });
                }
            }

        } else if (existingRecords && existingRecords.length > 0) {
            const presentEntries = existingRecords.filter(e => e.attendanceStatus !== 'absent');
            
            if (presentEntries.length > 1) { 
                headerMetaText = 'Sudah Absen (Multi-Proyek)';
                customClasses = 'is-already-attended';
                badges.push({
                    icon: null,
                    text: `${presentEntries.length} Proyek`,
                    action: action, 
                    tooltip: 'Edit Absensi'
                });
                isSelected = false; 
            } else if (presentEntries.length === 1) { 
                const existingRecord = presentEntries[0];
                headerMetaText = `Sudah Absen (${existingRecord.attendanceStatus === 'full_day' ? 'Hadir' : '1/2 Hari'})`;
                customClasses = 'is-already-attended';
                
                const projectName = appState.projects.find(p => p.id === existingRecord.projectId)?.projectName || 'P?';
                const projectInitials = projectName.split(' ').map(s => s.charAt(0)).join('').substring(0, 3).toUpperCase();
                const roleText = existingRecord.jobRole || 'Peran?';
                const badgeText = `[${projectInitials}] ${roleText}`;

                badges.push({ icon: null, text: badgeText, action: action, tooltip: 'Edit Absensi' });
                badges.push({ icon: null, text: fmtIDR(existingRecord.totalPay), action: action, tooltip: 'Edit Absensi' });
                isSelected = false;
            } else { 
                headerMetaText = 'Sudah Ditandai Absen';
                customClasses = 'is-already-attended is-absent';
                isSelected = false;
            }        
        } else {
            isSelected = appState.selectionMode.selectedIds.has(worker.id);
            
            let defaultProjectId = worker.defaultProjectId || appState.manualAttendanceSelectedProjectId || appState.defaultAttendanceProjectId;
            if (!defaultProjectId && appState.projects.length > 0) {
                const activeProjects = appState.projects.filter(p => p.status === 'active' && !p.isDeleted);
                if (activeProjects.length > 0) {
                    defaultProjectId = activeProjects[0].id;
                    setManualAttendanceProject(defaultProjectId);
                }
            }

            if (defaultProjectId) {
                const wages = (worker.projectWages || {})[defaultProjectId] || {};
                const role = worker.defaultRole || (Object.keys(wages).length > 0 ? Object.keys(wages)[0] : '');
                if (role) {
                    const projectName = appState.projects.find(p => p.id === defaultProjectId)?.projectName || 'P?';
                    const projectInitials = projectName.split(' ').map(s => s.charAt(0)).join('').substring(0, 3).toUpperCase();
                    const badgeText = `[${projectInitials}] ${role}`;
                    badges.push({ icon: null, text: badgeText, tooltip: 'Proyek & Peran Default' });
                }
            }
        }
        return createUnifiedCard({
            id: `att-worker-${worker.id}`,
            title: worker.workerName,
            headerMeta: headerMetaText,
            metaBadges: badges,
            dataset: { type: 'worker', itemId: worker.id, workerId: worker.id }, 
            moreAction: showMoreAction, 
            selectionEnabled: true,
            isSelected: isSelected,
            customClasses: customClasses
        });
    }).join('');

    if (workersToShow.length > 0) {
         listContainer.innerHTML = `<div class="wa-card-list-wrapper">${cardsHTML}</div>`;
    } else {
         listContainer.innerHTML = getEmptyStateHTML({ icon: 'engineering', title: 'Tidak Ada Pekerja', desc: 'Tidak ada pekerja aktif yang ditemukan.' });
    }
    
    appState.selectionMode.selectedIds.clear();

    listContainer.querySelectorAll('.wa-card-v2-wrapper').forEach(card => {
        const id = card.dataset.itemId;
        const pending = pendingAttendanceMap.get(id);
        let isPendingPresent = false;
        if (pending) {
            const entries = Array.isArray(pending) ? pending : [pending];
            isPendingPresent = entries.some(e => e.status !== 'absent');
        }
        
        const shouldBeSelected = appState.selectionMode.selectedIds.has(id) || isPendingPresent;
        
        card.classList.toggle('selected', shouldBeSelected);
        card.querySelector('.selection-checkmark')?.classList.toggle('checked', shouldBeSelected);
    });
    
    emit('ui.selection.updateCount');
}

async function renderAttendanceList(signal) {
    const container = $('#sub-page-content');
    if (!container) return;
    container.innerHTML = createListSkeletonHTML(5);

    try {
        const attendanceFilter = appState.attendanceFilter || {};
        appState.attendanceFilter = attendanceFilter;
        const resolvedProjectFilter = attendanceFilter.projectId || appState.manualAttendanceSelectedProjectId || appState.defaultAttendanceProjectId || 'all';
        attendanceFilter.projectId = resolvedProjectFilter;
        const { sortBy = 'status', sortDirection = 'desc' } = attendanceFilter;
        const selectedDateStr = appState.defaultAttendanceDate || new Date().toISOString().slice(0,10);
        
        const { startOfDay, endOfDay } = getLocalDayBounds(selectedDateStr);

        const attendanceRecords = (appState.attendanceRecords || [])
            .filter(rec => {
                const recDate = getJSDate(rec.date);
                return recDate >= startOfDay && recDate <= endOfDay && rec.isDeleted !== 1;
            });
            
        if (signal?.aborted) throw new DOMException('Dexie query aborted (daily attendance)', 'AbortError');
        const attendanceMap = new Map(attendanceRecords.map(rec => [rec.workerId, rec]));

        let activeWorkers = (appState.workers || []).filter(w => w.status === 'active' && !w.isDeleted);
        if (resolvedProjectFilter && resolvedProjectFilter !== 'all') {
            activeWorkers = activeWorkers.filter(w => {
                if (w.defaultProjectId) {
                    return w.defaultProjectId === resolvedProjectFilter;
                }
                return !!(w.projectWages && w.projectWages[resolvedProjectFilter]);
            });
        }

        activeWorkers.sort((a, b) => {
            const attendanceA = attendanceMap.get(a.id);
            const attendanceB = attendanceMap.get(b.id);
            const statusOrder = { paid: 0, unpaid: 1, absent: 2, undefined: 3 };
            const getStatusVal = (att) => {
                if (!att) return statusOrder.undefined;
                if (att.isPaid) return statusOrder.paid;
                if (['full_day', 'half_day'].includes(att.attendanceStatus)) return statusOrder.unpaid;
                return statusOrder.absent;
            };
            const statusValA = getStatusVal(attendanceA);
            const statusValB = getStatusVal(attendanceB);
            
            let comparison = 0;

            if (sortBy === 'status') {
                 comparison = statusValA - statusValB;
                 if (comparison === 0) comparison = (a.workerName || '').localeCompare(b.workerName || '');
            } else {
                 comparison = (a.workerName || '').localeCompare(b.workerName || '');
                  if (comparison === 0) comparison = statusValA - statusValB;
            }
            return sortDirection === 'desc' ? comparison : -comparison;
        });

        _renderAttendanceListUI(activeWorkers, attendanceMap, selectedDateStr, signal);

    } catch (error) {
         if (error.name === 'AbortError') {
             console.log("Attendance list rendering aborted.");
         } else {
            console.error("Error rendering attendance list:", error);
            container.innerHTML = getEmptyStateHTML({ icon: 'error', title: 'Gagal Memuat Daftar', desc: 'Tidak dapat memuat daftar absensi harian.' });
         }
    }
}

function _renderAttendanceListUI(workersToDisplay, attendanceMap, selectedDateStr, signal) {
    const container = $('#sub-page-content');
    if (!container) return;

    if (signal?.aborted) throw new DOMException('Operation aborted before rendering attendance list', 'AbortError');

    if (workersToDisplay.length === 0) {
        container.innerHTML = getEmptyStateHTML({ icon: 'engineering', title: 'Tidak Ada Pekerja', desc: 'Tidak ada pekerja aktif yang cocok dengan filter.' });
        return;
    }

    const cardsHTML = workersToDisplay.map(worker => {
        const attendance = attendanceMap.get(worker.id);
        const project = attendance ? appState.projects?.find(p => p.id === attendance.projectId) : null;
        const profession = appState.professions?.find(p => p.id === worker.professionId);
        const metaBadges = [];
        let headerMetaText = 'Belum Absen';
        let action = 'open-manual-attendance-modal';
        const isSelected = false;
        const itemId = attendance?.id || worker.id;
        const recordId = attendance?.id;
        let customClasses = '';

        if (profession) metaBadges.push({icon: 'badge', text: profession.professionName});

        if (attendance) {
            headerMetaText = attendance.isPaid ? 'Sudah Dibayar' : `Upah: ${fmtIDR(attendance.totalPay || 0)}`;
            action = 'open-manual-attendance-modal';
            customClasses = 'is-already-attended';
            if (attendance.projectId) metaBadges.push({icon: 'work', text: project?.projectName || 'Proyek?'});
            if (attendance.jobRole) metaBadges.push({icon: 'hammer', text: attendance.jobRole});
            
             if (attendance.attendanceStatus === 'full_day') metaBadges.push({icon: 'check-check', text: 'Hadir'});
             else if (attendance.attendanceStatus === 'half_day') metaBadges.push({icon: 'list-checks', text: '1/2 Hari'});
             else {
                metaBadges.push({icon: 'calendar-x-2', text: 'Absen'});
                customClasses += ' is-absent';
                headerMetaText = 'Absen';
             }
        }

        return createUnifiedCard({
            id: `att-${itemId}`,
            title: worker.workerName,
            headerMeta: headerMetaText,
            metaBadges: metaBadges,
            dataset: { 
                action: action,
                id: attendance?.id,
                workerId: worker.id, 
                date: selectedDateStr, 
                recordId: recordId,
                itemId: itemId,
                pageContext: 'absensi'
            },
            moreAction: !isViewer(),
            selectionEnabled: false,
            isSelected: isSelected,
            customClasses: customClasses
        });
    }).join('');

    container.innerHTML = `<div class="wa-card-list-wrapper">${cardsHTML}</div>`;
    container.querySelectorAll('.wa-card-v2-wrapper').forEach((el, idx) => {
        if (!el.hasAttribute('data-animated')) {
            el.style.animationDelay = `${Math.min(idx, 20) * 22}ms`;
            el.setAttribute('data-animated', '');
        }
    });
}

function _renderDateAndSelectionUI(activeDateStr) {
    const toolbarContainer = $('#attendance-selection-toolbar');
    const dateDisplay = $('#attendance-date-display');
    const activeView = appState.activeSubPage.get('absensi') || 'manual';

    if (toolbarContainer && appState.selectionMode.active && appState.selectionMode.pageContext === 'absensi' && activeView === 'manual') {
        toolbarContainer.innerHTML = `
         <div class="toolbar-selection-actions attendance-toolbar">
             <div class="selection-info">
                 <span id="attendance-selection-count-text">0</span>
                 <span class="selection-info-label">Pekerja Terpilih</span>
             </div>
             <div class="selection-actions-group" id="global-selection-actions">
                 <button class="btn-icon" data-action="select-all-items" title="Pilih Semua / Batal Pilih">${createIcon('check-check', 22)}</button>
             </div>
             <button id="set-status-button" class="btn btn-primary" data-action="open-absence-status-panel" disabled>
                 ${createIcon('list-checks', 18)}
                 <span>Set Status</span>
             </button>
         </div>
        `;
        emit('ui.selection.updateCount');
        _updateFooterButton();
    } else if (toolbarContainer) {
        toolbarContainer.innerHTML = '';
    }

    if (dateDisplay) {
      const dateObj = parseLocalDate(activeDateStr);
      const dayName = dateObj.toLocaleDateString('id-ID', { weekday: 'long' });
      const dayMonth = dateObj.toLocaleDateString('id-ID', { day: 'numeric', month: 'long' });
      const year = dateObj.toLocaleDateString('id-ID', { year: 'numeric' });

      dateDisplay.innerHTML = `
        <button class="btn-icon date-nav-btn" data-action="prev-date" title="Tanggal Sebelumnya">${createIcon('chevron-left')}</button>
        <span class="date-parts-wrapper" data-action="open-date-picker">
          <span class="date-part" data-date-part="day" title="Ubah Tanggal">${dayName}, ${dayMonth}</span>
          <span class="date-part" data-date-part="year" title="Ubah Tahun">${year}</span>
        </span>
        <button class="btn-icon date-nav-btn" data-action="next-date" title="Tanggal Berikutnya">${createIcon('chevron-right')}</button>
        <input type="date" id="hidden-date-picker" style="display: none; position: absolute; left: -9999px;" value="${activeDateStr}">
      `;
       
       setTimeout(() => {
            const currentContainer = $('#attendance-date-display');
            if (currentContainer) {
                _attachDatePickerListeners(currentContainer);
            }
       }, 0);
   }
}

async function renderAbsensiView(view, options = {}) {
    const { skipData = false } = options;

    pageDataController?.abort();
    pageDataController = new AbortController();
    const signal = pageDataController.signal;

    const activeDateStr = appState.defaultAttendanceDate || new Date().toISOString().slice(0,10);
    const subPageContentWrapper = $('#sub-page-content-wrapper');
    
    if (!skipData && subPageContentWrapper) {
        if (view === 'manual') {
            subPageContentWrapper.innerHTML = `<div id="sub-page-content"><div class="wa-card-list-wrapper" id="manual-attendance-list-container">${createListSkeletonHTML(3)}</div></div>`;
        } else {
            subPageContentWrapper.innerHTML = `<div id="sub-page-content">${createListSkeletonHTML(5)}</div>`;
        }
    } else if (subPageContentWrapper && !subPageContentWrapper.innerHTML.trim()) {
        subPageContentWrapper.innerHTML = `<div id="sub-page-content">${createListSkeletonHTML(3)}</div>`;
    }

    if (view === 'manual') {
        if (!appState.selectionMode.active || appState.selectionMode.pageContext !== 'absensi') {
            _activateSelectionMode('absensi');
        }
    } else {
        if (appState.selectionMode.active && appState.selectionMode.pageContext === 'absensi') {
            deactivateSelectionMode(true);
        }
    }
    
    _renderDateAndSelectionUI(activeDateStr);
    _updateFooterButton(); 

    if (skipData) {
        return;
    }
    
    if (view === 'harian') {
       renderAttendanceList(signal);
   } else {
        await _renderManualAttendanceForm();
   }
}

function setupDebouncedRender() {
    if (debouncedRender) clearTimeout(debouncedRender.timer);
    
    const debouncedFunc = () => {
        if (appState.activePage === 'absensi') {
            renderAbsensiView(appState.activeSubPage.get('absensi') || 'manual', { skipData: false });
        }
        debouncedRender.timer = null;
    };
    
    debouncedRender = {
        trigger: () => {
            if (debouncedRender.timer) clearTimeout(debouncedRender.timer);
            debouncedRender.timer = setTimeout(debouncedFunc, 300);
        },
        timer: null
    };
}

function _attachDatePickerListeners(container) {
    if (!container) return;
   const listenerSignal = pageEventListenerController?.signal;
   if (!listenerSignal) return;

    if (container.dataset.datePickerListenersAttached === 'true') return;
    container.dataset.datePickerListenersAttached = 'true';
    
    container.addEventListener('click', (e) => {
        const actionTarget = e.target.closest('[data-action]');
        const hiddenPicker = container.querySelector('#hidden-date-picker');

        if (actionTarget) {
            const action = actionTarget.dataset.action;
            const dateStr = appState.defaultAttendanceDate;
            let currentDate = parseLocalDate(dateStr);
            
            if (action === 'prev-date' || action === 'next-date') {
                const direction = action === 'prev-date' ? -1 : 1;
                currentDate.setDate(currentDate.getDate() + direction);
                const y = currentDate.getFullYear();
                const m = String(currentDate.getMonth() + 1).padStart(2, '0');
                const d = String(currentDate.getDate()).padStart(2, '0');
                const newDateStr = `${y}-${m}-${d}`;
                
                appState.defaultAttendanceDate = newDateStr;
                try { localStorage.setItem('attendance.defaultDate', newDateStr); } catch(_) {}
                appState.pendingAttendance.clear();
                appState.absensi.manualListNeedsUpdate = true;
                renderAbsensiView(appState.activeSubPage.get('absensi') || 'manual');
            }
        } else if (action === 'open-date-picker' && hiddenPicker) {
            try { hiddenPicker.showPicker(); } catch (_) { 
                hiddenPicker.style.display = 'block'; 
                hiddenPicker.focus(); 
                hiddenPicker.click(); 
                hiddenPicker.onblur = () => { hiddenPicker.style.display = 'none'; };
            }
        }
    }, { signal: listenerSignal });
    
    const hiddenPicker = container.querySelector('#hidden-date-picker');
    if (hiddenPicker) {
        const oldChangeListener = hiddenPicker._changeListener;
        if (oldChangeListener) hiddenPicker.removeEventListener('change', oldChangeListener);

        hiddenPicker._changeListener = (e) => {
            const newDateStr = e.target.value;
            if (newDateStr && newDateStr !== appState.defaultAttendanceDate) {
               appState.defaultAttendanceDate = newDateStr;
               try { localStorage.setItem('attendance.defaultDate', newDateStr); } catch(_) {}
               appState.pendingAttendance.clear();
               appState.absensi.manualListNeedsUpdate = true;
               renderAbsensiView(appState.activeSubPage.get('absensi') || 'manual');
            }
            hiddenPicker.style.display = 'none';
       };
       hiddenPicker.addEventListener('change', hiddenPicker._changeListener, { signal: listenerSignal });
       hiddenPicker.addEventListener('blur', () => { setTimeout(() => { hiddenPicker.style.display = 'none'; }, 100); }, { signal: listenerSignal });
   }
}

function _showPostSaveAttendanceDialog(dateStr, projectId) {
    const projectName = appState.projects.find(p => p.id === projectId)?.projectName || 'Proyek';
    const formattedDate = parseLocalDate(dateStr).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

    const successHTML = `
        <div class="success-preview-card" id="success-preview-card">
            <div class="success-hero success-hero--attendance">
                <svg class="success-hero-art" width="120" height="88" viewBox="0 0 120 88" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs><linearGradient id="ha1" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="var(--primary)" stop-opacity="0.18" /><stop offset="100%" stop-color="var(--primary)" stop-opacity="0.05" /></linearGradient></defs><rect x="8" y="12" width="84" height="52" rx="10" fill="url(#ha1)" stroke="var(--line)"/><rect x="20" y="26" width="40" height="8" rx="4" fill="var(--primary)" opacity="0.25" /><rect x="20" y="40" width="30" height="8" rx="4" fill="var(--primary)" opacity="0.15" /></svg>
                <div class="success-preview-icon">${createIcon('hard-hat', 28)}</div>
            </div>
            <h4 class="success-preview-title">Absensi Tersimpan</h4>
            <p class="success-preview-description">Data absensi manual berhasil disimpan untuk ${projectName} pada ${formattedDate}.</p>
            <dl class="detail-list" style="margin-top:.5rem;">
                <div><dt>Tanggal</dt><dd>${formattedDate}</dd></div>
                <div><dt>Proyek</dt><dd>${projectName}</dd></div>
            </dl>
        </div>`;

    const footer = `
        <button type="button" class="btn btn-secondary" data-action="close-modal-and-navigate" data-nav="jurnal">Lihat di Jurnal</button>
        <button type="button" class="btn btn-primary" data-action="history-back">OK</button>
    `;

    createModal('formView', { title: 'Pratinjau Berhasil', content: successHTML, footer, isUtility: true });
}

function _updateFooterButton() {
    const fabContainer = $('#fab-container'); 
    if (!fabContainer) return;
    
    const activeView = appState.activeSubPage.get('absensi') || 'manual';
    const pendingCount = appState.pendingAttendance?.size || 0;

    if (activeView === 'manual' && !isViewer() && pendingCount > 0) {
        let btn = fabContainer.querySelector('#save-all-pending-attendance-btn');
        if (!btn) {
            fabContainer.innerHTML = `
                <button class="fab" id="save-all-pending-attendance-btn" data-action="save-all-pending-attendance">
                    ${createIcon('save', 24)}
                    <span class="fab-label">Simpan Semua (${pendingCount})</span>
                </button>
            `;
            const newBtn = fabContainer.querySelector('#save-all-pending-attendance-btn');
            if (newBtn && pageEventListenerController) {
                 newBtn.addEventListener('click', () => {
                    handleSaveAllPendingAttendance();
                }, { signal: pageEventListenerController.signal });
            }
        } else {
            btn.querySelector('.fab-label').textContent = `Simpan Semua (${pendingCount})`;
        }
    } else {
        fabContainer.innerHTML = '';
    }
}


async function renderAbsensiPageContent() {
    const container = $('#sub-page-content-wrapper');
    if (!container) return;

    const initialView = appState.activeSubPage.get('absensi') || 'manual';
    
    if (initialView === 'manual') {
        container.innerHTML = `<div id="sub-page-content"><div class="wa-card-list-wrapper" id="manual-attendance-list-container">${createListSkeletonHTML(3)}</div></div>`;
    } else {
        container.innerHTML = `<div id="sub-page-content">${createListSkeletonHTML(5)}</div>`;
    }
    
    try {
        await Promise.all([
            fetchAndCacheData('projects', projectsCol, 'projectName'),
            fetchAndCacheData('workers', workersCol, 'workerName'),
            fetchAndCacheData('professions', professionsCol, 'professionName'),
            fetchAndCacheData('attendanceRecords', attendanceRecordsCol, 'date')
        ]);
            
        renderAbsensiView(initialView, { skipData: false });
    } catch (e) {
        console.error('[renderAbsensiPageContent] Failed to perform initial render:', e);
        const contentContainer = $('#sub-page-content');
        if (contentContainer) contentContainer.innerHTML = getEmptyStateHTML({ icon: 'error', title: 'Gagal Memuat', desc: 'Gagal memuat data absensi.' });
    }
}

function initAbsensiPage() {
    if (pageDataController) { pageDataController.abort(); pageDataController = null; }
    if (pageEventListenerController) { pageEventListenerController.abort(); pageEventListenerController = null; }
    if (unsubscribeLiveQuery) { unsubscribeLiveQuery.unsubscribe(); unsubscribeLiveQuery = null; }
    if (debouncedRender) clearTimeout(debouncedRender.timer);
    debouncedRender = null;

    appState.absensi = appState.absensi || {};
    appState.absensi.manualListNeedsUpdate = true;
    appState.absensi.manualWorkerListCache = null;
    appState.absensi.manualWorkerListCacheKey = null;
    if (!appState.pendingAttendance) {
        appState.pendingAttendance = new Map();
    }

    pageEventListenerController = new AbortController();
    const listenerSignal = pageEventListenerController.signal;

    const container = $('.page-container');
    
    const initialDateStr = appState.defaultAttendanceDate || parseLocalDate(new Date().toISOString().slice(0, 10)).toISOString().slice(0, 10);
    appState.defaultAttendanceDate = initialDateStr;

    const initialView = appState.activeSubPage.get('absensi') || 'manual';
    appState.activeSubPage.set('absensi', initialView);
    const defaultProjectFilter = appState.manualAttendanceSelectedProjectId || appState.defaultAttendanceProjectId || 'all';
    if (!appState.manualAttendanceSelectedProjectId && defaultProjectFilter && defaultProjectFilter !== 'all') {
        setManualAttendanceProject(defaultProjectFilter);
    }
    if (!appState.attendanceFilter) {
        appState.attendanceFilter = { projectId: defaultProjectFilter, sortBy: 'status', sortDirection: 'desc' };
    } else {
        appState.attendanceFilter.projectId = appState.attendanceFilter.projectId || defaultProjectFilter;
        appState.attendanceFilter.sortBy = appState.attendanceFilter.sortBy || 'status';
        appState.attendanceFilter.sortDirection = appState.attendanceFilter.sortDirection || 'desc';
    }

    if (initialView === 'manual') {
        _activateSelectionMode('absensi');
    } else {
        deactivateSelectionMode(true);
    }

    const filterSortActionsBtns = [
         { action: 'open-attendance-filter-modal', icon: 'filter_list', label: 'Filter Pekerja', size: 20 },
         { action: 'open-attendance-sort-modal', icon: 'sort', label: 'Urutkan Pekerja', size: 20 }
    ];
    const settingsActionBtn = !isViewer() ? [{ action: 'open-attendance-settings', icon: 'settings', label: 'Pengaturan Absensi', size: 18 }] : [];
    const allToolbarActions = [...filterSortActionsBtns, ...settingsActionBtn];
    const pageToolbarHTML = createPageToolbarHTML({ title: 'Absensi', actions: allToolbarActions });

    const tabsData = [ { id: 'manual', label: 'Input Manual' }, { id: 'harian', label: 'Harian' } ];
    const tabsHTML = createTabsHTML({ id: 'absensi-tabs', tabs: tabsData, activeTab: initialView, customClasses: 'tabs-underline two-tabs' });

    const initialContentHTML = (initialView === 'manual') 
        ? `<div id="sub-page-content"><div class="wa-card-list-wrapper" id="manual-attendance-list-container">${createListSkeletonHTML(3)}</div></div>`
        : `<div id="sub-page-content">${createListSkeletonHTML(5)}</div>`;
    
    container.innerHTML = `
        <div class="content-panel page-absensi">
             <div class="panel-header">
                ${pageToolbarHTML}
                <div class="attendance-info-bar">
                    <div id="attendance-date-display" class="attendance-date-display"></div>
                    <div id="attendance-selection-toolbar"></div>
                </div>
                ${tabsHTML}
             </div>
            <div id="sub-page-content-wrapper" class="panel-body scrollable-content">
                ${initialContentHTML}
            </div>
        </div>
    `;

    setupDebouncedRender();

    if (unsubscribeLiveQuery) unsubscribeLiveQuery.unsubscribe();
    unsubscribeLiveQuery = liveQueryMulti(
        ['attendance_records', 'workers', 'projects', 'professions'],
        (changedKeys) => {
            if (appState.activePage === 'absensi') {
                appState.absensi.manualListNeedsUpdate = true;
                if(debouncedRender) debouncedRender.trigger();
            }
        }
    );

    const tabsContainer = container.querySelector('#absensi-tabs');
    if (tabsContainer && !tabsContainer.dataset.listenerAttached) {
        tabsContainer.addEventListener('click', (e) => {
            const tabButton = e.target.closest('.sub-nav-item');
            if (!tabButton || tabButton.classList.contains('active')) return;
            tabsContainer.querySelector('.sub-nav-item.active')?.classList.remove('active');
            tabButton.classList.add('active');
            const newView = tabButton.dataset.tab;
            appState.activeSubPage.set('absensi', newView);
            appState.pendingAttendance.clear();
            
            renderAbsensiView(newView, { skipData: false });
        }, { signal: listenerSignal });
        tabsContainer.dataset.listenerAttached = 'true';
    }

    const fabContainer = $('#fab-container');
    if (fabContainer) {
        fabContainer.removeEventListener('click', handleFabClick); 
        fabContainer.addEventListener('click', handleFabClick, { signal: listenerSignal });
    }

    renderAbsensiView(initialView, { skipData: false });

    const globalSelectionBar = document.getElementById('selection-bar');
    if (globalSelectionBar) {
        globalSelectionBar.style.display = 'none';
    }
    
    _updateFooterButton();

    const cleanupAbsensi = () => {
        if (pageDataController) { pageDataController.abort(); pageDataController = null; }
        if (pageEventListenerController) { pageEventListenerController.abort(); pageEventListenerController = null; }
        if (unsubscribeLiveQuery) { unsubscribeLiveQuery.unsubscribe(); unsubscribeLiveQuery = null; }
        if(debouncedRender) clearTimeout(debouncedRender.timer); debouncedRender = null;
        
        deactivateSelectionMode(true);
        
        const fabContainer = $('#fab-container');
        if (fabContainer) fabContainer.innerHTML = '';
        
        appState.pendingAttendance?.clear();

        off('app.unload.absensi', cleanupAbsensi);
        off('ui.absensi.renderContent', renderAbsensiPageContent);
        off('ui.absensi.renderManualForm');
        off('ui.absensi.updateFooter');
    };
    
    off('app.unload.absensi', cleanupAbsensi);
    on('app.unload.absensi', cleanupAbsensi);

    on('ui.absensi.renderContent', renderAbsensiPageContent, { signal: listenerSignal });
    on('ui.absensi.renderManualForm', () => {
        if(appState.activePage === 'absensi' && appState.activeSubPage.get('absensi') === 'manual') {
            _renderWorkerListForManualAttendance();
        }
    }, { signal: listenerSignal });
    on('ui.absensi.updateFooter', _updateFooterButton, { signal: listenerSignal });
}

function handleFabClick(e) {
    const actionTarget = e.target.closest('[data-action]');
    if (!actionTarget) return;
    const action = actionTarget.dataset.action;

    if (action === 'save-all-pending-attendance') {
        handleSaveAllPendingAttendance();
    }
}

export { initAbsensiPage };
