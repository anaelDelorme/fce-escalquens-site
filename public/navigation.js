document.querySelector(".menu-button")?.addEventListener("click", (event) => {
  const open = document
    .querySelector(".site-header nav")
    ?.classList.toggle("open");
  event.currentTarget.setAttribute("aria-expanded", String(Boolean(open)));
  event.currentTarget.setAttribute(
    "aria-label",
    open ? "Fermer le menu" : "Ouvrir le menu",
  );
});
