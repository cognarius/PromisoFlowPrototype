import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { calculateInvoiceBalance, calculateProposalTotals } from '../core/finance';
import { FormatService } from '../core/format';
import { I18nService } from '../core/i18n';
import { Client, LocalizedText } from '../core/models';
import { SessionService } from '../core/session';
import { AppStore } from '../core/store';
import { UiService } from '../core/ui';
import { WorkflowService } from '../core/workflow';
import { EmptyStateComponent, StatusChipComponent } from '../shared/components';

@Component({
  selector: 'app-clients',
  imports: [FormsModule, RouterLink, EmptyStateComponent],
  template: `
    <section class="card">
      <div class="card__header toolbar">
        <label class="search-field"
          ><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i
          ><span class="sr-only">{{ i18n.t('common.search') }}</span
          ><input [(ngModel)]="query" [placeholder]="i18n.t('common.searchPlaceholder')"
        /></label>
        @if (session.canManageSales()) {
          <button class="btn btn--primary" (click)="openCreate()">
            <i class="fa-solid fa-plus" aria-hidden="true"></i>{{ i18n.t('clients.create') }}
          </button>
        }
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{{ i18n.t('common.client') }}</th>
              <th>{{ i18n.t('common.segment') }}</th>
              <th>{{ i18n.t('common.owner') }}</th>
              <th>{{ i18n.t('nav.proposals') }}</th>
              @if (session.canSeeFinance()) {
                <th class="numeric">{{ i18n.t('clients.outstanding') }}</th>
              }
              <th>{{ i18n.t('common.actions') }}</th>
            </tr>
          </thead>
          <tbody>
            @for (client of filtered(); track client.id) {
              <tr>
                <td>
                  <a class="table-primary" [routerLink]="['/clients', client.id]">{{
                    i18n.text(client.name)
                  }}</a><small>{{ client.contactName }} · {{ client.email }}</small>
                </td>
                <td>{{ i18n.text(client.segment) }}</td>
                <td>{{ userName(client.ownerId) }}</td>
                <td>{{ proposalCount(client.id) }}</td>
                @if (session.canSeeFinance()) {
                  <td class="numeric money">{{ format.money(outstanding(client.id)) }}</td>
                }
                <td>
                  @if (session.canManageSales()) {
                    <a
                      class="btn btn--small"
                      [routerLink]="['/proposals/new']"
                      [queryParams]="{ client: client.id }"
                      >{{ i18n.t('common.newProposal') }}</a
                    >
                  } @else {
                    <a class="btn btn--small" [routerLink]="['/clients', client.id]">{{
                      i18n.t('common.open')
                    }}</a>
                  }
                </td>
              </tr>
            } @empty {
              <tr>
                <td colspan="6">
                  <app-empty-state
                    [title]="query ? i18n.t('common.noResults') : i18n.t('clients.empty')"
                  />
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </section>
    @if (editorOpen()) {
      <div class="modal-backdrop" (click)="editorOpen.set(false)">
        <section
          class="modal"
          role="dialog"
          aria-modal="true"
          [attr.aria-label]="i18n.t('clients.create')"
          (click)="$event.stopPropagation()"
        >
          <div class="card__header">
            <h2>{{ i18n.t(editingId ? 'clients.edit' : 'clients.create') }}</h2>
            <button
              class="icon-button"
              (click)="editorOpen.set(false)"
              [attr.aria-label]="i18n.t('common.close')"
            >
              <i class="fa-solid fa-xmark" aria-hidden="true"></i>
            </button>
          </div>
          <div class="form-grid">
            <label class="field"
              ><span>{{ i18n.t('common.clientName') }} *</span
              ><input [(ngModel)]="form.name" [attr.aria-invalid]="submitted && !form.name" />
              @if (submitted && !form.name) {
                <small class="field-error">{{ i18n.t('common.required') }}</small>
              }
            </label>
            <label class="field"
              ><span>{{ i18n.t('common.legalName') }}</span
              ><input [(ngModel)]="form.legalName"
            /></label>
            <label class="field"
              ><span>{{ i18n.t('common.contact') }} *</span
              ><input
                [(ngModel)]="form.contactName"
                [attr.aria-invalid]="submitted && !form.contactName"
            /></label>
            <label class="field"
              ><span>{{ i18n.t('common.email') }} *</span
              ><input
                type="email"
                [(ngModel)]="form.email"
                [attr.aria-invalid]="submitted && !validEmail()"
              />
              @if (submitted && !validEmail()) {
                <small class="field-error">{{ i18n.t('common.invalidEmail') }}</small>
              }
            </label>
            <label class="field"
              ><span>{{ i18n.t('common.phone') }}</span
              ><input [(ngModel)]="form.phone"
            /></label>
            <label class="field"
              ><span>{{ i18n.t('common.segment') }}</span
              ><input
                [(ngModel)]="form.segment"
                [placeholder]="i18n.t('clients.segmentPlaceholder')"
            /></label>
          </div>
          <div class="modal__actions">
            <button class="btn" (click)="editorOpen.set(false)">
              {{ i18n.t('common.cancel') }}</button><button
              class="btn btn--primary"
              (click)="save()"
            >
              {{ i18n.t('common.save') }}
            </button>
          </div>
        </section>
      </div>
    }
  `,
})
export class ClientsComponent {
  query = '';
  readonly editorOpen = signal(false);
  editingId?: string;
  submitted = false;
  form = this.emptyForm();
  constructor(
    readonly i18n: I18nService,
    readonly format: FormatService,
    readonly store: AppStore,
    readonly session: SessionService,
    private readonly workflow: WorkflowService,
    private readonly ui: UiService,
  ) {}
  filtered(): Client[] {
    const query = this.query.toLowerCase();
    return this.store
      .state()
      .clients.filter(
        (client) =>
          !query ||
          [
            this.i18n.text(client.name),
            client.contactName,
            client.email,
            this.i18n.text(client.segment),
          ].some((value) => value.toLowerCase().includes(query)),
      );
  }
  userName(id: string): string {
    return this.store.state().users.find((user) => user.id === id)?.name ?? id;
  }
  proposalCount(id: string): number {
    return this.store.state().proposals.filter((proposal) => proposal.clientId === id).length;
  }
  outstanding(id: string): number {
    const state = this.store.state();
    return state.invoices
      .filter((invoice) => invoice.clientId === id && invoice.status !== 'draft')
      .reduce(
        (sum, invoice) => sum + calculateInvoiceBalance(invoice, state.payments).outstanding,
        0,
      );
  }
  openCreate(): void {
    this.editingId = undefined;
    this.form = this.emptyForm();
    this.submitted = false;
    this.editorOpen.set(true);
  }
  validEmail(): boolean {
    return /^\S+@\S+\.\S+$/.test(this.form.email);
  }
  save(): void {
    this.submitted = true;
    if (!this.form.name || !this.form.contactName || !this.validEmail()) return;
    if (this.editingId) {
      const client = this.store.clients.get(this.editingId);
      if (client) {
        const lang = this.i18n.shortLanguage();
        const update = (value: LocalizedText, replacement: string): LocalizedText => ({
          ...value,
          [lang]: replacement,
        });
        this.store.clients.update(client.id, {
          name: update(client.name, this.form.name),
          legalName: update(client.legalName, this.form.legalName || this.form.name),
          segment: update(client.segment, this.form.segment),
          contactName: this.form.contactName,
          email: this.form.email,
          phone: this.form.phone,
        });
      }
    } else
      this.workflow.createClient({
        ...this.form,
        ownerId: 'user-sales',
        language: this.i18n.shortLanguage(),
      });
    this.editorOpen.set(false);
    this.ui.notify(this.i18n.t('common.saved'));
  }
  private emptyForm(): {
    name: string;
    legalName: string;
    contactName: string;
    email: string;
    phone: string;
    segment: string;
  } {
    return { name: '', legalName: '', contactName: '', email: '', phone: '', segment: '' };
  }
}

