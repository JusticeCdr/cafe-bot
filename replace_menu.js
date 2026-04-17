const fs = require('fs');

let content = fs.readFileSync('bot_old.js', 'utf8');

// Замены с использованием getCafeMenuAsync
const replacements = [
  {
    old: 'ctx.reply("Mahsulot qo\'shildi ✅", cafePanelMenu());',
    new: `getCafeMenuAsync(u.cafeAdminId, (menu) => {
          ctx.reply("Mahsulot qo'shildi ✅", menu);
        });`
  },
  {
    old: 'ctx.reply("✅ Yangilandi", cafePanelMenu());',
    new: `getCafeMenuAsync(u.cafeAdminId, (menu) => {
          ctx.reply("✅ Yangilandi", menu);
        });`
  },
  {
    old: 'ctx.reply("🗑 Kuryer o\'chirildi ✅", cafePanelMenu());',
    new: `getCafeMenuAsync(u.cafeAdminId, (menu) => {
          ctx.reply("🗑 Kuryer o'chirildi ✅", menu);
        });`
  },
  {
    old: 'return ctx.reply(`✅ Stol soni saqlandi: ${count} ta`, cafePanelMenu());',
    new: `getCafeMenuAsync(u.cafeAdminId, (menu) => {
          ctx.reply(\`✅ Stol soni saqlandi: \${count} ta\`, menu);
        });
        return;`
  },
  {
    old: 'ctx.reply("🗑 Mahsulot o\'chirildi ✅", cafePanelMenu());',
    new: `getCafeMenuAsync(u.cafeAdminId, (menu) => {
          ctx.reply("🗑 Mahsulot o'chirildi ✅", menu);
        });`
  },
  {
    old: 'return ctx.reply("Mahsulot yo\'q.", cafePanelMenu());',
    new: `getCafeMenuAsync(u.cafeAdminId, (menu) => {
          ctx.reply("Mahsulot yo'q.", menu);
        });
        return;`
  },
  {
    old: 'return ctx.reply(msg, cafePanelMenu());',
    new: `getCafeMenuAsync(u.cafeAdminId, (menu) => {
          ctx.reply(msg, menu);
        });
        return;`
  },
  {
    old: 'ctx.reply(msg, cafePanelMenu());',
    new: `getCafeMenuAsync(u.cafeAdminId, (menu) => {
          ctx.reply(msg, menu);
        });`
  },
  {
    old: 'ctx.reply("✅ Cafe ochildi", cafePanelMenu());',
    new: `getCafeMenuAsync(u.cafeAdminId, (menu) => {
          ctx.reply("✅ Cafe ochildi", menu);
        });`
  },
  {
    old: 'ctx.reply("❌ Cafe yopildi", cafePanelMenu());',
    new: `getCafeMenuAsync(u.cafeAdminId, (menu) => {
          ctx.reply("❌ Cafe yopildi", menu);
        });`
  },
  {
    old: 'ctx.reply("✅ Ish vaqti yangilandi", cafePanelMenu());',
    new: `getCafeMenuAsync(u.cafeAdminId, (menu) => {
          ctx.reply("✅ Ish vaqti yangilandi", menu);
        });`
  },
  {
    old: 'if (!rows.length) return ctx.reply("Kuryer yo\'q.", cafePanelMenu());',
    new: `if (!rows.length) {
          getCafeMenuAsync(u.cafeAdminId, (menu) => {
            ctx.reply("Kuryer yo'q.", menu);
          });
          return;
        }`
  },
  {
    old: 'return ctx.reply("Cafe panel", cafePanelMenu());',
    new: `getCafeMenuAsync(u.cafeAdminId, (menu) => {
          ctx.reply("Cafe panel", menu);
        });
        return;`
  }
];

replacements.forEach(r => {
  if (content.includes(r.old)) {
    console.log(`Found: ${r.old.substring(0, 50)}...`);
    content = content.replace(r.old, r.new);
  } else {
    console.log(`NOT FOUND: ${r.old.substring(0, 50)}...`);
  }
});

// Replace remaining cafePanelMenu() with getCafeMenuAsync
// Line 2936: cafePanelMenu() in inline_keyboard context
content = content.replace(
  'inline_keyboard: [\n          ["📦 Mahsulotlar", "👨‍💼 Kuryer"],\n          ["📊 Statistika"],\n          ["⬅️ Orqaga"]\n        ],\n      }),\n      cafePanelMenu(),',
  `inline_keyboard: [
          ["📦 Mahsulotlar", "👨‍💼 Kuryer"],
          ["📊 Statistika"],
          ["⬅️ Orqaga"]
        ],
      }),\n      generateCafePanelMenu(cafe),`
);

fs.writeFileSync('bot_old.js', content, 'utf8');
console.log('Done! Replacements completed.');
