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
          <p className="home-welcome-small">ТОК · ИГЭУ</p>
          <h1>Привет, {profile?.name || "друг"} 👋</h1>
          <p>Здесь можно познакомиться со студентами своего университета.</p>
        </section>


        <section className="home-profile-card" onClick={onProfile}>
          <div className="home-profile-avatar">
            {profile?.avatar_url ? <img src={profile.avatar_url} alt={profile.name} /> : <span>👤</span>}
          </div>
          <div className="home-profile-info">
            <div className="home-profile-name">{profile?.name || "Мой профиль"}{age ? <span>, {age}</span> : null}</div>
            <div className="home-profile-meta">
              {profile?.faculty ? <>🎓 {profile.faculty}</> : null}
              {profile?.course ? <> {profile?.faculty ? " • " : ""}📚 {profile.course} курс</> : null}
            </div>
            <div className="home-profile-link">Посмотреть профиль →</div>
          </div>
        </section>

        <section className="home-discovery-card">
          <div className="home-card-top"><div className="home-card-avatar">🔥</div><div><strong>Знакомства</strong><span>прямо сейчас</span></div></div>
          <div className="home-discovery-content">
            <h2>Найди кого-нибудь интересного</h2>
            <p>Листай анкеты студентов, ставь лайки и знакомься. Если симпатия взаимна — у вас будет мэтч ❤️</p>
          </div>
          <button className="home-discovery-button" onClick={onDiscovery}><span className="home-discovery-button-label">Смотреть анкеты</span><span className="home-discovery-button-arrow" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6" /></svg></span></button>
        </section>

        <section className="home-post-card">
          <div className="home-post-header"><div className="home-post-icon">💕</div><div><strong>ТОК · ИГЭУ</strong><span> · сегодня</span></div></div>
          <h3>{title}</h3>
          <p>{description}</p>
        </section>

        <section className="home-matches-card" onClick={onMatches}>
          <div className="home-matches-icon">💕</div>
          <div className="home-matches-info"><strong>Мои мэтчи</strong><p>Здесь появятся люди, которым понравился ты</p></div>
          <span className="home-arrow">→</span>
        </section>

        <section className="home-feature-section"><div className="home-feature-heading"><div><span>ЕЩЁ БОЛЬШЕ В ТОК</span><h2>Найди свой формат общения</h2></div><span className="home-feature-spark">✦</span></div><div className="home-feature-grid">
          <button type="button" className="home-feature-card confession" onClick={onConfessions}><span className="home-feature-icon">🕯️</span><span className="home-feature-copy"><strong>Признания</strong><small>Истории анонимно</small></span><span className="home-feature-arrow">↗</span></button>
          <button type="button" className="home-feature-card random" onClick={onRandomChat}><span className="home-feature-icon">🎲</span><span className="home-feature-copy"><strong>Случайный чат</strong><small>Новый собеседник</small></span><span className="home-feature-arrow">↗</span></button>
          <button type="button" className="home-feature-card rooms" onClick={onInterestRooms}><span className="home-feature-icon">💬</span><span className="home-feature-copy"><strong>Комнаты</strong><small>Чаты по интересам</small></span><span className="home-feature-arrow">↗</span></button>
          <button type="button" className="home-feature-card achievements" onClick={onAchievements}><span className="home-feature-icon">🏆</span><span className="home-feature-copy"><strong>Достижения</strong><small>Уровни и значки</small></span><span className="home-feature-arrow">↗</span></button>
          <button type="button" className="home-feature-card notifications" onClick={onNotifications}><span className="home-feature-icon">🔔</span><span className="home-feature-copy"><strong>Уведомления</strong><small>Вся активность здесь</small></span><span className="home-feature-arrow">↗</span></button>
        </div></section>
        <section className="home-tip"><span>💡</span><div><strong>Совет</strong><p>Хорошая фотография, интересы и живое описание помогают находить людей, с которыми действительно есть о чём поговорить.</p></div></section>
      </main>
    </div>
  );
}

export default Home;