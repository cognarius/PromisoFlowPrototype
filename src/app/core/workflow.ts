import { Injectable } from '@angular/core';
import { DEMO_TODAY } from './demo-data';
import {
  calculateInvoiceBalance,
  calculatePaymentAllocation,
  calculateProjectMargin,
  calculateProposalTotals,
  roundMoney,
} from './finance';
import { addDays } from './metrics';
import {
  Activity,
  AiResult,
  AppState,
  Client,
  Contract,
  Cost,
  Document,
  EntityType,
  FinancialEvent,
  IntegrationEvent,
  Invoice,
  LanguageShort,
  LocalizedText,
  Obligation,
  Payment,
  Project,
  Proposal,
  ProposalItem,
  RoleCode,
} from './models';
import { AppStore } from './store';

export const DEMO_NOW = '2026-05-14T12:00:00Z';

const text = (ru: string, en: string): LocalizedText => ({ ru, en });
const money = (value: number, language: LanguageShort): string =>
  new Intl.NumberFormat(language === 'ru' ? 'ru-RU' : 'en-US', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 0,
  }).format(value);

function nextId(prefix: string, items: { id: string }[]): string {
  return nextIds(prefix, items, 1)[0]!;
}

function nextIds(prefix: string, items: { id: string }[], count: number): string[] {
  const ids: string[] = [];
  let index = items.length + 1;
  while (ids.length < count) {
    const id = `${prefix}-${index}`;
    if (!items.some((item) => item.id === id) && !ids.includes(id)) ids.push(id);
    index += 1;
  }
  return ids;
}

function replace<T extends { id: string }>(items: T[], value: T): T[] {
  return items.map((item) => (item.id === value.id ? value : item));
}

function localizedInput(value: string, language: LanguageShort): LocalizedText {
  return { ru: value, en: value, [language]: value };
}

export interface ClientInput {
  name: string;
  legalName: string;
  contactName: string;
  email: string;
  phone: string;
  segment: string;
  ownerId: string;
  language: LanguageShort;
}

export interface CostInput {
  projectId: string;
  description: string;
  category: Cost['category'];
  amount: number;
  source: string;
  language: LanguageShort;
  actorId: string;
}

@Injectable({ providedIn: 'root' })
export class WorkflowService {
  constructor(private readonly store: AppStore) {}

  createClient(input: ClientInput): Client {
    const state = this.store.snapshot();
    const client: Client = {
      id: nextId('client', state.clients),
      name: localizedInput(input.name, input.language),
      legalName: localizedInput(input.legalName || input.name, input.language),
      contactName: input.contactName,
      email: input.email,
      phone: input.phone,
      segment: localizedInput(input.segment, input.language),
      ownerId: input.ownerId,
      createdAt: DEMO_NOW,
      repeatPotential: 0.5,
    };
    this.store.transact((next) => {
      next.clients.push(client);
      this.addActivity(
        next,
        'client',
        client.id,
        'user-sales',
        text('Создан клиент', 'Client created'),
        true,
      );
    });
    return client;
  }

  saveProposal(proposal: Proposal, actorId = 'user-sales'): Proposal {
    const exists = this.store.proposals.get(proposal.id);
    this.store.transact((state) => {
      if (exists) state.proposals = replace(state.proposals, proposal);
      else state.proposals.push(proposal);
      this.addActivity(
        state,
        'proposal',
        proposal.id,
        actorId,
        exists
          ? text('Предложение обновлено', 'Proposal updated')
          : text('Создано предложение', 'Proposal created'),
        true,
      );
    });
    return proposal;
  }

  newProposal(clientId: string, language: LanguageShort): Proposal {
    const state = this.store.snapshot();
    return {
      id: nextId('proposal', state.proposals),
      clientId,
      title: localizedInput('', language),
      status: 'draft',
      items: [],
      discountPercent: 0,
      ownerId: 'user-sales',
      createdAt: DEMO_NOW,
    };
  }

  newProposalItem(proposal: Proposal, language: LanguageShort): ProposalItem {
    return {
      id: nextId('item', proposal.items),
      service: localizedInput('', language),
      quantity: 1,
      unitPrice: 0,
      unitCost: 0,
    };
  }

  approveProposal(proposalId: string, actorId = 'user-sales'): void {
    this.store.transact((state) => {
      const proposal = this.require(state.proposals, proposalId, 'Proposal');
      if (proposal.status !== 'draft') throw new Error('proposal_not_draft');
      if (!proposal.items.length || calculateProposalTotals(proposal).plannedRevenue <= 0) {
        throw new Error('proposal_invalid');
      }
      state.proposals = replace(state.proposals, {
        ...proposal,
        status: 'approved',
        approvedAt: DEMO_NOW,
      });
      this.addActivity(
        state,
        'proposal',
        proposalId,
        actorId,
        text('Предложение согласовано', 'Proposal approved'),
        false,
      );
    });
  }

