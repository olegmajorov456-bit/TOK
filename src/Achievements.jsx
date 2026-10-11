import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import "./Achievements.css";

function localDateKey(date) {
  return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
}

function calculateStreak(rows) {
  const days = new Set((rows || []).map((item) => item.activity_date));
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  let key = localDateKey(cursor);
  if (!days.has(key)) {
    cursor.setDate(cursor.getDate() - 1);
    key = localDateKey(cursor);
    if (!days.has(key)) return 0;
  }
  let streak = 0;
  while (days.has(key)) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
    key = localDateKey(cursor);
  }
  return streak;
}

function makeAchievement(id, icon, title, description, progress, target, xp) {
  const current = Math.max(0, Number(progress) || 0);
  return { id, icon, title, description, current: Math.min(current, target), target, xp, unlocked: current >= target, percent: Math.min(100, Math.round((current / target) * 100)) };
}

function Achievements({ user, theme = "light" }) {
  const [stats, setStats] = useState({ sentLikes: 0, receivedLikes: 0, matches: 0, messages: 0, confessions: 0, streak: 0, profileScore: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadStats() {
    setLoading(true);
    setError("");
    const profileResult = await supabase.from("profiles").select("name,avatar_url,description,hobbies,faculty,course,birth_date").eq("id", user.id).maybeSingle();
    const profile = profileResult.data || {};
    const profileScore = [profile.name, profile.avatar_url, profile.description, profile.hobbies, profile.faculty, profile.course, profile.birth_date].filter((value) => value !== null && value !== undefined && String(value).trim() !== "").length;

    const today = localDateKey(new Date());
    const activityInsert = await supabase.from("user_daily_activity").upsert(
      { user_id: user.id, activity_date: today },
      { onConflict: "user_id,activity_date", ignoreDuplicates: true }
    );

    const queries = await Promise.all([
      supabase.from("likes").select("id", { count: "exact", head: true }).eq("user_id", user.id),
      supabase.from("likes").select("id", { count: "exact", head: true }).eq("liked_user_id", user.id),
      supabase.from("matches").select("id", { count: "exact", head: true }).or("user1_id.eq." + user.id + ",user2_id.eq." + user.id),
      supabase.from("messages").select("id", { count: "exact", head: true }).eq("sender_id", user.id),
      supabase.from("confessions_feed").select("id", { count: "exact", head: true }).eq("is_mine", true),
      supabase.from("user_daily_activity").select("activity_date").eq("user_id", user.id).order("activity_date", { ascending: false }).limit(90),
    ]);

    if (profileResult.error) console.error("Ошибка профиля достижений:", profileResult.error);
    if (activityInsert.error) {
      console.error("Не удалось записать активность:", activityInsert.error);
      setError("Для подсчёта серии активности выполни SQL-миграцию из supabase/migrations/20261011_social_features.sql.");
    }
    const counts = queries.slice(0, 5).map((item) => item.error ? 0 : item.count || 0);
    if (queries.slice(0, 5).some((item) => item.error)) {
      console.error("Ошибка подсчёта достижений:", queries.filter((item) => item.error).map((item) => item.error));
    }
    const streak = queries[5].error ? 0 : calculateStreak(queries[5].data);
    setStats({ sentLikes: counts[0], receivedLikes: counts[1], matches: counts[2], messages: counts[3], confessions: counts[4], streak, profileScore });
    setLoading(false);
  }

  useEffect(() => { loadStats(); }, [user.id]);

  const achievements = [
    makeAchievement("profile", "✦", "Первый шаг", "Создай профиль ТОК", stats.profileScore > 0 ? 1 : 0, 1, 25),
    makeAchievement("profile-full", "🪪", "Профиль мечты", "Заполни все основные поля анкеты", stats.profileScore, 7, 50),
    makeAchievement("like", "❤️", "Открыл сердце", "Поставь первый лайк", stats.sentLikes, 1, 15),
    makeAchievement("like-10", "💘", "Смелее!", "Поставь 10 лайков", stats.sentLikes, 10, 35),
    makeAchievement("liked", "💌", "Кому-то понравился", "Получи первый лайк", stats.receivedLikes, 1, 20),
    makeAchievement("match", "💕", "Взаимно!", "Получи первый мэтч", stats.matches, 1, 30),
    makeAchievement("match-5", "💞", "Сердце компании", "Найди 5 взаимных симпатий", stats.matches, 5, 60),
    makeAchievement("message", "💬", "Первое сообщение", "Начни переписку", stats.messages, 1, 10),
    makeAchievement("messages-25", "🗨️", "Душа переписки", "Отправь 25 сообщений", stats.messages, 25, 40),
    makeAchievement("confession", "🕯️", "Голос ИГЭУ", "Опубликуй первое признание", stats.confessions, 1, 20),
    makeAchievement("confessions-5", "📣", "Своя история", "Опубликуй 5 признаний", stats.confessions, 5, 45),
    makeAchievement("streak", "🔥", "В ритме ТОК", "Заходи 3 дня подряд", stats.streak, 3, 35),
  ];
  const xp = 50 + stats.sentLikes * 3 + stats.receivedLikes * 2 + stats.matches * 25 + stats.messages + stats.confessions * 10 + stats.streak * 5 + achievements.filter((item) => item.unlocked).reduce((sum, item) => sum + item.xp, 0);
  const level = Math.floor(xp / 100) + 1;
  const levelProgress = xp % 100;
  const unlockedCount = achievements.filter((item) => item.unlocked).length;

  return (
    <div className={"feature-page achievements-page tok-theme-" + theme}>
      <main className="feature-container">
        <header className="feature-heading">
          <div><span className="feature-kicker">ТВОЯ АКТИВНОСТЬ</span><h1>Достижения <span>✦</span></h1><p>Знакомься, общайся и открывай новые значки. Всё считается автоматически.</p></div>
          <button type="button" className="feature-quiet-button" onClick={loadStats} disabled={loading}>↻ Обновить</button>
        </header>

        {error && <div className="feature-message feature-message-error" role="alert">{error}</div>}
        <section className="achievement-level-card">
          <div className="achievement-level-main"><div className="achievement-level-icon">🏆</div><div><span>ТЕКУЩИЙ УРОВЕНЬ</span><h2>Уровень {level}</h2><p>{xp} XP · {unlockedCount} из {achievements.length} достижений</p></div></div>
          <div className="achievement-progress-track"><span style={{ width: levelProgress + "%" }} /></div>
          <div className="achievement-progress-labels"><span>До уровня {level + 1}</span><strong>{levelProgress}/100 XP</strong></div>
          <div className="achievement-stat-grid"><div><strong>{stats.matches}</strong><span>мэтчей</span></div><div><strong>{stats.sentLikes}</strong><span>лайков</span></div><div><strong>{stats.messages}</strong><span>сообщений</span></div><div><strong>{stats.streak} дн.</strong><span>серия активности</span></div></div>
        </section>

        <div className="achievement-section-heading"><h2>Коллекция значков</h2><span>{unlockedCount} открыто</span></div>
        {loading ? <div className="feature-loading"><span className="feature-spinner" />Считаем достижения…</div> : (
          <div className="achievement-grid">
            {achievements.map((item) => <article key={item.id} className={"achievement-card " + (item.unlocked ? "unlocked" : "")}>
              <div className="achievement-icon">{item.icon}</div><div className="achievement-copy"><div className="achievement-title-row"><h3>{item.title}</h3><span>{item.unlocked ? "Открыто" : "+" + item.xp + " XP"}</span></div><p>{item.description}</p><div className="achievement-card-progress"><span><i style={{ width: item.percent + "%" }} /></span><small>{item.current}/{item.target}</small></div></div>
            </article>)}
          </div>
        )}
        <p className="achievement-footnote">Очки активности — игровой элемент ТОК, они не влияют на видимость анкеты и не покупают преимущества у других пользователей.</p>
      </main>
    </div>
  );
}

export default Achievements;
