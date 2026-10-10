import { Link } from 'react-router-dom';

/** "How to use this page" link to a Help guide, shown under each page title. */
export function HelpLink({ topic }: { topic: string }) {
  return (
    <p className="help-link no-print">
      <Link to={`/help/${topic}`}>How to use this page</Link>
    </p>
  );
}
