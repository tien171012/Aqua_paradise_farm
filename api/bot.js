export default async function handler(req, res) {
  // 1. Kiểm tra dữ liệu đầu vào từ Telegram
  if (!req.body || !req.body.message) {
    return res.status(200).send('OK');
  }

  const { message } = req.body;
  const tk = '8899847432:AAE8W1MECinS2t3Zv8w7Moe7IqMfac_-UbU';

  try {
    // 2. Bỏ qua mọi điều kiện so sánh chữ, cứ có tin nhắn là gửi nút Game
    await fetch(`https://telegram.org{tk}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: message.chat.id,
        text: "🎮 Chào mừng bạn đến với Aquaparadise Farm! Nhấn nút bên dưới để mở Game:",
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "🚀 Chơi Ngay",
                web_app: { url: "https://vercel.app" } 
              }
            ]
          ]
        }
      })
    });
  } catch (e) {
    console.error("Lỗi gửi tin nhắn:", e);
  }

  return res.status(200).send('OK');
          }
                
