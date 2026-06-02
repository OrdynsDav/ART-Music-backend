export function renderDesktopVerifyPage(
  userCode: string,
  verificationUrl: string,
): string {
  const formatted = userCode.length === 8
    ? `${userCode.slice(0, 4)}-${userCode.slice(4)}`
    : userCode;

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>ART Music — подтверждение входа</title>
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
      width: min(440px, calc(100vw - 32px));
      padding: 32px;
      border-radius: 20px;
      background: #18181d;
      border: 1px solid #2a2a32;
    }
    h1 { margin: 0 0 12px; font-size: 1.4rem; }
    p { margin: 0 0 16px; color: #a1a1aa; line-height: 1.5; }
    .code {
      margin: 16px 0 24px;
      font-size: 2rem;
      font-weight: 700;
      letter-spacing: 0.15em;
      text-align: center;
      color: #ff6b4a;
    }
    .btn {
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
    ol { margin: 0; padding-left: 20px; color: #a1a1aa; line-height: 1.6; }
    li { margin-bottom: 8px; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Подтвердите вход</h1>
    <p>Вход по телефону или паролю на Яндексе — это нормально. Но для приложения
       нужен ещё один шаг: подтвердить устройство.</p>
    <ol>
      <li>Нажмите кнопку ниже</li>
      <li>Войдите в Яндекс (телефон, логин или пароль)</li>
      <li>Если попросит — введите код: <strong>${formatted}</strong></li>
      <li>Нажмите «Разрешить» / «Продолжить»</li>
    </ol>
    <div class="code">${formatted}</div>
    <a class="btn" href="${verificationUrl}">Открыть подтверждение на Яндексе</a>
    <p style="margin-top:20px;font-size:0.9rem;color:#71717a">
      После подтверждения вернитесь в ART Music — вход завершится автоматически.
    </p>
  </div>
</body>
</html>`;
}
