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

function normalizeGender(value) {
  const gender = String(value || "").trim().toLowerCase().replace(/ё/g, "е");
  if (["male", "m", "man", "boy", "парень", "парня", "парни", "парней", "мужчина", "мужчины", "мужской"].includes(gender)) return "male";
  if (["female", "f", "woman", "girl", "девушка", "девушку", "девушки", "девушек", "женщина", "женщины", "женский", "женский пол"].includes(gender)) return "female";
  if (["other", "другое", "другой", "другая"].includes(gender)) return "other";
  return gender;
}

function getHobbies(profile) {
  if (!profile?.hobbies) return [];

  const normalizeItems = (items) => items
    .flatMap((item) => String(item).split(","))
    .map((item) => item.trim().replace(/^["']|["']$/g, "").replace(/\\\"/g, '"'))
    .filter(Boolean);

  if (Array.isArray(profile.hobbies)) return normalizeItems(profile.hobbies);

  let value = String(profile.hobbies).trim();
  if (!value || value === "[]" || value === "{}") return [];

  if (value.startsWith("[") && value.endsWith("]")) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return normalizeItems(parsed);
    } catch {
      value = value.slice(1, -1);
    }
  }

  // Legacy text and Postgres-array string formats: {Музыка,Спорт} or
  // {"Математика, физика","Музыка"}. Preserve commas inside quoted items.
  if (value.startsWith("{") && value.endsWith("}")) value = value.slice(1, -1);
  const items = value.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/);
  return normalizeItems(items);
}

function normalizeInterest(value) {
  return String(value || "").trim().toLocaleLowerCase("ru-RU").replace(/ё/g, "е");
}

function getSharedHobbies(profile, ownHobbies) {
  const own = new Set((ownHobbies || []).map(normalizeInterest).filter(Boolean));
  const found = new Map();
  for (const item of getHobbies(profile)) {
    const key = normalizeInterest(item);
    if (key && own.has(key) && !found.has(key)) found.set(key, item);
  }
  return [...found.values()];
}

