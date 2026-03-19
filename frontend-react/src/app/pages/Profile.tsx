import { useEffect, useState } from "react";
import { updateProfileRequest } from "../../lib/api";
import { getInitials, useAppShell } from "../state/AppShellContext";

export function Profile() {
  const [isEditing, setIsEditing] = useState(false);
  const { user, bootstrap, token, refreshBootstrap } = useAppShell();
  const [saving, setSaving] = useState(false);
  const [profileForm, setProfileForm] = useState(() => ({
    name: user?.name || "",
    username: user?.username || user?.email?.split("@")[0] || "",
    bio: user?.bio || "",
    avatarUrl: user?.avatarUrl || "",
    bannerUrl: user?.bannerUrl || "",
    socialLabel: user?.socialLinks?.[0]?.label || "",
    socialUrl: user?.socialLinks?.[0]?.url || "",
  }));
  const initials = getInitials(user?.name || user?.email || "ES");
  const payouts = bootstrap?.payouts || [];
  const totalEarned = payouts.reduce((sum, payout) => sum + Number(payout.finalAmount || 0), 0);

  useEffect(() => {
    setProfileForm({
      name: user?.name || "",
      username: user?.username || user?.email?.split("@")[0] || "",
      bio: user?.bio || "",
      avatarUrl: user?.avatarUrl || "",
      bannerUrl: user?.bannerUrl || "",
      socialLabel: user?.socialLinks?.[0]?.label || "",
      socialUrl: user?.socialLinks?.[0]?.url || "",
    });
  }, [user?.avatarUrl, user?.bannerUrl, user?.bio, user?.email, user?.name, user?.socialLinks, user?.username]);

  async function handleSaveProfile() {
    if (!token) return;
    setSaving(true);
    try {
      await updateProfileRequest(token, {
        name: profileForm.name.trim(),
        username: profileForm.username.trim(),
        bio: profileForm.bio.trim(),
        avatarUrl: profileForm.avatarUrl.trim() || undefined,
        bannerUrl: profileForm.bannerUrl.trim() || undefined,
        socialLinks:
          profileForm.socialLabel.trim() && profileForm.socialUrl.trim()
            ? [{ label: profileForm.socialLabel.trim(), url: profileForm.socialUrl.trim() }]
            : [],
      });
      await refreshBootstrap();
      setIsEditing(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="h-full overflow-auto">
      <div
        className="h-48 bg-gradient-to-br from-violet-400 via-indigo-400 to-blue-500 relative bg-cover bg-center"
        style={user?.bannerUrl ? { backgroundImage: `linear-gradient(rgba(79,70,229,0.42), rgba(59,130,246,0.42)), url(${user.bannerUrl})` } : undefined}
      >
        <button className="absolute top-4 right-4 px-3 py-1.5 rounded-lg bg-white/20 backdrop-blur-sm text-white text-sm font-medium hover:bg-white/30 transition-colors">
          Change Banner
        </button>
      </div>

      <div className="max-w-5xl mx-auto px-6 lg:px-8">
        <div className="relative -mt-16 mb-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-end gap-6">
            <div className="relative">
              <div className="w-32 h-32 rounded-2xl bg-gradient-to-br from-violet-400 to-indigo-500 border-4 border-white shadow-lg flex items-center justify-center text-white text-4xl font-semibold">
                {initials}
              </div>
            </div>

            <div className="flex-1">
              <div className="bg-white rounded-2xl p-6 shadow-lg border border-slate-200/60">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h1 className="text-2xl font-medium text-slate-900 mb-1">{user?.name || "Every Scouting user"}</h1>
                    <p className="text-slate-600 font-light">@{user?.username || user?.email?.split("@")[0] || "workspace"}</p>
                  </div>
                  <button
                    onClick={() => (isEditing ? handleSaveProfile().catch(() => undefined) : setIsEditing(true))}
                    className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors"
                  >
                    {isEditing ? (saving ? "Saving..." : "Save") : "Edit Profile"}
                  </button>
                </div>

                {isEditing ? (
                  <div className="grid gap-3">
                    <div className="grid md:grid-cols-2 gap-3">
                      <input
                        value={profileForm.name}
                        onChange={(event) => setProfileForm((current) => ({ ...current, name: event.target.value }))}
                        placeholder="Имя"
                        className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300/40"
                      />
                      <input
                        value={profileForm.username}
                        onChange={(event) => setProfileForm((current) => ({ ...current, username: event.target.value }))}
                        placeholder="Username"
                        className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300/40"
                      />
                    </div>
                    <textarea
                      value={profileForm.bio}
                      onChange={(event) => setProfileForm((current) => ({ ...current, bio: event.target.value }))}
                      placeholder="Краткая биография"
                      className="w-full min-h-24 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300/40"
                    />
                    <div className="grid md:grid-cols-2 gap-3">
                      <input
                        value={profileForm.avatarUrl}
                        onChange={(event) => setProfileForm((current) => ({ ...current, avatarUrl: event.target.value }))}
                        placeholder="Avatar URL"
                        className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300/40"
                      />
                      <input
                        value={profileForm.bannerUrl}
                        onChange={(event) => setProfileForm((current) => ({ ...current, bannerUrl: event.target.value }))}
                        placeholder="Banner URL"
                        className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300/40"
                      />
                    </div>
                    <div className="grid md:grid-cols-2 gap-3">
                      <input
                        value={profileForm.socialLabel}
                        onChange={(event) => setProfileForm((current) => ({ ...current, socialLabel: event.target.value }))}
                        placeholder="Social label"
                        className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300/40"
                      />
                      <input
                        value={profileForm.socialUrl}
                        onChange={(event) => setProfileForm((current) => ({ ...current, socialUrl: event.target.value }))}
                        placeholder="https://..."
                        className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300/40"
                      />
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="text-slate-700 mb-4 font-light">
                      {user?.bio ||
                        "Every Scouting workspace profile. Personal settings and identity details will be connected here without changing the approved design."}
                    </p>
                    {user?.socialLinks?.length ? (
                      <div className="flex flex-wrap gap-2">
                        {user.socialLinks.map((item) => (
                          <a
                            key={`${item.label}-${item.url}`}
                            href={item.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 transition-colors"
                          >
                            {item.label}
                          </a>
                        ))}
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-4 pb-12">
          <StatCard label="Candidates Added" value={String(bootstrap?.candidates?.length || 0)} />
          <StatCard label="Successful Hires" value={String(bootstrap?.summary?.kpiQualified || 0)} />
          <StatCard label="Total Earnings" value={`$${totalEarned}`} />
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white border border-slate-200/60 p-5">
      <p className="text-sm text-slate-600 mb-2 font-light">{label}</p>
      <p className="text-2xl font-medium text-slate-900">{value}</p>
    </div>
  );
}
