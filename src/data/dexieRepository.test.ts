import Dexie from 'dexie';
import { createDexieRepository } from './dexieRepository';
import { SAMPLE_PLANNING_YEAR_ID, buildSampleData } from './sampleData';

let n = 0;
const freshRepo = () => createDexieRepository(`test-db-${n++}`);

describe('Dexie repository', () => {
  it('round-trips a planning year snapshot', async () => {
    const repo = freshRepo();
    const sample = buildSampleData('2026-01-01T00:00:00.000Z');
    await repo.importPlanningYear(sample);

    const exported = await repo.exportPlanningYear(SAMPLE_PLANNING_YEAR_ID);
    expect(exported?.planningYear).toEqual(sample.planningYear);
    expect(exported?.staff).toHaveLength(sample.staff.length);
    expect(exported?.positionTypes).toHaveLength(sample.positionTypes.length);
    expect(exported?.entitlements).toEqual(sample.entitlements);
    repo.close();
  });

  it('re-importing replaces rather than duplicates records', async () => {
    const repo = freshRepo();
    const sample = buildSampleData();
    await repo.importPlanningYear(sample);
    await repo.importPlanningYear({ ...sample, staff: sample.staff.slice(0, 2) });

    expect(await repo.staff.listByYear(SAMPLE_PLANNING_YEAR_ID)).toHaveLength(2);
    repo.close();
  });

  it('scopes records to their planning year', async () => {
    const repo = freshRepo();
    await repo.importPlanningYear(buildSampleData());
    await repo.planningYears.put({
      id: 'other',
      year: 2028,
      schoolName: 'Other',
      createdAt: '',
      updatedAt: '',
    });
    await repo.staff.put({
      id: 'other-staff',
      planningYearId: 'other',
      name: 'Test Person',
      workPattern: { mode: 'weekly', days: Array(10).fill(true) },
      currentRole: '',
      employmentType: 'permanent',
      preferences: '',
    });

    expect(await repo.staff.listByYear('other')).toHaveLength(1);
    expect((await repo.planningYears.list()).map((y) => y.year)).toEqual([2027, 2028]);

    await repo.deletePlanningYear(SAMPLE_PLANNING_YEAR_ID);
    expect(await repo.planningYears.get(SAMPLE_PLANNING_YEAR_ID)).toBeUndefined();
    expect(await repo.staff.listByYear(SAMPLE_PLANNING_YEAR_ID)).toHaveLength(0);
    expect(await repo.positionTypes.listByYear(SAMPLE_PLANNING_YEAR_ID)).toHaveLength(0);
    expect(await repo.staff.listByYear('other')).toHaveLength(1);
    repo.close();
  });

  it('rejects a snapshot containing records from another year, leaving data untouched', async () => {
    const repo = freshRepo();
    const sample = buildSampleData();
    await repo.importPlanningYear(sample);
    const bad = {
      ...sample,
      staff: [...sample.staff, { ...sample.staff[0]!, id: 'x', planningYearId: 'elsewhere' }],
    };

    await expect(repo.importPlanningYear(bad)).rejects.toThrow(/different planning year/);
    expect(await repo.staff.listByYear(SAMPLE_PLANNING_YEAR_ID)).toHaveLength(sample.staff.length);
    repo.close();
  });

  it('supports single-record CRUD and clearAll', async () => {
    const repo = freshRepo();
    await repo.importPlanningYear(buildSampleData());
    const first = (await repo.staff.listByYear(SAMPLE_PLANNING_YEAR_ID))[0]!;

    await repo.staff.put({ ...first, name: 'Renamed Person' });
    expect((await repo.staff.get(first.id))?.name).toBe('Renamed Person');

    await repo.staff.delete(first.id);
    expect(await repo.staff.get(first.id)).toBeUndefined();

    await repo.clearAll();
    expect(await repo.planningYears.list()).toEqual([]);
    expect(await repo.staff.listByYear(SAMPLE_PLANNING_YEAR_ID)).toEqual([]);
    repo.close();
  });
});

describe('Dexie schema upgrades', () => {
  it('converts Phase 1 fortnight-day entitlements to milli-FTE', async () => {
    const name = `upgrade-db-${n++}`;
    const v1 = new Dexie(name);
    v1.version(1).stores({ planningYears: 'id, year', entitlements: 'id, planningYearId' });
    await v1.table('entitlements').put({
      id: 'e',
      planningYearId: 'y',
      totalFortnightDays: 30,
      lines: [{ positionTypeId: 'pt', fortnightDays: 22 }],
    });
    v1.close();

    const repo = createDexieRepository(name);
    expect(await repo.entitlements.get('e')).toEqual({
      id: 'e',
      planningYearId: 'y',
      totalMilliFte: 3000,
      lines: [{ positionTypeId: 'pt', milliFte: 2200 }],
    });
    repo.close();
  });
});
