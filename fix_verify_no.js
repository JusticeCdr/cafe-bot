const fs = require('fs');
let content = fs.readFileSync('bot.js', 'utf8');

const target = `bot.action(/verify_no_(\\d+)/, async (ctx) => {
  if (await isProcessing(ctx.from.id)) return safeAnswerCbQuery(ctx, 'Kuting...');
  const orderId = Number(ctx.match[1]);
  
  db.run('UPDATE orders SET payment_status = ?, status = ? WHERE id = ?', ['rejected', 'rejected', orderId], async () => {
     await safeAnswerCbQuery(ctx, "To'lov rad etildi");
     db.get('SELECT * FROM orders WHERE id = ?', [orderId], async (err, order) => {
       safeEditMessageText(ctx.chat.id, ctx.callbackQuery.message.message_id, ctx.callbackQuery.message.caption ? ctx.callbackQuery.message.caption + "\\n\\n❌ To'lov rad etildi" : ctx.callbackQuery.message.text + "\\n\\n❌ To'lov rad etildi");
       if (order) {
         safeSendMessage(order.user_id, \`❌ Zakaz #\${orderId} uchun to'lov rad etildi.\\nBuyurtma bekor qilindi.\`);
       }
     });
  });
});`;

const replacement = `bot.action(/verify_no_(\\d+)/, async (ctx) => {
  if (await isProcessing(ctx.from.id)) return safeAnswerCbQuery(ctx, 'Kuting...');
  const orderId = Number(ctx.match[1]);
  
  db.run('UPDATE orders SET payment_status = ?, status = ? WHERE id = ?', ['rejected', 'rejected', orderId], async function (err) {
     if (err) { console.error("verify_no DB ERR:", err); return safeAnswerCbQuery(ctx, "Saqlashda xato"); }
     await safeAnswerCbQuery(ctx, "To'lov rad etildi");
     db.get('SELECT * FROM orders WHERE id = ?', [orderId], async (err2, order) => {
       if (err2) console.error("verify_no DB ERR2:", err2);
       safeEditMessageText(ctx.chat.id, ctx.callbackQuery.message.message_id, ctx.callbackQuery.message.caption ? ctx.callbackQuery.message.caption + "\\n\\n❌ To'lov rad etildi" : ctx.callbackQuery.message.text + "\\n\\n❌ To'lov rad etildi");
       if (order) {
         safeSendMessage(order.user_id, \`❌ Zakaz #\${orderId} uchun to'lov rad etildi.\\nBuyurtma bekor qilindi.\`);
       }
     });
  });
});`;

content = content.replace(target, replacement);
fs.writeFileSync('bot.js', content);
console.log("verify_no patched.");
