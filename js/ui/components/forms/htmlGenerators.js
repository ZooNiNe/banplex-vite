import { fmtIDR } from "../../../utils/formatters.js";
import { appState } from "../../../state/appState.js";
import { isViewer, getJSDate, toProperCase } from "../../../utils/helpers.js";
import { _createAttachmentManagerHTML } from "./attachmentManager.js";
import { masterDataConfig } from "../../../config/constants.js";
import { createMasterDataSelect } from "./customSelect.js";

function createIcon(iconName, size = 18, classes = '') {
    const icons = {
        save: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-save ${classes}"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>`,
        wallet: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-wallet ${classes}"><path d="M21 12V7H5a2 2 0 0 1 0-4h14a2 2 0 0 1 2 2v4Z"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2Z"/></svg>`,
        'receipt-text': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-receipt-text ${classes}"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1Z"/><path d="M14 8H8"/><path d="M16 12H8"/><path d="M13 16H8"/></svg>`,
        archive: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-archive ${classes}"><rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/></svg>`,
        tag: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-tag ${classes}"><path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.432 0l6.568-6.568a2.426 2.426 0 0 0 0-3.432l-8.704-8.704Z"/><path d="M6 9h.01"/></svg>`,
        database: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-database ${classes}"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/></svg>`,
        'trash-2': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trash-2 ${classes}"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>`,
        'plus-circle': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-plus-circle ${classes}"><circle cx="12" cy="12" r="10"/><path d="M8 12h8"/><path d="M12 8v8"/></svg>`,
        pencil: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-pencil ${classes}"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>`,
        info: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-info ${classes}"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>`
    };
    return icons[iconName] || '';
}

function safeYMD(dateVal, fallbackYMD) {
    try {
        if (!dateVal) return fallbackYMD;
        const d = getJSDate(dateVal);
        return isNaN(d.getTime()) ? fallbackYMD : d.toISOString().slice(0, 10);
    } catch (_) {
        return fallbackYMD;
    }
}

export function _createFormGroupHTML(id, labelText, inputHTML) {
  const inputWithId = inputHTML.includes(' id=') ? inputHTML : inputHTML.replace(/<(\w+)/, `<$1 id="${id}"`);

  return `
      <div class="form-group">
          <label for="${id}">${labelText}</label>
          ${inputWithId}
      </div>
  `;
}

