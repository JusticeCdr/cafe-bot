const fs = require('fs');

let c = fs.readFileSync('bot_old.js', 'utf8');

// Оставшиеся замены
const replacements = [
  {
    find: 'ctx.reply("Mahsulot qo\'shildi ✅", cafePanelMenu());',
    replace: 'getCafeMenuAsync(u.cafeAdminId, (menu) => {\\n          ctx.reply("Mahsulot qo\'shildi ✅", menu);\\n        });'
  },
  {
    find: 'ctx.reply("🗑 Kuryer o\'chirildi ✅", cafePanelMenu());',
    replace: 'getCafeMenuAsync(u.cafeAdminId, (menu) => {\\n          ctx.reply("🗑 Kuryer o\'chirildi ✅", menu);\\n        });'
  },
  {
    find: 'ctx.reply("🗑 Mahsulot o\'chirildi ✅", cafePanelMenu());',
    replace: 'getCafeMenuAsync(u.cafeAdminId, (menu) => {\\n          ctx.reply("🗑 Mahsulot o\'chirildi ✅", menu);\\n        });'
  },
  {
    find: 'return ctx.reply("Mahsulot yo\'q.", cafePanelMenu());',
    replace: 'getCafeMenuAsync(u.cafeAdminId, (menu) => {\\n          ctx.reply("Mahsulot yo\'q.", menu);\\n        });\\n        return;'
  },
  {
    find: 'if (!rows.length) return ctx.reply("Kuryer yo\'q.", cafePanelMenu());',
    replace: 'if (!rows.length) {\\n          getCafeMenuAsync(u.cafeAdminId, (menu) => {\\n            ctx.reply("Kuryer yo\'q.", menu);\\n          });\\n          return;\\n        }'
  }
];

let count = 0;
replacements.forEach(r => {
  if (c.includes(r.find)) {
    c = c.replace(r.find, r.replace);
    console.log(`Replaced: ${r.find.substring(0, 40)}...`);
    count++;
  } else {
    console.log(`NOT FOUND: ${r.find.substring(0, 40)}...`);
  }
});

fs.writeFileSync('bot_old.js', c, 'utf8');
console.log(`\nTotal replacements: ${count}`);