  createContract(proposalId: string, actorId = 'user-sales'): Contract {
    const current = this.store.snapshot();
    const existing = current.contracts.find((contract) => contract.proposalId === proposalId);
    if (existing) return existing;
    let created!: Contract;
    this.store.transact((state) => {
      const proposal = this.require(state.proposals, proposalId, 'Proposal');
      if (proposal.status !== 'approved') throw new Error('proposal_not_approved');
      const id = nextId('contract', state.contracts);
      created = {
        id,
        proposalId,
        clientId: proposal.clientId,
        number: `P-${String(state.contracts.length + 1).padStart(3, '0')}`,
        status: 'awaiting_signature',
        version: 1,
        createdAt: DEMO_NOW,
        extractionStatus: 'pending',
        extractedByAi: true,
      };
      state.contracts.push(created);
      state.proposals = replace(state.proposals, { ...proposal, status: 'converted' });
      state.documents.push({
        id: nextId('document', state.documents),
        clientId: proposal.clientId,
        proposalId,
        contractId: id,
        kind: 'contract',
        title: text(`Договор ${created.number}`, `Contract ${created.number}`),
        version: 1,
        status: 'draft',
        content: text(
          `${proposal.title.ru}. Аванс 50%, финальная оплата 50%. Приёмка результата в течение пяти рабочих дней.`,
          `${proposal.title.en}. 50% advance and 50% final payment. Deliverables are accepted within five business days.`,
        ),
        createdAt: DEMO_NOW,
        internal: false,
      });
      this.addActivity(
        state,
        'contract',
        id,
        actorId,
        text(
          'Договор сформирован из предложения без повторного ввода',
          'Contract created from the proposal without re-entry',
        ),
        false,
      );
    });
    return created;
  }

