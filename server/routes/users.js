const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /api/users - List all staff (owner/admin only)
router.get('/', authenticateToken, requireRole('owner', 'admin'), (req, res) => {
  try {
    const users = db.prepare(`
      SELECT id, name, username, role, phone, active, created_at 
      FROM users ORDER BY created_at DESC
    `).all();
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/users - Create staff (owner only)
router.post('/', authenticateToken, requireRole('owner'), (req, res) => {
  try {
    const { name, username, password, role, phone } = req.body;

    if (!name || !username || !password) {
      return res.status(400).json({ error: 'Name, username and password required' });
    }

    if (role === 'owner') {
      return res.status(400).json({ error: 'Cannot create another owner account' });
    }

    const hashedPassword = bcrypt.hashSync(password, 10);
    const result = db.prepare(`
      INSERT INTO users (name, username, password, role, phone) VALUES (?, ?, ?, ?, ?)
    `).run(name, username, hashedPassword, role || 'staff', phone || null);

    res.status(201).json({ id: result.lastInsertRowid, message: 'Staff created successfully' });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(400).json({ error: 'Username already exists' });
    }
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/users/:id - Update staff (owner only)
router.put('/:id', authenticateToken, requireRole('owner'), (req, res) => {
  try {
    const { name, username, password, role, phone, active } = req.body;
    const userId = req.params.id;

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (user.role === 'owner' && role !== 'owner') {
      return res.status(400).json({ error: 'Cannot change owner role' });
    }

    let query = 'UPDATE users SET name = ?, username = ?, role = ?, phone = ?, active = ?';
    let params = [
      name || user.name,
      username || user.username,
      role || user.role,
      phone !== undefined ? phone : user.phone,
      active !== undefined ? active : user.active
    ];

    if (password) {
      query += ', password = ?';
      params.push(bcrypt.hashSync(password, 10));
    }

    query += ' WHERE id = ?';
    params.push(userId);

    db.prepare(query).run(...params);
    res.json({ message: 'User updated successfully' });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(400).json({ error: 'Username already exists' });
    }
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/users/:id - Deactivate staff (owner only)
router.delete('/:id', authenticateToken, requireRole('owner'), (req, res) => {
  try {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (user.role === 'owner') {
      return res.status(400).json({ error: 'Cannot deactivate owner account' });
    }

    db.prepare('UPDATE users SET active = 0 WHERE id = ?').run(req.params.id);
    res.json({ message: 'User deactivated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
