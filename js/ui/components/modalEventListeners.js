import { $ } from "../../utils/dom.js";
import { handleProcessBillPayment, handleProcessPayment } from "../../services/data/transactions/paymentService.js";
import { handleUpdateAttendance } from "../../services/data/attendanceService.js";
import { handleAddMasterItem, handleUpdateMasterItem, _saveNewMasterMaterial } from "../../services/data/masterDataService.js";
import { signInWithGoogle, handleLogout } from "../../services/authService.js";
import { createModal, closeModal, closeModalImmediate } from "./modal.js";
import { toast } from "./toast.js";
import { fmtIDR, parseFormattedNumber, parseLocaleNumber } from "../../utils/formatters.js";
import { initCustomSelects, formatNumberInput, attachPengeluaranFormListeners } from "./forms/index.js";
import { emit, on, off } from "../../state/eventBus.js";
import { appState } from "../../state/appState.js";


export function attachModalEventListeners(type, data, closeModalFunc, contextElement = document, signal) {
    const query = (selector) => contextElement.querySelector(selector);
    const queryAll = (selector) => Array.from(contextElement.querySelectorAll(selector));

    const closeBtns = queryAll('.modal-close-btn, [data-action="close-modal"]');    closeBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault(); // Hentikan aksi default jika ada
            const modalEl = e.target.closest('.modal-bg');
            if (modalEl) {
                closeModal(modalEl); // Panggil fungsi closeModal yang cerdas
            }
        }, { signal });
    });

    const actionHandlers = {
        'login': () => query('#google-login-btn')?.addEventListener('click', signInWithGoogle, { signal }),
        'confirmLogout': () => query('#confirm-logout-btn')?.addEventListener('click', () => { handleLogout(); closeModalFunc(); }, { signal }),
        'uploadSource': () => {
            queryAll('[data-source]').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    if (data.onSelect) {
                        data.onSelect(btn.dataset.source, e); // PERBAIKAN: Teruskan event
                    }
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                }, { signal });
            });
        },
        'confirmExpense': () => {
            query('#confirm-paid-btn')?.addEventListener('click', () => { if (data.onConfirm) data.onConfirm('paid'); closeModalFunc(); }, { signal });
            query('#confirm-bill-btn')?.addEventListener('click', () => { if (data.onConfirm) data.onConfirm('unpaid'); closeModalFunc(); }, { signal });
        },
        'payment': () => {
            const form = query('#payment-form');
            if (!form) return;
            queryAll('input[inputmode="numeric"]', form).forEach(input => input.addEventListener('input', formatNumberInput, { signal }));
        },
        'manageMaster': () => {
             initCustomSelects(contextElement);
             queryAll('input[inputmode="numeric"]').forEach(i => i.addEventListener('input', formatNumberInput, { signal }));
             if (query('[data-type="staff"]')) emit('ui.form.attachStaffListeners', contextElement);
        },
        'editMaster': () => actionHandlers['manageMaster'](),
        'editItem': () => {
            initCustomSelects(contextElement);
            queryAll('input[inputmode="numeric"]').forEach(input => input.addEventListener('input', formatNumberInput, { signal }));
            if (query('#material-invoice-form') || query('#edit-item-form[data-type="expense"] #invoice-items-container')) {
                attachPengeluaranFormListeners('material', contextElement);
            }
        },
        'editAttendance': () => {
            const form = query('#edit-attendance-form');
             if(form && form.dataset.type === 'manual'){
                initCustomSelects(form);
                query('input[name="customWage"]', form)?.addEventListener('input', formatNumberInput, {signal});
             }
        },
         'dataDetail': () => {
             initCustomSelects(contextElement);
             queryAll('input[inputmode="numeric"]', contextElement).forEach(i => i.addEventListener('input', formatNumberInput, { signal }));
         },
         'formView': () => {
              initCustomSelects(contextElement);
              queryAll('input[inputmode="numeric"]', contextElement).forEach(i => i.addEventListener('input', formatNumberInput, { signal }));
         },
         'imageView': () => {},
         'invoiceItemsDetail': () => {},
         'actionsPopup': () => {},
         'reportGenerator': () => {},
         'welcomeOnboarding': () => {},
    };

    if (type.startsWith('confirm')) {
        const confirmBtn = query('#confirm-btn');
        if (confirmBtn) {
            // PERBAIKAN: Jadikan listener async untuk await onConfirm
            confirmBtn.addEventListener('click', async (e) => { 
                e.stopPropagation();
                
                confirmBtn.disabled = true; 
                
                if (data.onConfirm) {
                    try {
                        const statusOverrideInput = contextElement.querySelector('input[name="status-override"]:checked');
                        let promise;
                        if (statusOverrideInput) {
                            promise = data.onConfirm(statusOverrideInput.value);
                        } else {
                            promise = data.onConfirm();
                        }
                        
                        // PERBAIKAN: Await promise
                        if (promise && typeof promise.then === 'function') {
                            const result = await promise; 
                            // PERBAIKAN: Jika onConfirm return false (gagal/dibatalkan), jangan tutup modal
                            if (result === false) {
                               confirmBtn.disabled = false; // Aktifkan lagi tombol
                               return; // Hentikan eksekusi, jangan tutup modal
                            }
                        }
                    } catch (syncErr) {
                        console.error("Error starting onConfirm:", syncErr);
                        confirmBtn.disabled = false; // Aktifkan lagi tombol jika error
                        return; // Jangan tutup modal jika onConfirm error
                    }
                }

                closeModalFunc();

            }, { signal });
        }
    }
    if (actionHandlers[type]) {
        actionHandlers[type]();
    } else if (!type.startsWith('confirm')) {
         initCustomSelects(contextElement);
         queryAll('input[inputmode="numeric"]', contextElement).forEach(i => i.addEventListener('input', formatNumberInput, { signal }));
    }
}
