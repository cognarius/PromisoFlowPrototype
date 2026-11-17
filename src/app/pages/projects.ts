import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DEMO_TODAY } from '../core/demo-data';
import { calculateProjectMargin } from '../core/finance';
import { FormatService } from '../core/format';
import { I18nService } from '../core/i18n';
import { Cost, Obligation, Project } from '../core/models';
import { SessionService } from '../core/session';
import { AppStore } from '../core/store';
import { TranslationKey, translations } from '../core/translations';
import { UiService } from '../core/ui';
import { WorkflowService } from '../core/workflow';
import { EmptyStateComponent, LifecycleComponent, StatusChipComponent } from '../shared/components';

function obligationKindKey(kind: string): TranslationKey {
  const key = `obligations.kind.${kind}`;
  return key in translations ? (key as TranslationKey) : 'common.obligation';
}

@Component({
  selector: 'app-projects',
  imports: [RouterLink, StatusChipComponent, EmptyStateComponent],
  template: `<section class="card">
    <div class="card__header">
      <div>
        <h2>{{ i18n.t('projects.list') }}</h2>
        <p class="small">{{ i18n.t('projects.lifecycle') }}</p>
      </div>
      <a class="btn" routerLink="/contracts">{{ i18n.t('nav.contracts') }}</a>
    </div>
    <div class="project-grid">
      @for (project of store.state().projects; track project.id) {
        <a class="project-card" [routerLink]="['/projects', project.id]"
          ><div class="card__header">
            <span class="chip"
              ><i class="fa-solid fa-diagram-project" aria-hidden="true"></i
              >{{ clientName(project.clientId) }}</span
            ><app-status-chip [status]="project.status" />
          </div>
          <h2>{{ i18n.text(project.name) }}</h2>
          <p>{{ format.date(project.startDate) }} — {{ format.date(project.dueDate) }}</p>
          <div class="progress"><span [style.width.%]="progress(project.id)"></span></div>
          <small>{{ i18n.t('projects.deliveryProgress') }} · {{ progress(project.id) }}%</small>
          <div class="project-card__footer">
            <span
              >{{ obligationsCount(project.id) }}
              {{ i18n.t('nav.obligations').toLowerCase() }}</span
            ><i class="fa-solid fa-arrow-right" aria-hidden="true"></i></div
        ></a>
      } @empty {
        <app-empty-state [title]="i18n.t('projects.empty')" />
      }
    </div>
  </section>`,
})
export class ProjectsComponent {
  constructor(
    readonly i18n: I18nService,
    readonly format: FormatService,
    readonly store: AppStore,
  ) {}
  clientName(id: string): string {
    const client = this.store.state().clients.find((item) => item.id === id);
    return client ? this.i18n.text(client.name) : id;
  }
  obligationsCount(id: string): number {
    return this.store.state().obligations.filter((obligation) => obligation.projectId === id)
      .length;
  }
  progress(id: string): number {
    const obligations = this.store
      .state()
      .obligations.filter(
        (obligation) => obligation.projectId === id && obligation.kind !== 'payment',
      );
    return obligations.length
      ? Math.round(
          obligations.reduce((sum, obligation) => sum + obligation.progress, 0) /
            obligations.length,
        )
      : 0;
  }
}

