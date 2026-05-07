const sqlite3 = require("sqlite3").verbose();

const db = new sqlite3.Database("./database.sqlite", (err) => {
  if (err) console.error("DB xato:", err);
});

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS cafes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      about TEXT,
      phone TEXT,
      instagram TEXT,
      menu_url TEXT,
      location_text TEXT,
      latitude REAL,
      longitude REAL,
      image_file_id TEXT,
      open_time TEXT,
      close_time TEXT,
      is_open INTEGER DEFAULT 1,
      manual_frozen INTEGER DEFAULT 0,
      admin_login TEXT,
      admin_password TEXT,
      order_group_id TEXT,
      delivery_price INTEGER DEFAULT 0,
      table_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      activated_at DATETIME,
      paid_until DATETIME
    )
  `);

  db.run(
    `ALTER TABLE cafes ADD COLUMN table_count INTEGER DEFAULT 0`,
    () => {},
  );

  db.run(
    `ALTER TABLE cafes ADD COLUMN type TEXT DEFAULT 'cafe'`,
    () => {},
  );

  db.run(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cafe_id INTEGER,
      name TEXT,
      price INTEGER,
      description TEXT,
      image_file_id TEXT,
      category TEXT,
      available INTEGER DEFAULT 1
    )
  `);

  db.run(`
  CREATE TABLE IF NOT EXISTS couriers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cafe_id INTEGER,
    name TEXT,
    phone TEXT,
    telegram TEXT,
    telegram_id TEXT,
    car_model TEXT,
    car_number TEXT
  )
`);

  db.run(`
    CREATE TABLE IF NOT EXISTS cafe_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cafe_id INTEGER,
      category_name TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      telegram_id TEXT PRIMARY KEY,
      username TEXT,
      first_name TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);



  db.all(`PRAGMA table_info(couriers)`, [], (err, rows) => {
    if (err) return console.error("PRAGMA xato:", err);

    const hasTelegramId = rows.some((col) => col.name === "telegram_id");
    const hasLogin = rows.some((col) => col.name === "login");
    const hasPassword = rows.some((col) => col.name === "password");
    const hasIsOnline = rows.some((col) => col.name === "is_online");
    const hasTransportType = rows.some((col) => col.name === "transport_type");

    if (!hasTelegramId) {
      db.run(`ALTER TABLE couriers ADD COLUMN telegram_id TEXT`, () => {});
    }
    if (!hasLogin) {
      db.run(`ALTER TABLE couriers ADD COLUMN login TEXT`, () => {});
    }
    if (!hasPassword) {
      db.run(`ALTER TABLE couriers ADD COLUMN password TEXT`, () => {});
    }
    if (!hasIsOnline) {
      db.run(`ALTER TABLE couriers ADD COLUMN is_online INTEGER DEFAULT 0`, () => {});
    }
    if (!hasTransportType) {
      db.run(`ALTER TABLE couriers ADD COLUMN transport_type TEXT DEFAULT 'auto'`, () => {});
    }
  });

  db.all(`PRAGMA table_info(cafes)`, [], (err, rows) => {
    if (err) return console.error("PRAGMA xato cafes:", err);

    const checkCol = (colName, def) => {
      if (!rows.some((col) => col.name === colName)) {
        db.run(`ALTER TABLE cafes ADD COLUMN ${colName} ${def}`, () => {});
      }
    };
    checkCol("open_time", "TEXT");
    checkCol("close_time", "TEXT");
    checkCol("working_hours_mode", "TEXT DEFAULT 'custom'");
    checkCol("is_open", "INTEGER DEFAULT 1");
    checkCol("manual_open_override", "INTEGER DEFAULT 0");
    checkCol("manual_closed", "INTEGER DEFAULT 0");
    checkCol("is_visible", "INTEGER DEFAULT 1");
    checkCol("card_name", "TEXT");
    checkCol("card_number", "TEXT");
    checkCol("bank_name", "TEXT");
    checkCol("card_qr_id", "TEXT");
    // === BUSINESS ENGINE: new columns ===
    checkCol("type", "TEXT DEFAULT 'cafe'");                        // cafe / restaurant
    checkCol("tariff_type", "TEXT DEFAULT 'subscription'");          // subscription / commission
    checkCol("commission_percent", "INTEGER DEFAULT 0");             // e.g. 5 = 5%
    checkCol("balance", "INTEGER DEFAULT 0");                        // current balance in so'm
    checkCol("is_deleted", "INTEGER DEFAULT 0");                     // soft delete
    checkCol("owner_telegram_id", "TEXT");                           // owner's Telegram ID for notifications

    // === CASHBACK/BONUS SYSTEM ===
    checkCol("cashback_enabled", "INTEGER DEFAULT 0");
    checkCol("cashback_percent", "INTEGER DEFAULT 3");
    checkCol("max_bonus_use_percent", "INTEGER DEFAULT 30");
    checkCol("min_order_for_cashback", "INTEGER DEFAULT 50000");
  });

  db.all(`PRAGMA table_info(orders)`, [], (err, rows) => {
    if (err) return console.error("PRAGMA xato:", err);

    const hasGroupMainMsgId = rows.some((col) => col.name === "group_main_msg_id");
    const hasMessagesJson = rows.some((col) => col.name === "messages_json");

    if (!hasGroupMainMsgId) {
      db.run(`ALTER TABLE orders ADD COLUMN group_main_msg_id TEXT`, () => {});
    }
    if (!hasMessagesJson) {
      db.run(`ALTER TABLE orders ADD COLUMN messages_json TEXT`, () => {});
    }

    const checkCol = (colName, def) => {
      if (!rows.some((col) => col.name === colName)) {
        db.run(`ALTER TABLE orders ADD COLUMN ${colName} ${def}`, () => {});
      }
    };
    checkCol("payment_type", "TEXT");
    checkCol("payment_photo_id", "TEXT");
    checkCol("payment_status", "TEXT DEFAULT 'unpaid'");
    checkCol("commission_charged", "INTEGER DEFAULT 0"); // commission deducted from cafe balance

    // === DELIVERY INFO ===
    checkCol("delivery_distance_km", "REAL");
    checkCol("latitude", "REAL");
    checkCol("longitude", "REAL");

    // === CASHBACK/BONUS SYSTEM ===
    checkCol("bonus_used", "INTEGER DEFAULT 0");
    checkCol("cash_amount", "INTEGER DEFAULT 0");
    checkCol("online_amount", "INTEGER DEFAULT 0");
    checkCol("final_total", "INTEGER DEFAULT 0");
    checkCol("cashback_earned", "INTEGER DEFAULT 0");
    checkCol("cashback_given", "INTEGER DEFAULT 0");
    
    // === CANCEL LOGIC ===
    checkCol("canceled_at", "TEXT");
    checkCol("canceled_by", "TEXT");
    checkCol("cancel_reason", "TEXT");
    checkCol("bonus_refunded", "INTEGER DEFAULT 0");
  });

  db.all(`PRAGMA table_info(products)`, [], (err, rows) => {
    if (err) return console.error("PRAGMA xato products:", err);

    const hasSubcategory = rows.some((col) => col.name === "subcategory");
    const hasVariants = rows.some((col) => col.name === "variants");

    if (!hasSubcategory) {
      db.run(`ALTER TABLE products ADD COLUMN subcategory TEXT`, () => {});
    }
    if (!hasVariants) {
      db.run(`ALTER TABLE products ADD COLUMN variants TEXT`, () => {});
    }

    const checkCol = (colName, def) => {
      if (!rows.some((col) => col.name === colName)) {
        db.run(`ALTER TABLE products ADD COLUMN ${colName} ${def}`, () => {});
      }
    };
    checkCol("discount", "INTEGER DEFAULT 0");
    checkCol("discount_percent", "INTEGER DEFAULT 0");
    checkCol("bestseller", "INTEGER DEFAULT 0");

    // REMOVED: was incorrectly overwriting valid categories (Milliy taomlar, Desert, Ichimliklar, Aksiya) to 'Boshqalar'

    // One-time fix: clear default 'Boshqalar' subcategory that was auto-assigned
    db.run(`UPDATE products SET subcategory = NULL WHERE subcategory = 'Boshqalar'`, () => {});
  });


  db.run(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cafe_id INTEGER,
      user_id TEXT,
      username TEXT,
      customer_name TEXT,
      customer_phone TEXT,
      customer_telegram TEXT,
      order_type TEXT,
      address TEXT,
      note TEXT,
      latitude REAL,
      longitude REAL,
      table_number TEXT,
      items_json TEXT,
      total INTEGER DEFAULT 0,
      delivery_price INTEGER DEFAULT 0,
      status TEXT DEFAULT 'new',
      eta_minutes INTEGER,
      courier_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS customer_bonus (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id TEXT NOT NULL,
      cafe_id INTEGER NOT NULL,
      phone TEXT,
      bonus_balance INTEGER DEFAULT 0,
      total_spent INTEGER DEFAULT 0,
      total_orders INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_bonus_user_cafe ON customer_bonus(telegram_id, cafe_id)`);

  db.run(`
    CREATE TABLE IF NOT EXISTS bonus_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id TEXT NOT NULL,
      cafe_id INTEGER NOT NULL,
      order_id INTEGER,
      type TEXT NOT NULL,
      amount INTEGER NOT NULL,
      balance_after INTEGER DEFAULT 0,
      note TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
});

// === CASHBACK/BONUS SYSTEM HELPER FUNCTIONS ===

db.getCustomerBonus = function(telegramId, cafeId) {
  return new Promise((resolve) => {
    try {
      db.get(`SELECT * FROM customer_bonus WHERE telegram_id = ? AND cafe_id = ?`, [telegramId, cafeId], (err, row) => {
        if (err) {
          console.error("getCustomerBonus error:", err);
          return resolve({ bonus_balance: 0 }); // safe fallback
        }
        if (row) {
          return resolve(row);
        }
        // create new row if not exists
        db.run(
          `INSERT INTO customer_bonus (telegram_id, cafe_id, bonus_balance) VALUES (?, ?, 0)`, 
          [telegramId, cafeId], 
          function(insertErr) {
            if (insertErr) {
              console.error("getCustomerBonus insert error:", insertErr);
              return resolve({ bonus_balance: 0 });
            }
            db.get(`SELECT * FROM customer_bonus WHERE id = ?`, [this.lastID], (err2, newRow) => {
               if (err2) {
                 console.error("getCustomerBonus get after insert error:", err2);
                 return resolve({ bonus_balance: 0 });
               }
               resolve(newRow || { bonus_balance: 0 });
            });
        });
      });
    } catch (e) {
      console.error("getCustomerBonus exception:", e);
      resolve({ bonus_balance: 0 });
    }
  });
};

db.getBonusBalance = async function(telegramId, cafeId) {
  try {
    const row = await db.getCustomerBonus(telegramId, cafeId);
    return row && row.bonus_balance ? row.bonus_balance : 0;
  } catch (e) {
    console.error("getBonusBalance error:", e);
    return 0;
  }
};

db.addBonus = function({ telegramId, cafeId, orderId, amount, type, note }) {
  return new Promise(async (resolve) => {
    try {
      amount = parseInt(amount) || 0;
      if (amount <= 0) return resolve(await db.getBonusBalance(telegramId, cafeId));
      
      const row = await db.getCustomerBonus(telegramId, cafeId);
      const newBalance = (row.bonus_balance || 0) + amount;
      
      db.run(
        `UPDATE customer_bonus SET bonus_balance = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [newBalance, row.id],
        (err) => {
          if (err) {
            console.error("addBonus update error:", err);
            return resolve(row.bonus_balance);
          }
          db.run(
            `INSERT INTO bonus_transactions (telegram_id, cafe_id, order_id, type, amount, balance_after, note) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [telegramId, cafeId, orderId || null, type || 'earn', amount, newBalance, note || ''],
            (err2) => {
              if (err2) console.error("addBonus transaction log error:", err2);
              resolve(newBalance);
            }
          );
        }
      );
    } catch (e) {
      console.error("addBonus exception:", e);
      resolve(0);
    }
  });
};

db.useBonus = function({ telegramId, cafeId, orderId, amount, note }) {
  return new Promise(async (resolve) => {
    try {
      amount = parseInt(amount) || 0;
      if (amount <= 0) return resolve(await db.getBonusBalance(telegramId, cafeId));
      
      const row = await db.getCustomerBonus(telegramId, cafeId);
      let currentBalance = row.bonus_balance || 0;
      
      if (currentBalance < amount) {
         console.warn(`useBonus: not enough balance (${currentBalance} < ${amount})`);
         return resolve(currentBalance); // safely return current balance if not enough
      }
      
      const newBalance = currentBalance - amount;
      
      db.run(
        `UPDATE customer_bonus SET bonus_balance = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [newBalance, row.id],
        (err) => {
          if (err) {
            console.error("useBonus update error:", err);
            return resolve(currentBalance);
          }
          db.run(
            `INSERT INTO bonus_transactions (telegram_id, cafe_id, order_id, type, amount, balance_after, note) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [telegramId, cafeId, orderId || null, 'use', amount, newBalance, note || ''],
            (err2) => {
              if (err2) console.error("useBonus transaction log error:", err2);
              resolve(newBalance);
            }
          );
        }
      );
    } catch (e) {
      console.error("useBonus exception:", e);
      resolve(0);
    }
  });
};

db.refundBonus = function({ telegramId, cafeId, orderId, amount, note }) {
  return new Promise(async (resolve) => {
    try {
      amount = parseInt(amount) || 0;
      if (amount <= 0) return resolve(await db.getBonusBalance(telegramId, cafeId));
      
      const row = await db.getCustomerBonus(telegramId, cafeId);
      const newBalance = (row.bonus_balance || 0) + amount;
      
      db.run(
        `UPDATE customer_bonus SET bonus_balance = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [newBalance, row.id],
        (err) => {
          if (err) {
            console.error("refundBonus update error:", err);
            return resolve(row.bonus_balance);
          }
          db.run(
            `INSERT INTO bonus_transactions (telegram_id, cafe_id, order_id, type, amount, balance_after, note) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [telegramId, cafeId, orderId || null, 'refund', amount, newBalance, note || 'Refund from cancelled/modified order'],
            (err2) => {
              if (err2) console.error("refundBonus transaction log error:", err2);
              resolve(newBalance);
            }
          );
        }
      );
    } catch (e) {
      console.error("refundBonus exception:", e);
      resolve(0);
    }
  });
};

db.calculateCashback = function({ finalTotal, cashbackPercent, minOrderForCashback }) {
  try {
    if (!finalTotal || !cashbackPercent) return 0;
    if (minOrderForCashback && finalTotal < minOrderForCashback) return 0;
    
    return Math.floor(finalTotal * cashbackPercent / 100);
  } catch (e) {
    console.error("calculateCashback exception:", e);
    return 0;
  }
};

db.calculateMaxBonusUse = function({ orderTotal, maxBonusUsePercent, currentBonusBalance }) {
  try {
    if (!orderTotal || !maxBonusUsePercent) return 0;
    
    const maxByPercent = Math.floor(orderTotal * maxBonusUsePercent / 100);
    const maxToUse = Math.min(maxByPercent, currentBonusBalance || 0);
    
    return Math.max(0, maxToUse); // Prevent negative values
  } catch (e) {
    console.error("calculateMaxBonusUse exception:", e);
    return 0;
  }
};

module.exports = db;
