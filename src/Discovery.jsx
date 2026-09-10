import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";
import "./Discovery.css";
import ReportModal from "./ReportModal";

const FACULTIES = ["ФЭУ", "ИВТФ", "ИФФ", "ЭМФ", "ТЭФ", "ЭЭФ"];
const COURSES = ["1", "2", "3", "4", "5", "6"];

function calculateAge(birthDate) {
  if (!birthDate) return "";
  const today = new Date();
  const birth = new Date(birthDate);
  let age = today.getFullYear() - birth.getFullYear();
  const monthDifference = today.getMonth() - birth.getMonth();
  if (monthDifference < 0 || (monthDifference === 0 && today.getDate() < birth.getDate())) age--;
  return age;
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
  const [replayLoading, setReplayLoading] = useState(false);

  useEffect(() => { loadProfiles(); }, []);

  async function loadProfiles() {
    setLoading(true);
    setCurrentIndex(0);
    const { data: myProfile, error: myProfileError } = await supabase.from("profiles").select("gender, looking_for").eq("id", user.id).single();
    if (myProfileError) { console.error("Ошибка загрузки своего профиля:", myProfileError); setLoading(false); return; }
    const { data: viewed, error: viewedError } = await supabase.from("profile_views").select("viewed_profile_id").eq("viewer_id", user.id);
    if (viewedError) { console.error("Ошибка загрузки просмотренных анкет:", viewedError); setLoading(false); return; }
    const viewedIds = (viewed || []).map((item) => item.viewed_profile_id);
    let query = supabase.from("profiles").select("*").neq("id", user.id).eq("is_blocked", false);
    if (myProfile.looking_for === "male" || myProfile.looking_for === "female") query = query.eq("gender", myProfile.looking_for);
    const { data, error } = await query;
    if (error) { console.error("Ошибка загрузки анкет:", error); setLoading(false); return; }
    const freshProfiles = (data || []).filter((profile) => !viewedIds.includes(profile.id));
    setAllProfiles(freshProfiles);
    setProfiles(freshProfiles);
    setLoading(false);
  }

  async function replaySkippedProfiles() {
    if (replayLoading) return;
    setReplayLoading(true);
    setLoading(true);

    const { data: myProfile, error: myProfileError } = await supabase.from("profiles").select("gender, looking_for").eq("id", user.id).single();
    if (myProfileError) {
      console.error("Ошибка загрузки своего профиля:", myProfileError);
      setReplayLoading(false);
      setLoading(false);
      return;
    }

    const { data: viewed, error: viewedError } = await supabase.from("profile_views").select("viewed_profile_id").eq("viewer_id", user.id);
    if (viewedError) {
      console.error("Ошибка загрузки просмотров:", viewedError);
      setReplayLoading(false);
      setLoading(false);
      return;
    }

    const viewedIds = (viewed || []).map((item) => item.viewed_profile_id);
    let query = supabase.from("profiles").select("*").neq("id", user.id).eq("is_blocked", false);
    if (myProfile.looking_for === "male" || myProfile.looking_for === "female") query = query.eq("gender", myProfile.looking_for);
    const { data: candidates, error } = await query;
    if (error) {
      console.error("Ошибка загрузки анкет для повтора:", error);
      setReplayLoading(false);
      setLoading(false);
      return;
    }

    const replayProfiles = (candidates || []).filter((profile) => viewedIds.includes(profile.id));
    setAllProfiles(replayProfiles);
    setProfiles(replayProfiles);
    setCurrentIndex(0);
    setFilters({ gender: "", faculty: "", course: "", minAge: "", maxAge: "" });
    setFiltersOpen(false);
    setReplayLoading(false);
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
    setProfiles(filtered);
    setCurrentIndex(0);
    setFiltersOpen(false);
  }

  function resetFilters() {
    setFilters({ gender: "", faculty: "", course: "", minAge: "", maxAge: "" });
    setProfiles(allProfiles);
    setCurrentIndex(0);
    setFiltersOpen(false);
  }

  async function markProfileAsViewed(profileId) {
    const { error } = await supabase.from("profile_views").insert({ viewer_id: user.id, viewed_profile_id: profileId });
    if (error && error.code !== "23505") console.error("Ошибка сохранения просмотра:", error);
  }

  async function nextProfile() {
    const profile = profiles[currentIndex];
    if (!profile) return;
    await markProfileAsViewed(profile.id);
    setCurrentIndex((index) => index + 1);
  }

  async function handleSkip() {
    if (actionLoading) return;
    setActionLoading(true);
    await nextProfile();
    setActionLoading(false);
  }

  async function handleLike() {
    const profile = profiles[currentIndex];
    if (!profile || actionLoading) return;
    setActionLoading(true);
    await markProfileAsViewed(profile.id);
    const { error: likeError } = await supabase.from("likes").insert({ user_id: user.id, liked_user_id: profile.id });
    if (likeError && likeError.code !== "23505") { console.error("Ошибка лайка:", likeError); setActionLoading(false); return; }
    const { data: matchId, error: matchError } = await supabase.rpc("create_match_if_mutual", { target_user_id: profile.id });
    if (matchError) console.error("Ошибка создания мэтча:", matchError);
    if (matchId) alert(`💕 У вас взаимная симпатия с ${profile.name}!`);
    setCurrentIndex((index) => index + 1);
    setActionLoading(false);
  }

  const activeFiltersCount = useMemo(() => Object.values(filters).filter(Boolean).length, [filters]);
  if (loading) return <div className="discovery-page"><main className="discovery-container"><div className="discovery-loading"><div className="loading-spinner" /><p>{replayLoading ? "Возвращаем анкеты..." : "Загрузка анкет..."}</p></div></main></div>;

  const profile = profiles[currentIndex];
  return <div className="discovery-page"><main className="discovery-container">
    <div className="discovery-header"><div><h1>Знакомства</h1><p>Найди кого-нибудь из ИГЭУ 💕</p></div><button className="filters-toggle" onClick={() => setFiltersOpen(!filtersOpen)}>⚙️ Фильтры {activeFiltersCount > 0 && <span>{activeFiltersCount}</span>}</button></div>
    {filtersOpen && <section className="filters-panel"><div className="filter-grid">
      <label>Пол<select value={filters.gender} onChange={(e) => setFilters({ ...filters, gender: e.target.value })}><option value="">Любой</option><option value="female">Девушки</option><option value="male">Парни</option></select></label>
      <label>Факультет<select value={filters.faculty} onChange={(e) => setFilters({ ...filters, faculty: e.target.value })}><option value="">Любой</option>{FACULTIES.map((faculty) => <option key={faculty} value={faculty}>{faculty}</option>)}</select></label>
      <label>Курс<select value={filters.course} onChange={(e) => setFilters({ ...filters, course: e.target.value })}><option value="">Любой</option>{COURSES.map((course) => <option key={course} value={course}>{course} курс</option>)}</select></label>
      <label>Возраст от<input type="number" min="16" max="100" placeholder="16" value={filters.minAge} onChange={(e) => setFilters({ ...filters, minAge: e.target.value })} /></label>
      <label>Возраст до<input type="number" min="16" max="100" placeholder="100" value={filters.maxAge} onChange={(e) => setFilters({ ...filters, maxAge: e.target.value })} /></label>
    </div><div className="filters-actions"><button onClick={applyFilters}>Показать анкеты</button><button className="filters-reset" onClick={resetFilters}>Сбросить</button></div></section>}
    {!profile ? <div className="discovery-empty"><div className="empty-icon">💕</div><h2>Анкеты закончились</h2><p>{activeFiltersCount ? "По выбранным фильтрам подходящих анкет пока нет." : "Мы показали тебе всех подходящих пользователей. Загляни позже — возможно, появятся новые анкеты."}</p><button className="empty-home-button" onClick={onHome}><span>⌂</span>Вернуться домой</button><button className="empty-refresh-button" onClick={loadProfiles}>Обновить анкеты</button><button className="replay-button" onClick={replaySkippedProfiles} disabled={replayLoading}>↻ {replayLoading ? "Возвращаем..." : "Посмотреть заново"}</button></div> : <div className="discovery-card">
      <div className="discovery-photo">{profile.avatar_url ? <img src={profile.avatar_url} alt={profile.name} /> : <div className="no-photo"><span>👤</span></div>}<div className="discovery-gradient" /><div className="discovery-info"><h2>{profile.name}{calculateAge(profile.birth_date) ? `, ${calculateAge(profile.birth_date)}` : ""}</h2><div className="profile-meta">{profile.faculty && <span>🎓 {profile.faculty}</span>}{profile.course && <span>📚 {profile.course} курс</span>}</div></div></div>
      <div className="discovery-content">{profile.hobbies && <div className="hobbies">{profile.hobbies.split(",").map((hobby) => <span key={hobby.trim()}>{hobby.trim()}</span>)}</div>}<p className="discovery-description">{profile.description || "Пользователь пока ничего не написал о себе."}</p></div>
      <div className="discovery-actions"><button className="discovery-button skip" onClick={handleSkip} disabled={actionLoading}>✕</button><button className="discovery-report-button" onClick={() => setReportOpen(true)}>🚩 Пожаловаться</button><button className="discovery-button like" onClick={handleLike} disabled={actionLoading}>♥</button></div>
    </div>}
    {profile && <button className="replay-small-button" onClick={replaySkippedProfiles} disabled={replayLoading}>↻ Посмотреть заново</button>}
  </main>{reportOpen && profile && <ReportModal user={user} profile={profile} onClose={() => setReportOpen(false)} />}</div>;
}

export default Discovery;
