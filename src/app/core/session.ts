import { Injectable, signal } from '@angular/core';
import { RoleCode } from './models';

const ROLE_KEY = 'potok.role';
const roles: RoleCode[] = ['owner', 'sales', 'project', 'finance', 'client'];

@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly currentRole = signal<RoleCode>(this.readRole());
  readonly role = this.currentRole.asReadonly();
  readonly roles = roles;

  setRole(role: RoleCode): void {
    this.currentRole.set(role);
    localStorage.setItem(ROLE_KEY, role);
  }

  canSeeFinance(): boolean {
    return this.currentRole() !== 'project' && this.currentRole() !== 'client';
  }

  canManageDelivery(): boolean {
    return ['owner', 'project'].includes(this.currentRole());
  }

  canManageSales(): boolean {
    return ['owner', 'sales'].includes(this.currentRole());
  }

  canManageFinance(): boolean {
    return ['owner', 'finance'].includes(this.currentRole());
  }

  private readRole(): RoleCode {
    if (typeof localStorage === 'undefined') return 'owner';
    const stored = localStorage.getItem(ROLE_KEY) as RoleCode | null;
    return stored && roles.includes(stored) ? stored : 'owner';
  }
}
