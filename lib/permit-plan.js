// Portable permit planning and report simulation. No DOM, storage, or remote lookups.
export const emptyPermitPlan = () => ({
  catalog: null,
  requirements: [],
  permits: [],
  targets: [],
});
const keyOf = (field) => `${field.recordLevel}.${field.field}`;
const project = {
  id: "project",
  level: "project",
  label: "Whole project",
  parentId: null,
};
const allowedParents = {
  expedition: ["project"],
  event: ["expedition"],
  entity: ["event"],
  sample: ["entity", "sample"],
};

function unique(items, key, label) {
  const ids = items.map((item) => item[key]);
  if (new Set(ids).size !== ids.length)
    throw new Error(`${label} identifiers must be unique.`);
}

export function assertPermitPlan(plan) {
  unique(plan.targets, "id", "Scope");
  unique(plan.permits, "id", "Permit");
  unique(plan.requirements, "typeId", "Requirement");
  if (!plan.catalog && (plan.permits.length || plan.requirements.length))
    throw new Error("Select a permit catalog first.");
  const types = plan.catalog?.types || [];
  unique(types, "id", "Permit type");
  const fieldTypes = new Map();
  for (const type of types) {
    const keys = new Set();
    for (const field of type.fields) {
      const key = keyOf(field);
      if (keys.has(key)) throw new Error(`Duplicate reporting field: ${key}.`);
      keys.add(key);
      const signature = `${field.dataType}:${field.format}`;
      if (field.format === "date" && field.dataType !== "string")
        throw new Error(`Date field ${key} must be a string.`);
      if (fieldTypes.has(key) && fieldTypes.get(key) !== signature)
        throw new Error(`Conflicting reporting definitions for ${key}.`);
      fieldTypes.set(key, signature);
    }
  }
  const targets = new Map(plan.targets.map((target) => [target.id, target]));
  if (targets.has("project"))
    throw new Error("The scope ID project is reserved for the whole project.");
  targets.set("project", project);
  for (const target of plan.targets) {
    const parent = targets.get(target.parentId ?? "project");
    if (!parent || !allowedParents[target.level]?.includes(parent.level))
      throw new Error(`Invalid parent for scope ${target.id}.`);
    const seen = new Set([target.id]);
    let ancestor = parent;
    while (ancestor.level !== "project") {
      if (seen.has(ancestor.id))
        throw new Error(`Scope cycle at ${target.id}.`);
      seen.add(ancestor.id);
      ancestor = targets.get(ancestor.parentId ?? "project");
      if (!ancestor) throw new Error(`Unknown parent for scope ${target.id}.`);
    }
  }
  for (const item of [...plan.requirements, ...plan.permits]) {
    if (!types.some((type) => type.id === item.typeId))
      throw new Error(`Unknown permit type: ${item.typeId}.`);
    const scopes = new Set();
    for (const scope of item.coverage) {
      if (targets.get(scope.targetId)?.level !== scope.level)
        throw new Error(
          `Unknown or mismatched coverage target: ${scope.targetId}.`,
        );
      if (scopes.has(scope.targetId))
        throw new Error(`Duplicate coverage target: ${scope.targetId}.`);
      scopes.add(scope.targetId);
    }
  }
  for (const permit of plan.permits) {
    if (
      permit.validFrom &&
      permit.validUntil &&
      permit.validFrom > permit.validUntil
    )
      throw new Error(
        `Permit ${permit.identifier}: end date precedes start date.`,
      );
  }
  return plan;
}

export function scopeChain(plan, targetId) {
  const targets = new Map(plan.targets.map((target) => [target.id, target]));
  targets.set("project", project);
  const chain = [];
  let target = targets.get(targetId);
  if (!target) throw new Error(`Unknown report target: ${targetId}.`);
  while (target) {
    if (chain.some((item) => item.id === target.id))
      throw new Error("Scope cycle.");
    chain.push(target);
    target =
      target.level === "project"
        ? null
        : targets.get(target.parentId ?? "project");
    if (!target && chain.at(-1).level !== "project")
      throw new Error("Unknown parent scope.");
  }
  return chain;
}

function nearestScope(coverage, chain) {
  return chain.find((target) =>
    coverage.some(
      (scope) => scope.targetId === target.id && scope.level === target.level,
    ),
  );
}

export function resolvePermitCoverage(plan, targetId) {
  assertPermitPlan(plan);
  const chain = scopeChain(plan, targetId);
  return plan.permits.flatMap((permit) => {
    const via = nearestScope(permit.coverage, chain);
    return via
      ? [
          {
            permitId: permit.id,
            typeId: permit.typeId,
            via: { level: via.level, targetId: via.id },
            inherited: via.id !== targetId,
          },
        ]
      : [];
  });
}

