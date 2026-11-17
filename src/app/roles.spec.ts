import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { App } from './app';
import { routes } from './app.routes';
import { I18nService } from './core/i18n';
import { SessionService } from './core/session';
import { WorkflowService } from './core/workflow';

describe('role-based prototype access', () => {
  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter(routes)],
    }).compileComponents();
  });

  it('hides financial data for the delivery role and blocks direct finance routes', async () => {
    const fixture = TestBed.createComponent(App);
    const router = TestBed.inject(Router);
    const session = TestBed.inject(SessionService);
    session.setRole('project');
    await router.navigateByUrl('/money');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(router.url).toBe('/access-denied');

    await router.navigateByUrl('/projects/project-vector');
    fixture.detectChanges();
    await fixture.whenStable();
    const project = (fixture.nativeElement as HTMLElement).querySelector(
      'app-project-detail',
    ) as HTMLElement;
    expect(project).not.toBeNull();
    expect(project.querySelector('.calculation-card')).toBeNull();
    expect(project.querySelector('.money')).toBeNull();
    expect(project.textContent).not.toContain('1 450 000');
  });

  it('hides AI-extracted financial terms from the delivery role on contract details', async () => {
    const fixture = TestBed.createComponent(App);
    const router = TestBed.inject(Router);
    const session = TestBed.inject(SessionService);
    const workflow = TestBed.inject(WorkflowService);
    workflow.approveProposal('proposal-atlas');
    const contract = workflow.createContract('proposal-atlas');
    workflow.signContract(contract.id);
    session.setRole('project');

    await router.navigateByUrl(`/contracts/${contract.id}`);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const detail = (fixture.nativeElement as HTMLElement).querySelector(
      'app-contract-detail',
    ) as HTMLElement;
    expect(detail).not.toBeNull();
    expect(detail.textContent).toContain('Выполнить и передать результат проекта');
    expect(detail.querySelector('.ai-card')).toBeNull();

    session.setRole('owner');
    fixture.detectChanges();
    const aiCardText = detail.querySelector('.ai-card')?.textContent?.replace(/\s/g, ' ');
    expect(aiCardText).toContain('Извлечены аванс 280 000');
  });

  it('keeps the external client in their own portal with an independent language', async () => {
    const fixture = TestBed.createComponent(App);
    const router = TestBed.inject(Router);
    const session = TestBed.inject(SessionService);
    const i18n = TestBed.inject(I18nService);
    i18n.setLanguage('ru-RU');
    i18n.setPortalLanguage('en-US');
    session.setRole('client');
    await router.navigateByUrl('/clients');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(router.url).toBe('/portal');
    const portal = (fixture.nativeElement as HTMLElement).querySelector(
      'app-portal',
    ) as HTMLElement;
    expect(portal).not.toBeNull();
    expect(portal.textContent).toContain('Client portal');
    expect(portal.textContent).not.toContain('Terra Soft');
    expect(portal.textContent).not.toContain('Internal estimate for additional revisions');
    expect(portal.querySelector('.calculation-card')).toBeNull();
    expect(i18n.language()).toBe('ru-RU');
    expect(i18n.portalLanguage()).toBe('en-US');
    expect(document.documentElement.lang).toBe('en-US');
  });
});
