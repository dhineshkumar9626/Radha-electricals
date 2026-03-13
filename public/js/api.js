// API Helper - Handles all fetch requests with JWT auth
const API_BASE = '/api';

function getToken() {
  return localStorage.getItem('token');
}

function getUser() {
  const user = localStorage.getItem('user');
  return user ? JSON.parse(user) : null;
}

function setAuth(token, user) {
  localStorage.setItem('token', token);
  localStorage.setItem('user', JSON.stringify(user));
}

function clearAuth() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
}

async function api(endpoint, options = {}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers
    });

    const data = await response.json();

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        clearAuth();
        window.location.href = '/';
        return;
      }
      throw new Error(data.error || 'Request failed');
    }

    return data;
  } catch (err) {
    if (err.message === 'Failed to fetch') {
      throw new Error('Cannot connect to server. Please check if server is running.');
    }
    throw err;
  }
}

// Convenience methods
const API = {
  get: (endpoint) => api(endpoint),
  post: (endpoint, data) => api(endpoint, { method: 'POST', body: JSON.stringify(data) }),
  put: (endpoint, data) => api(endpoint, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (endpoint) => api(endpoint, { method: 'DELETE' }),
};

// Toast notification
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${type === 'success' ? '✅' : type === 'error' ? '❌' : type === 'warning' ? '⚠️' : 'ℹ️'}</span> ${message}`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('removing');
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// Format currency (Indian Rupees)
function formatCurrency(amount) {
  return '₹' + Number(amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Format date
function formatDate(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatDateTime(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

// Check if logged in and redirect
function requireAuth(allowedRoles) {
  const token = getToken();
  const user = getUser();

  if (!token || !user) {
    window.location.href = '/';
    return false;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    window.location.href = user.role === 'owner' ? '/owner' : '/staff';
    return false;
  }

  return true;
}
