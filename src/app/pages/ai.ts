import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { FormatService } from '../core/format';
import { I18nService } from '../core/i18n';
import { AiResult } from '../core/models';
import { SessionService } from '../core/session';
import { AppStore } from '../core/store';
import { TranslationKey } from '../core/translations';
import { UiService } from '../core/ui';
import { WorkflowService } from '../core/workflow';
import { EmptyStateComponent, StatusChipComponent } from '../shared/components';

@Component({
  selector: 'app-ai',
  imports: [FormsModule, StatusChipComponent, EmptyStateComponent],
  template: `
    <div class="page-stack">
      <div class="notice notice--amber">
        <i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i
        ><span>{{ i18n.t('ai.simulation') }} · {{ i18n.t('ai.humanControl') }}</span>
      </div>
      <section class="card">
        <div class="card__header">
          <div>
            <h2>{{ i18n.t('nav.ai') }}</h2>
            <p class="small">{{ i18n.t('ai.onlyExtractionRollback') }}</p>
          </div>
        </div>
        <div class="filter-row">
          <button class="chip" [class.filter-active]="filter === 'all'" (click)="filter = 'all'">
            {{ i18n.t('common.all') }}</button><button
            class="chip"
            [class.filter-active]="filter === 'pending'"
            (click)="filter = 'pending'"
          >
            {{ i18n.t('status.pending') }}</button
          ><button
            class="chip"
            [class.filter-active]="filter === 'accepted'"
            (click)="filter = 'accepted'"
          >
            {{ i18n.t('status.accepted') }}
          </button>
        </div>
        <div class="ai-grid">
          @for (result of results(); track result.id) {
            <article class="ai-result card--compact">
              <div class="card__header">
                <div>
                  <span class="eyebrow">{{ i18n.t(kindKey(result.kind)) }}</span>
                  <h3>{{ entityLabel(result) }}</h3>
                </div>
                <app-status-chip [status]="result.status" />
              </div>
              <p class="ai-result__text">{{ i18n.text(result.result) }}</p>
              <dl class="ai-meta">
                <div>
                  <dt>{{ i18n.t('ai.source') }}</dt>
                  <dd>{{ i18n.text(result.source) }}</dd>
                </div>
                <div>
                  <dt>{{ i18n.t('common.confidence') }}</dt>
                  <dd class="mono">{{ format.percent(result.confidence * 100) }}</dd>
                </div>
                <div>
                  <dt>{{ i18n.t('common.model') }}</dt>
                  <dd>{{ result.model }}</dd>
                </div>
                <div>
                  <dt>{{ i18n.t('common.costRub') }}</dt>
                  <dd>{{ format.money(result.costRub) }}</dd>
                </div>
                <div>
                  <dt>{{ i18n.t('ai.reviewStatus') }}</dt>
                  <dd><app-status-chip [status]="result.status" /></dd>
                </div>
                @if (result.confirmedBy) {
                  <div>
                    <dt>{{ i18n.t('ai.reviewer') }}</dt>
                    <dd>{{ userName(result.confirmedBy) }}</dd>
                  </div>
                }
              </dl>
              @if (editingId() === result.id) {
                <label class="field"
                  ><span>{{ i18n.t('ai.editResult') }}</span
                  ><textarea [(ngModel)]="editText"></textarea>
                </label>
                <div class="button-row">
                  <button class="btn" (click)="editingId.set('')">
                    {{ i18n.t('common.cancel') }}</button><button
                    class="btn btn--primary"
                    [disabled]="!editText.trim()"
                    (click)="saveEdit(result)"
                  >
                    {{ i18n.t('common.save') }}
                  </button>
                </div>
              } @else {
                <div class="button-row">
                  @if (result.status === 'pending') {
                    <button class="btn btn--primary" (click)="accept(result)">
                      {{ i18n.t('ai.accept') }}</button><button
                      class="btn"
                      (click)="startEdit(result)"
                    >
                      {{ i18n.t('ai.edit') }}</button
                    ><button class="btn btn--danger" (click)="reject(result)">
                      {{ i18n.t('ai.reject') }}
                    </button>
                  }
                  @if (result.kind === 'extract_terms' && result.status === 'accepted') {
                    <button class="btn" (click)="rollback(result)">
                      {{ i18n.t('ai.rollback') }}
                    </button>
                  }
                  <button class="btn btn--ghost" (click)="toggleHistory(result.id)">
                    {{ i18n.t('common.history') }}
                  </button>
                </div>
              }
              @if (historyId() === result.id) {
                <div class="timeline">
                  @for (entry of result.history; track $index) {
                    <div>
                      <span class="timeline__dot"></span>
                      <p>{{ i18n.text(entry.note) }}</p>
                      <small>{{ format.dateTime(entry.at) }} · {{ userName(entry.actorId) }}</small>
                    </div>
                  }
                </div>
              }
            </article>
          } @empty {
            <app-empty-state [title]="i18n.t('ai.empty')" />
          }
        </div>
      </section>
      @if (session.role() === 'owner') {
        <section class="card">
          <div class="card__header">
            <div>
              <h2>{{ i18n.t('ai.newComparison') }}</h2>
              <p class="small">{{ i18n.t('ai.simulation') }}</p>
            </div>
          </div>
          <div class="form-grid form-grid--three">
            <label class="field"
              ><span>{{ i18n.t('common.document') }}</span
              ><select [(ngModel)]="documentId">
                @for (document of store.state().documents; track document.id) {
                  <option [value]="document.id">{{ i18n.text(document.title) }}</option>
                }
              </select></label
            ><label class="field"
              ><span>{{ i18n.t('common.project') }}</span
              ><select [(ngModel)]="projectId">
                @for (project of store.state().projects; track project.id) {
                  <option [value]="project.id">{{ i18n.text(project.name) }}</option>
                }
              </select></label
            >
            <div class="button-row">
              <button class="btn" (click)="createComparison()">
                {{ i18n.t('ai.newComparison') }}</button><button
                class="btn"
                (click)="createNextAction()"
              >
                {{ i18n.t('ai.newNextAction') }}
              </button>
            </div>
          </div>
        </section>
      }
    </div>
  `,
})
export class AiComponent {
  filter = 'all';
  readonly editingId = signal('');
  readonly historyId = signal('');
  editText = '';
  documentId = inject(AppStore).state().documents[0]?.id ?? '';
  projectId = inject(AppStore).state().projects[0]?.id ?? '';
  constructor(
    readonly i18n: I18nService,
    readonly format: FormatService,
    readonly store: AppStore,
    readonly session: SessionService,
    private readonly workflow: WorkflowService,
    private readonly ui: UiService,
    private readonly route: ActivatedRoute,
  ) {
    if (route.snapshot.queryParamMap.get('filter'))
      this.filter = route.snapshot.queryParamMap.get('filter')!;
  }
  results(): AiResult[] {
    return this.store
      .state()
      .aiResults.filter(
        (result) =>
          (this.session.role() !== 'project' ||
            ['extract_terms', 'compare_versions', 'next_action'].includes(result.kind)) &&
          (this.filter === 'all' || result.status === this.filter),
      );
  }
  kindKey(kind: string): TranslationKey {
    return `ai.kind.${kind}` as TranslationKey;
  }
  userName(id: string): string {
    return this.store.state().users.find((user) => user.id === id)?.name ?? id;
  }
  entityLabel(result: AiResult): string {
    const state = this.store.state();
    if (result.entityType === 'project') {
      const value = state.projects.find((item) => item.id === result.entityId);
      return value ? this.i18n.text(value.name) : result.entityId;
    }
    if (result.entityType === 'contract') {
      const value = state.contracts.find((item) => item.id === result.entityId);
      return value ? `${this.i18n.t('common.contract')} ${value.number}` : result.entityId;
    }
    if (result.entityType === 'invoice') {
      const value = state.invoices.find((item) => item.id === result.entityId);
      return value ? `${this.i18n.t('common.invoice')} ${value.number}` : result.entityId;
    }
    const value = state.documents.find((item) => item.id === result.entityId);
    return value ? this.i18n.text(value.title) : result.entityId;
  }
  accept(result: AiResult): void {
    this.workflow.reviewAi(result.id, 'accepted', this.workflow.actorForRole(this.session.role()));
    this.ui.notify(this.i18n.t('ai.accepted'));
  }
  startEdit(result: AiResult): void {
    this.editingId.set(result.id);
    this.editText = this.i18n.text(result.result);
  }
  saveEdit(result: AiResult): void {
    const edited = { ...result.result, [this.i18n.shortLanguage()]: this.editText };
    this.workflow.reviewAi(
      result.id,
      'edited',
      this.workflow.actorForRole(this.session.role()),
      edited,
    );
    this.editingId.set('');
    this.ui.notify(this.i18n.t('ai.edited'));
  }
  reject(result: AiResult): void {
    this.ui.confirm('ai.rejectText', () => {
      this.workflow.reviewAi(
        result.id,
        'rejected',
        this.workflow.actorForRole(this.session.role()),
      );
      this.ui.notify(this.i18n.t('ai.rejected'));
    });
  }
  rollback(result: AiResult): void {
    this.ui.confirm('ai.rollbackText', () => {
      this.workflow.rollbackAi(result.id, this.workflow.actorForRole(this.session.role()));
      this.ui.notify(this.i18n.t('ai.rolledBack'));
    });
  }
  toggleHistory(id: string): void {
    this.historyId.update((current) => (current === id ? '' : id));
  }
  createComparison(): void {
    if (!this.documentId) return;
    this.workflow.createAiResult('compare_versions', 'document', this.documentId, 'user-owner');
    this.ui.notify(this.i18n.t('ai.resultPrepared'));
  }
  createNextAction(): void {
    if (!this.projectId) return;
    this.workflow.createAiResult('next_action', 'project', this.projectId, 'user-owner');
    this.ui.notify(this.i18n.t('ai.resultPrepared'));
  }
}