  signContract(contractId: string, actorId = 'user-owner'): Project {
    let project!: Project;
    this.store.transact((state) => {
      const contract = this.require(state.contracts, contractId, 'Contract');
      if (contract.status === 'signed') {
        project = this.require(
          state.projects.filter((item) => item.contractId === contractId),
          state.projects.find((item) => item.contractId === contractId)?.id ?? '',
          'Project',
        );
        return;
      }
      if (contract.status !== 'awaiting_signature') throw new Error('contract_not_ready');
      const proposal = this.require(state.proposals, contract.proposalId, 'Proposal');
      const totals = calculateProposalTotals(proposal);
      const projectId = nextId('project', state.projects);
      project = {
        id: projectId,
        contractId,
        clientId: contract.clientId,
        name: proposal.title,
        status: 'in_progress',
        managerId: 'user-project',
        startDate: DEMO_TODAY,
        dueDate: addDays(DEMO_TODAY, 45),
      };
      state.projects.push(project);
      state.contracts = replace(state.contracts, {
        ...contract,
        status: 'signed',
        signedAt: DEMO_NOW,
        extractionStatus: 'pending',
      });
      const contractDocument = state.documents.find(
        (document) => document.contractId === contractId,
      );
      if (contractDocument) {
        state.documents = replace(state.documents, {
          ...contractDocument,
          projectId,
          status: 'signed',
        });
      }
      const advance = roundMoney(totals.plannedRevenue / 2);
      const final = roundMoney(totals.plannedRevenue - advance);
      const source = text(
        `Договор ${contract.number}, разделы 3–5`,
        `Contract ${contract.number}, clauses 3–5`,
      );
      const obligationIds = nextIds('obligation', state.obligations, 4);
      const obligations: Obligation[] = [
        {
          id: obligationIds[0]!,
          projectId,
          kind: 'payment',
          title: text('Получить аванс 50%', 'Receive the 50% advance'),
          dueDate: addDays(DEMO_TODAY, 5),
          status: 'pending',
          progress: 0,
          ownerId: 'user-finance',
          amount: advance,
          source,
          confirmationStatus: 'pending',
        },
        {
          id: obligationIds[1]!,
          projectId,
          kind: 'delivery',
          title: text(
            'Выполнить и передать результат проекта',
            'Complete and deliver the project result',
          ),
          dueDate: addDays(DEMO_TODAY, 20),
          status: 'in_progress',
          progress: 0,
          ownerId: 'user-project',
          source,
          confirmationStatus: 'pending',
        },
        {
          id: obligationIds[2]!,
          projectId,
          kind: 'acceptance',
          title: text(
            'Получить согласование результата за пять рабочих дней',
            'Obtain result approval within five business days',
          ),
          dueDate: addDays(DEMO_TODAY, 25),
          status: 'waiting_confirmation',
          progress: 0,
          ownerId: 'user-project',
          source,
          confirmationStatus: 'pending',
        },
        {
          id: obligationIds[3]!,
          projectId,
          kind: 'payment',
          title: text('Получить финальную оплату 50%', 'Receive the final 50% payment'),
          dueDate: addDays(DEMO_TODAY, 30),
          status: 'pending',
          progress: 0,
          ownerId: 'user-finance',
          amount: final,
          source,
          confirmationStatus: 'pending',
        },
      ];
      state.obligations.push(...obligations);
      const paymentObligations = obligations.filter((obligation) => obligation.kind === 'payment');
      const financialIds = nextIds('financial', state.financialEvents, paymentObligations.length);
      const events: FinancialEvent[] = paymentObligations.map((obligation, index) => ({
        id: financialIds[index]!,
        projectId,
        obligationId: obligation.id,
        dueDate: obligation.dueDate,
        amount: obligation.amount ?? 0,
        status: 'scheduled',
        confirmationStatus: 'pending',
        source,
      }));
      state.financialEvents.push(...events);
      const ai: AiResult = {
        id: nextId('ai', state.aiResults),
        kind: 'extract_terms',
        entityType: 'contract',
        entityId: contractId,
        source,
        confidence: 0.94,
        status: 'pending',
        result: text(
          `Извлечены аванс ${money(advance, 'ru')}, финальная оплата ${money(final, 'ru')}, срок передачи ${obligations[1]!.dueDate} и приёмка за пять рабочих дней. Подтвердите суммы и сроки.`,
          `Extracted an advance of ${money(advance, 'en')}, a final payment of ${money(final, 'en')}, delivery on ${obligations[1]!.dueDate}, and five-business-day acceptance. Confirm the amounts and deadlines.`,
        ),
        model: 'demo-rules-v1',
        costRub: 0,
        createdAt: DEMO_NOW,
        history: [
          {
            at: DEMO_NOW,
            actorId,
            action: 'generated',
            note: text(
              'Детерминированная симуляция; условия не подтверждены',
              'Deterministic simulation; terms are unconfirmed',
            ),
          },
        ],
      };
      state.aiResults.push(ai);
      this.addActivity(
        state,
        'contract',
        contractId,
        actorId,
        text(
          'Договор отмечен подписанным; созданы проект, обязательства и финансовый календарь',
          'Contract marked as signed; project, obligations, and financial calendar created',
        ),
        true,
      );
    });
    return project;
  }

  confirmContractTerms(contractId: string, actorId: string): void {
    this.store.transact((state) => {
      const contract = this.require(state.contracts, contractId, 'Contract');
      const project = state.projects.find((item) => item.contractId === contractId);
      state.contracts = replace(state.contracts, {
        ...contract,
        extractionStatus: 'confirmed',
        confirmedBy: actorId,
      });
      if (project) {
        state.obligations = state.obligations.map((obligation) =>
          obligation.projectId === project.id
            ? { ...obligation, confirmationStatus: 'confirmed', confirmedBy: actorId }
            : obligation,
        );
        state.financialEvents = state.financialEvents.map((event) =>
          event.projectId === project.id ? { ...event, confirmationStatus: 'confirmed' } : event,
        );
      }
      state.aiResults = state.aiResults.map((result) =>
        result.entityId === contractId && result.kind === 'extract_terms'
          ? {
              ...result,
              status: 'accepted',
              confirmedBy: actorId,
              history: [
                ...result.history,
                {
                  at: DEMO_NOW,
                  actorId,
                  action: 'accepted',
                  note: text(
                    'Суммы и сроки проверены человеком',
                    'Amounts and deadlines reviewed by a person',
                  ),
                },
              ],
            }
          : result,
      );
      this.addActivity(
        state,
        'contract',
        contractId,
        actorId,
        text(
          'Извлечённые условия подтверждены ответственным',
          'Extracted terms confirmed by the owner',
        ),
        true,
      );
    });
  }

