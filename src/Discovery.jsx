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
  if (Array.isArray(profile.hobbies)) return profile.hobbies.filter(Boolean).map(String).map((item) => item.trim()).filter(Boolean);
  return String(profile.hobbies).split(",").map((item) => item.trim()).filter(Boolean);
}

function Discovery({ user, onHome }) {
  const [allProfiles, setAllProfiles] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [likedBy, setLikedBy] = useState(new Set());
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState({ gender: "", faculty: "", course: "", minAge: "", maxAge: "" });
  const [refreshLoading, setRefreshLoading] = useState(false);

  useEffect(() => { loadProfiles(); }, []);

  async function loadIncomingLikes() {
    const { data, error } = await supabase.from("likes").select("user_id").eq("liked_user_id", user.id);
    if (error) {
      console.error("Ошибка загрузки входящих лайков:", error);
      return new Set();
    }
    const ids = new Set((data || []).map((item) => item.user_id));
    setLikedBy(ids);
    return ids;
  }

  function shuffleProfiles(items) {
    const result = [...items];
    for (let index = result.length - 1; index > 0; index -= 1) {
      const randomIndex = Math.floor(Math.random() * (index + 1));
      [result[index], result[randomIndex]] = [result[randomIndex], result[index]];
    }
    return result;
  }

  async function loadProfiles() {
    setLoading(true);
    setCurrentIndex(0);

    const { data: myProfile, error: myProfileError } = await supabase.from("profiles").select("gender, looking_for").eq("id", user.id).single();
    if (myProfileError) {
      console.error("Ошибка загрузки своего профиля:", myProfileError);
      setLoading(false);
      return;
    }

    const incomingLikeIds = await loadIncomingLikes();

    const { data: outgoingLikes, error: outgoingLikesError } = await supabase
      .from("likes")
      .select("liked_user_id")
      .eq("user_id", user.id);

    if (outgoingLikesError) {
      console.error("Ошибка загрузки поставленных лайков:", outgoingLikesError);
    }

    const outgoingLikeIds = new Set((outgoingLikes || []).map((item) => item.liked_user_id));

    let query = supabase.from("profiles").select("*").neq("id", user.id).eq("is_blocked", false);
    if (myProfile.looking_for === "male" || myProfile.looking_for === "female") query = query.eq("gender", myProfile.looking_for);

    const { data, error } = await query;
    if (error) {
      console.error("Ошибка загрузки анкет:", error);
      setLoading(false);
      return;
    }

    const candidates = data || [];
    const resultProfiles = candidates.filter(
      (profile) => !outgoingLikeIds.has(profile.id)
    );

    const shuffledProfiles = shuffleProfiles(resultProfiles);
    setAllProfiles(resultProfiles);
    setProfiles(shuffledProfiles);
    setLoading(false);
  }

  function applyFilters() {
    const minAge = filters.minAge ? Number(filters.minAge) : null;
    const maxAge = filters.maxAge ? Number(filters.maxAge) : null;
    const filtered = allProfiles.filter((profile) => {
      const age = calculateAge(profile.birth_date);
      if (filters.gender && profile.gender !== filters.gender) return false;
      if (filters.faculty && profile.faculty !== filters.faculty) return false;
      if (filters.course && String(profile.course) !== String(filters.course)) return false;
      if (minAge !== null && (!age || age < minAge)) return false;
      if (maxAge !== null && (!age || age > maxAge)) return false;
      return true;
    });
    setProfiles(shuffleProfiles(filtered));
    setCurrentIndex(0);
    setFiltersOpen(false);
  }

  function resetFilters() {
    setFilters({ gender: "", faculty: "", course: "", minAge: "", maxAge: "" });
    setProfiles(shuffleProfiles(allProfiles));
    setCurrentIndex(0);
    setFiltersOpen(false);
  }

  async function markProfileAsViewed(profileId) {
    const { error } = await supabase.from("profile_views").insert({ viewer_id: user.id, viewed_profile_id: profileId });
    if (error && error.code !== "23505") console.error("Ошибка сохранения просмотра:", error);
  }

  async function handleSkip() {
    if (actionLoading) return;
    const profile = profiles[currentIndex];
    if (!profile) return;
    setActionLoading(true);
    await markProfileAsViewed(profile.id);

    setProfiles((current) => {
      if (current.length <= 1) return shuffleProfiles(current);
      if (currentIndex < current.length - 1) return current;

      const reshuffled = shuffleProfiles(current);
      return reshuffled;
    });

    setCurrentIndex((index) => {
      if (profiles.length <= 1) return 0;
      return index < profiles.length - 1 ? index + 1 : 0;
    });
    setActionLoading(false);
  }

  async function handleLike() {
    const profile = profiles[currentIndex];
    if (!profile || actionLoading) return;
    setActionLoading(true);
    await markProfileAsViewed(profile.id);
    const { error: likeError } = await supabase.from("likes").insert({ user_id: user.id, liked_user_id: profile.id });
    if (likeError && likeError.code !== "23505") {
      console.error("Ошибка лайка:", likeError);
      setActionLoading(false);
      return;
    }
    const { data: matchId, error: matchError } = await supabase.rpc("create_match_if_mutual", { target_user_id: profile.id });
    if (matchError) console.error("Ошибка создания мэтча:", matchError);
    if (matchId) alert(`💕 У вас взаимная симпатия с ${profile.name}!`);
    setLikedBy((current) => new Set(current).add(profile.id));

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
  const hasIncomingLike = profile ? likedBy.has(profile.id) : false;

  return <div className="discovery-page"><main className="discovery-container">
    <div className="discovery-header"><div><h1>Знакомства</h1><p>Найди кого-нибудь из ИГЭУ 💕</p></div><button className="filters-toggle" onClick={() => setFiltersOpen(!filtersOpen)}>⚙️ Фильтры {activeFiltersCount > 0 && <span>{activeFiltersCount}</span>}</button></div>
    {filtersOpen && <section className="filters-panel"><div className="filter-grid">
      <label>Пол<select value={filters.gender} onChange={(e) => setFilters({ ...filters, gender: e.target.value })}><option value="">Любой</option><option value="female">Девушки</option><option value="male">Парни</option></select></label>
      <label>Факультет<select value={filters.faculty} onChange={(e) => setFilters({ ...filters, faculty: e.target.value })}><option value="">Любой</option>{FACULTIES.map((faculty) => <option key={faculty} value={faculty}>{faculty}</option>)}</select></label>
      <label>Курс<select value={filters.course} onChange={(e) => setFilters({ ...filters, course: e.target.value })}><option value="">Любой</option>{COURSES.map((course) => <option key={course} value={course}>{course} курс</option>)}</select></label>
      <label>Возраст от<input type="number" min="16" max="100" placeholder="16" value={filters.minAge} onChange={(e) => setFilters({ ...filters, minAge: e.target.value })} /></label>
      <label>Возраст до<input type="number" min="16" max="100" placeholder="100" value={filters.maxAge} onChange={(e) => setFilters({ ...filters, maxAge: e.target.value })} /></label>
    </div><div className="filters-actions"><button onClick={applyFilters}>Показать анкеты</button><button className="filters-reset" onClick={resetFilters}>Сбросить</button></div></section>}
    {!profile ? <div className="discovery-empty"><div className="empty-icon">💕</div><h2>Анкеты закончились</h2><p>{activeFiltersCount ? "По выбранным фильтрам подходящих анкет пока нет." : "Ты просмотрел все доступные анкеты. Продолжай листать — порядок анкет перемешается заново."}</p><button className="empty-home-button" onClick={onHome}><span>⌂</span>Вернуться домой</button><button className="empty-refresh-button" onClick={handleRefreshAll} disabled={refreshLoading}>{refreshLoading ? "Обновляем..." : "Обновить анкеты"}</button></div> : <div className="discovery-card">
      <div className="discovery-photo">{profile.avatar_url ? <img src={profile.avatar_url} alt={profile.name} /> : <div className="no-photo"><span>👤</span></div>}{hasIncomingLike && <div className="incoming-like-badge">💗 Вам поставили лайк</div>}<div className="discovery-gradient" /><div className="discovery-info"><h2>{profile.name}{calculateAge(profile.birth_date) ? `, ${calculateAge(profile.birth_date)}` : ""}</h2><div className="profile-meta">{profile.faculty && <span>🎓 {profile.faculty}</span>}{profile.course && <span>📚 {profile.course} курс</span>}</div></div></div>
      <div className="discovery-content">{profileHobbies.length > 0 && <div className="hobbies">{profileHobbies.map((hobby) => <span key={hobby}>{hobby}</span>)}</div>}<p className="discovery-description">{profile.description || "Пользователь пока ничего не написал о себе."}</p></div>
      <div className="discovery-actions"><button className="discovery-button skip" onClick={handleSkip} disabled={actionLoading}>✕</button><button className="discovery-report-button" onClick={() => setReportOpen(true)}>🚩 Пожаловаться</button><button className="discovery-button like" onClick={handleLike} disabled={actionLoading}>♥</button></div>
    </div>}
  </main>{reportOpen && profile && <ReportModal user={user} profile={profile} onClose={() => setReportOpen(false)} />}</div>;
}

export default Discovery;
