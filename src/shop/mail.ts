import {
  email,
  escapeHtml,
  euros,
  now,
  trackingToken,
  type Row,
} from "./domain";
import { origin } from "./security";
import type { ShopEnv } from "./service";
import type { Settings } from "./terms";
const statusLabels: Record<string, string> = {
  new: "en préparation",
  ordered: "commandée au fournisseur",
  partial: "partiellement reçue",
  ready: "disponible pour remise",
  delivered: "remise",
  cancelled: "annulée",
};
export async function queueMail(
  env: ShopEnv,
  id: string,
  orderId: string,
  kind: string,
) {
  await env.ORDERS.prepare(
    "INSERT OR IGNORE INTO outbox(id,order_id,kind,available_at) VALUES(?,?,?,?)",
  )
    .bind(id, orderId, kind, now())
    .run();
}
export async function deliverMail(
  env: ShopEnv,
  settings: Settings,
  job: Row,
  order: Row,
) {
  const token = await trackingToken(
    env.TRACKING_SECRET || "",
    order.id,
    order.token_version,
  );
  const link = `${origin(env)}/${order.kind === "tournament" ? "tournois" : "boutique"}/suivi/#${order.id}.${token}`;
  const items = (
    await env.ORDERS.prepare(
      "SELECT * FROM order_items WHERE order_id=? ORDER BY id",
    )
      .bind(order.id)
      .all<Row>()
  ).results;
  const title = order.kind === 'tournament'
    ? ({paid:'Paiement confirmé',created:'Votre inscription est enregistrée',tracking:'Votre lien de suivi',payment:'Mise à jour du paiement'} as Record<string,string>)[job.kind] || 'Des nouvelles de votre inscription'
    : job.kind === "paid"
      ? "Paiement confirmé"
      : job.kind === "created"
        ? "Votre commande est enregistrée"
        : job.kind === "tracking"
          ? "Votre lien de suivi"
          : job.kind === "payment"
            ? "Mise à jour du paiement"
            : "Des nouvelles de votre commande";
  const state =
    order.payment_status === "paid"
      ? "Votre paiement est confirmé."
      : `État du paiement : ${order.payment_status === "pending" ? "en attente de confirmation" : order.payment_status}.`;
  const details = items
    .map(
      (i) =>
        `${i.quantity} × ${i.name} — ${i.size || "taille unique"} — ${i.color}\n${JSON.parse(
          i.options_json,
        )
          .map((o: Row) => `${o.label}${o.text ? ` : ${o.text}` : ""}`)
          .join(", ")}\n${euros(i.unit_cents * i.quantity)}`,
    )
    .join("\n\n");
  let content = `${title}\n\nBonjour ${order.first_name},\n\nCommande ${order.reference}\n${state}\nPréparation : ${statusLabels[order.fulfillment] || order.fulfillment}.\n${order.public_note}\n\n${details}\n\nTotal boutique : ${euros(order.total_cents)}\nRemise : ${order.delivery_method === "coach" ? `par le coach — ${order.team}` : `sur rendez-vous au club — ${settings.collection_address}`}.\n\nSuivre ma commande : ${link}\nCe lien est personnel : ne le transférez pas. Il permet aussi de donner votre avis sur la boutique. Aucun compte ni mot de passe n’est nécessaire.\n\nUne question ? ${settings.contact_email}\nInformations sur vos données : ${origin(env)}/confidentialite/\n\n${order.terms_snapshot}`;
  if(order.kind === "tournament") {
    const registration=await env.ORDERS.prepare("SELECT * FROM tournament_registrations WHERE order_id=?").bind(order.id).first<Row>();
    const labels:Record<string,string>={pending:"en attente de validation par le club",accepted:"acceptée",cancelled:"annulée",attended:"équipe accueillie"};
    const answers=JSON.parse(registration?.answers_json||'{}');
    const responses=JSON.parse(registration?.form_snapshot||'[]').map((f:Row)=>`${f.label} : ${typeof answers[f.id]==='boolean'?(answers[f.id]?'Oui':'Non'):answers[f.id]||'—'}`).join('\n');
    content=`Bonjour ${order.first_name},\n\nInscription ${order.reference} — ${registration?.tournament_name}\nClub : ${registration?.club_name}\nÉquipe : ${registration?.team_name} — ${registration?.category}\nInscription : ${labels[registration?.registration_status] || 'enregistrée'}.\n${state}\n${order.public_note}\nMontant : ${euros(order.total_cents)}\nDate limite de paiement : ${new Date((registration?.payment_deadline||0)*1000).toLocaleDateString('fr-FR',{timeZone:'Europe/Paris'})}\nLe paiement et l’acceptation par le club sont deux étapes distinctes.\n${responses}\n\n${registration?.payment_method==='cheque'?`Paiement par chèque : ${registration.cheque_snapshot}\nSuivre mon inscription`:'Suivre mon inscription et payer avec HelloAsso'} : ${link}\nCe lien personnel ne doit pas être transmis. Aucun compte n’est nécessaire.\n\nContact : ${settings.contact_email}\nVos données : ${origin(env)}/confidentialite/\n\n${order.terms_snapshot}`;
  }
  // In staging no customer address is used: all messages go to the configured tester.
  const to =
    env.APP_ENV === "production" ? order.email : email(env.MAIL_TEST_TO);
  const from = email(env.MAIL_FROM);
  const subject = `${env.APP_ENV === "production" ? "" : "[TEST] "}${title} — ${order.reference}`;
  if (env.MAIL_PROVIDER === "cloudflare") {
    if (!env.EMAIL) throw new Error("MAIL_BINDING_MISSING");
    const result = await env.EMAIL.send({
      from: { email: from, name: "FC Escalquens" },
      to,
      replyTo: settings.contact_email,
      subject,
      text: content,
      html: `<div style="font-family:Arial,sans-serif;max-width:650px;margin:auto;color:#291d1d"><h1 style="color:#9f1a1a">${escapeHtml(order.kind === "tournament" ? "Suivi de votre inscription" : title)}</h1><p>${order.kind === "tournament" ? "Inscription" : "Commande"} <strong>${escapeHtml(order.reference)}</strong></p><p>${escapeHtml(state)}</p><p><a style="display:inline-block;background:#9f1a1a;color:white;padding:16px" href="${escapeHtml(link)}">Ouvrir mon suivi</a></p><pre style="white-space:pre-wrap;font:inherit">${escapeHtml(content)}</pre></div>`,
    });
    return result.messageId;
  }
  if (env.MAIL_PROVIDER === "resend" && env.RESEND_API_KEY) {
    const result = await fetch("https://api.resend.com/emails", {
      method: "POST",
      signal: AbortSignal.timeout(15000),
      headers: {
        authorization: `Bearer ${env.RESEND_API_KEY}`,
        "content-type": "application/json",
        "idempotency-key": job.id,
      },
      body: JSON.stringify({
        from: `FC Escalquens <${from}>`,
        to: [to],
        reply_to: settings.contact_email,
        subject,
        text: content,
      }),
    });
    if (!result.ok) throw new Error(`MAIL_HTTP_${result.status}`);
    return String(((await result.json()) as Row).id);
  }
  throw new Error("MAIL_PROVIDER_MISSING");
}
export async function drainMail(env: ShopEnv, settings: Settings) {
  if (!env.ORDERS) return;
  const jobs = (
    await env.ORDERS.prepare(
      "SELECT * FROM outbox WHERE status IN ('pending','sending') AND available_at<=? AND locked_until<? AND attempts<8 AND EXISTS(SELECT 1 FROM orders o WHERE o.id=outbox.order_id AND o.kind=?) ORDER BY available_at LIMIT 10",
    )
      .bind(now(), now(),env.ORDER_KIND||"shop")
      .all<Row>()
  ).results;
  for (const job of jobs) {
    const claimed = await env.ORDERS.prepare(
      "UPDATE outbox SET status='sending',locked_until=?,attempts=attempts+1 WHERE id=? AND locked_until<? AND status IN ('pending','sending') RETURNING id",
    )
      .bind(now() + 90, job.id, now())
      .first();
    if (!claimed) continue;
    try {
      const order = await env.ORDERS.prepare("SELECT * FROM orders WHERE id=?")
        .bind(job.order_id)
        .first<Row>();
      if (!order) throw new Error("ORDER_MISSING");
      const messageId = await deliverMail(env, settings, job, order);
      await env.ORDERS.prepare(
        "UPDATE outbox SET status='sent',sent_at=?,provider_id=?,last_error='',locked_until=0 WHERE id=?",
      )
        .bind(now(), messageId, job.id)
        .run();
    } catch (error: any) {
      // Never persist a vendor error message: it could contain the plaintext tracking link.
      const code = /^MAIL_[A-Z0-9_]+$/.test(error?.message)
        ? error.message
        : "MAIL_SEND_FAILED";
      await env.ORDERS.prepare(
        "UPDATE outbox SET status=?,available_at=?,locked_until=0,last_error=? WHERE id=?",
      )
        .bind(
          job.attempts + 1 >= 8 ? "failed" : "pending",
          now() + Math.min(21600, 60 * 2 ** (job.attempts + 1)),
          code,
          job.id,
        )
        .run();
    }
  }
}
