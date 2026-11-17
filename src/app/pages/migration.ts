import { Component, forwardRef, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { FormatService } from '../core/format';
import { I18nService } from '../core/i18n';
import { MigrationService } from '../core/migration';
import { MigrationReport } from '../core/models';
import { AppStore } from '../core/store';
import { UiService } from '../core/ui';
import { MetricCardComponent } from '../shared/components';

@Component({
  selector: 'app-migration',
  imports: [
    FormsModule,
    RouterLink,
    MetricCardComponent,
    forwardRef(() => MigrationReportComponent),
    forwardRef(() => MigrationStepActionsComponent),
  ],
  template: `
    <div class="migration-layout">
      <aside class="card migration-steps">
        <span class="eyebrow">{{ i18n.t('migration.title') }}</span>
        @for (step of steps; track step.index) {
          <button
            [class.active]="migration.state.step === step.index"
            [class.complete]="migration.state.step > step.index"
            (click)="go(step.index)"
          >
            <span>{{ migration.state.step > step.index ? '✓' : step.index + 1 }}</span>{{
              i18n.t(step.key)
            }}
          </button>
        }
      </aside>
      <section class="card migration-content">
        <div class="notice notice--amber">
          <i class="fa-solid fa-flask" aria-hidden="true"></i>{{ i18n.t('common.demoMode') }} ·
          {{ i18n.t('migration.csvNote') }}
        </div>
        @switch (migration.state.step) {
          @case (0) {
            <h2>{{ i18n.t('migration.source') }}</h2>
            <p class="muted">{{ i18n.t('migration.csvNote') }}</p>
            <div class="source-options">
              @for (source of sources; track source) {
                <label [class.selected]="migration.state.source === source"
                  ><input
                    type="radio"
                    name="source"
                    [value]="source"
                    [ngModel]="migration.state.source"
                    (ngModelChange)="migration.setSource($event)"
                  /><i [class]="sourceIcon(source)" aria-hidden="true"></i
                  ><strong>{{ sourceName(source) }}</strong
                  ><small>{{ i18n.t('common.demo') }}</small></label
                >
              }
            </div>
            <div class="form-actions">
              <button class="btn btn--primary" (click)="migration.setStep(1)">
                {{ i18n.t('common.next') }}
              </button>
            </div>
          }
          @case (1) {
            <h2>{{ i18n.t('migration.csv') }}</h2>
            <div class="upload-zone">
              <i class="fa-solid fa-file-csv" aria-hidden="true"></i>
              <p>{{ migration.state.fileName || i18n.t('migration.noFile') }}</p>
              <input
                #csvInput
                type="file"
                accept=".csv,text/csv"
                (change)="loadFile(csvInput.files)"
              />
            </div>
            <div class="button-row">
              <button class="btn" (click)="demo()">
                {{ i18n.t('migration.demoFile') }}</button><button
                class="btn btn--primary"
                (click)="analyze()"
              >
                {{ i18n.t('migration.analyze') }}
              </button>
            </div>
            @if (error) {
              <p class="field-error">{{ i18n.t(error) }}</p>
            }
          }
          @case (2) {
            <h2>{{ i18n.t('migration.analysis') }}</h2>
            @if (report(); as report) {
              <report-metrics [report]="report"></report-metrics>
            }
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    @for (header of migration.headers(); track header) {
                      <th>{{ header }}</th>
                    }
                  </tr>
                </thead>
                <tbody>
                  @for (row of migration.rows().slice(0, 5); track $index) {
                    <tr>
                      @for (header of migration.headers(); track header) {
                        <td>{{ row[header] || '—' }}</td>
                      }
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            <step-actions
              (next)="migration.setStep(3)"
              (back)="migration.setStep(1)"
            ></step-actions>
          }
          @case (3) {
            <h2>{{ i18n.t('migration.mapping') }}</h2>
            <p>{{ i18n.t('migration.mappingRequired') }}</p>
            <div class="mapping-list">
              @for (header of migration.headers(); track header) {
                <div class="mapping-row">
                  <div>
                    <strong>{{ header }}</strong><small
                      >{{ i18n.t('migration.exampleValue') }}:
                      {{ migration.rows()[0]?.[header] || '—' }}</small
                    >
                  </div>
                  <i class="fa-solid fa-arrow-right" aria-hidden="true"></i
                  ><select
                    [ngModel]="migration.state.fieldMapping[header]"
                    (ngModelChange)="migration.setMapping(header, $event)"
                    [attr.aria-label]="i18n.t('migration.targetField')"
                  >
                    <option value="">{{ i18n.t('migration.ignore') }}</option>
                    @for (target of targets; track target) {
                      <option [value]="target">{{ targetName(target) }}</option>
                    }
                  </select>
                </div>
              }
            </div>
            @if (error) {
              <p class="field-error">{{ i18n.t(error) }}</p>
            }
            <step-actions (next)="mappingNext()" (back)="migration.setStep(2)"></step-actions>
          }
          @case (4) {
            <h2>{{ i18n.t('migration.duplicates') }}</h2>
            <p>{{ i18n.t('migration.duplicateHint') }}</p>
            @if (report(); as report) {
              <div class="metric-grid metric-grid--three">
                <app-metric-card
                  [label]="i18n.t('migration.merged')"
                  [value]="format.number(report.duplicatesMerged)"
                /><app-metric-card
                  [label]="i18n.t('migration.conflicts')"
                  [value]="format.number(report.conflicts)"
                  tone="warning"
                /><app-metric-card
                  [label]="i18n.t('migration.completeness')"
                  [value]="format.percent(report.completeness)"
                />
              </div>
              <div class="notice notice--green">{{ i18n.t('migration.mergeConfirmed') }}</div>
            }
            <step-actions
              (next)="migration.setStep(5)"
              (back)="migration.setStep(3)"
            ></step-actions>
          }
          @case (5) {
            <h2>{{ i18n.t('migration.quality') }}</h2>
            @if (report(); as report) {
              <report-metrics [report]="report"></report-metrics>
              <div class="notice notice--amber">
                <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i
                >{{ i18n.t('migration.filesNote') }}
              </div>
              <div class="button-row">
                <button class="btn" (click)="migration.setStep(4)">
                  {{ i18n.t('common.previous') }}</button><button
                  class="btn btn--primary"
                  (click)="runTest()"
                >
                  {{ i18n.t('migration.runTest') }}
                </button>
              </div>
            }
          }
          @case (6) {
            <h2>{{ i18n.t('migration.test') }}</h2>
            <div class="notice notice--green">
              <i class="fa-solid fa-flask-circle-check" aria-hidden="true"></i
              >{{ i18n.t('migration.testHint') }}
            </div>
            @if (report(); as report) {
              <report-metrics [report]="report"></report-metrics>
            }
            <step-actions
              (next)="migration.setStep(7)"
              (back)="migration.setStep(5)"
            ></step-actions>
          }
          @case (7) {
            <h2>{{ i18n.t('migration.errors') }}</h2>
            @for (item of migration.state.errors; track item.ru) {
              <div class="notice notice--amber">
                <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i
                >{{ i18n.text(item) }}
              </div>
            } @empty {
              <div class="notice notice--green">{{ i18n.t('common.empty') }}</div>
            }
            <p class="small">{{ i18n.t('migration.filesNote') }}</p>
            <step-actions
              (next)="migration.setStep(8)"
              (back)="migration.setStep(6)"
            ></step-actions>
          }
          @case (8) {
            <h2>{{ i18n.t('migration.confirm') }}</h2>
            <p>{{ i18n.t('migration.confirmText') }}</p>
            @if (report(); as report) {
              <report-metrics [report]="report"></report-metrics>
            }
            <div class="form-actions">
              <button class="btn" (click)="migration.setStep(7)">
                {{ i18n.t('common.previous') }}</button><button
                class="btn btn--primary"
                (click)="confirm()"
              >
                {{ i18n.t('migration.confirmButton') }}
              </button>
            </div>
          }
          @case (9) {
            <h2>{{ i18n.t('migration.report') }}</h2>
            <div
              class="notice"
              [class.notice--green]="migration.state.status === 'confirmed'"
              [class.notice--amber]="migration.state.status === 'rolled_back'"
            >
              <i class="fa-solid fa-circle-check" aria-hidden="true"></i
              >{{
                i18n.t(
                  migration.state.status === 'rolled_back'
                    ? 'migration.rolledBack'
                    : 'migration.done'
                )
              }}
            </div>
            @if (report(); as report) {
              <report-metrics [report]="report"></report-metrics>
            }
            @if (migration.state.importedClientIds.length) {
              <h3>{{ i18n.t('migration.importedObjects') }}</h3>
              @for (id of migration.state.importedClientIds; track id) {
                <a class="linked-row" [routerLink]="['/clients', id]"
                  >{{ clientName(id) }}<i class="fa-solid fa-arrow-right" aria-hidden="true"></i
                ></a>
              }
            }
            <div class="button-row">
              @if (migration.state.status === 'confirmed') {
                <button class="btn btn--danger" (click)="rollback()">
                  {{ i18n.t('migration.rollback') }}
                </button>
              }
              <button class="btn" (click)="restart()">{{ i18n.t('migration.restart') }}</button>
            </div>
          }
        }
      </section>
    </div>
  `,
})
export class MigrationComponent {
  readonly steps = [
    { index: 0, key: 'migration.source' },
    { index: 1, key: 'migration.csv' },
    { index: 2, key: 'migration.analysis' },
    { index: 3, key: 'migration.mapping' },
    { index: 4, key: 'migration.duplicates' },
    { index: 5, key: 'migration.quality' },
    { index: 6, key: 'migration.test' },
    { index: 7, key: 'migration.errors' },
    { index: 8, key: 'migration.confirm' },
    { index: 9, key: 'migration.report' },
  ] as const;
  readonly sources = ['csv', 'hubspot', 'pipedrive'] as const;
  readonly targets = ['name', 'email', 'contact', 'phone', 'segment', 'owner', 'attachment'];
  error: 'migration.noFile' | 'migration.invalidCsv' | 'migration.mappingRequired' | '' = '';
  constructor(
    readonly migration: MigrationService,
    readonly i18n: I18nService,
    readonly format: FormatService,
    readonly store: AppStore,
    private readonly ui: UiService,
  ) {}
  sourceName(source: string): string {
    return source === 'csv'
      ? this.i18n.t('migration.csv')
      : source === 'hubspot'
        ? 'HubSpot'
        : 'Pipedrive';
  }
  sourceIcon(source: string): string {
    return source === 'csv'
      ? 'fa-solid fa-file-csv'
      : source === 'hubspot'
        ? 'fa-brands fa-hubspot'
        : 'fa-solid fa-table-columns';
  }
  targetName(target: string): string {
    const keys = {
      name: 'common.clientName',
      email: 'common.email',
      contact: 'common.contact',
      phone: 'common.phone',
      segment: 'common.segment',
      owner: 'common.owner',
      attachment: 'common.file',
    } as const;
    return this.i18n.t(keys[target as keyof typeof keys] ?? 'common.field');
  }
  report(): MigrationReport | undefined {
    return this.migration.state.report;
  }
  go(step: number): void {
    if (step <= this.migration.state.step) {
      this.error = '';
      this.migration.setStep(step);
    }
  }
  demo(): void {
    this.migration.useDemo();
    this.error = '';
    this.ui.notify(this.i18n.t('migration.fileLoaded'));
  }
  async loadFile(files: FileList | null): Promise<void> {
    const file = files?.[0];
    if (!file) return;
    try {
      this.migration.loadCsv(file.name, await file.text());
      this.error = '';
      this.ui.notify(this.i18n.t('migration.fileLoaded'));
    } catch {
      this.error = 'migration.invalidCsv';
    }
  }
  analyze(): void {
    try {
      if (!this.migration.state.csvContent) {
        this.error = 'migration.noFile';
        return;
      }
      this.migration.analyze();
      this.error = '';
    } catch {
      this.error = 'migration.invalidCsv';
    }
  }
  mappingNext(): void {
    const targets = Object.values(this.migration.state.fieldMapping);
    if (!targets.includes('name') || !targets.includes('email')) {
      this.error = 'migration.mappingRequired';
      return;
    }
    this.error = '';
    this.migration.setStep(4);
  }
  runTest(): void {
    try {
      this.migration.runTest();
      this.error = '';
    } catch {
      this.error = 'migration.mappingRequired';
    }
  }
  confirm(): void {
    this.ui.confirm('migration.confirmText', () => {
      this.migration.confirm();
      this.ui.notify(this.i18n.t('migration.confirmed'));
    });
  }
  rollback(): void {
    this.ui.confirm('migration.rollbackText', () => {
      this.migration.rollback();
      this.ui.notify(this.i18n.t('migration.rolledBack'));
    });
  }
  restart(): void {
    this.migration.restart();
    this.error = '';
  }
  clientName(id: string): string {
    const client = this.store.state().clients.find((item) => item.id === id);
    return client ? this.i18n.text(client.name) : id;
  }
}

@Component({
  selector: 'report-metrics',
  imports: [MetricCardComponent],
  template: `@if (report(); as report) {
    <section class="metric-grid metric-grid--three">
      <app-metric-card
        [label]="i18n.t('migration.totalRows')"
        [value]="format.number(report.totalRows)"
      /><app-metric-card
        [label]="i18n.t('migration.validRows')"
        [value]="format.number(report.validRows)"
      /><app-metric-card
        [label]="i18n.t('migration.merged')"
        [value]="format.number(report.duplicatesMerged)"
      /><app-metric-card
        [label]="i18n.t('migration.missingOwner')"
        [value]="format.number(report.missingOwner)"
        tone="warning"
      /><app-metric-card
        [label]="i18n.t('migration.filesMissing')"
        [value]="format.number(report.filesNotTransferred)"
        tone="warning"
      /><app-metric-card
        [label]="i18n.t('migration.completeness')"
        [value]="format.percent(report.completeness)"
      />
    </section>
    <div class="report-details">
      <span
        >{{ i18n.t('migration.unmapped') }}:
        <strong>{{ report.unmappedFields.join(', ') || '—' }}</strong></span
      ><span
        >{{ i18n.t('migration.conflicts') }}: <strong>{{ report.conflicts }}</strong></span
      >
    </div>
  }`,
})
export class MigrationReportComponent {
  readonly report = input<MigrationReport | undefined>();
  constructor(
    readonly i18n: I18nService,
    readonly format: FormatService,
  ) {}
}

@Component({
  selector: 'step-actions',
  template: `<div class="form-actions">
    <button class="btn" (click)="back.emit()">{{ i18n.t('common.previous') }}</button><button
      class="btn btn--primary"
      (click)="next.emit()"
    >
      {{ i18n.t('common.next') }}
    </button>
  </div>`,
})
export class MigrationStepActionsComponent {
  readonly next = output<void>();
  readonly back = output<void>();
  constructor(readonly i18n: I18nService) {}
}
