const axios = require('axios');

module.exports = async (req, res) => {
  if (!req.body || !req.body.message) {
    return res.status(200).send('OK');
  }

  const { message } = req.body;
  const chatId = message.chat.id;
  const text = message.text;

  const TELEGRAM_TOKEN = '8899847432:AAE8W1MECinS2t3Zv8w7Moe7IqMfa-n99I';
  const TELEGRAM_API = `https://telegram.org{TELEGRAM_TOKEN}/sendMessage`;

  try {
    let replyText = 'Chào bạn! Bot đang hoạt động cực kỳ ổn định trên Vercel. 🚀';

    if (text === '/start') {
      replyText = 'Cảm ơn bạn đã khởi động Bot trại Farm! 🌾';
    } else if (text) {
      replyText = `Bot đã nhận được tin nhắn: "${text}"`;
    }

    await axios.post(TELEGRAM_API, {
      chat_id: chatId,
      text: replyText
    });

  } catch (error) {
    console.error('Lỗi gửi tin nhắn:', error);
  }

  return res.status(200).send('OK');
};
