const express = require('express');
const db = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /api/dashboard/stats
router.get('/stats', authenticateToken, (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    const todaySales = db.prepare(`
      SELECT COALESCE(SUM(total), 0) as amount, COUNT(*) as count
      FROM bills WHERE DATE(created_at) = ?
    `).get(today);

    const monthSales = db.prepare(`
      SELECT COALESCE(SUM(total), 0) as amount, COUNT(*) as count
      FROM bills WHERE strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')
    `).get();

    const totalProducts = db.prepare('SELECT COUNT(*) as count FROM products').get();
    const lowStock = db.prepare('SELECT COUNT(*) as count FROM products WHERE quantity <= min_stock').get();
    const totalCustomers = db.prepare('SELECT COUNT(*) as count FROM customers').get();
    const totalStaff = db.prepare("SELECT COUNT(*) as count FROM users WHERE role != 'owner'").get();

    const monthExpenses = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as amount
      FROM expenses WHERE strftime('%Y-%m', date) = strftime('%Y-%m', 'now')
    `).get();

    res.json({
      today_sales: todaySales.amount,
      today_bills: todaySales.count,
      month_sales: monthSales.amount,
      month_bills: monthSales.count,
      total_products: totalProducts.count,
      low_stock: lowStock.count,
      total_customers: totalCustomers.count,
      total_staff: totalStaff.count,
      month_expenses: monthExpenses.amount,
      month_profit: monthSales.amount - monthExpenses.amount
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dashboard/sales-chart
router.get('/sales-chart', authenticateToken, requireRole('owner', 'admin'), (req, res) => {
  try {
    const { period = 'week' } = req.query;

    let query, labels;

    if (period === 'week') {
      query = db.prepare(`
        SELECT DATE(created_at) as date, COALESCE(SUM(total), 0) as total
        FROM bills 
        WHERE created_at >= datetime('now', '-7 days')
        GROUP BY DATE(created_at)
        ORDER BY date ASC
      `).all();
    } else if (period === 'month') {
      query = db.prepare(`
        SELECT DATE(created_at) as date, COALESCE(SUM(total), 0) as total
        FROM bills 
        WHERE created_at >= datetime('now', '-30 days')
        GROUP BY DATE(created_at)
        ORDER BY date ASC
      `).all();
    } else {
      // yearly - group by month
      query = db.prepare(`
        SELECT strftime('%Y-%m', created_at) as date, COALESCE(SUM(total), 0) as total
        FROM bills 
        WHERE created_at >= datetime('now', '-12 months')
        GROUP BY strftime('%Y-%m', created_at)
        ORDER BY date ASC
      `).all();
    }

    res.json(query);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dashboard/top-products
router.get('/top-products', authenticateToken, (req, res) => {
  try {
    const products = db.prepare(`
      SELECT bi.product_name, SUM(bi.quantity) as total_sold, SUM(bi.total) as revenue
      FROM bill_items bi
      JOIN bills b ON bi.bill_id = b.id
      WHERE b.created_at >= datetime('now', '-30 days')
      GROUP BY bi.product_id
      ORDER BY total_sold DESC
      LIMIT 10
    `).all();

    res.json(products);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dashboard/recent-bills
router.get('/recent-bills', authenticateToken, (req, res) => {
  try {
    const bills = db.prepare(`
      SELECT * FROM bills ORDER BY created_at DESC LIMIT 10
    `).all();
    res.json(bills);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dashboard/stock-alerts - Get recent stock alerts
router.get('/stock-alerts', authenticateToken, (req, res) => {
  try {
    const alerts = db.prepare(`
      SELECT * FROM stock_alerts ORDER BY sent_at DESC LIMIT 20
    `).all();
    res.json(alerts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dashboard/notifications - Get notifications (low stock + recent alerts)
router.get('/notifications', authenticateToken, (req, res) => {
  try {
    // Get current low stock products
    const lowStockProducts = db.prepare(`
      SELECT p.id, p.name, p.code, p.quantity, p.unit, p.min_stock, c.name as category_name
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.quantity <= p.min_stock
      ORDER BY p.quantity ASC
    `).all();

    // Get recent stock alerts from the last 7 days
    const recentAlerts = db.prepare(`
      SELECT * FROM stock_alerts
      WHERE sent_at >= datetime('now', '-7 days')
      ORDER BY sent_at DESC
      LIMIT 20
    `).all();

    res.json({
      low_stock_count: lowStockProducts.length,
      low_stock: lowStockProducts,
      recent_alerts: recentAlerts
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
