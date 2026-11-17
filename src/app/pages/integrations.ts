import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FormatService } from '../core/format';
import { I18nService } from '../core/i18n';
import { IntegrationEvent } from '../core/models';
import { AppStore } from '../core/store';
import { TranslationKey } from '../core/translations';
import { UiService } from '../core/ui';
import { WorkflowService } from '../core/workflow';
import {
  EmptyStateComponent,
  MetricCardComponent,
  StatusChipComponent,
} from '../shared/components';

@Component({
  selector: 'app-integrations',
  imports: [FormsModule, MetricCardComponent, StatusChipComponent, EmptyStateComponent],
  template: `<div class="page-stack">
    <div class="notice notice--amber">
      <i class="fa-solid fa-plug-circle-xmark" aria-hidden="true"></i
      >{{ i18n.t('integrations.realApis') }}
    </div>
    <section class="metric-grid">
      <app-metric-card
        [label]="i18n.t('integrations.successRate')"
        [value]="format.percent(successRate())"
        tone="positive"
      /><app-metric-card
        [label]="i18n.t('integrations.queued')"
        [value]="format.number(queueCount())"
      /><app-metric-card
        [label]="i18n.t('integrations.failures')"
        [value]="format.number(failureCount())"
        tone="negative"
      /><app-metric-card
        [label]="i18n.t('integrations.delay')"
        [value]="i18n.t('integrations.delayValue', { value: averageDelay() })"
      />
    </section>
    <div class="two-columns two-columns--wide-left">
      <section class="card">
        <div class="card__header">
          <div>
            <h2>{{ i18n.t('integrations.systems') }}</h2>
            <p class="small">{{ i18n.t('common.demoMode') }}</p>
          </div>
          <button class="btn btn--primary" (click)="connectOpen.set(!connectOpen())">
            <i class="fa-solid fa-plus" aria-hidden="true"></i>{{ i18n.t('integrations.connect') }}
          </button>
        </div>
        @if (connectOpen()) {
          <div class="notice">
            <select [(ngModel)]="newSystem" [attr.aria-label]="i18n.t('common.system')">
              @for (system of systems; track system) {
                <option [value]="system">{{ i18n.t(systemKey(system)) }}</option>
              }</select
            ><button class="btn btn--small" (click)="addMock()">
              {{ i18n.t('integrations.addMock') }}
            </button>
          </div>
        }
        @for (system of systems; track system) {
          <div class="integration-system">
            <span class="integration-icon"
              ><i [class]="systemIcon(system)" aria-hidden="true"></i
            ></span>
            <div>
              <h3>{{ i18n.t(systemKey(system)) }}</h3>
              <p>
                {{ systemEvents(system).length }} {{ i18n.t('common.event').toLowerCase() }} ·
                {{ lastUpdate(system) }}
              </p>
            </div>
            <app-status-chip [status]="systemStatus(system)" /><a
              class="btn btn--small"
              href="#event-queue"
              >{{ i18n.t('common.details') }}</a
            >
          </div>
        }
      </section>
      <section class="card" id="event-queue">
        <div class="card__header">
          <div>
            <h2>{{ i18n.t('integrations.eventQueue') }}</h2>
            <p class="small">{{ i18n.t('integrations.retryHint') }}</p>
          </div>
          <select [(ngModel)]="statusFilter" [attr.aria-label]="i18n.t('common.status')">
            <option value="all">{{ i18n.t('common.all') }}</option>
            <option value="error">{{ i18n.t('status.error') }}</option>
            <option value="queued">{{ i18n.t('status.queued') }}</option>
            <option value="done">{{ i18n.t('status.done') }}</option>
          </select>
        </div>
        @for (event of events(); track event.id) {
          <article
            class="integration-event"
            [class.integration-event--error]="event.status === 'error'"
          >
            <div class="card__header">
              <div>
                <strong>{{ i18n.t(systemKey(event.system)) }}</strong>
                <p>{{ i18n.text(event.message) }}</p>
              </div>
              <app-status-chip [status]="event.status" />
            </div>
            <small
              >{{ format.dateTime(event.updatedAt) }} · {{ i18n.t('common.attempts') }}
              {{ event.attempts }} · {{ event.entityType }}/{{ event.entityId }}</small
            >
            <div class="button-row">
              @if (event.status !== 'done') {
                <button class="btn btn--small" (click)="advance(event.id)">
                  {{ i18n.t(event.status === 'error' ? 'common.resolve' : 'common.retry') }}
                </button>
              }
              <button class="btn btn--small" (click)="toggleLog(event.id)">
                {{ i18n.t('integrations.transformLog') }}
              </button>
            </div>
            @if (expandedId() === event.id) {
              <ol class="transform-log">
                @for (entry of event.transformLog; track entry.ru) {
                  <li>{{ i18n.text(entry) }}</li>
                }
              </ol>
            }
          </article>
        } @empty {
          <app-empty-state [title]="i18n.t('integrations.noEvents')" />
        }
      </section>
    </div>
    <section class="card">
      <div class="card__header">
        <div>
          <h2>{{ i18n.t('integrations.export') }}</h2>
          <p>{{ i18n.t('integrations.exportHint') }}</p>
        </div>
        <button class="btn" (click)="export()">
          <i class="fa-solid fa-download" aria-hidden="true"></i
          >{{ i18n.t('integrations.download') }}
        </button>
      </div>
    </section>
  </div>`,
})
export class IntegrationsComponent {
  readonly systems: IntegrationEvent['system'][] = [
    'accounting',
    'bank',
    'edi',
    'mail',
    'calendar',
    'storage',
  ];
  readonly connectOpen = signal(false);
  readonly expandedId = signal('');
  newSystem: IntegrationEvent['system'] = 'mail';
  statusFilter = 'all';
  constructor(
    readonly i18n: I18nService,
    readonly format: FormatService,
    readonly store: AppStore,
    private readonly workflow: WorkflowService,
    private readonly ui: UiService,
  ) {}
  events(): IntegrationEvent[] {
    return this.store
      .state()
      .integrationEvents.filter(
        (event) => this.statusFilter === 'all' || event.status === this.statusFilter,
      );
  }
  systemEvents(system: string): IntegrationEvent[] {
    return this.store.state().integrationEvents.filter((event) => event.system === system);
  }
  systemKey(system: string): TranslationKey {
    return `integrations.system.${system}` as TranslationKey;
  }
  systemIcon(system: string): string {
    const icons: Record<string, string> = {
      accounting: 'fa-solid fa-database',
      bank: 'fa-solid fa-building-columns',
      edi: 'fa-solid fa-file-signature',
      mail: 'fa-solid fa-envelope',
      calendar: 'fa-solid fa-calendar-days',
      storage: 'fa-solid fa-box-archive',
    };
    return icons[system] ?? 'fa-solid fa-plug';
  }
  systemStatus(system: string): string {
    const events = this.systemEvents(system);
    return events.some((event) => ['error', 'conflict', 'delayed'].includes(event.status))
      ? 'attention'
      : events.length
        ? 'active'
        : 'queued';
  }
  lastUpdate(system: string): string {
    const event = this.systemEvents(system).sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt),
    )[0];
    return event ? this.format.dateTime(event.updatedAt) : this.i18n.t('common.empty');
  }
  successRate(): number {
    const events = this.store.state().integrationEvents;
    return events.length
      ? Math.round(
          (events.filter((event) => event.status === 'done').length / events.length) * 1000,
        ) / 10
      : 100;
  }
  queueCount(): number {
    return this.store
      .state()
      .integrationEvents.filter((event) => ['queued', 'retry'].includes(event.status)).length;
  }
  failureCount(): number {
    return this.store
      .state()
      .integrationEvents.filter((event) => ['error', 'conflict'].includes(event.status)).length;
  }
  averageDelay(): number {
    const events = this.store.state().integrationEvents;
    return events.length
      ? Math.round(
          (events.filter((event) => event.status === 'delayed').length * 25 +
            events.filter((event) => event.status === 'queued').length * 5) /
            events.length,
        )
      : 0;
  }
  advance(id: string): void {
    this.workflow.advanceIntegration(id);
    this.ui.notify(this.i18n.t('integrations.processed'));
  }
  toggleLog(id: string): void {
    this.expandedId.update((current) => (current === id ? '' : id));
  }
  addMock(): void {
    const state = this.store.state();
    const event: IntegrationEvent = {
      id: `integration-manual-${state.integrationEvents.length + 1}`,
      system: this.newSystem,
      entityType: 'client',
      entityId: state.clients[0]!.id,
      status: 'queued',
      message: {
        ru: 'Событие ожидает обработки в локальной mock-очереди',
        en: 'Event is waiting in the local mock queue',
      },
      transformLog: [
        {
          ru: 'Создано вручную; внешняя отправка не выполнялась',
          en: 'Created manually; no external request was made',
        },
      ],
      updatedAt: '2026-05-14T12:00:00Z',
      attempts: 0,
    };
    this.store.integrationEvents.add(event);
    this.connectOpen.set(false);
    this.ui.notify(this.i18n.t('integrations.added'));
  }
  export(): void {
    this.workflow.exportArchive();
    this.ui.notify(this.i18n.t('integrations.exported'));
  }
}
