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
});

module.exports = db;
