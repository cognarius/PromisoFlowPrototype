export type Language = 'ru-RU' | 'en-US';
export type LanguageShort = 'ru' | 'en';
export type Currency = 'RUB';
export type RoleCode = 'owner' | 'sales' | 'project' | 'finance' | 'client';
export type EntityType =
  | 'client'
  | 'proposal'
  | 'contract'
  | 'project'
  | 'obligation'
  | 'invoice'
  | 'payment'
  | 'cost'
  | 'document'
  | 'integration'
  | 'migration';

export interface LocalizedText {
  ru: string;
  en: string;
}

export type ProposalStatus = 'draft' | 'approved' | 'converted';
export type ContractStatus = 'draft' | 'awaiting_signature' | 'signed';
export type ProjectStatus = 'in_progress' | 'completed' | 'blocked';
export type ObligationStatus =
  'pending' | 'in_progress' | 'completed' | 'overdue' | 'blocked' | 'waiting_confirmation';
export type InvoiceStatus = 'draft' | 'issued' | 'partially_paid' | 'paid';
export type PaymentStatus = 'unmatched' | 'partially_matched' | 'matched';
export type ConfirmationStatus = 'pending' | 'confirmed' | 'edited';
export type DocumentStatus = 'draft' | 'pending_approval' | 'signed' | 'ready' | 'error';
export type IntegrationStatus = 'queued' | 'done' | 'error' | 'retry' | 'conflict' | 'delayed';
export type AiStatus = 'pending' | 'accepted' | 'edited' | 'rejected' | 'rolled_back';

export interface Client {
  id: string;
  name: LocalizedText;
  legalName: LocalizedText;
  contactName: string;
  email: string;
  phone: string;
  segment: LocalizedText;
  ownerId: string;
  createdAt: string;
  repeatPotential: number;
  nextOrderDate?: string;
}

export interface ProposalItem {
  id: string;
  service: LocalizedText;
  quantity: number;
  unitPrice: number;
  unitCost: number;
}

export interface Proposal {
  id: string;
  clientId: string;
  title: LocalizedText;
  status: ProposalStatus;
  items: ProposalItem[];
  discountPercent: number;
  ownerId: string;
  createdAt: string;
  approvedAt?: string;
  expectedReceiptDate?: string;
  managerExpectedAmount?: number;
}

export interface Contract {
  id: string;
  proposalId: string;
  clientId: string;
  number: string;
  status: ContractStatus;
  version: number;
  createdAt: string;
  signedAt?: string;
  extractionStatus: ConfirmationStatus;
  extractedByAi: boolean;
  confirmedBy?: string;
}

export interface Project {
  id: string;
  contractId: string;
  clientId: string;
  name: LocalizedText;
  status: ProjectStatus;
  managerId: string;
  startDate: string;
  dueDate: string;
}

export interface Obligation {
  id: string;
  projectId: string;
  kind: 'delivery' | 'acceptance' | 'payment' | 'support';
  title: LocalizedText;
  dueDate: string;
  status: ObligationStatus;
  progress: number;
  ownerId: string;
  amount?: number;
  source: LocalizedText;
  confirmationStatus: ConfirmationStatus;
  confirmedBy?: string;
  completedAt?: string;
  invoiceId?: string;
  closingDocumentId?: string;
}

export interface FinancialEvent {
  id: string;
  projectId: string;
  obligationId?: string;
  invoiceId?: string;
  dueDate: string;
  amount: number;
  status: 'scheduled' | 'invoiced' | 'paid' | 'overdue';
  confirmationStatus: ConfirmationStatus;
  source: LocalizedText;
}

export interface Invoice {
  id: string;
  projectId: string;
  clientId: string;
  obligationId?: string;
  number: string;
  amount: number;
  issueDate: string;
  dueDate: string;
  status: InvoiceStatus;
}

export interface PaymentMatch {
  id: string;
  invoiceId: string;
  amount: number;
  matchedBy: string;
  matchedAt: string;
}

