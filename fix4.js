const fs=require('fs');
let b=fs.readFileSync('bot.js','utf8').split('\n');
let idx=b.findIndex(l=>l.includes('if (u.step === "order_location") {'));
b.splice(idx, 6,
'  if (u.step === "order_location") {',
'    u.orderDraft.latitude = ctx.message.location.latitude;',
'    u.orderDraft.longitude = ctx.message.location.longitude;',
'    u.step = "order_note";',
'    return ctx.reply("Izoh yozing.\\nAgar yo‘q bo‘lsa: yoq", simpleBackMenu());',
'  }',
'});',
'',
'bot.on("photo", (ctx) => {',
'  const u = getUser(ctx.from.id);',
'  const fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;',
'',
'  if (u.step === "payment_photo") {',
'    u.orderDraft.payment_photo_id = fileId;',
'    return finalizeOrder(ctx, u);',
'  }',
'',
'  if (u.step === "image") {',
'    const paidUntil = new Date();',
'    paidUntil.setDate(paidUntil.getDate() + 30);',
'',
'    db.run('
);
fs.writeFileSync('bot.js', b.join('\n'));
