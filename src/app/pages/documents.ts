import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormatService } from '../core/format';
import { I18nService } from '../core/i18n';
import { Document } from '../core/models';
import { SessionService } from '../core/session';
import { AppStore } from '../core/store';
import { TranslationKey, translations } from '../core/translations';
import { UiService } from '../core/ui';
import { WorkflowService } from '../core/workflow';
import { EmptyStateComponent, StatusChipComponent } from '../shared/components';

@Component({
  selector: 'app-documents',
  imports: [FormsModule, RouterLink, StatusChipComponent, EmptyStateComponent],
  template: `
    <div class="page-stack">
      <div class="notice">
        <i class="fa-solid fa-file-lines" aria-hidden="true"></i
        >{{ i18n.t('documents.notRealEdi') }}
      </div>
      <div class="documents-layout">
        <section class="card">
          <div class="card__header toolbar">
            <div class="filter-row">
              <button
                class="chip"
                [class.filter-active]="filter === 'all'"
                (click)="filter = 'all'"
              >
                {{ i18n.t('documents.all') }}</button><button
                class="chip"
                [class.filter-active]="filter === 'pending'"
                (click)="filter = 'pending'"
              >
                {{ i18n.t('documents.pending') }}</button
              ><button
                class="chip"
                [class.filter-active]="filter === 'error'"
                (click)="filter = 'error'"
              >
                {{ i18n.t('documents.errors') }}
              </button>
            </div>
            <button class="btn btn--primary" (click)="uploadOpen.set(true)">
              <i class="fa-solid fa-upload" aria-hidden="true"></i>{{ i18n.t('documents.upload') }}
            </button>
          </div>
          <div class="table-wrap">
            <table class="documents-table">
              <thead>
                <tr>
                  <th>{{ i18n.t('common.document') }}</th>
                  <th>{{ i18n.t('common.client') }}</th>
                  <th>{{ i18n.t('common.version') }}</th>
                  <th>{{ i18n.t('common.status') }}</th>
                </tr>
              </thead>
              <tbody>
                @for (document of documents(); track document.id) {
                  <tr [class.focused]="selectedId() === document.id">
                    <td>
                      <button class="table-link" (click)="selectedId.set(document.id)">
                        {{ i18n.text(document.title) }}</button><small
                        >{{ i18n.t(kindKey(document.kind)) }} ·
                        {{ format.date(document.createdAt) }}</small
                      >
                    </td>
                    <td>{{ clientName(document.clientId) }}</td>
                    <td class="mono">v{{ document.version }}</td>
                    <td><app-status-chip [status]="document.status" /></td>
                  </tr>
                } @empty {
                  <tr>
                    <td colspan="4"><app-empty-state [title]="i18n.t('documents.empty')" /></td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </section>
        <aside class="card document-detail">
          @if (selectedDocument(); as document) {
            <div class="card__header">
              <div>
                <span class="document-icon"
                  ><i class="fa-solid fa-file-contract" aria-hidden="true"></i
                ></span>
                <h2>{{ i18n.text(document.title) }}</h2>
                <p>{{ clientName(document.clientId) }} · {{ i18n.t(kindKey(document.kind)) }}</p>
              </div>
              <app-status-chip [status]="document.status" />
            </div>
            <span class="eyebrow">{{ i18n.t('documents.demoContent') }}</span>
            <p class="document-content">{{ i18n.text(document.content) }}</p>
            <div class="divider"></div>
            <h3>{{ i18n.t('documents.signingRoute') }}</h3>
            <div class="timeline compact">
              <div>
                <i class="fa-solid fa-circle-check positive" aria-hidden="true"></i>
                <p>{{ i18n.t('documents.internalReview') }}</p>
                <small>{{ format.date(document.createdAt) }}</small>
              </div>
              <div>
                <i
                  class="fa-solid"
                  [class.fa-circle-check]="document.status === 'signed'"
                  [class.fa-clock]="document.status !== 'signed'"
                  aria-hidden="true"
                ></i>
                <p>{{ i18n.t('documents.clientApproval') }}</p>
              </div>
              @if (document.status === 'signed') {
                <div>
                  <i class="fa-solid fa-circle-check positive" aria-hidden="true"></i>
                  <p>{{ i18n.t('documents.demoSignature') }}</p>
                </div>
              }
            </div>
            <div class="divider"></div>
            <h3>{{ i18n.t('documents.versions') }}</h3>
            <div class="version-row">
              @for (version of versions(document.version); track version) {
                <span class="chip" [class.chip--green]="version === document.version"
                  >v{{ version }}</span
                >
              }
            </div>
            <p class="small">{{ i18n.t('documents.versionDiff') }}</p>
            <div class="button-column">
              <button class="btn" (click)="compareVersions(document)">
                {{ i18n.t('contracts.versionCompare') }}
              </button>
              @if (document.projectId) {
                <a class="btn" [routerLink]="['/projects', document.projectId]">{{
                  i18n.t('documents.openOutcome')
                }}</a>
              } @else if (document.contractId) {
                <a class="btn" [routerLink]="['/contracts', document.contractId]">{{
                  i18n.t('common.viewContract')
                }}</a>
              } @else if (document.proposalId) {
                <a class="btn" [routerLink]="['/proposals', document.proposalId]">{{
                  i18n.t('common.viewProposal')
                }}</a>
              }
            </div>
            @if (linkedObligations().length) {
              <h3>{{ i18n.t('projects.obligations') }}</h3>
              @for (obligation of linkedObligations(); track obligation.id) {
                <a
                  class="linked-row"
                  routerLink="/obligations"
                  [queryParams]="{ focus: obligation.id }"
                  ><span>{{ i18n.text(obligation.title) }}</span
                  ><app-status-chip [status]="obligation.status"
                /></a>
              }
            }
          } @else {
            <app-empty-state [title]="i18n.t('documents.select')" />
          }
        </aside>
      </div>
    </div>
    @if (uploadOpen()) {
      <div class="modal-backdrop" (click)="uploadOpen.set(false)">
        <section
          class="modal"
          role="dialog"
          aria-modal="true"
          [attr.aria-label]="i18n.t('documents.uploadTitle')"
          (click)="$event.stopPropagation()"
        >
          <div class="card__header">
            <h2>{{ i18n.t('documents.uploadTitle') }}</h2>
            <button
              class="icon-button"
              (click)="uploadOpen.set(false)"
              [attr.aria-label]="i18n.t('common.close')"
            >
              <i class="fa-solid fa-xmark" aria-hidden="true"></i>
            </button>
          </div>
          <label class="field"
            ><span>{{ i18n.t('common.project') }}</span
            ><select [(ngModel)]="uploadProjectId">
              @for (project of store.state().projects; track project.id) {
                <option [value]="project.id">{{ i18n.text(project.name) }}</option>
              }
            </select></label
          ><label class="field upload-drop"
            ><span>{{ i18n.t('common.file') }}</span
            ><input
              #fileInput
              type="file"
              accept=".txt,.md,.csv,.json"
              (change)="fileSelected(fileInput.files)"
            /><small>{{ i18n.t('common.uploadHint') }}</small></label
          >
          @if (fileName) {
            <div class="notice notice--green">
              <i class="fa-solid fa-file" aria-hidden="true"></i>{{ fileName }}
            </div>
          }
          <label class="checkbox"
            ><input type="checkbox" [(ngModel)]="uploadInternal" />{{
              i18n.t('documents.internal')
            }}</label
          >
          <div class="modal__actions">
            <button class="btn" (click)="uploadOpen.set(false)">
              {{ i18n.t('common.cancel') }}</button><button
              class="btn btn--primary"
              [disabled]="!fileName"
              (click)="upload()"
            >
              {{ i18n.t('documents.upload') }}
            </button>
          </div>
        </section>
      </div>
    }
  `,
})
export class DocumentsComponent {
  filter = 'all';
  readonly selectedId = signal(
    inject(ActivatedRoute).snapshot.queryParamMap.get('selected') ??
      inject(AppStore).state().documents[0]?.id ??
      '',
  );
  readonly uploadOpen = signal(false);
  uploadProjectId = inject(AppStore).state().projects[0]?.id ?? '';
  uploadInternal = false;
  fileName = '';
  private fileContent = '';
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
  documents(): Document[] {
    return this.store
      .state()
      .documents.filter(
        (document) =>
          (this.session.role() !== 'project' || !['invoice', 'upd'].includes(document.kind)) &&
          (this.filter === 'all' ||
            (this.filter === 'pending' && document.status === 'pending_approval') ||
            (this.filter === 'error' && document.status === 'error')),
      );
  }
  selectedDocument(): Document | undefined {
    return (
      this.documents().find((document) => document.id === this.selectedId()) ?? this.documents()[0]
    );
  }
  clientName(id: string): string {
    const client = this.store.state().clients.find((item) => item.id === id);
    return client ? this.i18n.text(client.name) : id;
  }
  kindKey(kind: string): TranslationKey {
    const key = `documents.kind.${kind}`;
    return key in translations ? (key as TranslationKey) : 'common.document';
  }
  versions(count: number): number[] {
    return Array.from({ length: count }, (_, index) => index + 1);
  }
  linkedObligations() {
    const document = this.selectedDocument();
    return this.store
      .state()
      .obligations.filter(
        (obligation) =>
          obligation.id === document?.obligationId || obligation.closingDocumentId === document?.id,
      );
  }
  compareVersions(document: Document): void {
    this.workflow.createAiResult(
      'compare_versions',
      'document',
      document.id,
      this.workflow.actorForRole(this.session.role()),
    );
    void this.router.navigate(['/ai']);
  }
  async fileSelected(files: FileList | null): Promise<void> {
    const file = files?.[0];
    if (!file) return;
    try {
      this.fileContent = await file.text();
      this.fileName = file.name;
    } catch {
      this.ui.notify(this.i18n.t('documents.fileReadError'));
    }
  }
  upload(): void {
    const project = this.store.state().projects.find((item) => item.id === this.uploadProjectId);
    if (!project || !this.fileName) return;
    const state = this.store.state();
    const document: Document = {
      id: `document-upload-${state.documents.length + 1}`,
      clientId: project.clientId,
      projectId: project.id,
      kind: 'material',
      title: { ru: this.fileName, en: this.fileName },
      version: 1,
      status: 'ready',
      content: { ru: this.fileContent || this.fileName, en: this.fileContent || this.fileName },
      createdAt: '2026-05-14T12:00:00Z',
      internal: this.uploadInternal,
    };
    this.store.documents.add(document);
    this.store.recordActivity({
      id: `activity-${state.activities.length + 1}`,
      at: '2026-05-14T12:00:00Z',
      actorId: this.workflow.actorForRole(this.session.role()),
      action: {
        ru: 'Загружен документ в локальный реестр',
        en: 'Document uploaded to the local register',
      },
      entityType: 'document',
      entityId: document.id,
      internal: this.uploadInternal,
    });
    this.selectedId.set(document.id);
    this.uploadOpen.set(false);
    this.fileName = '';
    this.ui.notify(this.i18n.t('documents.uploaded'));
  }
}
