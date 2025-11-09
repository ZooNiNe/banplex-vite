/*
 * File: js/ui/pages/hrd_applicants_form.js
 * REVISI: Menambahkan tombol info modal (via event bus) ke custom dropdown.
 */

import { $ } from '../../utils/dom.js';
import { createPageToolbarHTML } from '../components/toolbar.js';
import { addApplicant, batchImportApplicants, updateApplicant } from '../../services/data/hrdApplicantService.js';
import { toast } from '../components/toast.js';
import { validateForm, attachClientValidation } from '../../utils/validation.js';
import { emit, on, off } from '../../state/eventBus.js';
import { handleNavigation } from '../mainUI.js';
import { resetFormDirty } from '../components/modal.js';
import { createMasterDataSelect } from '../components/forms/index.js';
import { appState } from '../../state/appState.js';
import { isValidNikKk, sanitizeDigits, sanitizePhone } from '../../utils/helpers.js';
import * as XLSX from 'xlsx';
import { APPLICANT_FIELD_KEYS as FIELD_KEYS } from './jobApplicantFieldMap.js';

import { storage } from '../../config/firebase.js';
import {
    ref,
    uploadBytesResumable,
    getDownloadURL
} from 'https://www.gstatic.com/firebasejs/12.3.0/firebase-storage.js';

let unloadHandler = null;
let cleanupFns = [];
let isSubmitting = false;
let activeForm = null;
let isBulkUploading = false;
let editingRecord = null;
let activeUploads = 0;

const GENDER_OPTIONS = [
    { value: 'Laki-Laki', text: 'Laki-Laki' },
    { value: 'Perempuan', text: 'Perempuan' },
];

const PENDIDIKAN_OPTIONS = [
    { value: 'Tidak Sekolah', text: 'Tidak Sekolah' },
    { value: 'SD Sederajat', text: 'SD Sederajat' },
    { value: 'SMP Sederajat', text: 'SMP Sederajat' },
    { value: 'SMA/SMK Sederajat', text: 'SMA/SMK Sederajat' },
    { value: 'D1/D2/D3', text: 'D1/D2/D3' },
    { value: 'S1/D4', text: 'S1/D4' },
    { value: 'S2', text: 'S2' },
    { value: 'S3', text: 'S3' },
    { value: 'Lainnya', text: 'Lainnya' },
];

const SUMBER_LOWONGAN_OPTIONS = [
    { value: 'Website Karir', text: 'Website Karir' },
    { value: 'Job Portal (Jobstreet, etc)', text: 'Job Portal (Jobstreet, etc)' },
    { value: 'LinkedIn', text: 'LinkedIn' },
    { value: 'Media Sosial (IG, FB, etc)', text: 'Media Sosial (IG, FB, etc)' },
    { value: 'Referral Karyawan', text: 'Referral Karyawan' },
    { value: 'Job Fair', text: 'Job Fair' },
    { value: 'Lainnya', text: 'Lainnya' },
];

const STATUS_APLIKASI_OPTIONS = [
    { value: 'Lamaran Diterima', text: 'Lamaran Diterima' },
    { value: 'Screening', text: 'Screening' },
    { value: 'Interview HR', text: 'Interview HR' },
    { value: 'Interview User', text: 'Interview User' },
    { value: 'Psikotes', text: 'Psikotes' },
    { value: 'Offering', text: 'Offering' },
    { value: 'Diterima', text: 'Diterima' },
    { value: 'Ditolak', text: 'Ditolak' },
    { value: 'Daftar Hitam', text: 'Daftar Hitam' },
];

const STATUS_LOOKUP = new Map();
STATUS_APLIKASI_OPTIONS.forEach(opt => STATUS_LOOKUP.set(opt.value.toLowerCase(), opt.value));
STATUS_LOOKUP.set('applied', 'Lamaran Diterima');
STATUS_LOOKUP.set('rejected', 'Ditolak');
STATUS_LOOKUP.set('hired', 'Diterima');
STATUS_LOOKUP.set('screening', 'Screening');
STATUS_LOOKUP.set('blacklist', 'Daftar Hitam');

function createFormInfoIcon(infoKey) {
    if (!infoKey) return '';
    return `
        <button type="button" class="btn-icon btn-icon--info" 
                data-action="show-hrd-info" 
                data-info-key="${infoKey}" 
                title="Klik untuk info lebih lanjut">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="16" x2="12" y2="12"></line>
                <line x1="12" y1="8" x2="12.01" y2="8"></line>
            </svg>
        </button>
    `;
}

