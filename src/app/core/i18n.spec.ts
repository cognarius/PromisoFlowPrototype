import { TestBed } from '@angular/core/testing';
import { FormatService } from './format';
import { I18nService } from './i18n';
import { translationSources, validateTranslationCatalog } from './translations';

describe('localization', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
  });

  it('has complete, unique Russian and English dictionaries', () => {
    expect(validateTranslationCatalog(translationSources)).toEqual([]);
  });

  it('formats currency and percentages without converting values', () => {
    const i18n = TestBed.inject(I18nService);
    const format = TestBed.inject(FormatService);
    i18n.setLanguage('ru-RU');
    expect(format.number(1450000)).toBe('1 450 000');
    expect(format.percent(32)).toBe('32 %');
    i18n.setLanguage('en-US');
    expect(format.number(1450000)).toBe('1,450,000');
    expect(format.percent(32)).toBe('32%');
    expect(format.money(1450000)).toContain('1,450,000');
  });
});
