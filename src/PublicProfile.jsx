import "./PublicProfile.css";

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

function PublicProfile({ profile, onBack, theme = "light" }) {
  const age = calculateAge(profile?.birth_date);
  const hobbies = getHobbies(profile);
  const gender = profile?.gender === "male" ? "Парень" : profile?.gender === "female" ? "Девушка" : "Другое";
  const lookingFor = profile?.looking_for === "male" ? "парня" : profile?.looking_for === "female" ? "девушку" : "кого угодно";

  return (
    <div className={`public-profile-page tok-theme-${theme}`}>
      <main className="public-profile-card">
        <button type="button" className="public-profile-back" onClick={onBack}>← Назад</button>
        <div className="public-profile-photo">
          {profile?.avatar_url ? <img src={profile.avatar_url} alt={profile.name || "Фото профиля"} /> : <span>👤</span>}
        </div>
        <section className="public-profile-content">
          <h1>{profile?.name || "Пользователь"}{age ? `, ${age}` : ""}</h1>
          <p className="public-profile-subtitle">Студент ИГЭУ</p>

          <div className="public-profile-details">
            <div><small>Пол</small><strong>{gender}</strong></div>
            {profile?.faculty && <div><small>Факультет</small><strong>{profile.faculty}</strong></div>}
            {profile?.course && <div><small>Курс</small><strong>{profile.course}</strong></div>}
            <div><small>Ищет</small><strong>{lookingFor}</strong></div>
          </div>

          {hobbies.length > 0 && <section className="public-profile-section"><h2>Увлечения</h2><div className="public-profile-hobbies">{hobbies.map((hobby) => <span key={hobby}>✨ {hobby}</span>)}</div></section>}
          <section className="public-profile-section">
            <h2>О себе</h2>
            <p>{profile?.description || "Пользователь пока ничего не написал о себе."}</p>
          </section>
        </section>
      </main>
    </div>
  );
}

export default PublicProfile;
