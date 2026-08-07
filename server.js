/* =============================================================================
   AQUA PARADISE PRO — server.js
   Backend Node.js + Express + MongoDB (Mongoose)
   -----------------------------------------------------------------------------
   Vai trò: đây là nơi DUY NHẤT quyết định vàng, trứng, cấp độ của người chơi.
   File HTML chỉ hiển thị — mọi hành động (mua thú, thu hoạch, bán trứng, rút tiền)
   đều phải đi qua các API dưới đây và được kiểm tra hợp lệ ở server, nên sửa
   dữ liệu bằng F12 / localStorage trên máy người chơi sẽ KHÔNG có tác dụng.

   Cách chạy (triển khai lên dịch vụ như Render/Railway — làm được từ điện thoại
   qua trình duyệt, không cần máy tính):
     1. Tạo repo (GitHub) chứa server.js, package.json, .env
     2. Tạo cụm MongoDB Atlas miễn phí, lấy chuỗi kết nối (MONGODB_URI)
     3. Tạo bot Telegram qua @BotFather, lấy BOT_TOKEN
     4. Đặt các biến môi trường (xem file .env.example)
     5. Deploy lên Render/Railway, họ tự chạy `npm install` rồi `node server.js`
     6. Copy URL server vừa deploy vào biến API_BASE trong file HTML
============================================================================= */

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const {
  MONGODB_URI,
  BOT_TOKEN,
  JWT_SECRET,
  ADMIN_SECRET,
  ALLOWED_ORIGIN,
  PORT = 3000,
} = process.env;

if (!MONGODB_URI || !BOT_TOKEN || !JWT_SECRET || !ADMIN_SECRET) {
  console.error('❌ Thiếu biến môi trường bắt buộc. Kiểm tra lại file .env (xem .env.example).');
  process.exit(1);
}

/* =========================== DỮ LIỆU CON VẬT (NGUỒN SỰ THẬT DUY NHẤT) =========================== */
// Client (HTML) chỉ dùng dữ liệu này để HIỂN THỊ qua API /api/state, /api/buy...
// Mọi phép tính vàng/trứng thật sự đều dùng bảng này ở server.
const EGG_TIME_SEC = 30; // giây / quả, áp dụng cho mọi con vật

const ANIMALS = [
  { id: 'nhim_bien', lvl: 1, price: 25000, egg: 1000 },
  { id: 'oc_bien', lvl: 1, price: 25000, egg: 1050 },
  { id: 'cua', lvl: 1, price: 25000, egg: 1100 },
  { id: 'tom_hum', lvl: 1, price: 25000, egg: 1150 },
  { id: 'sao_bien', lvl: 1, price: 25000, egg: 1200 },
  { id: 'sua', lvl: 6, price: 50000, egg: 1400 },
  { id: 'muc', lvl: 6, price: 50000, egg: 1550 },
  { id: 'bach_tuoc', lvl: 6, price: 50000, egg: 1700 },
  { id: 'ca_thu', lvl: 12, price: 300000, egg: 1800 },
  { id: 'ca_he', lvl: 12, price: 350000, egg: 1950 },
  { id: 'ca_ngua', lvl: 12, price: 400000, egg: 2100 },
  { id: 'ca_map', lvl: 20, price: 400000, egg: 2200 },
  { id: 'ca_heo', lvl: 20, price: 420000, egg: 2300 },
  { id: 'ca_duoi', lvl: 20, price: 440000, egg: 2400 },
  { id: 'ca_kiem', lvl: 20, price: 460000, egg: 2500 },
  { id: 'ran_bien', lvl: 30, price: 470000, egg: 2700 },
  { id: 'hai_cau', lvl: 40, price: 485000, egg: 3000 },
  { id: 'rai_ca', lvl: 50, price: 500000, egg: 3300 },
  { id: 'san_ho', lvl: 70, price: 5000000, egg: 3600 },
  { id: 'rua_ca_sau', lvl: 80, price: 10000000, egg: 3800 },
  { id: 'su_tu_bien', lvl: 100, price: 15000000, egg: 4000 },
];
const ANIMAL_MAP = Object.fromEntries(ANIMALS.map(a => [a.id, a]));

