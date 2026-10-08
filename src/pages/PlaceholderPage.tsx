export function PlaceholderPage({ title, phase }: { title: string; phase?: number }) {
  return (
    <section>
      <h1>{title}</h1>
      <p className="muted">
        {phase ? `This module is built in Phase ${phase} (see PLAN.md).` : 'This page does not exist.'}
      </p>
    </section>
  );
}
