const fs = require('fs');
let c = fs.readFileSync('bot.js', 'utf8');

c = c.replace(/bot\.action\(, async \(ctx\) => \{\n  if \(await isProcessing\(ctx\.from\.id\)\) return safeAnswerCbQuery\(ctx, 'Iltimos, kuting...'\);\n  const orderId = Number\(ctx\.match\[1\]\);\n\n  updateOrderStatus\(orderId, "accepted"/, `bot.action(/accept_(\\d+)/, async (ctx) => {\n  if (await isProcessing(ctx.from.id)) return safeAnswerCbQuery(ctx, 'Iltimos, kuting...');\n  const orderId = Number(ctx.match[1]);\n\n  updateOrderStatus(orderId, "accepted"`);

c = c.replace(/bot\.action\(, async \(ctx\) => \{\n  if \(await isProcessing\(ctx\.from\.id\)\) return safeAnswerCbQuery\(ctx, 'Iltimos, kuting...'\);\n  const orderId = Number\(ctx\.match\[1\]\);\n  const minutes = Number\(ctx\.match\[2\]\);/, `bot.action(/eta_(\\d+)_(\\d+)/, async (ctx) => {\n  if (await isProcessing(ctx.from.id)) return safeAnswerCbQuery(ctx, 'Iltimos, kuting...');\n  const orderId = Number(ctx.match[1]);\n  const minutes = Number(ctx.match[2]);`);

c = c.replace(/bot\.action\(, async \(ctx\) => \{\n  if \(await isProcessing\(ctx\.from\.id\)\) return safeAnswerCbQuery\(ctx, 'Iltimos, kuting...'\);\n  const orderId = Number\(ctx\.match\[1\]\);\n\n  updateOrderStatus\(orderId, "ready"/, `bot.action(/ready_(\\d+)/, async (ctx) => {\n  if (await isProcessing(ctx.from.id)) return safeAnswerCbQuery(ctx, 'Iltimos, kuting...');\n  const orderId = Number(ctx.match[1]);\n\n  updateOrderStatus(orderId, "ready"`);

c = c.replace(/bot\.action\(, async \(ctx\) => \{\n  if \(await isProcessing\(ctx\.from\.id\)\) return safeAnswerCbQuery\(ctx, 'Iltimos, kuting...'\);\n  const orderId = Number\(ctx\.match\[1\]\);\n\n  getOrder\(orderId, \(err, order\) => \{\n    if \(err \|\| !order\) return safeAnswerCbQuery\(ctx, /, `bot.action(/courier_pick_(\\d+)/, async (ctx) => {\n  if (await isProcessing(ctx.from.id)) return safeAnswerCbQuery(ctx, 'Iltimos, kuting...');\n  const orderId = Number(ctx.match[1]);\n\n  getOrder(orderId, (err, order) => {\n    if (err || !order) return safeAnswerCbQuery(ctx, "Zakaz topilmadi"`);

c = c.replace(/bot\.action\(, async \(ctx\) => \{\n  if \(await isProcessing\(ctx\.from\.id\)\) return safeAnswerCbQuery\(ctx, 'Iltimos, kuting...'\);\n  const orderId = Number\(ctx\.match\[1\]\);\n  const courierId = Number\(ctx\.match\[2\]\);/, `bot.action(/assignCourier_(\\d+)_(\\d+)/, async (ctx) => {\n  if (await isProcessing(ctx.from.id)) return safeAnswerCbQuery(ctx, 'Iltimos, kuting...');\n  const orderId = Number(ctx.match[1]);\n  const courierId = Number(ctx.match[2]);`);

c = c.replace(/bot\.action\(, async \(ctx\) => \{\n  if \(await isProcessing\(ctx\.from\.id\)\) return safeAnswerCbQuery\(ctx, 'Iltimos, kuting...'\);\n  const orderId = Number\(ctx\.match\[1\]\);\n\n  updateOrderStatus\(orderId, "courier_started"/, `bot.action(/courier_started_(\\d+)/, async (ctx) => {\n  if (await isProcessing(ctx.from.id)) return safeAnswerCbQuery(ctx, 'Iltimos, kuting...');\n  const orderId = Number(ctx.match[1]);\n\n  updateOrderStatus(orderId, "courier_started"`);

c = c.replace(/bot\.action\(, async \(ctx\) => \{\n  if \(await isProcessing\(ctx\.from\.id\)\) return safeAnswerCbQuery\(ctx, 'Iltimos, kuting...'\);\n  const orderId = Number\(ctx\.match\[1\]\);\n\n  updateOrderStatus\(orderId, "courier_arrived"/, `bot.action(/courier_arrived_(\\d+)/, async (ctx) => {\n  if (await isProcessing(ctx.from.id)) return safeAnswerCbQuery(ctx, 'Iltimos, kuting...');\n  const orderId = Number(ctx.match[1]);\n\n  updateOrderStatus(orderId, "courier_arrived"`);

// courier_done_
c = c.replace(/bot\.action\(, async \(ctx\) => \{\n  if \(await isProcessing\(ctx\.from\.id\)\) return safeAnswerCbQuery\(ctx, 'Iltimos, kuting...'\);\n  const orderId = Number\(ctx\.match\[1\]\);\n\n  updateOrderStatus\(orderId, "delivered", \{\}, async \(err\) => \{\n    if \(err\) return safeAnswerCbQuery\(ctx, /, `bot.action(/courier_done_(\\d+)/, async (ctx) => {\n  if (await isProcessing(ctx.from.id)) return safeAnswerCbQuery(ctx, 'Iltimos, kuting...');\n  const orderId = Number(ctx.match[1]);\n\n  updateOrderStatus(orderId, "delivered", {}, async (err) => {\n    if (err) return safeAnswerCbQuery(ctx, `);

// delivered_ (second one)
c = c.replace(/bot\.action\(, async \(ctx\) => \{\n  if \(await isProcessing\(ctx\.from\.id\)\) return safeAnswerCbQuery\(ctx, 'Iltimos, kuting...'\);\n  const orderId = Number\(ctx\.match\[1\]\);\n\n  updateOrderStatus\(orderId, "delivered", \{\}, async \(err\) => \{\n    if \(err\) return safeAnswerCbQuery\(ctx, /, `bot.action(/delivered_(\\d+)/, async (ctx) => {\n  if (await isProcessing(ctx.from.id)) return safeAnswerCbQuery(ctx, 'Iltimos, kuting...');\n  const orderId = Number(ctx.match[1]);\n\n  updateOrderStatus(orderId, "delivered", {}, async (err) => {\n    if (err) return safeAnswerCbQuery(ctx, `);

// add_
c = c.replace(/bot\.action\(, async \(ctx\) => \{\n  if \(await isProcessing\(ctx\.from\.id\)\) return safeAnswerCbQuery\(ctx, 'Iltimos, kuting...'\);\n  const productId = Number\(ctx\.match\[1\]\);\n  const u = getUser/, `bot.action(/add_(\\d+)/, async (ctx) => {\n  if (await isProcessing(ctx.from.id)) return safeAnswerCbQuery(ctx, 'Iltimos, kuting...');\n  const productId = Number(ctx.match[1]);\n  const u = getUser`);

// addv_
c = c.replace(/bot\.action\(, async \(ctx\) => \{\n  if \(await isProcessing\(ctx\.from\.id\)\) return safeAnswerCbQuery\(ctx, 'Iltimos, kuting...'\);\n  const productId = Number\(ctx\.match\[1\]\);\n  const variantIndex = Number\(ctx\.match\[2\]\);/, `bot.action(/addv_(\\d+)_(\\d+)/, async (ctx) => {\n  if (await isProcessing(ctx.from.id)) return safeAnswerCbQuery(ctx, 'Iltimos, kuting...');\n  const productId = Number(ctx.match[1]);\n  const variantIndex = Number(ctx.match[2]);`);

// Fix missing strings in safeAnswerCbQuery inside courier_pick, etc.
c = c.replace(/safeAnswerCbQuery\(ctx, \);\n/g, 'safeAnswerCbQuery(ctx, "Xatolik");\n');

fs.writeFileSync('bot.js', c);
