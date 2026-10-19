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