export function getFormPengeluaranHTML(type, categoryOptions, categoryMasterType, categoryLabel, supplierOptions, projectOptions, itemData = null) {
    const isEdit = !!itemData;
    const formId = isEdit ? 'edit-item-form' : 'pengeluaran-form';
    const formActionAttrs = isEdit
        ? `data-id="${itemData.id}" data-type="expense"`
        : `data-type="${type}"`;

    const today = new Date();
    const offset = today.getTimezoneOffset();
    const todayLocal = new Date(today.getTime() - (offset * 60 * 1000));

    const amountValue = isEdit ? new Intl.NumberFormat('id-ID').format(itemData.amount) : '';
    const dateValue = isEdit ? safeYMD(itemData.date, todayLocal.toISOString().split('T')[0]) : todayLocal.toISOString().split('T')[0];
    const descriptionValue = isEdit ? itemData.description : '';
    const notesValue = isEdit ? itemData.notes || '' : '';
    const selectedProjectId = isEdit ? itemData.projectId : '';
    const selectedCategoryId = isEdit ? itemData.categoryId : '';
    const selectedSupplierId = isEdit ? itemData.supplierId : '';

    const editNoticeHTML = isEdit ? `<p class="form-notice full-width">Untuk mengubah status pembayaran (misal: membayar tagihan), silakan lakukan dari halaman **Tagihan**.</p>` : '';

    const attachmentHTML = _createAttachmentManagerHTML(itemData || {}, { inputName: 'attachment', containerId: 'new-attachment-container' });

    const submitButtonHTML = `
        <div class="form-footer-actions full-width">
            <button type="submit" id="pengeluaran-submit-btn" class="btn btn-primary">
                ${createIcon('save')}
                <span>Simpan Pengeluaran</span>
            </button>
        </div>
        <p class="form-notice full-width">Pastikan semua data terisi dengan benar sebelum menyimpan.</p>
    `;

    const heroHTML = `
        <div class="success-hero success-hero--expense" style="margin-bottom:.75rem;">
            <svg class="success-hero-art" width="120" height="88" viewBox="0 0 120 88" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <defs>
                    <linearGradient id="fg1" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stop-color="var(--primary)" stop-opacity="0.18" />
                        <stop offset="100%" stop-color="var(--primary)" stop-opacity="0.05" />
                    </linearGradient>
                </defs>
                <rect x="8" y="12" width="84" height="52" rx="10" fill="url(#fg1)" stroke="var(--line)"/>
                <rect x="20" y="26" width="40" height="8" rx="4" fill="var(--primary)" opacity="0.25" />
                <rect x="20" y="40" width="30" height="8" rx="4" fill="var(--primary)" opacity="0.15" />
            </svg>
            <div class="success-preview-icon">${createIcon('receipt-text', 24)}</div>
        </div>`;

    const formContent = `
        <form id="${formId}" class="desktop-form-layout" ${formActionAttrs} data-async="${!isEdit}">
            <div class="form-grid-2col">
                ${createMasterDataSelect('expense-project', 'Proyek', projectOptions, selectedProjectId, 'projects', true)}
                ${createMasterDataSelect('expense-category', categoryLabel, categoryOptions, selectedCategoryId, categoryMasterType, true)}

                <div class="form-group">
                    <label>Jumlah</label>
                    <input type="text" id="pengeluaran-jumlah" name="amount" inputmode="numeric" required placeholder="mis. 50.000" value="${amountValue}">
                </div>
                <div class="form-group">
                    <label>Tanggal</label>
                    <input type="date" id="pengeluaran-tanggal" name="date" value="${dateValue}" required>
                </div>

                <div class="form-group full-width">
                    <label>Deskripsi</label>
                    <input type="text" id="pengeluaran-deskripsi" name="description" required placeholder="mis. Beli ATK" value="${descriptionValue}" data-proper-case="true">
                </div>

                ${createMasterDataSelect('expense-supplier', 'Supplier/Penerima', supplierOptions, selectedSupplierId, 'suppliers', true)}

                <div class="form-group full-width">
                    <label for="pengeluaran-catatan">Catatan (Opsional)</label>
                    <textarea id="pengeluaran-catatan" name="notes" rows="3" data-proper-case="true" placeholder="Tambahkan catatan jika perlu...">${notesValue}</textarea>
                </div>
            </div>
            ${attachmentHTML}
            ${editNoticeHTML}
            ${isEdit ? '' : submitButtonHTML}
        </form>
    `;

    return `<div class="card card-pad">${heroHTML}${formContent}</div>`;
}


