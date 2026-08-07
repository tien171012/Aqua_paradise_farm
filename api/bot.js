export default async function handler(req, res) {
  if (!req.body || !req.body.message) {
    return res.status(200).send('OK');
  }
  const { message } = req.body;
  const tk = '8899847432:AAE8W1MECinS2t3Zv8w7Moe7IqMfac_-UbU';
  try {
    await fetch(`https://telegram.org{tk}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: message.chat.id,
        text: `Bot nhận được: ${message.text}`
      })
    });
  } catch (e) {
    console.error("Lỗi:", e);
  }
  return res.status(200).send('OK');
}
