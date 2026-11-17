import { Injectable } from '@angular/core';
import { Client, LocalizedText, MigrationReport, MigrationState } from './models';
import { AppStore } from './store';
import { DEMO_NOW } from './workflow';

const DEMO_CSV = `name,email,contact,phone,segment,owner,attachment,legacy_priority
Orbit Labs,ops@orbit.example,Maya Chen,+1 555 0101,B2B SaaS,Anna Morozova,orbit-brief.pdf,high
Vector duplicate,igor@vector.example,Igor Sokolov,+7 495 120-40-20,Manufacturing,Anna Morozova,,medium
Northwind,,Oliver Stone,+1 555 0102,Consulting,,northwind-scope.pdf,high
Lumen Works,hello@lumen.example,Sofia Lee,+1 555 0103,Professional services,,lumen-brief.pdf,low`;

export interface CsvRow {
  [key: string]: string;
}

function text(ru: string, en: string): LocalizedText {
  return { ru, en };
}

function initialMigration(): MigrationState {
  return {
    step: 0,
    source: 'csv',
    fileName: '',
    csvContent: '',
    fieldMapping: {},
    status: 'idle',
    importedClientIds: [],
    duplicateIds: [],
    errors: [],
  };
}

export function parseCsvLine(line: string, delimiter: string): string[] {
  const values: string[] = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]!;
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      values.push(value.trim());
      value = '';
    } else value += char;
  }
  values.push(value.trim());
  return values;
}

@Injectable({ providedIn: 'root' })
export class MigrationService {
  constructor(private readonly store: AppStore) {}

  get state(): MigrationState {
    return this.store.snapshot().migration;
  }

  setSource(source: MigrationState['source']): void {
    this.save({ ...this.state, source });
  }

  useDemo(): void {
    this.save({
      ...initialMigration(),
      source: this.state.source,
      fileName: 'promisoflow-migration-demo.csv',
      csvContent: DEMO_CSV,
      step: 1,
    });
  }

  loadCsv(fileName: string, content: string): void {
    this.save({ ...initialMigration(), source: 'csv', fileName, csvContent: content, step: 1 });
  }

  rows(content = this.state.csvContent): CsvRow[] {
    const lines = content
      .replace(/^\uFEFF/, '')
      .split(/\r?\n/)
      .filter((line) => line.trim());
    if (lines.length < 2) return [];
    const delimiter = lines[0]!.includes(';') ? ';' : ',';
    const headers = parseCsvLine(lines[0]!, delimiter);
    return lines.slice(1).map((line) => {
      const values = parseCsvLine(line, delimiter);
      return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']));
    });
  }

  headers(content = this.state.csvContent): string[] {
    const first = content
      .replace(/^\uFEFF/, '')
      .split(/\r?\n/)
      .find((line) => line.trim());
    if (!first) return [];
    return parseCsvLine(first, first.includes(';') ? ';' : ',');
  }

  analyze(): void {
    const current = this.state;
    const rows = this.rows();
    if (!rows.length) throw new Error('invalid_csv');
    const fieldMapping = Object.fromEntries(
      this.headers().map((header) => [header, this.defaultTarget(header)]),
    );
    const report = this.buildReport(rows, fieldMapping);
    this.save({
      ...current,
      fieldMapping,
      report,
      errors: this.errors(report),
      status: 'analyzed',
      step: 2,
    });
  }

  setMapping(header: string, target: string): void {
    const current = this.state;
    const fieldMapping = { ...current.fieldMapping, [header]: target };
    const report = this.buildReport(this.rows(), fieldMapping);
    this.save({ ...current, fieldMapping, report, errors: this.errors(report) });
  }

  setStep(step: number): void {
    this.save({ ...this.state, step });
  }

  runTest(): void {
    const current = this.state;
    const mappedTargets = Object.values(current.fieldMapping);
    if (!mappedTargets.includes('name') || !mappedTargets.includes('email'))
      throw new Error('mapping_required');
    const report = this.buildReport(this.rows(), current.fieldMapping);
    this.save({ ...current, report, errors: this.errors(report), status: 'tested', step: 6 });
  }

