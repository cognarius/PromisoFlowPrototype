import { Injectable } from '@angular/core';
import { I18nService } from './i18n';

@Injectable({ providedIn: 'root' })
export class FormatService {
  constructor(private readonly i18n: I18nService) {}

  money(value: number, compact = false, portal = false): string {
    return new Intl.NumberFormat(this.locale(portal), {
      style: 'currency',
      currency: 'RUB',
      currencyDisplay: 'symbol',
      maximumFractionDigits: 0,
      notation: compact ? 'compact' : 'standard',
    }).format(value);
  }

  number(value: number, maximumFractionDigits = 0, portal = false): string {
    return new Intl.NumberFormat(this.locale(portal), { maximumFractionDigits }).format(value);
  }

  percent(value: number, maximumFractionDigits = 1, portal = false): string {
    return new Intl.NumberFormat(this.locale(portal), {
      style: 'percent',
      maximumFractionDigits,
    }).format(value / 100);
  }

  date(value: string, options?: Intl.DateTimeFormatOptions, portal = false): string {
    return new Intl.DateTimeFormat(
      this.locale(portal),
      options ?? { day: '2-digit', month: 'short', year: 'numeric' },
    ).format(this.utcDate(value));
  }

  dateTime(value: string, portal = false): string {
    return new Intl.DateTimeFormat(this.locale(portal), {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'UTC',
    }).format(new Date(value));
  }

  days(value: number, portal = false): string {
    const lang = this.i18n.shortLanguage(portal);
    if (lang === 'en') return `${value} ${value === 1 ? 'day' : 'days'}`;
    const mod100 = value % 100;
    const mod10 = value % 10;
    const word =
      mod100 >= 11 && mod100 <= 14
        ? 'дней'
        : mod10 === 1
          ? 'день'
          : mod10 >= 2 && mod10 <= 4
            ? 'дня'
            : 'дней';
    return `${value} ${word}`;
  }

  utcDate(value: string): Date {
    return new Date(value.length === 10 ? `${value}T00:00:00Z` : value);
  }

  private locale(portal: boolean): string {
    return portal ? this.i18n.portalLanguage() : this.i18n.language();
  }
}
