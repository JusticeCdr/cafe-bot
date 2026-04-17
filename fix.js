const fs=require('fs');
let c = fs.readFileSync('bot.js','utf8');
c = c.replace(/"\n\n✅/g, '"\\n\\n✅').replace(/"\n\n❌/g, '"\\n\\n❌').replace(/\+ "\n\n/g, '+ "\\n\\n');
let lines = c.split('\n');
c = lines.map(line => {
   if(line.includes("ctx.callbackQuery.message.caption + ")) return line.replace(/\n$/, "\\n");
   return line;
}).join('\n');
fs.writeFileSync('bot.js', c);
