const initSqlJs = require('sql.js');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '..', 'shop.db');

let db = null;

// Save database to file
function saveDb() {
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  }
}

// Auto-save every 5 seconds
setInterval(saveDb, 5000);

// Initialize database
async function initDb() {
  const SQL = await initSqlJs();

  // Load existing database or create new one
  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  // Enable foreign keys
  db.run('PRAGMA foreign_keys = ON');

  // Create tables
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT CHECK(role IN ('owner','admin','staff')) NOT NULL,
      phone TEXT,
      active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      code TEXT UNIQUE,
      category_id INTEGER REFERENCES categories(id),
      purchase_price REAL NOT NULL,
      selling_price REAL NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 0,
      unit TEXT DEFAULT 'pcs',
      min_stock INTEGER DEFAULT 10,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT,
      city TEXT,
      address TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS bills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bill_number TEXT UNIQUE NOT NULL,
      customer_id INTEGER REFERENCES customers(id),
      customer_name TEXT,
      customer_phone TEXT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      staff_name TEXT,
      subtotal REAL NOT NULL,
      discount REAL DEFAULT 0,
      gst_percent REAL DEFAULT 0,
      gst_amount REAL DEFAULT 0,
      total REAL NOT NULL,
      payment_method TEXT DEFAULT 'cash',
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS bill_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bill_id INTEGER NOT NULL REFERENCES bills(id),
      product_id INTEGER NOT NULL REFERENCES products(id),
      product_name TEXT NOT NULL,
      product_code TEXT,
      quantity INTEGER NOT NULL,
      unit TEXT DEFAULT 'pcs',
      unit_price REAL NOT NULL,
      total REAL NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      amount REAL NOT NULL,
      category TEXT,
      date DATE DEFAULT CURRENT_DATE,
      user_id INTEGER REFERENCES users(id),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS stock_alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER REFERENCES products(id),
      product_name TEXT,
      phone TEXT NOT NULL,
      message TEXT,
      sent_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Seed default owner account if not exists
  const ownerCheck = db.exec("SELECT id FROM users WHERE role = 'owner'");
  if (ownerCheck.length === 0 || ownerCheck[0].values.length === 0) {
    const hashedPassword = bcrypt.hashSync('owner123', 10);
    db.run(
      "INSERT INTO users (name, username, password, role, phone) VALUES (?, ?, ?, ?, ?)",
      ['Shop Owner', 'owner', hashedPassword, 'owner', '9876543210']
    );
    console.log('✅ Default owner account created (username: owner, password: owner123)');
  }

  // Seed default categories if empty
  const catCheck = db.exec("SELECT COUNT(*) as count FROM categories");
  if (catCheck[0].values[0][0] === 0) {
    const categories = [
      'Wires & Cables', 'Switches & Sockets', 'MCB & Distribution Boards',
      'Fans & Motors', 'LED Lights & Bulbs', 'Conduits & Pipes',
      'Tools & Accessories', 'Inverters & Batteries', 'Meters & Testers',
      'Connectors & Terminals', 'Transformers', 'Other'
    ];
    categories.forEach(cat => db.run('INSERT INTO categories (name) VALUES (?)', [cat]));
    console.log('✅ Default categories seeded');
  }

  // Seed sample products if empty
  const prodCheck = db.exec("SELECT COUNT(*) as count FROM products");
  if (prodCheck[0].values[0][0] === 0) {
    const sampleProducts = [
      ['Havells Wire 1.5 sqmm Red', 'HW15R', 1, 1200, 1450, 25, 'coil'],
      ['Havells Wire 2.5 sqmm Blue', 'HW25B', 1, 1800, 2100, 15, 'coil'],
      ['Anchor Roma Switch 6A', 'ARS6A', 2, 35, 55, 100, 'pcs'],
      ['Anchor Roma Socket 16A', 'ARK16', 2, 65, 95, 50, 'pcs'],
      ['Havells MCB 16A SP', 'HMC16', 3, 120, 185, 30, 'pcs'],
      ['Havells MCB 32A DP', 'HMC32', 3, 350, 480, 8, 'pcs'],
      ['Orient Ceiling Fan', 'OCF01', 4, 1100, 1500, 5, 'pcs'],
      ['Philips 9W LED Bulb', 'PL9W', 5, 65, 110, 200, 'pcs'],
      ['Syska 15W LED Bulb', 'SL15W', 5, 90, 150, 120, 'pcs'],
      ['20mm PVC Conduit Pipe', 'PVC20', 6, 25, 40, 500, 'pcs'],
      ['Electrical Tape Black', 'ETB01', 7, 12, 25, 300, 'pcs'],
      ['Luminous Inverter 900VA', 'LI900', 8, 4500, 5800, 3, 'pcs'],
      ['Digital Multimeter', 'DMM01', 9, 350, 550, 7, 'pcs'],
      ['Wire Connector 2-way', 'WC2W', 10, 5, 12, 500, 'pcs'],
      ['LED Panel Light 18W Square', 'LP18S', 5, 220, 380, 40, 'pcs'],
    ];
    sampleProducts.forEach(p => {
      db.run(
        'INSERT INTO products (name, code, category_id, purchase_price, selling_price, quantity, unit) VALUES (?, ?, ?, ?, ?, ?, ?)',
        p
      );
    });
    console.log('✅ Sample products seeded');
  }

  saveDb();
  return db;
}