function initHrdApplicantsFormPage() {
    editingRecord = appState.hrdApplicants?.editingRecord || null;
    activeUploads = 0;
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
    const panelTitle = isEditMode ? 'Edit Data Pelamar' : 'Input Data Pelamar';
    const submitLabel = isEditMode ? 'Perbarui Data' : 'Simpan Data';

    const statusSelectHTML = createMasterDataSelect(
        'statusAplikasi',
        'Status Aplikasi *', // Label teks biasa
        STATUS_APLIKASI_OPTIONS,
        STATUS_APLIKASI_OPTIONS[0].value,
        null, true, false
    );

    const sumberSelectHTML = createMasterDataSelect(
        'sumberLowongan',
        'Sumber Lowongan', // Label teks biasa
        SUMBER_LOWONGAN_OPTIONS,
        '',
        null, false, false
    );

    const genderSelectHTML = createMasterDataSelect(
        'jenisKelamin', 'Jenis Kelamin *', GENDER_OPTIONS, '', null, true, false
    );
    const pendidikanSelectHTML = createMasterDataSelect(
        'pendidikanTerakhir', 
        'Pendidikan Terakhir *', 
        PENDIDIKAN_OPTIONS, 
        '', 
        null, 
        true,
        false
    );

    container.innerHTML = `
        <div class="content-panel hrd-applicants-panel">
            <div class="panel-header">
                ${createPageToolbarHTML({ title: panelTitle })}
            </div>
            <div class="panel-content scrollable-content has-padding">
                <form id="hrd-applicants-form" class="form-card accent-purple" autocomplete="off">
                    <input type="file" id="hrd-applicants-bulk-input" accept=".csv,.xlsx,.xls" hidden>
                    
                    <h3 class="form-section-title">Data Lamaran</h3>
                    <div class="form-row">
                        <div class="form-group">
                            <label for="posisiDilamar">Posisi Dilamar *</label>
                            <input type="text" id="posisiDilamar" name="posisiDilamar" required placeholder="Contoh: Staff Administrasi">
                        </div>
                        ${statusSelectHTML}
                    </div>
                    <div class="form-row">
                        ${sumberSelectHTML}
                    </div>
                    
                    <hr class="form-divider">
                    <h3 class="form-section-title">Data Personal</h3>
                    <div class="form-row">
                        <div class="form-group">
                            <label for="namaLengkap">Nama Lengkap *</label>
                            <input type="text" id="namaLengkap" name="namaLengkap" required placeholder="Sesuai KTP" data-proper-case="true">
                        </div>
                        <div class="form-group">
                            <label for="email">Email *</label>
                            <input type="email" id="email" name="email" required placeholder="example@domain.com">
                        </div>
                    </div>

                    <div class="form-row">
                        <div class="form-group">
                            <label for="noTelepon">No. Telepon/WA *</label>
                            <input type="tel" id="noTelepon" name="noTelepon" required placeholder="0812... atau 628...">
                        </div>
                        ${genderSelectHTML}
                    </div>

                    <div class="form-row">
                        <div class="form-group">
                            <label for="nik">NIK (KTP) *</label>
                            <input type="text" id="nik" name="nik" required inputmode="numeric" maxlength="16" placeholder="16 digit NIK">
                        </div>
                        <div class="form-group">
                            <label for="noKk">No. KK</label>
                            <input type="text" id="noKk" name="noKk" inputmode="numeric" maxlength="16" placeholder="16 digit No. KK (Opsional)">
                        </div>
                    </div>

                    <div class="form-row">
                        <div class="form-group">
                            <label for="tempatLahir">Tempat Lahir *</label>
                            <input type="text" id="tempatLahir" name="tempatLahir" required data-proper-case="true" placeholder="Kota / Kabupaten">
                        </div>
                        <div class="form-group">
                            <label for="tanggalLahir">Tanggal Lahir *</label>
                            <input type="date" id="tanggalLahir" name="tanggalLahir" required>
                        </div>
                    </div>

                    <hr class="form-divider">
                    <h3 class="form-section-title">Kualifikasi</h3>
                    <div class="form-row">
                        ${pendidikanSelectHTML}
                    </div>
                    <div class="form-row">
                         <div class="form-group">
                            <label for="namaInstitusiPendidikan">Nama Institusi Pendidikan *</label>
                            <input type="text" id="namaInstitusiPendidikan" name="namaInstitusiPendidikan" required placeholder="Contoh: Universitas Indonesia / SMAN 1 Jakarta" data-proper-case="true">
                        </div>
                        <div class="form-group">
                            <label for="jurusan">Jurusan / Program Studi *</label>
                            <input type="text" id="jurusan" name="jurusan" required placeholder="Contoh: Akuntansi / IPA" data-proper-case="true">
                        </div>
                    </div>
                     <div class="form-group">
                        <label for="pengalamanKerja">Ringkasan Pengalaman Kerja</label>
                        <textarea id="pengalamanKerja" name="pengalamanKerja" rows="3" placeholder="Contoh: \n- Staff Admin di PT. ABC (2020-2022)\n- Kasir di Toko XYZ (2019-2020)"></textarea>
                    </div>
                    <div class="form-group">
                        <label for="skills">Keahlian (Skills)</label>
                        <textarea id="skills" name="skills" rows="2" placeholder="Pisahkan dengan koma, contoh: Microsoft Excel, SAP, Komunikasi"></textarea>
                    </div>

                    <hr class="form-divider">
                    <h3 class="form-section-title">Informasi Alamat (Sesuai KTP)</h3>
                    <div class="form-row">
                        <div class="form-group">
                            <label for="district">Kabupaten / Kota *</label>
                            <input type="text" id="district" name="district" required data-proper-case="true" placeholder="Contoh: Kab. Sukabumi">
                        </div>
                        <div class="form-group">
                            <label for="subDistrict">Kecamatan *</label>
                            <input type="text" id="subDistrict" name="subDistrict" required data-proper-case="true" placeholder="Contoh: Cisaat">
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label for="village">Kelurahan / Desa *</label>
                            <input type="text" id="village" name="village" required data-proper-case="true" placeholder="Contoh: Cisaat">
                        </div>
                        <div class="form-group">
                            <label for="hamlet">Dusun / Kampung</label>
                            <input type="text" id="hamlet" name="hamlet" data-proper-case="true" placeholder="Contoh: Kp. Cisarua">
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
                        <label for="alamatLengkap">Alamat Lengkap KTP *</label>
                        <textarea id="alamatLengkap" name="alamatLengkap" rows="3" required placeholder="Contoh: Jl. Raya No. 12, Blok A"></textarea>
                    </div>
                    <div class="form-group">
                        <label for="alamatDomisili">Alamat Domisili (Isi jika berbeda)</label>
                        <textarea id="alamatDomisili" name="alamatDomisili" rows="3"></textarea>
                    </div>
                    
                    <hr class="form-divider">
                    <h3 class="form-section-title">Lampiran (Opsional)</h3>
                    <p class="helper-text">
                        Unggah lampiran pelamar. Harap tunggu proses upload selesai sebelum menyimpan.
                    </p>
                    <div class="form-row">
                        <div class="form-group">
                            <label for="fileKtp">File KTP (PDF/Gambar)</label>
                            <input type="file" class="attachment-file-input" id="fileKtp" data-file-type="urlKtp" accept=".pdf,.jpg,.jpeg,.png">
                            <div class="attachment-preview" id="fileKtp-preview"></div>
                            <input type="hidden" id="urlKtp" name="urlKtp">
                        </div>
                        <div class="form-group">
                            <label for="fileKk">File KK (PDF/Gambar)</label>
                            <input type="file" class="attachment-file-input" id="fileKk" data-file-type="urlKk" accept=".pdf,.jpg,.jpeg,.png">
                            <div class="attachment-preview" id="fileKk-preview"></div>
                            <input type="hidden" id="urlKk" name="urlKk">
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label for="filePasFoto">Pas Foto (Gambar)</label>
                            <input type="file" class="attachment-file-input" id="filePasFoto" data-file-type="urlPasFoto" accept=".jpg,.jpeg,.png">
                            <div class="attachment-preview" id="filePasFoto-preview"></div>
                            <input type="hidden" id="urlPasFoto" name="urlPasFoto">
                        </div>
                        <div class="form-group">
                            <label for="fileSuratSehat">Surat Sehat (PDF/Gambar)</label>
                            <input type="file" class="attachment-file-input" id="fileSuratSehat" data-file-type="urlSuratSehat" accept=".pdf,.jpg,.jpeg,.png">
                            <div class="attachment-preview" id="fileSuratSehat-preview"></div>
                            <input type="hidden" id="urlSuratSehat" name="urlSuratSehat">
                        </div>
                    </div>

                    <hr class="form-divider">
                    <h3 class="form-section-title">Catatan Internal (HRD)</h3>
                    <div class="form-group">
                        <label for="catatanHrd">Catatan HRD (Hanya terlihat oleh tim HRD)</label>
                        <textarea id="catatanHrd" name="catatanHrd" rows="3" placeholder="Contoh: Kandidat kuat, hubungi untuk interview minggu depan."></textarea>
                    </div>
                    
                    <div class="form-footer-actions form-footer-actions--balanced">
                        <button type="button" class="btn btn-secondary" data-action="navigate" data-nav="hrd_applicants">Batalkan</button>
                        <button type="button" class="btn btn-ghost" id="hrd-applicants-upload-btn">Unggah CSV/XLS</button>
                        <button type="submit" class="btn btn-primary" id="hrd-applicants-submit-btn" data-span="full">${submitLabel}</button>
                    </div>
                </form>
            </div>
        </div>
    `;
}

