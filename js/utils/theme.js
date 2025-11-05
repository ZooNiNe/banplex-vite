function _applyTheme(theme) {
    const root = document.documentElement;
    root.classList.add('theme-animating');
    root.classList.toggle('dark-theme', theme === 'dark');
    localStorage.setItem('banplex_theme', theme);
    setTimeout(() => root.classList.remove('theme-animating'), 300);
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

export { _applyTheme, toggleTheme };
