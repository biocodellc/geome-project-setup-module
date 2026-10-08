/** Descriptive JSON-LD export. The full setup contract remains the JSON backup. */
const hasText = (value) => typeof value === "string" && value.trim() !== "";
const textFields = (fields) =>
  Object.fromEntries(
    Object.entries(fields).filter(([, value]) => hasText(value)),
  );
const httpURL = (value) => {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : "";
  } catch {
    return "";
  }
};
const identifier = (scheme, value) => ({
  "@type": "PropertyValue",
  propertyID: scheme,
  value,
});

export function exportSchemaOrg(engine, state) {
  const result = engine.exportConfiguration(state);
  engine.assertValid(result);
  if (result.version !== 5)
    throw new Error("Schema.org export requires a version 5 configuration.");
  const { answers, projectDescription, permitPlan, locations } = result;
  const description = {
    "@type": "CreativeWork",
    name: answers.projectName
      ? "Project description: " + answers.projectName
      : "Project description",
    about: { "@id": "_:project" },
  };
  const project = {
    "@context": "https://schema.org",
    "@type": "ResearchProject",
    "@id": "_:project",
    ...textFields({ name: answers.projectName, description: answers.purpose }),
    subjectOf: description,
  };

  const places = locations
    .filter((place) =>
      [place.country, place.region, place.locality].some(hasText),
    )
    .map((place) => ({
      "@type": "Place",
      name: [place.locality, place.region, place.country]
        .filter(hasText)
        .join(", "),
      address: {
        "@type": "PostalAddress",
        ...textFields({
          addressCountry: place.country,
          addressRegion: place.region,
          addressLocality: place.locality,
        }),
      },
    }));
  if (places.length) description.spatialCoverage = places;
  if (!answers.dateUnknown && (answers.startDate || answers.endDate))
    description.temporalCoverage =
      (answers.startDate || "..") + "/" + (answers.endDate || "..");

  const grants = projectDescription.funding
    .filter((grant) => Object.values(grant).some(hasText))
    .map((grant) => ({
      "@type": "Grant",
      ...textFields({
        name: grant.awardTitle,
        identifier: grant.awardNumber,
        url: httpURL(grant.awardUrl),
      }),
      ...(hasText(grant.funder)
        ? { funder: { "@type": "Organization", name: grant.funder } }
        : {}),
    }));
  if (grants.length) project.funding = grants;

  // The stored people have no role information: mentioning them avoids
  // inventing project membership, employment, or authorship of this description.
  const mentions = projectDescription.people
    .filter((person) => Object.values(person).some(hasText))
    .map((person) => ({
      "@type": "Person",
      ...textFields({ name: person.name, identifier: person.identifier }),
      ...(hasText(person.affiliation)
        ? { affiliation: { "@type": "Organization", name: person.affiliation } }
        : {}),
    }));
  for (const permit of permitPlan.permits) {
    mentions.push({
      "@type": "Permit",
      identifier: [
        permit.identifier,
        ...(hasText(permit.doi) ? [identifier("DOI", permit.doi)] : []),
      ],
      ...textFields({
        url: permit.url,
        description: [
          permit.scope,
          hasText(permit.holder) ? "Recorded holder: " + permit.holder : "",
        ]
          .filter(hasText)
          .join("\n\n"),
        validFrom: permit.validFrom,
        validUntil: permit.validUntil,
      }),
      ...(hasText(permit.issuer)
        ? { issuedBy: { "@type": "Organization", name: permit.issuer } }
        : {}),
    });
  }
  if (hasText(answers.localContextsProjectId))
    mentions.push({
      "@type": "CreativeWork",
      name: "Local Contexts project",
      identifier: answers.localContextsProjectId,
      ...textFields({ url: httpURL(answers.localContextsProjectId) }),
    });
  if (mentions.length) description.mentions = mentions;

  // An imported DOI may identify an article or dataset, not this new project.
  // Preserve it as a source reference without assigning its identity to the draft.
  const sources = projectDescription.identifiers
    .filter((ref) => hasText(ref.value))
    .map((ref) => ({
      "@type": "CreativeWork",
      identifier: identifier(ref.scheme.toUpperCase(), ref.value),
      ...textFields({ url: ref.scheme === "url" ? httpURL(ref.value) : "" }),
    }));
  const urls = new Set(sources.map((source) => source.url).filter(Boolean));
  for (const source of projectDescription.imports) {
    if (source.kind === "project" && !urls.has(source.url)) {
      sources.push({ "@type": "CreativeWork", url: source.url });
      urls.add(source.url);
    }
  }
  if (sources.length) description.isBasedOn = sources;
  return project;
}
