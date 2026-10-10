import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { MODULES } from '../App';
import { HELP_TOPICS, searchHelp, topicText } from './helpContent';

/** All the UI source, to check the guides name real buttons and fields. */
function uiSource(dir = 'src'): string {
  return readdirSync(dir)
    .map((name) => join(dir, name))
    .filter((p) => !p.includes('help') && !/\.test\.tsx?$/.test(p))
    .map((p) => (statSync(p).isDirectory() ? uiSource(p) : p.endsWith('.tsx') || p.endsWith('.ts') ? readFileSync(p, 'utf8') : ''))
    .join('\n');
}

describe('help content', () => {
  it('has unique topics, each with sections', () => {
    const ids = HELP_TOPICS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of HELP_TOPICS) expect(t.sections.length).toBeGreaterThan(0);
  });

  it('links each guide to a real page, and every page has a guide', () => {
    const paths = ['/', ...MODULES.map((m) => m.path)];
    for (const t of HELP_TOPICS) if (t.page) expect(paths).toContain(t.page.path);
    for (const m of MODULES) expect(HELP_TOPICS.some((t) => t.page?.path === m.path)).toBe(true);
  });

  it('names buttons and fields in the steps that really exist in the app', () => {
    const source = uiSource().replace(/&amp;/g, '&');
    // Words the steps bold that are page names or ideas rather than on-screen text.
    const notOnScreen = new Set(['Part 1', 'Part 2', 'Save as PDF', 'Choose File', 'Import', 'Grade preference', 'Apply all']);
    const missing: string[] = [];
    for (const t of HELP_TOPICS) {
      for (const s of t.sections) {
        for (const step of s.steps ?? []) {
          for (const [, name] of step.matchAll(/\*\*(.+?)\*\*/g)) {
            if (!notOnScreen.has(name!) && !source.includes(name!)) missing.push(`${t.id}: ${name}`);
          }
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it('searches every word across titles and text', () => {
    expect(searchHelp('').length).toBe(HELP_TOPICS.length);
    expect(searchHelp('nominate transfer').map((t) => t.id)).toContain('matching');
    expect(searchHelp('backup password').map((t) => t.id)).toContain('plans');
    expect(searchHelp('zzzz')).toEqual([]);
    expect(topicText(HELP_TOPICS[0]!)).not.toContain('**');
  });
});
