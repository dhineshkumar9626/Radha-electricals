const express = require('express');
const db = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /api/expenses
router.get('/', authenticateToken, requireRole('owner', 'admin'), (req, res) => {
  try {
    const { from, to, category } = req.query;
    let query = 'SELECT e.*, u.name as user_name FROM expenses e LEFT JOIN users u ON e.user_id = u.id WHERE 1=1';
    const params = [];

    if (from) { query += ' AND e.date >= ?'; params.push(from); }
    if (to) { query += ' AND e.date <= ?'; params.push(to); }
    if (category) { query += ' AND e.category = ?'; params.push(category); }

    query += ' ORDER BY e.date DESC, e.created_at DESC';
    const expenses = db.prepare(query).all(...params);

    const total = expenses.reduce((sum, e) => sum + e.amount, 0);
    res.json({ expenses, total });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/expenses
router.post('/', authenticateToken, requireRole('owner', 'admin'), (req, res) => {
  try {
    const { title, amount, category, date } = req.body;
    if (!title || !amount) return res.status(400).json({ error: 'Title and amount required' });

    const result = db.prepare(
      'INSERT INTO expenses (title, amount, category, date, user_id) VALUES (?, ?, ?, ?, ?)'
    ).run(title, amount, category || 'General', date || new Date().toISOString().split('T')[0], req.user.id);

    res.status(201).json({ id: result.lastInsertRowid, message: 'Expense added' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/expenses/:id
router.delete('/:id', authenticateToken, requireRole('owner', 'admin'), (req, res) => {
  try {
    db.prepare('DELETE FROM expenses WHERE id = ?').run(req.params.id);
    res.json({ message: 'Expense deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
