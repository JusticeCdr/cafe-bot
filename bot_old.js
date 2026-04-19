require("dotenv").config();
const { Telegraf, Markup } = require("telegraf");
const db = require("./db");

const bot = new Telegraf(process.env.BOT_TOKEN);

const users = {};
const processing = {};

// ===== DEBUG ORDER FLOW (enable with DEBUG_ORDER_FLOW=1) =====
const DEBUG_ORDER_FLOW = String(process.env.DEBUG_ORDER_FLOW || "").toLowerCase();
const isDebugOrderFlow =
  DEBUG_ORDER_FLOW === "1" || DEBUG_ORDER_FLOW === "true" || DEBUG_ORDER_FLOW === "yes";

function safeJson(value) {
  try {
    return JSON.stringify(value);
  } catch (e) {
    return "[unstringifiable]";
  }
}

function shorten(str, max = 800) {
  const s = String(str ?? "");
  if (s.length <= max) return s;
  return s.slice(0, max) + `...(+${s.length - max} chars)`;
}

function extractReplyMarkup(kbOrMarkup) {
  if (!kbOrMarkup) return null;
  // telegraf Markup.inlineKeyboard returns object { reply_markup: {...} }
  if (kbOrMarkup.reply_markup) return kbOrMarkup.reply_markup;
  return kbOrMarkup;
}

function debugOrder(event, payload = {}) {
  if (!isDebugOrderFlow) return;
  const base = {
    t: new Date().toISOString(),
    event,
  };
}

function getCtxMsgInfo(ctx) {
  const msg = ctx?.callbackQuery?.message;
  return {
    chat_id: msg?.chat?.id,
    message_id: msg?.message_id,
  };
}

function getOrderAsync(orderId) {
  return new Promise((resolve) => {
    db.get(`SELECT * FROM orders WHERE id = ?`, [orderId], (err, row) => {
      if (err) return resolve(null);
      resolve(row || null);
    });
  });
}

async function isProcessing(userId, timeout = 2000) {
  if (processing[userId]) return true;
  processing[userId] = true;
  setTimeout(() => { delete processing[userId]; }, timeout);
  return false;
}

async function safeSendPhoto(chatId, photo, extra = {}) {
  try {
    return await bot.telegram.sendPhoto(chatId, photo, extra);
  } catch (e) {
    console.log("❌ SEND PHOTO ERROR:", e.description || e.message);
  }
}

async function safeSendMessage(chatId, text, extra = {}) {
  try {
    return await bot.telegram.sendMessage(chatId, text, extra);
  } catch (e) {
    console.log("❌ SEND MESSAGE ERROR:", e.description || e.message);
  }
}

async function safeSendLocation(chatId, lat, lon) {
  try {
    return await bot.telegram.sendLocation(chatId, lat, lon);
  } catch (e) {
    console.log("❌ LOCATION ERROR:", e.description || e.message);
  }
}

async function safeDeleteMessage(chatId, messageId) {
  try {
    if (chatId && messageId) await bot.telegram.deleteMessage(chatId, messageId);
  } catch (e) { }
}

async function safeEditMessageText(chatId, messageId, text, extra = {}) {
  try {
    if (chatId && messageId) {
      if (isDebugOrderFlow) {
        const rm = extractReplyMarkup(extra?.reply_markup);
        debugOrder("editMessageText", {
          chatId,
          messageId,
          text_preview: text ? shorten(text, 400) : "",
          has_reply_markup: !!rm,
          reply_markup: rm ? shorten(safeJson(rm), 1200) : null,
        });
      }
      if (text) {
        return await bot.telegram.editMessageText(chatId, messageId, undefined, text, extra);
      } else if (extra.reply_markup) {
        return await bot.telegram.editMessageReplyMarkup(chatId, messageId, undefined, extra.reply_markup);
      }
    }
  } catch (e) {
    console.log("❌ EDIT MESSAGE ERROR:", e.description || e.message);
  }
}

async function safeAnswerCbQuery(ctx, text = "", extra = {}) {
  try {
    return await ctx.answerCbQuery(text, extra);
  } catch (e) {
    console.log("❌ ANSWER CB QUERY ERROR:", e.description || e.message);
    try {
      if (e.description && e.description.includes("query is too old")) {
        await safeSendMessage(ctx.from.id, "Bu tugma eskirgan. Qaytadan urinib ko'ring.");
      }
    } catch (err) { }
  }
}

async function safeEditMessageReplyMarkup(chatId, messageId, keyboard) {
  try {
    if (chatId && messageId) {
      if (isDebugOrderFlow) {
        const rm = extractReplyMarkup(keyboard);
        const inlineKb = rm?.inline_keyboard;
        debugOrder("editMessageReplyMarkup", {
          chatId,
          messageId,
          inline_keyboard_rows: Array.isArray(inlineKb) ? inlineKb.length : null,
          inline_keyboard_empty: Array.isArray(inlineKb) ? inlineKb.length === 0 : null,
          reply_markup: rm ? shorten(safeJson(rm), 1200) : null,
        });
      }
      return await bot.telegram.editMessageReplyMarkup(chatId, messageId, undefined, keyboard);
    }
  } catch (e) {
    if (e.description && e.description.includes("message is not modified")) {
      return; // Ignore if nothing changed
    }
    console.log("❌ EDIT REPLY MARKUP ERROR:", e.description || e.message);
  }
}

async function safeReply(ctx, text, extra = {}) {
  try {
    return await ctx.reply(text, extra);
  } catch (e) {
    console.log("❌ REPLY ERROR:", e.description || e.message);
  }
}

async function safeEditCtxMessageText(ctx, text, extra = {}) {
  try {
    return await ctx.editMessageText(text, extra);
  } catch (e) {
    if (e.description && e.description.includes("message is not modified")) {
      return;
    }
    console.log("❌ EDIT MESSAGE TEXT ERROR:", e.description || e.message);
  }
}

// === NEW: Check cafe access (is_open, frozen, paid_until) ===
function getCafeStatus(cafe) {
  if (!cafe) return { status: 'error', message: '❌ Cafe topilmadi', canAccess: false };
  
  // Check if manually frozen
  if (cafe.manual_frozen === 1) {
    return { 
      status: 'frozen',
      message: '❄️ Akkaunt muzlatilgan',
      canAccess: false,
      balance: cafe.balance || 0
    };
  }
  
  // Check if subscription expired (only for subscription tariff, NOT for commission)
  if (cafe.tariff_type !== 'commission' && cafe.paid_until) {
    const expireDate = new Date(cafe.paid_until);
    const now = new Date();
    if (expireDate <= now) {
      return { 
        status: 'expired',
        message: '⛔ Aboniment tugagan',
        canAccess: false,
        balance: cafe.balance || 0
      };
    }
  }
  
  // Check if commission cafe has zero or negative balance (auto-freeze)
  if (cafe.tariff_type === 'commission' && cafe.balance <= 0) {
    return {
      status: 'frozen',
      message: '❄️ Balans tugagan, akkaunt muzlatilgan',
      canAccess: false,
      balance: cafe.balance || 0
    };
  }
  
  // Check if open
  if (cafe.is_open !== 1) {
    return { 
      status: 'closed',
      message: '🔴 Cafe yopiq',
      canAccess: false,
      balance: cafe.balance || 0
    };
  }
  
  // All good
  return { 
    status: 'active',
    message: '✅ Faol',
    canAccess: true,
    balance: cafe.balance || 0
  };
}

function showFrozenMessage(ctx) {
  return ctx.reply("❄️ Sizning aakkauntingiz muzlatilgan. Admin bilan bog'laning.");
}

bot.catch(async (err, ctx) => {
  console.log(`❌ GLOBAL ERROR [${ctx.updateType}]:`, err.message);
  try {
    if (ctx.updateType === 'callback_query') {
      await safeSendMessage(ctx.from.id, "Xatolik yuz berdi. Tugma eskirgan bo'lishi mumkin. Qaytadan urinib ko'ring.");
    }
  } catch (e) { }
});

function trackTempMessage(orderId, chatId, messageId) {
  if (!messageId || !orderId || !chatId) return;
  db.get(`SELECT messages_json FROM orders WHERE id = ?`, [orderId], (err, row) => {
    if (err || !row) return;
    let temps = [];
    if (row.messages_json) {
      try { temps = JSON.parse(row.messages_json); } catch (e) { }
    }
    temps.push({ chatId, messageId });
    db.run(`UPDATE orders SET messages_json = ? WHERE id = ?`, [JSON.stringify(temps), orderId]);
  });
}

function cleanUpOrderMessages(orderId) {
  db.get(`SELECT * FROM orders WHERE id = ?`, [orderId], (err, order) => {
    if (err || !order) return;

    let temps = [];
    if (order.messages_json) {
      try { temps = JSON.parse(order.messages_json); } catch (e) { }
    }

    // Keep:
    // - main order receipt message in cafe group (group_main_msg_id)
    // - location messages (we avoid tracking them; still guard by skipping unknown)
    let mainGroupChatId = null;
    let mainGroupMsgId = null;
    if (order.group_main_msg_id) {
      const parts = String(order.group_main_msg_id).split("_");
      if (parts.length === 2) {
        mainGroupChatId = Number(parts[0]) || null;
        mainGroupMsgId = Number(parts[1]) || null;
      }
    }

    const resolveChatId = (raw) => {
      // numeric id
      const n = Number(raw);
      if (Number.isFinite(n) && n !== 0) return n;
      // legacy labels
      if (raw === "client") return Number(order.user_id) || null;
      if (raw === "group") return mainGroupChatId;
      // courier requires lookup by order.courier_id
      if (raw === "courier") return null;
      return null;
    };

    const unique = new Set();
    const deletions = [];
    for (const t of temps) {
      if (!t || !t.messageId) continue;
      const resolvedChatId = resolveChatId(t.chatId);
      const msgId = Number(t.messageId) || null;
      if (!resolvedChatId || !msgId) continue;

      // Never delete the main receipt message
      if (mainGroupChatId && mainGroupMsgId && resolvedChatId === mainGroupChatId && msgId === mainGroupMsgId) {
        continue;
      }

      const key = `${resolvedChatId}:${msgId}`;
      if (unique.has(key)) continue;
      unique.add(key);
      deletions.push({ chatId: resolvedChatId, messageId: msgId });
    }

    const finish = () => {
      // clear so we don't retry deletions forever
      db.run(`UPDATE orders SET messages_json = ? WHERE id = ?`, [JSON.stringify([]), orderId]);
    };

    // If we have courier temp messages, resolve and delete them too
    if (temps.some(t => t && t.chatId === "courier") && order.courier_id) {
      db.get(`SELECT telegram_id FROM couriers WHERE id = ?`, [order.courier_id], (e2, c) => {
        const courierTgId = c && c.telegram_id ? Number(c.telegram_id) : null;
        if (courierTgId) {
          for (const t of temps) {
            if (!t || t.chatId !== "courier") continue;
            const msgId = Number(t.messageId) || null;
            if (!msgId) continue;
            const key = `${courierTgId}:${msgId}`;
            if (unique.has(key)) continue;
            unique.add(key);
            deletions.push({ chatId: courierTgId, messageId: msgId });
          }
        }
        deletions.forEach(d => safeDeleteMessage(d.chatId, d.messageId));

        // Safety: remove inline keyboard from main receipt message in group
        if (mainGroupChatId && mainGroupMsgId) {
          safeEditMessageReplyMarkup(mainGroupChatId, mainGroupMsgId, { inline_keyboard: [] });
        }

        finish();
      });
      return;
    }

    deletions.forEach(d => safeDeleteMessage(d.chatId, d.messageId));

    // Safety: remove inline keyboard from main receipt message in group
    if (mainGroupChatId && mainGroupMsgId) {
      safeEditMessageReplyMarkup(mainGroupChatId, mainGroupMsgId, { inline_keyboard: [] });
    }

    finish();
  });
}

function getRemainingDays(paidUntil) {
  if (!paidUntil) return 0;

  const now = new Date();
  const end = new Date(paidUntil);

  const diff = end - now;

  if (diff <= 0) return 0;

  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function autoFreezeCafeIfExpired(cafe, callback = () => { }) {
  if (!cafe) return callback();

  // Only check subscription expiry for subscription cafes, not commission cafes
  if (cafe.tariff_type === 'commission') return callback();

  if (!cafe.paid_until) return callback();

  const expired = new Date(cafe.paid_until) <= new Date();

  if (!expired) return callback();

  // Expired aboniment = freeze access
  db.run(`UPDATE cafes SET is_open = 0, manual_frozen = 1 WHERE id = ?`, [cafe.id], callback);
}

// === BUSINESS ENGINE HELPERS ===

// Auto-freeze cafe when commission balance <= 0
function autoFreezeOnZeroBalance(cafe) {
  db.run(`UPDATE cafes SET manual_frozen = 1, is_open = 0 WHERE id = ?`, [cafe.id], () => {
    if (cafe.owner_telegram_id) {
      safeSendMessage(cafe.owner_telegram_id,
        `❄️ ${cafe.name}\n\nBalansingiz tugagan. Balansni to'ldirsangiz, ishga tushadi.\nJoriy balans: ${cafe.balance || 0} so'm`);
    }
    const superAdminId = process.env.SUPER_ADMIN_TELEGRAM_ID;
    if (superAdminId) {
      safeSendMessage(superAdminId,
        `⚠️ DIQQAT: "${cafe.name}" (ID: ${cafe.id}) balansi tugadi va avtomatik muzlatildi.\nBalans: ${cafe.balance || 0} so'm`);
    }
  });
}

// Send low balance warning
function sendLowBalanceWarning(cafe, newBalance) {
  const threshold = Number(process.env.LOW_BALANCE_THRESHOLD || 10000);
  if (newBalance > threshold) return;
  if (cafe.owner_telegram_id) {
    safeSendMessage(cafe.owner_telegram_id,
      `⚠️ ${cafe.name}\n\nBalansingiz kamayib qoldi!\nJoriy balans: ${newBalance} so'm\n\nIltimos, balansni to'ldiring!`);
  }
  const superAdminId = process.env.SUPER_ADMIN_TELEGRAM_ID;
  if (superAdminId) {
    safeSendMessage(superAdminId,
      `ℹ️ "${cafe.name}" (ID: ${cafe.id}) balansi ${newBalance} so'mga tushdi.`);
  }
}

// Deduct commission from cafe balance
function chargeCommission(orderId, order, callback) {
  db.get(`SELECT * FROM cafes WHERE id = ?`, [order.cafe_id], (err, cafe) => {
    if (err || !cafe) return callback && callback();
    if (cafe.tariff_type !== 'commission' || !cafe.commission_percent) return callback && callback();
    const commission = Math.round(Number(order.total || 0) * cafe.commission_percent / 100);
    if (commission <= 0) return callback && callback();
    const newBalance = Number(cafe.balance || 0) - commission;
    db.run(
      `UPDATE cafes SET balance = ? WHERE id = ? AND tariff_type = 'commission'`,
      [newBalance, cafe.id],
      () => {
        db.run(`UPDATE orders SET commission_charged = ? WHERE id = ?`, [commission, orderId]);
        cafe.balance = newBalance;
        if (newBalance <= 0) {
          autoFreezeOnZeroBalance(cafe);
        } else {
          sendLowBalanceWarning(cafe, newBalance);
        }
        callback && callback(commission, newBalance);
      }
    );
  });
}

// Функция для изменения процента комиссии
function updateCommissionPercent(cafeId, newPercent, callback) {
  if (newPercent < 0 || newPercent > 100) {
    return callback && callback(false, 'Foiz 0-100 oralig\'ida bo\'lishi kerak');
  }
  
  db.run(
    `UPDATE cafes SET commission_percent = ? WHERE id = ? AND tariff_type = 'commission'`,
    [newPercent, cafeId],
    (err) => {
      if (err) {
        return callback && callback(false, 'Xatolik bo\'ldi');
      }
      callback && callback(true, `✅ Foiz ${newPercent}% ga o'zgartirildi`);
    }
  );
}

function getUser(id) {
  if (!users[id]) {
    users[id] = {
      step: "home",
      temp: {},
      selectedCafeId: null,
      selectedCafeName: null,
      cart: [],
      cafeAdminId: null,
      courierId: null,
      orderDraft: null,
      superAuth: false,
      cafeAuth: false,
      courierAuth: false,
    };
  }
  return users[id];
}

function getDaysLeft(paid_until) {
  if (!paid_until) return 0;

  const now = new Date();
  const end = new Date(paid_until);

  const diff = end - now;

  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
  return days;
}

// Форматирование даты в DD.MM.YYYY HH:MM
function formatDate(date) {
  if (!date) return "-";
  const d = new Date(date);
  if (isNaN(d.getTime())) return "-";
  
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  
  return `${day}.${month}.${year} ${hours}:${minutes}`;
}

// Добавить 30 дней к текущей дате
function addThirtyDays() {
  const now = new Date();
  now.setDate(now.getDate() + 30);
  return now.toISOString();
}

// Проверить, истек ли абонемент
function isSubscriptionExpired(paid_until) {
  if (!paid_until) return false;
  const now = new Date();
  const end = new Date(paid_until);
  return end <= now;
}

function resetTemp(user) {
  user.temp = {};
}

function resetOrderDraft(user) {
  user.orderDraft = null;
}

function mainMenu() {
  return Markup.keyboard([["🏪 Cafelar", "ℹ️ Info"]]).resize();
}

function superMenu() {
  return Markup.keyboard([
    ["➕ Cafe qo‘shish", "📋 Cafelar"],
    ["❄️ Muzlatish", "✅ Ochish"],
    ["➕ 30 kun qo‘shish", "📊 Umumiy statistika"],
    ["✏️ Tahrirlash"],
    ["🛵 Kuryer qo‘shish", "🛵 Kuryerlar", "❌ Kuryer o‘chirish"],
    ["🏠 Menu"],
  ]).resize();
}

function courierMenu() {
  return Markup.keyboard([
    ["🟢 Online", "🔴 Offline"],
    ["📦 Mening zakazlarim", "📊 Kuryer statistikasi"],
    ["🏠 Menu"]
  ]).resize();
}

function cafePanelMenu() {
  return Markup.keyboard([
    ["➕ Mahsulot qo‘shish", "📦 Mahsulotlar"],
    ["🗑 Mahsulot o‘chirish", "🔄 Mahsulot ON/OFF"],
    ["🚚 Yetkazib berish narxi", "🪑 Stol soni"],
    ["🛵 Kuryer qo‘shish", "🛵 Kuryerlar", "❌ Kuryer o‘chirish"],
    ["📊 Statistika", "⏰ Ish vaqtini o'zgartirish"],
    ["📅 Aboniment", "✅ Ochildik"],
    ["❌ Yopildik", "🏠 Menu"],
  ]).resize();
}

// Генерирует меню панели кафе динамически на основе типа тарифа
function generateCafePanelMenu(cafe) {
  if (!cafe) return cafePanelMenu();
  
  const rows = [
    ["➕ Mahsulot qo'shish", "📦 Mahsulotlar"],
    ["🗑 Mahsulot o'chirish", "🔄 Mahsulot ON/OFF"],
    ["🚚 Yetkazib berish narxi", "🪑 Stol soni"],
    ["🛵 Kuryer qo'shish", "🛵 Kuryerlar", "❌ Kuryer o'chirish"],
    ["📊 Statistika", "⏰ Ish vaqtini o'zgartirish"],
  ];
  
  // Добавляем кнопку баланса или абонемента в зависимости от типа тарифа
  if (cafe.tariff_type === 'commission') {
    rows.push(["💰 Balans"]);
  } else {
    rows.push(["📅 Aboniment"]);
  }
  
  rows.push(["✅ Ochildik"]);
  rows.push(["❌ Yopildik", "🏠 Menu"]);
  
  return Markup.keyboard(rows).resize();
}

// Получает cafe и возвращает правильное меню (для async операций)
function getCafeMenuAsync(cafeAdminId, callback) {
  db.get(`SELECT * FROM cafes WHERE id = ?`, [cafeAdminId], (err, cafe) => {
    if (err || !cafe) return callback(cafePanelMenu());
    callback(generateCafePanelMenu(cafe));
  });
}

function simpleBackMenu() {
  return Markup.keyboard([["⬅️ Orqaga"]]).resize();
}

function noteMenu() {
  return Markup.keyboard([["Yo'q"], ["⬅️ Orqaga"]]).resize();
}

function contactMenu() {
  return Markup.keyboard([
    [Markup.button.contactRequest("📞 Raqamni yuborish")],
    ["⬅️ Orqaga"],
  ]).resize();
}

function locationMenu() {
  return Markup.keyboard([
    [Markup.button.locationRequest("📍 Lokatsiya yuborish")],
    ["⬅️ Orqaga"],
  ]).resize();
}

function tableMenu(count) {
  const rows = [];
  let currentRow = [];

  for (let i = 1; i <= count; i++) {
    currentRow.push(String(i));

    if (currentRow.length === 3) {
      rows.push(currentRow);
      currentRow = [];
    }
  }

  if (currentRow.length) rows.push(currentRow);

  rows.push(["⬅️ Orqaga"]);
  return Markup.keyboard(rows).resize();
}

function customerCafeMenu(cafe) {
  const rows = [
    ["ℹ️ Info", "📍 Lokatsiya"],
    ["📋 Menu", "🛒 Savatcha"],
  ];

  if (cafe.instagram) rows.push(["📸 Instagram"]);
  if (cafe.menu_url) rows.push(["🌐 Online Menu"]);

  rows.push(["⬅️ Orqaga"]);
  return Markup.keyboard(rows).resize();
}

function cartMenu() {
  return Markup.keyboard([
    ["✅ Buyurtma berish", "❌ Tozalash"],
    ["⬅️ Orqaga"],
  ]).resize();
}

function orderTypeMenu() {
  return Markup.keyboard([
    ["🚚 Yetkazib berish"],
    ["🏠 Olib ketish", "🍽 Shu yerda yeyish"],
    ["⬅️ Orqaga"],
  ]).resize();
}

function etaButtons(orderId) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("5 min", `eta_${orderId}_5`),
      Markup.button.callback("10 min", `eta_${orderId}_10`),
    ],
    [
      Markup.button.callback("15 min", `eta_${orderId}_15`),
      Markup.button.callback("20 min", `eta_${orderId}_20`),
    ],
  ]);
}

