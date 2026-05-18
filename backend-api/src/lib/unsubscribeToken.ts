import crypto from 'crypto';
import { prisma } from './prisma';

const APP_URL = (process.env.APP_URL ?? 'https://api.boomcard.bg').replace(/\/$/, '');

/** Returns the existing token or generates + persists a new one. */
export async function getOrCreateUnsubscribeToken(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { emailUnsubscribeToken: true },
  });
  if (user?.emailUnsubscribeToken) return user.emailUnsubscribeToken;

  const token = crypto.randomBytes(32).toString('hex');
  await prisma.user.update({ where: { id: userId }, data: { emailUnsubscribeToken: token } });
  return token;
}

export function buildUnsubscribeUrl(token: string): string {
  return `${APP_URL}/api/unsubscribe?token=${token}`;
}

/** Wraps marketing HTML with a standard unsubscribe footer. */
export function addUnsubscribeFooter(html: string, unsubscribeUrl: string): string {
  const footer = `
<div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;text-align:center;font-family:sans-serif;font-size:12px;color:#6b7280;">
  <p style="margin:0 0 6px;">Получавате този имейл, тъй като сте абониран/а за съобщения от BoomCard.</p>
  <p style="margin:0;"><a href="${unsubscribeUrl}" style="color:#6b7280;text-decoration:underline;">Откажете се от маркетингови имейли</a></p>
</div>`;

  if (html.includes('</body>')) return html.replace('</body>', `${footer}\n</body>`);
  return html + footer;
}
