import type { EntitlementSummary, FteFigures } from '../../domain/entitlement';
import { formatFte } from '../../domain/fte';
import { POSITION_CATEGORY_LABELS } from '../../domain/types';

function Remaining({ value }: { value: number }) {
  const cls = value < 0 ? 'over' : value > 0 ? 'under' : 'balanced';
  return <span className={`remaining ${cls}`}>{formatFte(value)}</span>;
}

function Cells({ f }: { f: FteFigures }) {
  return (
    <>
      <td className="num">{formatFte(f.entitled)}</td>
      <td className="num">{formatFte(f.allocated)}</td>
      <td className="num">
        <Remaining value={f.remaining} />
      </td>
    </>
  );
}

export function EntitlementDashboard({ summary }: { summary: EntitlementSummary }) {
  const { total } = summary;
  return (
    <section aria-labelledby="dashboard-heading">
      <h2 id="dashboard-heading">Entitlement vs allocated</h2>
      <div className="stat-row">
        <div className="stat">
          <div className="stat-label">Entitlement</div>
          <div className="stat-value">{formatFte(total.entitled)}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Allocated</div>
          <div className="stat-value">{formatFte(total.allocated)}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Remaining</div>
          <div className="stat-value">
            <Remaining value={total.remaining} />
          </div>
        </div>
      </div>
      <p className="muted small">
        FTE. Negative remaining means over-allocated. Allocations are added in Phase 3; leave cover is not counted
        against entitlement.
      </p>

      <table>
        <thead>
          <tr>
            <th>Position type</th>
            <th className="num">Entitlement</th>
            <th className="num">Allocated</th>
            <th className="num">Remaining</th>
          </tr>
        </thead>
        {summary.byCategory.map((cat) => {
          const rows = summary.byPositionType.filter((r) => r.positionType.category === cat.category);
          if (rows.length === 0) return null;
          return (
            <tbody key={cat.category}>
              {rows.map((r) => (
                <tr key={r.positionType.id}>
                  <td>{r.positionType.name}</td>
                  <Cells f={r} />
                </tr>
              ))}
              <tr className="subtotal">
                <td>{POSITION_CATEGORY_LABELS[cat.category]} subtotal</td>
                <Cells f={cat} />
              </tr>
            </tbody>
          );
        })}
        <tfoot>
          <tr className="total">
            <td>Total</td>
            <Cells f={total} />
          </tr>
        </tfoot>
      </table>
      {summary.unknownPositionTypeAllocated > 0 && (
        <p className="warning" role="alert">
          {formatFte(summary.unknownPositionTypeAllocated)} FTE is allocated to position types that no longer exist.
        </p>
      )}
    </section>
  );
}
