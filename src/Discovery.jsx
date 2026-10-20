import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./supabaseClient";
import "./Discovery.css";
import ReportModal from "./ReportModal";
import { getPhotos } from "./photos";

const AGE_MIN = 16;
const AGE_MAX = 40;
const FEEDBACK_MS = 380;
const SWIPE_DISTANCE = 110;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

function Discovery({ user, onHome, onChats, theme = "light" }) {
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
  const [photoIndex, setPhotoIndex] = useState(0);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [matchModal, setMatchModal] = useState(null);
  const [notice, setNotice] = useState("");
  const dragRef = useRef(null);
  const currentProfileId = profiles[currentIndex]?.id;

  useEffect(() => {
    setPhotoIndex(0);
    setDragX(0);
  }, [currentProfileId]);

  useEffect(() => {
    if (!burst) return undefined;
    const timer = setTimeout(() => setBurst(null), 900);
    return () => clearTimeout(timer);
  }, [burst]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(""), 3200);
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!filtersOpen && !matchModal) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [filtersOpen, matchModal]);

  useEffect(() => {
    // Заранее подгружаем главные фото следующих анкет, чтобы карточки появлялись мгновенно.
    profiles.slice(currentIndex + 1, currentIndex + 3).forEach((item) => {
      const url = getPhotos(item)[0];
      if (url) new Image().src = url;
    });
  }, [profiles, currentIndex]);

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

  async function handleSkip() {
    if (actionLoading) return;
    const current = profiles[currentIndex];
    if (!current) return;

    setActionLoading(true);
    setBurst({ type: "skip", id: Date.now() });
    if (navigator.vibrate) navigator.vibrate(8);
    await wait(FEEDBACK_MS);

    setHistory((items) => [...items, current]);
    // Пропуск не удаляет анкету из выдачи: она уходит в конец очереди
    // и снова появится после остальных. Анкета исчезает навсегда только после лайка/мэтча.
    const total = profiles.length;
    setProfiles((currentProfiles) => {
      if (currentProfiles.length <= 1) return currentProfiles;
      const position = currentProfiles.findIndex((item) => item.id === current.id);
      if (position < 0) return currentProfiles;
      const next = [...currentProfiles];
      const [skipped] = next.splice(position, 1);
      next.push(skipped);
      return next;
    });
    setCurrentIndex((index) => (total <= 1 || index >= total - 1 ? 0 : index));
    setDragX(0);
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
    setBurst({ type: "like", id: Date.now() });
    if (navigator.vibrate) navigator.vibrate(18);

    const [likeResult] = await Promise.all([
      supabase.from("likes").insert({ user_id: user.id, liked_user_id: profile.id }),
      wait(FEEDBACK_MS),
    ]);
    const likeError = likeResult?.error;
    if (likeError && likeError.code !== "23505") {
      console.error("Ошибка лайка:", likeError);
      setBurst(null);
      setDragX(0);
      setNotice("Не удалось поставить лайк. Проверьте интернет и попробуйте ещё раз.");
      setActionLoading(false);
      return;
    }

    const { data: matchId, error: matchError } = await supabase.rpc("create_match_if_mutual", { target_user_id: profile.id });
    if (matchError) console.error("Ошибка создания мэтча:", matchError);
    if (matchId) {
      if (navigator.vibrate) navigator.vibrate([20, 40, 30]);
      setMatchModal({ name: profile.name, photo: getPhotos(profile)[0] || "" });
    }

    const total = profiles.length;
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
      const remaining = total - 1;
      return remaining <= 0 || index >= remaining ? 0 : index;
    });
    setDragX(0);
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

  const photos = getPhotos(profile);
  const shownPhoto = photos[Math.min(photoIndex, Math.max(photos.length - 1, 0))];

  function showPhoto(delta) {
    if (photos.length < 2) return;
    setPhotoIndex((index) => (index + delta + photos.length) % photos.length);
  }

  function flyOut(direction) {
    setDragX(direction * Math.max(window.innerWidth, 420));
    if (direction > 0) handleLike();
    else handleSkip();
  }

  function handlePointerDown(event) {
    if (actionLoading || event.target.closest("button")) return;
    dragRef.current = { x: event.clientX, y: event.clientY, id: event.pointerId, moved: false };
  }

  function handlePointerMove(event) {
    const drag = dragRef.current;
    if (!drag || drag.id !== event.pointerId) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!drag.moved && Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy)) {
      drag.moved = true;
      setDragging(true);
      try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* ignore */ }
    }
    if (drag.moved) setDragX(dx);
  }

  function handlePointerUp(event) {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    setDragging(false);
    const dx = event.clientX - drag.x;
    if (drag.moved) {
      if (dx > SWIPE_DISTANCE) flyOut(1);
      else if (dx < -SWIPE_DISTANCE) flyOut(-1);
      else setDragX(0);
      return;
    }
    if (Math.abs(event.clientY - drag.y) > 10) return;
    const rect = event.currentTarget.getBoundingClientRect();
    showPhoto((event.clientX - rect.left) / rect.width < 0.35 ? -1 : 1);
  }

  function handlePointerCancel() {
    dragRef.current = null;
    setDragging(false);
    setDragX(0);
  }

  const ageLow = filters.minAge ? Number(filters.minAge) : AGE_MIN;
  const ageHigh = filters.maxAge ? Number(filters.maxAge) : AGE_MAX;
  const agePct = (value) => ((value - AGE_MIN) / (AGE_MAX - AGE_MIN)) * 100;
  function setAgeRange(low, high) {
    setFilters({ ...filters, minAge: low <= AGE_MIN ? "" : String(low), maxAge: high >= AGE_MAX ? "" : String(high) });
  }
  const genderOptions = [["", "Любой"], ["female", "Девушки"], ["male", "Парни"], ["other", "Другой"]];
  const sortOptions = [["compatibility", "По совместимости"], ["random", "Случайно"]];
  const chipMark = (active) => <svg className="chip-mark" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" />{active && <path d="m8 12.5 2.6 2.6L16 9.5" />}</svg>;
  return <div className={`discovery-page tok-theme-${theme}`}><main className="discovery-container">
    {notice && <div className="discovery-toast" role="status">{notice}</div>}
    {matchModal && <div className="match-overlay" onClick={() => setMatchModal(null)}><section className="match-modal" role="dialog" aria-label="Взаимная симпатия" onClick={(e) => e.stopPropagation()}>
      <div className="match-modal-avatar">{matchModal.photo ? <img src={matchModal.photo} alt="" /> : <span>👤</span>}</div>
      <h2>Это мэтч! 💕</h2>
      <p>У вас взаимная симпатия с {matchModal.name}. Напишите первым — так проще начать разговор.</p>
      <button type="button" className="match-modal-primary" onClick={() => { setMatchModal(null); if (onChats) onChats(); }}>Написать сообщение</button>
      <button type="button" className="match-modal-secondary" onClick={() => setMatchModal(null)}>Продолжить знакомства</button>
    </section></div>}
    {filtersOpen && <div className="filters-overlay" onClick={() => setFiltersOpen(false)}><section className="filters-sheet" role="dialog" aria-label="Фильтры поиска" onClick={(e) => e.stopPropagation()}>
      <div className="filters-grabber" />
      <div className="filters-head"><h2>Фильтры поиска</h2><button type="button" className="filters-close" onClick={() => setFiltersOpen(false)} aria-label="Закрыть"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg></button></div>
      <div className="filter-block"><span className="filter-label">Пол</span><div className="chip-row">{genderOptions.map(([value, label]) => <button type="button" key={label} className={"filter-chip " + (filters.gender === value ? "active" : "")} onClick={() => { setGenderFilterTouched(true); setFilters({ ...filters, gender: value }); }}>{chipMark(filters.gender === value)}{label}</button>)}</div></div>
      <div className="filter-block"><label className="filter-label" htmlFor="filter-faculty">Факультет</label><div className="select-wrap"><select id="filter-faculty" value={filters.faculty} onChange={(e) => setFilters({ ...filters, faculty: e.target.value })}><option value="">Все факультеты</option>{FACULTIES.map((faculty) => <option key={faculty} value={faculty}>{faculty}</option>)}</select></div></div>
      <div className="filter-block"><label className="filter-label" htmlFor="filter-course">Курс</label><div className="select-wrap"><select id="filter-course" value={filters.course} onChange={(e) => setFilters({ ...filters, course: e.target.value })}><option value="">Все курсы</option>{COURSES.map((course) => <option key={course} value={course}>{course} курс</option>)}</select></div></div>
      <div className="filter-block"><div className="filter-label-row"><span className="filter-label">Возраст</span><strong>{ageLow} — {ageHigh >= AGE_MAX ? AGE_MAX + "+" : ageHigh}</strong></div>
        <div className="age-range"><div className="age-track"><div className="age-fill" style={{ left: agePct(ageLow) + "%", right: (100 - agePct(ageHigh)) + "%" }} /></div>
          <input type="range" min={AGE_MIN} max={AGE_MAX} value={ageLow} aria-label="Возраст от" onChange={(e) => setAgeRange(Math.min(Number(e.target.value), ageHigh - 1), ageHigh)} />
          <input type="range" min={AGE_MIN} max={AGE_MAX} value={ageHigh} aria-label="Возраст до" onChange={(e) => setAgeRange(ageLow, Math.max(Number(e.target.value), ageLow + 1))} /></div>
        <div className="age-ends"><span>{AGE_MIN}</span><span>{AGE_MAX}+</span></div></div>
      <div className="filter-block"><span className="filter-label">Сортировка</span><div className="chip-row">{sortOptions.map(([value, label]) => <button type="button" key={value} className={"filter-chip " + (sortMode === value ? "active" : "")} onClick={() => changeSortMode(value)}>{chipMark(sortMode === value)}{label}</button>)}</div></div>
      <div className="filters-actions"><button type="button" className="filters-apply" onClick={applyFilters}>Применить</button><button type="button" className="filters-reset" onClick={resetFilters}>Сбросить</button></div>
    </section></div>}
    {!profile ? <div className="discovery-empty"><div className="empty-icon">💕</div><h2>Анкеты закончились</h2><p>{activeFiltersCount ? "По выбранным фильтрам подходящих анкет пока нет." : "Здесь больше нет анкет, которые вы ещё не лайкнули. Можно обновить список после новых анкет."}</p><button className="empty-filters-button" onClick={() => setFiltersOpen(true)}>Изменить фильтры</button><button className="empty-home-button" onClick={onHome}><span>⌂</span>Вернуться домой</button><button className="empty-refresh-button" onClick={handleRefreshAll} disabled={refreshLoading}>{refreshLoading ? "Обновляем..." : "Обновить анкеты"}</button></div> : <div className={"discovery-card " + (dragging ? "dragging" : "")} key={profile.id} style={dragX ? { transform: `translateX(${dragX}px) rotate(${dragX / 22}deg)`, transition: dragging ? "none" : "transform .35s cubic-bezier(.2,.8,.2,1)" } : undefined}>{burst && <div key={burst.id} className={"discovery-burst " + burst.type} aria-hidden="true">{burst.type === "like" ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 8.8c0 5.4-8.8 10.3-8.8 10.3S3.2 14.2 3.2 8.8A4.7 4.7 0 0 1 12 6a4.7 4.7 0 0 1 8.8 2.8Z" /></svg> : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>}</div>}
      <div className="discovery-photo" onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerCancel={handlePointerCancel}>
        {shownPhoto ? <img src={shownPhoto} alt={profile.name} draggable={false} /> : <div className="no-photo"><span>{(profile.name || "?").trim().charAt(0).toUpperCase()}</span></div>}
        <div className="discovery-gradient" />
        <span className="swipe-stamp like" style={{ opacity: Math.max(0, Math.min(dragX / SWIPE_DISTANCE, 1)) }}>Нравится</span>
        <span className="swipe-stamp skip" style={{ opacity: Math.max(0, Math.min(-dragX / SWIPE_DISTANCE, 1)) }}>Пропуск</span>
        <div className="discovery-photo-top">
          <button type="button" className="discovery-icon-button" onClick={() => setFiltersOpen(true)} aria-label="Фильтры" title="Фильтры"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h9M17 7h3M4 17h3M11 17h9" /><circle cx="15" cy="7" r="2" /><circle cx="9" cy="17" r="2" /></svg>{activeFiltersCount > 0 && <span className="discovery-icon-badge">{activeFiltersCount}</span>}</button>
          <div className="discovery-photo-top-right">{photos.length > 1 && <span className="discovery-counter">{Math.min(photoIndex, photos.length - 1) + 1}/{photos.length}</span>}<button type="button" className="discovery-icon-button" onClick={() => setReportOpen(true)} aria-label="Пожаловаться" title="Пожаловаться"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 21V4M6 5h11l-2 4 2 4H6" /></svg></button></div>
        </div>
        <div className="discovery-info">
          <h2>{profile.name}{calculateAge(profile.birth_date) ? `, ${calculateAge(profile.birth_date)}` : ""}</h2>
          <div className="profile-meta">{[profile.faculty, profile.course ? `${profile.course} курс` : ""].filter(Boolean).join(" • ")}</div>
          {(commonHobbies.length > 0 || profileHobbies.length > 0) && <div className="discovery-chips">{commonHobbies.length > 0 && <span className="chip chip-match">✦ {commonHobbies.length} общих</span>}{profileHobbies.map((hobby) => <span key={hobby} className={"chip " + (commonHobbies.includes(hobby) ? "common" : "")}>{hobby}</span>)}</div>}
          <p className="discovery-description">{profile.description || "Пользователь пока ничего не написал о себе."}</p>
        </div>
        {photos.length > 1 && <div className="discovery-dots" aria-hidden="true">{photos.map((photo, index) => <i key={photo + index} className={index === Math.min(photoIndex, photos.length - 1) ? "active" : ""} />)}</div>}
        <div className="discovery-actions">
          <button className="discovery-button undo" onClick={handleUndo} disabled={actionLoading || history.length === 0} title="Вернуться к предыдущей анкете" aria-label="Назад"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 7 4 12l5 5M4 12h10a6 6 0 0 1 6 6" /></svg></button>
          <button className="discovery-button skip" onClick={handleSkip} disabled={actionLoading} title="Пропустить анкету" aria-label="Пропустить"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg><span>Пропуск</span></button>
          <button className="discovery-button like" onClick={handleLike} disabled={actionLoading} title="Поставить лайк" aria-label="Нравится"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 8.8c0 5.4-8.8 10.3-8.8 10.3S3.2 14.2 3.2 8.8A4.7 4.7 0 0 1 12 6a4.7 4.7 0 0 1 8.8 2.8Z" /></svg><span>Нравится</span></button>
        </div>
      </div>
    </div>}
  </main>{reportOpen && profile && <ReportModal user={user} profile={profile} onClose={() => setReportOpen(false)} />}</div>;
}

export default Discovery;