function hydrateFormWithRecord(record) {
    if (!record) return;
    const form = $('#hrd-applicants-form');
    if (!form) return;

    const basicFields = [
        ['namaLengkap', 'namaLengkap'],
        ['posisiDilamar', 'posisiDilamar'],
        ['email', 'email'],
        ['noTelepon', 'noTelepon'],
        ['nik', 'nik'],
        ['noKk', 'noKk'],
        ['tempatLahir', 'tempatLahir'],
        ['namaInstitusiPendidikan', 'namaInstitusiPendidikan'],
        ['jurusan', 'jurusan'],
        ['pengalamanKerja', 'pengalamanKerja'],
        ['skills', 'skills'],
        ['district', 'district'],
        ['subDistrict', 'subDistrict'],
        ['village', 'village'],
        ['hamlet', 'hamlet'],
        ['rt', 'rt'],
        ['rw', 'rw'],
        ['alamatLengkap', 'alamatLengkap'],
        ['alamatDomisili', 'alamatDomisili'],
        ['catatanHrd', 'catatanHrd'],
    ];

    const customSelectFields = ['jenisKelamin', 'statusAplikasi', 'sumberLowongan', 'pendidikanTerakhir'];
    const attachmentFields = ['urlKtp', 'urlKk', 'urlPasFoto', 'urlSuratSehat'];

    const setFieldValue = (fieldId, rawValue) => {
        if (rawValue === '' || rawValue === null || rawValue === undefined) return;
        const field = form.querySelector(`#${fieldId}`);
        if (!field) return;
        let value = rawValue;
        if (['nik', 'noKk', 'rt', 'rw'].includes(fieldId)) {
            value = sanitizeDigits(value);
        }
        if (fieldId === 'noTelepon') {
            value = sanitizePhone(value);
        }
        field.value = value;
    };

    basicFields.forEach(([fieldId, key]) => {
        const value = getRecordFieldValue(record, key);
        if (value === undefined || value === null) return;
        setFieldValue(fieldId, value);
    });

    const birthDateValue = normalizeDateForInput(getRecordFieldValue(record, 'tanggalLahir'));
    if (birthDateValue) {
        setFieldValue('tanggalLahir', birthDateValue);
    }

    customSelectFields.forEach((fieldId) => {
        const targetValue = getRecordFieldValue(record, fieldId);
        if (!targetValue) return;
        setCustomSelectValue(form, fieldId, fieldId === 'statusAplikasi' ? normalizeStatus(targetValue) : targetValue);
    });
    
    attachmentFields.forEach(key => {
        const url = getRecordFieldValue(record, key);
        if (url) {
            const inputId = key.replace('url', 'file').toLowerCase(); // urlKtp -> filektp
            const previewEl = $(`#${inputId}-preview`);
            const hiddenInput = $(`#${key}`);
            
            if (hiddenInput) {
                hiddenInput.value = url;
            }
            if (previewEl) {
                // Coba ekstrak nama file yang lebih bersih dari URL
                let fileName = 'File';
                try {
                    const decodedUrl = decodeURIComponent(url);
                    fileName = decodedUrl.split('%2F').pop().split('?')[0].substring(14); // Ambil nama file
                    if (fileName.length > 30) {
                        fileName = '...' + fileName.slice(-27);
                    }
                } catch(e) {
                    fileName = 'File terlampir';
                }

                previewEl.innerHTML = `
                    <span class="attachment-info">
                        <a href="${url}" target="_blank" rel="noopener noreferrer">${fileName}</a>
                    </span>
                    <button type="button" class="btn-icon btn-ghost btn-icon--danger" data-action="remove-attachment" data-key="${key}" data-input-id="${inputId}">
                        Ganti
                    </button>
                `;
            }
        }
    });

    emit('ui.form.markDirty', false);
}