const MIN_WITHDRAW_KC = 4;       // kim cương tối thiểu để được rút (= 2.000đ)
const MAX_WITHDRAW_KC = 10;      // kim cương tối đa mỗi lần rút (= 5.000đ)
const MAX_PENDING_WITHDRAWS = 1; // số yêu cầu đang chờ duyệt tối đa / người chơi
const GOLD_PER_DIAMOND = 800000; // 800.000 xu = 1 kim cương
const VND_PER_DIAMOND = 500;     // 1 kim cương = 500đ

function xpNeeded(level) { return level * 500; }

/* =========================== KẾT NỐI DATABASE =========================== */
mongoose.set('strictQuery', true);
mongoose.connect(MONGODB_URI)
  .then(() => console.log('✅ Đã kết nối MongoDB'))
  .catch(err => {
    console.error('❌ Không kết nối được MongoDB:', err.message);
    process.exit(1);
  });

/* =========================== SCHEMA =========================== */
const PlayerSchema = new mongoose.Schema({
  telegramId: { type: String, required: true, unique: true, index: true },
  username: { type: String, default: '' },
  level: { type: Number, default: 1 },
  xp: { type: Number, default: 0 },
  gold: { type: Number, default: 50000 }, // vàng khởi đầu khi tạo tài khoản
  diamonds: { type: Number, default: 0 }, // kim cương - đổi từ vàng, dùng để rút tiền thật
  owned: { type: Map, of: Number, default: {} },      // animalId -> số lượng
  eggs: { type: Map, of: Number, default: {} },        // animalId -> số trứng đang có
  lastCollected: { type: Map, of: Number, default: {} }, // animalId -> timestamp (ms) lần tính trứng gần nhất
}, { timestamps: true });

const WithdrawSchema = new mongoose.Schema({
  telegramId: { type: String, required: true, index: true },
  amount: { type: Number, required: true },     // số KIM CƯƠNG rút
  vndAmount: { type: Number, required: true },   // số tiền VNĐ tương ứng (amount * VND_PER_DIAMOND)
  method: { type: String, enum: ['zalopay', 'bank'], required: true },
  details: { type: mongoose.Schema.Types.Mixed, default: {} },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  resolvedAt: { type: Date },
}, { timestamps: true });

const Player = mongoose.model('Player', PlayerSchema);
const WithdrawRequest = mongoose.model('WithdrawRequest', WithdrawSchema);

/* =========================== TIỆN ÍCH CHỐNG SẬP =========================== */
// Bọc mọi route async — nếu có lỗi bất ngờ, trả JSON lỗi thay vì làm crash server.
function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

// Bắt các lỗi không được xử lý ở bất kỳ đâu trong tiến trình — log lại thay vì sập.
process.on('unhandledRejection', (reason) => {
  console.error('⚠️ unhandledRejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('⚠️ uncaughtException:', err);
});

/* =========================== XÁC THỰC TELEGRAM (chống giả mạo user) =========================== */
// Theo tài liệu Telegram: https://core.telegram.org/bots/webapps#validating-data-received-via-the-web-app
function verifyTelegramInitData(initData) {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');

  const pairs = [];
  for (const [key, value] of params.entries()) pairs.push(`${key}=${value}`);
  pairs.sort();
  const dataCheckString = pairs.join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  const computedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  if (computedHash !== hash) return null;

  const userStr = params.get('user');
  if (!userStr) return null;
  try {
    return JSON.parse(userStr);
  } catch {
    return null;
  }
}

/* =========================== MIDDLEWARE XÁC THỰC PHIÊN (JWT) =========================== */
async function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Chưa đăng nhập.' });

    const payload = jwt.verify(token, JWT_SECRET);
    const player = await Player.findOne({ telegramId: payload.telegramId });
    if (!player) return res.status(401).json({ error: 'Không tìm thấy người chơi.' });

    req.player = player;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Phiên đăng nhập không hợp lệ, vui lòng mở lại game.' });
  }
}

function adminMiddleware(req, res, next) {
  const secret = req.headers['x-admin-secret'];
  if (secret !== ADMIN_SECRET) return res.status(403).json({ error: 'Không có quyền truy cập.' });
  next();
}

/* =========================== LOGIC GAME (SERVER-AUTHORITATIVE) =========================== */

