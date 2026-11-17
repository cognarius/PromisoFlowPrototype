import { Component, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ActionCenterService, ActionView } from '../core/actions';
import { ActionExecutorService } from '../core/action-executor';
import { DEMO_TODAY } from '../core/demo-data';
import { calculateProjectMargin, isInvoiceOverdue } from '../core/finance';
import { FormatService } from '../core/format';
import { I18nService } from '../core/i18n';
import {
  actToInvoiceMeasurements,
  averageActToInvoiceDays,
  cashCalendar,
  dashboardNumbers,
  daysBetween,
  metricCompleteness,
  overdueObligations,
  portfolioMargins,
} from '../core/metrics';
import { AppStore } from '../core/store';
import { TranslationKey, translations } from '../core/translations';
import { UiService } from '../core/ui';
import { WorkflowService } from '../core/workflow';
import { SessionService } from '../core/session';
import { EmptyStateComponent, MetricCardComponent, statusKey } from '../shared/components';

interface SourceLink {
  label: string;
  route: string;
  queryParams?: Record<string, string>;
}

@Component({
  selector: 'app-pulse',
  imports: [RouterLink, MetricCardComponent, EmptyStateComponent],
  template: `
    <div class="page-stack">
      <div class="notice notice--green">
        <i class="fa-solid fa-link" aria-hidden="true"></i
        ><span>{{ i18n.t('pulse.moneyNotRevenue') }} · {{ i18n.t('common.demoData') }}</span>
      </div>
      <section class="metric-grid" aria-label="KPI">
        <app-metric-card
          [label]="i18n.t('pulse.forecast')"
          [value]="format.money(numbers().forecast, true)"
          [hint]="i18n.t('pulse.scheduled')"
          [period]="i18n.t('common.period30')"
          [selected]="selectedMetric() === 'forecast'"
          [interactive]="true"
          (inspect)="inspect('forecast')"
        />
        <app-metric-card
          [label]="i18n.t('pulse.overdueDebt')"
          [value]="format.money(numbers().overdue, true)"
          [hint]="i18n.t('pulse.invoicesCount', { count: numbers().overdueInvoiceCount })"
          [period]="i18n.t('common.asOf')"
          tone="negative"
          [selected]="selectedMetric() === 'overdue'"
          [interactive]="true"
          (inspect)="inspect('overdue')"
        />
        @if (session.canSeeFinance()) {
          <app-metric-card
            [label]="i18n.t('pulse.portfolioMargin')"
            [value]="format.percent(margins().actualPercentage)"
            [hint]="
              i18n.t('pulse.planVariance', {
                plan: format.percent(margins().plannedPercentage),
                variance: format.number(
                  margins().actualPercentage - margins().plannedPercentage,
                  1
                ),
              })
            "
            [period]="i18n.t('common.asOf')"
            [tone]="margins().variance < 0 ? 'warning' : 'positive'"
            [selected]="selectedMetric() === 'margin'"
            [interactive]="true"
            (inspect)="inspect('margin')"
          />
        }
        <app-metric-card
          [label]="i18n.t('pulse.actToInvoice')"
          [value]="format.days(actToInvoice())"
          [hint]="i18n.t('pulse.invoiceTarget')"
          [period]="i18n.t('common.asOf')"
          tone="positive"
          [selected]="selectedMetric() === 'actToInvoice'"
          [interactive]="true"
          (inspect)="inspect('actToInvoice')"
        />
      </section>

      @if (selectedMetric()) {
        <section class="card source-panel">
          <div class="card__header">
            <div>
              <span class="eyebrow">{{ i18n.t('common.metricSource') }}</span>
              <h2>{{ metricTitle() }}</h2>
            </div>
            <button
              type="button"
              class="icon-button"
              (click)="selectedMetric.set(null)"
              [attr.aria-label]="i18n.t('common.closeSources')"
            >
              <i class="fa-solid fa-xmark" aria-hidden="true"></i>
            </button>
          </div>
          <div class="source-grid">
            <div>
              <strong>{{ i18n.t('common.definition') }}</strong>
              <p>{{ i18n.t(metricKey('definition')) }}</p>
            </div>
            <div>
              <strong>{{ i18n.t('common.source') }}</strong>
              <p>{{ i18n.t(metricKey('source')) }}</p>
            </div>
            <div>
              <strong>{{ i18n.t('common.lastUpdated') }}</strong>
              <p>{{ format.dateTime(demoNow) }}</p>
            </div>
            <div>
              <strong>{{ i18n.t('common.dataCompleteness') }}</strong>
              <p class="mono">{{ completeness() }}%</p>
              <div class="progress"><span [style.width.%]="completeness()"></span></div>
            </div>
          </div>
          <h3>{{ i18n.t('common.objects') }}</h3>
          <div class="source-links">
            @for (source of metricSources(); track source.route) {
              <a [routerLink]="source.route" [queryParams]="source.queryParams"
                ><i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i
                >{{ source.label }}</a
              >
            } @empty {
              <span class="muted">{{ i18n.t('common.empty') }}</span>
            }
          </div>
        </section>
      }

      <div class="dashboard-grid">
        <section class="card action-card">
          <div class="card__header">
            <div>
              <h2>{{ i18n.t('pulse.queue') }}</h2>
              <p class="small">{{ i18n.t('page.actions.subtitle') }}</p>
            </div>
            <span class="chip chip--green">{{
              i18n.t('pulse.potential', { value: format.money(potential(), true) })
            }}</span>
          </div>
          <div class="action-list">
            @for (action of actions(); track action.id; let index = $index) {
              <article class="action-row">
                <span class="action-rank">{{ pad(index + 1) }}</span>
                <div class="action-main">
                  <h3>{{ action.title }}</h3>
                  <p>{{ action.reason }}</p>
                  <small
                    >{{ action.owner }} ·
                    <a [routerLink]="action.route" [queryParams]="action.queryParams">{{
                      i18n.t('common.linkedObject')
                    }}</a></small
                  >
                </div>
                <div class="action-effect">
                  <strong
                    [class.negative]="action.type === 'remind_payment'"
                    [class.warning]="action.type === 'review_cost'"
                    >{{
                      action.expectedEffect
                        ? format.money(action.expectedEffect)
                        : '↓ ' + i18n.t('common.risk')
                    }}</strong><small>{{ action.expectedEffectText }}</small>
                </div>
                <button type="button" class="btn btn--small" (click)="executor.execute(action)">
                  {{ actionLabel(action) }}
                </button>
              </article>
            } @empty {
              <app-empty-state
                [title]="i18n.t('pulse.queueEmpty')"
                icon="fa-solid fa-circle-check"
              />
            }
          </div>
          <a class="btn btn--ghost" routerLink="/actions"
            >{{ i18n.t('common.viewAll') }}
            <i class="fa-solid fa-arrow-right" aria-hidden="true"></i
          ></a>
        </section>

        <section class="card cash-calendar">
          <div class="card__header">
            <div>
              <h2>{{ i18n.t('pulse.cashCalendar') }}</h2>
              <p class="small">{{ i18n.t('common.period30') }}</p>
            </div>
            <a class="btn btn--small" routerLink="/money">{{ i18n.t('nav.money') }}</a>
          </div>
          <div class="calendar-legend">
            <span><i class="legend-dot legend-dot--green"></i>{{ i18n.t('pulse.scheduled') }}</span
            ><span
              ><i class="legend-dot legend-dot--track"></i
              >{{ i18n.t('pulse.actualReceipts') }}</span
            >
          </div>
          <div class="cash-bars">
            @for (bucket of buckets(); track bucket.start) {
              <div class="cash-bar">
                <div class="cash-bar__columns" [attr.aria-label]="format.date(bucket.start)">
                  <span
                    class="cash-bar__scheduled"
                    [style.height.%]="barHeight(bucket.scheduled)"
                    [title]="format.money(bucket.scheduled)"
                  ></span>
                  <span
                    class="cash-bar__actual"
                    [style.height.%]="barHeight(bucket.received)"
                    [title]="format.money(bucket.received)"
                  ></span>
                </div>
                <strong>{{ format.date(bucket.start, { day: 'numeric', month: 'short' }) }}</strong>
                <small>{{ format.money(bucket.scheduled, true) }}</small>
              </div>
            }
          </div>
          <div class="notice">
            <i class="fa-solid fa-circle-info" aria-hidden="true"></i
            ><span>{{ i18n.t('pulse.calendarBasis') }}</span>
          </div>
          <div class="calendar-comparison">
            <button type="button" (click)="inspect('manager')">
              <span>{{ i18n.t('pulse.managerExpectation') }}</span><strong>{{
                format.money(numbers().manager)
              }}</strong
              ><small>{{ i18n.t('pulse.managerExpectationHint') }}</small>
            </button>
            <button type="button" (click)="inspect('forecast')">
              <span>{{ i18n.t('pulse.scheduled') }}</span><strong>{{
                format.money(numbers().forecast)
              }}</strong
              ><small>{{ i18n.t('common.period30') }}</small>
            </button>
            <button type="button" (click)="inspect('cash')">
              <span>{{ i18n.t('pulse.actualReceipts') }}</span><strong>{{
                format.money(numbers().cash)
              }}</strong
              ><small>{{ i18n.t('pulse.cashExplanation') }}</small>
            </button>
          </div>
        </section>
      </div>

      <section class="metric-grid metric-grid--three">
        <app-metric-card
          [label]="i18n.t('pulse.cashReceived')"
          [value]="format.money(numbers().cash, true)"
          [period]="i18n.t('common.asOf')"
          [selected]="selectedMetric() === 'cash'"
          [interactive]="true"
          (inspect)="inspect('cash')"
        />
        <app-metric-card
          [label]="i18n.t('pulse.accountsReceivable')"
          [value]="format.money(numbers().receivable, true)"
          [period]="i18n.t('common.asOf')"
          [selected]="selectedMetric() === 'receivable'"
          [interactive]="true"
          (inspect)="inspect('receivable')"
        />
        <app-metric-card
          [label]="i18n.t('pulse.overdueObligations')"
          [value]="format.number(numbers().overdueObligationCount)"
          [period]="i18n.t('common.asOf')"
          [tone]="numbers().overdueObligationCount ? 'warning' : 'positive'"
          [selected]="selectedMetric() === 'overdueObligations'"
          [interactive]="true"
          (inspect)="inspect('overdueObligations')"
        />
      </section>
      <div class="button-row">
        <button type="button" class="btn" data-testid="reset-demo" (click)="resetDemo()">
          <i class="fa-solid fa-rotate-left" aria-hidden="true"></i
          >{{ i18n.t('common.resetDemo') }}</button
        ><span class="small">{{ i18n.t('common.noCurrencyConversion') }}</span>
      </div>
    </div>
  `,
})
export class PulseComponent {
  readonly demoNow = '2026-05-14T12:00:00Z';
  readonly selectedMetric = signal<string | null>(null);
  constructor(
    readonly i18n: I18nService,
    readonly format: FormatService,
    readonly store: AppStore,
    readonly session: SessionService,
    readonly executor: ActionExecutorService,
    private readonly actionCenter: ActionCenterService,
    private readonly workflow: WorkflowService,
    private readonly ui: UiService,
  ) {}

