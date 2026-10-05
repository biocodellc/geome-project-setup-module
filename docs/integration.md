# Adopt the shared result contract

The result schema is the interoperability boundary. An application can use its own UI and database while producing and consuming the same project-configuration JSON. The reference app demonstrates adopting that schema before constructing questions and generating results.

## Contract files and versions

Use [`schemas/project-configuration.v2.schema.json`](../schemas/project-configuration.v2.schema.json). Results declare its `$id` in their `$schema` property, `kind: "project-configuration"`, and `version: 2`. They also declare schema model `2.0.0` and questionnaire/rule models `1.0.0`.

The schema uses JSON Schema Draft 2020-12. Enable format checks for dates, timestamps, and URIs. A result's `$schema` property is an identifier; load a trusted supported schema explicitly in your validator. Pin a repository commit or package artifact in production so two platforms adopt the same contract revision.

Result sections have the same meaning across platforms:

| Section | Meaning |
| --- | --- |
| `answers` | Project name, research intent, methods, policies, and selected template IDs. |
| `locations` | Origins and sites with stable IDs and country codes. |
| `templates` | Input/output selections, with unanswered values represented by `null`. |
| `metadataRequirements` | Proposed fields and recommendation levels. |
| `guardrails` | Derived preparation tasks and their review context. |
| `reviewRecords` | Reviewers, notes, evidence references, and context fingerprints. |
| `sources` | Guidance citations and snapshot dates. |
| Lifecycle fields | `createdAt`, `updatedAt`, `savedAt`, and `status`. |

The schema admits drafts. Additional semantic checks require unique location IDs, ordered start/end dates, and agreement between `templates.input` / `templates.output` and the corresponding answer fields. A saved configuration can still have pending preparation tasks.

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

The reference app follows this flow in `assets/bootstrap.js` and `assets/app.js`. Its choices and input limits come from the adopted answer schemas. `model/questionnaire.v1.json` adds labels, widget hints, stages, visibility conditions, and guidance; it does not redefine the result's permitted answer values. Unknown answer fields, incompatible widgets, and unsupported option labels fail during contract adoption.

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
import schema from 'geome-project-setup-module/schemas/project-configuration.v2.schema.json';
import legacySchema from 'geome-project-setup-module/schemas/project-configuration.v1.schema.json';
import questionnaire from 'geome-project-setup-module/model/questionnaire.v1.json';
import { createContract } from 'geome-project-setup-module/contract';
import { createProjectEngine } from 'geome-project-setup-module';

const engine = createProjectEngine(createContract({ schema, legacySchema, questionnaire }));
```

The package supplies TypeScript declarations for these APIs. Enable `resolveJsonModule` in a TypeScript consumer's configuration if JSON imports are not already supported. The JSON-import syntax above is for a bundler such as Vite; for unbundled Node use the filesystem loader or Node's supported JSON import attributes.

## GEOME v2 integration starting points

The neighboring `../geomev2` repository was inspected for these notes. Its frontend is React/Vite and its backend uses Node/Fastify. No changes to that repository are included here.

For local development, from the GEOME v2 repository root:

```bash
npm install --workspace frontend ../geome-project-setup-module
npm install --workspace backend ../geome-project-setup-module
```

Use a pinned package artifact or repository revision for deployment. This repository has not been published to an npm registry. Runtime modules have no package dependencies; test tools remain development dependencies of this repository.

Frontend entry points:

- `frontend/src/workbench/create/CreateProject.tsx`: adopt the contract and render its questions as part of creating a project, or mount a separate setup screen. Keep a `ProjectState` in React state and copy it before mutable engine updates.
- `frontend/src/api/client.ts`: add explicit import/export or configuration-storage API calls. Its existing `createProject` accepts native fields rather than the shared result.
- `frontend/src/workbench/manage/ProjectSettings.tsx`: expose configuration editing and JSON import/export for an existing project.

Backend entry points:

- `backend/src/routes/workbench.ts`: the current `POST /api/projects` accepts `title`, `code`, `description`, visibility, and project descriptive fields. Add an adapter or separate configuration endpoint with server-side validation; sending the shared document to the current route is insufficient.
- `backend/src/db/schema.ts` and a new database migration: preserve the complete validated configuration, its schema/model versions, and the native project relation. A JSONB column or related record is an integration design choice, not a migration supplied by this repository.

Suggested mapping:

| Shared result | Native GEOME v2 handling |
| --- | --- |
| `answers.projectName` | `title`; require a name when actually creating a native project. |
| `answers.purpose` | Candidate for `description`, subject to the application's editing policy. |
| `answers.visibility` | A recorded intent about sensitive metadata. Do not automatically equate it with project `isPublic` or `isDiscoverable`; apply the platform's explicit visibility controls. |
| `locations` | Preserve in the configuration. Decide separately whether/how these become expedition or collection records. |
| `reviewRecords` | Preserve evidence references and review context; these do not grant system permissions. |
| Complete result | Persist for faithful re-export, rather than keeping only the few native fields above. |
| Native `id`, `code`, owner, members | Keep in the application database, outside the shared JSON contract. |

Validate on the server even when the client uses the same engine. Project creation and configuration storage should succeed together, so a configuration is not silently dropped after creating the native project.

## iPlaces and other consumers

Use the same schema and semantic checks, then implement the host's own native-project adapter. Applications in other languages can use a Draft 2020-12 validator and the documented result meanings without adopting the JavaScript UI. Reuse the engine when identical reference questionnaire and guidance behavior is desired.

Both [`examples/geome-project.json`](../examples/geome-project.json) and [`examples/iplaces-project.json`](../examples/iplaces-project.json) validate against the same schema. They are fictional reference fixtures. Compatibility means the same structure and meanings, not identical project names or timestamps. Live integration and cross-platform synchronization are not implemented here.

## Import, migration, and review behavior

```js
const state = engine.importConfiguration(importedJSON);
const portableResult = engine.exportConfiguration(state);
engine.assertValid(portableResult);
```

The importer validates before adopting state, accepts legacy version 1, discards imported derived guidance, and recalculates it. New exports use version 2. `updateAnswers` prunes answers hidden by current question conditions and invalidates affected reviews. `guardrails` also marks reviews stale when their fingerprints differ, including after location edits. These methods update the supplied draft; an export is a detached snapshot.

When restoring a saved local session rather than importing a file, use `engine.importConfiguration(doc, { asImport: false })` to retain its saved status. File imports become drafts. Importing a result transfers its project-specific details; it does not silently create an unrelated project with a new identity.

## Changing the contract or example

For label, help, layout, or theme changes, edit questionnaire presentation or `assets/` and keep the result schema unchanged.

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
