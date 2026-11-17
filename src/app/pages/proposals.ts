import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { calculateProposalTotals } from '../core/finance';
import { FormatService } from '../core/format';
import { I18nService } from '../core/i18n';
import { LocalizedText, Proposal } from '../core/models';
import { SessionService } from '../core/session';
import { AppStore } from '../core/store';
import { UiService } from '../core/ui';
import { WorkflowService } from '../core/workflow';
import { EmptyStateComponent, StatusChipComponent } from '../shared/components';

@Component({
  selector: 'app-proposals',
  imports: [RouterLink, StatusChipComponent, EmptyStateComponent],
  template: `
    <section class="card">
      <div class="card__header">
        <div>
          <h2>{{ i18n.t('page.proposals.title') }}</h2>
          <p class="small">{{ i18n.t('proposals.listHint') }}</p>
        </div>
        <a class="btn btn--primary" routerLink="/proposals/new"
          ><i class="fa-solid fa-plus" aria-hidden="true"></i>{{ i18n.t('proposals.new') }}</a
        >
      </div>
      <div class="filter-row">
        <button class="chip" [class.filter-active]="filter === 'all'" (click)="filter = 'all'">
          {{ i18n.t('common.all') }}</button><button
          class="chip"
          [class.filter-active]="filter === 'draft'"
          (click)="filter = 'draft'"
        >
          {{ i18n.t('status.draft') }}</button
        ><button
          class="chip"
          [class.filter-active]="filter === 'approved'"
          (click)="filter = 'approved'"
        >
          {{ i18n.t('status.approved') }}</button
        ><button
          class="chip"
          [class.filter-active]="filter === 'converted'"
          (click)="filter = 'converted'"
        >
          {{ i18n.t('status.converted') }}
        </button>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{{ i18n.t('common.proposal') }}</th>
              <th>{{ i18n.t('common.client') }}</th>
              <th>{{ i18n.t('common.status') }}</th>
              <th class="numeric">{{ i18n.t('common.discount') }}</th>
              <th class="numeric">{{ i18n.t('common.revenue') }}</th>
              <th class="numeric">{{ i18n.t('proposals.plannedMargin') }}</th>
              <th class="numeric">{{ i18n.t('proposals.plannedMarginPercent') }}</th>
            </tr>
          </thead>
          <tbody>
            @for (proposal of proposals(); track proposal.id) {
              <tr>
                <td>
                  <a class="table-primary" [routerLink]="['/proposals', proposal.id]">{{
                    i18n.text(proposal.title) || i18n.t('proposals.new')
                  }}</a><small>{{ format.date(proposal.createdAt) }}</small>
                </td>
                <td>{{ clientName(proposal.clientId) }}</td>
                <td><app-status-chip [status]="proposal.status" /></td>
                <td class="numeric">{{ format.percent(proposal.discountPercent) }}</td>
                <td class="numeric money">{{ format.money(totals(proposal).plannedRevenue) }}</td>
                <td class="numeric money" [class.negative]="totals(proposal).plannedMargin < 0">
                  {{ format.money(totals(proposal).plannedMargin) }}
                </td>
                <td class="numeric">
                  {{ format.percent(totals(proposal).plannedMarginPercentage) }}
                </td>
              </tr>
            } @empty {
              <tr>
                <td colspan="7">
                  <app-empty-state
                    [title]="i18n.t('common.empty')"
                    [route]="'/proposals/new'"
                    [actionLabel]="i18n.t('proposals.new')"
                  />
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </section>
  `,
})
export class ProposalsComponent {
  filter = 'all';
  constructor(
    readonly i18n: I18nService,
    readonly format: FormatService,
    readonly store: AppStore,
  ) {}
  proposals(): Proposal[] {
    return this.store
      .state()
      .proposals.filter((proposal) => this.filter === 'all' || proposal.status === this.filter);
  }
  totals(proposal: Proposal): ReturnType<typeof calculateProposalTotals> {
    return calculateProposalTotals(proposal);
  }
  clientName(id: string): string {
    const client = this.store.state().clients.find((item) => item.id === id);
    return client ? this.i18n.text(client.name) : id;
  }
}