  updateObligation(
    obligationId: string,
    dueDate: string,
    amount: number | undefined,
    actorId: string,
  ): void {
    this.store.transact((state) => {
      const obligation = this.require(state.obligations, obligationId, 'Obligation');
      state.obligations = replace(state.obligations, {
        ...obligation,
        dueDate,
        amount,
        confirmationStatus: 'edited',
        confirmedBy: actorId,
      });
      state.financialEvents = state.financialEvents.map((event) =>
        event.obligationId === obligationId
          ? { ...event, dueDate, amount: amount ?? event.amount, confirmationStatus: 'edited' }
          : event,
      );
      this.addActivity(
        state,
        'obligation',
        obligationId,
        actorId,
        text(
          'Условие исправлено и подтверждено человеком',
          'Term edited and confirmed by a person',
        ),
        true,
      );
    });
  }

  completeObligation(obligationId: string, actorId: string): void {
    this.store.transact((state) => {
      const obligation = this.require(state.obligations, obligationId, 'Obligation');
      if (obligation.kind === 'payment') throw new Error('payment_obligation_auto');
      state.obligations = replace(state.obligations, {
        ...obligation,
        status: 'completed',
        progress: 100,
        completedAt: DEMO_NOW,
      });
      this.addActivity(
        state,
        'obligation',
        obligationId,
        actorId,
        text('Обязательство отмечено выполненным', 'Obligation marked as completed'),
        false,
      );
    });
  }

  createClosingDocuments(
    obligationId: string,
    actorId: string,
  ): { document: Document; invoice: Invoice } {
    let result!: { document: Document; invoice: Invoice };
    this.store.transact((state) => {
      const obligation = this.require(state.obligations, obligationId, 'Obligation');
      if (obligation.status !== 'completed') throw new Error('obligation_not_completed');
      const project = this.require(state.projects, obligation.projectId, 'Project');
      const contract = this.require(state.contracts, project.contractId, 'Contract');
      const proposal = this.require(state.proposals, contract.proposalId, 'Proposal');
      const existingInvoice = state.invoices.find(
        (invoice) => invoice.obligationId === obligationId,
      );
      const existingDocument = state.documents.find(
        (document) => document.obligationId === obligationId && document.kind === 'act',
      );
      if (existingInvoice && existingDocument) {
        result = { document: existingDocument, invoice: existingInvoice };
        return;
      }
      const candidates = state.financialEvents
        .filter((event) => event.projectId === project.id && !event.invoiceId)
        .sort((a, b) => b.dueDate.localeCompare(a.dueDate));
      const event = candidates[0];
      const invoiced = state.invoices
        .filter((invoice) => invoice.projectId === project.id)
        .reduce((sum, invoice) => sum + invoice.amount, 0);
      const amount =
        event?.amount ??
        roundMoney(Math.max(0, calculateProposalTotals(proposal).plannedRevenue - invoiced));
      if (amount <= 0) throw new Error('nothing_to_invoice');
      const document: Document = {
        id: nextId('document', state.documents),
        clientId: project.clientId,
        projectId: project.id,
        contractId: contract.id,
        obligationId,
        kind: 'act',
        title: text(`Акт — ${project.name.ru}`, `Acceptance certificate — ${project.name.en}`),
        version: 1,
        status: 'ready',
        content: text(
          `Результат «${obligation.title.ru}» передан ${DEMO_TODAY}. Сумма этапа ${money(amount, 'ru')}.`,
          `Deliverable “${obligation.title.en}” was delivered on ${DEMO_TODAY}. Milestone amount: ${money(amount, 'en')}.`,
        ),
        createdAt: DEMO_NOW,
        internal: false,
      };
      const invoice: Invoice = {
        id: nextId('invoice', state.invoices),
        projectId: project.id,
        clientId: project.clientId,
        obligationId,
        number: `D-${String(state.invoices.length + 1).padStart(3, '0')}`,
        amount,
        issueDate: DEMO_TODAY,
        dueDate: event?.dueDate ?? addDays(DEMO_TODAY, 10),
        status: 'draft',
      };
      state.documents.push(document);
      state.invoices.push(invoice);
      state.documents.push({
        id: nextId('document', state.documents),
        clientId: project.clientId,
        projectId: project.id,
        contractId: contract.id,
        obligationId,
        invoiceId: invoice.id,
        kind: 'invoice',
        title: text(`Счёт ${invoice.number}`, `Invoice ${invoice.number}`),
        version: 1,
        status: 'draft',
        content: text(
          `Счёт на ${money(amount, 'ru')}, срок оплаты ${invoice.dueDate}.`,
          `Invoice for ${money(amount, 'en')}, due ${invoice.dueDate}.`,
        ),
        createdAt: DEMO_NOW,
        internal: false,
      });
      state.obligations = replace(state.obligations, {
        ...obligation,
        invoiceId: invoice.id,
        closingDocumentId: document.id,
      });
      if (event) {
        state.financialEvents = replace(state.financialEvents, { ...event, invoiceId: invoice.id });
        if (event.obligationId) {
          const paymentObligation = state.obligations.find(
            (item) => item.id === event.obligationId,
          );
          if (paymentObligation)
            state.obligations = replace(state.obligations, {
              ...paymentObligation,
              invoiceId: invoice.id,
            });
        }
      }
      this.addActivity(
        state,
        'document',
        document.id,
        actorId,
        text(
          'Сформированы закрывающий документ и черновик счёта',
          'Closing document and draft invoice created',
        ),
        false,
      );
      result = { document, invoice };
    });
    return result;
  }