function orderActionButtons(order) {
  const rows = [
    [Markup.button.callback("✅ Qabul", `accept_${order.id}`)],
    [Markup.button.callback("🍳 Tayyor", `ready_${order.id}`)],
  ];

  if (order.order_type === "🚚 Yetkazib berish") {
    rows.push([
      Markup.button.callback("🛵 Kuryerga berish", `courier_pick_${order.id}`),
    ]);
  }

  rows.push([Markup.button.callback("✅ Berildi", `delivered_${order.id}`)]);

  return Markup.inlineKeyboard(rows);
}

// Функция для обновления кнопок на основе статуса заказа
function getOrderStatusButtons(order) {
  const status = order.status || "new";
  const rows = [];

  // Only show buttons relevant to the CURRENT status
  if (status === "new" || status === "pending") {
    rows.push([Markup.button.callback("✅ Qabul", `accept_${order.id}`)]);
    rows.push([Markup.button.callback("🍳 Tayyor", `ready_${order.id}`)]);
    if (order.order_type === "🚚 Yetkazib berish") {
      rows.push([Markup.button.callback("🛵 Kuryerga berish", `courier_pick_${order.id}`)]);
    }
    rows.push([Markup.button.callback("✅ Berildi", `delivered_${order.id}`)]);
  } else if (status === "accepted") {
    rows.push([Markup.button.callback("🍳 Tayyor", `ready_${order.id}`)]);
    if (order.order_type === "🚚 Yetkazib berish") {
      rows.push([Markup.button.callback("🛵 Kuryerga berish", `courier_pick_${order.id}`)]);
    }
    rows.push([Markup.button.callback("✅ Berildi", `delivered_${order.id}`)]);
  } else if (status === "ready") {
    if (order.order_type === "🚚 Yetkazib berish") {
      rows.push([Markup.button.callback("🛵 Kuryerga berish", `courier_pick_${order.id}`)]);
    }
    rows.push([Markup.button.callback("✅ Berildi", `delivered_${order.id}`)]);
  } else if (status === "courier_assigned" || status === "courier_started" || status === "courier_arrived") {
    rows.push([Markup.button.callback("✅ Yetkazildi", `delivered_${order.id}`)]);
  }

  return rows.length ? Markup.inlineKeyboard(rows) : Markup.inlineKeyboard([]);
}

function safeUsername(ctx) {
  return ctx.from.username
    ? `@${ctx.from.username}`
    : ctx.from.first_name || "user";
}

function totalCart(cart) {
  return cart.reduce((sum, p) => sum + Number(p.price || 0), 0);
}

function formatCart(cart) {
  let text = "";
  let total = 0;

  cart.forEach((p, i) => {
    total += Number(p.price || 0);
    text += `${i + 1}. ${p.name} - ${p.price} so'm
`;
  });

  return { text, total };
}

function isCafeOpenByTime(cafe) {
  return Number(cafe.is_open) === 1;
}

function isCafeFrozen(cafe) {
  if (cafe.manual_frozen === 1) return true;
  // Aboniment muddati faqat subscription tarifda tekshiriladi
  if (cafe.tariff_type === 'commission') return false;
  if (!cafe.paid_until) return false;

  const end = new Date(cafe.paid_until);
  const now = new Date();

  return end < now;
}

function showFrozenMessage(ctx) {
  ctx.reply(
    `❄️ Bu cafe vaqtincha muzlatilgan.

To‘lov uchun murojaat qiling:
📞 ${process.env.OWNER_PHONE}
💬 ${process.env.OWNER_TELEGRAM}
📷 ${process.env.OWNER_INSTAGRAM}`,
    simpleBackMenu(),
  );
}

function showProducts(ctx, cafeId, category, subcategory) {
  db.get(`SELECT * FROM cafes WHERE id = ?`, [cafeId], (err, cafe) => {
    if (err || !cafe) return ctx.reply("Cafe topilmadi.");
    if (isCafeFrozen(cafe)) return showFrozenMessage(ctx);

    let query = `SELECT * FROM products WHERE cafe_id = ? AND category = ? AND available = 1`;
    let params = [cafeId, category];

    if (subcategory) {
      query += ` AND subcategory = ?`;
      params.push(subcategory);
    }

    query += ` ORDER BY id DESC`;

    db.all(query, params, (err2, rows) => {
      if (err2) return ctx.reply("Xatolik bo‘ldi.");
      if (!rows.length) {
        return ctx.reply("Bu bo‘limda mahsulot yo‘q.", customerCafeMenu(cafe));
      }

      rows.forEach((p, index) => {
        let priceText = `💰 ${p.price || 0} so'm`;
        let inlineButtons = [];

        let variants = [];
        try {
          variants = JSON.parse(p.variants || "[]");
        } catch (e) { }

        if (variants && variants.length > 0) {
          const enabledVariants = variants.map((v, i) => ({ ...v, _origIndex: i })).filter(v => v.enabled !== false);
          if (enabledVariants.length === 0) return; // all variants disabled — skip product
          const prices = enabledVariants.map(v => Number(v.price || 0));
          const minP = Math.min(...prices);
          const maxP = Math.max(...prices);
          priceText = minP === maxP ? `💰 ${minP} so'm` : `💰 ${minP} - ${maxP} so'm`;
          const varRows = [];
          enabledVariants.forEach((v) => {
            varRows.push([Markup.button.callback(`${v.name} (${v.price} so'm)`, `addv_${p.id}_${v._origIndex}`)]);
          });
          inlineButtons = Markup.inlineKeyboard(varRows);
        } else {
          inlineButtons = Markup.inlineKeyboard([
            [Markup.button.callback("➕ Savatchaga qo‘shish", `add_${p.id}`)],
          ]);
        }

        const caption =
          `🍔 ${p.name}
` +
          `${priceText}
` +
          `📝 ${p.description || "Tavsif yo‘q"}`;

        if (p.image_file_id) {
          ctx.replyWithPhoto(p.image_file_id, {
            caption,
            ...inlineButtons,
          });
        } else {
          ctx.reply(caption, inlineButtons);
        }
      });

      ctx.reply("Kerakli mahsulotni tanlang:", customerCafeMenu(cafe));
    });
  });
}

function updateOrderStatus(orderId, status, extra = {}, callback = () => { }) {
  const fields = ["status = ?"];
  const values = [status];

  if (extra.eta_minutes !== undefined) {
    fields.push("eta_minutes = ?");
    values.push(extra.eta_minutes);
  }

  if (extra.courier_id !== undefined) {
    fields.push("courier_id = ?");
    values.push(extra.courier_id);
  }

  values.push(orderId);

  db.run(
    `UPDATE orders SET ${fields.join(", ")} WHERE id = ?`,
    values,
    callback,
  );
}

function getOrder(orderId, callback) {
  db.get(`SELECT * FROM orders WHERE id = ?`, [orderId], callback);
}

function orderItemsText(itemsJson) {
  let items = [];
  try {
    items = JSON.parse(itemsJson || "[]");
  } catch {
    items = [];
  }

  if (!Array.isArray(items)) return "";

  return items
    .map((p, i) => `${i + 1}. ${p.name} - ${p.price} so'm`)
    .join("\n");
}

function sendOrderToCafeGroup(order, cafe) {
  const itemsText = orderItemsText(order.items_json);

  let message =
    `🆕 Yangi zakaz #${order.id}

` +
    `${itemsText}

` +
    `📦 Turi: ${order.order_type}
` +
    `👤 Ism: ${order.customer_name}
` +
    `📞 Telefon: ${order.customer_phone}
` +
    `💬 Telegram: ${order.customer_telegram || "-"}
`;

  if (order.order_type === "🚚 Yetkazib berish") {
    message += `📍 Manzil: ${order.address || "-"}
`;
    message += `🚚 Delivery narxi: ${order.delivery_price} so'm
`;
  }

  if (order.order_type === "🍽 Shu yerda yeyish") {
    message += `🪑 Stol: ${order.table_number || "-"}
`;
  }

  if (order.note && String(order.note).trim() !== "") {
    message += `📝 Izoh: ${String(order.note).trim()}
`;
  }

  message += `
💰 Jami: ${order.total} so'm`;

  safeSendMessage(
    cafe.order_group_id,
    message,
    orderActionButtons(order),
  ).then(msg => {
    if (msg) db.run(`UPDATE orders SET group_main_msg_id = ? WHERE id = ?`, [`${cafe.order_group_id}_${msg.message_id}`, order.id]);
  });

  if (order.latitude && order.longitude) {
    safeSendLocation(
      cafe.order_group_id,
      order.latitude,
      order.longitude,
    );
  }
}

function buildCafeAnalytics(cafeId, callback) {
  db.all(
    `SELECT * FROM orders WHERE cafe_id = ? ORDER BY created_at DESC`,
    [cafeId],
    (err, orders) => {
      if (err) return callback(err);

      const now = new Date();
      const yyyy = now.getFullYear();
      const mm = String(now.getMonth() + 1).padStart(2, "0");
      const dd = String(now.getDate()).padStart(2, "0");
      const today = `${yyyy}-${mm}-${dd}`;
      const monthPrefix = `${yyyy}-${mm}`;

      let totalOrders = orders.length;
      let totalRevenue = 0;
      let todayOrders = 0;
      let todayRevenue = 0;
      let monthRevenue = 0;

      const customerMap = {};
      const productCountMap = {};
      const productRevenueMap = {};

      orders.forEach((order) => {
        const total = Number(order.total || 0);
        totalRevenue += total;

        const created = String(order.created_at || "");
        if (created.startsWith(today)) {
          todayOrders += 1;
          todayRevenue += total;
        }
        if (created.startsWith(monthPrefix)) {
          monthRevenue += total;
        }

        const customerKey = order.customer_phone || order.user_id || "unknown";
        if (!customerMap[customerKey]) {
          customerMap[customerKey] = {
            key: customerKey,
            name: order.customer_name || order.username || customerKey,
            orders: 0,
            spent: 0,
          };
        }

        customerMap[customerKey].orders += 1;
        customerMap[customerKey].spent += total;

        let items = [];
        try {
          items = JSON.parse(order.items_json || "[]");
        } catch {
          items = [];
        }

        if (Array.isArray(items)) {
          items.forEach((item) => {
            const name = item.name || "Noma’lum";
            const price = Number(item.price || 0);

            if (!productCountMap[name]) {
              productCountMap[name] = 0;
              productRevenueMap[name] = 0;
            }

            productCountMap[name] += 1;
            productRevenueMap[name] += price;
          });
        }
      });

      const topCustomers = Object.values(customerMap)
        .sort((a, b) => b.orders - a.orders || b.spent - a.spent)
        .slice(0, 10);

      const topProducts = Object.keys(productCountMap)
        .map((name) => ({
          name,
          count: productCountMap[name],
          revenue: productRevenueMap[name],
        }))
        .sort((a, b) => b.count - a.count || b.revenue - a.revenue)
        .slice(0, 10);

      const weakProducts = Object.keys(productCountMap)
        .map((name) => ({
          name,
          count: productCountMap[name],
          revenue: productRevenueMap[name],
        }))
        .sort((a, b) => a.count - b.count || a.revenue - b.revenue)
        .slice(0, 5);

      callback(null, {
        totalOrders,
        totalRevenue,
        todayOrders,
        todayRevenue,
        monthRevenue,
        topCustomers,
        topProducts,
        weakProducts,
      });
    },
  );
}

function buildGlobalAnalytics(callback) {
  db.all(`SELECT * FROM cafes ORDER BY id DESC`, [], (err, cafes) => {
    if (err) return callback(err);

    db.all(
      `SELECT * FROM orders ORDER BY created_at DESC`,
      [],
      (err2, orders) => {
        if (err2) return callback(err2);

        let totalRevenue = 0;
        orders.forEach((o) => (totalRevenue += Number(o.total || 0)));

        const cafeRevenueMap = {};
        const cafeOrderMap = {};

        cafes.forEach((c) => {
          cafeRevenueMap[c.id] = 0;
          cafeOrderMap[c.id] = 0;
        });

        orders.forEach((o) => {
          const cafeId = o.cafe_id;
          if (cafeRevenueMap[cafeId] === undefined) cafeRevenueMap[cafeId] = 0;
          if (cafeOrderMap[cafeId] === undefined) cafeOrderMap[cafeId] = 0;
          cafeRevenueMap[cafeId] += Number(o.total || 0);
          cafeOrderMap[cafeId] += 1;
        });

        const topCafes = cafes
          .map((c) => ({
            id: c.id,
            name: c.name,
            revenue: cafeRevenueMap[c.id] || 0,
            orders: cafeOrderMap[c.id] || 0,
          }))
          .sort((a, b) => b.revenue - a.revenue || b.orders - a.orders)
          .slice(0, 10);

        callback(null, {
          totalCafes: cafes.length,
          totalOrders: orders.length,
          totalRevenue,
          topCafes,
        });
      },
    );
  });
}

// === NEW: Get hourly statistics ===
function getHourlyStats(cafeId, callback) {
  db.all(
    `SELECT * FROM orders WHERE cafe_id = ? ORDER BY created_at ASC`,
    [cafeId],
    (err, orders) => {
      if (err) return callback(err);
      
      const hourlyMap = {};
      
      orders.forEach((order) => {
        if (!order.created_at) return;
        const date = new Date(order.created_at);
        const hour = String(date.getHours()).padStart(2, '0');
        const key = `${hour}:00`;
        
        if (!hourlyMap[key]) {
          hourlyMap[key] = { count: 0, revenue: 0 };
        }
        hourlyMap[key].count += 1;
        hourlyMap[key].revenue += Number(order.total || 0);
      });
      
      // Sort by hour
      const hourlyStats = Object.keys(hourlyMap)
        .sort()
        .map(hour => ({
          hour,
          count: hourlyMap[hour].count,
          revenue: hourlyMap[hour].revenue
        }));
      
      callback(null, hourlyStats);
    }
  );
}

bot.start(async (ctx) => {
  try {
    const u = getUser(ctx.from.id);
    u.step = "home";
    u.temp = {};
    u.selectedCafeId = null;
    u.selectedCafeName = null;
    u.cafeAdminId = null;
    u.cart = [];
    u.superAuth = false;
    u.cafeAuth = false;
    resetOrderDraft(u);

    await ctx.reply("Menu:", mainMenu());

    const telegramId = String(ctx.from.id);

    // Kuryerni tekshirish
    db.get(
      `SELECT * FROM couriers WHERE telegram_id = ?`,
      [telegramId],
      async (err, courier) => {
        if (err) {
          console.log("DB ERROR:", err);
          return;
        }

        if (courier) {
          try {
            await ctx.reply("👋 Siz kuryersiz. Zakazlar shu yerga keladi.");
          } catch (e) {
            console.log("Courier reply error:", e.message);
          }
        } else {
          try {
            await ctx.reply("👋 Xush kelibsiz!");
          } catch (e) {
            console.log("User reply error:", e.message);
          }
        }
      },
    );

    // Telegram ID ni update qilish
    if (ctx.from.username) {
      db.run(
        `UPDATE couriers SET telegram_id = ? WHERE telegram = ?`,
        [telegramId, `@${ctx.from.username}`],
        (err) => {
          if (err) console.log("UPDATE ERROR:", err);
        },
      );
    }
  } catch (e) {
    console.log("START ERROR:", e.message);
  }
});

bot.command("id", (ctx) => {
  ctx.reply(`CHAT ID: ${ctx.chat.id}
CHAT TYPE: ${ctx.chat.type}`);
});

bot.command("superPanel", (ctx) => {
  const u = getUser(ctx.from.id);
  u.step = "login";
  u.temp = {};
  u.superAuth = false;
  ctx.reply("Login:");
});