export function getFormPemasukanHTML(type, itemData = null) {
    const isEdit = !!itemData;
    const formId = isEdit ? 'edit-item-form' : 'pemasukan-form';
    const formActionAttrs = isEdit
        ? `data-id="${itemData.id}" data-type="${type}"`
        : `data-type="${type}" data-async="true"`;
    const submitText = isEdit ? 'Simpan Perubahan' : 'Simpan';
    const submitButtonHTML = `
        <div class="form-footer-actions full-width">
            <button type="submit" id="pemasukan-submit-btn" class="btn btn-primary">
                ${createIcon('save')}
                <span>${submitText}</span>
            </button>
        </div>
    `;

    const today = new Date();
    const offset = today.getTimezoneOffset();
    const todayLocal = new Date(today.getTime() - (offset * 60 * 1000));
    const todayString = todayLocal.toISOString().split('T')[0];
    const notesValue = isEdit ? itemData?.notes || '' : '';

    let formHTML = '';

    if (type === 'termin') {
        const projectOptions = (appState.projects || [])
            .filter(p => p.projectType === 'main_income' && !p.isDeleted)
            .map(p => ({
                value: p.id,
                text: p.projectName
            }));

        const amountValue = isEdit ? new Intl.NumberFormat('id-ID').format(itemData.amount) : '';
        const dateValue = isEdit ? safeYMD(itemData.date, todayString) : todayString;
        const selectedProjectId = isEdit ? itemData.projectId : '';

        const heroHTML = `
            <div class=\"success-hero success-hero--income\" style=\"margin-bottom:.75rem;\"> 
                <svg class=\"success-hero-art\" width=\"120\" height=\"88\" viewBox=\"0 0 120 88\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\" aria-hidden=\"true\">
                    <defs>
                        <linearGradient id=\"fm1\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\">
                            <stop offset=\"0%\" stop-color=\"var(--primary)\" stop-opacity=\"0.18\" />
                            <stop offset=\"100%\" stop-color=\"var(--primary)\" stop-opacity=\"0.05\" />
                        </linearGradient>
                    </defs>
                    <rect x=\"8\" y=\"12\" width=\"84\" height=\"52\" rx=\"10\" fill=\"url(#fm1)\" stroke=\"var(--line)\"/>
                    <rect x=\"20\" y=\"26\" width=\"40\" height=\"8\" rx=\"4\" fill=\"var(--primary)\" opacity=\"0.25\" />
                    <rect x=\"20\" y=\"40\" width=\"30\" height=\"8\" rx=\"4\" fill=\"var(--primary)\" opacity=\"0.15\" />
                </svg>
                <div class=\"success-preview-icon\">${createIcon('wallet', 24)}</div>
            </div>`;

        formHTML = `
                <form id="${formId}" ${formActionAttrs}>
                    ${heroHTML}
                    <div class="form-grid-2col">
                        ${createMasterDataSelect('pemasukan-proyek', 'Proyek Terkait', projectOptions, selectedProjectId, 'projects', true)}
                        <div class="form-group">
                            <label>Jumlah Termin Diterima</label>
                            <input type="text" inputmode="numeric" id="pemasukan-jumlah" name="amount" required placeholder="Masukkan jumlah termin..." value="${amountValue}">
                        </div>
                        <div class="form-group">
                            <label>Tanggal</label>
                            <input type="date" id="pemasukan-tanggal" name="date" value="${dateValue}" required>
                        </div>
                        <div class="form-group full-width">
                            <label for="pemasukan-catatan">Catatan (Opsional)</label>
                            <textarea id="pemasukan-catatan" name="notes" rows="3" data-proper-case="true" placeholder="Tambahkan catatan jika perlu...">${notesValue}</textarea>
                        </div>
                        <div id="fee-allocation-container" class="full-width"></div>
                    </div>
                     <p class="form-notice full-width">
                        ${createIcon('info', 16)} Termin akan dialokasikan sebagai pemasukan utama. Fee Staf (jika ada) akan dihitung otomatis berdasarkan pengaturan staf.
                     </p>
                     
                     ${isEdit ? '' : submitButtonHTML}
                </form>
        `;
    } else if (type === 'pinjaman') {
        const creditorOptions = (appState.fundingCreditors || []).filter(c => !c.isDeleted).map(c => ({
            value: c.id,
            text: c.creditorName
        }));
        const loanTypeOptions = [
            { value: 'none', text: 'Tanpa Bunga' },
            { value: 'interest', text: 'Berbunga' }
        ];

        const amountValue = isEdit ? new Intl.NumberFormat('id-ID').format(itemData.totalAmount) : '';
        const dateValue = isEdit ? safeYMD(itemData.date, todayString) : todayString;
        const selectedCreditorId = isEdit ? itemData.creditorId : '';
        const selectedInterestType = isEdit ? itemData.interestType : 'none';
        const rateValue = isEdit ? itemData.rate || '' : '';
        const tenorValue = isEdit ? itemData.tenor || '' : '';

        const initialHiddenClass = selectedInterestType === 'none' ? 'hidden' : '';

        const heroHTML2 = `
            <div class=\"success-hero success-hero--income\" style=\"margin-bottom:.75rem;\"> 
                <svg class=\"success-hero-art\" width=\"120\" height=\"88\" viewBox=\"0 0 120 88\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\" aria-hidden=\"true\">
                    <defs>
                        <linearGradient id=\"fm2\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\">
                            <stop offset=\"0%\" stop-color=\"var(--primary)\" stop-opacity=\"0.18\" />
                            <stop offset=\"100%\" stop-color=\"var(--primary)\" stop-opacity=\"0.05\" />
                        </linearGradient>
                    </defs>
                    <rect x=\"8\" y=\"12\" width=\"84\" height=\"52\" rx=\"10\" fill=\"url(#fm2)\" stroke=\"var(--line)\"/>
                    <rect x=\"20\" y=\"26\" width=\"36\" height=\"8\" rx=\"4\" fill=\"var(--primary)\" opacity=\"0.25\" />
                    <rect x=\"20\" y=\"40\" width=\"28\" height=\"8\" rx=\"4\" fill=\"var(--primary)\" opacity=\"0.15\" />
                </svg>
                <div class=\"success-preview-icon\">${createIcon('wallet', 24)}</div>
            </div>`;

        formHTML = `
                <form id="${formId}" ${formActionAttrs}>
                    ${heroHTML2}
                    <div class="form-grid-2col">
                        <div class="form-group">
                            <label>Jumlah Pokok Pinjaman</label>
                            <input type="text" inputmode="numeric" id="pemasukan-jumlah" name="totalAmount" required placeholder="Masukkan jumlah pokok pinjaman..." value="${amountValue}">
                        </div>
                        <div class="form-group">
                            <label>Tanggal</label>
                            <input type="date" id="pemasukan-tanggal" name="date" value="${dateValue}" required>
                        </div>

                        ${createMasterDataSelect('pemasukan-kreditur', 'Kreditur', creditorOptions, selectedCreditorId, 'creditors', true)}

                        ${createMasterDataSelect('loan-interest-type', 'Jenis Pinjaman', loanTypeOptions, selectedInterestType, null, true)}

                        <div class="form-group full-width">
                            <label for="pemasukan-catatan">Catatan (Opsional)</label>
                            <textarea id="pemasukan-catatan" name="notes" rows="3" data-proper-case="true" placeholder="Tambahkan catatan jika perlu...">${notesValue}</textarea>
                        </div>
                    </div>

                    <div class="loan-details ${initialHiddenClass} full-width">
                        <div class="form-grid-2col">
                            <div class="form-group">
                                <label>Suku Bunga (% per bulan)</label>
                                <input type="number" id="loan-rate" name="rate" placeholder="Contoh: 1.5" step="0.01" min="0" value="${rateValue}">
                            </div>
                            <div class="form-group">
                                <label>Tenor (bulan)</label>
                                <input type="number" id="loan-tenor" name="tenor" placeholder="Contoh: 12" min="1" step="1" value="${tenorValue}">
                            </div>
                        </div>
                        <div id="loan-calculation-result" class="loan-calculation-result full-width"></div>
                    </div>
                     <p class="form-notice full-width">
                        ${createIcon('info', 16)} Masukkan detail pinjaman. Jika pinjaman berbunga, isi suku bunga per bulan dan tenor untuk menghitung total pengembalian.
                     </p>
                     
                     ${isEdit ? '' : submitButtonHTML}
                </form>
        `;
    }

    return `<div class="card card-pad desktop-form-layout">${formHTML}</div>`;
}

