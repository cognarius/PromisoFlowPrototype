import { Injectable, Signal, signal } from '@angular/core';
import { APP_SCHEMA_VERSION, createDemoState } from './demo-data';
import { Activity, AppState, EntityType, MigrationState } from './models';

const STATE_KEY = 'promisoflow.data';

export const entityCollectionKeys = [
  'clients',
  'proposals',
  'contracts',
  'projects',
  'obligations',
  'financialEvents',
  'invoices',
  'payments',
  'costs',
  'documents',
  'users',
  'activities',
  'integrationEvents',
  'aiResults',
  'nextActions',
] as const;

export type EntityCollectionKey = (typeof entityCollectionKeys)[number];
export type EntityOf<K extends EntityCollectionKey> = AppState[K][number];

type Entity = { id: string };

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export class MockRepository<T extends Entity> {
  constructor(
    private readonly read: () => T[],
    private readonly write: (items: T[]) => void,
  ) {}

  all(): T[] {
    return clone(this.read());
  }

  get(id: string): T | undefined {
    const entity = this.read().find((candidate) => candidate.id === id);
    return entity ? clone(entity) : undefined;
  }

  add(entity: T): T {
    if (this.read().some((candidate) => candidate.id === entity.id)) {
      throw new Error(`Entity already exists: ${entity.id}`);
    }
    const stored = clone(entity);
    this.write([...this.read(), stored]);
    return clone(stored);
  }

  update(id: string, patch: Partial<T>): T {
    const current = this.read();
    const index = current.findIndex((candidate) => candidate.id === id);
    if (index < 0) throw new Error(`Entity not found: ${id}`);

    const updated = { ...current[index], ...clone(patch), id };
    const next = [...current];
    next[index] = updated;
    this.write(next);
    return clone(updated);
  }

  remove(id: string): void {
    const current = this.read();
    if (!current.some((candidate) => candidate.id === id)) {
      throw new Error(`Entity not found: ${id}`);
    }
    this.write(current.filter((candidate) => candidate.id !== id));
  }
}

@Injectable({ providedIn: 'root' })
export class AppStore {
  private readonly stateSignal = signal<AppState>(readStoredState());
  readonly state: Signal<AppState> = this.stateSignal.asReadonly();

  readonly clients = this.repository('clients');
  readonly proposals = this.repository('proposals');
  readonly contracts = this.repository('contracts');
  readonly projects = this.repository('projects');
  readonly obligations = this.repository('obligations');
  readonly financialEvents = this.repository('financialEvents');
  readonly invoices = this.repository('invoices');
  readonly payments = this.repository('payments');
  readonly costs = this.repository('costs');
  readonly documents = this.repository('documents');
  readonly users = this.repository('users');
  readonly activities = this.repository('activities');
  readonly integrationEvents = this.repository('integrationEvents');
  readonly aiResults = this.repository('aiResults');
  readonly nextActions = this.repository('nextActions');

  snapshot(): AppState {
    return clone(this.stateSignal());
  }

  transact(mutator: (state: AppState) => void): void {
    const next = this.snapshot();
    mutator(next);
    this.commit(next);
  }

  setMigration(migration: MigrationState): void {
    this.commit({ ...this.stateSignal(), migration: clone(migration) });
  }

  setCompletedActionIds(completedActionIds: string[]): void {
    this.commit({ ...this.stateSignal(), completedActionIds: [...completedActionIds] });
  }

  recordActivity(activity: Activity): Activity {
    return this.activities.add(activity);
  }

  reset(): void {
    this.commit(createDemoState());
  }

  private repository<K extends EntityCollectionKey>(key: K): MockRepository<EntityOf<K>> {
    return new MockRepository<EntityOf<K>>(
      () => this.stateSignal()[key],
      (items) => this.commit({ ...this.stateSignal(), [key]: items }),
    );
  }

  private commit(state: AppState): void {
    this.stateSignal.set(state);
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify(state));
    } catch {
      console.warn('Demo state could not be saved to localStorage.');
    }
  }
}

function readStoredState(): AppState {
  if (typeof localStorage === 'undefined') return createDemoState();
  const stored = localStorage.getItem(STATE_KEY);
  if (!stored) return createDemoState();

  try {
    const parsed: unknown = JSON.parse(stored);
    return isAppState(parsed) ? parsed : createDemoState();
  } catch {
    return createDemoState();
  }
}