bot.command("cafePanel", (ctx) => {
  const u = getUser(ctx.from.id);
  u.step = "cafe_login";
  u.temp = {};
  u.cafeAuth = false;
  ctx.reply("Cafe login:");
});

bot.command("courier", (ctx) => {
  const u = getUser(ctx.from.id);
  u.step = "courier_auth_login";
  u.temp = {};
  u.courierAuth = false;
  ctx.reply("Kuryer loginini kiriting:", Markup.keyboard([["⬅️ Orqaga"]]).resize());
});

bot.on("contact", (ctx) => {
  if (ctx.chat?.type !== "private") return;
  const u = getUser(ctx.from.id);
  const phone = ctx.message.contact.phone_number;

  if (u.step === "order_phone_contact") {
    u.orderDraft.customer_phone = phone;

    if (u.orderDraft.order_type === "🚚 Yetkazib berish") {
      u.step = "order_address";
      return ctx.reply("Manzilni yozing:", simpleBackMenu());
    }

    if (u.orderDraft.order_type === "🍽 Shu yerda yeyish") {
      db.get(
        `SELECT * FROM cafes WHERE id = ?`,
        [u.selectedCafeId],
        (err, cafe) => {
          if (!cafe) return ctx.reply("Cafe topilmadi.");

          const count = Number(cafe.table_count || 0);

          if (count <= 0) {
            u.step = "order_table";
            return ctx.reply("Stol raqamini yozing:", simpleBackMenu());
          }

          u.step = "order_table";
          return ctx.reply("Stolni tanlang:", tableMenu(count));
        },
      );

      return;
    }

    u.step = "order_note";
    return ctx.reply("Izoh yozing.\nAgar yo'q bo'lsa: 'Yo'q' tugmasini bosing:", noteMenu());
  }
});

bot.on("location", (ctx) => {
  if (ctx.chat?.type !== "private") return;
  const u = getUser(ctx.from.id);

  if (u.step === "location") {
    u.temp.latitude = ctx.message.location.latitude;
    u.temp.longitude = ctx.message.location.longitude;
    u.step = "open_time";
    return ctx.reply("Ochilish vaqti. Masalan: 08:00", simpleBackMenu());
  }

  if (u.step === "order_location") {
    u.orderDraft.latitude = ctx.message.location.latitude;
    u.orderDraft.longitude = ctx.message.location.longitude;
    u.step = "order_note";
    return ctx.reply("Izoh yozing.\nAgar yo‘q bo‘lsa: 'Yo'q' tugmasini bosing:", noteMenu());
  }
});

bot.on("photo", (ctx) => {
  if (ctx.chat?.type !== "private") return;
  const u = getUser(ctx.from.id);
  const fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;

  if (u.step === "edit_value_image") {
    const id = u.temp.editCafeId;
    db.run(`UPDATE cafes SET image_file_id = ? WHERE id = ?`, [fileId, id], (err) => {
      if (err) return ctx.reply("Xatolik ❌");
      u.step = "super";
      u.temp = {};
      ctx.reply("✅ Rasm yangilandi", superMenu());
    });
    return;
  }

  if (u.step === "payment_photo") {
    u.orderDraft.payment_photo_id = fileId;
    return finalizeOrder(ctx, u);
  }

  if (u.step === "image") {
    const paidUntil = new Date();
    if (u.temp.tariff_type !== 'commission') {
      paidUntil.setDate(paidUntil.getDate() + 30);
    }
    const paidUntilValue = u.temp.tariff_type === 'commission' ? null : paidUntil.toISOString();

    db.run(
      `INSERT INTO cafes (name, about, phone, instagram, menu_url, location_text, latitude, longitude, image_file_id, open_time, close_time, admin_login, admin_password, order_group_id, delivery_price, paid_until, card_name, card_number, bank_name, card_qr_id, type, tariff_type, commission_percent, balance, owner_telegram_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        u.temp.name,
        u.temp.about,
        u.temp.phone,
        u.temp.instagram,
        u.temp.menu_url,
        u.temp.location_text,
        u.temp.latitude,
        u.temp.longitude,
        fileId,
        u.temp.open_time,
        u.temp.close_time,
        u.temp.admin_login,
        u.temp.admin_password,
        u.temp.order_group_id,
        u.temp.delivery_price,
        paidUntilValue,
        u.temp.card_name || null,
        u.temp.card_number || null,
        u.temp.bank_name || null,
        u.temp.card_qr_id || null,
        u.temp.cafe_type || 'cafe',
        u.temp.tariff_type || 'subscription',
        u.temp.commission_percent || 0,
        u.temp.initial_balance || 0,
        u.temp.owner_telegram_id || null,
      ],
      // Also set paid_until for subscription tariff
      // (handled by computing paidUntil above based on tariff_type)
      (err) => {
        if (err) {
          console.error("Cafe qo'shishda xatolik:", err);
          return ctx.reply("Cafe qo'shishda xatolik ❌");
        }

        u.step = "super";
        u.temp = {};
        ctx.reply("Cafe qo‘shildi ✅", superMenu());
      },
    );
    return;
  }

  if (u.step === "product_image") {
    db.run(
      `INSERT INTO products (cafe_id, name, price, description, image_file_id, category, subcategory, variants, available)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [
        u.cafeAdminId,
        u.temp.product_name,
        u.temp.product_price || 0,
        u.temp.product_desc,
        fileId,
        u.temp.product_category,
        u.temp.product_subcategory,
        JSON.stringify(u.temp.variants || [])
      ],
      (err) => {
        if (err) {
          console.error("Mahsulot qo'shishda xatolik:", err);
          return ctx.reply("Mahsulot qo'shishda xatolik ❌");
        }

        u.step = "cafe";
        u.temp = {};
        getCafeMenuAsync(u.cafeAdminId, (menu) => {
          ctx.reply("Mahsulot qo‘shildi ✅", menu);
        });
      },
    );
  }
});

// CALLBACKS
bot.action(/accept_(\d+)/, async (ctx) => {
  if (await isProcessing(ctx.from.id)) return safeAnswerCbQuery(ctx, 'Iltimos, kuting...');
  const orderId = Number(ctx.match[1]);

  const before = await getOrderAsync(orderId);
  debugOrder("handler.accept.enter", {
    orderId,
    before_status: before?.status,
    ...getCtxMsgInfo(ctx),
  });

  updateOrderStatus(orderId, "accepted", {}, async (err) => {
    if (err) {
      console.error("Zakaz qabul qilishda xatolik:", err);
      await safeAnswerCbQuery(ctx, 'Xatolik');
      return;
    }

    // Get order details to build correct buttons
    getOrder(orderId, async (err2, order) => {
      if (err2 || !order) {
        await safeAnswerCbQuery(ctx, 'Zakaz topilmadi');
        return;
      }

      // Build new buttons based on order status
      const newButtons = getOrderStatusButtons(order);
      debugOrder("handler.accept.afterUpdate", {
        orderId,
        after_status: order?.status,
        edit_chat_id: ctx.chat?.id,
        edit_message_id: ctx.callbackQuery?.message?.message_id,
        reply_markup: shorten(safeJson(extractReplyMarkup(newButtons)?.inline_keyboard ? extractReplyMarkup(newButtons) : newButtons.reply_markup || newButtons), 1200),
      });
      await safeEditMessageReplyMarkup(ctx.chat.id, ctx.callbackQuery.message.message_id, newButtons.reply_markup);
      await safeAnswerCbQuery(ctx, '✅ Qabul qilindi');
      
      // Ask for ETA
      const etaMsg = await ctx.reply(
        `⏱ Zakaz #${orderId} uchun vaqtni tanlang`,
        etaButtons(orderId),
        
      );
      if (etaMsg) trackTempMessage(orderId, ctx.chat.id, etaMsg.message_id);
    });

    // === BUSINESS ENGINE: Charge commission ===
    getOrder(orderId, (err2, order) => {
      if (!err2 && order) {
        chargeCommission(orderId, order, (commission, newBalance) => {
          if (commission > 0) {
            }
        });
      }
    });
  });
});

bot.action(/eta_(\d+)_(\d+)/, async (ctx) => {
  if (await isProcessing(ctx.from.id)) return safeAnswerCbQuery(ctx, 'Iltimos, kuting...');
  const orderId = Number(ctx.match[1]);
  const minutes = Number(ctx.match[2]);

  updateOrderStatus(
    orderId,
    "accepted",
    { eta_minutes: minutes },
    async (err) => {
      if (err) {
        console.error("ETA qo'shishda xatolik:", err);
        await safeAnswerCbQuery(ctx);
        return;
      }

      getOrder(orderId, async (err2, order) => {
        if (!err2 && order) {
          const m = await safeSendMessage(
            order.user_id,
            `✅ Sizning zakazingiz qabul qilindi.
⏱ Taxminiy vaqt: ${minutes} daqiqa.`,
          );
          if (m) trackTempMessage(orderId, order.user_id, m.message_id);
        }
      });

      await safeAnswerCbQuery(ctx);
      const m2 = await ctx.reply(
        `✅ Zakaz #${orderId} qabul qilindi
⏱ ${minutes} daqiqada tayyor bo‘ladi`,
      );
      if (m2) trackTempMessage(orderId, ctx.chat.id, m2.message_id);
    },
  );
});

bot.action(/ready_(\d+)/, async (ctx) => {
  if (await isProcessing(ctx.from.id)) return safeAnswerCbQuery(ctx, 'Iltimos, kuting...');
  const orderId = Number(ctx.match[1]);

  const before = await getOrderAsync(orderId);
  debugOrder("handler.ready.enter", {
    orderId,
    before_status: before?.status,
    ...getCtxMsgInfo(ctx),
  });

  updateOrderStatus(orderId, "ready", {}, async (err) => {
    if (err) {
      console.error("Tayyor statusda xatolik:", err);
      await safeAnswerCbQuery(ctx);
      return;
    }

    getOrder(orderId, async (err2, order) => {
      if (!err2 && order) {
        const m = await safeSendMessage(
          order.user_id,
          `🍳 Sizning mahsulotingiz tayyor bo‘ldi.`,
        );
        if (m) trackTempMessage(orderId, order.user_id, m.message_id);
      }
    });

    // FIX #5: Update buttons based on order status instead of removing
    getOrder(orderId, async (err3, updatedOrder) => {
      if (!err3 && updatedOrder) {
        const newButtons = getOrderStatusButtons(updatedOrder);
        debugOrder("handler.ready.afterUpdate", {
          orderId,
          after_status: updatedOrder?.status,
          edit_chat_id: ctx.chat?.id,
          edit_message_id: ctx.callbackQuery?.message?.message_id,
          reply_markup: shorten(safeJson(extractReplyMarkup(newButtons.reply_markup)), 1200),
        });
        await safeEditMessageReplyMarkup(ctx.chat.id, ctx.callbackQuery.message.message_id, newButtons.reply_markup);
      }
    });

    await safeAnswerCbQuery(ctx, 'Tayyor belgilandi');
    const m2 = await ctx.reply(`🍳 Zakaz #${orderId} tayyor bo‘ldi`);
    if (m2) trackTempMessage(orderId, ctx.chat.id, m2.message_id);
  });
});

bot.action(/courier_pick_(\d+)/, async (ctx) => {
  if (await isProcessing(ctx.from.id)) return safeAnswerCbQuery(ctx, 'Iltimos, kuting...');
  const orderId = Number(ctx.match[1]);

  const before = await getOrderAsync(orderId);
  debugOrder("handler.courier_pick.enter", {
    orderId,
    before_status: before?.status,
    ...getCtxMsgInfo(ctx),
  });

  getOrder(orderId, (err, order) => {
    if (err || !order) return safeAnswerCbQuery(ctx);

    db.all(
      `SELECT * FROM couriers WHERE (cafe_id = ? OR cafe_id IS NULL OR cafe_id = 0) AND is_online = 1`,
      [order.cafe_id],
      async (err2, couriers) => {
        if (err2 || !couriers.length) {
          await safeAnswerCbQuery(ctx);
          return;
        }

        const buttons = couriers.map((c) => [
          Markup.button.callback(c.name, `assignCourier_${orderId}_${c.id}`),
        ]);

        await safeAnswerCbQuery(ctx);
        debugOrder("handler.courier_pick.showList", {
          orderId,
          couriers_count: couriers.length,
          inline_keyboard_rows: buttons.length,
        });
        await ctx.reply("Kuryerni tanlang:", Markup.inlineKeyboard(buttons));
      },
    );
  });
});

bot.action(/assignCourier_(\d+)_(\d+)/, async (ctx) => {
  if (await isProcessing(ctx.from.id)) return safeAnswerCbQuery(ctx, 'Iltimos, kuting...');
  const orderId = Number(ctx.match[1]);
  const courierId = Number(ctx.match[2]);

  const before = await getOrderAsync(orderId);
  debugOrder("handler.assignCourier.enter", {
    orderId,
    courierId,
    before_status: before?.status,
    ...getCtxMsgInfo(ctx),
  });

  updateOrderStatus(
    orderId,
    "courier_assigned",
    { courier_id: courierId },
    async (err) => {
      if (err) {
        console.error("Kuryer tayinlashda xatolik:", err);
        await safeAnswerCbQuery(ctx);
        return;
      }

      db.get(`SELECT * FROM orders WHERE id = ?`, [orderId], (err2, order) => {
        if (err2 || !order) return;

        db.get(
          `SELECT * FROM couriers WHERE id = ?`,
          [courierId],
          async (err3, courier) => {
            if (err3 || !courier) return;

            // Get cafe name
            db.get(
              `SELECT name FROM cafes WHERE id = ?`,
              [order.cafe_id],
              async (err4, cafe) => {
                if (err4 || !cafe) return;

                let clientText =
              `🛵 Sizning buyurtmangiz kuryerga berildi.

` +
              `👤 Kuryer: ${courier.name}
` +
              `📞 Telefon: ${courier.phone || "-"}
` +
              `🚗 Mashina: ${courier.car_model || "-"}
` +
              `🔢 Raqam: ${courier.car_number || "-"}

` +
              `💰 Mahsulotlar: ${Number(order.total || 0) - Number(order.delivery_price || 0)} so'm
` +
              `🚚 Yetkazib berish: ${Number(order.delivery_price || 0)} so'm
` +
              `💵 Jami to‘lov: ${Number(order.total || 0)} so'm
`;

                if (courier.telegram) {
                  clientText += `💬 Telegram: ${courier.telegram}
`;
                }

                if (courier.telegram_id) {
              // Build full receipt for courier (similar to group receipt)
              const itemsText = orderItemsText(order.items_json);
              let courierReceipt =
                `🆕 Yangi zakaz #${orderId}
` +
                `🏪 Cafe: ${cafe.name}

${itemsText}

📦 Turi: ${order.order_type}
👤 Mijoz: ${order.customer_name}
📞 Telefon: ${order.customer_phone}
`;

              if (order.order_type === "🚚 Yetkazib berish") {
                courierReceipt += `📍 Manzil: ${order.address || "-"}
`;
                courierReceipt += `🚚 Delivery narxi: ${order.delivery_price} so'm
`;
              }

              if (order.note && String(order.note).trim() !== "") {
                courierReceipt += `📝 Izoh: ${String(order.note).trim()}
`;
              }

              courierReceipt += `💰 Jami: ${order.total} so'm`;

              // Send full receipt to courier (not tracked - should remain after order completion)
              const cm1 = await safeSendMessage(courier.telegram_id, courierReceipt);
              // Don't track courier's receipt - it should stay
              // if (cm1) trackTempMessage(orderId, courier.telegram_id, cm1.message_id);

              if (order.latitude && order.longitude) {
                const cm2 = await safeSendLocation(
                  courier.telegram_id,
                  order.latitude,
                  order.longitude,
                );
                // keep courier location message
              }

              const cm3 = await safeSendMessage(
                courier.telegram_id,
                "📦 Zakazni boshqarish:",
                Markup.inlineKeyboard([
                  [
                    Markup.button.callback(
                      "🛵 Oldim",
                      `courier_started_${orderId}`,
                    ),
                  ],
                  [
                    Markup.button.callback(
                      "📦 Yetib keldim",
                      `courier_arrived_${orderId}`,
                    ),
                  ],
                  [
                    Markup.button.callback(
                      "✅ Topshirildi",
                      `courier_done_${orderId}`,
                    ),
                  ],
                ]),
              );
              // Don't track courier's button message - we want to keep it but remove its keyboard later
              // if (cm3) trackTempMessage(orderId, courier.telegram_id, cm3.message_id);
            }

            const clm = await safeSendMessage(order.user_id, clientText);
            if (clm) trackTempMessage(orderId, order.user_id, clm.message_id);

            // Delete "Kuryerni tanlang" message (the one user just clicked on)
            const courierPickMsg = ctx.callbackQuery?.message;
            if (courierPickMsg?.chat?.id && courierPickMsg?.message_id) {
              safeDeleteMessage(courierPickMsg.chat.id, courierPickMsg.message_id);
            }

            // Clean up temp messages from earlier steps (Vaqtni tanlang, etc.)
            // cleanUpOrderMessages preserves main receipt and tracked courier messages
            cleanUpOrderMessages(orderId);

            // Update MAIN receipt message buttons to show only "Yetkazildi"
            const updatedOrder = { ...order, status: "courier_assigned" };
            const newButtons = getOrderStatusButtons(updatedOrder);
            if (order.group_main_msg_id) {
              const parts = String(order.group_main_msg_id).split("_");
              if (parts.length === 2) {
                const gChatId = Number(parts[0]) || null;
                const gMsgId = Number(parts[1]) || null;
                if (gChatId && gMsgId) {
                  await safeEditMessageReplyMarkup(gChatId, gMsgId, newButtons.reply_markup);
                }
              }
            }

            await safeAnswerCbQuery(ctx);
            const grm = await ctx.reply(
              `🛵 Zakaz #${orderId} kuryerga berildi: ${courier.name}`,
            );
            if (grm) trackTempMessage(orderId, ctx.chat.id, grm.message_id);
          });
        });
      });
    });
  });

bot.action(/courier_started_(\d+)/, async (ctx) => {
  if (await isProcessing(ctx.from.id)) return safeAnswerCbQuery(ctx, 'Iltimos, kuting...');
  const orderId = Number(ctx.match[1]);

  updateOrderStatus(orderId, "courier_started", {}, async (err) => {
    if (err) return safeAnswerCbQuery(ctx);

    db.get(
      `SELECT * FROM orders WHERE id = ?`,
      [orderId],
      async (err2, order) => {
        if (order) {
          const m = await safeSendMessage(
            order.user_id,
            "🛵 Kuryer yo‘lga chiqdi",
          );
          if (m) trackTempMessage(orderId, order.user_id, m.message_id);
        }
      },
    );

    await safeAnswerCbQuery(ctx);
    const clm2 = await ctx.reply(`🛵 Zakaz #${orderId} - Kuryer yo'lga chiqdi.`);
    if (clm2) trackTempMessage(orderId, ctx.chat.id, clm2.message_id);
  });
});