export function getFormFakturMaterialHTML(itemData = null, options = {}) {
    const { convertToInvoice = false, suppressInlineSubmit = false } = options;
    const isEdit = !!itemData;
    const formId = isEdit ? 'edit-item-form' : 'material-invoice-form';
    const formActionAttrs = isEdit ? `data-id="${itemData.id}" data-type="expense"` : `data-type="material"`;

    const dateValue = isEdit ? safeYMD(itemData.date, new Date().toISOString().slice(0, 10)) : new Date().toISOString().slice(0, 10);
    const descriptionValue = isEdit ? itemData.description : `INV/${new Date().getFullYear()}${(new Date().getMonth() + 1).toString().padStart(2, '0')}${new Date().getDate().toString().padStart(2, '0')}/${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
    const notesValue = isEdit ? itemData.notes || '' : '';
    const selectedProjectId = isEdit ? itemData.projectId : '';
    const selectedSupplierId = isEdit ? itemData.supplierId : '';
    const formType = (isEdit && !convertToInvoice) ? (itemData.formType || 'faktur') : 'faktur';
    const finalFormType = convertToInvoice ? 'faktur' : formType;

    const supplierOptions = (appState.suppliers || []).filter(s => s.category === 'Material' && !s.isDeleted).map(s => ({ value: s.id, text: s.supplierName }));
    const projectOptions = (appState.projects || []).filter(p => !p.isDeleted).map(p => ({ value: p.id, text: p.projectName }));

    let initialItemsHTML = '';
    if (isEdit && itemData.items && itemData.items.length > 0) {
        initialItemsHTML = itemData.items.map((item, index) => {
            const priceNum = item.price || 0;
            const qtyNum = item.qty || 0;
            const materialOptions = (appState.materials || []).filter(m => !m.isDeleted).map(m => ({ value: m.id, text: m.materialName }));
            const isSuratJalan = formType === 'surat_jalan' && !convertToInvoice;
            
            const materialDropdownHTML = createMasterDataSelect(`materialId_${index}`, '', materialOptions, item.materialId, 'materials', true)
                .replace('<div class="form-group">', '').replace('</div>', '')
                .replace(`<button type="button" class="btn-icon master-data-trigger" data-action="manage-master" data-type="materials">${createIcon('database')}</button>`, '');
            const priceValue = isSuratJalan ? fmtIDR(0).replace('Rp', '').trim() : (priceNum ? new Intl.NumberFormat('id-ID').format(priceNum) : '');
            const priceLabel = isSuratJalan ? 'Harga Satuan (Rp 0)' : 'Harga Satuan';

            return `
                <div class="multi-item-row" data-index="${index}">
                    <div class="multi-item-main-line">
                        <div class="item-name-wrapper">
                            ${materialDropdownHTML} 
                        </div>
                        <button type="button" class="btn-icon btn-icon-danger remove-item-btn" data-action="remove-item-btn">${createIcon('trash-2')}</button>
                    </div>
                    <div class="multi-item-details-line">
                        <div class="form-group">
                            <label>Qty</label>
                            <input type="text" inputmode="decimal" pattern="[0-9]+([\\.,][0-9]+)?" name="itemQty" placeholder="Jumlah" class="item-qty" value="${qtyNum || '1'}" required>
                        </div>
                        <div class="form-group">
                            <label>${priceLabel}</label>
                            <input type="text" inputmode="numeric" name="itemPrice" placeholder="Harga satuan..." class="item-price" value="${priceValue}" ${isSuratJalan ? 'readonly' : 'required'}>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    } else if (!isEdit) {
        const materialOptions = (appState.materials || []).filter(m => !m.isDeleted).map(m => ({ value: m.id, text: m.materialName }));
        const isSuratJalan = formType === 'surat_jalan' && !convertToInvoice;
        const priceValue = isSuratJalan ? fmtIDR(0).replace('Rp', '').trim() : '';
        const priceLabel = isSuratJalan ? 'Harga Satuan (Rp 0)' : 'Harga Satuan';
        
        const materialDropdownHTML = createMasterDataSelect(`materialId_0`, '', materialOptions, '', 'materials', true)
            .replace('<div class="form-group">', '').replace('</div>', '')
            .replace(`<button type="button" class="btn-icon master-data-trigger" data-action="manage-master" data-type="materials">${createIcon('database')}</button>`, '');

        initialItemsHTML = `
             <div class="multi-item-row" data-index="0">
                <div class="multi-item-main-line">
                    <div class="item-name-wrapper">
                         ${materialDropdownHTML} 
                    </div>
                    <button type="button" class="btn-icon btn-icon-danger remove-item-btn">${createIcon('trash-2')}</button>
                </div>
                <div class="multi-item-details-line">
                    <div class="form-group">
                        <label>Qty</label>
                        <input type="text" inputmode="decimal" pattern="[0-9]+([\\.,][0-9]+)?" name="itemQty" placeholder="Jumlah" class="item-qty" value="1" required>
                    </div>
                    <div class="form-group">
                        <label>${priceLabel}</label>
                        <input type="text" inputmode="numeric" name="itemPrice" placeholder="Harga satuan..." class="item-price" ${isSuratJalan ? 'readonly' : 'required'} value="${priceValue}">
                    </div>
                </div>
            </div>
        `;
    }


    const formTypeToggleHTML = !isEdit ? `
        <div class="form-group full-width">
            <label>Jenis Input</label>
            <input type="hidden" name="formType" value="${formType}">
            <div class="segmented-control" id="form-type-selector">
                <input type="radio" id="type-faktur" name="_formTypeRadio" value="faktur" ${formType === 'faktur' ? 'checked' : ''}>
                <label for="type-faktur">Faktur Lengkap</label>
                <input type="radio" id="type-surat-jalan" name="_formTypeRadio" value="surat_jalan" ${formType === 'surat_jalan' ? 'checked' : ''}>
                <label for="type-surat-jalan">Surat Jalan</label>
            </div>
        </div>
    ` : `
        <div class="form-group full-width">
            <label>Jenis Input</label>
            <p class="form-notice"><strong>${itemData.formType === 'faktur' ? 'Faktur Lengkap' : 'Surat Jalan'}</strong> ${convertToInvoice ? ' (Dikonversi menjadi Faktur)' : '(tidak dapat diubah)'}</p>
            <input type="hidden" name="formType" value="${finalFormType}">
        </div>
    `;


    const attachmentHTML = _createAttachmentManagerHTML(itemData || {}, { inputName: 'attachment', containerId: 'new-attachment-container' });

    const submitButtonHTML = `
        <p class="form-notice full-width">Pastikan rincian barang dan data faktur sudah sesuai sebelum menyimpan.</p>
        <div class="form-footer-actions full-width">
            <button type="submit" id="pengeluaran-submit-btn" class="btn btn-primary">
                ${createIcon('save')}
                <span>Simpan</span>
            </button>
        </div>
    `;

    const formContent = `
        <form id="${formId}" class="desktop-form-layout" ${formActionAttrs} data-async="${!isEdit}">
            ${formTypeToggleHTML}
            <div class="form-grid-2col">
                ${createMasterDataSelect('project-id', 'Proyek', projectOptions, selectedProjectId, 'projects', true)}
                ${createMasterDataSelect('supplier-id', 'Supplier', supplierOptions, selectedSupplierId, 'suppliers', true)}
                <div class="form-group">
                    <label>No. Faktur/Surat Jalan</label>
                    <input type="text" name="description" value="${descriptionValue}" ${!isEdit ? 'class="readonly-input"' : ''} required placeholder="Masukkan nomor dokumen...">
                </div>
                <div class="form-group">
                    <label>Tanggal</label>
                    <input type="date" name="date" value="${dateValue}" required>
                </div>
                <div class="form-group full-width">
                    <label for="faktur-catatan">Catatan (Opsional)</label>
                    <textarea id="faktur-catatan" name="notes" rows="3" data-proper-case="true" placeholder="Tambahkan catatan jika perlu...">${notesValue}</textarea>
                </div>
            </div>

            <div class="section-header-flex full-width">
                <h5 class="invoice-section-title">Rincian Barang</h5>
                <button type="button" class="btn btn-secondary" data-action="manage-master" data-type="materials" title="Kelola Master Material">
                    ${createIcon('database')}<span>Master</span>
                </button>
            </div>
            <div id="invoice-items-container" class="full-width">${initialItemsHTML}</div>
            <div class="add-item-action full-width">
                <button type="button" id="add-invoice-item-btn" class="btn-icon" data-action="add-invoice-item-btn" title="Tambah Barang">${createIcon('plus-circle')}</button>
            </div>

            <div class="invoice-total full-width ${formType === 'surat_jalan' && !convertToInvoice ? 'hidden' : ''}" id="total-faktur-wrapper">
                <span>Total Faktur:</span>
                <strong id="invoice-total-amount">${fmtIDR(isEdit ? itemData.amount : 0)}</strong>
            </div>

            ${attachmentHTML}
            ${(!isEdit || convertToInvoice) && !suppressInlineSubmit ? submitButtonHTML : ''}
             <p class="form-notice full-width">
                ${createIcon('info', 16)} Masukkan rincian barang satu per satu. Untuk Surat Jalan, harga akan otomatis Rp 0. Total faktur dan status pembayaran hanya berlaku untuk Faktur Lengkap.
             </p>
        </form>
    `;

    const heroHTML_Material = `
    <div class="success-hero success-hero--material" style="margin-bottom:.75rem;">
        <svg class="success-hero-art" width="120" height="88" viewBox="0 0 120 88" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <defs>
                <linearGradient id="mat1" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stop-color="var(--primary)" stop-opacity="0.18" />
                    <stop offset="100%" stop-color="var(--primary)" stop-opacity="0.05" />
                </linearGradient>
            </defs>
            <rect x="8" y="12" width="84" height="52" rx="10" fill="url(#mat1)" stroke="var(--line)"/>
            <rect x="20" y="26" width="40" height="8" rx="4" fill="var(--primary)" opacity="0.25" />
            <rect x="20" y="40" width="30" height="8" rx="4" fill="var(--primary)" opacity="0.15" />
        </svg>
        <div class="success-preview-icon">${createIcon('archive', 24)}</div>
    </div>`;

    return `
    <div class="card card-pad" style="padding-top: 1.5rem;">
        ${heroHTML_Material}
        ${formContent}
    </div>
`;
}