@Component({
  selector: 'app-project-detail',
  imports: [FormsModule, RouterLink, StatusChipComponent, EmptyStateComponent, LifecycleComponent],
  template: `
    @if (project(); as project) {
      <div class="page-stack">
        <section class="card">
          <div class="card__header">
            <div>
              <span class="eyebrow">{{ i18n.t('deals.outcomeCycle') }}</span>
              <h2>{{ i18n.text(project.name) }}</h2>
              <p class="small">
                {{ clientName() }} · {{ format.date(project.startDate) }} —
                {{ format.date(project.dueDate) }}
              </p>
            </div>
            <div class="button-row">
              <app-status-chip [status]="project.status" /><a
                class="btn"
                [routerLink]="['/contracts', project.contractId]"
                >{{ i18n.t('common.viewContract') }}</a
              >
            </div>
          </div>
          <app-lifecycle [current]="lifecycleStage()" />
        </section>
        <div class="two-columns two-columns--wide-left">
          <div class="page-stack">
            <section class="card">
              <div class="card__header">
                <div>
                  <h2>{{ i18n.t('projects.obligations') }}</h2>
                  <p class="small">{{ i18n.t('projects.paymentAuto') }}</p>
                </div>
                <a class="btn btn--small" routerLink="/obligations">{{
                  i18n.t('common.viewAll')
                }}</a>
              </div>
              @for (obligation of obligations(); track obligation.id) {
                <article
                  class="obligation-row"
                  [class.obligation-row--pending]="obligation.confirmationStatus === 'pending'"
                  [class.focused]="focusId === obligation.id"
                >
                  <i
                    class="fa-solid"
                    [class.fa-circle-check]="obligation.status === 'completed'"
                    [class.fa-circle-exclamation]="
                      obligation.status === 'overdue' || obligation.status === 'blocked'
                    "
                    [class.fa-clock]="
                      obligation.status !== 'completed' &&
                      obligation.status !== 'overdue' &&
                      obligation.status !== 'blocked'
                    "
                    aria-hidden="true"
                  ></i>
                  <div>
                    <h3>{{ i18n.text(obligation.title) }}</h3>
                    <p>
                      {{ i18n.t(obligationKind(obligation.kind)) }} ·
                      {{ format.date(obligation.dueDate) }} · {{ userName(obligation.ownerId) }}
                    </p>
                    <small
                      >{{ i18n.t('projects.sourceTerms') }}:
                      {{ i18n.text(obligation.source) }}</small
                    >
                    <div class="progress"><span [style.width.%]="obligation.progress"></span></div>
                  </div>
                  <app-status-chip [status]="obligation.status" />
                  <div class="button-column">
                    @if (
                      obligation.kind !== 'payment' &&
                      obligation.status !== 'completed' &&
                      session.canManageDelivery()
                    ) {
                      <button class="btn btn--small btn--primary" (click)="complete(obligation.id)">
                        {{ i18n.t('projects.complete') }}
                      </button>
                    }
                    @if (
                      obligation.kind === 'delivery' &&
                      obligation.status === 'completed' &&
                      !obligation.invoiceId &&
                      session.canManageFinance()
                    ) {
                      <button class="btn btn--small" (click)="createClosing(obligation.id)">
                        {{ i18n.t('projects.createClosing') }}
                      </button>
                    }
                    @if (obligation.invoiceId) {
                      <a
                        class="btn btn--small"
                        routerLink="/money"
                        [queryParams]="{ invoice: obligation.invoiceId }"
                        >{{ i18n.t('common.viewInvoice') }}</a
                      >
                    }
                  </div>
                </article>
              }
            </section>
            <section class="card">
              <div class="card__header">
                <h2>{{ i18n.t('projects.financialCalendar') }}</h2>
                <span class="small">{{ i18n.t('common.confirmationRequired') }}</span>
              </div>
              @for (event of financialEvents(); track event.id) {
                <div class="calendar-row">
                  <span
                    class="status-dot"
                    [class.status-dot--green]="event.status === 'paid'"
                    [class.status-dot--red]="event.status === 'overdue'"
                  ></span
                  ><strong>{{ format.date(event.dueDate) }}</strong
                  ><span>{{ obligationTitle(event.obligationId) }}</span>
                  @if (session.canSeeFinance()) {
                    <span class="money">{{ format.money(event.amount) }}</span>
                  }
                  <app-status-chip [status]="event.status" /><app-status-chip
                    [status]="event.confirmationStatus"
                  />
                </div>
              }
            </section>
            <section class="card">
              <div class="card__header">
                <h2>{{ i18n.t('projects.documents') }}</h2>
                <a class="btn btn--small" routerLink="/documents">{{ i18n.t('nav.documents') }}</a>
              </div>
              @for (document of documents(); track document.id) {
                <a
                  class="linked-row"
                  routerLink="/documents"
                  [queryParams]="{ selected: document.id }"
                  ><span
                    ><strong>{{ i18n.text(document.title) }}</strong
                    ><small
                      >{{ i18n.t('common.version') }} {{ document.version }} ·
                      {{ format.date(document.createdAt) }}</small
                    ></span
                  ><app-status-chip [status]="document.status"
                /></a>
              } @empty {
                <p class="muted">{{ i18n.t('common.empty') }}</p>
              }
            </section>
          </div>
          <aside class="page-stack">
            @if (session.canSeeFinance()) {
              <section class="card calculation-card">
                <div class="card__header">
                  <h2>{{ i18n.t('projects.margin') }}</h2>
                  <a
                    class="btn btn--small"
                    routerLink="/margins"
                    [queryParams]="{ project: project.id }"
                    >{{ i18n.t('common.details') }}</a
                  >
                </div>
                @if (margin(); as margin) {
                  <div class="margin-gauge">
                    <strong [class.warning]="margin.marginVariance < 0">{{
                      format.percent(margin.actualMarginPercentage)
                    }}</strong><span>{{ i18n.t('margins.actualMargin') }}</span>
                  </div>
                  <dl class="finance-list">
                    <div>
                      <dt>{{ i18n.t('common.revenue') }}</dt>
                      <dd>{{ format.money(margin.actualRevenue) }}</dd>
                    </div>
                    <div>
                      <dt>{{ i18n.t('proposals.plannedCosts') }}</dt>
                      <dd>{{ format.money(margin.plannedDirectCosts) }}</dd>
                    </div>
                    <div>
                      <dt>{{ i18n.t('margins.actualCosts') }}</dt>
                      <dd [class.warning]="margin.actualCosts > margin.plannedDirectCosts">
                        {{ format.money(margin.actualCosts) }}
                      </dd>
                    </div>
                    <div>
                      <dt>{{ i18n.t('proposals.plannedMargin') }}</dt>
                      <dd>{{ format.money(margin.plannedMargin) }}</dd>
                    </div>
                    <div class="finance-list__total">
                      <dt>{{ i18n.t('margins.variance') }}</dt>
                      <dd
                        [class.negative]="margin.marginVariance < 0"
                        [class.positive]="margin.marginVariance > 0"
                      >
                        {{ varianceSymbol(margin.marginVariance)
                        }}{{ format.money(margin.marginVariance) }}
                      </dd>
                    </div>
                    <div>
                      <dt>{{ i18n.t('margins.cashReceived') }}</dt>
                      <dd>{{ format.money(margin.cashReceived) }}</dd>
                    </div>
                  </dl>
                  <p class="small">{{ i18n.t('margins.cashNote') }}</p>
                }
              </section>
              @if (session.canManageFinance()) {
                <section class="card">
                  <h2>{{ i18n.t('projects.addCost') }}</h2>
                  <div class="form-grid">
                    <label class="field full"
                      ><span>{{ i18n.t('common.description') }} *</span
                      ><input
                        [(ngModel)]="costForm.description"
                        [placeholder]="i18n.t('projects.costDescriptionPlaceholder')" /></label
                    ><label class="field"
                      ><span>{{ i18n.t('common.cost') }}</span
                      ><select [(ngModel)]="costForm.category">
                        @for (category of costCategories; track category) {
                          <option [value]="category">{{ i18n.t(costKey(category)) }}</option>
                        }
                      </select></label
                    ><label class="field"
                      ><span>{{ i18n.t('common.amount') }} *</span
                      ><input type="number" min="0" [(ngModel)]="costForm.amount" /></label
                    ><label class="field full"
                      ><span>{{ i18n.t('common.source') }} *</span
                      ><input
                        [(ngModel)]="costForm.source"
                        [placeholder]="i18n.t('projects.costSourcePlaceholder')"
                    /></label>
                  </div>
                  @if (
                    costSubmitted &&
                    (!costForm.description || !costForm.source || costForm.amount <= 0)
                  ) {
                    <p class="field-error">{{ i18n.t('common.formInvalid') }}</p>
                  }
                  <button class="btn btn--primary" (click)="addCost()">
                    {{ i18n.t('projects.addCost') }}
                  </button>
                </section>
              }
            } @else {
              <div class="notice">
                <i class="fa-solid fa-lock" aria-hidden="true"></i
                >{{ i18n.t('common.noMarginForRole') }}
              </div>
            }
            <section class="card">
              <h2>{{ i18n.t('common.history') }}</h2>
              <div class="timeline">
                @for (activity of activities(); track activity.id) {
                  <div>
                    <span class="timeline__dot"></span>
                    <p>{{ i18n.text(activity.action) }}</p>
                    <small
                      >{{ format.dateTime(activity.at) }} · {{ userName(activity.actorId) }}</small
                    >
                  </div>
                } @empty {
                  <p class="muted">{{ i18n.t('common.empty') }}</p>
                }
              </div>
            </section>
          </aside>
        </div>
      </div>
    } @else {
      <app-empty-state
        [title]="i18n.t('common.notFound')"
        route="/projects"
        [actionLabel]="i18n.t('common.back')"
      />
    }
  `,
})
export class ProjectDetailComponent {
  private readonly id = inject(ActivatedRoute).snapshot.paramMap.get('id') ?? '';
  readonly focusId = inject(ActivatedRoute).snapshot.queryParamMap.get('obligation') ?? '';
  readonly costCategories: Cost['category'][] = [
    'labor',
    'rework',
    'license',
    'contractor',
    'other',
  ];
  costForm: { description: string; category: Cost['category']; amount: number; source: string } = {
    description: '',
    category: 'labor',
    amount: 0,
    source: '',
  };
  costSubmitted = false;
  constructor(
    readonly i18n: I18nService,
    readonly format: FormatService,
    readonly store: AppStore,
    readonly session: SessionService,
    private readonly workflow: WorkflowService,
    private readonly ui: UiService,
    private readonly router: Router,
    private readonly route: ActivatedRoute,
  ) {}
  project(): Project | undefined {
    return this.store.state().projects.find((project) => project.id === this.id);
  }
  clientName(): string {
    const client = this.store.state().clients.find((item) => item.id === this.project()?.clientId);
    return client ? this.i18n.text(client.name) : '';
  }
  obligations(): Obligation[] {
    return this.store.state().obligations.filter((obligation) => obligation.projectId === this.id);
  }
  financialEvents() {
    return this.store.state().financialEvents.filter((event) => event.projectId === this.id);
  }
  documents() {
    return this.store
      .state()
      .documents.filter(
        (document) =>
          document.projectId === this.id &&
          (this.session.role() !== 'client' || !document.internal),
      );
  }
  margin(): ReturnType<typeof calculateProjectMargin> {
    return calculateProjectMargin(this.store.state(), this.id);
  }
  userName(id: string): string {
    return this.store.state().users.find((user) => user.id === id)?.name ?? id;
  }
  obligationKind(kind: string): TranslationKey {
    return obligationKindKey(kind);
  }
  costKey(category: string): TranslationKey {
    const key = `cost.${category}`;
    return key in translations ? (key as TranslationKey) : 'cost.other';
  }
  obligationTitle(id?: string): string {
    const obligation = this.store.state().obligations.find((item) => item.id === id);
    return obligation ? this.i18n.text(obligation.title) : '';
  }
  lifecycleStage(): number {
    const invoices = this.store.state().invoices.filter((invoice) => invoice.projectId === this.id);
    if (invoices.some((invoice) => invoice.status === 'paid')) return 6;
    if (invoices.length) return 4;
    if (this.documents().some((document) => document.kind === 'act')) return 3;
    return 2;
  }
  varianceSymbol(value: number): string {
    return value > 0 ? '↑ ' : value < 0 ? '↓ ' : '— ';
  }
  complete(id: string): void {
    try {
      this.workflow.completeObligation(id, this.workflow.actorForRole(this.session.role()));
      this.ui.notify(this.i18n.t('projects.completed'));
    } catch {
      this.ui.notify(this.i18n.t('common.invalidOperation'));
    }
  }
  createClosing(id: string): void {
    try {
      const result = this.workflow.createClosingDocuments(
        id,
        this.workflow.actorForRole(this.session.role()),
      );
      this.ui.notify(this.i18n.t('projects.closingCreated'));
      void this.router.navigate(['/money'], { queryParams: { invoice: result.invoice.id } });
    } catch {
      this.ui.notify(this.i18n.t('common.invalidOperation'));
    }
  }
  addCost(): void {
    this.costSubmitted = true;
    if (!this.costForm.description || !this.costForm.source || this.costForm.amount <= 0) return;
    this.workflow.addCost({
      ...this.costForm,
      projectId: this.id,
      language: this.i18n.shortLanguage(),
      actorId: this.workflow.actorForRole(this.session.role()),
    });
    this.costForm = { description: '', category: 'labor', amount: 0, source: '' };
    this.costSubmitted = false;
    this.ui.notify(this.i18n.t('projects.costAdded'));
  }
  activities() {
    const state = this.store.state();
    const ids = new Set([
      this.id,
      ...this.obligations().map((item) => item.id),
      ...this.documents().map((item) => item.id),
    ]);
    return state.activities
      .filter(
        (activity) =>
          ids.has(activity.entityId) && (this.session.role() !== 'client' || !activity.internal),
      )
      .slice()
      .reverse();
  }
}