bot.action(/courier_arrived_(\d+)/, async (ctx) => {
  if (await isProcessing(ctx.from.id)) return safeAnswerCbQuery(ctx, 'Iltimos, kuting...');
  const orderId = Number(ctx.match[1]);

  updateOrderStatus(orderId, "courier_arrived", {}, async (err) => {
    if (err) return safeAnswerCbQuery(ctx);

    db.get(
      `SELECT * FROM orders WHERE id = ?`,
      [orderId],
      async (err2, order) => {
        if (order) {
          const m = await safeSendMessage(
            order.user_id,
            `📦 Kuryer yetib keldi 💵 Tayyorlab qo‘ying:${Number(order.total || 0)} so'm`,
          );
          if (m) trackTempMessage(orderId, order.user_id, m.message_id);
        }
      },
    );

    await safeAnswerCbQuery(ctx);
    const clm2 = await ctx.reply(`📦 Zakaz #${orderId} - Yetib kelindi.`);
    if (clm2) trackTempMessage(orderId, ctx.chat.id, clm2.message_id);
  });
});

bot.action(/courier_done_(\d+)/, async (ctx) => {
  if (await isProcessing(ctx.from.id)) return safeAnswerCbQuery(ctx, 'Iltimos, kuting...');
  const orderId = Number(ctx.match[1]);

  const before = await getOrderAsync(orderId);
  debugOrder("handler.courier_done.enter", {
    orderId,
    before_status: before?.status,
    ...getCtxMsgInfo(ctx),
  });

  updateOrderStatus(orderId, "delivered", {}, async (err) => {
    if (err) return safeAnswerCbQuery(ctx);

    db.get(
      `SELECT * FROM orders WHERE id = ?`,
      [orderId],
      async (err2, order) => {
        if (!order) return;

        // Send final message to client
        await safeSendMessage(
          order.user_id,
          `✅ Buyurtmangiz topshirildi 😋

Yoqimli ishtaha! 🍽

Agar kamchiliklar bo‘lsa:
📞 ${process.env.OWNER_PHONE}
💬 ${process.env.OWNER_TELEGRAM}`,
        );

        // Edit main receipt in group: remove inline buttons and send yakunlandi
        db.get(
          `SELECT * FROM cafes WHERE id = ?`,
          [order.cafe_id],
          async (err3, cafe) => {
            if (cafe && cafe.order_group_id && order.group_main_msg_id) {
              const parts = String(order.group_main_msg_id).split("_");
              if (parts.length === 2) {
                const gChatId = Number(parts[0]) || null;
                const gMsgId = Number(parts[1]) || null;
                if (gChatId && gMsgId) {
                  // Remove inline buttons from main receipt
                  await safeEditMessageReplyMarkup(gChatId, gMsgId, { inline_keyboard: [] });
                  // Send yakunlandi as separate message under receipt (not tracked - should remain)
                  await safeSendMessage(cafe.order_group_id, `✅ Zakaz #${orderId} yakunlandi`);
                }
              }
            }
          },
        );

        // Clean up temporary messages (preserves main receipt and location)
        cleanUpOrderMessages(orderId);

        // Remove inline keyboard from courier's button message (the message they pressed)
        const courierBtnMsg = ctx.callbackQuery?.message;
        if (courierBtnMsg?.chat?.id && courierBtnMsg?.message_id) {
          safeEditMessageReplyMarkup(courierBtnMsg.chat.id, courierBtnMsg.message_id, {
            inline_keyboard: [],
          });
        }
      },
    );

    await safeAnswerCbQuery(ctx);
    const replyMsg = await ctx.reply(`✅ Zakaz #${orderId} topshirildi va yakunlandi`);
    if (replyMsg) trackTempMessage(orderId, ctx.chat.id, replyMsg.message_id);
  });
});

bot.action(/delivered_(\d+)/, async (ctx) => {
  if (await isProcessing(ctx.from.id)) return safeAnswerCbQuery(ctx, 'Iltimos, kuting...');
  const orderId = Number(ctx.match[1]);

  const before = await getOrderAsync(orderId);
  debugOrder("handler.delivered.enter", {
    orderId,
    before_status: before?.status,
    ...getCtxMsgInfo(ctx),
  });

  updateOrderStatus(orderId, "delivered", {}, async (err) => {
    if (err) return safeAnswerCbQuery(ctx);

    getOrder(orderId, async (err2, order) => {
      if (!err2 && order) {
        // Update group message: add "zakaz yakunlandi" and remove inline keyboard
        try {
          const msg = ctx.callbackQuery?.message;
          const baseText = msg?.text || msg?.caption || "";
          const statusLine = `✅ Zakaz #${orderId} yakunlandi`;
          const alreadyHas = baseText.includes(statusLine);
          const updatedText = alreadyHas ? baseText : `${baseText}\n\n${statusLine}`;

          debugOrder("handler.delivered.updateSameMessage", {
            orderId,
            edit_chat_id: msg?.chat?.id,
            edit_message_id: msg?.message_id,
            base_len: baseText.length,
            updated_len: updatedText.length,
          });

          // Update text AND remove inline keyboard
          if (msg?.chat?.id && msg?.message_id && updatedText.trim()) {
            await safeEditMessageText(msg.chat.id, msg.message_id, updatedText, {
              reply_markup: { inline_keyboard: [] }
            });
          }
        } catch (e) {
          // keep silent; status is still updated in DB
        }

        // Send final message to client
        await safeSendMessage(
          order.user_id,
          `✅ Buyurtmangiz topshirildi 😋

Yoqimli ishtaha! 🍽

Agar kamchiliklar bo‘lsa:
📞 ${process.env.OWNER_PHONE}
💬 ${process.env.OWNER_TELEGRAM}`,
        );

        // Trigger cleanup of temporary messages after 400ms
        setTimeout(() => cleanUpOrderMessages(orderId), 400);
      }
    });

    await safeAnswerCbQuery(ctx);
    const replyMsg = await ctx.reply(`✅ Zakaz #${orderId} topshirildi va yakunlandi`);
    if (replyMsg) trackTempMessage(orderId, ctx.chat.id, replyMsg.message_id);
  });
});

bot.action(/add_(\d+)/, async (ctx) => {
  if (await isProcessing(ctx.from.id)) return safeAnswerCbQuery(ctx, 'Iltimos, kuting...');
  const productId = Number(ctx.match[1]);
  const u = getUser(ctx.from.id);

  db.get(
    `SELECT * FROM products WHERE id = ? AND available = 1`,
    [productId],
    async (err, product) => {
      if (err || !product) {
        // FIX #3: Product unavailable - show toast
        return safeAnswerCbQuery(ctx, '❌ Mahsulot mavjud emas');
      }

      u.cart.push({
        id: product.id,
        name: product.name,
        price: product.price,
      });

      // FIX #3: Show ✅ toast, no extra chat message
      await safeAnswerCbQuery(ctx, '✅ Savatchaga qo\'shildi');
    },
  );
});

bot.action(/addv_(\d+)_(\d+)/, async (ctx) => {
  if (await isProcessing(ctx.from.id)) return safeAnswerCbQuery(ctx, 'Iltimos, kuting...');
  const productId = Number(ctx.match[1]);
  const variantIndex = Number(ctx.match[2]);
  const u = getUser(ctx.from.id);

  db.get(`SELECT * FROM products WHERE id = ? AND available = 1`, [productId], async (err, product) => {
    if (err || !product) return safeAnswerCbQuery(ctx, '❌ Mahsulot mavjud emas');

    let variants = [];
    try {
      variants = JSON.parse(product.variants || "[]");
    } catch (e) { }

    const variant = variants[variantIndex];
    if (!variant) return safeAnswerCbQuery(ctx, '❌ Variant topilmadi');
    if (variant.enabled === false) return safeAnswerCbQuery(ctx, '❌ Bu variant hozir mavjud emas');

    u.cart.push({
      id: product.id,
      name: `${product.name} (${variant.name})`,
      price: variant.price,
    });

    // FIX #3: Show ✅ toast for variant add
    await safeAnswerCbQuery(ctx, '✅ Savatchaga qo\'shildi');
  });
});

// === Variant ON/OFF toggle (cafe panel) ===
bot.action(/toggleVar_(\d+)_(\d+)/, async (ctx) => {
  try {
    if (await isProcessing(ctx.from.id)) return safeAnswerCbQuery(ctx, 'Iltimos, kuting...');
    const productId = Number(ctx.match[1]);
    const variantIndex = Number(ctx.match[2]);
    const u = getUser(ctx.from.id);

    if (!u.cafeAdminId) return safeAnswerCbQuery(ctx, '❌ Avval cafe panelga kiring');

    db.get(`SELECT * FROM products WHERE id = ? AND cafe_id = ?`, [productId, u.cafeAdminId], async (err, product) => {
      if (err || !product) return safeAnswerCbQuery(ctx, '❌ Mahsulot topilmadi');

      let variants = [];
      try {
        variants = JSON.parse(product.variants || "[]");
      } catch (e) { variants = []; }

      if (!variants[variantIndex]) return safeAnswerCbQuery(ctx, '❌ Variant topilmadi');

      // Toggle variant enabled
      variants[variantIndex].enabled = variants[variantIndex].enabled === false ? true : false;
      const newEnabled = variants[variantIndex].enabled;

      db.run(
        `UPDATE products SET variants = ? WHERE id = ?`,
        [JSON.stringify(variants), productId],
        async (err2) => {
          if (err2) return safeAnswerCbQuery(ctx, '❌ Xatolik');

          // Rebuild inline keyboard with updated status
          const statusIcon = Number(product.available) === 1 ? "✅" : "❌";
          let msg = `🔄 ${product.name} (ID: ${product.id})\n📌 Mahsulot holati: ${statusIcon}\n\nVariantlar:`;
          const rows = [];
          variants.forEach((v, i) => {
            const vIcon = v.enabled !== false ? "✅" : "❌";
            rows.push([Markup.button.callback(`${vIcon} ${v.name} (${v.price} so'm)`, `toggleVar_${product.id}_${i}`)]);
          });
          rows.push([Markup.button.callback(`${statusIcon} Mahsulot ON/OFF`, `toggleProdAvail_${product.id}`)]);

          try {
            await safeEditMessageText(ctx.chat.id, ctx.callbackQuery.message.message_id, msg, Markup.inlineKeyboard(rows));
          } catch (e) { }

          await safeAnswerCbQuery(ctx, newEnabled ? '✅ Variant yoqildi' : '❌ Variant o\'chirildi');
        },
      );
    });
  } catch (e) {
    console.log('toggleVar error:', e.message);
    await safeAnswerCbQuery(ctx, '❌ Xatolik');
  }
});

// === Product available ON/OFF toggle for variant products (cafe panel) ===
bot.action(/toggleProdAvail_(\d+)/, async (ctx) => {
  try {
    if (await isProcessing(ctx.from.id)) return safeAnswerCbQuery(ctx, 'Iltimos, kuting...');
    const productId = Number(ctx.match[1]);
    const u = getUser(ctx.from.id);

    if (!u.cafeAdminId) return safeAnswerCbQuery(ctx, '❌ Avval cafe panelga kiring');

    db.get(`SELECT * FROM products WHERE id = ? AND cafe_id = ?`, [productId, u.cafeAdminId], async (err, product) => {
      if (err || !product) return safeAnswerCbQuery(ctx, '❌ Mahsulot topilmadi');

      const newStatus = Number(product.available) === 1 ? 0 : 1;

      db.run(
        `UPDATE products SET available = ? WHERE id = ?`,
        [newStatus, productId],
        async (err2) => {
          if (err2) return safeAnswerCbQuery(ctx, '❌ Xatolik');

          // Rebuild inline keyboard with updated product status
          let variants = [];
          try {
            variants = JSON.parse(product.variants || "[]");
          } catch (e) { variants = []; }

          const statusIcon = newStatus === 1 ? "✅" : "❌";
          let msg = `🔄 ${product.name} (ID: ${product.id})\n📌 Mahsulot holati: ${statusIcon}\n\nVariantlar:`;
          const rows = [];
          variants.forEach((v, i) => {
            const vIcon = v.enabled !== false ? "✅" : "❌";
            rows.push([Markup.button.callback(`${vIcon} ${v.name} (${v.price} so'm)`, `toggleVar_${product.id}_${i}`)]);
          });
          rows.push([Markup.button.callback(`${statusIcon} Mahsulot ON/OFF`, `toggleProdAvail_${product.id}`)]);

          try {
            await safeEditMessageText(ctx.chat.id, ctx.callbackQuery.message.message_id, msg, Markup.inlineKeyboard(rows));
          } catch (e) { }

          await safeAnswerCbQuery(ctx, newStatus === 1 ? '✅ Mahsulot yoqildi' : '❌ Mahsulot o\'chirildi');
        },
      );
    });
  } catch (e) {
    console.log('toggleProdAvail error:', e.message);
    await safeAnswerCbQuery(ctx, '❌ Xatolik');
  }
});

