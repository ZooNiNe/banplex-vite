import { emit, on } from "../../state/eventBus.js";
import { appState } from "../../state/appState.js";
import { localDB, loadAllLocalDataToState } from "../localDbService.js";
import { db, billsCol, attendanceRecordsCol, workersCol, professionsCol } from "../../config/firebase.js";
import { getDocs, query, where, writeBatch, doc, collection, serverTimestamp, increment, getDoc } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";
import { generateUUID, getJSDate, parseLocalDate, getLocalDayBounds } from "../../utils/helpers.js";
import { syncToServer, requestSync } from "../syncService.js";
import { toast } from "../../ui/components/toast.js";
import { _logActivity } from "../logService.js";
import { fmtIDR, parseFormattedNumber } from "../../utils/formatters.js";
import { createTabsHTML } from "../../ui/components/tabs.js";
import { getEmptyStateHTML } from "../../ui/components/emptyState.js";
import { _getRekapGajiListHTML } from "../../ui/components/cards.js";
import { createListSkeletonHTML } from "../../ui/components/skeleton.js";
import { showDetailPane, createModal, closeModal } from "../../ui/components/modal.js";
import { validateForm } from "../../utils/validation.js";
import { queueOutbox } from "../outboxService.js";

function createIcon(iconName, size = 18, classes = '') {
    const icons = {
        save: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-save ${classes}"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>`,
    };
    return icons[iconName] || '';
}

export async function openSalaryRecapPanel() {
    const title = "Rekap Gaji";
    const tabs = [
        { id: 'form', label: 'Form Rekap' },
        { id: 'riwayat', label: 'Riwayat Rekap' }
    ];
    const activeTab = 'form';

    const content = `
        ${createTabsHTML({ id: 'rekap-gaji-tabs', tabs, activeTab, customClasses: 'tabs-underline two-tabs' })}
        <div id="rekap-gaji-content" class="scrollable-content" style="padding: 1.5rem;">
        </div>
    `;

    showDetailPane({
        title,
        content,
        footer: '',
        paneType: 'salary-recap'
    });

    const detailPane = document.getElementById('detail-pane');
    const contentContainer = detailPane.querySelector('#rekap-gaji-content');
    const tabsContainer = detailPane.querySelector('#rekap-gaji-tabs');

    const renderTabContent = async (tabId) => {
        if (tabId === 'form') {
            await _renderRekapGajiForm(contentContainer);
        } else {
            await _renderRekapGajiHistory(contentContainer);
        }
    };

    tabsContainer.addEventListener('click', (e) => {
        const tabButton = e.target.closest('.sub-nav-item');
        if (tabButton && !tabButton.classList.contains('active')) {
            const newTabId = tabButton.dataset.tab;
            tabsContainer.querySelector('.active')?.classList.remove('active');
            tabButton.classList.add('active');
            renderTabContent(newTabId);
        }
    });

    await renderTabContent(activeTab);
}

async function _renderRekapGajiForm(container) {
    const today = new Date().toISOString().slice(0, 10);
    const firstDay = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);

    container.innerHTML = `
        <form id="rekap-gaji-form">
            <div class="rekap-filters">
                <div class="form-group">
                    <label>Rentang Tanggal</label>
                    <div class="date-range-group">
                        <input type="date" id="recap-start-date" value="${firstDay}">
                        <span>–</span>
                        <input type="date" id="recap-end-date" value="${today}">
                    </div>
                </div>
                <button type="submit" class="btn btn-secondary">Tampilkan Data</button>
            </div>
        </form>
        <div id="rekap-gaji-results">
             ${getEmptyStateHTML({ icon: 'info', title: 'Pilih Rentang Tanggal', desc: 'Pilih rentang tanggal untuk melihat absensi yang belum direkap.' })}
        </div>
        <div id="rekap-gaji-footer" class="form-footer-actions" ></div>
    `;

    const form = container.querySelector('#rekap-gaji-form');
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const startDate = container.querySelector('#recap-start-date').value;
        const endDate = container.querySelector('#recap-end-date').value;
        if (!startDate || !endDate) {
            toast('error', 'Silakan pilih rentang tanggal.');
            return;
        }
        generateSalaryRecap(new Date(startDate), new Date(endDate));
    });
}

