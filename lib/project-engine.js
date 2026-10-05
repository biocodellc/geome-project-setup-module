import { checkImport } from "./configuration-validation.js";
import {
  emptyPermitPlan,
  reportingFields,
  resolvePermitCoverage,
  previewPermitReport,
} from "./permit-plan.js";

const present = (value) =>
  value !== undefined &&
  value !== null &&
  value !== "" &&
  (!Array.isArray(value) || value.length > 0);

export function matches(condition, answers, location) {
  if (!condition) return true;
  const get = (field) =>
    field.startsWith("$location.")
      ? location?.[field.slice(10)]
      : answers[field];
  if (condition.all)
    return condition.all.every((c) => matches(c, answers, location));
  if (condition.any)
    return condition.any.some((c) => matches(c, answers, location));
  if (condition.not) return !matches(condition.not, answers, location);
  if (condition.eq) return get(condition.eq[0]) === condition.eq[1];
  if (condition.in) return condition.in[1].includes(get(condition.in[0]));
  if (condition.contains)
    return (
      Array.isArray(get(condition.contains[0])) &&
      get(condition.contains[0]).includes(condition.contains[1])
    );
  if (condition.exists) return present(get(condition.exists));
  return false;
}

/** Shared result engine for browsers and Node. Storage and UI belong to the host. */
export function createProjectEngine(model, options = {}) {
  const now = options.now || (() => new Date().toISOString());
  const uid =
    options.uid ||
    (() =>
      globalThis.crypto?.randomUUID?.() ||
      "loc-" +
        Date.now().toString(36) +
        "-" +
        Math.random().toString(36).slice(2, 8));
  const names = new Intl.DisplayNames(["en"], { type: "region" });
  const countryName = (code) =>
    code ? names.of(code) || code : "Country not yet selected";
  const newLocation = () => ({
    id: uid(),
    country: "",
    region: "",
    locality: "",
    protectedArea: "unsure",
    protectedName: "",
    accessType: "unsure",
  });
  const createDraft = () => ({
    answers: { visibility: "members" },
    locations: [newLocation()],
    reviewRecords: {},
    permitPlan: emptyPermitPlan(),
    createdAt: now(),
    updatedAt: now(),
    savedAt: "",
    status: "draft",
  });
  const visibleQuestions = (state) =>
    model.questions.filter((q) => matches(q.when, state.answers));

  function activeAnswers(state) {
    const out = {};
    for (const q of visibleQuestions(state)) {
      if (q.type !== "locations" && Object.hasOwn(state.answers, q.id))
        out[q.id] = state.answers[q.id];
    }
    return out;
  }
  function pruneAnswers(state) {
    state.answers = activeAnswers(state);
  }
  function contextLabel(location) {
    return location
      ? [
          location.locality,
          location.region,
          location.country
            ? countryName(location.country)
            : "Origin not identified",
        ]
          .filter(Boolean)
          .join(" · ")
      : "Project-wide";
  }
  function fingerprint(rule, location, state) {
    const fields = rule.watch || model.questions.map((q) => q.id);
    return JSON.stringify({
      v: model.version,
      rule: rule.id,
      context: Object.fromEntries(
        fields.map((f) => [
          f,
          f === "locations" ? location || state.locations : state.answers[f],
        ]),
      ),
    });
  }
  function profileFor(location) {
    const base = model.profiles[location.country];
    if (!base) return null;
    if (
      location.country === "US" &&
      /hawai|\bhi\b/i.test(location.region + " " + location.locality)
    ) {
      return {
        ...base,
        note: "Review Hawaiʻi aquatic activity permissions and the relevant DLNR land, wildlife, or protected-area program. Federal and other permissions may also apply.",
        sources: ["hawaii", "hawaiiLand"],
      };
    }
    return base;
  }
  function guardrails(state) {
    if (!state.answers.intent) return [];
    const output = [];
    const locations = state.locations.length
      ? state.locations
      : [{ id: "unspecified", country: "" }];
    for (const rule of model.rules) {
      const contexts = rule.scope === "location" ? locations : [null];
      for (const location of contexts) {
        if (!matches(rule.when, state.answers, location)) continue;
        const id = rule.id + (location ? "@" + location.id : "");
        const trigger = fingerprint(rule, location, state);
        let record = state.reviewRecords[id];
        if (record && record.fingerprint !== trigger) {
          record = {
            ...record,
            status: "Pending review",
            fingerprint: trigger,
            stale: true,
            updatedAt: now(),
          };
          state.reviewRecords[id] = record;
        }
        const extra =
          location &&
          ["abs", "local-access", "collecting", "protected-site"].includes(
            rule.id,
          )
            ? profileFor(location)
            : null;
        const sourceIds = [
          ...new Set([...rule.sources, ...(extra?.sources || [])]),
        ];
        const status =
          record?.status ||
          (rule.category === "Needs information"
            ? "Needs information"
            : "Pending review");
        output.push({
          id,
          ruleId: rule.id,
          title: rule.title,
          category: rule.category,
          jurisdiction: contextLabel(location),
          locationId: location?.id || null,
          trigger,
          rationale: rule.rationale,
          action: rule.action,
          localNote: extra?.note || "",
          coverage: location
            ? extra
              ? "Researched example"
              : "General framework"
            : "General framework",
          country: location?.country || "",
          sourceIds,
          checkedAt: model.guidanceDate,
          status,
          owner: record?.owner || "",
          evidence: record?.evidence || "",
          note: record?.note || "",
          stale: record?.stale || false,
          reviewedAt: ["Reviewed", "Not applicable"].includes(status)
            ? record?.updatedAt || null
            : null,
        });
      }
    }
    return output;
  }
  function requirements(state) {
    const base = model.metadataRequirements
      .filter((r) => matches(r.when, state.answers))
      .map(({ when, ...field }) => structuredClone(field));
    if (!model.schema.properties.permitPlan)
      return base.map(({ field, level }) => ({ field, level }));
    const merged = new Map(
      base.map((field) => [`${field.recordLevel}.${field.field}`, field]),
    );
    for (const field of reportingFields(state.permitPlan)) {
      const key = `${field.recordLevel}.${field.field}`;
      const previous = merged.get(key);
      if (previous && previous.dataType !== field.dataType)
        throw new Error(`Conflicting reporting field ${key}.`);
      merged.set(key, {
        field: field.field,
        level: "Permit reporting field",
        recordLevel: field.recordLevel,
        dataType: field.dataType,
        required: !!(previous?.required || field.required),
        sourcePermitTypeIds: [
          ...new Set([
            ...(previous?.sourcePermitTypeIds || []),
            ...field.sourcePermitTypeIds,
          ]),
        ],
      });
    }
    return [...merged.values()];
  }
  function exportConfiguration(state) {
    const derived = guardrails(state);
    const records = structuredClone(state.reviewRecords);
    const result = {
      $schema: model.schema.$id,
      kind: model.schema.properties.kind.const,
      version: model.schema.properties.version.const,
      modelVersions: {
        schema: model.schemaVersion,
        questionnaire: model.version,
        rules: model.version,
      },
      createdAt: state.createdAt,
      updatedAt: state.updatedAt,
      savedAt: state.savedAt,
      status: state.status,
      answers: activeAnswers(state),
      locations: state.locations,
      templates: {
        input: state.answers.inputTemplate || null,
        output: state.answers.outputTemplate || null,
        conversionImplemented: false,
      },
      metadataRequirements: requirements(state),
      guardrails: derived,
      reviewRecords: records,
      sources: [...new Set(derived.flatMap((g) => g.sourceIds))]
        .map((id) => model.sources[id])
        .filter(Boolean),
      ...(model.schema.properties.permitPlan
        ? { permitPlan: state.permitPlan }
        : {}),
    };
    // A detached result can be stored or passed to another platform without sharing mutable state.
    return structuredClone(result);
  }
  function assertValid(doc) {
    return checkImport(
      doc,
      model.schema,
      model.legacySchema,
      model.previousSchemas,
    );
  }
  function importConfiguration(doc, { asImport = true } = {}) {
    const clean = structuredClone(assertValid(doc));
    const state = {
      ...createDraft(),
      answers: clean.answers,
      locations: clean.locations,
      reviewRecords: clean.reviewRecords || {},
      permitPlan: clean.permitPlan || emptyPermitPlan(),
      createdAt: clean.createdAt || now(),
      updatedAt: now(),
      savedAt: asImport ? "" : clean.savedAt || "",
      status: asImport ? "draft" : clean.status || "draft",
    };
    if (clean.modelVersions.rules !== model.version) {
      for (const record of Object.values(state.reviewRecords)) {
        record.status = "Pending review";
        record.stale = true;
        record.updatedAt = now();
      }
    }
    pruneAnswers(state);
    guardrails(state);
    // A successful migration must also produce a valid current-format result.
    assertValid(exportConfiguration(state));
    return state;
  }
  function updatePermitPlan(state, plan) {
    const copy = structuredClone(plan);
    const candidate = { ...structuredClone(state), permitPlan: copy };
    assertValid(exportConfiguration(candidate));
    state.permitPlan = copy;
    updateAnswers(state, {});
    return state;
  }
  function selectPermitRequirement(state, typeId, selected = true) {
    const plan = structuredClone(state.permitPlan);
    if (selected && !plan.requirements.some((r) => r.typeId === typeId))
      plan.requirements.push({ typeId, coverage: [] });
    if (!selected)
      plan.requirements = plan.requirements.filter((r) => r.typeId !== typeId);
    return updatePermitPlan(state, plan);
  }
  function newPermit(typeId, identifier) {
    return {
      id: uid(),
      typeId,
      identifier,
      url: "",
      doi: "",
      issuer: "",
      holder: "",
      validFrom: "",
      validUntil: "",
      scope: "",
      visibility: "members",
      coverage: [],
    };
  }
  function updateAnswers(state, patch) {
    Object.assign(state.answers, patch);
    pruneAnswers(state);
    state.updatedAt = now();
    state.status = "draft";
    state.savedAt = "";
    const active = new Set(guardrails(state).map((g) => g.id));
    for (const [id, record] of Object.entries(state.reviewRecords)) {
      if (!active.has(id))
        state.reviewRecords[id] = {
          ...record,
          status: "Pending review",
          stale: true,
          fingerprint: "",
        };
    }
    return state;
  }
  return {
    model,
    createDraft,
    newLocation,
    visibleQuestions,
    pruneAnswers,
    contextLabel,
    profileFor,
    guardrails,
    requirements,
    exportConfiguration,
    assertValid,
    importConfiguration,
    updateAnswers,
    updatePermitPlan,
    selectPermitRequirement,
    newPermit,
    resolvePermitCoverage: (state, targetId) =>
      resolvePermitCoverage(state.permitPlan, targetId),
    previewPermitReport: (state, records, options) =>
      previewPermitReport(state.permitPlan, records, options),
  };
}
