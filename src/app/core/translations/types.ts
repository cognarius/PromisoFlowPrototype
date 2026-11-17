import { LanguageShort } from '../models';

export type TranslationEntry = Record<LanguageShort, string>;
export type TranslationCatalog = Record<string, TranslationEntry>;
