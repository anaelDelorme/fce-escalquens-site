import type { ShopEnv } from './service';
import { smtpConfigured } from './smtp';
export function mailTransportReady(env: ShopEnv) {
  return !!env.MAIL_FROM && (
    env.MAIL_PROVIDER === 'cloudflare' ? !!env.EMAIL :
    env.MAIL_PROVIDER === 'resend' ? !!env.RESEND_API_KEY :
    env.MAIL_PROVIDER === 'ovh' && smtpConfigured(env)
  );
}
export function mailReady(env: ShopEnv) {
  return mailTransportReady(env) && (env.APP_ENV === 'production' || !!env.MAIL_TEST_TO);
}