async function _renderRekapGajiHistory(container) {
    container.innerHTML = createListSkeletonHTML(3);
    const rekapBills = (appState.bills || [])
        .filter(b => b.type === 'gaji' && !b.isDeleted)
        .sort((a, b) => getJSDate(b.createdAt) - getJSDate(a.createdAt));
    
    if (rekapBills.length === 0) {
        container.innerHTML = getEmptyStateHTML({ icon: 'history', title: 'Riwayat Kosong', desc: 'Belum ada rekap gaji yang pernah dibuat.' });
        return;
    }

    container.innerHTML = `<div class="wa-card-list-wrapper">${_getRekapGajiListHTML(rekapBills)}</div>`;
}

export async function generateSalaryRecap(startDate, endDate) {
    const resultsContainer = document.getElementById('rekap-gaji-results');
    const footerContainer = document.getElementById('rekap-gaji-footer');
    if (!resultsContainer || !footerContainer) return;

    resultsContainer.innerHTML = createListSkeletonHTML(3);
    endDate.setHours(23, 59, 59, 999);

    const records = await localDB.attendance_records
        .where('date').between(startDate, endDate)
        .and(r => r.isPaid === false && r.isDeleted !== 1 && r.totalPay > 0)
        .toArray();

    if (records.length === 0) {
        resultsContainer.innerHTML = getEmptyStateHTML({ icon: 'info', title: 'Data Tidak Ditemukan', desc: 'Tidak ada absensi yang belum dibayar pada rentang tanggal ini.' });
        footerContainer.innerHTML = '';
        return;
    }

    const workerRecap = records.reduce((acc, rec) => {
        if (!acc[rec.workerId]) {
            acc[rec.workerId] = {
                workerId: rec.workerId,
                workerName: rec.workerName,
                totalPay: 0,
                recordIds: [],
                details: []
            };
        }
        acc[rec.workerId].totalPay += rec.totalPay;
        acc[rec.workerId].recordIds.push(rec.id);
        acc[rec.workerId].details.push({
            date: getJSDate(rec.date).toLocaleDateString('id-ID'),
            pay: rec.totalPay
        });
        return acc;
    }, {});

    const sortedRecap = Object.values(workerRecap).sort((a, b) => a.workerName.localeCompare(b.workerName));

    resultsContainer.innerHTML = `
        <div class="recap-table-wrapper">
            <table class="recap-table">
                <thead>
                    <tr>
                        <th><input type="checkbox" id="select-all-recap" checked></th>
                        <th>Nama Pekerja</th>
                        <th style="text-align: right;">Total Upah</th>
                        <th style="text-align: right;">Aksi</th>
                    </tr>
                </thead>
                <tbody>
                    ${sortedRecap.map(w => `
                        <tr class="recap-row" data-worker-id="${w.workerId}" data-worker-name="${w.workerName}" data-total-pay="${w.totalPay}" data-record-ids="${w.recordIds.join(',')}" data-selected="true">
                            <td><input type="checkbox" class="recap-worker-checkbox" data-id="${w.workerId}" checked></td>
                            <td>${w.workerName}</td>
                            <td style="text-align: right;"><strong>${fmtIDR(w.totalPay)}</strong></td>
                            <td style="text-align: right;">
                                <button type="button" class="btn btn-sm btn-secondary" data-action="pay-single-worker">Bayar</button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
    
    footerContainer.innerHTML = `
        <button type="button" id="generate-bulk-bill-btn" class="btn btn-primary" data-action="generate-all-salary-bill">
            ${createIcon('save')} Buat Tagihan Gabungan
        </button>
        <button type="button" class="btn btn-danger" data-action="recalculate-wages">Hitung Ulang Upah</button>
    `;

    const selectAllCheckbox = container.querySelector('#select-all-recap');
    const rowCheckboxes = container.querySelectorAll('.recap-worker-checkbox');

    const toggleRowSelection = (row, isSelected) => {
        row.dataset.selected = isSelected;
        row.style.opacity = isSelected ? '1' : '0.5';
    };

    selectAllCheckbox.addEventListener('change', () => {
        const isChecked = selectAllCheckbox.checked;
        rowCheckboxes.forEach(cb => {
            cb.checked = isChecked;
            toggleRowSelection(cb.closest('tr'), isChecked);
        });
    });

    rowCheckboxes.forEach(cb => {
        cb.addEventListener('change', () => {
            toggleRowSelection(cb.closest('tr'), cb.checked);
            if (!cb.checked) {
                selectAllCheckbox.checked = false;
            }
        });
    });
}

