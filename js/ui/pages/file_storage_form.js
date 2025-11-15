/*
 * File: js/ui/pages/file_storage_form.js
 * REVISI: Menggunakan helper isValidNikKk baru untuk validasi.
 */

import { $ } from '../../utils/dom.js';
import { createPageToolbarHTML } from '../components/toolbar.js';
import { addBeneficiary, batchImportBeneficiaries, updateBeneficiary } from '../../services/data/adminService.js';
import { toast } from '../components/toast.js';
import { validateForm, attachClientValidation } from '../../utils/validation.js';
import { emit, on, off } from '../../state/eventBus.js';
import { handleNavigation } from '../mainUI.js';
import { resetFormDirty, startGlobalLoading } from '../components/modal.js';
import { createMasterDataSelect } from '../components/forms/index.js';
import { appState } from '../../state/appState.js';
// PERUBAHAN: Mengganti isValidNik menjadi isValidNikKk
import { isValidNikKk, sanitizeDigits, normalizeDistanceToMeters } from '../../utils/helpers.js';
import * as XLSX from 'xlsx';
import { FIELD_KEYS } from './fileStorageFieldMap.js';

let unloadHandler = null;
let cleanupFns = [];
let isSubmitting = false;
let activeForm = null;
let isBulkUploading = false;
let editingRecord = null;

const GENDER_OPTIONS = [
    { value: 'Laki-Laki', text: 'Laki-Laki' },
    { value: 'Perempuan', text: 'Perempuan' },
];

const JENJANG_OPTIONS = [
    'BALITA',
    'SD/MI',
    'SMP/MTS',
    'SMA/SMK/MA',
    'TK/PAUD',
    'DTA/RA/SEKOLAH KEAGAMAAN',
    'IBU HAMIL',
    'IBU MENYUSUI',
].map(label => ({ value: label, text: label }));

const DATA_STATUS_OPTIONS = [
    'Valid',
    'Invalid',
    'Residue',
    'Requires verification',
].map(label => ({ value: label, text: label }));

const STATUS_LOOKUP = new Map(
    DATA_STATUS_OPTIONS.map(({ value }) => [value.toLowerCase(), value])
);
STATUS_LOOKUP.set('requires_verification', 'Requires verification');
STATUS_LOOKUP.set('requiresverification', 'Requires verification');
STATUS_LOOKUP.set('residu', 'Residue');
STATUS_LOOKUP.set('residue', 'Residue');

function initFileStorageFormPage() {
    editingRecord = appState.fileStorage?.editingRecord || null;
    renderFormShell();
    attachFormListeners();
    if (editingRecord) {
        hydrateFormWithRecord(editingRecord);
    }
    registerUnloadHandler();
}