  issueInvoice(invoiceId: string, actorId = 'user-finance'): void {
    this.store.transact((state) => {
      const invoice = this.require(state.invoices, invoiceId, 'Invoice');
      if (invoice.status !== 'draft') throw new Error('invoice_not_draft');
      state.invoices = replace(state.invoices, { ...invoice, status: 'issued' });
      state.documents = state.documents.map((document) =>
        document.invoiceId === invoiceId ? { ...document, status: 'ready' } : document,
      );
      state.financialEvents = state.financialEvents.map((event) =>
        event.invoiceId === invoiceId ? { ...event, status: 'invoiced' } : event,
      );
      this.addActivity(
        state,
        'invoice',
        invoiceId,
        actorId,
        text('Счёт выставлен в демонстрационном режиме', 'Invoice issued in demo mode'),
        false,
      );
    });
  }

  simulatePayment(clientId: string, amount: number, invoiceId?: string): Payment {
    if (amount <= 0) throw new Error('invalid_amount');
    const state = this.store.snapshot();
    const invoice = state.invoices.find((item) => item.id === invoiceId);
    const client = this.require(state.clients, clientId, 'Client');
    const payment: Payment = {
      id: nextId('payment', state.payments),
      clientId,
      payer: client.legalName,
      amount: roundMoney(amount),
      date: DEMO_TODAY,
      purpose: invoice
        ? text(
            `Оплата по счёту ${invoice.number}; демо-импорт`,
            `Payment for invoice ${invoice.number}; demo import`,
          )
        : text(
            'Оплата без номера счёта; демо-импорт',
            'Payment without an invoice number; demo import',
          ),
      matches: [],
      source: 'bank_mock',
    };
    this.store.transact((next) => {
      next.payments.push(payment);
      next.integrationEvents.push({
        id: nextId('integration', next.integrationEvents),
        system: 'bank',
        entityType: 'payment',
        entityId: payment.id,
        status: 'done',
        message: text(
          'Платёж импортирован mock-банком; реальный банк не подключён',
          'Payment imported by the mock bank; no real bank is connected',
        ),
        transformLog: [
          text(
            'Сумма и назначение сохранены без изменений',
            'Amount and payment purpose preserved unchanged',
          ),
        ],
        updatedAt: DEMO_NOW,
        attempts: 1,
      });
      this.addActivity(
        next,
        'payment',
        payment.id,
        'user-finance',
        text(
          'Получена несопоставленная демонстрационная оплата',
          'Unmatched demo payment received',
        ),
        true,
      );
    });
    return payment;
  }

  matchPayment(
    paymentId: string,
    invoiceId: string,
    amount: number,
    actorId = 'user-finance',
  ): void {
    this.store.transact((state) => {
      const payment = this.require(state.payments, paymentId, 'Payment');
      const invoice = this.require(state.invoices, invoiceId, 'Invoice');
      if (invoice.status === 'draft') throw new Error('invoice_draft');
      if (invoice.clientId !== payment.clientId) throw new Error('client_mismatch');
      const allocation = calculatePaymentAllocation(payment);
      const balance = calculateInvoiceBalance(invoice, state.payments);
      if (amount <= 0 || amount > allocation.unallocated || amount > balance.outstanding)
        throw new Error('invalid_match_amount');
      const match = {
        id: nextId('match', payment.matches),
        invoiceId,
        amount: roundMoney(amount),
        matchedBy: actorId,
        matchedAt: DEMO_NOW,
      };
      state.payments = replace(state.payments, {
        ...payment,
        matches: [...payment.matches, match],
      });
      const paid = roundMoney(balance.paid + amount);
      const status = paid >= invoice.amount ? 'paid' : 'partially_paid';
      state.invoices = replace(state.invoices, { ...invoice, status });
      state.financialEvents = state.financialEvents.map((event) =>
        event.invoiceId === invoiceId
          ? { ...event, status: status === 'paid' ? 'paid' : 'invoiced' }
          : event,
      );
      if (status === 'paid') {
        state.obligations = state.obligations.map((obligation) =>
          obligation.invoiceId === invoiceId && obligation.kind === 'payment'
            ? { ...obligation, status: 'completed', progress: 100, completedAt: DEMO_NOW }
            : obligation,
        );
      }
      this.addActivity(
        state,
        'payment',
        paymentId,
        actorId,
        text(
          `Оплата сопоставлена со счётом ${invoice.number} на ${money(amount, 'ru')}`,
          `Payment matched to invoice ${invoice.number} for ${money(amount, 'en')}`,
        ),
        true,
      );
    });
  }

