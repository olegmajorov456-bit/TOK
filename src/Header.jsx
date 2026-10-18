import "./Header.css";
import Logo from "./Logo";
import NotificationBell from "./NotificationBell";

function Header({ onHome, onProfile, onLikes, onMatches, onNotifications, profile, user }) {
  return (
    <header className="app-header">
      <button className="app-header-logo" onClick={onHome} aria-label="ТОК — главная">
        <Logo className="app-header-logo-image" />
      </button>

      <div className="app-header-actions">
        {user && <NotificationBell user={user} onMatches={onMatches} onAllNotifications={onNotifications} />}

        <button className="header-action likes" onClick={onLikes} title="Лайки" aria-label="Лайки">
          <span className="header-action-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 8.8c0 5.4-8.8 10.3-8.8 10.3S3.2 14.2 3.2 8.8A4.7 4.7 0 0 1 12 6a4.7 4.7 0 0 1 8.8 2.8Z" /></svg></span>
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