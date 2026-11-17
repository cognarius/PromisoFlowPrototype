import { createDemoState, DEMO_TODAY } from './demo-data';
import {
  accountsReceivable,
  actualCashReceipts,
  calculateInvoiceBalance,
  calculatePaymentAllocation,
  calculateProjectMargin,
  calculateProposalTotals,
  isInvoiceOverdue,
  overdueReceivables,
} from './finance';

describe('financial calculations', () => {
  const state = createDemoState();

  it('calculates planned revenue, direct costs, margin, and margin percentage', () => {
    const proposal = state.proposals.find((candidate) => candidate.id === 'proposal-vector')!;
    expect(calculateProposalTotals(proposal)).toEqual({
      listRevenue: 1450000,
      plannedRevenue: 1450000,
      plannedDirectCosts: 780000,
      plannedMargin: 670000,
      plannedMarginPercentage: 46.21,
    });
  });

  it('applies discounts without changing direct costs', () => {
    const proposal = state.proposals.find((candidate) => candidate.id === 'proposal-atlas')!;
    const totals = calculateProposalTotals(proposal);
    expect(totals.plannedRevenue).toBe(560000);
    expect(totals.plannedDirectCosts).toBe(500000);
    expect(totals.plannedMargin).toBe(60000);
  });

  it('calculates actual margin and its variance from linked project data', () => {
    const margin = calculateProjectMargin(state, 'project-terra');
    expect(margin).toMatchObject({
      plannedRevenue: 900000,
      plannedDirectCosts: 600000,
      plannedMargin: 300000,
      actualRevenue: 900000,
      actualCosts: 680000,
      actualMargin: 220000,
      actualMarginPercentage: 24.44,
      marginVariance: -80000,
      cashReceived: 0,
    });
  });

  it('keeps matched project cash separate from project revenue', () => {
    const margin = calculateProjectMargin(state, 'project-vector');
    expect(margin?.actualRevenue).toBe(1450000);
    expect(margin?.cashReceived).toBe(1210000);
  });

  it('calculates partial invoice payment and outstanding balance', () => {
    const invoice = state.invoices.find((candidate) => candidate.id === 'invoice-vector-final')!;
    expect(calculateInvoiceBalance(invoice, state.payments)).toEqual({
      invoiced: 725000,
      paid: 485000,
      outstanding: 240000,
    });
  });

  it('distinguishes unmatched, partially matched, and fully matched payments', () => {
    expect(calculatePaymentAllocation(state.payments[2]!).status).toBe('unmatched');
    expect(calculatePaymentAllocation(state.payments[1]!)).toEqual({
      allocated: 485000,
      unallocated: 115000,
      status: 'partially_matched',
    });
    expect(calculatePaymentAllocation(state.payments[0]!).status).toBe('matched');
  });

  it('calculates overdue receivables without including draft invoices', () => {
    const draft = state.invoices.find((candidate) => candidate.id === 'invoice-ladya-final')!;
    expect(isInvoiceOverdue(draft, state.payments, DEMO_TODAY)).toBe(false);
    expect(accountsReceivable(state.invoices, state.payments)).toBe(540000);
    expect(overdueReceivables(state.invoices, state.payments, DEMO_TODAY)).toBe(540000);
  });

  it('counts all actual cash receipts independently of matching status', () => {
    expect(actualCashReceipts(state.payments)).toBe(1925000);
  });
});
