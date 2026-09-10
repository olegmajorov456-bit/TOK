import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import "./Header.css";

function Header({ onHome, onSupport, onProfile, profile }) {
  const [headerProfile, setHeaderProfile] = useState(profile || null);

  useEffect(() => {
    setHeaderProfile(profile || null);
  }, [profile]);

  useEffect(() => {
    if (profile?.avatar_url || !profile?.id) return;

    async function loadAvatar() {
      const { data } = await supabase.from("profiles").select("avatar_url, name").eq("id", profile.id).maybeSingle();
      if (data) setHeaderProfile((current) => ({ ...current, ...data }));
    }

    loadAvatar();
  }, [profile]);

  return (
    <header className="app-header">
      <button className="app-header-logo" onClick={onHome} aria-label="ТОК — главная">
        <img src="/tok-logo.png" alt="ТОК — Знакомства в ИГЭУ" />
      </button>

      <div className="app-header-actions">
        <button className="header-action support" onClick={onSupport} title="Техническая поддержка" aria-label="Техническая поддержка">
          <span className="header-action-icon">💬</span>
          <span className="header-action-text">Поддержка</span>
        </button>

        <button className="header-action creator" onClick={() => window.open("https://tbank.ru/cf/AWf42bsf9Ry", "_blank", "noopener,noreferrer")} title="Поддержать создателя" aria-label="Поддержать создателя">
          <span className="header-action-icon">❤️</span>
          <span className="header-action-text">Поддержать</span>
        </button>

        <button className="header-profile-button" onClick={onProfile} title="Мой профиль" aria-label="Мой профиль">
          {headerProfile?.avatar_url ? (
            <img src={headerProfile.avatar_url} alt="Мой профиль" className="header-profile-avatar" />
          ) : (
            <span className="header-profile-placeholder">👤</span>
          )}
        </button>
      </div>
    </header>
  );
}

export default Header;
