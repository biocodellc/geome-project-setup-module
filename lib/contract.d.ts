import type { JsonObject } from "./project-engine.js";
export function createContract(input: {
  schema: JsonObject;
  legacySchema: JsonObject;
  questionnaire: JsonObject;
}): JsonObject;
export function loadContract(options?: {
  fetchJSON?: (url: URL) => Promise<JsonObject>;
}): Promise<JsonObject>;