function updateNikFieldValidationState(input, isRequired = false) {
    if (!input) return;
    const value = sanitizeDigits(input.value);
    const parentGroup = input.closest('.form-group'); //
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
    if (!input) return false; // Seharusnya tidak terjadi
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

    const form = $('#hrd-applicants-form');
    activeForm = form;
    if (!form) return;

    attachClientValidation(form);
    // Panggil ui.forms.init untuk mengaktifkan dropdown custom
    emit('ui.forms.init', form); 
    emit('ui.form.markDirty', false);

    const submitHandler = (event) => handleFormSubmit(event);
    form.addEventListener('submit', submitHandler);
    cleanupFns.push(() => form.removeEventListener('submit', submitHandler));

    const dirtyHandler = () => emit('ui.form.markDirty', true);
    form.addEventListener('input', dirtyHandler);
    // 'change' event akan ditangkap oleh listener 'ui.forms.init' untuk custom select
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
    
    const kkInput = form.querySelector('#noKk');
    if (kkInput) {
        const kkSanitizeAndValidate = () => {
            kkInput.value = sanitizeDigits(kkInput.value).slice(0, 16); // Sanitasi
            updateNikFieldValidationState(kkInput, false); // Validasi visual live
        };
        const kkBlurHandler = () => updateNikFieldValidationState(kkInput, false); // Validasi visual on blur

        kkInput.addEventListener('input', kkSanitizeAndValidate);
        kkInput.addEventListener('blur', kkBlurHandler);
        cleanupFns.push(() => {
            kkInput.removeEventListener('input', kkSanitizeAndValidate);
            kkInput.removeEventListener('blur', kkBlurHandler);
        });
    }
    
    const phoneInput = form.querySelector('#noTelepon');
    if (phoneInput) {
         const phoneHandler = () => {
            phoneInput.value = sanitizePhone(phoneInput.value);
        };
        phoneInput.addEventListener('input', phoneHandler);
        cleanupFns.push(() => phoneInput.removeEventListener('input', phoneHandler));
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

    const uploadButton = $('#hrd-applicants-upload-btn');
    const fileInput = $('#hrd-applicants-bulk-input');
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

    const fileInputs = form.querySelectorAll('.attachment-file-input');
    fileInputs.forEach(input => {
        const fileChangeHandler = (event) => {
            const file = event.target.files[0];
            const fileType = event.target.dataset.fileType; 
            const inputId = event.target.id;
            if (file && fileType && inputId) {
                handleAttachmentUpload(file, fileType, inputId);
            }
        };
        input.addEventListener('change', fileChangeHandler);
        cleanupFns.push(() => input.removeEventListener('change', fileChangeHandler));
    });

    // --- BARU: Listener untuk Info Button dan Hapus Lampiran (via delegasi) ---
    const formClickHandler = (event) => {
        // Cari target terdekat yang memiliki data-action
        const target = event.target.closest('[data-action]');
        if (!target) return;

        const action = target.dataset.action;

        // Menangani klik tombol info
        if (action === 'show-hrd-info') {
            event.preventDefault(); // Mencegah form submit jika tombol ada di dalam label
            event.stopPropagation(); // Mencegah event bubbling
            const key = target.dataset.infoKey;
            if (key) {
                showInfoModal(key);
            }
        }

        // Menangani klik tombol hapus/ganti lampiran
        if (action === 'remove-attachment') {
            event.preventDefault();
            event.stopPropagation();
            const key = target.dataset.key; // 'urlKtp'
            const inputId = target.dataset.inputId; // 'fileKtp'
            
            const previewEl = $(`#${inputId}-preview`);
            const hiddenInput = $(`#${key}`);
            const fileInput = $(`#${inputId}`);

            if (previewEl) previewEl.innerHTML = '';
            if (hiddenInput) hiddenInput.value = '';
            if (fileInput) fileInput.value = ''; // Reset input file
        }
    };
    
    form.addEventListener('click', formClickHandler);
    cleanupFns.push(() => form.removeEventListener('click', formClickHandler));
}


function handleAttachmentUpload(file, fileTypeKey, inputId) {
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
        toast('error', 'Ukuran file terlalu besar (Maks 5MB).');
        const fileInput = $(`#${inputId}`);
        if(fileInput) fileInput.value = ''; // Reset input
        return;
    }

    const storagePath = `hrd_attachments/${fileTypeKey}/${Date.now()}-${file.name}`;
    const storageRef = ref(storage, storagePath);
    const uploadTask = uploadBytesResumable(storageRef, file);

    const previewEl = $(`#${inputId}-preview`);
    const hiddenInput = $(`#${fileTypeKey}`);

    activeUploads++;
    setSubmittingState(true, 'uploading');

    uploadTask.on('state_changed',
        (snapshot) => {
            const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
            if (previewEl) {
                previewEl.innerHTML = `<span class="attachment-info">Mengunggah: ${progress.toFixed(0)}%</span>`;
            }
        },
        (error) => {
            console.error(`[FileUpoad] Gagal mengunggah ${fileTypeKey}:`, error);
            toast('error', `Gagal mengunggah ${file.name}.`);
            if (previewEl) {
                previewEl.innerHTML = `<span class="attachment-info attachment-error">Upload Gagal</span>`;
            }
            activeUploads--;
            if (activeUploads < 0) activeUploads = 0;
            setSubmittingState(activeUploads > 0, 'uploading');
        },
        () => {
            getDownloadURL(uploadTask.snapshot.ref).then((downloadURL) => {
                if (previewEl) {
                    previewEl.innerHTML = `
                        <span class="attachment-info">
                            <a href="${downloadURL}" target="_blank" rel="noopener noreferrer">${file.name}</a>
                        </span>
                        <button type="button" class="btn-icon btn-ghost btn-icon--danger" data-action="remove-attachment" data-key="${fileTypeKey}" data-input-id="${inputId}">
                            Ganti
                        </button>
                    `;
                }
                if (hiddenInput) {
                    hiddenInput.value = downloadURL;
                }
                toast('success', `${file.name} berhasil diunggah.`);
                activeUploads--;
                if (activeUploads < 0) activeUploads = 0;
                setSubmittingState(activeUploads > 0, 'uploading');
            });
        }
    );
}