function renderFormShell() {
    const container = $('.page-container');
    if (!container) return;
    const isEditMode = Boolean(editingRecord?.id);
    const panelTitle = isEditMode ? 'Edit Data File Storage' : 'Input File Storage';
    const submitLabel = isEditMode ? 'Perbarui Data' : 'Simpan Data';

    const jenjangSelectHTML = createMasterDataSelect(
        'jenjang',
        'Jenjang *',
        JENJANG_OPTIONS,
        '',
        null,
        true,
        false
    );

    const statusSelectHTML = createMasterDataSelect(
        'dataStatus',
        'Status Data *',
        DATA_STATUS_OPTIONS,
        DATA_STATUS_OPTIONS[0].value,
        null,
        true,
        false
    );

    container.innerHTML = `
        <div class="content-panel file-storage-panel">
            <div class="panel-header">
                ${createPageToolbarHTML({ title: panelTitle })}
            </div>
            <div class="panel-content scrollable-content has-padding">
                <form id="file-storage-form" class="form-card accent-blue" autocomplete="off">
                    <input type="file" id="file-storage-bulk-input" accept=".csv,.xlsx,.xls" hidden>
                    <div class="form-row">
                        <div class="form-group">
                            <label for="namaPenerima">Nama Penerima *</label>
                            <input type="text" id="namaPenerima" name="namaPenerima" required placeholder="Masukkan nama lengkap" data-proper-case="true">
                        </div>
                        <div class="form-group">
                            <label for="nik">NIK *</label>
                            <input type="text" id="nik" name="nik" required inputmode="numeric" maxlength="16" placeholder="16 digit NIK">
                        </div>
                    </div>

                    <div class="form-row">
                        ${createMasterDataSelect('jenisKelamin', 'Jenis Kelamin *', GENDER_OPTIONS, '', null, true, false)}
                        ${jenjangSelectHTML}
                    </div>

                    <div class="form-row">
                        <div class="form-group">
                            <label for="namaInstansi">Nama Instansi *</label>
                            <input type="text" id="namaInstansi" name="namaInstansi" required placeholder="Nama sekolah / instansi" data-proper-case="true">
                        </div>
                        <div class="form-group">
                            <label for="npsnNspp">NPSN / NSPP</label>
                            <input type="text" id="npsnNspp" name="npsnNspp" placeholder="Masukkan kode NPSN atau NSPP">
                        </div>
                    </div>

                    <div class="form-row">
                        <div class="form-group">
                            <label for="tempatLahir">Tempat Lahir *</label>
                            <input type="text" id="tempatLahir" name="tempatLahir" required data-proper-case="true" placeholder="Nama kota / kabupaten">
                        </div>
                        <div class="form-group">
                            <label for="tanggalLahir">Tanggal Lahir *</label>
                            <input type="date" id="tanggalLahir" name="tanggalLahir" required>
                        </div>
                    </div>

                    <div class="form-row">
                        ${statusSelectHTML}
                        <div class="form-group">
                            <label for="jarak">Jarak (Meter)</label>
                            <input type="text" id="jarak" name="jarak" placeholder="Contoh: 5000">
                        </div>
                    </div>

                    <div class="form-row">
                        <div class="form-group">
                            <label for="district">Kabupaten / Kota *</label>
                            <input type="text" id="district" name="district" required data-proper-case="true" placeholder="Contoh: Kabupaten Bandung">
                        </div>
                        <div class="form-group">
                            <label for="subDistrict">Kecamatan *</label>
                            <input type="text" id="subDistrict" name="subDistrict" required data-proper-case="true" placeholder="Contoh: Cileunyi">
                        </div>
                    </div>

                    <div class="form-row">
                        <div class="form-group">
                            <label for="village">Kelurahan / Desa *</label>
                            <input type="text" id="village" name="village" required data-proper-case="true" placeholder="Contoh: Cibiru">
                        </div>
                        <div class="form-group">
                            <label for="hamlet">Dusun / Kampung</label>
                            <input type="text" id="hamlet" name="hamlet" data-proper-case="true" placeholder="Opsional">
                        </div>
                    </div>

                    <div class="form-row">
                        <div class="form-group">
                            <label for="rt">RT</label>
                            <input type="text" id="rt" name="rt" inputmode="numeric" pattern="\\d*" maxlength="3" placeholder="001">
                        </div>
                        <div class="form-group">
                            <label for="rw">RW</label>
                            <input type="text" id="rw" name="rw" inputmode="numeric" pattern="\\d*" maxlength="3" placeholder="001">
                        </div>
                    </div>

                    <div class="form-group">
                        <label for="alamatLengkap">Alamat Lengkap *</label>
                        <textarea id="alamatLengkap" name="alamatLengkap" rows="3" required placeholder="Contoh: Jl. Raya No. 12, Blok A, RT 001/RW 002"></textarea>
                    </div>

                    <div class="form-row">
                        <div class="form-group">
                            <label>&nbsp;</label>
                            <p class="helper-text">${isEditMode ? 'Perbarui data penerima sesuai kebutuhan, kemudian simpan perubahan.' : 'Pastikan data sesuai dengan templat Excel agar mudah direkonsiliasi.'}</p>
                        </div>
                    </div>

                    <div class="form-footer-actions form-footer-actions--balanced">
                        <button type="button" class="btn btn-secondary" data-action="navigate" data-nav="file_storage">Batalkan</button>
                        <button type="button" class="btn btn-ghost" id="file-storage-upload-btn">Unggah CSV/XLS</button>
                        <button type="submit" class="btn btn-primary" id="file-storage-submit-btn" data-span="full">${submitLabel}</button>
                    </div>
                </form>
            </div>
        </div>
    `;
}