// Tính trứng mới sinh ra kể từ lần tính gần nhất, dựa trên THỜI GIAN THỰC của server —
// không dựa vào bất kỳ giá trị nào client gửi lên, nên không thể hack bằng cách sửa timer ở trình duyệt.
function settleEggs(player) {
  const now = Date.now();
  let changed = false;

  for (const animal of ANIMALS) {
    const owned = player.owned.get(animal.id) || 0;
    if (owned <= 0) continue;

    let last = player.lastCollected.get(animal.id);
    if (last === undefined) {
      player.lastCollected.set(animal.id, now);
      continue;
    }

    const elapsedSec = (now - last) / 1000;
    const cycles = Math.floor(elapsedSec / EGG_TIME_SEC);
    if (cycles > 0) {
      const gained = cycles * owned;
      const current = player.eggs.get(animal.id) || 0;
      player.eggs.set(animal.id, current + gained);
      player.lastCollected.set(animal.id, last + cycles * EGG_TIME_SEC * 1000);
      changed = true;
    }
  }
  return changed;
}

function addXpAndGold(player, goldGain, xpGain) {
  player.gold += goldGain;
  player.xp += xpGain;
  while (player.xp >= xpNeeded(player.level)) {
    player.xp -= xpNeeded(player.level);
    player.level += 1;
  }
}

// Chuẩn hoá dữ liệu player -> object gọn để trả về cho client (kèm giây còn lại tới quả trứng tiếp theo).
async function serializeState(player) {
  const now = Date.now();
  const owned = Object.fromEntries(player.owned);
  const eggs = Object.fromEntries(player.eggs);
  const prices = Object.fromEntries(ANIMALS.map(a => [a.id, a.price]));
  const eggValues = Object.fromEntries(ANIMALS.map(a => [a.id, a.egg]));

  const nextEggSec = {};
  for (const animal of ANIMALS) {
    const last = player.lastCollected.get(animal.id);
    if (last === undefined) { nextEggSec[animal.id] = EGG_TIME_SEC; continue; }
    const elapsedSec = (now - last) / 1000;
    const remain = EGG_TIME_SEC - (elapsedSec % EGG_TIME_SEC);
    nextEggSec[animal.id] = Math.max(0, Math.round(remain));
  }

  const withdrawHistory = await WithdrawRequest.find({ telegramId: player.telegramId })
    .sort({ createdAt: -1 })
    .limit(20)
    .lean();

  return {
    level: player.level,
    xp: player.xp,
    xpNeeded: xpNeeded(player.level),
    gold: player.gold,
    diamonds: player.diamonds,
    goldPerDiamond: GOLD_PER_DIAMOND,
    vndPerDiamond: VND_PER_DIAMOND,
    minWithdrawKc: MIN_WITHDRAW_KC,
    maxWithdrawKc: MAX_WITHDRAW_KC,
    owned,
    eggs,
    prices,
    eggValues,
    eggTime: EGG_TIME_SEC,
    nextEggSec,
    withdrawHistory: withdrawHistory.map(h => ({
      amount: h.amount, vndAmount: h.vndAmount, method: h.method, details: h.details,
      status: h.status, createdAt: h.createdAt,
    })),
  };
}

/* =========================== APP SETUP =========================== */
const app = express();
app.use(helmet());
app.use(express.json({ limit: '10kb' }));
app.use(cors({ origin: ALLOWED_ORIGIN || '*' }));

// Giới hạn số request để chống spam / brute-force (chống hack + chống sập do quá tải).
const generalLimiter = rateLimit({ windowMs: 60 * 1000, max: 60 });
const withdrawLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 5 });
app.use('/api/', generalLimiter);

/* =========================== ROUTES =========================== */

// Đăng nhập bằng dữ liệu Telegram WebApp (initData) — xác thực chữ ký để chống giả mạo.
app.post('/api/auth', asyncHandler(async (req, res) => {
  const { initData } = req.body || {};
  if (!initData) return res.status(400).json({ error: 'Thiếu initData.' });

  const tgUser = verifyTelegramInitData(initData);
  if (!tgUser || !tgUser.id) return res.status(401).json({ error: 'Xác thực Telegram thất bại.' });

  const telegramId = String(tgUser.id);
  let player = await Player.findOne({ telegramId });
  if (!player) {
    player = await Player.create({
      telegramId,
      username: tgUser.username || tgUser.first_name || '',
    });
  }

  settleEggs(player);
  await player.save();

  const token = jwt.sign({ telegramId }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, state: await serializeState(player) });
}));

