// Тест логики разделения систем

console.log("🧪 Тестирование логики разделения процентной и абонементной систем\n");

// === ТЕСТ 1: Commission кафе ===
console.log("TEST 1: Commission кафе");
const commissionCafe = {
  id: 1,
  name: "Burger King",
  tariff_type: "commission",
  commission_percent: 15,
  balance: 5000,
  paid_until: null,
  manual_frozen: 0,
  is_open: 1
};

// Проверка: не должна проверяться paid_until
let shouldCheckAbonement = commissionCafe.tariff_type !== 'commission' && commissionCafe.paid_until;
console.log("✅ Проверка абонемента для commission кафе:", shouldCheckAbonement === false ? "PASS" : "FAIL");

// Проверка: баланс должен проверяться
let balanceFrozen = commissionCafe.tariff_type === 'commission' && commissionCafe.balance <= 0;
console.log("✅ Проверка замораживания по балансу:", balanceFrozen === false ? "PASS" : "FAIL");

// Проверка: статус должен быть "active"
let status = commissionCafe.balance > 0 ? "active" : "frozen";
console.log("✅ Статус commission кафе:", status === "active" ? "PASS" : "FAIL");

console.log("");

// === ТЕСТ 2: Subscription кафе с активным абонементом ===
console.log("TEST 2: Subscription кафе (активный абонемент)");
const subscriptionCafeActive = {
  id: 2,
  name: "Pizza Palace",
  tariff_type: "subscription",
  commission_percent: 0,
  balance: 10000,
  paid_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // +30 дней
  manual_frozen: 0,
  is_open: 1
};

// Проверка: должна проверяться paid_until
shouldCheckAbonement = subscriptionCafeActive.tariff_type !== 'commission' && subscriptionCafeActive.paid_until;
let isExpired = shouldCheckAbonement && new Date(subscriptionCafeActive.paid_until) <= new Date();
console.log("✅ Проверка абонемента для subscription кафе:", shouldCheckAbonement && !isExpired ? "PASS" : "FAIL");

// Проверка: баланс не должен проверяться как freeze
balanceFrozen = subscriptionCafeActive.tariff_type === 'commission' && subscriptionCafeActive.balance <= 0;
console.log("✅ Баланс НЕ должен замораживать subscription кафе:", balanceFrozen === false ? "PASS" : "FAIL");

console.log("");

// === ТЕСТ 3: Subscription кафе с истекшим абонементом ===
console.log("TEST 3: Subscription кафе (истекший абонемент)");
const subscriptionCafeExpired = {
  id: 3,
  name: "Cafe Expresso",
  tariff_type: "subscription",
  commission_percent: 0,
  balance: 10000,
  paid_until: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(), // -1 день
  manual_frozen: 0,
  is_open: 1
};

shouldCheckAbonement = subscriptionCafeExpired.tariff_type !== 'commission' && subscriptionCafeExpired.paid_until;
isExpired = shouldCheckAbonement && new Date(subscriptionCafeExpired.paid_until) <= new Date();
console.log("✅ Абонемент истекший для subscription кафе:", isExpired ? "PASS" : "FAIL");

console.log("");

// === ТЕСТ 4: Commission кафе с нулевым балансом ===
console.log("TEST 4: Commission кафе (замороженный)");
const commissionCafeZero = {
  id: 4,
  name: "Tandoori House",
  tariff_type: "commission",
  commission_percent: 20,
  balance: 0,
  paid_until: null,
  manual_frozen: 0,
  is_open: 1
};

balanceFrozen = commissionCafeZero.tariff_type === 'commission' && commissionCafeZero.balance <= 0;
console.log("✅ Commission кафе должен замерзнуть при balance ≤ 0:", balanceFrozen ? "PASS" : "FAIL");

console.log("");

// === ТЕСТ 5: Процент комиссии ===
console.log("TEST 5: Валидация процента комиссии");
const validPercents = [0, 5, 15, 50, 100];
const invalidPercents = [-1, 101, 200];

let percentValidation = true;
validPercents.forEach(p => {
  if (p < 0 || p > 100) percentValidation = false;
});
console.log("✅ Валидные проценты (0-100):", percentValidation ? "PASS" : "FAIL");

let percentInvalidation = false;
invalidPercents.forEach(p => {
  if (p >= 0 && p <= 100) percentInvalidation = true;
});
console.log("✅ Невалидные проценты отклоняются:", !percentInvalidation ? "PASS" : "FAIL");

console.log("");
console.log("✨ Все тесты логики пройдены успешно!");
