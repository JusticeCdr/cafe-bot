/**
 * Fix remaining 3 failed patches:
 * PATCH 2: superMenu (add Balans + O'chirish rows)
 * PATCH 3: Cafe type wizard (add cafe_type step before name)
 * PATCH 7: Balance management + soft delete handlers (before freeze section)
 */
const fs = require('fs');
const src_raw = fs.readFileSync('bot_old.js', 'utf8');
let src = src_raw;

// ==========================================
// FIND the actual superMenu function text
// ==========================================
// We'll locate it by surrounding context and replace line by line
const smIdx = src.indexOf('function superMenu()');
if (smIdx === -1) {
  console.log('superMenu NOT FOUND');
} else {
  const smEnd = src.indexOf('}\n', smIdx) + 2 || src.indexOf('}\r\n', smIdx) + 3;
  const smBlock = src.substring(smIdx, smEnd);
  console.log('superMenu block found at index', smIdx);
  // Check if Balans is already inside
  if (smBlock.includes('Balans')) {
    console.log('PATCH 2: Already has Balans button - SKIP');
  } else {
    // Replace the block: insert new row after Muzlatish/Ochish row
    const newSuperMenu = `function superMenu() {
  return Markup.keyboard([
    ["\u2795 Cafe qo'shish", "\ud83d\udccb Cafelar"],
    ["\u2744\ufe0f Muzlatish", "\u2705 Ochish"],
    ["\ud83d\udcb0 Balans", "\ud83d\uddd1 O'chirish"],
    ["\u2795 30 kun qo'shish", "\ud83d\udcca Umumiy statistika"],
    ["\u270f\ufe0f Tahrirlash"],
    ["\ud83c\udfe0 Menu"],
  ]).resize();
}\n`;
    // Find the closing } of superMenu — it ends with  ]).resize();\n}
    const closePattern = '  ]).resize();\r\n}\r\n';
    const closePatternLF = '  ]).resize();\n}\n';
    let replaced = false;
    
    // Try to find the function block using indexOf
    const endPattern1 = src.indexOf('}).resize();\r\n}\r\n', smIdx);
    const endPattern2 = src.indexOf(']).resize();\r\n}\r\n', smIdx);
    if (endPattern2 > smIdx) {
      const blockEnd = endPattern2 + ']).resize();\r\n}\r\n'.length;
      src = src.substring(0, smIdx) + newSuperMenu + src.substring(blockEnd);
      console.log('PATCH 2: superMenu replaced (CRLF)');
      replaced = true;
    }
    if (!replaced) {
      const endPattern2lf = src.indexOf(']).resize();\n}\n', smIdx);
      if (endPattern2lf > smIdx) {
        const blockEnd = endPattern2lf + ']).resize();\n}\n'.length;
        const newSuperMenuLF = newSuperMenu.replace(/\r\n/g, '\n');
        src = src.substring(0, smIdx) + newSuperMenuLF + src.substring(blockEnd);
        console.log('PATCH 2: superMenu replaced (LF)');
        replaced = true;
      }
    }
    if (!replaced) console.log('PATCH 2: Could not replace superMenu');
  }
}

// ==========================================
// PATCH 3: Add cafe_type step before name step
// Find: text === "➕ Cafe qo'shish" handler
// ==========================================
// We know the string contains "Cafe qo'shish" as the handler trigger
// and then sets u.step = "name"
// Let's search for it after the superMenu was done
const cafeAddMarker = "Cafe qo'shish";
const cafeAddIdx = src.indexOf(`u.step = "name";\n    return ctx.reply("Cafe nomi:"`);
const cafeAddIdx2 = src.indexOf(`u.step = "name";\r\n    return ctx.reply("Cafe nomi:"`);

if (cafeAddIdx > 0 || cafeAddIdx2 > 0) {
  const idx = cafeAddIdx > 0 ? cafeAddIdx : cafeAddIdx2;
  const sep = cafeAddIdx > 0 ? '\n' : '\r\n';
  const oldStep = `u.step = "name";${sep}    return ctx.reply("Cafe nomi:", simpleBackMenu());${sep}  }`;
  const newStep = `u.step = "cafe_type";${sep}    u.temp = {};${sep}    return ctx.reply("Qaysi tur?", Markup.keyboard([["Cafe", "Restaurant"], ["\u2b05\ufe0f Orqaga"]]).resize());${sep}  }${sep}${sep}  if (u.step === "cafe_type") {${sep}    if (!["Cafe", "Restaurant"].includes(text)) return ctx.reply("Tugmadan tanlang.");${sep}    u.temp.cafe_type = text.toLowerCase();${sep}    u.step = "name";${sep}    return ctx.reply("Nomi:", simpleBackMenu());${sep}  }`;
  if (src.includes(oldStep)) {
    src = src.replace(oldStep, newStep);
    console.log('PATCH 3: cafe_type step added');
  } else {
    console.log('PATCH 3: exact match failed - trying partial');
    // Try with "Nomi:" already replaced vs "Cafe nomi:"
    const altOld = `u.step = "name";${sep}    return ctx.reply("Nomi:", simpleBackMenu());${sep}  }`;
    if (src.includes(altOld)) {
      src = src.replace(altOld, newStep);
      console.log('PATCH 3: cafe_type step added (alt match)');
    } else {
      console.log('PATCH 3: FAILED');
    }
  }
} else {
  // Check if cafe_type is already added
  if (src.includes('u.step === "cafe_type"')) {
    console.log('PATCH 3: Already applied - SKIP');
  } else {
    console.log('PATCH 3: Marker not found');
    // Debug
    const debugIdx = src.indexOf('"name"');
    console.log('First "name" step at:', debugIdx);
  }
}