bot.on("text", (ctx) => {
  if (ctx.chat?.type !== "private") return;
  const text = ctx.message.text;
  const u = getUser(ctx.from.id);

  // user cafelar
  if (text === "🏪 Cafelar") {
    db.all(`SELECT * FROM cafes WHERE is_visible = 1 AND is_open = 1 AND manual_frozen = 0 AND (is_deleted = 0 OR is_deleted IS NULL) ORDER BY name ASC`, [], (err, rows) => {
      if (err) return ctx.reply("Xatolik bo‘ldi.");

      const activeCafes = rows.filter(c => {
        if (!isCafeOpenByTime(c)) return false;
        if (isCafeFrozen(c)) return false;
        return true;
      });

      if (!activeCafes.length) return ctx.reply("Hozircha ochiq cafe yo‘q.");

      const buttons = activeCafes.map((c) => [c.name]);
      buttons.push(["⬅️ Orqaga"]);
      ctx.reply("Tanlang:", Markup.keyboard(buttons).resize());
    });
    return;
  }

  const telegramId = String(ctx.from.id);
  const username = ctx.from.username ? `@${ctx.from.username}` : null;

  if (username) {
    db.run(`UPDATE couriers SET telegram_id = ? WHERE telegram = ?`, [
      telegramId,
      username,
    ]);
  }

  // Courier Auth
  if (u.step === "courier_auth_login") {
    u.temp.courier_auth_login = text;
    u.step = "courier_auth_password";
    return ctx.reply("Parolni kiriting (yoki /start orqali bekor qiling):");
  }

  if (u.step === "courier_auth_password") {
    db.get(`SELECT * FROM couriers WHERE login = ? AND password = ?`, [u.temp.courier_auth_login, text], (err, courier) => {
      if (err || !courier) return ctx.reply("Noto'g'ri login yoki parol. Qaytadan /courier bosing.");

      u.courierId = courier.id;
      u.courierAuth = true;
      u.step = "courier_panel";
      db.run(`UPDATE couriers SET telegram_id = ? WHERE id = ?`, [telegramId, courier.id]);
      return ctx.reply(`Xush kelibsiz, ${courier.name}!`, courierMenu());
    });
    return;
  }

  // Courier Panel Logic
  if (u.courierAuth && text === "🟢 Online") {
    db.run(`UPDATE couriers SET is_online = 1 WHERE id = ?`, [u.courierId], (err) => {
      if (!err) ctx.reply("✅ Siz Online holatdasiz. Endi zakazlar qabul qilasiz.", courierMenu());
    });
    return;
  }

  if (u.courierAuth && text === "🔴 Offline") {
    db.run(`UPDATE couriers SET is_online = 0 WHERE id = ?`, [u.courierId], (err) => {
      if (!err) ctx.reply("🔴 Siz Offline holatdasiz. Zakazlar kelmaydi.", courierMenu());
    });
    return;
  }

  if (u.courierAuth && text === "📦 Mening zakazlarim") {
    db.all(`SELECT * FROM orders WHERE courier_id = ? AND status IN ('courier_assigned', 'courier_started', 'courier_arrived')`, [u.courierId], (err, rows) => {
      if (err || !rows.length) return ctx.reply("Hozircha faol zakazlaringiz yo'q.");

      let msg = "Aktiv zakazlar:\n\n";
      rows.forEach(o => {
        msg += `📦 Zakaz #${o.id} - ${o.address || '-'}
📞 Mijoz: ${o.customer_phone || '-'}
💰 Jami: ${o.total} so'm

`;
      });
      ctx.reply(msg);
    });
    return;
  }

  if (u.courierAuth && text === "📊 Kuryer statistikasi") {
    db.all(`SELECT delivery_price, created_at FROM orders WHERE courier_id = ? AND status = 'delivered'`, [u.courierId], (err, rows) => {
      if (err) return ctx.reply("Xatolik bo'ldi.");
      const now = new Date();
      let stats = { todayCount: 0, todaySum: 0, monthCount: 0, monthSum: 0, totalCount: rows.length, totalSum: 0 };

      rows.forEach(r => {
        const d = new Date(r.created_at);
        const price = Number(r.delivery_price || 0);
        stats.totalSum += price;

        if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()) {
          stats.monthCount++;
          stats.monthSum += price;
          if (d.getDate() === now.getDate()) {
            stats.todayCount++;
            stats.todaySum += price;
          }
        }
      });

      let textMsg = `📊 Statistika

` +
        `Bugun:
Jami zakazlar: ${stats.todayCount}
Ishlab topildi: ${stats.todaySum} so'm

` +
        `Bu oy:
Jami zakazlar: ${stats.monthCount}
Ishlab topildi: ${stats.monthSum} so'm

` +
        `Barcha vaqt:
Jami zakazlar: ${stats.totalCount}
Ishlab topildi: ${stats.totalSum} so'm`;
      ctx.reply(textMsg, courierMenu());
    });
    return;
  }

  if (u.step === "courier_car_model") {
    u.temp.courier_car_model = text;
    u.step = "courier_car_number";
    return ctx.reply("Mashina raqamini yozing:", simpleBackMenu());
  }

  if (u.step === "courier_car_number") {
    u.temp.courier_car_number = text;
    u.step = "courier_telegram";
    return ctx.reply("Kuryer telegrami. Yo‘q bo‘lsa: yoq", simpleBackMenu());
  }

  if (text === "✏️ Mahsulot tahrirlash") {
    u.step = "edit_product_id";
    return ctx.reply("Qaysi mahsulot? ID yozing:", simpleBackMenu());
  }

  if (u.step === "edit_product_id") {
    const id = Number(text);

    db.get(
      `SELECT * FROM products WHERE id = ? AND cafe_id = ?`,
      [id, u.cafeAdminId],
      (err, product) => {
        if (!product) return ctx.reply("Topilmadi ❌");

        u.temp.productId = id;
        u.step = "edit_product_field";

        ctx.reply(
          "Nimani o‘zgartirmoqchisiz?",
          Markup.keyboard([
            ["Nomi", "Narxi"],
            ["Tavsif"],
            ["⬅️ Orqaga"],
          ]).resize(),
        );
      },
    );

    return;
  }

  if (u.step === "edit_product_field") {
    const map = {
      Nomi: "name",
      Narxi: "price",
      Tavsif: "description",
    };

    if (!map[text]) return ctx.reply("Tugmadan tanlang");

    u.temp.editField = map[text];
    u.step = "edit_product_value";

    return ctx.reply("Yangi qiymatni yozing:");
  }

  if (u.step === "edit_product_value") {
    const field = u.temp.editField;
    let value = text;

    if (field === "price") {
      value = Number(text);
      if (!value) return ctx.reply("Narx noto‘g‘ri ❌");
    }

    db.run(
      `UPDATE products SET ${field} = ? WHERE id = ?`,
      [value, u.temp.productId],
      (err) => {
        if (err) return ctx.reply("Xatolik ❌");

        u.step = "cafe";
        u.temp = {};

        getCafeMenuAsync(u.cafeAdminId, (menu) => {
          ctx.reply("✅ Yangilandi", menu);
        });
      },
    );

    return;
  }

  if (text === "❌ Kuryer o‘chirish" || text === "❌ Kuryer o'chirish") {
    u.temp.isDeletingGlobal = (u.step === "super");
    u.step = "delete_courier";
    return ctx.reply("Kuryer ID yozing:", simpleBackMenu());
  }

  if (u.step === "delete_courier") {
    const id = Number(text);

    if (!id) return ctx.reply("ID noto‘g‘ri ❌");

    const isSuperPanel = u.temp.isDeletingGlobal;
    db.run(
      isSuperPanel ? `DELETE FROM couriers WHERE id = ?` : `DELETE FROM couriers WHERE id = ? AND cafe_id = ?`,
      isSuperPanel ? [id] : [id, u.cafeAdminId],
      function (err) {
        if (err) {
          console.error("Kuryer o'chirishda xatolik:", err);
          return ctx.reply("Xatolik ❌");
        }

        if (this.changes === 0) {
          return ctx.reply("Kuryer topilmadi ❌");
        }

        if (isSuperPanel) {
          u.step = "super";
          return ctx.reply("🗑 Kuryer o‘chirildi ✅", superMenu());
        }

        u.step = "cafe";
        getCafeMenuAsync(u.cafeAdminId, (menu) => {
          ctx.reply("🗑 Kuryer o‘chirildi ✅", menu);
        });
      },
    );

    return;
  }

  // 🚚 Yetkazib berish narxi — change delivery price
  if (text === "🚚 Yetkazib berish narxi") {
    try {
      db.get(`SELECT delivery_price FROM cafes WHERE id = ?`, [u.cafeAdminId], (err, cafe) => {
        if (err || !cafe) return ctx.reply("Cafe topilmadi ❌");
        u.step = "change_delivery_price";
        ctx.reply(`🚚 Hozirgi yetkazib berish narxi: ${Number(cafe.delivery_price || 0)} so'm\n\nYangi narxni kiriting:`, simpleBackMenu());
      });
    } catch (e) {
      ctx.reply("Xatolik ❌");
    }
    return;
  }

  if (u.step === "change_delivery_price") {
    try {
      const newPrice = Number(text);
      if (!Number.isFinite(newPrice) || newPrice < 0) {
        return ctx.reply("❌ Raqam kiriting (0 yoki undan katta):");
      }

      db.run(
        `UPDATE cafes SET delivery_price = ? WHERE id = ?`,
        [Math.round(newPrice), u.cafeAdminId],
        (err) => {
          if (err) return ctx.reply("Xatolik ❌");

          u.step = "cafe";
          getCafeMenuAsync(u.cafeAdminId, (menu) => {
            ctx.reply(`✅ Yetkazib berish narxi yangilandi: ${Math.round(newPrice)} so'm`, menu);
          });
        },
      );
    } catch (e) {
      ctx.reply("Xatolik ❌");
    }
    return;
  }

  if (text === "🪑 Stol soni") {
    u.step = "table_count";
    return ctx.reply("Nechta stol bor? Masalan: 10", simpleBackMenu());
  }

  if (u.step === "table_count") {
    const count = Number(text);

    if (!count || count < 1) {
      return ctx.reply("To‘g‘ri son kiriting. Masalan: 10");
    }

    db.run(
      `UPDATE cafes SET table_count = ? WHERE id = ?`,
      [count, u.cafeAdminId],
      (err) => {
        if (err) return ctx.reply("Xatolik ❌");

        u.step = "cafe";
        getCafeMenuAsync(u.cafeAdminId, (menu) => {
          ctx.reply(`✅ Stol soni saqlandi: ${count} ta`, menu);
        });
        return;
      },
    );

    return;
  }

  if (text === "🗑 Mahsulot o‘chirish" || text === "🗑 Mahsulot o'chirish") {
    u.step = "delete_product";
    return ctx.reply("O‘chirish uchun mahsulot ID yozing:", simpleBackMenu());
  }

  if (text === "🔄 Mahsulot ON/OFF") {
    u.step = "toggle_product";
    return ctx.reply("Mahsulot ID yozing:", simpleBackMenu());
  }

  if (u.step === "toggle_product") {
    const id = Number(text);

    if (!id) {
      return ctx.reply("ID noto‘g‘ri ❌");
    }

    db.get(
      `SELECT * FROM products WHERE id = ? AND cafe_id = ?`,
      [id, u.cafeAdminId],
      (err, product) => {
        if (err || !product) {
          return ctx.reply("Mahsulot topilmadi ❌");
        }

        let variants = [];
        try {
          variants = JSON.parse(product.variants || "[]");
        } catch (e) { variants = []; }

        if (variants && variants.length > 0) {
          // Product has variants — show inline buttons for each variant + product on/off
          u.step = "cafe";
          const statusIcon = Number(product.available) === 1 ? "✅" : "❌";
          let msg = `🔄 ${product.name} (ID: ${product.id})\n📌 Mahsulot holati: ${statusIcon}\n\nVariantlar:`;

          const rows = [];
          variants.forEach((v, i) => {
            const vIcon = v.enabled !== false ? "✅" : "❌";
            rows.push([Markup.button.callback(`${vIcon} ${v.name} (${v.price} so'm)`, `toggleVar_${product.id}_${i}`)]);
          });
          rows.push([Markup.button.callback(`${statusIcon} Mahsulot ON/OFF`, `toggleProdAvail_${product.id}`)]);

          ctx.reply(msg, Markup.inlineKeyboard(rows));
        } else {
          // No variants — toggle product available as before
          const newStatus = product.available === 1 ? 0 : 1;

          db.run(
            `UPDATE products SET available = ? WHERE id = ?`,
            [newStatus, id],
            (err2) => {
              if (err2) return ctx.reply("Xatolik ❌");

              const textStatus =
                newStatus === 1 ? "✅ Sotuvga qo'yildi" : "❌ Yopildi";

              u.step = "cafe";
              getCafeMenuAsync(u.cafeAdminId, (menu) => {
                ctx.reply(textStatus, menu);
              });
            },
          );
        }
      },
    );

    return;
  }

  if (u.step === "delete_product") {
    const id = Number(text);

    if (!id) {
      return ctx.reply("ID ni to‘g‘ri yozing ❌");
    }

    db.run(
      `DELETE FROM products WHERE id = ? AND cafe_id = ?`,
      [id, u.cafeAdminId],
      function (err) {
        if (err) {
          console.error("Mahsulot o'chirishda xatolik:", err);
          return ctx.reply("Xatolik ❌");
        }

        if (this.changes === 0) {
          return ctx.reply("Mahsulot topilmadi ❌");
        }

        u.step = "cafe";
        getCafeMenuAsync(u.cafeAdminId, (menu) => {
          ctx.reply("🗑 Mahsulot o‘chirildi ✅", menu);
        });
      },
    );

    return;
  }

  if (text === "🗑 Cafe o'chirish") {
    u.step = "delete_cafe_id";
    return ctx.reply("Qaysi cafe o'chirishni xoxlaysiz? ID yozing:", simpleBackMenu());
  }

  if (u.step === "delete_cafe_id") {
    const id = Number(text);

    db.get(`SELECT * FROM cafes WHERE id = ?`, [id], (err, cafe) => {
      if (!cafe) return ctx.reply("Topilmadi ❌", superMenu());

      u.temp.deleteCafeId = id;
      u.step = "delete_cafe_confirm";

      ctx.reply(
        `⚠️ DIQQAT!\n\n"${cafe.name}" (ID: ${cafe.id}) o'chirilishini tasdiqlaysizmi?\n\nBu amalni qaytarib olish mumkin emas!`,
        Markup.keyboard([
          ["✅ Ha, o'chir", "❌ Yo'q, bekor qil"],
          ["⬅️ Orqaga"],
        ]).resize(),
      );
    });
    return;
  }

  if (u.step === "delete_cafe_confirm") {
    if (text === "✅ Ha, o'chir") {
      const cafeId = u.temp.deleteCafeId;

      // Удалить все заказы этого кафе
      db.run(`DELETE FROM orders WHERE cafe_id = ?`, [cafeId]);
      
      // Удалить всех курьеров этого кафе
      db.run(`DELETE FROM couriers WHERE cafe_id = ?`, [cafeId]);
      
      // Удалить все товары этого кафе
      db.run(`DELETE FROM products WHERE cafe_id = ?`, [cafeId]);
      
      // Удалить само кафе
      db.run(`DELETE FROM cafes WHERE id = ?`, [cafeId], (err) => {
        if (err) {
          console.error("Cafe o'chirishda xatolik:", err);
          ctx.reply("❌ Xatolik yuz berdi", superMenu());
        } else {
          ctx.reply(`✅ "${u.temp.deleteCafeName}" muvaffaqiyatli o'chirildi`, superMenu());
        }
        u.step = "super";
        u.temp = {};
      });
    } else {
      u.step = "super";
      u.temp = {};
      ctx.reply("❌ Bekor qilindi", superMenu());
    }
    return;
  }

  if (text === "✏️ Tahrirlash") {
    u.step = "edit_id";
    return ctx.reply("Qaysi cafe? ID yozing:", simpleBackMenu());
  }

  if (u.step === "edit_id") {
    const id = Number(text);

    db.get(`SELECT * FROM cafes WHERE id = ?`, [id], (err, cafe) => {
      if (!cafe) return ctx.reply("Topilmadi ❌");

      u.temp.editCafeId = id;
      u.temp.editCafeName = cafe.name;
      u.temp.editCafeTariffType = cafe.tariff_type;
      u.step = "edit_field";

      ctx.reply(
        "Nimani o‘zgartirmoqchisiz?",
        Markup.keyboard([
          ["Nomi", "Telefon"],
          ["Tavsif", "Lokatsiya matni"],
          ["Instagram", "Menu link"],
          ["Ish vaqti", "Order group ID"],
          ["Delivery narxi"],
          ["Tarif turi"],
          ["Komissiya foizi", "Balans"],
          ["Aboniment sanasi"],
          ["Karta egasi", "Karta raqami"],
          ["Bank nomi", "Karta QR"],
          ["Rasm", "🗑 O'chirish"],
          ["⬅️ Orqaga"],
        ]).resize(),
      );
    });

    return;
  }

  if (u.step === "edit_field") {
    const map = {
      Nomi: "name",
      Telefon: "phone",
      Tavsif: "about",
      "Lokatsiya matni": "location_text",
      Instagram: "instagram",
      "Menu link": "menu_url",
      "Ish vaqti": "work_time",
      "Order group ID": "order_group_id",
      "Delivery narxi": "delivery_price",
      "Tarif turi": "tariff_type",
      "Komissiya foizi": "commission_percent",
      Balans: "balance",
      "Aboniment sanasi": "paid_until",
      "Karta egasi": "card_name",
      "Karta raqami": "card_number",
      "Bank nomi": "bank_name",
      "Karta QR": "card_qr_id",
      "Rasm": "image_file_id",
      "🗑 O'chirish": "delete"
    };

    if (!map[text]) return ctx.reply("Tugmadan tanlang");

    u.temp.editField = map[text];
    u.step = "edit_value";

    if (u.temp.editField === "delete") {
      u.temp.deleteCafeId = u.temp.editCafeId;
      u.step = "delete_cafe_confirm";
      return ctx.reply(
        `⚠️ DIQQAT!\n\n"${u.temp.editCafeName}" o'chirilishini tasdiqlaysizmi?\n\nBu amalni qaytarib olish mumkin emas!`,
        Markup.keyboard([
          ["✅ Ha, o'chir", "❌ Yo'q, bekor qil"],
          ["⬅️ Orqaga"],
        ]).resize(),
      );
    }

    if (u.temp.editField === "image_file_id") {
      u.step = "edit_value_image";
      return ctx.reply("Yangi rasmni yuboring:");
    }

    if (u.temp.editField === "tariff_type") {
      return ctx.reply(
        "Tarif turini tanlang:",
        Markup.keyboard([["💸 Foizli", "📅 30 kun aboniment"], ["⬅️ Orqaga"]]).resize(),
      );
    }

    if (u.temp.editField === "work_time") {
      return ctx.reply("Yangi vaqt kiriting:\nMasalan: 09:00-23:00");
    }

    if (u.temp.editField === "paid_until") {
      return ctx.reply("Yangi sanani kiriting:\nMasalan: 2026-12-31 yoki 2026-12-31T23:59:59.000Z");
    }

    return ctx.reply("Yangi qiymatni yozing:");
  }

  if (u.step === "edit_value") {
    const field = u.temp.editField;
    const id = u.temp.editCafeId;
    const tariffType = u.temp.editCafeTariffType;

    // Allow "yoq" to unset optional fields
    const normText = String(text || "").trim();

    // Special: work_time updates open_time + close_time
    if (field === "work_time") {
      const parts = normText.split("-");
      if (parts.length !== 2) return ctx.reply("❌ Noto‘g‘ri format. Masalan: 09:00-23:00");
      const open = parts[0].trim();
      const close = parts[1].trim();
      if (!open || !close) return ctx.reply("❌ Noto‘g‘ri format. Masalan: 09:00-23:00");

      return db.run(
        `UPDATE cafes SET open_time = ?, close_time = ? WHERE id = ?`,
        [open, close, id],
        (err) => {
          if (err) return ctx.reply("Xatolik ❌");
          u.step = "super";
          u.temp = {};
          ctx.reply("✅ Yangilandi", superMenu());
        },
      );
    }

    // Parse and validate per-field
    let value = normText;

    if (field === "instagram" || field === "menu_url" || field === "bank_name" || field === "card_qr_id") {
      if (value.toLowerCase() === "yoq") value = null;
    }

    if (field === "card_name" || field === "card_number") {
      if (!value) return ctx.reply("❌ Bo‘sh bo‘lishi mumkin emas");
    }

    if (field === "order_group_id") {
      const n = Number(value);
      if (!Number.isFinite(n) || !Number.isInteger(n)) return ctx.reply("❌ Order group ID raqam bo‘lishi kerak");
      value = n;
    }

    if (field === "delivery_price" || field === "balance") {
      const n = Number(value);
      if (!Number.isFinite(n) || n < 0) return ctx.reply("❌ Raqam kiriting (0 yoki undan katta)");
      value = Math.round(n);
      if (field === "balance" && tariffType !== "commission") {
        return ctx.reply("❌ Balans faqat foizli tarif uchun");
      }
    }

    if (field === "commission_percent") {
      const n = Number(value);
      if (!Number.isFinite(n) || n < 0 || n > 100) return ctx.reply("❌ Foiz 0-100 oralig'ida bo'lishi kerak");
      if (tariffType !== "commission") return ctx.reply("❌ Komissiya foizi faqat foizli tarif uchun");
      value = n;
    }

    if (field === "paid_until") {
      if (tariffType === "commission") return ctx.reply("❌ Aboniment sanasi faqat aboniment tarif uchun");
      const d = new Date(value);
      if (isNaN(d.getTime())) return ctx.reply("❌ Sana noto‘g‘ri");
      value = d.toISOString();
    }

    if (field === "tariff_type") {
      let newType = null;
      if (value === "💸 Foizli") newType = "commission";
      if (value === "📅 30 kun aboniment") newType = "subscription";
      if (!newType) return ctx.reply("Tugmadan tanlang");

      // Minimal safe adjustments to avoid conflicts
      const nowIso = new Date().toISOString();
      if (newType === "commission") {
        return db.run(
          `UPDATE cafes SET tariff_type = ?, paid_until = NULL, commission_percent = COALESCE(NULLIF(commission_percent, 0), commission_percent) WHERE id = ?`,
          [newType, id],
          (err) => {
            if (err) return ctx.reply("Xatolik ❌");
            u.step = "super";
            u.temp = {};
            ctx.reply("✅ Yangilandi", superMenu());
          },
        );
      }

      // subscription
      return db.run(
        `UPDATE cafes SET tariff_type = ?, commission_percent = 0, paid_until = COALESCE(paid_until, ?) WHERE id = ?`,
        [newType, nowIso, id],
        (err) => {
          if (err) return ctx.reply("Xatolik ❌");
          u.step = "super";
          u.temp = {};
          ctx.reply("✅ Yangilandi", superMenu());
        },
      );
    }

    db.run(`UPDATE cafes SET ${field} = ? WHERE id = ?`, [value, id], (err) => {
      if (err) return ctx.reply("Xatolik ❌");

      u.step = "super";
      u.temp = {};

      ctx.reply("✅ Yangilandi", superMenu());
    });

    return;
  }

  // super login
  if (u.step === "login") {
    u.temp.login = text;
    u.step = "password";
    return ctx.reply("Parol:");
  }

  if (u.step === "password") {
    if (
      u.temp.login === process.env.SUPER_LOGIN &&
      text === process.env.SUPER_PASSWORD
    ) {
      u.step = "super";
      u.temp = {};
      u.superAuth = true;
      return ctx.reply("Super panel", superMenu());
    }
    return ctx.reply("Login yoki parol xato ❌");
  }

  // cafe login
  if (u.step === "cafe_login") {
    u.temp.login = text;
    u.step = "cafe_password";
    return ctx.reply("Parol:");
  }

  if (u.step === "cafe_password") {
    db.get(
      `SELECT * FROM cafes WHERE admin_login = ? AND admin_password = ?`,
      [u.temp.login, text],
      (err, cafe) => {
        if (!cafe) return ctx.reply("Login yoki parol xato ❌");

        if (isCafeFrozen(cafe)) return showFrozenMessage(ctx);

        u.step = "cafe";
        u.cafeAdminId = cafe.id; // 🔥 MUHIM
        u.selectedCafeId = cafe.id; // 🔥 SHUNI HAM QO‘SH


        u.temp = {};
        u.cafeAuth = true;

        return ctx.reply(`Cafe panel: ${cafe.name}`, generateCafePanelMenu(cafe));
      },
    );
    return;
  }

  if (text === "📅 Aboniment") {
    // stop further handlers from running
    db.get(`SELECT * FROM cafes WHERE id = ?`, [u.cafeAdminId], (err, cafe) => {
      if (!cafe) return;
      
      // Skip abonement display for commission cafes
      if (cafe.tariff_type === 'commission') {
        return ctx.reply("❌ Bu cafe balans tizimida ishleydi, abonement yo'q.", generateCafePanelMenu(cafe));
      }

      const daysLeft = getDaysLeft(cafe.paid_until);

      let msg = "";

      if (daysLeft <= 0) {
        msg = "⛔ Aboniment tugagan";
      } else {
        msg = `📅 ${daysLeft} kun qoldi

⏳ Tugash sanasi:
${formatDate(cafe.paid_until)}`;
      }

      ctx.reply(msg, generateCafePanelMenu(cafe));
    });
    return;
  }

  // Обработчик баланса для процентного тарифа
  if (text === "💰 Balans") {
    // stop further handlers from running
    db.get(`SELECT * FROM cafes WHERE id = ?`, [u.cafeAdminId], (err, cafe) => {
      if (!cafe) return;
      
      // Показать баланс только для процентного тарифа
      if (cafe.tariff_type !== 'commission') {
        return ctx.reply("❌ Balans faqat foizli tariff uchun mavjud", generateCafePanelMenu(cafe));
      }

      let msg = `💰 BALANS XOLATI
`;
      
      msg += `\n💵 Joriy balans: ${cafe.balance || 0} so'm`;
      
      if ((cafe.balance || 0) <= 0) {
        msg += `\n❌ Balans tugadi! Zakazlar qabul qilinmaydi.`;
      } else if ((cafe.balance || 0) < 100000) {
        msg += `\n⚠️ Balans oz qoldi. Iltimos, balansni to'ldiring.`;
      } else {
        msg += `\n✅ Balans yetarli`;
      }

      if (cafe.commission_percent) {
        msg += `\n\n📊 Komissiya stavkasi: ${cafe.commission_percent}%`;
      }
      
      // Получить информацию о списаниях и последние 5 заказов
      db.get(
        `SELECT COUNT(*) as total_orders, SUM(commission_charged) as total_charged FROM orders WHERE cafe_id = ? AND commission_charged > 0`,
        [cafe.id],
        (err2, stats) => {
          if (!err2 && stats) {
            if (stats.total_charged) {
              msg += `\n\n📈 Jami:`;
              msg += `\n   Zakazlar: ${stats.total_orders}`;
              msg += `\n   Komissiya o'chirildi: ${stats.total_charged} so'm`;
            }
          }

          // Получить последние 5 заказов с комиссией
          db.all(
            `SELECT id, total, commission_charged, created_at FROM orders WHERE cafe_id = ? AND commission_charged > 0 ORDER BY created_at DESC LIMIT 5`,
            [cafe.id],
            (err3, orders) => {
              if (!err3 && orders && orders.length > 0) {
                msg += `\n\n📋 Oxirgi 5 ta zakaz:`;
                orders.forEach((order, idx) => {
                  const date = new Date(order.created_at).toLocaleDateString('uz-UZ');
                  msg += `\n   ${idx + 1}. #${order.id} | ${order.total} so'm | Komissiya: ${order.commission_charged} so'm | ${date}`;
                });
              }

              ctx.reply(msg, generateCafePanelMenu(cafe));
            }
          );
        }
      );
    });
    return;
  }

  // orqaga
  if (text === "⬅️ Orqaga") {
    if (
      [
        "name",
        "about",
        "phone",
        "instagram",
        "menu_url",
        "location_text",
        "location",
        "open_time",
        "close_time",
        "admin_login",
        "admin_password",
        "order_group_id",
        "delivery_price",
        "card_name",
        "card_number",
        "bank_name",
        "card_qr_id",
        "image",
        "freeze_id",
        "open_id",
        "extend_id",
        "balance_cafe_id",
        "balance_action",
        "balance_amount",
        "delete_cafe_id",
        "delete_cafe_confirm",
        "tariff_type",
        "commission_percent",
        "initial_balance",
        "owner_telegram_id",
        "cafe_type",
      ].includes(u.step)
    ) {
      u.step = "super";
      u.temp = {};
      return ctx.reply("Super panel", superMenu());
    }

    if (
      [
        "product_name",
        "product_price",
        "product_desc",
        "product_category",
        "product_subcategory",
        "has_variants",
        "product_variant_entry",
        "product_image",
        "courier_name",
        "courier_phone",
        "courier_telegram",
        "table_count",
        "courier_car_model",
        "courier_car_number",
        "courier_telegram",
        "toggle_product",
        "delete_product",
      ].includes(u.step)
    ) {
      u.step = "cafe";
      u.temp = {};
      getCafeMenuAsync(u.cafeAdminId, (menu) => {
          ctx.reply("Cafe panel", menu);
        });
        return;
    }

        // Handle payment flow back navigation
    if (u.step === "payment_type") {
      u.step = "order_note";
      return ctx.reply("Izoh yozing.\nAgar yo'q bo'lsa: 'Yo'q' tugmasini bosing:", noteMenu());
    }

    if (u.step === "payment_photo") {
      u.step = "payment_type";
      return ctx.reply("To'lov turini tanlang:", Markup.keyboard([
        ["💵 Naqd pul", "💳 Karta orqali"],
        ["⬅️ Orqaga"]
      ]).resize());
    }

    if (
      [
        "order_type",
        "order_name",
        "order_phone_contact",
        "order_address",
        "order_location",
        "order_note",
        "order_table",
      ].includes(u.step)
    ) {
      u.step = "home";
      resetOrderDraft(u);

      db.get(
        `SELECT * FROM cafes WHERE id = ?`,
        [u.selectedCafeId],
        (err, cafe) => {
          if (!cafe) return ctx.reply("Menu:", mainMenu());
          ctx.reply("Cafe menyusi:", customerCafeMenu(cafe));
        },
      );
      return;
    }

    if (u.step === "choose_category") {
      u.step = "home";
      db.get(`SELECT * FROM cafes WHERE id = ?`, [u.selectedCafeId], (err, cafe) => {
        if (!cafe) return ctx.reply("Menu:", mainMenu());
        ctx.reply("Cafe menyusi:", customerCafeMenu(cafe));
      });
      return;
    }

    if (u.step === "choose_subcategory") {
      u.step = "choose_category";
      db.all(`SELECT DISTINCT category FROM products WHERE cafe_id = ? AND available = 1 AND category IS NOT NULL AND category != '' AND category != 'Boshqalar'`, [u.selectedCafeId], (err, rows) => {
        if (err || !rows.length) {
          u.step = "home";
          return ctx.reply("Hozircha mahsulotlar yo‘q.");
        }
        const buttons = rows.map(r => [r.category]);
        buttons.push(["⬅️ Orqaga"]);
        ctx.reply("Kategoriyani tanlang:", Markup.keyboard(buttons).resize());
      });
      return;
    }

    // Назад из меню кафе — вернуть в список всех кафе
    if (
      u.step === "inside_cafe" ||
      (u.selectedCafeId && u.step === "home")
    ) {
      u.step = "home";
      u.selectedCafeId = null;
      u.selectedCafeName = null;
      u.temp = {};
      
      // Показать список кафе
      db.all(`SELECT * FROM cafes ORDER BY name ASC`, [], (err, rows) => {
        if (err) return ctx.reply("Xatolik bo'ldi.");
        if (!rows.length) return ctx.reply("Cafe yo'q.");

        const buttons = rows.map((c) => {
          const open = isCafeOpenByTime(c) && c.is_open;
          const frozen = isCafeFrozen(c);
          if (frozen) return [`❄️ ${c.name}`];
          return [open ? c.name : `❌ ${c.name}`];
        });

        buttons.push(["⬅️ Orqaga"]);
        ctx.reply("Tanlang:", Markup.keyboard(buttons).resize());
      });
      return;
    }

    // FIX #2: Fallback — qaytishda xuddi shu cafega qaytamiz, mainMenuga emas
    u.step = "home";
    u.temp = {};
    if (u.selectedCafeId) {
      db.get(`SELECT * FROM cafes WHERE id = ?`, [u.selectedCafeId], (err, cafe) => {
        if (!cafe) {
          u.selectedCafeId = null;
          return ctx.reply("Menu:", mainMenu());
        }
        ctx.reply("Cafe menyusi:", customerCafeMenu(cafe));
      });
      return;
    }
    u.selectedCafeId = null;
    return ctx.reply("Menu:", mainMenu());
  }

  if (text === "🏠 Menu") {
    u.step = "home";
    u.temp = {};
    u.selectedCafeId = null;
    return ctx.reply("Menu:", mainMenu());
  }

  if (text === "📋 Cafelar") {

    db.all(`SELECT * FROM cafes ORDER BY id DESC`, [], (err, rows) => {

      if (err) return ctx.reply("Xatolik bo‘ldi.");
      if (!rows || !rows.length) return ctx.reply("Cafe yo‘q.");

      let msg = "📋 Cafelar:\n\n";

      for (const c of rows) {
        let status = "";

        if (Number(c.manual_frozen) === 1) {
          status = "❄️ Muzlatilgan";
        } else if (c.tariff_type === 'commission' && c.balance <= 0) {
          status = "❄️ Balans tugagan";
        } else if (c.tariff_type !== 'commission' && c.paid_until && new Date(c.paid_until) < new Date()) {
          status = "⏳ Muddati tugagan";
        } else if (Number(c.is_open) === 1) {
          status = "✅ Faol";
        } else {
          status = "❌ Yopiq";
        }

        // Show tariff-specific info
        let tariffInfo = "";
        if (c.tariff_type === 'commission') {
          tariffInfo = `💳 Foizli: ${c.commission_percent || 0}%\n💰 Balans: ${c.balance || 0} so'm\n📝 Foizni o'zgartirish: /foiz_${c.id}`;
        } else {
          const daysLeft = getRemainingDays(c.paid_until);
          if (daysLeft <= 0) {
            tariffInfo = "📅 Aboniment: ⛔️ Tugagan";
          } else {
            tariffInfo = `📅 Aboniment: ${daysLeft} kun qoldi`;
          }
        }

        msg += c.id + ". " + c.name + "\n";
        msg += "📞 " + (c.phone || "-") + "\n";
        msg +=
          "⏰ " + (c.open_time || "-") + " - " + (c.close_time || "-") + "\n";
        msg += "📌 Holat: " + status + "\n";
        msg += tariffInfo + "\n\n";
      }

      ctx.reply(msg, superMenu());
    });

    return;
  }

  // umumiy info
  if (text === "ℹ️ Info" && !u.selectedCafeId) {
    return ctx.reply(
      `${process.env.BOT_INFO}

📞 ${process.env.OWNER_PHONE}
💬 ${process.env.OWNER_TELEGRAM}
📷 ${process.env.OWNER_INSTAGRAM}`,
    );
  }

  // super panel cafe qo‘shish
  if (text === "➕ Cafe qo‘shish") {
    u.step = "cafe_type";
    u.temp = {};
    return ctx.reply("Qaysi tur?", Markup.keyboard([["Cafe", "Restaurant"], ["⬅️ Orqaga"]]).resize());
  }

  if (u.step === "cafe_type") {
    if (!["Cafe", "Restaurant"].includes(text)) return ctx.reply("Tugmadan tanlang.");
    u.temp.cafe_type = text.toLowerCase();
    u.step = "name";
    return ctx.reply("Nomi:", simpleBackMenu());
  }

  if (u.step === "name") {
    u.temp.name = text;
    u.step = "about";
    return ctx.reply("Qisqacha ma’lumot:", simpleBackMenu());
  }

  if (u.step === "about") {
    u.temp.about = text;
    u.step = "phone";
    return ctx.reply("Telefon:", simpleBackMenu());
  }

  if (u.step === "phone") {
    u.temp.phone = text;
    u.step = "instagram";
    return ctx.reply("Instagram link. Yo‘q bo‘lsa: yoq", simpleBackMenu());
  }

  if (u.step === "instagram") {
    u.temp.instagram = text.toLowerCase() === "yoq" ? null : text;
    u.step = "menu_url";
    return ctx.reply("Online menu link. Yo‘q bo‘lsa: yoq", simpleBackMenu());
  }

  if (u.step === "menu_url") {
    u.temp.menu_url = text.toLowerCase() === "yoq" ? null : text;
    u.step = "location_text";
    return ctx.reply("Qayerda joylashgani haqida yozing:", simpleBackMenu());
  }

  if (u.step === "location_text") {
    u.temp.location_text = text;
    u.step = "location";
    return ctx.reply(
      "Lokatsiyani yuboring:",
      Markup.keyboard([
        [Markup.button.locationRequest("📍 Lokatsiya yuborish")],
        ["⬅️ Orqaga"],
      ]).resize(),
    );
  }

  if (u.step === "open_time") {
    u.temp.open_time = text;
    u.step = "close_time";
    return ctx.reply("Yopilish vaqti. Masalan: 23:00", simpleBackMenu());
  }

  if (u.step === "close_time") {
    u.temp.close_time = text;
    u.step = "admin_login";
    return ctx.reply("Cafe panel login:", simpleBackMenu());
  }

  if (u.step === "admin_login") {
    u.temp.admin_login = text;
    u.step = "admin_password";
    return ctx.reply("Cafe panel parol:", simpleBackMenu());
  }

  if (u.step === "admin_password") {
    u.temp.admin_password = text;
    u.step = "order_group_id";
    return ctx.reply("Order group ID:", simpleBackMenu());
  }

  if (u.step === "order_group_id") {
    u.temp.order_group_id = text;
    u.step = "delivery_price";
    return ctx.reply("Yetkazib berish narxi. Masalan: 10000", simpleBackMenu());
  }

  if (u.step === "delivery_price") {
    u.temp.delivery_price = Number(text) || 0;
    u.step = "card_name";
    return ctx.reply("Karta egasining ismi (card_name). Yo'q bo'lsa: yoq", simpleBackMenu());
  }

  if (u.step === "card_name") {
    u.temp.card_name = text.toLowerCase() === "yoq" ? null : text;
    u.step = "card_number";
    return ctx.reply("Karta raqami (card_number). Yo'q bo'lsa: yoq", simpleBackMenu());
  }

  if (u.step === "card_number") {
    u.temp.card_number = text.toLowerCase() === "yoq" ? null : text;
    u.step = "bank_name";
    return ctx.reply("Bank nomi (bank_name). Masalan: Kapitalbank. Yo'q bo'lsa: yoq", simpleBackMenu());
  }

  if (u.step === "bank_name") {
    u.temp.bank_name = text.toLowerCase() === "yoq" ? null : text;
    u.step = "card_qr_id";
    return ctx.reply("QR karta rasmini yuboring (Telegram file_id yoki yoq):", simpleBackMenu());
  }

  if (u.step === "card_qr_id") {
    u.temp.card_qr_id = text.toLowerCase() === "yoq" ? null : text;
    u.step = "tariff_type";
    return ctx.reply("To'lov tizimini tanlang:", Markup.keyboard([["💸 Foizli", "📅 30 kun aboniment"], ["⬅️ Orqaga"]]).resize());
  }

  if (u.step === "tariff_type") {
    if (text === "💸 Foizli") {
      u.temp.tariff_type = "commission";
      u.step = "commission_percent";
      return ctx.reply("Komissiya foizini kiriting (masalan: 3, 5, 10):", simpleBackMenu());
    } else if (text === "📅 30 kun aboniment") {
      u.temp.tariff_type = "subscription";
      u.temp.commission_percent = 0;
      u.step = "initial_balance";
      return ctx.reply("Boshlang'ich balans (so'm). Yo'q bo'lsa: 0", simpleBackMenu());
    } else {
      return ctx.reply("Tugmadan tanlang.");
    }
  }

  if (u.step === "commission_percent") {
    const pct = Number(text);
    if (!pct || pct < 1 || pct > 100) return ctx.reply("❌ Foiz 1 dan 100 gacha son bo'lishi kerak. Qayta kiriting:");
    u.temp.commission_percent = pct;
    u.step = "initial_balance";
    return ctx.reply("Boshlang'ich balans (so'm). Yo'q bo'lsa: 0", simpleBackMenu());
  }

  if (u.step === "initial_balance") {
    const bal = Number(text) || 0;
    u.temp.initial_balance = bal;
    u.step = "owner_telegram_id";
    return ctx.reply("Egasining Telegram ID (raqam). Yo'q bo'lsa: yoq", simpleBackMenu());
  }

  if (u.step === "owner_telegram_id") {
    u.temp.owner_telegram_id = text.toLowerCase() === "yoq" ? null : text;
    u.step = "image";
    return ctx.reply("Cafe rasmi yubor (yoki matn yozing):");
  }

  // admin cafelar ro‘yxati

  // freeze/open/extend
  if (text === "❄️ Muzlatish") {
    u.step = "freeze_id";
    return ctx.reply("Muzlatish uchun cafe ID yozing:", simpleBackMenu());
  }

  if (u.step === "freeze_id") {
    const id = Number(text);
    db.run(
      `UPDATE cafes SET manual_frozen = 1, is_open = 0 WHERE id = ?`,
      [id],
      (err) => {
        if (err) return ctx.reply("Xatolik ❌");
        u.step = "super";
        ctx.reply("❄️ Cafe muzlatildi", superMenu());
      },
    );
    return;
  }

  if (text === "✅ Ochish") {
    u.step = "open_id";
    return ctx.reply("Ochish uchun cafe ID yozing:", simpleBackMenu());
  }

  if (u.step === "open_id") {
    const id = Number(text);

    const now = new Date().toISOString();
    db.run(
      `UPDATE cafes
       SET manual_frozen = 0,
           is_open = 1,
           activated_at = ?,
           paid_until = CASE WHEN tariff_type = 'commission' THEN NULL ELSE datetime( ? , '+30 days') END
       WHERE id = ?`,
      [now, now, id],
      (err) => {
        if (err) return ctx.reply("Xatolik ❌");
        u.step = "super";
        ctx.reply("✅ Cafe ochildi va 30 kun boshlandi", superMenu());
      },
    );
    return;
  }

  if (text === "➕ 30 kun qo‘shish") {
    u.step = "extend_id";
    return ctx.reply("30 kun qo‘shish uchun cafe ID yozing:", simpleBackMenu());
  }

  if (u.step === "extend_id") {
    const id = Number(text);

    db.get(`SELECT * FROM cafes WHERE id = ?`, [id], (err, cafe) => {
      if (!cafe) return ctx.reply("Cafe topilmadi");
      
      // Only allow extending subscription cafes, not commission cafes
      if (cafe.tariff_type === 'commission') {
        return ctx.reply("❌ Bu cafe komissiya tizimida ishleydi. Abonement yo'q.");
      }

      let baseDate = new Date();

      if (cafe.paid_until && new Date(cafe.paid_until) > new Date()) {
        baseDate = new Date(cafe.paid_until);
      }

      baseDate.setDate(baseDate.getDate() + 30);

      const newDate = baseDate.toISOString();

      db.run(
        `UPDATE cafes SET paid_until = ?, manual_frozen = 0, is_open = 1 WHERE id = ?`,
        [newDate, id],
        (err2) => {
          if (err2) return ctx.reply("Xatolik ❌");

          u.step = "super";
          ctx.reply("✅ 30 kun qo‘shildi va cafe ochildi", superMenu());
        },
      );
    });

    return;
  }

  // super umumiy statistika
  if (text === "📊 Umumiy statistika") {
    return buildGlobalAnalytics((err, stats) => {
      if (err) return ctx.reply("Xatolik bo‘ldi.");

      let msg =
        `📊 Umumiy statistika

` +
        `🏪 Cafelar: ${stats.totalCafes}
` +
        `📦 Jami zakazlar: ${stats.totalOrders}
` +
        `💰 Jami tushum: ${stats.totalRevenue} so'm

` +
        `🏆 Top cafelar:
`;

      if (!stats.topCafes.length) {
        msg += `Yo‘q`;
      } else {
        stats.topCafes.forEach((c, i) => {
          msg += `${i + 1}. ${c.name} — ${c.orders} ta zakaz, ${c.revenue} so'm
`;
        });
      }

      ctx.reply(msg, superMenu());
    });
  }

  // cafe panel mahsulot qo‘shish
  if (text === "➕ Mahsulot qo‘shish" || text === "➕ Mahsulot qo'shish") {
    u.step = "product_category";
    return ctx.reply("Asosiy kategoriyani yozing yoki tanlang (masalan: 🍔 Fast Food, 🥤 Напитки, 🍰 Десерты):", Markup.keyboard([
      ["🍔 Fast Food", "🥤 Напитки", "🍰 Десерты"],
      ["⬅️ Orqaga"]
    ]).resize());
  }

  if (u.step === "product_category") {
    u.temp.product_category = text;
    u.step = "product_subcategory";
    return ctx.reply("Podkategoriyani yozing (masalan: Lavash, Burger)\n\nAgar yo'q bo'lsa 'yoq' deb yozing:", simpleBackMenu());
  }

  if (u.step === "product_subcategory") {
    u.temp.product_subcategory = text.toLowerCase() === "yoq" ? "Boshqalar" : text;
    u.step = "product_name";
    return ctx.reply("Mahsulot nomi:", simpleBackMenu());
  }

  if (u.step === "product_name") {
    u.temp.product_name = text;
    u.step = "product_desc";
    return ctx.reply("Qisqacha tavsif (yo'q bo'lsa 'yoq' deng):", simpleBackMenu());
  }

  if (u.step === "product_desc") {
    u.temp.product_desc = text.toLowerCase() === "yoq" ? "" : text;
    u.step = "has_variants";
    return ctx.reply("Bu mahsulotning har xil o'lchamlari (razmerlari) bormi?", Markup.keyboard([["Ha"], ["Yo'q"], ["⬅️ Orqaga"]]).resize());
  }

  if (u.step === "has_variants") {
    if (text === "Ha") {
      u.temp.has_variants = true;
      u.temp.variants = [];
      u.step = "product_variant_entry";
      return ctx.reply("Variant nomi va narxini yozing (Masalan: Kichik 20000).\n❗️ Tugatish uchun 'tayyor' deb yozing:", simpleBackMenu());
    } else {
      u.temp.has_variants = false;
      u.step = "product_price";
      return ctx.reply("Narxini yozing:", simpleBackMenu());
    }
  }

  if (u.step === "product_variant_entry") {
    if (text.toLowerCase() === "tayyor") {
      if (!u.temp.variants || u.temp.variants.length === 0) {
        return ctx.reply("Kamida 1 ta variant qo'shing yoki 'Orqaga' qayting.");
      }
      u.step = "product_image";
      return ctx.reply("Mahsulot rasmini yuboring (Rasm yo'q bo'lsa, xohlagan so'z yozing):", simpleBackMenu());
    }

    const parts = text.split(" ");
    const priceStr = parts.pop();
    const price = Number(priceStr);
    const name = parts.join(" ");

    if (!price || !name) {
      return ctx.reply("❌ Xato format!\nMasalan: Kichik 20000");
    }

    if (!u.temp.variants) u.temp.variants = [];
    u.temp.variants.push({ name, price, enabled: true });
    return ctx.reply(`✅ Qo'shildi: ${name} - ${price} so'm.

Yana variant yozing yoki 'tayyor' deng:`);
  }

  if (u.step === "product_price") {
    u.temp.product_price = Number(text);
    if (!u.temp.product_price) return ctx.reply("Narxni son bilan yozing.");
    u.temp.variants = [];
    u.step = "product_image";
    return ctx.reply("Mahsulot rasmini yuboring (Rasm yo'q bo'lsa, xohlagan so'z yozing):", simpleBackMenu());
  }

  if (u.step === "product_image" && !ctx.message.photo) {
    db.run(
      `INSERT INTO products (cafe_id, name, price, description, category, subcategory, variants, available) VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
      [
        u.cafeAdminId,
        u.temp.product_name,
        u.temp.product_price || 0,
        u.temp.product_desc,
        u.temp.product_category,
        u.temp.product_subcategory,
        JSON.stringify(u.temp.variants || [])
      ],
      (err) => {
        if (err) return ctx.reply("Xatolik bo'ldi.");
        u.step = "cafe";
        getCafeMenuAsync(u.cafeAdminId, (menu) => {
          ctx.reply("Rasm yoki mediasiz mahsulot saqlandi ✅", menu);
        });
      }
    );
    return;
  }

  // cafe panel mahsulotlar
  if (text === "📦 Mahsulotlar") {
    if (!u.cafeAdminId) {
      return ctx.reply("Avval /cafePanel orqali qayta login qiling.");
    }


    db.all(
      `SELECT * FROM products WHERE cafe_id = ? ORDER BY id DESC`,
      [u.cafeAdminId],
      (err, rows) => {

        if (err) return ctx.reply("Xatolik bo‘ldi.");
        if (!rows || !rows.length) {
          getCafeMenuAsync(u.cafeAdminId, (menu) => {
          ctx.reply("Mahsulot yo‘q.", menu);
        });
        return;
        }

        let msg = "📦 Mahsulotlar:\n\n";

        rows.forEach((p, index) => {
          const status = Number(p.available) === 1 ? "✅ Faol" : "❌ Yopiq";

          let priceText = '';
          try {
            const variants = JSON.parse(p.variants || '[]');
            if (variants && variants.length > 0) {
              const enabledVariants = variants.filter(v => v.enabled !== false);
              if (enabledVariants.length > 0) {
                const prices = enabledVariants.map(v => Number(v.price || 0));
                const minP = Math.min(...prices);
                const maxP = Math.max(...prices);
                priceText = minP === maxP ? `${minP} so'm` : `${minP} - ${maxP} so'm`;
              } else {
                priceText = `0 so'm (barcha variantlar o'chirilgan)`;
              }
            } else {
              priceText = `${p.price || 0} so'm`;
            }
          } catch (e) {
            priceText = `${p.price || 0} so'm`;
          }

          msg += `🔹 ${index + 1}-tovar (ID: ${p.id})
`;
          msg += `🍔 ${p.name || "-"}
`;
          msg += `💰 ${priceText}
`;
          msg += `📂 ${p.category || "-"}
`;
          msg += `📌 Holat: ${status}
`;
          try {
            const pVariants = JSON.parse(p.variants || '[]');
            if (pVariants && pVariants.length > 0) {
              pVariants.forEach((v, vi) => {
                const vStatus = v.enabled !== false ? '✅' : '❌';
                msg += `   ${vStatus} ${v.name} — ${v.price} so'm
`;
              });
            }
          } catch (e) { }
          msg += `
`;
        });

        getCafeMenuAsync(u.cafeAdminId, (menu) => {
          ctx.reply(msg, menu);
        });
        return;
      },
    );

    return;
  }
  // courier qo‘shish
  if (text === "🛵 Kuryer qo‘shish" || text === "🛵 Kuryer qo'shish") {
    u.temp.isGlobalCourier = (u.step === "super");
    u.step = "courier_name";
    return ctx.reply("Kuryer ismi:", simpleBackMenu());
  }

  if (u.step === "courier_name") {
    u.temp.courier_name = text;
    u.step = "courier_phone";
    return ctx.reply("Kuryer telefoni:", simpleBackMenu());
  }

  if (u.step === "courier_phone") {
    u.temp.courier_phone = text;
    u.step = "courier_car_model";
    return ctx.reply(
      "Mashina modelini tanlang yoki yozing:",
      Markup.keyboard([
        ["Cobalt", "Nexia 3"],
        ["Captiva", "Lacetti"],
        ["Malibu", "Damas"],
        ["Cherry Tiggo", "Kia Sorento"],
        ["Nexia 1", "Nexia 2"],
        ["Gentra", "Spark"],
        ["Onix", "Matiz"],
        ["Jiguli", "Tico"],
        ["Skuter"],
        ["⬅️ Orqaga"],
      ]).resize(),
    );
  }

  if (u.step === "courier_telegram") {
    const tg = text.toLowerCase() === "yoq" ? null : text;
    u.temp.courier_telegram = tg;
    u.step = "courier_login";
    return ctx.reply("Kuryer uchun login o'ylab toping:", simpleBackMenu());
  }

  if (u.step === "courier_login") {
    u.temp.courier_login = text;
    u.step = "courier_password";
    return ctx.reply("Kuryer uchun parol yozing:", simpleBackMenu());
  }

  if (u.step === "courier_password") {
    u.temp.courier_password = text;

    const courierLogin = u.temp.courier_login;
    const courierPassword = u.temp.courier_password;

    db.run(
      `INSERT INTO couriers (cafe_id, name, phone, telegram, car_model, car_number, login, password, is_online) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      [
        u.temp.isGlobalCourier ? null : u.cafeAdminId,
        u.temp.courier_name,
        u.temp.courier_phone,
        u.temp.courier_telegram,
        u.temp.courier_car_model,
        u.temp.courier_car_number,
        courierLogin,
        courierPassword,
      ],
      (err) => {
        if (err) return ctx.reply("Kuryer qo‘shishda xatolik ❌");

        u.temp = {};

        const msgStr = `Kuryer qo‘shildi ✅

Kuryer botga kirib /courier bosishi va login parolini kiritishi kerak!

Login: ${courierLogin}
Parol: ${courierPassword}`;

        if (u.temp.isGlobalCourier) {
          u.step = "super";
          return ctx.reply(msgStr, superMenu());
        }

        u.step = "cafe";
        getCafeMenuAsync(u.cafeAdminId, (menu) => ctx.reply(msgStr, menu));
      },
    );

    return;
  }

  // courierlar
  if (text === "🛵 Kuryerlar") {
    const isSuperPanel = (u.step === "super");
    const query = isSuperPanel ? `SELECT * FROM couriers ORDER BY id DESC` : `SELECT * FROM couriers WHERE cafe_id = ? OR cafe_id IS NULL OR cafe_id = 0 ORDER BY id DESC`;
    const params = isSuperPanel ? [] : [u.cafeAdminId];
    db.all(
      query,
      params,
      (err, rows) => {
        if (err) return ctx.reply("Xatolik bo‘ldi.");
        if (!rows.length) {
          if (isSuperPanel) return ctx.reply("Kuryer yo‘q.", superMenu());
          getCafeMenuAsync(u.cafeAdminId, (menu) => {
            ctx.reply("Kuryer yo‘q.", menu);
          });
          return;
        }

        let msg = "🛵 Kuryerlar:\n\n";
        rows.forEach((c) => {
          msg += `${c.id}. ${c.name} (Cafe: ${c.cafe_id || 'Global'}) ${Number(c.is_online) === 1 ? '🟢' : '🔴'}
`;
          msg += `📞 ${c.phone || "-"}
`;
          msg += `🚗 ${c.car_model || "-"} (${c.car_number || "-"})
`;
          msg += `🔑 Login: ${c.login || "-"}
`;
          if (c.telegram) msg += `💬 ${c.telegram}
`;
          msg += `
`;
        });

        if (isSuperPanel) return ctx.reply(msg, superMenu());
        getCafeMenuAsync(u.cafeAdminId, (menu) => {
          ctx.reply(msg, menu);
        });
      },
    );
    return;
  }

  // cafe ochiq/yopiq
  if (text === "✅ Ochildik") {
    db.run(
      `UPDATE cafes SET is_open = 1 WHERE id = ?`,
      [u.cafeAdminId],
      (err) => {
        if (err) return ctx.reply("Xatolik ❌");
        getCafeMenuAsync(u.cafeAdminId, (menu) => {
          ctx.reply("✅ Cafe ochildi", menu);
        });
      },
    );
    return;
  }

  if (text === "❌ Yopildik") {
    db.run(
      `UPDATE cafes SET is_open = 0 WHERE id = ?`,
      [u.cafeAdminId],
      (err) => {
        if (err) return ctx.reply("Xatolik ❌");
        getCafeMenuAsync(u.cafeAdminId, (menu) => {
          ctx.reply("❌ Cafe yopildi", menu);
        });
      },
    );
    return;
  }

  // cafe statistikasi
  if (text === "📊 Statistika") {
    return buildCafeAnalytics(u.cafeAdminId, (err, stats) => {
      if (err) return ctx.reply("Xatolik bo‘ldi.");

      let msg =
        `📊 Statistika

` +
        `📦 Jami zakaz: ${stats.totalOrders}
` +
        `💰 Jami tushum: ${stats.totalRevenue} so'm
` +
        `📅 Bugungi zakaz: ${stats.todayOrders}
` +
        `💸 Bugungi tushum: ${stats.todayRevenue} so'm
` +
        `🗓 Oylik tushum: ${stats.monthRevenue} so'm

` +
        `👤 Top 10 mijoz:
`;

      if (!stats.topCustomers.length) {
        msg += `Yo‘q
`;
      } else {
        stats.topCustomers.forEach((c, i) => {
          msg += `${i + 1}. ${c.name} — ${c.orders} ta, ${c.spent} so'm
`;
        });
      }

      msg += `
🍔 Top mahsulotlar:
`;

      if (!stats.topProducts.length) {
        msg += `Yo‘q
`;
      } else {
        stats.topProducts.forEach((p, i) => {
          msg += `${i + 1}. ${p.name} — ${p.count} ta, ${p.revenue} so'm
`;
        });
      }

      msg += `
📉 Kam sotilgan:
`;

      if (!stats.weakProducts.length) {
        msg += `Yo‘q`;
      } else {
        stats.weakProducts.forEach((p, i) => {
          msg += `${i + 1}. ${p.name} — ${p.count} ta
`;
        });
      }

      getCafeMenuAsync(u.cafeAdminId, (menu) => {
          ctx.reply(msg, menu);
        });
    });
  }

  if (text === "⏰ Ish vaqtini o'zgartirish") {
    u.step = "edit_time";
    return ctx.reply(
      "Yangi vaqt kiriting:\nMasalan: 09:00-23:00",
      simpleBackMenu(),
    );
  }
  if (u.step === "edit_time") {
    const parts = text.split("-");

    if (parts.length !== 2) {
      return ctx.reply("Noto‘g‘ri format.\nMasalan: 09:00-23:00");
    }

    const open = parts[0].trim();
    const close = parts[1].trim();

    db.run(
      `UPDATE cafes SET open_time = ?, close_time = ? WHERE id = ?`,
      [open, close, u.cafeAdminId],
      (err) => {
        if (err) return ctx.reply("Xatolik ❌");

        u.step = "cafe";
        getCafeMenuAsync(u.cafeAdminId, (menu) => {
          ctx.reply("✅ Ish vaqti yangilandi", menu);
        });
      },
    );

    return;
  }

  // user cafelar
  if (text === "🏪 Cafelar") {
    db.all(`SELECT * FROM cafes ORDER BY name ASC`, [], (err, rows) => {
      if (err) return ctx.reply("Xatolik bo‘ldi.");
      if (!rows.length) return ctx.reply("Cafe yo‘q.");

      const buttons = rows.map((c) => {
        const open = isCafeOpenByTime(c) && c.is_open;
        const frozen = isCafeFrozen(c);
        if (frozen) return [`❄️ ${c.name}`];
        return [open ? c.name : `❌ ${c.name}`];
      });

      buttons.push(["⬅️ Orqaga"]);
      ctx.reply("Tanlang:", Markup.keyboard(buttons).resize());
    });
    return;
  }

  // cafe tanlash
  const cleanName = text.replace(/^❌\s/, "").replace(/^❄️\s/, "");

  db.get(`SELECT * FROM cafes WHERE name = ?`, [cleanName], (err, cafe) => {
    if (!cafe) return;

    autoFreezeCafeIfExpired(cafe);

    u.selectedCafeId = cafe.id;
    u.selectedCafeName = cafe.name;
    u.step = "inside_cafe";

    if (isCafeFrozen(cafe)) {
      return showFrozenMessage(ctx);
    }

    if (!cafe.is_open) {
      return ctx.reply(
        `😔 ${cafe.name} hozir yopiq

⏰ Ish vaqti:
${cafe.open_time || "-"} — ${cafe.close_time || "-"}

✨ Sizni shu vaqtda kutamiz`,
        simpleBackMenu(),
      );
    }

    let caption =
      `🏪 ${cafe.name}

` + `📝 ${cafe.about}

` + `📞 ${cafe.phone}`;

    if (cafe.image_file_id) {
      ctx.replyWithPhoto(cafe.image_file_id, {
        caption,
        ...customerCafeMenu(cafe),
      });
    } else {
      ctx.reply(caption, customerCafeMenu(cafe));
    }
  });

  // cafe info
  if (text === "ℹ️ Info" && u.selectedCafeId) {
    db.get(
      `SELECT * FROM cafes WHERE id = ?`,
      [u.selectedCafeId],
      (err, cafe) => {
        if (!cafe) return;

        let msg =
          `🏪 ${cafe.name}

` + `📝 ${cafe.about}

` + `📞 ${cafe.phone}
`;

        if (cafe.instagram) msg += `📸 ${cafe.instagram}
`;

        if (cafe.image_file_id) {
          ctx.replyWithPhoto(cafe.image_file_id, { caption: msg });
        } else {
          ctx.reply(msg);
        }
      },
    );
    return;
  }

  // lokatsiya
  if (text === "📍 Lokatsiya") {
    db.get(
      `SELECT * FROM cafes WHERE id = ?`,
      [u.selectedCafeId],
      (err, cafe) => {
        if (!cafe) return;

        if (cafe.latitude && cafe.longitude) {
          ctx.replyWithLocation(cafe.latitude, cafe.longitude);
        }
        ctx.reply(`📍 ${cafe.location_text || "Lokatsiya yuborildi"}`);
      },
    );
    return;
  }

  // instagram
  if (text === "📸 Instagram") {
    db.get(
      `SELECT * FROM cafes WHERE id = ?`,
      [u.selectedCafeId],
      (err, cafe) => {
        if (!cafe || !cafe.instagram) return;
        ctx.reply(`📸 Instagram: ${cafe.instagram}`);
      },
    );
    return;
  }

  // online menu
  if (text === "🌐 Online Menu") {
    db.get(
      `SELECT * FROM cafes WHERE id = ?`,
      [u.selectedCafeId],
      (err, cafe) => {
        if (!cafe || !cafe.menu_url) return;
        ctx.reply(`🌐 Online menu: ${cafe.menu_url}`);
      },
    );
    return;
  }

  // Kategoriya tanlash
  if (text === "📋 Menu" && u.selectedCafeId) {
    db.all(`SELECT DISTINCT category FROM products WHERE cafe_id = ? AND available = 1 AND category IS NOT NULL AND category != '' AND category != 'Boshqalar'`, [u.selectedCafeId], (err, rows) => {
      if (err || !rows.length) return ctx.reply("Hozircha mahsulotlar yo‘q.");

      u.step = "choose_category";
      const buttons = rows.map(r => [r.category]);
      buttons.push(["⬅️ Orqaga"]);
      ctx.reply("Kategoriyani tanlang:", Markup.keyboard(buttons).resize());
    });
    return;
  }

  if (u.step === "choose_category" && text !== "⬅️ Orqaga") {
    const category = text;
    db.all(`SELECT DISTINCT subcategory FROM products WHERE cafe_id = ? AND category = ? AND available = 1 AND subcategory IS NOT NULL AND subcategory != '' AND subcategory != 'Boshqalar'`, [u.selectedCafeId, category], (err, rows) => {
      if (err) return;
      if (!rows.length) {
        u.step = "home";
        return showProducts(ctx, u.selectedCafeId, category, null);
      }
      u.temp.selectedCategory = category;
      u.step = "choose_subcategory";
      const buttons = rows.map(r => [r.subcategory]);
      buttons.push(["⬅️ Orqaga"]);
      ctx.reply("Bo‘limni tanlang:", Markup.keyboard(buttons).resize());
    });
    return;
  }

  if (u.step === "choose_subcategory" && text !== "⬅️ Orqaga") {
    const subcategory = text;
    u.temp.selectedSubcategory = subcategory;
    u.step = "home";
    showProducts(ctx, u.selectedCafeId, u.temp.selectedCategory, subcategory);
    return;
  }
  // savatchaga qo‘shish
  if (text.startsWith("➕")) {
    const id = Number(text.replace("➕", "").trim());

    db.get(`SELECT * FROM products WHERE id = ?`, [id], (err, product) => {
      if (!product) return ctx.reply("Mahsulot topilmadi.");

      u.cart.push({
        id: product.id,
        name: product.name,
        price: product.price,
      });

      ctx.reply(`🛒 Qo‘shildi: ${product.name}`);
    });
    return;
  }

  // savatcha
  if (text === "🛒 Savatcha") {
    if (!u.cart.length) return ctx.reply("Savatcha bo‘sh.");

    const { text: cartText, total } = formatCart(u.cart);
    return ctx.reply(
      `🛒 Savatcha:

${cartText}
💰 Jami: ${total} so'm`,
      cartMenu(),
    );
  }

  // tozalash
  if (text === "❌ Tozalash") {
    u.cart = [];
    db.get(
      `SELECT * FROM cafes WHERE id = ?`,
      [u.selectedCafeId],
      (err, cafe) => {
        if (!cafe) return ctx.reply("Savatcha tozalandi.", mainMenu());
        ctx.reply("Savatcha tozalandi.", customerCafeMenu(cafe));
      },
    );
    return;
  }

  // buyurtma boshlash
  if (text === "✅ Buyurtma berish") {
    if (!u.cart.length) return ctx.reply("Savatcha bo‘sh.");

    u.orderDraft = {
      cafe_id: u.selectedCafeId,
      username: safeUsername(ctx),
      customer_name: "",
      customer_phone: "",
      customer_telegram: safeUsername(ctx),
      order_type: "",
      address: "",
      note: "",
      latitude: null,
      longitude: null,
      table_number: "",
    };

    u.step = "order_type";
    return ctx.reply("Buyurtma turini tanlang:", orderTypeMenu());
  }

  if (u.step === "order_type") {
    if (
      !["🚚 Yetkazib berish", "🏠 Olib ketish", "🍽 Shu yerda yeyish"].includes(
        text,
      )
    ) {
      return ctx.reply("Tugmalardan birini tanlang.");
    }

    u.orderDraft.order_type = text;
    u.step = "order_name";
    return ctx.reply("Ismingiz:");
  }

  if (u.step === "order_name") {
    u.orderDraft.customer_name = text;
    u.step = "order_phone_contact";
    return ctx.reply("Telefon raqamingizni yuboring:", contactMenu());
  }

  if (u.step === "order_phone_contact") {
    u.orderDraft.customer_phone = text;

    if (u.orderDraft.order_type === "🚚 Yetkazib berish") {
      u.step = "order_address";
      return ctx.reply("Manzilni yozing:", simpleBackMenu());
    }

    if (u.orderDraft.order_type === "🍽 Shu yerda yeyish") {
      db.get(
        `SELECT * FROM cafes WHERE id = ?`,
        [u.selectedCafeId],
        (err, cafe) => {
          if (!cafe) return ctx.reply("Cafe topilmadi.");

          const count = Number(cafe.table_count || 0);

          if (count <= 0) {
            u.step = "order_table";
            return ctx.reply("Stol raqamini yozing:", simpleBackMenu());
          }

          u.step = "order_table";
          return ctx.reply("Stolni tanlang:", tableMenu(count));
        },
      );

      return;
    }

    u.step = "order_note";
    return ctx.reply("Izoh yozing.\nAgar yo'q bo'lsa: 'Yo'q' tugmasini bosing:", noteMenu());
  }

  if (u.step === "order_address") {
    u.orderDraft.address = text;
    u.step = "order_location";
    return ctx.reply("Lokatsiyani yuboring:", locationMenu());
  }

  if (u.step === "order_table") {
    const tableNumber = Number(text);

    if (!tableNumber || tableNumber < 1) {
      return ctx.reply("Stolni tugmadan tanlang yoki to‘g‘ri raqam yozing.");
    }

    db.get(
      `SELECT * FROM cafes WHERE id = ?`,
      [u.selectedCafeId],
      (err, cafe) => {
        if (!cafe) return ctx.reply("Cafe topilmadi.");

        const count = Number(cafe.table_count || 0);

        if (count > 0 && tableNumber > count) {
          return ctx.reply("Bunday stol yo‘q. Tugmadan tanlang.");
        }

        u.orderDraft.table_number = String(tableNumber);
        u.step = "order_note";

        return ctx.reply(
          "Izoh yozing.\nAgar yo'q bo'lsa: 'Yo'q' tugmasini bosing:",
          noteMenu(),
        );
      },
    );

    return;
  }

  if (u.step === "order_note") {
    const normalizedNote = text.replace(/[\u2018\u2019']/g, "'");
    u.orderDraft.note = normalizedNote.toLowerCase() !== "yo'q" ? text : "";
    u.step = "payment_type";
    return ctx.reply("To'lov turini tanlang:", Markup.keyboard([
      ["💵 Naqd pul", "💳 Karta orqali"],
      ["⬅️ Orqaga"]
    ]).resize());
  }

  if (u.step === "payment_type") {
    if (!["💵 Naqd pul", "💳 Karta orqali"].includes(text)) {
      return safeSendMessage(ctx.from.id, "Tugmalardan birini tanlang.");
    }

    u.orderDraft.payment_type = text === "💵 Naqd pul" ? "cash" : "card_transfer";
    u.orderDraft.payment_status = u.orderDraft.payment_type === "cash" ? "unpaid" : "pending_verification";

    if (u.orderDraft.payment_type === "card_transfer") {
      db.get(`SELECT * FROM cafes WHERE id = ?`, [u.selectedCafeId], (err, cafe) => {
        if (!cafe) return ctx.reply("Cafe topilmadi.");
        if (!cafe.card_number) {
          u.step = "payment_type";
          return ctx.reply(
            "⚠️ Karta ma'lumotlari mavjud emas. Iltimos, naqd to'lovni tanlang.",
            Markup.keyboard([["💵 Naqd pul"], ["⬅️ Orqaga"]]).resize()
          );
        }
        u.step = "payment_photo";
        let msg = `Karta orqali to'lov:

`;
        if (cafe.card_name) msg += `👤 Ism: ${cafe.card_name}
`;
        msg += `💳 Karta: ${cafe.card_number}
`;
        if (cafe.bank_name) msg += `🏦 Bank: ${cafe.bank_name}
`;
        msg += `
Iltimos, to'lovni amalga oshirgach, chek (skrinshot) yuboring:`;
        if (cafe.card_qr_id) {
          ctx.replyWithPhoto(cafe.card_qr_id, { caption: msg, ...simpleBackMenu() });
        } else {
          ctx.reply(msg, simpleBackMenu());
        }
      });
      return;
    } else {
      return finalizeOrder(ctx, u);
    }
  }
});

