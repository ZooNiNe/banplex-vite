import { emit } from "../state/eventBus.js";
import { appState } from "../state/appState.js";
import { settingsDocRef, projectsCol, billsCol, suppliersCol } from "../config/firebase.js";
import { getDoc } from "../config/firebase.js";
import { collection, doc, getDocs, orderBy, query } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";
import { toast } from "../ui/components/toast.js";
import { startGlobalLoading } from "../ui/components/modal.js";
import { getJSDate, parseLocalDate } from "../utils/helpers.js";
import { fetchAndCacheData } from "./data/fetch.js";
import { $ } from "../utils/dom.js";
import { fmtIDR as fmtIDRFormat } from "../utils/formatters.js";
import { parseFormattedNumber } from "../utils/formatters.js";
import { localDB } from "./localDbService.js";

let __pdfLibsReady;
async function __ensurePdfLibs() {
    if (window.jspdf && window.jspdf.jsPDF && window.html2canvas) return;
    if (!__pdfLibsReady) {
        __pdfLibsReady = (async () => {
            const add = (src) => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.async = true; s.crossOrigin = 'anonymous'; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
            try {
                await add('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
                await add('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
                await add('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.23/jspdf.plugin.autotable.min.js');
            } catch (e) { console.warn('Failed loading PDF libs', e); }
        })();
    }
    await __pdfLibsReady;
}

export async function createPdfDoc(options = {}) {
    await __ensurePdfLibs();
    const { jsPDF } = window.jspdf;
    return new jsPDF(options);
}

let __chartLibReady;
async function __ensureChartLibForPdf() {
    if (typeof window.Chart !== 'undefined' && window.Chart && typeof window.Chart === 'function') return;
    if (!__chartLibReady) {
        __chartLibReady = new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.2/dist/chart.umd.min.js';
            s.async = true;
            s.crossOrigin = 'anonymous';
            s.onload = () => resolve();
            s.onerror = (e) => reject(e);
            document.head.appendChild(s);
        });
    }
    try { await __chartLibReady; } catch (_) {}
}

async function _loadPdfAssetDataUrl(path) {
    try {
        const key = `_pdfAsset_${path}`;
        if (appState[key]) return appState[key];
        
        const tryPaths = [`/${path}`, path, `./${path}`];
        let res; 
        for (const p of tryPaths) { 
            try { 
                res = await fetch(p, { cache: 'force-cache' }); 
                if (res && res.ok) break; 
            } catch(_){} 
        }
        if (!res || !res.ok) return null;
        
        const blob = await res.blob();
        const dataUrl = await new Promise((resolve, reject) => {
            const fr = new FileReader();
            fr.onload = () => resolve(fr.result);
            fr.onerror = reject;
            fr.readAsDataURL(blob);
        });
        
        appState[key] = dataUrl;
        return dataUrl;
    } catch (_) { 
        return null; 
    }
}


async function generatePdfReport(config) {
    const {
        title,
        subtitle,
        filename,
        sections
    } = config;
  
    if (!sections || sections.length === 0) {
        toast('error', 'Data tidak lengkap untuk PDF.');
        return;
    }
  
    const loader = startGlobalLoading('Membuat laporan PDF...');
    try {
        await __ensurePdfLibs();
        if (!appState.pdfSettings) {
            const docSnap = await getDoc(settingsDocRef);
            if (docSnap.exists()) {
                appState.pdfSettings = docSnap.data();
            } else {
                appState.pdfSettings = {};
            }
        }
  
        const defaults = {
            headerColor: '#26a69a'
        };
        const settings = { ...defaults,
            ...appState.pdfSettings
        };
  
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a4'
        });
        const totalPagesExp = '{total_pages_count_string}';
        let lastY = 0;
        const pageWidth = pdf.internal.pageSize.width;
  
        const hexToRgb = (hex) => {
            const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
            return result?[parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)] : [38, 166, 154];
        };
        const headerRgbColor = hexToRgb(settings.headerColor);
  
        const logoDataUrl = await _loadPdfAssetDataUrl('logo-header-pdf.png');
        if (logoDataUrl && String(logoDataUrl).startsWith('data:image')) {
            pdf.addImage(logoDataUrl, 'PNG', 17, 17, 17, 17);
        }
  
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(14);
        pdf.setTextColor(44, 62, 80);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(10);
        pdf.text(title, 40, 24);
        if (subtitle) {
            pdf.setFontSize(9);
            pdf.setTextColor(100, 100, 100);
            pdf.text(subtitle, 40, 29);
        }
        pdf.setDrawColor(220, 220, 220);
        pdf.line(14, 38, pageWidth - 14, 38);
        lastY = 45;
  
        const didDrawPage = (data) => {
            pdf.setFontSize(8);
            pdf.setTextColor(150, 150, 150);
            pdf.text(`Halaman ${data.pageNumber} dari ${totalPagesExp}`, 14, pdf.internal.pageSize.height - 10);
            const reportDate = new Date().toLocaleString('id-ID', {
                dateStyle: 'long',
                timeStyle: 'short'
            });
            pdf.text(`Dicetak: ${reportDate}`, pageWidth - 14, pdf.internal.pageSize.height - 10, {
                align: 'right'
            });
        };
  
        const tableConfig = {
            theme: 'grid',
            headStyles: {
                fillColor: headerRgbColor,
                textColor: 255,
                fontStyle: 'bold'
            },
            footStyles: {
                fillColor: [41, 128, 185],
                textColor: 255,
                fontStyle: 'bold'
            },
            alternateRowStyles: {
                fillColor: [245, 245, 245]
            },
            styles: {
                fontSize: 8,
                cellPadding: 2.5,
                valign: 'middle'
            },
        };
  
        sections.forEach((section, index) => {
            if (section.sectionTitle) {
                if (index > 0) lastY += 10;
                pdf.setFontSize(11).setFont(undefined, 'bold');
                pdf.setTextColor(44, 62, 80);
                pdf.text(section.sectionTitle, 14, lastY);
                lastY += 5;
            }
            pdf.autoTable({
                ...tableConfig,
                head: [section.headers],
                body: section.body,
                foot: section.foot || [], 
                startY: lastY,
                didDrawPage: didDrawPage,
                margin: {
                    top: 40
                }
            });
            lastY = pdf.autoTable.previous.finalY;
        });
  
        if (typeof pdf.putTotalPages === 'function') {
            pdf.putTotalPages(totalPagesExp);
        }
  
        pdf.save(filename);
        toast('success', 'PDF berhasil dibuat!');
        loader.close();
    } catch (error) {
        loader.close();
        console.error("Gagal membuat PDF:", error);
        toast('error', 'Terjadi kesalahan saat membuat PDF.');
    }
}

function normalizeDailyAttendanceRecords(records = []) {
    const grouped = new Map();
    const keyOrder = [];

    records.forEach(rec => {
        if (!rec || !rec.workerId) return;
        const recDate = getJSDate(rec.date);
        if (!(recDate instanceof Date) || Number.isNaN(recDate)) return;
        const dayKey = `${rec.workerId}__${recDate.toISOString().slice(0, 10)}`;
        if (!grouped.has(dayKey)) {
            grouped.set(dayKey, []);
            keyOrder.push(dayKey);
        }
        grouped.get(dayKey).push(rec);
    });

    const normalized = [];
    keyOrder.forEach(key => {
        const group = grouped.get(key);
        if (!group || group.length === 0) return;
        const isAllHalfDay = group.every(g => g.attendanceStatus === 'half_day');
        if (isAllHalfDay) {
            group.forEach(rec => normalized.push(rec));
            return;
        }
        const prioritized =
            group.find(rec => rec.attendanceStatus === 'full_day') ||
            group.find(rec => rec.type === 'timestamp' && rec.status === 'completed') ||
            group.find(rec => rec.type === 'timestamp') ||
            group.reduce((best, rec) => ((rec.totalPay || 0) > (best?.totalPay || 0) ? rec : best), null) ||
            group[0];
        if (prioritized) normalized.push(prioritized);
    });

    return normalized;
}

