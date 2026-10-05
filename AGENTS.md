# Working on or adopting the shared project configuration

The user's instructions take precedence. This repository supplies a shared **JSON result contract**, reusable JavaScript modules, and a static reference app. Keep these layers separate.

## Start here

1. Read `README.md` and `docs/integration.md`.
2. Read `schemas/project-configuration.v2.schema.json` before changing output fields. It is the authoritative result contract for every consuming platform.
3. Inspect `model/questionnaire.v1.json` for labels, conditional questions, rules, and metadata recommendations. Inspect `lib/contract.js` for how the schema constrains the UI.
4. Run `npm ci` when test dependencies are missing, then `npm run check`.

## Architectural rules

- `schemas/` defines portable results; `model/` defines the example's presentation and guidance. Do not embed either in HTML or copy schema enums into UI code.
- `lib/` must work in both browsers and Node without a DOM, browser storage, or framework. Keep UI and persistence in host applications.
- Use `createContract` with parsed JSON, or `loadContract` with a loader. Use `createProjectEngine` for the reference behavior. Export with `engine.exportConfiguration(state)` and validate with `engine.assertValid(result)` before saving or transmitting a final result.
- Both GEOME and iPlaces must use the same schema identifier, result version, field meanings, and supported model versions. Keep native project IDs, authentication, permissions, and platform records outside the portable result.
- Never treat `answers.visibility` or a `Reviewed` status as authorization. Those are recorded project intentions and reviews.
- Do not silently discard unsupported fields or versions. Explicitly migrate older contracts and keep legacy import tests. Derived guidance is recomputed from answers; preserve review context and reopen stale reviews.
- Do not fetch a schema URL supplied by an arbitrary imported file. Select a trusted supported schema locally and validate the document against it.
- Do not add a build requirement for GitHub Pages. `index.html` must load relative ES-module and JSON paths correctly under `/geome-project-setup-module/`.

## Making changes

- Presentation-only changes belong in `assets/` or model labels/help. Keep the exported contract unchanged.
- Answer-field changes belong in a new version of the result schema, with corresponding question metadata, rule updates, fixture updates, and an explicit migration. Published schema versions are immutable contracts; avoid platform-specific forks with the same identifier.
- For rule changes, update the declared rule/model version and review fingerprints deliberately. The current reference package pins questionnaire and rule versions together.
- Keep TypeScript declarations in `lib/` aligned with public APIs. JSON Schema validation remains authoritative for detailed constraints.
- When integrating another repository, implement an adapter there only when the user requests it. Use the GEOME v2 entry points and mapping notes in `docs/integration.md`; do not assume a configuration JSON document is accepted by its current project API.

## Verification

- Run `npm run check` for contract, engine, migration, and schema-driven presentation changes.
- Run `npm run test:browser` for UI, asset-loading, or hosting changes. Install Chromium with `npx playwright install chromium`, or select installed Chrome with `PLAYWRIGHT_CHANNEL=chrome`.
- Browser tests serve the site beneath the GitHub Pages repository path, validate actual downloaded JSON, and exercise import/export, review invalidation, mobile layouts, and storage failure.
- Check `git diff --check` and make sure generated test reports, `node_modules`, local configuration exports, and secrets are not staged.
- Report what was validated and whether integration or publication is actually complete. Do not describe fixtures as exports from the live GEOME or iPlaces services.
