import { fail, text, integer, type Row } from "../shop/domain";
export function formFields(value: unknown) {
  if (!Array.isArray(value) || value.length > 12)
    fail(
      "FORM",
      400,
      "Le formulaire peut contenir au maximum 12 questions complémentaires.",
    );
  const ids = new Set<string>();
  return value.map((field: any) => {
    const id = text(field.id, 40, true);
    if (!/^[a-z][a-z0-9_]{0,39}$/.test(id) || ids.has(id))
      fail(
        "FORM",
        400,
        "Les identifiants des questions doivent être uniques, sans espace ni accent.",
      );
    ids.add(id);
    const type = text(field.type, 20, true);
    if (!["text", "textarea", "select", "checkbox"].includes(type))
      fail("FORM", 400, "Type de question invalide.");
    const choices =
      type === "select"
        ? Array.isArray(field.choices)
          ? field.choices.map((c: any) => text(c, 120, true))
          : []
        : [];
    if (
      type === "select" &&
      (!choices.length ||
        choices.length > 20 ||
        new Set(choices).size !== choices.length)
    )
      fail("FORM", 400, "Une liste doit comporter de 1 à 20 choix distincts.");
    return {
      id,
      label: text(field.label, 160, true),
      type,
      required: field.required === true,
      choices,
    };
  });
}
export function formAnswers(fields: Row[], value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail("ANSWERS", 400, "Complétez les questions du tournoi.");
  const result: Row = {};
  for (const f of fields) {
    if (f.type === "checkbox") {
      if (typeof (value as Row)[f.id] !== "boolean")
        fail("ANSWERS", 400, `Vérifiez : ${f.label}`);
      result[f.id] = (value as Row)[f.id];
      if (f.required && !result[f.id])
        fail("ANSWERS", 400, `Complétez : ${f.label}`);
    } else {
      result[f.id] = text(
        (value as Row)[f.id] ?? "",
        f.type === "textarea" ? 1000 : 200,
        f.required,
      );
      if (
        f.type === "select" &&
        result[f.id] &&
        !f.choices.includes(result[f.id])
      )
        fail("ANSWERS", 400, `Choix invalide : ${f.label}`);
    }
  }
  return result;
}

export function tournamentSections(value: unknown): string[] {
  let rows: unknown;
  try { rows = typeof value === 'string' ? JSON.parse(value) : value; } catch { rows = []; }
  if (!Array.isArray(rows) || !rows.length) return ['Équipes'];
  return [...new Set(rows.map((s: unknown) => text(s, 80, true)))];
}
export function registrationSections(categories: unknown, value: unknown) {
  const sections = tournamentSections(categories);
  if (!Array.isArray(value) || value.length !== sections.length)
    fail('SECTIONS', 400, 'Répondez Oui ou Non pour chacune des sections du tournoi.');
  const result = sections.map(section => {
    const matches = value.filter((row: any) => row?.section === section);
    const row = matches[0];
    if (matches.length !== 1 || typeof row.participating !== 'boolean')
      fail('SECTIONS', 400, `Indiquez Oui ou Non pour la section ${section}.`);
    const quantity = integer(row.quantity, row.participating ? 1 : 0, row.participating ? 50 : 0);
    return { section, participating: row.participating, quantity };
  });
  const count = result.reduce((sum, row) => sum + row.quantity, 0);
  if (!count || count > 100) fail('SECTIONS', 400, 'Inscrivez entre 1 et 100 équipes au total.');
  return { sections: result, count };
}
