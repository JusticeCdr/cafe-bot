const fs = require('fs');

let content = fs.readFileSync('bot_old.js', 'utf8');

// Найдём и заменим по очереди каждое вхождение
const replacements = [
  {
    search: 'ctx.reply("Mahsulot qo\'shildi ✅", cafePanelMenu());',
    replace: 'getCafeMenuAsync(u.cafeAdminId, (menu) => {\n          ctx.reply("Mahsulot qo\'shildi ✅", menu);\n        });'
  },
  {
    search: 'ctx.reply("🗑 Kuryer o\'chirildi ✅", cafePanelMenu());',
    replace: 'getCafeMenuAsync(u.cafeAdminId, (menu) => {\n          ctx.reply("🗑 Kuryer o\'chirildi ✅", menu);\n        });'
  },
  {
    search: 'ctx.reply("🗑 Mahsulot o\'chirildi ✅", cafePanelMenu());',
    replace: 'getCafeMenuAsync(u.cafeAdminId, (menu) => {\n          ctx.reply("🗑 Mahsulot o\'chirildi ✅", menu);\n        });'
  },
  {
    search: 'return ctx.reply("Mahsulot yo\'q.", cafePanelMenu());',
    replace: 'getCafeMenuAsync(u.cafeAdminId, (menu) => {\n          ctx.reply("Mahsulot yo\'q.", menu);\n        });\n        return;'
  },
  {
    search: 'if (!rows.length) return ctx.reply("Kuryer yo\'q.", cafePanelMenu());',
    replace: 'if (!rows.length) {\n          getCafeMenuAsync(u.cafeAdminId, (menu) => {\n            ctx.reply("Kuryer yo\'q.", menu);\n          });\n          return;\n        }'
  }
];

let count = 0;
replacements.forEach((r, i) => {
  // Используем replaceAll
  const times = (content.match(new RegExp(r.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
  if (times > 0) {
    content = content.split(r.search).join(r.replace);
    console.log(`✓ Replaced ${r.search.substring(0, 50)}...`);
    count++;
  } else {
    console.log(`✗ Not found: ${r.search.substring(0, 50)}...`);
  }
});

fs.writeFileSync('bot_old.js', content, 'utf8');
console.log(`\nTotal: ${count} replacements done`);