export async function handleGenerateBulkSalaryBill(options = {}) {
    const { all = false } = options;
    const formContainer = document.getElementById('rekap-gaji-form');
    const resultsContainer = document.getElementById('rekap-gaji-results');
    if (!formContainer || !resultsContainer) return;

    const startDate = document.getElementById('recap-start-date').value;
    const endDate = document.getElementById('recap-end-date').value;

    const rowsToProcess = all 
        ? Array.from(resultsContainer.querySelectorAll('tr[data-worker-id]'))
        : Array.from(resultsContainer.querySelectorAll('tr[data-selected="true"]'));

    const selectedWorkers = rowsToProcess.map(row => ({
        workerId: row.dataset.workerId,
        workerName: row.dataset.workerName,
        totalPay: parseFloat(row.dataset.totalPay),
        recordIds: row.dataset.recordIds.split(',')
    }));

    if (selectedWorkers.length === 0) {
        toast('error', 'Tidak ada pekerja yang dipilih.');
        return;
    }

    const grandTotal = selectedWorkers.reduce((sum, worker) => sum + worker.totalPay, 0);
    const allRecordIds = selectedWorkers.flatMap(worker => worker.recordIds);
    const description = selectedWorkers.length === 1 ?
    `Gaji ${selectedWorkers[0].workerName}` :
    `Gaji Gabungan ${selectedWorkers.length} pekerja`;

    emit('ui.modal.create', 'confirmGenerateBill', {
        message: `Anda akan membuat 1 tagihan gabungan sebesar <strong>${fmtIDR(grandTotal)}</strong> untuk <strong>${selectedWorkers.length} pekerja</strong>. Lanjutkan?`,
        onConfirm: async () => { 
            toast('syncing', 'Membuat tagihan gaji massal...');
            try {
                const billId = generateUUID();
                const newBillData = {
                    id: billId,
                    description,
                    startDate: new Date(startDate),
                    endDate: new Date(endDate),
                    amount: grandTotal,
                    paidAmount: 0,
                    dueDate: new Date(),
                    status: 'unpaid',
                    type: 'gaji',
                    workerDetails: selectedWorkers.map(w => ({ id: w.workerId, name: w.workerName, amount: w.totalPay, recordIds: w.recordIds })),
                    recordIds: allRecordIds,
                    createdAt: new Date(),
                    isDeleted: 0,
                    syncState: 'pending_create'
                };

                await localDB.transaction('rw', localDB.bills, localDB.attendance_records, localDB.outbox, async () => {
                    await localDB.bills.add(newBillData);
                    await localDB.attendance_records.where('id').anyOf(allRecordIds).modify({ isPaid: true, billId: billId, syncState: 'pending_update' });
                    
                    await queueOutbox({ table: 'bills', docId: billId, op: 'upsert', payload: newBillData, priority: 7 });
                    for (const recordId of allRecordIds) {
                        await queueOutbox({ table: 'attendance_records', docId: recordId, op: 'upsert', payload: { id: recordId, isPaid: true, billId: billId }, priority: 6 });
                    }
                });
                
                _logActivity(`Membuat Tagihan Gaji Massal (Lokal)`, { billId, amount: grandTotal });
                toast('success', 'Tagihan gaji gabungan berhasil dibuat.');
                
                requestSync({ silent: true });
                await loadAllLocalDataToState();

                const historyTabButton = document.querySelector('#rekap-gaji-tabs .sub-nav-item[data-tab="riwayat"]');
                if (historyTabButton) {
                    historyTabButton.click();
                }

            } catch (error) {
                toast('error', 'Gagal membuat tagihan gaji.');
                console.error('Error generating bulk salary bill:', error);
            }
        }
    });
}

