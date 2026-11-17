import { Injectable, signal } from '@angular/core';
import { TranslationKey } from './translations';

export interface ConfirmationRequest {
  message: TranslationKey;
  action: () => void;
  portal: boolean;
}

@Injectable({ providedIn: 'root' })
export class UiService {
  private readonly toastMessage = signal('');
  private readonly confirmation = signal<ConfirmationRequest | null>(null);
  readonly toast = this.toastMessage.asReadonly();
  readonly confirmRequest = this.confirmation.asReadonly();
  private toastTimer?: ReturnType<typeof setTimeout>;

  notify(message: string): void {
    this.toastMessage.set(message);
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toastMessage.set(''), 4500);
  }

  confirm(message: TranslationKey, action: () => void, portal = false): void {
    this.confirmation.set({ message, action, portal });
  }

  closeConfirmation(): void {
    this.confirmation.set(null);
  }

  acceptConfirmation(): void {
    const request = this.confirmation();
    this.confirmation.set(null);
    request?.action();
  }
}