async function handleFormSubmit(event) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    if (isSubmitting) return;

    if (activeUploads > 0) {
        toast('error', 'Harap tunggu semua lampiran selesai diunggah.');
        return;
    }
    
    if (!activeForm) return;
    if (!validateForm(activeForm)) return;

    const nikInput = activeForm.querySelector('#nik');
    if (!validateNikFieldOnSubmit(nikInput, 'NIK', true)) return;

    const kkInput = activeForm.querySelector('#noKk');
    if (!validateNikFieldOnSubmit(kkInput, 'No. KK', false)) return;
        
    const payload = buildPayload(activeForm);
    const wasEditing = Boolean(editingRecord?.id);

    if (!payload.namaLengkap) {
        toast('error', 'Nama lengkap pelamar wajib diisi.');
        activeForm.querySelector('#namaLengkap')?.focus();
        return;
    }
    if (!payload.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
        toast('error', 'Format email tidak valid.');
         activeForm.querySelector('#email')?.focus();
        return;
    }
     if (!payload.noTelepon) {
        toast('error', 'No. Telepon wajib diisi.');
         activeForm.querySelector('#noTelepon')?.focus();
        return;
    }

    isSubmitting = true;
    setSubmittingState(true);

    try {
        if (wasEditing && editingRecord?.id) {
            await updateApplicant(editingRecord.id, payload);
            cacheUpdatedApplicant({ id: editingRecord.id, ...editingRecord, ...payload });
            toast('success', 'Data pelamar berhasil diperbarui.');
        } else {
            const docId = await addApplicant(payload);
            cacheNewApplicant({ id: docId, ...payload });
            toast('success', 'Data pelamar berhasil disimpan.');
        }
        
        resetFormDirty();
        emit('ui.form.markDirty', false);
        appState.hrdApplicants.editingRecord = null;
        editingRecord = null;
        emit('data.hrdApplicants.refresh');
        showPostSaveDialog({ wasEditing, recordName: payload.namaLengkap || 'Data' });
    } catch (error) {
        console.error('[HrdApplicantsForm] Gagal menyimpan data:', error);
        toast('error', error?.message || 'Gagal menyimpan data. Coba lagi.');
    } finally {
        isSubmitting = false;
        setSubmittingState(false);
    }
}

function buildPayload(form) {
    const formData = new FormData(form);
    const entries = {
        posisiDilamar: formData.get('posisiDilamar'),
        statusAplikasi: formData.get('statusAplikasi'),
        sumberLowongan: formData.get('sumberLowongan'),
        namaLengkap: formData.get('namaLengkap'),
        email: formData.get('email'),
        noTelepon: formData.get('noTelepon'),
        jenisKelamin: formData.get('jenisKelamin'),
        nik: formData.get('nik'),
        noKk: formData.get('noKk'),
        tempatLahir: formData.get('tempatLahir'),
        tanggalLahir: formData.get('tanggalLahir'),
        pendidikanTerakhir: formData.get('pendidikanTerakhir'),
        namaInstitusiPendidikan: formData.get('namaInstitusiPendidikan'),
        jurusan: formData.get('jurusan'),
        pengalamanKerja: formData.get('pengalamanKerja'),
        skills: formData.get('skills'),
        district: formData.get('district'),
        subDistrict: formData.get('subDistrict'),
        village: formData.get('village'),
        hamlet: formData.get('hamlet'),
        rt: formData.get('rt'),
        rw: formData.get('rw'),
        alamatLengkap: formData.get('alamatLengkap'),
        alamatDomisili: formData.get('alamatDomisili'),
        urlKtp: formData.get('urlKtp'),
        urlKk: formData.get('urlKk'),
        urlPasFoto: formData.get('urlPasFoto'),
        urlSuratSehat: formData.get('urlSuratSehat'),
        catatanHrd: formData.get('catatanHrd'),
    };

    const payload = {};
    Object.entries(entries).forEach(([key, value]) => {
        const trimmed = getSafeString(value);
        if (value === undefined || value === null || trimmed === '') {
            return;
        }
        if (['nik', 'noKk', 'rt', 'rw'].includes(key)) {
            payload[key] = sanitizeDigits(trimmed);
        } else if (key === 'noTelepon') {
             payload[key] = sanitizePhone(trimmed);
        } else if (key === 'statusAplikasi') {
            payload[key] = normalizeStatus(trimmed);
        } else if (key === 'email') {
            payload[key] = trimmed.toLowerCase();
        } else {
            payload[key] = trimmed;
        }
    });
    return payload;
}

