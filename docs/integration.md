# Adopt the shared result contract

The result schema is the interoperability boundary. An application can use its own UI and database while producing and consuming the same project-configuration JSON. The reference app demonstrates adopting that schema before constructing questions and generating results.

## Contract files and versions

Use [`schemas/project-configuration.v4.schema.json`](../schemas/project-configuration.v4.schema.json). Results declare its `$id` in their `$schema` property, `kind: "project-configuration"`, and `version: 4`. They also declare schema model `4.0.0` and questionnaire/rule models `2.0.0`. The published v1/v2/v3 schemas remain available for imports.

The schema uses JSON Schema Draft 2020-12. Enable format checks for dates, timestamps, and URIs. A result's `$schema` property is an identifier; load a trusted supported schema explicitly in your validator. Pin a repository commit or package artifact in production so two platforms adopt the same contract revision.

Result sections have the same meaning across platforms:

| Section | Meaning |
| --- | --- |
| `projectDescription` | Reviewed people, funding, source identifiers, and original imported metadata snapshots; separate from native membership. |
| `answers` | Project name, research intent, methods, policies, and selected template IDs. |
| `locations` | Origins and sites with stable IDs and country codes. |
| `templates` | Input/output selections, with unanswered values represented by `null`. |
| `metadataRequirements` | Proposed fields with record level, datatype, required status, recommendation level, and originating permit type IDs. |
| `permitPlan` | Catalog snapshot, selected requirements, document references, and coverage against planned record references. No observations or document files. |
| `guardrails` | Derived preparation tasks and their review context. |
| `reviewRecords` | Reviewers, notes, evidence references, and context fingerprints. |
| `sources` | Guidance citations and snapshot dates. |
| Lifecycle fields | `createdAt`, `updatedAt`, `savedAt`, and `status`. |

The schema admits drafts. Additional semantic checks require unique location IDs, ordered start/end dates, agreement between templates and answer fields, unique permit/scope/type IDs, valid parent and coverage references, acyclic scope hierarchies, and consistent reporting-field types. Use `engine.assertValid` for these checks as well as structural validation. A saved configuration can still have pending preparation tasks, unassigned coverage, or unobtained permits.

## Browser adoption with no build

Copy or serve `lib/`, `schemas/`, and `model/` together, retaining their relative paths. From a browser module:

```js
import { loadContract } from './lib/contract.js';
import { createProjectEngine } from './lib/project-engine.js';

const model = await loadContract();
const engine = createProjectEngine(model);
const state = engine.createDraft();

// Render engine.visibleQuestions(state) in your own UI.
engine.updateAnswers(state, {
  intent: 'observations',
  projectName: 'Coastal observation project',
  inputTemplate: 'geome-flat',
  outputTemplate: 'biocode',
});
state.locations = [{ ...engine.newLocation(), country: 'NZ' }];

const result = engine.exportConfiguration(state);
engine.assertValid(result);
// Persist or download result using the host application's own storage.
```

The reference app follows this flow in `assets/bootstrap.js` and `assets/app.js`. Its choices and input limits come from the adopted answer schemas. `model/questionnaire.v2.json` adds labels, widget hints, stages, visibility conditions, and guidance; it does not redefine the result's permitted answer values. Unknown answer fields, incompatible widgets, and unsupported option labels fail during contract adoption. `assets/permit-planner.js` consumes the permit APIs described in the [planner guide](permit-planner.md).

## Node or another JavaScript application

The runnable [`examples/create-project.mjs`](../examples/create-project.mjs) uses the same engine without a browser:

```bash
node examples/create-project.mjs > /tmp/project-configuration.json
```

Node can use the standard loader with a filesystem reader:

```js
import fs from 'node:fs/promises';
import { loadContract } from './lib/contract.js';

const model = await loadContract({
  fetchJSON: async url => JSON.parse(await fs.readFile(url, 'utf8')),
});
```

For bundlers, import the data explicitly instead of fetching package-relative assets:

```js
import schema from 'geome-project-setup-module/schemas/project-configuration.v4.schema.json';
import legacySchema from 'geome-project-setup-module/schemas/project-configuration.v1.schema.json';
import previousSchema from 'geome-project-setup-module/schemas/project-configuration.v2.schema.json';
import v3Schema from 'geome-project-setup-module/schemas/project-configuration.v3.schema.json';
import questionnaire from 'geome-project-setup-module/model/questionnaire.v2.json';
import catalog from 'geome-project-setup-module/model/permit-catalog.gump-moorea.v1.json';
import { createContract } from 'geome-project-setup-module/contract';
import { createProjectEngine } from 'geome-project-setup-module';

const engine = createProjectEngine(createContract({
  schema, legacySchema, previousSchemas: [previousSchema, v3Schema], questionnaire,
  permitCatalogs: [catalog],
}));
```