  addCost(input: CostInput): Cost {
    if (input.amount <= 0) throw new Error('invalid_cost');
    const state = this.store.snapshot();
    const cost: Cost = {
      id: nextId('cost', state.costs),
      projectId: input.projectId,
      description: localizedInput(input.description, input.language),
      category: input.category,
      amount: roundMoney(input.amount),
      date: DEMO_TODAY,
      source: localizedInput(input.source, input.language),
    };
    this.store.transact((next) => {
      next.costs.push(cost);
      this.addActivity(
        next,
        'cost',
        cost.id,
        input.actorId,
        text(
          'Добавлены фактические затраты; маржа пересчитана',
          'Actual costs added; margin recalculated',
        ),
        true,
      );
    });
    return cost;
  }

  prepareRepeatProposal(clientId: string, language: LanguageShort): Proposal {
    const state = this.store.snapshot();
    const previous = state.proposals.filter((proposal) => proposal.clientId === clientId).at(-1);
    const proposal = this.newProposal(clientId, language);
    proposal.title = text(
      `Повторный заказ — ${this.require(state.clients, clientId, 'Client').name.ru}`,
      `Repeat order — ${this.require(state.clients, clientId, 'Client').name.en}`,
    );
    proposal.items =
      previous?.items.map((item, index) => ({
        ...item,
        id: `item-repeat-${index + 1}`,
        unitPrice: roundMoney(item.unitPrice * 0.4),
        unitCost: roundMoney(item.unitCost * 0.35),
      })) ?? [];
    this.saveProposal(proposal);
    return proposal;
  }

  createAiResult(
    kind: AiResult['kind'],
    entityType: EntityType,
    entityId: string,
    actorId: string,
  ): AiResult {
    const state = this.store.snapshot();
    const pending = state.aiResults.find(
      (result) =>
        result.kind === kind && result.entityId === entityId && result.status === 'pending',
    );
    if (pending) return pending;
    let result!: AiResult;
    this.store.transact((next) => {
      const generated = this.aiContent(next, kind, entityType, entityId);
      result = {
        id: nextId('ai', next.aiResults),
        kind,
        entityType,
        entityId,
        ...generated,
        confidence: kind === 'payment_reminder' ? 0.97 : kind === 'extract_terms' ? 0.94 : 0.89,
        status: 'pending',
        model: 'demo-rules-v1',
        costRub: 0,
        createdAt: DEMO_NOW,
        history: [
          {
            at: DEMO_NOW,
            actorId,
            action: 'generated',
            note: text(
              'Результат симуляции требует проверки человеком',
              'Simulated result requires human review',
            ),
          },
        ],
      };
      next.aiResults.push(result);
      this.addActivity(
        next,
        entityType,
        entityId,
        actorId,
        text(
          'Подготовлен проверяемый результат управляемого ИИ',
          'Verifiable controlled AI result prepared',
        ),
        true,
      );
    });
    return result;
  }

  reviewAi(
    resultId: string,
    action: 'accepted' | 'edited' | 'rejected',
    actorId: string,
    edited?: LocalizedText,
  ): void {
    if (action === 'accepted') {
      const current = this.store.aiResults.get(resultId);
      if (current?.kind === 'extract_terms' && current.entityType === 'contract') {
        this.confirmContractTerms(current.entityId, actorId);
        return;
      }
    }
    this.store.transact((state) => {
      const result = this.require(state.aiResults, resultId, 'AI result');
      state.aiResults = replace(state.aiResults, {
        ...result,
        status: action,
        result: action === 'edited' && edited ? edited : result.result,
        confirmedBy: action === 'rejected' ? result.confirmedBy : actorId,
        history: [
          ...result.history,
          {
            at: DEMO_NOW,
            actorId,
            action,
            note:
              action === 'rejected'
                ? text('Результат отклонён, данные не изменены', 'Result rejected; data unchanged')
                : text('Результат проверен человеком', 'Result reviewed by a person'),
          },
        ],
      });
    });
  }

