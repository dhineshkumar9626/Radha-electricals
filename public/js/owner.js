// Owner Dashboard Logic
document.addEventListener('DOMContentLoaded', () => {
  if (!requireAuth(['owner'])) return;

  const user = getUser();
  document.getElementById('userName').textContent = user.name;
  document.getElementById('userRole').textContent = user.role;
  document.getElementById('userAvatar').textContent = user.name.charAt(0).toUpperCase();
  document.getElementById('currentDate').textContent = new Date().toLocaleDateString('en-IN', { 
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' 
  });

  // Set today's date for summary
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('summaryDate').value = today;

  // Navigation
  setupNav();
  loadDashboard();
  loadNotifications();

  // Auto-refresh notifications every 30 seconds
  setInterval(loadNotifications, 30000);

  // Close notification panel on click outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.notification-wrapper')) {
      document.getElementById('notifPanel').classList.remove('show');
    }
  });
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

      // Load section data
      switch (section) {
        case 'overview': loadDashboard(); break;
        case 'sales': loadSalesChart('week'); break;
        case 'staff': loadStaff(); break;
        case 'stock-alerts': loadLowStock(); break;
        case 'expenses': loadExpenses(); break;
        case 'bills': loadAllBills(); break;
        case 'products': loadOwnerProducts(); break;
      }
    });
  });
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}

function logout() {
  clearAuth();
  window.location.href = '/';
}

function openModal(id) { document.getElementById(id).classList.add('active'); }
function closeModal(id) { document.getElementById(id).classList.remove('active'); }

// ── Dashboard Overview ──
let salesChartInstance = null;

async function loadDashboard() {
  try {
    const [stats, topProducts, recentBills, salesData] = await Promise.all([
      API.get('/dashboard/stats'),
      API.get('/dashboard/top-products'),
      API.get('/dashboard/recent-bills'),
      API.get('/dashboard/sales-chart?period=week')
    ]);

    // Update stats
    document.getElementById('statTodaySales').textContent = formatCurrency(stats.today_sales);
    document.getElementById('statMonthSales').textContent = formatCurrency(stats.month_sales);
    document.getElementById('statTodayBills').textContent = stats.today_bills;
    document.getElementById('statLowStock').textContent = stats.low_stock;
    document.getElementById('statProducts').textContent = stats.total_products;
    document.getElementById('statStaff').textContent = stats.total_staff;

    // Alert badge
    const badge = document.getElementById('alertBadge');
    if (stats.low_stock > 0) {
      badge.style.display = 'inline';
      badge.textContent = stats.low_stock;
    }

    // Top products
    const topList = document.getElementById('topProductsList');
    if (topProducts.length === 0) {
      topList.innerHTML = '<tr><td colspan="3" class="empty-state"><p>No sales data yet</p></td></tr>';
    } else {
      topList.innerHTML = topProducts.map(p => `
        <tr>
          <td>${p.product_name}</td>
          <td><strong>${p.total_sold}</strong></td>
          <td>${formatCurrency(p.revenue)}</td>
        </tr>
      `).join('');
    }

    // Recent bills
    const billList = document.getElementById('recentBillsList');
    if (recentBills.length === 0) {
      billList.innerHTML = '<tr><td colspan="6" class="empty-state"><p>No bills yet</p></td></tr>';
    } else {
      billList.innerHTML = recentBills.map(b => `
        <tr>
          <td><strong>${b.bill_number}</strong></td>
          <td>${b.customer_name || 'Walk-in'}</td>
          <td>${formatCurrency(b.total)}</td>
          <td><span class="status-badge info">${b.payment_method}</span></td>
          <td>${b.staff_name || '-'}</td>
          <td>${formatDateTime(b.created_at)}</td>
        </tr>
      `).join('');
    }

    // Sales chart
    renderSalesChart('salesChart', salesData);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function renderSalesChart(canvasId, data) {
  const ctx = document.getElementById(canvasId).getContext('2d');
  
  if (salesChartInstance) salesChartInstance.destroy();

  salesChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: data.map(d => {
        const dt = new Date(d.date);
        return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
      }),
      datasets: [{
        label: 'Sales (₹)',
        data: data.map(d => d.total),
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        borderWidth: 2,
        fill: true,
        tension: 0.4,
        pointBackgroundColor: '#3b82f6',
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        pointRadius: 5,
        pointHoverRadius: 7,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1e293b',
          titleColor: '#f1f5f9',
          bodyColor: '#94a3b8',
          borderColor: '#334155',
          borderWidth: 1,
          padding: 12,
          callbacks: {
            label: (ctx) => `Sales: ${formatCurrency(ctx.raw)}`
          }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(148, 163, 184, 0.08)' },
          ticks: { color: '#64748b' }
        },
        y: {
          grid: { color: 'rgba(148, 163, 184, 0.08)' },
          ticks: {
            color: '#64748b',
            callback: v => '₹' + v.toLocaleString()
          }
        }
      }
    }
  });
}

