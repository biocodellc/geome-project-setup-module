# Moorea permit planner

The pilot demonstrates the meeting's proposed workflow: identify requirements while creating a project, reference each permit document once, link it to collections, and preview the fields needed for reporting. It uses a fictional BioCode 2.0 project in Moorea, country code `PF` (French Polynesia).

The bundled CPC/ABS and fishing definitions are illustrative. They are not Gump-approved requirements, an official reporting specification, or evidence that a permit has been issued. The existing general preparation checklist remains separate from this catalog.

## Try the example

Run `npm run dev`, then choose **Try an example → BioCode 2.0 · Moorea permit planner**. Open the permit planner in the access stage, inspect the requirements and document references, and choose **Preview reporting needs**.

The demonstration includes two expeditions and collecting events, two organisms, three primary samples, and one derived DNA sample. The CPC/ABS document is linked to the whole project. The fishing document is linked to the lagoon expedition; the other expedition deliberately has a missing fishing-permit link. Select one document in the report view to show only its covered samples. Edit event dates, collecting methods, and SCUBA use to see missing-field and validity-date issues.

Preview observations reset on import, profile changes, reload, or **Reset fictional observations**. They never enter the shared configuration or saved browser draft. New scope IDs have no prefilled observations; the known demonstration IDs use the bundled fictional records on reset.

## The shared result

`permitPlan` is required in v3 results. A project without permit planning exports:

```json
{ "catalog": null, "requirements": [], "permits": [], "targets": [] }
```

An adopted plan contains these sections:

| Section | Purpose |
| --- | --- |
| `catalog` | Complete adopted definitions: ID, supported format version, title, jurisdiction, curator, illustrative flag, and permit types with typed reporting fields. Embedded definitions make results portable without a catalog server. |
| `requirements` | Required type IDs and their intended coverage. A requirement can exist before any document is obtained. |
| `permits` | Document references with stable local ID, type ID, identifier, optional URL/DOI, issuer, holder, validity dates, scope notes, intended visibility, and coverage. |
| `targets` | Stable identity, label, level, and parent references for planned expeditions/events/entities/samples. Collection values remain elsewhere. |

Use the [complete Moorea result](../examples/moorea-permit-plan.json) as an importable example. All identifiers must survive export/import; adapters maintain separate maps to native database IDs. Permit IDs identify references within the configuration, while `identifier`, `url`, and `doi` identify the external document. Neither the module nor the schema uploads files or creates DOIs. A configuration export contains its references even when visibility is `members`; visibility is an intention, not encryption or an access-control mechanism.

## Coverage semantics

The whole-project scope is `{ "level": "project", "targetId": "project" }`. It is implicit and must not be duplicated in `targets`. Expeditions have a `null` parent; events belong to expeditions; entities belong to events; samples belong to entities or another sample. A sample chain supports derived material such as a DNA extraction from a tissue sample.

```text
project
  └─ expedition
       └─ event
            └─ entity (organism)
                 └─ sample (tissue)
                      └─ sample (derived DNA)
```

Coverage is additive. Every linked permit reaches descendants. If the same permit is linked at several levels, return it once and report the nearest link as its provenance. A narrower link does not revoke broader coverage; this version has no exclusions or overrides. Requirements use the same ancestry rules when determining whether a sample lacks a permit of a selected type.

Selecting a requirement or creating a permit starts with empty coverage. Assign the whole project or specific targets explicitly. Unassigned items remain valid drafts and produce review issues. Deleting a referenced scope or a parent with descendants is rejected until its links and children are addressed. Duplicate IDs, unknown types/targets, mismatched levels, cycles, malformed dates, and reversed validity dates are rejected before adopting an edit or import.

## Required metadata and preview values

Reporting fields specify `field`, `label`, `recordLevel`, `dataType`, `required`, and `format`. The engine merges selected requirements by `(recordLevel, field)`, combines required status, and retains all `sourcePermitTypeIds`. Definitions for the same key must agree on datatype and format. `metadataRequirements` combines these fields with the reference questionnaire's recommendations.

The illustrative fishing definition adds event-level `samplingProtocol` (string) and `usedScuba` (boolean). These describe each collecting event. The project's general SCUBA answer describes intent and never supplies a missing event value. `false` means SCUBA was not used; missing is a separate state.

