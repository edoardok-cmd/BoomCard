import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';

const router = Router();

const PAGE = (title: string, body: string) => `<!DOCTYPE html>
<html lang="bg">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title} — BoomCard</title>
  <style>
    body { margin: 0; font-family: sans-serif; background: #f9fafb; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .card { background: #fff; border-radius: 12px; padding: 40px 32px; max-width: 440px; width: 100%; text-align: center; box-shadow: 0 2px 12px rgba(0,0,0,.08); }
    h1 { font-size: 22px; margin: 0 0 12px; color: #111; }
    p  { font-size: 15px; color: #6b7280; margin: 0; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${title}</h1>
    <p>${body}</p>
  </div>
</body>
</html>`;

/**
 * GET /api/unsubscribe?token=<emailUnsubscribeToken>
 *
 * One-click unsubscribe from marketing emails (GDPR Art. 7 + RFC 8058).
 * Idempotent — clicking the link twice is harmless.
 * No authentication required; the token acts as a bearer credential.
 */
router.get('/', async (req: Request, res: Response) => {
  const token = typeof req.query.token === 'string' ? req.query.token.trim() : '';

  if (!token) {
    return res.status(400).send(
      PAGE('Невалиден линк', 'Линкът за отписване е невалиден или е изтекъл.'),
    );
  }

  let user: { id: string; marketingConsentEmail: boolean } | null = null;

  try {
    user = await prisma.user.findUnique({
      where: { emailUnsubscribeToken: token },
      select: { id: true, marketingConsentEmail: true },
    });
  } catch (err) {
    logger.error('[unsubscribe] DB lookup failed:', err);
    return res.status(500).send(
      PAGE('Грешка', 'Моля, опитайте отново по-късно.'),
    );
  }

  if (!user) {
    return res.status(404).send(
      PAGE('Линкът не е намерен', 'Линкът вече не е активен или е невалиден.'),
    );
  }

  try {
    if (user.marketingConsentEmail) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          marketingConsentEmail: false,
          marketingConsentEmailAt: new Date(),
        },
      });
      logger.info(`[unsubscribe] user ${user.id} opted out of marketing emails`);
    }
  } catch (err) {
    logger.error('[unsubscribe] DB update failed:', err);
    return res.status(500).send(
      PAGE('Грешка', 'Не успяхме да запишем промяната. Моля, опитайте отново.'),
    );
  }

  return res.send(
    PAGE(
      'Отписан/а успешно',
      'Вие успешно се отписахте от маркетингови имейли от BoomCard.<br>Трансакционните имейли (плащания, потвърждения) ще продължат да пристигат.',
    ),
  );
});

export default router;
