import { appState } from '../../state/appState.js';
import { getJSDate } from '../../utils/helpers.js';
import { localDB } from '../localDbService.js';

const getActiveBills = () => (appState.bills || []).filter(b => !b.isDeleted);
const getActiveExpenses = () => (appState.expenses || []).filter(e => !e.isDeleted);
const getActiveIncomes = () => (appState.incomes || []).filter(i => !i.isDeleted);
const getActiveFundingSources = () => (appState.fundingSources || []).filter(f => !f.isDeleted);
const getActiveProjects = () => (appState.projects || []).filter(p => !p.isDeleted);
const getActiveWorkers = () => (appState.workers || []).filter(w => !w.isDeleted);
const getActiveAttendance = () => (appState.attendanceRecords || []).filter(r => !r.isDeleted);

export async function calculateAndCacheDashboardTotals() {
    const unpaidBills = getActiveBills().filter(bill => bill.status === 'unpaid');
    const totalBills = getActiveBills(); 
    const totalUtang = unpaidBills.reduce((sum, bill) => sum + Math.max(0, (bill.amount || 0) - (bill.paidAmount || 0)), 0);

    const unpaidLoans = getActiveFundingSources().filter(loan => loan.status === 'unpaid');
    const totalLoans = getActiveFundingSources();
    const totalPiutang = unpaidLoans.reduce((sum, loan) => sum + Math.max(0, (loan.totalAmount || 0) - (loan.paidAmount || 0)), 0);

    let projects = getActiveProjects();
    if (!projects || projects.length === 0) {
        try {
            projects = await localDB.projects.where('isDeleted').notEqual(1).toArray();
            appState.projects = projects;
        } catch (e) {
            console.warn("Gagal mengambil data proyek dari Dexie:", e);
            projects = [];
        }
    }
    const mainProject = projects.find(p => p.projectType === 'main_income');

    const totalIncomeAllTime = getActiveIncomes()
        .reduce((sum, inc) => sum + (inc.amount || 0), 0);
    const totalPureIncomeAllTime = getActiveIncomes()
        .filter(inc => !mainProject || inc.projectId === mainProject.id)
        .reduce((sum, inc) => sum + (inc.amount || 0), 0);

    const allExpenses = getActiveExpenses();
    const totalExpenseAllTime = allExpenses.reduce((sum, exp) => sum + (exp.amount || 0), 0);

    const salaryFeeBills = getActiveBills().filter(bill => bill.type === 'gaji' || bill.type === 'fee');
    const totalWagesPaid = salaryFeeBills.filter(b => b.status === 'paid').reduce((sum, bill) => sum + (bill.amount || 0), 0);
    const totalWagesUnpaid = salaryFeeBills.filter(b => b.status === 'unpaid').reduce((sum, bill) => sum + Math.max(0, (bill.amount || 0) - (bill.paidAmount || 0)), 0);

    const totalAllExpensesForComparison = totalExpenseAllTime + totalWagesPaid + totalWagesUnpaid;

    const totalFundingAllTime = getActiveFundingSources()
        .reduce((sum, f) => sum + (f.totalAmount || 0), 0);

    const projectBudgets = getActiveProjects()
        .filter(p => p.budget && p.budget > 0)
        .map(project => {
            const projectExpenses = allExpenses
                .filter(exp => exp.projectId === project.id)
                .reduce((sum, exp) => sum + (exp.amount || 0), 0);
            const projectSalaryFeeBills = salaryFeeBills
                .filter(bill => bill.projectId === project.id)
                .reduce((sum, bill) => sum + (bill.amount || 0), 0);

            const usedBudget = projectExpenses + projectSalaryFeeBills;
            const percentage = project.budget > 0 ? (usedBudget / project.budget) * 100 : 0;
            return {
                id: project.id,
                name: project.projectName,
                budget: project.budget,
                used: usedBudget,
                percentage: percentage,
                isOverBudget: usedBudget > project.budget
            };
        })
        .sort((a, b) => b.budget - a.budget);

    const activeWorkers = getActiveWorkers().filter(w => w.status === 'active');
    const activeWorkerCount = activeWorkers.length;

    let totalWorkerDays = 0;
    getActiveAttendance().forEach(rec => {
        if (rec.attendanceStatus === 'full_day') {
            totalWorkerDays += 1;
        } else if (rec.attendanceStatus === 'half_day') {
            totalWorkerDays += 0.5;
        }
    });

    appState.dashboardData = {
        summary: {
            totalUtang,
            totalPiutang,
            totalIncome: totalIncomeAllTime,
            totalPureIncome: totalPureIncomeAllTime,
            totalExpense: totalExpenseAllTime, 
            totalAllExpenses: totalAllExpensesForComparison,
            totalFunding: totalFundingAllTime,
            totalBillsCount: totalBills.length,
            unpaidBillsCount: unpaidBills.length,
            totalLoansCount: totalLoans.length,
            unpaidLoansCount: unpaidLoans.length,
            activeWorkerCount,
            totalWorkerDays,
            totalWagesPaid,
            totalWagesUnpaid,
        },
        trends: {},
        budgets: projectBudgets,
    };
}