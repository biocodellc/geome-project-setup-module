import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import Ajv from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import * as validation from "../lib/configuration-validation.js";
import { createContract, loadContract } from "../lib/contract.js";
import { createProjectEngine } from "../lib/project-engine.js";
const read = (file) =>
  fs.readFileSync(new URL("../" + file, import.meta.url), "utf8");
const schema = JSON.parse(read("schemas/project-configuration.v5.schema.json"));
const legacy = JSON.parse(read("schemas/project-configuration.v1.schema.json"));
const previousSchemas = [
  JSON.parse(read("schemas/project-configuration.v4.schema.json")),
  JSON.parse(read("schemas/project-configuration.v3.schema.json")),
  JSON.parse(read("schemas/project-configuration.v2.schema.json")),
];
const questionnaire = JSON.parse(read("model/questionnaire.v3.json"));
const scenarios = JSON.parse(read("model/example-scenarios.json"));
const model = createContract({
  schema,
  legacySchema: legacy,
  previousSchemas,
  questionnaire,
});
const ajv = new Ajv({ allErrors: true, strictRequired: false });
addFormats(ajv);
const validateStandard = ajv.compile(schema);
function context() {
  const engine = createProjectEngine(model);
  return { engine, state: engine.createDraft() };
}
function result(sandbox) {
  return sandbox.engine.exportConfiguration(sandbox.state);
}
function checkBoth(doc) {
  assert.ok(validateStandard(doc), JSON.stringify(validateStandard.errors));
  assert.deepEqual(validation.validate(doc, schema), []);
  assert.doesNotThrow(() =>
    validation.checkImport(doc, schema, legacy, previousSchemas),
  );
}

test("the same loader adopts schemas in Node without a browser or DOM", async () => {
  const loaded = await loadContract({
    fetchJSON: async (url) => JSON.parse(fs.readFileSync(url, "utf8")),
  });
  assert.deepEqual(loaded.schema, schema);
  checkBoth(
    createProjectEngine(loaded).exportConfiguration(
      createProjectEngine(loaded).createDraft(),
    ),
  );
});

test("the schema controls form values and limits; presentation hints cannot redefine them", () => {
  const changed = structuredClone(schema);
  changed.properties.answers.properties.focus.enum.push("new-shared-focus");
  changed.properties.answers.properties.projectName.maxLength = 80;
  const adopted = createContract({
    schema: changed,
    previousSchemas,
    legacySchema: legacy,
    questionnaire,
  });
  assert.ok(
    adopted.questions
      .find((q) => q.id === "focus")
      .options.some((o) => o.value === "new-shared-focus"),
  );
  assert.equal(
    adopted.questions.find((q) => q.id === "projectName").maxLength,
    80,
  );
  const hints = structuredClone(questionnaire);
  hints.questions[0].optionLabels.invalid = { label: "Not in schema" };
  assert.throws(
    () =>
      createContract({
        schema,
        legacySchema: legacy,
        previousSchemas,
        questionnaire: hints,
      }),
    /missing from the schema/,
  );
});

test("blank drafts and all actual app scenarios satisfy standard Draft 2020-12 validation", () => {
  const sandbox = context();
  checkBoth(result(sandbox));
  for (const scenario of ["marine", "existing", "observation"]) {
    const example = scenarios[scenario];
    sandbox.state = {
      ...sandbox.engine.createDraft(),
      answers: structuredClone(example.answers),
      locations: example.locations.map((l) => ({
        ...sandbox.engine.newLocation(),
        ...l,
      })),
    };
    checkBoth(result(sandbox));
  }
});

test("GEOME and iPlaces examples use exactly the same schema and re-export through the app", () => {
  for (const file of ["geome-project.json", "iplaces-project.json"]) {
    const doc = JSON.parse(read("examples/" + file));
    checkBoth(doc);
    const sandbox = context();
    sandbox.state = sandbox.engine.importConfiguration(doc);
    const exported = result(sandbox);
    checkBoth(exported);
    assert.deepEqual(exported.answers, doc.answers);
    assert.deepEqual(exported.locations, doc.locations);
    assert.equal(exported.$schema, schema.$id);
    assert.equal(exported.kind, "project-configuration");
    assert.equal(exported.version, 5);
  }
});

