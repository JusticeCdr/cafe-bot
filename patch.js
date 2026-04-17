const fs = require('fs');
let lines = fs.readFileSync('bot.js', 'utf8').split('\n');

// Find start of order_note
let start = lines.findIndex(l => l.includes('if (u.step === "order_note") {'));
let end = lines.indexOf('});', start);

const newCode = `  if (u.step === "order_note") {
    u.orderDraft.note = text && text.toLowerCase() !== "yoq" ? text : "";
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
      db.get(\`SELECT * FROM cafes WHERE id = ?\`, [u.selectedCafeId], (err, cafe) => {
        if (!cafe) return;
        u.step = "payment_photo";
        let msg = \`Karta orqali to'lov:\\n\\n\`;
        if (cafe.card_name) msg += \`👤 Ism: \${cafe.card_name}\\n\`;
        if (cafe.card_number) msg += \`💳 Karta: \${cafe.card_number}\\n\`;
        if (cafe.bank_name) msg += \`🏦 Bank: \${cafe.bank_name}\\n\`;
        msg += \`\\nIltimos, to'lovni amalga oshirgach, chek (skrinshot) yuboring:\`;
        
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
  }`;

lines.splice(start, end - start, newCode);

// Prepend finalizeOrder
const finalizeOrderFunc = `
function finalizeOrder(ctx, u) {
  const total = totalCart(u.cart);
  db.get(\`SELECT * FROM cafes WHERE id = ?\`, [u.selectedCafeId], (err, cafe) => {
    if (!cafe) return safeSendMessage(ctx.from.id, "Cafe topilmadi.");

    const deliveryPrice = u.orderDraft.order_type === "🚚 Yetkazib berish" ? Number(cafe.delivery_price || 0) : 0;
    const grandTotal = total + deliveryPrice;

    db.run(
      \`INSERT INTO orders (
      cafe_id, user_id, username, customer_name, customer_phone, customer_telegram,
      order_type, address, note, latitude, longitude, table_number,
      items_json, total, delivery_price, status, payment_type, payment_photo_id, payment_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)\`,
      [
        u.selectedCafeId, String(ctx.from.id), safeUsername(ctx), u.orderDraft.customer_name,
        u.orderDraft.customer_phone, u.orderDraft.customer_telegram, u.orderDraft.order_type,
        u.orderDraft.address || null, u.orderDraft.note || null, u.orderDraft.latitude || null,
        u.orderDraft.longitude || null, u.orderDraft.table_number || null, JSON.stringify(u.cart),
        grandTotal, deliveryPrice, "new", u.orderDraft.payment_type || 'cash', u.orderDraft.payment_photo_id || null, u.orderDraft.payment_status || 'unpaid'
      ],
      function (err2) {
        if (err2) { console.log(err2); return safeSendMessage(ctx.from.id, "Buyurtma saqlashda xatolik ❌"); }

        const orderId = this.lastID;
        db.get(\`SELECT * FROM orders WHERE id = ?\`, [orderId], (err3, order) => {
          if (!order) return;
          
          if (order.payment_status === 'pending_verification') {
             sendVerificationToCafeGroup(order, cafe);
             safeSendMessage(ctx.from.id, \`⏳ To'lov tekshirilmoqda.\\nTasdiqlangandan so'ng xabar olasiz.\\nZakaz raqami: #\${orderId}\`, mainMenu());
          } else {
             if (cafe.order_group_id) { sendOrderToCafeGroup(order, cafe); }
             safeSendMessage(ctx.from.id, \`✅ Buyurtmangiz uchun rahmat\\nZakaz raqami: #\${orderId}\`, mainMenu());
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
    [Markup.button.callback("✅ Tasdiqlash", \`verify_yes_\${order.id}\`)],
    [Markup.button.callback("❌ Rad etish", \`verify_no_\${order.id}\`)]
  ]);
  
  const msg = \`💳 TO'LOV TEKSHIRUVI\\n\\nZakaz: #\${order.id}\\nMijoz: \${order.customer_name}\\nTelefon: \${order.customer_phone}\\nSumma: \${order.total} so'm\`;
  if (order.payment_photo_id) {
     bot.telegram.sendPhoto(cafe.order_group_id, order.payment_photo_id, { caption: msg, ...kbd });
  } else {
     bot.telegram.sendMessage(cafe.order_group_id, msg, kbd);
  }
}
`;

let botLaunchIndex = lines.findIndex(l => l.includes('bot.launch();'));
lines.splice(botLaunchIndex, 0, finalizeOrderFunc);

fs.writeFileSync('bot.js', lines.join('\\n'));
