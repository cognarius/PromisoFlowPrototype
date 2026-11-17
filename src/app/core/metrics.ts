import { AppState, Invoice, Obligation, Project } from './models';
import {
  accountsReceivable,
  actualCashReceipts,
  calculateInvoiceBalance,
  calculateProjectMargin,
  isInvoiceOverdue,
  overdueReceivables,
  roundMoney,
} from './finance';
import { DEMO_TODAY } from './demo-data';

export interface CashCalendarBucket {
  start: string;
  end: string;
  scheduled: number;
  received: number;
}

export function addDays(date: string, days: number): string {
  const value = new Date(`${date.slice(0, 10)}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to.slice(0, 10)}T00:00:00Z`) - Date.parse(`${from.slice(0, 10)}T00:00:00Z`)) /
      86400000,
  );
}

export function cashReceiptForecast(state: AppState, days = 30): number {
  const end = addDays(DEMO_TODAY, days);
  return roundMoney(
    state.financialEvents
      .filter(
        (event) => event.dueDate >= DEMO_TODAY && event.dueDate <= end && event.status !== 'paid',
      )
      .reduce((total, event) => {
        const invoice = state.invoices.find((candidate) => candidate.id === event.invoiceId);
        const outstanding = invoice
          ? calculateInvoiceBalance(invoice, state.payments).outstanding
          : event.amount;
        return total + outstanding;
      }, 0),
  );
}

export function managerReceiptExpectation(state: AppState, days = 30): number {
  const end = addDays(DEMO_TODAY, days);
  return roundMoney(
    state.proposals
      .filter(
        (proposal) =>
          proposal.status !== 'converted' &&
          proposal.expectedReceiptDate !== undefined &&
          proposal.expectedReceiptDate >= DEMO_TODAY &&
          proposal.expectedReceiptDate <= end,
      )
      .reduce((total, proposal) => total + (proposal.managerExpectedAmount ?? 0), 0),
  );
}

export function portfolioMargins(state: AppState): {
  plannedRevenue: number;
  plannedMargin: number;
  plannedPercentage: number;
  actualRevenue: number;
  actualCosts: number;
  actualMargin: number;
  actualPercentage: number;
  variance: number;
} {
  const margins = state.projects
    .map((project) => calculateProjectMargin(state, project.id))
    .filter((margin) => margin !== undefined);
  const plannedRevenue = margins.reduce((total, margin) => total + margin.plannedRevenue, 0);
  const plannedMargin = margins.reduce((total, margin) => total + margin.plannedMargin, 0);
  const actualRevenue = margins.reduce((total, margin) => total + margin.actualRevenue, 0);
  const actualCosts = margins.reduce((total, margin) => total + margin.actualCosts, 0);
  const actualMargin = margins.reduce((total, margin) => total + margin.actualMargin, 0);
  return {
    plannedRevenue: roundMoney(plannedRevenue),
    plannedMargin: roundMoney(plannedMargin),
    plannedPercentage: plannedRevenue ? roundMoney((plannedMargin / plannedRevenue) * 100) : 0,
    actualRevenue: roundMoney(actualRevenue),
    actualCosts: roundMoney(actualCosts),
    actualMargin: roundMoney(actualMargin),
    actualPercentage: actualRevenue ? roundMoney((actualMargin / actualRevenue) * 100) : 0,
    variance: roundMoney(actualMargin - plannedMargin),
  };
}

export interface ActToInvoiceMeasurement {
  invoice: Invoice;
  days: number;
}

export function actToInvoiceMeasurements(state: AppState): ActToInvoiceMeasurement[] {
  return state.invoices
    .map((invoice) => {
      const obligation = state.obligations.find(
        (item) => item.id === invoice.obligationId && item.completedAt,
      );
      if (obligation?.completedAt)
        return {
          invoice,
          days: Math.max(0, daysBetween(obligation.completedAt, invoice.issueDate)),
        };
      const certificate = state.documents.find(
        (document) =>
          document.kind === 'act' &&
          (document.invoiceId === invoice.id ||
            (Boolean(invoice.obligationId) && document.obligationId === invoice.obligationId) ||
            document.projectId === invoice.projectId),
      );
      return certificate
        ? {
            invoice,
            days: Math.max(0, daysBetween(certificate.createdAt, invoice.issueDate)),
          }
        : undefined;
    })
    .filter((value): value is ActToInvoiceMeasurement => value !== undefined);
}

export function averageActToInvoiceDays(state: AppState): number {
  const measurements = actToInvoiceMeasurements(state);
  return measurements.length
    ? Math.round(
        measurements.reduce((sum, measurement) => sum + measurement.days, 0) / measurements.length,
      )
    : 0;
}

export function overdueObligations(state: AppState): Obligation[] {
  return state.obligations.filter(
    (obligation) =>
      obligation.status === 'overdue' ||
      (obligation.status !== 'completed' && obligation.dueDate < DEMO_TODAY),
  );
}

