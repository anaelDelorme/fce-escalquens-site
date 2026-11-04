import { escapeHtml, euros } from './domain';

export interface MailContent {
  section: string;
  title: string;
  introduction: string;
  reference?: string;
  greeting?: string;
  facts?: [string, string][];
  items?: { name: string; details: string; quantity: number; total: number }[];
  total?: number;
  note?: string;
  paragraphs?: string[];
  answers?: [string, string][];
  action?: { label: string; url: string; help: string };
  contact: string;
  privacyUrl: string;
  terms?: string;
}
const lines = (value: string) => escapeHtml(value).replace(/\r?\n/g, '<br>');
const paragraph = (value: string) => `<p style="margin:0 0 18px;line-height:1.65">${lines(value)}</p>`;
const facts = (rows: [string, string][]) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:6px 0 24px">${rows.map(([label,value])=>`<tr><td width="40%" valign="top" style="padding:10px 12px 10px 0;border-bottom:1px solid #e8e0d9;color:#71645f;font-size:14px">${escapeHtml(label)}</td><td valign="top" style="padding:10px 0;border-bottom:1px solid #e8e0d9;font-size:15px;font-weight:bold;overflow-wrap:anywhere">${lines(value)}</td></tr>`).join('')}</table>`;

/** Table layout and inline styles also work in mail clients without modern CSS. */
export function renderMail(content: MailContent) {
  const c = content;
  const items = c.items?.length ? `<h2 style="font-size:18px;margin:26px 0 12px">Votre sélection</h2><table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><thead><tr><th align="left" scope="col" style="padding:10px 0;border-bottom:2px solid #9f1a1a;font-size:12px;color:#71645f">ARTICLE</th><th align="center" scope="col" style="padding:10px 8px;border-bottom:2px solid #9f1a1a;font-size:12px;color:#71645f">QTÉ</th><th align="right" scope="col" style="padding:10px 0;border-bottom:2px solid #9f1a1a;font-size:12px;color:#71645f">TOTAL</th></tr></thead><tbody>${c.items.map(i=>`<tr><td valign="top" style="padding:16px 8px 16px 0;border-bottom:1px solid #e8e0d9"><strong>${escapeHtml(i.name)}</strong>${i.details?`<br><span style="font-size:13px;line-height:1.6;color:#71645f">${lines(i.details)}</span>`:''}</td><td align="center" valign="top" style="padding:16px 8px;border-bottom:1px solid #e8e0d9">${i.quantity}</td><td align="right" valign="top" style="padding:16px 0;border-bottom:1px solid #e8e0d9;white-space:nowrap;font-weight:bold">${escapeHtml(euros(i.total))}</td></tr>`).join('')}</tbody></table>` : '';
  const total = c.total == null ? '' : `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0 24px;background:#f7f2eb"><tr><td style="padding:18px;font-weight:bold">Montant total</td><td align="right" style="padding:18px;color:#9f1a1a;font-size:24px;font-weight:bold;white-space:nowrap">${escapeHtml(euros(c.total))}</td></tr></table>`;
  const action = c.action ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:26px 0 14px"><tr><td bgcolor="#9f1a1a" style="border-radius:8px;text-align:center"><a href="${escapeHtml(c.action.url)}" style="display:inline-block;padding:16px 24px;color:#ffffff;text-decoration:none;font-size:16px;line-height:1.5;font-weight:bold;border:1px solid #9f1a1a;border-radius:8px">${escapeHtml(c.action.label)} →</a></td></tr></table><p style="font-size:12px;color:#71645f;line-height:1.6;margin:0 0 24px">${escapeHtml(c.action.help)}</p>` : '';
  const terms = c.terms ? `<div style="border-top:1px solid #e8e0d9;padding-top:22px;margin-top:28px;font-size:11px;color:#71645f;line-height:1.6"><h2 style="font-size:13px;margin:0 0 12px">Conditions acceptées lors de la validation</h2>${paragraph(c.terms)}</div>` : '';
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(c.title)}</title></head><body style="margin:0;padding:0;background:#f3eee7;color:#292421;font-family:Arial,Helvetica,sans-serif;font-size:16px"><div style="display:none;max-height:0;overflow:hidden;mso-hide:all">${escapeHtml(c.introduction)}</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#ffffff;border:1px solid #e8e0d9;border-radius:12px;overflow:hidden"><tr><td bgcolor="#781522" style="padding:24px 28px;border-bottom:4px solid #e8bf30"><p style="margin:0;color:#ffffff;font-size:19px;font-weight:bold;letter-spacing:1px">FC ESCALQUENS</p><p style="margin:7px 0 0;color:#f7df9b;font-size:12px;letter-spacing:1.5px;text-transform:uppercase">${escapeHtml(c.section)}</p></td></tr><tr><td style="padding:28px;overflow-wrap:anywhere">${c.reference?`<p style="margin:0 0 12px;font-size:12px;color:#9f1a1a;letter-spacing:1px;font-weight:bold">${escapeHtml(c.reference)}</p>`:''}<h1 style="font-size:27px;line-height:1.25;margin:0 0 24px;color:#34151a">${escapeHtml(c.title)}</h1>${c.greeting?paragraph(c.greeting):''}${paragraph(c.introduction)}${c.note?`<div style="padding:16px 18px;background:#fff8dd;border-left:4px solid #e8bf30;margin:20px 0">${paragraph(c.note)}</div>`:''}${c.facts?.length?facts(c.facts):''}${items}${total}${action}${(c.paragraphs||[]).map(paragraph).join('')}${c.answers?.length?`<h2 style="font-size:18px;margin:26px 0 12px">Informations transmises</h2>${facts(c.answers)}`:''}<p style="margin:26px 0 0;font-size:14px;line-height:1.65">Le club reste à votre écoute :<br><a href="mailto:${escapeHtml(c.contact)}" style="color:#9f1a1a;font-weight:bold">${escapeHtml(c.contact)}</a></p>${terms}</td></tr><tr><td style="padding:20px 28px;background:#faf7f1;color:#71645f;font-size:12px;line-height:1.7">FC Escalquens · Aux couleurs du club<br><a href="${escapeHtml(c.privacyUrl)}" style="color:#71645f">Informations sur vos données personnelles</a></td></tr></table></td></tr></table></body></html>`;
  const text = [
    `FC ESCALQUENS · ${c.section}`, c.title, c.reference, c.greeting, c.introduction, c.note,
    c.facts?.map(([label,value])=>`${label} : ${value}`).join('\n'),
    c.items?.map(i=>`${i.quantity} × ${i.name}${i.details?'\n'+i.details:''}\nTotal : ${euros(i.total)}`).join('\n\n'),
    c.total == null ? '' : `Montant total : ${euros(c.total)}`,
    c.action ? `${c.action.label} : ${c.action.url}\n${c.action.help}` : '',
    ...(c.paragraphs||[]), c.answers?.map(([label,value])=>`${label} : ${value}`).join('\n'),
    `Contact : ${c.contact}\nVos données personnelles : ${c.privacyUrl}`,
    c.terms ? `Conditions acceptées lors de la validation\n\n${c.terms}` : '',
  ].filter(Boolean).join('\n\n');
  return { html, text };
}
