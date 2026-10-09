import nodemailer from 'nodemailer';
import type { Env } from '../config/env.js';

/** Token de inyección del transporte de correo (`null` cuando el correo está desactivado). */
export const MAIL_TRANSPORTER = 'MAIL_TRANSPORTER';

export interface MailMessage {
  from: string;
  to: string;
  subject: string;
  text: string;
}

export interface MailTransporter {
  sendMail(message: MailMessage): Promise<unknown>;
}

export function createMailTransporter(env: Env): MailTransporter | null {
  if (env.MAIL_TRANSPORT !== 'smtp') return null;
  return nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth:
      env.SMTP_USER && env.SMTP_PASSWORD
        ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD }
        : undefined,
  });
}
