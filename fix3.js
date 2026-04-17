const fs = require('fs');
let c = fs.readFileSync('bot.js', 'utf8');

let out = "";
let inDq = false;
let escape = false;
for (let i = 0; i < c.length; i++) {
  let char = c[i];
  if (inDq) {
    if (escape) {
      out += char;
      escape = false;
    } else if (char === '\\') {
      out += char;
      escape = true;
    } else if (char === '"') {
      out += char;
      inDq = false;
    } else if (char === '\\n') {
      out += char;
    } else if (char === '\n') {
      out += '\\n'; 
    } else {
      out += char;
    }
  } else {
     if (char === '"') {
        inDq = true;
        out += char;
     } else {
        out += char;
     }
  }
}
fs.writeFileSync('bot.js', out);
