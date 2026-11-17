import { TestBed } from '@angular/core/testing';
import { ActionCenterService } from './actions';
import { calculateInvoiceBalance, calculateProjectMargin } from './finance';
import { I18nService } from './i18n';
import { AppStore, validateStateReferences } from './store';
import { WorkflowService } from './workflow';

describe('quote-to-cash workflow', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
  });

  it('runs from a new client and proposal to matched cash, margin variance, and a next action in two languages', () => {
    const store = TestBed.inject(AppStore);
    const workflow = TestBed.inject(WorkflowService);
    const i18n = TestBed.inject(I18nService);
    const actions = TestBed.inject(ActionCenterService);

    const client = workflow.createClient({
      name: 'Example Client',
      legalName: 'Example Client LLC',
      contactName: 'Jordan Lee',
      email: 'jordan@example-client.test',
      phone: '+1 555 0199',
      segment: 'B2B SaaS',
      ownerId: 'user-sales',
      language: 'en',
    });
    const proposal = workflow.newProposal(client.id, 'ru');
    proposal.title = { ru: 'Новый цифровой продукт', en: 'New digital product' };
    proposal.items = [
      {
        id: 'item-e2e-1',
        service: { ru: 'Проектирование и разработка', en: 'Design and development' },
        quantity: 2,
        unitPrice: 100000,
        unitCost: 40000,
      },
    ];
    proposal.expectedReceiptDate = '2026-05-20';
    proposal.managerExpectedAmount = 100000;
    workflow.saveProposal(proposal);
    workflow.approveProposal(proposal.id);

    const contract = workflow.createContract(proposal.id);
    expect(contract.proposalId).toBe(proposal.id);
    expect(contract.clientId).toBe(client.id);
    expect(store.proposals.get(proposal.id)?.status).toBe('converted');

    const project = workflow.signContract(contract.id);
    expect(project.contractId).toBe(contract.id);
    expect(store.state().obligations.filter((item) => item.projectId === project.id)).toHaveLength(
      4,
    );
    expect(
      store.state().financialEvents.filter((item) => item.projectId === project.id),
    ).toHaveLength(2);
    expect(
      store
        .state()
        .financialEvents.filter((item) => item.projectId === project.id)
        .every((item) => item.confirmationStatus === 'pending'),
    ).toBe(true);

    i18n.setLanguage('en-US');
    expect(i18n.text(project.name)).toBe('New digital product');
    expect(store.contracts.get(contract.id)?.status).toBe('signed');

    workflow.confirmContractTerms(contract.id, 'user-owner');
    expect(store.contracts.get(contract.id)?.extractionStatus).toBe('confirmed');
    expect(
      store
        .state()
        .obligations.filter((item) => item.projectId === project.id)
        .every((item) => item.confirmationStatus === 'confirmed'),
    ).toBe(true);

    const delivery = store
      .state()
      .obligations.find((item) => item.projectId === project.id && item.kind === 'delivery')!;
    workflow.completeObligation(delivery.id, 'user-project');
    const closing = workflow.createClosingDocuments(delivery.id, 'user-finance');
    expect(closing.document.kind).toBe('act');
    expect(closing.invoice.amount).toBe(100000);
    expect(closing.invoice.status).toBe('draft');
    workflow.issueInvoice(closing.invoice.id);

    const firstPayment = workflow.simulatePayment(client.id, 40000, closing.invoice.id);
    expect(firstPayment.matches).toEqual([]);
    workflow.matchPayment(firstPayment.id, closing.invoice.id, 40000);
    expect(store.invoices.get(closing.invoice.id)?.status).toBe('partially_paid');
    expect(
      calculateInvoiceBalance(store.invoices.get(closing.invoice.id)!, store.state().payments)
        .outstanding,
    ).toBe(60000);

    const secondPayment = workflow.simulatePayment(client.id, 60000, closing.invoice.id);
    workflow.matchPayment(secondPayment.id, closing.invoice.id, 60000);
    expect(store.invoices.get(closing.invoice.id)?.status).toBe('paid');
    expect(
      calculateInvoiceBalance(store.invoices.get(closing.invoice.id)!, store.state().payments)
        .outstanding,
    ).toBe(0);
    expect(
      store
        .state()
        .obligations.find(
          (item) =>
            item.projectId === project.id &&
            item.kind === 'payment' &&
            item.invoiceId === closing.invoice.id,
        )?.status,
    ).toBe('completed');

    workflow.addCost({
      projectId: project.id,
      description: 'Planned team labor',
      category: 'labor',
      amount: 80000,
      source: 'Timesheets',
      language: 'en',
      actorId: 'user-finance',
    });
    workflow.addCost({
      projectId: project.id,
      description: 'Additional revisions',
      category: 'rework',
      amount: 30000,
      source: 'Approved change request',
      language: 'en',
      actorId: 'user-finance',
    });
    const margin = calculateProjectMargin(store.state(), project.id)!;
    expect(margin).toMatchObject({
      plannedRevenue: 200000,
      plannedDirectCosts: 80000,
      plannedMargin: 120000,
      actualRevenue: 200000,
      actualCosts: 110000,
      actualMargin: 90000,
      marginVariance: -30000,
      cashReceived: 100000,
    });
    expect(margin.cashReceived).not.toBe(margin.actualRevenue);

    const explanation = workflow.createAiResult(
      'explain_margin',
      'project',
      project.id,
      'user-owner',
    );
    expect(explanation.status).toBe('pending');
    expect(explanation.result.en).toContain('Margin variance');
    const nextAction = actions
      .views()
      .find((action) => action.type === 'review_cost' && action.entityId === project.id);
    expect(nextAction).toBeDefined();
    expect(nextAction?.reason).toContain('30,000');
    expect(validateStateReferences(store.state())).toEqual([]);

    const restored = new AppStore();
    expect(restored.invoices.get(closing.invoice.id)?.status).toBe('paid');
    expect(i18n.language()).toBe('en-US');
  });

  it('requires confirmation for extracted terms and supports rollback', () => {
    const store = TestBed.inject(AppStore);
    const workflow = TestBed.inject(WorkflowService);
    const proposal = store.proposals.get('proposal-atlas')!;
    proposal.discountPercent = 5;
    proposal.title = { ru: 'Проверка условий', en: 'Terms review' };
    workflow.saveProposal(proposal);
    workflow.approveProposal(proposal.id);
    const contract = workflow.createContract(proposal.id);
    const project = workflow.signContract(contract.id);
    const result = store
      .state()
      .aiResults.find((item) => item.entityId === contract.id && item.kind === 'extract_terms')!;
    expect(store.contracts.get(contract.id)?.extractionStatus).toBe('pending');
    workflow.reviewAi(result.id, 'accepted', 'user-owner');
    expect(store.contracts.get(contract.id)?.extractionStatus).toBe('confirmed');
    workflow.rollbackAi(result.id, 'user-owner');
    expect(store.contracts.get(contract.id)?.extractionStatus).toBe('pending');
    expect(
      store
        .state()
        .obligations.filter((item) => item.projectId === project.id)
        .every((item) => item.confirmationStatus === 'pending'),
    ).toBe(true);
  });

  it('turns a client rejection into a delivery blocker and next action without changing portal language', () => {
    const store = TestBed.inject(AppStore);
    const workflow = TestBed.inject(WorkflowService);
    const i18n = TestBed.inject(I18nService);
    const actions = TestBed.inject(ActionCenterService);
    i18n.setLanguage('en-US');
    i18n.setPortalLanguage('ru-RU');
    workflow.portalDecision('project-vector', false);
    expect(store.projects.get('project-vector')?.status).toBe('blocked');
    const blocked = store
      .state()
      .obligations.find(
        (item) => item.projectId === 'project-vector' && item.status === 'blocked',
      )!;
    expect(blocked).toBeDefined();
    expect(
      actions
        .views()
        .some((action) => action.type === 'request_approval' && action.entityId === blocked.id),
    ).toBe(true);
    expect(i18n.language()).toBe('en-US');
    expect(i18n.portalLanguage()).toBe('ru-RU');
  });
});
