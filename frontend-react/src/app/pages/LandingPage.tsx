import { Link } from "react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { createPublicApplicationRequest } from "../../lib/api";
import { LanguageSwitcher } from "../components/LanguageSwitcher";
import { Logo } from "../components/Logo";

export function LandingPage() {
  const { t } = useTranslation();
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [requestForm, setRequestForm] = useState({
    name: "",
    contact: "",
    experience: "",
    languages: "",
    motivation: "",
  });

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <header className="border-b border-slate-200/60 bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 h-16 flex items-center justify-between">
          <Logo variant="full" size={28} theme="auto" className="text-slate-900" />
          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            <Link
              to="/workspace"
              className="px-6 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 transition-colors"
            >
              {t("common.signIn")}
            </Link>
          </div>
        </div>
      </header>

      <section className="max-w-7xl mx-auto px-6 lg:px-8 pt-24 pb-20">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-5xl lg:text-6xl font-light text-slate-900 mb-6 tracking-tight">
            {t("landing.hero.title")}
          </h1>
          <p className="text-xl text-slate-600 mb-10 leading-relaxed font-light">
            {t("landing.hero.subtitle")}
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              to="/workspace"
              className="px-8 py-3.5 rounded-lg bg-slate-900 text-white font-medium hover:bg-slate-800 transition-colors"
            >
              {t("landing.hero.openWorkspace")}
            </Link>
            <button
              onClick={() => setShowRequestForm((current) => !current)}
              className="px-8 py-3.5 rounded-lg border border-slate-300 text-slate-700 font-medium hover:bg-slate-50 transition-colors"
            >
              {t("landing.hero.requestAccess")}
            </button>
          </div>
        </div>

        {showRequestForm ? (
          <div className="mt-12 max-w-3xl mx-auto rounded-2xl bg-white border border-slate-200/60 p-6 shadow-sm">
            <div className="grid md:grid-cols-2 gap-3 mb-3">
              <input
                value={requestForm.name}
                onChange={(event) => setRequestForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="Имя"
                className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300/40"
              />
              <input
                value={requestForm.contact}
                onChange={(event) => setRequestForm((current) => ({ ...current, contact: event.target.value }))}
                placeholder="Telegram / Email"
                className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300/40"
              />
            </div>
            <div className="grid md:grid-cols-2 gap-3 mb-3">
              <input
                value={requestForm.experience}
                onChange={(event) => setRequestForm((current) => ({ ...current, experience: event.target.value }))}
                placeholder="Опыт"
                className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300/40"
              />
              <input
                value={requestForm.languages}
                onChange={(event) => setRequestForm((current) => ({ ...current, languages: event.target.value }))}
                placeholder="Языки"
                className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300/40"
              />
            </div>
            <textarea
              value={requestForm.motivation}
              onChange={(event) => setRequestForm((current) => ({ ...current, motivation: event.target.value }))}
              placeholder="Почему вы хотите присоединиться к Every Scouting?"
              className="w-full min-h-28 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300/40"
            />
            <div className="mt-4 flex items-center justify-between gap-4">
              <p className="text-sm text-slate-500 font-light">
                {submitted ? "Заявка отправлена. Мы свяжемся с вами после ревью." : "Форма попадет в админский контур как внешняя заявка."}
              </p>
              <button
                onClick={async () => {
                  if (!requestForm.name.trim() || !requestForm.contact.trim() || !requestForm.experience.trim() || !requestForm.languages.trim() || !requestForm.motivation.trim()) {
                    return;
                  }
                  setSubmitting(true);
                  try {
                    await createPublicApplicationRequest({
                      name: requestForm.name.trim(),
                      contact: requestForm.contact.trim(),
                      experience: requestForm.experience.trim(),
                      languages: requestForm.languages.trim(),
                      motivation: requestForm.motivation.trim(),
                    });
                    setRequestForm({ name: "", contact: "", experience: "", languages: "", motivation: "" });
                    setSubmitted(true);
                  } finally {
                    setSubmitting(false);
                  }
                }}
                disabled={
                  submitting ||
                  !requestForm.name.trim() ||
                  !requestForm.contact.trim() ||
                  !requestForm.experience.trim() ||
                  !requestForm.languages.trim() ||
                  !requestForm.motivation.trim()
                }
                className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 transition-colors disabled:opacity-60"
              >
                {submitting ? "Отправляем..." : "Отправить"}
              </button>
            </div>
          </div>
        ) : null}

        <div className="mt-20 max-w-6xl mx-auto">
          <div className="rounded-2xl bg-white p-3 shadow-2xl shadow-slate-200/60 border border-slate-200/60">
            <div className="aspect-[16/10] rounded-xl bg-gradient-to-br from-slate-100 to-slate-50 flex items-center justify-center border border-slate-200/60">
              <div className="text-center">
                <Logo variant="icon" size={64} className="mx-auto mb-4" />
                <p className="text-sm text-slate-500 font-light">{t("landing.hero.platformPreview")}</p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