export function invoiceAging(state: AppState): {
  current: number;
  days1to7: number;
  days8to30: number;
  days31plus: number;
} {
  const result = { current: 0, days1to7: 0, days8to30: 0, days31plus: 0 };
  for (const invoice of state.invoices) {
    if (invoice.status === 'draft') continue;
    const outstanding = calculateInvoiceBalance(invoice, state.payments).outstanding;
    if (!outstanding) continue;
    const age = daysBetween(invoice.dueDate, DEMO_TODAY);
    if (age <= 0) result.current += outstanding;
    else if (age <= 7) result.days1to7 += outstanding;
    else if (age <= 30) result.days8to30 += outstanding;
    else result.days31plus += outstanding;
  }
  return {
    current: roundMoney(result.current),
    days1to7: roundMoney(result.days1to7),
    days8to30: roundMoney(result.days8to30),
    days31plus: roundMoney(result.days31plus),
  };
}

export function cashCalendar(state: AppState, weeks = 4): CashCalendarBucket[] {
  return Array.from({ length: weeks }, (_, index) => {
    const start = addDays(DEMO_TODAY, index * 7);
    const end = addDays(start, 6);
    const scheduled = state.financialEvents
      .filter((event) => event.dueDate >= start && event.dueDate <= end && event.status !== 'paid')
      .reduce((total, event) => {
        const invoice = state.invoices.find((candidate) => candidate.id === event.invoiceId);
        return (
          total +
          (invoice ? calculateInvoiceBalance(invoice, state.payments).outstanding : event.amount)
        );
      }, 0);
    const received = state.payments
      .filter((payment) => payment.date >= start && payment.date <= end)
      .reduce((total, payment) => total + payment.amount, 0);
    return { start, end, scheduled: roundMoney(scheduled), received: roundMoney(received) };
  });
}

export function dataCompleteness(state: AppState): number {
  const checks: boolean[] = [];
  for (const proposal of state.proposals) {
    checks.push(
      proposal.items.length > 0,
      Boolean(proposal.expectedReceiptDate),
      proposal.managerExpectedAmount !== undefined,
    );
  }
  for (const contract of state.contracts) checks.push(contract.extractionStatus !== 'pending');
  for (const cost of state.costs) checks.push(Boolean(cost.source.ru && cost.source.en));
  for (const payment of state.payments) checks.push(payment.matches.length > 0);
  for (const event of state.financialEvents)
    checks.push(event.confirmationStatus !== 'pending', Boolean(event.dueDate));
  return checks.length ? Math.round((checks.filter(Boolean).length / checks.length) * 100) : 100;
}

export function metricCompleteness(state: AppState, metric: string): number {
  if (metric === 'margin') {
    const values = state.projects.map((project) => {
      const contract = state.contracts.find((candidate) => candidate.id === project.contractId);
      return (
        contract?.extractionStatus !== 'pending' &&
        state.costs.some((cost) => cost.projectId === project.id)
      );
    });
    return values.length ? Math.round((values.filter(Boolean).length / values.length) * 100) : 100;
  }
  if (metric === 'cash') {
    return state.payments.length
      ? Math.round(
          (state.payments.filter((payment) => payment.matches.length > 0).length /
            state.payments.length) *
            100,
        )
      : 100;
  }
  if (metric === 'actToInvoice') {
    return state.invoices.length
      ? Math.round((actToInvoiceMeasurements(state).length / state.invoices.length) * 100)
      : 100;
  }
  if (metric === 'overdueObligations') {
    const confirmed = state.obligations.filter(
      (obligation) => obligation.confirmationStatus !== 'pending' && Boolean(obligation.dueDate),
    );
    return state.obligations.length
      ? Math.round((confirmed.length / state.obligations.length) * 100)
      : 100;
  }
  const sources = state.financialEvents;
  return sources.length
    ? Math.round(
        (sources.filter((event) => event.confirmationStatus !== 'pending').length /
          sources.length) *
          100,
      )
    : 100;
}

export function dashboardNumbers(state: AppState): {
  cash: number;
  receivable: number;
  overdue: number;
  forecast: number;
  manager: number;
  overdueInvoiceCount: number;
  overdueObligationCount: number;
} {
  return {
    cash: actualCashReceipts(state.payments),
    receivable: accountsReceivable(state.invoices, state.payments),
    overdue: overdueReceivables(state.invoices, state.payments, DEMO_TODAY),
    forecast: cashReceiptForecast(state),
    manager: managerReceiptExpectation(state),
    overdueInvoiceCount: state.invoices.filter((invoice) =>
      isInvoiceOverdue(invoice, state.payments, DEMO_TODAY),
    ).length,
    overdueObligationCount: overdueObligations(state).length,
  };
}

export function projectInvoices(state: AppState, project: Project): Invoice[] {
  return state.invoices.filter((invoice) => invoice.projectId === project.id);
}
