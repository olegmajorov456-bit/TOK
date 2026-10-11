export default function AppUpdateAdmin() {
  const workflowUrl = "https://github.com/olegmajorov456-bit/TOK/actions/workflows/android.yml";
  const releasesUrl = "https://github.com/olegmajorov456-bit/TOK/releases";

  return (
    <section className="admin-section">
      <div className="admin-section-heading">
        <div>
          <span className="admin-section-kicker">ANDROID</span>
          <h2>Сборка и обновление приложения</h2>
        </div>
      </div>

      <div style={{ background: "var(--admin-card)", border: "1px solid var(--admin-border)", borderRadius: 20, padding: 18, boxShadow: "var(--admin-shadow)" }}>
        <p style={{ color: "var(--admin-muted)", fontSize: 13, lineHeight: 1.6, marginTop: 0 }}>
          ТОК проверяет обновления по GitHub Releases. Новая версия APK создаётся автоматически после изменений в Android-коде или запуска сборки вручную. Загрузка APK в настройки сайта не публикует релиз GitHub, поэтому старый экран загрузки был ненадёжным.
        </p>

        <div style={{ margin: "16px 0", padding: 14, borderRadius: 14, background: "var(--admin-input)", color: "var(--admin-text)", fontSize: 12, lineHeight: 1.65 }}>
          <strong>Перед первой сборкой с постоянной подписью</strong>
          <p style={{ margin: "7px 0 0", color: "var(--admin-muted)" }}>
            В GitHub откройте Settings → Secrets and variables → Actions и добавьте секреты
            TOK_ANDROID_KEYSTORE_BASE64, TOK_ANDROID_KEYSTORE_PASSWORD, TOK_ANDROID_KEY_ALIAS и TOK_ANDROID_KEY_PASSWORD.
            Затем вернитесь в Actions и нажмите Run workflow. Пока секреты не заданы, сборка APK намеренно остановится на проверке подписи.
          </p>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 9 }}>
          <a href={workflowUrl} target="_blank" rel="noreferrer" className="admin-refresh" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}>
            Открыть сборки
          </a>
          <a href={releasesUrl} target="_blank" rel="noreferrer" className="admin-refresh" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}>
            Открыть релизы
          </a>
        </div>
      </div>
    </section>
  );
}
