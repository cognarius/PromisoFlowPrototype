import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { calculateProposalTotals } from '../core/finance';
import { FormatService } from '../core/format';
import { I18nService } from '../core/i18n';
import { Contract, Obligation } from '../core/models';
import { SessionService } from '../core/session';
import { AppStore } from '../core/store';
import { UiService } from '../core/ui';
import { WorkflowService } from '../core/workflow';
import { EmptyStateComponent, LifecycleComponent, StatusChipComponent } from '../shared/components';

@Component({
  selector: 'app-contracts',
  imports: [RouterLink, StatusChipComponent, EmptyStateComponent],
  template: `<section class="card">
    <div class="card__header">
      <div>
        <h2>{{ i18n.t('page.contracts.title') }}</h2>
        <p class="small">{{ i18n.t('contracts.projectAuto') }}</p>
      </div>
      @if (session.canManageSales()) {
        <a class="btn btn--primary" routerLink="/proposals">{{ i18n.t('common.newProposal') }}</a>
      }
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>{{ i18n.t('common.contract') }}</th>
            <th>{{ i18n.t('common.client') }}</th>
            <th>{{ i18n.t('common.status') }}</th>
            <th>{{ i18n.t('common.version') }}</th>
            <th>{{ i18n.t('common.date') }}</th>
            <th>{{ i18n.t('common.project') }}</th>
          </tr>
        </thead>
        <tbody>
          @for (contract of store.state().contracts; track contract.id) {
            <tr>
              <td>
                <a class="table-primary" [routerLink]="['/contracts', contract.id]">{{
                  contract.number
                }}</a><small>{{ proposalTitle(contract) }}</small>
              </td>
              <td>{{ clientName(contract.clientId) }}</td>
              <td><app-status-chip [status]="contract.status" /></td>
              <td class="mono">v{{ contract.version }}</td>
              <td>{{ format.date(contract.createdAt) }}</td>
              <td>
                @if (projectId(contract.id); as id) {
                  <a class="btn btn--small" [routerLink]="['/projects', id]">{{
                    i18n.t('common.viewProject')
                  }}</a>
                } @else {
                  <span class="muted">—</span>
                }
              </td>
            </tr>
          } @empty {
            <tr>
              <td colspan="6"><app-empty-state [title]="i18n.t('contracts.empty')" /></td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  </section>`,
})
export class ContractsComponent {
  constructor(
    readonly i18n: I18nService,
    readonly format: FormatService,
    readonly store: AppStore,
    readonly session: SessionService,
  ) {}
  proposalTitle(contract: Contract): string {
    const proposal = this.store.state().proposals.find((item) => item.id === contract.proposalId);
    return proposal ? this.i18n.text(proposal.title) : '';
  }
  clientName(id: string): string {
    const client = this.store.state().clients.find((item) => item.id === id);
    return client ? this.i18n.text(client.name) : id;
  }
  projectId(contractId: string): string | undefined {
    return this.store.state().projects.find((project) => project.contractId === contractId)?.id;
  }
}

