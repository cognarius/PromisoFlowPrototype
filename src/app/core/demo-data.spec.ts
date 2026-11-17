import { createDemoState } from './demo-data';
import { validateStateReferences } from './store';

function expectLocalizedContent(value: unknown, path = 'state'): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => expectLocalizedContent(item, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') return;

  const record = value as Record<string, unknown>;
  if ('ru' in record || 'en' in record) {
    expect(typeof record['ru'], `${path}.ru`).toBe('string');
    expect(typeof record['en'], `${path}.en`).toBe('string');
    expect((record['ru'] as string).trim().length, `${path}.ru`).toBeGreaterThan(0);
    expect((record['en'] as string).trim().length, `${path}.en`).toBeGreaterThan(0);
  }
  Object.entries(record).forEach(([key, nested]) =>
    expectLocalizedContent(nested, `${path}.${key}`),
  );
}

describe('deterministic demo data', () => {
  it('recreates exactly the same state without shared object references', () => {
    const first = createDemoState();
    const second = createDemoState();
    expect(first).toEqual(second);
    expect(first.clients[0]).not.toBe(second.clients[0]);
    first.clients[0]!.name.ru = 'Changed';
    expect(second.clients[0]!.name.ru).toBe('Вектор');
  });

  it('keeps every seeded relationship and id valid', () => {
    expect(validateStateReferences(createDemoState())).toEqual([]);
  });

  it('provides non-empty Russian and English demo content', () => {
    expectLocalizedContent(createDemoState());
  });

  it('contains all required demonstration scenarios', () => {
    const state = createDemoState();
    expect(state.obligations.some((item) => item.status === 'overdue')).toBe(true);
    expect(state.invoices.some((item) => item.status === 'partially_paid')).toBe(true);
    expect(state.payments.some((item) => item.matches.length === 0)).toBe(true);
    expect(state.costs.some((item) => item.category === 'rework')).toBe(true);
    expect(state.proposals.some((item) => item.discountPercent >= 30)).toBe(true);
    expect(
      state.proposals.some(
        (item) => !item.expectedReceiptDate && item.managerExpectedAmount === undefined,
      ),
    ).toBe(true);
    expect(state.nextActions.length).toBeGreaterThanOrEqual(7);
    expect(state.integrationEvents.map((item) => item.status)).toEqual(
      expect.arrayContaining(['queued', 'done', 'error', 'retry', 'conflict', 'delayed']),
    );
  });
});