  rollbackAi(resultId: string, actorId: string): void {
    this.store.transact((state) => {
      const result = this.require(state.aiResults, resultId, 'AI result');
      if (result.kind !== 'extract_terms' || result.status !== 'accepted')
        throw new Error('nothing_to_rollback');
      const contract = this.require(state.contracts, result.entityId, 'Contract');
      state.contracts = replace(state.contracts, {
        ...contract,
        extractionStatus: 'pending',
        confirmedBy: undefined,
      });
      const project = state.projects.find((item) => item.contractId === contract.id);
      if (project) {
        state.obligations = state.obligations.map((obligation) =>
          obligation.projectId === project.id
            ? { ...obligation, confirmationStatus: 'pending', confirmedBy: undefined }
            : obligation,
        );
        state.financialEvents = state.financialEvents.map((event) =>
          event.projectId === project.id ? { ...event, confirmationStatus: 'pending' } : event,
        );
      }
      state.aiResults = replace(state.aiResults, {
        ...result,
        status: 'rolled_back',
        confirmedBy: undefined,
        history: [
          ...result.history,
          {
            at: DEMO_NOW,
            actorId,
            action: 'rolled_back',
            note: text('Подтверждение условий откачено', 'Term confirmation rolled back'),
          },
        ],
      });
      this.addActivity(
        state,
        'contract',
        contract.id,
        actorId,
        text(
          'Откачено подтверждение извлечённых условий',
          'Extracted term confirmation rolled back',
        ),
        true,
      );
    });
  }

  portalDecision(projectId: string, approved: boolean): void {
    this.store.transact((state) => {
      const project = this.require(state.projects, projectId, 'Project');
      const obligation =
        state.obligations.find(
          (item) =>
            item.projectId === projectId &&
            item.kind === 'acceptance' &&
            item.status !== 'completed',
        ) ??
        state.obligations.find((item) => item.projectId === projectId && item.kind === 'delivery');
      if (!obligation) throw new Error('no_acceptance_obligation');
      state.obligations = replace(
        state.obligations,
        approved
          ? { ...obligation, status: 'completed', progress: 100, completedAt: DEMO_NOW }
          : { ...obligation, status: 'blocked' },
      );
      state.projects = replace(state.projects, {
        ...project,
        status: approved ? 'in_progress' : 'blocked',
      });
      state.documents = state.documents.map((document) =>
        document.projectId === projectId && document.kind === 'act'
          ? { ...document, status: approved ? 'signed' : 'pending_approval' }
          : document,
      );
      this.addActivity(
        state,
        'project',
        projectId,
        'user-client',
        approved
          ? text('Клиент согласовал этап в портале', 'Client approved the milestone in the portal')
          : text(
              'Клиент запросил изменения; этап заблокирован, дата оплаты под риском',
              'Client requested changes; the milestone is blocked and the payment date is at risk',
            ),
        false,
      );
    });
  }

  uploadMaterial(projectId: string, fileName: string, content: string): Document {
    const state = this.store.snapshot();
    const project = this.require(state.projects, projectId, 'Project');
    const document: Document = {
      id: nextId('document', state.documents),
      clientId: project.clientId,
      projectId,
      kind: 'material',
      title: localizedInput(fileName, 'en'),
      version: 1,
      status: 'ready',
      content: localizedInput(content || fileName, 'en'),
      createdAt: DEMO_NOW,
      internal: false,
    };
    this.store.transact((next) => {
      next.documents.push(document);
      this.addActivity(
        next,
        'document',
        document.id,
        'user-client',
        text('Клиент загрузил материалы в портал', 'Client uploaded materials to the portal'),
        false,
      );
    });
    return document;
  }

  askPortalQuestion(projectId: string, question: string): void {
    this.store.transact((state) => {
      this.addActivity(
        state,
        'project',
        projectId,
        'user-client',
        localizedInput(question, 'en'),
        false,
      );
    });
  }

  advanceIntegration(eventId: string): void {
    this.store.transact((state) => {
      const event = this.require(state.integrationEvents, eventId, 'Integration event');
      state.integrationEvents = replace(state.integrationEvents, {
        ...event,
        status: 'done',
        attempts: event.attempts + 1,
        updatedAt: DEMO_NOW,
        message: text(
          'Mock-адаптер обработал событие; внешний сервис не подключён',
          'Mock adapter processed the event; no external service is connected',
        ),
        transformLog: [
          ...event.transformLog,
          text('Ручное безопасное действие подтверждено', 'Manual safe action confirmed'),
        ],
      });
      this.addActivity(
        state,
        'integration',
        event.id,
        'user-finance',
        text(
          'Событие интеграции обработано в mock-адаптере',
          'Integration event processed in the mock adapter',
        ),
        true,
      );
    });
  }