function hydrateFormWithRecord(record) {
    if (!record) return;
    const form = $('#file-storage-form');
    if (!form) return;

    const basicFields = [
        ['namaPenerima', 'namaPenerima'],
        ['nik', 'nik'],
        ['namaInstansi', 'namaInstansi'],
        ['npsnNspp', 'npsnNspp'],
        ['tempatLahir', 'tempatLahir'],
        ['district', 'district'],
        ['subDistrict', 'subDistrict'],
        ['village', 'village'],
        ['hamlet', 'hamlet'],
        ['rt', 'rt'],
        ['rw', 'rw'],
        ['alamatLengkap', 'alamatLengkap'],
    ];

    const customSelectFields = ['jenisKelamin', 'jenjang', 'dataStatus'];

    const setFieldValue = (fieldId, rawValue) => {
        if (rawValue === '' || rawValue === null || rawValue === undefined) return;
        const field = form.querySelector(`#${fieldId}`);
        if (!field) return;
        let value = rawValue;
        if (fieldId === 'nik' || ['rt', 'rw', 'npsnNspp'].includes(fieldId)) {
            value = sanitizeDigits(value);
        }
        field.value = value;
    };

    basicFields.forEach(([fieldId, key]) => {
        const value = getRecordFieldValue(record, key);
        if (!value) return;
        setFieldValue(fieldId, value);
    });

    const birthDateValue = normalizeDateForInput(getRecordFieldValue(record, 'tanggalLahir'));
    if (birthDateValue) {
        setFieldValue('tanggalLahir', birthDateValue);
    }

    customSelectFields.forEach((fieldId) => {
        const targetValue = getRecordFieldValue(record, fieldId === 'dataStatus' ? 'dataStatus' : fieldId);
        if (!targetValue) return;
        setCustomSelectValue(form, fieldId, fieldId === 'dataStatus' ? normalizeStatus(targetValue) : targetValue);
    });

    const distanceValue = getRecordFieldValue(record, 'jarak');
    if (distanceValue) {
        const meters = normalizeDistanceToMeters(distanceValue, { allowZero: true });
        if (meters !== null) {
            setFieldValue('jarak', meters);
        } else {
            setFieldValue('jarak', distanceValue);
        }
    }

    emit('ui.form.markDirty', false);
}

function updateNikFieldValidationState(input, isRequired = false) {
    if (!input) return;
    const value = sanitizeDigits(input.value);
    const parentGroup = input.closest('.form-group');
    if (!parentGroup) return;

    if (value === '') {
        if (isRequired) {
            parentGroup.classList.add('is-invalid');
        } else {
            parentGroup.classList.remove('is-invalid');
        }
    } else {
        if (isValidNikKk(value)) {
            parentGroup.classList.remove('is-invalid');
        } else {
            parentGroup.classList.add('is-invalid');
        }
    }
}

function validateNikFieldOnSubmit(input, fieldName, isRequired = false) {
    if (!input) return false;
    const value = sanitizeDigits(input.value);

    if (isRequired && value === '') {
        toast('error', `${fieldName} wajib diisi.`);
        input.focus();
        return false;
    }
    
    if (value !== '' && !isValidNikKk(value)) {
        toast('error', `${fieldName} harus berisi 16 digit angka.`);
        input.focus();
        return false;
    }
    
    return true; // Valid
}

