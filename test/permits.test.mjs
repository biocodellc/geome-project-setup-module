import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import Ajv from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { loadContract } from "../lib/contract.js";
import { createProjectEngine } from "../lib/project-engine.js";
import { assertPermitPlan, emptyPermitPlan } from "../lib/permit-plan.js";
import { validate } from "../lib/configuration-validation.js";

const read = async (path) =>
  JSON.parse(await fs.readFile(new URL("../" + path, import.meta.url), "utf8"));
const model = await loadContract({
  fetchJSON: async (url) => JSON.parse(await fs.readFile(url, "utf8")),
});
const engine = createProjectEngine(model);
const fixture = await read("examples/moorea-permit-plan.json");
const demo = await read("model/moorea-preview.v1.json");
const ajv = new Ajv({ allErrors: true, strictRequired: false });
addFormats(ajv);
const standard = ajv.compile(model.schema);
const state = () => engine.importConfiguration(structuredClone(fixture));

test("both platforms retain the same catalog, permit identities, and coverage in v3 round trips", async () => {
  for (const file of ["geome-project.json", "iplaces-project.json"]) {
    const s = engine.importConfiguration(await read("examples/" + file));
    const doc = engine.exportConfiguration(s);
    assert.ok(standard(doc), JSON.stringify(standard.errors));
    assert.deepEqual(validate(doc, model.schema), []);
    assert.deepEqual(
      engine.exportConfiguration(engine.importConfiguration(doc)).permitPlan,
      doc.permitPlan,
    );
    assert.equal(doc.version, 3);
    assert.equal(doc.locations[0].country, "PF");
    assert.equal(doc.permitPlan.catalog.illustrative, true);
  }
});

test("required field union keeps record level, datatype and all originating permit types", () => {
  const s = state();
  const fields = engine.requirements(s);
  const species = fields.filter((f) => f.field === "scientificName");
  assert.equal(species.length, 1);
  assert.equal(species[0].recordLevel, "entity");
  assert.equal(species[0].required, true);
  assert.deepEqual(species[0].sourcePermitTypeIds, [
    "gump-cpc-abs",
    "gump-fishing",
  ]);
  engine.selectPermitRequirement(s, "gump-fishing", false);
  assert.ok(!engine.requirements(s).some((f) => f.field === "usedScuba"));
  engine.selectPermitRequirement(s, "gump-fishing");
  const scuba = engine.requirements(s).find((f) => f.field === "usedScuba");
  assert.equal(scuba.dataType, "boolean");
  assert.equal(scuba.recordLevel, "event");
  assert.deepEqual(
    s.permitPlan.requirements.find((r) => r.typeId === "gump-fishing").coverage,
    [],
  );
});

test("coverage is additive, inherits through derived samples, and selects the nearest link once", () => {
  const s = state();
  const abs = s.permitPlan.permits.find((p) => p.id === "demo-abs");
  abs.coverage.push(
    { level: "event", targetId: "dive-event" },
    { level: "sample", targetId: "tissue-a" },
  );
  const links = engine.resolvePermitCoverage(s, "dna-a");
  assert.equal(links.length, 2);
  assert.deepEqual(links.find((l) => l.permitId === "demo-abs").via, {
    level: "sample",
    targetId: "tissue-a",
  });
  assert.equal(links.find((l) => l.permitId === "demo-abs").inherited, true);
  assert.equal(engine.resolvePermitCoverage(s, "urchin-tissue").length, 1);
  assert.equal(
    engine
      .resolvePermitCoverage(s, "tissue-a")
      .find((l) => l.permitId === "demo-abs").inherited,
    false,
  );
  for (const level of ["expedition", "event", "entity", "sample"]) {
    const target = s.permitPlan.targets.find((t) => t.level === level);
    abs.coverage = [{ level, targetId: target.id }];
    assert.ok(
      engine
        .resolvePermitCoverage(s, "dna-a")
        .some((l) => l.permitId === "demo-abs"),
    );
  }
});

test("dangling references, duplicate IDs, wrong parents, cycles and mismatched levels are rejected", () => {
  for (const change of [
    (p) => p.permits[0].coverage.push({ level: "event", targetId: "missing" }),
    (p) =>
      p.permits[0].coverage.push({ level: "sample", targetId: "dive-event" }),
    (p) => p.permits.push(structuredClone(p.permits[0])),
    (p) => p.targets.push(structuredClone(p.targets[0])),
    (p) => p.requirements.push(structuredClone(p.requirements[0])),
    (p) => (p.targets.find((t) => t.id === "dive-event").parentId = "missing"),
    (p) => (p.targets.find((t) => t.id === "dive-event").parentId = "cucumber"),
    (p) => (p.targets.find((t) => t.id === "tissue-a").parentId = "dna-a"),
    (p) => (p.permits[0].typeId = "unknown"),
    (p) => p.catalog.types.push(structuredClone(p.catalog.types[0])),
    (p) =>
      p.permits[0].coverage.push(structuredClone(p.permits[0].coverage[0])),
  ]) {
    const doc = structuredClone(fixture);
    change(doc.permitPlan);
    assert.throws(() => engine.assertValid(doc), undefined, String(change));
  }
});

