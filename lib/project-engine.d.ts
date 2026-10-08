export type Answer = string | boolean | string[];
export type RecordLevel =
  "project" | "expedition" | "event" | "entity" | "sample";
export interface PermitCoverage {
  level: RecordLevel;
  targetId: string;
}
export interface PermitTarget {
  id: string;
  level: Exclude<RecordLevel, "project">;
  label: string;
  parentId: string | null;
}
export interface ReportingField {
  field: string;
  label: string;
  recordLevel: RecordLevel;
  dataType: "string" | "boolean" | "number";
  required: boolean;
  format: "text" | "date";
}
export interface PermitType {
  id: string;
  label: string;
  description: string;
  fields: ReportingField[];
}
export interface PermitCatalog {
  id: string;
  version: "1.0.0";
  title: string;
  jurisdiction: string;
  illustrative: boolean;
  curator: string;
  types: PermitType[];
}
export interface PermitReference {
  id: string;
  typeId: string;
  identifier: string;
  url: string;
  doi: string;
  issuer: string;
  holder: string;
  validFrom: string;
  validUntil: string;
  scope: string;
  visibility: "members" | "public";
  coverage: PermitCoverage[];
}
export interface PermitPlan {
  catalog: PermitCatalog | null;
  requirements: Array<{ typeId: string; coverage: PermitCoverage[] }>;
  permits: PermitReference[];
  targets: PermitTarget[];
}
export interface PreviewRecord {
  targetId: string;
  values: Record<string, string | number | boolean>;
}
export interface CoverageLink {
  permitId: string;
  typeId: string;
  via: PermitCoverage;
  inherited: boolean;
}
export interface ReportIssue {
  code: string;
  message: string;
  field?: string;
  typeId?: string;
  permitId?: string;
}
export interface ReportPreview {
  columns: Array<ReportingField & { sourcePermitTypeIds: string[] }>;
  rows: Array<{
    sampleId: string;
    entityId: string | null;
    values: Record<string, string | number | boolean | null>;
    coverage: CoverageLink[];
    issues: ReportIssue[];
  }>;
  issues: ReportIssue[];
}
export interface MetadataRequirement {
  field: string;
  level: string;
  recordLevel: RecordLevel;
  dataType: "string" | "boolean" | "number";
  required: boolean;
  sourcePermitTypeIds: string[];
}
export interface Location {
  id: string;
  country: string;
  region?: string;
  locality?: string;
  protectedArea?: string;
  protectedName?: string;
  accessType?: string;
}
export interface ReviewRecord {
  status?: string;
  owner?: string;
  note?: string;
  evidence?: string;
  updatedAt?: string;
  fingerprint?: string;
  stale?: boolean;
}
export interface ProjectState {
  answers: Record<string, Answer>;
  locations: Location[];
  reviewRecords: Record<string, ReviewRecord>;
  permitPlan: PermitPlan;
  projectDescription: ProjectDescription;
  createdAt: string;
  updatedAt: string;
  savedAt: string;
  status: "draft" | "saved";
}
/** Runtime validation against the adopted schema remains authoritative. */
export interface ProjectConfiguration extends ProjectState {
  $schema: string;
  kind: "project-configuration";
  version: 5;
  modelVersions: { schema: string; questionnaire: string; rules: string };
  templates: {
    input: string | null;
    output: string | null;
    conversionImplemented: false;
  };
  metadataRequirements: MetadataRequirement[];
  guardrails: Array<Record<string, unknown>>;
  sources: Array<Record<string, unknown>>;
}
export type JsonObject = Record<string, any>;
export interface SourceImport {
  kind: "project" | "permit";
  format: "datacite" | "schema.org" | "reference";
  url: string;
  retrievedAt: string;
  /** Original metadata, serialized as JSON. Never execute or resolve its context. */
  content: string;
}
export interface ProjectDescription {
  people: Array<{ name: string; identifier: string; affiliation: string }>;
  funding: Array<{
    funder: string;
    awardNumber: string;
    awardTitle: string;
    awardUrl: string;
  }>;
  identifiers: Array<{ scheme: "doi" | "url"; value: string }>;
  imports: SourceImport[];
}
export interface ProjectEngine {
  model: JsonObject;
  createDraft(): ProjectState;
  newLocation(): Location;
  visibleQuestions(state: ProjectState): JsonObject[];
  pruneAnswers(state: ProjectState): void;
  contextLabel(location: Location | null): string;
  profileFor(location: Location): JsonObject | null;
  guardrails(state: ProjectState): Array<Record<string, unknown>>;
  requirements(state: ProjectState): MetadataRequirement[];
  exportConfiguration(state: ProjectState): ProjectConfiguration;
  assertValid(doc: unknown): JsonObject;
  importConfiguration(
    doc: unknown,
    options?: { asImport?: boolean },
  ): ProjectState;
  updateAnswers(
    state: ProjectState,
    patch: Record<string, Answer>,
  ): ProjectState;
  updatePermitPlan(state: ProjectState, plan: PermitPlan): ProjectState;
  selectPermitRequirement(
    state: ProjectState,
    typeId: string,
    selected?: boolean,
  ): ProjectState;
  newPermit(typeId: string, identifier: string): PermitReference;
  resolvePermitCoverage(state: ProjectState, targetId: string): CoverageLink[];
  previewPermitReport(
    state: ProjectState,
    records: PreviewRecord[],
    options?: { permitId?: string | null },
  ): ReportPreview;
}
export function createProjectEngine(
  model: JsonObject,
  options?: { now?: () => string; uid?: () => string },
): ProjectEngine;
export function matches(
  condition: JsonObject | undefined,
  answers: Record<string, Answer>,
  location?: Location,
): boolean;
