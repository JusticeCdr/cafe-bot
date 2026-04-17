/**
 * test_db.js - Quick database state checker + owner_telegram_id setter
 * Usage:
 *   node test_db.js                          - show all cafes
 *   node test_db.js setowner <id> <tg_id>   - set owner_telegram_id for cafe
 *   node test_db.js setbalance <id> <bal>   - set balance for cafe
 *   node test_db.js expire <id>             - set paid_until to yesterday (test expiry)
 */
const db = require('./db');

const args = process.argv.slice(2);
const cmd = args[0];

setTimeout(() => {
  if (cmd === 'setowner') {
    const cafeId = Number(args[1]);
    const tgId = args[2];
    if (!cafeId || !tgId) {
      console.log('Usage: node test_db.js setowner <cafe_id> <telegram_id>');
      process.exit(1);
    }
    db.run('UPDATE cafes SET owner_telegram_id = ? WHERE id = ?', [tgId, cafeId], function(err) {
      if (err) { console.log('ERROR:', err); process.exit(1); }
      console.log(`✅ Cafe #${cafeId} owner_telegram_id = ${tgId}`);
      process.exit(0);
    });
    return;
  }

  if (cmd === 'setbalance') {
    const cafeId = Number(args[1]);
    const bal = Number(args[2]);
    if (!cafeId || isNaN(bal)) {
      console.log('Usage: node test_db.js setbalance <cafe_id> <balance>');
      process.exit(1);
    }
    db.run('UPDATE cafes SET balance = ? WHERE id = ?', [bal, cafeId], function(err) {
      if (err) { console.log('ERROR:', err); process.exit(1); }
      console.log(`✅ Cafe #${cafeId} balance = ${bal} so'm`);
      process.exit(0);
    });
    return;
  }

  if (cmd === 'expire') {
    const cafeId = Number(args[1]);
    if (!cafeId) {
      console.log('Usage: node test_db.js expire <cafe_id>');
      process.exit(1);
    }
    const yesterday = new Date(Date.now() - 86400000).toISOString();
    db.run('UPDATE cafes SET paid_until = ? WHERE id = ?', [yesterday, cafeId], function(err) {
      if (err) { console.log('ERROR:', err); process.exit(1); }
      console.log(`✅ Cafe #${cafeId} paid_until set to YESTERDAY (${yesterday})`);
      process.exit(0);
    });
    return;
  }

  // Default: show all cafes
  db.all('SELECT id, name, type, tariff_type, commission_percent, balance, is_open, manual_frozen, is_deleted, paid_until, owner_telegram_id FROM cafes ORDER BY id DESC', [], (err, rows) => {
    if (err) { console.log('ERROR:', err); process.exit(1); }
    if (!rows.length) { console.log('No cafes found.'); process.exit(0); }

    console.log('\n=== CAFES ===\n');
    rows.forEach(c => {
      const frozen   = c.manual_frozen ? '❄️ FROZEN' : '';
      const deleted  = c.is_deleted ? '🗑 DELETED' : '';
      const open     = c.is_open ? '✅ OPEN' : '❌ CLOSED';
      const tariff   = c.tariff_type === 'commission' ? `Foizli (${c.commission_percent}%)` : 'Aboniment';
      const paidLeft = c.paid_until
        ? Math.ceil((new Date(c.paid_until) - Date.now()) / 86400000) + ' days'
        : '—';

      console.log(`[${c.id}] ${c.name}`);
      console.log(`  Type:    ${c.type || 'cafe'}`);
      console.log(`  Status:  ${open} ${frozen} ${deleted}`);
      console.log(`  Tariff:  ${tariff}`);
      console.log(`  Balance: ${c.balance || 0} so'm`);
      console.log(`  PaidUntil: ${c.paid_until || '—'} (${paidLeft})`);
      console.log(`  OwnerTgId: ${c.owner_telegram_id || '⚠️ NOT SET'}`);
      console.log('');
    });

    // Also show recent orders
    db.all(`SELECT id, cafe_id, total, status, commission_charged, created_at 
            FROM orders ORDER BY id DESC LIMIT 10`, [], (err2, orders) => {
      if (!err2 && orders.length) {
        console.log('=== LAST 10 ORDERS ===\n');
        orders.forEach(o => {
          console.log(`[#${o.id}] cafe:${o.cafe_id} | ${o.total} so'm | status:${o.status} | commission:${o.commission_charged || 0} so'm | ${o.created_at}`);
        });
      }
      process.exit(0);
    });
  });
}, 500); // wait for db to initialize