function getRecordDayValue(rec) {
    if (!rec) return 0;
    if (rec.attendanceStatus === 'full_day') return 1;
    if (rec.attendanceStatus === 'half_day') return 0.5;
    if (rec.type === 'timestamp') {
        const hours = parseFloat(rec.workHours);
        if (!Number.isFinite(hours) || hours <= 0) return 0;
        return Math.min(1, hours / 8);
    }
    return rec.attendanceStatus && rec.attendanceStatus !== 'absent' ? 1 : 0;
}

async function _prepareUpahPekerjaDataForPdf(filters = {}) {
    const startDateStr = filters.start || $('#report-start-date')?.value;
    const endDateStr = filters.end || $('#report-end-date')?.value;
    if (!startDateStr || !endDateStr) {
        toast('error', 'Silakan pilih rentang tanggal laporan terlebih dahulu.');
        return null;
    }
    const startDate = parseLocalDate(startDateStr);
    const endDate = parseLocalDate(endDateStr);
    const workerId = filters.workerId || $('#report-worker-id')?.value || 'all';
    const projectId = filters.projectId || $('#report-project-id')?.value || 'all';
    if (!startDate || !endDate || Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
        toast('error', 'Rentang tanggal tidak valid.');
        return null;
    }
    endDate.setHours(23, 59, 59, 999);

    let recordsInRange = (appState.attendanceRecords || [])
        .filter(rec => {
            if (rec.isDeleted) return false;
            const recDate = getJSDate(rec.date);
            if (!recDate || Number.isNaN(recDate.getTime())) return false;
            const isPresent = rec.attendanceStatus === 'full_day' || rec.attendanceStatus === 'half_day';
            return isPresent && recDate >= startDate && recDate <= endDate && (rec.totalPay || 0) > 0;
        });

    if (workerId !== 'all') {
        recordsInRange = recordsInRange.filter(rec => rec.workerId === workerId);
    }
    if (projectId !== 'all') {
        recordsInRange = recordsInRange.filter(rec => rec.projectId === projectId);
    }

    recordsInRange = normalizeDailyAttendanceRecords(recordsInRange);
    recordsInRange.sort((a, b) => getJSDate(a.date) - getJSDate(b.date));

    if (recordsInRange.length === 0) return null;

    let totalUpah = 0;
    let totalHari = 0;
    const billsMap = new Map((appState.bills || []).map(b => [b.id, b]));
    const projectMap = new Map((appState.projects || []).map(p => [p.id, p.projectName]));

    const bodyRows = recordsInRange.map(rec => {
        const worker = appState.workers.find(w => w.id === rec.workerId);
        const recDate = getJSDate(rec.date);
        const dateLabel = Number.isNaN(recDate.getTime()) ? '-' : recDate.toLocaleDateString('id-ID');
        const projectName = projectMap.get(rec.projectId) || '-';
        const statusText = rec.attendanceStatus === 'full_day' ? 'Hadir' : '1/2 Hari';

        let statusBayarText = 'Belum Direkap';
        if (rec.billId) {
            const bill = billsMap.get(rec.billId);
            statusBayarText = bill ? (bill.status === 'paid' ? 'Lunas' : 'Belum Lunas') : 'Belum Lunas';
        }

        totalUpah += rec.totalPay || 0;
        if (rec.attendanceStatus === 'full_day') {
            totalHari += 1;
        } else if (rec.attendanceStatus === 'half_day') {
            totalHari += 0.5;
        }

        return [
            dateLabel,
            worker?.workerName || '-',
            projectName,
            statusText,
            fmtIDRFormat(rec.totalPay || 0),
            statusBayarText,
        ];
    });

    const workerLabel = workerId !== 'all' ? (appState.workers.find(w => w.id === workerId)?.workerName || '-') : 'Semua Pekerja';
    const projectLabel = projectId !== 'all' ? (projectMap.get(projectId) || '-') : 'Semua Proyek';
    const subtitle = `Pekerja: ${workerLabel} | Proyek: ${projectLabel} | Periode: ${startDate.toLocaleDateString('id-ID')} s/d ${endDate.toLocaleDateString('id-ID')}`;

    const summarySection = {
        sectionTitle: 'Ringkasan Total',
        headers: ['Deskripsi', { content: 'Total', styles: { halign: 'right' } }],
        body: [
            ['Total Hari Kerja', { content: `${totalHari.toLocaleString('id-ID')} Hari`, styles: { halign: 'right' } }],
            ['Total Upah Gaji', { content: fmtIDRFormat(totalUpah), styles: { halign: 'right' } }],
        ],
        foot: [],
    };

    let paymentSection = null;
    try {
        if (workerId !== 'all') {
            const { payments, totalPaid } = await _getWorkerSalaryPayments(workerId, { startDate, endDate });
            summarySection.body.push(['Total Pembayaran (Termasuk Cicilan)', { content: fmtIDRFormat(totalPaid), styles: { halign: 'right' } }]);
            summarySection.body.push(['Sisa Belum Dibayar', { content: fmtIDRFormat(Math.max(0, totalUpah - totalPaid)), styles: { halign: 'right' } }]);
            if (payments.length > 0) {
                paymentSection = {
                    sectionTitle: 'Riwayat Pembayaran Gaji',
                    headers: ['Tanggal & Waktu', { content: 'Jumlah', styles: { halign: 'right' } }, 'Dibuat Oleh'],
                    body: payments.map(p => [
                        _formatFullTimestamp(p.date),
                        { content: fmtIDRFormat(p.amount || 0), styles: { halign: 'right' } },
                        p.createdByName || '-',
                    ]),
                };
            }
        }
    } catch (e) {
        console.warn('Gagal menghitung pembayaran gaji pekerja', e);
    }

    return {
        title: 'Laporan Rincian Upah Pekerja',
        subtitle: subtitle,
        filename: `Laporan-Upah-${new Date().toISOString().slice(0, 10)}.pdf`,
        sections: [
            summarySection,
            {
                sectionTitle: 'Rincian Absensi',
                headers: ['Tanggal', 'Pekerja', 'Proyek', 'Status', 'Upah', 'Status'],
                body: bodyRows,
                foot: [],
            },
            ...(paymentSection ? [paymentSection] : []),
        ],
    };
}
async function _prepareMaterialSupplierDataForPdf() {
    const startDateStr = $('#report-start-date')?.value;
    const endDateStr = $('#report-end-date')?.value;
    if (!startDateStr || !endDateStr) {
        toast('error', 'Silakan pilih rentang tanggal laporan terlebih dahulu.');
        return null;
    }
    const startDate = new Date(startDateStr);
    const endDate = new Date(endDateStr);
    const supplierId = $('#report-supplier-id')?.value || 'all';
    endDate.setHours(23, 59, 59, 999);

    let expensesInRange = (appState.expenses || []).filter(exp => {
        if (exp.isDeleted) return false;
        const expDate = getJSDate(exp.date);
        return exp.type === 'material' && expDate >= startDate && expDate <= endDate;
    });
    if (supplierId !== 'all') {
        expensesInRange = expensesInRange.filter(exp => exp.supplierId === supplierId);
    }
    if (expensesInRange.length === 0) return null;

    const bodyRows = expensesInRange.flatMap(exp => {
        if (!exp.items || exp.items.length === 0) return [];
        const supplier = appState.suppliers.find(s => s.id === exp.supplierId);
        const project = appState.projects.find(p => p.id === exp.projectId);
        return exp.items.map(item => {
            const material = appState.materials.find(m => m.id === item.materialId);
            return [
                getJSDate(exp.date).toLocaleDateString('id-ID'),
                supplier?.supplierName || '-',
                project?.projectName || '-',
                material?.materialName || '-',
                item.qty,
                fmtIDRFormat(item.price),
                fmtIDRFormat(item.total)
            ];
        });
    });

    if (bodyRows.length === 0) return null;
    const supplierName = supplierId !== 'all' ? (appState.suppliers.find(s => s.id === supplierId)?.supplierName || '-') : 'Semua Supplier';
    return {
        title: 'Laporan Rincian Material per Supplier',
        subtitle: `Supplier: ${supplierName} | Periode: ${startDate.toLocaleDateString('id-ID')} s/d ${endDate.toLocaleDateString('id-ID')}`,
        filename: `Laporan-Material-${new Date().toISOString().slice(0, 10)}.pdf`,
        sections: [{
            headers: ["Tanggal", "Supplier", "Proyek", "Barang", "Qty", "Harga", "Total"],
            body: bodyRows
        }]
    };
}

