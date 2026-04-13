export default async function handler(req: any, res: any) {
  return res.json({
    method: req.method,
    body: req.body,
    bodyType: typeof req.body,
    chatId: req.body?.message?.chat?.id,
    chatIdStr: req.body?.message?.chat?.id?.toString(),
    envChatId: process.env.TELEGRAM_CHAT_ID,
    envBotToken: process.env.TELEGRAM_BOT_TOKEN ? 'SET' : 'NOT_SET',
    envSupabaseUrl: process.env.SUPABASE_URL ? 'SET' : 'NOT_SET',
    envServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SET' : 'NOT_SET',
  });
}
