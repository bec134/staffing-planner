import { buildSampleData } from '../data/sampleData';
import { newPlanningYear } from './planningYear';
import { planSteps } from './progress';

const blank = () => {
  const p = newPlanningYear(2027, 'Test PS');
  return {
    planningYear: p.planningYear,
    positionTypes: p.positionTypes,
    entitlements: [p.entitlement],
    staff: [],
    roles: [],
    leave: [],
    allocations: [],
    classStructures: [],
    enrolments: [],
    classRules: [],
    positions: [],
    matches: [],
    intentions: [],
  };
};

describe('plan steps', () => {
  it('starts a new plan at the entitlement and staff', () => {
    const steps = planSteps(blank());
    expect(steps.map((s) => [s.id, s.done])).toEqual([
      ['entitlement', false],
      ['staff', false],
      ['matching', false],
      ['leave', true],
      ['classes', false],
      ['placement', false],
      ['reports', undefined],
    ]);
    expect(steps[1]!.detail).toBe('No staff yet: add them by hand or import a CSV file');
    expect(steps[1]!.path).toBe('/staff');
  });

  it('shows where the sample plan is up to', () => {
    const steps = Object.fromEntries(planSteps(buildSampleData()).map((s) => [s.id, s]));
    expect(steps.entitlement).toMatchObject({ done: true, detail: '14.884 FTE entered' });
    expect(steps.staff).toMatchObject({ done: true, detail: '18 staff members' });
    // Sam is temporary, so only permanent and TWT staff count here.
    expect(steps.matching).toMatchObject({ done: true, detail: 'Permanent and TWT staff all matched' });
    expect(steps.classes).toMatchObject({ done: true, detail: '6 classes' });
    expect(steps.placement).toMatchObject({ done: false, detail: '3 roles with unfilled days' });
    expect(steps.leave).toMatchObject({ done: false, detail: '2 leave records not fully covered' });
  });
});