function setSubmittingState(loading, mode = 'submit') {
    const submitButton = $('#hrd-applicants-submit-btn');
    if (!submitButton) return;
    
    isSubmitting = loading;
    submitButton.disabled = loading;

    if (loading) {
        if (mode === 'uploading') {
            submitButton.textContent = 'Mengunggah Lampiran...';
        } else {
            const loadingLabel = editingRecord?.id ? 'Memperbarui...' : 'Menyimpan...';
            submitButton.textContent = loadingLabel;
        }
    } else {
        const baseLabel = editingRecord?.id ? 'Perbarui Data' : 'Simpan Data';
        submitButton.textContent = baseLabel;
    }
}

function registerUnloadHandler() {
    if (unloadHandler) return;
    unloadHandler = () => cleanupHrdApplicantsFormPage();
    on('app.unload.hrd_applicants_form', unloadHandler);
}

function cleanupHrdApplicantsFormPage() {
    cleanupFns.forEach(fn => fn?.());
    cleanupFns = [];
    activeForm = null;
    editingRecord = null;
    if (appState.hrdApplicants) {
        appState.hrdApplicants.editingRecord = null;
    }
    if (unloadHandler) {
        off('app.unload.hrd_applicants_form', unloadHandler);
        unloadHandler = null;
    }
    isSubmitting = false;
    activeUploads = 0;
}

function getSafeString(value) {
    if (value === undefined || value === null) return '';
    return String(value).trim();
}

function normalizeStatus(value) {
    const normalized = getSafeString(value).toLowerCase();
    return STATUS_LOOKUP.get(normalized) || STATUS_APLIKASI_OPTIONS[0].value;
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
    if (key === 'namaLengkap' && record.namaPenerima) return record.namaPenerima;
    if (key === 'statusAplikasi' && record.dataStatus) return record.dataStatus;
    if (key === 'namaInstitusiPendidikan' && record.namaInstansi) return record.namaInstansi;
    return '';
}

function normalizeDateForInput(value) {
    if (!value) return '';
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
        const m = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
        if(m) {
            const parsed = new Date(`${m[3]}-${m[2]}-${m[1]}`);
            if (!Number.isNaN(parsed.getTime())) {
                return parsed.toISOString().slice(0, 10);
            }
        }
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
    if (!form || !rawValue) return;
    const hiddenInput = form.querySelector(`#${fieldId}`);
    if (!hiddenInput) return;
    const wrapper = hiddenInput.closest('.custom-select-wrapper');
    const options = wrapper?.querySelectorAll('.custom-select-option');
    if (!wrapper || !options?.length) {
        hiddenInput.value = rawValue;
        return;
    }
    let matchedOption = null;
    const lowerRawValue = rawValue.toString().toLowerCase();
    options.forEach(optionNode => {
        const optionValue = optionNode.dataset.value || '';
        if (!matchedOption && optionValue.toLowerCase() === lowerRawValue) {
            matchedOption = optionNode;
        }
    });
    if (!matchedOption && fieldId === 'statusAplikasi') {
        const normalizedStatus = STATUS_LOOKUP.get(lowerRawValue);
        if(normalizedStatus) {
             options.forEach(optionNode => {
                const optionValue = optionNode.dataset.value || '';
                if (!matchedOption && optionValue === normalizedStatus) {
                    matchedOption = optionNode;
                }
            });
        }
    }
    if (!matchedOption) { return; }
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
    try {
        toast('syncing', `Memproses ${file.name}...`);
        const records = await parseApplicantSpreadsheet(file);
        if (records.length === 0) {
            toast('info', 'Tidak ada data valid pada file yang diunggah.');
            return;
        }
        await batchImportApplicants(records);
        toast('success', `${records.length} data pelamar berhasil diunggah.`);
        emit('data.hrdApplicants.refresh');
        handleNavigation('hrd_applicants');
    } catch (error) {
        console.error('[HrdApplicantsForm] Bulk import gagal:', error);
        toast('error', error?.message || 'Gagal mengunggah file. Pastikan format sudah sesuai.');
    } finally {
        isBulkUploading = false;
        setBulkImportState(false);
        if (fileInput) fileInput.value = '';
    }
}

