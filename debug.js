const fs = require('fs');
let c = fs.readFileSync('bot_old.js', 'utf8');

// Найдём точное представление в hex
const idx = c.indexOf('Mahsulot qo');
if (idx >= 0) {
  const sample = c.substring(idx, idx + 50);
  console.log('Sample:', sample);
  // Проверим какой используется апостроф
  for (let i = 0; i < sample.length; i++) {
    if (sample.charCodeAt(i) > 127) {
      console.log(`Char at ${i}: '${sample[i]}' = U+${sample.charCodeAt(i).toString(16).toUpperCase()}`);
    }
  }
}

// Теперь заменим использ настоящий апостроф из файла
const searchStr1 = 'ctx.reply("Mahsulot qo' + String.fromCharCode(0x2018) + 'shildi ✅", cafePanelMenu());';
console.log('\n\nSearching for:', JSON.stringify(searchStr1));
if (c.includes(searchStr1)) {
  console.log('FOUND!');
}