  numbers(): ReturnType<typeof dashboardNumbers> {
    return dashboardNumbers(this.store.state());
  }
  margins(): ReturnType<typeof portfolioMargins> {
    return portfolioMargins(this.store.state());
  }
  buckets(): ReturnType<typeof cashCalendar> {
    return cashCalendar(this.store.state());
  }
  actions(): ActionView[] {
    return this.actionCenter.views(this.store.state()).slice(0, 5);
  }
  potential(): number {
    return this.actions().reduce((sum, action) => sum + action.expectedEffect, 0);
  }
  barHeight(value: number): number {
    const maximum = Math.max(
      1,
      ...this.buckets().flatMap((bucket) => [bucket.scheduled, bucket.received]),
    );
    return value ? Math.max(5, (value / maximum) * 100) : 2;
  }
  pad(value: number): string {
    return String(value).padStart(2, '0');
  }
  actionLabel(action: ActionView): string {
    const key = `actions.label.${action.type}`;
    return this.i18n.t(key in translations ? (key as TranslationKey) : 'actions.perform');
  }
  inspect(metric: string): void {
    this.selectedMetric.update((current) => (current === metric ? null : metric));
  }
  metricKey(field: 'definition' | 'source'): TranslationKey {
    const key = `metric.${this.selectedMetric()}.${field}`;
    return key in translations ? (key as TranslationKey) : 'common.missingTranslation';
  }
  metricTitle(): string {
    const keys: Record<string, TranslationKey> = {
      forecast: 'pulse.forecast',
      overdue: 'pulse.overdueDebt',
      margin: 'pulse.portfolioMargin',
      cash: 'pulse.cashReceived',
      receivable: 'pulse.accountsReceivable',
      manager: 'pulse.managerExpectation',
      actToInvoice: 'pulse.actToInvoice',
      overdueObligations: 'pulse.overdueObligations',
    };
    return this.i18n.t(keys[this.selectedMetric() ?? ''] ?? 'common.metricSource');
  }
  completeness(): number {
    return metricCompleteness(this.store.state(), this.selectedMetric() ?? 'forecast');
  }
  metricSources(): SourceLink[] {
    const state = this.store.state();
    switch (this.selectedMetric()) {
      case 'cash':
        return state.payments.map((payment) => ({
          label: `${this.i18n.text(payment.payer)} · ${this.format.money(payment.amount)}`,
          route: '/money',
          queryParams: { payment: payment.id },
        }));
      case 'receivable':
        return state.invoices
          .filter((invoice) => invoice.status !== 'draft')
          .map((invoice) => ({
            label: `${this.i18n.t('common.invoice')} ${invoice.number}`,
            route: '/money',
            queryParams: { invoice: invoice.id },
          }));
      case 'overdue':
        return state.invoices
          .filter((invoice) => isInvoiceOverdue(invoice, state.payments, DEMO_TODAY))
          .map((invoice) => ({
            label: `${this.i18n.t('common.invoice')} ${invoice.number} · ${this.format.days(daysBetween(invoice.dueDate, DEMO_TODAY))}`,
            route: '/money',
            queryParams: { invoice: invoice.id },
          }));
      case 'forecast':
        return state.financialEvents
          .filter((event) => event.status !== 'paid')
          .map((event) => ({
            label: `${this.format.date(event.dueDate)} · ${this.format.money(event.amount)}`,
            route: `/projects/${event.projectId}`,
          }));
      case 'actToInvoice':
        return actToInvoiceMeasurements(state).map((measurement) => ({
          label: `${this.i18n.t('common.invoice')} ${measurement.invoice.number} · ${this.format.days(measurement.days)}`,
          route: '/money',
          queryParams: { invoice: measurement.invoice.id },
        }));
      case 'overdueObligations':
        return overdueObligations(state).map((obligation) => ({
          label: `${this.i18n.text(obligation.title)} · ${this.i18n.t('common.dueDate')}: ${this.format.date(obligation.dueDate)}`,
          route: '/obligations',
          queryParams: { focus: obligation.id },
        }));
      case 'margin':
        return state.projects
          .filter((project) => calculateProjectMargin(state, project.id))
          .map((project) => ({
            label: `${this.i18n.text(project.name)} · ${this.format.money(calculateProjectMargin(state, project.id)?.marginVariance ?? 0)}`,
            route: '/margins',
            queryParams: { project: project.id },
          }));
      case 'manager':
        return state.proposals
          .filter((proposal) => proposal.status !== 'converted')
          .map((proposal) => ({
            label: this.i18n.text(proposal.title),
            route: `/proposals/${proposal.id}`,
          }));
      default:
        return [];
    }
  }
  actToInvoice(): number {
    return averageActToInvoiceDays(this.store.state());
  }
  resetDemo(): void {
    this.ui.confirm('common.resetConfirm', () => {
      this.store.reset();
      this.ui.notify(this.i18n.t('common.resetDone'));
    });
  }
}
