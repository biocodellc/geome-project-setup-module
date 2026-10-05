import type { JsonObject } from "./project-engine.js";
export function validate(
  value: unknown,
  schema: JsonObject,
  path?: string,
  errors?: string[],
): string[];
export function validDate(value: string): boolean;
export function checkImport(
  doc: unknown,
  currentSchema: JsonObject,
  legacySchema: JsonObject,
  previousSchemas?: JsonObject[],
): JsonObject;
