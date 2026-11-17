import { Component, OnDestroy, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { FormatService } from '../core/format';
import { I18nService } from '../core/i18n';
import { Language, LocalizedText, Project } from '../core/models';
import { AppStore } from '../core/store';
import { TranslationKey } from '../core/translations';
import { UiService } from '../core/ui';
import { WorkflowService } from '../core/workflow';
import { EmptyStateComponent, StatusChipComponent } from '../shared/components';

@Component({
  selector: 'app-portal',
  imports: [FormsModule, StatusChipComponent, EmptyStateComponent],
  template: `
    <div class="portal-shell">
      <header class="portal-header">
        <div>
          <span class="brand__mark"
            ><i class="fa-solid fa-arrows-rotate" aria-hidden="true"></i
          ></span>
          <div>
            <h2>{{ t('page.portal.title') }}</h2>
            <p>{{ t('portal.onlyOwn') }}</p>
          </div>
        </div>
        <div class="language-switch" role="group" [attr.aria-label]="t('portal.language')">
          <button [class.active]="i18n.portalLanguage() === 'ru-RU'" (click)="setLanguage('ru-RU')">
            RU</button
          ><button
            [class.active]="i18n.portalLanguage() === 'en-US'"
            (click)="setLanguage('en-US')"
          >
            EN
          </button>
        </div>
      </header>
      <div class="notice notice--green">
        <i class="fa-solid fa-shield-halved" aria-hidden="true"></i>{{ t('portal.privacy') }}
      </div>
      @if (projects().length > 1) {
        <label class="field"
          ><span>{{ t('portal.selectProject') }}</span
          ><select [ngModel]="selectedProjectId()" (ngModelChange)="selectedProjectId.set($event)">
            @for (project of projects(); track project.id) {
              <option [value]="project.id">{{ text(project.name) }}</option>
            }
          </select></label
        >
      }
      @if (project(); as project) {
        <div class="portal-grid">
          <div class="page-stack">
            <section class="card">
              <div class="card__header">
                <div>
                  <span class="eyebrow">{{ t('portal.projectStatus') }}</span>
                  <h2>{{ text(project.name) }}</h2>
                  <p>{{ date(project.startDate) }} — {{ date(project.dueDate) }}</p>
                </div>
                <app-status-chip [portal]="true" [status]="project.status" />
              </div>
              <div class="progress"><span [style.width.%]="progress()"></span></div>
              <small>{{ progress() }}%</small>
            </section>
            <section class="card">
              <div class="card__header">
                <div>
                  <h2>{{ t('portal.approval') }}</h2>
                  <p class="small">{{ t('obligations.acceptanceRisk') }}</p>
                </div>
              </div>
              @for (obligation of acceptanceObligations(); track obligation.id) {
                <article class="portal-approval">
                  <div>
                    <h3>{{ text(obligation.title) }}</h3>
                    <p>{{ date(obligation.dueDate) }}</p>
                  </div>
                  <app-status-chip [portal]="true" [status]="obligation.status" />
                  @if (obligation.status !== 'completed') {
                    <div class="button-row">
                      <button class="btn btn--primary" (click)="decide(true)">
                        {{ t('portal.approve') }}</button><button
                        class="btn"
                        (click)="decide(false)"
                      >
                        {{ t('portal.requestChanges') }}
                      </button>
                    </div>
                  } @else {
                    <span class="chip chip--green">{{ t('portal.approvalDone') }}</span>
                  }
                </article>
              } @empty {
                <app-empty-state [title]="t('common.empty')" />
              }
            </section>
            <section class="card">
              <div class="card__header">
                <h2>{{ t('portal.materials') }}</h2>
                <label class="btn btn--small btn--primary"
                  >{{ t('portal.upload')
                  }}<input
                    class="sr-only"
                    #materialInput
                    type="file"
                    accept=".txt,.md,.csv,.json"
                    (change)="upload(materialInput.files)"
                /></label>
              </div>
              <p class="small">{{ t('common.uploadHint') }}</p>
              @for (document of materials(); track document.id) {
                <div class="linked-row">
                  <span
                    ><strong>{{ text(document.title) }}</strong
                    ><small>{{ dateTime(document.createdAt) }}</small></span
                  ><app-status-chip [portal]="true" [status]="document.status" />
                </div>
              } @empty {
                <p class="muted">{{ t('common.empty') }}</p>
              }
            </section>
            <section class="card">
              <h2>{{ t('portal.questions') }}</h2>
              <div class="timeline">
                @for (activity of questions(); track activity.id) {
                  <div>
                    <span class="timeline__dot"></span>
                    <p>{{ text(activity.action) }}</p>
                    <small>{{ dateTime(activity.at) }}</small>
                  </div>
                } @empty {
                  <p class="muted">{{ t('portal.questionsEmpty') }}</p>
                }
              </div>
              <label class="field"
                ><span>{{ t('common.sendQuestion') }}</span
                ><textarea
                  [(ngModel)]="question"
                  [placeholder]="t('common.questionPlaceholder')"
                ></textarea></label
              ><button class="btn btn--primary" [disabled]="!question.trim()" (click)="ask()">
                {{ t('common.sendQuestion') }}
              </button>
            </section>
          </div>
          <aside class="page-stack">
            <section class="card">
              <h2>{{ t('portal.invoices') }}</h2>
              @for (document of documents(); track document.id) {
                <article class="portal-document">
                  <i class="fa-solid fa-file-invoice" aria-hidden="true"></i>
                  <div>
                    <strong>{{ text(document.title) }}</strong><small>{{
                      date(document.createdAt)
                    }}</small>
                    @if (document.invoiceId) {
                      <p>
                        {{ invoiceAmount(document.invoiceId) }} ·
                        {{ invoiceDue(document.invoiceId) }}
                      </p>
                    }
                  </div>
                  <app-status-chip [portal]="true" [status]="document.status" />
                </article>
              } @empty {
                <app-empty-state [title]="t('common.empty')" />
              }
            </section>
            <div class="notice">
              <i class="fa-solid fa-circle-info" aria-hidden="true"></i
              >{{ t('portal.paymentDisabled') }}
            </div>
            <section class="card">
              <h3>{{ t('portal.noInternalData') }}</h3>
              <p class="small">{{ t('common.noMarginForRole') }}</p>
            </section>
          </aside>
        </div>
      }
    </div>
  `,
})
export class PortalComponent implements OnDestroy {
  readonly selectedProjectId = signal(
    inject(ActivatedRoute).snapshot.queryParamMap.get('project') ?? 'project-vector',
  );
  question = '';
  constructor(
    readonly i18n: I18nService,
    readonly format: FormatService,
    readonly store: AppStore,
    private readonly workflow: WorkflowService,
    private readonly ui: UiService,
    private readonly route: ActivatedRoute,
  ) {
    this.i18n.syncDocumentLanguage(this.i18n.portalLanguage());
  }
  ngOnDestroy(): void {
    this.i18n.syncDocumentLanguage();
  }
  t(key: TranslationKey, params: Record<string, string | number> = {}): string {
    return this.i18n.t(key, params, true);
  }
  text(value: LocalizedText): string {
    return this.i18n.text(value, true);
  }
  date(value: string): string {
    return this.format.date(value, undefined, true);
  }
  dateTime(value: string): string {
    return this.format.dateTime(value, true);
  }
  setLanguage(language: Language): void {
    this.i18n.setPortalLanguage(language);
  }
  projects(): Project[] {
    return this.store.state().projects.filter((project) => project.clientId === 'client-vector');
  }
  project(): Project | undefined {
    return (
      this.projects().find((project) => project.id === this.selectedProjectId()) ??
      this.projects()[0]
    );
  }
  acceptanceObligations() {
    return this.store
      .state()
      .obligations.filter(
        (obligation) =>
          obligation.projectId === this.project()?.id &&
          ['acceptance', 'delivery'].includes(obligation.kind),
      );
  }
  documents() {
    return this.store
      .state()
      .documents.filter(
        (document) =>
          document.clientId === 'client-vector' &&
          !document.internal &&
          (document.projectId === this.project()?.id || document.kind === 'invoice'),
      );
  }
  materials() {
    return this.documents().filter((document) => document.kind === 'material');
  }
  questions() {
    const ids = new Set([
      this.project()?.id,
      ...this.acceptanceObligations().map((item) => item.id),
    ]);
    return this.store
      .state()
      .activities.filter(
        (activity) =>
          !activity.internal && activity.actorId === 'user-client' && ids.has(activity.entityId),
      )
      .slice()
      .reverse();
  }
  progress(): number {
    const obligations = this.store
      .state()
      .obligations.filter(
        (obligation) =>
          obligation.projectId === this.project()?.id && obligation.kind !== 'payment',
      );
    return obligations.length
      ? Math.round(
          obligations.reduce((sum, obligation) => sum + obligation.progress, 0) /
            obligations.length,
        )
      : 0;
  }
  invoiceAmount(id: string): string {
    const invoice = this.store.state().invoices.find((item) => item.id === id);
    return invoice ? this.format.money(invoice.amount, false, true) : '';
  }
  invoiceDue(id: string): string {
    const invoice = this.store.state().invoices.find((item) => item.id === id);
    return invoice ? this.t('portal.invoiceDue', { date: this.date(invoice.dueDate) }) : '';
  }
  decide(approved: boolean): void {
    const project = this.project();
    if (!project) return;
    if (approved) {
      this.workflow.portalDecision(project.id, true);
      this.ui.notify(this.t('portal.approved'));
    } else
      this.ui.confirm(
        'portal.requestChangesText',
        () => {
          this.workflow.portalDecision(project.id, false);
          this.ui.notify(this.t('portal.changesRequested'));
        },
        true,
      );
  }
  async upload(files: FileList | null): Promise<void> {
    const file = files?.[0];
    const project = this.project();
    if (!file || !project) return;
    try {
      const content = await file.text();
      this.workflow.uploadMaterial(project.id, file.name, content);
      this.ui.notify(this.t('portal.uploaded'));
    } catch {
      this.ui.notify(this.t('documents.fileReadError'));
    }
  }
  ask(): void {
    const project = this.project();
    if (!project || !this.question.trim()) return;
    this.workflow.askPortalQuestion(project.id, this.question.trim());
    this.question = '';
    this.ui.notify(this.t('portal.questionSent'));
  }
}
