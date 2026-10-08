import { createDexieRepository } from './dexieRepository';
import { observeRepository } from './observableRepository';
import { SAMPLE_PLANNING_YEAR_ID, buildSampleData } from './sampleData';

describe('observeRepository', () => {
  it('notifies after each successful write, not after reads', async () => {
    const base = createDexieRepository('observable-test');
    const repo = observeRepository(base);
    let count = 0;
    const unsubscribe = repo.subscribe(() => count++);

    await repo.importPlanningYear(buildSampleData());
    expect(count).toBe(1);

    const [first] = await repo.staff.listByYear(SAMPLE_PLANNING_YEAR_ID);
    expect(count).toBe(1);

    await repo.staff.put({ ...first!, name: 'Renamed' });
    await repo.roles.deleteMany([`${SAMPLE_PLANNING_YEAR_ID}-role-eald`]);
    await repo.planningYears.put({ ...(await repo.planningYears.get(SAMPLE_PLANNING_YEAR_ID))!, schoolName: 'X' });
    expect(count).toBe(4);
    expect((await base.staff.get(first!.id))?.name).toBe('Renamed');

    unsubscribe();
    await repo.clearAll();
    expect(count).toBe(4);
    base.close();
  });
});
