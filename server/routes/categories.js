const express = require('express');
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// GET /api/categories
router.get('/', authenticateToken, (req, res) => {
  try {
    const categories = db.prepare('SELECT * FROM categories ORDER BY name ASC').all();
    res.json(categories);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/categories
router.post('/', authenticateToken, (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Category name required' });

    const result = db.prepare('INSERT INTO categories (name) VALUES (?)').run(name);
    res.status(201).json({ id: result.lastInsertRowid, message: 'Category created' });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(400).json({ error: 'Category already exists' });
    }
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/categories/:id
router.put('/:id', authenticateToken, (req, res) => {
  try {
    const { name } = req.body;
    db.prepare('UPDATE categories SET name = ? WHERE id = ?').run(name, req.params.id);
    res.json({ message: 'Category updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/categories/:id
router.delete('/:id', authenticateToken, (req, res) => {
  try {
    const products = db.prepare('SELECT id FROM products WHERE category_id = ? LIMIT 1').get(req.params.id);
    if (products) {
      return res.status(400).json({ error: 'Cannot delete category with products' });
    }
    db.prepare('DELETE FROM categories WHERE id = ?').run(req.params.id);
    res.json({ message: 'Category deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
