import "./Header.css";
import NotificationBell from "./NotificationBell";

function Header({ onHome, onSupport, onProfile, onMatches, profile, user }) {
  return (
    <header className="app-header">
      <button className="app-header-logo" onClick={onHome} aria-label="ТОК — главная">
        <span className="tok-brand-mark" aria-hidden="true">
          <svg viewBox="0 0 180 64" role="img">
            <defs>
              <linearGradient id="tokLogoGradient" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#ff4f86" />
                <stop offset="1" stopColor="#e83c6d" />
              </linearGradient>
            </defs>
            <path d="M32 13c-10-8-24-1-24 11 0 18 24 29 24 29s24-11 24-29c0-12-14-19-24-11Z" fill="url(#tokLogoGradient)"/>
            <circle cx="24" cy="25" r="3" fill="#fff" opacity=".9"/>
            <text x="68" y="43" fill="currentColor" fontSize="39" fontWeight="800" fontFamily="Arial, sans-serif" letterSpacing="-2">ТОК</text>
          </svg>
        </span>
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
        </button>
      </div>
    </header>
  );
}

export default Header;
