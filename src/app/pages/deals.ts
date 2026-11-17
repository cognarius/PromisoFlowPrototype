import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { calculateProposalTotals } from '../core/finance';
import { FormatService } from '../core/format';
import { I18nService } from '../core/i18n';
import { Proposal } from '../core/models';
import { SessionService } from '../core/session';
import { AppStore } from '../core/store';
import { EmptyStateComponent, LifecycleComponent, StatusChipComponent } from '../shared/components';

@Component({
  selector: 'app-deals',
  imports: [RouterLink, LifecycleComponent, StatusChipComponent, EmptyStateComponent],
  template: `
    <div class="page-stack">
      <section class="card">
        <div class="card__header">
          <div>
            <span class="eyebrow">{{ i18n.t('deals.outcomeCycle') }}</span>
            <h2>{{ i18n.t('deals.wonNotFinal') }}</h2>
          </div>
          @if (session.canManageSales()) {
            <a class="btn btn--primary" routerLink="/proposals/new">{{
              i18n.t('common.newProposal')
            }}</a>
          }
        </div>
        <app-lifecycle [current]="1" />
      </section>
      <section class="card">
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{{ i18n.t('common.client') }}</th>
                <th>{{ i18n.t('common.proposal') }}</th>
                <th>{{ i18n.t('common.status') }}</th>
                @if (session.canSeeFinance()) {
                  <th class="numeric">{{ i18n.t('common.revenue') }}</th>
                  <th class="numeric">{{ i18n.t('proposals.plannedMargin') }}</th>
                }
                <th>{{ i18n.t('common.nextAction') }}</th>
              </tr>
            </thead>
            <tbody>
              @for (proposal of store.state().proposals; track proposal.id) {
                <tr>
                  <td>{{ clientName(proposal.clientId) }}</td>
                  <td>
                    @if (session.canManageSales()) {
                      <a class="table-primary" [routerLink]="['/proposals', proposal.id]">{{
                        i18n.text(proposal.title)
                      }}</a>
                    } @else {
                      <strong>{{ i18n.text(proposal.title) }}</strong>
                    }
                    <small>{{ format.date(proposal.createdAt) }}</small>
                  </td>
                  <td><app-status-chip [status]="stageStatus(proposal)" /></td>
                  @if (session.canSeeFinance()) {
                    <td class="numeric money">
                      {{ format.money(totals(proposal).plannedRevenue) }}
                    </td>
                    <td class="numeric money">
                      {{ format.money(totals(proposal).plannedMargin) }}
                    </td>
                  }
                  <td>
                    <a class="btn btn--small" [routerLink]="currentRoute(proposal)">{{
                      i18n.t('deals.openOutcome')
                    }}</a>
                  </td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="6"><app-empty-state [title]="i18n.t('deals.noDeals')" /></td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </section>
    </div>
  `,
})
export class DealsComponent {
  constructor(
    readonly i18n: I18nService,
    readonly format: FormatService,
    readonly store: AppStore,
    readonly session: SessionService,
  ) {}
  totals(proposal: Proposal): ReturnType<typeof calculateProposalTotals> {
    return calculateProposalTotals(proposal);
  }
  clientName(id: string): string {
    const client = this.store.state().clients.find((item) => item.id === id);
    return client ? this.i18n.text(client.name) : id;
  }
  stageStatus(proposal: Proposal): string {
    const contract = this.store.state().contracts.find((item) => item.proposalId === proposal.id);
    const project = this.store.state().projects.find((item) => item.contractId === contract?.id);
    if (project) return project.status;
    return contract?.status ?? proposal.status;
  }
  currentRoute(proposal: Proposal): string[] {
    const state = this.store.state();
    const contract = state.contracts.find((item) => item.proposalId === proposal.id);
    const project = state.projects.find((item) => item.contractId === contract?.id);
    if (project) return ['/projects', project.id];
    if (contract) return ['/contracts', contract.id];
    return this.session.canManageSales() ? ['/proposals', proposal.id] : ['/projects'];
  }
}