function attachFormListeners() {
    cleanupFns.forEach(fn => fn?.());
    cleanupFns = [];

    const form = $('#file-storage-form');
    activeForm = form;
    if (!form) return;

    attachClientValidation(form);
    emit('ui.forms.init', form);
    emit('ui.form.markDirty', false);

    const submitHandler = (event) => handleFormSubmit(event);
    form.addEventListener('submit', submitHandler);
    cleanupFns.push(() => form.removeEventListener('submit', submitHandler));

    const dirtyHandler = () => emit('ui.form.markDirty', true);
    form.addEventListener('input', dirtyHandler);
    form.addEventListener('change', dirtyHandler, { capture: true });
    cleanupFns.push(() => {
        form.removeEventListener('input', dirtyHandler);
        form.removeEventListener('change', dirtyHandler, true);
    });

    const nikInput = form.querySelector('#nik');
    if (nikInput) {
        const nikSanitizeAndValidate = () => {
            nikInput.value = sanitizeDigits(nikInput.value).slice(0, 16); // Sanitasi
            updateNikFieldValidationState(nikInput, true); // Validasi visual live
        };
        const nikBlurHandler = () => updateNikFieldValidationState(nikInput, true); // Validasi visual on blur

        nikInput.addEventListener('input', nikSanitizeAndValidate);
        nikInput.addEventListener('blur', nikBlurHandler);
        
        cleanupFns.push(() => {
            nikInput.removeEventListener('input', nikSanitizeAndValidate);
            nikInput.removeEventListener('blur', nikBlurHandler);
        });
    }

    const npsnInput = form.querySelector('#npsnNspp');
    if (npsnInput) {
        const npsnHandler = () => {
            npsnInput.value = sanitizeDigits(npsnInput.value).slice(0, 20);
        };
        npsnInput.addEventListener('input', npsnHandler);
        cleanupFns.push(() => npsnInput.removeEventListener('input', npsnHandler));
    }

    ['#rt', '#rw'].forEach(selector => {
        const input = form.querySelector(selector);
        if (!input) return;
        const handler = () => {
            input.value = sanitizeDigits(input.value).slice(0, 3);
        };
        input.addEventListener('input', handler);
        cleanupFns.push(() => input.removeEventListener('input', handler));
    });

    const uploadButton = $('#file-storage-upload-btn');
    const fileInput = $('#file-storage-bulk-input');
    if (uploadButton && fileInput) {
        const clickHandler = () => {
            if (isBulkUploading) return;
            fileInput.value = '';
            fileInput.click();
        };
        const changeHandler = (event) => {
            const file = event.target?.files?.[0];
            if (file) {
                handleBulkImportFile(file, fileInput);
            }
        };
        uploadButton.addEventListener('click', clickHandler);
        fileInput.addEventListener('change', changeHandler);
        cleanupFns.push(() => {
            uploadButton.removeEventListener('click', clickHandler);
            fileInput.removeEventListener('change', changeHandler);
        });
    }
}

async function handleFormSubmit(event) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    if (isSubmitting) return;
    if (!activeForm) return;
    if (!validateForm(activeForm)) return;

    const payload = buildPayload(activeForm);
    if (payload.jarak !== undefined) {
        const distanceMeters = normalizeDistanceToMeters(payload.jarak);
        if (distanceMeters === null) {
            toast('error', 'Masukkan jarak dalam meter, misalnya 5000 atau 5km.');
            return;
        }
        payload.jarak = distanceMeters;
    }
    const wasEditing = Boolean(editingRecord?.id);
    if (!payload.namaPenerima) {
        toast('error', 'Nama penerima wajib diisi.');
        return;
    }

    const nikInput = activeForm.querySelector('#nik');
    if (!validateNikFieldOnSubmit(nikInput, 'NIK', true)) {
        return;
    }
    
    if (payload.npsnNspp && !/^\d+$/.test(payload.npsnNspp)) {
        toast('error', 'NPSN / NSPP hanya boleh berisi angka.');
        return;
    }

    isSubmitting = true;
    setSubmittingState(true);

    try {
        if (wasEditing && editingRecord?.id) {
            await updateBeneficiary(editingRecord.id, payload);
            cacheUpdatedBeneficiary({ id: editingRecord.id, ...editingRecord, ...payload });
            toast('success', 'Data penerima berhasil diperbarui.');
        } else {
            const docId = await addBeneficiary(payload);
            cacheNewBeneficiary({ id: docId, ...payload });
            toast('success', 'Data penerima berhasil disimpan.');
        }
        resetFormDirty();
        emit('ui.form.markDirty', false);
        appState.fileStorage.editingRecord = null;
        editingRecord = null;
        emit('data.fileStorage.refresh');
        showPostSaveDialog({ wasEditing, recordName: payload.namaPenerima || 'Data' });
    } catch (error) {
        console.error('[FileStorageForm] Gagal menyimpan data:', error);
        toast('error', error?.message || 'Gagal menyimpan data. Coba lagi.');
    } finally {
        isSubmitting = false;
        setSubmittingState(false);
    }
}

