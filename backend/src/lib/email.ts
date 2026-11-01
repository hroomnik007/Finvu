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
      <h2 style="color:#7C3AED">Vitaj vo Finvu!</h2>
      <p>Klikni na odkaz nižšie a over svoj email:</p>
      <a href="${link}" style="display:inline-block;background:#7C3AED;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;margin:16px 0">
        Overiť email
      </a>
      <p style="color:#666;font-size:13px">Odkaz je platný na jedno použitie. Ak registrácia nepochádza od teba, tento email ignoruj.</p>
    </div>
  `;
}

export function resetPasswordEmailText(token: string): string {
  const link = `${env.APP_URL}/#reset-password?token=${token}`;
  return `Ahoj,

Dostali sme žiadosť o obnovu hesla k tvojmu účtu FinVu.

Klikni na odkaz nižšie a nastav si nové heslo:
${link}

Odkaz je platný 1 hodinu.

Ak žiadosť o obnovu nepochádza od teba, tento email ignoruj.

Tím FinVu`;
}

export function resetPasswordEmailHtml(token: string): string {
  const link = `${env.APP_URL}/#reset-password?token=${token}`;
  return `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
      <h2 style="color:#7C3AED">Obnova hesla — FinVu</h2>
      <p>Ahoj,</p>
      <p>Dostali sme žiadosť o obnovu hesla k tvojmu účtu FinVu.</p>
      <p>Klikni na odkaz nižšie a nastav si nové heslo:</p>
      <a href="${link}" style="display:inline-block;background:#7C3AED;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;margin:16px 0">
        Obnoviť heslo
      </a>
      <p style="color:#666;font-size:13px">Odkaz je platný 1 hodinu.</p>
      <p style="color:#666;font-size:13px">Ak žiadosť o obnovu nepochádza od teba, tento email ignoruj.</p>
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
      <p>Niekto sa práve pokúsil zaregistrovať s touto emailovou adresou, ale účet s ňou už máš.</p>
      <p>Ak si to ty, stačí sa prihlásiť. Ak si nepamätáš heslo, na prihlasovacej stránke si ho môžeš obnoviť.</p>
      <a href="${loginLink}" style="display:inline-block;background:#7C3AED;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;margin:16px 0">
        Prihlásiť sa
      </a>
      <p style="color:#666;font-size:13px">Ak to nie si ty, tento email môžeš ignorovať. Tvoj účet sa nezmenil.</p>
    </div>
  `;
}
