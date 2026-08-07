const cors = require('cors');

// Cấu hình Express hoặc Serverless Function để trả data cho game
module.exports = async (req, res) => {
  // Cho phép tất cả các nguồn truy cập (Bật CORS để tránh lỗi đơ màn hình)
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Giả lập dữ liệu trang trại trả về cho file HTML (Bạn có thể kết nối Database ở đây sau)
  const userData = {
    level: 1,
    xp: 0,
    gold: 500, // Thử cho người chơi 500 vàng khi mới vào để test game
    diamond: 10,
    animals: [
      { id: 1, name: "Cá Vàng", type: "fish", status: "Đang nuôi" }
    ]
  };

  // Trả dữ liệu dạng JSON về cho game
  res.status(200).json(userData);
};