export interface Payment {
  id: string;
  clientId: string;
  payer: LocalizedText;
  amount: number;
  date: string;
  purpose: LocalizedText;
  matches: PaymentMatch[];
  source: 'bank_mock' | 'manual';
}

export interface Cost {
  id: string;
  projectId: string;
  description: LocalizedText;
  category: 'labor' | 'rework' | 'license' | 'contractor' | 'other';
  amount: number;
  date: string;
  source: LocalizedText;
}

export interface Document {
  id: string;
  clientId: string;
  projectId?: string;
  contractId?: string;
  proposalId?: string;
  invoiceId?: string;
  obligationId?: string;
  kind: 'contract' | 'proposal' | 'act' | 'invoice' | 'upd' | 'amendment' | 'material';
  title: LocalizedText;
  version: number;
  status: DocumentStatus;
  content: LocalizedText;
  createdAt: string;
  internal: boolean;
}

export interface User {
  id: string;
  name: string;
  role: RoleCode;
  initials: string;
}

export interface Role {
  code: RoleCode;
  canSeeFinance: boolean;
  canManageDelivery: boolean;
  canManageSales: boolean;
  canManageFinance: boolean;
}

export interface Activity {
  id: string;
  at: string;
  actorId: string;
  action: LocalizedText;
  entityType: EntityType;
  entityId: string;
  internal: boolean;
}

export interface IntegrationEvent {
  id: string;
  system: 'accounting' | 'bank' | 'edi' | 'mail' | 'calendar' | 'storage';
  entityType: EntityType;
  entityId: string;
  status: IntegrationStatus;
  message: LocalizedText;
  transformLog: LocalizedText[];
  updatedAt: string;
  attempts: number;
}

export interface AiHistoryEntry {
  at: string;
  actorId: string;
  action: 'generated' | 'accepted' | 'edited' | 'rejected' | 'rolled_back';
  note: LocalizedText;
}

export interface AiResult {
  id: string;
  kind:
    'extract_terms' | 'compare_versions' | 'explain_margin' | 'payment_reminder' | 'next_action';
  entityType: EntityType;
  entityId: string;
  source: LocalizedText;
  confidence: number;
  status: AiStatus;
  result: LocalizedText;
  model: string;
  costRub: number;
  createdAt: string;
  confirmedBy?: string;
  history: AiHistoryEntry[];
}

export interface NextAction {
  id: string;
  type:
    | 'remind_payment'
    | 'check_obligation'
    | 'request_approval'
    | 'review_cost'
    | 'review_discount'
    | 'invoice_completed'
    | 'repeat_sale'
    | 'confirm_terms'
    | 'match_payment';
  entityType: EntityType;
  entityId: string;
  ownerId: string;
  title: LocalizedText;
  reason: LocalizedText;
  expectedEffect: number;
  expectedEffectText: LocalizedText;
  effectKind: 'cash' | 'margin' | 'risk';
  priority: number;
}

export interface MigrationReport {
  totalRows: number;
  validRows: number;
  duplicatesMerged: number;
  missingOwner: number;
  unmappedFields: string[];
  filesNotTransferred: number;
  conflicts: number;
  completeness: number;
}

export interface MigrationState {
  step: number;
  source: 'csv' | 'hubspot' | 'pipedrive';
  fileName: string;
  csvContent: string;
  fieldMapping: Record<string, string>;
  report?: MigrationReport;
  status: 'idle' | 'analyzed' | 'tested' | 'confirmed' | 'rolled_back';
  importedClientIds: string[];
  duplicateIds: string[];
  errors: LocalizedText[];
}

export interface AppState {
  schemaVersion: number;
  clients: Client[];
  proposals: Proposal[];
  contracts: Contract[];
  projects: Project[];
  obligations: Obligation[];
  financialEvents: FinancialEvent[];
  invoices: Invoice[];
  payments: Payment[];
  costs: Cost[];
  documents: Document[];
  users: User[];
  activities: Activity[];
  integrationEvents: IntegrationEvent[];
  aiResults: AiResult[];
  nextActions: NextAction[];
  completedActionIds: string[];
  migration: MigrationState;
}
