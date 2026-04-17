require("dotenv").config();
const { Telegraf, Markup } = require("telegraf");
const fs = require("fs");
const db = require("./db"); // connects to real DB

// Read bot logic, we will strip `bot.launch` and `Telegraf` init and eval the rest
let botCode = fs.readFileSync('bot.js', 'utf8');

// replace the initialization with a mock token
botCode = botCode.replace('const bot = new Telegraf(process.env.BOT_TOKEN);', 'const bot = new Telegraf("123:abc");');

// replace bot.launch
botCode = botCode.replace('bot.launch();', '');

// Evaluate the bot in this context
eval(botCode);

async function runTests() {
   console.log("=== RUNNING RUNTIME TESTS ===");

   // 1. Text message "🏪 Cafelar"
   console.log("1. Testing '🏪 Cafelar'");
   try {
     let repliedText = "";
     const mockCtx1 = {
       updateType: "message",
       from: { id: 111, username: "tester", first_name: "Test" },
       message: { text: "🏪 Cafelar" },
       reply: (text, extra) => {
         repliedText = text;
         console.log("-> Bot replied:", text);
       }
     };
     // trigger manually
     // instead of full handleUpdate which needs more deep mocking, we just invoke the listeners
     // Wait, bot.on or bot.action listeners are stored internally in telegraf.
     await bot.handleUpdate({
       update_id: 1,
       message: {
         message_id: 1,
         date: Date.now(),
         from: { id: 111, first_name: "Test" },
         chat: { id: 111, type: "private" },
         text: "🏪 Cafelar"
       }
     }, {
         reply: (t) => { repliedText = t; console.log("-> Replied:", t); }
     });
   } catch(e) { console.error("Error 1:", e); }

   setTimeout(() => process.exit(0), 2000);
}
runTests();
