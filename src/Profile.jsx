import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import "./Profile.css";

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

function Profile({ user, onAdmin, onProfileUpdated, theme = "neon", onThemeChange }) {
  const [profile, setProfile] = useState(null);
  const [name, setName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [gender, setGender] = useState("");
  const [lookingFor, setLookingFor] = useState("");
  const [faculty, setFaculty] = useState("");
  const [course, setCourse] = useState("");
  const [description, setDescription] = useState("");
  const [hobbies, setHobbies] = useState("");
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
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
    setAvatarPreview(data.avatar_url || "");
    setLoading(false);
  }

  function handleAvatarChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setMessage("Можно загружать только изображения.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setMessage("Размер фотографии не должен превышать 5 МБ.");
      return;
    }
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
    setMessage("");
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
    let avatarUrl = profile?.avatar_url || null;

    try {
      if (avatarFile) {
        const extension = avatarFile.name.split(".").pop()?.toLowerCase() || "jpg";
        const filePath = `${user.id}/${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await supabase.storage.from("avatars").upload(filePath, avatarFile, {
          contentType: avatarFile.type,
          upsert: true,
        });
        if (uploadError) {
          console.error(uploadError);
          setMessage("Не удалось загрузить фотографию.");
          setSaving(false);
          return;
        }
        const { data: publicUrlData } = supabase.storage.from("avatars").getPublicUrl(filePath);
        avatarUrl = publicUrlData.publicUrl;
      }

      const hobbiesValue = hobbies.split(",").map((item) => item.trim()).filter(Boolean).slice(0, 12).join(", ");
      const { data, error } = await supabase.from("profiles").update({
        name: name.trim(),
        birth_date: birthDate || null,
        gender: gender || null,
        looking_for: lookingFor || null,
        faculty: faculty || null,
        course: course ? Number(course) : null,
        description: description.trim(),
        hobbies: hobbiesValue,
        avatar_url: avatarUrl,
      }).eq("id", user.id).select().single();

      if (error) {
        console.error(error);
        setMessage("Не удалось сохранить профиль.");
        setSaving(false);
        return;
      }

      setProfile(data);
      setAvatarFile(null);
      setAvatarPreview(data.avatar_url || "");
      setHobbies(getHobbies(data).join(", "));
      setIsEditing(false);
      setMessage("Профиль сохранён ✓");
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
    setAvatarFile(null);
    setAvatarPreview(profile.avatar_url || "");
    setMessage("");
    setIsEditing(false);
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
    <div className={"profile-page tok-theme-" + theme}>
      <main className="profile-container">
        <section className="profile-card">
          <div className="profile-photo-wrapper">
            {avatarPreview ? <img className="profile-photo" src={avatarPreview} alt={profile.name || "Фото профиля"} /> : <div className="profile-no-photo"><span>👤</span><p>Нет фотографии</p></div>}
            {isEditing && <label className="change-photo-button">📷 <span>Изменить фото</span><input type="file" accept="image/*" onChange={handleAvatarChange} /></label>}
          </div>

          {!isEditing ? (
            <>
              <div className="profile-identity">
                <div className="profile-name-block">
                  <h1>{profile.name || "Без имени"}{age ? <span>, {age}</span> : null}</h1>
                  <p className="profile-status"><span className="profile-status-dot"></span> Профиль в ТОК</p>
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
              <div className="profile-actions">
                <button className="profile-primary-button" onClick={() => { setMessage(""); setIsEditing(true); }}>✏️ Редактировать профиль</button>
                {profile.is_admin === true && <button className="profile-admin-button" onClick={onAdmin}>🛡️ Панель администратора</button>}
                <button className="profile-logout-button" onClick={handleLogout}>🚪 Выйти из аккаунта</button>
              </div>
            </>
          ) : (
            <form className="profile-edit-form" onSubmit={handleSave}>
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