function buildPayload(form) {
    const formData = new FormData(form);
    const entries = {
        namaPenerima: formData.get('namaPenerima'),
        nik: formData.get('nik'),
        jenisKelamin: formData.get('jenisKelamin'),
        jenjang: formData.get('jenjang'),
        namaInstansi: formData.get('namaInstansi'),
        npsnNspp: formData.get('npsnNspp'),
        jarak: formData.get('jarak'),
        dataStatus: formData.get('dataStatus'),
        tempatLahir: formData.get('tempatLahir'),
        tanggalLahir: formData.get('tanggalLahir'),
        district: formData.get('district'),
        subDistrict: formData.get('subDistrict'),
        village: formData.get('village'),
        hamlet: formData.get('hamlet'),
        rt: formData.get('rt'),
        rw: formData.get('rw'),
        alamatLengkap: formData.get('alamatLengkap'),
    };

    const payload = {};
    Object.entries(entries).forEach(([key, value]) => {
        const trimmed = getSafeString(value);
        if (trimmed) {
            if (key === 'nik') {
                payload[key] = sanitizeDigits(trimmed);
            } else if (key === 'dataStatus') {
                payload[key] = normalizeStatus(trimmed);
            } else if (['rt', 'rw'].includes(key)) {
                payload[key] = sanitizeDigits(trimmed);
            } else {
                payload[key] = trimmed;
            }
        }
    });
    return payload;
}

function setSubmittingState(loading) {
    const submitButton = $('#file-storage-submit-btn');
    if (!submitButton) return;
    submitButton.disabled = loading;
    const baseLabel = editingRecord?.id ? 'Perbarui Data' : 'Simpan Data';
    const loadingLabel = editingRecord?.id ? 'Memperbarui...' : 'Menyimpan...';
    submitButton.textContent = loading ? loadingLabel : baseLabel;
}

function registerUnloadHandler() {
    if (unloadHandler) return;
    unloadHandler = () => cleanupFileStorageFormPage();
    on('app.unload.file_storage_form', unloadHandler);
}

function cleanupFileStorageFormPage() {
    cleanupFns.forEach(fn => fn?.());
    cleanupFns = [];
    activeForm = null;
    editingRecord = null;
    if (appState.fileStorage) {
        appState.fileStorage.editingRecord = null;
    }
    if (unloadHandler) {
        off('app.unload.file_storage_form', unloadHandler);
        unloadHandler = null;
    }
    isSubmitting = false;
}

function getSafeString(value) {
    if (value === undefined || value === null) return '';
    return String(value).trim();
}

function normalizeStatus(value) {
    const normalized = getSafeString(value).toLowerCase();
    return STATUS_LOOKUP.get(normalized) || 'Valid';
}

function getRecordFieldValue(record, key) {
    if (!record) return '';
    const candidates = FIELD_KEYS[key] || [key];
    for (const candidate of candidates) {
        if (Object.prototype.hasOwnProperty.call(record, candidate)) {
            const value = record[candidate];
            if (value !== undefined && value !== null) {
                const stringValue = typeof value === 'string' ? value.trim() : value;
                if (stringValue !== '') {
                    return stringValue;
                }
            }
        }
    }
    return '';
}

