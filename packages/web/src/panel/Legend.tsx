export function Legend() {
  return (
    <section className="section legend" aria-label="Legend">
      <h2>Legend</h2>
      <ul>
        <li><span className="line line--confirmed" aria-hidden /> Confirmed in code</li>
        <li><span className="line line--inferred" aria-hidden /> Inferred</li>
        <li><span className="line line--manual" aria-hidden /> Declared manually</li>
        <li><span className="ghost-dot" aria-hidden /> Referenced but not in catalog</li>
        <li><span className="particle-dot" aria-hidden /> Particles flow in the call direction</li>
      </ul>
    </section>
  );
}
