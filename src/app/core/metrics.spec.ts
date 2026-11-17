import { createDemoState } from './demo-data';
import {
  actToInvoiceMeasurements,
  averageActToInvoiceDays,
  dashboardNumbers,
  metricCompleteness,
  overdueObligations,
} from './metrics';

describe('operational metrics', () => {
  it('does not match an invoice and an act from different projects through empty obligation IDs', () => {
    const state = createDemoState();
    state.invoices = state.invoices.filter((invoice) => invoice.id === 'invoice-terra-stage');
    state.documents = state.documents.filter((document) => document.id === 'document-nord-act');

    expect(state.invoices[0]?.obligationId).toBeUndefined();
    expect(state.documents[0]?.obligationId).toBeUndefined();
    expect(averageActToInvoiceDays(state)).toBe(0);
  });

  it('uses an act without an obligation ID only within the invoice project', () => {
    const state = createDemoState();
    state.invoices = state.invoices.filter((invoice) => invoice.id === 'invoice-terra-stage');
    const act = state.documents.find((document) => document.id === 'document-nord-act')!;
    state.documents = [
      {
        ...act,
        id: 'document-terra-act',
        projectId: 'project-terra',
        invoiceId: undefined,
        createdAt: '2026-04-19T12:00:00Z',
      },
    ];

    expect(averageActToInvoiceDays(state)).toBe(1);
  });

  it('exposes the invoices and durations used by the act-to-invoice average', () => {
    const state = createDemoState();
    const measurements = actToInvoiceMeasurements(state);
    const expectedAverage = Math.round(
      measurements.reduce((sum, measurement) => sum + measurement.days, 0) / measurements.length,
    );

    expect(measurements.length).toBeGreaterThan(0);
    expect(new Set(measurements.map((measurement) => measurement.invoice.id)).size).toBe(
      measurements.length,
    );
    expect(averageActToInvoiceDays(state)).toBe(expectedAverage);
    expect(metricCompleteness(state, 'actToInvoice')).toBe(
      Math.round((measurements.length / state.invoices.length) * 100),
    );
  });

  it('uses the same overdue obligations for the KPI and its source objects', () => {
    const state = createDemoState();
    const obligations = overdueObligations(state);

    expect(obligations.map((obligation) => obligation.id)).toEqual([
      'obligation-vector-prototype',
      'obligation-vector-final',
      'obligation-terra-delivery',
    ]);
    expect(dashboardNumbers(state).overdueObligationCount).toBe(obligations.length);
    expect(metricCompleteness(state, 'overdueObligations')).toBe(
      Math.round(
        (state.obligations.filter((obligation) => obligation.confirmationStatus !== 'pending')
          .length /
          state.obligations.length) *
          100,
      ),
    );
  });
});