function Discovery({ user, onHome, theme = "light" }) {
  const [allProfiles, setAllProfiles] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [burst, setBurst] = useState(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState({ gender: "", faculty: "", course: "", minAge: "", maxAge: "" });
  const [preferredGender, setPreferredGender] = useState("");
  const [genderFilterTouched, setGenderFilterTouched] = useState(false);
  const [refreshLoading, setRefreshLoading] = useState(false);
  const [history, setHistory] = useState([]);
  const [myHobbies, setMyHobbies] = useState([]);
  const [sortMode, setSortMode] = useState("compatibility");

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

  function orderProfiles(items, ownHobbies = myHobbies, mode = sortMode) {
    const randomized = shuffleProfiles(items);
    if (mode !== "compatibility" || !ownHobbies.length) return randomized;
    return randomized.sort((first, second) => getSharedHobbies(second, ownHobbies).length - getSharedHobbies(first, ownHobbies).length);
  }

  function changeSortMode(nextMode) {
    setSortMode(nextMode);
    setProfiles(orderProfiles(filterProfiles(allProfiles, filters), myHobbies, nextMode));
    setCurrentIndex(0);
    setHistory([]);
  }

  function filterProfiles(items, activeFilters = filters, preference = preferredGender) {
    const minAge = activeFilters.minAge ? Number(activeFilters.minAge) : null;
    const maxAge = activeFilters.maxAge ? Number(activeFilters.maxAge) : null;
    const genderFilter = normalizeGender(activeFilters.gender);

    return items.filter((profile) => {
      const age = calculateAge(profile.birth_date);
      if (genderFilter && normalizeGender(profile.gender) !== genderFilter) return false;
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
      .select("gender, looking_for, hobbies")
      .eq("id", user.id)
      .single();

    if (myProfileError) {
      console.error("Ошибка загрузки своего профиля:", myProfileError);
      setLoading(false);
      return;
    }

    const [{ data: outgoingLikes, error: outgoingLikesError }, { data: myMatches, error: matchesError }, { data: passedProfiles, error: passesError }] = await Promise.all([
      supabase.from("likes").select("liked_user_id").eq("user_id", user.id),
      supabase.from("matches").select("user1_id,user2_id").or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`),
      supabase.from("profile_passes").select("passed_user_id").eq("user_id", user.id),
    ]);

    if (outgoingLikesError) console.error("Ошибка загрузки поставленных лайков:", outgoingLikesError);
    if (matchesError) console.error("Ошибка загрузки мэтчей:", matchesError);
    if (passesError) console.error("Ошибка загрузки отклонённых анкет:", passesError);

    const outgoingLikeIds = new Set((outgoingLikes || []).map((item) => item.liked_user_id));
    const passedIds = new Set((passedProfiles || []).map((item) => item.passed_user_id));
    const ownHobbies = getHobbies(myProfile);
    setMyHobbies(ownHobbies);
    const normalizedPreference = normalizeGender(myProfile.looking_for);
    const profilePreference = normalizedPreference === "male" || normalizedPreference === "female" ? normalizedPreference : "";
    setPreferredGender(profilePreference);
    // Apply the account preference only as the initial default. If the user
    // explicitly selects "Любой", preserve that choice during refreshes.
    const selectedGender = genderFilterTouched ? filters.gender : (filters.gender || profilePreference);
    if (!genderFilterTouched) {
      setFilters((current) => ({ ...current, gender: current.gender || profilePreference }));
    }
    const matchedUserIds = new Set((myMatches || []).map((match) => (
      match.user1_id === user.id ? match.user2_id : match.user1_id
    )));

    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .neq("id", user.id)
      .or("is_blocked.is.null,is_blocked.eq.false")
      .eq("is_hidden", false);

    if (error) {
      console.error("Ошибка загрузки анкет:", error);
      setLoading(false);
      return;
    }

    const candidates = (data || []).filter(
      (profile) => !outgoingLikeIds.has(profile.id) && !matchedUserIds.has(profile.id) && !passedIds.has(profile.id)
    );

    setAllProfiles(candidates);
    setProfiles(orderProfiles(filterProfiles(candidates, { ...filters, gender: selectedGender }), ownHobbies, sortMode));
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
    setProfiles(orderProfiles(filtered));
    setCurrentIndex(0);
    setHistory([]);
    setFiltersOpen(false);
  }
  function resetFilters() {
    const reset = { gender: preferredGender, faculty: "", course: "", minAge: "", maxAge: "" };
    setGenderFilterTouched(false);
    setFilters(reset);
    setProfiles(orderProfiles(filterProfiles(allProfiles, reset, preferredGender)));
    setCurrentIndex(0);
    setFiltersOpen(false);
  }

  function handleSkip() {
    if (actionLoading) return;
    const current = profiles[currentIndex];
    if (!current || profiles.length === 0) return;

    setActionLoading(true);
    setHistory((items) => [...items, current]);
    setBurst({ type: "skip", id: Date.now() });
    if (navigator.vibrate) navigator.vibrate(8);

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
    setBurst({ type: "like", id: Date.now() });
    if (navigator.vibrate) navigator.vibrate(matchId ? [20, 40, 30] : 18);
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

  const activeFiltersCount = useMemo(() => Object.entries(filters).filter(([key, value]) => key === "gender" ? (genderFilterTouched && value !== preferredGender) : Boolean(value)).length, [filters, preferredGender, genderFilterTouched]);
  if (loading) return <div className={`discovery-page tok-theme-${theme}`}><main className="discovery-container"><div className="discovery-loading"><div className="loading-spinner" /><p>{refreshLoading ? "Обновляем все анкеты..." : "Загрузка анкет..."}</p></div></main></div>;

  const profile = profiles[currentIndex];
  const profileHobbies = getHobbies(profile);
  const commonHobbies = profile ? getSharedHobbies(profile, myHobbies) : [];

  return <div className={`discovery-page tok-theme-${theme}`}><main className="discovery-container">
    <div className="discovery-header"><div className="discovery-title-block"><h1>Знакомства</h1><p>Найди кого-нибудь из ИГЭУ 💕</p></div><div className="discovery-header-controls"><div className="discovery-sort-toggle" role="group" aria-label="Порядок анкет"><button type="button" className={sortMode === "compatibility" ? "active" : ""} onClick={() => changeSortMode("compatibility")}>✦ По интересам</button><button type="button" className={sortMode === "random" ? "active" : ""} onClick={() => changeSortMode("random")}>⇄ Случайно</button></div><button className="filters-toggle" onClick={() => setFiltersOpen(!filtersOpen)}>⚙️ Фильтры {activeFiltersCount > 0 && <span>{activeFiltersCount}</span>}</button></div></div>
    {filtersOpen && <section className="filters-panel"><div className="filter-grid">
      <label>Пол<select value={filters.gender} onChange={(e) => { setGenderFilterTouched(true); setFilters({ ...filters, gender: e.target.value }); }}><option value="">Любой</option><option value="female">Девушки</option><option value="male">Парни</option><option value="other">Другой пол</option></select></label>
      <label>Факультет<select value={filters.faculty} onChange={(e) => setFilters({ ...filters, faculty: e.target.value })}><option value="">Любой</option>{FACULTIES.map((faculty) => <option key={faculty} value={faculty}>{faculty}</option>)}</select></label>
      <label>Курс<select value={filters.course} onChange={(e) => setFilters({ ...filters, course: e.target.value })}><option value="">Любой</option>{COURSES.map((course) => <option key={course} value={course}>{course} курс</option>)}</select></label>
      <label>Возраст от<input type="number" min="16" max="100" placeholder="16" value={filters.minAge} onChange={(e) => setFilters({ ...filters, minAge: e.target.value })} /></label>
      <label>Возраст до<input type="number" min="16" max="100" placeholder="100" value={filters.maxAge} onChange={(e) => setFilters({ ...filters, maxAge: e.target.value })} /></label>
    </div><div className="filters-actions"><button onClick={applyFilters}>Показать анкеты</button><button className="filters-reset" onClick={resetFilters}>Сбросить</button></div></section>}
    {!profile ? <div className="discovery-empty"><div className="empty-icon">💕</div><h2>Анкеты закончились</h2><p>{activeFiltersCount ? "По выбранным фильтрам подходящих анкет пока нет." : "Здесь больше нет анкет, которые вы ещё не лайкнули. Можно обновить список после новых анкет."}</p><button className="empty-home-button" onClick={onHome}><span>⌂</span>Вернуться домой</button><button className="empty-refresh-button" onClick={handleRefreshAll} disabled={refreshLoading}>{refreshLoading ? "Обновляем..." : "Обновить анкеты"}</button></div> : <div className="discovery-card" key={profile.id}>{burst && <div key={burst.id} className={"discovery-burst " + burst.type} aria-hidden="true">{burst.type === "like" ? <svg viewBox="0 0 24 24"><path d="M20.8 8.8c0 5.4-8.8 10.3-8.8 10.3S3.2 14.2 3.2 8.8A4.7 4.7 0 0 1 12 6a4.7 4.7 0 0 1 8.8 2.8Z" /></svg> : <svg viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18" /></svg>}</div>}
      <div className="discovery-photo"><div className="discovery-photo-top"></div>{profile.avatar_url ? <img src={profile.avatar_url} alt={profile.name} /> : <div className="no-photo"><span>👤</span></div>}<div className="discovery-gradient" /><div className="discovery-info"><h2>{profile.name}{calculateAge(profile.birth_date) ? `, ${calculateAge(profile.birth_date)}` : ""}</h2><div className="profile-meta">{profile.faculty && <span>🎓 {profile.faculty}</span>}{profile.course && <span>📚 {profile.course} курс</span>}</div></div></div>
      <div className="discovery-content"><div className={"discovery-compatibility " + (commonHobbies.length ? "has-common" : "")}><span>✦ Совпадение по интересам</span><strong>{commonHobbies.length ? commonHobbies.length + " общих" : "изучите анкету"}</strong></div>{commonHobbies.length > 0 && <div className="discovery-common-hobbies">{commonHobbies.map((hobby) => <span key={hobby}>♡ {hobby}</span>)}</div>}{profileHobbies.length > 0 && <div className="hobbies">{profileHobbies.map((hobby) => <span key={hobby}>{hobby}</span>)}</div>}<p className="discovery-description">{profile.description || "Пользователь пока ничего не написал о себе."}</p></div>
      <div className="discovery-actions">
        <div className="discovery-action-row">
          <div className="discovery-action undo"><button className="discovery-button undo" onClick={handleUndo} disabled={actionLoading} title="Вернуться к предыдущей анкете" aria-label="Назад"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 7 4 12l5 5M4 12h10a6 6 0 0 1 6 6" /></svg></button><span className="discovery-action-label">Назад</span></div>
          <div className="discovery-action skip"><button className="discovery-button skip" onClick={handleSkip} disabled={actionLoading} title="Пропустить анкету" aria-label="Пропустить"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg></button><span className="discovery-action-label">Пропустить</span></div>
          <div className="discovery-action like"><button className="discovery-button like" onClick={handleLike} disabled={actionLoading} title="Поставить лайк" aria-label="Нравится"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 8.8c0 5.4-8.8 10.3-8.8 10.3S3.2 14.2 3.2 8.8A4.7 4.7 0 0 1 12 6a4.7 4.7 0 0 1 8.8 2.8Z" /></svg></button><span className="discovery-action-label">Нравится</span></div>
        </div>
        <button className="discovery-report-button" onClick={() => setReportOpen(true)}>Пожаловаться</button>
      </div>
    </div>}
  </main>{reportOpen && profile && <ReportModal user={user} profile={profile} onClose={() => setReportOpen(false)} />}</div>;
}

export default Discovery;