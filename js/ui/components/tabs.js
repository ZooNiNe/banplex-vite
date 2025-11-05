export function createTabsHTML({ id, tabs = [], activeTab = '', customClasses = '' }) {
    const getGridClass = (count) => {
        if (count === 2) return 'two-tabs';
        if (count === 3) return 'three-tabs';
        return '';
    };

    const gridClass = getGridClass(tabs.length);
    const hasUnderline = customClasses.includes('tabs-underline');

    return `
        <div id="${id}" class="sub-nav ${gridClass} ${customClasses}">
            ${tabs.map(tab => `
                <button class="sub-nav-item ${tab.id === activeTab ? 'active' : ''}" data-tab="${tab.id}">
                    ${tab.label}
                </button>
            `).join('')}
            ${hasUnderline ? '<div class="active-tab-indicator"></div>' : ''}
        </div>
    `;
}

