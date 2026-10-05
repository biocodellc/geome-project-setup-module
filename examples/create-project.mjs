// A consumer adopts the shared schema and engine without loading the example UI.
import fs from "node:fs/promises";
import { loadContract } from "../lib/contract.js";
import { createProjectEngine } from "../lib/project-engine.js";

const contract = await loadContract({
  fetchJSON: async (url) => JSON.parse(await fs.readFile(url, "utf8")),
});
const engine = createProjectEngine(contract);
const state = engine.createDraft();
engine.updateAnswers(state, {
  intent: "observations",
  projectName: "Shared coastal observation project",
  focus: "monitoring",
  environment: ["marine"],
  organisms: ["animals"],
  inputTemplate: "geome-flat",
  outputTemplate: "biocode",
});
state.locations = [
  { ...engine.newLocation(), country: "NZ", locality: "Example coastal site" },
];
const result = engine.exportConfiguration(state);
engine.assertValid(result);
process.stdout.write(JSON.stringify(result, null, 2) + "\n");
