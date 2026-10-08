import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { loadContract } from "../lib/contract.js";
import { createProjectEngine } from "../lib/project-engine.js";
import {
  fromDataCite,
  fromSchemaOrg,
  extractJSONLD,
  lookupReference,
  applyProjectImport,
  applyPermitImport,
  normalizeDOI,
} from "../lib/project-import.js";
const read = async (p) =>
  JSON.parse(await fs.readFile(new URL(p, import.meta.url), "utf8"));
const engine = createProjectEngine(
  await loadContract({
    fetchJSON: async (url) => JSON.parse(await fs.readFile(url, "utf8")),
  }),
);
const dc = await read("./fixtures/imports/biocode-datacite.json");
const ld = await read("./fixtures/imports/biocode-schemaorg.json");
const url = "https://iplacesalliance.org/gumpstation/articles/7/index.html";
test("both real Biocode formats offer descriptive data without inferring collection answers", () => {
  for (const candidate of [fromDataCite(dc), fromSchemaOrg(ld, { url })]) {
    assert.equal(candidate.title, "Biocode 2.0 Project");
    assert.equal(candidate.people.length, 4);
    assert.equal(candidate.funding[0].awardNumber, "00011628");
    assert.equal(candidate.place, "Moorea, French Polynesia");
    const initial = engine.createDraft();
    const copy = structuredClone(initial);
    const state = applyProjectImport(engine, initial, candidate, {
      place: candidate.place,
      country: "PF",
    });
    assert.deepEqual(initial, copy);
    assert.equal(state.answers.startDate, undefined);
    assert.equal(state.answers.scuba, undefined);
    assert.equal(state.answers.visibility, "members");
    assert.equal(
      state.projectDescription.imports[0].content,
      candidate.source.content,
    );
    const exported = engine.exportConfiguration(state);
    assert.deepEqual(
      engine.exportConfiguration(engine.importConfiguration(exported))
        .projectDescription,
      exported.projectDescription,
    );
  }
});
test("imports are atomic, preserve unmapped source fields, and reject oversized edits", () => {
  const data = structuredClone(dc);
  data.data.attributes.futureField = { extra: "preserve me" };
  const candidate = fromDataCite(data);
  const state = engine.createDraft();
  const before = structuredClone(state);
  assert.throws(
    () =>
      applyProjectImport(engine, state, candidate, { title: "x".repeat(161) }),
    /too long/,
  );
  assert.deepEqual(state, before);
  const next = applyProjectImport(engine, state, candidate);
  assert.match(next.projectDescription.imports[0].content, /preserve me/);
  const again = applyProjectImport(engine, next, candidate);
  assert.equal(again.projectDescription.imports.length, 1);
});
test("v3 migration preserves review context, reopens reviews, and adds empty descriptions", async () => {
  const doc = await read("../examples/legacy/geome-project.v3.json");
  const state = engine.importConfiguration(doc);
  for (const [id, record] of Object.entries(doc.reviewRecords)) {
    assert.equal(state.reviewRecords[id].owner, record.owner);
    assert.equal(state.reviewRecords[id].note, record.note);
    assert.equal(state.reviewRecords[id].evidence, record.evidence);
    assert.equal(state.reviewRecords[id].status, "Pending review");
    assert.equal(state.reviewRecords[id].stale, true);
  }
  assert.deepEqual(state.projectDescription, {
    people: [],
    funding: [],
    identifiers: [],
    imports: [],
  });
  assert.equal(engine.exportConfiguration(state).version, 5);
});
test("permits import without a catalog, classification or coverage; duplicate and invalid edits fail", async () => {
  const candidate = await lookupReference("https://example.org/permit.pdf", {
    kind: "permit",
    fetchImpl: () => {
      throw new Error("Must not fetch arbitrary documents");
    },
  });
  const fields = {
    ...candidate.permit,
    identifier: "P-42",
    validFrom: "2027-01-01",
    validUntil: "2027-02-01",
  };
  const initial = engine.createDraft();
  const state = applyPermitImport(engine, initial, candidate, fields);
  assert.equal(state.permitPlan.catalog, null);
  assert.equal(state.permitPlan.permits[0].typeId, "");
  assert.deepEqual(state.permitPlan.permits[0].coverage, []);
  assert.throws(
    () => applyPermitImport(engine, state, candidate, fields),
    /already/,
  );
  const covered = structuredClone(state);
  covered.permitPlan.permits[0].coverage = [
    { level: "project", targetId: "project" },
  ];
  assert.throws(
    () => engine.assertValid(engine.exportConfiguration(covered)),
    /Assign a permit type/,
  );
  assert.throws(
    () =>
      applyPermitImport(engine, initial, candidate, {
        ...fields,
        validUntil: "2026-01-01",
      }),
    /end date/,
  );
  assert.equal(initial.permitPlan.permits.length, 0);
  const dated = structuredClone(dc);
  dated.data.attributes.dates = [{ date: "2020-01-01", dateType: "Issued" }];
  const doiPermit = fromDataCite(dated, { kind: "permit" });
  assert.equal(doiPermit.permit.validFrom, "");
  assert.equal(doiPermit.permit.issuer, "");
});
test("schema.org permits retain explicit dates and issuer but never assign coverage", () => {
  const candidate = fromSchemaOrg(
    {
      "@context": "https://schema.org",
      "@type": "Permit",
      name: "Permit 42",
      identifier: "P-42",
      issuedBy: { name: "Issuer" },
      owner: { name: "Holder" },
      validFrom: "2027-01-01",
      validUntil: "2027-12-31",
    },
    { kind: "permit", url },
  );
  const state = applyPermitImport(engine, engine.createDraft(), candidate);
  assert.equal(state.permitPlan.permits[0].issuer, "Issuer");
  assert.equal(state.permitPlan.permits[0].validUntil, "2027-12-31");
  assert.deepEqual(state.permitPlan.permits[0].coverage, []);
});
test("untrusted markup and graph ambiguity never execute or choose an arbitrary project", () => {
  assert.throws(
    () => extractJSONLD('<script type="application/ld+json">broken</script>'),
    /invalid JSON-LD/,
  );
  assert.throws(
    () =>
      fromSchemaOrg(
        [
          { "@type": "Project", name: "A" },
          { "@type": "Project", name: "B" },
        ],
        { url },
      ),
    /several/,
  );
  assert.throws(
    () =>
      fromSchemaOrg(
        [
          { "@id": "same", "@type": "Project" },
          { "@id": "same", "@type": "Project" },
        ],
        { url },
      ),
    /duplicate/,
  );
  const html =
    '<script src="https://evil.invalid/run.js"></script><script type="application/ld+json">{"@context":"https://evil.invalid/context","@type":"Project","name":"Safe"}</script>';
  assert.equal(fromSchemaOrg(extractJSONLD(html), { url }).title, "Safe");
});
test("lookup validates hosts, handles failures, and uses a public request without credentials", async () => {
  assert.equal(normalizeDOI("https://doi.org/10.60950/ABC"), "10.60950/abc");
  await assert.rejects(
    lookupReference("https://iplacesalliance.org.evil.invalid/project"),
    /accepts iPlaces/,
  );
  await assert.rejects(lookupReference("javascript:alert(1)"), /HTTPS/);
  await assert.rejects(
    lookupReference("10.1234/missing", {
      fetchImpl: async () => new Response("", { status: 404 }),
    }),
    /No public record/,
  );
  const found = await lookupReference(
    "10.60950/7efde9b6-eddf-4011-83ac-885605d05bc9",
    {
      fetchImpl: async (target, opts) => {
        assert.equal(new URL(target).hostname, "api.datacite.org");
        assert.equal(opts.credentials, "omit");
        return new Response(JSON.stringify(dc));
      },
    },
  );
  assert.equal(found.people.length, 4);
});
