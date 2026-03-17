export default function DashboardPage() {
  const apps = [
    { name: "Vessel Manager", href: "/vesselmanager" },
    {
      name: "Vessel Manager Mobile",
      href: "/vesselmanager/mobile",
      description: "Phone-friendly vessel access with touch editing and Daily Report mailto flow.",
      accent: "border-cyan-500/60 bg-cyan-950/40 hover:bg-cyan-900/40",
    },
    { name: "D/A Manager", href: "/disbursementmanager" },
    { name: "ShiftReporter", href: "/shiftreporter" },
    { name: "LineUp", href: "/lineup" },
    { name: "Hydro Outlook", href: "/hydro" },
    { name: "Crew Change", href: "/crew-change" },
  ];

  return (
    <main className="mx-auto my-10 max-w-[960px] px-5 font-sans">
      <h1 className="mb-2 text-slate-100">Antares Ops Dashboard</h1>
      <p className="mb-5 mt-0 text-slate-300">
        Internal portal modules
      </p>

      <section className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
        {apps.map((app) => (
          <a
            key={app.name}
            href={app.href}
            target={app.href.startsWith("http") ? "_blank" : undefined}
            rel={app.href.startsWith("http") ? "noopener noreferrer" : undefined}
            className={`block cursor-pointer rounded-xl border p-6 text-inherit no-underline transition ${
              "accent" in app && app.accent
                ? app.accent
                : "border-slate-700 bg-slate-800 hover:bg-slate-700"
            }`}
          >
            <strong className="font-semibold text-slate-100">{app.name}</strong>
            {"description" in app && app.description ? (
              <p className="mt-2 text-sm text-slate-200">{app.description}</p>
            ) : null}
          </a>
        ))}
      </section>
    </main>
  );
}
