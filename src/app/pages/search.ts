import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormatService } from '../core/format';
import { I18nService } from '../core/i18n';
import { SessionService } from '../core/session';
import { AppStore } from '../core/store';
import { EmptyStateComponent } from '../shared/components';

interface SearchResult {
  id: string;
  type: string;
  title: string;
  subtitle: string;
  route: string[];
  queryParams?: Record<string, string>;
}

@Component({
  selector: 'app-search',
  imports: [FormsModule, RouterLink, EmptyStateComponent],
  template: `<section class="card">
    <div class="card__header">
      <label class="search-field full-width"
        ><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i
        ><span class="sr-only">{{ i18n.t('common.search') }}</span
        ><input
          [(ngModel)]="query"
          (keyup.enter)="search()"
          [placeholder]="i18n.t('search.query')" /></label
      ><button class="btn btn--primary" (click)="search()">{{ i18n.t('common.search') }}</button>
    </div>
    @if (submittedQuery) {
      <h2>{{ i18n.t('search.results') }} · {{ results().length }}</h2>
      <div class="search-results">
        @for (result of results(); track result.id) {
          <a [routerLink]="result.route" [queryParams]="result.queryParams"
            ><span class="chip">{{ result.type }}</span>
            <div>
              <strong>{{ result.title }}</strong><small>{{ result.subtitle }}</small>
            </div>
            <i class="fa-solid fa-arrow-right" aria-hidden="true"></i
          ></a>
        } @empty {
          <app-empty-state [title]="i18n.t('search.noResults', { query: submittedQuery })" />
        }
      </div>
    } @else {
      <app-empty-state [title]="i18n.t('search.empty')" icon="fa-solid fa-magnifying-glass" />
    }
  </section>`,
})
export class SearchComponent {
  query = inject(ActivatedRoute).snapshot.queryParamMap.get('q') ?? '';
  submittedQuery = this.query;
  constructor(
    readonly i18n: I18nService,
    readonly format: FormatService,
    readonly store: AppStore,
    readonly session: SessionService,
    private readonly router: Router,
  ) {}
  search(): void {
    this.submittedQuery = this.query.trim();
    void this.router.navigate(['/search'], { queryParams: { q: this.submittedQuery } });
  }
  results(): SearchResult[] {
    const query = this.submittedQuery.toLowerCase();
    if (!query) return [];
    const state = this.store.state();
    const match = (...values: string[]): boolean =>
      values.some((value) => value.toLowerCase().includes(query));
    const canSeeFinance = this.session.canSeeFinance();
    return [
      ...state.clients
        .filter((client) => match(client.name.ru, client.name.en, client.email, client.contactName))
        .map((client) => ({
          id: client.id,
          type: this.i18n.t('common.client'),
          title: this.i18n.text(client.name),
          subtitle: client.email,
          route: ['/clients', client.id],
        })),
      ...state.projects
        .filter((project) => match(project.name.ru, project.name.en))
        .map((project) => ({
          id: project.id,
          type: this.i18n.t('common.project'),
          title: this.i18n.text(project.name),
          subtitle: this.format.date(project.dueDate),
          route: ['/projects', project.id],
        })),
      ...(canSeeFinance
        ? state.invoices
            .filter((invoice) => match(invoice.number))
            .map((invoice) => ({
              id: invoice.id,
              type: this.i18n.t('common.invoice'),
              title: `${this.i18n.t('common.invoice')} ${invoice.number}`,
              subtitle: this.format.money(invoice.amount),
              route: ['/money'],
              queryParams: { invoice: invoice.id },
            }))
        : []),
      ...state.documents
        .filter(
          (document) =>
            (canSeeFinance || !['invoice', 'upd'].includes(document.kind)) &&
            match(document.title.ru, document.title.en, document.content.ru, document.content.en),
        )
        .map((document) => ({
          id: document.id,
          type: this.i18n.t('common.document'),
          title: this.i18n.text(document.title),
          subtitle: this.format.date(document.createdAt),
          route: ['/documents'],
          queryParams: { selected: document.id },
        })),
    ];
  }
}