@Component({
  selector: 'app-proposal-editor',
  imports: [FormsModule, RouterLink, StatusChipComponent, EmptyStateComponent],
  template: `
    @if (found()) {
      <div class="page-stack proposal-editor">
        <section class="card detail-heading">
          <div>
            <span class="eyebrow">{{ i18n.t('proposals.edit') }} · {{ draft.id }}</span>
            <h2>{{ i18n.text(draft.title) || i18n.t('proposals.new') }}</h2>
          </div>
          <div class="button-row">
            <app-status-chip [status]="draft.status" /><a class="btn" routerLink="/proposals">{{
              i18n.t('common.back')
            }}</a>
          </div>
        </section>
        <div class="proposal-layout">
          <section class="card">
            <div class="form-grid">
              <label class="field full"
                ><span>{{ i18n.t('common.name') }} *</span
                ><input
                  [ngModel]="localizedValue(draft.title)"
                  (ngModelChange)="setLocalizedValue(draft.title, $event)"
                  [placeholder]="i18n.t('proposals.titlePlaceholder')"
                  [attr.aria-invalid]="submitted && !localizedValue(draft.title)"
                />
                @if (submitted && !localizedValue(draft.title)) {
                  <small class="field-error">{{ i18n.t('common.required') }}</small>
                }
              </label>
              <label class="field"
                ><span>{{ i18n.t('common.client') }}</span
                ><select [(ngModel)]="draft.clientId" [disabled]="draft.status !== 'draft'">
                  @for (client of store.state().clients; track client.id) {
                    <option [value]="client.id">{{ i18n.text(client.name) }}</option>
                  }
                </select></label
              >
              <label class="field"
                ><span>{{ i18n.t('common.discount') }} %</span
                ><input
                  type="number"
                  min="0"
                  max="90"
                  step="1"
                  [(ngModel)]="draft.discountPercent"
                  [disabled]="draft.status !== 'draft'"
                  [attr.aria-invalid]="submitted && !validDiscount()"
                />
                @if (submitted && !validDiscount()) {
                  <small class="field-error">{{ i18n.t('common.discountRange') }}</small>
                }
              </label>
            </div>
            <div class="card__header items-heading">
              <h3>{{ i18n.t('common.items') }}</h3>
              @if (draft.status === 'draft') {
                <button class="btn btn--small" (click)="addItem()">
                  <i class="fa-solid fa-plus" aria-hidden="true"></i
                  >{{ i18n.t('proposals.addItem') }}
                </button>
              }
            </div>
            <div class="line-items">
              <div class="line-item line-item--head">
                <span>{{ i18n.t('common.description') }}</span><span>{{
                  i18n.t('common.quantity')
                }}</span
                ><span>{{ i18n.t('common.unitPrice') }}</span
                ><span>{{ i18n.t('common.unitCost') }}</span
                ><span>{{ i18n.t('common.total') }}</span
                ><span></span>
              </div>
              @for (item of draft.items; track item.id) {
                <div class="line-item">
                  <label class="field"
                    ><span class="sr-only">{{ i18n.t('common.description') }}</span
                    ><input
                      [ngModel]="localizedValue(item.service)"
                      (ngModelChange)="setLocalizedValue(item.service, $event)"
                      [placeholder]="i18n.t('proposals.servicePlaceholder')"
                      [disabled]="draft.status !== 'draft'"
                      [attr.aria-invalid]="submitted && !localizedValue(item.service)"
                  /></label>
                  <label class="field"
                    ><span class="sr-only">{{ i18n.t('common.quantity') }}</span
                    ><input
                      type="number"
                      min="1"
                      [(ngModel)]="item.quantity"
                      [disabled]="draft.status !== 'draft'"
                  /></label>
                  <label class="field"
                    ><span class="sr-only">{{ i18n.t('common.unitPrice') }}</span
                    ><input
                      type="number"
                      min="0"
                      [(ngModel)]="item.unitPrice"
                      [disabled]="draft.status !== 'draft'"
                  /></label>
                  <label class="field"
                    ><span class="sr-only">{{ i18n.t('common.unitCost') }}</span
                    ><input
                      type="number"
                      min="0"
                      [(ngModel)]="item.unitCost"
                      [disabled]="draft.status !== 'draft'"
                  /></label>
                  <strong class="money">{{ format.money(item.quantity * item.unitPrice) }}</strong>
                  @if (draft.status === 'draft') {
                    <button
                      class="icon-button"
                      (click)="removeItem(item.id)"
                      [attr.aria-label]="i18n.t('common.delete')"
                    >
                      <i class="fa-solid fa-trash" aria-hidden="true"></i>
                    </button>
                  } @else {
                    <span></span>
                  }
                </div>
              } @empty {
                <app-empty-state
                  [title]="i18n.t('proposals.itemsEmpty')"
                  icon="fa-solid fa-list-check"
                />
              }
            </div>
            @if (submitted && !validItems()) {
              <p class="field-error">{{ i18n.t('proposals.needItem') }}</p>
            }
            <div class="form-actions">
              <button class="btn btn--primary" (click)="save()">
                <i class="fa-solid fa-floppy-disk" aria-hidden="true"></i
                >{{ i18n.t('common.save') }}
              </button>
              @if (draft.status === 'draft') {
                <button class="btn" (click)="approve()">{{ i18n.t('proposals.approve') }}</button>
              }
              @if (draft.status === 'approved') {
                <button class="btn btn--primary" (click)="createContract()">
                  {{ i18n.t('proposals.createContract') }}
                </button>
              }
              @if (contractId()) {
                <a class="btn" [routerLink]="['/contracts', contractId()]">{{
                  i18n.t('common.viewContract')
                }}</a>
              }
            </div>
          </section>
          <aside class="page-stack">
            <section class="card calculation-card">
              <span class="eyebrow">{{ i18n.t('proposals.calculation') }}</span>
              <dl class="finance-list">
                <div>
                  <dt>{{ i18n.t('proposals.listRevenue') }}</dt>
                  <dd>{{ format.money(totals().listRevenue) }}</dd>
                </div>
                <div>
                  <dt>{{ i18n.t('common.discount') }}</dt>
                  <dd>−{{ format.money(totals().listRevenue - totals().plannedRevenue) }}</dd>
                </div>
                <div>
                  <dt>{{ i18n.t('proposals.plannedRevenue') }}</dt>
                  <dd>{{ format.money(totals().plannedRevenue) }}</dd>
                </div>
                <div>
                  <dt>{{ i18n.t('proposals.plannedCosts') }}</dt>
                  <dd>{{ format.money(totals().plannedDirectCosts) }}</dd>
                </div>
                <div class="finance-list__total">
                  <dt>{{ i18n.t('proposals.plannedMargin') }}</dt>
                  <dd [class.negative]="totals().plannedMargin < 0">
                    {{ format.money(totals().plannedMargin) }}
                  </dd>
                </div>
              </dl>
              <div class="margin-gauge">
                <strong>{{ format.percent(totals().plannedMarginPercentage) }}</strong><span>{{
                  i18n.t('proposals.plannedMarginPercent')
                }}</span>
                <div class="progress"><span [style.width.%]="gaugeWidth()"></span></div>
              </div>
              @if (draft.discountPercent >= 20 || totals().plannedMarginPercentage < 20) {
                <div class="notice notice--amber">
                  <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i
                  >{{ i18n.t('proposals.discountWarning') }}
                </div>
              }
            </section>
            <section class="card">
              <h3>{{ i18n.t('proposals.managerExpectation') }}</h3>
              <p class="small">{{ i18n.t('pulse.managerExpectationHint') }}</p>
              <label class="field"
                ><span>{{ i18n.t('proposals.expectedAmount') }}</span
                ><input type="number" min="0" [(ngModel)]="draft.managerExpectedAmount" /></label
              ><label class="field"
                ><span>{{ i18n.t('proposals.expectedDate') }}</span
                ><input type="date" [(ngModel)]="draft.expectedReceiptDate"
              /></label>
            </section>
            <div class="notice">
              <i class="fa-solid fa-language" aria-hidden="true"></i
              ><span>{{ i18n.t('common.noCurrencyConversion') }}</span>
            </div>
          </aside>
        </div>
      </div>
    } @else {
      <app-empty-state
        [title]="i18n.t('common.notFound')"
        route="/proposals"
        [actionLabel]="i18n.t('common.back')"
      />
    }
  `,
})
export class ProposalEditorComponent {
  readonly draft: Proposal;
  submitted = false;
  private readonly routeId = inject(ActivatedRoute).snapshot.paramMap.get('id') ?? 'new';
  private readonly isNew = this.routeId === 'new';
  constructor(
    readonly i18n: I18nService,
    readonly format: FormatService,
    readonly store: AppStore,
    readonly session: SessionService,
    private readonly workflow: WorkflowService,
    private readonly ui: UiService,
    private readonly router: Router,
    private readonly route: ActivatedRoute,
  ) {
    const existing = store.proposals.get(this.routeId);
    const clientId =
      route.snapshot.queryParamMap.get('client') ?? store.state().clients[0]?.id ?? '';
    this.draft = existing ? existing : workflow.newProposal(clientId, i18n.shortLanguage());
  }
  found(): boolean {
    return this.isNew || Boolean(this.store.proposals.get(this.routeId));
  }
  localizedValue(value: LocalizedText): string {
    const language = this.i18n.shortLanguage();
    const fallback = language === 'ru' ? 'en' : 'ru';
    return value[language] || value[fallback];
  }
  setLocalizedValue(value: LocalizedText, input: string): void {
    const language = this.i18n.shortLanguage();
    const fallback = language === 'ru' ? 'en' : 'ru';
    value[language] = input;
    if (!value[fallback]) value[fallback] = input;
  }
  totals(): ReturnType<typeof calculateProposalTotals> {
    return calculateProposalTotals(this.draft);
  }
  gaugeWidth(): number {
    return Math.max(0, Math.min(100, this.totals().plannedMarginPercentage));
  }
  validDiscount(): boolean {
    return this.draft.discountPercent >= 0 && this.draft.discountPercent <= 90;
  }
  validItems(): boolean {
    return (
      this.draft.items.length > 0 &&
      this.draft.items.every(
        (item) =>
          Boolean(this.localizedValue(item.service).trim()) &&
          item.quantity > 0 &&
          item.unitPrice > 0 &&
          item.unitCost >= 0,
      )
    );
  }
  valid(): boolean {
    return (
      Boolean(this.localizedValue(this.draft.title).trim()) &&
      Boolean(this.draft.clientId) &&
      this.validDiscount() &&
      this.validItems()
    );
  }
  addItem(): void {
    this.draft.items.push(this.workflow.newProposalItem(this.draft, this.i18n.shortLanguage()));
  }
  removeItem(id: string): void {
    this.ui.confirm('common.removeItemConfirm', () => {
      this.draft.items = this.draft.items.filter((item) => item.id !== id);
    });
  }
  save(notify = true): boolean {
    this.submitted = true;
    if (!this.valid()) {
      this.ui.notify(this.i18n.t('common.formInvalid'));
      return false;
    }
    this.workflow.saveProposal(this.draft);
    if (notify) this.ui.notify(this.i18n.t('proposals.saved'));
    if (this.isNew) void this.router.navigate(['/proposals', this.draft.id], { replaceUrl: true });
    return true;
  }
  approve(): void {
    if (!this.save(false)) return;
    try {
      this.workflow.approveProposal(this.draft.id);
      this.draft.status = 'approved';
      this.draft.approvedAt = '2026-05-14T12:00:00Z';
      this.ui.notify(this.i18n.t('proposals.approved'));
    } catch {
      this.ui.notify(this.i18n.t('common.invalidOperation'));
    }
  }
  createContract(): void {
    try {
      const contract = this.workflow.createContract(this.draft.id);
      this.draft.status = 'converted';
      this.ui.notify(this.i18n.t('proposals.contractCreated'));
      void this.router.navigate(['/contracts', contract.id]);
    } catch {
      this.ui.notify(this.i18n.t('common.invalidOperation'));
    }
  }
  contractId(): string | undefined {
    return this.store.state().contracts.find((contract) => contract.proposalId === this.draft.id)
      ?.id;
  }
}