bot.catch((err, ctx) => {
  console.log("BOT ERROR:", err.message);
});

bot.catch((err) => {
  console.log("GLOBAL BOT ERROR:", err);
});

process.on("uncaughtException", (err) => {
  console.log("❌ UNCAUGHT EXCEPTION:", err);
});

process.on("unhandledRejection", (err) => {
  console.log("❌ UNHANDLED REJECTION:", err);
});


bot.action(/verify_yes_(\d+)/, async (ctx) => {
  if (await isProcessing(ctx.from.id)) return safeAnswerCbQuery(ctx, 'Kuting...');
  const orderId = Number(ctx.match[1]);

  const before = await getOrderAsync(orderId);
  debugOrder("handler.verify_yes.enter", {
    orderId,
    before_status: before?.status,
    ...getCtxMsgInfo(ctx),
  });

  db.get('SELECT * FROM orders WHERE id = ?', [orderId], async (err, order) => {
    if (err) { console.error("verify_yes DB ERR1:", err); return safeAnswerCbQuery(ctx, "Xatolik yuz berdi"); }
    if (!order) return safeAnswerCbQuery(ctx, "Topilmadi");

    db.run('UPDATE orders SET payment_status = ? WHERE id = ?', ['paid', orderId], async function (err2) {
      if (err2) { console.error("verify_yes DB ERR2:", err2); return safeAnswerCbQuery(ctx, "Saqlashda xato"); }
      await safeAnswerCbQuery(ctx, "To'lov tasdiqlandi");
      db.get('SELECT * FROM cafes WHERE id = ?', [order.cafe_id], async (err3, cafe) => {
        if (err3) console.error("verify_yes DB ERR3:", err3);
        debugOrder("handler.verify_yes.editVerifyMessageText", {
          orderId,
          edit_chat_id: ctx.chat?.id,
          edit_message_id: ctx.callbackQuery?.message?.message_id,
          note: "text update only; reply_markup should remain as-is",
        });
        safeEditMessageText(ctx.chat.id, ctx.callbackQuery.message.message_id, ctx.callbackQuery.message.caption ? ctx.callbackQuery.message.caption + "\n\n✅ To'lov tasdiqlandi" : ctx.callbackQuery.message.text + "\n\n✅ To'lov tasdiqlandi");
        if (cafe && cafe.order_group_id) {
          sendOrderToCafeGroup(order, cafe);
        }
        safeSendMessage(order.user_id, `✅ Zakaz #${orderId} uchun to'lov tasdiqlandi.\nBuyurtma qabul qilindi!`);
      });
    });
  });
});

