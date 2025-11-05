import { toast } from '../ui/components/toast.js';

function markInvalid(field, message) {
    const group = field.closest('.form-group, .multi-item-main-line');
    if (!group) return;

    const visualElement = field.type === 'hidden'
        ? field.closest('.custom-select-wrapper')?.querySelector('.custom-select-trigger')
        : field;

    const elementToMark = visualElement || field;
    elementToMark.classList.add('is-invalid');

    let errorEl = group.querySelector('.input-error-text');
    if (!errorEl) {
        errorEl = document.createElement('div');
        errorEl.className = 'input-error-text';
        const fieldWrapper = field.closest('.custom-select-wrapper, .master-data-select');
        const insertTarget = fieldWrapper || field;

        insertTarget.insertAdjacentElement('afterend', errorEl);

    }
    errorEl.textContent = message;
}

function clearInvalid(field) {
    const group = field.closest('.form-group, .multi-item-main-line');
    if (!group) return;

    const visualElement = field.type === 'hidden'
        ? field.closest('.custom-select-wrapper')?.querySelector('.custom-select-trigger')
        : field;

    const elementToClear = visualElement || field;
    elementToClear.classList.remove('is-invalid');

    const errorEl = group.querySelector('.input-error-text');
    if (errorEl) errorEl.remove();
}

export function validateForm(form) {
    let isValid = true;
    let firstInvalidField = null;


    form.querySelectorAll('[required]').forEach(field => {
        clearInvalid(field);


        if (field.offsetParent === null && field.type !== 'hidden') return;

        let value = field.value;
        if (field.type === 'checkbox') {
            if (!field.checked) {
                isValid = false;

                markInvalid(field, 'Opsi ini harus dipilih.');
                if (!firstInvalidField) firstInvalidField = field;
            } else {
                clearInvalid(field);
            }
        } else {
            if (!value || !value.trim()) {
                isValid = false;

                markInvalid(field, 'Isian ini wajib diisi.');
                if (!firstInvalidField) firstInvalidField = field;
            } else {
                clearInvalid(field);
            }
        }
    });

    if (!isValid && firstInvalidField) {

        const isCustomSelect = firstInvalidField.type === 'hidden' && firstInvalidField.closest('.custom-select-wrapper');
        const fieldToFocus = isCustomSelect
            ? firstInvalidField.closest('.custom-select-wrapper').querySelector('.custom-select-trigger')
            : firstInvalidField;

        fieldToFocus?.focus();

        const formGroup = fieldToFocus?.closest('.form-group, .multi-item-row');
        formGroup?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        toast('error', 'Harap lengkapi semua field yang wajib diisi.');
    }


    return isValid;
}


export function attachClientValidation(form) {
    if (!form) return;
    form.setAttribute('novalidate', 'true');

    form.addEventListener('input', (e) => {
        const field = e.target;
        if (!field.hasAttribute('required')) return;

        if (field.type === 'checkbox') {
            if (field.checked) clearInvalid(field);
        } else {
             if (field.value.trim()) clearInvalid(field);
        }
    }, { passive: true });

    form.addEventListener('change', (e) => {
        const field = e.target;
        if (!field.hasAttribute('required')) return;

        if (field.type === 'hidden' && field.closest('.custom-select-wrapper')) {
            if (field.value.trim()) clearInvalid(field);
        } else if (field.value.trim()) {
             clearInvalid(field);
        }
    }, { passive: true });
}
