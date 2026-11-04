import { esc } from "../../public/shop-common.js";
export function formEditor(root, initial) {
  let fields = structuredClone(initial);
  const read = () =>
    fields.map((f, i) => {
      const row = root.querySelector(`[data-question="${i}"]`);
      return {
        ...f,
        label: row.querySelector("[data-label]").value,
        type: row.querySelector("[data-type]").value,
        required: row.querySelector("[data-required]").checked,
        choices: row
          .querySelector("[data-choices]")
          .value.split("\n")
          .map((x) => x.trim())
          .filter(Boolean),
      };
    });
  function draw() {
    root.innerHTML = `<h3>Construire le formulaire d’inscription</h3><p>Les coordonnées du responsable adulte et de l’équipe sont conservées. Ajoutez vos questions utiles à l’organisation, sans données médicales ni listes de joueurs.</p><div class="commerce-table-wrap"><table><thead><tr><th>Question</th><th>Type</th><th>Choix (un par ligne)</th><th>Obligatoire</th><th>Actions</th></tr></thead><tbody>${
      fields
        .map(
          (f, i) =>
            `<tr data-question="${i}"><td><input data-label aria-label="Libellé de la question ${i + 1}" maxlength="160" required value="${esc(f.label)}"></td><td><select data-type aria-label="Type de la question ${i + 1}">${[
              ["text", "Texte court"],
              ["textarea", "Texte long"],
              ["select", "Liste de choix"],
              ["checkbox", "Case à cocher"],
            ]
              .map(
                ([k, v]) =>
                  `<option value="${k}" ${f.type === k ? "selected" : ""}>${v}</option>`,
              )
              .join(
                "",
              )}</select></td><td><textarea data-choices aria-label="Choix de la question ${i + 1}" ${f.type === "select" ? "" : "hidden"}>${esc(f.choices.join("\n"))}</textarea></td><td><input type="checkbox" data-required aria-label="Question ${i + 1} obligatoire" ${f.required ? "checked" : ""}></td><td><button type="button" data-up="${i}" ${i ? "" : "disabled"} aria-label="Monter la question">↑</button> <button type="button" data-down="${i}" ${i < fields.length - 1 ? "" : "disabled"} aria-label="Descendre la question">↓</button> <button type="button" data-remove="${i}">Retirer</button></td></tr>`,
        )
        .join("") ||
      '<tr><td colspan="5">Aucune question complémentaire.</td></tr>'
    }</tbody></table></div><p><button type="button" data-add-question ${fields.length >= 12 ? "disabled" : ""}>+ Ajouter une question</button></p>`;
    root.querySelector("[data-add-question]").onclick = () => {
      fields = read();
      fields.push({
        id: "q_" + crypto.randomUUID().replaceAll("-", ""),
        label: "",
        type: "text",
        required: false,
        choices: [],
      });
      draw();
    };
    root.querySelectorAll("[data-type]").forEach(
      (select) =>
        (select.onchange = () => {
          fields = read();
          draw();
        }),
    );
    for (const action of ["up", "down", "remove"])
      root.querySelectorAll(`[data-${action}]`).forEach(
        (button) =>
          (button.onclick = () => {
            fields = read();
            const i = Number(button.dataset[action]);
            if (action === "remove") fields.splice(i, 1);
            else {
              const j = i + (action === "up" ? -1 : 1);
              [fields[i], fields[j]] = [fields[j], fields[i]];
            }
            draw();
          }),
      );
  }
  draw();
  return read;
}
