import { emit } from '../state/eventBus.js';
import { appState } from '../state/appState.js';

let uiStack = [];
let isInternalBack = false;

function push(type, id) {
    if (!type || !id) return;

    const state = { type, id };
    
    uiStack.push(state);
    
    try {
        window.history.pushState(state, '', window.location.href);
    } catch (e) {
        console.error('Gagal pushState:', e);
    }
}

function handlePopState(event) {
    if (isInternalBack) {
        isInternalBack = false;
        return;
    }

    const state = event.state;
    const lastState = uiStack.pop();

    if (!lastState) {
        return;
    }

    switch (lastState.type) {
        case 'MODAL':
            emit('modal.closeById', lastState.id);
            break;
        case 'PANEL':
            emit('panel.close', lastState.id);
            break;
        case 'PAGE':
            const previousPageId = state ? state.id : (appState.defaultPage || 'dashboard');
            emit('router.navigateToPage', { page: previousPageId, push: false });
            break;
        default:
            console.warn('Tipe state tidak dikenal:', lastState.type);
    }
}

function init() {
    window.addEventListener('popstate', handlePopState);

    const initialPage = appState.activePage || 'dashboard';
    uiStack = [{ type: 'PAGE', id: initialPage }];
    try {
        window.history.replaceState({ type: 'PAGE', id: initialPage }, '', window.location.href);
    } catch(e) {
        console.error('Gagal replaceState awal:', e);
    }
}

function goBack() {
    isInternalBack = true;
    window.history.back();
}

export const navigationHistory = {
    init,
    push,
    goBack,
};