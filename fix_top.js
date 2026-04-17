const fs = require('fs');
let content = fs.readFileSync('bot.js', 'utf8');

// The file got pasted with a bunch of things at the very beginning!
// Lines 2 to 58 contain `bot.action(...)` and `if (text === "🏪 Cafelar")`.
// This is exactly what broke `Cannot access 'bot' before initialization`!

// We will split by lines, extract those specific lines, and inject them where they belong.
let lines = content.split('\n');

// The corrupted block is from index 1 to index 57 included. 
// Let's grab those lines.
let brokenLines = lines.slice(1, 58);

// Inside brokenLines, we have:
// 1. bot.action(/verify_yes_(\d+)/...)
// 2. bot.action(/verify_no_(\d+)/...)
// 3. if (text === "🏪 Cafelar") { ... }

// We need to remove them from the top.
lines.splice(1, 58); // Remove from index 1 (meaning we keep line 0, which is probably empty)

// Now, we need to inject the `bot.action` callbacks before `bot.launch();` or just at the end of the file.
// Or we can just concatenate them at the very end.
let verifyActions = brokenLines.slice(0, 37); // from index 0 to 36 inclusive are the two actions

// Wait, the action handlers are best placed before process.on("uncaughtException"). 
let launchIdx = lines.findIndex(l => l.includes('function finalizeOrder'));
if (launchIdx === -1) launchIdx = lines.length; // fallback
lines.splice(launchIdx, 0, ...verifyActions);

// Now for `🏪 Cafelar` logic. This should be put inside `bot.on("text", async (ctx) => {`.
// Let's find `bot.on("text"`
let textIdx = lines.findIndex(l => l.includes('bot.on("text"'));
if (textIdx > -1) {
   let cafeCode = brokenLines.slice(37); // lines 37 to end of broken block
   // We will splice it right after `bot.on("text", async (ctx) => {` and `const text = ctx.message.text;`
   lines.splice(textIdx + 4, 0, ...cafeCode);
} else {
   console.log("Could not find bot.on text!!");
}

fs.writeFileSync('bot.js', lines.join('\n'));
console.log("bot.js patched.");
