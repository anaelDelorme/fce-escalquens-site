import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
export default defineConfig({
  output: "static",
  site: "https://fcescalquens.fr",
  integrations: [sitemap({ filter: (page) => !page.includes('/admin') && !page.includes('/boutique/suivi') && !page.includes('/tournois/suivi') && !page.includes('/paiements/retour') })]
});