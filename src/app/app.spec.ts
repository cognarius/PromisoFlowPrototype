import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { App } from './app';
import { routes } from './app.routes';
import { I18nService } from './core/i18n';
import { AppStore } from './core/store';

describe('App', () => {
  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter(routes)],
    }).compileComponents();
  });

  it('creates the localized shell', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.topbar h1')?.textContent).toContain(
      'Контроль исполнения и прибыли',
    );
  });

  it('switches language without changing the route', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const i18n = TestBed.inject(I18nService);
    fixture.componentInstance.setLanguage('en-US');
    fixture.detectChanges();
    expect(i18n.language()).toBe('en-US');
    expect(document.documentElement.lang).toBe('en-US');
    expect(localStorage.getItem('potok.language')).toBe('en-US');
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('.topbar h1')?.textContent,
    ).toContain('Execution & profit control');
  });

  it('keeps route and unsaved form values when switching language', async () => {
    const fixture = TestBed.createComponent(App);
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/proposals/new');
    fixture.detectChanges();
    await fixture.whenStable();
    const input = (fixture.nativeElement as HTMLElement).querySelector(
      '.proposal-editor input',
    ) as HTMLInputElement;
    input.value = 'Unsaved proposal';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    fixture.componentInstance.setLanguage('en-US');
    fixture.detectChanges();
    expect(router.url).toBe('/proposals/new');
    expect(input.value).toBe('Unsaved proposal');
    expect(document.documentElement.lang).toBe('en-US');
  });

  it('resets demo data through confirmation without changing the selected language', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();
    const store = TestBed.inject(AppStore);
    const i18n = TestBed.inject(I18nService);
    await TestBed.inject(Router).navigateByUrl('/pulse');
    i18n.setLanguage('en-US');
    store.clients.update('client-vector', { repeatPotential: 0.1 });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    (compiled.querySelector('[data-testid="reset-demo"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    (compiled.querySelector('.modal .btn--danger') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(store.clients.get('client-vector')?.repeatPotential).toBe(0.72);
    expect(i18n.language()).toBe('en-US');
    expect(compiled.querySelector('.toast')?.textContent).toContain('Demo data has been restored');
  });
});
