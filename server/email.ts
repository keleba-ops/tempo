import fs from 'node:fs';
import path from 'node:path';
import nodemailer, { type Transporter } from 'nodemailer';
import type { DatabaseSync } from 'node:sqlite';
import { escapeHtml, nowIso, uid } from './utils.js';

const APP_URL = (process.env.APP_URL || 'http://localhost:4200').replace(/\/$/, '');
const FROM = process.env.SMTP_FROM || 'Tempo <hello@tempo.local>';

/** Splits "Name <addr@x.com>" into parts for API providers. */
function parseFrom(value: string): { name: string; email: string } {
  const m = value.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  return m ? { name: m[1].trim() || 'Tempo', email: m[2].trim() } : { name: 'Tempo', email: value.trim() };
}

/** HTTPS delivery via Brevo. Used when BREVO_API_KEY is set (hosts like Railway block outbound SMTP). */
async function sendViaBrevo(to: string, subject: string, html: string, text: string): Promise<void> {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': process.env.BREVO_API_KEY!, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ sender: parseFrom(FROM), to: [{ email: to }], subject, htmlContent: html, textContent: text }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Brevo ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

let transporter: Transporter | null = null;
let transporterChecked = false;

function getTransporter(): Transporter | null {
  if (transporterChecked) return transporter;
  transporterChecked = true;
  if (!process.env.SMTP_HOST) return null;
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || '' }
      : undefined,
  });
  return transporter;
}

export interface EmailContent {
  kicker?: string;
  heading: string;
  intro: string;
  details?: { label: string; value: string }[];
  ctaLabel?: string;
  ctaUrl?: string;
  footnote?: string;
}

export function renderEmail(content: EmailContent): { html: string; text: string } {
  const accent = '#c9633f';
  const details = content.details?.length
    ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:24px 0;background:#f6f2e9;border-radius:12px;border:1px solid #e8e1d2;">
        ${content.details
          .map(
            (d) => `<tr>
              <td style="padding:11px 18px;color:#74766c;font:500 13px/1.4 Arial,sans-serif;width:38%;">${escapeHtml(d.label)}</td>
              <td style="padding:11px 18px;color:#20251f;font:600 13px/1.4 Arial,sans-serif;text-align:right;">${escapeHtml(d.value)}</td>
            </tr>`,
          )
          .join('')}
      </table>`
    : '';
  const cta =
    content.ctaUrl && content.ctaLabel
      ? `<a href="${escapeHtml(APP_URL + content.ctaUrl)}" style="display:inline-block;background:${accent};color:#fffaf2;text-decoration:none;padding:13px 22px;border-radius:10px;font:600 14px/1 Arial,sans-serif;">${escapeHtml(content.ctaLabel)}</a>`
      : '';
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3efe6;">
  <div style="display:none;max-height:0;overflow:hidden;">${escapeHtml(content.intro)}</div>
  <div style="max-width:580px;margin:0 auto;padding:40px 18px;">
    <div style="text-align:center;padding-bottom:24px;">
      <span style="font:600 22px/1 Georgia,serif;letter-spacing:-.02em;color:#20251f;">tempo<span style="color:${accent};">.</span></span>
    </div>
    <div style="background:#fffdf8;border:1px solid #e6dfd1;border-radius:18px;padding:38px 34px;box-shadow:0 8px 30px rgba(38,40,32,.05);">
      ${content.kicker ? `<div style="font:700 10px/1 Arial,sans-serif;letter-spacing:.16em;text-transform:uppercase;color:${accent};margin-bottom:14px;">${escapeHtml(content.kicker)}</div>` : ''}
      <h1 style="margin:0 0 12px;font:400 32px/1.1 Georgia,serif;letter-spacing:-.02em;color:#20251f;">${escapeHtml(content.heading)}</h1>
      <p style="margin:0;color:#686b61;font:400 15px/1.65 Arial,sans-serif;">${escapeHtml(content.intro)}</p>
      ${details}
      ${cta ? `<div style="margin-top:8px;">${cta}</div>` : ''}
      ${content.footnote ? `<p style="margin:24px 0 0;padding-top:20px;border-top:1px solid #ece6da;color:#8a8b82;font:400 12px/1.6 Arial,sans-serif;">${escapeHtml(content.footnote)}</p>` : ''}
    </div>
    <p style="text-align:center;color:#96968b;font:400 11px/1.6 Arial,sans-serif;margin-top:24px;">Sent by Tempo · A Verge Dynamics product<br>You can manage email preferences in your account.</p>
  </div>
</body></html>`;

  const text = [
    content.heading,
    '',
    content.intro,
    ...(content.details || []).map((d) => `${d.label}: ${d.value}`),
    content.ctaUrl ? `\n${content.ctaLabel}: ${APP_URL}${content.ctaUrl}` : '',
    content.footnote ? `\n${content.footnote}` : '',
    '\n— Tempo, built by Verge Dynamics',
  ].join('\n');
  return { html, text };
}

export async function deliverEmail(
  db: DatabaseSync,
  opts: {
    userId: string | null;
    to: string;
    subject: string;
    kind: string;
    content: EmailContent;
    /** Secrets (e.g. temporary passwords) to mask in the stored outbox copy and dev preview file. */
    redact?: string[];
  },
): Promise<'sent' | 'failed' | 'logged'> {
  const { html, text } = renderEmail(opts.content);
  const mask = (value: string) => (opts.redact ?? []).reduce((acc, secret) => (secret ? acc.split(secret).join('••••••••') : acc), value);
  const id = uid();
  let status = 'logged';
  let error: string | null = null;

  const transport = process.env.BREVO_API_KEY ? null : getTransporter();
  if (process.env.BREVO_API_KEY || transport) {
    try {
      if (process.env.BREVO_API_KEY) await sendViaBrevo(opts.to, opts.subject, html, text);
      else await transport!.sendMail({ from: FROM, to: opts.to, subject: opts.subject, html, text });
      status = 'sent';
      console.log(`[tempo] email '${opts.kind}' sent (id=${id})`);
    } catch (err) {
      status = 'failed';
      error = err instanceof Error ? err.message : 'Unknown delivery error';
      // Logs carry no recipient data: just the outbox id, an error code and a sanitized, truncated reason.
      const code = (err as { code?: string })?.code ?? 'unknown';
      const reason = error.replace(/[^\s"'<>]+@[^\s"'<>]+/g, '[email]').slice(0, 80);
      console.error(`[tempo] email '${opts.kind}' failed (id=${id}, code=${code}): ${reason}`);
    }
  } else {
    try {
      const dir = path.resolve(process.cwd(), 'data', 'emails');
      fs.mkdirSync(dir, { recursive: true });
      const filename = `${new Date().toISOString().replace(/[:.]/g, '-')}-${id.slice(0, 8)}.html`;
      fs.writeFileSync(path.join(dir, filename), process.env.NODE_ENV === 'production' ? mask(html) : html, 'utf8');
    } catch {
      // The outbox remains the source of truth if the dev preview cannot be written.
    }
  }

  db.prepare(
    'INSERT INTO email_outbox (id, user_id, to_email, subject, html, text, kind, status, error, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(id, opts.userId, opts.to, opts.subject, mask(html), mask(text), opts.kind, status, error, nowIso());
  return status as 'sent' | 'failed' | 'logged';
}
