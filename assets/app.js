import { createProjectEngine } from "../lib/project-engine.js";

export function startApp(MODEL, EXAMPLES) {
  const engine = createProjectEngine(MODEL);
  const STORAGE_KEY = "geome.proposed-project-configuration.v1";
  const THEME_KEY = "geome.proposed-project-configuration.theme";
  const STATUSES = [
    "Needs information",
    "Pending review",
    "Evidence supplied",
    "Reviewed",
    "Not applicable",
  ];
  const PATHS = {
    arrow: "M5 12h14m-5-5 5 5-5 5",
    back: "M19 12H5m5-5-5 5 5 5",
    chevron: "m9 5 7 7-7 7",
    check: "m5 12 4 4L19 6",
    leaf: "M20 4c-10-2-17 5-13 11s15 1 13-11ZM4 20 15 9",
    archive: "M4 8h16v12H4zM3 4h18v4H3zM9 12h6",
    eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
    layers: "m12 3 10 5-10 5L2 8l10-5ZM2 12l10 5 10-5M2 16l10 5 10-5",
    compass: "M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0ZM16 8l-3 5-5 3 3-5 5-3Z",
    shield: "M12 3 3 7v5c0 5 9 9 9 9s9-4 9-9V7l-9-4Zm-4 9 3 3 5-6",
    globe:
      "M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0ZM2 12h20M12 2c-6 6-6 14 0 20M12 2c6 6 6 14 0 20",
    code: "m8 6-6 6 6 6m8-12 6 6-6 6m-3-15-2 18",
    download: "M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5",
    upload: "M12 16V4m-5 5 5-5 5 5M4 16v5h16v-5",
    moon: "M21 13A9 9 0 0 1 11 3 9 9 0 1 0 21 13Z",
    sun: "M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1",
    save: "M4 3h13l4 4v14H3V3h1ZM7 3v6h9V3M7 21v-8h10v8",
    spark: "m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z",
    pin: "M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 0 1 14 0ZM14 10a2 2 0 1 1-4 0 2 2 0 0 1 4 0",
    plus: "M12 5v14M5 12h14",
    table: "M3 4h18v16H3zM3 10h18M9 4v16",
    file: "M14 2H4v20h16V8l-6-6Zm0 0v6h6M8 13h8M8 17h6",
  };
  const icon = (name) =>
    '<svg class="icon" aria-hidden="true" viewBox="0 0 24 24"><path d="' +
    (PATHS[name] || PATHS.file) +
    '"/></svg>';
  const esc = (x) =>
    String(x ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  const safeURL = (s) => {
    try {
      const u = new URL(s);
      return ["http:", "https:"].includes(u.protocol) ? u.href : "";
    } catch {
      return "";
    }
  };
  const now = () => new Date().toISOString();
  const uid = () =>
    globalThis.crypto?.randomUUID?.() ||
    "loc-" +
      Date.now().toString(36) +
      "-" +
      Math.random().toString(36).slice(2, 8);
  const names = new Intl.DisplayNames(["en"], { type: "region" });
  const countryName = (code) =>
    code ? names.of(code) || code : "Country not yet selected";
  const COUNTRIES = MODEL.countryCodes
    .map((code) => ({ code, name: countryName(code) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const countryOptions = (value, filter = "") =>
    '<option value="">Choose a country or territory…</option>' +
    COUNTRIES.filter(
      (c) =>
        c.code === value ||
        (c.name + " " + c.code)
          .toLowerCase()
          .includes(filter.toLowerCase().trim()),
    )
      .map(
        (c) =>
          '<option value="' +
          c.code +
          '"' +
          (value === c.code ? " selected" : "") +
          ">" +
          esc(c.name) +
          "</option>",
      )
      .join("");
  const countrySearch = (id) =>
    '<input class="input" type="search" style="margin-bottom:7px" data-country-filter="' +
    id +
    '" placeholder="Search countries…" aria-label="Filter country choices" autocomplete="off">';
  const newLocation = engine.newLocation;
  const fresh = engine.createDraft;
  let state = fresh(),
    stage = 0,
    storageAvailable = true,
    storageIssue = "",
    lastError = "",
    openGuardrails = new Set(),
    dialogTab = "configuration",
    saveTimer,
    toastTimer;
  const present = (value) =>
    value !== undefined &&
    value !== null &&
    value !== "" &&
    (!Array.isArray(value) || value.length > 0);
  const visibleQuestions = () => engine.visibleQuestions(state);
  const pruneAnswers = () => engine.pruneAnswers(state);
  const contextLabel = engine.contextLabel;
  const profileFor = engine.profileFor;
  const generateGuardrails = () => engine.guardrails(state);
  const requirements = () => engine.requirements(state);
  const configuration = () => engine.exportConfiguration(state);
  function updateSaveLabel() {
    document.getElementById("save-state").innerHTML =
      icon(storageAvailable ? "save" : "download") +
      esc(
        storageAvailable
          ? state.status === "saved"
            ? "Configuration saved locally"
            : "Draft saved in this browser"
          : "Session only · export to keep",
      );
  }
  function persist() {
    clearTimeout(saveTimer);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(configuration()));
      storageAvailable = true;
      storageIssue = "";
    } catch {
      storageAvailable = false;
      storageIssue =
        "Browser storage is unavailable or full. Export JSON to keep your work.";
    }
    updateSaveLabel();
  }
  function changed() {
    state.updatedAt = now();
    state.status = "draft";
    state.savedAt = "";
    const active = new Set(generateGuardrails().map((g) => g.id));
    for (const [id, record] of Object.entries(state.reviewRecords))
      if (!active.has(id))
        state.reviewRecords[id] = {
          ...record,
          status: "Pending review",
          stale: true,
          fingerprint: "",
        };
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, 150);
    renderSummary();
    renderSteps();
    document.getElementById("sidebar-project").textContent =
      state.answers.projectName || "Untitled project";
    updateSaveLabel();
  }
  const checkImport = engine.assertValid;
  function adopt(doc, isImport = false) {
    state = engine.importConfiguration(doc, { asImport: isImport });
    stage = 0;
    openGuardrails.clear();
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        adopt(JSON.parse(raw));
      } catch {
        storageIssue =
          "An incompatible saved draft was found. Import a valid JSON file or start a new configuration.";
      }
    }
    const theme = localStorage.getItem(THEME_KEY);
    if (
      theme === "dark" ||
      (!theme && matchMedia("(prefers-color-scheme: dark)").matches)
    )
      document.documentElement.dataset.theme = "dark";
  } catch {
    storageAvailable = false;
    storageIssue =
      "Browser storage is unavailable. Export JSON to keep this session.";
  }
  function labelFor(q, value) {
    if (Array.isArray(value))
      return value
        .map((v) => q.options?.find((o) => o.value === v)?.label || v)
        .join(", ");
    if (q.type === "country")
      return value ? countryName(value) : "Not answered";
    if (q.type === "checkbox") return value ? "Acknowledged / yes" : "Not yet";
    return (
      q.options?.find((o) => o.value === value)?.label ||
      value ||
      "Not answered"
    );
  }
  function requiredDone(q) {
    if (q.type === "locations")
      return (
        state.locations.length > 0 && state.locations.every((l) => !!l.country)
      );
    return present(state.answers[q.id]);
  }
  function renderSteps() {
    document.getElementById("steps").innerHTML = MODEL.stages
      .map((s, i) => {
        const qs = visibleQuestions().filter(
          (q) => q.stage === s.id && q.required,
        );
        const complete =
          !!state.answers.intent && qs.length > 0 && qs.every(requiredDone);
        return (
          '<button class="step' +
          (i === stage ? " active" : "") +
          (complete ? " complete" : "") +
          '" data-stage="' +
          i +
          '"' +
          (i === stage ? ' aria-current="step"' : "") +
          '><span class="step-number">' +
          (complete && i !== stage ? "✓" : i + 1) +
          "</span><span>" +
          esc(s.name) +
          "</span></button>"
        );
      })
      .join("");
  }
  function sourceLinks(ids, country) {
    const links = ids.map((id) => MODEL.sources[id]).filter(Boolean);
    let text = links
      .map(
        (s) =>
          '<li><a href="' +
          esc(safeURL(s.url)) +
          '" target="_blank" rel="noopener noreferrer">' +
          esc(s.title) +
          " ↗</a></li>",
      )
      .join("");
    if (country)
      text +=
        '<li><a href="https://absch.cbd.int/en/countries/' +
        encodeURIComponent(country) +
        '" target="_blank" rel="noopener noreferrer">' +
        esc(countryName(country)) +
        " · ABS country profile ↗</a></li>";
    return text ? '<ul class="source-links">' + text + "</ul>" : "";
  }
  function renderLocation(location, index) {
    const base = "location-" + location.id;
    const profile = profileFor(location);
    const input = (key, label, placeholder = "") =>
      '<div><label for="' +
      base +
      "-" +
      key +
      '">' +
      label +
      '</label><input class="input" id="' +
      base +
      "-" +
      key +
      '" data-location="' +
      esc(location.id) +
      '" data-field="' +
      key +
      '" value="' +
      esc(location[key]) +
      '" maxlength="' +
      (key === "region" ? 160 : 240) +
      '" placeholder="' +
      esc(placeholder) +
      '"></div>';
    const select = (key, label, options) =>
      '<div><label for="' +
      base +
      "-" +
      key +
      '">' +
      label +
      '</label><select class="input" id="' +
      base +
      "-" +
      key +
      '" data-location="' +
      esc(location.id) +
      '" data-field="' +
      key +
      '">' +
      options
        .map(
          ([v, t]) =>
            '<option value="' +
            v +
            '"' +
            (location[key] === v ? " selected" : "") +
            ">" +
            t +
            "</option>",
        )
        .join("") +
      "</select></div>";
    return (
      '<div class="location-card"><div class="location-header"><strong>' +
      icon("pin") +
      " ORIGIN / SITE " +
      (index + 1) +
      '</strong><button class="btn quiet small-btn" data-remove-location="' +
      esc(location.id) +
      '" aria-label="Remove site ' +
      (index + 1) +
      '">Remove</button></div><label for="' +
      base +
      '-country">Country or territory</label>' +
      countrySearch(base + "-country") +
      '<select class="input" id="' +
      base +
      '-country" data-location="' +
      esc(location.id) +
      '" data-field="country">' +
      countryOptions(location.country) +
      '</select><div class="two-col">' +
      input("region", "State / province / region", "e.g. Hawaiʻi, Queensland") +
      input(
        "locality",
        "Locality or collection source",
        "Site, island, institution…",
      ) +
      '</div><div class="two-col">' +
      select("protectedArea", "Is this a protected area?", [
        ["unsure", "Not sure yet"],
        ["yes", "Yes"],
        ["no", "No"],
      ]) +
      select("accessType", "Who manages access?", [
        ["unsure", "Not sure yet"],
        ["public", "Public agency / land manager"],
        ["private", "Private landowner"],
        ["community", "Indigenous / community authority"],
      ]) +
      "</div>" +
      (location.protectedArea !== "no"
        ? input(
            "protectedName",
            "Protected area name (if known)",
            "Reserve, park, conservation area…",
          )
        : "") +
      '<div class="coverage"><strong>' +
      (!location.country
        ? "Country guidance"
        : profile
          ? "Researched example"
          : "General framework") +
      "</strong><br>" +
      esc(
        !location.country
          ? "Select a country to see the guidance available."
          : profile
            ? profile.note
            : "Detailed national and local rules are not embedded for this country. Use its ABS profile and confirm the relevant local authorities.",
      ) +
      (location.country
        ? '<br><a href="https://absch.cbd.int/en/countries/' +
          location.country +
          '" target="_blank" rel="noopener noreferrer">View official ABS country profile ↗</a>'
        : "") +
      "</div></div>"
    );
  }
  function renderTemplate(q) {
    const selected = MODEL.templates.find((t) => t.id === state.answers[q.id]);
    let text =
      '<div class="template-list">' +
      MODEL.templates
        .map(
          (t) =>
            '<label class="template-option"><input type="radio" name="' +
            q.id +
            '" id="' +
            q.id +
            "-" +
            t.id +
            '" data-question="' +
            q.id +
            '" value="' +
            t.id +
            '"' +
            (t === selected ? " checked" : "") +
            '><span class="template-copy"><span class="template-title"><strong>' +
            esc(t.name) +
            '</strong><span class="tag' +
            (t.id === "repadapt" ? " warn" : "") +
            '">' +
            esc(t.tag) +
            "</span></span><p>" +
            esc(t.description) +
            "</p></span></label>",
        )
        .join("") +
      "</div>";
    if (selected) {
      const t = selected;
      let cols = t.columns;
      if (t.id === "geome-flat" && state.answers.intent === "observations")
        cols = [
          "eventID",
          "observationID",
          "eventDate",
          "country",
          "scientificName",
          "mediaReference",
        ];
      text +=
        '<div class="preview"><div class="preview-title">' +
        icon("table") +
        " " +
        esc(t.name) +
        " · illustrative preview</div>" +
        (t.id === "biocode"
          ? '<div class="sheet-tabs">' +
            t.entities.map((x) => "<span>" + x + "</span>").join("") +
            "</div>"
          : "") +
        '<div class="table-scroll"><table><thead><tr>' +
        cols.map((c) => "<th>" + esc(c) + "</th>").join("") +
        "</tr></thead><tbody><tr>" +
        cols
          .map(
            (c, i) =>
              "<td>" +
              ({
                eventID: "EVT-001",
                entityID: "ENT-001",
                sampleID: "SMP-001",
                observationID: "OBS-001",
              }[c] || "—") +
              "</td>",
          )
          .join("") +
        '</tr></tbody></table></div><p class="preview-note">' +
        esc(t.note) +
        "</p></div>";
    }
    return text;
  }
  function renderQuestion(q) {
    const value = state.answers[q.id],
      id = "q-" + q.id,
      help = q.help
        ? '<p class="help" id="help-' + q.id + '">' + esc(q.help) + "</p>"
        : "",
      described = q.help ? ' aria-describedby="help-' + q.id + '"' : "";
    let body = "";
    const label =
      '<label class="field-label" for="' +
      id +
      '">' +
      esc(q.label) +
      "</label>";
    if (q.type === "locations")
      return (
        '<section class="question"><h3>' +
        esc(q.label) +
        "</h3>" +
        help +
        state.locations.map(renderLocation).join("") +
        '<button class="btn small-btn" data-action="add-location"' +
        (state.locations.length >= 30 ? " disabled" : "") +
        ">" +
        icon("plus") +
        " Add another origin / site</button></section>"
      );
    if (["choice", "multi", "template"].includes(q.type)) {
      if (q.type === "template") body = renderTemplate(q);
      else {
        const fancy = q.options.some((o) => o.detail);
        body =
          '<div class="' +
          (fancy ? "choices" : "compact-choices") +
          '">' +
          q.options
            .map((o) => {
              const checked =
                q.type === "multi"
                  ? Array.isArray(value) && value.includes(o.value)
                  : value === o.value;
              const inp =
                '<input id="' +
                q.id +
                "-" +
                o.value +
                '" type="' +
                (q.type === "multi" ? "checkbox" : "radio") +
                '" name="' +
                q.id +
                '" data-question="' +
                q.id +
                '" value="' +
                esc(o.value) +
                '"' +
                (checked ? " checked" : "") +
                ">";
              return fancy
                ? '<label class="choice">' +
                    inp +
                    '<span class="choice-icon">' +
                    icon(o.icon) +
                    '</span><span class="choice-text"><strong>' +
                    esc(o.label) +
                    "</strong><p>" +
                    esc(o.detail) +
                    "</p></span></label>"
                : '<label class="compact-choice">' +
                    inp +
                    esc(o.label) +
                    "</label>";
            })
            .join("") +
          "</div>";
      }
      return (
        '<section class="question"><fieldset' +
        described +
        "><legend>" +
        esc(q.label) +
        "</legend>" +
        help +
        body +
        "</fieldset></section>"
      );
    }
    if (q.type === "select" || q.type === "country")
      body =
        (q.type === "country" ? countrySearch(id) : "") +
        '<select class="input" id="' +
        id +
        '" data-question="' +
        q.id +
        '"' +
        described +
        ">" +
        (q.type === "country"
          ? countryOptions(value)
          : '<option value="">Choose an answer…</option>' +
            q.options
              .map(
                (o) =>
                  '<option value="' +
                  esc(o.value) +
                  '"' +
                  (value === o.value ? " selected" : "") +
                  ">" +
                  esc(o.label) +
                  "</option>",
              )
              .join("")) +
        "</select>";
    else if (q.type === "textarea")
      body =
        '<textarea class="input" id="' +
        id +
        '" data-question="' +
        q.id +
        '" maxlength="' +
        (q.maxLength || 1200) +
        '" placeholder="' +
        esc(q.placeholder) +
        '"' +
        described +
        ">" +
        esc(value) +
        "</textarea>";
    else if (q.type === "checkbox")
      return (
        '<section class="question"><label class="check-line"><input type="checkbox" id="' +
        id +
        '" data-question="' +
        q.id +
        '"' +
        (value ? " checked" : "") +
        ">" +
        esc(q.labelText || q.label) +
        "</label>" +
        help +
        "</section>"
      );
    else
      body =
        '<input class="input" type="' +
        (q.type === "date" ? "date" : "text") +
        '" id="' +
        id +
        '" data-question="' +
        q.id +
        '" value="' +
        esc(value) +
        '" maxlength="' +
        (q.maxLength || 1200) +
        '" placeholder="' +
        esc(q.placeholder) +
        '"' +
        described +
        ">";
    return '<section class="question">' + label + help + body + "</section>";
  }
  function reviewCard(g) {
    const reviewed = ["Reviewed", "Not applicable"].includes(g.status);
    const id = esc(g.id);
    return (
      '<details class="guardrail" data-guardrail="' +
      id +
      '"' +
      (openGuardrails.has(g.id) ? " open" : "") +
      "><summary>" +
      icon("chevron") +
      '<span class="guardrail-name"><strong>' +
      esc(g.title) +
      "</strong><small>" +
      esc(g.category) +
      " · " +
      esc(g.jurisdiction) +
      '</small></span><span class="tag ' +
      (reviewed ? "done" : "warn") +
      '">' +
      esc(g.status) +
      '</span></summary><div class="guardrail-body">' +
      (g.stale
        ? '<div class="notice warn">An answer affecting this item changed. Review the updated context again.</div>'
        : "") +
      "<p><strong>Why this appeared</strong><br>" +
      esc(g.rationale) +
      "</p><p><strong>Suggested next action</strong><br>" +
      esc(g.action) +
      "</p>" +
      (g.localNote
        ? "<p><strong>Country guidance</strong><br>" + esc(g.localNote) + "</p>"
        : "") +
      '<span class="tag">' +
      esc(g.coverage) +
      "</span>" +
      sourceLinks(g.sourceIds, g.country) +
      '<p class="small muted">Guidance snapshot: 5 October 2026. Confirm current conditions with the relevant authority.</p><div class="two-col"><div><label class="field-label" for="review-status-' +
      id +
      '">Preparation status</label><select class="input" id="review-status-' +
      id +
      '" data-review="' +
      id +
      '" data-field="status">' +
      STATUSES.map(
        (s) =>
          "<option" +
          (g.status === s ? " selected" : "") +
          ">" +
          s +
          "</option>",
      ).join("") +
      '</select></div><div><label class="field-label" for="review-owner-' +
      id +
      '">Responsible person / reviewer</label><input class="input" id="review-owner-' +
      id +
      '" data-review="' +
      id +
      '" data-field="owner" value="' +
      esc(g.owner) +
      '" maxlength="240" placeholder="Name or institution"></div></div><label class="field-label" for="review-evidence-' +
      id +
      '">Evidence link or reference</label><input class="input" id="review-evidence-' +
      id +
      '" data-review="' +
      id +
      '" data-field="evidence" value="' +
      esc(g.evidence) +
      '" maxlength="1000" placeholder="Permit number, agreement ID, or document URL">' +
      (safeURL(g.evidence)
        ? '<a href="' +
          esc(safeURL(g.evidence)) +
          '" target="_blank" rel="noopener noreferrer" class="small">Open evidence link ↗</a>'
        : "") +
      '<label class="field-label" for="review-note-' +
      id +
      '">Review notes / reason if not applicable</label><textarea class="input" id="review-note-' +
      id +
      '" data-review="' +
      id +
      '" data-field="note" maxlength="2000" placeholder="Record the decision and its basis.">' +
      esc(g.note) +
      '</textarea><p class="footnote">Reviewed records a project review, not an authority’s approval. References stay in this browser and your exported JSON.</p></div></details>'
    );
  }
  function renderReview() {
    const guards = generateGuardrails(),
      open = guards.filter(
        (g) => !["Reviewed", "Not applicable"].includes(g.status),
      );
    return (
      '<div class="section-eyebrow">Step 06 · Review & save</div><div class="review-title"><h2>' +
      esc(state.answers.projectName || "Your proposed configuration") +
      "</h2>" +
      icon("file") +
      '</div><p class="panel-lede">Bring your answers, data formats, and preparation tasks together. You can save while questions remain open.</p>' +
      errorMarkup() +
      '<div class="review-stat"><span class="tag accent">' +
      state.locations.filter((l) => l.country).length +
      ' study origins / sites</span><span class="tag warn">' +
      open.length +
      ' items to follow up</span><span class="tag">' +
      guards.length +
      " guardrails</span></div>" +
      MODEL.stages
        .filter((s) => !["review"].includes(s.id))
        .map(
          (s, i) =>
            '<section class="review-block"><h3>' +
            esc(s.name) +
            '<button class="btn quiet small-btn" data-stage="' +
            i +
            '">Edit</button></h3><dl class="review-answers">' +
            visibleQuestions()
              .filter((q) => q.stage === s.id)
              .map(
                (q) =>
                  "<div><dt>" +
                  esc(q.label) +
                  "</dt><dd>" +
                  esc(
                    q.type === "locations"
                      ? state.locations.map(contextLabel).join("; ") ||
                          "Not yet provided"
                      : labelFor(q, state.answers[q.id]),
                  ) +
                  "</dd></div>",
              )
              .join("") +
            "</dl></section>",
        )
        .join("") +
      '<section class="review-block"><h3>Proposed metadata fields</h3><div class="requirements">' +
      requirements()
        .map(
          (r) =>
            '<span title="' + esc(r.level) + '">' + esc(r.field) + "</span>",
        )
        .join("") +
      '</div><p class="requirement-copy">Illustrative project recommendations. These do not change GEOME core requirements or define an authoritative format mapping.</p></section><section class="review-block" id="guardrail-list"><h3>Preparation guardrails <span class="tag">' +
      guards.length +
      '</span></h3><p class="help">Open an item to assign a reviewer, record evidence, or explain why it does not apply.</p>' +
      guards.map(reviewCard).join("") +
      (!guards.length
        ? '<div class="notice">Start with the research questions to generate your checklist.</div>'
        : "") +
      '</section><div class="notice"><strong>A preparation record</strong><p>Saving this configuration does not grant collection, access, transfer, or diving authorization.</p></div><div class="bottom-actions"><button class="btn primary" data-action="save-config">' +
      icon("save") +
      ' Save configuration</button><button class="btn" data-action="export">' +
      icon("download") +
      ' Export JSON</button><button class="btn quiet" data-action="technical">' +
      icon("code") +
      " View configuration</button></div>"
    );
  }
  const errorMarkup = () =>
    lastError
      ? '<div class="inline-error" role="alert">' + esc(lastError) + "</div>"
      : "";
  function renderSummary() {
    const a = state.answers,
      guards = generateGuardrails(),
      pending = guards.filter(
        (g) => !["Reviewed", "Not applicable"].includes(g.status),
      );
    const intent = MODEL.questions
      .find((q) => q.id === "intent")
      .options.find((o) => o.value === a.intent);
    const countryLabels = [
      ...new Set(
        state.locations
          .filter((l) => l.country)
          .map((l) => countryName(l.country)),
      ),
    ];
    document.getElementById("summary").innerHTML =
      '<section class="summary-card"><div class="summary-header">' +
      icon("compass") +
      "<h2>Your project, taking shape</h2></div>" +
      (intent
        ? '<dl class="summary-dl"><div><dt>Research approach</dt><dd>' +
          esc(intent.label) +
          "</dd></div><div><dt>Study area</dt><dd>" +
          esc(countryLabels.join(", ") || "Still to be defined") +
          "</dd></div><div><dt>Environment</dt><dd>" +
          esc(
            labelFor(
              MODEL.questions.find((q) => q.id === "environment"),
              a.environment,
            ),
          ) +
          "</dd></div>" +
          (a.inputTemplate || a.outputTemplate
            ? "<div><dt>Data flow</dt><dd>" +
              esc(
                MODEL.templates.find((t) => t.id === a.inputTemplate)?.name ||
                  "Input undecided",
              ) +
              " → " +
              esc(
                MODEL.templates.find((t) => t.id === a.outputTemplate)?.name ||
                  "Output undecided",
              ) +
              "</dd></div>"
            : "") +
          "</dl>"
        : '<div class="empty-summary">' +
          icon("leaf") +
          "Your answers will build a project configuration here.</div>") +
      '</section><section class="summary-card"><div class="summary-header">' +
      icon("shield") +
      "<h2>Suggested guardrails</h2></div>" +
      (guards.length
        ? '<div class="guardrail-count"><b>' +
          pending.length +
          "</b><span>items need follow-up</span></div>" +
          pending
            .slice(0, 3)
            .map(
              (g) =>
                '<div class="mini-guardrail"><span class="dot"></span><span>' +
                esc(g.title) +
                "<small>" +
                esc(g.jurisdiction) +
                "</small></span></div>",
            )
            .join("") +
          '<button class="summary-link" data-action="guardrails">Review all ' +
          guards.length +
          " guardrails →</button>"
        : '<p class="summary-sub">Relevant access, permit, and data questions will appear as you describe the study.</p>') +
      '</section><div class="summary-footer"><p><strong>Built around your answers.</strong><br>Guidance combines a global framework with researched country examples. Each task explains its trigger and sources.</p><button class="summary-link" data-action="sources">Explore the guidance sources ↗</button><p style="margin-top:12px">' +
      (storageIssue
        ? esc(storageIssue)
        : "Saved on this device. Export JSON to share your configuration across compatible platforms.") +
      "</p></div>";
  }
  function renderPage(focusId) {
    renderSteps();
    const s = MODEL.stages[stage];
    document.getElementById("sidebar-project").textContent =
      state.answers.projectName || "Untitled project";
    document.getElementById("stage-label").textContent =
      "STEP " + String(stage + 1).padStart(2, "0") + " OF 06 · " + s.name;
    document.getElementById("progress-fill").style.width =
      ((stage + 1) / 6) * 100 + "%";
    document
      .getElementById("progress")
      .setAttribute("aria-valuenow", stage + 1);
    let panel;
    if (stage === 5) panel = renderReview();
    else {
      const qs = visibleQuestions().filter((q) => q.stage === s.id);
      const lead = {
        intent:
          "Tell us what you plan to do. Your choices shape the questions and guidance that follow.",
        places:
          "Separate the source of your material from the places where it will be studied.",
        activities:
          "Methods and intended uses help identify the permissions and preparation to review.",
        access:
          "Capture what you know. Open questions become tasks for the right person to review.",
        templates:
          "Choose input and output formats independently. The previews show the proposed interaction.",
      }[s.id];
      panel =
        '<div class="section-eyebrow">' +
        esc(s.subtitle) +
        "</div>" +
        (stage === 0 ? "" : "<h2>" + esc(s.name) + "</h2>") +
        '<p class="panel-lede">' +
        lead +
        "</p>" +
        errorMarkup() +
        qs.map(renderQuestion).join("");
      if (stage === 4) {
        const recommended = ["new", "mixed", "existing"].includes(
          state.answers.intent,
        )
          ? "Biocode Format keeps related event, entity, and sample records in separate sheets. GEOME flat model is a convenient single-table starting point."
          : "GEOME flat model offers a simple starting point for observation metadata. Its preview omits sample fields for observation-only projects.";
        panel +=
          '<div class="notice">' +
          icon("spark") +
          " " +
          recommended +
          " You can choose either format.</div>";
      }
    }
    document.getElementById("panel").innerHTML = panel;
    document.getElementById("wizard-footer").innerHTML =
      '<button class="btn' +
      (stage === 0 ? " quiet" : "") +
      '" data-action="' +
      (stage === 0 ? "reset" : "back") +
      '">' +
      icon(stage === 0 ? "compass" : "back") +
      (stage === 0 ? "Start over" : "Back") +
      "</button>" +
      (stage < 5
        ? '<button class="btn primary" data-action="next">' +
          (stage === 4 ? "Review configuration" : "Continue") +
          icon("arrow") +
          "</button>"
        : '<button class="btn" data-action="export">' +
          icon("download") +
          " Export JSON</button>");
    renderSummary();
    updateSaveLabel();
    if (focusId)
      document.getElementById(focusId)?.focus({ preventScroll: true });
  }
  function toast(message) {
    const el = document.getElementById("toast");
    el.textContent = message;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (el.hidden = true), 4200);
  }
  function go(index) {
    stage = Math.min(5, Math.max(0, index));
    lastError = "";
    persist();
    renderPage();
    document.getElementById("main").focus({ preventScroll: true });
    window.scrollTo({
      top: 0,
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  }
  function checkDates() {
    const a = state.answers;
    return a.startDate && a.endDate && a.startDate > a.endDate
      ? "The end date must be on or after the start date."
      : "";
  }
  function download(name, data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      }),
      url = URL.createObjectURL(blob),
      link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function exportConfig() {
    if (checkDates()) {
      lastError = checkDates();
      stage = 1;
      renderPage();
      return;
    }
    try {
      checkImport(configuration());
    } catch (error) {
      openDialog(
        "Configuration could not be exported",
        '<p class="inline-error">' + esc(error.message) + "</p>",
      );
      return;
    }
    persist();
    const slug =
      (state.answers.projectName || "geome-project")
        .normalize("NFKD")
        .replace(/[^a-zA-Z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 80) || "geome-project";
    download(slug + "-configuration.json", configuration());
    toast("Project configuration exported as JSON.");
  }
  function saveConfig() {
    const missing = visibleQuestions().filter(
      (q) =>
        ["intent", "projectName"].includes(q.id) &&
        !present(state.answers[q.id]?.trim?.() ?? state.answers[q.id]),
    );
    if (missing.length || checkDates()) {
      lastError =
        checkDates() ||
        "Add a project name and research approach before saving a configuration. You can still export the draft.";
      renderPage();
      return;
    }
    state.status = "saved";
    state.savedAt = now();
    state.updatedAt = state.savedAt;
    persist();
    lastError = "";
    renderPage();
    toast(
      storageAvailable
        ? "Configuration saved in this browser. Export JSON to share it."
        : "Browser storage is unavailable. Export JSON to keep this configuration.",
    );
  }
  function openDialog(title, body) {
    document.getElementById("dialog-title").textContent = title;
    document.getElementById("dialog-body").innerHTML = body;
    document.getElementById("dialog").showModal();
  }
  function technical(tab = "configuration") {
    dialogTab = tab;
    const tabs = [
      ["configuration", "Project configuration"],
      ["questionnaire", "Questionnaire"],
      ["schema", "JSON Schema"],
      ["rules", "Rules & guidance"],
    ];
    let data =
      tab === "configuration"
        ? configuration()
        : tab === "questionnaire"
          ? {
              version: MODEL.version,
              stages: MODEL.stages,
              questions: MODEL.questions,
              templates: MODEL.templates,
            }
          : tab === "schema"
            ? MODEL.schema
            : {
                version: MODEL.version,
                conditionLanguage: MODEL.conditionLanguage,
                rules: MODEL.rules,
                profiles: MODEL.profiles,
                sources: MODEL.sources,
              };
    const body =
      '<p class="help">Exported project results use one shared JSON Schema across platforms. Download the JSON Schema tab to implement a compatible exporter or importer. Derived guardrails are recalculated from answers on import.</p><div class="dialog-tabs">' +
      tabs
        .map(
          ([id, label]) =>
            '<button class="btn small-btn" data-tech-tab="' +
            id +
            '" aria-pressed="' +
            (id === tab) +
            '">' +
            label +
            "</button>",
        )
        .join("") +
      '</div><pre tabindex="0">' +
      esc(JSON.stringify(data, null, 2)) +
      '</pre><button class="btn" data-action="download-model">' +
      icon("download") +
      " Download this JSON</button>";
    if (document.getElementById("dialog").open) {
      document.getElementById("dialog-title").textContent =
        "Inside the configuration model";
      document.getElementById("dialog-body").innerHTML = body;
    } else openDialog("Inside the configuration model", body);
  }
  function sourcesDialog() {
    openDialog(
      "Guidance sources & coverage",
      '<p class="help">Global country selection with a general review framework. Detailed examples cover Australia, New Zealand, the United States (National Parks and Hawaiʻi), Brazil, South Africa, India, and France. These snapshots were researched on 5 October 2026; they do not represent an exhaustive permit inventory.</p>' +
        Object.values(MODEL.sources)
          .map(
            (s) =>
              '<article class="source-entry"><a href="' +
              esc(safeURL(s.url)) +
              '" target="_blank" rel="noopener noreferrer">' +
              esc(s.title) +
              " ↗</a><p>" +
              esc(s.summary) +
              '</p><span class="tag">' +
              s.checkedAt +
              " · " +
              s.kind +
              "</span></article>",
          )
          .join(""),
    );
  }
  function examplesDialog() {
    openDialog(
      "Explore an example project",
      '<p class="help">Choose an illustrative scenario to explore the questions and guardrails. Example locations and project details are fictional planning data.</p><div class="example-grid">' +
        Object.entries(EXAMPLES)
          .map(
            ([id, e]) =>
              '<button class="example-btn" data-example="' +
              id +
              '">' +
              icon(
                id === "marine"
                  ? "globe"
                  : id === "existing"
                    ? "archive"
                    : "eye",
              ) +
              "<span><strong>" +
              esc(e.name) +
              "</strong><p>" +
              esc(e.desc) +
              "</p></span></button>",
          )
          .join("") +
        "</div>",
    );
  }
  function hasWork() {
    return (
      !!state.answers.intent ||
      !!state.answers.projectName ||
      state.locations.some((l) => l.country)
    );
  }
  function setExample(id) {
    if (
      hasWork() &&
      !confirm(
        "Replace this browser draft with the example? Export JSON first if you want to keep your current work.",
      )
    )
      return;
    const e = EXAMPLES[id];
    state = {
      ...fresh(),
      answers: structuredClone(e.answers),
      locations: e.locations.map((l) => ({ ...newLocation(), ...l })),
    };
    stage = 0;
    openGuardrails.clear();
    lastError = "";
    document.getElementById("dialog").close();
    persist();
    renderPage();
    toast("Example loaded. You can edit every answer.");
  }
  document.addEventListener("input", (event) => {
    const el = event.target;
    if (el.dataset.countryFilter) {
      const select = document.getElementById(el.dataset.countryFilter);
      select.innerHTML = countryOptions(select.value, el.value);
      return;
    }
    if (el.matches("input[type=radio], input[type=checkbox], select")) return;
    if (el.dataset.question) {
      state.answers[el.dataset.question] = el.value;
      lastError = "";
      changed();
    } else if (el.dataset.location) {
      const loc = state.locations.find((l) => l.id === el.dataset.location);
      if (loc) {
        loc[el.dataset.field] = el.value;
        changed();
      }
    } else if (el.dataset.review) {
      editReview(el);
    }
  });
  function editReview(el) {
    const g = generateGuardrails().find((g) => g.id === el.dataset.review);
    if (!g) return;
    const record = {
      status: g.status,
      owner: "",
      note: "",
      evidence: "",
      fingerprint: g.trigger,
      stale: false,
      ...state.reviewRecords[g.id],
    };
    if (el.dataset.field === "status") {
      const value = el.value;
      if (
        (value === "Reviewed" && !record.owner.trim()) ||
        (value === "Not applicable" && !record.note.trim()) ||
        (value === "Evidence supplied" && !record.evidence.trim())
      ) {
        el.value = record.status;
        toast(
          value === "Reviewed"
            ? "Add the reviewer before marking this reviewed."
            : value === "Not applicable"
              ? "Record a reason before marking this not applicable."
              : "Add an evidence link or reference first.",
        );
        return;
      }
      record.stale = false;
    }
    record[el.dataset.field] = el.value;
    if (
      (record.status === "Reviewed" && !record.owner.trim()) ||
      (record.status === "Not applicable" && !record.note.trim()) ||
      (record.status === "Evidence supplied" && !record.evidence.trim())
    )
      record.status = "Pending review";
    record.updatedAt = now();
    record.fingerprint = g.trigger;
    state.reviewRecords[g.id] = record;
    changed();
    if (el.dataset.field === "status") renderPage(el.id);
    else if (record.status !== g.status) {
      const detail = el.closest("details");
      const select = detail?.querySelector('select[data-field="status"]');
      if (select) select.value = record.status;
      const badge = detail?.querySelector("summary .tag");
      if (badge) {
        badge.textContent = record.status;
        badge.className = "tag warn";
      }
    }
  }
  document.addEventListener("change", (event) => {
    const el = event.target;
    if (
      el.tagName !== "SELECT" &&
      !el.matches("input[type=checkbox],input[type=radio]")
    )
      return;
    if (el.dataset.review) {
      if (el.tagName === "SELECT") editReview(el);
      return;
    }
    if (el.dataset.question) {
      const q = MODEL.questions.find((q) => q.id === el.dataset.question);
      if (q.type === "multi") {
        const values = new Set(state.answers[q.id] || []);
        if (el.checked) {
          if (el.value === "unsure") values.clear();
          else values.delete("unsure");
          values.add(el.value);
        } else values.delete(el.value);
        state.answers[q.id] = [...values];
      } else if (q.type === "checkbox") state.answers[q.id] = el.checked;
      else state.answers[q.id] = el.value;
      pruneAnswers();
      lastError = "";
      changed();
      renderPage(el.id);
    } else if (el.dataset.location) {
      const loc = state.locations.find((l) => l.id === el.dataset.location);
      if (loc) {
        loc[el.dataset.field] = el.value;
        if (el.dataset.field === "country") {
          loc.region = "";
          loc.locality = "";
          loc.protectedArea = "unsure";
          loc.protectedName = "";
          loc.accessType = "unsure";
        }
        if (el.dataset.field === "protectedArea" && el.value === "no")
          loc.protectedName = "";
        changed();
        renderPage(el.id);
      }
    }
  });
  document.addEventListener(
    "toggle",
    (event) => {
      const el = event.target;
      if (el.matches?.("details[data-guardrail]")) {
        if (el.open) openGuardrails.add(el.dataset.guardrail);
        else openGuardrails.delete(el.dataset.guardrail);
      }
    },
    true,
  );
  document.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.dataset.stage !== undefined) {
      go(Number(button.dataset.stage));
      return;
    }
    if (button.dataset.example) {
      setExample(button.dataset.example);
      return;
    }
    if (button.dataset.techTab) {
      technical(button.dataset.techTab);
      return;
    }
    if (button.dataset.removeLocation) {
      state.locations = state.locations.filter(
        (l) => l.id !== button.dataset.removeLocation,
      );
      changed();
      renderPage();
      return;
    }
    switch (button.dataset.action) {
      case "next":
        if (checkDates()) {
          lastError = checkDates();
          renderPage();
        } else go(stage + 1);
        break;
      case "back":
        go(stage - 1);
        break;
      case "reset":
        if (
          hasWork() &&
          !confirm(
            "Start a new configuration? Export JSON first if you want to keep this draft.",
          )
        )
          break;
        state = fresh();
        lastError = "";
        openGuardrails.clear();
        persist();
        go(0);
        break;
      case "add-location":
        if (state.locations.length < 30) {
          state.locations.push(newLocation());
          changed();
          renderPage();
        }
        break;
      case "save-config":
        saveConfig();
        break;
      case "export":
        exportConfig();
        break;
      case "examples":
        examplesDialog();
        break;
      case "import":
        document.getElementById("import-file").click();
        break;
      case "theme":
        document.documentElement.dataset.theme =
          document.documentElement.dataset.theme === "dark" ? "light" : "dark";
        try {
          localStorage.setItem(
            THEME_KEY,
            document.documentElement.dataset.theme,
          );
        } catch {}
        renderTheme();
        break;
      case "technical":
        technical();
        break;
      case "sources":
        sourcesDialog();
        break;
      case "guardrails":
        go(5);
        document
          .getElementById("guardrail-list")
          ?.scrollIntoView({ block: "start" });
        break;
      case "close-dialog":
        document.getElementById("dialog").close();
        break;
      case "download-model": {
        const value =
          dialogTab === "configuration"
            ? configuration()
            : dialogTab === "schema"
              ? MODEL.schema
              : dialogTab === "questionnaire"
                ? {
                    version: MODEL.version,
                    stages: MODEL.stages,
                    questions: MODEL.questions,
                    templates: MODEL.templates,
                  }
                : {
                    version: MODEL.version,
                    conditionLanguage: MODEL.conditionLanguage,
                    rules: MODEL.rules,
                    profiles: MODEL.profiles,
                    sources: MODEL.sources,
                  };
        download("geome-" + dialogTab + ".json", value);
        break;
      }
    }
  });
  document
    .getElementById("import-file")
    .addEventListener("change", async (event) => {
      const file = event.target.files[0];
      if (!file) return;
      try {
        if (file.size > 2 * 1024 * 1024)
          throw new Error("Choose a JSON configuration smaller than 2 MB.");
        const doc = checkImport(JSON.parse(await file.text()));
        if (
          hasWork() &&
          !confirm(
            "Replace this browser draft with the imported configuration?",
          )
        )
          return;
        adopt(doc, true);
        lastError = "";
        persist();
        renderPage();
        toast(
          "Configuration imported. Guardrails recalculated from its answers.",
        );
      } catch (error) {
        openDialog(
          "Configuration could not be imported",
          '<div class="inline-error" role="alert">' +
            esc(error.message) +
            '</div><p class="help">Your current draft has not been changed. Import a shared project configuration (version 2) or an earlier GEOME configuration (version 1).</p>',
        );
      } finally {
        event.target.value = "";
      }
    });
  function renderTheme() {
    const dark = document.documentElement.dataset.theme === "dark";
    const el = document.getElementById("theme-button");
    el.innerHTML = icon(dark ? "sun" : "moon");
    el.setAttribute(
      "aria-label",
      "Switch to " + (dark ? "light" : "dark") + " appearance",
    );
  }
  document.getElementById("examples-button").innerHTML =
    icon("spark") + "Try an example";
  document.getElementById("import-button").innerHTML =
    icon("upload") + '<span class="hide-mobile">Import JSON</span>';
  document
    .getElementById("import-button")
    .setAttribute("aria-label", "Import configuration JSON");
  document.getElementById("model-button").innerHTML =
    icon("code") + '<span class="hide-mobile">View model</span>';
  document
    .getElementById("model-button")
    .setAttribute("aria-label", "View JSON model");
  document.getElementById("side-note").innerHTML =
    icon("shield") +
    '<p>Good questions.<br>Better prepared research.</p><p class="small">Build a record of what needs review, who will review it, and the evidence behind it.</p><button class="summary-link" data-action="sources">Guidance & sources ↗</button>';
  window.addEventListener("pagehide", () => {
    if (saveTimer) persist();
  });
  renderTheme();
  renderPage();

  return {
    configuration,
    importConfiguration: (doc) => {
      adopt(doc, true);
      persist();
      renderPage();
    },
  };
}
