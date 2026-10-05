# GEOME Project Setup Module

A standalone prototype for guiding researchers through the setup of a GEOME project. It turns questions about research intent, study locations, methods, permissions, and data formats into a portable project configuration and a preparation checklist.

The purpose is to help a project team identify what needs review, who will review it, and what evidence supports each decision before collecting, reusing, or sharing biological samples and associated metadata.

## What it does

The questionnaire has six stages:

1. **Research intent** — describe the project and whether it involves new samples, existing material, observations, or a combination.
2. **Study area** — record origins and sites, environments, research country, and dates.
3. **Activities & methods** — describe organisms, collection methods, genetic work, diving, and other relevant activities.
4. **Access & permissions** — capture provenance, access and benefit sharing, transfers, site policies, and intended metadata visibility.
5. **Data templates** — choose input and output formats independently, with illustrative previews.
6. **Review & save** — review answers, proposed metadata fields, and preparation tasks; save locally or export JSON.

Questions and checklist items adapt to the answers. Each preparation task explains why it appeared, suggests a next action, and links to supporting sources. Reviewers can record a status, name, evidence reference, and notes. Relevant answer changes reopen affected reviews.

Other features include example projects, multiple study sites, searchable country selection, light and dark themes, JSON import/export, and a **View model** panel for inspecting the questionnaire, rules, and schema.

## Run locally

Open `index.html` in a modern browser. There are no packages to install, build commands, API keys, or backend services.

For a local HTTP preview, run this from the repository directory with Python 3:

```bash
python3 -m http.server 8000 --bind 127.0.0.1
```

Then open [http://localhost:8000](http://localhost:8000). Stop the server with `Ctrl+C`.

Choose **Try an example** to explore an existing scenario, or enter your own project details and work through the stages.

## Saving and sharing configurations

Drafts are automatically stored in the browser's `localStorage`. **Save configuration** marks the current configuration as saved locally; **Export JSON** downloads a portable copy, and **Import JSON** restores one. Imports are validated and checklist items are recalculated from the imported answers.

An export contains answers, locations, template selections, proposed metadata fields, preparation tasks, review records, sources, timestamps, and model versions. Its format is identified by `kind: "geome-project-configuration"` and `version: 1`.

There is one current draft per browser storage context. Drafts are not uploaded to GEOME or GitHub and do not synchronize across browsers or devices. Local files, localhost, and the hosted site can have separate storage; use JSON export/import to move work between them. If browser storage is unavailable or cleared, an exported file is the way to retain your work.

## Current scope

- This is a project configuration prototype. It does not create projects in a live GEOME service or provide user accounts and shared project storage.
- GEOME flat model and Biocode Format previews are illustrative. RepAdapt is a placeholder awaiting a specification. Spreadsheet generation, file conversion, and complete field mappings are not implemented.
- Visibility choices record the intended policy; they do not implement access controls.
- Embedded guidance is dated October 5, 2026. Country examples cover Australia, New Zealand, the United States, Brazil, South Africa, India, and France; other countries use the general framework and links to country profiles. A saved review records preparation, not permission from an authority. Confirm applicable requirements with the relevant authorities.

## Project structure and customization

| File | Purpose |
| --- | --- |
| `index.html` | Complete application: markup, styles, embedded model, and browser JavaScript. |
| `README.md` | Purpose, usage, and hosting instructions. |
| `.nojekyll` | Tells GitHub Pages to serve the static files without Jekyll processing. |

The `<script id="project-model" type="application/json">` block in `index.html` defines the stages, questions, country profiles, source references, templates, rules, and configuration schema. Edit this block to extend the questionnaire and guidance. Conditions use data predicates such as `eq`, `in`, `contains`, `exists`, `all`, `any`, and `not`.

The JavaScript below the model handles rendering, conditional questions, derived checklist items, browser storage, and import/export. Its validator supports the schema keywords used by this prototype; it is not a general-purpose JSON Schema implementation. When changing answer fields, keep the questions, schema, and dependent rules consistent.

## Publish on GitHub Pages

This application can be hosted directly from the repository with no build step.

1. Open the repository's [Settings → Pages](https://github.com/biocodellc/geome-project-setup-module/settings/pages).
2. Under **Build and deployment**, set **Source** to **Deploy from a branch**.
3. Select **main** and **/ (root)**, then click **Save**.
4. Check the repository's **Actions** tab for the Pages deployment. Publishing can take up to 10 minutes.
5. Use **Visit site** in the Pages settings. With the default GitHub domain, the expected address is [https://biocodellc.github.io/geome-project-setup-module/](https://biocodellc.github.io/geome-project-setup-module/).

Future pushes to `main` automatically update the site. The repository already contains the root `index.html` and `.nojekyll` needed for this static setup. These steps follow GitHub's [publishing-source instructions](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site) and [site creation guide](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site).

If Pages is unavailable, check your repository permissions and organization settings. GitHub Free supports Pages for public repositories; private repositories require a plan that supports private-repository Pages.