async function parseApplicantSpreadsheet(file) {
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    const sheetName = workbook.SheetNames?.[0];
    if (!sheetName) return [];
    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(worksheet, { defval: '', raw: false });
    const aliases = {
        namaLengkap: FIELD_KEYS.namaLengkap,
        nik: FIELD_KEYS.nik,
        noKk: FIELD_KEYS.noKk,
        email: FIELD_KEYS.email,
        noTelepon: FIELD_KEYS.noTelepon,
        jenisKelamin: FIELD_KEYS.jenisKelamin,
        tempatLahir: FIELD_KEYS.tempatLahir,
        tanggalLahir: FIELD_KEYS.tanggalLahir,
        alamatLengkap: FIELD_KEYS.alamatLengkap,
        alamatDomisili: FIELD_KEYS.alamatDomisili,
        district: FIELD_KEYS.district,
        subDistrict: FIELD_KEYS.subDistrict,
        village: FIELD_KEYS.village,
        hamlet: FIELD_KEYS.hamlet,
        rt: FIELD_KEYS.rt,
        rw: FIELD_KEYS.rw,
        posisiDilamar: FIELD_KEYS.posisiDilamar,
        sumberLowongan: FIELD_KEYS.sumberLowongan,
        statusAplikasi: FIELD_KEYS.statusAplikasi,
        pendidikanTerakhir: FIELD_KEYS.pendidikanTerakhir,
        jurusan: FIELD_KEYS.jurusan,
        namaInstitusiPendidikan: FIELD_KEYS.namaInstitusiPendidikan,
        pengalamanKerja: FIELD_KEYS.pengalamanKerja,
        skills: FIELD_KEYS.skills,
        catatanHrd: FIELD_KEYS.catatanHrd,
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
        if (!entry.namaLengkap || (!entry.email && !entry.noTelepon)) return;
        entry.nik = sanitizeDigits(entry.nik || '');
        entry.noKk = sanitizeDigits(entry.noKk || '');
        if (entry.noTelepon) {
            entry.noTelepon = sanitizePhone(entry.noTelepon);
        }
        if (entry.statusAplikasi) {
            entry.statusAplikasi = normalizeStatus(entry.statusAplikasi);
        } else {
            entry.statusAplikasi = STATUS_APLIKASI_OPTIONS[0].value;
        }
        if (entry.rt) entry.rt = sanitizeDigits(entry.rt);
        if (entry.rw) entry.rw = sanitizeDigits(entry.rw);
        if (entry.tanggalLahir) {
            entry.tanggalLahir = normalizeDateForInput(entry.tanggalLahir);
        }
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
    const uploadButton = $('#hrd-applicants-upload-btn');
    if (!uploadButton) return;
    uploadButton.disabled = loading;
    uploadButton.textContent = loading ? 'Mengunggah...' : 'Unggah CSV/XLS';
}

function cacheNewApplicant(record) {
    if (!record) return;
    if (!appState.hrdApplicants) {
        appState.hrdApplicants = { list: [] };
    }
    if (!Array.isArray(appState.hrdApplicants.list)) {
        appState.hrdApplicants.list = [];
    }
    appState.hrdApplicants.list = [record, ...appState.hrdApplicants.list];
    if (appState.activePage === 'hrd_applicants') {
        emit('data.hrdApplicants.refresh');
    }
}

function cacheUpdatedApplicant(record) {
    if (!record?.id) return;
    if (!appState.hrdApplicants || !Array.isArray(appState.hrdApplicants.list)) return;
    appState.hrdApplicants.list = appState.hrdApplicants.list.map(item => {
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
            handleNavigation('hrd_applicants');
        }, { once: true });
    }
}

function prepareFormForNewEntry() {
    editingRecord = null;
    activeUploads = 0;
    if (appState.hrdApplicants) {
        appState.hrdApplicants.editingRecord = null;
    }
    if (activeForm) {
        activeForm.reset();
        
        activeForm.querySelectorAll('.attachment-preview').forEach(el => el.innerHTML = '');
        activeForm.querySelectorAll('.attachment-file-input').forEach(el => el.value = '');
        activeForm.querySelectorAll('input[type="hidden"]').forEach(el => {
            if (el.name.startsWith('url')) {
                el.value = '';
            }
        });

        activeForm.querySelectorAll('.custom-select-wrapper').forEach(wrapper => {
            const hiddenInput = wrapper.querySelector('input[type="hidden"]');
            const triggerSpan = wrapper.querySelector('.custom-select-trigger span');
            const options = wrapper.querySelectorAll('.custom-select-option');
            if (!hiddenInput || !triggerSpan || !options || !options.length) return;

            let defaultOption = null;
            
            if (hiddenInput.id === 'statusAplikasi') {
                defaultOption = Array.from(options).find(opt => opt.dataset.value === STATUS_APLIKASI_OPTIONS[0].value);
            } else {
                defaultOption = options[0]; // "Pilih..."
            }

            if (defaultOption) {
                hiddenInput.value = defaultOption.dataset.value;
                triggerSpan.textContent = defaultOption.textContent.trim();
                options.forEach(opt => opt.classList.toggle('selected', opt === defaultOption));
            }
        });
    }
    resetFormDirty();
    emit('ui.form.markDirty', false);
    focusFirstField();
}

function focusFirstField() {
    requestAnimationFrame(() => {
        const firstField = document.getElementById('posisiDilamar');
        if (firstField) {
            firstField.focus();
        }
    });
}


