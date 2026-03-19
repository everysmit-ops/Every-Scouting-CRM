import { useState } from "react";
import { addPostCommentRequest, createPostRequest } from "../../lib/api";
import { useAppShell } from "../state/AppShellContext";

export function Feed() {
  const { bootstrap, token, refreshBootstrap, user } = useAppShell();
  const posts = (bootstrap?.posts || []) as Array<Record<string, any>>;
  const [draft, setDraft] = useState({ title: "", body: "", type: "forum" });
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  return (
    <div className="p-6 lg:p-8 max-w-[1600px] mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-medium text-slate-900 mb-1">Feed</h1>
        <p className="text-sm text-slate-500 font-light">Внутренние новости компании и опыт команды в одном потоке.</p>
      </div>

      <div className="rounded-2xl bg-white border border-slate-200/60 p-6 mb-6">
        <div className="flex items-center justify-between gap-4 mb-4">
          <h2 className="text-lg font-medium text-slate-900">Новый пост</h2>
          <span className="text-sm text-slate-500 font-light">{user?.name || "Every Scouting"}</span>
        </div>
        <div className="grid md:grid-cols-[180px_1fr] gap-3 mb-3">
          <select
            value={draft.type}
            onChange={(event) => setDraft((current) => ({ ...current, type: event.target.value }))}
            className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300/40"
          >
            <option value="forum">forum</option>
            <option value="news">news</option>
          </select>
          <input
            value={draft.title}
            onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
            placeholder="Заголовок поста"
            className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300/40"
          />
        </div>
        <textarea
          value={draft.body}
          onChange={(event) => setDraft((current) => ({ ...current, body: event.target.value }))}
          placeholder="Что важно сообщить команде?"
          className="w-full min-h-28 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300/40"
        />
        <div className="mt-4 flex justify-end">
          <button
            onClick={async () => {
              if (!token || !draft.title.trim() || !draft.body.trim()) return;
              setSaving(true);
              try {
                await createPostRequest(token, {
                  title: draft.title.trim(),
                  body: draft.body.trim(),
                  type: draft.type,
                  category: draft.type,
                });
                await refreshBootstrap();
                setDraft({ title: "", body: "", type: "forum" });
              } finally {
                setSaving(false);
              }
            }}
            disabled={saving || !draft.title.trim() || !draft.body.trim()}
            className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 transition-colors disabled:opacity-60"
          >
            {saving ? "Сохраняем..." : "Опубликовать"}
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {posts.length ? (
          posts.map((post) => (
            <article key={post.id} className="rounded-2xl bg-white border border-slate-200/60 p-6">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`rounded-full px-3 py-1 text-xs font-medium ${post.type === "news" ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-700"}`}>
                      {post.type === "news" ? "News" : "Forum"}
                    </span>
                    <span className="text-xs text-slate-500 font-light">{formatDate(post.createdAt)}</span>
                  </div>
                  <h2 className="text-lg font-medium text-slate-900">{post.title}</h2>
                  <p className="text-sm text-slate-500 font-light mt-1">{post.authorName || "Every Scouting"}</p>
                </div>
              </div>
              <p className="text-sm text-slate-700 leading-7 font-light">{post.body}</p>
              <div className="mt-4 pt-4 border-t border-slate-200/60">
                <div className="space-y-3 mb-3">
                  {(post.comments || []).length ? (
                    post.comments.map((comment: Record<string, any>) => (
                      <div key={comment.id} className="rounded-xl border border-slate-200/60 bg-slate-50/70 px-4 py-3">
                        <div className="flex items-center justify-between gap-3 mb-1">
                          <p className="text-sm font-medium text-slate-900">{comment.authorName || "Команда"}</p>
                          <span className="text-xs text-slate-500 font-light">{formatDate(comment.createdAt)}</span>
                        </div>
                        <p className="text-sm text-slate-600 font-light">{comment.body}</p>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-slate-500 font-light">Комментариев пока нет.</p>
                  )}
                </div>
                <div className="flex flex-col sm:flex-row gap-3">
                  <input
                    value={commentDrafts[post.id] || ""}
                    onChange={(event) => setCommentDrafts((current) => ({ ...current, [post.id]: event.target.value }))}
                    placeholder="Комментарий"
                    className="flex-1 h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300/40"
                  />
                  <button
                    onClick={async () => {
                      const body = (commentDrafts[post.id] || "").trim();
                      if (!token || !body) return;
                      setSaving(true);
                      try {
                        await addPostCommentRequest(token, post.id, body);
                        await refreshBootstrap();
                        setCommentDrafts((current) => ({ ...current, [post.id]: "" }));
                      } finally {
                        setSaving(false);
                      }
                    }}
                    disabled={saving || !(commentDrafts[post.id] || "").trim()}
                    className="px-4 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-60"
                  >
                    Ответить
                  </button>
                </div>
              </div>
            </article>
          ))
        ) : (
          <div className="rounded-2xl bg-white border border-slate-200/60 p-8 text-sm text-slate-500 font-light">
            Лента пока пуста.
          </div>
        )}
      </div>
    </div>
  );
}

function formatDate(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "long", year: "numeric" }).format(date);
}