export async function getMasterDataFormHTML(type, itemData = null) {
    const isEdit = !!itemData;
    const config = masterDataConfig[type];
    if (!config) return '<p class="empty-state">Form tidak tersedia untuk tipe data ini.</p>';

    const formId = 'master-data-form';
    const formAction = isEdit ? 'updateMasterItem' : 'addMasterItem';
    const notesValue = isEdit ? itemData.notes || '' : '';

    let fieldsHTML = `
        <div class="form-group">
            <label for="itemName">${config.title}</label>
            <input type="text" id="itemName" name="itemName" value="${isEdit ? (itemData[config.nameField] || '') : ''}" required data-proper-case="true" placeholder="Masukkan ${config.title}">
        </div>
    `;
    switch (type) {
        case 'materials':
            fieldsHTML += `
                <div class="form-group">
                    <label for="itemUnit">Satuan</label>
                    <input type="text" id="itemUnit" name="itemUnit" value="${isEdit ? (itemData.unit || '') : ''}" placeholder="Contoh: Zak, Pcs, M3" required>
                </div>
                <div class="form-group">
                    <label for="reorderPoint">Jumlah Pembelian Minimal (Opsional)</label>
                    <input type="number" id="reorderPoint" name="reorderPoint" value="${isEdit ? (itemData.reorderPoint || '0') : '0'}" min="0" required>
                </div>
            `;
            break;
        case 'suppliers':
            fieldsHTML += createMasterDataSelect('itemCategory', 'Kategori Supplier', [
                { value: 'Material', text: 'Material' },
                { value: 'Operasional', text: 'Operasional' },
                { value: 'Lainnya', text: 'Lainnya' }
            ], isEdit ? itemData.category : 'Material', null, true);
            break;
        case 'projects':
             fieldsHTML += `
                ${createMasterDataSelect('projectType', 'Tipe Proyek', [
                    { value: 'main_income', text: 'Proyek Utama (Pendapatan)' },
                    { value: 'internal_expense', text: 'Proyek Internal (Beban)' }
                ], isEdit ? itemData.projectType : 'internal_expense', null, true)}
                <div class="form-group">
                    <label for="budget">Anggaran (Opsional)</label>
                    <input type="text" id="budget" name="budget" inputmode="numeric" value="${isEdit && itemData.budget ? new Intl.NumberFormat('id-ID').format(itemData.budget) : '0'}" placeholder="Contoh: 100.000.000">
                </div>
                <div class="form-group">
                     <label class="custom-checkbox-label">
                        <input type="checkbox" name="isWageAssignable" ${isEdit && itemData.isWageAssignable ? 'checked' : ''}>
                        <span class="custom-checkbox-visual"></span>
                        <span>Dapat dialokasikan upah pekerja</span>
                    </label>
                </div>
             `;
            break;
        case 'workers': {
            const professionOptions = (appState.professions || []).filter(p => !p.isDeleted).map(p => ({ value: p.id, text: p.professionName }));
            const statusOptions = [
                { value: 'active', text: 'Aktif' },
                { value: 'inactive', text: 'Non-Aktif' }
            ];

            let wagesSummaryHTML = '<p class="empty-state-small empty-state-small--left">Belum ada pengaturan upah.</p>';
            if (isEdit && itemData.projectWages) {
                const projectWages = Object.entries(itemData.projectWages);
                if (projectWages.length > 0) {
                    wagesSummaryHTML = projectWages.map(([projectId, roles]) => {
                        const project = appState.projects.find(p => p.id === projectId);
                        if (!project) return '';
                        const rolesHTML = Object.entries(roles).map(([name, wage]) => `<span class="badge">${name}: ${new Intl.NumberFormat('id-ID').format(wage)}</span>`).join(' ');
                        return `
                            <div class="worker-wage-summary-item" data-project-id="${projectId}" data-wages='${JSON.stringify(roles)}'>
                              <div class="dense-list-item">
                                <div class="item-main-content">
                                    <strong class="item-title">${project.projectName}</strong>
                                    <div class="item-sub-content role-summary">${rolesHTML}</div>
                                </div>
                                <div class="item-actions">
                                  <button type="button" class="btn-icon" title="Edit" data-action="edit-worker-wage">${createIcon('pencil')}</button>
                                  <button type="button" class="btn-icon btn-icon-danger" title="Hapus" data-action="remove-worker-wage">${createIcon('trash-2')}</button>
                                </div>
                              </div>
                            </div>`;
                    }).join('');
                     if (wagesSummaryHTML.trim() === '') wagesSummaryHTML = '<p class="empty-state-small empty-state-small--left">Belum ada pengaturan upah (proyek terkait mungkin sudah dihapus).</p>';
                }
            }


            fieldsHTML += `
                ${createMasterDataSelect('professionId', 'Profesi', professionOptions, isEdit ? itemData.professionId : '', 'professions', true)}
                ${createMasterDataSelect('workerStatus', 'Status', statusOptions, isEdit ? itemData.status : 'active', null, true)}
                <div class="form-group full-width">
                    <label>Pengaturan Upah per Proyek</label>
                    <div class="card" style="padding: 1rem; background-color: var(--surface-muted);">
                        <div id="worker-wages-summary-list" class="dense-list-container">${wagesSummaryHTML}</div>
                        <button type="button" class="btn btn-secondary" data-action="add-worker-wage" style="margin-top: 1rem;">Tambah Pengaturan Upah</button>
                    </div>
                     <p class="form-notice">
                        ${createIcon('info', 16)} Tentukan upah harian spesifik untuk setiap peran pekerja di masing-masing proyek yang relevan.
                     </p>
                </div>
            `;
            break;
        }
        case 'staff':
            fieldsHTML += `
                ${createMasterDataSelect('paymentType', 'Tipe Pembayaran', [
                    { value: 'fixed_monthly', text: 'Gaji Tetap Bulanan' },
                    { value: 'per_termin', text: 'Fee per Termin (%)' },
                    { value: 'fixed_per_termin', text: 'Fee Tetap per Termin' }
                ], isEdit ? itemData.paymentType : '', null, true)}

                <div class="form-group staff-payment-field staff-salary-group" style="display:none;">
                    <label for="salary">Gaji Bulanan</label>
                    <input type="text" id="salary" name="salary" inputmode="numeric" value="${isEdit && itemData.salary ? new Intl.NumberFormat('id-ID').format(itemData.salary) : ''}" placeholder="Contoh: 5.000.000">
                </div>

                <div class="form-group staff-payment-field staff-fee-group" style="display:none;">
                    <label for="feePercentage">Persentase Fee (%)</label>
                    <input type="number" id="feePercentage" name="feePercentage" step="0.1" value="${isEdit ? (itemData.feePercentage || '') : ''}" placeholder="Contoh: 2.5">
                </div>

                <div class="form-group staff-payment-field staff-fee-amount-group" style="display:none;">
                    <label for="feeAmount">Nominal Fee Tetap</label>
                    <input type="text" id="feeAmount" name="feeAmount" inputmode="numeric" value="${isEdit && itemData.feeAmount ? new Intl.NumberFormat('id-ID').format(itemData.feeAmount) : ''}" placeholder="Contoh: 500.000">
                </div>
                 <p class="form-notice full-width">
                    ${createIcon('info', 16)} Pilih tipe pembayaran dan isi nominal yang sesuai. Fee per termin akan otomatis dihitung saat input termin baru.
                 </p>
            `;
            break;
    }


    const notesHTML = `
        <div class="form-group">
            <label for="notes">Catatan (Opsional)</label>
            <textarea id="notes" name="notes" rows="3" data-proper-case="true" placeholder="Tambahkan catatan jika ada...">${notesValue}</textarea>
        </div>
    `;

    const submitButtonText = isEdit ? 'Simpan Perubahan' : 'Simpan Data Baru';

    const variantClass = type === 'materials' ? 'success-hero--material'
        : type === 'suppliers' ? 'success-hero--expense'
        : type === 'projects' ? 'success-hero--income'
        : (type === 'workers' || type === 'staff') ? 'success-hero--attendance'
        : '';
    const heroHTML_Master = `
        <div class="success-hero ${variantClass}" style="margin-bottom:.75rem;">
            <svg class="success-hero-art" width="120" height="88" viewBox="0 0 120 88" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <defs>
                    <linearGradient id="md1" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stop-color="var(--primary)" stop-opacity="0.18" />
                        <stop offset="100%" stop-color="var(--primary)" stop-opacity="0.05" />
                    </linearGradient>
                </defs>
                <rect x="8" y="12" width="84" height="52" rx="10" fill="url(#md1)" stroke="var(--line)"/>
                <rect x="20" y="26" width="36" height="8" rx="4" fill="var(--primary)" opacity="0.25" />
                <rect x="20" y="40" width="28" height="8" rx="4" fill="var(--primary)" opacity="0.15" />
            </svg>
            <div class="success-preview-icon">${createIcon('save', 24)}</div>
        </div>`;

    return `
        <div class="card card-pad">
            ${heroHTML_Master}
            <form id="${formId}" data-action="${formAction}" data-type="${type}" ${isEdit ? `data-id="${itemData.id}"` : ''}>
                ${fieldsHTML}
                ${notesHTML}
                <div class="form-footer-actions">
                    <button type="submit" class="btn btn-primary">${submitButtonText}</button>
                </div>
            </form>
        </div>
    `;
}
