import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";
import "./Discovery.css";
import ReportModal from "./ReportModal";

const FACULTIES = ["ФЭУ", "ИВТФ", "ИФФ", "ЭМФ", "ТЭФ", "ЭЭФ"];
const COURSES = ["1", "2", "3", "4", "5", "6"];

function calculateAge(birthDate) {
  if (!birthDate) return "";
  const today = new Date();
  const birth = new Date(`${birthDate}T00:00:00`);
  let age = today.getFullYear() - birth.getFullYear();
  const monthDifference = today.getMonth() - birth.getMonth();
  if (monthDifference < 0 || (monthDifference === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

function getHobbies(profile) {
  if (!profile?.hobbies) return [];
  if (Array.isArray(profile.hobbies)) {
    return profile.hobbies.flatMap((item) => String(item).split(",")).map((item) => item.trim()).filter(Boolean);
  }

  let value = String(profile.hobbies).trim();
  if (!value || value === "[]" || value === "{}") return [];

  if (value.startsWith("{") && value.endsWith("}")) {
    value = value.slice(1, -1);
  }

  if (value.startsWith("[") && value.endsWith("]")) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.flatMap((item) => String(item).split(",")).map((item) => item.trim()).filter(Boolean);
      }
    } catch {
      value = value.slice(1, -1);
    }
  }

  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function Discovery({ user, onHome }) {
  const [allProfiles, setAllProfiles] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState({ gender: "", faculty: "", course: "", minAge: "", maxAge: "" });
  const [preferredGender, setPreferredGender] = useState("");
  const [refreshLoading, setRefreshLoading] = useState(false);
  const [history, setHistory] = useState([]);

  useEffect(() => {
    loadProfiles();
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel(`discovery-matches-${user.id}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "matches",
      }, (payload) => {
        const match = payload.new;
        const otherUserId = match.user1_id === user.id ? match.user2_id : match.user1_id;
        if (!otherUserId) return;

        setAllProfiles((current) => current.filter((item) => item.id !== otherUserId));
        setProfiles((current) => current.filter((item) => item.id !== otherUserId));
        setHistory((current) => current.filter((item) => item.id !== otherUserId));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user.id]);

  function shuffleProfiles(items) {
    const result = [...items];
    for (let index = result.length - 1; index > 0; index -= 1) {
      const randomIndex = Math.floor(Math.random() * (index + 1));
      [result[index], result[randomIndex]] = [result[randomIndex], result[index]];
    }
    return result;
  }

  function filterProfiles(items, activeFilters = filters, preference = preferredGender) {
    const minAge = activeFilters.minAge ? Number(activeFilters.minAge) : null;
    const maxAge = activeFilters.maxAge ? Number(activeFilters.maxAge) : null;
    const genderFilter = activeFilters.gender || preference;

    return items.filter((profile) => {
      const age = calculateAge(profile.birth_date);
      if (genderFilter && profile.gender !== genderFilter) return false;
      if (activeFilters.faculty && profile.faculty !== activeFilters.faculty) return false;
      if (activeFilters.course && String(profile.course) !== String(activeFilters.course)) return false;
      if (minAge !== null && (!age || age < minAge)) return false;
      if (maxAge !== null && (!age || age > maxAge)) return false;
      return true;
    });
  }

  async function loadProfiles() {
    setLoading(true);
    setCurrentIndex(0);

    const { data: myProfile, error: myProfileError } = await supabase
      .from("profiles")
      .select("gender, looking_for")
      .eq("id", user.id)
      .single();

    if (myProfileError) {
      console.error("Ошибка загрузки своего профиля:", myProfileError);
      setLoading(false);
      return;
    }

    const [{ data: outgoingLikes, error: outgoingLikesError }, { data: myMatches, error: matchesError }] = await Promise.all([
      supabase.from("likes").select("liked_user_id").eq("user_id", user.id),
      supabase.from("matches").select("user1_id,user2_id").or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`),
    ]);

    if (outgoingLikesError) console.error("Ошибка загрузки поставленных лайков:", outgoingLikesError);
    if (matchesError) console.error("Ошибка загрузки мэтчей:", matchesError);

    const outgoingLikeIds = new Set((outgoingLikes || []).map((item) => item.liked_user_id));
    const profilePreference = myProfile.looking_for === "male" || myProfile.looking_for === "female" ? myProfile.looking_for : "";
    setPreferredGender(profilePreference);
    setFilters((current) => ({ ...current, gender: current.gender || profilePreference }));
    const matchedUserIds = new Set((myMatches || []).map((match) => (
      match.user1_id === user.id ? match.user2_id : match.user1_id
    )));

    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .neq("id", user.id)
      .eq("is_blocked", false);

    if (error) {
      console.error("Ошибка загрузки анкет:", error);
      setLoading(false);
      return;
    }

    const candidates = (data || []).filter(
      (profile) => !outgoingLikeIds.has(profile.id) && !matchedUserIds.has(profile.id)
    );

    setAllProfiles(candidates);
    setProfiles(shuffleProfiles(filterProfiles(candidates, { ...filters, gender: filters.gender || profilePreference }, profilePreference)));
    setHistory([]);
    setLoading(false);
  }
  function applyFilters() {
    const minAge = filters.minAge ? Number(filters.minAge) : null;
    const maxAge = filters.maxAge ? Number(filters.maxAge) : null;
    if (minAge !== null && maxAge !== null && minAge > maxAge) {
      setFiltersOpen(false);
      return;
    }

    const filtered = filterProfiles(allProfiles, filters);
    setProfiles(shuffleProfiles(filtered));
    setCurrentIndex(0);
    setHistory([]);
    setFiltersOpen(false);
  }
  function resetFilters() {
    const reset = { gender: preferredGender, faculty: "", course: "", minAge: "", maxAge: "" };
    setFilters(reset);
    setProfiles(shuffleProfiles(filterProfiles(allProfiles, reset, preferredGender)));
    setCurrentIndex(0);
    setFiltersOpen(false);
  }

  function handleSkip() {
    if (actionLoading) return;
    const current = profiles[currentIndex];
    if (!current || profiles.length === 0) return;

    setActionLoading(true);
    setHistory((items) => [...items, current]);

    // Пропуск не удаляет анкету из выдачи: она уходит в конец очереди
    // и снова появится после остальных. Анкета исчезает навсегда только после лайка/мэтча.
    setProfiles((currentProfiles) => {
      if (currentProfiles.length <= 1) return currentProfiles;
      const next = [...currentProfiles];
      const [skipped] = next.splice(currentIndex, 1);
      next.push(skipped);
      return next;
    });
    setCurrentIndex((index) => (profiles.length <= 1 ? 0 : index >= profiles.length - 1 ? 0 : index));
    setActionLoading(false);
  }

  function handleUndo() {
    if (actionLoading || history.length === 0) return;
    const previous = history[history.length - 1];
    setHistory((items) => items.slice(0, -1));

    const previousIndex = profiles.findIndex((item) => item.id === previous.id);
    if (previousIndex >= 0) setCurrentIndex(previousIndex);
  }

  async function handleLike() {
    const profile = profiles[currentIndex];
    if (!profile || actionLoading) return;
    setActionLoading(true);
    const { error: likeError } = await supabase.from("likes").insert({ user_id: user.id, liked_user_id: profile.id });
    if (likeError && likeError.code !== "23505") {
      console.error("Ошибка лайка:", likeError);
      setActionLoading(false);
      return;
    }
    const { data: matchId, error: matchError } = await supabase.rpc("create_match_if_mutual", { target_user_id: profile.id });
    if (matchError) console.error("Ошибка создания мэтча:", matchError);
    if (matchId) alert(`💕 У вас взаимная симпатия с ${profile.name}!`);

    setHistory((current) => current.filter((item) => item.id !== profile.id));
    setAllProfiles((current) => current.filter((item) => item.id !== profile.id));
    setProfiles((current) => {
      const next = current.filter((item) => item.id !== profile.id);
      if (next.length === 0) return [];
      const nextIndex = currentIndex >= next.length ? 0 : currentIndex;
      if (nextIndex === 0 && current.length > 1) return [next[0], ...shuffleProfiles(next.slice(1))];
      return next;
    });
    setCurrentIndex((index) => {
      const remaining = profiles.length - 1;
      return remaining <= 0 || index >= remaining ? 0 : index;
    });
    setActionLoading(false);
  }

  async function handleRefreshAll() {
    if (refreshLoading) return;
    setRefreshLoading(true);
    await loadProfiles();
    setRefreshLoading(false);
  }

  const activeFiltersCount = useMemo(() => Object.values(filters).filter(Boolean).length, [filters]);
  if (loading) return <div className="discovery-page"><main className="discovery-container"><div className="discovery-loading"><div className="loading-spinner" /><p>{refreshLoading ? "Обновляем все анкеты..." : "Загрузка анкет..."}</p></div></main></div>;

  const profile = profiles[currentIndex];
  const profileHobbies = getHobbies(profile);

  return <div className="discovery-page"><main className="discovery-container">
    <div className="discovery-header"><div><h1>Знакомства</h1><p>Найди кого-нибудь из ИГЭУ 💕</p></div><button className="filters-toggle" onClick={() => setFiltersOpen(!filtersOpen)}>⚙️ Фильтры {activeFiltersCount > 0 && <span>{activeFiltersCount}</span>}</button></div>
    {filtersOpen && <section className="filters-panel"><div className="filter-grid">
      <label>Пол<select value={filters.gender} onChange={(e) => setFilters({ ...filters, gender: e.target.value })}><option value="">Любой</option><option value="female">Девушки</option><option value="male">Парни</option></select></label>
      <label>Факультет<select value={filters.faculty} onChange={(e) => setFilters({ ...filters, faculty: e.target.value })}><option value="">Любой</option>{FACULTIES.map((faculty) => <option key={faculty} value={faculty}>{faculty}</option>)}</select></label>
      <label>Курс<select value={filters.course} onChange={(e) => setFilters({ ...filters, course: e.target.value })}><option value="">Любой</option>{COURSES.map((course) => <option key={course} value={course}>{course} курс</option>)}</select></label>
      <label>Возраст от<input type="number" min="16" max="100" placeholder="16" value={filters.minAge} onChange={(e) => setFilters({ ...filters, minAge: e.target.value })} /></label>
      <label>Возраст до<input type="number" min="16" max="100" placeholder="100" value={filters.maxAge} onChange={(e) => setFilters({ ...filters, maxAge: e.target.value })} /></label>
    </div><div className="filters-actions"><button onClick={applyFilters}>Показать анкеты</button><button className="filters-reset" onClick={resetFilters}>Сбросить</button></div></section>}
    {!profile ? <div className="discovery-empty"><div className="empty-icon">💕</div><h2>Анкеты закончились</h2><p>{activeFiltersCount ? "По выбранным фильтрам подходящих анкет пока нет." : "Здесь больше нет анкет, которые вы ещё не лайкнули. Можно обновить список после новых анкет."}</p><button className="empty-home-button" onClick={onHome}><span>⌂</span>Вернуться домой</button><button className="empty-refresh-button" onClick={handleRefreshAll} disabled={refreshLoading}>{refreshLoading ? "Обновляем..." : "Обновить анкеты"}</button></div> : <div className="discovery-card">
      <div className="discovery-photo"><div className="discovery-photo-top"></div>{profile.avatar_url ? <img src={profile.avatar_url} alt={profile.name} /> : <div className="no-photo"><span>👤</span></div>}<div className="discovery-gradient" /><div className="discovery-info"><h2>{profile.name}{calculateAge(profile.birth_date) ? `, ${calculateAge(profile.birth_date)}` : ""}</h2><div className="profile-meta">{profile.faculty && <span>🎓 {profile.faculty}</span>}{profile.course && <span>📚 {profile.course} курс</span>}</div></div></div>
      <div className="discovery-content">{profileHobbies.length > 0 && <div className="hobbies">{profileHobbies.map((hobby) => <span key={hobby}>{hobby}</span>)}</div>}<p className="discovery-description">{profile.description || "Пользователь пока ничего не написал о себе."}</p></div>
      <div className="discovery-actions">
        <button className="discovery-button undo" onClick={handleUndo} disabled={actionLoading} title="Вернуться к предыдущей анкете" aria-label="Назад"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 7 4 12l5 5M4 12h10a6 6 0 0 1 6 6" /></svg></button>
        <button className="discovery-button skip" onClick={handleSkip} disabled={actionLoading} title="Пропустить анкету" aria-label="Пропустить"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg></button>
        <button className="discovery-button like" onClick={handleLike} disabled={actionLoading} title="Поставить лайк" aria-label="Нравится"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 8.8c0 5.4-8.8 10.3-8.8 10.3S3.2 14.2 3.2 8.8A4.7 4.7 0 0 1 12 6a4.7 4.7 0 0 1 8.8 2.8Z" /></svg></button>
        <button className="discovery-report-button" onClick={() => setReportOpen(true)}>Пожаловаться</button>
      </div>
    </div>}
  </main>{reportOpen && profile && <ReportModal user={user} profile={profile} onClose={() => setReportOpen(false)} />}</div>;
}

export default Discovery;