The package supplies TypeScript declarations for these APIs. Enable `resolveJsonModule` in a TypeScript consumer's configuration if JSON imports are not already supported. The JSON-import syntax above is for a bundler such as Vite; for unbundled Node use the filesystem loader or Node's supported JSON import attributes.

## GEOME v2 integration starting points

The neighboring `../geomev2` repository was inspected for these notes. Its frontend is React/Vite and its backend uses Node/Fastify. The pilot adapter is implemented in that checkout; it is maintained and deployed separately from this package.

For local development, from the GEOME v2 repository root:

```bash
npm install --workspace frontend ../geome-project-setup-module
npm install --workspace backend ../geome-project-setup-module
```

Use a pinned package artifact or repository revision for deployment. This repository has not been published to an npm registry. Runtime modules have no package dependencies; test tools remain development dependencies of this repository.

Frontend entry points:

- `frontend/src/workbench/create/CreateProject.tsx`: offers iPlaces/DataCite description lookup, permit references, and full setup JSON import before native creation. Imported values are reviewed before adoption; the full questionnaire remains in this reference app.
- `frontend/src/api/client.ts`: maintain the typed creation and configuration-download calls. `createProject` accepts an optional `configuration` alongside the explicit native fields.
- `frontend/src/workbench/manage/ProjectSettings.tsx`: offers download of the original setup snapshot; later native settings edits do not synchronize back to it.

Backend entry points:

- `backend/src/routes/workbench.ts`: `POST /api/projects` accepts native fields plus optional `configuration`. The adapter validates with trusted local schemas, migrates supported versions, applies the final native name/description, recomputes guidance, and inserts the complete configuration in the project/owner transaction. Sending the shared document alone is insufficient.
- `db/migrations/26-project-configuration.sql`: adds `project_configuration`, keyed by the native project ID, with the complete JSONB snapshot. Apply it using `npm run db:migrate-setup` in GEOME v2 before using the adapter, including after Docker initialization or reset. Fresh databases created with `npm run db:setup` apply it after loading the seed.

Suggested mapping:

| Shared result | Native GEOME v2 handling |
| --- | --- |
| `answers.projectName` | `title`; require a name when actually creating a native project. |
| `answers.purpose` | Candidate for `description`, subject to the application's editing policy. |
| `answers.visibility` | A recorded intent about sensitive metadata. Do not automatically equate it with project `isPublic` or `isDiscoverable`; apply the platform's explicit visibility controls. |
| `locations` | Preserve in the configuration. Decide separately whether/how these become expedition or collection records. |
| `reviewRecords` | Preserve evidence references and review context; these do not grant system permissions. |
| `permitPlan.permits` | Map through `backend/src/routes/permits.ts` and the `PermitFields` contract in `projectInfo.ts`. Keep a mapping from portable permit ID to native numeric permit ID. |
| `permitPlan.targets` / `coverage` | Resolve or create actual records through a deliberate adapter; map portable references to native IDs. Project coverage maps to `coversProject`; expeditions have separate permit links. Event/entity/sample links use GEOME's record-level reference/import paths. |
| `metadataRequirements` | Configure the native metadata template with datatype and required status at the correct record level; preserve originating permit type IDs in the shared configuration. |
| Complete result | Persist for faithful re-export, rather than keeping only the few native fields above. |
| Native `id`, `code`, owner, members | Keep in the application database, outside the shared JSON contract. |

Validate on the server even when the client uses the same engine. Project creation and configuration storage should succeed together, so a configuration is not silently dropped after creating the native project.

The inspected GEOME v2 permit implementation already uses additive inheritance through project → expedition → event → entity → sample, including parent samples, and deduplicates each permit using the nearest link. Preserve these semantics. Its native `PermitFields` include `permitType`, `identifier`, `url`, `issuer`, `holder`, validity dates, `scope`, and `visibility`. Resolve catalog type IDs to its controlled `permitType` vocabulary explicitly; do not send illustrative IDs as native vocabulary values. Normalize empty optional strings as required by the native API. DOI references have no dedicated field in that inspected type: preserve them in the shared configuration unless a native extension is implemented.

The native attribute catalog includes event-level `samplingProtocol`. A structured event-level `usedScuba` field needs explicit registration/mapping; do not silently store project intent in place of observations. Record visibility must be enforced by the host's authorization layer. A portable `public` intention cannot bypass native permissions.