@Component({
  selector: 'app-contract-detail',
  imports: [FormsModule, RouterLink, StatusChipComponent, EmptyStateComponent, LifecycleComponent],
  template: `
    @if (contract(); as contract) {
      <div class="page-stack">
        <section class="card">
          <div class="card__header">
            <div>
              <span class="eyebrow">{{ i18n.t('deals.outcomeCycle') }}</span>
              <h2>{{ proposalTitle() }}</h2>
              <p class="small">{{ i18n.t('deals.wonNotFinal') }}</p>
            </div>
            <span class="chip chip--green">{{ i18n.t('common.demo') }}</span>
          </div>
          <app-lifecycle [current]="lifecycleStage()" />
        </section>
        <section class="card detail-heading">
          <div>
            <span class="eyebrow"
              >{{ i18n.t('contracts.createdFrom') }}
              <a [routerLink]="['/proposals', contract.proposalId]">{{
                i18n.t('common.proposal')
              }}</a></span
            >
            <h2>{{ i18n.t('common.contract') }} {{ contract.number }}</h2>
            <p>{{ clientName() }} · {{ i18n.t('common.version') }} {{ contract.version }}</p>
          </div>
          <div class="button-row">
            <app-status-chip [status]="contract.status" />
            @if (session.canSeeFinance()) {
              <strong class="stat-value">{{ format.money(amount()) }}</strong>
            }
          </div>
        </section>
        <div class="two-columns two-columns--wide-left">
          <div class="page-stack">
            <section class="card">
              <div class="card__header">
                <div>
                  <h2>{{ i18n.t('contracts.extractedTerms') }}</h2>
                  <p class="small">{{ i18n.t('contracts.extractionHint') }}</p>
                </div>
                @if (contract.extractedByAi) {
                  <span class="chip chip--amber"
                    ><i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i
                    >{{ i18n.t('nav.ai') }}</span
                  >
                }
              </div>
              @if (contract.status === 'signed') {
                @for (obligation of obligations(); track obligation.id) {
                  <article
                    class="obligation-row"
                    [class.obligation-row--pending]="obligation.confirmationStatus === 'pending'"
                  >
                    <i
                      class="fa-solid"
                      [class.fa-circle-check]="obligation.status === 'completed'"
                      [class.fa-clock]="obligation.status !== 'completed'"
                      aria-hidden="true"
                    ></i>
                    <div>
                      <h3>{{ i18n.text(obligation.title) }}</h3>
                      <p>
                        {{ format.date(obligation.dueDate) }} · {{ i18n.text(obligation.source) }}
                      </p>
                      @if (session.canSeeFinance() && obligation.amount !== undefined) {
                        <strong class="money">{{ format.money(obligation.amount) }}</strong>
                      }
                    </div>
                    <app-status-chip [status]="obligation.confirmationStatus" />
                    @if (session.canManageDelivery()) {
                      <button class="btn btn--small" (click)="editTerm(obligation)">
                        {{ i18n.t('contracts.editTerm') }}
                      </button>
                    }
                  </article>
                }
                <div class="notice notice--amber">
                  <i class="fa-solid fa-user-check" aria-hidden="true"></i
                  ><span>{{ i18n.t('ai.humanControl') }}</span>
                </div>
                @if (contract.extractionStatus === 'pending' && session.canManageDelivery()) {
                  <button class="btn btn--primary" (click)="confirmTerms()">
                    {{ i18n.t('contracts.confirmTerms') }}
                  </button>
                } @else {
                  <div class="notice notice--green">
                    <i class="fa-solid fa-circle-check" aria-hidden="true"></i
                    >{{ i18n.t('contracts.termsConfirmed') }} · {{ confirmedBy() }}
                  </div>
                }
              } @else {
                <app-empty-state
                  [title]="i18n.t('contracts.projectAuto')"
                  icon="fa-solid fa-file-signature"
                />
              }
            </section>
            @if (project()) {
              <section class="card">
                <div class="card__header">
                  <h2>{{ i18n.t('projects.financialCalendar') }}</h2>
                  <a class="btn btn--small" [routerLink]="['/projects', project()!.id]">{{
                    i18n.t('common.viewProject')
                  }}</a>
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
                    <app-status-chip [status]="event.status" />
                  </div>
                }
              </section>
            }
          </div>
          <aside class="page-stack">
            <section class="card">
              <h2>{{ i18n.t('common.workflow') }}</h2>
              <div class="button-column">
                @if (contract.status === 'awaiting_signature' && session.canManageSales()) {
                  <button class="btn btn--primary" (click)="sign()">
                    <i class="fa-solid fa-signature" aria-hidden="true"></i
                    >{{ i18n.t('contracts.sign') }}
                  </button>
                }
                @if (project()) {
                  <a class="btn" [routerLink]="['/projects', project()!.id]">{{
                    i18n.t('common.viewProject')
                  }}</a>
                }
                <button class="btn" (click)="compareVersions()">
                  <i class="fa-solid fa-code-compare" aria-hidden="true"></i
                  >{{ i18n.t('contracts.versionCompare') }}
                </button>
              </div>
              <p class="small">{{ i18n.t('common.demoSignature') }}</p>
            </section>
            @if (document(); as document) {
              <section class="card">
                <div class="card__header">
                  <h2>{{ i18n.text(document.title) }}</h2>
                  <app-status-chip [status]="document.status" />
                </div>
                <p class="document-content">{{ i18n.text(document.content) }}</p>
                <div class="version-row">
                  @for (version of versions(document.version); track version) {
                    <span class="chip" [class.chip--green]="version === document.version"
                      >v{{ version }}</span
                    >
                  }
                </div>
                <a
                  class="btn btn--ghost"
                  routerLink="/documents"
                  [queryParams]="{ selected: document.id }"
                  >{{ i18n.t('common.details') }}</a
                >
              </section>
            }
            @if (session.canSeeFinance()) {
              @for (result of aiResults(); track result.id) {
                <section class="card ai-card">
                  <span class="eyebrow">{{ i18n.t('ai.kind.extract_terms') }}</span>
                  <p>{{ i18n.text(result.result) }}</p>
                  <small
                    >{{ i18n.text(result.source) }} ·
                    {{
                      i18n.t('common.percentConfidence', {
                        value: format.number(result.confidence * 100),
                      })
                    }}</small
                  >
                </section>
              }
            }
          </aside>
        </div>
      </div>
      @if (editing(); as term) {
        <div class="modal-backdrop" (click)="editing.set(null)">
          <section
            class="modal"
            role="dialog"
            aria-modal="true"
            [attr.aria-label]="i18n.t('contracts.editTerm')"
            (click)="$event.stopPropagation()"
          >
            <h2>{{ i18n.t('contracts.editTerm') }}</h2>
            <p>{{ i18n.text(term.obligation.title) }}</p>
            <label class="field"
              ><span>{{ i18n.t('common.dueDate') }}</span
              ><input type="date" [(ngModel)]="term.dueDate"
            /></label>
            @if (session.canSeeFinance() && term.obligation.amount !== undefined) {
              <label class="field"
                ><span>{{ i18n.t('common.amount') }}</span
                ><input type="number" min="0" [(ngModel)]="term.amount"
              /></label>
            }
            <div class="modal__actions">
              <button class="btn" (click)="editing.set(null)">
                {{ i18n.t('common.cancel') }}</button><button
                class="btn btn--primary"
                (click)="saveTerm()"
              >
                {{ i18n.t('contracts.saveTerm') }}
              </button>
            </div>
          </section>
        </div>
      }
    } @else {
      <app-empty-state
        [title]="i18n.t('common.notFound')"
        route="/contracts"
        [actionLabel]="i18n.t('common.back')"
      />
    }
  `,
})
export class ContractDetailComponent {
  private readonly id = inject(ActivatedRoute).snapshot.paramMap.get('id') ?? '';
  readonly editing = signal<{ obligation: Obligation; dueDate: string; amount?: number } | null>(
    null,
  );
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
  contract(): Contract | undefined {
    return this.store.state().contracts.find((contract) => contract.id === this.id);
  }
  proposalTitle(): string {
    const proposal = this.store
      .state()
      .proposals.find((item) => item.id === this.contract()?.proposalId);
    return proposal ? this.i18n.text(proposal.title) : '';
  }
  clientName(): string {
    const client = this.store.state().clients.find((item) => item.id === this.contract()?.clientId);
    return client ? this.i18n.text(client.name) : '';
  }
  amount(): number {
    const proposal = this.store
      .state()
      .proposals.find((item) => item.id === this.contract()?.proposalId);
    return proposal ? calculateProposalTotals(proposal).plannedRevenue : 0;
  }
  project() {
    return this.store.state().projects.find((project) => project.contractId === this.id);
  }
  obligations(): Obligation[] {
    return this.store
      .state()
      .obligations.filter((obligation) => obligation.projectId === this.project()?.id);
  }
  financialEvents() {
    return this.store
      .state()
      .financialEvents.filter((event) => event.projectId === this.project()?.id);
  }
  document() {
    return this.store
      .state()
      .documents.find(
        (document) => document.contractId === this.id && document.kind === 'contract',
      );
  }
  aiResults() {
    return this.store
      .state()
      .aiResults.filter((result) => result.kind === 'extract_terms' && result.entityId === this.id);
  }
  versions(count: number): number[] {
    return Array.from({ length: count }, (_, index) => index + 1);
  }
  obligationTitle(id?: string): string {
    const obligation = this.store.state().obligations.find((item) => item.id === id);
    return obligation ? this.i18n.text(obligation.title) : '';
  }
  confirmedBy(): string {
    const user = this.store.state().users.find((item) => item.id === this.contract()?.confirmedBy);
    return user?.name ?? this.i18n.t('common.confirmationRequired');
  }
  lifecycleStage(): number {
    if (!this.contract()) return 0;
    if (this.contract()!.status !== 'signed') return 1;
    const invoices = this.store
      .state()
      .invoices.filter((invoice) => invoice.projectId === this.project()?.id);
    if (invoices.some((invoice) => invoice.status === 'paid')) return 6;
    if (invoices.length) return 4;
    return 2;
  }
  sign(): void {
    try {
      this.workflow.signContract(this.id, this.workflow.actorForRole(this.session.role()));
      this.ui.notify(this.i18n.t('contracts.signedDemo'));
    } catch {
      this.ui.notify(this.i18n.t('common.invalidOperation'));
    }
  }
  confirmTerms(): void {
    this.workflow.confirmContractTerms(this.id, this.workflow.actorForRole(this.session.role()));
    this.ui.notify(this.i18n.t('contracts.termsConfirmed'));
  }
  editTerm(obligation: Obligation): void {
    this.editing.set({ obligation, dueDate: obligation.dueDate, amount: obligation.amount });
  }
  saveTerm(): void {
    const value = this.editing();
    if (!value?.dueDate || (value.amount !== undefined && value.amount < 0)) return;
    this.workflow.updateObligation(
      value.obligation.id,
      value.dueDate,
      value.amount,
      this.workflow.actorForRole(this.session.role()),
    );
    this.editing.set(null);
    this.ui.notify(this.i18n.t('common.saved'));
  }
  compareVersions(): void {
    const document = this.document();
    if (!document) return;
    this.workflow.createAiResult(
      'compare_versions',
      'document',
      document.id,
      this.workflow.actorForRole(this.session.role()),
    );
    this.ui.notify(this.i18n.t('contracts.versionCompared'));
    void this.router.navigate(['/ai']);
  }
}
