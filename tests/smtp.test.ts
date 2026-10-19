import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { sendSmtp, mimeMessage, smtpConfigured, type MailSocket } from '../src/shop/smtp';
import { mailReady } from '../src/shop/mail-config';
const config = { host: 'ssl0.ovh.net', user: 'contact@fcescalquens.fr', password: 'fixture-only-password' };
const message = { id: 'order-1-created', from: config.user, to: 'tester@example.org', replyTo: config.user, subject: '[TEST] Votre commande — été', text: 'Bonjour éàê\n.\r\nQUIT\r\nMerci', html: '<p>Bonjour été</p>' };
function server(mode = 'plain') {
  const sent: string[] = []; let closed = false; let controller: ReadableStreamDefaultController<Uint8Array>; let data = false; let login = 0;
  const push = (value: string) => {
    // Fragment every reply across chunks, including its CRLF.
    const bytes = new TextEncoder().encode(value); controller.enqueue(bytes.slice(0, 3)); controller.enqueue(bytes.slice(3));
  };
  const socket: MailSocket = {
    opened: Promise.resolve(), closed: Promise.resolve(),
    readable: new ReadableStream({ start(c) { controller = c; if (mode !== 'timeout') push('220 OVH ready\r\n'); } }),
    writable: new WritableStream({ write(bytes) {
      const command = new TextDecoder().decode(bytes); sent.push(command);
      if (data) { assert.ok(command.endsWith('\r\n.\r\n')); data = false; push(mode === 'data-failed' ? '554 PRIVATE_LINK\r\n' : '250 queued\r\n'); }
      else if (command.startsWith('EHLO')) push(`250-OVH\r\n250-AUTH ${mode === 'login' ? 'LOGIN' : mode === 'no-auth' ? 'CRAM-MD5' : 'PLAIN LOGIN'}\r\n250 SIZE 1000000\r\n`);
      else if (command.startsWith('AUTH PLAIN')) push(mode === 'auth-failed' ? '535 PRIVATE_PASSWORD\r\n' : mode === 'challenge' ? '334 \r\n' : '235 authenticated\r\n');
      else if (command === 'AUTH LOGIN\r\n') { login = 1; push('334 username\r\n'); }
      else if (login === 1) { assert.equal(atob(command.trim()), config.user); login = 2; push('334 password\r\n'); }
      else if (login === 2 || mode === 'challenge' && command.trim() === btoa(`\0${config.user}\0${config.password}`)) { login = 0; push('235 authenticated\r\n'); }
      else if (command.startsWith('MAIL FROM')) push('250 sender ok\r\n');
      else if (command.startsWith('RCPT TO')) push(mode === 'recipient-failed' ? '550 PRIVATE_RECIPIENT\r\n' : '250 recipient ok\r\n');
      else if (command === 'DATA\r\n') { data = true; push('354 go\r\n'); }
      else if (command === 'QUIT\r\n') throw new Error('private close error');
      else throw new Error('Unexpected SMTP command');
    } }),
    async close() { if (!closed) { closed = true; controller.close(); } },
  };
  return { socket, sent, closed: () => closed };
}
for (const mode of ['plain', 'challenge', 'login']) test(`SMTP OVH : AUTH ${mode}, MIME UTF-8 et fermeture après acceptation`, async () => {
  const fixture = server(mode);
  const id = await sendSmtp(config, message, async host => { assert.equal(host, config.host); return fixture.socket; });
  assert.match(id, /^<[a-f0-9]{64}@fcescalquens.fr>$/);
  assert.ok(fixture.closed());
  assert.ok(fixture.sent.some(s => s.startsWith(`RCPT TO:<${message.to}>`)));
  const payload = fixture.sent.find(s => s.startsWith('From:'))!;
  assert.match(payload, /multipart\/alternative/); assert.match(payload, /Subject: =\?UTF-8\?B\?/);
  assert.ok(payload.includes(Buffer.from(message.text).toString('base64')));
  assert.equal(fixture.sent.filter(s => s === 'DATA\r\n').length, 1);
  assert.doesNotMatch(payload, /fixture-only-password|\r\nQUIT\r\n/);
});
for (const [mode, expected] of [['auth-failed', 'AUTH'], ['no-auth', 'AUTH'], ['recipient-failed', 'RECIPIENT'], ['data-failed', 'SEND']]) test(`SMTP : refus ${mode} sans fuite de réponse OVH`, async () => {
  const fixture = server(mode);
  await assert.rejects(sendSmtp(config, message, async () => fixture.socket), { message: `MAIL_SMTP_${expected}` });
  assert.ok(fixture.closed());
  if (expected === 'AUTH') assert.ok(!fixture.sent.some(s => s.startsWith('MAIL FROM')));
});
test('SMTP : délai borné, connexion fermée, aucun identifiant envoyé', async () => {
  const fixture = server('timeout');
  await assert.rejects(sendSmtp(config, message, async () => fixture.socket, 15), { message: 'MAIL_SMTP_TIMEOUT' });
  assert.ok(fixture.closed()); assert.equal(fixture.sent.length, 0);
});
test('SMTP : réseau et négociation TLS échoués sans divulgation du détail', async () => {
  await assert.rejects(sendSmtp(config, message, async () => { throw new Error('PRIVATE_PASSWORD'); }), { message: 'MAIL_SMTP_NETWORK' });
  const fixture = server(); fixture.socket.opened = Promise.reject(new Error('TLS private error')); void fixture.socket.opened.catch(() => {});
  await assert.rejects(sendSmtp(config, message, async () => fixture.socket), { message: 'MAIL_SMTP_NETWORK' });
  assert.equal(fixture.sent.length, 0); assert.ok(fixture.closed());
});
test('SMTP : MIME stable, accents, refus des injections et hôtes arbitraires', async () => {
  assert.equal((await mimeMessage(message)).id, (await mimeMessage(message)).id);
  const long = await mimeMessage({ ...message, subject: 'é'.repeat(200) });
  for (const line of long.data.split('\r\n')) assert.ok(line.length <= 998);
  for (const changed of [{ to: 'test@example.org\r\nBcc: victim@example.org' }, { from: 'other@example.org' }, { subject: 'Sujet\r\nBcc: x@example.org' }]) {
    await assert.rejects(sendSmtp(config, { ...message, ...changed }, async () => { throw new Error('must not connect'); }), { message: 'MAIL_SMTP_CONFIG' });
  }
  await assert.rejects(sendSmtp({ ...config, host: 'localhost' }, message), { message: 'MAIL_SMTP_CONFIG' });
  await assert.rejects(mimeMessage({ ...message, text: 'x'.repeat(750001) }), { message: 'MAIL_SMTP_SIZE' });
});
test('SMTP : disponibilité commune boutique/tournois et garde du destinataire staging', () => {
  const env: any = { APP_ENV: 'staging', MAIL_PROVIDER: 'ovh', MAIL_FROM: config.user, SMTP_HOST: config.host, SMTP_USER: config.user, SMTP_PASSWORD: config.password, MAIL_TEST_TO: config.user };
  assert.equal(mailReady(env), true);
  assert.equal(mailReady({ ...env, SMTP_PASSWORD: '' }), false);
  assert.equal(mailReady({ ...env, MAIL_FROM: 'wrong@example.org' }), false);
  assert.equal(mailReady({ ...env, MAIL_TEST_TO: '' }), false);
  assert.equal(mailReady({ ...env, APP_ENV: 'production', MAIL_TEST_TO: '' }), true);
  assert.equal(smtpConfigured({ ...env, SMTP_HOST: 'evil.example.org' }), false);
});
test('configuration OVH : conserve les bases, Access, HelloAsso et les paramètres production', () => {
  const folder = mkdtempSync(join(tmpdir(), 'fce-ovh-'));
  try {
    const path = join(folder, 'config.json');
    const before = { vars: { MAIL_PROVIDER: 'resend' }, d1_databases: [{ binding: 'DB', database_id: 'prod' }], env: { staging: { vars: { CF_ACCESS_SHOP_AUD: 'access', HELLOASSO_ORGANIZATION_SLUG: 'fce' }, d1_databases: [{ binding: 'ORDERS', database_id: 'staging-orders' }] } } };
    writeFileSync(path, JSON.stringify(before));
    execFileSync(process.execPath, ['scripts/configure-ovh-mail.mjs', '--config', path]);
    const after = JSON.parse(readFileSync(path, 'utf8'));
    assert.deepEqual(after.vars, before.vars); assert.deepEqual(after.d1_databases, before.d1_databases);
    assert.deepEqual(after.env.staging.d1_databases, before.env.staging.d1_databases);
    assert.equal(after.env.staging.vars.CF_ACCESS_SHOP_AUD, 'access');
    assert.equal(after.env.staging.vars.HELLOASSO_ORGANIZATION_SLUG, 'fce');
    assert.equal(after.env.staging.vars.MAIL_TEST_TO, 'contact@fcescalquens.fr');
    assert.equal(after.env.staging.vars.SMTP_PASSWORD, undefined);
  } finally { rmSync(folder, { recursive: true, force: true }); }
});
