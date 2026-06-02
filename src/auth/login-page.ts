export function renderLoginPage(): string {
  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>ART Music — вход</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      font-family: system-ui, -apple-system, sans-serif;
      background: #0f0f12;
      color: #f5f5f7;
    }
    .card {
      width: min(420px, calc(100vw - 32px));
      padding: 32px;
      border-radius: 20px;
      background: #18181d;
      border: 1px solid #2a2a32;
      box-shadow: 0 24px 80px rgba(0, 0, 0, 0.45);
    }
    h1 { margin: 0 0 8px; font-size: 1.5rem; }
    p { margin: 0 0 24px; color: #a1a1aa; line-height: 1.5; }
    .login-link {
      display: block;
      width: 100%;
      border: 0;
      border-radius: 12px;
      padding: 14px 18px;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      background: #fc3f1d;
      color: white;
      text-align: center;
      text-decoration: none;
    }
    .login-link.disabled {
      opacity: 0.6;
      pointer-events: none;
      cursor: default;
    }
    .status { margin-top: 16px; color: #a1a1aa; min-height: 1.25rem; line-height: 1.4; }
    .success { color: #7ee787; }
  </style>
</head>
<body>
  <div class="card">
    <h1>ART Music</h1>
    <p>Войдите через аккаунт Яндекса, чтобы слушать музыку и видеть свои плейлисты.</p>
    <a id="loginLink" class="login-link" href="/auth/yandex">Войти через Яндекс</a>
    <div class="status" id="status"></div>
  </div>

  <script>
    const loginLink = document.getElementById('loginLink');
    const statusEl = document.getElementById('status');

    fetch('/auth/me', { credentials: 'include' })
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (data?.authenticated) {
          statusEl.textContent = 'Вы уже вошли как ' + (data.user.displayName || data.user.login || data.user.uid);
          statusEl.className = 'status success';
          loginLink.textContent = 'Вы авторизованы';
          loginLink.classList.add('disabled');
        }
      })
      .catch(() => {});
  </script>
</body>
</html>`;
}
