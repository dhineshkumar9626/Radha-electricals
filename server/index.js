require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use(express.static(path.join(__dirname, '..', 'public')));

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/products', require('./routes/products'));
app.use('/api/categories', require('./routes/categories'));
app.use('/api/customers', require('./routes/customers'));
app.use('/api/bills', require('./routes/bills'));
app.use('/api/expenses', require('./routes/expenses'));
app.use('/api/dashboard', require('./routes/dashboard'));

// Serve frontend pages
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.get('/owner', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'owner.html'));
});

app.get('/staff', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'staff.html'));
});

app.get('/bill-print/:id', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'bill-print.html'));
});

// Shop info endpoint
app.get('/api/shop-info', (req, res) => {
  res.json({
    name: process.env.SHOP_NAME || 'Radha Electricals',
    address: process.env.SHOP_ADDRESS || '',
    phone: process.env.SHOP_PHONE || '',
    gst: process.env.SHOP_GST || ''
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Wait for DB to be ready, then start server
db.waitReady().then(() => {
  app.listen(PORT, () => {
    console.log(`\n⚡ Radha Electricals Management System`);
    console.log(`🌐 Server running at http://localhost:${PORT}`);
    console.log(`👤 Default login: owner / owner123\n`);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