export async function handlePaySingleWorkerFromRecap(targetButton) {
    const row = targetButton.closest('tr');
    const { workerId, workerName, totalPay, recordIds } = row.dataset;
    const recordsArray = recordIds.split(',');
    
    const startDate = new Date(document.getElementById('recap-start-date').value);
    const endDate = new Date(document.getElementById('recap-end-date').value);

    const singleWorkerData = {
        workerId,
        workerName,
        totalPay: parseFloat(totalPay),
        recordIds: recordsArray
    };

    emit('ui.modal.create', 'confirmUserAction', {
        message: `Buat tagihan individual untuk <strong>${workerName}</strong> sebesar <strong>${fmtIDR(singleWorkerData.totalPay)}</strong>?`,
        onConfirm: async () => {
            await handleGenerateBulkSalaryBill({ 
                all: false, 
                selectedWorkers: [singleWorkerData],
                startDate,
                endDate
            });
            
            row.style.transition = 'opacity 0.3s, transform 0.3s';
            row.style.opacity = '0';
            row.style.transform = 'translateX(-20px)';
            setTimeout(() => row.remove(), 300);
        }
    });
}

export async function handleRecalculateWages() {
      const startDateStr = document.getElementById('recap-start-date').value;
      const endDateStr = document.getElementById('recap-end-date').value;
  
      if (!startDateStr || !endDateStr) {
          toast('error', 'Silakan pilih rentang tanggal terlebih dahulu.');
          return;
      }
  
      emit('ui.modal.create', 'confirmUserAction', {
          message: 'Anda akan menghitung ulang upah untuk semua absensi yang BELUM DIBAYAR dalam periode ini menggunakan tarif terbaru dari master data. Ini akan memperbaiki data lama yang upahnya 0. Lanjutkan?',
          onConfirm: async () => {
              toast('syncing', 'Mencari & menghitung ulang upah...');
              const startDate = new Date(startDateStr);
              const endDate = new Date(endDateStr);
              endDate.setHours(23, 59, 59, 999);
  
              try {
                  const recordsToUpdate = await localDB.attendance_records
                      .where('date').between(startDate, endDate)
                      .and(r => r.isPaid === false && r.isDeleted !== 1)
                      .toArray();

                  if (recordsToUpdate.length === 0) {
                      toast('info', 'Tidak ditemukan absensi yang perlu dihitung ulang.');
                      return;
                  }
  
                  let updatedCount = 0;
  
                  await localDB.transaction('rw', localDB.attendance_records, localDB.outbox, async () => {
                      for (const record of recordsToUpdate) {
                          const worker = appState.workers.find(w => w.id === record.workerId);
                          if (!worker) continue;
  
                          let baseWage = 0;
                          const projectWages = worker.projectWages?.[record.projectId];
                          if (typeof projectWages === 'object' && projectWages !== null) {
                              baseWage = projectWages[record.jobRole] || Object.values(projectWages)[0] || 0;
                          } else if (typeof projectWages === 'number') {
                              baseWage = projectWages;
                          }
                          
                          let newTotalPay = 0;
                          if (record.type === 'manual') {
                              if (record.attendanceStatus === 'full_day') newTotalPay = baseWage;
                              else if (record.attendanceStatus === 'half_day') newTotalPay = baseWage / 2;
                          } else if (record.type === 'timestamp') {
                              const hourlyWage = baseWage / 8;
                              newTotalPay = ((record.normalHours || 0) * hourlyWage) + ((record.overtimeHours || 0) * hourlyWage * 1.5);
                          }
                          
                          newTotalPay = Math.round(newTotalPay);

                          if (newTotalPay !== Math.round(record.totalPay || 0)) {
                              const updateData = { totalPay: newTotalPay, syncState: 'pending_update', updatedAt: new Date() };
                              await localDB.attendance_records.update(record.id, updateData);
                              await queueOutbox({ table: 'attendance_records', docId: record.id, op: 'upsert', payload: { id: record.id, ...updateData }, priority: 6 });
                              updatedCount++;
                          }
                      }
                  });
  
                  if (updatedCount > 0) {
                      toast('success', `${updatedCount} data upah berhasil dikoreksi dan diperbarui!`);
                      await loadAllLocalDataToState();
                      generateSalaryRecap(startDate, endDate);
                      requestSync({ silent: true });
                  } else {
                      toast('info', 'Semua data upah sudah sesuai dengan tarif terbaru.');
                  }
  
              } catch (error) {
                  console.error("Gagal menghitung ulang upah:", error);
                  toast('error', 'Terjadi kesalahan saat proses hitung ulang.');
              }
          }
      });
}

