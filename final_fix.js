const fs = require('fs');

let content = fs.readFileSync('bot_old.js', 'utf8');

// 4 оставшихся замены с полным контекстом
const lines = [
  // Строка 1181
  {
    old: `        u.step = "cafe";
        u.temp = {};
        ctx.reply("Mahsulot qo'shildi ✅", cafePanelMenu());
      },`,
    new: `        u.step = "cafe";
        u.temp = {};
        getCafeMenuAsync(u.cafeAdminId, (menu) => {
          ctx.reply("Mahsulot qo'shildi ✅", menu);
        });
      },`
  },
  // Строка 1887
  {
    old: `        u.step = "cafe";
        ctx.reply("🗑 Kuryer o'chirildi ✅", cafePanelMenu());
      },`,
    new: `        u.step = "cafe";
        getCafeMenuAsync(u.cafeAdminId, (menu) => {
          ctx.reply("🗑 Kuryer o'chirildi ✅", menu);
        });
      },`
  },
  // Строка 1992
  {
    old: `        u.step = "cafe";
        ctx.reply("🗑 Mahsulot o'chirildi ✅", cafePanelMenu());
      },`,
    new: `        u.step = "cafe";
        getCafeMenuAsync(u.cafeAdminId, (menu) => {
          ctx.reply("🗑 Mahsulot o'chirildi ✅", menu);
        });
      },`
  },
  // Строка 2847
  {
    old: `        if (!rows || !rows.length) {
          return ctx.reply("Mahsulot yo'q.", cafePanelMenu());
        }`,
    new: `        if (!rows || !rows.length) {
          getCafeMenuAsync(u.cafeAdminId, (menu) => {
            ctx.reply("Mahsulot yo'q.", menu);
          });
          return;
        }`
  },
  // Строка 2964
  {
    old: `        if (!rows.length) return ctx.reply("Kuryer yo'q.", cafePanelMenu());`,
    new: `        if (!rows.length) {
          getCafeMenuAsync(u.cafeAdminId, (menu) => {
            ctx.reply("Kuryer yo'q.", menu);
          });
          return;
        }`
  }
];

let count = 0;
lines.forEach((r, i) => {
  if (content.includes(r.old)) {
    content = content.replace(r.old, r.new);
    console.log(`✓ Replaced item ${i+1}`);
    count++;
  } else {
    console.log(`✗ Item ${i+1} not found`);
  }
});

fs.writeFileSync('bot_old.js', content, 'utf8');
console.log(`\nTotal replacements: ${count}/5`);
