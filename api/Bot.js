const axios = require('axios');

module.exports = async (req, res) => {
  // Kiểm tra nếu không có dữ liệu tin nhắn gửi đến
  if (!req.body || !req.body.message) {
    return res.status(200).send('OK');
  }

  const { message } = req.body;
  const chatId = message.chat.id;
  const text = message.text;

  // Điền mã Token của bạn vào đây (Hoặc cấu hình trong Environment Variables)
  const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN || 8899847432:AAE8W1MECinS2t3Zv8w7Moe7IqMfac_-UbU
  const TELEGRAM_API = `https://telegram.org{TELEGRAM_TOKEN}/sendMessage`;

  try {
    // Logic phản hồi tin nhắn của Bot
    let replyText = 'Chào bạn! Bot đang hoạt động cực kỳ ổn định trên Vercel. 🚀';

    if (text === '/start') {
      replyText = 'Cảm ơn bạn đã khởi động Bot trại Farm! 🌾';
    } else if (text) {
      replyText = `Bot đã nhận được tin nhắn: "${text}"`;
    }

    // Gửi tin nhắn phản hồi về lại Telegram
    await axios.post(TELEGRAM_API, {
      chat_id: chatId,
      text: replyText
    });

  } catch (error) {
    console.error('Lỗi gửi tin nhắn:', error);
  }

  // Bắt buộc phải trả về phản hồi 200 thành công để Vercel không bị treo timeout
  return res.status(200).send('OK');
};
