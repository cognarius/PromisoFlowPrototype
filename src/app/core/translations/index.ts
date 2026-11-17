import { commonTranslations } from './common';
import { screenTranslations } from './screens';
import { workflowTranslations } from './workflow';
import { TranslationCatalog, TranslationEntry } from './types';

export const translationSources: TranslationCatalog[] = [
  commonTranslations,
  workflowTranslations,
  screenTranslations,
];

export const translations: TranslationCatalog = Object.assign({}, ...translationSources);
export type TranslationKey =
  | keyof typeof commonTranslations
  | keyof typeof workflowTranslations
  | keyof typeof screenTranslations;

export function validateTranslationCatalog(
  sources: TranslationCatalog[] = translationSources,
): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const source of sources) {
    for (const [key, entry] of Object.entries(source)) {
      if (seen.has(key)) errors.push(`Duplicate translation key: ${key}`);
      seen.add(key);
      for (const language of ['ru', 'en'] as const) {
        if (!entry[language]?.trim()) errors.push(`Missing ${language} translation: ${key}`);
      }
    }
  }
  return errors;
}

export function translationEntry(key: string): TranslationEntry | undefined {
  return translations[key];
}
