import { Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { I18nService } from '../core/i18n';
import { TranslationKey, translations } from '../core/translations';

export function statusKey(status: string): TranslationKey {
  const key = `status.${status}`;
  return key in translations ? (key as TranslationKey) : 'common.missingTranslation';
}

export function statusTone(status: string): string {
  if (
    [
      'paid',
      'matched',
      'completed',
      'signed',
      'approved',
      'ready',
      'done',
      'accepted',
      'confirmed',
      'active',
    ].includes(status)
  )
    return 'green';
  if (['overdue', 'error', 'unmatched', 'blocked', 'rejected'].includes(status)) return 'red';
  if (
    [
      'partially_paid',
      'partially_matched',
      'waiting_confirmation',
      'pending_approval',
      'retry',
      'conflict',
      'delayed',
      'edited',
    ].includes(status)
  )
    return 'amber';
  return '';
}

@Component({
  selector: 'app-status-chip',
  template:
    '<span class="chip" [class]="\'chip \' + toneClass()">{{ i18n.t(statusKey(status()), {}, portal()) }}</span>',
})
export class StatusChipComponent {
  readonly status = input.required<string>();
  readonly portal = input(false);
  constructor(readonly i18n: I18nService) {}
  statusKey(status: string): TranslationKey {
    return statusKey(status);
  }
  toneClass(): string {
    const tone = statusTone(this.status());
    return `chip ${tone ? `chip--${tone}` : ''}`;
  }
}

@Component({
  selector: 'app-metric-card',
  template: `
    <button
      type="button"
      class="card metric-card"
      [class.metric-card--selected]="selected()"
      [disabled]="!interactive()"
      (click)="inspect.emit()"
      [attr.aria-label]="interactive() ? label() + '. ' + i18n.t('common.showSources') : label()"
    >
      <span class="metric-card__label"
        >{{ label() }}
        @if (interactive()) {
          <i class="fa-solid fa-circle-info" aria-hidden="true"></i>
        }
      </span>
      <strong class="metric-card__value" [class]="'metric-card__value ' + tone()">{{
        value()
      }}</strong>
      @if (hint()) {
        <span class="metric-card__hint">{{ hint() }}</span>
      }
      <span class="metric-card__period">{{ period() }}</span>
    </button>
  `,
})
export class MetricCardComponent {
  readonly label = input.required<string>();
  readonly value = input.required<string>();
  readonly hint = input('');
  readonly period = input('');
  readonly tone = input('');
  readonly selected = input(false);
  readonly interactive = input(false);
  readonly inspect = output<void>();
  constructor(readonly i18n: I18nService) {}
}

@Component({
  selector: 'app-empty-state',
  template: `
    <div class="empty-state">
      <i [class]="icon()" aria-hidden="true"></i>
      <strong>{{ title() || i18n.t('common.empty') }}</strong>
      @if (hint()) {
        <p>{{ hint() }}</p>
      }
      @if (route()) {
        <a class="btn btn--primary" [routerLink]="route()">{{ actionLabel() }}</a>
      }
    </div>
  `,
  imports: [RouterLink],
})
export class EmptyStateComponent {
  readonly title = input('');
  readonly hint = input('');
  readonly icon = input('fa-solid fa-inbox');
  readonly route = input('');
  readonly actionLabel = input('');
  constructor(readonly i18n: I18nService) {}
}

@Component({
  selector: 'app-access-denied',
  template: `
    <section class="card empty-state">
      <i class="fa-solid fa-lock" aria-hidden="true"></i>
      <h2>{{ i18n.t('common.accessDenied') }}</h2>
      <p>{{ i18n.t('common.accessDeniedHint') }}</p>
    </section>
  `,
})
export class AccessDeniedComponent {
  constructor(readonly i18n: I18nService) {}
}

@Component({
  selector: 'app-lifecycle',
  template: `
    <div class="lifecycle" [attr.aria-label]="i18n.t('deals.outcomeCycle')">
      @for (step of steps; track step.key; let index = $index) {
        <div
          class="lifecycle__step"
          [class.lifecycle__step--done]="index < current()"
          [class.lifecycle__step--current]="index === current()"
        >
          <span class="lifecycle__dot">
            @if (index < current()) {
              <i class="fa-solid fa-check" aria-hidden="true"></i>
            } @else {
              {{ index + 1 }}
            }
          </span>
          <strong>{{ i18n.t(step.key) }}</strong>
          @if (index < current()) {
            <small>{{ i18n.t('status.completed') }}</small>
          }
        </div>
        @if (index < steps.length - 1) {
          <span class="lifecycle__line" [class.lifecycle__line--done]="index < current()"></span>
        }
      }
    </div>
  `,
})
export class LifecycleComponent {
  readonly current = input.required<number>();
  readonly steps = [
    { key: 'common.proposal' },
    { key: 'common.contract' },
    { key: 'deals.stageDelivery' },
    { key: 'common.document' },
    { key: 'common.invoice' },
    { key: 'common.payment' },
    { key: 'deals.stageMargin' },
  ] as const;
  constructor(readonly i18n: I18nService) {}
}
