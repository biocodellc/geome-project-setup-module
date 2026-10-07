import {
  lookupReference,
  applyProjectImport,
  applyPermitImport,
} from "../lib/project-import.js";
import { renderImportSource, importedFields } from "./import-source.js";

export function createProjectImporter({
  engine,
  getState,
  setState,
  openDialog,
  esc,
  countryOptions,
}) {
  let candidate = null,
    kind = "project",
    request = null,
    editing = false;
  const dialog = document.getElementById("dialog");
  const field = (id, label, value = "", type = "text", limit = 2000) =>
    `<label class="field-label" for="${id}">${label}</label><${type === "textarea" ? "textarea" : "input"} class="input" id="${id}" ${type === "textarea" ? "" : `type="${type}" value="${esc(value)}"`} maxlength="${limit}">${type === "textarea" ? esc(value) + "</textarea>" : ""}`;
  function error(message) {
    const el = document.getElementById("source-error");
    if (el) {
      el.textContent = message;
      el.hidden = false;
    }
  }
  const errorBox =
    '<p id="source-error" class="inline-error" role="alert" hidden></p>';
  function importGuide(selected = "project") {
    return `<section class="import-guide" aria-label="How importing works"><h3>How importing works</h3><ol>
      <li><strong>Read a source.</strong> A lookup reads an iPlaces page’s embedded schema.org metadata (JSON-LD), or a DOI’s DataCite metadata record.${selected === "permit" ? " Other permit links are kept as references; their documents are not downloaded." : ""}</li>
      <li><strong>Review the suggestions.</strong> ${selected === "permit" ? "Check the permit identifier, issuer, holder, and dates where provided. Fill in any missing details." : "Check and edit the project name, description, study area, people, and funding before using them."}</li>
      <li><strong>Apply when ready.</strong> Only then are the reviewed details and original source metadata added to your setup draft in this browser. Continue setup before creating a GEOME project.</li>
    </ol><p class="help">This is a one-time copy. The source stays unchanged, and later source updates are not synchronized.${selected === "permit" ? " You choose the permit’s type and coverage separately." : ""}</p></section>`;
  }
  function start(selected) {
    request?.abort();
    candidate = null;
    kind = selected;
    editing = false;
    openDialog(
      kind === "project"
        ? "Import a project description"
        : "Add an existing permit",
      `${importGuide(kind)}${kind === "project" ? '<p class="help"><strong>Trying Biocode 2.0?</strong> The Biocode example uses the iPlaces page. Its ResearchProject record supplies the name, description, study area, and funding; the linked ScholarlyArticle supplies the people and DOI. Choosing <strong>Use Biocode example</strong> starts that lookup.</p>' : ""}<form id="source-lookup">${field("source-url", kind === "project" ? "Project DOI or iPlaces link" : "Permit DOI or document link")}<p class="help">Look up details reads the source for review. Your draft stays unchanged until you apply.</p>${errorBox}<div class="dialog-actions"><button class="btn primary" type="submit">Look up details</button>${kind === "project" ? '<button type="button" class="btn" data-source-action="example">Use Biocode example</button>' : ""}</div></form>`,
    );
    document.getElementById("source-url").required = true;
  }
  function peopleFunding(data) {
    return `<details class="permit-card"><summary>People and funding (${data.people.length} people, ${data.funding.length} awards)</summary><div class="permit-card-body"><p class="help">These are descriptive records, not project members. You can edit imported values.</p>${data.people.map((p, i) => `<fieldset data-person="${i}"><legend>Person ${i + 1}</legend>${field(`person-name-${i}`, "Name", p.name, "text", 500)}${field(`person-id-${i}`, "Identifier / ORCID", p.identifier)}${field(`person-affiliation-${i}`, "Affiliation", p.affiliation)}</fieldset>`).join("")}${data.funding.map((f, i) => `<fieldset data-funding="${i}"><legend>Award ${i + 1}</legend>${field(`funding-funder-${i}`, "Funder", f.funder, "text", 500)}${field(`funding-number-${i}`, "Award number", f.awardNumber, "text", 500)}${field(`funding-title-${i}`, "Award title", f.awardTitle)}${field(`funding-url-${i}`, "Award URL", f.awardUrl)}</fieldset>`).join("")}</div></details>`;
  }
  const readValue = (id) => document.getElementById(id)?.value || "";
  function readDetails(data) {
    return {
      people: data.people.map((p, i) => ({
        name: readValue(`person-name-${i}`),
        identifier: readValue(`person-id-${i}`),
        affiliation: readValue(`person-affiliation-${i}`),
      })),
      funding: data.funding.map((f, i) => ({
        funder: readValue(`funding-funder-${i}`),
        awardNumber: readValue(`funding-number-${i}`),
        awardTitle: readValue(`funding-title-${i}`),
        awardUrl: readValue(`funding-url-${i}`),
      })),
    };
  }
  function review() {
    const s = getState();
    const a = engine.model.schema.properties.answers.properties;
    const fields =
      kind === "project"
        ? `${s.answers.projectName || s.answers.purpose ? '<p class="notice warn">Applying these details replaces the current project name, description, people, and funding. Other setup answers and permits are kept.</p>' : ""}${field("source-title", "Project name", candidate.title, "text", a.projectName.maxLength)}${field("source-description", "Research description", candidate.description, "textarea", a.purpose.maxLength)}<p class="help">Description limit: ${a.purpose.maxLength} characters. The original source metadata is retained.</p>${field("source-place", "Study area to add (optional)", candidate.place, "text", 240)}<label class="field-label" for="source-country">Country or territory — confirm if known</label><select class="input" id="source-country">${countryOptions("")}</select>${peopleFunding(candidate)}`
        : `${Object.entries({
            identifier: "Permit identifier",
            url: "Document URL",
            doi: "DOI",
            issuer: "Issuer",
            holder: "Holder",
            validFrom: "Valid from (YYYY-MM-DD)",
            validUntil: "Valid until (YYYY-MM-DD)",
            scope: "Scope notes",
          })
            .map(([key, label]) =>
              field(
                "source-permit-" + key,
                label,
                candidate.permit[key],
                key.startsWith("valid")
                  ? "text"
                  : key === "scope"
                    ? "textarea"
                    : "text",
                key === "scope" || key === "url" ? 2000 : 240,
              ),
            )
            .join(
              "",
            )}<p class="help">This reference will be added without a permit type or coverage. Assign them in Access & permissions when you know what it covers.</p>`;
    openDialog(
      "Review imported details",
      `${renderImportSource(candidate.source, esc)}<p><strong>Ready to review:</strong> ${esc(importedFields(candidate) || "Enter the missing details below")}.</p><p class="help">Applying saves the reviewed details and original metadata in this browser’s setup draft. The source is unchanged. This is a one-time import; future source changes require another lookup. You can continue setup before creating a GEOME project.</p>${candidate.warnings.map((w) => `<p class="notice">${esc(w)}</p>`).join("")}<form id="source-review">${fields}${errorBox}<div class="dialog-actions"><button class="btn primary" type="submit">${kind === "project" ? "Use these details" : "Add this permit reference"}</button><button class="btn" type="button" data-action="close-dialog">Cancel</button></div></form>`,
    );
    document.getElementById(
      kind === "project" ? "source-title" : "source-permit-identifier",
    ).required = true;
  }
  document.addEventListener("click", (event) => {
    const action = event.target.closest("button")?.dataset.sourceAction;
    if (action === "project" || action === "permit") start(action);
    if (action === "sources") {
      openDialog(
        "Imported sources",
        `<p>These are the original source snapshots retained with your draft. Your reviewed edits are stored separately.</p>${getState()
          .projectDescription.imports.map((source) =>
            renderImportSource(source, esc),
          )
          .join("")}`,
      );
    }
    if (action === "example") {
      document.getElementById("source-url").value =
        "https://iplacesalliance.org/gumpstation/articles/7/index.html";
      document.getElementById("source-lookup").requestSubmit();
    }
    if (action === "details") {
      editing = true;
      candidate = structuredClone(getState().projectDescription);
      openDialog(
        "People and funding",
        `<form id="source-review">${peopleFunding(candidate)}${errorBox}<button class="btn primary" type="submit">Save details</button></form>`,
      );
      document.querySelector("#source-review details").open = true;
    }
  });
  document.addEventListener("submit", async (event) => {
    if (!["source-lookup", "source-review"].includes(event.target.id)) return;
    event.preventDefault();
    if (event.target.id === "source-lookup") {
      const controller = new AbortController();
      request?.abort();
      request = controller;
      const button = event.target.querySelector("[type=submit]");
      button.disabled = true;
      button.textContent = "Looking up…";
      try {
        const result = await lookupReference(readValue("source-url"), {
          kind,
          signal: controller.signal,
        });
        if (request !== controller || !dialog.open) return;
        candidate = result;
        review();
      } catch (e) {
        if (request === controller && !controller.signal.aborted)
          error(e.message);
      } finally {
        if (button.isConnected) {
          button.disabled = false;
          button.textContent = "Look up details";
        }
      }
    } else {
      try {
        let next;
        if (editing) {
          next = structuredClone(getState());
          Object.assign(next.projectDescription, readDetails(candidate));
          engine.updateAnswers(next, {});
          engine.assertValid(engine.exportConfiguration(next));
        } else if (kind === "project")
          next = applyProjectImport(engine, getState(), candidate, {
            title: readValue("source-title"),
            description: readValue("source-description"),
            place: readValue("source-place"),
            country: readValue("source-country"),
            ...readDetails(candidate),
          });
        else
          next = applyPermitImport(
            engine,
            getState(),
            candidate,
            Object.fromEntries(
              Object.keys(candidate.permit).map((key) => [
                key,
                readValue("source-permit-" + key),
              ]),
            ),
          );
        setState(next);
        dialog.close();
      } catch (e) {
        error(e.message);
      }
    }
  });
  dialog.addEventListener("close", () => {
    request?.abort();
    request = null;
  });
  return {
    render: () => {
      const data = getState().projectDescription;
      return `<section class="import-start"><h2>What do you already have?</h2><p>Bring in an existing description or permit, or start from scratch with the questions below.</p>${importGuide()}<div class="dialog-actions"><button class="btn" data-source-action="project">Import project description</button><button class="btn" data-source-action="permit">Add existing permit</button></div>${data.imports.length ? `<p class="help">${data.imports.length} source record${data.imports.length === 1 ? "" : "s"} retained with this draft.</p><button class="btn quiet" data-source-action="sources">View imported sources</button>` : ""}${data.people.length || data.funding.length ? '<button class="btn quiet" data-source-action="details">Edit people & funding</button>' : ""}</section>`;
    },
  };
}
