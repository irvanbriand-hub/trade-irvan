// Akses sekali via browser setelah deploy:
// https://tradeirvan.vercel.app/api/setup-webhook

export default async function handler(req: any, res: any) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    return res.status(500).json({ error: 'TELEGRAM_BOT_TOKEN not set' });
  }

  const webhookUrl = 'https://tradeirvan.vercel.app/api/telegram-webhook';

  const response = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: webhookUrl }),
  });

  const data = await response.json();
  return res.json(data);
}