// Helper functions to make sql.js work like better-sqlite3 API
// These wrap sql.js to provide a synchronous-looking API that our routes use

class DbWrapper {
  constructor() {
    this._db = null;
    this._ready = initDb().then(database => {
      this._db = database;
      return this;
    });
  }

  async waitReady() {
    await this._ready;
    return this;
  }

  prepare(sql) {
    const self = this;
    return {
      get(...params) {
        try {
          const stmt = self._db.prepare(sql);
          if (params.length) stmt.bind(params);
          if (stmt.step()) {
            const row = stmt.getAsObject();
            stmt.free();
            return row;
          }
          stmt.free();
          return undefined;
        } catch (err) {
          console.error('DB get error:', sql, params, err.message);
          throw err;
        }
      },
      all(...params) {
        try {
          const results = [];
          const stmt = self._db.prepare(sql);
          if (params.length) stmt.bind(params);
          while (stmt.step()) {
            results.push(stmt.getAsObject());
          }
          stmt.free();
          return results;
        } catch (err) {
          console.error('DB all error:', sql, params, err.message);
          throw err;
        }
      },
      run(...params) {
        try {
          const stmt = self._db.prepare(sql);
          if (params.length) stmt.bind(params);
          stmt.step();
          stmt.free();
          // Get last_insert_rowid using prepared statement (exec() resets it in sql.js)
          const idStmt = self._db.prepare("SELECT last_insert_rowid() as id");
          idStmt.step();
          const lastId = idStmt.getAsObject().id;
          idStmt.free();
          const changes = self._db.getRowsModified();
          saveDb();
          return { lastInsertRowid: lastId, changes };
        } catch (err) {
          console.error('DB run error:', sql, params, err.message);
          throw err;
        }
      }
    };
  }

  // Direct run using sql.js native run with param object
  rawRun(sql, params = []) {
    try {
      const stmt = this._db.prepare(sql);
      if (params.length) stmt.bind(params);
      stmt.step();
      stmt.free();
      const idStmt = this._db.prepare("SELECT last_insert_rowid() as id");
      idStmt.step();
      const lastId = idStmt.getAsObject().id;
      idStmt.free();
      const changes = this._db.getRowsModified();
      saveDb();
      return { lastInsertRowid: lastId, changes };
    } catch (err) {
      console.error('DB rawRun error:', sql, params, err.message);
      throw err;
    }
  }

  // Direct query to check data
  rawQuery(sql, params = []) {
    const results = [];
    const stmt = this._db.prepare(sql);
    if (params.length) stmt.bind(params);
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
  }

  transaction(fn) {
    const self = this;
    return function(...args) {
      self._db.run('BEGIN TRANSACTION');
      try {
        const result = fn(...args);
        self._db.run('COMMIT');
        saveDb();
        return result;
      } catch (err) {
        self._db.run('ROLLBACK');
        throw err;
      }
    };
  }

  exec(sql) {
    this._db.run(sql);
    saveDb();
  }
}

const dbWrapper = new DbWrapper();
module.exports = dbWrapper;