export async function handleRemoveWorkerFromRecap(billId, workerId) {
      const bill = appState.bills.find(b => b.id === billId) || await localDB.bills.get(billId);
      const worker = bill?.workerDetails?.find(w => (w.id === workerId || w.workerId === workerId));
      
      if (!bill || !worker) {
          toast('error', 'Data tagihan atau pekerja tidak ditemukan.');
          return;
      }
  
      emit('ui.modal.create', 'confirmUserAction', {
          message: `Anda yakin ingin mengeluarkan <strong>${worker.name}</strong> dari rekap ini? Tagihan akan disesuaikan dan absensi pekerja ini akan bisa direkap ulang.`,
          onConfirm: async () => {
              toast('syncing', `Memproses pengeluaran ${worker.name}...`);
              try {
                  const hasPaymentForWorker = await localDB.pending_payments
                      .where({ billId: billId, workerId: workerId })
                      .first();
                  
                  if (bill.status === 'paid' || hasPaymentForWorker) {
                      toast('error', `Pekerja tidak bisa dikeluarkan karena pembayaran sudah tercatat untuknya atau tagihan sudah lunas.`);
                      return;
                  }
  
                  const workerToRemove = bill.workerDetails.find(w => (w.id === workerId || w.workerId === workerId));
                  const amountToRemove = workerToRemove.amount || 0;
                  const recordIdsToReset = workerToRemove.recordIds || [];
                  
                  const newWorkerDetails = bill.workerDetails.filter(w => (w.id !== workerId && w.workerId !== workerId));
                  const newRecordIds = newWorkerDetails.flatMap(w => w.recordIds || []);
                  const newAmount = (bill.amount || 0) - amountToRemove;

                  await localDB.transaction('rw', localDB.bills, localDB.attendance_records, localDB.outbox, async () => {
                      const billUpdate = {
                          amount: newAmount,
                          workerDetails: newWorkerDetails,
                          recordIds: newRecordIds,
                          syncState: 'pending_update',
                          updatedAt: new Date()
                      };
                      await localDB.bills.update(billId, billUpdate);
                      await queueOutbox({ table: 'bills', docId: billId, op: 'upsert', payload: { id: billId, ...billUpdate }, priority: 6 });

                      if (recordIdsToReset.length > 0) {
                          const attUpdate = { billId: null, isPaid: false, syncState: 'pending_update', updatedAt: new Date() };
                          await localDB.attendance_records.where('id').anyOf(recordIdsToReset).modify(attUpdate);
                          for (const recordId of recordIdsToReset) {
                              await queueOutbox({ table: 'attendance_records', docId: recordId, op: 'upsert', payload: { id: recordId, ...attUpdate }, priority: 6 });
                          }
                      }
                  });
  
                  await _logActivity(`Mengeluarkan Pekerja dari Rekap: ${worker.name}`, { billId, workerId });
                  toast('success', `${worker.name} berhasil dikeluarkan dari rekap.`);
                  
                  await loadAllLocalDataToState();
                  emit('ui.modal.close');
                  emit('ui.page.render');
                  requestSync({ silent: true });
  
              } catch (error) {
                  toast('error', 'Gagal memproses. Coba lagi.');
                  console.error('Error removing worker from recap:', error);
              }
          }
      });
}

