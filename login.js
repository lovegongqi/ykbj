(function () {
  const form = document.getElementById('loginForm');
  const username = document.getElementById('username');
  const password = document.getElementById('password');
  const error = document.getElementById('loginError');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    error.textContent = '';
    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username.value.trim(),
          password: password.value
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || '登录失败');
      window.location.href = 'index.html';
    } catch (err) {
      error.textContent = err.message || '登录失败';
    }
  });
})();
