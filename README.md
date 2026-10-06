# Shared Project Configuration — GEOME reference app

A schema-driven project setup example for GEOME, iPlaces Alliance, and other research platforms. Each platform can adopt the same JSON result schema, build its own interface, and exchange project configurations with the same structure.

The reference app guides researchers through research intent, study areas, methods, permissions, data formats, and review. It generates a preparation checklist and a portable JSON result. The Moorea permit planner demonstrates selecting permit requirements before collecting, referencing documents once, linking their coverage, and previewing reporting fields for events and samples.

## Adopt the schema, then build an application

The [shared result schema](schemas/project-configuration.v4.schema.json) is the source of truth for field names, types, allowed values, and export structure. The [questionnaire metadata](model/questionnaire.v2.json) supplies labels, stages, widget hints, conditional questions, and guidance rules. The reference app binds these together at startup; it derives answer choices and limits from the schema and rejects contradictory presentation metadata. Permit catalogs supply typed reporting-field definitions within the same contract.

```text
schemas/project-configuration.v4.schema.json
                    +
model/questionnaire.v2.json + permit catalog
                    ↓
lib/contract.js → lib/project-engine.js
                    ↓
       example UI or another application
                    ↓
          shared JSON project results
```

The shared artifact is the **JSON result**, not a requirement to reuse this screen. The JavaScript engine is optional for other platforms; applications in any language can consume the JSON Schema and implement the same contract.

Start with the [integration guide](docs/integration.md), [permit planner and catalog guide](docs/permit-planner.md), [agent instructions](AGENTS.md), and the runnable [consumer example](examples/create-project.mjs). The integration guide includes specific starting points for the neighboring `../geomev2` application.

## Run the reference app

With Node.js 20 or later:

```bash
npm run dev
```

