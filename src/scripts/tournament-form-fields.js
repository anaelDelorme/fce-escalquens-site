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
  return `<fieldset class="tournament-sections wide"><legend>Quelles sections souhaitez-vous inscrire ?</legend><p>Répondez pour chaque section, puis indiquez le nombre d’équipes pour chaque « Oui ».</p>${sections.map((section,index)=>`<div class="tournament-section" data-section-row="${index}"><fieldset><legend>${esc(section)} *</legend><label><input type="radio" name="section:${index}" value="yes" required> Oui</label><label><input type="radio" name="section:${index}" value="no" required> Non</label></fieldset><label data-section-quantity hidden>Nombre d’équipes<input type="number" name="quantity:${index}" min="1" max="50" step="1" value="1" disabled></label></div>`).join('')}</fieldset>`;
}
export function readSections(form, sections) {
  return sections.map((section,index)=>({section,participating:form.elements.namedItem(`section:${index}`).value==='yes',quantity:form.elements.namedItem(`section:${index}`).value==='yes'?Number(form.elements.namedItem(`quantity:${index}`).value):0}));
}
export function sectionsSummary(registration) {
  const rows=JSON.parse(registration.sections_json||'[]');
  return rows.length?`<h3>Sections inscrites</h3><ul>${rows.map(row=>`<li>${esc(row.section)} : ${row.participating?`${row.quantity} équipe${row.quantity>1?'s':''}`:'Non'}</li>`).join('')}</ul>`:'';
}
