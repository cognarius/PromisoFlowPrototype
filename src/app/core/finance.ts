import { AppState, Invoice, Payment, PaymentStatus, Project, Proposal } from './models';

export interface ProposalTotals {
  listRevenue: number;
  plannedRevenue: number;
  plannedDirectCosts: number;
  plannedMargin: number;
  plannedMarginPercentage: number;
}

export interface InvoiceBalance {
  invoiced: number;
  paid: number;
  outstanding: number;
}

export interface PaymentAllocation {
  allocated: number;
  unallocated: number;
  status: PaymentStatus;
}

export interface ProjectMargin {
  projectId: string;
  plannedRevenue: number;
  plannedDirectCosts: number;
  plannedMargin: number;
  plannedMarginPercentage: number;
  actualRevenue: number;
  actualCosts: number;
  actualMargin: number;
  actualMarginPercentage: number;
  marginVariance: number;
  cashReceived: number;
}

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function marginPercentage(margin: number, revenue: number): number {
  return revenue === 0 ? 0 : roundMoney((margin / revenue) * 100);
}

export function calculateProposalTotals(proposal: Proposal): ProposalTotals {
  const listRevenue = proposal.items.reduce(
    (total, item) => total + item.quantity * item.unitPrice,
    0,
  );
  const plannedDirectCosts = proposal.items.reduce(
    (total, item) => total + item.quantity * item.unitCost,
    0,
  );
  const plannedRevenue = roundMoney(listRevenue * (1 - proposal.discountPercent / 100));
  const plannedMargin = roundMoney(plannedRevenue - plannedDirectCosts);

  return {
    listRevenue: roundMoney(listRevenue),
    plannedRevenue,
    plannedDirectCosts: roundMoney(plannedDirectCosts),
    plannedMargin,
    plannedMarginPercentage: marginPercentage(plannedMargin, plannedRevenue),
  };
}

export function calculateInvoiceBalance(invoice: Invoice, payments: Payment[]): InvoiceBalance {
  const paid = payments.reduce(
    (total, payment) =>
      total +
      payment.matches
        .filter((match) => match.invoiceId === invoice.id)
        .reduce((matched, match) => matched + match.amount, 0),
    0,
  );

  return {
    invoiced: invoice.amount,
    paid: roundMoney(paid),
    outstanding: roundMoney(Math.max(0, invoice.amount - paid)),
  };
}

export function calculatePaymentAllocation(payment: Payment): PaymentAllocation {
  const allocated = roundMoney(payment.matches.reduce((total, match) => total + match.amount, 0));
  const unallocated = roundMoney(payment.amount - allocated);

  return {
    allocated,
    unallocated,
    status: allocated === 0 ? 'unmatched' : unallocated > 0 ? 'partially_matched' : 'matched',
  };
}

export function isInvoiceOverdue(invoice: Invoice, payments: Payment[], asOf: string): boolean {
  return (
    invoice.status !== 'draft' &&
    invoice.dueDate < asOf &&
    calculateInvoiceBalance(invoice, payments).outstanding > 0
  );
}

export function accountsReceivable(invoices: Invoice[], payments: Payment[]): number {
  return roundMoney(
    invoices
      .filter((invoice) => invoice.status !== 'draft')
      .reduce(
        (total, invoice) => total + calculateInvoiceBalance(invoice, payments).outstanding,
        0,
      ),
  );
}

export function overdueReceivables(invoices: Invoice[], payments: Payment[], asOf: string): number {
  return roundMoney(
    invoices
      .filter((invoice) => isInvoiceOverdue(invoice, payments, asOf))
      .reduce(
        (total, invoice) => total + calculateInvoiceBalance(invoice, payments).outstanding,
        0,
      ),
  );
}

export function actualCashReceipts(payments: Payment[]): number {
  return roundMoney(payments.reduce((total, payment) => total + payment.amount, 0));
}

export function calculateProjectMargin(
  state: AppState,
  projectId: string,
): ProjectMargin | undefined {
  const project = state.projects.find((candidate) => candidate.id === projectId);
  if (!project) return undefined;

  const contract = state.contracts.find((candidate) => candidate.id === project.contractId);
  const proposal = state.proposals.find((candidate) => candidate.id === contract?.proposalId);
  if (!proposal) return undefined;

  const planned = calculateProposalTotals(proposal);
  const actualRevenue = planned.plannedRevenue;
  const actualCosts = roundMoney(
    state.costs
      .filter((cost) => cost.projectId === projectId)
      .reduce((total, cost) => total + cost.amount, 0),
  );
  const actualMargin = roundMoney(actualRevenue - actualCosts);
  const projectInvoiceIds = new Set(
    state.invoices
      .filter((invoice) => invoice.projectId === projectId)
      .map((invoice) => invoice.id),
  );
  const cashReceived = roundMoney(
    state.payments.reduce(
      (total, payment) =>
        total +
        payment.matches
          .filter((match) => projectInvoiceIds.has(match.invoiceId))
          .reduce((matched, match) => matched + match.amount, 0),
      0,
    ),
  );

  return {
    projectId,
    ...planned,
    actualRevenue,
    actualCosts,
    actualMargin,
    actualMarginPercentage: marginPercentage(actualMargin, actualRevenue),
    marginVariance: roundMoney(actualMargin - planned.plannedMargin),
    cashReceived,
  };
}

export function projectForEntity(state: AppState, projectId: string): Project | undefined {
  return state.projects.find((project) => project.id === projectId);
}