function normalizeDateForInput(value) {
    if (!value) return '';
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
        const parsed = new Date(trimmed);
        if (!Number.isNaN(parsed.getTime())) {
            return parsed.toISOString().slice(0, 10);
        }
        return '';
    }
    if (typeof value === 'object') {
        if (typeof value.toDate === 'function') {
            return value.toDate().toISOString().slice(0, 10);
        }
        if (value.seconds) {
            return new Date(value.seconds * 1000).toISOString().slice(0, 10);
        }
    }
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
        return parsed.toISOString().slice(0, 10);
    }
    return '';
}

function setCustomSelectValue(form, fieldId, rawValue) {
    if (!form) return;
    const hiddenInput = form.querySelector(`#${fieldId}`);
    if (!hiddenInput) return;
    const wrapper = hiddenInput.closest('.custom-select-wrapper');
    const options = wrapper?.querySelectorAll('.custom-select-option');
    if (!wrapper || !options?.length) {
        hiddenInput.value = rawValue;
        return;
    }

    let matchedOption = null;
    options.forEach(optionNode => {
        const optionValue = optionNode.dataset.value || '';
        if (!matchedOption && optionValue.toLowerCase() === rawValue.toString().toLowerCase()) {
            matchedOption = optionNode;
        }
    });

    if (!matchedOption) {
        hiddenInput.value = '';
        return;
    }

    hiddenInput.value = matchedOption.dataset.value;
    const triggerSpan = wrapper.querySelector('.custom-select-trigger span');
    if (triggerSpan) {
        triggerSpan.textContent = matchedOption.textContent.trim();
    }
    options.forEach(optionNode => {
        optionNode.classList.toggle('selected', optionNode === matchedOption);
    });
}

async function handleBulkImportFile(file, fileInput) {
    if (isBulkUploading) return;
    isBulkUploading = true;
    setBulkImportState(true);
    const loader = startGlobalLoading(`Memproses ${file.name}...`);
    try {
        const records = await parseBeneficiarySpreadsheet(file);
        if (records.length === 0) {
            toast('info', 'Tidak ada data valid pada file yang diunggah.');
            return;
        }
        await batchImportBeneficiaries(records);
        toast('success', `${records.length} data penerima berhasil diunggah.`);
        emit('data.fileStorage.refresh');
        handleNavigation('file_storage');
    } catch (error) {
        console.error('[FileStorageForm] Bulk import gagal:', error);
        toast('error', error?.message || 'Gagal mengunggah file. Pastikan format sudah sesuai.');
    } finally {
        loader.close();
        isBulkUploading = false;
        setBulkImportState(false);
        if (fileInput) fileInput.value = '';
    }
}

async function parseBeneficiarySpreadsheet(file) {
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    const sheetName = workbook.SheetNames?.[0];
    if (!sheetName) return [];
    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

    const aliases = {
        namaPenerima: ['nama penerima', 'nama', 'nama_penerima'],
        nik: ['nik'],
        jenisKelamin: ['jenis kelamin', 'gender', 'jenis_kelamin'],
        jenjang: ['jenjang'],
        namaInstansi: ['nama instansi', 'instansi', 'nama_instansi'],
        npsnNspp: ['npsn/nspp', 'npsn', 'nspp', 'npsn_nspp'],
        jarak: ['jarak'],
        dataStatus: ['status', 'data status', 'data_status'],
        tempatLahir: ['tempat lahir', 'tempat_lahir'],
        tanggalLahir: ['tanggal lahir', 'tanggal_lahir', 'tgl lahir'],
        district: ['kabupaten', 'kabupaten/kota', 'district'],
        subDistrict: ['kecamatan', 'sub district', 'sub_district'],
        village: ['kelurahan/desa', 'kelurahan', 'desa', 'village'],
        hamlet: ['dusun', 'kampung', 'hamlet'],
        rt: ['rt'],
        rw: ['rw'],
        alamatLengkap: ['alamat', 'alamat lengkap', 'full address'],
    };

    const normalizedRows = [];
    rows.forEach((row) => {
        const entry = {};
        Object.entries(aliases).forEach(([target, keys]) => {
            const matchedKey = findMatchingKey(row, keys);
            if (matchedKey) {
                entry[target] = getSafeString(row[matchedKey]);
            }
        });
        if (!entry.namaPenerima) return;
        entry.nik = sanitizeDigits(entry.nik || '');
        if (entry.dataStatus) {
            entry.dataStatus = normalizeStatus(entry.dataStatus);
        } else {
            entry.dataStatus = 'Valid';
        }
        if (entry.rt) entry.rt = sanitizeDigits(entry.rt);
        if (entry.rw) entry.rw = sanitizeDigits(entry.rw);
        normalizedRows.push(entry);
    });

    return normalizedRows;
}