// Lấy trạng thái hiện tại (tự động tính trứng mới sinh ra theo thời gian thực).
app.get('/api/state', authMiddleware, asyncHandler(async (req, res) => {
  const player = req.player;
  settleEggs(player);
  await player.save();
  res.json({ state: await serializeState(player) });
}));

// Mua một con thú.
app.post('/api/buy', authMiddleware, asyncHandler(async (req, res) => {
  const { animalId } = req.body || {};
  const animal = ANIMAL_MAP[animalId];
  if (!animal) return res.status(400).json({ error: 'Con vật không tồn tại.' });

  const player = req.player;
  settleEggs(player);

  if (player.level < animal.lvl) return res.status(400).json({ error: `Cần đạt cấp ${animal.lvl} để mua con vật này.` });
  if (player.gold < animal.price) return res.status(400).json({ error: 'Không đủ vàng.' });

  player.gold -= animal.price;
  player.owned.set(animalId, (player.owned.get(animalId) || 0) + 1);
  if (player.lastCollected.get(animalId) === undefined) player.lastCollected.set(animalId, Date.now());

  await player.save();
  res.json({ state: await serializeState(player) });
}));

// Bán trứng của MỘT loại con vật.
app.post('/api/sell', authMiddleware, asyncHandler(async (req, res) => {
  const { animalId, qty } = req.body || {};
  const animal = ANIMAL_MAP[animalId];
  if (!animal) return res.status(400).json({ error: 'Con vật không tồn tại.' });

  const player = req.player;
  settleEggs(player);

  const have = player.eggs.get(animalId) || 0;
  const n = Math.min(Number(qty) || have, have);
  if (n <= 0) return res.status(400).json({ error: 'Không có trứng để bán.' });

  player.eggs.set(animalId, have - n);
  addXpAndGold(player, animal.egg * n, Math.round(animal.egg / 100) * n);

  await player.save();
  res.json({ state: await serializeState(player) });
}));

// Bán TOÀN BỘ trứng đang có.
app.post('/api/sell-all', authMiddleware, asyncHandler(async (req, res) => {
  const player = req.player;
  settleEggs(player);

  let goldGain = 0, xpGain = 0, any = false;
  for (const animal of ANIMALS) {
    const n = player.eggs.get(animal.id) || 0;
    if (n > 0) {
      any = true;
      goldGain += animal.egg * n;
      xpGain += Math.round(animal.egg / 100) * n;
      player.eggs.set(animal.id, 0);
    }
  }
  if (!any) return res.status(400).json({ error: 'Không có trứng để bán.' });

  addXpAndGold(player, goldGain, xpGain);
  await player.save();
  res.json({ state: await serializeState(player) });
}));

// Đổi vàng sang Kim cương — tỉ giá cố định 800.000 xu = 1 KC.
app.post('/api/convert-diamond', authMiddleware, asyncHandler(async (req, res) => {
  const { diamonds } = req.body || {};
  const player = req.player;

  if (!Number.isInteger(diamonds) || diamonds <= 0) {
    return res.status(400).json({ error: 'Số kim cương muốn đổi không hợp lệ.' });
  }

  settleEggs(player);
  const cost = diamonds * GOLD_PER_DIAMOND;
  if (player.gold < cost) {
    return res.status(400).json({ error: `Cần ${cost.toLocaleString('vi-VN')} vàng để đổi ${diamonds} kim cương.` });
  }

  player.gold -= cost;
  player.diamonds += diamonds;
  await player.save();

  res.json({ state: await serializeState(player) });
}));

