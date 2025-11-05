import { $ } from '../../utils/dom.js';

export function initResizeHandle() {
    const resizer = $('.resizer');
    if (!resizer) return;

    let isResizing = false;

    const onMouseMove = (e) => {
        if (!isResizing) return;
        const listPaneWidth = e.clientX - resizer.offsetWidth / 2;
        document.documentElement.style.setProperty('--list-pane-width', `${listPaneWidth}px`);
    };

    const onMouseUp = () => {
        isResizing = false;
        document.body.classList.remove('is-resizing');
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
    };

    const onMouseDown = (e) => {
        e.preventDefault();
        isResizing = true;
        document.body.classList.add('is-resizing');
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    };

    resizer.addEventListener('mousedown', onMouseDown);
}
