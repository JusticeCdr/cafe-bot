const fs = require('fs');

let content = fs.readFileSync('bot_old.js', 'utf8');

// Ищем вхождения с неправильной кодировкой - просто replaceAll cafePanelMenu() на getCafeMenuAsync
// Сначала заменим все simpleBackMenu(), затем остальное

// Стратегия: заменить везде, где есть ctx.reply и cafePanelMenu, на async версию

// 1. Пока оставим как есть для этих конкретных мест, поскольку grep показал что они есть

// Давайте просто заменять по счётчикам вхождений
let matches = [];
let search = 'cafePanelMenu()';
let idx = content.indexOf(search);
while (idx >= 0) {
  // Проверим контекст - это должна быть строка с ctx.reply
  let start = idx;
  while (start > 0 && content[start] !== '\n') start--;
  let end = idx + search.length;
  while (end < content.length && content[end] !== '\n') end++;
  
  let line = content.substring(start, end);
  matches.push({
    index: idx,
    line: line.trim()
  });
  
  idx = content.indexOf(search, idx + 1);
}

console.log(`Found ${matches.length} occurrences of cafePanelMenu():`);
matches.forEach((m, i) => {
  if (m.line.includes('ctx.reply') || m.line.includes('cafePanelMenu(),')) {
    console.log(`${i+1}. ${m.line.substring(0, 70)}...`);
  }
});
