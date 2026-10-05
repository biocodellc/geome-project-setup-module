import type {
  PermitPlan,
  PermitTarget,
  CoverageLink,
  ReportingField,
  PreviewRecord,
  ReportPreview,
} from "./project-engine.js";
export function emptyPermitPlan(): PermitPlan;
export function assertPermitPlan(plan: PermitPlan): PermitPlan;
export function scopeChain(
  plan: PermitPlan,
  targetId: string,
): Array<
  | PermitTarget
  | { id: "project"; level: "project"; label: string; parentId: null }
>;
export function resolvePermitCoverage(
  plan: PermitPlan,
  targetId: string,
): CoverageLink[];
export function reportingFields(
  plan: PermitPlan,
  typeIds?: string[],
): Array<ReportingField & { sourcePermitTypeIds: string[] }>;
export function previewPermitReport(
  plan: PermitPlan,
  records: PreviewRecord[],
  options?: { permitId?: string | null },
): ReportPreview;
