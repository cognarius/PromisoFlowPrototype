import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { I18nService } from './core/i18n';
import { dataCompleteness } from './core/metrics';
import { Language, RoleCode } from './core/models';
import { SessionService } from './core/session';
import { AppStore } from './core/store';
import { TranslationKey, translations } from './core/translations';
import { UiService } from './core/ui';

interface NavItem {
  key: TranslationKey;
  route: string;
  icon: string;
  roles: RoleCode[];
}

@Component({
  imports: [FormsModule, RouterLink, RouterLinkActive, RouterOutlet],
  selector: 'app-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {
  readonly mobileNavigationOpen = signal(false);
  readonly currentUrl = signal('/pulse');
  readonly primaryNavigation: NavItem[] = [
    {
      key: 'nav.pulse',
      route: '/pulse',
      icon: 'fa-solid fa-gauge-high',
      roles: ['owner', 'sales', 'finance'],
    },
    {
      key: 'nav.deals',
      route: '/deals',
      icon: 'fa-solid fa-handshake',
      roles: ['owner', 'sales', 'project', 'finance'],
    },
    {
      key: 'nav.money',
      route: '/money',
      icon: 'fa-solid fa-money-bill-wave',
      roles: ['owner', 'sales', 'finance'],
    },
    {
      key: 'nav.documents',
      route: '/documents',
      icon: 'fa-solid fa-file-invoice',
      roles: ['owner', 'sales', 'project', 'finance'],
    },
    {
      key: 'nav.integrations',
      route: '/integrations',
      icon: 'fa-solid fa-plug',
      roles: ['owner', 'finance'],
    },
  ];
  readonly workspaceNavigation: NavItem[] = [
    {
      key: 'nav.clients',
      route: '/clients',
      icon: 'fa-solid fa-users',
      roles: ['owner', 'sales', 'finance'],
    },
    {
      key: 'nav.proposals',
      route: '/proposals',
      icon: 'fa-solid fa-file-circle-check',
      roles: ['owner', 'sales'],
    },
    {
      key: 'nav.contracts',
      route: '/contracts',
      icon: 'fa-solid fa-file-contract',
      roles: ['owner', 'sales', 'project', 'finance'],
    },
    {
      key: 'nav.projects',
      route: '/projects',
      icon: 'fa-solid fa-diagram-project',
      roles: ['owner', 'sales', 'project', 'finance'],
    },
    {
      key: 'nav.obligations',
      route: '/obligations',
      icon: 'fa-solid fa-list-check',
      roles: ['owner', 'sales', 'project', 'finance'],
    },
    {
      key: 'nav.margins',
      route: '/margins',
      icon: 'fa-solid fa-chart-line',
      roles: ['owner', 'sales', 'finance'],
    },
    {
      key: 'nav.actions',
      route: '/actions',
      icon: 'fa-solid fa-bolt',
      roles: ['owner', 'sales', 'project', 'finance'],
    },
    {
      key: 'nav.migration',
      route: '/migration',
      icon: 'fa-solid fa-arrow-right-arrow-left',
      roles: ['owner'],
    },
    {
      key: 'nav.ai',
      route: '/ai',
      icon: 'fa-solid fa-wand-magic-sparkles',
      roles: ['owner', 'sales', 'project', 'finance'],
    },
    {
      key: 'nav.portal',
      route: '/portal',
      icon: 'fa-solid fa-globe',
      roles: ['owner', 'sales', 'project', 'finance', 'client'],
    },
  ];
  searchQuery = '';

  constructor(
    readonly i18n: I18nService,
    readonly session: SessionService,
    readonly ui: UiService,
    readonly store: AppStore,
    private readonly router: Router,
  ) {
    this.currentUrl.set(router.url);
    router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe((event) => this.currentUrl.set(event.urlAfterRedirects));
  }
  t(key: TranslationKey): string {
    return this.i18n.t(key, {}, this.isPortal());
  }
  setLanguage(language: Language): void {
    this.i18n.setLanguage(language);
  }
  setRole(role: RoleCode): void {
    this.session.setRole(role);
    if (role === 'client') void this.router.navigate(['/portal']);
    else if (this.currentUrl().startsWith('/access-denied'))
      void this.router.navigate([role === 'project' ? '/projects' : '/pulse']);
  }
  roleKey(role: RoleCode): `common.role.${RoleCode}` {
    return `common.role.${role}`;
  }
  visibleNavigation(items: NavItem[]): NavItem[] {
    return items.filter((item) => item.roles.includes(this.session.role()));
  }
  isPortal(): boolean {
    return this.currentUrl().startsWith('/portal');
  }
  completeness(): number {
    return dataCompleteness(this.store.state());
  }
  moneyBadge(): number {
    const state = this.store.state();
    return (
      state.invoices.filter(
        (invoice) =>
          invoice.status !== 'draft' && invoice.dueDate < '2026-05-14' && invoice.status !== 'paid',
      ).length + state.payments.filter((payment) => !payment.matches.length).length
    );
  }
  pageKey(): TranslationKey {
    const url = this.currentUrl();
    const section =
      [
        'pulse',
        'deals',
        'clients',
        'proposals',
        'contracts',
        'projects',
        'obligations',
        'money',
        'documents',
        'margins',
        'actions',
        'integrations',
        'migration',
        'ai',
        'portal',
        'search',
        'access-denied',
      ].find((item) => url.startsWith(`/${item}`)) ?? 'pulse';
    const normalized = section === 'access-denied' ? 'access' : section;
    const key = `page.${normalized}.title`;
    return key in translations ? (key as TranslationKey) : 'page.pulse.title';
  }
  pageSubtitleKey(): TranslationKey {
    return this.pageKey().replace('.title', '.subtitle') as TranslationKey;
  }
  userInitials(): string {
    const id = this.session.role() === 'client' ? 'user-client' : `user-${this.session.role()}`;
    return this.store.state().users.find((user) => user.id === id)?.initials ?? 'AK';
  }
  userName(): string {
    const id = this.session.role() === 'client' ? 'user-client' : `user-${this.session.role()}`;
    return this.store.state().users.find((user) => user.id === id)?.name ?? 'Alex Kim';
  }
  search(): void {
    if (this.searchQuery.trim())
      void this.router.navigate(['/search'], { queryParams: { q: this.searchQuery.trim() } });
  }
}
