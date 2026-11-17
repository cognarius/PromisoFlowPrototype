import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ActionCenterService, ActionView } from '../core/actions';
import { ActionExecutorService } from '../core/action-executor';
import { FormatService } from '../core/format';
import { I18nService } from '../core/i18n';
import { SessionService } from '../core/session';
import { AppStore } from '../core/store';
import { TranslationKey, translations } from '../core/translations';
import { EmptyStateComponent } from '../shared/components';

@Component({
  selector: 'app-actions',
  imports: [RouterLink, EmptyStateComponent],
  template: `<div class="page-stack">
    <div class="notice notice--green">
      <i class="fa-solid fa-circle-info" aria-hidden="true"></i>{{ i18n.t('actions.explained') }}
    </div>
    <section class="card">
      <div class="card__header">
        <div>
          <h2>{{ i18n.t('actions.title') }}</h2>
          <p class="small">
            {{ i18n.t('common.expectedEffect') }} · {{ format.money(potential()) }}
          </p>
        </div>
        <span class="chip chip--green">{{ actions().length }}</span>
      </div>
      <div class="action-list">
        @for (action of actions(); track action.id; let index = $index) {
          <article class="action-row action-row--full">
            <span class="action-rank">{{ pad(index + 1) }}</span>
            <div class="action-main">
              <h3>{{ action.title }}</h3>
              <p>
                <strong>{{ i18n.t('common.reason') }}:</strong> {{ action.reason }}
              </p>
              <small
                >{{ i18n.t('common.owner') }}: {{ action.owner }} ·
                <a [routerLink]="action.route" [queryParams]="action.queryParams">{{
                  i18n.t('common.linkedObject')
                }}</a></small
              >
            </div>
            <div class="action-effect">
              <span class="eyebrow">{{ i18n.t('common.expectedEffect') }}</span>
              @if (session.canSeeFinance() && action.expectedEffect) {
                <strong>{{ format.money(action.expectedEffect) }}</strong>
              }
              <small>{{ action.expectedEffectText }}</small>
            </div>
            <div class="button-column">
              <button class="btn btn--small btn--primary" (click)="executor.execute(action)">
                {{ label(action) }}</button><button
                class="btn btn--small"
                (click)="executor.markDone(action)"
              >
                {{ i18n.t('actions.complete') }}
              </button>
            </div>
          </article>
        } @empty {
          <app-empty-state [title]="i18n.t('actions.empty')" icon="fa-solid fa-circle-check" />
        }
      </div>
    </section>
  </div>`,
})
export class ActionsComponent {
  constructor(
    readonly i18n: I18nService,
    readonly format: FormatService,
    readonly store: AppStore,
    readonly session: SessionService,
    readonly executor: ActionExecutorService,
    private readonly actionCenter: ActionCenterService,
  ) {}
  actions(): ActionView[] {
    const role = this.session.role();
    return this.actionCenter
      .views(this.store.state())
      .filter((action) => role === 'owner' || action.ownerId === `user-${role}`);
  }
  potential(): number {
    return this.actions().reduce((sum, action) => sum + action.expectedEffect, 0);
  }
  pad(value: number): string {
    return String(value).padStart(2, '0');
  }
  label(action: ActionView): string {
    const key = `actions.label.${action.type}`;
    return this.i18n.t(key in translations ? (key as TranslationKey) : 'actions.perform');
  }
}
