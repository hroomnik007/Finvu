import nodemailer from "nodemailer";
import { env } from "../config/env";

const transporter = env.SMTP_HOST
  ? nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    })
  : null;

export async function sendEmail(to: string, subject: string, html: string, text?: string): Promise<void> {
  if (!transporter) {
    console.log(`[email] SMTP not configured. To: ${to} | Subject: ${subject}`);
    return;
  }
  await transporter.sendMail({ from: env.SMTP_FROM, to, subject, html, ...(text ? { text } : {}) });
}

export function verificationEmailHtml(token: string): string {
  const link = `${env.APP_URL}/#verify-email?token=${token}`;
  return `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
      <h2 style="color:#7C3AED">Vitajte vo Finvu!</h2>
      <p>Kliknite na odkaz nižšie pre overenie vášho emailu:</p>
      <a href="${link}" style="display:inline-block;background:#7C3AED;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;margin:16px 0">
        Overiť email
      </a>
      <p style="color:#666;font-size:13px">Odkaz je platný na jedno použitie. Ak ste sa nezaregistrovali, ignorujte tento email.</p>
    </div>
  `;
}

export function resetPasswordEmailText(token: string): string {
  const link = `${env.APP_URL}/#reset-password?token=${token}`;
  return `Dobrý deň,

Dostali sme žiadosť o obnovu hesla pre váš účet FinVu.

Kliknite na odkaz nižšie pre nastavenie nového hesla:
${link}

Odkaz je platný 1 hodinu.

Ak ste túto žiadosť nezaslali, ignorujte tento email.

Tím FinVu`;
}

export function resetPasswordEmailHtml(token: string): string {
  const link = `${env.APP_URL}/#reset-password?token=${token}`;
  return `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
      <h2 style="color:#7C3AED">Obnova hesla — FinVu</h2>
      <p>Dobrý deň,</p>
      <p>Dostali sme žiadosť o obnovu hesla pre váš účet FinVu.</p>
      <p>Kliknite na odkaz nižšie pre nastavenie nového hesla:</p>
      <a href="${link}" style="display:inline-block;background:#7C3AED;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;margin:16px 0">
        Obnoviť heslo
      </a>
      <p style="color:#666;font-size:13px">Odkaz je platný 1 hodinu.</p>
      <p style="color:#666;font-size:13px">Ak ste túto žiadosť nezaslali, ignorujte tento email.</p>
      <p>Tím FinVu</p>
    </div>
  `;
}

// Sent instead of a verification link when someone registers with an address
// that already has an account, so the register response can stay the same for
// new and existing emails.
export function accountExistsEmailHtml(): string {
  const loginLink = `${env.APP_URL}/`;
  return `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
      <h2 style="color:#7C3AED">Finvu — účet už existuje</h2>
      <p>Niekto sa práve pokúsil zaregistrovať s touto emailovou adresou, ale účet s ňou už máte.</p>
      <p>Ak ste to boli vy, stačí sa prihlásiť. Ak si nepamätáte heslo, na prihlasovacej stránke si ho môžete obnoviť.</p>
      <a href="${loginLink}" style="display:inline-block;background:#7C3AED;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;margin:16px 0">
        Prihlásiť sa
      </a>
      <p style="color:#666;font-size:13px">Ak ste to neboli vy, tento email môžete ignorovať. Váš účet sa nezmenil.</p>
    </div>
  `;
}