bot.action(/verify_no_(\d+)/, async (ctx) => {
  if (await isProcessing(ctx.from.id)) return safeAnswerCbQuery(ctx, 'Kuting...');
  const orderId = Number(ctx.match[1]);

  const before = await getOrderAsync(orderId);
  debugOrder("handler.verify_no.enter", {
    orderId,
    before_status: before?.status,
    ...getCtxMsgInfo(ctx),
  });

  db.run('UPDATE orders SET payment_status = ?, status = ? WHERE id = ?', ['rejected', 'rejected', orderId], async () => {
    await safeAnswerCbQuery(ctx, "To'lov rad etildi");
    db.get('SELECT * FROM orders WHERE id = ?', [orderId], async (err, order) => {
      debugOrder("handler.verify_no.editVerifyMessageText", {
        orderId,
        edit_chat_id: ctx.chat?.id,
        edit_message_id: ctx.callbackQuery?.message?.message_id,
        note: "text update only; reply_markup should remain as-is",
      });
      safeEditMessageText(ctx.chat.id, ctx.callbackQuery.message.message_id, ctx.callbackQuery.message.caption ? ctx.callbackQuery.message.caption + "\n\n❌ To'lov rad etildi" : ctx.callbackQuery.message.text + "\n\n❌ To'lov rad etildi");
      if (order) {
        safeSendMessage(order.user_id, `❌ Zakaz #${orderId} uchun to'lov rad etildi.
Buyurtma bekor qilindi.`);
      }
    });
  });
});

