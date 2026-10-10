import { Fragment, useState, type ReactNode } from 'react';
import { Link, Route, Routes, useParams } from 'react-router-dom';
import { HELP_TOPICS, helpTopic, searchHelp, type HelpTopic } from '../../help/helpContent';

/** "Click **Save**" → Click <strong>Save</strong>. */
function rich(text: string): ReactNode {
  return text.split(/\*\*(.+?)\*\*/g).map((part, i) => (i % 2 ? <strong key={i}>{part}</strong> : <Fragment key={i}>{part}</Fragment>));
}

/** Help (Bec): step-by-step guides for each part of the app. */
export function HelpPage() {
  return (
    <Routes>
      <Route index element={<HelpContents />} />
      <Route path=":id" element={<HelpGuide />} />
    </Routes>
  );
}

function HelpContents() {
  const [query, setQuery] = useState('');
  const found = searchHelp(query);
  const groups = [...new Set(HELP_TOPICS.map((t) => t.group))];
  return (
    <section className="help">
      <h1>Help</h1>
      <p className="muted">Step-by-step guides for each part of the app. New here? Start with Getting started.</p>
      <label className="field">
        Search help{' '}
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="e.g. backup, LWOP, transfer" />
      </label>
      {found.length === 0 && <p className="muted">No help topics match "{query}".</p>}
      {groups.map((g) => {
        const topics = found.filter((t) => t.group === g);
        if (!topics.length) return null;
        return (
          <section key={g} className="help-group">
            <h2>{g}</h2>
            <ul className="help-topics">
              {topics.map((t) => (
                <li key={t.id}>
                  <Link to={`/help/${t.id}`}>{t.title}</Link>
                  <span className="muted small"> — {t.summary}</span>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </section>
  );
}

function HelpGuide() {
  const { id = '' } = useParams();
  const topic = helpTopic(id);
  if (!topic) {
    return (
      <p>
        Help topic not found. <Link to="/help">All help topics</Link>
      </p>
    );
  }
  const i = HELP_TOPICS.indexOf(topic);
  const prev: HelpTopic | undefined = HELP_TOPICS[i - 1];
  const next: HelpTopic | undefined = HELP_TOPICS[i + 1];
  return (
    <article className="help" aria-label={topic.title}>
      <p className="no-print">
        <Link to="/help">← All help topics</Link>
      </p>
      <h1>{topic.title}</h1>
      <p className="muted">{topic.summary}</p>
      {topic.page && (
        <p className="no-print">
          <Link className="button-link secondary small" to={topic.page.path}>
            Go to {topic.page.label} →
          </Link>
        </p>
      )}
      {topic.sections.map((s) => (
        <section key={s.heading} className="help-section">
          <h2>{s.heading}</h2>
          {s.text?.map((p) => <p key={p}>{rich(p)}</p>)}
          {s.steps && (
            <ol className="help-steps">
              {s.steps.map((step) => (
                <li key={step}>{rich(step)}</li>
              ))}
            </ol>
          )}
          {s.points && (
            <ul>
              {s.points.map((p) => (
                <li key={p}>{rich(p)}</li>
              ))}
            </ul>
          )}
          {s.tip && (
            <p className="help-tip">
              <strong>Tip:</strong> {rich(s.tip)}
            </p>
          )}
        </section>
      ))}
      <nav className="help-pager no-print" aria-label="More help">
        {prev ? <Link to={`/help/${prev.id}`}>← {prev.title}</Link> : <span />}
        {next ? <Link to={`/help/${next.id}`}>{next.title} →</Link> : <span />}
      </nav>
    </article>
  );
}
