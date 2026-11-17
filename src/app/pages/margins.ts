import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ActivatedRoute } from '@angular/router';
import { calculateProjectMargin } from '../core/finance';
import { FormatService } from '../core/format';
import { I18nService } from '../core/i18n';
import { metricCompleteness } from '../core/metrics';
import { Project } from '../core/models';
import { AppStore } from '../core/store';
import { UiService } from '../core/ui';
import { WorkflowService } from '../core/workflow';
import { EmptyStateComponent, StatusChipComponent } from '../shared/components';

@Component({
  selector: 'app-margins',
  imports: [RouterLink, EmptyStateComponent],
  template: `
    <div class="page-stack">
      <section class="card">
        <div class="card__header">
          <div>
            <h2>{{ i18n.t('margins.registry') }}</h2>
            <p class="small">{{ i18n.t('margins.cashNote') }}</p>
          </div>
          <span class="chip chip--green">{{ i18n.t('common.metricSource') }}</span>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{{ i18n.t('common.project') }}</th>
                <th class="numeric">{{ i18n.t('proposals.plannedMargin') }}</th>
                <th class="numeric">{{ i18n.t('margins.actualCosts') }}</th>
                <th class="numeric">{{ i18n.t('margins.actualMargin') }}</th>
                <th class="numeric">{{ i18n.t('margins.marginPercent') }}</th>
                <th class="numeric">{{ i18n.t('margins.variance') }}</th>
                <th class="numeric">{{ i18n.t('margins.cashReceived') }}</th>
              </tr>
            </thead>
            <tbody>
              @for (project of store.state().projects; track project.id) {
                @if (margin(project.id); as margin) {
                  <tr [class.focused]="selectedProjectId() === project.id">
                    <td>
                      <button class="table-link" (click)="selectedProjectId.set(project.id)">
                        {{ i18n.text(project.name) }}</button><small>{{
                        clientName(project.clientId)
                      }}</small>
                    </td>
                    <td class="numeric money">{{ format.money(margin.plannedMargin) }}</td>
                    <td class="numeric money">{{ format.money(margin.actualCosts) }}</td>
                    <td class="numeric money">{{ format.money(margin.actualMargin) }}</td>
                    <td class="numeric">{{ format.percent(margin.actualMarginPercentage) }}</td>
                    <td
                      class="numeric money"
                      [class.negative]="margin.marginVariance < 0"
                      [class.positive]="margin.marginVariance > 0"
                    >
                      {{ varianceSymbol(margin.marginVariance) }}
                      {{ format.money(margin.marginVariance) }}
                    </td>
                    <td class="numeric money">{{ format.money(margin.cashReceived) }}</td>
                  </tr>
                }
              } @empty {
                <tr>
                  <td colspan="7"><app-empty-state [title]="i18n.t('margins.empty')" /></td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </section>
      @if (selectedProject(); as project) {
        @if (margin(project.id); as margin) {
          <div class="two-columns">
            <section class="card">
              <div class="card__header">
                <div>
                  <span class="eyebrow">{{ i18n.t('common.project') }}</span>
                  <h2>{{ i18n.text(project.name) }}</h2>
                </div>
                <a class="btn btn--small" [routerLink]="['/projects', project.id]">{{
                  i18n.t('common.viewProject')
                }}</a>
              </div>
              <div class="margin-comparison">
                <div>
                  <span>{{ i18n.t('proposals.plannedMargin') }}</span><strong>{{
                    format.money(margin.plannedMargin)
                  }}</strong
                  ><small>{{ format.percent(margin.plannedMarginPercentage) }}</small>
                </div>
                <div>
                  <span>{{ i18n.t('margins.actualMargin') }}</span><strong>{{
                    format.money(margin.actualMargin)
                  }}</strong
                  ><small>{{ format.percent(margin.actualMarginPercentage) }}</small>
                </div>
                <div
                  [class.margin-negative]="margin.marginVariance < 0"
                  [class.margin-positive]="margin.marginVariance > 0"
                >
                  <span>{{ i18n.t('margins.variance') }}</span><strong
                    >{{ varianceSymbol(margin.marginVariance) }}
                    {{ format.money(margin.marginVariance) }}</strong
                  ><small>{{ varianceLabel(margin.marginVariance) }}</small>
                </div>
              </div>
              <dl class="finance-list">
                <div>
                  <dt>{{ i18n.t('margins.actualRevenue') }}</dt>
                  <dd>{{ format.money(margin.actualRevenue) }}</dd>
                </div>
                <div>
                  <dt>{{ i18n.t('proposals.plannedCosts') }}</dt>
                  <dd>{{ format.money(margin.plannedDirectCosts) }}</dd>
                </div>
                <div>
                  <dt>{{ i18n.t('margins.actualCosts') }}</dt>
                  <dd>{{ format.money(margin.actualCosts) }}</dd>
                </div>
                <div>
                  <dt>{{ i18n.t('margins.cashReceived') }}</dt>
                  <dd>{{ format.money(margin.cashReceived) }}</dd>
                </div>
              </dl>
              <div
                class="notice"
                [class.notice--amber]="margin.marginVariance < 0"
                [class.notice--green]="margin.marginVariance >= 0"
              >
                <i class="fa-solid fa-circle-info" aria-hidden="true"></i>
                <div>
                  <strong>{{ i18n.t('margins.explanation') }}</strong>
                  <p>{{ explanation(project.id) }}</p>
                  <p>{{ i18n.t('margins.recommendation') }}</p>
                </div>
              </div>
              <div class="button-row">
                <button class="btn btn--primary" (click)="explainWithAi(project.id)">
                  <i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i
                  >{{ i18n.t('margins.explainWithAi') }}</button
                ><a class="btn" [routerLink]="['/projects', project.id]">{{
                  i18n.t('projects.addCost')
                }}</a>
              </div>
            </section>
            <aside class="page-stack">
              <section class="card">
                <div class="card__header">
                  <h2>{{ i18n.t('margins.costs') }}</h2>
                  <span class="chip">{{ costs().length }}</span>
                </div>
                @for (cost of costs(); track cost.id) {
                  <div class="cost-row">
                    <div>
                      <strong>{{ i18n.text(cost.description) }}</strong><small
                        >{{ i18n.t(costKey(cost.category)) }} · {{ format.date(cost.date) }}</small
                      >
                      <p>{{ i18n.text(cost.source) }}</p>
                    </div>
                    <span class="money">{{ format.money(cost.amount) }}</span>
                  </div>
                } @empty {
                  <app-empty-state [title]="i18n.t('common.empty')" />
                }
              </section>
              <section class="card">
                <h2>{{ i18n.t('common.metricSource') }}</h2>
                <dl class="finance-list">
                  <div>
                    <dt>{{ i18n.t('common.definition') }}</dt>
                    <dd class="text-value">{{ i18n.t('metric.margin.definition') }}</dd>
                  </div>
                  <div>
                    <dt>{{ i18n.t('common.source') }}</dt>
                    <dd class="text-value">{{ i18n.t('metric.margin.source') }}</dd>
                  </div>
                  <div>
                    <dt>{{ i18n.t('common.lastUpdated') }}</dt>
                    <dd>{{ format.dateTime('2026-05-14T12:00:00Z') }}</dd>
                  </div>
                  <div>
                    <dt>{{ i18n.t('common.dataCompleteness') }}</dt>
                    <dd>{{ completeness() }}%</dd>
                  </div>
                </dl>
                <div class="progress"><span [style.width.%]="completeness()"></span></div>
                @if (completeness() < 100) {
                  <p class="warning small">{{ i18n.t('margins.dataIncomplete') }}</p>
                }
              </section>
            </aside>
          </div>
        }
      }
    </div>
  `,
})
export class MarginsComponent {
  readonly selectedProjectId = signal(
    inject(ActivatedRoute).snapshot.queryParamMap.get('project') ??
      inject(AppStore).state().projects[0]?.id ??
      '',
  );
  constructor(
    readonly i18n: I18nService,
    readonly format: FormatService,
    readonly store: AppStore,
    private readonly workflow: WorkflowService,
    private readonly ui: UiService,
    private readonly router: Router,
    private readonly route: ActivatedRoute,
  ) {}
  margin(projectId: string): ReturnType<typeof calculateProjectMargin> {
    return calculateProjectMargin(this.store.state(), projectId);
  }
  selectedProject(): Project | undefined {
    return this.store.state().projects.find((project) => project.id === this.selectedProjectId());
  }
  costs() {
    return this.store.state().costs.filter((cost) => cost.projectId === this.selectedProjectId());
  }
  clientName(id: string): string {
    const client = this.store.state().clients.find((item) => item.id === id);
    return client ? this.i18n.text(client.name) : id;
  }
  completeness(): number {
    return metricCompleteness(this.store.state(), 'margin');
  }
  varianceSymbol(value: number): string {
    return value > 0 ? '↑' : value < 0 ? '↓' : '—';
  }
  varianceLabel(value: number): string {
    return this.i18n.t(
      value > 0
        ? 'margins.positiveVariance'
        : value < 0
          ? 'margins.negativeVariance'
          : 'margins.onPlan',
    );
  }
  costKey(category: string): import('../core/translations').TranslationKey {
    const keys: Record<string, import('../core/translations').TranslationKey> = {
      labor: 'cost.labor',
      rework: 'cost.rework',
      license: 'cost.license',
      contractor: 'cost.contractor',
      other: 'cost.other',
    };
    return keys[category] ?? 'cost.other';
  }
  explanation(projectId: string): string {
    const margin = this.margin(projectId);
    const rework = this.costs()
      .filter((cost) => cost.category === 'rework')
      .reduce((sum, cost) => sum + cost.amount, 0);
    return this.i18n.t('margins.costDelta', {
      amount: this.format.money((margin?.actualCosts ?? 0) - (margin?.plannedDirectCosts ?? 0)),
      rework: this.format.money(rework),
    });
  }
  explainWithAi(projectId: string): void {
    this.workflow.createAiResult('explain_margin', 'project', projectId, 'user-owner');
    this.ui.notify(this.i18n.t('margins.aiPrepared'));
    void this.router.navigate(['/ai']);
  }
}
