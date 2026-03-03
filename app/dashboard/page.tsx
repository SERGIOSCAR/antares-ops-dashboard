export default function DashboardPage() {
  const apps = [
    { name: "ShiftReporter", href: "/shiftreporter" },
    { name: "LineUp", href: "/lineup" },
    { name: "Hydro Outlook", href: "/hydro" },
    { name: "Crew Change", href: "/crew-change" },
  ];

  return (
    <main
      style={{
        maxWidth: 960,
        margin: "40px auto",
        padding: "0 20px",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <h1 style={{ marginBottom: 8 }}>Antares Ops Dashboard</h1>
      <p style={{ marginTop: 0, marginBottom: 20, color: "#555" }}>
        Internal portal modules
      </p>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 12,
        }}
      >
        {apps.map((app) => (
          <a
            key={app.name}
            href={app.href}
            target={app.href.startsWith("http") ? "_blank" : undefined}
            rel={app.href.startsWith("http") ? "noopener noreferrer" : undefined}
            style={{
              display: "block",
              padding: 14,
              border: "1px solid #ddd",
              borderRadius: 10,
              textDecoration: "none",
              color: "inherit",
              background: "#fff",
            }}
          >
            <strong>{app.name}</strong>
          </a>
        ))}
      </section>
    </main>
  );
}
