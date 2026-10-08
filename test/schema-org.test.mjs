import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { loadContract } from "../lib/contract.js";
import { createProjectEngine } from "../lib/project-engine.js";
import { applyProjectImport, fromSchemaOrg } from "../lib/project-import.js";
import { exportSchemaOrg } from "geome-project-setup-module/schema-org";

const engine = createProjectEngine(
  await loadContract({
    fetchJSON: async (url) => JSON.parse(await fs.readFile(url, "utf8")),
  }),
);
const fixture = JSON.parse(
  await fs.readFile(
    new URL("./fixtures/imports/biocode-schemaorg.json", import.meta.url),
    "utf8",
  ),
);
const sourceURL =
  "https://iplacesalliance.org/gumpstation/articles/7/index.html";

test("exports reviewed project details and source identities without changing the setup", () => {
  const candidate = fromSchemaOrg(fixture, { url: sourceURL });
  const state = applyProjectImport(engine, engine.createDraft(), candidate, {
    title: "My Biocode study",
    description: "Our edited research description.",
    country: "PF",
    place: candidate.place,
  });
  engine.updateAnswers(state, {
    startDate: "2027-01-01",
    endDate: "2027-02-01",
    communityInterests: "yes",
    localContextsProjectId: "local-contexts-reference",
  });
  const before = structuredClone(state);
  const result = exportSchemaOrg(engine, state);
  assert.equal(result["@context"], "https://schema.org");
  assert.equal(result["@type"], "ResearchProject");
  assert.equal(result.name, "My Biocode study");
  assert.equal(result.description, "Our edited research description.");
  assert.equal(result.funding[0].identifier, "00011628");
  assert.equal(result.subjectOf.about["@id"], result["@id"]);
  assert.equal(result.subjectOf.temporalCoverage, "2027-01-01/2027-02-01");
  assert.equal(
    result.subjectOf.spatialCoverage[0].address.addressCountry,
    "PF",
  );
  assert.equal(
    result.subjectOf.mentions.filter((n) => n["@type"] === "Person").length,
    4,
  );
  assert.equal(
    result.subjectOf.mentions.find((n) => n.name === "Local Contexts project")
      .identifier,
    "local-contexts-reference",
  );
  assert.ok(result.subjectOf.isBasedOn.some((ref) => ref.url === sourceURL));
  assert.ok(
    result.subjectOf.isBasedOn.some(
      (ref) => ref.identifier?.propertyID === "DOI",
    ),
  );
  // A source DOI and source authors do not become the new project's identity/members.
  assert.equal(result.identifier, undefined);
  assert.equal(result.sameAs, undefined);
  assert.equal(result.member, undefined);
  assert.equal(result.subjectOf.author, undefined);
  assert.equal(result.projectDescription, undefined);
  assert.deepEqual(state, before);
  result.subjectOf.mentions[0].name = "Changed output";
  assert.deepEqual(state, before);
  assert.deepEqual(
    engine.exportConfiguration(state).projectDescription.imports[0].content,
    candidate.source.content,
  );
});

test("mentions recorded permits without exporting requirements as obtained permits or asserting coverage", () => {
  const state = engine.createDraft();
  const plan = structuredClone(state.permitPlan);
  plan.catalog = structuredClone(engine.model.permitCatalogs[0]);
  plan.requirements = [
    {
      typeId: plan.catalog.types[0].id,
      coverage: [{ level: "project", targetId: "project" }],
    },
  ];
  const permit = engine.newPermit("", "P-42");
  Object.assign(permit, {
    url: "https://example.org/permit.pdf",
    doi: "10.1234/permit",
    issuer: "Recorded issuing office",
    holder: "Recorded researcher",
    scope: "Recorded scope only",
    validFrom: "2027-01-01",
    validUntil: "2027-12-31",
    visibility: "members",
  });
  plan.permits.push(permit);
  engine.updatePermitPlan(state, plan);
  const result = exportSchemaOrg(engine, state);
  const permits = result.subjectOf.mentions.filter(
    (n) => n["@type"] === "Permit",
  );
  assert.equal(permits.length, 1);
  assert.deepEqual(permits[0].identifier, [
    "P-42",
    { "@type": "PropertyValue", propertyID: "DOI", value: "10.1234/permit" },
  ]);
  assert.equal(permits[0].issuedBy.name, "Recorded issuing office");
  assert.equal(permits[0].validUntil, "2027-12-31");
  assert.match(
    permits[0].description,
    /Recorded scope only\n\nRecorded holder: Recorded researcher/,
  );
  assert.equal(permits[0].validIn, undefined);
  assert.equal(permits[0].coverage, undefined);
  assert.equal(permits[0].owner, undefined);
  assert.equal(result.hasCredential, undefined);
  assert.deepEqual(state.permitPlan.permits[0].coverage, []);
});

test("partial drafts omit empty fields and preserve open or unknown research dates", () => {
  const state = engine.createDraft();
  const result = exportSchemaOrg(engine, state);
  assert.equal(result.name, undefined);
  assert.equal(result.subjectOf.mentions, undefined);
  assert.equal(result.subjectOf.spatialCoverage, undefined);
  assert.equal(result.subjectOf.temporalCoverage, undefined);
  engine.updateAnswers(state, { startDate: "2027-01-01" });
  assert.equal(
    exportSchemaOrg(engine, state).subjectOf.temporalCoverage,
    "2027-01-01/..",
  );
  engine.updateAnswers(state, { startDate: "", endDate: "2027-02-01" });
  assert.equal(
    exportSchemaOrg(engine, state).subjectOf.temporalCoverage,
    "../2027-02-01",
  );
  engine.updateAnswers(state, { dateUnknown: true });
  assert.equal(
    exportSchemaOrg(engine, state).subjectOf.temporalCoverage,
    undefined,
  );
});

test("invalid setup data cannot bypass contract and semantic validation through JSON-LD export", () => {
  const state = engine.createDraft();
  state.answers.projectName = "x".repeat(161);
  assert.throws(() => exportSchemaOrg(engine, state), /too long/);
  state.answers.projectName = "Valid title";
  const permit = engine.newPermit("", "P-42");
  state.permitPlan.permits.push(permit, structuredClone(permit));
  assert.throws(() => exportSchemaOrg(engine, state), /must be unique/i);
});