test("malformed nested results, invalid dates and unsupported versions are rejected by both validators", () => {
  const original = JSON.parse(read("examples/geome-project.json"));
  const mutations = [
    (doc) => {
      doc.version = 99;
    },
    (doc) => {
      doc.$schema = "https://example.org/different.schema.json";
    },
    (doc) => {
      doc.modelVersions.rules = "9.0.0";
    },
    (doc) => {
      delete doc.templates;
    },
    (doc) => {
      doc.templates.output = "unknown-format";
    },
    (doc) => {
      doc.templates.conversionImplemented = true;
    },
    (doc) => {
      doc.metadataRequirements[0].field = 42;
    },
    (doc) => {
      delete doc.guardrails[0].ruleId;
    },
    (doc) => {
      doc.sources[0].url = "javascript:alert(1)";
    },
    (doc) => {
      doc.answers.startDate = "2027-02-30";
    },
    (doc) => {
      doc.createdAt = "yesterday";
    },
    (doc) => {
      doc.createdAt = "2026-01-01T24:00:00Z";
    },
    (doc) => {
      doc.platformSpecificId = 650;
    },
    (doc) => {
      doc.reviewRecords.review = { status: "Reviewed", owner: " " };
    },
    (doc) => {
      doc.reviewRecords.review = { status: "Not applicable" };
    },
    (doc) => {
      doc.reviewRecords.review = { status: "Evidence supplied" };
    },
  ];
  for (const mutate of mutations) {
    const doc = structuredClone(original);
    mutate(doc);
    assert.equal(validateStandard(doc), false, String(mutate));
    assert.ok(validation.validate(doc, schema).length, String(mutate));
  }
});

test("semantic import checks reject conflicting template choices, duplicate sites, and reversed dates", () => {
  const original = JSON.parse(read("examples/geome-project.json"));
  for (const mutate of [
    (doc) => {
      doc.templates.output = "repadapt";
    },
    (doc) => {
      doc.locations.push(structuredClone(doc.locations[0]));
    },
    (doc) => {
      doc.answers.endDate = "2026-01-01";
    },
  ]) {
    const doc = structuredClone(original);
    mutate(doc);
    assert.throws(() =>
      validation.checkImport(doc, schema, legacy, previousSchemas),
    );
  }
});

test("legacy v1 results retain prior answers and locations and add the broader community question", () => {
  const doc = JSON.parse(read("examples/legacy/geome-project.v2.json"));
  delete doc.$schema;
  doc.kind = "geome-project-configuration";
  doc.version = 1;
  doc.modelVersions.schema = "1.0.0";
  // Older drafts did not require derived output sections.
  delete doc.templates;
  delete doc.guardrails;
  delete doc.sources;
  delete doc.metadataRequirements;
  assert.doesNotThrow(() =>
    validation.checkImport(doc, schema, legacy, previousSchemas),
  );
  const sandbox = context();
  sandbox.state = sandbox.engine.importConfiguration(doc);
  const exported = result(sandbox);
  checkBoth(exported);
  assert.deepEqual(exported.answers, {
    ...doc.answers,
    communityInterests:
      doc.answers.traditionalKnowledge === "yes" ? "yes" : "unsure",
  });
  assert.deepEqual(exported.locations, doc.locations);
  assert.equal(exported.version, 5);
});

test("reimport ignores tampered derived guidance and regenerates it from answers", () => {
  const doc = JSON.parse(read("examples/geome-project.json"));
  doc.guardrails[0].action = "Tampered derived advice";
  const sandbox = context();
  sandbox.state = sandbox.engine.importConfiguration(doc);
  const exported = result(sandbox);
  checkBoth(exported);
  assert.ok(
    exported.guardrails.every((g) => g.action !== "Tampered derived advice"),
  );
});