async function _prepareMaterialUsageDataForPdf() {
    const projectId = $('#report-project-id')?.value;
    if (!projectId) {
        toast('error', 'Silakan pilih proyek terlebih dahulu.');
        return null;
    }
    const usageTransactions = (appState.stockTransactions || []).filter(trans => !trans.isDeleted && trans.type === 'out' && trans.projectId === projectId);
    if (usageTransactions.length === 0) return null;

    const usageByMaterial = usageTransactions.reduce((acc, trans) => {
        if (!acc[trans.materialId]) {
            acc[trans.materialId] = { quantity: 0, ...(appState.materials.find(m => m.id === trans.materialId) || {}) };
        }
        acc[trans.materialId].quantity += trans.quantity;
        return acc;
    }, {});

    const bodyRows = Object.values(usageByMaterial).map(item => [item.materialName, item.unit, item.quantity]);
    const projectName = appState.projects.find(p => p.id === projectId)?.projectName || '-';
    return {
        title: 'Laporan Pemakaian Material per Proyek',
        subtitle: `Proyek: ${projectName}`,
        filename: `Pemakaian-Material-${projectName.replace(/\s+/g, '-')}.pdf`,
        sections: [{ headers: ["Nama Material", "Satuan", "Total Pemakaian"], body: bodyRows }]
    };
}

async function _prepareRekapanDataForPdf() {
    const startDate = new Date($('#report-start-date')?.value || '');
    const endDate = new Date($('#report-end-date')?.value || '');
    const projectId = $('#report-project-id')?.value || 'all';
    endDate.setHours(23, 59, 59, 999);

    const transactions = [];
    (appState.incomes || []).forEach(i => {
        if (!i.isDeleted) {
            transactions.push({ date: getJSDate(i.date), type: 'Pemasukan', description: i.description || 'Penerimaan Termin', amount: i.amount, projectId: i.projectId });
        }
    });
    (appState.expenses || []).forEach(e => {
        if (!e.isDeleted) {
            transactions.push({ date: getJSDate(e.date), type: 'Pengeluaran', description: e.description, amount: -e.amount, projectId: e.projectId });
        }
    });

    const filtered = transactions
        .filter(t => (projectId === 'all' || t.projectId === projectId) && (t.date >= startDate && t.date <= endDate))
        .sort((a, b) => a.date - b.date);
    if (filtered.length === 0) return null;

    let balance = 0;
    const bodyRows = filtered.map(t => {
        balance += t.amount;
        return [
            t.date.toLocaleDateString('id-ID'),
            t.description,
            t.amount > 0 ? fmtIDRFormat(t.amount) : '-',
            t.amount < 0 ? fmtIDRFormat(t.amount) : '-',
            fmtIDRFormat(balance)
        ];
    });

    const totalPemasukan = filtered.filter(t => t.amount > 0).reduce((sum, t) => sum + t.amount, 0);
    const totalPengeluaran = filtered.filter(t => t.amount < 0).reduce((sum, t) => sum + t.amount, 0);
    const footRow = [["Total", "", fmtIDRFormat(totalPemasukan), fmtIDRFormat(totalPengeluaran), fmtIDRFormat(balance)]];
    const projectName = projectId !== 'all' ? (appState.projects.find(p => p.id === projectId)?.projectName || '-') : 'Semua Proyek';

    return {
        title: 'Laporan Rekapan Transaksi',
        subtitle: `Proyek: ${projectName} | Periode: ${startDate.toLocaleDateString('id-ID')} s/d ${endDate.toLocaleDateString('id-ID')}`,
        filename: `Rekapan-${new Date().toISOString().slice(0, 10)}.pdf`,
        sections: [{ headers: ["Tanggal", "Deskripsi", "Pemasukan", "Pengeluaran", "Saldo"], body: bodyRows, foot: footRow }]
    };
}

