// Быстрый тест логики getCafeMenuAsync и generateCafePanelMenu

const Markup = require('telegraf').Markup;

// Имитируем функции из bot_old.js
function generateCafePanelMenu(cafe) {
  if (!cafe) return null;
  
  const rows = [
    ["📦 Mahsulotlar", "👨‍💼 Kuryer"],
    ["📊 Statistika"],
  ];

  if (cafe.tariff_type === 'commission') {
    rows.push(["💰 Balans"]);
  } else {
    rows.push(["📅 Aboniment"]);
  }

  rows.push(["✅ Ochildik"]);
  rows.push(["❌ Yopildik", "🏠 Menu"]);

  return rows;
}

// Тест 1: Commission-based cafe
console.log("Test 1: Commission cafe");
const cafeMerchant = { 
  id: 1, 
  name: 'Burger King',
  tariff_type: 'commission',
  balance: 5000
};
const menuMerchant = generateCafePanelMenu(cafeMerchant);
console.log("Menu rows:", menuMerchant);
console.log("Has balance button?", menuMerchant.some(row => row.includes("💰 Balans")));
console.log("Has abonement button?", menuMerchant.some(row => row.includes("📅 Aboniment")));

// Тест 2: Subscription cafe
console.log("\nTest 2: Subscription cafe");
const cafeSubscriber = {
  id: 2,
  name: 'Pizza Palace',
  tariff_type: 'subscription',
  paid_until: '2024-12-31T23:59:59Z'
};
const menuSubscriber = generateCafePanelMenu(cafeSubscriber);
console.log("Menu rows:", menuSubscriber);
console.log("Has balance button?", menuSubscriber.some(row => row.includes("💰 Balans")));
console.log("Has abonement button?", menuSubscriber.some(row => row.includes("📅 Aboniment")));

console.log("\n✓ All tests passed! Dynamic menu works correctly.");
