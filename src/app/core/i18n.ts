import { DOCUMENT } from '@angular/common';
import { Inject, Injectable, signal } from '@angular/core';
import { Language, LanguageShort, LocalizedText } from './models';
import { TranslationKey, translationEntry } from './translations';

const LANGUAGE_KEY = 'potok.language';
const PORTAL_LANGUAGE_KEY = 'potok.portal-language';

function storedLanguage(key: string): Language | null {
  if (typeof localStorage === 'undefined') return null;
  const value = localStorage.getItem(key);
  return value === 'ru-RU' || value === 'en-US' ? value : null;
}

@Injectable({ providedIn: 'root' })
export class I18nService {
  private readonly currentLanguage = signal<Language>(storedLanguage(LANGUAGE_KEY) ?? 'ru-RU');
  private readonly currentPortalLanguage = signal<Language>(
    storedLanguage(PORTAL_LANGUAGE_KEY) ?? this.currentLanguage(),
  );
  readonly language = this.currentLanguage.asReadonly();
  readonly portalLanguage = this.currentPortalLanguage.asReadonly();

  constructor(@Inject(DOCUMENT) private readonly document: Document) {
    this.document.documentElement.lang = this.currentLanguage();
  }

  setLanguage(language: Language): void {
    this.currentLanguage.set(language);
    localStorage.setItem(LANGUAGE_KEY, language);
    this.syncDocumentLanguage(language);
  }

  setPortalLanguage(language: Language): void {
    this.currentPortalLanguage.set(language);
    localStorage.setItem(PORTAL_LANGUAGE_KEY, language);
    this.syncDocumentLanguage(language);
  }

  syncDocumentLanguage(language: Language = this.currentLanguage()): void {
    this.document.documentElement.lang = language;
  }

  shortLanguage(portal = false): LanguageShort {
    return (portal ? this.currentPortalLanguage() : this.currentLanguage()) === 'ru-RU'
      ? 'ru'
      : 'en';
  }

  t(key: TranslationKey, params: Record<string, string | number> = {}, portal = false): string {
    const entry = translationEntry(key);
    if (!entry) {
      console.error(`Missing translation key: ${key}`);
      return (
        translationEntry('common.missingTranslation')?.[this.shortLanguage(portal)] ??
        'Translation unavailable'
      );
    }
    let value = entry[this.shortLanguage(portal)];
    for (const [name, replacement] of Object.entries(params)) {
      value = value.replaceAll(`{${name}}`, String(replacement));
    }
    return value;
  }

  text(value: LocalizedText, portal = false): string {
    return value[this.shortLanguage(portal)];
  }
}
