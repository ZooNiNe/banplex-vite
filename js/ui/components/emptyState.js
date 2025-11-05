import { $ } from '../../utils/dom.js';

function createIcon(iconName, size = 48, classes = '') { // Default size 48 for empty states
    const icons = {
        info: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-info ${classes}"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>`,
        engineering: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-hard-hat-icon lucide-hard-hat"><path d="M10 10V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5"/><path d="M14 6a6 6 0 0 1 6 6v3"/><path d="M4 15v-3a6 6 0 0 1 6-6"/><rect x="2" y="15" width="20" height="4" rx="1"/></svg>`,
        receipt_long: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-receipt-text ${classes}"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1Z"/><path d="M14 8H8"/><path d="M16 12H8"/><path d="M13 16H8"/></svg>`,
        history: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-history ${classes}"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/></svg>`,
        account_balance_wallet: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-wallet ${classes}"><path d="M21 12V7H5a2 2 0 0 1 0-4h14a2 2 0 0 1 2 2v4Z"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2Z"/></svg>`,
        inventory_2: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-archive ${classes}"><rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/></svg>`,
        event_note: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-calendar-days ${classes}"><path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/><path d="M8 14h.01"/><path d="M12 14h.01"/><path d="M16 14h.01"/><path d="M8 18h.01"/><path d="M12 18h.01"/><path d="M16 18h.01"/></svg>`, // Using CalendarDays
        request_quote: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-file-text ${classes}"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/><line x1="10" x2="8" y1="9" y2="9"/></svg>`, // Using FileText
        database: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-database ${classes}"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/></svg>`,
        recycling: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-recycle ${classes}"><path d="M7 19H4.815a1.83 1.83 0 0 1-1.57-.881 1.785 1.785 0 0 1-.004-1.784L7.196 9.5"/><path d="m11 19 3.143-3.143a3 3 0 0 0 .88-2.121V6.5"/><path d="m11 6.5 4.414-4.414A1.999 1.999 0 0 1 17.586 1H20"/><path d="M11 6.5a6 6 0 0 0-4.47 1.78L3.24 11.5"/><path d="M15.47 14.22 17 10.5h3l-1.6 2.77a3 3 0 0 1-4.39 1.25L13 14"/><path d="m17 10.5 4.815a1.83 1.83 0 0 1 1.57.881 1.785 1.785 0 0 1 .004 1.784L19.4 18"/></svg>`,
        error: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-alert-triangle ${classes}"><path d="m21.73 18-8-14a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`, // Using AlertTriangle
        chat: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-messages-square-icon lucide-messages-square"><path d="M16 10a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 14.286V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/><path d="M20 9a2 2 0 0 1 2 2v10.286a.71.71 0 0 1-1.212.502l-2.202-2.202A2 2 0 0 0 17.172 19H10a2 2 0 0 1-2-2v-1"/></svg>`,
        search: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-search ${classes}"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>`,
        search_off: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-search-x ${classes}"><path d="m13.5 8.5-5 5"/><path d="m8.5 8.5 5 5"/><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>`, // Using SearchX
        check_circle: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check-circle-2 ${classes}"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="m9 12 2 2 4-4"/></svg>`,
        lock: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-lock ${classes}"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,
        group_off: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-users-round ${classes}"><path d="M18 21a8 8 0 0 0-16 0"/><circle cx="10" cy="8" r="4"/><path d="M22 20c0-3.37-2-6.5-4-8a5 5 0 0 0-.45-8.3"/></svg>`, // Using UsersRound as substitute
        dashboard: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-layout-dashboard ${classes}"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>`,
    };
    return icons[iconName] || icons['info'] || '';
}


export const renderEmptyState = (containerId, title, description, icon = 'info', isSmall = false) => {
    const container = $(`#${containerId}`);
    if (!container) return;
    container.innerHTML = getEmptyStateHTML({ title, desc: description, icon, isSmall });
};

export const getEmptyStateHTML = ({ icon = 'info', title, desc, isSmall = false, illustration, imageUrl }) => {
    const sizeModifier = isSmall ? 'empty-state--small' : '';
    const iconSize = isSmall ? 32 : 48;

    const illustrations = {
        friendly: `<svg xmlns="http://www.w3.org/2000/svg" width="220" height="140" viewBox="0 0 220 140" fill="none"><rect x="10" y="60" width="200" height="60" rx="12" fill="#e2e8f0"/><circle cx="70" cy="90" r="12" fill="#94a3b8"/><circle cx="110" cy="90" r="12" fill="#94a3b8"/><circle cx="150" cy="90" r="12" fill="#94a3b8"/><rect x="40" y="20" width="140" height="50" rx="10" fill="#cbd5e1"/><circle cx="90" cy="45" r="6" fill="#334155"/><circle cx="130" cy="45" r="6" fill="#334155"/><rect x="75" y="58" width="70" height="6" rx="3" fill="#334155" opacity=".25"/></svg>`,
        lost: `<svg xmlns="http://www.w3.org/2000/svg" width="220" height="140" viewBox="0 0 220 140" fill="none"><path d="M10 120c30-20 60-20 100 0s70 20 100 0" stroke="#e2e8f0" stroke-width="8" stroke-linecap="round"/><circle cx="110" cy="60" r="28" fill="#cbd5e1"/><circle cx="100" cy="55" r="5" fill="#334155"/><circle cx="120" cy="55" r="5" fill="#334155"/><path d="M96 70c8 6 20 6 28 0" stroke="#334155" stroke-width="4" stroke-linecap="round"/></svg>`,
        empty: `<svg xmlns="http://www.w3.org/2000/svg" width="220" height="140" viewBox="0 0 220 140" fill="none"><rect x="40" y="30" width="140" height="80" rx="10" fill="#e2e8f0"/><rect x="55" y="45" width="110" height="15" rx="6" fill="#cbd5e1"/><rect x="55" y="70" width="70" height="15" rx="6" fill="#cbd5e1"/></svg>`
    };

    const resolvedIllustration = illustration || (icon === 'error' ? 'lost' : 'empty');
    const mediaHTML = imageUrl
        ? `<img class="empty-state__media" src="${imageUrl}" alt="" loading="lazy" decoding="async">`
        : (illustrations && illustrations[resolvedIllustration] ? `<div class="empty-state__media">${illustrations[resolvedIllustration]}</div>` : '');

    return `
        <div class="empty-state ${sizeModifier}">
            ${mediaHTML || `<div class="empty-state__icon">${createIcon(icon, iconSize)}</div>`}
            <h3 class="empty-state__title">${title}</h3>
            <p class="empty-state__description">${desc}</p>
        </div>
    `;
};

export function getEndOfListPlaceholderHTML() {
    return `
        <div class="end-of-list-placeholder">
            <div class="eol-icon-wrapper">
                ${createIcon('check_circle', 28)}
            </div>
            <span class="eol-text">Anda Sudah di Akhir Daftar</span>
            <span class="eol-subtext">Semua data telah berhasil dimuat.</span>
        </div>
    `;
}