export function reportingFields(
  plan,
  typeIds = plan.requirements.map((r) => r.typeId),
) {
  const fields = new Map();
  for (const type of plan.catalog?.types || []) {
    if (!typeIds.includes(type.id)) continue;
    for (const field of type.fields) {
      const key = keyOf(field);
      const previous = fields.get(key);
      if (previous) {
        if (
          previous.dataType !== field.dataType ||
          previous.format !== field.format
        )
          throw new Error(`Conflicting reporting definitions for ${key}.`);
        previous.required ||= field.required;
        previous.sourcePermitTypeIds.push(type.id);
      } else fields.set(key, { ...field, sourcePermitTypeIds: [type.id] });
    }
  }
  return [...fields.values()];
}

const validDate = (value) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const date = new Date(value + "T00:00:00Z");
  return (
    !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
  );
};

/** One row per sample, including derived samples. No inferred specimen counts. */
export function previewPermitReport(plan, records, { permitId = null } = {}) {
  assertPermitPlan(plan);
  unique(records, "targetId", "Preview record");
  const values = new Map(
    records.map((record) => [record.targetId, record.values]),
  );
  for (const record of records) scopeChain(plan, record.targetId);
  const selected =
    permitId === null
      ? null
      : plan.permits.find((permit) => permit.id === permitId);
  if (permitId !== null && !selected) throw new Error("Unknown report permit.");
  const columns = reportingFields(
    plan,
    selected
      ? [selected.typeId]
      : [
          ...new Set([
            ...plan.requirements.map((r) => r.typeId),
            ...plan.permits.map((p) => p.typeId),
          ]),
        ],
  );
  const rows = [];
  for (const sample of plan.targets.filter(
    (target) => target.level === "sample",
  )) {
    const chain = scopeChain(plan, sample.id);
    const coverage = resolvePermitCoverage(plan, sample.id);
    if (selected && !coverage.some((link) => link.permitId === selected.id))
      continue;
    const applicableRequirements = plan.requirements.filter((req) =>
      nearestScope(req.coverage, chain),
    );
    const typeIds = selected
      ? [selected.typeId]
      : [
          ...new Set([
            ...applicableRequirements.map((r) => r.typeId),
            ...coverage.map((link) => link.typeId),
          ]),
        ];
    const fields = reportingFields(plan, typeIds);
    const row = {
      sampleId: sample.id,
      entityId: chain.find((t) => t.level === "entity")?.id || null,
      values: {},
      coverage,
      issues: [],
    };
    for (const field of fields) {
      const target = chain.find((t) => t.level === field.recordLevel);
      const value = target && values.get(target.id)?.[field.field];
      const key = keyOf(field);
      row.values[key] = value ?? null;
      const missing =
        value == null || (typeof value === "string" && !value.trim());
      if (missing && field.required)
        row.issues.push({
          code: "missing-field",
          field: key,
          message: `Missing ${field.label}.`,
        });
      else if (
        !missing &&
        (typeof value !== field.dataType ||
          (field.format === "date" && !validDate(value)) ||
          (field.dataType === "number" && !Number.isFinite(value)))
      )
        row.issues.push({
          code: "invalid-field",
          field: key,
          message: `Invalid ${field.label}.`,
        });
    }
    for (const requirement of applicableRequirements) {
      if (!coverage.some((link) => link.typeId === requirement.typeId))
        row.issues.push({
          code: "missing-permit",
          typeId: requirement.typeId,
          message: `No linked permit for ${plan.catalog.types.find((t) => t.id === requirement.typeId).label}.`,
        });
    }
    const event = chain.find((t) => t.level === "event");
    const date = event && values.get(event.id)?.eventDate;
    for (const link of coverage.filter(
      (link) => !selected || link.permitId === selected.id,
    )) {
      const permit = plan.permits.find((p) => p.id === link.permitId);
      if ((permit.validFrom || permit.validUntil) && !validDate(date))
        row.issues.push({
          code: "date-unknown",
          permitId: permit.id,
          message: `${permit.identifier}: collection date needed to review validity.`,
        });
      else if (
        date &&
        ((permit.validFrom && date < permit.validFrom) ||
          (permit.validUntil && date > permit.validUntil))
      )
        row.issues.push({
          code: "permit-date-mismatch",
          permitId: permit.id,
          message: `${permit.identifier}: collection date is outside the recorded validity dates.`,
        });
    }
    rows.push(row);
  }
  const issues = [
    ...plan.requirements
      .filter((req) => !req.coverage.length)
      .map((req) => ({
        code: "unassigned-requirement",
        message: `Assign coverage for requirement ${req.typeId}.`,
      })),
    ...plan.permits
      .filter((permit) => !permit.coverage.length)
      .map((permit) => ({
        code: "unassigned-permit",
        message: `Assign coverage for permit ${permit.identifier}.`,
      })),
  ];
  return { columns, rows, issues };
}
