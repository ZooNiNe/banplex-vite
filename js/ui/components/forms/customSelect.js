import { isViewer } from "../../../utils/helpers.js";
// [BARU] Impor appState untuk mengakses data master terbaru
import { appState } from "../../../state/appState.js";


function createIcon(iconName, size = 18, classes = '') {
    // ... (kode ikon yang ada)
    const icons = {
        arrow_drop_down: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-down ${classes}"><path d="m6 9 6 6 6-6"/></svg>`,
        database: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-database ${classes}"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/></svg>`,
    };
    return icons[iconName] || '';
}

export function createMasterDataSelect(id, label, options, selectedValue = '', masterType = null, required = false) {
    // ... (kode createMasterDataSelect yang ada)
    const validOptions = Array.isArray(options) ? options : [];
    const safeSelectedValue = selectedValue || '';
    const selectedOption = validOptions.find(opt => opt.value === safeSelectedValue);
    const selectedText = selectedOption ? selectedOption.text : 'Pilih...';
    const finalSelectedValue = selectedOption ? safeSelectedValue : '';
    const showMasterButton = masterType && !isViewer();
    const requiredAttr = required ? 'required' : '';
    const masterButtonHTML = showMasterButton ? `<button type="button" class="btn-icon master-data-trigger" data-action="manage-master" data-type="${masterType}">${createIcon('database')}</button>` : '';

    return `
        <div class="form-group">
            <label>${label}</label>
            <div class="master-data-select">
                <div class="custom-select-wrapper" data-master-type="${masterType || ''}">
                    <input type="hidden" id="${id}" name="${id}" value="${finalSelectedValue}" ${requiredAttr}>
                    <button type="button" class="custom-select-trigger" ${isViewer() ? 'disabled' : ''}>
                        <span>${selectedText}</span>
                        ${createIcon('arrow_drop_down')}
                    </button>
                    <div class="custom-select-options">
                        <div class="custom-select-search-wrapper"><input type="search" class="custom-select-search" placeholder="Cari..." autocomplete="off"></div>
                        <div class="custom-select-options-list">
                        ${validOptions.map(opt => `<div class="custom-select-option ${opt.value === finalSelectedValue ? 'selected' : ''}" data-value="${opt.value}" ${opt.disabled ? 'disabled' : ''}>${opt.text}</div>`).join('')}
                        </div>
                    </div>
                </div>
                ${masterButtonHTML}
            </div>
        </div>`;
}

let isGlobalClickListenerAttached = false;

export function initCustomSelects(context = document) {
    // ... (kode initCustomSelects yang ada)
    const wrappers = context.querySelectorAll('.custom-select-wrapper:not([data-custom-select-init])');


    const closeAllSelects = (exceptThisOne = null) => {
        document.querySelectorAll('.custom-select-wrapper.active').forEach(wrapper => {
            if (wrapper !== exceptThisOne) {
                wrapper.classList.remove('active');
            }
        });
    };


    if (!isGlobalClickListenerAttached) {
        document.addEventListener('click', (e) => {
            const clickedInsideActiveSelect = e.target.closest('.custom-select-wrapper.active');
            if (!clickedInsideActiveSelect) {
                closeAllSelects();
            }
        });
        isGlobalClickListenerAttached = true;
    }

    wrappers.forEach((wrapper, index) => {
        wrapper.dataset.customSelectInit = 'true';
        const trigger = wrapper.querySelector('.custom-select-trigger');
        const hiddenInput = wrapper.querySelector('input[type="hidden"]');
        const triggerSpan = trigger?.querySelector('span:first-child');
        const optionsContainer = wrapper.querySelector('.custom-select-options');
        const optionsList = wrapper.querySelector('.custom-select-options-list');
        const searchInput = wrapper.querySelector('.custom-select-search');

        if (!trigger || !hiddenInput || !triggerSpan || !optionsContainer || !optionsList) {

             return;
        }


        trigger.removeEventListener('click', trigger._clickHandler);
        trigger._clickHandler = (e) => {
            e.preventDefault();
            e.stopPropagation();

            if (trigger.disabled) return;
            const isActive = wrapper.classList.contains('active');

            closeAllSelects(isActive ? null : wrapper);
            wrapper.classList.toggle('active', !isActive);


            if (!isActive) {
                if (searchInput) {
                    searchInput.value = '';
                    optionsList.querySelectorAll('.custom-select-option').forEach(opt => opt.style.display = '');
                     setTimeout(() => searchInput.focus(), 50);
                }
                if (optionsContainer) optionsContainer.scrollTop = 0;

                const selectedOption = optionsList.querySelector('.custom-select-option.selected');
                if (selectedOption) {
                    selectedOption.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                }
            }
        };
        trigger.addEventListener('click', trigger._clickHandler);


        const applySelection = (option) => {
            const oldValue = hiddenInput.value;
            const newValue = option.dataset.value;
            if (oldValue !== newValue) {
                hiddenInput.value = newValue;
                triggerSpan.textContent = option.textContent.trim();
                hiddenInput.dispatchEvent(new Event('change', { bubbles: true }));
                import('../modal.js').then(({ markFormDirty }) => markFormDirty(true));
            }
            optionsList.querySelector('.selected')?.classList.remove('selected');
            option.classList.add('selected');
            closeAllSelects();
        };

        optionsList.removeEventListener('click', optionsList._clickHandler);
        optionsList._clickHandler = (e) => {
            const option = e.target.closest('.custom-select-option:not([disabled])');
            if (option) applySelection(option);
        };
        optionsList.addEventListener('click', optionsList._clickHandler);

        optionsList.removeEventListener('pointerdown', optionsList._pointerHandler);
        optionsList._pointerHandler = (e) => {
            const option = e.target.closest('.custom-select-option:not([disabled])');
            if (!option) return;
            e.preventDefault();
            e.stopPropagation();
            applySelection(option);
        };
        optionsList.addEventListener('pointerdown', optionsList._pointerHandler, { passive: false });

        if (searchInput) {

            searchInput.removeEventListener('input', searchInput._inputHandler);
             searchInput._inputHandler = () => {
                const searchTerm = searchInput.value.toLowerCase();
                optionsList.querySelectorAll('.custom-select-option').forEach(optionNode => {
                    const text = optionNode.textContent.toLowerCase();
                    optionNode.style.display = text.includes(searchTerm) ? '' : 'none';
                });
            };
            searchInput.addEventListener('input', searchInput._inputHandler);

             searchInput.removeEventListener('click', searchInput._clickHandler);
             searchInput._clickHandler = e => e.stopPropagation();
             searchInput.addEventListener('click', searchInput._clickHandler);
        }

    });
}