async function _prepareAnalisisBebanDataForPdf() {
    await Promise.all([
        fetchAndCacheData('projects', projectsCol, 'projectName'),
        fetchAndCacheData('bills', billsCol, 'createdAt')
    ]);

    const attendanceProjectMap = buildReportAttendanceProjectMap();
    const totals = {
        main: { material: { paid: 0, unpaid: 0 }, operasional: { paid: 0, unpaid: 0 }, lainnya: { paid: 0, unpaid: 0 }, gaji: { paid: 0, unpaid: 0 } },
        internal: { material: { paid: 0, unpaid: 0 }, operasional: { paid: 0, unpaid: 0 }, lainnya: { paid: 0, unpaid: 0 }, gaji: { paid: 0, unpaid: 0 } }
    };
    const mainProject = appState.projects.find(p => p.projectType === 'main_income');
    const mainProjectId = mainProject ? mainProject.id : null;

    (appState.bills || []).filter(bill => !bill.isDeleted).forEach(bill => {
        const billProjectIds = getReportBillProjectIds(bill, attendanceProjectMap);
        const group = (mainProjectId && billProjectIds.has(mainProjectId)) ? 'main' : 'internal';
        if (totals[group] && totals[group][bill.type]) {
            const totalAmount = parseFloat(bill.amount || 0);
            if (bill.status === 'paid') {
                totals[group][bill.type]['paid'] += totalAmount;
            
            } else if (bill.status === 'unpaid') {
                const paidAmount = parseFloat(bill.paidAmount || 0);
                const outstandingAmount = Math.max(0, totalAmount - paidAmount);
                totals[group][bill.type]['unpaid'] += outstandingAmount;
            }
        }
    });

    const allSalaryTotals = calculateReportSalaryTotals({ attendanceProjectMap });
    const mainSalaryTotals = mainProjectId
        ? calculateReportSalaryTotals({
            attendanceProjectMap,
            projectPredicate: (projectIds) => projectIds.has(mainProjectId)
        })
        : { totalWagesPaid: 0, totalWagesUnpaid: 0 };
    const internalSalaryTotals = {
        totalWagesPaid: Math.max(0, allSalaryTotals.totalWagesPaid - mainSalaryTotals.totalWagesPaid),
        totalWagesUnpaid: Math.max(0, allSalaryTotals.totalWagesUnpaid - mainSalaryTotals.totalWagesUnpaid)
    };
    totals.main.gaji = { paid: mainSalaryTotals.totalWagesPaid, unpaid: mainSalaryTotals.totalWagesUnpaid };
    totals.internal.gaji = { paid: internalSalaryTotals.totalWagesPaid, unpaid: internalSalaryTotals.totalWagesUnpaid };
    const sections = [];
    const categories = [
        { key: 'material', label: 'Beban Material' },
        { key: 'gaji', label: 'Beban Gaji' },
        { key: 'operasional', label: 'Beban Operasional' },
        { key: 'lainnya', label: 'Beban Lainnya' }
    ];

    const mainBody = [];
    categories.forEach(cat => {
        const data = totals.main[cat.key];
        const total = data.paid + data.unpaid;
        if (total > 0) mainBody.push([cat.label, fmtIDRFormat(data.paid), fmtIDRFormat(data.unpaid), fmtIDRFormat(total)]);
    });
    const totalMain = Object.values(totals.main).reduce((sum, cat) => sum + cat.paid + cat.unpaid, 0);
    if (mainBody.length > 0) {
        sections.push({
            sectionTitle: `Proyek Utama (${mainProject?.projectName || '-'})`,
            headers: ["Kategori Beban", "Lunas", "Belum Lunas", "Total"],
            body: mainBody,
            foot: [["Total Beban Proyek Utama", "", "", fmtIDRFormat(totalMain)]]
        });
    }

    const internalBody = [];
    categories.forEach(cat => {
        const data = totals.internal[cat.key];
        const total = data.paid + data.unpaid;
        if (total > 0) internalBody.push([cat.label, fmtIDRFormat(data.paid), fmtIDRFormat(data.unpaid), fmtIDRFormat(total)]);
    });
    const totalInternal = Object.values(totals.internal).reduce((sum, cat) => sum + cat.paid + cat.unpaid, 0);
    if (internalBody.length > 0) {
        sections.push({
            sectionTitle: `Total Semua Proyek Internal`,
            headers: ["Kategori Beban", "Lunas", "Belum Lunas", "Total"],
            body: internalBody,
            foot: [["Total Beban Proyek Internal", "", "", fmtIDRFormat(totalInternal)]]
        });
    }

    const loanInterest = (appState.fundingSources || []).filter(loan => !loan.isDeleted).reduce((sum, loan) => {
        const principal = Number(loan.totalAmount || loan.amount || 0);
        const repayable = Number(loan.totalRepaymentAmount || principal);
        return sum + Math.max(0, repayable - principal);
    }, 0);
    const grandTotal = totalMain + totalInternal + loanInterest;
    sections.push({
        sectionTitle: `Ringkasan Total`,
        headers: ["Deskripsi", "Jumlah"],
        body: [
            ['Total Beban Proyek Utama', fmtIDRFormat(totalMain)],
            ['Total Beban Proyek Internal', fmtIDRFormat(totalInternal)],
        ],
        foot: [["Grand Total Semua Beban", fmtIDRFormat(grandTotal)]]
    });

    if (loanInterest > 0) {
        sections.push({
            sectionTitle: 'Analisis Bunga Pinjaman',
            headers: ['Deskripsi', { content: 'Jumlah', styles: { halign: 'right' } }],
            body: [
                ['Total Bunga Pinjaman', { content: fmtIDRFormat(loanInterest), styles: { halign: 'right' } }]
            ],
            foot: []
        });
    }

    return {
        title: 'Laporan Analisis Beban',
        subtitle: `Ringkasan Total Keseluruhan`,
        filename: `Analisis-Beban-${new Date().toISOString().slice(0, 10)}.pdf`,
        sections
    };
}

export async function handleDownloadReport(format, reportType, filters = {}) {
    if (format === 'csv') {
        toast('info', 'Fitur unduh CSV sedang dalam pengembangan.');
        return;
    }

    let reportConfig = null;
    switch (reportType) {
        case 'accounting_statements':
            reportConfig = await _prepareAccountingStatementsPdf();
            break;
        case 'charts_presentation':
            await _generateChartsPresentationPdf();
            return;
        case 'analisis_beban':
            reportConfig = await _prepareAnalisisBebanDataForPdf();
            break;
        case 'upah_pekerja':
            reportConfig = await _prepareUpahPekerjaDataForPdf(filters);
            break;
        case 'material_supplier':
            reportConfig = await _prepareMaterialSupplierDataForPdf();
            break;
        case 'rekapan':
            reportConfig = await _prepareRekapanDataForPdf();
            break;
        case 'material_usage_per_project':
            reportConfig = await _prepareMaterialUsageDataForPdf();
            break;
        default:
            toast('error', 'Tipe laporan ini belum didukung.');
            return;
    }

    if (!reportConfig) {
        toast('info', 'Tidak ada data untuk rentang/filter yang dipilih.');
        return;
    }
    await generatePdfReport(reportConfig);
}

export async function downloadInvoiceDetailPdf(expenseInput) {
    const expense = typeof expenseInput === 'string'
        ? (appState.expenses || []).find(exp => exp.id === expenseInput)
        : expenseInput;
    if (!expense) {
        toast('error', 'Data faktur tidak ditemukan.');
        return;
    }
    if (!Array.isArray(expense.items) || expense.items.length === 0) {
        toast('info', 'Faktur ini belum memiliki rincian item.');
        return;
    }

    const supplier = (appState.suppliers || []).find(s => s.id === expense.supplierId);
    const project = (appState.projects || []).find(p => p.id === expense.projectId);
    const dateObj = getJSDate(expense.date);
    const dateLabel = isNaN(dateObj.getTime()) ? '-' : dateObj.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
    const subtitleParts = [];
    if (supplier?.supplierName) subtitleParts.push(supplier.supplierName);
    if (project?.projectName) subtitleParts.push(project.projectName);
    if (dateLabel !== '-') subtitleParts.push(dateLabel);

    const materialMap = new Map((appState.materials || []).map(mat => [mat.id, mat.materialName]));
    const bodyRows = expense.items.map(item => {
        const qty = item.quantity ?? item.qty ?? 0;
        const unit = item.unit || '';
        const price = item.price || 0;
        const materialName = item.name || item.itemName || materialMap.get(item.materialId || item.itemId || item.id) || 'Item';
        return [
            materialName,
            `${qty} ${unit}`.trim(),
            fmtIDRFormat(price),
            fmtIDRFormat(qty * price)
        ];
    });

    const sections = [{
        sectionTitle: 'Rincian Item Faktur',
        headers: ['Item', 'Qty', 'Harga', 'Subtotal'],
        body: bodyRows,
        foot: [['Total Faktur', '', '', fmtIDRFormat(expense.amount || 0)]]
    }];

    await generatePdfReport({
        title: expense.description || 'Faktur Material',
        subtitle: subtitleParts.join(' • '),
        filename: `Faktur-${(supplier?.supplierName || 'Material').replace(/\s+/g, '-')}-${(dateLabel || '').replace(/\s+/g, '-')}.pdf`,
        sections
    });
}

