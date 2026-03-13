// Staff Dashboard Logic
let cart = [];
let searchTimeout = null;

document.addEventListener('DOMContentLoaded', () => {
  if (!requireAuth(['staff', 'admin', 'owner'])) return;

  const user = getUser();
  document.getElementById('userName').textContent = user.name;
  document.getElementById('userRole').textContent = user.role;
  document.getElementById('userAvatar').textContent = user.name.charAt(0).toUpperCase();

  setupNav();
  setupProductSearch();
  loadCategories();
});

// ── Navigation ──
function setupNav() {
  document.querySelectorAll('.nav-item[data-section]').forEach(item => {
    item.addEventListener('click', () => {
      const section = item.dataset.section;
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      item.classList.add('active');
      document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
      document.getElementById(`sec-${section}`).classList.add('active');

      switch (section) {
        case 'bill-history': loadStaffBills(); break;
        case 'products': loadStaffProducts(); break;
        case 'categories': loadCategoriesList(); break;
        case 'customers': loadCustomers(); break;
      }
    });
  });
}

function toggleSidebar() { document.getElementById('sidebar').classList.toggle('open'); }
function logout() { clearAuth(); window.location.href = '/'; }
function openModal(id) { document.getElementById(id).classList.add('active'); }
function closeModal(id) { document.getElementById(id).classList.remove('active'); }

// ── Product Search (Billing) ──
function setupProductSearch() {
  const input = document.getElementById('productSearchInput');
  const results = document.getElementById('searchResults');

  input.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    const q = e.target.value.trim();
    if (q.length < 1) { results.classList.remove('show'); return; }

    searchTimeout = setTimeout(async () => {
      try {
        const products = await API.get(`/products/search?q=${encodeURIComponent(q)}`);
        if (products.length === 0) {
          results.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text-muted);">No products found</div>';
        } else {
          results.innerHTML = products.map(p => `
            <div class="search-result-item" onclick='addToCart(${JSON.stringify(p).replace(/'/g, "\\'")})'>
              <div class="product-info">
                <div class="product-name">${p.name}</div>
                <div class="product-code">${p.code || ''} • Stock: ${p.quantity} ${p.unit}</div>
              </div>
              <div class="product-price">${formatCurrency(p.selling_price)}</div>
            </div>
          `).join('');
        }
        results.classList.add('show');
      } catch (err) {
        showToast(err.message, 'error');
      }
    }, 300);
  });

  // Close results on click outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#productSearchInput') && !e.target.closest('#searchResults')) {
      results.classList.remove('show');
    }
  });
}

// ── Cart ──
function addToCart(product) {
  const existing = cart.find(item => item.product_id === product.id);
  if (existing) {
    if (existing.quantity >= product.quantity) {
      showToast(`Maximum stock available: ${product.quantity}`, 'warning');
      return;
    }
    existing.quantity++;
    existing.total = existing.quantity * existing.unit_price;
  } else {
    cart.push({
      product_id: product.id,
      name: product.name,
      code: product.code,
      unit_price: product.selling_price,
      quantity: 1,
      max_qty: product.quantity,
      unit: product.unit,
      total: product.selling_price
    });
  }

  document.getElementById('searchResults').classList.remove('show');
  document.getElementById('productSearchInput').value = '';
  renderCart();
  showToast(`${product.name} added to cart`, 'success');
}

function removeFromCart(index) {
  cart.splice(index, 1);
  renderCart();
}

function updateCartQty(index, delta) {
  const item = cart[index];
  const newQty = item.quantity + delta;
  if (newQty < 1) { removeFromCart(index); return; }
  if (newQty > item.max_qty) {
    showToast(`Maximum stock: ${item.max_qty}`, 'warning');
    return;
  }
  item.quantity = newQty;
  item.total = item.quantity * item.unit_price;
  renderCart();
}

function clearCart() {
  cart = [];
  renderCart();
}

function renderCart() {
  const container = document.getElementById('cartItems');
  document.getElementById('cartCount').textContent = cart.length;

  if (cart.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">🛒</div><h4>Cart is empty</h4><p>Search and add products above</p></div>';
    updateBillTotal();
    return;
  }

  container.innerHTML = cart.map((item, i) => `
    <div class="cart-item">
      <div class="cart-details">
        <div class="cart-name">${item.name}</div>
        <div class="cart-price">${formatCurrency(item.unit_price)} × ${item.quantity} ${item.unit}</div>
      </div>
      <div class="cart-qty">
        <button onclick="updateCartQty(${i}, -1)">−</button>
        <span>${item.quantity}</span>
        <button onclick="updateCartQty(${i}, 1)">+</button>
      </div>
      <div class="cart-total">${formatCurrency(item.total)}</div>
      <button class="cart-remove" onclick="removeFromCart(${i})">✕</button>
    </div>
  `).join('');

  updateBillTotal();
}

