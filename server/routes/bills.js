const express = require('express');
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');
const { checkAndAlertLowStock } = require('../utils/smsAlert');

const router = express.Router();

// Generate unique bill number
function generateBillNumber() {
  const date = new Date();
  const prefix = 'RE'; // Radha Electricals
  const dateStr = date.getFullYear().toString().slice(-2) +
    String(date.getMonth() + 1).padStart(2, '0') +
    String(date.getDate()).padStart(2, '0');
  
  const lastBill = db.prepare(`
    SELECT bill_number FROM bills 
    WHERE bill_number LIKE ? 
    ORDER BY id DESC LIMIT 1
  `).get(`${prefix}${dateStr}%`);

  let seq = 1;
  if (lastBill) {
    const lastSeq = parseInt(lastBill.bill_number.slice(-4));
    seq = lastSeq + 1;
  }

  return `${prefix}${dateStr}${String(seq).padStart(4, '0')}`;
}

// POST /api/bills - Create bill
router.post('/', authenticateToken, (req, res) => {
  try {
    const { items, customer_id, customer_name, customer_phone, discount, gst_percent, payment_method, notes } = req.body;

    if (!items || !items.length) {
      return res.status(400).json({ error: 'Bill must have at least one item' });
    }

    const billNumber = generateBillNumber();

    // Calculate totals
    let subtotal = 0;
    const processedItems = [];

    for (const item of items) {
      const product = db.prepare('SELECT * FROM products WHERE id = ?').get(item.product_id);
      if (!product) {
        return res.status(400).json({ error: `Product not found: ${item.product_id}` });
      }
      if (product.quantity < item.quantity) {
        return res.status(400).json({ error: `Insufficient stock for ${product.name}. Available: ${product.quantity}` });
      }

      const itemTotal = product.selling_price * item.quantity;
      subtotal += itemTotal;

      processedItems.push({
        product_id: product.id,
        product_name: product.name,
        product_code: product.code,
        quantity: item.quantity,
        unit: product.unit,
        unit_price: product.selling_price,
        total: itemTotal
      });
    }

    const discountAmount = discount || 0;
    const gstPct = gst_percent || 0;
    const afterDiscount = subtotal - discountAmount;
    const gstAmount = (afterDiscount * gstPct) / 100;
    const total = afterDiscount + gstAmount;

    // Get staff name
    const staff = db.prepare('SELECT name FROM users WHERE id = ?').get(req.user.id);

    // Create bill - sequential queries (sql.js is synchronous in-memory)
    const billResult = db.prepare(`
      INSERT INTO bills (bill_number, customer_id, customer_name, customer_phone, user_id, staff_name, subtotal, discount, gst_percent, gst_amount, total, payment_method, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(billNumber, customer_id || null, customer_name || 'Walk-in Customer', customer_phone || null,
      req.user.id, staff.name, subtotal, discountAmount, gstPct, gstAmount, total,
      payment_method || 'cash', notes || null);

    const billId = billResult.lastInsertRowid;

    // Insert bill items and update stock
    console.log('Bill created with ID:', billId, 'for bill number:', billNumber);
    for (const item of processedItems) {
      console.log('Inserting bill item:', billId, item.product_id, item.product_name, item.product_code, item.quantity, item.unit, item.unit_price, item.total);
      const itemResult = db.rawRun(
        'INSERT INTO bill_items (bill_id, product_id, product_name, product_code, quantity, unit, unit_price, total) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [billId, item.product_id, item.product_name, item.product_code || '', item.quantity, item.unit, item.unit_price, item.total]
      );
      console.log('Bill item insert result:', itemResult);

      db.prepare('UPDATE products SET quantity = quantity - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(item.quantity, item.product_id);
    }

    // Debug: check bill_items directly
    const debugItems = db.rawQuery('SELECT * FROM bill_items WHERE bill_id = ?', [billId]);
    console.log('Debug bill_items count:', debugItems.length);

    // Check low stock alerts for all products in the bill
    for (const item of processedItems) {
      checkAndAlertLowStock(item.product_id);
    }

    // Return the full bill (use bill_number since lastInsertRowid may have been overwritten)
    const bill = db.prepare('SELECT * FROM bills WHERE bill_number = ?').get(billNumber);
    const billItems = db.prepare('SELECT * FROM bill_items WHERE bill_id = ?').all(bill.id);

    res.status(201).json({ bill, items: billItems });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/bills - List bills with filters
router.get('/', authenticateToken, (req, res) => {
  try {
    const { date, from, to, search, page = 1, limit = 20 } = req.query;

    let query = 'SELECT * FROM bills WHERE 1=1';
    const params = [];

    if (date) {
      query += ` AND DATE(created_at) = ?`;
      params.push(date);
    }
    if (from) {
      query += ` AND DATE(created_at) >= ?`;
      params.push(from);
    }
    if (to) {
      query += ` AND DATE(created_at) <= ?`;
      params.push(to);
    }
    if (search) {
      query += ` AND (bill_number LIKE ? OR customer_name LIKE ? OR customer_phone LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    // If staff, only show their bills
    if (req.user.role === 'staff') {
      query += ` AND user_id = ?`;
      params.push(req.user.id);
    }

    const countQuery = query.replace('SELECT *', 'SELECT COUNT(*) as total');
    const total = db.prepare(countQuery).get(...params).total;

    query += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));

    const bills = db.prepare(query).all(...params);

    res.json({ bills, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/bills/daily-summary - Daily cash summary
router.get('/daily-summary', authenticateToken, (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().split('T')[0];

    const summary = db.prepare(`
      SELECT 
        COUNT(*) as total_bills,
        COALESCE(SUM(total), 0) as total_sales,
        COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN total ELSE 0 END), 0) as cash_sales,
        COALESCE(SUM(CASE WHEN payment_method = 'upi' THEN total ELSE 0 END), 0) as upi_sales,
        COALESCE(SUM(CASE WHEN payment_method = 'card' THEN total ELSE 0 END), 0) as card_sales,
        COALESCE(SUM(discount), 0) as total_discount,
        COALESCE(SUM(gst_amount), 0) as total_gst
      FROM bills 
      WHERE DATE(created_at) = ?
    `).get(date);

    res.json({ date, ...summary });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/bills/:id - Bill detail
router.get('/:id', authenticateToken, (req, res) => {
  try {
    const bill = db.prepare('SELECT * FROM bills WHERE id = ?').get(req.params.id);
    if (!bill) return res.status(404).json({ error: 'Bill not found' });

    const items = db.prepare('SELECT * FROM bill_items WHERE bill_id = ?').all(req.params.id);
    res.json({ bill, items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