export async function downloadWorkerAttendanceReport({ workerId, startDate, endDate }) {
    if (!workerId || !startDate || !endDate) {
        toast('error', 'Pilih pekerja dan rentang tanggal untuk laporan.');
        return;
    }

    const worker = (appState.workers || []).find(w => w.id === workerId);
    if (!worker) {
        toast('error', 'Data pekerja tidak ditemukan.');
        return;
    }

    const startDateObj = parseLocalDate(startDate);
    const endDateObj = parseLocalDate(endDate);
    if (startDateObj > endDateObj) {
        toast('error', 'Tanggal mulai tidak boleh melebihi tanggal akhir.');
        return;
    }
    endDateObj.setHours(23, 59, 59, 999);

    let records = (appState.attendanceRecords || []).filter(rec => {
        if (rec.isDeleted || rec.workerId !== workerId) return false;
        const recDate = getJSDate(rec.date);
        if (isNaN(recDate.getTime())) return false;
        return recDate >= startDateObj && recDate <= endDateObj;
    });

    records = normalizeDailyAttendanceRecords(records);
    records.sort((a, b) => getJSDate(a.date) - getJSDate(b.date));

    if (records.length === 0) {
        toast('info', 'Tidak ada data absensi pada rentang tanggal tersebut.');
        return;
    }

    const projectMap = new Map((appState.projects || []).map(p => [p.id, p.projectName]));
    const totalPay = records.reduce((sum, rec) => sum + (rec.totalPay || 0), 0);
    const totalDays = records.reduce((sum, rec) => sum + getRecordDayValue(rec), 0);
    const detailRows = records.map(rec => {
        const recDate = getJSDate(rec.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
        const projectName = projectMap.get(rec.projectId) || '-';
        const statusLabel = rec.attendanceStatus === 'full_day' ? 'Hadir' :
            (rec.attendanceStatus === 'half_day' ? '1/2 Hari' : 'Absen');
        const role = rec.jobRole || '-';
        return [recDate, projectName, statusLabel, role, fmtIDRFormat(rec.totalPay || 0)];
    });

    const summarySection = {
        sectionTitle: 'Ringkasan Kehadiran',
        headers: ['Metrik', 'Nilai'],
        body: [
            ['Pekerja', worker.workerName],
            ['Rentang Tanggal', `${startDate} s.d. ${endDate}`],
            ['Total Hari Aktif', `${totalDays} hari`],
            ['Total Upah', fmtIDRFormat(totalPay)]
        ]
    };

    const detailSection = {
        sectionTitle: 'Rincian Kehadiran',
        headers: ['Tanggal', 'Proyek', 'Status', 'Peran', 'Nominal'],
        body: detailRows
    };

    await generatePdfReport({
        title: `Laporan Kehadiran ${worker.workerName}`,
        subtitle: `${startDate} - ${endDate}`,
        filename: `Laporan-${worker.workerName.replace(/\s+/g, '-')}-${startDate}-${endDate}.pdf`,
        sections: [summarySection, detailSection]
    });
}

export async function downloadCustomTablePdf(config = {}) {
    await generatePdfReport(config);
}

function _prepareSimulasiData() {
    const allItems = [];
    let totalAlokasi = 0;

    appState.simulasiState.selectedPayments.forEach((amount, id) => {
        const firstHyphenIndex = id.indexOf('-');
        if (firstHyphenIndex === -1) return;
        const itemType = id.substring(0, firstHyphenIndex);
        const itemId = id.substring(firstHyphenIndex + 1);

        let details = {};

        if (itemType === 'bill') {
            const bill = appState.bills.find(b => b.id === itemId && !b.isDeleted);
            if (!bill) return;

            const expense = bill.expenseId ? appState.expenses.find(e => e.id === bill.expenseId && !e.isDeleted) : null;
            const project = appState.projects.find(p => p.id === (expense?.projectId || bill.projectId));

            details = {
                projectName: project?.projectName || 'Tanpa Proyek',
                description: bill.description,
                amount: amount,
                category: bill.type || 'lainnya',
            };

            if (bill.type === 'gaji') {
                const worker = appState.workers.find(w => w.id === bill.workerId);
                details.recipient = worker?.workerName || 'Pekerja';
            } else if (bill.type === 'fee') {
                const staff = appState.staff.find(s => s.id === bill.staffId);
                details.recipient = staff?.staffName || 'Staf';
            } else {
                const supplier = expense?.supplierId ? appState.suppliers.find(s => s.id === expense.supplierId && !s.isDeleted) : null;
                details.recipient = supplier?.supplierName || 'Supplier';
            }

        } else if (itemType === 'loan') {
            const loan = appState.fundingSources.find(l => l.id === itemId && !l.isDeleted);
            if (!loan) return;
            const creditor = appState.fundingCreditors.find(c => c.id === loan.creditorId && !c.isDeleted);
            details = {
                projectName: 'Tanpa Proyek',
                description: 'Cicilan Pinjaman',
                amount: amount,
                category: 'pinjaman',
                recipient: creditor?.creditorName || 'Kreditur',
            };
        }

        if (Object.keys(details).length > 0) {
            allItems.push(details);
            totalAlokasi += amount;
        }
    });

    const categoryLabels = {
        gaji: 'Gaji Pekerja', fee: 'Fee Staf', material: 'Tagihan Material',
        operasional: 'Tagihan Operasional', lainnya: 'Tagihan Lainnya', pinjaman: 'Cicilan Pinjaman'
    };
    
    const groupedByCategory = allItems.reduce((acc, item) => {
        const categoryKey = item.category || 'lainnya';
        if (!acc[categoryKey]) {
            acc[categoryKey] = {
                categoryName: categoryLabels[categoryKey] || categoryKey.toUpperCase(),
                items: [],
                total: 0
            };
        }
        acc[categoryKey].items.push(item);
        acc[categoryKey].total += item.amount;
        return acc;
    }, {});
    
    return {
        groupedByCategory,
        totalAlokasi
    };
}

export async function createSimulasiPDF() {
    const danaMasukEl = document.getElementById('simulasi-dana-masuk');
    const danaMasuk = parseFormattedNumber(danaMasukEl.value);
    if (danaMasuk <= 0 || appState.simulasiState.selectedPayments.size === 0) {
        toast('error', 'Isi dana masuk dan pilih minimal satu tagihan.');
        return;
    }

    const loader = startGlobalLoading('Mempersiapkan Laporan PDF...');

    try {
        const { groupedByCategory, totalAlokasi } = _prepareSimulasiData();
        const sisaDana = danaMasuk - totalAlokasi;

        const sections = [];

        sections.push({
            sectionTitle: 'Ringkasan Alokasi Dana',
            headers: ['Deskripsi', 'Jumlah'],
            body: [
                ['Dana Masuk (Uang di Tangan)', fmtIDRFormat(danaMasuk)],
                ['Total Alokasi Pembayaran', fmtIDRFormat(totalAlokasi)]
            ],
            foot: [['Sisa Dana', fmtIDRFormat(sisaDana)]]
        });

        const categoryLabels = {
            gaji: 'Gaji Pekerja', fee: 'Fee Staf', material: 'Tagihan Material',
            operasional: 'Tagihan Operasional', lainnya: 'Tagihan Lainnya', pinjaman: 'Cicilan Pinjaman'
        };

        for (const categoryKey in groupedByCategory) {
            const categoryData = groupedByCategory[categoryKey];
            
            const bodyRows = categoryData.items.map(item => {
                const description = `${item.description} (${item.projectName})`;
                return [
                    item.recipient,
                    description,
                    { content: fmtIDRFormat(item.amount), styles: { halign: 'right' } }
                ];
            });
            
            sections.push({
                sectionTitle: `Rincian Alokasi: ${categoryData.categoryName}`,
                headers: ['Penerima', 'Deskripsi (Proyek)', { content: 'Jumlah', styles: { halign: 'right' } }],
                body: bodyRows,
                foot: [['Total Kategori', '', { content: fmtIDRFormat(categoryData.total), styles: { halign: 'right' } }]]
            });
        }

        await generatePdfReport({
            title: 'Laporan Simulasi Alokasi Dana',
            subtitle: `Dibuat pada: ${new Date().toLocaleDateString('id-ID', {day:'numeric', month:'long', year:'numeric'})}`,
            filename: `Simulasi-Alokasi-Dana-${new Date().toISOString().slice(0, 10)}.pdf`,
            sections: sections
        });

        loader.close();
    } catch (error) {
        loader.close();
        toast('error', 'Gagal membuat PDF. Coba lagi.');
        console.error("Gagal membuat PDF Simulasi:", error);
    }
}

function _calculateOutstandingSalaryInstallments({ inRange, byProject }) {
    const salaryBills = (appState.bills || []).filter(b => !b.isDeleted && (b.type === 'gaji' || b.type === 'fee') && byProject(b.projectId) && inRange(b.createdAt || b.dueDate || b.date));
    const outstandingBills = salaryBills.reduce((sum, bill) => sum + Math.max(0, (bill.amount || 0) - (bill.paidAmount || 0)), 0);

    const outstandingAttendance = (appState.attendanceRecords || [])
        .filter(rec => !rec.isDeleted && byProject(rec.projectId) && inRange(rec.date) && (rec.totalPay || 0) > 0 && (rec.isPaid === false || rec.isPaid === 0 || rec.isPaid == null))
        .reduce((sum, rec) => sum + (rec.totalPay || 0), 0);

    return outstandingBills + outstandingAttendance;
}

function buildReportAttendanceProjectMap() {
    const map = new Map();
    (appState.attendanceRecords || []).forEach(rec => {
        if (rec && rec.id && rec.projectId) {
            map.set(rec.id, rec.projectId);
        }
    });
    return map;
}

function getReportBillProjectIds(bill, attendanceProjectMap) {
    const ids = new Set();
    if (!bill) return ids;
    if (bill.projectId) ids.add(bill.projectId);
    if (Array.isArray(bill.recordIds)) {
        bill.recordIds.forEach(recordId => {
            const pid = attendanceProjectMap.get(recordId);
            if (pid) ids.add(pid);
        });
    }
    return ids;
}

function getReportBillEffectiveDate(bill) {
    if (!bill) return null;
    const candidates = [bill.createdAt, bill.dueDate, bill.date, bill.startDate, bill.updatedAt];
    for (const value of candidates) {
        const date = getJSDate(value);
        if (date) return date;
    }
    return null;
}

function calculateReportSalaryTotals({ start, end, projectPredicate, attendanceProjectMap }) {
    const map = attendanceProjectMap || buildReportAttendanceProjectMap();
    const startDate = start ? new Date(`${start}T00:00:00`) : null;
    const endDate = end ? new Date(`${end}T23:59:59`) : null;
    const isInRange = (date) => {
        if (!date) return true;
        if (startDate && date < startDate) return false;
        if (endDate && date > endDate) return false;
        return true;
    };
    const salaryBills = (appState.bills || []).filter(bill => {
        if (!bill || bill.isDeleted) return false;
        if (!['gaji', 'fee'].includes(bill.type)) return false;
        const billDate = getReportBillEffectiveDate(bill);
        if (billDate && !isInRange(billDate)) return false;
        if (projectPredicate) {
            const projectIds = getReportBillProjectIds(bill, map);
            if (!projectPredicate(projectIds)) return false;
        }
        return true;
    });
    const totalWagesPaid = salaryBills.reduce((sum, bill) => sum + (bill.paidAmount || 0), 0);
    const totalWagesUnpaid = salaryBills.reduce((sum, bill) => sum + Math.max(0, (bill.amount || 0) - (bill.paidAmount || 0)), 0);
    return { totalWagesPaid, totalWagesUnpaid, salaryBills, attendanceProjectMap: map };
}

async function _fetchBillPayments(billId) {
    const payments = [];
    try {
        const billRef = doc(billsCol, billId);
        const paymentsRef = collection(billRef, 'payments');
        const snap = await getDocs(query(paymentsRef, orderBy('date', 'asc')));
        snap.forEach(d => {
            const data = d.data() || {};
            payments.push({
                id: d.id,
                amount: data.amount || 0,
                date: data.date?.toDate ? data.date.toDate() : data.date,
                createdBy: data.createdBy,
                createdByName: data.createdByName || data.createdByUserName,
                workerId: data.workerId
            });
        });
    } catch (e) {
        console.warn('Gagal mengambil payments bill', billId, e);
    }
    try {
        const localPayments = await localDB.pending_payments.where({ billId }).toArray();
        localPayments.forEach(p => payments.push({
            id: `pending-${p.id}`,
            amount: p.amount || 0,
            date: p.date || p.createdAt,
            createdAt: p.createdAt,
            createdBy: p.createdBy,
            createdByName: p.createdByName || p.workerName,
            workerId: p.workerId
        }));
    } catch (e) {
        console.warn('Gagal mengambil pending payments lokal', e);
    }
    return payments;
}

function _formatFullTimestamp(dateInput) {
    const d = getJSDate(dateInput);
    if (!(d instanceof Date) || Number.isNaN(d.getTime())) return '-';
    const dd = String(d.getDate()).padStart(2, '0');
    const mmm = d.toLocaleString('id-ID', { month: 'short' });
    const yyyy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    return `${dd}/${mmm}/${yyyy} ${hh}:${mm}:${ss}`;
}

async function _getWorkerSalaryPayments(workerId, { startDate, endDate }) {
    const relevantBills = (appState.bills || []).filter(bill => {
        if (bill.isDeleted || bill.type !== 'gaji') return false;
        const isDirect = bill.workerId === workerId;
        const inDetails = Array.isArray(bill.workerDetails) && bill.workerDetails.some(w => (w.id === workerId || w.workerId === workerId));
        return isDirect || inDetails;
    });

    const payments = [];
    for (const bill of relevantBills) {
        const billPayments = await _fetchBillPayments(bill.id);
        billPayments.forEach(p => {
            const payDate = getJSDate(p.date || p.createdAt || bill.paidAt || bill.createdAt);
            if (payDate instanceof Date && !Number.isNaN(payDate.getTime())) {
                if (startDate && payDate < startDate) return;
                if (endDate && payDate > endDate) return;
            }
            const targetWorkerId = p.workerId || bill.workerId;
            if (targetWorkerId && targetWorkerId !== workerId) return;
            payments.push({
                billId: bill.id,
                amount: p.amount || 0,
                date: payDate,
                createdByName: p.createdByName || p.createdBy || '-'
            });
        });

        if (billPayments.length === 0 && (bill.paidAmount || 0) > 0) {
            const payDate = getJSDate(bill.paidAt || bill.updatedAt || bill.createdAt);
            if (payDate instanceof Date && !Number.isNaN(payDate.getTime())) {
                if (startDate && payDate < startDate) continue;
                if (endDate && payDate > endDate) continue;
            }
            payments.push({
                billId: bill.id,
                amount: bill.paidAmount || bill.amount || 0,
                date: payDate,
                createdByName: bill.updatedByName || bill.createdByName || '-'
            });
        }
    }

    payments.sort((a, b) => getJSDate(a.date) - getJSDate(b.date));
    const totalPaid = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
    return { payments, totalPaid };
}


// ---------- Accounting Statements (P&L, CF, Balance Sheet) ----------
async function _prepareAccountingStatementsPdf() {
    const startDateStr = $('#report-start-date')?.value || $('#laporan-start-date')?.value || '';
    const endDateStr = $('#report-end-date')?.value || $('#laporan-end-date')?.value || '';
    const projectId = $('#report-project-id')?.value || $('#laporan-project-id')?.value || 'all';
    if (!startDateStr || !endDateStr) {
        toast('error', 'Silakan pilih rentang tanggal laporan terlebih dahulu.');
        return null;
    }
    const start = startDateStr;
    const end = endDateStr;
    const inRange = (d) => {
        const dt = getJSDate(d);
        return dt >= new Date(start + 'T00:00:00') && dt <= new Date(end + 'T23:59:59');
    };
    const byProject = pid => (projectId && projectId !== 'all') ? (pid === projectId) : true;

    const incomes = (appState.incomes || []).filter(x => !x.isDeleted && byProject(x.projectId) && inRange(x.date));
    const expenses = (appState.expenses || []).filter(x => !x.isDeleted && byProject(x.projectId) && inRange(x.date));
    const bills = (appState.bills || []).filter(b => !b.isDeleted && byProject(b.projectId) && inRange(b.createdAt || b.dueDate || b.date));
    const funding = (appState.fundingSources || []).filter(f => !f.isDeleted && inRange(f.createdAt || f.date));

    const revenue = incomes.reduce((s,i)=>s+(i.amount||0),0);
    const expCat = { material: 0, operasional: 0, lainnya: 0 };
    expenses.forEach(e => { const t = e.type || 'lainnya'; if (expCat[t] == null) expCat[t]=0; expCat[t] += (e.amount||0); });
    const wagesPaid = bills.filter(b => (b.type === 'gaji' || b.type === 'fee') && b.status === 'paid').reduce((s,b)=>s+(b.amount||0),0);
    const unpaidBillsAmount = bills.filter(b => b.status==='unpaid').reduce((s,b)=>s+Math.max(0,(b.amount||0)-(b.paidAmount||0)),0);
    const unpaidLoansAmount = (appState.fundingSources || []).filter(l => !l.isDeleted && l.status==='unpaid' && inRange(l.createdAt||l.date)).reduce((s,l)=>s+Math.max(0,(l.totalAmount||0)-(l.paidAmount||0)),0);
    const outstandingSalaryInstallments = _calculateOutstandingSalaryInstallments({ inRange, byProject });
    const cogs = expCat.material || 0;
    const grossProfit = revenue - cogs;
    const opex = (expCat.operasional||0) + (expCat.lainnya||0) + wagesPaid;
    const netProfit = grossProfit - opex;
    const financingIn = funding.reduce((s,f)=>s+(f.totalAmount||0),0);
    const cashNetChange = (revenue - ((expCat.material||0)+(expCat.operasional||0)+(expCat.lainnya||0)+wagesPaid)) + financingIn;

    const sections = [];
    sections.push({
        sectionTitle: 'Laba Rugi',
        headers: ['Deskripsi', { content: 'Jumlah', styles: { halign: 'right' } }],
        body: [
            ['Pendapatan', { content: fmtIDRFormat(revenue), styles: { halign: 'right' } }],
            ['HPP (Material)', { content: fmtIDRFormat(cogs), styles: { halign: 'right' } }],
            ['Laba Kotor', { content: fmtIDRFormat(grossProfit), styles: { halign: 'right' } }],
            ['Beban Operasional + Lainnya + Upah', { content: fmtIDRFormat(opex), styles: { halign: 'right' } }],
            ['Laba/Rugi Bersih', { content: fmtIDRFormat(netProfit), styles: { halign: 'right' } }]
        ]
    });
    sections.push({
        sectionTitle: 'Analisis Beban',
        headers: ['Kategori', { content: 'Total', styles: { halign: 'right' } }],
        body: [
            ['Material (HPP)', { content: fmtIDRFormat(expCat.material||0), styles: { halign: 'right' } }],
            ['Operasional', { content: fmtIDRFormat(expCat.operasional||0), styles: { halign: 'right' } }],
            ['Lainnya', { content: fmtIDRFormat(expCat.lainnya||0), styles: { halign: 'right' } }],
            ['Gaji/Fee (Lunas)', { content: fmtIDRFormat(wagesPaid), styles: { halign: 'right' } }]
        ]
    });
    sections.push({
        sectionTitle: 'Neraca (Ringkas)',
        headers: ['Akun', { content: 'Nilai', styles: { halign: 'right' } }],
        body: [
            ['Aset: Kas (perubahan bersih periode)', { content: fmtIDRFormat(cashNetChange), styles: { halign: 'right' } }],
            ['Kewajiban: Utang Usaha (Tagihan Belum Lunas)', { content: fmtIDRFormat(unpaidBillsAmount), styles: { halign: 'right' } }],
            ['Kewajiban: Pinjaman Belum Lunas', { content: fmtIDRFormat(unpaidLoansAmount), styles: { halign: 'right' } }],
            ['Kewajiban: Cicilan Gaji/Upah Belum Lunas', { content: fmtIDRFormat(outstandingSalaryInstallments), styles: { halign: 'right' } }]
        ]
    });
    sections.push({
        sectionTitle: 'Arus Kas (Ringkas)',
        headers: ['Deskripsi', { content: 'Jumlah', styles: { halign: 'right' } }],
        body: [
            ['Kas dari Operasi (neto)', { content: fmtIDRFormat(revenue - ((expCat.material||0)+(expCat.operasional||0)+(expCat.lainnya||0)+wagesPaid)), styles: { halign: 'right' } }],
            ['Kas dari Pendanaan (masuk)', { content: fmtIDRFormat(financingIn), styles: { halign: 'right' } }],
            ['Perubahan Kas (neto)', { content: fmtIDRFormat(cashNetChange), styles: { halign: 'right' } }]
        ]
    });

    const title = 'Laporan Akuntansi Proyek';
    const subtitle = `Periode: ${new Date(start).toLocaleDateString('id-ID')} s/d ${new Date(end).toLocaleDateString('id-ID')}` + (projectId && projectId!=='all' ? ` | Proyek: ${(appState.projects||[]).find(p=>p.id===projectId)?.projectName || '-'}` : '');
    const filename = `Laporan-Akuntansi-${new Date().toISOString().slice(0,10)}.pdf`;
    return { title, subtitle, filename, sections };
}

// ---------- Charts Presentation PDF ----------
async function _generateChartsPresentationPdf() {
    const startDateStr = $('#report-start-date')?.value || $('#laporan-start-date')?.value || '';
    const endDateStr = $('#report-end-date')?.value || $('#laporan-end-date')?.value || '';
    const projectId = $('#report-project-id')?.value || $('#laporan-project-id')?.value || 'all';
    if (!startDateStr || !endDateStr) {
        toast('error', 'Silakan pilih rentang tanggal laporan terlebih dahulu.');
        return;
    }
    await __ensurePdfLibs();
    await __ensureChartLibForPdf();
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    const start = startDateStr; const end = endDateStr;
    const inRange = (d) => { const dt = getJSDate(d); return dt >= new Date(start+'T00:00:00') && dt <= new Date(end+'T23:59:59'); };
    const byProject = pid => (projectId && projectId !== 'all') ? (pid === projectId) : true;

    // Aggregations
    const incomes = (appState.incomes||[]).filter(x=>!x.isDeleted && byProject(x.projectId) && inRange(x.date));
    const expenses = (appState.expenses||[]).filter(x=>!x.isDeleted && byProject(x.projectId) && inRange(x.date));
    const funding = (appState.fundingSources||[]).filter(f=>!f.isDeleted && inRange(f.createdAt || f.date));
    const totalIncome = incomes.reduce((s,i)=>s+(i.amount||0),0);
    const totalExpense = expenses.reduce((s,e)=>s+(e.amount||0),0);
    const totalFunding = funding.reduce((s,f)=>s+(f.totalAmount||0),0);

    // Prepare canvases
    const makeCanvas = (w=420,h=260) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
    const donutCanvas = makeCanvas();
    const trendCanvas = makeCanvas();
    const cfCanvas = makeCanvas();

    const noAnim = { animation: false };
    const chartOptsBase = { responsive:false, maintainAspectRatio:false, plugins:{ legend:{ position:'bottom' } }, ...noAnim };

    // Donut chart
    new window.Chart(donutCanvas.getContext('2d'), {
        type: 'doughnut',
        data: { labels:['Pemasukan','Pengeluaran','Pendanaan'], datasets:[{ data:[totalIncome,totalExpense,totalFunding], backgroundColor:['#10b981','#ef4444','#eab308'], borderWidth:0 }]},
        options:{ ...chartOptsBase, cutout:'68%' }
    });

    // 7-day trend
    const labels = []; const inData = Array(7).fill(0); const outData = Array(7).fill(0);
    for (let i=6;i>=0;i--){ const d=new Date(); d.setDate(d.getDate()-i); labels.push(d.toLocaleDateString('id-ID',{weekday:'short'})); const ymd=d.toISOString().slice(0,10); incomes.forEach(inc=>{ const di=getJSDate(inc.date); if(di.toISOString().slice(0,10)===ymd) inData[6-i]+=inc.amount||0;}); expenses.forEach(exp=>{ const de=getJSDate(exp.date); if(de.toISOString().slice(0,10)===ymd) outData[6-i]+=exp.amount||0;}); }
    new window.Chart(trendCanvas.getContext('2d'), {
        type:'line',
        data:{ labels, datasets:[{ label:'Pemasukan', data:inData, borderColor:'#10b981', tension:.4, pointRadius:0, fill:false }, { label:'Pengeluaran', data:outData, borderColor:'#ef4444', tension:.4, pointRadius:0, fill:false }] },
        options: chartOptsBase
    });

    // Cashflow by month (or week if short range)
    const sDate = new Date(start + 'T00:00:00'); const eDate = new Date(end + 'T23:59:59');
    const days = Math.round((eDate - sDate) / (1000*3600*24));
    const mode = days > 45 ? 'monthly' : 'weekly';
    const periods=[];
    function startOfWeek(d){ const dt=new Date(d); const day=dt.getDay(); const diff=dt.getDate()-day+(day===0?-6:1); dt.setDate(diff); dt.setHours(0,0,0,0); return dt; }
    function startOfMonth(d){ const dt=new Date(d.getFullYear(), d.getMonth(), 1); dt.setHours(0,0,0,0); return dt; }
    let cur = mode==='weekly'? startOfWeek(sDate): startOfMonth(sDate);
    while (cur <= eDate) { periods.push(new Date(cur)); cur = new Date(cur); if (mode==='weekly') cur.setDate(cur.getDate()+7); else cur.setMonth(cur.getMonth()+1); }
    const cfLabels = periods.map(p => mode==='weekly' ? `Minggu ${p.toLocaleDateString('id-ID')}` : `${p.toLocaleString('id-ID',{month:'short'})} ${p.getFullYear()}`);
    const inflows = Array(periods.length).fill(0); const outflows = Array(periods.length).fill(0);
    const findIdx = (date) => { const d=new Date(date); if (mode==='weekly'){ for(let i=0;i<periods.length;i++){ const s=periods[i];const e=new Date(s); e.setDate(e.getDate()+6); e.setHours(23,59,59,999); if(d>=s && d<=e) return i; } } else { for(let i=0;i<periods.length;i++){ const s=periods[i];const e=new Date(s); e.setMonth(e.getMonth()+1); e.setDate(0); e.setHours(23,59,59,999); if(d>=s && d<=e) return i; } } return -1; };
    incomes.forEach(inc=>{ const idx=findIdx(getJSDate(inc.date)); if(idx>=0) inflows[idx]+=(inc.amount||0);});
    funding.forEach(f=>{ const idx=findIdx(getJSDate(f.createdAt || f.date)); if(idx>=0) inflows[idx]+=(f.totalAmount||0);} );
    expenses.forEach(exp=>{ const idx=findIdx(getJSDate(exp.date)); if(idx>=0) outflows[idx]+=(exp.amount||0);} );
    new window.Chart(cfCanvas.getContext('2d'), {
        type:'bar',
        data:{ labels: cfLabels, datasets:[ {label:'Masuk', data: inflows, backgroundColor:'#10b981', stack:'f' }, {label:'Keluar', data: outflows, backgroundColor:'#ef4444', stack:'f' } ] },
        options:{ ...chartOptsBase, scales:{ x:{ stacked:true }, y:{ stacked:true } } }
    });

    const delayNextFrame = async () => { await new Promise(r => requestAnimationFrame(() => r())); };
    await delayNextFrame();
    await delayNextFrame();

    const toPngWithWhiteBG = (canvas) => {
        const tmp = document.createElement('canvas');
        tmp.width = canvas.width; tmp.height = canvas.height;
        const ctx = tmp.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0,0,tmp.width,tmp.height);
        ctx.drawImage(canvas, 0, 0);
        return tmp.toDataURL('image/png');
    };

    // Compose PDF
    const pageWidth = pdf.internal.pageSize.getWidth();
    const margin = 12;
    pdf.setFontSize(14).setFont('helvetica', 'bold');
    pdf.text('Presentasi Grafik Laporan Keuangan', margin, 18);
    pdf.setFontSize(9).setFont('helvetica', 'normal');
    const subtitle = `Periode: ${new Date(start).toLocaleDateString('id-ID')} s/d ${new Date(end).toLocaleDateString('id-ID')}` + (projectId && projectId!=='all'? ` | Proyek: ${(appState.projects||[]).find(p=>p.id===projectId)?.projectName || '-'}` : '');
    pdf.text(subtitle, margin, 24);

    let y = 32; const imgW = pageWidth - margin*2; const imgH = 60;
    pdf.addImage(toPngWithWhiteBG(donutCanvas), 'PNG', margin, y, imgW, imgH); y += imgH + 8;
    pdf.addImage(toPngWithWhiteBG(trendCanvas), 'PNG', margin, y, imgW, imgH); y += imgH + 8;
    pdf.addPage(); y = 18; pdf.setFontSize(12).setFont('helvetica','bold'); pdf.text('Arus Kas per Periode', margin, y); y+=6;
    pdf.addImage(toPngWithWhiteBG(cfCanvas), 'PNG', margin, y, imgW, imgH+20);

    pdf.save(`Presentasi-Grafik-${new Date().toISOString().slice(0,10)}.pdf`);
    toast('success', 'PDF grafik berhasil dibuat!');
}
