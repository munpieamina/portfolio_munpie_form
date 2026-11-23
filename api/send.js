// Vercel Function: серверная отправка заявки в Telegram, без PHP.
const services = new Set(['Веб-дизайн', 'Графический дизайн', 'Иллюстрация', '3D / пиксель-арт', 'Другое']);
const escapeHTML = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Метод не поддерживается.' });
  }
  // Лимит размера, чтобы не принимать произвольные большие сообщения.
  if (Number(req.headers['content-length'] || 0) > 12000) {
    return res.status(413).json({ error: 'Слишком большой запрос.' });
  }
  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return res.status(400).json({ error: 'Неверный формат данных.' });
  }
  const read = (key) => typeof body[key] === 'string' ? body[key].trim() : '';
  const name = read('name');
  const contact = read('contact');
  const service = read('service');
  const message = read('message');
  if (read('website')) return res.status(200).json({ ok: true }); // honeypot
  const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const telegram = /^@[A-Za-z0-9_]{5,32}$/;
  if (name.length < 2 || name.length > 80 || contact.length > 120 ||
      (!email.test(contact) && !telegram.test(contact)) || !services.has(service) ||
      message.length < 10 || message.length > 1500 || body.consent !== 'on') {
    return res.status(400).json({ error: 'Проверь заполненные поля и согласие.' });
  }
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.error('Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID');
    return res.status(503).json({ error: 'Отправка пока не настроена.' });
  }
  const text = ['🎨 <b>Новая заявка с munpie</b>',
    `<b>Имя:</b> ${escapeHTML(name)}`,
    `<b>Контакт:</b> ${escapeHTML(contact)}`,
    `<b>Услуга:</b> ${escapeHTML(service)}`,
    `<b>Сообщение:</b>\n${escapeHTML(message)}`].join('\n\n');
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    let response;
    try {
      response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
        signal: controller.signal,
      });
    } finally { clearTimeout(timeout); }
    const result = await response.json();
    if (!response.ok || !result.ok) {
      console.error('Telegram sendMessage failed:', response.status, result.description);
      return res.status(502).json({ error: 'Не удалось доставить заявку. Попробуй позже.' });
    }
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Telegram request failure:', error.message);
    return res.status(502).json({ error: 'Сервис временно недоступен.' });
  }
}
