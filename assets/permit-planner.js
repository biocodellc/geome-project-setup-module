import { emptyPermitPlan, reportingFields } from "../lib/permit-plan.js";

const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const option = (value, label, selected) =>
  `<option value="${esc(value)}"${value === selected ? " selected" : ""}>${esc(label)}</option>`;

export function createPermitPlanner({
  model,
  engine,
  getState,
  onChange,
  demo,
}) {
  let records = [],
    selectedPermit = null,
    error = "";
  const plan = () => getState().permitPlan;
  const targets = () => [
    { id: "project", level: "project", label: "Whole project" },
    ...plan().targets,
  ];
  function resetPreview() {
    records = structuredClone(
      demo.records.filter((record) =>
        plan().targets.some((target) => target.id === record.targetId),
      ),
    );
    selectedPermit = null;
    error = "";
  }
  function transaction(change) {
    try {
      const next = structuredClone(plan());
      change(next);
      engine.updatePermitPlan(getState(), next);
      records = records.filter(
        (record) =>
          record.targetId === "project" ||
          next.targets.some((target) => target.id === record.targetId),
      );
      if (selectedPermit && !next.permits.some((p) => p.id === selectedPermit))
        selectedPermit = null;
      error = "";
      onChange();
    } catch (e) {
      error = e.message;
      onChange(false);
    }
  }
  function scopes(item, kind, id) {
    return `<fieldset class="permit-scopes"><legend>Applies to — choose explicitly</legend>${targets()
      .map(
        (target) =>
          `<label><input type="checkbox" data-permit-control="coverage" data-kind="${kind}" data-id="${esc(id)}" data-target="${esc(target.id)}"${item.coverage.some((scope) => scope.targetId === target.id) ? " checked" : ""}> ${esc(target.label)} <small>(${esc(target.level)})</small></label>`,
      )
      .join(
        "",
      )}<p class="help">Coverage flows to descendant records. Narrow links add coverage; they do not override a project-wide link.</p></fieldset>`;
  }
  function fieldsTable() {
    const fields = engine
      .requirements(getState())
      .filter((field) => field.sourcePermitTypeIds.length);
    if (!fields.length)
      return '<p class="help">Select a permit requirement to see the collection fields to record.</p>';
    return `<div class="table-scroll"><table class="permit-table"><caption>Collection fields to prepare before collecting</caption><thead><tr><th>Field</th><th>Record level</th><th>Type</th><th>Required</th><th>Source requirements</th></tr></thead><tbody>${fields.map((field) => `<tr><td>${esc(field.field)}</td><td>${esc(field.recordLevel)}</td><td>${esc(field.dataType)}</td><td>${field.required ? "Yes" : "No"}</td><td>${field.sourcePermitTypeIds.map((id) => esc(plan().catalog.types.find((type) => type.id === id)?.label || id)).join("; ")}</td></tr>`).join("")}</tbody></table></div>`;
  }
  function permitCard(permit) {
    const schema =
      model.schema.properties.permitPlan.properties.permits.items.properties;
    const field = (name, label, type = "text") =>
      `<label class="field-label">${label}<input class="input" type="${type}" data-permit-control="field" data-id="${esc(permit.id)}" data-field="${name}" value="${esc(permit[name])}" maxlength="${schema[name].maxLength || 2000}"${name === "identifier" ? " required" : ""}></label>`;
    return `<details class="permit-card" open><summary>${esc(permit.identifier)} · ${esc(plan().catalog?.types.find((type) => type.id === permit.typeId)?.label || "Type not assigned")}</summary><div class="permit-card-body"><p class="help">Portable reference ID: ${esc(permit.id)}</p><label class="field-label">Permit type<select class="input" data-permit-control="field" data-id="${esc(permit.id)}" data-field="typeId">${option("", "Choose a type when known", permit.typeId)}${(plan().catalog?.types || []).map((type) => option(type.id, type.label, permit.typeId)).join("")}</select></label><div class="two-col">${field("identifier", "Permit identifier")}${field("issuer", "Issuer")}${field("holder", "Holder")}${field("url", "Document URL", "url")}${field("doi", "DOI reference (optional)")}${field("scope", "Scope notes")}${field("validFrom", "Valid from", "date")}${field("validUntil", "Valid until", "date")}</div><label class="field-label">Intended visibility<select class="input" data-permit-control="field" data-id="${esc(permit.id)}" data-field="visibility">${schema.visibility.enum.map((value) => option(value, value, permit.visibility)).join("")}</select></label>${permit.typeId ? scopes(permit, "permit", permit.id) : '<p class="help">Choose a permit profile and type before assigning coverage.</p>'}<button class="btn small-btn" data-permit-action="remove-permit" data-id="${esc(permit.id)}">Remove permit reference</button></div></details>`;
  }
  function render() {
    const catalog = plan().catalog;
    const catalogs = [...model.permitCatalogs];
    if (catalog && !catalogs.some((c) => c.id === catalog.id))
      catalogs.push(catalog);
    return `<section class="review-block" id="permit-planner"><h2>Permit planner</h2><p class="help">Identify requirements before collecting, then reference documents once and link their coverage.</p><div id="permit-error" class="inline-error" role="alert"${error ? "" : " hidden"}>${esc(error)}</div><label class="field-label" for="permit-profile">Permit planning profile</label><select class="input" id="permit-profile" data-permit-control="profile">${option("", "No permit profile", catalog?.id || "")}${catalogs.map((c) => option(c.id, c.title, catalog?.id)).join("")}</select>${
      catalog
        ? `<div class="notice${catalog.illustrative ? " warn" : ""}"><strong>${catalog.illustrative ? "Illustrative catalog — not Gump-approved requirements" : "Adopted catalog"}</strong><p>${esc(catalog.curator)} · ${esc(catalog.jurisdiction)} · version ${esc(catalog.version)}. Permit references and reviews do not grant authorization.</p></div><h3>Required permit types</h3>${catalog.types
            .map((type) => {
              const requirement = plan().requirements.find(
                (r) => r.typeId === type.id,
              );
              return `<div class="permit-type"><label class="check-line"><input type="checkbox" data-permit-control="requirement" data-id="${esc(type.id)}"${requirement ? " checked" : ""}><strong>${esc(type.label)}</strong></label><p class="help">${esc(type.description)}</p>${requirement ? scopes(requirement, "requirement", type.id) : ""}</div>`;
            })
            .join(
              "",
            )}${fieldsTable()}<h3 class="permit-heading">Project permit references</h3><p class="help">Outstanding requirements can be recorded before a permit is obtained. Add a document reference when one exists.</p>${plan().permits.map(permitCard).join("")}<div class="permit-add"><label class="field-label" for="new-permit-type">Permit type</label><select class="input" id="new-permit-type">${catalog.types.map((type) => option(type.id, type.label, "")).join("")}</select><label class="field-label" for="new-permit-identifier">Permit identifier</label><input class="input" id="new-permit-identifier" required maxlength="240" placeholder="Document number or other reference"><button class="btn small-btn" data-permit-action="add-permit">Add permit reference</button></div><details class="permit-card"><summary>Scope references — expeditions, events, organisms and samples</summary><div class="permit-card-body"><p class="help">These are portable references for linking coverage. Collection observations stay outside the configuration.</p><ul>${plan()
            .targets.map(
              (target) =>
                `<li>${esc(target.label)} · ${esc(target.level)} · ${esc(target.id)} <button class="btn quiet small-btn" data-permit-action="remove-target" data-id="${esc(target.id)}" aria-label="Remove scope ${esc(target.label)}">Remove</button></li>`,
            )
            .join(
              "",
            )}</ul><div class="two-col"><label class="field-label">Stable reference ID<input class="input" id="new-target-id" maxlength="160"></label><label class="field-label">Label<input class="input" id="new-target-label" maxlength="240"></label><label class="field-label">Record level<select class="input" id="new-target-level"><option>expedition</option><option>event</option><option>entity</option><option>sample</option></select></label><label class="field-label">Parent reference<select class="input" id="new-target-parent">${targets()
            .map((target) =>
              option(target.id, `${target.label} (${target.level})`, ""),
            )
            .join(
              "",
            )}</select></label></div><button class="btn small-btn" data-permit-action="add-target">Add scope reference</button>${!plan().targets.length ? '<button class="btn small-btn" data-permit-action="demo-targets">Add fictional Moorea scope references</button>' : ""}</div></details><button class="btn" data-action="permit-preview">Preview reporting needs</button>`
        : '<p class="help">The optional Moorea profile demonstrates permit planning and reporting fields.</p>' +
          plan().permits.map(permitCard).join("")
    }</section>`;
  }
  function renderReport() {
    if (!plan().catalog) return "";
    let preview;
    try {
      preview = engine.previewPermitReport(getState(), records, {
        permitId: selectedPermit,
      });
    } catch (e) {
      return `<section id="permit-report"><h2>Reporting preview</h2><p class="inline-error">${esc(e.message)}</p></section>`;
    }
    const fields = reportingFields(plan(), [
      ...new Set([
        ...plan().requirements.map((r) => r.typeId),
        ...plan().permits.map((p) => p.typeId),
      ]),
    ]);
    const editors = targets()
      .map((target) => {
        const applicable = fields.filter(
          (field) => field.recordLevel === target.level,
        );
        if (!applicable.length) return "";
        return `<fieldset class="preview-record"><legend>${esc(target.label)} <small>(${esc(target.level)} · ${esc(target.id)})</small></legend><div class="two-col">${applicable
          .map((field) => {
            const value = records.find((r) => r.targetId === target.id)?.values[
              field.field
            ];
            const attrs = `data-permit-control="observation" data-target="${esc(target.id)}" data-field="${esc(field.field)}" data-type="${field.dataType}"`;
            return `<label class="field-label">${esc(field.label)}${field.dataType === "boolean" ? `<select class="input" ${attrs}>${option("", "Not recorded", value === undefined ? "" : String(value))}${option("true", "Yes", String(value))}${option("false", "No", String(value))}</select>` : `<input class="input" ${attrs} type="${field.format === "date" ? "date" : field.dataType === "number" ? "number" : "text"}" value="${esc(value)}" maxlength="2000">`}</label>`;
          })
          .join("")}</div></fieldset>`;
      })
      .join("");
    return `<section class="review-block" id="permit-report"><h2>Reporting preview</h2><div class="notice warn"><strong>Fictional collections · demonstration only</strong><p>Edit these example observations to see reporting needs. Changes reset on import, profile change, or reload and are excluded from configuration exports. This is not an official report or a compliance determination.</p></div>${fieldsTable()}<details class="permit-card" open><summary>Edit fictional collection records</summary><div class="permit-card-body">${editors || "<p>Add scope references in the Permit planner to preview collections.</p>"}<p class="help">SCUBA use is recorded separately for each event. Project-level intent does not fill these values. Multiple samples from one organism remain separate rows; no collection totals are inferred.</p><button class="btn small-btn" data-permit-action="reset-preview">Reset fictional observations</button></div></details><label class="field-label">Report view<select class="input" data-permit-control="report-filter">${option("", "All samples — find gaps", selectedPermit || "")}${plan()
      .permits.map((permit) =>
        option(permit.id, permit.identifier, selectedPermit),
      )
      .join(
        "",
      )}</select></label><div id="permit-report-results">${reportResults(preview)}</div></section>`;
  }
  function reportResults(preview) {
    return `${preview.issues.map((issue) => `<p class="notice warn">${esc(issue.message)}</p>`).join("")}<div class="table-scroll"><table class="permit-table"><caption>Sample reporting rows and review issues</caption><thead><tr><th>Sample / organism reference</th>${preview.columns.map((field) => `<th>${esc(field.label)}</th>`).join("")}<th>Permit coverage</th><th>Review issues</th></tr></thead><tbody>${preview.rows
      .map(
        (row) =>
          `<tr data-report-sample="${esc(row.sampleId)}"><td>${esc(row.sampleId)}<br><small>${esc(row.entityId)}</small></td>${preview.columns
            .map((field) => {
              const value = row.values[`${field.recordLevel}.${field.field}`];
              return `<td data-report-field="${esc(field.field)}">${value === true ? "Yes" : value === false ? "No" : value == null ? "—" : esc(value)}</td>`;
            })
            .join(
              "",
            )}<td>${row.coverage.map((link) => `${esc(plan().permits.find((p) => p.id === link.permitId).identifier)} (${link.inherited ? "via" : "direct"} ${esc(link.via.level)}: ${esc(link.via.targetId)})`).join("<br>") || "No linked permits"}</td><td>${row.issues.map((issue) => esc(issue.message)).join("<br>") || "No missing values or date mismatches detected"}</td></tr>`,
      )
      .join(
        "",
      )}</tbody></table></div>${!preview.rows.length ? '<p class="help">No sample rows for this selection.</p>' : ""}`;
  }
  function refreshReport() {
    const el = document.getElementById("permit-report-results");
    if (el)
      el.innerHTML = reportResults(
        engine.previewPermitReport(getState(), records, {
          permitId: selectedPermit,
        }),
      );
  }
  document.addEventListener("change", (event) => {
    const el = event.target,
      control = el.dataset.permitControl;
    if (!control) return;
    if (control === "profile") {
      if (plan().catalog?.id === el.value) return;
      if (
        (plan().permits.some((p) => p.typeId) || plan().requirements.length) &&
        !confirm("Replace this permit plan? Export JSON first to retain it.")
      ) {
        el.value = plan().catalog?.id || "";
        return;
      }
      transaction((next) => {
        const unclassified = next.permits.filter((p) => !p.typeId);
        Object.assign(next, emptyPermitPlan());
        next.permits = unclassified;
        next.catalog = structuredClone(
          model.permitCatalogs.find((c) => c.id === el.value) || null,
        );
      });
      resetPreview();
      onChange();
    } else if (control === "requirement") {
      transaction((next) => {
        if (el.checked)
          next.requirements.push({ typeId: el.dataset.id, coverage: [] });
        else
          next.requirements = next.requirements.filter(
            (r) => r.typeId !== el.dataset.id,
          );
      });
    } else if (control === "coverage") {
      transaction((next) => {
        const item =
          el.dataset.kind === "permit"
            ? next.permits.find((p) => p.id === el.dataset.id)
            : next.requirements.find((r) => r.typeId === el.dataset.id);
        const target = targets().find((t) => t.id === el.dataset.target);
        item.coverage = item.coverage.filter((s) => s.targetId !== target.id);
        if (el.checked)
          item.coverage.push({ level: target.level, targetId: target.id });
      });
    } else if (control === "field")
      transaction((next) => {
        next.permits.find((p) => p.id === el.dataset.id)[el.dataset.field] =
          el.value;
      });
    else if (control === "report-filter") {
      selectedPermit = el.value || null;
      refreshReport();
    } else if (control === "observation") {
      let record = records.find((r) => r.targetId === el.dataset.target);
      if (!record) {
        record = { targetId: el.dataset.target, values: {} };
        records.push(record);
      }
      if (el.value === "") delete record.values[el.dataset.field];
      else
        record.values[el.dataset.field] =
          el.dataset.type === "boolean"
            ? el.value === "true"
            : el.dataset.type === "number"
              ? Number(el.value)
              : el.value;
      refreshReport();
    }
  });
  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-permit-action]");
    if (!button) return;
    const action = button.dataset.permitAction;
    if (action === "reset-preview") {
      resetPreview();
      onChange(false);
      return;
    }
    transaction((next) => {
      if (action === "add-permit") {
        const input = document.getElementById("new-permit-identifier");
        if (!input.value.trim())
          throw new Error(
            "Enter a permit identifier before adding its reference.",
          );
        next.permits.push(
          engine.newPermit(
            document.getElementById("new-permit-type").value,
            input.value.trim(),
          ),
        );
      } else if (action === "remove-permit")
        next.permits = next.permits.filter((p) => p.id !== button.dataset.id);
      else if (action === "add-target") {
        const parentId = document.getElementById("new-target-parent").value;
        next.targets.push({
          id: document.getElementById("new-target-id").value.trim(),
          label: document.getElementById("new-target-label").value.trim(),
          level: document.getElementById("new-target-level").value,
          parentId: parentId === "project" ? null : parentId,
        });
      } else if (action === "remove-target")
        next.targets = next.targets.filter((t) => t.id !== button.dataset.id);
      else if (action === "demo-targets")
        next.targets = structuredClone(demo.targets);
    });
    if (action === "demo-targets") {
      resetPreview();
      onChange(false);
    }
  });
  function loadExample() {
    const catalog = model.permitCatalogs.find(
      (c) => c.id === "gump-moorea-demo",
    );
    const next = {
      catalog: structuredClone(catalog),
      targets: structuredClone(demo.targets),
      requirements: catalog.types.map((type) => ({
        typeId: type.id,
        coverage: [{ level: "project", targetId: "project" }],
      })),
      permits: [],
    };
    for (const [id, typeId, identifier, coverage] of [
      [
        "demo-abs",
        "gump-cpc-abs",
        "DEMO-CPC-001",
        [{ level: "project", targetId: "project" }],
      ],
      [
        "demo-fishing",
        "gump-fishing",
        "DEMO-FISH-001",
        [{ level: "expedition", targetId: "lagoon" }],
      ],
    ])
      next.permits.push({
        ...engine.newPermit(typeId, identifier),
        id,
        issuer: "Fictional issuer for demonstration",
        holder: "Fictional BioCode team",
        validFrom: "2027-03-01",
        validUntil: "2027-03-14",
        scope: "Fictional example, not an issued authorization",
        coverage,
      });
    engine.updatePermitPlan(getState(), next);
    resetPreview();
  }
  return { render, renderReport, resetPreview, loadExample };
}