/**
 * [FUNGSI BARU]
 * Memperbarui opsi di dropdown kustom yang sudah ada tanpa me-render ulang.
 * Dipanggil setelah master data (mis. material baru) ditambahkan.
 * @param {HTMLElement} containerElement - Elemen form (atau wrapper) yang berisi dropdown.
 * @param {string} masterType - Kunci master data yang diperbarui (mis. 'materials', 'suppliers').
 */
export function updateCustomSelectOptions(containerElement, masterType) {
    // Konfigurasi untuk memetakan masterType ke data di appState
    const config = {
        'projects': { stateKey: 'projects', nameField: 'projectName' },
        'suppliers': { stateKey: 'suppliers', nameField: 'supplierName' },
        'workers': { stateKey: 'workers', nameField: 'workerName' },
        'professions': { stateKey: 'professions', nameField: 'professionName' },
        'materials': { stateKey: 'materials', nameField: 'materialName' },
        'op-cats': { stateKey: 'operationalCategories', nameField: 'categoryName' },
        'other-cats': { stateKey: 'otherCategories', nameField: 'categoryName' },
        'creditors': { stateKey: 'fundingCreditors', nameField: 'creditorName' }
    };

    const typeConfig = config[masterType];
    if (!typeConfig) {
        console.warn(`[updateCustomSelect] Tipe master tidak dikenal: ${masterType}`);
        return;
    }

    // Ambil data terbaru dari appState
    const getSafeOptions = (data, valueField, textField) => {
        return (Array.isArray(data) ? data : [])
            .filter(i => !i.isDeleted)
            .map(i => ({ value: i[valueField], text: i[textField] }));
    };
    
    // Dapatkan opsi-opsi baru
    const options = getSafeOptions(appState[typeConfig.stateKey], 'id', typeConfig.nameField);
    
    // Temukan semua dropdown yang relevan di dalam container (form)
    const wrappers = containerElement.querySelectorAll(`.custom-select-wrapper[data-master-type="${masterType}"]`);
    
    console.log(`[updateCustomSelect] Menemukan ${wrappers.length} dropdown untuk tipe '${masterType}'`);

    wrappers.forEach(wrapper => {
        const list = wrapper.querySelector('.custom-select-options-list');
        const hiddenInput = wrapper.querySelector('input[type="hidden"]');
        const triggerSpan = wrapper.querySelector('.custom-select-trigger span');
        const currentVal = hiddenInput ? hiddenInput.value : null;

        if (list) {
            // Bangun ulang daftar opsi HTML
            list.innerHTML = options.map(opt => 
                `<div class="custom-select-option ${opt.value === currentVal ? 'selected' : ''}" data-value="${opt.value}" ${opt.disabled ? 'disabled' : ''}>${opt.text}</div>`
            ).join('');
        }

        // Cek apakah item yang sedang dipilih masih ada atau perlu diperbarui
        if (currentVal) {
            const selectedOpt = options.find(opt => opt.value === currentVal);
            if (selectedOpt) {
                // Item masih ada, pastikan teks-nya update
                if (triggerSpan && triggerSpan.textContent !== selectedOpt.text) {
                    triggerSpan.textContent = selectedOpt.text;
                }
            } else {
                // Item yang dipilih sudah tidak ada (mungkin terhapus?), reset
                if (hiddenInput) hiddenInput.value = '';
                if (triggerSpan) triggerSpan.textContent = 'Pilih...';
            }
        }
    });
}