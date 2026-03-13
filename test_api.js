const http = require('http');

function httpRequest(method, path, data, token) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'localhost',
      port: 3000,
      path: path,
      method: method,
      headers: { 'Content-Type': 'application/json' }
    };
    if (token) opts.headers['Authorization'] = 'Bearer ' + token;
    const req = http.request(opts, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch (e) { resolve(body); }
      });
    });
    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

async function test() {
  const login = await httpRequest('POST', '/api/auth/login', { username: 'owner', password: 'owner123' });
  const token = login.token;

  // Create a bill
  console.log('--- CREATE BILL ---');
  const bill = await httpRequest('POST', '/api/bills', {
    items: [{ product_id: 5, quantity: 1 }],
    customer_name: 'Debug Test',
    payment_method: 'cash'
  }, token);
  
  console.log('Bill object:', bill.bill ? 'EXISTS' : 'MISSING');
  console.log('Bill ID:', bill.bill ? bill.bill.id : 'N/A');
  console.log('Bill Number:', bill.bill ? bill.bill.bill_number : 'N/A');
  console.log('Items returned:', bill.items ? bill.items.length : 'N/A');
  
  if (bill.bill) {
    // Now fetch the bill detail separately
    console.log('\n--- FETCH BILL DETAIL ---');
    const detail = await httpRequest('GET', '/api/bills/' + bill.bill.id, null, token);
    console.log('Detail bill:', detail.bill ? detail.bill.bill_number : 'MISSING');
    console.log('Detail items:', detail.items ? detail.items.length : 'MISSING');
    if (detail.items) {
      detail.items.forEach(item => console.log('  Item:', item.product_name, 'qty:', item.quantity));
    }
  }

  // Check products table to see if stock was updated  
  console.log('\n--- CHECK PRODUCT 5 STOCK ---');
  const products = await httpRequest('GET', '/api/products/5', null, token);
  console.log('Product 5:', products.name, 'Stock:', products.quantity);
  
  console.log('\nDone');
}

test().catch(e => console.error('Error:', e));
