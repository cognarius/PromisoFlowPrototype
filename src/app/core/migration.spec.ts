import { TestBed } from '@angular/core/testing';
import { MigrationService, parseCsvLine } from './migration';
import { AppStore } from './store';

describe('migration-first demo', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
  });

  it('parses quoted CSV values', () => {
    expect(parseCsvLine('"Example, LLC";ops@example.test;"A; B"', ';')).toEqual([
      'Example, LLC',
      'ops@example.test',
      'A; B',
    ]);
  });

  it('analyzes, tests, confirms, and rolls back a migration with a quality report', () => {
    const migration = TestBed.inject(MigrationService);
    const store = TestBed.inject(AppStore);
    const initialClients = store.state().clients.length;
    localStorage.setItem('promisoflow.language', 'en-US');

    migration.useDemo();
    migration.analyze();
    expect(migration.state.report).toMatchObject({
      totalRows: 4,
      validRows: 3,
      duplicatesMerged: 1,
      missingOwner: 2,
      filesNotTransferred: 3,
      conflicts: 1,
    });
    expect(migration.state.status).toBe('analyzed');
    migration.runTest();
    expect(store.state().clients).toHaveLength(initialClients);
    expect(migration.state.status).toBe('tested');

    migration.confirm();
    expect(store.state().clients.length).toBe(initialClients + 2);
    expect(migration.state.importedClientIds).toHaveLength(2);
    expect(migration.state.duplicateIds).toContain('client-vector');
    expect(store.state().migration.report?.completeness).toBe(70);
    expect(store.state().migration.report?.unmappedFields).toEqual(['legacy_priority']);

    migration.rollback();
    expect(store.state().clients).toHaveLength(initialClients);
    expect(migration.state.status).toBe('rolled_back');
    expect(localStorage.getItem('promisoflow.language')).toBe('en-US');
  });
});