// ── Sales Analytics ──
let salesChartFullInstance = null;

async function loadSalesChart(period) {
  try {
    const data = await API.get(`/dashboard/sales-chart?period=${period}`);
    const ctx = document.getElementById('salesChartFull').getContext('2d');

    if (salesChartFullInstance) salesChartFullInstance.destroy();

    salesChartFullInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: data.map(d => {
          const dt = new Date(d.date);
          return period === 'year'
            ? dt.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })
            : dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
        }),
        datasets: [{
          label: 'Sales (₹)',
          data: data.map(d => d.total),
          backgroundColor: 'rgba(59, 130, 246, 0.6)',
          borderColor: '#3b82f6',
          borderWidth: 1,
          borderRadius: 6,
          hoverBackgroundColor: 'rgba(59, 130, 246, 0.9)',
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#1e293b',
            callbacks: { label: ctx => `Sales: ${formatCurrency(ctx.raw)}` }
          }
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: '#64748b' } },
          y: { grid: { color: 'rgba(148,163,184,0.08)' }, ticks: { color: '#64748b', callback: v => '₹' + v.toLocaleString() } }
        }
      }
    });
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function loadDailySummary() {
  try {
    const date = document.getElementById('summaryDate').value;
    const data = await API.get(`/bills/daily-summary?date=${date}`);
    document.getElementById('dsTotalSales').textContent = formatCurrency(data.total_sales);
    document.getElementById('dsCashSales').textContent = formatCurrency(data.cash_sales);
    document.getElementById('dsUpiSales').textContent = formatCurrency(data.upi_sales);
    document.getElementById('dsCardSales').textContent = formatCurrency(data.card_sales);
    document.getElementById('dsTotalBills').textContent = data.total_bills;
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ── Staff Management ──
async function loadStaff() {
  try {
    const users = await API.get('/users');
    const list = document.getElementById('staffList');
    list.innerHTML = users.map(u => `
      <tr>
        <td><strong>${u.name}</strong></td>
        <td><span style="font-family: var(--font-mono);">${u.username}</span></td>
        <td><span class="status-badge info">${u.role}</span></td>
        <td>${u.phone || '-'}</td>
        <td><span class="status-badge ${u.active ? 'active' : 'inactive'}">${u.active ? 'Active' : 'Inactive'}</span></td>
        <td>${formatDate(u.created_at)}</td>
        <td>
          ${u.role !== 'owner' ? `
            <button class="btn btn-ghost btn-sm" onclick="editStaff(${u.id})">✏️</button>
            <button class="btn btn-ghost btn-sm" onclick="toggleStaffActive(${u.id}, ${u.active})" title="${u.active ? 'Deactivate' : 'Activate'}">
              ${u.active ? '🚫' : '✅'}
            </button>
          ` : '<span style="color:var(--text-muted)">—</span>'}
        </td>
      </tr>
    `).join('');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function openStaffModal(data = null) {
  document.getElementById('staffModalTitle').textContent = data ? 'Edit Staff' : 'Add Staff';
  document.getElementById('staffId').value = data ? data.id : '';
  document.getElementById('staffName').value = data ? data.name : '';
  document.getElementById('staffUsername').value = data ? data.username : '';
  document.getElementById('staffPassword').value = '';
  document.getElementById('staffRole').value = data ? data.role : 'staff';
  document.getElementById('staffPhone').value = data ? (data.phone || '') : '';
  if (data) {
    document.getElementById('staffPassword').placeholder = 'Leave blank to keep current';
  } else {
    document.getElementById('staffPassword').placeholder = 'Login password';
    document.getElementById('staffPassword').required = true;
  }
  openModal('staffModal');
}

async function editStaff(id) {
  try {
    const users = await API.get('/users');
    const user = users.find(u => u.id === id);
    if (user) openStaffModal(user);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function saveStaff() {
  try {
    const id = document.getElementById('staffId').value;
    const data = {
      name: document.getElementById('staffName').value,
      username: document.getElementById('staffUsername').value,
      role: document.getElementById('staffRole').value,
      phone: document.getElementById('staffPhone').value
    };

    const password = document.getElementById('staffPassword').value;
    if (password) data.password = password;

    if (!data.name || !data.username) {
      return showToast('Name and username are required', 'warning');
    }

    if (id) {
      await API.put(`/users/${id}`, data);
      showToast('Staff updated successfully', 'success');
    } else {
      if (!password) return showToast('Password is required for new staff', 'warning');
      data.password = password;
      await API.post('/users', data);
      showToast('Staff created successfully', 'success');
    }

    closeModal('staffModal');
    loadStaff();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function toggleStaffActive(id, currentActive) {
  if (!confirm(currentActive ? 'Deactivate this staff member?' : 'Activate this staff member?')) return;
  try {
    if (currentActive) {
      await API.delete(`/users/${id}`);
      showToast('Staff deactivated', 'success');
    } else {
      await API.put(`/users/${id}`, { active: 1 });
      showToast('Staff activated', 'success');
    }
    loadStaff();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ── Low Stock Alerts ──
async function loadLowStock() {
  try {
    const products = await API.get('/products/low-stock');
    const container = document.getElementById('lowStockList');

    if (products.length === 0) {
      container.innerHTML = '<div class="empty-state"><div class="empty-icon">✅</div><h4>All products are well stocked</h4></div>';
      return;
    }

    container.innerHTML = products.map(p => `
      <div class="low-stock-item">
        <div>
          <strong>${p.name}</strong>
          <div style="font-size:0.75rem; color:var(--text-muted);">${p.code || ''} • ${p.category_name || ''}</div>
        </div>
        <div style="text-align:right;">
          <span class="stock-count">${p.quantity} ${p.unit}</span>
          <div style="font-size:0.7rem; color:var(--text-muted);">Min: ${p.min_stock}</div>
        </div>
      </div>
    `).join('');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ── Expenses ──
async function loadExpenses() {
  try {
    const now = new Date();
    const from = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;
    const data = await API.get(`/expenses?from=${from}`);
    document.getElementById('totalExpenses').textContent = formatCurrency(data.total);

    const list = document.getElementById('expensesList');
    if (data.expenses.length === 0) {
      list.innerHTML = '<tr><td colspan="5" class="empty-state"><p>No expenses this month</p></td></tr>';
    } else {
      list.innerHTML = data.expenses.map(e => `
        <tr>
          <td>${e.title}</td>
          <td><strong>${formatCurrency(e.amount)}</strong></td>
          <td><span class="status-badge info">${e.category}</span></td>
          <td>${formatDate(e.date)}</td>
          <td><button class="btn btn-ghost btn-sm" onclick="deleteExpense(${e.id})">🗑️</button></td>
        </tr>
      `).join('');
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function openExpenseModal() {
  document.getElementById('expTitle').value = '';
  document.getElementById('expAmount').value = '';
  document.getElementById('expCategory').value = 'Rent';
  document.getElementById('expDate').value = new Date().toISOString().split('T')[0];
  openModal('expenseModal');
}

async function saveExpense() {
  try {
    const data = {
      title: document.getElementById('expTitle').value,
      amount: parseFloat(document.getElementById('expAmount').value),
      category: document.getElementById('expCategory').value,
      date: document.getElementById('expDate').value
    };

    if (!data.title || !data.amount) return showToast('Title and amount required', 'warning');

    await API.post('/expenses', data);
    showToast('Expense added', 'success');
    closeModal('expenseModal');
    loadExpenses();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteExpense(id) {
  if (!confirm('Delete this expense?')) return;
  try {
    await API.delete(`/expenses/${id}`);
    showToast('Expense deleted', 'success');
    loadExpenses();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ── All Bills ──
async function loadAllBills() {
  try {
    const data = await API.get('/bills?limit=50');
    renderBillsList('allBillsList', data.bills, true);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function searchBills() {
  try {
    const search = document.getElementById('billSearch').value;
    const from = document.getElementById('billDateFrom').value;
    const to = document.getElementById('billDateTo').value;
    let query = '/bills?limit=50';
    if (search) query += `&search=${encodeURIComponent(search)}`;
    if (from) query += `&from=${from}`;
    if (to) query += `&to=${to}`;

    const data = await API.get(query);
    renderBillsList('allBillsList', data.bills, true);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function renderBillsList(containerId, bills, showStaff = false) {
  const list = document.getElementById(containerId);
  if (bills.length === 0) {
    const cols = showStaff ? 8 : 6;
    list.innerHTML = `<tr><td colspan="${cols}" class="empty-state"><p>No bills found</p></td></tr>`;
    return;
  }

  list.innerHTML = bills.map(b => `
    <tr>
      <td><strong>${b.bill_number}</strong></td>
      <td>${b.customer_name || 'Walk-in'}</td>
      ${showStaff ? '' : ''}
      <td>${formatCurrency(b.total)}</td>
      <td><span class="status-badge info">${b.payment_method}</span></td>
      ${showStaff ? `<td>${b.staff_name || '-'}</td>` : ''}
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
        <div style="display:flex; justify-content:space-between; margin-bottom: 8px;">
          <strong style="font-size:1.125rem;">#${b.bill_number}</strong>
          <span style="color:var(--text-muted);">${formatDateTime(b.created_at)}</span>
        </div>
        <div style="color:var(--text-secondary); font-size:0.875rem;">
          Customer: <strong>${b.customer_name || 'Walk-in'}</strong> ${b.customer_phone ? `| ${b.customer_phone}` : ''}<br>
          Staff: ${b.staff_name || '-'} | Payment: ${b.payment_method}
        </div>
      </div>
      <table>
        <thead><tr><th>Product</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead>
        <tbody>
          ${items.map(i => `
            <tr>
              <td>${i.product_name}<br><span style="font-size:0.7rem;color:var(--text-muted)">${i.product_code || ''}</span></td>
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

function printBill(billId) {
  window.open(`/bill-print/${billId}`, '_blank', 'width=400,height=600');
}

// ── Owner Products View ──
async function loadOwnerProducts() {
  try {
    const data = await API.get('/products?limit=200');
    renderOwnerProducts(data.products);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function ownerSearchProducts() {
  try {
    const search = document.getElementById('ownerProductSearch').value;
    const data = await API.get(`/products?search=${encodeURIComponent(search)}&limit=200`);
    renderOwnerProducts(data.products);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function renderOwnerProducts(products) {
  const list = document.getElementById('ownerProductsList');
  if (products.length === 0) {
    list.innerHTML = '<tr><td colspan="7" class="empty-state"><p>No products found</p></td></tr>';
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
        <strong style="color:${p.quantity <= p.min_stock ? 'var(--danger)' : 'var(--success)'}">${p.quantity}</strong> ${p.unit}
      </td>
      <td>
        <span class="status-badge ${p.quantity <= p.min_stock ? 'warning' : 'active'}">
          ${p.quantity <= p.min_stock ? 'Low Stock' : 'In Stock'}
        </span>
      </td>
    </tr>
  `).join('');
}

// ── Notifications ──
function toggleNotifications() {
  const panel = document.getElementById('notifPanel');
  panel.classList.toggle('show');
}

async function loadNotifications() {
  try {
    const data = await API.get('/dashboard/notifications');
    const badge = document.getElementById('notifBadge');
    const count = data.low_stock_count || 0;

    // Update badge
    if (count > 0) {
      badge.style.display = 'inline';
      badge.textContent = count;
    } else {
      badge.style.display = 'none';
    }

    // Update count text
    document.getElementById('notifCount').textContent = `${count} item${count !== 1 ? 's' : ''}`;

    // Render notification items
    const list = document.getElementById('notifList');
    if (count === 0) {
      list.innerHTML = '<div class="empty-state" style="padding:24px;"><div class="empty-icon">✅</div><p>All products are well stocked!</p></div>';
      return;
    }

    list.innerHTML = data.low_stock.map(p => `
      <div class="notif-item">
        <div class="notif-icon">⚠️</div>
        <div class="notif-content">
          <div class="notif-title">${p.name}</div>
          <div class="notif-detail">${p.code || ''} • ${p.category_name || 'Uncategorized'}</div>
        </div>
        <div style="text-align:right;">
          <span class="stock-count" style="background:var(--danger-bg);color:var(--danger);padding:3px 8px;border-radius:var(--radius-full);font-size:0.75rem;font-weight:700;font-family:var(--font-mono);">${p.quantity} ${p.unit}</span>
          <div class="notif-detail" style="margin-top:2px;">Min: ${p.min_stock}</div>
        </div>
      </div>
    `).join('');
  } catch (err) {
    console.error('Failed to load notifications:', err);
  }
}