function updateBillTotal() {
  const subtotal = cart.reduce((sum, item) => sum + item.total, 0);
  const discount = parseFloat(document.getElementById('billDiscount').value) || 0;
  const gstPercent = parseFloat(document.getElementById('billGst').value) || 0;
  const afterDiscount = subtotal - discount;
  const gstAmount = (afterDiscount * gstPercent) / 100;
  const total = afterDiscount + gstAmount;

  document.getElementById('billSubtotal').textContent = formatCurrency(subtotal);
  document.getElementById('billTotal').textContent = formatCurrency(total);

  if (gstPercent > 0) {
    document.getElementById('gstAmountRow').style.display = 'flex';
    document.getElementById('billGstAmount').textContent = formatCurrency(gstAmount);
  } else {
    document.getElementById('gstAmountRow').style.display = 'none';
  }
}

function selectPayment(el) {
  document.querySelectorAll('.payment-method').forEach(m => m.classList.remove('active'));
  el.classList.add('active');
}

// ── Generate Bill ──
async function generateBill() {
  if (cart.length === 0) {
    showToast('Cart is empty. Add products first.', 'warning');
    return;
  }

  const btn = document.getElementById('generateBillBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Generating...';

  try {
    const paymentMethod = document.querySelector('.payment-method.active').dataset.method;
    const data = {
      items: cart.map(item => ({ product_id: item.product_id, quantity: item.quantity })),
      customer_name: document.getElementById('custName').value || 'Walk-in Customer',
      customer_phone: document.getElementById('custPhone').value || null,
      discount: parseFloat(document.getElementById('billDiscount').value) || 0,
      gst_percent: parseFloat(document.getElementById('billGst').value) || 0,
      payment_method: paymentMethod
    };

    const result = await API.post('/bills', data);
    showToast(`Bill ${result.bill.bill_number} generated successfully!`, 'success');

    // Open print window
    printBill(result.bill.id);

    // Reset
    cart = [];
    renderCart();
    document.getElementById('custName').value = '';
    document.getElementById('custPhone').value = '';
    document.getElementById('billDiscount').value = '0';
    document.getElementById('billGst').value = '0';
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '🧾 Generate Bill';
  }
}

function printBill(billId) {
  window.open(`/bill-print/${billId}`, '_blank', 'width=400,height=600');
}

// ── Bill History ──
async function loadStaffBills() {
  try {
    const data = await API.get('/bills?limit=50');
    renderStaffBills(data.bills);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function staffSearchBills() {
  try {
    const search = document.getElementById('staffBillSearch').value;
    const date = document.getElementById('staffBillDate').value;
    let query = '/bills?limit=50';
    if (search) query += `&search=${encodeURIComponent(search)}`;
    if (date) query += `&date=${date}`;
    const data = await API.get(query);
    renderStaffBills(data.bills);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function renderStaffBills(bills) {
  const list = document.getElementById('staffBillsList');
  if (bills.length === 0) {
    list.innerHTML = '<tr><td colspan="6" class="empty-state"><p>No bills found</p></td></tr>';
    return;
  }
  list.innerHTML = bills.map(b => `
    <tr>
      <td><strong>${b.bill_number}</strong></td>
      <td>${b.customer_name || 'Walk-in'}</td>
      <td><strong>${formatCurrency(b.total)}</strong></td>
      <td><span class="status-badge info">${b.payment_method}</span></td>
      <td>${formatDateTime(b.created_at)}</td>
      <td>
        <button class="btn btn-ghost btn-sm" onclick="viewBillDetail(${b.id})">👁️</button>
        <button class="btn btn-ghost btn-sm" onclick="printBill(${b.id})">🖨️</button>
      </td>
    </tr>
  `).join('');
}

async function viewBillDetail(billId) {
  try {
    const data = await API.get(`/bills/${billId}`);
    const b = data.bill;
    const items = data.items;

    document.getElementById('billDetailContent').innerHTML = `
      <div style="margin-bottom:16px;">
        <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
          <strong style="font-size:1.125rem;">#${b.bill_number}</strong>
          <span style="color:var(--text-muted);">${formatDateTime(b.created_at)}</span>
        </div>
        <div style="color:var(--text-secondary);font-size:0.875rem;">
          Customer: <strong>${b.customer_name || 'Walk-in'}</strong> ${b.customer_phone ? `| ${b.customer_phone}` : ''}<br>
          Payment: ${b.payment_method}
        </div>
      </div>
      <table>
        <thead><tr><th>Product</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead>
        <tbody>
          ${items.map(i => `
            <tr>
              <td>${i.product_name}</td>
              <td>${i.quantity} ${i.unit}</td>
              <td>${formatCurrency(i.unit_price)}</td>
              <td><strong>${formatCurrency(i.total)}</strong></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      <div class="bill-summary" style="margin-top:16px;">
        <div class="summary-row"><span>Subtotal</span><span>${formatCurrency(b.subtotal)}</span></div>
        ${b.discount > 0 ? `<div class="summary-row"><span>Discount</span><span>-${formatCurrency(b.discount)}</span></div>` : ''}
        ${b.gst_percent > 0 ? `<div class="summary-row"><span>GST (${b.gst_percent}%)</span><span>${formatCurrency(b.gst_amount)}</span></div>` : ''}
        <div class="summary-row total"><span>Total</span><span>${formatCurrency(b.total)}</span></div>
      </div>
    `;

    document.getElementById('printBillBtn').onclick = () => printBill(billId);
    openModal('billDetailModal');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ── Products / Stock ──
let allCategories = [];

async function loadCategories() {
  try {
    allCategories = await API.get('/categories');
    const select = document.getElementById('prodCategory');
    select.innerHTML = '<option value="">-- Select Category --</option>' +
      allCategories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  } catch (err) {
    console.error('Failed to load categories:', err);
  }
}

async function loadStaffProducts() {
  try {
    const data = await API.get('/products?limit=200');
    renderStaffProducts(data.products);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function staffSearchProducts() {
  try {
    const search = document.getElementById('staffProductSearch').value;
    const data = await API.get(`/products?search=${encodeURIComponent(search)}&limit=200`);
    renderStaffProducts(data.products);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function renderStaffProducts(products) {
  const list = document.getElementById('staffProductsList');
  if (products.length === 0) {
    list.innerHTML = '<tr><td colspan="8" class="empty-state"><p>No products found</p></td></tr>';
    return;
  }

  list.innerHTML = products.map(p => `
    <tr>
      <td><span style="font-family:var(--font-mono);font-size:0.8rem;">${p.code || '-'}</span></td>
      <td><strong>${p.name}</strong></td>
      <td>${p.category_name || '-'}</td>
      <td>${formatCurrency(p.purchase_price)}</td>
      <td>${formatCurrency(p.selling_price)}</td>
      <td>
        <strong style="color:${p.quantity <= p.min_stock ? 'var(--danger)' : 'var(--success)'}">${p.quantity}</strong>
      </td>
      <td>${p.unit}</td>
      <td>
        <button class="btn btn-ghost btn-sm" onclick="editProduct(${p.id})">✏️</button>
        <button class="btn btn-ghost btn-sm" onclick="deleteProduct(${p.id}, '${p.name.replace(/'/g, "\\'")}')">🗑️</button>
      </td>
    </tr>
  `).join('');
}

function openProductModal(data = null) {
  document.getElementById('productModalTitle').textContent = data ? 'Edit Product' : 'Add Product';
  document.getElementById('prodId').value = data ? data.id : '';
  document.getElementById('prodName').value = data ? data.name : '';
  document.getElementById('prodCode').value = data ? (data.code || '') : '';
  document.getElementById('prodCategory').value = data ? (data.category_id || '') : '';
  document.getElementById('prodPurchasePrice').value = data ? data.purchase_price : '';
  document.getElementById('prodSellingPrice').value = data ? data.selling_price : '';
  document.getElementById('prodQuantity').value = data ? data.quantity : 0;
  document.getElementById('prodUnit').value = data ? data.unit : 'pcs';
  document.getElementById('prodMinStock').value = data ? data.min_stock : 10;
  openModal('productModal');
}

async function editProduct(id) {
  try {
    const product = await API.get(`/products/${id}`);
    openProductModal(product);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function saveProduct() {
  try {
    const id = document.getElementById('prodId').value;
    const data = {
      name: document.getElementById('prodName').value,
      code: document.getElementById('prodCode').value || null,
      category_id: document.getElementById('prodCategory').value || null,
      purchase_price: parseFloat(document.getElementById('prodPurchasePrice').value),
      selling_price: parseFloat(document.getElementById('prodSellingPrice').value),
      quantity: parseInt(document.getElementById('prodQuantity').value) || 0,
      unit: document.getElementById('prodUnit').value,
      min_stock: parseInt(document.getElementById('prodMinStock').value) || 10,
    };

    if (!data.name || isNaN(data.purchase_price) || isNaN(data.selling_price)) {
      return showToast('Name, purchase price and selling price are required', 'warning');
    }

    if (id) {
      await API.put(`/products/${id}`, data);
      showToast('Product updated successfully', 'success');
    } else {
      await API.post('/products', data);
      showToast('Product added successfully', 'success');
    }

    closeModal('productModal');
    loadStaffProducts();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteProduct(id, name) {
  if (!confirm(`Delete product "${name}"?`)) return;
  try {
    await API.delete(`/products/${id}`);
    showToast('Product deleted', 'success');
    loadStaffProducts();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ── Categories ──
async function loadCategoriesList() {
  try {
    const categories = await API.get('/categories');
    const list = document.getElementById('categoriesList');
    list.innerHTML = categories.map(c => `
      <tr>
        <td>${c.id}</td>
        <td><strong>${c.name}</strong></td>
        <td>
          <button class="btn btn-ghost btn-sm" onclick="deleteCategory(${c.id}, '${c.name.replace(/'/g, "\\'")}')">🗑️</button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function openCategoryModal() {
  document.getElementById('catName').value = '';
  openModal('categoryModal');
}

async function saveCategory() {
  try {
    const name = document.getElementById('catName').value;
    if (!name) return showToast('Category name required', 'warning');
    await API.post('/categories', { name });
    showToast('Category created', 'success');
    closeModal('categoryModal');
    loadCategoriesList();
    loadCategories(); // refresh dropdown
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteCategory(id, name) {
  if (!confirm(`Delete category "${name}"?`)) return;
  try {
    await API.delete(`/categories/${id}`);
    showToast('Category deleted', 'success');
    loadCategoriesList();
    loadCategories();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ── Customers ──
async function loadCustomers() {
  try {
    const customers = await API.get('/customers');
    const list = document.getElementById('customersList');
    if (customers.length === 0) {
      list.innerHTML = '<tr><td colspan="6" class="empty-state"><p>No customers yet</p></td></tr>';
      return;
    }
    list.innerHTML = customers.map(c => `
      <tr>
        <td><strong>${c.name}</strong></td>
        <td>${c.phone || '-'}</td>
        <td>${c.city || '-'}</td>
        <td>${c.address || '-'}</td>
        <td>${formatDate(c.created_at)}</td>
        <td>
          <button class="btn btn-ghost btn-sm" onclick="editCustomer(${c.id})">✏️</button>
          <button class="btn btn-ghost btn-sm" onclick="deleteCustomer(${c.id})">🗑️</button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function openCustomerModal(data = null) {
  document.getElementById('customerModalTitle').textContent = data ? 'Edit Customer' : 'Add Customer';
  document.getElementById('customerId').value = data ? data.id : '';
  document.getElementById('customerName').value = data ? data.name : '';
  document.getElementById('customerPhone').value = data ? (data.phone || '') : '';
  document.getElementById('customerCity').value = data ? (data.city || '') : '';
  document.getElementById('customerAddress').value = data ? (data.address || '') : '';
  openModal('customerModal');
}

async function editCustomer(id) {
  try {
    const customers = await API.get('/customers');
    const customer = customers.find(c => c.id === id);
    if (customer) openCustomerModal(customer);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function saveCustomer() {
  try {
    const id = document.getElementById('customerId').value;
    const data = {
      name: document.getElementById('customerName').value,
      phone: document.getElementById('customerPhone').value,
      city: document.getElementById('customerCity').value,
      address: document.getElementById('customerAddress').value
    };

    if (!data.name) return showToast('Customer name required', 'warning');

    if (id) {
      await API.put(`/customers/${id}`, data);
      showToast('Customer updated', 'success');
    } else {
      await API.post('/customers', data);
      showToast('Customer added', 'success');
    }

    closeModal('customerModal');
    loadCustomers();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteCustomer(id) {
  if (!confirm('Delete this customer?')) return;
  try {
    await API.delete(`/customers/${id}`);
    showToast('Customer deleted', 'success');
    loadCustomers();
  } catch (err) {
    showToast(err.message, 'error');
  }
}
