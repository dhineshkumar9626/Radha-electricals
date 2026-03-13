const express = require('express');
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');
const { checkAndAlertLowStock } = require('../utils/smsAlert');

const router = express.Router();

// GET /api/products - List products with search, filter, pagination
router.get('/', authenticateToken, (req, res) => {
  try {
    const { search, category, low_stock, page = 1, limit = 50 } = req.query;
    let query = `
      SELECT p.*, c.name as category_name 
      FROM products p 
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE 1=1
    `;
    const params = [];

    if (search) {
      query += ` AND (p.name LIKE ? OR p.code LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`);
    }

    if (category) {
      query += ` AND p.category_id = ?`;
      params.push(category);
    }

    if (low_stock === 'true') {
      query += ` AND p.quantity <= p.min_stock`;
    }

    query += ` ORDER BY p.name ASC`;

    const offset = (page - 1) * limit;
    query += ` LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), offset);

    const products = db.prepare(query).all(...params);

    // Get total count
    let countQuery = `SELECT COUNT(*) as total FROM products p WHERE 1=1`;
    const countParams = [];
    if (search) {
      countQuery += ` AND (p.name LIKE ? OR p.code LIKE ?)`;
      countParams.push(`%${search}%`, `%${search}%`);
    }
    if (category) {
      countQuery += ` AND p.category_id = ?`;
      countParams.push(category);
    }
    if (low_stock === 'true') {
      countQuery += ` AND p.quantity <= p.min_stock`;
    }
    const total = db.prepare(countQuery).get(...countParams).total;

    res.json({ products, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/products/low-stock - Get low stock products
router.get('/low-stock', authenticateToken, (req, res) => {
  try {
    const products = db.prepare(`
      SELECT p.*, c.name as category_name
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.quantity <= p.min_stock
      ORDER BY p.quantity ASC
    `).all();
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/products/search - Quick search for billing
router.get('/search', authenticateToken, (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.json([]);

    const products = db.prepare(`
      SELECT id, name, code, selling_price, quantity, unit
      FROM products
      WHERE (name LIKE ? OR code LIKE ?) AND quantity > 0
      ORDER BY name ASC
      LIMIT 10
    `).all(`%${q}%`, `%${q}%`);

    res.json(products);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/products/:id
router.get('/:id', authenticateToken, (req, res) => {
  try {
    const product = db.prepare(`
      SELECT p.*, c.name as category_name
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.id = ?
    `).get(req.params.id);

    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/products - Add product
router.post('/', authenticateToken, (req, res) => {
  try {
    const { name, code, category_id, purchase_price, selling_price, quantity, unit, min_stock } = req.body;

    if (!name || purchase_price === undefined || selling_price === undefined) {
      return res.status(400).json({ error: 'Name, purchase price and selling price required' });
    }

    const result = db.prepare(`
      INSERT INTO products (name, code, category_id, purchase_price, selling_price, quantity, unit, min_stock)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(name, code || null, category_id || null, purchase_price, selling_price, quantity || 0, unit || 'pcs', min_stock || 10);

    res.status(201).json({ id: result.lastInsertRowid, message: 'Product added successfully' });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(400).json({ error: 'Product code already exists' });
    }
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/products/:id - Update product
router.put('/:id', authenticateToken, (req, res) => {
  try {
    const { name, code, category_id, purchase_price, selling_price, quantity, unit, min_stock } = req.body;

    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });

    db.prepare(`
      UPDATE products SET 
        name = ?, code = ?, category_id = ?, purchase_price = ?, selling_price = ?,
        quantity = ?, unit = ?, min_stock = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      name || product.name,
      code !== undefined ? code : product.code,
      category_id !== undefined ? category_id : product.category_id,
      purchase_price !== undefined ? purchase_price : product.purchase_price,
      selling_price !== undefined ? selling_price : product.selling_price,
      quantity !== undefined ? quantity : product.quantity,
      unit || product.unit,
      min_stock !== undefined ? min_stock : product.min_stock,
      req.params.id
    );

    // Check low stock after update
    if (quantity !== undefined) {
      checkAndAlertLowStock(req.params.id);
    }

    res.json({ message: 'Product updated successfully' });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(400).json({ error: 'Product code already exists' });
    }
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/products/:id
router.delete('/:id', authenticateToken, (req, res) => {
  try {
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });

    // Check if product is used in bills
    const billItem = db.prepare('SELECT id FROM bill_items WHERE product_id = ? LIMIT 1').get(req.params.id);
    if (billItem) {
      return res.status(400).json({ error: 'Cannot delete product that is referenced in bills. Set quantity to 0 instead.' });
    }

    db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
    res.json({ message: 'Product deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
