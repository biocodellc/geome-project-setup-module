/** Bind presentation hints to the adopted result schema. No DOM or storage. */
import { validate } from "./configuration-validation.js";

export function createContract({
  schema,
  legacySchema,
  previousSchemas = [],
  questionnaire,
  permitCatalogs = [],
}) {
  const model = structuredClone(questionnaire);
  for (const catalog of permitCatalogs) {
    const definition = schema.properties.permitPlan?.properties.catalog;
    if (!definition || validate(catalog, definition).length)
      throw new Error("Invalid permit catalog for this result schema.");
  }
  const fields = schema.properties.answers.properties;
  const versions = schema.properties.modelVersions.properties;
  const value = (definition) => definition.const ?? definition.enum?.[0];
  if (
    model.version !== value(versions.questionnaire) ||
    model.version !== value(versions.rules)
  ) {
    throw new Error(
      "The questionnaire/rules version does not match the adopted result schema.",
    );
  }
  const stageIds = new Set(model.stages.map((stage) => stage.id));
  const questionIds = new Set();
  model.questions = model.questions.map((hints) => {
    if (questionIds.has(hints.id))
      throw new Error("Duplicate question: " + hints.id);
    questionIds.add(hints.id);
    if (!stageIds.has(hints.stage))
      throw new Error("Unknown stage for " + hints.id);
    const definition =
      hints.id === "locations" ? schema.properties.locations : fields[hints.id];
    if (!definition)
      throw new Error(
        "Question is missing from the shared result schema: " + hints.id,
      );
    const isDate =
      definition.format === "date" ||
      definition.anyOf?.some((s) => s.format === "date");
    const inferred =
      hints.id === "locations"
        ? "locations"
        : definition.type === "boolean"
          ? "checkbox"
          : definition.type === "array"
            ? definition.items?.enum
              ? "multi"
              : "string-list"
            : isDate
              ? "date"
              : definition.enum
                ? "select"
                : "text";
    const compatible = {
      locations: ["locations"],
      checkbox: ["checkbox"],
      multi: ["multi"],
      "string-list": ["string-list"],
      date: ["date"],
      select: ["select", "choice", "country", "template"],
      text: ["text", "textarea"],
    };
    const type = hints.type || inferred;
    if (inferred === "string-list" && definition.items?.type !== "string")
      throw new Error(
        "String-list questions require string items: " + hints.id,
      );
    if (!compatible[inferred].includes(type))
      throw new Error("Widget type conflicts with the schema for " + hints.id);
    const options = (definition.items?.enum || definition.enum || []).filter(
      (v) => v !== "",
    );
    for (const option of Object.keys(hints.optionLabels || {})) {
      if (!options.includes(option))
        throw new Error(
          "Option is missing from the schema: " + hints.id + "." + option,
        );
    }
    return {
      ...hints,
      type,
      schema: definition,
      maxLength: definition.maxLength,
      options: options.map((option) => ({
        value: option,
        label: option,
        ...hints.optionLabels?.[option],
      })),
    };
  });
  for (const id of Object.keys(fields)) {
    if (!questionIds.has(id))
      throw new Error("Add presentation metadata for the schema field: " + id);
  }
  for (const template of model.templates) {
    if (
      !fields.inputTemplate.enum.includes(template.id) ||
      !fields.outputTemplate.enum.includes(template.id)
    ) {
      throw new Error(
        "Template is missing from the shared result schema: " + template.id,
      );
    }
  }
  for (const id of fields.inputTemplate.enum.filter(Boolean)) {
    if (!model.templates.some((template) => template.id === id)) {
      throw new Error(
        "Add presentation metadata for the schema template: " + id,
      );
    }
  }
  return {
    ...model,
    schema: structuredClone(schema),
    legacySchema: structuredClone(legacySchema),
    previousSchemas: structuredClone(previousSchemas),
    permitCatalogs: structuredClone(permitCatalogs),
    schemaVersion: value(versions.schema),
    countryCodes:
      schema.properties.locations.items.properties.country.enum.filter(Boolean),
  };
}

/** Browser loader. URLs are relative to this module, including on GitHub project Pages. */
export async function loadContract({ fetchJSON = readJSON } = {}) {
  const [
    schema,
    legacySchema,
    previousSchema,
    v3Schema,
    v4Schema,
    questionnaire,
    catalog,
  ] = await Promise.all([
    fetchJSON(
      new URL(
        "../schemas/project-configuration.v5.schema.json",
        import.meta.url,
      ),
    ),
    fetchJSON(
      new URL(
        "../schemas/project-configuration.v1.schema.json",
        import.meta.url,
      ),
    ),
    fetchJSON(
      new URL(
        "../schemas/project-configuration.v2.schema.json",
        import.meta.url,
      ),
    ),
    fetchJSON(
      new URL(
        "../schemas/project-configuration.v3.schema.json",
        import.meta.url,
      ),
    ),
    fetchJSON(
      new URL(
        "../schemas/project-configuration.v4.schema.json",
        import.meta.url,
      ),
    ),
    fetchJSON(new URL("../model/questionnaire.v3.json", import.meta.url)),
    fetchJSON(
      new URL("../model/permit-catalog.gump-moorea.v1.json", import.meta.url),
    ),
  ]);
  return createContract({
    schema,
    legacySchema,
    previousSchemas: [previousSchema, v3Schema, v4Schema],
    questionnaire,
    permitCatalogs: [catalog],
  });
}

async function readJSON(url) {
  const response = await fetch(url);
  if (!response.ok)
    throw new Error(
      "Could not load " + url.pathname + " (" + response.status + ").",
    );
  return response.json();
}
