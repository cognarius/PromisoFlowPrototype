import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { App } from '../app';
import { routes } from '../app.routes';
import { I18nService } from './i18n';
import { translationSources, validateTranslationCatalog } from './translations';

describe('translation usage and localized routes', () => {
  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter(routes)],
    }).compileComponents();
  });

  it('detects missing languages in a catalog', () => {
    expect(validateTranslationCatalog([{ 'example.key': { ru: '', en: 'Valid' } }])).toEqual([
      'Missing ru translation: example.key',
    ]);
    expect(validateTranslationCatalog(translationSources)).toEqual([]);
  });

  it('renders every primary route in Russian and English without missing translation errors', async () => {
    const fixture = TestBed.createComponent(App);
    const router = TestBed.inject(Router);
    const i18n = TestBed.inject(I18nService);
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const paths = [
      '/pulse',
      '/deals',
      '/clients',
      '/clients/client-vector',
      '/proposals',
      '/proposals/new?client=client-vector',
      '/proposals/proposal-atlas',
      '/contracts',
      '/contracts/contract-vector',
      '/projects',
      '/projects/project-vector',
      '/obligations',
      '/money',
      '/documents',
      '/margins',
      '/actions',
      '/integrations',
      '/migration',
      '/ai',
      '/portal',
      '/search?q=Vector',
    ];
    for (const language of ['ru-RU', 'en-US'] as const) {
      i18n.setLanguage(language);
      for (const path of paths) {
        await router.navigateByUrl(path);
        fixture.detectChanges();
        await fixture.whenStable();
        fixture.detectChanges();
        expect(router.url, `${language}: ${path}`).toContain(path.split('?')[0]!);
        const visibleText = (fixture.nativeElement as HTMLElement).textContent ?? '';
        expect(visibleText, `${language}: ${path}`).not.toContain('Translation unavailable');
        expect(visibleText, `${language}: ${path}`).not.toContain('Перевод недоступен');
      }
    }
    const missing = errors.mock.calls.filter((call) =>
      String(call[0]).includes('Missing translation key'),
    );
    expect(missing).toEqual([]);
    errors.mockRestore();
  }, 30000);
});