function findMatchingKey(row, keys = []) {
    if (!row) return null;
    const loweredKeys = keys.map(key => key.toLowerCase());
    return Object.keys(row).find(rowKey => {
        if (!rowKey) return false;
        const normalizedKey = rowKey.toString().trim().toLowerCase();
        return loweredKeys.includes(normalizedKey);
    }) || null;
}

function setBulkImportState(loading) {
    const uploadButton = $('#file-storage-upload-btn');
    if (!uploadButton) return;
    uploadButton.disabled = loading;
    uploadButton.textContent = loading ? 'Mengunggah...' : 'Unggah CSV/XLS';
}

function cacheNewBeneficiary(record) {
    if (!record) return;
    if (!appState.fileStorage) {
        appState.fileStorage = { list: [] };
    }
    if (!Array.isArray(appState.fileStorage.list)) {
        appState.fileStorage.list = [];
    }
    appState.fileStorage.list = [record, ...appState.fileStorage.list];
    if (appState.activePage === 'file_storage') {
        emit('data.fileStorage.refresh');
    }
}

function cacheUpdatedBeneficiary(record) {
    if (!record?.id) return;
    if (!appState.fileStorage || !Array.isArray(appState.fileStorage.list)) return;
    appState.fileStorage.list = appState.fileStorage.list.map(item => {
        if (item.id === record.id) {
            return { ...item, ...record };
        }
        return item;
    });
}

function showPostSaveDialog({ wasEditing, recordName }) {
    const title = wasEditing ? 'Perubahan Disimpan' : 'Data Disimpan';
    const message = wasEditing
        ? `${recordName || 'Data'} berhasil diperbarui. Apa langkah selanjutnya?`
        : `${recordName || 'Data'} berhasil ditambahkan. Apa langkah selanjutnya?`;
    const footer = `
        <button type="button" class="btn btn-ghost" data-role="fs-postsave-continue">Lanjut Input</button>
        <button type="button" class="btn btn-primary" data-role="fs-postsave-view-list">Lihat Daftar</button>
    `;
    emit('ui.modal.create', 'confirmUserAction', { title, message, footer });
    requestAnimationFrame(attachPostSaveModalHandlers);
}

function attachPostSaveModalHandlers() {
    const modal = document.querySelector('#modal-container .modal-bg:last-of-type');
    if (!modal) return;
    const continueBtn = modal.querySelector('[data-role="fs-postsave-continue"]');
    const viewListBtn = modal.querySelector('[data-role="fs-postsave-view-list"]');

    if (continueBtn) {
        continueBtn.addEventListener('click', () => {
            emit('ui.modal.closeAll');
            prepareFormForNewEntry();
        }, { once: true });
    }
    if (viewListBtn) {
        viewListBtn.addEventListener('click', () => {
            emit('ui.modal.closeAll');
            handleNavigation('file_storage');
        }, { once: true });
    }
}

function prepareFormForNewEntry() {
    editingRecord = null;
    if (appState.fileStorage) {
        appState.fileStorage.editingRecord = null;
    }
    if (activeForm) {
        activeForm.reset();
    }
    resetFormDirty();
    emit('ui.form.markDirty', false);
    focusFirstField();
}

function focusFirstField() {
    requestAnimationFrame(() => {
        const firstField = document.getElementById('namaPenerima');
        if (firstField) {
            firstField.focus();
        }
    });
}

export { initFileStorageFormPage };
