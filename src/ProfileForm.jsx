import { useState } from "react";
import { supabase } from "./supabaseClient";
import "./ProfileForm.css";

const FACULTIES = ["ФЭУ", "ИВТФ", "ИФФ", "ЭМФ", "ТЭФ", "ЭЭФ"];

function getMaxBirthDate() {
  const date = new Date();
  date.setFullYear(date.getFullYear() - 16);
  return date.toISOString().split("T")[0];
}

function getMinBirthDate() {
  const date = new Date();
  date.setFullYear(date.getFullYear() - 100);
  return date.toISOString().split("T")[0];
}

function getAge(birthDate) {
  const today = new Date();
  const birth = new Date(`${birthDate}T00:00:00`);
  let age = today.getFullYear() - birth.getFullYear();
  const monthDifference = today.getMonth() - birth.getMonth();
  if (monthDifference < 0 || (monthDifference === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

function ProfileForm({ user, onProfileCreated }) {
  const [name, setName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [gender, setGender] = useState("");
  const [lookingFor, setLookingFor] = useState("");
  const [faculty, setFaculty] = useState("");
  const [course, setCourse] = useState("");
  const [description, setDescription] = useState("");
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const theme = localStorage.getItem("tok-theme") || "light";

  function handleAvatarChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Можно загружать только изображения.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Фотография должна быть меньше 5 МБ.");
      return;
    }
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
    setError("");
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!birthDate) {
      setError("Укажите дату рождения.");
      return;
    }

    const age = getAge(birthDate);
    if (age < 16) {
      setError("Регистрация доступна только с 16 лет.");
      return;
    }
    if (age > 100) {
      setError("Проверьте дату рождения.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const { data: createdProfile, error: profileError } = await supabase
        .from("profiles")
        .insert({
          id: user.id,
          name: name.trim(),
          birth_date: birthDate,
          gender,
          looking_for: lookingFor,
          faculty: faculty || null,
          course: course ? Number(course) : null,
          description: description.trim(),
          avatar_url: null,
        })
        .select()
        .single();

      if (profileError) {
        console.error(profileError);
        setError(profileError.message);
        setLoading(false);
        return;
      }

      let finalProfile = createdProfile;

      if (avatarFile) {
        const extension = avatarFile.name.split(".").pop()?.toLowerCase() || "jpg";
        const filePath = `${user.id}/${crypto.randomUUID()}.${extension}`;

        const { error: uploadError } = await supabase.storage
          .from("avatars")
          .upload(filePath, avatarFile, {
            contentType: avatarFile.type,
            upsert: true,
          });

        if (uploadError) {
          console.error(uploadError);
          setError("Анкета создана, но фотографию загрузить не удалось. Её можно добавить позже в профиле.");
          onProfileCreated(createdProfile);
          setLoading(false);
          return;
        }

        const { data: publicUrlData } = supabase.storage
          .from("avatars")
          .getPublicUrl(filePath);

        const { data: updatedProfile, error: avatarUpdateError } = await supabase
          .from("profiles")
          .update({ avatar_url: publicUrlData.publicUrl })
          .eq("id", user.id)
          .select()
          .single();

        if (avatarUpdateError) {
          console.error(avatarUpdateError);
          setError("Фото загружено, но не удалось сохранить ссылку на него.");
          finalProfile = createdProfile;
        } else {
          finalProfile = updatedProfile;
        }
      }

      onProfileCreated(finalProfile);
    } catch (submitError) {
      console.error(submitError);
      setError("Произошла ошибка. Попробуйте ещё раз.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={`onboarding-page tok-onboarding-${theme}`}>
      <div className="onboarding-card">
        <h1>Создай свою анкету ❤️</h1>
        <p className="onboarding-subtitle">Расскажи немного о себе</p>

        <form onSubmit={handleSubmit}>
          <input type="text" placeholder="Имя" value={name} onChange={(event) => setName(event.target.value)} minLength="2" maxLength="50" required />

          <label>Дата рождения</label>
          <input type="date" value={birthDate} onChange={(event) => setBirthDate(event.target.value)} min={getMinBirthDate()} max={getMaxBirthDate()} required />

          <select value={gender} onChange={(event) => setGender(event.target.value)} required>
            <option value="">Твой пол</option>
            <option value="male">Парень</option>
            <option value="female">Девушка</option>
            <option value="other">Другое</option>
          </select>

          <select value={lookingFor} onChange={(event) => setLookingFor(event.target.value)} required>
            <option value="">Кого ищешь?</option>
            <option value="male">Парня</option>
            <option value="female">Девушку</option>
            <option value="any">Неважно</option>
          </select>

          <select value={faculty} onChange={(event) => setFaculty(event.target.value)}>
            <option value="">Выберите факультет</option>
            {FACULTIES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>

          <select value={course} onChange={(event) => setCourse(event.target.value)}>
            <option value="">Выберите курс</option>
            <option value="1">1 курс</option>
            <option value="2">2 курс</option>
            <option value="3">3 курс</option>
            <option value="4">4 курс</option>
            <option value="5">5 курс</option>
            <option value="6">6 курс</option>
          </select>

          <div className="avatar-upload">
            <label className="avatar-label">Фотография</label>
            {avatarPreview && <img src={avatarPreview} alt="Предпросмотр" className="avatar-preview" />}
            <input type="file" accept="image/*" onChange={handleAvatarChange} />
            <small>JPG, PNG или другое изображение до 5 МБ</small>
          </div>

          <textarea placeholder="Расскажи о себе" value={description} onChange={(event) => setDescription(event.target.value)} maxLength="500" rows="4" />

          <button type="submit" disabled={loading}>{loading ? "Сохраняем..." : "Создать анкету"}</button>
        </form>

        {error && <p className="onboarding-error">{error}</p>}
      </div>
    </div>
  );
}

export default ProfileForm;