function finalizeOrder(ctx, u) {
  const total = totalCart(u.cart);
  db.get(`SELECT * FROM cafes WHERE id = ?`, [u.selectedCafeId], (err, cafe) => {
    if (!cafe) return safeSendMessage(ctx.from.id, "Cafe topilmadi.");

    const deliveryPrice = u.orderDraft.order_type === "🚚 Yetkazib berish" ? Number(cafe.delivery_price || 0) : 0;
    const grandTotal = total + deliveryPrice;

    db.run(
      `INSERT INTO orders (
      cafe_id, user_id, username, customer_name, customer_phone, customer_telegram,
      order_type, address, note, latitude, longitude, table_number,
      items_json, total, delivery_price, status, payment_type, payment_photo_id, payment_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        u.selectedCafeId, String(ctx.from.id), safeUsername(ctx), u.orderDraft.customer_name,
        u.orderDraft.customer_phone, u.orderDraft.customer_telegram, u.orderDraft.order_type,
        u.orderDraft.address || null, u.orderDraft.note || null, u.orderDraft.latitude || null,
        u.orderDraft.longitude || null, u.orderDraft.table_number || null, JSON.stringify(u.cart),
        grandTotal, deliveryPrice, "new", u.orderDraft.payment_type || 'cash', u.orderDraft.payment_photo_id || null, u.orderDraft.payment_status || 'unpaid'
      ],
      function (err2) {
        if (err2) { console.error("Buyurtma saqlashda xatolik:", err2); return safeSendMessage(ctx.from.id, "Buyurtma saqlashda xatolik ❌"); }

        const orderId = this.lastID;
        db.get(`SELECT * FROM orders WHERE id = ?`, [orderId], (err3, order) => {
          if (!order) return;

          // Build items text from saved JSON
          let itemsList = [];
          try { itemsList = JSON.parse(order.items_json || '[]'); } catch (e) { itemsList = []; }
          const itemsText = Array.isArray(itemsList)
            ? itemsList.map((p, i) => `${i + 1}. ${p.name} — ${p.price} so'm`).join('\n')
            : '';

          const receiptText = `✅ Buyurtmangiz uchun rahmat!\n\n📋 Zakaz #${orderId}\n\n${itemsText}` +
            (order.delivery_price > 0 ? `\n🚚 Yetkazib berish: ${order.delivery_price} so'm` : '') +
            `\n\n💰 Jami: ${order.total} so'm`;

          if (order.payment_status === 'pending_verification') {
            sendVerificationToCafeGroup(order, cafe);
            const pendingText = `⏳ To'lov tekshirilmoqda.\nTasksdiqlangandan so'ng xabar olasiz.\n\n📋 Zakaz #${orderId}\n\n${itemsText}` +
              (order.delivery_price > 0 ? `\n🚚 Yetkazib berish: ${order.delivery_price} so'm` : '') +
              `\n\n💰 Jami: ${order.total} so'm`;
            safeSendMessage(ctx.from.id, pendingText, mainMenu());
          } else {
            if (cafe.order_group_id) { sendOrderToCafeGroup(order, cafe); }
            safeSendMessage(ctx.from.id, receiptText, mainMenu());
          }
          u.cart = []; u.step = "home"; resetOrderDraft(u);
        });
      }
    );
  });
}

function sendVerificationToCafeGroup(order, cafe) {
  if (!cafe.order_group_id) return;
  const kbd = Markup.inlineKeyboard([
    [Markup.button.callback("✅ Tasdiqlash", `verify_yes_${order.id}`)],
    [Markup.button.callback("❌ Rad etish", `verify_no_${order.id}`)]
  ]);

  const msg = `💳 TO'LOV TEKSHIRUVI

Zakaz: #${order.id}
Mijoz: ${order.customer_name}
Telefon: ${order.customer_phone}
Summa: ${order.total} so'm`;
  if (order.payment_photo_id) {
    bot.telegram.sendPhoto(cafe.order_group_id, order.payment_photo_id, { caption: msg, ...kbd });
  } else {
    bot.telegram.sendMessage(cafe.order_group_id, msg, kbd);
  }
}

// === Обработчик изменения процента комиссии в Super Panel ===
bot.hears(/^\/foiz_(\d+)/, async (ctx) => {
  const match = ctx.message.text.match(/^\/foiz_(\d+)/);
  if (!match) return;
  
  const cafeId = parseInt(match[1]);
  const u = getUser(ctx.from.id);
  
  // Проверим что это Supar admin
  db.get(`SELECT * FROM cafes WHERE id = ? AND admin_login`, [cafeId], (err, cafe) => {
    if (err || !cafe || cafe.tariff_type !== 'commission') {
      return ctx.reply("❌ Bu cafe komissiya tizimida emas yoki topilmadi");
    }
    
    u.selectedCafeId = cafeId;
    u.step = "edit_commission_percent";
    
    ctx.reply(`📝 ${cafe.name} uchun yangi foizni kiriting (hozirgi: ${cafe.commission_percent || 0}%)\n0-100 oralig'ida:`, Markup.keyboard([["⬅️ Orqaga"]]).resize());
  });
});

// Обработчик ввода нового процента
bot.use(async (ctx, next) => {
  const u = getUser(ctx.from.id);
  
  if (u.step === "edit_commission_percent" && ctx.message?.text) {
    const text = ctx.message.text;
    
    if (text === "⬅️ Orqaga") {
      u.step = "super";
      u.selectedCafeId = null;
      return ctx.reply("📋 Cafelar menyusiga qaytdingiz", superMenu());
    }
    
    const newPercent = parseInt(text);
    
    if (isNaN(newPercent) || newPercent < 0 || newPercent > 100) {
      return ctx.reply("❌ Noto'g'ri! Foiz 0-100 oralig'ida bo'lishi kerak.");
    }
    
    updateCommissionPercent(u.selectedCafeId, newPercent, (success, message) => {
      if (success) {
        u.step = "super";
        u.selectedCafeId = null;
        ctx.reply(message, superMenu());
      } else {
        ctx.reply("❌ " + message);
      }
    });
    
    return;
  }
  
  return next();
});

if (require.main === module) {
  bot.launch();
  console.log("RUNNING...");
}

module.exports = { bot };

bot.catch((err, ctx) => {
  console.log("❌ GLOBAL BOT ERROR:", err);
  if (ctx) {
    ctx.reply("⚠️ Xatolik yuz berdi, qayta urinib ko‘ring.");
  }
});
