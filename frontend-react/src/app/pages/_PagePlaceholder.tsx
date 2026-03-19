export function PagePlaceholder({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="p-6 lg:p-8 max-w-[1600px] mx-auto">
      <div className="rounded-2xl bg-white border border-slate-200/60 p-8">
        <h1 className="text-2xl font-medium text-slate-900 mb-2">{title}</h1>
        <p className="text-sm text-slate-500 font-light">{subtitle}</p>
      </div>
    </div>
  );
}