// Gửi yêu cầu RÚT TIỀN — trừ kim cương ngay, lưu trạng thái "pending" để admin duyệt thủ công.
// Server KHÔNG tự động chuyển tiền thật (ZaloPay / ngân hàng) — bạn cần xử lý thủ công
// hoặc tích hợp thêm API của ZaloPay / ngân hàng nếu muốn tự động hoá.
app.post('/api/withdraw', authMiddleware, withdrawLimiter, asyncHandler(async (req, res) => {
  const { amount, method, details } = req.body || {};
  const player = req.player;

  if (!Number.isInteger(amount) || amount < MIN_WITHDRAW_KC || amount > MAX_WITHDRAW_KC) {
    return res.status(400).json({ error: `Số kim cương rút phải từ ${MIN_WITHDRAW_KC} đến ${MAX_WITHDRAW_KC}.` });
  }
  if (!['zalopay', 'bank'].includes(method)) {
    return res.status(400).json({ error: 'Hình thức rút không hợp lệ.' });
  }
  if (method === 'zalopay' && (!details || !details.walletNumber)) {
    return res.status(400).json({ error: 'Thiếu số điện thoại ví ZaloPay.' });
  }
  if (method === 'bank' && (!details || !details.bankName || !details.accountNumber || !details.accountHolder)) {
    return res.status(400).json({ error: 'Thiếu thông tin ngân hàng (tên ngân hàng / số tài khoản / chủ tài khoản).' });
  }

  const pendingCount = await WithdrawRequest.countDocuments({ telegramId: player.telegramId, status: 'pending' });
  if (pendingCount >= MAX_PENDING_WITHDRAWS) {
    return res.status(400).json({ error: 'Bạn đang có yêu cầu rút tiền chờ duyệt, vui lòng đợi xử lý xong.' });
  }

  if (player.diamonds < amount) return res.status(400).json({ error: 'Không đủ kim cương.' });

  player.diamonds -= amount;
  await player.save();

  await WithdrawRequest.create({
    telegramId: player.telegramId,
    amount,
    vndAmount: amount * VND_PER_DIAMOND,
    method,
    details: details || {},
  });

  res.json({ state: await serializeState(player) });
}));

/* =========================== ROUTE QUẢN TRỊ (duyệt rút tiền thủ công) ===========================
   Bảo vệ bằng header 'x-admin-secret' — chỉ bạn (chủ game) mới biết giá trị này (đặt trong .env).
   Sau khi bạn ĐÃ chuyển tiền thật cho người chơi (nạp thẻ/chuyển ví), gọi API approve để đánh dấu
   hoàn tất. Nếu từ chối, gọi API reject để HOÀN LẠI vàng cho người chơi. */

app.get('/api/admin/withdraws', adminMiddleware, asyncHandler(async (req, res) => {
  const status = req.query.status || 'pending';
  const list = await WithdrawRequest.find({ status }).sort({ createdAt: 1 }).lean();
  res.json({ list });
}));

app.post('/api/admin/withdraws/:id/approve', adminMiddleware, asyncHandler(async (req, res) => {
  const wd = await WithdrawRequest.findById(req.params.id);
  if (!wd) return res.status(404).json({ error: 'Không tìm thấy yêu cầu.' });
  if (wd.status !== 'pending') return res.status(400).json({ error: 'Yêu cầu đã được xử lý trước đó.' });

  wd.status = 'approved';
  wd.resolvedAt = new Date();
  await wd.save();
  res.json({ ok: true });
}));

app.post('/api/admin/withdraws/:id/reject', adminMiddleware, asyncHandler(async (req, res) => {
  const wd = await WithdrawRequest.findById(req.params.id);
  if (!wd) return res.status(404).json({ error: 'Không tìm thấy yêu cầu.' });
  if (wd.status !== 'pending') return res.status(400).json({ error: 'Yêu cầu đã được xử lý trước đó.' });

  wd.status = 'rejected';
  wd.resolvedAt = new Date();
  await wd.save();

  // Hoàn lại kim cương cho người chơi vì yêu cầu bị từ chối.
  await Player.updateOne({ telegramId: wd.telegramId }, { $inc: { diamonds: wd.amount } });

  res.json({ ok: true });
}));

/* =========================== XỬ LÝ LỖI CHUNG (chống sập) =========================== */
app.use((req, res) => res.status(404).json({ error: 'Không tìm thấy đường dẫn API.' }));

app.use((err, req, res, next) => {
  console.error('🔥 Lỗi server:', err);
  res.status(500).json({ error: 'Đã xảy ra lỗi phía máy chủ, vui lòng thử lại.' });
});

app.listen(PORT, () => console.log(`🚀 Server đang chạy tại cổng ${PORT}`));
