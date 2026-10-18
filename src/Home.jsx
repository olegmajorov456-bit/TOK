import "./Home.css";

function calculateAge(birthDate) {
  if (!birthDate) return "";
  const today = new Date();
  const birth = new Date(birthDate);
  let age = today.getFullYear() - birth.getFullYear();
  const monthDifference = today.getMonth() - birth.getMonth();
  if (monthDifference < 0 || (monthDifference === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

function Home({ profile, onDiscovery, onMatches, onProfile, homeSettings, onConfessions, onAchievements, onRandomChat, onInterestRooms, onNotifications, theme = "light" }) {
  const age = calculateAge(profile?.birth_date);
  const title = homeSettings?.title || "Общайся. Знакомься. Находи своих.";
  const description = homeSettings?.description || "ТОК создан специально для студентов ИГЭУ. Здесь всё начинается с обычной симпатии.";

  return (
    <div className={"home-page tok-theme-" + theme}>
      <main className="home-feed">
        <section className="home-welcome">
          <h1>Привет, {profile?.name || "друг"} 👋</h1>
          <p>Здесь можно познакомиться со студентами своего университета.</p>
        </section>


        <section className="home-profile-card" onClick={onProfile}>
          <div className="home-profile-avatar">
            {profile?.avatar_url ? <img src={profile.avatar_url} alt={profile.name} /> : <span>👤</span>}
          </div>
          <div className="home-profile-info">
            <div className="home-profile-label">Мой профиль</div>
            <div className="home-profile-name">{profile?.name || "Без имени"}{age ? <span>, {age}</span> : null}</div>
            <div className="home-profile-meta">{[profile?.faculty, profile?.course ? profile.course + " курс" : ""].filter(Boolean).join(" • ")}</div>
            <div className="home-profile-link">Посмотреть профиль →</div>
          </div>
          <span className="home-profile-chevron" aria-hidden="true"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg></span>
        </section>

        <section className="home-discovery-card">
          <div className="home-card-top"><div className="home-card-avatar"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 8.8c0 5.4-8.8 10.3-8.8 10.3S3.2 14.2 3.2 8.8A4.7 4.7 0 0 1 12 6a4.7 4.7 0 0 1 8.8 2.8Z" /></svg></div><div><strong>Знакомства</strong><span>прямо сейчас</span></div></div>
          <div className="home-discovery-content">
            <h2>Найди кого-нибудь интересного</h2>
            <p>Листай анкеты студентов, ставь лайки и знакомься. Если симпатия взаимна — у вас будет мэтч ❤️</p>
          </div>
          <button className="home-discovery-button" onClick={onDiscovery}>Смотреть анкеты <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg></button>
        </section>

        <section className="home-post-card">
          <div className="home-post-header"><div className="home-post-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 8.8c0 5.4-8.8 10.3-8.8 10.3S3.2 14.2 3.2 8.8A4.7 4.7 0 0 1 12 6a4.7 4.7 0 0 1 8.8 2.8Z" /></svg></div><div><strong>ТОК • ИГЭУ</strong></div></div>
          <h3>{title}</h3>
          <p>{description}</p>
        </section>

        <section className="home-matches-card" onClick={onMatches}>
          <div className="home-matches-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 8.8c0 5.4-8.8 10.3-8.8 10.3S3.2 14.2 3.2 8.8A4.7 4.7 0 0 1 12 6a4.7 4.7 0 0 1 8.8 2.8Z" /></svg></div>
          <div className="home-matches-info"><strong>Мои мэтчи</strong><p>Люди, с которыми у вас взаимная симпатия</p></div>
          <span className="home-arrow" aria-hidden="true"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg></span>
        </section>

        <section className="home-feature-section"><div className="home-feature-heading"><div><h2>Ещё в ТОК</h2></div></div><div className="home-feature-grid">
          <button type="button" className="home-feature-card confession" onClick={onConfessions}><span className="home-feature-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.8A2.8 2.8 0 0 1 6.8 3h10.4A2.8 2.8 0 0 1 20 5.8v6.4a2.8 2.8 0 0 1-2.8 2.8H10l-4.8 3.3.9-3.3A2.8 2.8 0 0 1 4 12.2Z" /><path d="M8.5 8h7M8.5 11h4" /></svg></span><span className="home-feature-copy"><strong>Признания</strong><small>Истории анонимно</small></span><span className="home-feature-arrow">↗</span></button>
          <button type="button" className="home-feature-card random" onClick={onRandomChat}><span className="home-feature-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="4.5" /><path d="M8.6 8.6h.01M15.4 8.6h.01M12 12h.01M8.6 15.4h.01M15.4 15.4h.01" strokeWidth="2.6" /></svg></span><span className="home-feature-copy"><strong>Случайный чат</strong><small>Новый собеседник</small></span><span className="home-feature-arrow">↗</span></button>
          <button type="button" className="home-feature-card rooms" onClick={onInterestRooms}><span className="home-feature-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H9l-3 2.5V13a2 2 0 0 1-2-2Z" /><path d="M18 9.5h.5a1.5 1.5 0 0 1 1.5 1.5v5a1.5 1.5 0 0 1-1.5 1.5H18V20l-3-2.5h-3" /></svg></span><span className="home-feature-copy"><strong>Комнаты</strong><small>Чаты по интересам</small></span><span className="home-feature-arrow">↗</span></button>
          <button type="button" className="home-feature-card achievements" onClick={onAchievements}><span className="home-feature-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4h8v5a4 4 0 0 1-8 0Z" /><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M9 20h6M10 17h4" /></svg></span><span className="home-feature-copy"><strong>Достижения</strong><small>Уровни и значки</small></span><span className="home-feature-arrow">↗</span></button>
          <button type="button" className="home-feature-card notifications" onClick={onNotifications}><span className="home-feature-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4" /></svg></span><span className="home-feature-copy"><strong>Уведомления</strong><small>Вся активность здесь</small></span><span className="home-feature-arrow">↗</span></button>
        </div></section>
        <section className="home-tip"><div><strong>Совет</strong><p>Хорошая фотография, интересы и живое описание помогают находить людей, с которыми действительно есть о чём поговорить.</p></div></section>
      </main>
    </div>
  );
}

export default Home;