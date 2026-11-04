import { sendSmtp, type MailMessage } from "./smtp";
import { mailTransportReady } from "./mail-config";
import { renderMail, type MailContent } from "./mail-template";
import {
  email,
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
/** Sandbox always uses the fixed tester, including club notifications. */
export function mailRecipient(env: ShopEnv, settings: Settings, job: Row, order: Row) {
  const target=email(job.audience==='club'?settings.contact_email:order.email);
  if(env.APP_ENV==='production')return target;
  return email(env.MAIL_TEST_TO);
}
const paymentLabels: Record<string,string> = {
  pending: 'En attente de confirmation', paid: 'Payé', refused: 'Paiement refusé',
  review: 'À vérifier par le club', refunding: 'Remboursement en cours',
  refunded: 'Remboursé', partially_refunded: 'Partiellement remboursé', contested: 'Paiement contesté',
};
const registrationLabels: Record<string,string> = {
  pending: 'En attente de validation par le club', accepted: 'Acceptée', cancelled: 'Annulée', attended: 'Équipes accueillies',
};
function registrationFacts(r: Row): [string,string][] {
  const sections = JSON.parse(r.sections_json || '[]').filter((s:Row)=>s.participating && s.quantity>0);
  return [
    ['Tournoi', r.tournament_name || ''], ['Club', r.club_name || ''],
    ...(sections.length ? sections.map((s:Row)=>[s.section,`${s.quantity} équipe${s.quantity>1?'s':''}`]) : [['Équipe', [r.team_name,r.category].filter(Boolean).join(' · ')]]),
    ['Inscription', registrationLabels[r.registration_status] || 'Enregistrée'],
    ...(r.payment_deadline ? [['Date limite de paiement',new Date(r.payment_deadline*1000).toLocaleDateString('fr-FR',{timeZone:'Europe/Paris',dateStyle:'long'})]] : []),
  ] as [string,string][];
}
export async function deliverMail(env: ShopEnv, settings: Settings, job: Row, order: Row) {
  const tournament = order.kind === 'tournament', club = job.audience === 'club';
  const registration = tournament ? await env.ORDERS.prepare('SELECT * FROM tournament_registrations WHERE order_id=?').bind(order.id).first<Row>() : null;
  const title = club
    ? job.kind==='survey' ? 'Nouvel avis boutique' : job.kind==='created' ? (tournament?'Nouvelle inscription au tournoi':'Nouvelle commande boutique') : job.kind==='paid' ? 'Nouveau paiement confirmé' : 'Mise à jour du paiement'
    : job.kind==='paid' ? 'Paiement confirmé' : job.kind==='created' ? (tournament?'Votre inscription est enregistrée':'Votre commande est enregistrée') : job.kind==='tracking' ? 'Votre lien de suivi' : job.kind==='payment' ? 'Mise à jour du paiement' : (tournament?'Des nouvelles de votre inscription':'Des nouvelles de votre commande');
  const content: MailContent = {
    section: `${tournament?'Tournois':'Boutique'}${club?' · Notification au club':''}`,
    title, reference: order.reference, greeting: club ? 'Bonjour,' : `Bonjour ${order.first_name},`,
    introduction: club ? 'Retrouvez le récapitulatif ci-dessous et ouvrez la fiche pour consulter les détails.'
      : order.payment_status==='paid' ? (tournament?'Nous avons bien reçu votre règlement. Retrouvez le récapitulatif de votre inscription ci-dessous.':'Nous avons bien reçu votre règlement. Le club vous informera de l’avancement de votre commande.')
      : tournament ? 'Votre inscription est bien enregistrée. Consultez son suivi pour retrouver les équipes inscrites et les modalités de règlement.'
      : 'Votre commande est bien enregistrée. Consultez son suivi pour terminer le paiement ou retrouver son avancement.',
    facts: [['Paiement',paymentLabels[order.payment_status] || 'À vérifier par le club']],
    total: order.total_cents, note: order.public_note || '',
    contact: email(settings.contact_email), privacyUrl: `${origin(env)}/confidentialite/`,
    paragraphs: [],
  };
  if(club) content.facts!.unshift(['Client / contact',`${order.first_name} ${order.last_name}`]);
  if(registration) {
    content.facts!.push(...registrationFacts(registration));
    content.paragraphs!.push('Le paiement et l’acceptation de l’inscription par le club sont deux étapes distinctes.');
    if(registration.payment_method==='cheque') content.paragraphs!.push(`Règlement par chèque : ${registration.cheque_snapshot}`);
    const answers=JSON.parse(registration.answers_json||'{}');
    content.answers=JSON.parse(registration.form_snapshot||'[]').map((f:Row)=>[f.label,typeof answers[f.id]==='boolean'?(answers[f.id]?'Oui':'Non'):String(answers[f.id]??'—')]);
  } else {
    const items=(await env.ORDERS.prepare('SELECT * FROM order_items WHERE order_id=? ORDER BY id').bind(order.id).all<Row>()).results;
    content.items=items.map(i=>({name:i.name,quantity:i.quantity,total:i.unit_cents*i.quantity,details:[i.size,i.color,...JSON.parse(i.options_json||'[]').map((o:Row)=>`${o.label}${o.text?' : '+o.text:''}`)].filter(Boolean).join(' · ')}));
    content.facts!.push(['Préparation',order.fulfillment==='new'&&order.payment_status!=='paid'?'Après confirmation du paiement':statusLabels[order.fulfillment]||'À vérifier par le club']);
    content.facts!.push(['Remise',order.delivery_method==='coach'?`Par le coach${order.team?' · '+order.team:''}`:`Sur rendez-vous au club${settings.collection_address?' · '+settings.collection_address:''}`]);
    if(order.delivery_method==='club'&&settings.collection_instructions)content.paragraphs!.push(settings.collection_instructions);
  }
  if(club) {
    content.action={label:'Ouvrir la fiche dans l’administration',url:`${origin(env)}/${tournament?'admin-tournois/?inscription=':'admin-boutique/?commande='}${order.id}`,help:'Connexion Cloudflare Access requise. Ce mail ne contient aucun lien personnel du client.'};
    if(job.kind==='survey') {
      const survey=await env.ORDERS.prepare('SELECT ease,catalogue,overall,comment FROM surveys WHERE order_id=?').bind(order.id).first<Row>();
      content.introduction='Un client a partagé son avis sur la boutique.';
      content.answers=[['Facilité de commande',`${survey?.ease}/5`],['Catalogue',`${survey?.catalogue}/5`],['Ensemble',`${survey?.overall}/5`]];
      content.note=survey?.comment||'Aucun commentaire';
    }
  } else {
    const token=await trackingToken(env.TRACKING_SECRET||'',order.id,order.token_version);
    content.action={label:tournament?'Suivre mon inscription':'Suivre ma commande',url:`${origin(env)}/${tournament?'tournois':'boutique'}/suivi/#${order.id}.${token}`,help:'Ce lien est personnel : ne le transférez pas. Aucun compte ni mot de passe n’est nécessaire.'};
    if(['created','paid'].includes(job.kind))content.terms=order.terms_snapshot;
  }
  return sendMessage(env,{
    id:job.id,from:email(env.MAIL_FROM),to:mailRecipient(env,settings,job,order),replyTo:email(settings.contact_email),
    subject:`${env.APP_ENV==='production'?'':'[TEST] '}${club?'[CLUB] ':''}${title} — ${order.reference}`,
    ...renderMail(content),
  });
}
async function sendMessage(env: ShopEnv, message: MailMessage) {
  const { from, to, replyTo, subject, text: content, html, id } = message;
  if (env.MAIL_PROVIDER === 'ovh') {
    return sendSmtp({ host: env.SMTP_HOST || '', user: env.SMTP_USER || '', password: env.SMTP_PASSWORD || '' }, message);
  }
  if (env.MAIL_PROVIDER === 'cloudflare') {
    if (!env.EMAIL) throw new Error('MAIL_BINDING_MISSING');
    return (await env.EMAIL.send({ from: { email: from, name: 'FC Escalquens' }, to, replyTo, subject, text: content, html })).messageId;
  }
  if (env.MAIL_PROVIDER === 'resend' && env.RESEND_API_KEY) {
    const result = await fetch('https://api.resend.com/emails', {
      method: 'POST', signal: AbortSignal.timeout(15000),
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json', 'idempotency-key': id },
      body: JSON.stringify({ from: `FC Escalquens <${from}>`, to: [to], reply_to: replyTo, subject, text: content, html }),
    });
    if (!result.ok) throw new Error(`MAIL_HTTP_${result.status}`);
    return String(((await result.json()) as Row).id);
  }
  throw new Error('MAIL_PROVIDER_MISSING');
}
/** Explicit admin action, fixed configured recipient even in production. No tracking token. */
export async function testMail(env: ShopEnv, settings: Settings) {
  if (!mailTransportReady(env) || !env.MAIL_TEST_TO) throw new Error('MAIL_TEST_CONFIG');
  return sendMessage(env, {
    id: `test-${crypto.randomUUID()}`, from: email(env.MAIL_FROM), to: email(env.MAIL_TEST_TO),
    replyTo: email(settings.contact_email), subject: '[TEST] FC Escalquens — vérification des e-mails',
    ...renderMail({section:'Test des e-mails',title:'Les e-mails du club sont prêts',introduction:'Le transport mail du FC Escalquens fonctionne. Ce message de test ne correspond à aucune commande ni inscription.',contact:email(settings.contact_email),privacyUrl:'https://fcescalquens.fr/confidentialite/'}),
  });
}

export async function drainMail(env: ShopEnv, settings: Settings, limit = 2) {
  if (!env.ORDERS) return;
  const jobs = (
    await env.ORDERS.prepare(
      "SELECT * FROM outbox WHERE status IN ('pending','sending') AND available_at<=? AND locked_until<? AND attempts<8 AND EXISTS(SELECT 1 FROM orders o WHERE o.id=outbox.order_id AND o.kind=?) ORDER BY available_at,id LIMIT ?",
    )
      .bind(now(), now(),env.ORDER_KIND||"shop",limit)
      .all<Row>()
  ).results;
  const processJob=async (job: Row) => {
    const claimed = await env.ORDERS.prepare(
      "UPDATE outbox SET status='sending',locked_until=?,attempts=attempts+1 WHERE id=? AND locked_until<? AND status IN ('pending','sending') RETURNING id",
    )
      .bind(now() + 90, job.id, now())
      .first();
    if (!claimed) return;
    try {
      const order = await env.ORDERS.prepare("SELECT * FROM orders WHERE id=?")
        .bind(job.order_id)
        .first<Row>();
      if (!order) throw new Error("ORDER_MISSING");
      const recipient=mailRecipient(env,settings,job,order);
      await env.ORDERS.prepare('UPDATE outbox SET recipient=? WHERE id=?').bind(recipient,job.id).run();
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
  };
  for(let i=0;i<jobs.length;i+=2)await Promise.all(jobs.slice(i,i+2).map(processJob));
}

export async function mailQueueStatus(env: ShopEnv) {
  const rows=(await env.ORDERS.prepare("SELECT audience,status,COUNT(*) count FROM outbox WHERE EXISTS(SELECT 1 FROM orders o WHERE o.id=outbox.order_id AND o.kind=?) GROUP BY audience,status").bind(env.ORDER_KIND||'shop').all<Row>()).results;
  return {counts:rows};
}
