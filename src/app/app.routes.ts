import { inject } from '@angular/core';
import { CanActivateFn, Router, Routes } from '@angular/router';
import { RoleCode } from './core/models';
import { SessionService } from './core/session';
import { AccessDeniedComponent } from './shared/components';

const internal: RoleCode[] = ['owner', 'sales', 'project', 'finance'];
const financial: RoleCode[] = ['owner', 'sales', 'finance'];

export const roleGuard: CanActivateFn = (route) => {
  const session = inject(SessionService);
  const router = inject(Router);
  const roles = route.data['roles'] as RoleCode[] | undefined;
  if (!roles || roles.includes(session.role())) return true;
  return router.createUrlTree([session.role() === 'client' ? '/portal' : '/access-denied']);
};

const pulseGuard: CanActivateFn = (route, state) => {
  const session = inject(SessionService);
  const router = inject(Router);
  if (session.role() === 'client') return router.createUrlTree(['/portal']);
  if (session.role() === 'project') return router.createUrlTree(['/projects']);
  return roleGuard(route, state);
};

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'pulse' },
  {
    path: 'pulse',
    loadComponent: () => import('./pages/pulse').then((m) => m.PulseComponent),
    canActivate: [pulseGuard],
    data: { roles: financial },
  },
  {
    path: 'deals',
    loadComponent: () => import('./pages/deals').then((m) => m.DealsComponent),
    canActivate: [roleGuard],
    data: { roles: internal },
  },
  {
    path: 'clients',
    loadComponent: () => import('./pages/clients').then((m) => m.ClientsComponent),
    canActivate: [roleGuard],
    data: { roles: ['owner', 'sales', 'finance'] },
  },
  {
    path: 'clients/:id',
    loadComponent: () => import('./pages/clients').then((m) => m.ClientDetailComponent),
    canActivate: [roleGuard],
    data: { roles: ['owner', 'sales', 'finance'] },
  },
  {
    path: 'proposals',
    loadComponent: () => import('./pages/proposals').then((m) => m.ProposalsComponent),
    canActivate: [roleGuard],
    data: { roles: ['owner', 'sales'] },
  },
  {
    path: 'proposals/new',
    loadComponent: () => import('./pages/proposals').then((m) => m.ProposalEditorComponent),
    canActivate: [roleGuard],
    data: { roles: ['owner', 'sales'] },
  },
  {
    path: 'proposals/:id',
    loadComponent: () => import('./pages/proposals').then((m) => m.ProposalEditorComponent),
    canActivate: [roleGuard],
    data: { roles: ['owner', 'sales'] },
  },
  {
    path: 'contracts',
    loadComponent: () => import('./pages/contracts').then((m) => m.ContractsComponent),
    canActivate: [roleGuard],
    data: { roles: internal },
  },
  {
    path: 'contracts/:id',
    loadComponent: () => import('./pages/contracts').then((m) => m.ContractDetailComponent),
    canActivate: [roleGuard],
    data: { roles: internal },
  },
  {
    path: 'projects',
    loadComponent: () => import('./pages/projects').then((m) => m.ProjectsComponent),
    canActivate: [roleGuard],
    data: { roles: internal },
  },
  {
    path: 'projects/:id',
    loadComponent: () => import('./pages/projects').then((m) => m.ProjectDetailComponent),
    canActivate: [roleGuard],
    data: { roles: internal },
  },
  {
    path: 'obligations',
    loadComponent: () => import('./pages/projects').then((m) => m.ObligationsComponent),
    canActivate: [roleGuard],
    data: { roles: internal },
  },
  {
    path: 'money',
    loadComponent: () => import('./pages/money').then((m) => m.MoneyComponent),
    canActivate: [roleGuard],
    data: { roles: financial },
  },
  {
    path: 'documents',
    loadComponent: () => import('./pages/documents').then((m) => m.DocumentsComponent),
    canActivate: [roleGuard],
    data: { roles: internal },
  },
  {
    path: 'margins',
    loadComponent: () => import('./pages/margins').then((m) => m.MarginsComponent),
    canActivate: [roleGuard],
    data: { roles: financial },
  },
  {
    path: 'actions',
    loadComponent: () => import('./pages/actions').then((m) => m.ActionsComponent),
    canActivate: [roleGuard],
    data: { roles: internal },
  },
  {
    path: 'integrations',
    loadComponent: () => import('./pages/integrations').then((m) => m.IntegrationsComponent),
    canActivate: [roleGuard],
    data: { roles: ['owner', 'finance'] },
  },
  {
    path: 'migration',
    loadComponent: () => import('./pages/migration').then((m) => m.MigrationComponent),
    canActivate: [roleGuard],
    data: { roles: ['owner'] },
  },
  {
    path: 'ai',
    loadComponent: () => import('./pages/ai').then((m) => m.AiComponent),
    canActivate: [roleGuard],
    data: { roles: internal },
  },
  { path: 'portal', loadComponent: () => import('./pages/portal').then((m) => m.PortalComponent) },
  {
    path: 'search',
    loadComponent: () => import('./pages/search').then((m) => m.SearchComponent),
    canActivate: [roleGuard],
    data: { roles: internal },
  },
  { path: 'access-denied', component: AccessDeniedComponent },
  { path: '**', redirectTo: 'pulse' },
];
