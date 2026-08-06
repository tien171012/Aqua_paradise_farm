const axios = require('axios');

module.exports = async (req, res) => {
  if (!req.body || !req.body.message) {
    return res.status(200).send('OK');
  }

  const { message } = req.body;
  const tk = '8899847432:AAE8W1MECinS2t3Zv8w7Moe7IqMfa-n99I';

  try {
    await axios.post(`https://telegram.org{tk}/sendMessage`, {
      chat_id: message.chat.id,
      text: `Bot nhận được: ${message.text}`
    });
  } catch (e) {
    console.log(e);
  }

  return res.status(200).send('OK');
};
