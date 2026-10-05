// Validation for this repository's result schemas, not a general JSON Schema engine.
import { assertPermitPlan } from "./permit-plan.js";
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00Z");
  return (
    !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
  );
}
function validFormat(value, format) {
  if (format === "date-or-empty") return value === "" || validDate(value);
  if (format === "date") return validDate(value);
  if (format === "date-time") {
    return (
      /^\d{4}-\d{2}-\d{2}[Tt]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:[Zz]|[+-]\d{2}:\d{2})$/.test(
        value,
      ) &&
      validDate(value.slice(0, 10)) &&
      !Number.isNaN(Date.parse(value)) &&
      Number(value.slice(11, 13)) < 24
    );
  }
  if (format === "uri") {
    try {
      return !!new URL(value).protocol;
    } catch {
      return false;
    }
  }
  return true;
}
function validate(value, schema, path = "configuration", errors = []) {
  if (errors.length > 12) return errors;
  const error = (message) => errors.push(path + " " + message);
  if (schema === false) {
    error("is not allowed.");
    return errors;
  }
  if (schema === true) return errors;
  if (
    schema.anyOf &&
    !schema.anyOf.some((s) => validate(value, s, path, []).length === 0)
  )
    error("does not match an allowed value.");
  if (schema.allOf)
    for (const s of schema.allOf) validate(value, s, path, errors);
  if (schema.not && validate(value, schema.not, path, []).length === 0)
    error("contains a forbidden value.");
  if (schema.if) {
    const branch =
      validate(value, schema.if, path, []).length === 0
        ? schema.then
        : schema.else;
    if (branch) validate(value, branch, path, errors);
  }
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    const matches = (type) =>
      type === "null"
        ? value === null
        : type === "array"
          ? Array.isArray(value)
          : type === "object"
            ? value !== null &&
              typeof value === "object" &&
              !Array.isArray(value)
            : type === "integer"
              ? Number.isInteger(value)
              : typeof value === type;
    if (!types.some(matches)) {
      error("has an invalid type.");
      return errors;
    }
  }
  if (Object.hasOwn(schema, "const") && !equal(value, schema.const))
    error("has an unsupported constant value.");
  if (schema.enum && !schema.enum.some((v) => equal(v, value)))
    error("contains an unsupported value.");
  if (typeof value === "string") {
    const length = [...value].length;
    if (schema.maxLength !== undefined && length > schema.maxLength)
      error("is too long.");
    if (schema.minLength !== undefined && length < schema.minLength)
      error("is too short.");
    if (schema.pattern && !new RegExp(schema.pattern, "u").test(value))
      error("has an invalid value.");
    if (schema.format && !validFormat(value, schema.format))
      error("has an invalid " + schema.format + ".");
  }
  if (Array.isArray(value)) {
    if (schema.maxItems !== undefined && value.length > schema.maxItems)
      error("has too many entries.");
    if (
      schema.uniqueItems &&
      new Set(value.map((v) => JSON.stringify(v))).size !== value.length
    )
      error("contains duplicates.");
    if (schema.items)
      value.forEach((v, i) =>
        validate(v, schema.items, path + "[" + i + "]", errors),
      );
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    if (
      schema.maxProperties !== undefined &&
      Object.keys(value).length > schema.maxProperties
    )
      error("has too many entries.");
    for (const key of schema.required || [])
      if (!Object.hasOwn(value, key))
        errors.push(path + "." + key + " is required.");
    for (const [key, v] of Object.entries(value)) {
      if (["__proto__", "constructor", "prototype"].includes(key)) {
        error("contains a reserved key.");
        continue;
      }
      if (schema.propertyNames)
        validate(key, schema.propertyNames, path + " key", errors);
      if (Object.hasOwn(schema.properties || {}, key))
        validate(v, schema.properties[key], path + "." + key, errors);
      else if (schema.additionalProperties === false)
        errors.push(path + "." + key + " is not supported.");
      else if (typeof schema.additionalProperties === "object")
        validate(v, schema.additionalProperties, path + "." + key, errors);
    }
  }
  return errors;
}
function checkImport(doc, currentSchema, legacySchema, previousSchemas = []) {
  const legacy =
    doc?.kind === "geome-project-configuration" && doc?.version === 1;
  const supported = [currentSchema, legacySchema, ...previousSchemas].filter(
    Boolean,
  );
  const adopted = supported.find(
    (schema) =>
      (schema.properties.version.const ??
        schema.properties.version.enum?.[0]) === doc?.version,
  );
  if (!adopted) throw new Error("Unsupported project configuration version.");
  const errors = validate(doc, adopted);
  if (errors.length) throw new Error(errors.slice(0, 4).join(" "));
  if (new Set(doc.locations.map((l) => l.id)).size !== doc.locations.length)
    throw new Error("Location identifiers must be unique.");
  if (
    doc.answers.startDate &&
    doc.answers.endDate &&
    doc.answers.startDate > doc.answers.endDate
  )
    throw new Error("The end date precedes the start date.");
  for (const record of Object.values(doc.reviewRecords || {})) {
    if (record.status === "Reviewed" && !record.owner?.trim())
      throw new Error("A reviewed item needs a named reviewer.");
    if (record.status === "Not applicable" && !record.note?.trim())
      throw new Error("A not-applicable item needs a rationale.");
    if (record.status === "Evidence supplied" && !record.evidence?.trim())
      throw new Error("An evidence-supplied item needs an evidence reference.");
  }
  if (!legacy) {
    for (const key of ["input", "output"]) {
      if (doc.templates[key] !== (doc.answers[key + "Template"] || null))
        throw new Error("Template selections must match the answers.");
    }
  } else {
    // Legacy exports allowed loose timestamps. Do not propagate malformed dates.
    for (const key of ["createdAt", "updatedAt", "savedAt"]) {
      if (doc[key] && !validFormat(doc[key], "date-time"))
        throw new Error(key + " must be an ISO date-time.");
    }
  }
  if (adopted.properties.permitPlan) assertPermitPlan(doc.permitPlan);
  return doc;
}

export { validate, validDate, checkImport };
