import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { ActionView } from './actions';
import { I18nService } from './i18n';
import { AppStore } from './store';
import { UiService } from './ui';
import { WorkflowService } from './workflow';

@Injectable({ providedIn: 'root' })
export class ActionExecutorService {
  constructor(
    private readonly workflow: WorkflowService,
    private readonly store: AppStore,
    private readonly router: Router,
    private readonly ui: UiService,
    private readonly i18n: I18nService,
  ) {}

  execute(action: ActionView): void {
    try {
      if (action.type === 'remind_payment') {
        this.workflow.createAiResult('payment_reminder', 'invoice', action.entityId, 'user-sales');
        void this.router.navigate(['/ai']);
        return;
      }
      if (action.type === 'invoice_completed') {
        const state = this.store.snapshot();
        const obligation = state.obligations.find((item) => item.id === action.entityId);
        let invoice = state.invoices.find((item) => item.obligationId === action.entityId);
        if (!invoice && obligation)
          invoice = this.workflow.createClosingDocuments(obligation.id, 'user-finance').invoice;
        if (invoice?.status === 'draft') this.workflow.issueInvoice(invoice.id);
        this.ui.notify(this.i18n.t('money.issued'));
        void this.router.navigate(['/money'], { queryParams: { invoice: invoice?.id } });
        return;
      }
      if (action.type === 'repeat_sale') {
        const proposal = this.workflow.prepareRepeatProposal(
          action.entityId,
          this.i18n.shortLanguage(),
        );
        this.ui.notify(this.i18n.t('proposals.newFromRepeat'));
        void this.router.navigate(['/proposals', proposal.id]);
        return;
      }
      void this.router.navigate([action.route], { queryParams: action.queryParams });
    } catch {
      this.ui.notify(this.i18n.t('common.invalidOperation'));
    }
  }

  markDone(action: ActionView): void {
    const state = this.store.snapshot();
    this.store.setCompletedActionIds([...state.completedActionIds, action.id]);
    this.ui.notify(this.i18n.t('actions.completed'));
  }
}
