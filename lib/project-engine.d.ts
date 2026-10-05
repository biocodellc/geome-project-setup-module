export type Answer = string | boolean | string[];
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
  createdAt: string;
  updatedAt: string;
  savedAt: string;
  status: "draft" | "saved";
}
/** Runtime validation against the adopted schema remains authoritative. */
export interface ProjectConfiguration extends ProjectState {
  $schema: string;
  kind: "project-configuration";
  version: 2;
  modelVersions: { schema: string; questionnaire: string; rules: string };
  templates: {
    input: string | null;
    output: string | null;
    conversionImplemented: false;
  };
  metadataRequirements: Array<{ field: string; level: string }>;
  guardrails: Array<Record<string, unknown>>;
  sources: Array<Record<string, unknown>>;
}
export type JsonObject = Record<string, any>;
export interface ProjectEngine {
  model: JsonObject;
  createDraft(): ProjectState;
  newLocation(): Location;
  visibleQuestions(state: ProjectState): JsonObject[];
  pruneAnswers(state: ProjectState): void;
  contextLabel(location: Location | null): string;
  profileFor(location: Location): JsonObject | null;
  guardrails(state: ProjectState): Array<Record<string, unknown>>;
  requirements(state: ProjectState): Array<{ field: string; level: string }>;
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