export async function handleDeleteSalaryBill(billId) {
    emit('ui.modal.create', 'confirmDelete', {
        message: 'Membatalkan rekap akan menghapus tagihan ini dan mengembalikan status absensi terkait menjadi "belum dibayar". Lanjutkan?',
        onConfirm: async () => {
            toast('syncing', 'Membatalkan rekap...');
            try {
                const bill = await localDB.bills.get(billId);
                if (!bill) throw new Error('Tagihan tidak ditemukan');
                
                const hasPayments = await localDB.pending_payments.where({billId}).count() > 0;
                if(hasPayments){
                     throw new Error(`Tagihan ini tidak bisa dibatalkan karena sudah memiliki riwayat pembayaran.`);
                }
                
                const recordIds = bill.recordIds || [];
                
                await localDB.transaction('rw', localDB.bills, localDB.attendance_records, localDB.outbox, async () => {
                    const billUpdate = { isDeleted: 1, syncState: 'pending_update', updatedAt: new Date() };
                    await localDB.bills.update(billId, billUpdate);
                    await queueOutbox({ table: 'bills', docId: billId, op: 'upsert', payload: { id: billId, ...billUpdate }, priority: 5 });

                    if (recordIds.length > 0) {
                        const attUpdate = { isPaid: false, billId: null, syncState: 'pending_update', updatedAt: new Date() };
                        await localDB.attendance_records.where('id').anyOf(recordIds).modify(attUpdate);
                        for (const recordId of recordIds) {
                            await queueOutbox({ table: 'attendance_records', docId: recordId, op: 'upsert', payload: { id: recordId, ...attUpdate }, priority: 5 });
                        }
                    }
                });
                
                _logActivity(`Membatalkan Rekap Gaji (Lokal)`, { billId });
                requestSync({ silent: true });
                toast('success', 'Rekap gaji berhasil dibatalkan.');
                
                await loadAllLocalDataToState();
                emit('ui.animate.removeItem', `bill-${billId}`);

            } catch (error) {
                console.error('Error deleting salary bill:', error);
                toast('error', error.message || 'Gagal membatalkan rekap.');
            }
        }
    });
}

export async function openDailyProjectPickerForEdit(dateStr) {
    const { startOfDay, endOfDay } = getLocalDayBounds(dateStr);
    const records = (appState.attendanceRecords || []).filter(rec => {
        const recDate = getJSDate(rec.date);
        return recDate >= startOfDay && recDate <= endOfDay && !rec.isDeleted && rec.projectId;
    });
    const projectIds = [...new Set(records.map(r => r.projectId))];
    const projects = (appState.projects || []).filter(p => projectIds.includes(p.id));

    if (projects.length === 0) {
        toast('info', 'Tidak ada absensi berproyek untuk diedit pada hari ini.');
        return;
    }

    if (projects.length === 1) {
        emit('ui.jurnal.openDailyEditorPanel', { dateStr, projectId: projects[0].id });
        return;
    }

    const content = `
        <div class="dense-list-container">
            <p class="helper-text" style="text-align: center; margin-bottom: 1rem;">Pilih proyek yang ingin Anda edit absensinya untuk tanggal ${parseLocalDate(dateStr).toLocaleDateString('id-ID')}:</p>
            ${projects.map(p => `
                <button class="dense-list-item btn btn-ghost" data-action="select-project-for-edit" data-project-id="${p.id}" data-date-str="${dateStr}">
                    <div class="item-main-content">
                        <strong class="item-title">${p.projectName}</strong>
                    </div>
                </button>
            `).join('')}
        </div>`;
    
    const modal = createModal('dataDetail', { title: 'Pilih Proyek untuk Diedit', content });

    modal.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action="select-project-for-edit"]');
        if (btn) {
            const { projectId, dateStr } = btn.dataset;
            closeModal(modal);
            emit('ui.jurnal.openDailyEditorPanel', { dateStr, projectId });
        }
    });
}