Keep the full catalog snapshot and any unmapped data when storing the configuration. Future creation triggered by an iPlaces review needs authentication, project ownership, idempotent ID mapping, and coordinated persistence in that integration. The adapter creates a native project only when the signed-in user submits the GEOME create form. Imported permits, planned targets, and reporting definitions are retained in the configuration; native permit and collection records require separate explicit mapping. Ongoing synchronization is not implemented.

## iPlaces and other consumers

Use the same schema and semantic checks, then implement the host's own native-project adapter. Applications in other languages can use a Draft 2020-12 validator and the documented result meanings without adopting the JavaScript UI. Reuse the engine when identical reference questionnaire and guidance behavior is desired.

Both [`examples/geome-project.json`](../examples/geome-project.json) and [`examples/iplaces-project.json`](../examples/iplaces-project.json) validate against the same schema. They are fictional reference fixtures. Compatibility means the same structure and meanings, not identical project names or timestamps. The iPlaces import and neighboring GEOME creation adapter are implemented locally; cross-platform synchronization and production deployment are not included.

## iPlaces import pilot

iPlaces is the concrete pilot for **import existing information → review it → answer remaining setup questions → create a GEOME project**. Start with the public [Biocode project page](https://iplacesalliance.org/gumpstation/articles/7/index.html) or its [DOI](https://doi.org/10.60950/7efde9b6-eddf-4011-83ac-885605d05bc9). Description and permit imports are optional; starting from scratch still works.

The first reference-app stage offers project-description lookup and existing permit references. Review names, descriptions, study areas, people, and funding before adopting them. Imported people remain descriptive records; publication dates do not become collection dates. Applying a new project description explicitly replaces the displayed name/description and descriptive people/funding while retaining other setup answers and permits. Invalid or cancelled imports leave the prior draft intact.

`geome-project-setup-module/imports` exports `lookupReference`, `fromDataCite`, `fromSchemaOrg`, `extractJSONLD`, `applyProjectImport`, and `applyPermitImport`, with TypeScript declarations. Parsers and lookup return candidates; apply helpers clone and validate before returning a replacement state. Lookups accept DataCite DOIs and HTTPS iPlaces pages, without credentials or arbitrary context/schema fetching. Page imports support a single Project/ResearchProject or linked article, including the Biocode graph; ambiguous pages are rejected. Other HTTPS permit links are retained as references without downloading their documents. Time and size limits bound retrieval.

V4 adds `projectDescription`: reviewed `people`, `funding`, `identifiers`, and `imports`. Each import retains its resource kind, format, source URL, retrieval timestamp, and original metadata serialized as JSON in `content`, including fields outside the normalized subset. Treat `content` as inert source data. Drafts and exports retain these snapshots; subsequent source changes do not synchronize automatically. Reimporting the same source replaces its snapshot after review. Limits are defined in the schema; oversized values are rejected rather than truncated.

V4 also allows `permitPlan.permits[].typeId` to be empty for an unclassified reference, including when no catalog is selected. Such references must have empty coverage. Assign a catalog type explicitly before coverage; importing a citation never establishes applicability or approval. DataCite publication metadata does not supply issuer, holder, or permit validity; explicit schema.org Permit properties can suggest those fields. Imported unclassified references survive initial profile selection. The Moorea catalog remains illustrative.

The neighboring GEOME v2 form supports the same DOI/page lookup and permits, plus importing a complete JSON configuration exported by this app. It saves the validated configuration atomically with the native project and its owner. `GET /api/projects/:id/configuration` returns that snapshot only to signed-in project members, even if the native project is public. Project settings provide a download button. Native visibility remains an explicit GEOME choice and is never derived from `answers.visibility` or review status.

Both native workspaces currently use a local dependency on this checkout. For deployment, package and pin the same module revision in frontend and backend; this package is not published to npm. Apply the additive database migration before deployment. No live-service publication or DOI minting is performed by these changes. Other collaborators below remain future work.

### Note on other project collaborators

The following are potential future sources and collaboration opportunities, not established partnerships or implemented integrations. They do not block the iPlaces pilot. Each would supply suggestions for the same setup draft; researchers should not need to select or understand a metadata standard. Retain each source's identity and distinguish a project from its plans, grants, and datasets.

| Potential collaborator/source | Possible use | Dependencies |
| --- | --- | --- |
| **CDL / DMP Tool** | Reuse project details and planned data-management information from an existing DMP. | Authorized [API access](https://github.com/CDLUC3/dmptool/wiki/API-Fetch-DMP), or an accessible public/exported plan; mapping from the [RDA DMP Common Standard](https://github.com/RDA-DMP-Common/RDA-DMP-Common-Standard); confirmation of available structured and narrative content. Respect plan visibility and reassess capabilities as CDL's rebuild becomes available. |
| **GBIF / IPT** | Reuse project context, study area, and methods associated with an existing dataset. | [Registry API](https://techdocs.gbif.org/en/openapi/v1/registry) and [EML metadata](https://ipt.gbif.org/manual/en/ipt/latest/gbif-metadata-profile) retrieval; mapping optional project information; researcher confirmation of dataset-to-project scope. GBIF funded-project pages need separate assessment. |
| **NCBI BioProject** | Start from a biological research description and retain its accession. | Public record retrieval and field mapping; distinguish [umbrella projects from individual studies](https://www.ncbi.nlm.nih.gov/bioproject/docs/faq/). |
| **NSF Award Search** | Populate descriptive information from a grant award. | [Award lookup](https://www.nsf.gov/funding/award-search) and field mapping; confirm which portion of the funded work belongs to the project and keep award dates separate from collection dates. |
| **RAiD** | Link an identified research project to its associated people, organizations, funding, and outputs. | An accessible [RAiD record](https://documentation.raid.org/raid/raid-system-overview); verification of the relevant service's retrieval interface, access requirements, and metadata mapping. |

As reviewed on October 6, 2026, CDL documents [limitations in exchanging narrative DMP content](https://uc3.cdlib.org/our-work/data-management-planning/machine-actionable-plans-pilot-project/). Its [rebuild status](https://blog.dmptool.org/rebuild-hub/) gives a tentative late-2026 or early-2027 release, with no fixed launch date. A future DMP integration should verify released capabilities rather than depend on that schedule.

## Import, migration, and review behavior

```js
const state = engine.importConfiguration(importedJSON);
const portableResult = engine.exportConfiguration(state);
engine.assertValid(portableResult);
```

The importer validates before adopting state and accepts versions 1–4. It recalculates imported derived guidance; new exports use version 4. v1/v2 files gain an empty permit plan without invented permits. A rule-version change marks all existing review records pending/stale while preserving notes, evidence, and historical records for rules that no longer apply. V3 imports retain catalog snapshots, IDs, coverage, and review fingerprints, and gain an empty `projectDescription`. Questionnaire/rules remain at `2.0.0`; this migration does not reopen unchanged reviews. `updateAnswers` prunes answers hidden by current question conditions and invalidates affected reviews. `guardrails` also marks reviews stale when their fingerprints differ, including after location edits. These methods update the supplied draft; an export is a detached snapshot.

When restoring a saved local session rather than importing a file, use `engine.importConfiguration(doc, { asImport: false })` to retain its saved status. File imports become drafts. Importing a result transfers its project-specific details; it does not silently create an unrelated project with a new identity.

## Changing the contract or example

For label, help, layout, or theme changes, edit questionnaire presentation or `assets/` and keep the result schema unchanged.

For permit type and reporting-field definitions that fit the current contract, follow [catalog curation](permit-planner.md#curating-an-operational-catalog). Publish a distinct catalog snapshot and adopt it deliberately; existing results retain their embedded definitions. Changes to coverage semantics or supported catalog formats require a new contract version and migration.

For a new answer field or changed allowed values:

1. Create a new versioned schema with a new `$id` and result/model version. Published versions are immutable contracts.
2. Add or adjust the question metadata. The schema supplies its type, allowed values, and limits; metadata supplies labels and presentation.
3. Update affected guidance predicates, watched fields, and metadata recommendations. Change model versions when behavior changes. The current reference package pins questionnaire and rule versions together.
4. Update `loadContract`, version dispatch, TypeScript declarations as necessary, and an explicit migration. Keep older import fixtures.
5. Add complete valid example results and negative cases, then run contract and browser tests. Update adopting applications together; do not fork the meaning of an existing schema identifier per platform.

The runtime validator intentionally implements only the keywords used by supported schemas. When introducing another JSON Schema keyword, implement and test it in the runtime validator or adopt a full validator. The standard Ajv tests are the independent compatibility check.

## GitHub Pages

The static example loads relative modules and JSON paths, including on a GitHub project site. Serve the repository root from `main` in Settings → Pages. No npm build or application server runs on GitHub Pages.

For a local deployment-path check:

```bash
npm run dev -- --base /geome-project-setup-module/
```

Open `http://127.0.0.1:8000/geome-project-setup-module/`. The browser test suite uses that same kind of repository prefix. Keep the `assets`, `lib`, `model`, and `schemas` directories present and avoid root-absolute asset URLs.
