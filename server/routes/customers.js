const express = require('express');
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// GET /api/customers
router.get('/', authenticateToken, (req, res) => {
  try {
    const { search } = req.query;
    let query = 'SELECT * FROM customers';
    const params = [];

    if (search) {
      query += ' WHERE name LIKE ? OR phone LIKE ? OR city LIKE ?';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    query += ' ORDER BY name ASC';
    const customers = db.prepare(query).all(...params);
    res.json(customers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/customers
router.post('/', authenticateToken, (req, res) => {
  try {
    const { name, phone, city, address } = req.body;
    if (!name) return res.status(400).json({ error: 'Customer name required' });

    const result = db.prepare('INSERT INTO customers (name, phone, city, address) VALUES (?, ?, ?, ?)').run(name, phone || null, city || null, address || null);
    res.status(201).json({ id: result.lastInsertRowid, message: 'Customer created' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/customers/:id
router.put('/:id', authenticateToken, (req, res) => {
  try {
    const { name, phone, city, address } = req.body;
    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });

    db.prepare('UPDATE customers SET name = ?, phone = ?, city = ?, address = ? WHERE id = ?').run(
      name || customer.name, phone !== undefined ? phone : customer.phone,
      city !== undefined ? city : customer.city,
      address !== undefined ? address : customer.address, req.params.id
    );
    res.json({ message: 'Customer updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/customers/:id
router.delete('/:id', authenticateToken, (req, res) => {
  try {
    db.prepare('DELETE FROM customers WHERE id = ?').run(req.params.id);
    res.json({ message: 'Customer deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