@Component({
  selector: 'app-client-detail',
  imports: [RouterLink, StatusChipComponent, EmptyStateComponent],
  template: `
    @if (client(); as client) {
      <div class="page-stack">
        <section class="card detail-heading">
          <div>
            <span class="eyebrow">{{ i18n.text(client.legalName) }}</span>
            <h2>{{ i18n.text(client.name) }}</h2>
            <p>{{ client.contactName }} · {{ client.email }} · {{ client.phone }}</p>
          </div>
          <div class="button-row">
            <a class="btn" routerLink="/clients">{{ i18n.t('common.back') }}</a>
            @if (session.canManageSales()) {
              <a
                class="btn btn--primary"
                [routerLink]="['/proposals/new']"
                [queryParams]="{ client: client.id }"
                >{{ i18n.t('common.newProposal') }}</a
              >
            }
          </div>
        </section>
        @if (session.canSeeFinance()) {
          <section class="metric-grid metric-grid--three">
            <div class="card card--compact">
              <span class="small">{{ i18n.t('clients.totalRevenue') }}</span><strong
                class="stat-value"
                >{{ format.money(revenue()) }}</strong
              >
            </div>
            <div class="card card--compact">
              <span class="small">{{ i18n.t('clients.outstanding') }}</span><strong
                class="stat-value"
                >{{ format.money(outstanding()) }}</strong
              >
            </div>
            <div class="card card--compact">
              <span class="small">{{ i18n.t('clients.repeatPotential') }}</span><strong
                class="stat-value"
                >{{ format.percent(client.repeatPotential * 100) }}</strong
              >
            </div>
          </section>
        }
        <div class="two-columns">
          <section class="card">
            <div class="card__header">
              <h2>{{ i18n.t('clients.lifecycle') }}</h2>
              <span class="small">{{ i18n.t('clients.related') }}</span>
            </div>
            @for (proposal of proposals(); track proposal.id) {
              <div class="linked-row">
                <a [routerLink]="['/proposals', proposal.id]"
                  ><strong>{{ i18n.text(proposal.title) }}</strong
                  ><small
                    >{{ i18n.t('common.proposal') }} ·
                    {{ format.money(totals(proposal.id)) }}</small
                  ></a
                ><app-status-chip [status]="proposal.status" />
              </div>
            }
            @for (project of projects(); track project.id) {
              <div class="linked-row">
                <a [routerLink]="['/projects', project.id]"
                  ><strong>{{ i18n.text(project.name) }}</strong
                  ><small
                    >{{ i18n.t('common.project') }} · {{ format.date(project.dueDate) }}</small
                  ></a
                ><app-status-chip [status]="project.status" />
              </div>
            }
            @if (!proposals().length && !projects().length) {
              <app-empty-state [title]="i18n.t('clients.empty')" />
            }
          </section>
          <section class="card">
            <h2>{{ i18n.t('clients.activity') }}</h2>
            <div class="timeline">
              @for (activity of activities(); track activity.id) {
                <div>
                  <span class="timeline__dot"></span>
                  <p>{{ i18n.text(activity.action) }}</p>
                  <small>{{ format.dateTime(activity.at) }}</small>
                </div>
              } @empty {
                <p class="muted">{{ i18n.t('common.empty') }}</p>
              }
            </div>
          </section>
        </div>
        <section class="card">
          <div class="card__header">
            <h2>{{ i18n.t('money.invoicesPayments') }}</h2>
            <a class="btn btn--small" routerLink="/money">{{ i18n.t('common.viewAll') }}</a>
          </div>
          @for (invoice of invoices(); track invoice.id) {
            <div class="linked-row">
              <a routerLink="/money" [queryParams]="{ invoice: invoice.id }"
                ><strong>{{ i18n.t('common.invoice') }} {{ invoice.number }}</strong
                ><small>{{ format.date(invoice.dueDate) }}</small></a
              ><span class="money">{{ format.money(invoice.amount) }}</span
              ><app-status-chip [status]="invoice.status" />
            </div>
          }
        </section>
      </div>
    } @else {
      <app-empty-state
        [title]="i18n.t('common.notFound')"
        route="/clients"
        [actionLabel]="i18n.t('common.back')"
      />
    }
  `,
})
export class ClientDetailComponent {
  private readonly id = inject(ActivatedRoute).snapshot.paramMap.get('id') ?? '';
  constructor(
    readonly i18n: I18nService,
    readonly format: FormatService,
    readonly store: AppStore,
    readonly session: SessionService,
    private readonly route: ActivatedRoute,
  ) {}
  client(): Client | undefined {
    return this.store.state().clients.find((client) => client.id === this.id);
  }
  proposals() {
    return this.store.state().proposals.filter((proposal) => proposal.clientId === this.id);
  }
  projects() {
    return this.store.state().projects.filter((project) => project.clientId === this.id);
  }
  invoices() {
    return this.store.state().invoices.filter((invoice) => invoice.clientId === this.id);
  }
  totals(id: string): number {
    const proposal = this.store.state().proposals.find((item) => item.id === id);
    return proposal ? calculateProposalTotals(proposal).plannedRevenue : 0;
  }
  revenue(): number {
    return this.proposals()
      .filter((proposal) => proposal.status === 'converted')
      .reduce((sum, proposal) => sum + calculateProposalTotals(proposal).plannedRevenue, 0);
  }
  outstanding(): number {
    const state = this.store.state();
    return this.invoices()
      .filter((invoice) => invoice.status !== 'draft')
      .reduce(
        (sum, invoice) => sum + calculateInvoiceBalance(invoice, state.payments).outstanding,
        0,
      );
  }
  activities() {
    const state = this.store.state();
    const ids = new Set([
      this.id,
      ...this.proposals().map((item) => item.id),
      ...this.projects().map((item) => item.id),
      ...this.invoices().map((item) => item.id),
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
