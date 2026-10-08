import { useId } from 'react';
import { FORTNIGHT_DAYS, WEEKDAYS, fteOf, repeatsWeekly, type DayPattern, type PatternMode } from '../domain/dayPattern';

interface Props {
  legend: string;
  value: DayPattern;
  onChange(value: DayPattern): void;
  /** Days that may be ticked; others are disabled. Defaults to all. */
  allowed?: DayPattern;
  /** Show the weekly/fortnightly switch. */
  allowModeSwitch?: boolean;
}

const WEEK = WEEKDAYS.length;

/**
 * Pick days in a weekly pattern (Mon–Fri, 1 day = 0.2 FTE) or a fortnightly
 * one (Week A and Week B, 1 day = 0.1 FTE). Stored as 10 fortnight days.
 */
export function DayPatternEditor({ legend, value, onChange, allowed, allowModeSwitch = true }: Props) {
  const id = useId();
  const isAllowed = (i: number) => !allowed || allowed.days[i] === true;

  const setMode = (mode: PatternMode) => {
    if (mode === value.mode) return;
    // Going weekly repeats Week A, so the pattern stays a valid weekly one.
    const days = mode === 'weekly' ? [...value.days.slice(0, WEEK), ...value.days.slice(0, WEEK)] : [...value.days];
    onChange({ mode, days });
  };

  const toggle = (indices: number[], checked: boolean) => {
    const days = [...value.days];
    for (const i of indices) days[i] = checked;
    onChange({ ...value, days });
  };

  const row = (label: string | null, offset: number) => (
    <div className="day-row">
      {label && <span className="week-label">{label}</span>}
      {WEEKDAYS.map((name, d) => {
        const indices = value.mode === 'weekly' ? [d, d + WEEK] : [d + offset];
        const enabled = indices.every(isAllowed);
        const checked = indices.every((i) => value.days[i]);
        return (
          <label key={name} className={`day ${enabled ? '' : 'disabled'}`}>
            <input
              type="checkbox"
              checked={checked}
              disabled={!enabled && !checked}
              onChange={(e) => toggle(indices, e.target.checked)}
              aria-label={label ? `${name} week ${label.slice(-1)}` : name}
            />
            {name}
          </label>
        );
      })}
    </div>
  );

  return (
    <fieldset className="day-pattern">
      <legend>{legend}</legend>
      {allowModeSwitch && (
        <div className="mode-switch" role="radiogroup" aria-label={`${legend} pattern`}>
          {(['weekly', 'fortnightly'] as const).map((mode) => (
            <label key={mode}>
              <input
                type="radio"
                name={`${id}-mode`}
                checked={value.mode === mode}
                onChange={() => setMode(mode)}
              />
              {mode === 'weekly' ? 'Same days every week' : 'Week A / Week B differ'}
            </label>
          ))}
        </div>
      )}
      {value.mode === 'weekly' ? row(null, 0) : (
        <>
          {row('Week A', 0)}
          {row('Week B', WEEK)}
        </>
      )}
      <div className="muted small">
        {value.days.filter(Boolean).length} of {FORTNIGHT_DAYS} fortnight days = {fteOf(value).toFixed(1)} FTE
        {value.mode === 'fortnightly' && repeatsWeekly(value) && ' (both weeks are the same)'}
      </div>
    </fieldset>
  );
}
