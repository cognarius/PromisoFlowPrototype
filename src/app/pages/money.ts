import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { DEMO_TODAY } from '../core/demo-data';
import {
  calculateInvoiceBalance,
  calculatePaymentAllocation,
  isInvoiceOverdue,
} from '../core/finance';
import { FormatService } from '../core/format';
import { I18nService } from '../core/i18n';
import { addDays, cashReceiptForecast, invoiceAging } from '../core/metrics';
import { Invoice, Payment } from '../core/models';
import { SessionService } from '../core/session';
import { AppStore } from '../core/store';
import { UiService } from '../core/ui';
import { WorkflowService } from '../core/workflow';
import {
  EmptyStateComponent,
  MetricCardComponent,
  StatusChipComponent,
} from '../shared/components';

@Component({
  selector: 'app-money',
  imports: [FormsModule, StatusChipComponent, EmptyStateComponent, MetricCardComponent],
  template: `
    <div class="page-stack">
      <div class="notice notice--amber">
        <i class="fa-solid fa-building-columns" aria-hidden="true"></i
        ><span>{{ i18n.t('common.demoMode') }}</span>
      </div>
      <section class="metric-grid">
        <app-metric-card
          [label]="i18n.t('money.received30')"
          [value]="format.money(received30(), true)"
          [period]="i18n.t('common.period30')"
        />
        <app-metric-card
          [label]="i18n.t('money.expected')"
          [value]="format.money(expected(), true)"
          [period]="i18n.t('common.period30')"
        />
        <app-metric-card
          [label]="i18n.t('money.overdue')"
          [value]="format.money(overdue(), true)"
          [period]="i18n.t('common.asOf')"
          tone="negative"
        />
        <app-metric-card
          [label]="i18n.t('money.autoMatched')"
          [value]="format.percent(matchRate())"
          [period]="i18n.t('common.asOf')"
          tone="positive"
        />
      </section>
      <div class="money-layout">
        <section class="card">
          <div class="card__header">
            <div>
              <h2>{{ i18n.t('money.invoicesPayments') }}</h2>
              <p class="small">{{ i18n.t('money.invoiceStatusUpdated') }}</p>
            </div>
            @if (session.canManageFinance()) {
              <button class="btn btn--primary" (click)="openPayment()">
                <i class="fa-solid fa-plus" aria-hidden="true"></i
                >{{ i18n.t('money.simulatePayment') }}
              </button>
            }
          </div>
          <div class="table-wrap">
            <table class="money-table">
              <thead>
                <tr>
                  <th>{{ i18n.t('common.invoice') }}</th>
                  <th>{{ i18n.t('common.client') }}</th>
                  <th class="numeric">{{ i18n.t('common.amount') }}</th>
                  <th>{{ i18n.t('common.dueDate') }}</th>
                  <th>{{ i18n.t('common.status') }}</th>
                  <th>{{ i18n.t('common.actions') }}</th>
                </tr>
              </thead>
              <tbody>
                @for (invoice of store.state().invoices; track invoice.id) {
                  <tr [class.focused]="selectedInvoiceId() === invoice.id">
                    <td>
                      <button class="table-link" (click)="selectInvoice(invoice)">
                        № {{ invoice.number }}</button
                      ><small>{{ format.date(invoice.issueDate) }}</small>
                    </td>
                    <td>{{ clientName(invoice.clientId) }}</td>
                    <td class="numeric money">
                      {{ format.money(invoice.amount)
                      }}<small
                        >{{ i18n.t('common.remaining') }}:
                        {{ format.money(balance(invoice).outstanding) }}</small
                      >
                    </td>
                    <td [class.negative]="overdueInvoice(invoice)">
                      {{ format.date(invoice.dueDate) }}
                    </td>
                    <td><app-status-chip [status]="invoice.status" /></td>
                    <td>
                      <div class="button-row">
                        @if (invoice.status === 'draft' && session.canManageFinance()) {
                          <button class="btn btn--small btn--primary" (click)="issue(invoice.id)">
                            {{ i18n.t('money.issue') }}
                          </button>
                        }
                        @if (
                          invoice.status !== 'draft' &&
                          balance(invoice).outstanding > 0 &&
                          session.canManageFinance()
                        ) {
                          <button class="btn btn--small" (click)="openPayment(invoice)">
                            {{ i18n.t('money.simulatePayment') }}
                          </button>
                        }
                      </div>
                    </td>
                  </tr>
                } @empty {
                  <tr>
                    <td colspan="6"><app-empty-state [title]="i18n.t('money.noInvoice')" /></td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <section class="aging">
            <h3>{{ i18n.t('money.aging') }}</h3>
            <div class="aging-bar">
              @for (segment of agingSegments(); track segment.key) {
                <span
                  [class]="segment.class"
                  [style.width.%]="agingWidth(segment.value)"
                  [title]="format.money(segment.value)"
                ></span>
              }
            </div>
            <div class="aging-legend">
              @for (segment of agingSegments(); track segment.key) {
                <span
                  ><i [class]="segment.class"></i>{{ i18n.t(segment.key) }} ·
                  <strong>{{ format.money(segment.value) }}</strong></span
                >
              }
            </div>
          </section>
        </section>

        <aside class="card matching-card">
          <div class="card__header">
            <div>
              <h2>{{ i18n.t('money.matching') }}</h2>
              <p class="small">{{ i18n.t('money.matchHint') }}</p>
            </div>
            <i class="fa-solid fa-wand-magic-sparkles matching-icon" aria-hidden="true"></i>
          </div>
          @if (unmatchedPayments().length) {
            <label class="field"
              ><span>{{ i18n.t('money.selectPayment') }}</span
              ><select [ngModel]="selectedPaymentId()" (ngModelChange)="selectPayment($event)">
                @for (payment of unmatchedPayments(); track payment.id) {
                  <option [value]="payment.id">
                    {{ format.money(allocation(payment).unallocated) }} ·
                    {{ i18n.text(payment.payer) }} · {{ format.date(payment.date) }}
                  </option>
                }
              </select></label
            >
            @if (selectedPayment(); as payment) {
              <div class="payment-detail">
                <span class="small">{{ i18n.t('money.payer') }}</span><strong class="stat-value">{{
                  format.money(payment.amount)
                }}</strong>
                <p>{{ i18n.text(payment.payer) }}</p>
                <small
                  >{{ i18n.t('money.paymentPurpose') }}: {{ i18n.text(payment.purpose) }}</small
                >
                <dl class="finance-list">
                  <div>
                    <dt>{{ i18n.t('money.allocated') }}</dt>
                    <dd>{{ format.money(allocation(payment).allocated) }}</dd>
                  </div>
                  <div>
                    <dt>{{ i18n.t('money.unallocated') }}</dt>
                    <dd>{{ format.money(allocation(payment).unallocated) }}</dd>
                  </div>
                </dl>
                <app-status-chip [status]="allocation(payment).status" />
              </div>
              @if (suggestedInvoice(); as suggestion) {
                <div class="notice notice--green">
                  <i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i
                  ><span
                    >{{ i18n.t('money.selectInvoice') }}:
                    <strong>№ {{ suggestion.number }}</strong> ·
                    {{
                      i18n.t('common.percentConfidence', { value: suggestionConfidence() })
                    }}</span
                  >
                </div>
              }
              <label class="field"
                ><span>{{ i18n.t('money.selectInvoice') }}</span
                ><select
                  [ngModel]="selectedInvoiceId()"
                  (ngModelChange)="selectedInvoiceId.set($event)"
                >
                  <option value="">{{ i18n.t('common.select') }}</option>
                  @for (invoice of matchInvoices(); track invoice.id) {
                    <option [value]="invoice.id">
                      № {{ invoice.number }} · {{ format.money(balance(invoice).outstanding) }}
                    </option>
                  }
                </select></label
              >
              <label class="field"
                ><span>{{ i18n.t('money.matchAmount') }}</span
                ><input
                  type="number"
                  min="0"
                  [max]="maxMatchAmount()"
                  [(ngModel)]="matchAmount"
                  [attr.aria-invalid]="matchError"
              /></label>
              @if (matchError) {
                <p class="field-error">{{ i18n.t('common.matchAmount') }}</p>
              }
              @if (session.canManageFinance()) {
                <button class="btn btn--primary full-width" (click)="match()">
                  <i class="fa-solid fa-link" aria-hidden="true"></i>{{ i18n.t('money.match') }}
                </button>
              }
              <p class="small">{{ i18n.t('money.fullMatchOnly') }}</p>
            }
          } @else {
            <app-empty-state
              [title]="i18n.t('money.noUnmatched')"
              icon="fa-solid fa-circle-check"
            />
            @if (selectedPayment()) {
              <button class="btn" (click)="showAllPayments = !showAllPayments">
                {{ i18n.t('common.history') }}
              </button>
            }
          }
          @if (!unmatchedPayments().length && showAllPayments) {
            <div class="timeline">
              @for (payment of store.state().payments; track payment.id) {
                <div>
                  <span class="timeline__dot"></span>
                  <p>{{ i18n.text(payment.payer) }} · {{ format.money(payment.amount) }}</p>
                  <small>{{ format.date(payment.date) }}</small>
                </div>
              }
            </div>
          }
        </aside>
      </div>
      <section class="card">
        <div class="card__header">
          <div>
            <h2>{{ i18n.t('common.history') }}</h2>
            <p class="small">{{ i18n.t('money.matchHint') }}</p>
          </div>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{{ i18n.t('common.date') }}</th>
                <th>{{ i18n.t('money.payer') }}</th>
                <th>{{ i18n.t('money.paymentPurpose') }}</th>
                <th class="numeric">{{ i18n.t('common.amount') }}</th>
                <th>{{ i18n.t('common.status') }}</th>
              </tr>
            </thead>
            <tbody>
              @for (payment of store.state().payments; track payment.id) {
                <tr [class.focused]="selectedPaymentId() === payment.id">
                  <td>{{ format.date(payment.date) }}</td>
                  <td>{{ i18n.text(payment.payer) }}</td>
                  <td>{{ i18n.text(payment.purpose) }}</td>
                  <td class="numeric money">{{ format.money(payment.amount) }}</td>
                  <td><app-status-chip [status]="allocation(payment).status" /></td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </section>
    </div>

    @if (paymentEditorOpen()) {
      <div class="modal-backdrop" (click)="paymentEditorOpen.set(false)">
        <section
          class="modal"
          role="dialog"
          aria-modal="true"
          [attr.aria-label]="i18n.t('money.simulatePayment')"
          (click)="$event.stopPropagation()"
        >
          <div class="card__header">
            <h2>{{ i18n.t('money.simulatePayment') }}</h2>
            <button
              class="icon-button"
              (click)="paymentEditorOpen.set(false)"
              [attr.aria-label]="i18n.t('common.close')"
            >
              <i class="fa-solid fa-xmark" aria-hidden="true"></i>
            </button>
          </div>
          <div class="notice notice--amber">{{ i18n.t('money.paymentHint') }}</div>
          <label class="field"
            ><span>{{ i18n.t('common.client') }}</span
            ><select
              [(ngModel)]="paymentForm.clientId"
              (ngModelChange)="paymentForm.invoiceId = ''"
            >
              @for (client of store.state().clients; track client.id) {
                <option [value]="client.id">{{ i18n.text(client.name) }}</option>
              }
            </select></label
          ><label class="field"
            ><span>{{ i18n.t('money.invoiceOptional') }}</span
            ><select [(ngModel)]="paymentForm.invoiceId" (ngModelChange)="syncPaymentAmount()">
              <option value="">{{ i18n.t('common.select') }}</option>
              @for (invoice of paymentInvoices(); track invoice.id) {
                <option [value]="invoice.id">
                  № {{ invoice.number }} · {{ format.money(balance(invoice).outstanding) }}
                </option>
              }
            </select></label
          ><label class="field"
            ><span>{{ i18n.t('common.amount') }}</span
            ><input type="number" min="0" [(ngModel)]="paymentForm.amount" /><small>{{
              i18n.t('money.invoiceAmountHint')
            }}</small></label
          >
          <div class="modal__actions">
            <button class="btn" (click)="paymentEditorOpen.set(false)">
              {{ i18n.t('common.cancel') }}</button><button
              class="btn btn--primary"
              (click)="createPayment()"
            >
              {{ i18n.t('money.simulatePayment') }}
            </button>
          </div>
        </section>
      </div>
    }
  `,
})
export class MoneyComponent {
  readonly selectedPaymentId = signal(
    inject(ActivatedRoute).snapshot.queryParamMap.get('payment') ?? '',
  );
  readonly selectedInvoiceId = signal(
    inject(ActivatedRoute).snapshot.queryParamMap.get('invoice') ?? '',
  );
  readonly paymentEditorOpen = signal(false);
  matchAmount = 0;
  matchError = false;
  showAllPayments = false;
  paymentForm = { clientId: '', invoiceId: '', amount: 0 };
  constructor(
    readonly i18n: I18nService,
    readonly format: FormatService,
    readonly store: AppStore,
    readonly session: SessionService,
    private readonly workflow: WorkflowService,
    private readonly ui: UiService,
    private readonly route: ActivatedRoute,
  ) {
    const payments = this.unmatchedPayments();
    const requestedInvoice = this.selectedInvoiceId();
    if (!this.selectedPaymentId() && payments.length) this.selectPayment(payments[0]!.id);
    else if (this.selectedPaymentId()) this.selectPayment(this.selectedPaymentId());
    if (requestedInvoice) this.selectedInvoiceId.set(requestedInvoice);
  }
  received30(): number {
    const start = addDays(DEMO_TODAY, -30);
    return this.store
      .state()
      .payments.filter((payment) => payment.date >= start && payment.date <= DEMO_TODAY)
      .reduce((sum, payment) => sum + payment.amount, 0);
  }
  expected(): number {
    return cashReceiptForecast(this.store.state());
  }
  overdue(): number {
    return this.store
      .state()
      .invoices.filter((invoice) =>
        isInvoiceOverdue(invoice, this.store.state().payments, DEMO_TODAY),
      )
      .reduce(
        (sum, invoice) =>
          sum + calculateInvoiceBalance(invoice, this.store.state().payments).outstanding,
        0,
      );
  }
  matchRate(): number {
    const payments = this.store.state().payments;
    return payments.length
      ? Math.round(
          (payments.filter((payment) => calculatePaymentAllocation(payment).status === 'matched')
            .length /
            payments.length) *
            100,
        )
      : 100;
  }
  clientName(id: string): string {
    const client = this.store.state().clients.find((item) => item.id === id);
    return client ? this.i18n.text(client.name) : id;
  }
  balance(invoice: Invoice): ReturnType<typeof calculateInvoiceBalance> {
    return calculateInvoiceBalance(invoice, this.store.state().payments);
  }
  allocation(payment: Payment): ReturnType<typeof calculatePaymentAllocation> {
    return calculatePaymentAllocation(payment);
  }
  overdueInvoice(invoice: Invoice): boolean {
    return isInvoiceOverdue(invoice, this.store.state().payments, DEMO_TODAY);
  }
  unmatchedPayments(): Payment[] {
    return this.store
      .state()
      .payments.filter((payment) => calculatePaymentAllocation(payment).unallocated > 0);
  }
  selectedPayment(): Payment | undefined {
    return this.store.state().payments.find((payment) => payment.id === this.selectedPaymentId());
  }
  matchInvoices(): Invoice[] {
    const payment = this.selectedPayment();
    return this.store
      .state()
      .invoices.filter(
        (invoice) =>
          invoice.status !== 'draft' &&
          invoice.clientId === payment?.clientId &&
          this.balance(invoice).outstanding > 0,
      );
  }
  suggestedInvoice(): Invoice | undefined {
    const payment = this.selectedPayment();
    const invoices = this.matchInvoices();
    return (
      invoices.find(
        (invoice) => this.balance(invoice).outstanding === this.allocation(payment!).unallocated,
      ) ?? invoices[0]
    );
  }
  suggestionConfidence(): number {
    const suggestion = this.suggestedInvoice();
    const payment = this.selectedPayment();
    if (!suggestion || !payment) return 0;
    return this.balance(suggestion).outstanding === this.allocation(payment).unallocated ? 96 : 82;
  }
  selectPayment(id: string): void {
    this.selectedPaymentId.set(id);
    const payment = this.store.state().payments.find((item) => item.id === id);
    if (!payment) return;
    const unallocated = calculatePaymentAllocation(payment).unallocated;
    const candidates = this.matchInvoicesFor(payment);
    const suggestion =
      candidates.find((invoice) => this.balance(invoice).outstanding === unallocated) ??
      candidates[0];
    this.selectedInvoiceId.set(suggestion?.id ?? '');
    this.matchAmount = Math.min(unallocated, suggestion ? this.balance(suggestion).outstanding : 0);
    this.matchError = false;
  }
  selectInvoice(invoice: Invoice): void {
    this.selectedInvoiceId.set(invoice.id);
    if (this.selectedPayment())
      this.matchAmount = Math.min(this.maxMatchAmount(), this.balance(invoice).outstanding);
  }
  maxMatchAmount(): number {
    const payment = this.selectedPayment();
    const invoice = this.store
      .state()
      .invoices.find((item) => item.id === this.selectedInvoiceId());
    return payment && invoice
      ? Math.min(this.allocation(payment).unallocated, this.balance(invoice).outstanding)
      : 0;
  }
  match(): void {
    this.matchError = false;
    try {
      if (
        !this.selectedInvoiceId() ||
        this.matchAmount <= 0 ||
        this.matchAmount > this.maxMatchAmount()
      )
        throw new Error('invalid');
      this.workflow.matchPayment(
        this.selectedPaymentId(),
        this.selectedInvoiceId(),
        this.matchAmount,
      );
      this.ui.notify(this.i18n.t('money.matched'));
      const next = this.unmatchedPayments()[0];
      this.selectedPaymentId.set(next?.id ?? '');
      if (next) this.selectPayment(next.id);
    } catch {
      this.matchError = true;
      this.ui.notify(this.i18n.t('common.matchAmount'));
    }
  }
  issue(id: string): void {
    try {
      this.workflow.issueInvoice(id);
      this.ui.notify(this.i18n.t('money.issued'));
    } catch {
      this.ui.notify(this.i18n.t('common.invalidOperation'));
    }
  }
  openPayment(invoice?: Invoice): void {
    this.paymentForm = {
      clientId: invoice?.clientId ?? this.store.state().clients[0]?.id ?? '',
      invoiceId: invoice?.id ?? '',
      amount: invoice ? this.balance(invoice).outstanding : 0,
    };
    this.paymentEditorOpen.set(true);
  }
  paymentInvoices(): Invoice[] {
    return this.store
      .state()
      .invoices.filter(
        (invoice) =>
          invoice.clientId === this.paymentForm.clientId &&
          invoice.status !== 'draft' &&
          this.balance(invoice).outstanding > 0,
      );
  }
  syncPaymentAmount(): void {
    const invoice = this.store
      .state()
      .invoices.find((item) => item.id === this.paymentForm.invoiceId);
    if (invoice) this.paymentForm.amount = this.balance(invoice).outstanding;
  }
  createPayment(): void {
    try {
      if (!this.paymentForm.clientId || this.paymentForm.amount <= 0) throw new Error('invalid');
      const payment = this.workflow.simulatePayment(
        this.paymentForm.clientId,
        this.paymentForm.amount,
        this.paymentForm.invoiceId || undefined,
      );
      this.paymentEditorOpen.set(false);
      this.selectPayment(payment.id);
      this.ui.notify(this.i18n.t('money.paymentCreated'));
    } catch {
      this.ui.notify(this.i18n.t('common.formInvalid'));
    }
  }
  agingSegments(): {
    key: 'money.current' | 'money.days1to7' | 'money.days8to30' | 'money.days31plus';
    value: number;
    class: string;
  }[] {
    const aging = invoiceAging(this.store.state());
    return [
      { key: 'money.current', value: aging.current, class: 'aging-current' },
      { key: 'money.days1to7', value: aging.days1to7, class: 'aging-recent' },
      { key: 'money.days8to30', value: aging.days8to30, class: 'aging-medium' },
      { key: 'money.days31plus', value: aging.days31plus, class: 'aging-old' },
    ];
  }
  agingWidth(value: number): number {
    const total = this.agingSegments().reduce((sum, segment) => sum + segment.value, 0);
    return total ? (value / total) * 100 : 0;
  }
  private matchInvoicesFor(payment: Payment): Invoice[] {
    return this.store
      .state()
      .invoices.filter(
        (invoice) =>
          invoice.status !== 'draft' &&
          invoice.clientId === payment.clientId &&
          this.balance(invoice).outstanding > 0,
      );
  }
}