function isAppState(value: unknown): value is AppState {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<AppState>;
  return (
    candidate.schemaVersion === APP_SCHEMA_VERSION &&
    entityCollectionKeys.every((key) => Array.isArray(candidate[key])) &&
    Array.isArray(candidate.completedActionIds) &&
    typeof candidate.migration === 'object' &&
    candidate.migration !== null
  );
}

const entityCollections: Partial<Record<EntityType, EntityCollectionKey>> = {
  client: 'clients',
  proposal: 'proposals',
  contract: 'contracts',
  project: 'projects',
  obligation: 'obligations',
  invoice: 'invoices',
  payment: 'payments',
  cost: 'costs',
  document: 'documents',
};

export function validateStateReferences(state: AppState): string[] {
  const errors: string[] = [];
  const exists = (key: EntityCollectionKey, id: string): boolean =>
    (state[key] as Entity[]).some((entity) => entity.id === id);
  const check = (key: EntityCollectionKey, id: string | undefined, source: string): void => {
    if (id !== undefined && !exists(key, id))
      errors.push(`${source} references missing ${key}:${id}`);
  };
  const checkEntity = (type: EntityType, id: string, source: string): void => {
    const collection = entityCollections[type];
    if (collection) check(collection, id, source);
  };

  for (const key of entityCollectionKeys) {
    const ids = new Set<string>();
    for (const entity of state[key] as Entity[]) {
      if (ids.has(entity.id)) errors.push(`Duplicate ${key} id:${entity.id}`);
      ids.add(entity.id);
    }
  }

  for (const client of state.clients) check('users', client.ownerId, client.id);
  for (const proposal of state.proposals) {
    check('clients', proposal.clientId, proposal.id);
    check('users', proposal.ownerId, proposal.id);
  }
  for (const contract of state.contracts) {
    check('proposals', contract.proposalId, contract.id);
    check('clients', contract.clientId, contract.id);
    check('users', contract.confirmedBy, contract.id);
  }
  for (const project of state.projects) {
    check('contracts', project.contractId, project.id);
    check('clients', project.clientId, project.id);
    check('users', project.managerId, project.id);
  }
  for (const obligation of state.obligations) {
    check('projects', obligation.projectId, obligation.id);
    check('users', obligation.ownerId, obligation.id);
    check('users', obligation.confirmedBy, obligation.id);
    check('invoices', obligation.invoiceId, obligation.id);
    check('documents', obligation.closingDocumentId, obligation.id);
  }
  for (const event of state.financialEvents) {
    check('projects', event.projectId, event.id);
    check('obligations', event.obligationId, event.id);
    check('invoices', event.invoiceId, event.id);
  }
  for (const invoice of state.invoices) {
    check('projects', invoice.projectId, invoice.id);
    check('clients', invoice.clientId, invoice.id);
    check('obligations', invoice.obligationId, invoice.id);
  }
  for (const payment of state.payments) {
    check('clients', payment.clientId, payment.id);
    for (const match of payment.matches) {
      check('invoices', match.invoiceId, payment.id);
      check('users', match.matchedBy, match.id);
    }
  }
  for (const cost of state.costs) check('projects', cost.projectId, cost.id);
  for (const document of state.documents) {
    check('clients', document.clientId, document.id);
    check('projects', document.projectId, document.id);
    check('contracts', document.contractId, document.id);
    check('proposals', document.proposalId, document.id);
    check('invoices', document.invoiceId, document.id);
    check('obligations', document.obligationId, document.id);
  }
  for (const activity of state.activities) {
    check('users', activity.actorId, activity.id);
    checkEntity(activity.entityType, activity.entityId, activity.id);
  }
  for (const event of state.integrationEvents) {
    checkEntity(event.entityType, event.entityId, event.id);
  }
  for (const result of state.aiResults) {
    checkEntity(result.entityType, result.entityId, result.id);
    check('users', result.confirmedBy, result.id);
    for (const history of result.history) check('users', history.actorId, result.id);
  }
  for (const action of state.nextActions) {
    check('users', action.ownerId, action.id);
    checkEntity(action.entityType, action.entityId, action.id);
  }

  return errors;
}
