/** Read public descriptions into reviewable candidates. No DOM, storage or native IDs. */
const list = (value) =>
  value == null ? [] : Array.isArray(value) ? value : [value];
const named = (value) =>
  typeof value === "string" ? value : value?.name || "";
export function plainText(value) {
  if (typeof value !== "string") return "";
  return value
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(x[\da-f]+|\d+);/gi, (_, n) => {
      const code =
        n[0].toLowerCase() === "x" ? parseInt(n.slice(1), 16) : Number(n);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "�";
    })
    .replace(
      /&(amp|lt|gt|quot|apos|nbsp);/g,
      (_, n) =>
        ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " })[n],
    )
    .replace(/\s+/g, " ")
    .trim();
}
export function normalizeDOI(value) {
  const text = String(value || "")
    .trim()
    .replace(/^doi:\s*/i, "")
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "");
  return /^10\.\d{4,9}\/[^\s?#]+$/i.test(text) ? text.toLowerCase() : "";
}
function httpsURL(value) {
  try {
    const u = new URL(value);
    return u.protocol === "https:" && !u.username && !u.password ? u.href : "";
  } catch {
    return "";
  }
}
export function isIPlacesURL(value) {
  try {
    const u = new URL(value);
    return (
      !!httpsURL(value) &&
      ["iplacesalliance.org", "www.iplacesalliance.org"].includes(u.hostname) &&
      !u.port
    );
  } catch {
    return false;
  }
}
const empty = () => ({
  title: "",
  description: "",
  place: "",
  people: [],
  funding: [],
  identifiers: [],
  warnings: [],
  permit: {
    identifier: "",
    url: "",
    doi: "",
    issuer: "",
    holder: "",
    validFrom: "",
    validUntil: "",
    scope: "",
  },
});
function source(kind, format, url, data, retrievedAt) {
  const content = JSON.stringify(data);
  if (content.length > 100000)
    throw new Error(
      "This metadata record is too large to retain. Use a smaller exported record.",
    );
  return { kind, format, url, retrievedAt, content };
}
export function fromDataCite(
  record,
  { kind = "project", url, retrievedAt = new Date().toISOString() } = {},
) {
  const a = record?.data?.attributes;
  if (!a || !Array.isArray(a.titles) || !a.titles.length)
    throw new Error("DataCite did not return a usable description.");
  const doi = normalizeDOI(a.doi || record.data.id);
  if (!doi) throw new Error("The record has no valid DOI.");
  const out = empty();
  out.title = plainText(
    a.titles.find((t) => !t.titleType)?.title || a.titles[0].title,
  );
  out.description = plainText(
    list(a.descriptions).find((d) => d.descriptionType === "Abstract")
      ?.description || a.descriptions?.[0]?.description,
  );
  out.place = list(a.geoLocations)
    .map((g) => plainText(g.geoLocationPlace))
    .filter(Boolean)
    .join("; ");
  out.people = list(a.creators).map((p) => ({
    name: plainText(
      p.name || [p.givenName, p.familyName].filter(Boolean).join(" "),
    ),
    identifier: String(list(p.nameIdentifiers)[0]?.nameIdentifier || ""),
    affiliation: list(p.affiliation).map(named).map(plainText).join("; "),
  }));
  out.funding = list(a.fundingReferences).map((f) => ({
    funder: plainText(f.funderName),
    awardNumber: String(f.awardNumber || ""),
    awardTitle: plainText(f.awardTitle),
    awardUrl: httpsURL(f.awardUri),
  }));
  out.identifiers = [
    { scheme: "doi", value: doi },
    ...(httpsURL(a.url) ? [{ scheme: "url", value: httpsURL(a.url) }] : []),
  ];
  out.source = source(
    kind,
    "datacite",
    url || "https://doi.org/" + doi,
    record,
    retrievedAt,
  );
  if (kind === "permit") {
    out.permit = {
      ...out.permit,
      identifier: doi,
      doi,
      url: "https://doi.org/" + doi,
      scope: out.description,
    };
    out.warnings.push(
      "Confirm that this DOI describes your permit. Citation metadata does not identify the permit issuer, holder, validity dates, or coverage.",
    );
  } else if (a.types?.resourceTypeGeneral !== "Project")
    out.warnings.push(
      "This DOI may describe a publication or dataset. Confirm that its details describe the project you want to set up.",
    );
  return out;
}
function typeIs(node, type) {
  return list(node?.["@type"]).some(
    (t) =>
      t === type ||
      t === "https://schema.org/" + type ||
      t === "http://schema.org/" + type,
  );
}
export function extractJSONLD(html) {
  const documents = [];
  for (const match of html.matchAll(
    /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi,
  )) {
    if (!/\btype\s*=\s*["']application\/ld\+json["']/i.test(match[1])) continue;
    try {
      documents.push(JSON.parse(match[2]));
    } catch {
      throw new Error(
        "The page contains invalid JSON-LD. Ask its publisher to correct it or use the DOI.",
      );
    }
  }
  if (!documents.length)
    throw new Error(
      "This page has no supported project metadata. Try its DOI or enter the details yourself.",
    );
  return documents;
}
export function fromSchemaOrg(
  documents,
  { kind = "project", url, retrievedAt = new Date().toISOString() } = {},
) {
  const nodes = list(documents).flatMap((d) => list(d?.["@graph"] || d));
  const ids = new Map();
  for (const n of nodes)
    if (n?.["@id"]) {
      if (ids.has(n["@id"]))
        throw new Error("The page has duplicate metadata identifiers.");
      ids.set(n["@id"], n);
    }
  const resolve = (n) => ids.get(n?.["@id"]) || n;
  let choices = nodes.filter((n) =>
    kind === "permit"
      ? typeIs(n, "Permit") || typeIs(n, "GovernmentPermit")
      : typeIs(n, "ResearchProject") || typeIs(n, "Project"),
  );
  // Some publishers embed the project directly in the article's about property.
  if (!choices.length && kind === "project")
    choices = nodes
      .flatMap((n) => list(n?.about))
      .map(resolve)
      .filter((n) => typeIs(n, "ResearchProject") || typeIs(n, "Project"));
  if (!choices.length && kind === "project")
    choices = nodes.filter((n) => typeIs(n, "ScholarlyArticle"));
  choices = [...new Set(choices)];
  if (choices.length !== 1)
    throw new Error(
      choices.length
        ? "This page describes several projects or permits. Use a DOI identifying the one you want."
        : "No supported " + kind + " description was found on this page.",
    );
  const n = choices[0];
  const article = nodes.find(
    (a) =>
      typeIs(a, "ScholarlyArticle") &&
      list(a.about).some((p) => resolve(p) === n),
  );
  const out = empty();
  out.title = plainText(n.name || n.headline);
  out.description = plainText(n.description || n.abstract || article?.abstract);
  out.place = list(n.spatialCoverage || n.location)
    .map(resolve)
    .map(named)
    .map(plainText)
    .join("; ");
  out.people = list(n.member || n.author || article?.author)
    .map(resolve)
    .map((p) => ({
      name: plainText(named(p)),
      identifier: String(p?.["@id"] || ""),
      affiliation: list(p?.affiliation)
        .map(resolve)
        .map(named)
        .map(plainText)
        .join("; "),
    }));
  out.funding = list(n.funding)
    .map(resolve)
    .map((f) => ({
      funder: plainText(named(resolve(f.funder))),
      awardNumber: String(f.identifier?.value || f.identifier || ""),
      awardTitle: plainText(f.name),
      awardUrl: httpsURL(f.url),
    }));
  if (!out.funding.length)
    out.funding = list(n.funder)
      .map(resolve)
      .map((f) => ({
        funder: plainText(named(f)),
        awardNumber: "",
        awardTitle: "",
        awardUrl: "",
      }));
  const identifierValues = [
    n.identifier,
    n.sameAs,
    article?.identifier,
    article?.sameAs,
  ]
    .flatMap(list)
    .map((v) => (typeof v === "string" ? v : v?.value || v?.url || ""));
  const doi = identifierValues.map(normalizeDOI).find(Boolean);
  out.identifiers = [
    { scheme: "url", value: url },
    ...(doi ? [{ scheme: "doi", value: doi }] : []),
  ];
  out.source = source(kind, "schema.org", url, documents, retrievedAt);
  if (kind === "permit")
    out.permit = {
      ...out.permit,
      identifier: plainText(
        n.identifier?.value ||
          (typeof n.identifier === "string" ? n.identifier : "") ||
          n.name,
      ),
      url: httpsURL(n.url) || url,
      doi: doi || "",
      issuer: plainText(named(resolve(n.issuedBy))),
      holder: plainText(named(resolve(n.owner))),
      validFrom: String(n.validFrom || ""),
      validUntil: String(n.validUntil || ""),
      scope: out.description,
    };
  if (typeIs(n, "ScholarlyArticle"))
    out.warnings.push(
      "This page describes an article. Confirm that it describes the project you want to set up.",
    );
  return out;
}
async function readRemote(url, fetchImpl, signal) {
  const res = await fetchImpl(url, {
    signal,
    credentials: "omit",
    referrerPolicy: "no-referrer",
    headers: { Accept: "application/json, text/html" },
  });
  if (!res.ok)
    throw new Error(
      res.status === 404
        ? "No public record was found. Check the DOI or link; only DataCite DOIs are supported in this pilot."
        : "The source could not be read (HTTP " +
            res.status +
            "). Try again later.",
    );
  if (Number(res.headers.get("content-length")) > 1024 * 1024)
    throw new Error("The source is too large to import.");
  if (!res.body?.getReader) {
    const body = await res.text();
    if (body.length > 1024 * 1024)
      throw new Error("The source is too large to import.");
    return body;
  }
  const reader = res.body.getReader();
  const chunks = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > 1024 * 1024)
        throw new Error("The source is too large to import.");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  const body = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder().decode(body);
}
export async function lookupReference(
  input,
  {
    kind = "project",
    fetchImpl = globalThis.fetch,
    retrievedAt = new Date().toISOString(),
    signal,
  } = {},
) {
  const value = String(input || "").trim();
  const doi = normalizeDOI(value);
  const url = doi ? "https://doi.org/" + doi : httpsURL(value);
  if (!url) throw new Error("Enter a DOI or an HTTPS link.");
  if (!doi && !isIPlacesURL(url)) {
    if (kind !== "permit")
      throw new Error(
        "This pilot accepts iPlaces pages and DataCite DOIs. You can also enter project details yourself.",
      );
    const out = empty();
    out.permit.url = url;
    out.source = source(kind, "reference", url, { url }, retrievedAt);
    out.warnings.push(
      "Document link saved for review. Enter its identifier and permit details; this document was not downloaded.",
    );
    return out;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) controller.abort();
  try {
    const body = await readRemote(
      doi ? "https://api.datacite.org/dois/" + encodeURIComponent(doi) : url,
      fetchImpl,
      controller.signal,
    );
    return doi
      ? fromDataCite(JSON.parse(body), { kind, url, retrievedAt })
      : fromSchemaOrg(extractJSONLD(body), { kind, url, retrievedAt });
  } catch (e) {
    if (controller.signal.aborted)
      throw new Error(
        "The lookup was cancelled or took too long. Your draft has not changed.",
      );
    if (e instanceof TypeError)
      throw new Error(
        "Could not reach the source. Check your connection or try the DOI instead.",
      );
    throw e;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}
function retainSource(state, imported) {
  const sources = state.projectDescription.imports;
  const index = sources.findIndex(
    (s) => s.url === imported.url && s.kind === imported.kind,
  );
  if (index < 0) sources.push(structuredClone(imported));
  else sources[index] = structuredClone(imported);
}
export function applyProjectImport(
  engine,
  state,
  candidate,
  {
    title = candidate.title,
    description = candidate.description,
    people = candidate.people,
    funding = candidate.funding,
    country = "",
    place = "",
  } = {},
) {
  const next = structuredClone(state);
  next.projectDescription.people = structuredClone(people);
  next.projectDescription.funding = structuredClone(funding);
  next.projectDescription.identifiers = structuredClone(candidate.identifiers);
  retainSource(next, candidate.source);
  engine.updateAnswers(next, { projectName: title, purpose: description });
  if (country || place) {
    const location = { ...engine.newLocation(), country, locality: place };
    const blank = next.locations.findIndex(
      (l) => !l.country && !l.locality && !l.region,
    );
    if (blank >= 0) next.locations[blank] = location;
    else if (
      !next.locations.some((l) => l.country === country && l.locality === place)
    )
      next.locations.push(location);
  }
  engine.assertValid(engine.exportConfiguration(next));
  return next;
}
export function applyPermitImport(
  engine,
  state,
  candidate,
  fields = candidate.permit,
) {
  const next = structuredClone(state);
  if (
    next.permitPlan.permits.some(
      (p) =>
        (fields.doi && normalizeDOI(p.doi) === normalizeDOI(fields.doi)) ||
        (fields.url && p.url === fields.url),
    )
  )
    throw new Error(
      "This permit reference is already in the project. Edit the existing reference in Access & permissions.",
    );
  const permit = {
    ...engine.newPermit("", fields.identifier),
    ...fields,
    typeId: "",
    coverage: [],
    visibility: "members",
  };
  next.permitPlan.permits.push(permit);
  retainSource(next, candidate.source);
  engine.updateAnswers(next, {});
  engine.assertValid(engine.exportConfiguration(next));
  return next;
}
