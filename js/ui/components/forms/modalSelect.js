import { createModal, closeModalImmediate } from "../modal.js";

const modalSelectRegistry = new Map();

function createIcon(iconName, size = 18, classes = '') {
    const icons = {
        'chevron-down': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-down ${classes}"><path d="m6 9 6 6 6-6"/></svg>`,
        check: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check ${classes}"><path d="M20 6 9 17l-5-5"/></svg>`
    };
    return icons[iconName] || '';
}

function getOptions(id, fallback = []) {
    return modalSelectRegistry.get(id) || fallback;
}

function setOptions(id, options = []) {
    modalSelectRegistry.set(id, Array.isArray(options) ? options : []);
}

export function createModalSelectField({ id, label = '', options = [], value = '', placeholder = 'Pilih opsi' } = {}) {
    if (!id) throw new Error('modal select membutuhkan id unik');
    setOptions(id, options);
    const safeOptions = getOptions(id);
    const selectedOption = safeOptions.find(opt => opt.value === value);
    const displayText = selectedOption ? selectedOption.label : placeholder;

    return `
        <div class="modal-select-field" data-modal-select="${id}">
            ${label ? `<label for="${id}">${label}</label>` : ''}
            <button type="button" class="modal-select-trigger" data-modal-select-trigger="${id}" data-modal-select-placeholder="${placeholder}">
                <span class="modal-select-value">${displayText}</span>
                ${createIcon('chevron-down', 18)}
            </button>
            <input type="hidden" id="${id}" value="${selectedOption ? selectedOption.value : ''}">
        </div>
    `;
}

function updateSelectValue(id, newValue) {
    const input = document.getElementById(id);
    const trigger = document.querySelector(`[data-modal-select-trigger="${id}"]`);
    const options = getOptions(id);
    if (!input || !trigger) return;
    const selectedOption = options.find(opt => opt.value === newValue);
    const nextValue = selectedOption ? selectedOption.value : '';
    if (input.value !== nextValue) {
        input.value = nextValue;
        input.dispatchEvent(new Event('change', { bubbles: true }));
    }
    const display = trigger.querySelector('.modal-select-value');
    if (display) {
        display.textContent = selectedOption ? selectedOption.label : (trigger.dataset.modalSelectPlaceholder || 'Pilih opsi');
    }
}

function openModalSelect(trigger) {
    const id = trigger.dataset.modalSelectTrigger;
    const input = document.getElementById(id);
    if (!id || !input) return;

    const label = trigger.closest('.modal-select-field')?.querySelector('label')?.textContent?.trim() || 'Pilih Opsi';
    const options = getOptions(id);
    const currentValue = input.value;
    if (!Array.isArray(options) || options.length === 0) return;

    const optionsHTML = options.map(opt => `
        <button type="button" class="modal-select-option ${opt.value === currentValue ? 'is-active' : ''}" data-value="${opt.value}">
            <span>${opt.label}</span>
            ${opt.value === currentValue ? createIcon('check', 18) : ''}
        </button>
    `).join('');

    const modal = createModal('formView', {
        title: label,
        content: `<div class="modal-select-option-list">${optionsHTML}</div>`,
        isUtility: true,
        allowContentOverflow: true
    });
    if (!modal) return;

    modal.querySelector('.modal-select-option-list')?.addEventListener('click', (e) => {
        const button = e.target.closest('.modal-select-option');
        if (!button) return;
        const nextValue = button.dataset.value;
        updateSelectValue(id, nextValue);
        closeModalImmediate(modal);
    });
}

export function initModalSelects(context = document) {
    const triggers = context.querySelectorAll('[data-modal-select-trigger]');
    triggers.forEach(trigger => {
        if (trigger.dataset.modalSelectInit === '1') return;
        trigger.dataset.modalSelectInit = '1';
        trigger.addEventListener('click', () => openModalSelect(trigger));
    });
}
