function stripHtml(value = '') {
    if (value === null || value === undefined) return '';
    if (typeof value !== 'string') return String(value);
    return value.replace(/<[^>]*>/g, '').trim();
}

export function renderMobileBreadcrumbTitle(container, mainText = '', subtitleText = null, classes = {}) {
    if (!container) return;
    const { title: titleClass = 'detail-title', subtitle: subtitleClass = 'detail-subtitle' } = classes;
    const titleWrap = document.createElement('div');
    titleWrap.className = 'title-wrap';
    const titleEl = document.createElement('strong');
    titleEl.className = titleClass;
    titleEl.textContent = stripHtml(mainText);
    titleWrap.appendChild(titleEl);
    if (subtitleText) {
        const subtitleEl = document.createElement('span');
        subtitleEl.className = subtitleClass;
        subtitleEl.textContent = stripHtml(subtitleText);
        titleWrap.appendChild(subtitleEl);
    }
    container.innerHTML = '';
    container.appendChild(titleWrap);
}