@Component({
  selector: 'app-obligations',
  imports: [RouterLink, StatusChipComponent, EmptyStateComponent],
  template: `<section class="card">
    <div class="card__header">
      <div>
        <h2>{{ i18n.t('obligations.registry') }}</h2>
        <p class="small">{{ i18n.t('obligations.acceptanceRisk') }}</p>
      </div>
    </div>
    <div class="filter-row">
      <button class="chip" [class.filter-active]="filter === 'all'" (click)="filter = 'all'">
        {{ i18n.t('obligations.filterAll') }}</button><button
        class="chip"
        [class.filter-active]="filter === 'overdue'"
        (click)="filter = 'overdue'"
      >
        {{ i18n.t('obligations.onlyOverdue') }}</button
      ><button
        class="chip"
        [class.filter-active]="filter === 'blocked'"
        (click)="filter = 'blocked'"
      >
        {{ i18n.t('obligations.onlyBlocked') }}
      </button>
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>{{ i18n.t('common.obligation') }}</th>
            <th>{{ i18n.t('common.project') }}</th>
            <th>{{ i18n.t('common.dueDate') }}</th>
            <th>{{ i18n.t('common.owner') }}</th>
            <th>{{ i18n.t('common.progress') }}</th>
            <th>{{ i18n.t('common.status') }}</th>
            <th>{{ i18n.t('common.actions') }}</th>
          </tr>
        </thead>
        <tbody>
          @for (obligation of obligations(); track obligation.id) {
            <tr [class.focused]="focusId === obligation.id">
              <td>
                <strong>{{ i18n.text(obligation.title) }}</strong><small
                  >{{ i18n.t(kindKey(obligation.kind)) }} ·
                  {{ i18n.text(obligation.source) }}</small
                >
              </td>
              <td>
                <a [routerLink]="['/projects', obligation.projectId]">{{
                  projectName(obligation.projectId)
                }}</a>
              </td>
              <td>{{ format.date(obligation.dueDate) }}</td>
              <td>{{ userName(obligation.ownerId) }}</td>
              <td>
                <div class="progress"><span [style.width.%]="obligation.progress"></span></div>
                <small>{{ obligation.progress }}%</small>
              </td>
              <td><app-status-chip [status]="effectiveStatus(obligation)" /></td>
              <td>
                <div class="button-row">
                  @if (
                    obligation.kind !== 'payment' &&
                    obligation.status !== 'completed' &&
                    session.canManageDelivery()
                  ) {
                    <button class="btn btn--small" (click)="complete(obligation.id)">
                      {{ i18n.t('projects.complete') }}
                    </button>
                  }
                  @if (obligation.invoiceId) {
                    <a
                      class="btn btn--small"
                      routerLink="/money"
                      [queryParams]="{ invoice: obligation.invoiceId }"
                      >{{ i18n.t('common.invoice') }}</a
                    >
                  }
                </div>
              </td>
            </tr>
          } @empty {
            <tr>
              <td colspan="7"><app-empty-state [title]="i18n.t('obligations.empty')" /></td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  </section>`,
})
export class ObligationsComponent {
  filter = 'all';
  readonly focusId = inject(ActivatedRoute).snapshot.queryParamMap.get('focus') ?? '';
  constructor(
    readonly i18n: I18nService,
    readonly format: FormatService,
    readonly store: AppStore,
    readonly session: SessionService,
    private readonly workflow: WorkflowService,
    private readonly ui: UiService,
    private readonly route: ActivatedRoute,
  ) {}
  obligations(): Obligation[] {
    return this.store
      .state()
      .obligations.filter(
        (obligation) =>
          this.filter === 'all' ||
          (this.filter === 'overdue' && this.effectiveStatus(obligation) === 'overdue') ||
          (this.filter === 'blocked' &&
            ['blocked', 'waiting_confirmation'].includes(obligation.status)),
      );
  }
  effectiveStatus(obligation: Obligation): string {
    return obligation.status !== 'completed' &&
      obligation.kind !== 'payment' &&
      obligation.dueDate < DEMO_TODAY
      ? 'overdue'
      : obligation.status;
  }
  kindKey(kind: string): TranslationKey {
    return obligationKindKey(kind);
  }
  projectName(id: string): string {
    const project = this.store.state().projects.find((item) => item.id === id);
    return project ? this.i18n.text(project.name) : id;
  }
  userName(id: string): string {
    return this.store.state().users.find((user) => user.id === id)?.name ?? id;
  }
  complete(id: string): void {
    try {
      this.workflow.completeObligation(id, this.workflow.actorForRole(this.session.role()));
      this.ui.notify(this.i18n.t('projects.completed'));
    } catch {
      this.ui.notify(this.i18n.t('common.invalidOperation'));
    }
  }
}
