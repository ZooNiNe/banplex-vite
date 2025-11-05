/* global Chart */
let __chartLoaderPromise;
async function __ensureChartLib() {
    if (typeof Chart !== 'undefined' && Chart && typeof Chart === 'function') return;
    if (!__chartLoaderPromise) {
        __chartLoaderPromise = new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.2/dist/chart.umd.min.js';
            s.async = true;
            s.crossOrigin = 'anonymous';
            s.onload = () => resolve();
            s.onerror = (e) => reject(e);
            document.head.appendChild(s);
        });
    }
    try { await __chartLoaderPromise; } catch (_) {}
}
import { fmtIDR } from "../../utils/formatters.js";
import { appState } from "../../state/appState.js";
import { getJSDate } from "../../utils/helpers.js";
import { emit } from "../../state/eventBus.js";

async function _renderSparklineChart(canvasId, data, isPositiveGood) {
    await __ensureChartLib();
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const existingChart = Chart.getChart ? Chart.getChart(canvas) : null;
    if (existingChart) {
        existingChart.destroy();
    }

    const ctx = canvas.getContext('2d');
    const cs = getComputedStyle(document.body);
    const incomeRGB = (cs.getPropertyValue('--chart-income-rgb') || '34, 197, 94').trim();
    const expenseRGB = (cs.getPropertyValue('--chart-expense-rgb') || '239, 68, 68').trim();
    const positiveColor = `rgba(${incomeRGB}, 0.85)`; // Success color
    const negativeColor = `rgba(${expenseRGB}, 0.85)`; // Danger color
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    const mainColor = isPositiveGood ? positiveColor : negativeColor;
    gradient.addColorStop(0, mainColor.replace('0.8', '0.2'));
    gradient.addColorStop(1, mainColor.replace('0.8', '0'));

    new Chart(ctx, {
        type: 'line',
        data: {
            labels: Array(data.length).fill(''),
            datasets: [{
                data: data,
                borderColor: mainColor,
                borderWidth: 2,
                fill: true,
                backgroundColor: gradient,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 800, easing: 'easeOutQuart' },
            plugins: {
                legend: { display: false },
                tooltip: { enabled: false }
            },
            elements: {
                point: { radius: 0 }
            },
            scales: {
                x: { display: false },
                y: { display: false }
            }
        }
    });
}

async function _renderInteractiveBarChart() {
    await __ensureChartLib();
    const canvas = document.getElementById('interactive-bar-chart');
    if (!canvas) return;

    const labels = [];
    const incomeData = Array(7).fill(0);
    const expenseData = Array(7).fill(0);
    const { start, end } = appState.reportFilter || {};
    const inRange = (d) => {
        const dt = getJSDate(d);
        if (start && dt < new Date(start + 'T00:00:00')) return false;
        if (end && dt > new Date(end + 'T23:59:59')) return false;
        return true;
    };
    for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        labels.push(date.toLocaleDateString('id-ID', { weekday: 'short' }));
        const ymd = date.toISOString().slice(0, 10);
        (appState.incomes || []).filter(x => !x.isDeleted).forEach(inc => {
            const d = getJSDate(inc.date);
            if (inRange(d) && d.toISOString().slice(0,10) === ymd) incomeData[6 - i] += inc.amount || 0;
        });
        (appState.expenses || []).filter(x => !x.isDeleted).forEach(exp => {
            const d = getJSDate(exp.date);
            if (inRange(d) && d.toISOString().slice(0,10) === ymd) expenseData[6 - i] += exp.amount || 0;
        });
    }

    const existing = Chart.getChart ? Chart.getChart(canvas) : null;
    if (existing) existing.destroy();

    const ctx = canvas.getContext('2d');
    const cs = getComputedStyle(document.body);
    const incomeRGB = (cs.getPropertyValue('--chart-income-rgb') || '16, 185, 129').trim();
    const expenseRGB = (cs.getPropertyValue('--chart-expense-rgb') || '244, 63, 94').trim();
    new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                { label: 'Pemasukan', data: incomeData, backgroundColor: `rgba(${incomeRGB}, 0.85)` },
                { label: 'Pengeluaran', data: expenseData, backgroundColor: `rgba(${expenseRGB}, 0.85)` }
            ]
        },
        options: {
            indexAxis: 'x',
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 900, easing: 'easeOutCubic' },
            scales: {
                y: { beginAtZero: true, ticks: { callback: v => fmtIDR(v) } },
                x: { grid: { display: false } }
            },
            plugins: { tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${fmtIDR(ctx.raw)}` } } },
            onClick: (event, elements) => {
                if (elements && elements.length > 0) {
                    const idx = elements[0].index;
                    const clickedDate = new Date();
                    clickedDate.setDate(clickedDate.getDate() - (6 - idx));
                    emit('laporan.showDailyTransactionDetails', clickedDate);
                }
            }
        }
    });
}

async function _renderMiniDonut(canvasId, labels, data, colors) {
      await __ensureChartLib();
      const c = document.getElementById(canvasId);
      if (!c) return;

      if (c._chart) c._chart.destroy();

      c._chart = new Chart(c.getContext('2d'), {
          type: 'doughnut',
          data: {
              labels: labels,
              datasets: [{
                  data: data,
                  backgroundColor: colors,
                  borderWidth: 0,
                  hoverOffset: 8
              }]
          },
          options: {
              responsive: true,
              maintainAspectRatio: false,
              cutout: '70%',
              onClick: (evt, elements) => {
                  const chart = c._chart;
                  if (!elements.length) return;

                  const index = elements[0].index;
                  const label = chart.data.labels[index];

                  let type = 'expense';
                  let category = label.toLowerCase().replace(/ /g, '_');

                  if (label.toLowerCase() === 'pemasukan') {
                      type = 'income';
                      category = null;
                  } else if (label.toLowerCase() === 'pengeluaran') {
                      type = 'expense';
                      category = null;
                  } else if (!['material', 'operasional', 'gaji', 'fee', 'lainnya'].includes(category)){
                     category = null;
                  }


                  emit('laporan.showChartDrillDown', { title: label, type, category });
              },
              plugins: {
                  legend: { display: false },
                  tooltip: {
                      enabled: true,
                      callbacks: {
                          label: function(context) {
                              const total = context.chart.data.datasets[0].data.reduce((a, b) => a + b, 0);
                              const label = context.label || '';
                              const value = context.raw || 0;
                              const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                              return `${label}: ${percentage}%`;
                          }
                      }
                  }
              }
          }
      });
}

function centerTextPlugin() {
  return {
      id: 'centerText',
      afterDraw: function(chart) {
          if (chart.config.type !== 'doughnut') return;

          const ctx = chart.ctx;
          const chartArea = chart.chartArea;
          const centerX = (chartArea.left + chartArea.right) / 2;
          const centerY = (chartArea.top + chartArea.bottom) / 2;

          ctx.save();

          let labelToDraw = "Total";
          let textToDraw = "";

          const total = chart.data.datasets[0].data.reduce((a, b) => a + b, 0);
          textToDraw = fmtIDR(total);

          const activeElements = chart.getActiveElements();
          if (activeElements.length > 0) {
              const activeIndex = activeElements[0].index;
              const activeData = chart.data.datasets[0].data[activeIndex];
              const activeLabel = chart.data.labels[activeIndex];

              labelToDraw = activeLabel;
              textToDraw = fmtIDR(activeData);
          }

          ctx.font = '600 0.8rem Inter';
          ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--text-dim').trim();
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(labelToDraw, centerX, centerY - 10);

          ctx.font = '700 1.1rem Inter';
          ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--text').trim();
          ctx.fillText(textToDraw, centerX, centerY + 12);

          ctx.restore();
      }
  };
}

async function _renderFinancialSummaryChart() {
    await __ensureChartLib();
    const canvas = document.getElementById('financial-summary-chart');
    if (!canvas) return;

    const { summary } = appState.dashboardData || { summary: {} };
    const totalIncome = summary?.totalIncome || 0;
    const totalExpense = summary?.totalExpense || 0;
    const totalFunding = summary?.totalFunding || 0;

    const ctx = canvas.getContext('2d');
    const existingChart = Chart.getChart(canvas);
    if (existingChart) existingChart.destroy();

    const cs = getComputedStyle(document.body);
    const textColor = cs.getPropertyValue('--text').trim();
    const incomeRGB = (cs.getPropertyValue('--chart-income-rgb') || '16, 185, 129').trim();
    const expenseRGB = (cs.getPropertyValue('--chart-expense-rgb') || '244, 63, 94').trim();
    const fundingRGB = (cs.getPropertyValue('--chart-funding-rgb') || '234, 179, 8').trim();
    const isSmall = window.matchMedia('(max-width: 599px)').matches;
    new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Pemasukan Murni', 'Pengeluaran', 'Pendanaan'],
            datasets: [{
                data: [totalIncome, totalExpense, totalFunding],
                backgroundColor: [
                    `rgba(${incomeRGB}, 0.85)`,
                    `rgba(${expenseRGB}, 0.85)`,
                    `rgba(${fundingRGB}, 0.85)`
                 ],
                borderWidth: 0,
                hoverOffset: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '70%',
            animation: { duration: 800, easing: 'easeOutQuart' },
            plugins: {
                legend: {
                    position: isSmall ? 'right' : 'bottom',
                    labels: {
                        color: textColor,
                        boxWidth: isSmall ? 10 : 12,
                        padding: isSmall ? 8 : 20,
                        usePointStyle: false,
                        font: {
                            weight: '500',
                            size: isSmall ? 10 : 12
                        }
                    }
                },
                tooltip: {
                    callbacks: {
                         label: function(context) {
                             const label = context.label || '';
                             const value = context.raw || 0;
                             return `${label}: ${fmtIDR(value)}`;
                         }
                    }
                },
                centerText: centerTextPlugin()
            },
            onClick: (evt, elements) => {
                const el = elements && elements[0];
                if (!el) return;
                const index = el.index;
                const chart = el.element.$context.chart;
                const label = chart.data.labels[index];

                let reportType = 'laporan';
                if (label === 'Pengeluaran') {
                    reportType = 'laporan';
                    emit('navigate', reportType);
                } else if (label === 'Pemasukan Murni') {
                    reportType = 'laporan';
                     emit('navigate', reportType);
                } else if (label === 'Pendanaan') {
                    reportType = 'laporan';
                     emit('navigate', reportType);
                }
            }
        }
    });
}

async function _renderIncomeExpenseBarChart() {
    // PERUBAHAN: Fungsi ini sekarang akan merender line chart tren 7 hari
    await __ensureChartLib();
    // ID canvas yang digunakan di dashboard.js adalah 'income-expense-chart'
    const canvas = document.getElementById('income-expense-chart');
    if (!canvas) return;

    const labels = [];
    const incomeData = Array(7).fill(0);
    const expenseData = Array(7).fill(0);

    // Kita akan selalu ambil 7 hari terakhir dari appState
    for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        labels.push(date.toLocaleDateString('id-ID', { weekday: 'short' }));
        const ymd = date.toISOString().slice(0, 10);
        
        (appState.incomes || []).filter(x => !x.isDeleted).forEach(inc => {
            const d = getJSDate(inc.date);
            if (d.toISOString().slice(0,10) === ymd) incomeData[6 - i] += inc.amount || 0;
        });
        (appState.expenses || []).filter(x => !x.isDeleted).forEach(exp => {
            const d = getJSDate(exp.date);
            if (d.toISOString().slice(0,10) === ymd) expenseData[6 - i] += exp.amount || 0;
        });
    }

    const existing = Chart.getChart ? Chart.getChart(canvas) : null;
    if (existing) existing.destroy();

    const ctx = canvas.getContext('2d');
    const cs = getComputedStyle(document.body);
    const incomeRGB = (cs.getPropertyValue('--chart-income-rgb') || '16, 185, 129').trim();
    const expenseRGB = (cs.getPropertyValue('--chart-expense-rgb') || '244, 63, 94').trim();
    const gridColor = (cs.getPropertyValue('--line') || '#e2e8f0').trim();
    const textColor = (cs.getPropertyValue('--text-dim') || '#64748b').trim();

    // Buat gradients
    const incomeGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    incomeGradient.addColorStop(0, `rgba(${incomeRGB}, 0.4)`);
    incomeGradient.addColorStop(1, `rgba(${incomeRGB}, 0)`);

    const expenseGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    expenseGradient.addColorStop(0, `rgba(${expenseRGB}, 0.4)`);
    expenseGradient.addColorStop(1, `rgba(${expenseRGB}, 0)`);

    new Chart(ctx, {
        type: 'line', // Tipe LINE
        data: {
            labels,
            datasets: [
                {
                    label: 'Pemasukan',
                    data: incomeData,
                    borderColor: `rgba(${incomeRGB}, 1)`,
                    backgroundColor: incomeGradient,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 0,
                },
                {
                    label: 'Pengeluaran',
                    data: expenseData,
                    borderColor: `rgba(${expenseRGB}, 1)`,
                    backgroundColor: expenseGradient,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 0,
                }
            ]
        },
        options: {
            indexAxis: 'x',
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 900, easing: 'easeOutCubic' },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: v => fmtIDR(v),
                        color: textColor
                    },
                    grid: {
                        color: gridColor
                    }
                },
                x: {
                    ticks: {
                        color: textColor
                    },
                    grid: {
                        display: false // Sembunyikan grid vertikal
                    }
                }
            },
            plugins: {
                 legend: { // Tampilkan legend di bawah
                    position: 'bottom',
                     labels: { color: textColor }
                },
                tooltip: {
                    callbacks: {
                        label: ctx => `${ctx.dataset.label}: ${fmtIDR(ctx.raw)}`
                    }
                }
            },
            onClick: (event, elements) => { // Pertahankan onClick
                if (elements && elements.length > 0) {
                    const idx = elements[0].index;
                    const clickedDate = new Date();
                    clickedDate.setDate(clickedDate.getDate() - (6 - idx));
                    emit('laporan.showDailyTransactionDetails', clickedDate);
                }
            }
        }
    });
}



export { _renderSparklineChart, _renderInteractiveBarChart, _renderMiniDonut, centerTextPlugin, _renderFinancialSummaryChart, _renderIncomeExpenseBarChart };

// Cashflow by Period (stacked bars)
export async function _renderCashflowPeriodChart({ canvasId = 'cashflow-period-chart', labels = [], inflows = [], outflows = [] } = {}) {
    await __ensureChartLib();
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const existing = Chart.getChart ? Chart.getChart(canvas) : null;
    if (existing) existing.destroy();

    const ctx = canvas.getContext('2d');
    const cs = getComputedStyle(document.body);
    const incomeRGB = (cs.getPropertyValue('--chart-income-rgb') || '16, 185, 129').trim();
    const expenseRGB = (cs.getPropertyValue('--chart-expense-rgb') || '244, 63, 94').trim();
    const gridColor = (cs.getPropertyValue('--line') || '#e2e8f0').trim();
    const textColor = (cs.getPropertyValue('--text-dim') || '#64748b').trim();

    new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                { label: 'Masuk', data: inflows, backgroundColor: `rgba(${incomeRGB}, 0.85)`, stack: 'flow' },
                { label: 'Keluar', data: outflows, backgroundColor: `rgba(${expenseRGB}, 0.85)`, stack: 'flow' }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 800, easing: 'easeOutQuart' },
            scales: {
                x: { stacked: true, ticks: { color: textColor }, grid: { display: false } },
                y: { stacked: true, beginAtZero: true, ticks: { callback: v => fmtIDR(v), color: textColor }, grid: { color: gridColor } }
            },
            plugins: {
                legend: { position: 'bottom', labels: { color: textColor } },
                tooltip: {
                    callbacks: {
                        label: ctx => `${ctx.dataset.label}: ${fmtIDR(ctx.raw)}`
                    }
                }
            }
        }
    });
}
