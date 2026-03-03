export default function DashboardPage() {
  const apps = [
    { title: "ShiftReporter", desc: "Shift reports & email output", href: "/shiftreporter" },
    { title: "LineUp", desc: "Vessel lineup board", href: "/lineup" },
    { title: "Hydro Outlook", desc: "Forecast images & notes", href: "/hydro" },
    { title: "Crew Change", desc: "Templates & checklist", href: "/crew-change" },
    { title: "Port Costs", desc: "Quick estimate tool", href: "/port-costs" },
    { title: "Docs", desc: "Internal references", href: "/docs" },
  ];

  return (
    <main style={{ maxWidth: 1100, margin: "40px auto", padding: "0 20px", fontFamily: "system-ui" }}>
      <header style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 26 }}>Antares Ops Dashboard</h1>
        <p style={{ margin: "6px 0 0", color: "#555" }}>
          Internal apps and reports — authorized personnel only.
        </p>
      </header>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 14,
        }}
      >
        {apps.map((a) => (
          <a
            key={a.title}
            href={a.href}
            style={{
              display: "block",
              padding: 16,
              border: "1px solid #e5e5e5",
              borderRadius: 14,
              textDecoration: "none",
              color: "inherit",
              background: "white",
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 6 }}>{a.title}</div>
            <div style={{ color: "#666", fontSize: 14, lineHeight: 1.35 }}>{a.desc}</div>
          </a>
        ))}
      </section>
    </main>
  );
}
}
