import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

export default function AppUpdateAdmin() {
  const [version, setVersion] = useState("");
  const [versionCode, setVersionCode] = useState("");
  const [notes, setNotes] = useState("");
  const [force, setForce] = useState(false);
  const [apk, setApk] = useState(null);
  const [currentUrl, setCurrentUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("app_settings").select("key,value")
        .in("key", ["android_version_name","android_version_code","android_apk_url","android_update_notes","android_force_update"]);
      const values = Object.fromEntries((data || []).map((item) => [item.key, item.value]));
      setVersion(values.android_version_name || "");
      setVersionCode(values.android_version_code || "");
      setCurrentUrl(values.android_apk_url || "");
      setNotes(values.android_update_notes || "");
      setForce(String(values.android_force_update).toLowerCase() === "true");
      setLoading(false);
    })();
  }, []);

  async function publish(event) {
    event.preventDefault();
    if (!version.trim() || !versionCode.trim() || !apk) {
      setMessage("Укажите версию, versionCode и выберите APK.");
      return;
    }
    setSaving(true);
    setMessage("");
    const safeVersion = version.trim().replace(/[^0-9.]/g, "");
    const path = "TOK-" + safeVersion + "-" + Date.now() + ".apk";
    const { error: uploadError } = await supabase.storage.from("app-updates")
      .upload(path, apk, { contentType: "application/vnd.android.package-archive", upsert: true, cacheControl: "3600" });
    if (uploadError) {
      setMessage("Не удалось загрузить APK: " + uploadError.message);
      setSaving(false);
      return;
    }
    const { data: urlData } = supabase.storage.from("app-updates").getPublicUrl(path);
    const url = urlData.publicUrl;
    const rows = [
      { key: "android_version_name", value: safeVersion },
      { key: "android_version_code", value: versionCode.trim() },
      { key: "android_apk_url", value: url },
      { key: "android_update_notes", value: notes.trim() },
      { key: "android_force_update", value: force ? "true" : "false" }
    ];
    const { error: saveError } = await supabase.from("app_settings").upsert(rows, { onConflict: "key" });
    if (saveError) {
      setMessage("APK загружен, но настройки не сохранились: " + saveError.message);
    } else {
      setCurrentUrl(url);
      setApk(null);
      setMessage("Обновление опубликовано. Старая версия предложит пользователю скачать новую.");
    }
    setSaving(false);
  }

  if (loading) return <div className="admin-empty"><div className="admin-spinner" /><p>Загружаем настройки...</p></div>;

  return (
    <section className="admin-section">
      <div className="admin-section-heading"><div><span className="admin-section-kicker">ANDROID</span><h2>Обновление приложения</h2></div></div>
      <form onSubmit={publish} style={{background:"var(--admin-card)",borderRadius:20,padding:18,boxShadow:"var(--admin-shadow)"}}>
        <p style={{color:"var(--admin-muted)",fontSize:12,lineHeight:1.5,marginTop:0}}>Загрузите новую сборку. Пользователь старой версии увидит предложение обновиться внутри ТОК.</p>
        <label style={{display:"block",marginTop:12}}>Версия
          <input value={version} onChange={(e)=>setVersion(e.target.value)} placeholder="1.3" style={{width:"100%",padding:12,marginTop:7,border:"1px solid var(--admin-border)",borderRadius:13,background:"var(--admin-input)",color:"var(--admin-text)",boxSizing:"border-box"}} />
        </label>
        <label style={{display:"block",marginTop:12}}>Version code
          <input value={versionCode} onChange={(e)=>setVersionCode(e.target.value.replace(/\D/g,""))} placeholder="4" inputMode="numeric" style={{width:"100%",padding:12,marginTop:7,border:"1px solid var(--admin-border)",borderRadius:13,background:"var(--admin-input)",color:"var(--admin-text)",boxSizing:"border-box"}} />
        </label>
        <label style={{display:"block",marginTop:12}}>Что нового
          <textarea value={notes} onChange={(e)=>setNotes(e.target.value)} rows="4" placeholder="Исправлены фото и ответы на сообщения..." style={{width:"100%",padding:12,marginTop:7,border:"1px solid var(--admin-border)",borderRadius:13,background:"var(--admin-input)",color:"var(--admin-text)",boxSizing:"border-box",resize:"vertical"}} />
        </label>
        <label style={{display:"flex",gap:9,alignItems:"center",marginTop:14,color:"var(--admin-text)",fontSize:12}}><input type="checkbox" checked={force} onChange={(e)=>setForce(e.target.checked)} /> Обязательное обновление</label>
        <label style={{display:"block",marginTop:14,color:"var(--admin-text)",fontSize:12,fontWeight:700}}>APK-файл
          <input type="file" accept=".apk,application/vnd.android.package-archive" onChange={(e)=>setApk(e.target.files?.[0] || null)} style={{display:"block",marginTop:8}} />
        </label>
        <button type="submit" disabled={saving} style={{width:"100%",marginTop:16,border:0,borderRadius:14,padding:13,background:"linear-gradient(90deg,#ff2f73,#d92766)",color:"#fff",fontFamily:"inherit",fontWeight:800,cursor:"pointer"}}>{saving ? "Загружаем..." : "Опубликовать обновление"}</button>
        {message && <p className="admin-report-date">{message}</p>}
        {currentUrl && <a href={currentUrl} target="_blank" rel="noreferrer" className="admin-refresh" style={{display:"inline-flex",marginTop:10,textDecoration:"none"}}>Открыть текущий APK</a>}
      </form>
    </section>
  );
}
