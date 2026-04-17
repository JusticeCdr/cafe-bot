const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function initDB() {
  console.log("Postgres ulanmoqda...");

  // CAFES
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cafes (
      id SERIAL PRIMARY KEY,
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
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      activated_at TIMESTAMP,
      paid_until TIMESTAMP,
      is_visible INTEGER DEFAULT 1,
      card_name TEXT,
      card_number TEXT,
      bank_name TEXT,
      card_qr_id TEXT,
      type TEXT DEFAULT 'cafe',
      tariff_type TEXT DEFAULT 'subscription',
      commission_percent INTEGER DEFAULT 0,
      balance INTEGER DEFAULT 0,
      is_deleted INTEGER DEFAULT 0,
      owner_telegram_id TEXT
    )
  `);

  // PRODUCTS
  await pool.query(`
    CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY,
      cafe_id INTEGER,
      name TEXT,
      price INTEGER,
      description TEXT,
      image_file_id TEXT,
      category TEXT,
      subcategory TEXT,
      variants TEXT,
      available INTEGER DEFAULT 1,
      discount INTEGER DEFAULT 0,
      bestseller INTEGER DEFAULT 0
    )
  `);

  // COURIERS
  await pool.query(`
    CREATE TABLE IF NOT EXISTS couriers (
      id SERIAL PRIMARY KEY,
      cafe_id INTEGER,
      name TEXT,
      phone TEXT,
      telegram TEXT,
      telegram_id TEXT,
      login TEXT,
      password TEXT,
      is_online INTEGER DEFAULT 0,
      transport_type TEXT DEFAULT 'auto',
      car_model TEXT,
      car_number TEXT
    )
  `);

  // CATEGORIES
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cafe_categories (
      id SERIAL PRIMARY KEY,
      cafe_id INTEGER,
      category_name TEXT
    )
  `);

  // ORDERS
  await pool.query(`
    CREATE TABLE IF NOT EXISTS orders (
      id SERIAL PRIMARY KEY,
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
      payment_type TEXT,
      payment_photo_id TEXT,
      payment_status TEXT DEFAULT 'unpaid',
      commission_charged INTEGER DEFAULT 0,
      group_main_msg_id TEXT,
      messages_json TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  console.log("Postgres DB tayyor ✅");
}

initDB();

module.exports = pool;