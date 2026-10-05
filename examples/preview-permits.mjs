// The configuration and collection observations are distinct inputs.
import fs from "node:fs/promises";
import { loadContract } from "../lib/contract.js";
import { createProjectEngine } from "../lib/project-engine.js";

const read = async (url) => JSON.parse(await fs.readFile(url, "utf8"));
const model = await loadContract({ fetchJSON: read });
const engine = createProjectEngine(model);
const state = engine.importConfiguration(
  await read(new URL("./moorea-permit-plan.json", import.meta.url)),
);
const demo = await read(
  new URL("../model/moorea-preview.v1.json", import.meta.url),
);
const preview = engine.previewPermitReport(state, demo.records);
process.stdout.write(JSON.stringify(preview, null, 2) + "\n");
