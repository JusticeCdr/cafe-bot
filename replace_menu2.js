const fs = require('fs');

let content = fs.readFileSync('bot_old.js', 'utf8');

// Дополнительные замены с Unicode символами
const additionalReplacements = [
  // Махсулот qo'shildi
  {
    search: 'ctx.reply("Mahsulot qo\'shildi',
    replace: 'getCafeMenuAsync(u.cafeAdminId, (menu) => {\n          ctx.reply("Mahsulot qo\'shildi'
  },
  {
    search: 'Mahsulot qo\'shildi ✅", cafePanelMenu());',
    replace: 'Mahsulot qo\'shildi ✅", menu);\n        });'
  },
  // Курyer
  {
    search: 'ctx.reply("🗑 Kuryer o\'chirildi ✅", cafePanelMenu());',
    replace: 'getCafeMenuAsync(u.cafeAdminId, (menu) => {\n          ctx.reply("🗑 Kuryer o\'chirildi ✅", menu);\n        });'
  },
  // Махсулот o'chirildi
  {
    search: 'ctx.reply("🗑 Mahsulot o\'chirildi ✅", cafePanelMenu());',
    replace: 'getCafeMenuAsync(u.cafeAdminId, (menu) => {\n          ctx.reply("🗑 Mahsulot o\'chirildi ✅", menu);\n        });'
  },
  // Махсулот yo'q
  {
    search: 'return ctx.reply("Mahsulot yo\'q.", cafePanelMenu());',
    replace: 'getCafeMenuAsync(u.cafeAdminId, (menu) => {\n          ctx.reply("Mahsulot yo\'q.", menu);\n        });\n        return;'
  },
  // Kuryer yo'q
  {
    search: 'if (!rows.length) return ctx.reply("Kuryer yo\'q.", cafePanelMenu());',
    replace: 'if (!rows.length) {\n          getCafeMenuAsync(u.cafeAdminId, (menu) => {\n            ctx.reply("Kuryer yo\'q.", menu);\n          });\n          return;\n        }'
  }
];

additionalReplacements.forEach(r => {
  if (content.includes(r.search)) {
    console.log(`Found: ${r.search.substring(0, 50)}...`);
    content = content.split(r.search).join(r.replace);
  } else {
    console.log(`NOT FOUND: ${r.search.substring(0, 50)}...`);
  }
});

fs.writeFileSync('bot_old.js', content, 'utf8');
console.log('Additional replacements done!');