`previewPermitReport` accepts observations separately as `{ targetId, values }` records. It returns `columns`, `rows`, and plan-wide `issues`. Each row contains `sampleId`, `entityId`, level-qualified field values such as `event.usedScuba`, resolved coverage, and review issues. It checks required values, datatypes, applicable missing permits, and event dates against the recorded permit date range, inclusive. Open date endpoints are allowed; missing event dates are flagged when a permit has a date bound.

One sample produces one row, including derived samples; the nearest sample supplies sample-level values. Several sample rows may refer to the same organism. The preview does not infer specimen totals or quotas. No detected gaps means only that these recorded fields and date checks passed; it is not a legal compliance decision. A single-document view filters covered samples and its reporting columns, while still showing other missing applicable permit requirements for those samples.

## Reuse the APIs

This example adopts the schema, then adds planning data through the engine:

```js
import { loadContract } from '../lib/contract.js';
import { createProjectEngine } from '../lib/project-engine.js';

const model = await loadContract(); // In Node, supply the filesystem loader below.
const engine = createProjectEngine(model);
const state = engine.createDraft();
engine.updateAnswers(state, { intent: 'new', projectName: 'Moorea pilot' });

const plan = structuredClone(state.permitPlan);
plan.catalog = structuredClone(model.permitCatalogs[0]);
plan.requirements = [{
  typeId: 'gump-fishing',
  coverage: [{ level: 'project', targetId: 'project' }],
}];
const permit = engine.newPermit('gump-fishing', 'FICTIONAL-FISH-42');
permit.coverage = [{ level: 'project', targetId: 'project' }];
plan.permits.push(permit);
engine.updatePermitPlan(state, plan); // Validates before mutating the draft.

const result = engine.exportConfiguration(state);
engine.assertValid(result);
```

Use `engine.resolvePermitCoverage(state, targetId)` for inherited links and `engine.previewPermitReport(state, records, { permitId })` for simulation. Omit `permitId` to show all samples and gaps. Standalone functions are exported from `lib/permit-plan.js` (package subpath `/permits`) and take `permitPlan` directly. Run structural schema validation before standalone semantic helpers; `engine.assertValid` performs both on a result.

The runnable [preview consumer](../examples/preview-permits.mjs) supplies a Node filesystem loader, imports a complete configuration, and passes fictional records separately:

```bash
node examples/preview-permits.mjs > /tmp/moorea-report-preview.json
```

That output is a report simulation, distinct from the shared project-configuration document. Host applications own their observation storage, interfaces, native ID mapping, and report exports. See [GEOME v2 integration notes](integration.md#geome-v2-integration-starting-points).

## Curating an operational catalog

1. Obtain Gump's approved permit names, applicability, reporting fields, record levels, datatypes, and reporting instructions. Keep approval evidence and source references alongside the curated catalog in repository documentation; do not derive official requirements from this demonstration.
2. Add a distinct catalog file and ID rather than repurposing `gump-moorea-demo`. Name the responsible curator and jurisdiction. Change `illustrative` to `false` only when the supplied definitions have actually been approved. The currently supported catalog format version is `1.0.0`; distinguish content revisions with new catalog IDs/files. A different format version requires schema/runtime migration support.
3. Define stable type and field IDs. Prefer existing shared fields with identical meanings, and retain event-level method/SCUBA data. Fields with matching record level and name must have compatible datatypes/formats. This format describes manually selected requirements; it does not encode automatic legal applicability rules, quotas, or report templates.
4. Register the new file in `loadContract`, or pass it through `createContract({ ..., permitCatalogs: [...] })`. Validate a result using the catalog through `engine.assertValid` and a Draft 2020-12 validator with format checks. Add representative missing-field, scope, and reporting examples.
5. Adopt revisions explicitly. Existing exports preserve their embedded catalog; never fetch or overwrite definitions during import. For an existing plan, map changed type IDs and review its requirements/documents/coverage before applying a replacement. The example UI's profile switch clears its previous plan after confirmation; it is not a semantic migration tool.
6. Run contract and browser tests, update agent/integration instructions, and coordinate adoption with GEOME and iPlaces. Operational integrations and official report generators remain separate work.

## Compatibility

Version 3 adds the permit plan and typed metadata requirements. v1/v2 imports receive an empty plan, preserve historical review evidence, and reopen reviews under questionnaire/rules version `2.0.0`. The old schemas and questionnaire remain unchanged. Unknown result versions, catalog formats, and extra properties are rejected instead of silently discarded.
