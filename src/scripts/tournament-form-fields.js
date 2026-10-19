import { esc } from "../../public/shop-common.js";
export function questionMarkup(fields) {
  return fields
    .map((f) => {
      const label = esc(f.label) + (f.required ? " *" : ""),
        name = `extra:${f.id}`,
        required = f.required ? "required" : "";
      if (f.type === "checkbox")
        return `<label class="tournament-choice wide"><input type="checkbox" name="${esc(name)}" ${required}>${label}</label>`;
      const input =
        f.type === "select"
          ? `<select name="${esc(name)}" ${required}><option value="">Choisir…</option>${f.choices.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join("")}</select>`
          : f.type === "textarea"
            ? `<textarea name="${esc(name)}" maxlength="1000" ${required}></textarea>`
            : `<input name="${esc(name)}" maxlength="200" ${required}>`;
      return `<label>${label}${input}</label>`;
    })
    .join("");
}
export function readQuestionAnswers(form, fields) {
  return Object.fromEntries(
    fields.map((f) => {
      const element = form.elements.namedItem(`extra:${f.id}`);
      return [f.id, f.type === "checkbox" ? element.checked : element.value];
    }),
  );
}

export function sectionMarkup(sections) {
  return `<fieldset class="tournament-sections wide"><legend>Vos équipes</legend><p>Indiquez le nombre d’équipes à inscrire dans chaque section. Laissez 0 pour les autres.</p>${sections.map((section,index)=>`<label class="tournament-section" data-section-row="${index}"><span>${esc(section)}</span><span class="tournament-quantity"><small>Nombre d’équipes</small><input type="number" name="quantity:${index}" min="0" max="50" step="1" value="0" inputmode="numeric" required aria-label="Nombre d’équipes ${esc(section)}"></span></label>`).join('')}</fieldset>`;
}
export function readSections(form, sections) {
  return sections.map((section,index)=>{const quantity=Number(form.elements.namedItem(`quantity:${index}`).value);return {section,participating:quantity>0,quantity};});
}
export function sectionsSummary(registration) {
  const rows=JSON.parse(registration.sections_json||'[]');
  return rows.length?`<h3>Sections inscrites</h3><ul>${rows.map(row=>`<li>${esc(row.section)} : ${row.participating?`${row.quantity} équipe${row.quantity>1?'s':''}`:'0 équipe'}</li>`).join('')}</ul>`:'';
}
