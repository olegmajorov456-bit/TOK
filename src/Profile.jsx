import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import "./Profile.css";
import { getPhotos, compressImage, MAX_PHOTOS, MAX_PHOTO_SIZE } from "./photos";

const FACULTIES = ["ФЭУ", "ИВТФ", "ИФФ", "ЭМФ", "ТЭФ", "ЭЭФ"];

function calculateAge(birthDate) {
  if (!birthDate) return "";
  const today = new Date();
  const birth = new Date(`${birthDate}T00:00:00`);
  let age = today.getFullYear() - birth.getFullYear();
  const monthDifference = today.getMonth() - birth.getMonth();
  if (monthDifference < 0 || (monthDifference === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

function formatDateForInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getMaxBirthDate() {
  const date = new Date();
  date.setFullYear(date.getFullYear() - 16);
  return formatDateForInput(date);
}

function getMinBirthDate() {
  const date = new Date();
  date.setFullYear(date.getFullYear() - 100);
  return formatDateForInput(date);
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

function Profile({ user, onAdmin, onProfileUpdated, theme = "neon", onThemeChange, onSupport, onAchievements }) {
  const [profile, setProfile] = useState(null);
  const [name, setName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [gender, setGender] = useState("");
  const [lookingFor, setLookingFor] = useState("");
  const [faculty, setFaculty] = useState("");
  const [course, setCourse] = useState("");
  const [description, setDescription] = useState("");
  const [hobbies, setHobbies] = useState("");
  const [photoItems, setPhotoItems] = useState([]);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [visibilitySaving, setVisibilitySaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    loadProfile();
  }, [user]);

  async function loadProfile() {
    setLoading(true);
    setMessage("");
    const { data, error } = await supabase.from("profiles").select("*").eq("id", user.id).single();
    if (error) {
      console.error(error);
      setMessage("Не удалось загрузить профиль");
      setLoading(false);
      return;
    }
    setProfile(data);
    setName(data.name || "");
    setBirthDate(data.birth_date || "");
    setGender(data.gender || "");
    setLookingFor(data.looking_for || "");
    setFaculty(data.faculty || "");
    setCourse(data.course || "");
    setDescription(data.description || "");
    setHobbies(getHobbies(data).join(", "));
    setPhotoItems(getPhotos(data).map((url) => ({ key: url, url })));
    setGalleryIndex(0);
    setLoading(false);
  }

  function handlePhotosChange(event) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length) return;
    const room = MAX_PHOTOS - photoItems.length;
    if (room <= 0) {
      setMessage(`Можно загрузить не больше ${MAX_PHOTOS} фотографий.`);
      return;
    }
    const accepted = [];
    let problem = files.length > room ? `Можно загрузить не больше ${MAX_PHOTOS} фотографий.` : "";
    for (const file of files.slice(0, room)) {
      if (!file.type.startsWith("image/")) {
        problem = "Можно загружать только изображения.";
        continue;
      }
      if (file.size > MAX_PHOTO_SIZE) {
        problem = "Размер одной фотографии не должен превышать 10 МБ.";
        continue;
      }
      accepted.push({ key: crypto.randomUUID(), url: URL.createObjectURL(file), file });
    }
    setPhotoItems((items) => [...items, ...accepted]);
    setMessage(problem);
  }

  function removePhoto(key) {
    setPhotoItems((items) => items.filter((item) => item.key !== key));
  }

  function makeMainPhoto(key) {
    setPhotoItems((items) => {
      const found = items.find((item) => item.key === key);
      return found ? [found, ...items.filter((item) => item.key !== key)] : items;
    });
  }

  function movePhoto(key, direction) {
    setPhotoItems((items) => {
      const index = items.findIndex((item) => item.key === key);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= items.length) return items;
      const next = [...items];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function handleSave(event) {
    event.preventDefault();
    if (!birthDate) {
      setMessage("Укажите дату рождения.");
      return;
    }
    const age = calculateAge(birthDate);
    if (age < 16) {
      setMessage("Регистрация доступна только с 16 лет.");
      return;
    }
    if (age > 100) {
      setMessage("Проверьте дату рождения.");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const photoUrls = [];
      for (const item of photoItems) {
        if (!item.file) {
          photoUrls.push(item.url);
          continue;
        }
        const prepared = await compressImage(item.file);
        const extension = prepared.type === "image/jpeg" ? "jpg" : (item.file.name.split(".").pop()?.toLowerCase() || "jpg");
        const filePath = `${user.id}/${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await supabase.storage.from("avatars").upload(filePath, prepared, {
          contentType: prepared.type,
          upsert: true,
        });
        if (uploadError) {
          console.error(uploadError);
          setMessage("Не удалось загрузить фотографию. Проверьте интернет и попробуйте ещё раз.");
          setSaving(false);
          return;
        }
        const { data: publicUrlData } = supabase.storage.from("avatars").getPublicUrl(filePath);
        photoUrls.push(publicUrlData.publicUrl);
      }

      const hobbiesValue = hobbies.split(",").map((item) => item.trim()).filter(Boolean).slice(0, 12).join(", ");
      const profileUpdate = {
        name: name.trim(),
        birth_date: birthDate || null,
        gender: gender || null,
        looking_for: lookingFor || null,
        faculty: faculty || null,
        course: course ? Number(course) : null,
        description: description.trim(),
        hobbies: hobbiesValue,
        avatar_url: photoUrls[0] || null,
      };
      let { data, error } = await supabase.from("profiles").update({ ...profileUpdate, photos: photoUrls }).eq("id", user.id).select().single();
      let photosWarning = "";
      if (error && (error.code === "42703" || /photos/i.test(error.message || ""))) {
        // В базе ещё нет столбца photos: сохраняем хотя бы главное фото.
        ({ data, error } = await supabase.from("profiles").update(profileUpdate).eq("id", user.id).select().single());
        photosWarning = photoUrls.length > 1 ? " Но несколько фото пока не поддерживаются базой: выполните supabase_photos_migration.sql." : "";
      }

      if (error) {
        console.error(error);
        setMessage("Не удалось сохранить профиль.");
        setSaving(false);
        return;
      }

      setProfile(data);
      setPhotoItems((photosWarning ? photoUrls.slice(0, 1) : photoUrls).map((url) => ({ key: url, url })));
      setGalleryIndex(0);
      setHobbies(getHobbies(data).join(", "));
      setIsEditing(false);
      setMessage("Профиль сохранён ✓" + photosWarning);
      if (onProfileUpdated) onProfileUpdated(data);
    } catch (error) {
      console.error(error);
      setMessage("Произошла ошибка. Попробуйте ещё раз.");
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    if (!profile) return;
    setName(profile.name || "");
    setBirthDate(profile.birth_date || "");
    setGender(profile.gender || "");
    setLookingFor(profile.looking_for || "");
    setFaculty(profile.faculty || "");
    setCourse(profile.course || "");
    setDescription(profile.description || "");
    setHobbies(getHobbies(profile).join(", "));
    setPhotoItems(getPhotos(profile).map((url) => ({ key: url, url })));
    setGalleryIndex(0);
    setMessage("");
    setIsEditing(false);
  }

  async function handleToggleVisibility() {
    if (!profile || visibilitySaving) return;
    const nextHidden = profile.is_hidden !== true;
    setVisibilitySaving(true);
    setMessage("");
    try {
      const { data, error } = await supabase
        .from("profiles")
        .update({ is_hidden: nextHidden })
        .eq("id", user.id)
        .select()
        .single();
      if (error) throw error;
      setProfile(data);
      setMessage(nextHidden ? "Анкета скрыта от новых знакомств." : "Анкета снова видна в поиске.");
      onProfileUpdated?.(data);
    } catch (error) {
      console.error("Не удалось изменить видимость анкеты:", error);
      setMessage("Не удалось изменить видимость. Проверьте, что миграция is_hidden выполнена в Supabase.");
    } finally {
      setVisibilitySaving(false);
    }
  }

  async function handleDeleteAccount() {
    const confirmation = window.prompt("Удалить аккаунт ТОК навсегда? Это действие нельзя отменить. Для подтверждения введи УДАЛИТЬ.");
    if (confirmation !== "УДАЛИТЬ") return;
    setDeletingAccount(true);
    setMessage("");
    const { error } = await supabase.functions.invoke("delete-account", { method: "POST" });
    if (error) {
      console.error("Ошибка удаления аккаунта:", error);
      setMessage("Не удалось удалить аккаунт. Проверьте, что функция delete-account развёрнута в Supabase.");
      setDeletingAccount(false);
      return;
    }
    await supabase.auth.signOut();
    window.location.assign("/");
  }

  async function handleLogout() {
    await supabase.auth.signOut();
  }

  if (loading) {
    return <div className="profile-loading" aria-label="Загрузка профиля">
      <div className="profile-loading-card">
        <div className="profile-loading-photo"><span /></div>
        <div className="profile-loading-line profile-loading-name" />
        <div className="profile-loading-line profile-loading-short" />
        <div className="profile-loading-grid"><span /><span /><span /><span /></div>
        <div className="profile-loading-section">
          <div className="profile-loading-line profile-loading-title" />
          <div className="profile-loading-tags"><span /><span /><span /></div>
        </div>
      </div>
    </div>;
  }

  if (!profile) {
    return <div className="profile-error"><div className="profile-error-card"><div className="profile-error-icon">😔</div><h2>Профиль не найден</h2><p>{message || "Попробуйте ещё раз."}</p><button className="profile-primary-button" onClick={loadProfile}>Повторить</button></div></div>;
  }

  const age = calculateAge(profile.birth_date);
  const genderText = profile.gender === "male" ? "Парень" : profile.gender === "female" ? "Девушка" : "Другое";
  const lookingForText = profile.looking_for === "male" ? "парня" : profile.looking_for === "female" ? "девушку" : "кого угодно";
  const profileHobbies = getHobbies(profile);

  return (
    <div className="profile-page">
      <main className="profile-container">
        <section className="profile-card">
          <div className="profile-photo-wrapper">
            {photoItems.length > 0 ? <img className="profile-photo" src={photoItems[Math.min(galleryIndex, photoItems.length - 1)].url} alt={profile.name || "Фото профиля"} onClick={() => !isEditing && photoItems.length > 1 && setGalleryIndex((galleryIndex + 1) % photoItems.length)} /> : <div className="profile-no-photo"><span>👤</span><p>Нет фотографии</p></div>}
            {photoItems.length > 1 && <span className="profile-photo-count">{Math.min(galleryIndex, photoItems.length - 1) + 1}/{photoItems.length}</span>}
          </div>
          {!isEditing && photoItems.length > 1 && <div className="profile-gallery">{photoItems.map((item, index) => <button type="button" key={item.key} className={"profile-gallery-thumb " + (index === galleryIndex ? "active" : "")} onClick={() => setGalleryIndex(index)} aria-label={`Фото ${index + 1}`}><img src={item.url} alt="" /></button>)}</div>}

          {!isEditing ? (
            <>
              <div className="profile-identity">
                <div className="profile-name-block">
                  <h1>{profile.name || "Без имени"}{age ? <span>, {age}</span> : null}</h1>
                  <p className={`profile-status ${profile.is_hidden ? "profile-status-hidden" : ""}`}><span className="profile-status-dot"></span> {profile.is_hidden ? "Анкета скрыта" : "Профиль в ТОК"}</p>
                </div>
                {profile.faculty && <div className="profile-study"><span className="profile-study-icon">🎓</span><div><strong>{profile.faculty}</strong><span>{profile.course ? `${profile.course} курс` : "Студент ИГЭУ"}</span></div></div>}
              </div>

              <div className="profile-details">
                <div className="profile-details-heading">О тебе</div>
                <div className="profile-detail-grid">
                  {profile.gender && <div className="profile-detail-item gender-detail"><span className="detail-icon">👤</span><div><small>Пол</small><strong>{genderText}</strong></div></div>}
                  {profile.looking_for && <div className="profile-detail-item looking-detail"><span className="detail-icon">💗</span><div><small>Ищет</small><strong>{lookingForText}</strong></div></div>}
                  {profile.course && <div className="profile-detail-item"><span className="detail-icon">📚</span><div><small>Курс</small><strong>{profile.course}</strong></div></div>}
                  {profile.faculty && <div className="profile-detail-item"><span className="detail-icon">🏛️</span><div><small>Факультет</small><strong>{profile.faculty}</strong></div></div>}
                </div>
              </div>

              {profileHobbies.length > 0 && (
                <div className="profile-section profile-hobbies-section">
                  <div className="profile-section-heading"><h3>Увлечения</h3><span>{profileHobbies.length}</span></div>
                  <div className="profile-hobbies">{profileHobbies.map((hobby) => <div className="hobby-tag" key={hobby}>✨ {hobby}</div>)}</div>
                </div>
              )}

              <div className="profile-section profile-about-section">
                <h3>О себе</h3>
                {profile.description ? <p className="profile-description">{profile.description}</p> : <div className="profile-empty-description"><span>✍️</span><div><strong>Расскажи о себе</strong><p>Добавь немного информации, чтобы другим было проще начать разговор.</p></div></div>}
              </div>

              <div className="profile-theme-section">
                <div className="profile-theme-title"><div><strong>Оформление</strong><span>Выбери стиль приложения</span></div><span className="profile-theme-spark">✦</span></div>
                <div className="profile-theme-options">
                  <button type="button" className={`profile-theme-option ${theme === "light" ? "active" : ""}`} onClick={() => onThemeChange?.("light")}><span className="theme-preview theme-preview-light"><i></i><b></b><em></em></span><span><strong>Классический</strong><small>Светлый</small></span>{theme === "light" && <mark>✓</mark>}</button>
                  <button type="button" className={`profile-theme-option ${theme === "neon" ? "active" : ""}`} onClick={() => onThemeChange?.("neon")}><span className="theme-preview theme-preview-neon"><i></i><b></b><em></em></span><span><strong>Неоновый</strong><small>Новый TOK</small></span>{theme === "neon" && <mark>✓</mark>}</button>
                </div>
              </div>
              <div className="profile-menu">
                {onAchievements && <button type="button" className="profile-menu-row" onClick={onAchievements}><span className="profile-menu-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4h8v5a4 4 0 0 1-8 0Z" /><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M9 20h6M10 17h4" /></svg></span><span className="profile-menu-label">Достижения</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg></button>}
                {onSupport && <button type="button" className="profile-menu-row" onClick={onSupport}><span className="profile-menu-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.6 2.2c-.7.4-1.1.9-1.1 1.8M12 17h.01" /></svg></span><span className="profile-menu-label">Помощь</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg></button>}
                <button type="button" className="profile-menu-row" onClick={() => window.open("https://tbank.ru/cf/AWf42bsf9Ry", "_blank", "noopener,noreferrer")}><span className="profile-menu-icon heart"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 8.8c0 5.4-8.8 10.3-8.8 10.3S3.2 14.2 3.2 8.8A4.7 4.7 0 0 1 12 6a4.7 4.7 0 0 1 8.8 2.8Z" /></svg></span><span className="profile-menu-label">Поддержать создателя</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg></button>
              </div>
              <div className="profile-actions">
                <button className="profile-primary-button" onClick={() => { setMessage(""); setIsEditing(true); }}>✏️ Редактировать профиль</button>
                <button type="button" className={`profile-visibility-button ${profile.is_hidden ? "is-hidden" : ""}`} onClick={handleToggleVisibility} disabled={visibilitySaving}>{visibilitySaving ? "Сохраняем…" : profile.is_hidden ? "👁️ Вернуть анкету в поиск" : "🙈 Убрать анкету из поиска"}</button>
                {profile.is_admin === true && <button className="profile-admin-button" onClick={onAdmin}>🛡️ Панель администратора</button>}
                <button className="profile-logout-button" onClick={handleLogout}>🚪 Выйти из аккаунта</button>
              </div>
            </>
          ) : (
            <form className="profile-edit-form" onSubmit={handleSave}>
              <div className="photo-manager">
                <div className="photo-manager-head"><strong>Фотографии</strong><span>{photoItems.length}/{MAX_PHOTOS}</span></div>
                <div className="photo-manager-grid">
                  {photoItems.map((item, index) => (
                    <div className={"photo-slot " + (index === 0 ? "main" : "")} key={item.key}>
                      <img src={item.url} alt={`Фото ${index + 1}`} />
                      {index === 0 && <span className="photo-slot-badge">Главное</span>}
                      <button type="button" className="photo-slot-remove" onClick={() => removePhoto(item.key)} aria-label="Удалить фото"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg></button>
                      <div className="photo-slot-actions">
                        {index > 0 && <button type="button" onClick={() => makeMainPhoto(item.key)} title="Сделать главным">★</button>}
                        {index > 0 && <button type="button" onClick={() => movePhoto(item.key, -1)} title="Левее" aria-label="Переместить левее">←</button>}
                        {index < photoItems.length - 1 && <button type="button" onClick={() => movePhoto(item.key, 1)} title="Правее" aria-label="Переместить правее">→</button>}
                      </div>
                    </div>
                  ))}
                  {photoItems.length < MAX_PHOTOS && (
                    <label className="photo-slot add">
                      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
                      <span>Добавить</span>
                      <input type="file" accept="image/*" multiple onChange={handlePhotosChange} />
                    </label>
                  )}
                </div>
                <p className="photo-manager-hint">Можно выбрать сразу несколько фото. Первое фото показывается в анкете главным.</p>
              </div>
              <div className="profile-form-title"><h2>Редактирование</h2><p>Обнови информацию о себе</p></div>
              <label>Имя<input type="text" value={name} onChange={(event) => setName(event.target.value)} placeholder="Твоё имя" maxLength="50" required /></label>
              <label>Дата рождения<input type="date" value={birthDate} onChange={(event) => setBirthDate(event.target.value)} min={getMinBirthDate()} max={getMaxBirthDate()} required /></label>
              <div className="profile-form-row">
                <label>Пол<select value={gender} onChange={(event) => setGender(event.target.value)} required><option value="">Выберите пол</option><option value="male">Парень</option><option value="female">Девушка</option><option value="other">Другое</option></select></label>
                <label>Кого ищешь?<select value={lookingFor} onChange={(event) => setLookingFor(event.target.value)} required><option value="">Выберите</option><option value="male">Парня</option><option value="female">Девушку</option><option value="any">Неважно</option></select></label>
              </div>
              <div className="profile-form-row">
                <label>Факультет<select value={faculty} onChange={(event) => setFaculty(event.target.value)}><option value="">Выберите факультет</option>{FACULTIES.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
                <label>Курс<select value={course} onChange={(event) => setCourse(event.target.value)}><option value="">Не указан</option><option value="1">1 курс</option><option value="2">2 курс</option><option value="3">3 курс</option><option value="4">4 курс</option><option value="5">5 курс</option><option value="6">6 курс</option></select></label>
              </div>
              <label>Увлечения<input type="text" value={hobbies} onChange={(event) => setHobbies(event.target.value)} placeholder="Музыка, спорт, игры, кино..." maxLength="300" /><span className="profile-field-hint">Разделяй увлечения запятыми</span></label>
              <label>О себе<textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Расскажи о себе, своих интересах..." maxLength="500" rows="5" /><span className="textarea-counter">{description.length}/500</span></label>
              {message && <div className={message.includes("✓") ? "profile-success" : "profile-form-message"}>{message}</div>}
              <div className="profile-edit-buttons"><button type="button" className="profile-cancel-button" onClick={handleCancel}>Отмена</button><button type="submit" className="profile-save-button" disabled={saving}>{saving ? "Сохраняем..." : "Сохранить"}</button></div>
              <div className="profile-danger-zone"><p>Если больше не хочешь пользоваться ТОК, можно удалить аккаунт без возможности восстановления.</p><button type="button" className="profile-delete-account-button" onClick={handleDeleteAccount} disabled={deletingAccount}>{deletingAccount ? "Удаляем аккаунт..." : "🗑️ Удалить аккаунт навсегда"}</button></div>
            </form>
          )}
          {!isEditing && message && <div className="profile-success">{message}</div>}
        </section>
      </main>
    </div>
  );
}

export default Profile;