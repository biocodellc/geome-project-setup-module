import { normalizeDOI, isIPlacesURL } from "../lib/project-import.js";

// Presentation of the retained source only; opening this view makes no requests.
export function renderImportSource(source, esc) {
  const labels = {
    "schema.org": `${isIPlacesURL(source.url) ? "iPlaces · " : ""}schema.org (JSON-LD)`,
    datacite: "DataCite · DOI metadata",
    reference: "Document link only",
  };
  const explanations = {
    "schema.org":
      "Read the structured schema.org metadata embedded in the source page as JSON-LD. A project description can draw on both a project record and its linked article.",
    datacite:
      "Read the metadata registered for this DOI from the DataCite API. The DOI's landing page is not read during this lookup.",
    reference:
      "Kept the document URL you supplied. The document was not downloaded or read; enter its permit details yourself.",
  };
  let original = source.content;
  let recordTypes = [];
  try {
    const data = JSON.parse(source.content);
    original = JSON.stringify(data, null, 2);
    const list = (value) =>
      value == null ? [] : Array.isArray(value) ? value : [value];
    recordTypes =
      source.format === "schema.org"
        ? list(data)
            .flatMap((doc) => list(doc?.["@graph"] || doc))
            .flatMap((node) => list(node?.["@type"]))
            .filter((type) => typeof type === "string")
        : list(data?.data?.attributes?.types?.resourceTypeGeneral);
  } catch {
    /* Imported snapshots may retain plain text; display it literally. */
  }
  const doi = normalizeDOI(source.url);
  const endpoint =
    source.format === "datacite" && doi
      ? "https://api.datacite.org/dois/" + encodeURIComponent(doi)
      : "";
  const link = (url) =>
    `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(url)}</a>`;
  const date = new Date(source.retrievedAt);
  const when = Number.isNaN(date.getTime())
    ? source.retrievedAt
    : date.toLocaleString(undefined, { timeZoneName: "short" });
  return `<section class="import-source" aria-label="Import source">
    <h3>${labels[source.format]}</h3>
    <p>${explanations[source.format]}</p>
    <dl><dt>${source.format === "schema.org" ? "Page read" : "Source reference"}</dt><dd>${link(source.url)}</dd>
    ${endpoint ? `<dt>Metadata request</dt><dd>${link(endpoint)}</dd>` : ""}
    <dt>${source.format === "reference" ? "Recorded" : "Retrieved"}</dt><dd><time datetime="${esc(source.retrievedAt)}">${esc(when)}</time></dd>
    ${recordTypes.length ? `<dt>Records in source</dt><dd>${esc([...new Set(recordTypes)].join(", "))}</dd>` : ""}</dl>
    <details><summary>View original ${source.format === "reference" ? "reference" : "metadata"}</summary><p class="help">This retained snapshot stays separate from your edits. Reading it here makes no new request.</p><pre tabindex="0">${esc(original)}</pre></details>
  </section>`;
}

export function importedFields(candidate) {
  if (candidate.source.kind === "permit") {
    const labels = {
      identifier: "identifier",
      url: "document link",
      doi: "DOI",
      issuer: "issuer",
      holder: "holder",
      validFrom: "start date",
      validUntil: "end date",
      scope: "scope notes",
    };
    return Object.entries(labels)
      .filter(([key]) => candidate.permit[key])
      .map(([, label]) => label)
      .join(", ");
  }
  return [
    candidate.title && "project name",
    candidate.description && "research description",
    candidate.place && "study area",
    candidate.people.length &&
      `${candidate.people.length} ${candidate.people.length === 1 ? "person" : "people"}`,
    candidate.funding.length &&
      `${candidate.funding.length} funding record${candidate.funding.length === 1 ? "" : "s"}`,
    candidate.identifiers.length &&
      `${candidate.identifiers.length} identifier${candidate.identifiers.length === 1 ? "" : "s"}`,
  ]
    .filter(Boolean)
    .join(", ");
}