  exportArchive(): void {
    const blob = new Blob([JSON.stringify(this.store.snapshot(), null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'potok-demo-export.json';
    anchor.click();
    URL.revokeObjectURL(url);
  }

  actorForRole(role: RoleCode): string {
    return role === 'client' ? 'user-client' : `user-${role}`;
  }

  private aiContent(
    state: AppState,
    kind: AiResult['kind'],
    entityType: EntityType,
    entityId: string,
  ): Pick<AiResult, 'source' | 'result'> {
    if (kind === 'explain_margin') {
      const margin = calculateProjectMargin(state, entityId);
      const project = this.require(state.projects, entityId, 'Project');
      const rework = state.costs
        .filter((cost) => cost.projectId === entityId && cost.category === 'rework')
        .reduce((sum, cost) => sum + cost.amount, 0);
      return {
        source: text(
          `Предложение, договор и затраты проекта ${project.name.ru}`,
          `Proposal, contract, and cost records for ${project.name.en}`,
        ),
        result: text(
          `Отклонение маржи: ${money(margin?.marginVariance ?? 0, 'ru')}. Доработки добавили ${money(rework, 'ru')} затрат; остальное отклонение связано с разницей фактических и плановых прямых затрат.`,
          `Margin variance: ${money(margin?.marginVariance ?? 0, 'en')}. Rework added ${money(rework, 'en')} in costs; the remaining variance comes from actual versus planned direct costs.`,
        ),
      };
    }
    if (kind === 'payment_reminder') {
      const invoice = this.require(state.invoices, entityId, 'Invoice');
      const client = this.require(state.clients, invoice.clientId, 'Client');
      const balance = calculateInvoiceBalance(invoice, state.payments).outstanding;
      return {
        source: text(
          `Счёт ${invoice.number}, остаток и шаблон напоминания`,
          `Invoice ${invoice.number}, outstanding balance, and reminder template`,
        ),
        result: text(
          `${client.contactName}, добрый день! Напоминаем об остатке ${money(balance, 'ru')} по счёту ${invoice.number}. Подскажите, пожалуйста, когда ждать оплату?`,
          `Hi ${client.contactName}, a reminder that invoice ${invoice.number} has an outstanding balance of ${money(balance, 'en')}. Could you let us know when to expect payment?`,
        ),
      };
    }
    if (kind === 'compare_versions') {
      const document = this.require(state.documents, entityId, 'Document');
      return {
        source: text(
          `${document.title.ru}, версии 1–${document.version}`,
          `${document.title.en}, versions 1–${document.version}`,
        ),
        result: text(
          'В текущей версии срок приёмки изменён с трёх до пяти рабочих дней. Сумма договора не изменена.',
          'The current version changes acceptance from three to five business days. The contract amount is unchanged.',
        ),
      };
    }
    if (kind === 'next_action') {
      const action =
        state.nextActions.find((item) => item.entityId === entityId) ?? state.nextActions[0];
      return {
        source: text(
          'Просрочка, обязательства, оплаты и отклонения маржи',
          'Overdue items, obligations, payments, and margin variances',
        ),
        result:
          action?.title ??
          text('Проверить денежный календарь проекта', 'Review the project cash calendar'),
      };
    }
    const contract = this.require(state.contracts, entityId, 'Contract');
    return {
      source: text(
        `Договор ${contract.number}, версия ${contract.version}`,
        `Contract ${contract.number}, version ${contract.version}`,
      ),
      result: text(
        'Извлечены суммы, сроки, приёмка и гарантийные обязательства. Все критичные условия требуют подтверждения.',
        'Amounts, deadlines, acceptance, and warranty obligations extracted. All critical terms require confirmation.',
      ),
    };
  }

  private addActivity(
    state: AppState,
    entityType: EntityType,
    entityId: string,
    actorId: string,
    action: LocalizedText,
    internal: boolean,
  ): void {
    const activity: Activity = {
      id: nextId('activity', state.activities),
      at: DEMO_NOW,
      actorId,
      action,
      entityType,
      entityId,
      internal,
    };
    state.activities.push(activity);
  }

  private require<T extends { id: string }>(items: T[], id: string, label: string): T {
    const item = items.find((candidate) => candidate.id === id);
    if (!item) throw new Error(`${label} not found: ${id}`);
    return item;
  }
}
