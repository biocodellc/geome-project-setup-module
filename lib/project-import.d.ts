import type {
  ProjectEngine,
  ProjectState,
  ProjectDescription,
  PermitReference,
  SourceImport,
} from "./project-engine.js";
export interface ImportCandidate {
  title: string;
  description: string;
  place: string;
  people: ProjectDescription["people"];
  funding: ProjectDescription["funding"];
  identifiers: ProjectDescription["identifiers"];
  warnings: string[];
  source: SourceImport;
  permit: Pick<
    PermitReference,
    | "identifier"
    | "url"
    | "doi"
    | "issuer"
    | "holder"
    | "validFrom"
    | "validUntil"
    | "scope"
  >;
}
export function plainText(value: unknown): string;
export function normalizeDOI(value: unknown): string;
export function isIPlacesURL(value: string): boolean;
export function extractJSONLD(html: string): unknown[];
export function fromDataCite(
  record: unknown,
  options?: { kind?: "project" | "permit"; url?: string; retrievedAt?: string },
): ImportCandidate;
export function fromSchemaOrg(
  documents: unknown,
  options: { kind?: "project" | "permit"; url: string; retrievedAt?: string },
): ImportCandidate;
export function lookupReference(
  input: string,
  options?: {
    kind?: "project" | "permit";
    fetchImpl?: typeof fetch;
    retrievedAt?: string;
    signal?: AbortSignal;
  },
): Promise<ImportCandidate>;
export function applyProjectImport(
  engine: ProjectEngine,
  state: ProjectState,
  candidate: ImportCandidate,
  edits?: {
    title?: string;
    description?: string;
    people?: ProjectDescription["people"];
    funding?: ProjectDescription["funding"];
    country?: string;
    place?: string;
  },
): ProjectState;
export function applyPermitImport(
  engine: ProjectEngine,
  state: ProjectState,
  candidate: ImportCandidate,
  fields?: ImportCandidate["permit"],
): ProjectState;