function getModalContentFor(key) {
    let title = 'Informasi';
    let contentHTML = '';

    const createIlustration = (iconName) => {
        const icons = {
            clipboard: `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg>`,
            search: `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>`,
            users: `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>`,
            check: `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`,
            x: `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`,
            globe: `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>`
        };
        return `<div class="modal-info-ilustration">${icons[iconName] || icons['clipboard']}</div>`;
    };

    switch (key) {
        case 'status':
            title = 'Penjelasan Status Aplikasi';
            contentHTML = `
                <div class="modal-info-list">
                    <div class="modal-info-item">
                        ${createIlustration('clipboard')}
                        <div>
                            <h3>Lamaran Diterima</h3>
                            <p><strong>Deskripsi:</strong> Lamaran kandidat (CV, portofolio, dll.) telah diterima oleh sistem atau tim HRD. Ini adalah tahap paling awal.</p>
                            <p><strong>Tindakan Lanjutan:</strong> Belum ada. Lamaran menunggu untuk ditinjau (Screening).</p>
                        </div>
                    </div>
                    <div class="modal-info-item">
                        ${createIlustration('search')}
                        <div>
                            <h3>Screening</h3>
                            <p><strong>Deskripsi:</strong> Tim HRD sedang meninjau lamaran untuk mencocokkan kualifikasi kandidat dengan persyaratan pekerjaan (pengalaman, pendidikan, skills).</p>
                            <p><strong>Tindakan Lanjutan:</strong> Jika lolos, kandidat akan dihubungi untuk 'Interview HR'. Jika tidak, status akan diubah menjadi 'Ditolak'.</p>
                        </div>
                    </div>
                    <div class="modal-info-item">
                        ${createIlustration('users')}
                        <div>
                            <h3>Interview HR</h3>
                            <p><strong>Deskripsi:</strong> Kandidat melakukan wawancara dengan tim HRD. Fokusnya adalah pada perkenalan, latar belakang, soft skills, dan kecocokan budaya (cultural fit).</p>
                        </div>
                    </div>
                    <div class="modal-info-item">
                        ${createIlustration('users')}
                        <div>
                            <h3>Interview User</h3>
                            <p><strong>Deskripsi:</strong> Kandidat melakukan wawancara dengan calon atasan langsung (user) atau manajer departemen terkait. Fokusnya adalah pada hard skills dan kemampuan teknis.</p>
                        </div>
                    </div>
                     <div class="modal-info-item">
                        ${createIlustration('clipboard')}
                        <div>
                            <h3>Psikotes</h3>
                            <p><strong>Deskripsi:</strong> Kandidat mengerjakan serangkaian tes psikologi untuk menilai kepribadian, kemampuan kognitif, dan gaya kerja.</p>
                        </div>
                    </div>
                    <div class="modal-info-item">
                        ${createIlustration('check')}
                        <div>
                            <h3>Offering</h3>
                            <p><strong>Deskripsi:</strong> Perusahaan mengajukan penawaran kerja resmi (offering letter) yang berisi rincian gaji, tunjangan, dan tanggal mulai.</p>
                        </div>
                    </div>
                     <div class="modal-info-item">
                        ${createIlustration('check')}
                        <div>
                            <h3>Diterima</h3>
                            <p><strong>Deskripsi:</strong> Kandidat telah menerima penawaran kerja. Proses rekrutmen selesai.</p>
                        </div>
                    </div>
                    <div class="modal-info-item">
                        ${createIlustration('x')}
                        <div>
                            <h3>Ditolak</h3>
                            <p><strong>Deskripsi:</strong> Kandidat tidak lolos di salah satu tahap (Screening, Interview, Tes, dll.).</p>
                        </div>
                    </div>
                    <div class="modal-info-item">
                        ${createIlustration('x')}
                        <div>
                            <h3>Daftar Hitam (Blacklist)</h3>
                            <p><strong>Deskripsi:</strong> Kandidat tidak akan diproses untuk lowongan apapun di masa depan karena alasan serius (misal: pemalsuan data, perilaku tidak profesional, dll.).</p>
                        </div>
                    </div>
                </div>
            `;
            break;
        case 'sumber':
            title = 'Penjelasan Sumber Lowongan';
            contentHTML = `
                <div class="modal-info-list">
                    <div class="modal-info-item">
                        ${createIlustration('globe')}
                        <div>
                            <h3>Website Karir</h3>
                            <p><strong>Deskripsi:</strong> Kandidat melamar langsung melalui halaman karir di website resmi perusahaan Anda.</p>
                        </div>
                    </div>
                    <div class="modal-info-item">
                        ${createIlustration('clipboard')}
                        <div>
                            <h3>Job Portal (Jobstreet, etc)</h3>
                            <p><strong>Deskripsi:</strong> Lamaran datang dari platform pencari kerja pihak ketiga seperti Jobstreet, Glints, Kalibrr, dan sejenisnya.</p>
                        </div>
                    </div>
                    <div class="modal-info-item">
                        ${createIlustration('users')}
                        <div>
                            <h3>LinkedIn</h3>
                            <p><strong>Deskripsi:</strong> Lamaran datang dari platform LinkedIn, baik melalui fitur "Easy Apply" atau dihubungi langsung oleh perekrut (sourced).</p>
                        </div>
                    </div>
                    <div class="modal-info-item">
                        ${createIlustration('globe')}
                        <div>
                            <h3>Media Sosial (IG, FB, etc)</h3>
                            <p><strong>Deskripsi:</strong> Kandidat menemukan info lowongan dan melamar melalui platform media sosial seperti Instagram, Facebook, Twitter (X), atau TikTok.</p>
                        </div>
                    </div>
                    <div class="modal-info-item">
                        ${createIlustration('users')}
                        <div>
                            <h3>Referral Karyawan</h3>
                            <p><strong>Deskripsi:</strong> Kandidat direkomendasikan oleh karyawan internal yang sudah bekerja di perusahaan.</p>
                        </div>
                    </div>
                    <div class="modal-info-item">
                        ${createIlustration('clipboard')}
                        <div>
                            <h3>Job Fair</h3>
                            <p><strong>Deskripsi:</strong> Lamaran diterima secara fisik (atau digital) saat acara bursa kerja (Job Fair).</p>
                        </div>
                    </div>
                    <div class="modal-info-item">
                        ${createIlustration('search')}
                        <div>
                            <h3>Lainnya</h3>
                            <p><strong>Deskripsi:</strong> Sumber lain yang tidak termasuk dalam kategori di atas (misal: walk-in, lamaran via email umum, dll.).</p>
                        </div>
                    </div>
                </div>
            `;
            break;
    }

    contentHTML = `
        <div class="modal-info-content">
            ${contentHTML}
            <footer class="modal-credit">
                Sumber Informasi: Proses Bisnis Internal HRD
            </footer>
        </div>
    `;

    return { title, contentHTML };
}

function showInfoModal(key) {
    const { title, contentHTML } = getModalContentFor(key);

    emit('ui.modal.create', 'formView', {
        title: title,
        content: contentHTML,
        footer:'',
        layoutClass: 'modal-large'
    });
}


export { initHrdApplicantsFormPage };