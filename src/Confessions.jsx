import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";
import "./Confessions.css";

const CATEGORIES = ["История", "Знакомство", "Учёба", "Смешное", "Вопрос"];

function formatTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const delta = Date.now() - date.getTime();
  if (delta < 60 * 60 * 1000) return Math.max(1, Math.floor(delta / 60000)) + " мин назад";
  if (delta < 24 * 60 * 60 * 1000) return Math.floor(delta / (60 * 60 * 1000)) + " ч назад";
  return date.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

function Confessions({ user, theme = "light" }) {
  const [posts, setPosts] = useState([]);
  const [reactions, setReactions] = useState([]);
  const [comments, setComments] = useState([]);
  const [body, setBody] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [expandedId, setExpandedId] = useState(null);
  const [commentDrafts, setCommentDrafts] = useState({});
  const [reportingId, setReportingId] = useState(null);
  const [reportReason, setReportReason] = useState("Оскорбление или травля");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function loadFeed(showLoader = true) {
    if (showLoader) setLoading(true);
    const result = await supabase
      .from("confessions")
      .select("id,author_id,body,category,created_at")
      .order("created_at", { ascending: false })
      .limit(40);

    if (result.error) {
      console.error("Не удалось загрузить признания:", result.error);
      setError("Раздел признаний пока не подключён. Выполни SQL-миграцию из supabase/migrations/20261011_social_features.sql в SQL Editor Supabase.");
      setPosts([]);
      setReactions([]);
      setComments([]);
      setLoading(false);
      return;
    }

    const nextPosts = result.data || [];
    setPosts(nextPosts);
    setError("");
    if (!nextPosts.length) {
      setReactions([]);
      setComments([]);
      setLoading(false);
      return;
    }

    const ids = nextPosts.map((item) => item.id);
    const [reactionResult, commentResult] = await Promise.all([
      supabase.from("confession_reactions").select("id,confession_id,user_id,reaction").in("confession_id", ids),
      supabase.from("confession_comments").select("id,confession_id,author_id,body,created_at").in("confession_id", ids).order("created_at", { ascending: true }),
    ]);

    if (reactionResult.error || commentResult.error) {
      console.error("Не удалось загрузить реакции/комментарии:", reactionResult.error || commentResult.error);
      setError("Не удалось загрузить реакции или комментарии. Проверь SQL-миграцию раздела признаний.");
    } else {
      setReactions(reactionResult.data || []);
      setComments(commentResult.data || []);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadFeed();
  }, [user.id]);

  const reactionCounts = useMemo(() => {
    const next = {};
    for (const item of reactions) {
      if (!next[item.confession_id]) next[item.confession_id] = { heart: 0, laugh: 0, wow: 0, mine: null };
      if (item.reaction in next[item.confession_id]) next[item.confession_id][item.reaction] += 1;
      if (item.user_id === user.id) next[item.confession_id].mine = item.reaction;
    }
    return next;
  }, [reactions, user.id]);

  const commentCounts = useMemo(() => {
    const next = {};
    for (const item of comments) next[item.confession_id] = (next[item.confession_id] || 0) + 1;
    return next;
  }, [comments]);

  async function publishPost(event) {
    event.preventDefault();
    const cleanBody = body.trim();
    if (!cleanBody || saving) return;
    setSaving(true);
    setError("");
    setNotice("");
    const { error: insertError } = await supabase.from("confessions").insert({
      author_id: user.id,
      body: cleanBody,
      category,
    });
    if (insertError) {
      console.error("Не удалось опубликовать признание:", insertError);
      setError("Не удалось опубликовать. Проверь SQL-миграцию и попробуй ещё раз.");
    } else {
      setBody("");
      setCategory(CATEGORIES[0]);
      setNotice("Опубликовано анонимно. Спасибо, что делишься!");
      await loadFeed(false);
    }
    setSaving(false);
  }

  async function toggleReaction(post, reaction) {
    if (busyId) return;
    setBusyId(post.id);
    setError("");
    const current = reactionCounts[post.id]?.mine;
    let result;
    if (current === reaction) {
      result = await supabase.from("confession_reactions").delete().eq("confession_id", post.id).eq("user_id", user.id);
    } else {
      result = await supabase.from("confession_reactions").upsert(
        { confession_id: post.id, user_id: user.id, reaction },
        { onConflict: "confession_id,user_id" }
      );
    }
    if (result.error) {
      console.error("Не удалось сохранить реакцию:", result.error);
      setError("Не получилось сохранить реакцию. Проверь SQL-миграцию.");
    } else {
      await loadFeed(false);
    }
    setBusyId(null);
  }

  async function addComment(event, post) {
    event.preventDefault();
    const cleanBody = (commentDrafts[post.id] || "").trim();
    if (!cleanBody || busyId) return;
    setBusyId(post.id);
    const { data, error: insertError } = await supabase
      .from("confession_comments")
      .insert({ confession_id: post.id, author_id: user.id, body: cleanBody })
      .select("id,confession_id,author_id,body,created_at")
      .single();
    if (insertError) {
      console.error("Не удалось добавить комментарий:", insertError);
      setError("Не удалось добавить комментарий. Попробуй ещё раз.");
    } else {
      setComments((current) => [...current, data]);
      setCommentDrafts((current) => ({ ...current, [post.id]: "" }));
    }
    setBusyId(null);
  }

  async function deletePost(post) {
    if (post.author_id !== user.id || !window.confirm("Удалить своё признание?")) return;
    const { error: deleteError } = await supabase.from("confessions").delete().eq("id", post.id).eq("author_id", user.id);
    if (deleteError) {
      setError("Не удалось удалить публикацию.");
      return;
    }
    setPosts((current) => current.filter((item) => item.id !== post.id));
    setReactions((current) => current.filter((item) => item.confession_id !== post.id));
    setComments((current) => current.filter((item) => item.confession_id !== post.id));
  }

  async function submitReport(event, post) {
    event.preventDefault();
    setBusyId(post.id);
    const { error: reportError } = await supabase.from("confession_reports").insert({
      confession_id: post.id,
      reporter_id: user.id,
      reason: reportReason,
    });
    if (reportError) {
      setError(reportError.code === "23505" ? "Ты уже отправлял жалобу на эту публикацию." : "Не удалось отправить жалобу. Попробуй позже.");
    } else {
      setNotice("Жалоба отправлена модерации.");
      setReportingId(null);
    }
    setBusyId(null);
  }

  return (
    <div className={"feature-page confession-page tok-theme-" + theme}>
      <main className="feature-container confession-container">
        <header className="feature-heading">
          <div><span className="feature-kicker">АНОНИМНОЕ СООБЩЕСТВО</span><h1>Признания <span>✦</span></h1><p>Истории, вопросы и моменты из жизни ИГЭУ. Имя автора не показывается.</p></div>
          <button type="button" className="feature-quiet-button" onClick={() => loadFeed()} disabled={loading}>↻ Обновить</button>
        </header>

        <form className="confession-composer" onSubmit={publishPost}>
          <div className="confession-composer-top"><span className="confession-anon-avatar">◌</span><div><strong>Опубликовать анонимно</strong><small>Не указывай личные данные — даже случайно</small></div></div>
          <label className="confession-category-label" htmlFor="confession-category">Тема публикации</label>
          <select id="confession-category" value={category} onChange={(event) => setCategory(event.target.value)}>{CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}</select>
          <textarea value={body} onChange={(event) => setBody(event.target.value)} rows={4} maxLength={700} placeholder="Что хочется рассказать студентам ИГЭУ?" aria-label="Текст признания" />
          <div className="confession-composer-footer"><span>{body.length}/700</span><button type="submit" disabled={!body.trim() || saving}>{saving ? "Публикуем…" : "Опубликовать анонимно ↗"}</button></div>
        </form>

        {error && <div className="feature-message feature-message-error" role="alert">{error}</div>}
        {notice && <div className="feature-message" role="status">{notice}<button type="button" onClick={() => setNotice("")} aria-label="Закрыть">×</button></div>}

        <div className="confession-feed-heading"><h2>Свежие истории</h2><span>{posts.length} публикаций</span></div>
        {loading ? <div className="feature-loading"><span className="feature-spinner" />Загружаем признания…</div> : posts.length === 0 ? (
          <section className="feature-empty"><div>✦</div><h2>Здесь пока тихо</h2><p>Начни первым — поделись историей или задай вопрос сообществу.</p></section>
        ) : (
          <div className="confession-feed">
            {posts.map((post) => {
              const summary = reactionCounts[post.id] || { heart: 0, laugh: 0, wow: 0, mine: null };
              const postComments = comments.filter((item) => item.confession_id === post.id);
              const expanded = expandedId === post.id;
              return (
                <article className="confession-card" key={post.id}>
                  <header className="confession-card-head"><span className="confession-anon-avatar small">◌</span><div className="confession-card-author"><strong>Анонимный студент</strong><span>{formatTime(post.created_at)}</span></div><span className="confession-category">{post.category || "История"}</span></header>
                  <p className="confession-body">{post.body}</p>
                  <div className="confession-actions">
                    <div className="confession-reactions">
                      <button type="button" className={summary.mine === "heart" ? "chosen" : ""} disabled={busyId === post.id} onClick={() => toggleReaction(post, "heart")} aria-label="Поддержать">❤️ <span>{summary.heart}</span></button>
                      <button type="button" className={summary.mine === "laugh" ? "chosen" : ""} disabled={busyId === post.id} onClick={() => toggleReaction(post, "laugh")} aria-label="Смешно">😂 <span>{summary.laugh}</span></button>
                      <button type="button" className={summary.mine === "wow" ? "chosen" : ""} disabled={busyId === post.id} onClick={() => toggleReaction(post, "wow")} aria-label="Удивлён">😮 <span>{summary.wow}</span></button>
                    </div>
                    <button type="button" className="confession-comment-toggle" onClick={() => setExpandedId(expanded ? null : post.id)}>💬 {commentCounts[post.id] || 0} комментариев</button>
                    <div className="confession-more-actions">
                      {post.author_id === user.id && <button type="button" onClick={() => deletePost(post)} aria-label="Удалить публикацию">Удалить</button>}
                      <button type="button" onClick={() => { setReportingId(reportingId === post.id ? null : post.id); setReportReason("Оскорбление или травля"); }}>Пожаловаться</button>
                    </div>
                  </div>
                  {reportingId === post.id && <form className="confession-report-form" onSubmit={(event) => submitReport(event, post)}><select value={reportReason} onChange={(event) => setReportReason(event.target.value)}><option>Оскорбление или травля</option><option>Личные данные</option><option>Спам</option><option>Неподходящее содержание</option><option>Другое</option></select><button disabled={busyId === post.id} type="submit">Отправить жалобу</button></form>}
                  {expanded && <section className="confession-comments"><h3>Комментарии <span>{postComments.length}</span></h3>{postComments.length === 0 ? <p className="confession-no-comments">Пока нет комментариев. Будь первым.</p> : postComments.map((item) => <div className="confession-comment" key={item.id}><span className="confession-comment-avatar">◌</span><div><strong>{item.author_id === user.id ? "Ты" : "Аноним"}</strong><p>{item.body}</p><time>{formatTime(item.created_at)}</time></div></div>)}<form className="confession-comment-form" onSubmit={(event) => addComment(event, post)}><input value={commentDrafts[post.id] || ""} onChange={(event) => setCommentDrafts((current) => ({ ...current, [post.id]: event.target.value }))} maxLength={500} placeholder="Написать комментарий…" aria-label="Комментарий" /><button type="submit" disabled={!(commentDrafts[post.id] || "").trim() || busyId === post.id}>↑</button></form></section>}
                </article>
              );
            })}
          </div>
        )}
        <p className="confession-footnote">Публикации анонимны для пользователей, но могут быть проверены администрацией при жалобе. Уважай других и не публикуй чужие персональные данные.</p>
      </main>
    </div>
  );
}

export default Confessions;
