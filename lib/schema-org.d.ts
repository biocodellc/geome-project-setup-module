import type { ProjectEngine, ProjectState } from "./project-engine.js";

export interface SchemaOrgNode {
  "@type": string;
  "@id"?: string;
  [property: string]: unknown;
}
export interface SchemaOrgProject extends SchemaOrgNode {
  "@context": "https://schema.org";
  "@type": "ResearchProject";
  name?: string;
  description?: string;
  funding?: SchemaOrgNode[];
  subjectOf: SchemaOrgNode;
}
/** Validates the v5 setup and returns descriptive JSON-LD, not a re-importable backup. */
export function exportSchemaOrg(
  engine: ProjectEngine,
  state: ProjectState,
): SchemaOrgProject;
