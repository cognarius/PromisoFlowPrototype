import { Injectable } from '@angular/core';
import { DEMO_TODAY } from './demo-data';
import {
  calculateInvoiceBalance,
  calculatePaymentAllocation,
  calculateProjectMargin,
  calculateProposalTotals,
  isInvoiceOverdue,
} from './finance';
import { FormatService } from './format';
import { I18nService } from './i18n';
import { daysBetween } from './metrics';
import { AppState, NextAction } from './models';
import { AppStore } from './store';

export interface ActionView {
  id: string;
  type: NextAction['type'];
  entityId: string;
  title: string;
  reason: string;
  expectedEffect: number;
  expectedEffectText: string;
  owner: string;
  ownerId: string;
  route: string;
  queryParams: Record<string, string>;
  priority: number;
}

@Injectable({ providedIn: 'root' })
export class ActionCenterService {
  constructor(
    private readonly store: AppStore,
    private readonly i18n: I18nService,
    private readonly format: FormatService,
  ) {}

  views(state: AppState = this.store.snapshot()): ActionView[] {
    const actions: ActionView[] = [];
    const add = (action: Omit<ActionView, 'owner' | 'priority'> & { ownerId: string }): void => {
      actions.push({
        ...action,
        owner: state.users.find((user) => user.id === action.ownerId)?.name ?? action.ownerId,
        priority: actions.length + 1,
      });
    };
    const money = (value: number): string => this.format.money(value);
    const clientName = (clientId: string): string => {
      const client = state.clients.find((item) => item.id === clientId);
      return client ? this.i18n.text(client.name) : clientId;
    };
    const effect = (kind: NextAction['effectKind'], value: number): string =>
      this.i18n.t(`action.effect.${kind}`, { value: money(value) });

    for (const invoice of state.invoices.filter((item) =>
      isInvoiceOverdue(item, state.payments, DEMO_TODAY),
    )) {
      const balance = calculateInvoiceBalance(invoice, state.payments).outstanding;
      const days = daysBetween(invoice.dueDate, DEMO_TODAY);
      add({
        id: `remind_payment-${invoice.id}`,
        type: 'remind_payment',
        entityId: invoice.id,
        ownerId: 'user-sales',
        title: this.i18n.t('action.remindPayment.title', {
          client: clientName(invoice.clientId),
          number: invoice.number,
        }),
        reason: this.i18n.t('action.remindPayment.reason', { days, amount: money(balance) }),
        expectedEffect: balance,
        expectedEffectText: effect('cash', balance),
        route: '/money',
        queryParams: { invoice: invoice.id },
      });
    }

    for (const payment of state.payments.filter(
      (item) => calculatePaymentAllocation(item).unallocated > 0,
    )) {
      const allocation = calculatePaymentAllocation(payment);
      add({
        id: `match_payment-${payment.id}`,
        type: 'match_payment',
        entityId: payment.id,
        ownerId: 'user-finance',
        title: this.i18n.t('action.matchPayment.title', {
          amount: money(allocation.unallocated),
          client: clientName(payment.clientId),
        }),
        reason: this.i18n.t('action.matchPayment.reason'),
        expectedEffect: allocation.unallocated,
        expectedEffectText: this.i18n.t('action.effect.match'),
        route: '/money',
        queryParams: { payment: payment.id },
      });
    }

    for (const obligation of state.obligations.filter(
      (item) =>
        item.kind !== 'payment' &&
        (item.status === 'overdue' ||
          (item.status !== 'completed' && item.status !== 'blocked' && item.dueDate < DEMO_TODAY)),
    )) {
      add({
        id: `check_obligation-${obligation.id}`,
        type: 'check_obligation',
        entityId: obligation.id,
        ownerId: obligation.ownerId,
        title: this.i18n.t('action.checkObligation.title', {
          title: this.i18n.text(obligation.title),
        }),
        reason: this.i18n.t('action.checkObligation.reason', {
          date: this.format.date(obligation.dueDate),
          progress: obligation.progress,
        }),
        expectedEffect: 0,
        expectedEffectText: this.i18n.t('action.effect.delivery'),
        route: '/obligations',
        queryParams: { focus: obligation.id },
      });
    }

    for (const contract of state.contracts.filter(
      (item) => item.status === 'signed' && item.extractionStatus === 'pending',
    )) {
      add({
        id: `confirm_terms-${contract.id}`,
        type: 'confirm_terms',
        entityId: contract.id,
        ownerId: 'user-project',
        title: this.i18n.t('action.confirmTerms.title', { number: contract.number }),
        reason: this.i18n.t('action.confirmTerms.reason'),
        expectedEffect: 0,
        expectedEffectText: this.i18n.t('action.effect.terms'),
        route: `/contracts/${contract.id}`,
        queryParams: {},
      });
    }

    for (const obligation of state.obligations.filter(
      (item) => item.status === 'blocked' || item.status === 'waiting_confirmation',
    )) {
      add({
        id: `request_approval-${obligation.id}`,
        type: 'request_approval',
        entityId: obligation.id,
        ownerId: obligation.ownerId,
        title: this.i18n.t('action.requestApproval.title', {
          title: this.i18n.text(obligation.title),
        }),
        reason: this.i18n.t(
          obligation.status === 'blocked'
            ? 'action.requestApproval.blocked'
            : 'action.requestApproval.waiting',
        ),
        expectedEffect: 0,
        expectedEffectText: this.i18n.t('action.effect.schedule'),
        route: '/portal',
        queryParams: { project: obligation.projectId },
      });
    }

    for (const obligation of state.obligations.filter(
      (item) =>
        item.kind !== 'payment' && item.kind !== 'acceptance' && item.status === 'completed',
    )) {
      const invoice = state.invoices.find((item) => item.obligationId === obligation.id);
      if (invoice && invoice.status !== 'draft') continue;
      const amount =
        invoice?.amount ??
        state.financialEvents.find(
          (event) => event.projectId === obligation.projectId && !event.invoiceId,
        )?.amount ??
        0;
      add({
        id: `invoice_completed-${obligation.id}`,
        type: 'invoice_completed',
        entityId: obligation.id,
        ownerId: 'user-finance',
        title: this.i18n.t('action.invoiceCompleted.title', {
          title: this.i18n.text(obligation.title),
        }),
        reason: this.i18n.t(
          invoice ? 'action.invoiceCompleted.draft' : 'action.invoiceCompleted.missing',
        ),
        expectedEffect: amount,
        expectedEffectText: effect('cash', amount),
        route: invoice ? '/money' : `/projects/${obligation.projectId}`,
        queryParams: invoice ? { invoice: invoice.id } : { obligation: obligation.id },
      });
    }

    for (const project of state.projects) {
      const margin = calculateProjectMargin(state, project.id);
      if (!margin || margin.marginVariance >= 0) continue;
      const value = Math.abs(margin.marginVariance);
      add({
        id: `review_cost-${project.id}`,
        type: 'review_cost',
        entityId: project.id,
        ownerId: 'user-owner',
        title: this.i18n.t('action.reviewCost.title', { project: this.i18n.text(project.name) }),
        reason: this.i18n.t('action.reviewCost.reason', { amount: money(value) }),
        expectedEffect: value,
        expectedEffectText: effect('margin', value),
        route: '/margins',
        queryParams: { project: project.id },
      });
    }

    for (const proposal of state.proposals.filter((item) => item.status === 'draft')) {
      const totals = calculateProposalTotals(proposal);
      if (proposal.discountPercent < 20 && totals.plannedMarginPercentage >= 20) continue;
      add({
        id: `review_discount-${proposal.id}`,
        type: 'review_discount',
        entityId: proposal.id,
        ownerId: 'user-sales',
        title: this.i18n.t('action.reviewDiscount.title', {
          client: clientName(proposal.clientId),
          discount: proposal.discountPercent,
        }),
        reason: this.i18n.t('action.reviewDiscount.reason', {
          percent: this.format.percent(totals.plannedMarginPercentage),
        }),
        expectedEffect: Math.max(0, totals.listRevenue - totals.plannedRevenue),
        expectedEffectText: effect(
          'margin',
          Math.max(0, totals.listRevenue - totals.plannedRevenue),
        ),
        route: `/proposals/${proposal.id}`,
        queryParams: {},
      });
    }

    for (const client of state.clients.filter((item) => item.repeatPotential >= 0.7)) {
      const completed = state.projects.some(
        (project) => project.clientId === client.id && project.status === 'completed',
      );
      const hasDraft = state.proposals.some(
        (proposal) => proposal.clientId === client.id && proposal.status === 'draft',
      );
      if (!completed || hasDraft) continue;
      const value = Math.round(
        state.proposals
          .filter((proposal) => proposal.clientId === client.id)
          .reduce((sum, proposal) => sum + calculateProposalTotals(proposal).plannedRevenue, 0) *
          0.25,
      );
      add({
        id: `repeat_sale-${client.id}`,
        type: 'repeat_sale',
        entityId: client.id,
        ownerId: 'user-sales',
        title: this.i18n.t('action.repeatSale.title', { client: clientName(client.id) }),
        reason: this.i18n.t('action.repeatSale.reason'),
        expectedEffect: value,
        expectedEffectText: effect('cash', value),
        route: `/clients/${client.id}`,
        queryParams: {},
      });
    }

    return actions.filter((action) => !state.completedActionIds.includes(action.id));
  }
}
