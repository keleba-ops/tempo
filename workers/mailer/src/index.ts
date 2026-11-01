import { WorkerMailer } from 'worker-mailer';

interface Env {
  SMTP_USER: string;
  SMTP_PASS: string;
  MAILER_SECRET: string;
}

const EMAIL = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;

function safeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const x = enc.encode(a), y = enc.encode(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i]! ^ y[i]!;
  return diff === 0;
}

/**
 * Relays Tempo's transactional email through Gmail over HTTPS, because Railway blocks outbound SMTP.
 * Only accepts a shared-secret bearer token, sends from one fixed address, and one recipient per call.
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
    const auth = request.headers.get('authorization') ?? '';
    if (!env.MAILER_SECRET || !safeEqual(auth, `Bearer ${env.MAILER_SECRET}`)) return new Response('Unauthorized', { status: 401 });
    if (Number(request.headers.get('content-length') ?? 0) > 200_000) return new Response('Too large', { status: 413 });

    let body: { to?: string; subject?: string; html?: string; text?: string };
    try { body = await request.json(); } catch { return new Response('Bad JSON', { status: 400 }); }
    const { to, subject, html, text } = body;
    if (typeof to !== 'string' || !EMAIL.test(to) || to.length > 200) return new Response('Bad recipient', { status: 400 });
    if (typeof subject !== 'string' || !subject || subject.length > 200 || /[\r\n]/.test(subject)) return new Response('Bad subject', { status: 400 });
    if (typeof html !== 'string' || typeof text !== 'string') return new Response('Bad body', { status: 400 });

    try {
      await WorkerMailer.send(
        {
          host: 'smtp.gmail.com',
          port: 587,
          secure: false,
          startTls: true,
          credentials: { username: env.SMTP_USER, password: env.SMTP_PASS },
          authType: 'plain',
        },
        { from: { name: 'Tempo', email: env.SMTP_USER }, to: { email: to }, subject, text, html },
      );
      return Response.json({ ok: true });
    } catch (err) {
      // No recipient or message content in the error returned to the caller.
      console.error('mail send failed', err instanceof Error ? err.name : 'error');
      return new Response('Send failed', { status: 502 });
    }
  },
};