test("scientific names and Local Contexts references round trip with conditional visibility and review invalidation", () => {
  const { engine, state } = context();
  const visible = () => engine.visibleQuestions(state).map((q) => q.id);
  assert.ok(!visible().includes("researchCountry"));
  assert.ok(!visible().includes("traditionalKnowledge"));
  assert.ok(!visible().includes("protectedScientificNames"));
  assert.ok(!visible().includes("localContextsProjectId"));
  engine.updateAnswers(state, {
    intent: "new",
    protectedSpecies: "yes",
    communityInterests: "yes",
    protectedScientificNames: ["Chelonia mydas", "Eretmochelys imbricata"],
    localContextsProjectId: "example-project-id",
  });
  assert.ok(visible().includes("protectedScientificNames"));
  assert.ok(visible().includes("localContextsProjectId"));
  const exported = engine.exportConfiguration(state);
  checkBoth(exported);
  assert.deepEqual(engine.importConfiguration(exported).answers, state.answers);
  for (const id of ["species", "knowledge"]) {
    const rule = engine.guardrails(state).find((rule) => rule.id === id);
    state.reviewRecords[id] = {
      status: "Reviewed",
      owner: "Test reviewer",
      note: "Keep this context",
      evidence: "",
      fingerprint: rule.trigger,
      stale: false,
    };
  }
  engine.updateAnswers(state, {
    protectedScientificNames: ["Chelonia mydas"],
    localContextsProjectId: "another-project-id",
  });
  for (const id of ["species", "knowledge"]) {
    assert.equal(state.reviewRecords[id].status, "Pending review");
    assert.equal(state.reviewRecords[id].stale, true);
    assert.equal(state.reviewRecords[id].note, "Keep this context");
  }
  engine.updateAnswers(state, {
    protectedSpecies: "no",
    communityInterests: "no",
  });
  assert.ok(!visible().includes("protectedScientificNames"));
  assert.ok(!visible().includes("localContextsProjectId"));
  assert.equal(state.answers.protectedScientificNames, undefined);
  assert.equal(state.answers.localContextsProjectId, undefined);
});

test("both validators reject invalid scientific-name lists and preserve the importer's prior document", () => {
  const { engine, state } = context();
  engine.updateAnswers(state, { protectedSpecies: "yes" });
  const original = engine.exportConfiguration(state);
  // A draft may leave the follow-up unanswered; a supplied list has one or more names.
  checkBoth(original);
  for (const names of [
    [],
    [""],
    ["   "],
    ["Species name", "Species name"],
    [42],
    ["a".repeat(241)],
    Array.from({ length: 101 }, (_, i) => "Taxon " + i),
  ]) {
    const doc = structuredClone(original);
    doc.answers.protectedScientificNames = names;
    assert.equal(validateStandard(doc), false);
    assert.ok(validation.validate(doc, schema).length);
    assert.throws(() => engine.importConfiguration(doc));
    assert.deepEqual(engine.exportConfiguration(state), original);
  }
});

test("v2–v4 migration retains previous answers, permit plans and sources without inferring a negative answer to the broader question", () => {
  const { engine } = context();
  for (const version of [2, 3, 4]) {
    for (const previous of ["yes", "no", "unsure", ""]) {
      const doc = JSON.parse(
        read(`examples/legacy/geome-project.v${version}.json`),
      );
      doc.answers.traditionalKnowledge = previous;
      const snapshot = structuredClone(doc);
      const state = engine.importConfiguration(doc);
      const exported = engine.exportConfiguration(state);
      checkBoth(exported);
      for (const [key, value] of Object.entries(doc.answers))
        assert.deepEqual(exported.answers[key], value);
      assert.equal(
        exported.answers.communityInterests,
        previous ? (previous === "yes" ? "yes" : "unsure") : undefined,
      );
      assert.equal(exported.answers.protectedScientificNames, undefined);
      assert.equal(exported.answers.localContextsProjectId, undefined);
      if (doc.permitPlan) assert.deepEqual(exported.permitPlan, doc.permitPlan);
      if (doc.projectDescription)
        assert.deepEqual(exported.projectDescription, doc.projectDescription);
      assert.deepEqual(doc, snapshot);
    }
  }
});
