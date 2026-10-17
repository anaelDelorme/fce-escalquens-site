import { TERMS_VERSION } from "./domain";
export const defaultSettings = {
  checkout_enabled: false,
  organization_slug: "",
  legal_ready: false,
  seller_name: "Football Club d’Escalquens",
  seller_address: "",
  seller_id: "",
  seller_phone: "",
  contact_email: "fcescalquens@gmail.com",
  mediator_name: "",
  mediator_url: "",
  delivery_days: 30,
  collection_address: "",
  collection_instructions: "",
};
export type Settings = typeof defaultSettings;
export function termsSections(s: Settings) {
  return [
    [
      "Vendeur et contact",
      `${s.seller_name}\n${s.seller_address || "Adresse à renseigner par le club avant ouverture des ventes."}\n${s.seller_id || "Identifiant de l’association à renseigner avant ouverture."}\nE-mail : ${s.contact_email}\nTéléphone : ${s.seller_phone || "À renseigner avant ouverture."}`,
    ],
    [
      "Articles, prix et commande",
      "Les caractéristiques, tailles, coloris, options et prix sont présentés avant la validation. Les prix sont exprimés en euros, montant total dû, et les frais de remise au club ou par le coach sont nuls. Le récapitulatif permet de corriger les articles et coordonnées. Le bouton de paiement matérialise une commande avec obligation de paiement. La commande est confirmée après validation du paiement et un récapitulatif est envoyé par e-mail. Les conditions acceptées et les prix sont conservés avec la commande.",
    ],
    [
      "Paiement HelloAsso",
      "Le règlement est effectué exclusivement en ligne via HelloAsso, en une fois. Le club ne recueille aucune donnée de carte bancaire. HelloAsso peut présenter une contribution volontaire à son fonctionnement : elle est distincte du prix de la boutique et peut être modifiée ou retirée sur son interface. Un refus ou un abandon du paiement ne lance pas la préparation. En cas de statut incertain, contactez le club avant de recommencer un paiement.",
    ],
    [
      "Remise des articles et délais",
      `La remise est gratuite, au choix par le coach de l’équipe indiquée ou sur rendez-vous au club. Aucune expédition postale n’est proposée. Lieu du rendez-vous : ${s.collection_address || "à préciser avant ouverture des ventes"}. ${s.collection_instructions}\nLes articles sont remis au plus tard ${s.delivery_days} jours calendaires après confirmation du paiement, sauf date différente expressément convenue avec vous avant la commande. Une remise partielle peut être organisée avec votre accord. En cas de retard, contactez le club ; vos droits à demander l’exécution puis, dans les conditions légales, la résolution du contrat et son remboursement restent applicables. Le transfert des risques intervient lors de la prise de possession par vous ou le tiers que vous avez désigné.`,
    ],
    [
      "Indisponibilité et modifications",
      "Si un article devient indisponible après paiement, le club vous contacte pour proposer un délai accepté par vous ou le remboursement de l’article concerné. Aucun remplacement ni supplément n’est imposé. Une modification de taille ou de personnalisation après paiement doit être demandée au club et reste soumise à l’avancement de la fabrication. Les droits légaux du consommateur restent applicables.",
    ],
    [
      "Rétractation et retours",
      "Pour un article non personnalisé, vous disposez de 14 jours à compter de sa réception pour notifier votre rétractation au club par e-mail ou courrier, sans avoir à justifier votre décision. Pour des articles d’une même commande livrés séparément, le délai commence à la réception du dernier article. Vous pouvez utiliser le formulaire ci-dessous ou toute déclaration non ambiguë. Les biens doivent être restitués dans les 14 jours suivant votre notification. Une restitution au club sur rendez-vous est possible ; les éventuels frais directs d’un retour postal restent à votre charge. Le remboursement est effectué par le moyen de paiement initial, sauf accord exprès, dans les 14 jours de la notification ; il peut être différé jusqu’à récupération du bien ou preuve de son renvoi. Votre responsabilité ne peut être engagée que pour une dépréciation résultant de manipulations autres que celles nécessaires pour vérifier le bien.\nLes articles confectionnés selon vos spécifications ou nettement personnalisés, notamment avec vos initiales, sont exclus du droit de rétractation conformément à l’article L221-28 du Code de la consommation. Cette exception ne supprime pas les garanties légales.",
    ],
    [
      "Formulaire de rétractation",
      `À l’attention de ${s.seller_name}, ${s.seller_address}, ${s.contact_email}.\nJe vous notifie ma rétractation du contrat portant sur les articles suivants : …\nCommande n° : … — commandée le : … — reçue le : …\nNom et adresse du consommateur : …\nDate : … — Signature (uniquement si formulaire papier) : …`,
    ],
    [
      "Garanties légales",
      "Le vendeur répond des défauts de conformité dans les conditions des articles L217-3 et suivants du Code de la consommation et des vices cachés dans les conditions des articles 1641 et suivants du Code civil. Pour un bien neuf, vous disposez de deux ans à compter de sa délivrance pour agir en garantie légale de conformité ; les défauts apparus pendant ces deux ans sont présumés exister à la délivrance, sauf preuve contraire. Vous pouvez demander la réparation ou le remplacement, sous réserve des conditions de coût et de possibilité prévues par la loi. La mise en conformité doit intervenir sans frais, dans un délai maximal de 30 jours et sans inconvénient majeur. Si les conditions légales sont réunies, une réduction du prix ou la résolution du contrat peut être demandée. Un bien réparé bénéficie d’une prolongation de garantie de six mois ; lorsqu’un remplacement est imposé après une demande de réparation, un nouveau délai de deux ans court à compter du remplacement. La garantie des vices cachés permet de demander la résolution de la vente ou une réduction du prix dans les deux ans de la découverte du vice. Aucune garantie commerciale ne limite ces droits. Adressez votre demande au contact indiqué ci-dessus.",
    ],
    [
      "Réclamations et médiation",
      `Adressez d’abord une réclamation écrite au club. En l’absence de solution amiable, vous pouvez recourir gratuitement au médiateur de la consommation compétent : ${s.mediator_name || "à désigner par le club avant ouverture des ventes"} — ${s.mediator_url || "coordonnées à compléter avant ouverture"}. Le droit français s’applique sans priver un consommateur des protections impératives dont il bénéficie. Les règles légales de compétence des tribunaux s’appliquent.`,
    ],
    [
      "Données personnelles",
      "Les données nécessaires à la commande sont traitées par le club pour exécuter le contrat et respecter ses obligations légales. Les responsables habilités, le coach chargé de la remise et les fournisseurs n’accèdent qu’aux informations nécessaires à leur mission. Les références, tailles et personnalisations utiles sont transmises au fournisseur. Les coordonnées de paiement sont traitées par HelloAsso. L’enquête de satisfaction est facultative et sans effet sur la commande. Consultez la politique de confidentialité pour les durées, les destinataires et vos droits. Aucun compte client ni abonnement publicitaire n’est créé.",
    ],
  ];
}
export function termsSnapshot(s: Settings) {
  return (
    `Conditions générales de vente — ${TERMS_VERSION}\n\n` +
    termsSections(s)
      .map(([title, body]) => `${title}\n${body}`)
      .join("\n\n")
  );
}
