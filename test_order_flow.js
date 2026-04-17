// Minimal local flow check via bot.handleUpdate (no Telegram needed).
// Does NOT change bot logic; only helps validate callback flows.

process.env.BOT_TOKEN = process.env.BOT_TOKEN || "123456:TEST_TOKEN";

const db = require("./db");
require("./bot_old"); // registers handlers without launching (guarded)
const { Telegraf } = require("telegraf");

// Access the same bot instance indirectly:
// bot_old.js keeps bot in module scope; telegraf doesn't expose global.
// We re-require bot_old.js exports if present; otherwise we introspect require cache.
const botModulePath = require.resolve("./bot_old");
const botModule = require.cache[botModulePath];
const bot = botModule?.exports?.bot || botModule?.exports || null;

if (!bot || !(bot instanceof Telegraf)) {
  console.error("Cannot access bot instance for testing.");
  process.exit(1);
}

async function sendMessage(chatId, text) {
  await bot.handleUpdate({
    update_id: Date.now(),
    message: {
      message_id: Math.floor(Math.random() * 1e9),
      date: Math.floor(Date.now() / 1000),
      from: { id: chatId, first_name: "Test" },
      chat: { id: chatId, type: "private" },
      text,
    },
  });
}

async function sendCallback(chatId, messageId, data) {
  await bot.handleUpdate({
    update_id: Date.now(),
    callback_query: {
      id: String(Date.now()),
      from: { id: chatId, first_name: "Test" },
      message: {
        message_id: messageId,
        chat: { id: chatId, type: "group" },
        text: "Test order message",
      },
      data,
    },
  });
}

async function run() {
  console.log("=== order flow smoke check ===");
  // This script is a smoke check only; it relies on existing DB content.
  // If there are no orders/cafes, it will just exit.
  db.get("SELECT * FROM orders ORDER BY id DESC LIMIT 1", [], async (err, order) => {
    if (err || !order) {
      console.log("No orders found in DB. Skipping.");
      process.exit(0);
      return;
    }
    const groupChatId = Number(String(order.group_main_msg_id || "").split("_")[0]) || null;
    const groupMsgId = Number(String(order.group_main_msg_id || "").split("_")[1]) || 1;
    const chatId = groupChatId || 1;

    console.log("Using order:", order.id, "chat:", chatId, "msg:", groupMsgId);

    await sendCallback(chatId, groupMsgId, `accept_${order.id}`);
    await sendCallback(chatId, groupMsgId, `ready_${order.id}`);
    await sendCallback(chatId, groupMsgId, `courier_pick_${order.id}`);
    // assignCourier requires courier list; we can't know id here safely.

    console.log("Done.");
    process.exit(0);
  });
}

run().catch((e) => {
  console.error("Flow test error:", e);
  process.exit(1);
});

