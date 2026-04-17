const fs = require('fs');
let lines = fs.readFileSync('bot.js', 'utf8').split('\n');

let photoIdx = lines.findIndex(l => l.includes('bot.on("photo", (ctx) => {'));
lines.splice(photoIdx + 4, 0, `  if (u.step === "payment_photo") {
    u.orderDraft.payment_photo_id = fileId;
    return finalizeOrder(ctx, u);
  }`);

// Add admin actions
let lastBotActionIdx = lines.findLastIndex(l => l.includes('bot.action('));
let patch = `
bot.action(/verify_yes_(\\d+)/, async (ctx) => {
  if (await isProcessing(ctx.from.id)) return safeAnswerCbQuery(ctx, 'Kuting...');
  const orderId = Number(ctx.match[1]);
  
  db.get('SELECT * FROM orders WHERE id = ?', [orderId], async (err, order) => {
    if (!order) return safeAnswerCbQuery(ctx, "Topilmadi");
    
    db.run('UPDATE orders SET payment_status = ? WHERE id = ?', ['paid', orderId], async () => {
      await safeAnswerCbQuery(ctx, "To'lov tasdiqlandi");
      db.get('SELECT * FROM cafes WHERE id = ?', [order.cafe_id], async (err, cafe) => {
         safeEditMessageText(ctx.chat.id, ctx.callbackQuery.message.message_id, ctx.callbackQuery.message.caption ? ctx.callbackQuery.message.caption + "\\n\\n✅ To'lov tasdiqlandi" : ctx.callbackQuery.message.text + "\\n\\n✅ To'lov tasdiqlandi");
         if (cafe && cafe.order_group_id) {
           sendOrderToCafeGroup(order, cafe);
         }
         safeSendMessage(order.user_id, \`✅ Zakaz #\${orderId} uchun to'lov tasdiqlandi.\\nBuyurtma qabul qilindi!\`);
      });
    });
  });
});

bot.action(/verify_no_(\\d+)/, async (ctx) => {
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
});
`;
lines.splice(lastBotActionIdx, 0, patch);

// Wait, I messed up `isCafeFrozen` and `isCafeOpenByTime` in step 3 from the patch before it failed.
// Let me just manually patch `🏪 Cafelar` block here!
let cafeIdx = lines.findIndex(l => l.includes('if (text === "🏪 Cafelar") {'));
let endCafeIdx = lines.indexOf('  // cafe tanlash', cafeIdx);
if(cafeIdx > -1) {
  lines.splice(cafeIdx, endCafeIdx - cafeIdx, `  // user cafelar
  if (text === "🏪 Cafelar") {
    db.all(\`SELECT * FROM cafes WHERE is_visible = 1 AND is_open = 1 AND manual_frozen = 0 ORDER BY name ASC\`, [], (err, rows) => {
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
`);
}

fs.writeFileSync('bot.js', lines.join('\\n'));