// ==========================================
// PATCH 7: Balance management + Soft Delete handlers
// Insert before "// freeze/open/extend" section
// ==========================================
if (src.includes('"balance_cafe_id"') || src.includes('u.step = "balance_cafe_id"')) {
  console.log('PATCH 7: Already applied - SKIP');
} else {
  // Find the "// freeze/open/extend" section or "Muzlatish" text handler
  const freezeHandlerPattern1 = `  // freeze/open/extend\r\n  if (text === "\u2744\ufe0f Muzlatish") {`;
  const freezeHandlerPattern2 = `  // freeze/open/extend\n  if (text === "\u2744\ufe0f Muzlatish") {`;
  
  const balanceDeleteCode_CRLF = `  // === BUSINESS ENGINE: Balance Management ===\r\n  if (text === "\ud83d\udcb0 Balans") {\r\n    u.step = "balance_cafe_id";\r\n    return ctx.reply("Cafe ID yozing:", simpleBackMenu());\r\n  }\r\n\r\n  if (u.step === "balance_cafe_id") {\r\n    const id = Number(text);\r\n    if (!id) return ctx.reply("\u274c ID noto\u2019g\u2019ri");\r\n    db.get(\`SELECT * FROM cafes WHERE id = ?\`, [id], (err, cafe) => {\r\n      if (!cafe) return ctx.reply("\u274c Cafe topilmadi");\r\n      u.temp.balanceCafeId = id;\r\n      u.step = "balance_action";\r\n      const bal = cafe.balance || 0;\r\n      const tariff = cafe.tariff_type === 'commission' ? \`Foizli (\${cafe.commission_percent || 0}%)\` : "Aboniment";\r\n      ctx.reply(\r\n        \`\ud83c\udfe6 \${cafe.name}\\n\ud83d\udcb0 Balans: \${bal} so'm\\n\ud83d\udcb3 Tarif: \${tariff}\\n\\nQaysi amalni bajarmoqchisiz?\`,\r\n        Markup.keyboard([["\u2795 Qo\u2019shish", "\u2796 Ayirish"], ["\u270f\ufe0f O\u2019rnatish"], ["\u2b05\ufe0f Orqaga"]]).resize()\r\n      );\r\n    });\r\n    return;\r\n  }\r\n\r\n  if (u.step === "balance_action") {\r\n    if (!["\u2795 Qo\u2019shish", "\u2796 Ayirish", "\u270f\ufe0f O\u2019rnatish"].includes(text)) return ctx.reply("Tugmadan tanlang.");\r\n    u.temp.balanceAction = text;\r\n    u.step = "balance_amount";\r\n    return ctx.reply("Summani so\u2019mda kiriting (masalan: 50000):", simpleBackMenu());\r\n  }\r\n\r\n  if (u.step === "balance_amount") {\r\n    const amount = Number(text);\r\n    if (isNaN(amount) || amount < 0) return ctx.reply("\u274c To\u2019g\u2019ri summa kiriting (musbat son):");\r\n    const cafeId = u.temp.balanceCafeId;\r\n    const action = u.temp.balanceAction;\r\n    db.get(\`SELECT * FROM cafes WHERE id = ?\`, [cafeId], (err, cafe) => {\r\n      if (!cafe) return ctx.reply("\u274c Cafe topilmadi");\r\n      let newBalance;\r\n      if (action === "\u2795 Qo\u2019shish") newBalance = Number(cafe.balance || 0) + amount;\r\n      else if (action === "\u2796 Ayirish") newBalance = Number(cafe.balance || 0) - amount;\r\n      else newBalance = amount;\r\n      db.run(\`UPDATE cafes SET balance = ? WHERE id = ?\`, [newBalance, cafeId], () => {\r\n        if (newBalance > 0) {\r\n          db.run(\`UPDATE cafes SET manual_frozen = 0, is_open = 1 WHERE id = ? AND manual_frozen = 1\`, [cafeId]);\r\n        }\r\n        u.step = "super";\r\n        u.temp = {};\r\n        ctx.reply(\`\u2705 Balans yangilandi!\\n\ud83c\udfe6 \${cafe.name}\\n\ud83d\udcb0 Yangi balans: \${newBalance} so'm\`, superMenu());\r\n        cafe.balance = newBalance;\r\n        sendLowBalanceWarning(cafe, newBalance);\r\n      });\r\n    });\r\n    return;\r\n  }\r\n\r\n  // === BUSINESS ENGINE: Soft Delete ===\r\n  if (text === "\ud83d\uddd1 O\u2019chirish") {\r\n    u.step = "delete_cafe_id";\r\n    return ctx.reply("O\u2019chirish uchun Cafe ID yozing:", simpleBackMenu());\r\n  }\r\n\r\n  if (u.step === "delete_cafe_id") {\r\n    const id = Number(text);\r\n    if (!id) return ctx.reply("\u274c ID noto\u2019g\u2019ri");\r\n    db.get(\`SELECT * FROM cafes WHERE id = ? AND (is_deleted = 0 OR is_deleted IS NULL)\`, [id], (err, cafe) => {\r\n      if (!cafe) return ctx.reply("\u274c Cafe topilmadi yoki allaqachon o\u2019chirilgan");\r\n      db.all(\r\n        \`SELECT id FROM orders WHERE cafe_id = ? AND status NOT IN ('delivered','rejected','cancelled') LIMIT 5\`,\r\n        [id],\r\n        (err2, activeOrders) => {\r\n          if (activeOrders && activeOrders.length > 0) {\r\n            u.temp.deleteCafeId = id;\r\n            u.temp.deleteCafeName = cafe.name;\r\n            u.step = "delete_cafe_confirm";\r\n            return ctx.reply(\r\n              \`\u26a0\ufe0f "\${cafe.name}" da \${activeOrders.length} ta faol zakaz bor!\\n\\nBaribir o\u2019chirmoqchimisiz?\`,\r\n              Markup.keyboard([["\u2705 Ha, o\u2019chir", "\u274c Yo\u2019q, bekor qil"], ["\u2b05\ufe0f Orqaga"]]).resize()\r\n            );\r\n          } else {\r\n            const cafeName = cafe.name;\r\n            db.run(\`UPDATE cafes SET is_deleted = 1, is_open = 0, is_visible = 0 WHERE id = ?\`, [id], () => {\r\n              u.step = "super";\r\n              ctx.reply(\`\u2705 "\${cafeName}" o\u2019chirildi (soft delete)\`, superMenu());\r\n            });\r\n          }\r\n        }\r\n      );\r\n    });\r\n    return;\r\n  }\r\n\r\n  if (u.step === "delete_cafe_confirm") {\r\n    const cafeName = u.temp.deleteCafeName || u.temp.deleteCafeId;\r\n    if (text === "\u2705 Ha, o\u2019chir") {\r\n      const id = u.temp.deleteCafeId;\r\n      db.run(\`UPDATE cafes SET is_deleted = 1, is_open = 0, is_visible = 0 WHERE id = ?\`, [id], () => {\r\n        u.step = "super";\r\n        u.temp = {};\r\n        ctx.reply(\`\u2705 "\${cafeName}" o\u2019chirildi\`, superMenu());\r\n      });\r\n    } else {\r\n      u.step = "super";\r\n      u.temp = {};\r\n      ctx.reply("Bekor qilindi.", superMenu());\r\n    }\r\n    return;\r\n  }\r\n\r\n  // freeze/open/extend\r\n  if (text === "\u2744\ufe0f Muzlatish") {`;

  if (src.includes(freezeHandlerPattern1)) {
    src = src.replace(freezeHandlerPattern1, balanceDeleteCode_CRLF);
    console.log('PATCH 7: Balance + delete handlers inserted (CRLF)');
  } else if (src.includes(freezeHandlerPattern2)) {
    src = src.replace(freezeHandlerPattern2, balanceDeleteCode_CRLF.replace(/\r\n/g, '\n'));
    console.log('PATCH 7: Balance + delete handlers inserted (LF)');
  } else {
    // Try finding Muzlatish handler with different emoji encoding
    const muzIdx = src.indexOf('"Muzlatish"');
    console.log('PATCH 7: Muzlatish index:', muzIdx);
    // Find surrounding context
    if (muzIdx > 0) {
      const ctx_around = src.substring(muzIdx - 100, muzIdx + 20);
      console.log('Context:', JSON.stringify(ctx_around.substring(0, 100)));
    }
    console.log('PATCH 7: FAILED');
  }
}

if (src !== src_raw) {
  fs.writeFileSync('bot_old.js', src, 'utf8');
  console.log('\n✅ Saved!');
} else {
  console.log('\n⚠️ No changes made');
}