Open [http://127.0.0.1:8000](http://127.0.0.1:8000). No dependency installation or build is needed to serve the app. Alternatively, use any static HTTP server, such as `python3 -m http.server 8000 --bind 127.0.0.1`.

The app loads ES modules and JSON files over HTTP; opening `index.html` directly with a `file://` URL is no longer supported. Choose **Try an example**, or enter a project and work through the six stages.

For the pilot, choose **Try an example → BioCode 2.0 · Moorea permit planner**. Open **Access & permissions** to edit requirements, permit references, and coverage, then **Preview reporting needs**. Change the fictional event's collecting method or SCUBA use to see missing-field and date issues. The demonstration deliberately leaves the second expedition without a fishing-permit link.

The Gump/Moorea catalog and permit references are illustrative, not Gump-approved requirements or issued authorizations. The reporting preview uses separate fictional observations; those observations are never included in the configuration JSON.

## Start with an existing description or permit

On the first stage, choose **Import project description** and paste an iPlaces page URL or a DataCite DOI. **Use Biocode example** looks up the public iPlaces description. Review and edit the name, description, study area, people, and funding before applying. Original metadata and its source link are retained in the configuration; imports do not assign project members, collection dates, or permit coverage.

Choose **Add existing permit** to look up a DataCite DOI or an iPlaces `Permit` description, or save an HTTPS document link with manually entered details. New references can be kept without a catalog; choose a profile and type in **Access & permissions** before assigning coverage. The Moorea profile remains illustrative. Other document links are retained without downloading their files.

Lookups run only when requested, directly from the browser, with no credentials. The pilot supports DataCite DOIs and iPlaces pages; network, CORS, missing-record, and ambiguous-page failures leave the draft unchanged. These descriptions are editable snapshots, not synchronized records. All setup questions remain available for starting from scratch.

## JSON results and compatibility

New exports have `kind: "project-configuration"`, `version: 4`, and a `$schema` identifier pointing to the [canonical v4 schema](https://raw.githubusercontent.com/biocodellc/geome-project-setup-module/main/schemas/project-configuration.v4.schema.json). Model versions identify schema `4.0.0` and questionnaire/rules `2.0.0`.

Results contain imported project descriptions and source snapshots (`projectDescription`), answers, locations, input/output template choices, typed metadata requirements, preparation tasks, review records, source citations, timestamps, and `permitPlan`. That plan carries the adopted catalog snapshot, selected requirements, document references, and explicit coverage links to portable project/expedition/event/entity/sample references. A project-wide link flows down to all descendants; narrower links add coverage. See complete illustrative [GEOME results](examples/geome-project.json), [iPlaces Alliance results](examples/iplaces-project.json), and the [Moorea permit plan](examples/moorea-permit-plan.json). These fixtures are generated by this reference implementation, not obtained from either live service. All validate against the same schema.

Versions 1–3 remain importable and become version 4 on export. v1/v2 gain an empty permit plan; all older versions gain empty project-description metadata. Published v1/v2/v3 schemas remain unchanged. Unsupported versions and properties are rejected. Imported derived guidance is recalculated from answers; migration preserves review evidence and reopens reviews when the rule version changes.

Drafts are stored in this browser's `localStorage`. **Save configuration** saves locally, **Export JSON** downloads a portable result, and **Import JSON** opens one. There is one current draft per browser origin. Drafts are not uploaded or synchronized; use export/import to move between localhost, GitHub Pages, and other platforms. Visibility choices record an intended policy and do not establish access controls.

## Use the engine without the UI

This command creates and validates a project from the shared schema and writes JSON to stdout:

```bash
node examples/create-project.mjs > project-configuration.json
```

The engine has no DOM, framework, storage, or runtime package dependencies. It exposes schema adoption, draft creation, question selection, answer updates, import validation, result export, permit coverage resolution, and report simulation. Run `node examples/preview-permits.mjs` for a JSON reporting preview derived from the Moorea configuration and separate fictional records. See [browser, Node, and GEOME v2 examples](docs/integration.md).

## Repository layout

| Path | Purpose |
| --- | --- |
| `schemas/` | Canonical shared v4 result contract and preserved v1/v2/v3 import schemas. |
| `model/` | Questionnaire presentation, guidance rules, permit catalog, and fictional preview records. |
| `lib/` | Reusable ES modules and TypeScript declarations for adopting the schema, creating results, and validation. |
| `assets/` | Reference UI, bootstrap loader, and styles. |
| `index.html` | Static page shell. |
| `examples/` | Complete JSON results, runnable consumers, and legacy migration fixtures. |
| `docs/integration.md` | Integration, field mapping, versioning, and extension instructions. |
| `docs/permit-planner.md` | Coverage semantics, report simulation, and catalog curation. |
| `AGENTS.md` | Instructions for agents maintaining or adopting this module. |
| `test/` | Contract tests and browser tests, including GitHub Pages subdirectory hosting. |

## Development and verification

```bash
npm ci
npm run check
npx playwright install chromium
npm run test:browser
```

For an installed Chrome browser, use `PLAYWRIGHT_CHANNEL=chrome npm run test:browser`. Development dependencies are used only for testing. Contract tests use a standard Draft 2020-12 validator with format validation enabled; the lightweight runtime validator supports only the schema features this package uses.

After building the neighboring GEOME frontend, run `node scripts/check-geome-integration.mjs ../geomev2` for the native creation browser check. It uses installed Chrome and mocked API writes; no live projects are created. GEOME's backend has a separate disposable-database integration test for transactional creation and member-only configuration downloads.

Edit the canonical JSON schemas and model files directly. There is no generated copy embedded in HTML and no build step. Follow the [change and versioning guide](docs/integration.md#changing-the-contract-or-example) when adding fields or changing behavior.

## Publish on GitHub Pages

1. Open [repository Settings → Pages](https://github.com/biocodellc/geome-project-setup-module/settings/pages).
2. Set **Source** to **Deploy from a branch**.
3. Select **main** and **/ (root)**, then **Save**.
4. Check **Actions** for the Pages deployment, then use **Visit site**. Publishing can take up to 10 minutes.

The expected default URL is [https://biocodellc.github.io/geome-project-setup-module/](https://biocodellc.github.io/geome-project-setup-module/). Publish the repository root so the `assets/`, `lib/`, `model/`, and `schemas/` paths are included. All application URLs are relative and work beneath the repository subdirectory. `.nojekyll` enables plain static hosting; no custom workflow or build command is required. Future pushes to `main` update the site. See GitHub's [publishing instructions](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site) and [site creation guide](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site).

If Pages is unavailable, check repository permissions and organization settings. GitHub Free supports public-repository Pages; private repositories require a supporting plan.

## Current scope

The shared contract and reference app are implemented here. A native creation adapter is implemented in the neighboring GEOME v2 checkout; see the integration guide for its dependency and migration requirements. The reference site itself does not create native projects. This repository does not provide accounts, a backend, or cross-platform synchronization.

Permit documents are external references. File hosting, DOI minting, authoritative permit determination, specimen counts, and official regulatory reports are outside this example. Gump must curate and approve operational requirements and reporting definitions before they replace the illustrative profile.

GEOME flat model and Biocode Format previews are illustrative. RepAdapt remains a placeholder. Spreadsheet generation, file conversion, and complete field mappings are not implemented; the common project-configuration schema is separate from those data formats.

Embedded guidance is dated October 5, 2026. Country examples cover Australia, New Zealand, the United States, Brazil, South Africa, India, and France; other countries use the general framework and country-profile links. Review records document preparation and do not grant permission from an authority.