  confirm(): void {
    const current = this.state;
    if (current.status !== 'tested' || !current.report) throw new Error('test_required');
    const clients = this.store.snapshot().clients;
    const existingEmails = new Set(clients.map((client) => client.email.toLowerCase()));
    const seen = new Set<string>();
    const imported: Client[] = [];
    const duplicateIds: string[] = [];
    for (const row of this.rows()) {
      const mapped = this.mapRow(row, current.fieldMapping);
      const email = mapped['email']?.toLowerCase() ?? '';
      if (!mapped['name'] || !email || !/^\S+@\S+\.\S+$/.test(email)) continue;
      const duplicate = clients.find((client) => client.email.toLowerCase() === email);
      if (duplicate || existingEmails.has(email) || seen.has(email)) {
        duplicateIds.push(duplicate?.id ?? email);
        seen.add(email);
        continue;
      }
      seen.add(email);
      imported.push({
        id: `client-migration-${imported.length + 1}`,
        name: text(mapped['name']!, mapped['name']!),
        legalName: text(mapped['name']!, mapped['name']!),
        contactName: mapped['contact'] || 'Migration review required',
        email,
        phone: mapped['phone'] || '',
        segment: text(
          mapped['segment'] || 'Migrated client',
          mapped['segment'] || 'Migrated client',
        ),
        ownerId: 'user-sales',
        createdAt: DEMO_NOW,
        repeatPotential: 0.5,
      });
    }
    this.store.transact((state) => {
      const availableImported = imported.filter(
        (client) => !state.clients.some((existing) => existing.id === client.id),
      );
      state.clients.push(...availableImported);
      state.migration = {
        ...state.migration,
        status: 'confirmed',
        step: 9,
        importedClientIds: availableImported.map((client) => client.id),
        duplicateIds,
      };
      state.activities.push({
        id: `activity-${state.activities.length + 1}`,
        at: DEMO_NOW,
        actorId: 'user-owner',
        action: text(
          `Подтверждена миграция: ${availableImported.length} клиентов, ${duplicateIds.length} дубликатов`,
          `Migration confirmed: ${availableImported.length} clients, ${duplicateIds.length} duplicates`,
        ),
        entityType: 'migration',
        entityId: 'migration',
        internal: true,
      });
    });
  }

  rollback(): void {
    this.store.transact((state) => {
      const ids = new Set(state.migration.importedClientIds);
      state.clients = state.clients.filter((client) => !ids.has(client.id));
      state.migration = {
        ...state.migration,
        status: 'rolled_back',
        step: 9,
        importedClientIds: [],
      };
      state.activities.push({
        id: `activity-${state.activities.length + 1}`,
        at: DEMO_NOW,
        actorId: 'user-owner',
        action: text(
          'Миграция откачена; добавленные клиенты удалены',
          'Migration rolled back; imported clients removed',
        ),
        entityType: 'migration',
        entityId: 'migration',
        internal: true,
      });
    });
  }

  restart(): void {
    this.save(initialMigration());
  }

  private buildReport(rows: CsvRow[], mapping: Record<string, string>): MigrationReport {
    const existingEmails = new Set(
      this.store.snapshot().clients.map((client) => client.email.toLowerCase()),
    );
    const seen = new Set<string>();
    let validRows = 0;
    let duplicatesMerged = 0;
    let missingOwner = 0;
    let filesNotTransferred = 0;
    for (const row of rows) {
      const mapped = this.mapRow(row, mapping);
      const email = mapped['email']?.toLowerCase() ?? '';
      const valid = Boolean(mapped['name']) && /^\S+@\S+\.\S+$/.test(email);
      if (valid) validRows += 1;
      if (!mapped['owner']) missingOwner += 1;
      if (mapped['attachment']) filesNotTransferred += 1;
      if (valid && (existingEmails.has(email) || seen.has(email))) duplicatesMerged += 1;
      if (valid) seen.add(email);
    }
    const unmappedFields = Object.entries(mapping)
      .filter(([, target]) => !target)
      .map(([header]) => header);
    const conflicts = rows.length - validRows;
    const completeness = rows.length
      ? Math.max(0, Math.round((validRows / rows.length) * 100 - (filesNotTransferred ? 5 : 0)))
      : 0;
    return {
      totalRows: rows.length,
      validRows,
      duplicatesMerged,
      missingOwner,
      unmappedFields,
      filesNotTransferred,
      conflicts,
      completeness,
    };
  }

  private errors(report: MigrationReport): LocalizedText[] {
    const result: LocalizedText[] = [];
    if (report.missingOwner)
      result.push(
        text(
          `${report.missingOwner} записей потеряли владельца`,
          `${report.missingOwner} records lost their owner`,
        ),
      );
    if (report.filesNotTransferred)
      result.push(
        text(
          `${report.filesNotTransferred} вложений не перенесены`,
          `${report.filesNotTransferred} attachments were not transferred`,
        ),
      );
    if (report.conflicts)
      result.push(
        text(
          `${report.conflicts} конфликтов требуют решения человеком`,
          `${report.conflicts} conflicts require a human decision`,
        ),
      );
    return result;
  }

  private mapRow(row: CsvRow, mapping: Record<string, string>): CsvRow {
    const mapped: CsvRow = {};
    for (const [header, target] of Object.entries(mapping)) {
      if (target) mapped[target] = row[header] ?? '';
    }
    return mapped;
  }

  private defaultTarget(header: string): string {
    const normalized = header.toLowerCase().replace(/[^a-z]/g, '');
    const targets: Record<string, string> = {
      name: 'name',
      company: 'name',
      companyname: 'name',
      email: 'email',
      contact: 'contact',
      contactname: 'contact',
      phone: 'phone',
      segment: 'segment',
      owner: 'owner',
      attachment: 'attachment',
    };
    return targets[normalized] ?? '';
  }

  private save(state: MigrationState): void {
    this.store.setMigration(state);
  }
}
