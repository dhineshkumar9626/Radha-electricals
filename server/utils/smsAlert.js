const db = require('../db');

async function sendLowStockAlert(product) {
  const ownerPhone = process.env.OWNER_PHONE || '9876543210';
  const message = `⚠️ LOW STOCK ALERT! Product: ${product.name} | Code: ${product.code || 'N/A'} | Current Qty: ${product.quantity} ${product.unit} | Min Stock: ${product.min_stock} - Radha Electricals`;

  // Log alert to database
  db.prepare(`
    INSERT INTO stock_alerts (product_id, product_name, phone, message)
    VALUES (?, ?, ?, ?)
  `).run(product.id, product.name, ownerPhone, message);

  console.log(`📋 Low stock alert: ${product.name} - Qty: ${product.quantity}`);
  
  // To enable Twilio SMS, install twilio package and uncomment below:
  // const twilio = require('twilio');
  // const client = twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);
  // await client.messages.create({ body: message, from: process.env.TWILIO_PHONE, to: ownerPhone });
}

function checkAndAlertLowStock(productId) {
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(productId);
  if (product && product.quantity <= product.min_stock) {
    const recentAlert = db.prepare(`
      SELECT id FROM stock_alerts 
      WHERE product_id = ? AND sent_at > datetime('now', '-24 hours')
    `).get(productId);

    if (!recentAlert) {
      sendLowStockAlert(product);
    }
  }
}

module.exports = { sendLowStockAlert, checkAndAlertLowStock };
