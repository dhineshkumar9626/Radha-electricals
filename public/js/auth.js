// Auth Logic - Login form handler
document.addEventListener('DOMContentLoaded', () => {
  // If already logged in, redirect
  const user = getUser();
  const token = getToken();

  if (token && user) {
    if (user.role === 'owner') {
      window.location.href = '/owner';
    } else {
      window.location.href = '/staff';
    }
    return;
  }

  // Login form handler
  const loginForm = document.getElementById('loginForm');
  const loginError = document.getElementById('loginError');
  const loginBtn = document.getElementById('loginBtn');

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.style.display = 'none';
    loginBtn.disabled = true;
    loginBtn.innerHTML = '<span class="spinner"></span> Signing in...';

    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;

    try {
      const data = await API.post('/auth/login', { username, password });

      setAuth(data.token, data.user);
      showToast(`Welcome back, ${data.user.name}!`, 'success');

      setTimeout(() => {
        if (data.user.role === 'owner') {
          window.location.href = '/owner';
        } else {
          window.location.href = '/staff';
        }
      }, 500);
    } catch (err) {
      loginError.textContent = err.message;
      loginError.style.display = 'block';
      loginBtn.disabled = false;
      loginBtn.innerHTML = 'Sign In';
    }
  });
});