test("malformed permit dates and unknown catalog versions fail both schema validators", () => {
  for (const change of [
    (p) => (p.permits[0].validFrom = "2027-02-30"),
    (p) => (p.catalog.version = "9.0.0"),
    (p) => (p.permits[0].url = "javascript:alert(1)"),
  ]) {
    const doc = structuredClone(fixture);
    change(doc.permitPlan);
    assert.equal(standard(doc), false);
    assert.ok(validate(doc, model.schema).length);
    assert.throws(() => engine.assertValid(doc));
  }
  const doc = structuredClone(fixture);
  doc.permitPlan.permits[0].validFrom = "2027-05-01";
  doc.permitPlan.permits[0].validUntil = "2027-04-01";
  assert.throws(() => engine.assertValid(doc), /end date precedes/);
});

test("report rows use actual event methods; no SCUBA false is not missing and planned intent is not a substitute", () => {
  const s = state();
  let rows = engine.previewPermitReport(s, demo.records).rows;
  assert.equal(rows.length, 4);
  assert.equal(
    rows.find((r) => r.sampleId === "urchin-tissue").values["event.usedScuba"],
    false,
  );
  assert.equal(rows.filter((r) => r.entityId === "cucumber").length, 3);
  assert.ok(
    rows
      .find((r) => r.sampleId === "urchin-tissue")
      .issues.some((i) => i.code === "missing-permit"),
  );
  const edited = structuredClone(demo.records);
  delete edited.find((r) => r.targetId === "dive-event").values.usedScuba;
  engine.updateAnswers(s, { scuba: "yes" });
  rows = engine.previewPermitReport(s, edited).rows;
  assert.ok(
    rows
      .find((r) => r.sampleId === "dna-a")
      .issues.some(
        (i) => i.field === "event.usedScuba" && i.code === "missing-field",
      ),
  );
  edited.find((r) => r.targetId === "dive-event").values.usedScuba = false;
  rows = engine.previewPermitReport(s, edited).rows;
  assert.equal(
    rows.find((r) => r.sampleId === "dna-a").values["event.usedScuba"],
    false,
  );
  assert.ok(
    !rows
      .find((r) => r.sampleId === "dna-a")
      .issues.some((i) => i.field === "event.usedScuba"),
  );
  assert.ok(!("records" in engine.exportConfiguration(s)));
  assert.ok(
    !JSON.stringify(engine.exportConfiguration(s)).includes(
      "Fictional lagoon station",
    ),
  );
});

test("report selection shows only covered rows and flags date mismatches without granting compliance", () => {
  const s = state();
  s.permitPlan.permits[1].validUntil = "2027-03-01";
  const report = engine.previewPermitReport(s, demo.records, {
    permitId: "demo-fishing",
  });
  assert.equal(report.rows.length, 3);
  assert.ok(
    report.rows.every((r) =>
      r.issues.some((i) => i.code === "permit-date-mismatch"),
    ),
  );
  const records = structuredClone(demo.records);
  delete records.find((r) => r.targetId === "dive-event").values.eventDate;
  assert.ok(
    engine
      .previewPermitReport(s, records)
      .rows[0].issues.some((i) => i.code === "date-unknown"),
  );
  assert.throws(() =>
    engine.previewPermitReport(s, demo.records, { permitId: "missing" }),
  );
});

test("unassigned permits and requirements remain explicit review issues", () => {
  const s = state();
  s.permitPlan.permits[0].coverage = [];
  s.permitPlan.requirements[0].coverage = [];
  assert.deepEqual(
    engine.previewPermitReport(s, demo.records).issues.map((i) => i.code),
    ["unassigned-requirement", "unassigned-permit"],
  );
});

test("legacy migration preserves active and historical evidence and reopens reviews without inventing permits", async () => {
  for (const version of [1, 2]) {
    const doc = await read("examples/legacy/geome-project.v2.json");
    doc.reviewRecords["retired-rule"] = {
      status: "Reviewed",
      owner: "Prior reviewer",
      note: "Historical evidence",
      evidence: "PERMIT-OLD",
      fingerprint: "old",
      updatedAt: "2026-10-01T00:00:00Z",
    };
    if (version === 1) {
      delete doc.$schema;
      doc.kind = "geome-project-configuration";
      doc.version = 1;
      doc.modelVersions.schema = "1.0.0";
    }
    const exported = engine.exportConfiguration(
      engine.importConfiguration(doc),
    );
    assert.deepEqual(exported.permitPlan, emptyPermitPlan());
    assert.equal(exported.reviewRecords["retired-rule"].evidence, "PERMIT-OLD");
    assert.equal(
      exported.reviewRecords["retired-rule"].status,
      "Pending review",
    );
    assert.equal(exported.reviewRecords["retired-rule"].stale, true);
    engine.assertValid(exported);
  }
});

test("plan edits are atomic and incompatible report field definitions are rejected", () => {
  const s = state();
  const guardrail = engine.guardrails(s)[0];
  s.reviewRecords[guardrail.id] = {
    status: "Reviewed",
    owner: "Reviewer",
    note: "Keep this evidence",
    evidence: "PERMIT-OLD",
    fingerprint: "outdated",
    updatedAt: "2026-10-01T00:00:00Z",
  };
  const before = structuredClone(s);
  const bad = structuredClone(s.permitPlan);
  bad.permits[0].coverage[0].targetId = "unknown";
  assert.throws(() => engine.updatePermitPlan(s, bad));
  assert.deepEqual(s, before);
  const conflict = structuredClone(s.permitPlan);
  conflict.catalog.types[1].fields[0].dataType = "boolean";
  assert.throws(() => assertPermitPlan(conflict));
});
