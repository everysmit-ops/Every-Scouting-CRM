import { useEffect, useMemo, useState } from "react";
import {
  addCandidateCommentRequest,
  addCandidateDocumentRequest,
  createCandidateRequest,
  updateCandidateRequest,
} from "../../lib/api";
import { getInitials, useAppShell } from "../state/AppShellContext";

export function Candidates() {
  const { bootstrap, token, user, refreshBootstrap } = useAppShell();
  const candidates = useMemo(() => (bootstrap?.candidates || []) as Array<Record<string, any>>, [bootstrap?.candidates]);
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [selectedCandidate, setSelectedCandidate] = useState<string | null>(candidates[0]?.id || null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pageError, setPageError] = useState("");
  const [createForm, setCreateForm] = useState({
    name: "",
    location: "",
    offerId: "",
    notes: "",
  });
  const [candidateNotes, setCandidateNotes] = useState("");
  const [commentDraft, setCommentDraft] = useState("");
  const [documentForm, setDocumentForm] = useState({
    title: "",
    url: "",
    note: "",
  });

  const filteredCandidates =
    selectedStatus === "all" ? candidates : candidates.filter((candidate) => String(candidate.status || "").toLowerCase() === selectedStatus.toLowerCase());
  const selectedCandidateData = candidates.find((candidate) => candidate.id === selectedCandidate) || filteredCandidates[0] || null;
  const statusCounts = candidates.reduce<Record<string, number>>((acc, candidate) => {
    const key = String(candidate.status || "new").toLowerCase();
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const canChangeStatus = Boolean(user?.role === "owner" || user?.role === "lead");
  const canEditCandidate = Boolean(
    user && selectedCandidateData && (user.role === "owner" || user.role === "lead" || selectedCandidateData.scout?.id === user.id),
  );

  useEffect(() => {
    if (filteredCandidates.length && !filteredCandidates.some((candidate) => candidate.id === selectedCandidate)) {
      setSelectedCandidate(filteredCandidates[0]?.id || null);
    }
  }, [filteredCandidates, selectedCandidate]);

  useEffect(() => {
    setCandidateNotes(selectedCandidateData?.notes || "");
    setCommentDraft("");
    setDocumentForm({ title: "", url: "", note: "" });
    setPageError("");
  }, [selectedCandidateData?.id, selectedCandidateData?.notes]);

  async function handleCreateCandidate() {
    if (!token) return;
    setSaving(true);
    setPageError("");
    try {
      const result = await createCandidateRequest(token, {
        name: createForm.name,
        location: createForm.location,
        offerId: createForm.offerId || bootstrap?.metadata?.referenceData?.offers?.[0]?.id,
        notes: createForm.notes,
      });
      await refreshBootstrap();
      setSelectedCandidate(result.candidate.id);
      setCreateForm({ name: "", location: "", offerId: "", notes: "" });
      setShowCreateForm(false);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Не удалось добавить кандидата");
    } finally {
      setSaving(false);
    }
  }

  async function handleStatusChange(status: string) {
    if (!token || !selectedCandidateData || !canChangeStatus) return;
    setSaving(true);
    setPageError("");
    try {
      await updateCandidateRequest(token, selectedCandidateData.id, { status });
      await refreshBootstrap();
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Не удалось обновить статус");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveNotes() {
    if (!token || !selectedCandidateData || !canEditCandidate) return;
    setSaving(true);
    setPageError("");
    try {
      await updateCandidateRequest(token, selectedCandidateData.id, { notes: candidateNotes });
      await refreshBootstrap();
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Не удалось сохранить заметки");
    } finally {
      setSaving(false);
    }
  }

  async function handleAddComment() {
    if (!token || !selectedCandidateData || !commentDraft.trim()) return;
    setSaving(true);
    setPageError("");
    try {
      await addCandidateCommentRequest(token, selectedCandidateData.id, commentDraft.trim());
      await refreshBootstrap();
      setCommentDraft("");
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Не удалось добавить комментарий");
    } finally {
      setSaving(false);
    }
  }

  async function handleAddDocument() {
    if (!token || !selectedCandidateData || !documentForm.title.trim() || !documentForm.url.trim()) return;
    setSaving(true);
    setPageError("");
    try {
      await addCandidateDocumentRequest(token, selectedCandidateData.id, {
        title: documentForm.title.trim(),
        url: documentForm.url.trim(),
        note: documentForm.note.trim(),
        type: "link",
      });
      await refreshBootstrap();
      setDocumentForm({ title: "", url: "", note: "" });
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Не удалось добавить документ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex h-full">
      <div className="flex-1 flex flex-col min-w-0 border-r border-slate-200/60">
        <div className="p-6 lg:p-8 border-b border-slate-200/60 bg-white">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-medium text-slate-900 mb-1">Candidates</h1>
              <p className="text-sm text-slate-500 font-light">{filteredCandidates.length} candidates</p>
            </div>
            <button
              onClick={() => setShowCreateForm((current) => !current)}
              className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 transition-colors"
            >
              Add Candidate
            </button>
          </div>

          {showCreateForm ? (
            <div className="mb-6 rounded-2xl border border-slate-200/60 bg-slate-50/80 p-4">
              <div className="grid md:grid-cols-2 gap-3 mb-3">
                <input
                  value={createForm.name}
                  onChange={(event) => setCreateForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder="Имя кандидата"
                  className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300/40"
                />
                <input
                  value={createForm.location}
                  onChange={(event) => setCreateForm((current) => ({ ...current, location: event.target.value }))}
                  placeholder="Локация"
                  className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300/40"
                />
              </div>
              <div className="grid md:grid-cols-[1fr_1.2fr] gap-3 mb-3">
                <select
                  value={createForm.offerId}
                  onChange={(event) => setCreateForm((current) => ({ ...current, offerId: event.target.value }))}
                  className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300/40"
                >
                  <option value="">Оффер по умолчанию</option>
                  {(bootstrap?.metadata?.referenceData?.offers || []).map((offer) => (
                    <option key={offer.id} value={offer.id}>
                      {offer.title}
                    </option>
                  ))}
                </select>
                <input
                  value={createForm.notes}
                  onChange={(event) => setCreateForm((current) => ({ ...current, notes: event.target.value }))}
                  placeholder="Короткая заметка"
                  className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300/40"
                />
              </div>
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-slate-500 font-light">Скауты могут добавлять анкету, дальнейший статус меняют lead и owner.</p>
                <button
                  onClick={handleCreateCandidate}
                  disabled={!createForm.name.trim() || saving}
                  className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 transition-colors disabled:opacity-60"
                >
                  {saving ? "Сохраняем..." : "Создать"}
                </button>
              </div>
            </div>
          ) : null}

          <div className="flex gap-2 overflow-x-auto pb-2">
            <FilterButton label="All" active={selectedStatus === "all"} onClick={() => setSelectedStatus("all")} />
            <FilterButton label="New" active={selectedStatus === "new"} onClick={() => setSelectedStatus("new")} count={statusCounts.new || 0} />
            <FilterButton label="Screening" active={selectedStatus === "screening"} onClick={() => setSelectedStatus("screening")} count={statusCounts.screening || 0} />
            <FilterButton label="Interview" active={selectedStatus === "interview"} onClick={() => setSelectedStatus("interview")} count={statusCounts.interview || 0} />
            <FilterButton label="Offer" active={selectedStatus === "offer"} onClick={() => setSelectedStatus("offer")} count={statusCounts.offer || 0} />
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          <div className="divide-y divide-slate-100">
            {filteredCandidates.length ? (
              filteredCandidates.map((candidate) => (
                <button
                  key={candidate.id}
                  onClick={() => setSelectedCandidate(candidate.id)}
                  className={`w-full flex items-center gap-4 p-5 hover:bg-slate-50 transition-all text-left ${
                    selectedCandidateData?.id === candidate.id ? "bg-slate-50" : ""
                  }`}
                >
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-violet-400 to-indigo-500 flex items-center justify-center text-white text-sm font-semibold flex-shrink-0">
                    {getInitials(candidate.name || "C")}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-medium text-slate-900">{candidate.name || "Без имени"}</p>
                      <StatusBadge status={String(candidate.status || "new")} />
                    </div>
                    <p className="text-sm text-slate-600 font-light">
                      {candidate.offer?.title || "Без оффера"} · {candidate.team?.name || candidate.location || "Без команды"}
                    </p>
                  </div>
                  <div className="text-xs text-slate-500 font-light flex-shrink-0 hidden sm:block">{formatDate(candidate.createdAt)}</div>
                </button>
              ))
            ) : (
              <div className="p-8 text-sm text-slate-500 font-light">Пока нет кандидатов. После интеграции формы добавления они будут появляться здесь автоматически.</div>
            )}
          </div>
        </div>
      </div>

      <div className="hidden lg:block w-96 bg-white">
        {selectedCandidateData ? (
          <div className="h-full overflow-auto">
            <div className="p-8">
              <div className="flex items-start gap-4">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-400 to-indigo-500 flex items-center justify-center text-white text-xl font-semibold">
                  {getInitials(selectedCandidateData.name || "C")}
                </div>
                <div>
                  <h2 className="text-xl font-medium text-slate-900 mb-1">{selectedCandidateData.name || "Без имени"}</h2>
                  <p className="text-sm text-slate-600 font-light">{selectedCandidateData.offer?.title || "Без оффера"}</p>
                </div>
              </div>

              <div className="mt-8 space-y-5">
                <div>
                  <p className="text-xs text-slate-600 mb-2 font-light uppercase tracking-[0.08em]">Status</p>
                  {canChangeStatus ? (
                    <select
                      value={String(selectedCandidateData.status || "new")}
                      onChange={(event) => handleStatusChange(event.target.value)}
                      className="w-full h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300/40"
                    >
                      <option value="new">new</option>
                      <option value="screening">screening</option>
                      <option value="interview">interview</option>
                      <option value="training">training</option>
                      <option value="registration">registration</option>
                      <option value="twoShifts">twoShifts</option>
                      <option value="offer">offer</option>
                      <option value="hired">hired</option>
                    </select>
                  ) : (
                    <p className="text-sm text-slate-900">{String(selectedCandidateData.status || "new")}</p>
                  )}
                </div>
                <InfoField label="Scout" value={selectedCandidateData.scout?.name || "—"} />
                <InfoField label="Team" value={selectedCandidateData.team?.name || "—"} />
                <InfoField label="Location" value={selectedCandidateData.location || "—"} />
                <InfoField label="Shifts Completed" value={String(selectedCandidateData.shiftsCompleted || 0)} />
                <div>
                  <p className="text-xs text-slate-600 mb-2 font-light uppercase tracking-[0.08em]">Notes</p>
                  <textarea
                    value={candidateNotes}
                    onChange={(event) => setCandidateNotes(event.target.value)}
                    disabled={!canEditCandidate}
                    className="w-full min-h-28 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300/40 disabled:bg-slate-50 disabled:text-slate-500"
                  />
                  {canEditCandidate ? (
                    <button
                      onClick={handleSaveNotes}
                      disabled={saving}
                      className="mt-3 px-4 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                    >
                      Сохранить заметки
                    </button>
                  ) : null}
                </div>

                <div>
                  <p className="text-xs text-slate-600 mb-2 font-light uppercase tracking-[0.08em]">Documents</p>
                  <div className="space-y-2">
                    {(selectedCandidateData.documents || []).length ? (
                      selectedCandidateData.documents.map((document: Record<string, any>) => (
                        <a
                          key={document.id}
                          href={document.url}
                          target="_blank"
                          rel="noreferrer"
                          className="block rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3 hover:bg-slate-50 transition-colors"
                        >
                          <p className="text-sm font-medium text-slate-900">{document.title}</p>
                          <p className="text-xs text-slate-500 font-light">{document.note || document.url}</p>
                        </a>
                      ))
                    ) : (
                      <p className="text-sm text-slate-500 font-light">Документы пока не добавлены.</p>
                    )}
                  </div>
                  {canEditCandidate ? (
                    <div className="mt-3 grid gap-2">
                      <input
                        value={documentForm.title}
                        onChange={(event) => setDocumentForm((current) => ({ ...current, title: event.target.value }))}
                        placeholder="Название документа"
                        className="h-10 rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300/40"
                      />
                      <input
                        value={documentForm.url}
                        onChange={(event) => setDocumentForm((current) => ({ ...current, url: event.target.value }))}
                        placeholder="https://..."
                        className="h-10 rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300/40"
                      />
                      <input
                        value={documentForm.note}
                        onChange={(event) => setDocumentForm((current) => ({ ...current, note: event.target.value }))}
                        placeholder="Заметка"
                        className="h-10 rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300/40"
                      />
                      <button
                        onClick={handleAddDocument}
                        disabled={saving || !documentForm.title.trim() || !documentForm.url.trim()}
                        className="px-4 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-60"
                      >
                        Добавить документ
                      </button>
                    </div>
                  ) : null}
                </div>

                <div>
                  <p className="text-xs text-slate-600 mb-2 font-light uppercase tracking-[0.08em]">Comments</p>
                  <div className="space-y-3">
                    {(selectedCandidateData.comments || []).length ? (
                      selectedCandidateData.comments.map((comment: Record<string, any>) => (
                        <div key={comment.id} className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3">
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
                  {canEditCandidate ? (
                    <div className="mt-3">
                      <textarea
                        value={commentDraft}
                        onChange={(event) => setCommentDraft(event.target.value)}
                        placeholder="Добавить комментарий"
                        className="w-full min-h-24 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300/40"
                      />
                      <button
                        onClick={handleAddComment}
                        disabled={saving || !commentDraft.trim()}
                        className="mt-3 px-4 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-60"
                      >
                        Отправить комментарий
                      </button>
                    </div>
                  ) : null}
                </div>
                {pageError ? <p className="text-sm text-rose-600">{pageError}</p> : null}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function FilterButton({
  label,
  active,
  onClick,
  count,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  count?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
        active ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
      }`}
    >
      {label}
      {count !== undefined ? <span className={`ml-2 ${active ? "text-slate-300" : "text-slate-400"}`}>{count}</span> : null}
    </button>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    New: "bg-slate-100 text-slate-700",
    new: "bg-slate-100 text-slate-700",
    Screening: "bg-blue-100 text-blue-700",
    screening: "bg-blue-100 text-blue-700",
    Interview: "bg-violet-100 text-violet-700",
    interview: "bg-violet-100 text-violet-700",
    Offer: "bg-emerald-100 text-emerald-700",
    offer: "bg-emerald-100 text-emerald-700",
    Hired: "bg-green-100 text-green-700",
    hired: "bg-green-100 text-green-700",
  };

  return <span className={`px-2 py-0.5 rounded text-xs font-medium ${colorMap[status] || colorMap.New}`}>{status}</span>;
}

function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-slate-600 mb-1 font-light uppercase tracking-[0.08em]">{label}</p>
      <p className="text-sm text-slate-900">{value}</p>
    </div>
  );
}

function formatDate(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
