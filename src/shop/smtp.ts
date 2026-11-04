/** OVH submission over implicit TLS only. No credentials or SMTP replies are logged. */
export interface SmtpConfig { host: string; user: string; password: string }
export interface MailMessage { from: string; to: string; replyTo: string; subject: string; text: string; html: string; id: string }
export interface MailSocket {
  opened: Promise<unknown>;
  closed: Promise<unknown>;
  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;
  close(): Promise<void>;
}
export type Connector = (host: string) => Promise<MailSocket>;
export const ovhHosts = ['ssl0.ovh.net', 'smtp.mail.ovh.net'];
const address = (s: string) => /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(s) && s.length <= 254;
export function smtpConfigured(env: { SMTP_HOST?: string; SMTP_USER?: string; SMTP_PASSWORD?: string; MAIL_FROM?: string }) {
  return ovhHosts.includes(env.SMTP_HOST || '') && address(env.SMTP_USER || '') &&
    env.SMTP_USER === env.MAIL_FROM && !!env.SMTP_PASSWORD && env.SMTP_PASSWORD.length <= 1024 && !/[\x00\r\n]/.test(env.SMTP_PASSWORD);
}
const encode = new TextEncoder();
function base64(value: string) {
  const bytes = encode.encode(value);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}
function encodedSubject(value: string) {
  const parts: string[] = [];
  let chunk = '';
  for (const c of value) {
    if (encode.encode(chunk + c).length > 30) { parts.push(chunk); chunk = ''; }
    chunk += c;
  }
  if (chunk) parts.push(chunk);
  return parts.map(p => `=?UTF-8?B?${base64(p)}?=`).join('\r\n ');
}
export async function mimeMessage(m: MailMessage) {
  if (![m.from, m.to, m.replyTo].every(address) || /[\x00-\x1f\x7f]/.test(m.subject) || m.subject.length > 500)
    throw new Error('MAIL_SMTP_CONFIG');
  if (encode.encode(m.text).length + encode.encode(m.html).length > 750000) throw new Error('MAIL_SMTP_SIZE');
  const digest = await crypto.subtle.digest('SHA-256', encode.encode(m.id));
  const hash = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
  const id = `<${hash}@${m.from.split('@')[1]}>`;
  const boundary = `fce_${hash}`;
  const body = (type: string, text: string) => `--${boundary}\r\nContent-Type: ${type}; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${base64(text).match(/.{1,76}/g)?.join('\r\n') || ''}\r\n`;
  const data = `From: FC Escalquens <${m.from}>\r\nTo: <${m.to}>\r\nReply-To: <${m.replyTo}>\r\nSubject: ${encodedSubject(m.subject)}\r\nDate: ${new Date().toUTCString()}\r\nMessage-ID: ${id}\r\nMIME-Version: 1.0\r\nContent-Type: multipart/alternative; boundary="${boundary}"\r\n\r\n${body('text/plain', m.text)}${body('text/html', m.html)}--${boundary}--\r\n`;
  return { id, data };
}
const nativeConnect: Connector = async host => {
  const { connect } = await import('cloudflare:sockets');
  return connect({ hostname: host, port: 465 }, { secureTransport: 'on', allowHalfOpen: false });
};
export async function sendSmtp(config: SmtpConfig, message: MailMessage, connector: Connector = nativeConnect, timeoutMs = 25000) {
  if (!smtpConfigured({ SMTP_HOST: config.host, SMTP_USER: config.user, SMTP_PASSWORD: config.password, MAIL_FROM: message.from }))
    throw new Error('MAIL_SMTP_CONFIG');
  const mime = await mimeMessage(message);
  let socket: MailSocket | undefined;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stage = 'NETWORK';
  const work = async () => {
    socket = await connector(config.host);
    void socket.closed.catch(() => {});
    if (stopped) { await socket.close().catch(() => {}); throw new Error('MAIL_SMTP_TIMEOUT'); }
    await socket.opened;
    const reader = socket.readable.getReader(), writer = socket.writable.getWriter();
    const decoder = new TextDecoder();
    let buffer = '';
    async function reply(expected: number[]) {
      let code = '', total = 0;
      const lines: string[] = [];
      for (let count = 0; count < 100; count++) {
        while (!buffer.includes('\r\n')) {
          if (buffer.length > 4096) throw new Error('MAIL_SMTP_PROTOCOL');
          const next = await reader.read();
          if (next.done) throw new Error(`MAIL_SMTP_${stage}`);
          buffer += decoder.decode(next.value, { stream: true });
          if (buffer.length > 65536) throw new Error('MAIL_SMTP_PROTOCOL');
        }
        const end = buffer.indexOf('\r\n'), line = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        total += line.length;
        if (line.length > 4096 || total > 65536 || !/^\d{3}[ -]/.test(line)) throw new Error('MAIL_SMTP_PROTOCOL');
        if (code && code !== line.slice(0, 3)) throw new Error('MAIL_SMTP_PROTOCOL');
        code = line.slice(0, 3);
        lines.push(line.slice(4));
        if (line[3] === ' ') {
          if (!expected.includes(Number(code))) throw new Error(`MAIL_SMTP_${stage}`);
          return { code: Number(code), lines };
        }
      }
      throw new Error('MAIL_SMTP_PROTOCOL');
    }
    async function command(value: string, expected: number[]) {
      if (stopped) throw new Error('MAIL_SMTP_TIMEOUT');
      await writer.write(encode.encode(value + '\r\n'));
      return reply(expected);
    }
    await reply([220]);
    const hello = await command('EHLO fcescalquens.fr', [250]);
    const auth = hello.lines.filter(l => /^AUTH[ =]/i.test(l)).join(' ').toUpperCase();
    stage = 'AUTH';
    if (/\bPLAIN\b/.test(auth)) {
      const credentials = base64(`\0${config.user}\0${config.password}`);
      const response = await command(`AUTH PLAIN ${credentials}`, [235, 334]);
      if (response.code === 334) await command(credentials, [235]);
    } else if (/\bLOGIN\b/.test(auth)) {
      await command('AUTH LOGIN', [334]);
      await command(base64(config.user), [334]);
      await command(base64(config.password), [235]);
    } else throw new Error('MAIL_SMTP_AUTH');
    stage = 'SEND';
    await command(`MAIL FROM:<${message.from}>`, [250]);
    stage = 'RECIPIENT';
    await command(`RCPT TO:<${message.to}>`, [250, 251]);
    stage = 'SEND';
    await command('DATA', [354]);
    // All user content is base64; no body can inject an SMTP dot terminator.
    await writer.write(encode.encode(mime.data + '.\r\n'));
    await reply([250]);
    // Acceptance is authoritative. A QUIT/close failure must not trigger a duplicate.
    void writer.write(encode.encode('QUIT\r\n')).catch(() => {});
    return mime.id;
  };
  try {
    return await Promise.race([
      work(),
      new Promise<never>((_, reject) => { timer = setTimeout(() => { stopped = true; reject(new Error('MAIL_SMTP_TIMEOUT')); }, timeoutMs); }),
    ]);
  } catch (error) {
    if (error instanceof Error && /^MAIL_SMTP_[A-Z]+$/.test(error.message)) throw error;
    throw new Error(`MAIL_SMTP_${stage}`);
  } finally {
    stopped = true;
    if (timer !== undefined) clearTimeout(timer);
    if (socket) void socket.close().catch(() => {});
  }
}
