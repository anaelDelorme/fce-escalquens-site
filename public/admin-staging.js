(() => {
  const token = () =>
    sessionStorage.getItem('admin-token') || '';

  const authHeaders = () => ({
    'x-requested-with': 'XMLHttpRequest',
    ...(token()
      ? { 'x-admin-token': token() }
      : {})
  });

  async function callAction(action) {
    const response = await fetch(
      '/admin-api/staging/actions',
      {
        method: 'POST',
        headers: {
          ...authHeaders(),
          'content-type': 'application/json'
        },
        body: JSON.stringify({ action })
      }
    );

    let data = {};

    try {
      data = await response.json();
    } catch {}

    if (!response.ok) {
      throw new Error(
        data.error ||
        `Erreur HTTP ${response.status}`
      );
    }

    return data;
  }

  async function init() {
    let info;

    try {
      const response = await fetch(
        '/admin-api/staging/actions',
        {
          headers: authHeaders()
        }
      );

      if (!response.ok) {
        return;
      }

      info = await response.json();
    } catch {
      return;
    }

    if (info.environment !== 'staging') {
      return;
    }

    document.body.dataset.environment =
      'staging';

    const mainSection =
      document.querySelector(
        '#admin-content > section'
      );

    if (!mainSection) {
      return;
    }

    const panel =
      document.createElement('section');

    panel.className =
      'staging-tools';

    panel.setAttribute(
      'aria-labelledby',
      'staging-tools-title'
    );

    panel.innerHTML = `
      <div class="staging-tools-head">
        <div>
          <small>Préproduction</small>
          <h2 id="staging-tools-title">
            Outils de test
          </h2>
        </div>

        <strong>STAGING</strong>
      </div>

      <p>
        Ces opérations concernent uniquement
        la préproduction.
        Aucune synchronisation FFF/ZenRows
        automatique n'est exécutée ici.
      </p>

      <div class="staging-tools-actions">

        <button
          id="staging-sync-matches"
          type="button"
        >
          Synchroniser les matchs maintenant
        </button>

        <button
          id="staging-copy-prod"
          type="button"
        >
          Recharger depuis la production
        </button>

      </div>

      <p class="staging-tools-warning">
        <strong>Attention :</strong>
        recharger depuis la production
        remplace toutes les données
        de la base de préproduction.
      </p>

      <p
        id="staging-tools-status"
        role="status"
        aria-live="polite"
      ></p>
    `;

    const health =
      document.querySelector(
        '#sync-health'
      );

    if (health) {
      health.before(panel);
    } else {
      mainSection.prepend(panel);
    }

    const status =
      panel.querySelector(
        '#staging-tools-status'
      );

    const syncButton =
      panel.querySelector(
        '#staging-sync-matches'
      );

    const copyButton =
      panel.querySelector(
        '#staging-copy-prod'
      );


    syncButton.addEventListener(
      'click',
      async () => {

        const confirmed =
          window.confirm(
            'Lancer maintenant une synchronisation FFF/ZenRows en préproduction ?'
          );

        if (!confirmed) {
          return;
        }

        syncButton.disabled = true;
        copyButton.disabled = true;

        status.textContent =
          'Lancement de la synchronisation…';

        try {

          const result =
            await callAction(
              'sync_matches'
            );

          status.replaceChildren();

          status.append(
            'Synchronisation lancée. '
          );

          if (result.html_url) {
            const link =
              document.createElement('a');

            link.href =
              result.html_url;

            link.target = '_blank';
            link.rel = 'noopener';

            link.textContent =
              'Voir l’exécution GitHub Actions';

            status.append(link);
          }

        } catch (error) {

          status.textContent =
            error.message ||
            'Impossible de lancer la synchronisation.';

        } finally {

          syncButton.disabled = false;
          copyButton.disabled = false;

        }
      }
    );


    copyButton.addEventListener(
      'click',
      async () => {

        const confirmed =
          window.confirm(
            'Remplacer TOUTES les données de préproduction par une copie de la production ?\n\nLes modifications faites uniquement en préprod seront perdues.'
          );

        if (!confirmed) {
          return;
        }

        syncButton.disabled = true;
        copyButton.disabled = true;

        status.textContent =
          'Copie production → préproduction lancée…';

        try {

          const result =
            await callAction(
              'clone_prod'
            );

          status.replaceChildren();

          status.append(
            'Copie lancée. Comptez quelques minutes. '
          );

          if (result.html_url) {

            const link =
              document.createElement('a');

            link.href =
              result.html_url;

            link.target = '_blank';
            link.rel = 'noopener';

            link.textContent =
              'Voir l’exécution GitHub Actions';

            status.append(link);
          }

        } catch (error) {

          status.textContent =
            error.message ||
            'Impossible de lancer la copie.';

        } finally {

          syncButton.disabled = false;
          copyButton.disabled = false;

        }
      }
    );
  }

  init();
})();
