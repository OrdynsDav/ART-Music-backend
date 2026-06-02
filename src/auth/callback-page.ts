export function renderOAuthResultPage(options: {
  success: boolean;
  message: string;
  desktop?: boolean;
}): string {
  const title = options.success ? 'Вы вошли' : 'Не удалось войти';
  const className = options.success ? 'success' : 'error';
  const desktopHint = options.desktop && options.success
    ? ' Можно закрыть это окно и вернуться в приложение.'
    : options.success
      ? ' Перенаправляем…'
      : '';
  const redirectScript = options.success && !options.desktop
    ? "setTimeout(function(){ window.location.href = '/auth/login'; }, 1200);"
    : '';

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>ART Music — вход</title>
  <style>
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
      text-align: center;
    }
    a { color: #ff6b4a; }
    .error { color: #ff6b6b; }
    .success { color: #7ee787; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${title}</h1>
    <p class="${className}">${options.message}${desktopHint}</p>
    ${options.success ? '' : '<p><a href="/auth/login">Вернуться к входу</a></p>'}
  </div>
  <script>${redirectScript}</script>
</body>
</html>`;
}

export function renderCallbackPage(): string {
  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>ART Music — вход</title>
  <style>
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
      text-align: center;
    }
    a { color: #ff6b4a; }
    .error { color: #ff6b6b; }
    .success { color: #7ee787; }
  </style>
</head>
<body>
  <div class="card">
    <h1 id="title">Завершаем вход…</h1>
    <p id="message">Подождите несколько секунд.</p>
    <p id="actions" style="display:none"><a href="/auth/login">Вернуться к входу</a></p>
  </div>
  <script>
    const titleEl = document.getElementById('title');
    const messageEl = document.getElementById('message');
    const actionsEl = document.getElementById('actions');

    function fail(text) {
      titleEl.textContent = 'Не удалось войти';
      messageEl.textContent = text;
      messageEl.className = 'error';
      actionsEl.style.display = 'block';
    }

    function succeed(name, desktopTicket) {
      titleEl.textContent = 'Вы вошли';
      if (desktopTicket) {
        messageEl.textContent = 'Добро пожаловать, ' + name + '. Можно закрыть это окно и вернуться в приложение.';
      } else {
        messageEl.textContent = 'Добро пожаловать, ' + name + '. Перенаправляем…';
        setTimeout(() => { window.location.href = '/auth/login'; }, 1200);
      }
      messageEl.className = 'success';
    }

    const hash = window.location.hash.startsWith('#')
      ? window.location.hash.slice(1)
      : window.location.hash;
    const params = new URLSearchParams(hash);
    const token = params.get('access_token');
    const error = params.get('error');
    const errorDescription = params.get('error_description');
    const desktopTicket = params.get('state');

    if (error) {
      fail(errorDescription || error);
    } else if (!token) {
      fail('Токен не получен. Попробуйте войти ещё раз.');
    } else {
      fetch('/auth/session', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
        .then(async (res) => {
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Session failed');
          const user = data.user || {};
          const name = user.displayName || user.login || user.uid || 'пользователь';

          if (desktopTicket) {
            const complete = await fetch('/auth/desktop/complete', {
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ticket: desktopTicket }),
            });
            if (!complete.ok) {
              const err = await complete.json().catch(() => ({}));
              throw new Error(err.error || 'Desktop handoff failed');
            }
          }

          succeed(name, desktopTicket);
        })
        .catch((err) => fail(err.message || 'Ошибка сохранения сессии'));
    }
  </script>
</body>
</html>`;
}