async function handleGenerateDailyBill({ date, records }) {
    if (!records || records.length === 0) {
        toast('error', 'Tidak ada absensi untuk ditagih.');
        return;
    }

    const dateObj = parseLocalDate(date);
    const formattedDate = dateObj.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
    
    const workerRecap = records.reduce((acc, rec) => {
        if (!acc[rec.workerId]) {
            acc[rec.workerId] = { workerId: rec.workerId, workerName: rec.workerName, totalPay: 0, recordIds: [] };
        }
        acc[rec.workerId].totalPay += rec.totalPay;
        acc[rec.workerId].recordIds.push(rec.id);
        return acc;
    }, {});

    const selectedWorkers = Object.values(workerRecap);
    const grandTotal = selectedWorkers.reduce((sum, worker) => sum + worker.totalPay, 0);
    const allRecordIds = selectedWorkers.flatMap(worker => worker.recordIds);
    const description = `Tagihan Gaji Harian - ${formattedDate}`;

    emit('ui.modal.create', 'confirmGenerateBill', {
        message: `Buat tagihan gaji harian ${formattedDate} sebesar <strong>${fmtIDR(grandTotal)}</strong> untuk <strong>${selectedWorkers.length} pekerja</strong>?`,
        onConfirm: async () => { 
            toast('syncing', 'Membuat tagihan gaji harian...');
            try {
                const billId = generateUUID();
                const newBillData = {
                    id: billId,
                    description,
                    startDate: dateObj,
                    endDate: dateObj,
                    amount: grandTotal,
                    paidAmount: 0,
                    dueDate: new Date(),
                    status: 'unpaid',
                    type: 'gaji',
                    workerDetails: selectedWorkers.map(w => ({ id: w.workerId, name: w.workerName, amount: w.totalPay, recordIds: w.recordIds })),
                    recordIds: allRecordIds,
                    createdAt: new Date(),
                    isDeleted: 0,
                    syncState: 'pending_create'
                };

                await localDB.transaction('rw', localDB.bills, localDB.attendance_records, localDB.outbox, async () => {
                    await localDB.bills.add(newBillData);
                    await localDB.attendance_records.where('id').anyOf(allRecordIds).modify({ isPaid: true, billId: billId, syncState: 'pending_update' });
                    
                    await queueOutbox({ table: 'bills', docId: billId, op: 'upsert', payload: newBillData, priority: 7 });
                    for (const recordId of allRecordIds) {
                        await queueOutbox({ table: 'attendance_records', docId: recordId, op: 'upsert', payload: { id: recordId, isPaid: true, billId: billId }, priority: 6 });
                    }
                });
                
                _logActivity(`Membuat Tagihan Gaji Harian (Lokal)`, { billId, amount: grandTotal });
                toast('success', 'Tagihan gaji harian berhasil dibuat.');
                
                requestSync({ silent: true });
                await loadAllLocalDataToState();
                
                emit('ui.modal.closeDetailPane');
                emit('ui.page.render');
            } catch (error) {
                toast('error', 'Gagal membuat tagihan gaji harian.');
                console.error('Error generating daily salary bill:', error);
            }
        }
    });
}

on('jurnal.generateDailyBill', handleGenerateDailyBill);
