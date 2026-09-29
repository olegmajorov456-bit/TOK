import "./Header.css";
import NotificationBell from "./NotificationBell";

function Header({ onHome, onSupport, onProfile, onMatches, profile, user }) {
  return (
    <header className="app-header">
      <button className="app-header-logo" onClick={onHome} aria-label="ТОК — главная">
        <img src="/tok-logo.png" alt="ТОК — Знакомства ИГЭУ" />
      </button>

      <div className="app-header-actions">
        {user && <NotificationBell user={user} onMatches={onMatches} />}

        <button
          className="header-action support"
          onClick={onSupport}
          title="Техническая поддержка"
          aria-label="Техническая поддержка"
        >
          <span className="header-action-icon">💬</span>
          <span className="header-action-text">Поддержка</span>
        </button>

        <button
          className="header-action creator"
          onClick={() =>
            window.open(
              "https://tbank.ru/cf/AWf42bsf9Ry",
              "_blank",
              "noopener,noreferrer"
            )
          }
          title="Поддержать создателя"
          aria-label="Поддержать создателя"
        >
          <span className="header-action-icon">❤️</span>
          <span className="header-action-text">Поддержать</span>
        </button>

        <button className="header-profile-button" onClick={onProfile} title="Мой профиль" aria-label="Мой профиль">
          <span className="header-profile-avatar-wrap">
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt="Мой профиль" className="header-profile-avatar" />
            ) : (
              <span className="header-profile-placeholder">👤</span>
            )}
          </span>
          <span className="header-profile-online" aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}

export default Header;
