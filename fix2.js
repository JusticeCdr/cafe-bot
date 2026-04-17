const fs = require('fs');
let c = fs.readFileSync('bot.js', 'utf8');

// Find every unclosed double quote that contains literal newlines within it before the closing quote
let fixed = '';
let inString = false;
let escape = false;

for (let i = 0; i < c.length; i++) {
  let char = c[i];
  
  if (inString) {
    if (char === '\\') {
       escape = !escape;
       fixed += char;
    } else if (char === '"' && !escape) {
       inString = false;
       fixed += char;
       escape = false;
    } else if (char === '\\n') {
       fixed += '\\n'; 
       escape = false;
    } else {
       fixed += char;
       escape = false;
    }
  } else {
    if (char === '"' && !escape) {
       inString = true;
       fixed += char;
    } else {
       fixed += char;
    }
  }
}

// Alternatively, simpler hack since there's specifically .join(" \n ") and caption + "\n"
c = c.replace(/join\("\\n"\)/g, 'join("\\n")'); 
c = c.replace(/join\("\n"\)/g, 'join("\\n")'); 
c = c.replace(/\+ "\n/g, '+ "\\n');
c = c.replace(/caption \+ "\n/g, 'caption + "\\n');

fs.writeFileSync('bot.js', c);
console.log("Applied simple fixes");
