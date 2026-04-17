const fs = require('fs');

let content = fs.readFileSync('bot_old.js', 'utf8');

// Специальный апостроф U+2018
const apos = String.fromCharCode(0x2018);

// Замены с правильными символами
const replacements = [
  {
    search: 'ctx.reply("Mahsulot qo' + apos + 'shildi ✅", cafePanelMenu());',
    replace: 'getCafeMenuAsync(u.cafeAdminId, (menu) => {\n          ctx.reply("Mahsulot qo' + apos + 'shildi ✅", menu);\n        });'
  },
  {
    search: 'ctx.reply("🗑 Kuryer o' + apos + 'chirildi ✅", cafePanelMenu());',
    replace: 'getCafeMenuAsync(u.cafeAdminId, (menu) => {\n          ctx.reply("🗑 Kuryer o' + apos + 'chirildi ✅", menu);\n        });'
  },
  {
    search: 'ctx.reply("🗑 Mahsulot o' + apos + 'chirildi ✅", cafePanelMenu());',
    replace: 'getCafeMenuAsync(u.cafeAdminId, (menu) => {\n          ctx.reply("🗑 Mahsulot o' + apos + 'chirildi ✅", menu);\n        });'
  },
  {
    search: 'return ctx.reply("Mahsulot yo' + apos + 'q.", cafePanelMenu());',
    replace: 'getCafeMenuAsync(u.cafeAdminId, (menu) => {\n          ctx.reply("Mahsulot yo' + apos + 'q.", menu);\n        });\n        return;'
  },
  {
    search: 'if (!rows.length) return ctx.reply("Kuryer yo' + apos + 'q.", cafePanelMenu());',
    replace: 'if (!rows.length) {\n          getCafeMenuAsync(u.cafeAdminId, (menu) => {\n            ctx.reply("Kuryer yo' + apos + 'q.", menu);\n          });\n          return;\n        }'
  }
];

let count = 0;
replacements.forEach((r, i) => {
  if (content.includes(r.search)) {
    content = content.replace(r.search, r.replace);
    console.log(`✓ Replaced ${i+1}: ${r.search.substring(0, 50)}...`);
    count++;
  } else {
    console.log(`✗ Not found ${i+1}: ${r.search.substring(0, 50)}...`);
  }
});

fs.writeFileSync('bot_old.js', content, 'utf8');
console.log(`\nTotal: ${count} replacements done`);
