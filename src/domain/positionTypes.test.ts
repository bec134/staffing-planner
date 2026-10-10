import { defaultPositionTypes, missingDefaultPositionTypes, moveGroup, movePositionType, validatePositionTypeName } from './positionTypes';

const types = defaultPositionTypes('y');

describe('position types', () => {
  it('creates the default list with stable IDs and order', () => {
    expect(types).toHaveLength(13);
    expect(types.slice(-2).map((t) => [t.name, t.category])).toEqual([
      ['Part-time Teacher', 'other_teaching'],
      ['School Counsellor', 'other_teaching'],
    ]);
    expect(types[0]).toMatchObject({ id: 'y-pt-principal', sortOrder: 0, category: 'executive' });
    expect(types[1]).toMatchObject({ id: 'y-pt-classroom-teacher', sortOrder: 1, category: 'class_teacher' });
    expect(types.find((t) => t.name === 'Learning & Support Teacher')!.id).toBe('y-pt-learning-and-support-teacher');
  });

  it('moves a type up or down and renumbers', () => {
    const moved = movePositionType(types, types[2]!.id, -1);
    expect(moved.map((t) => t.name).slice(1, 3)).toEqual(['Assistant Principal', 'Classroom Teacher']);
    expect(moved.map((t) => t.sortOrder)).toEqual([...Array(types.length).keys()]);
  });

  it('ignores moves past either end', () => {
    expect(movePositionType(types, types[0]!.id, -1).map((t) => t.id)).toEqual(types.map((t) => t.id));
    expect(movePositionType(types, types.at(-1)!.id, 1).map((t) => t.id)).toEqual(types.map((t) => t.id));
  });

  it('validates names', () => {
    expect(validatePositionTypeName('  ', types)).toMatch(/Enter a name/);
    expect(validatePositionTypeName('rff teacher', types)).toMatch(/already exists/);
    expect(validatePositionTypeName('Instructional Leader', types)).toBeNull();
  });

  it('finds standard types missing from an older plan, adding them at the end', () => {
    // A plan made before Part-time Teacher and School Counsellor were standard,
    // with one type renamed and one reordered.
    const older = types.slice(0, 11).map((t) => (t.name === 'QTSS Teacher' ? { ...t, name: 'QTSS' } : t));
    const missing = missingDefaultPositionTypes('y', older);
    expect(missing.map((t) => [t.name, t.id, t.sortOrder])).toEqual([
      ['Part-time Teacher', 'y-pt-part-time-teacher', 11],
      ['School Counsellor', 'y-pt-school-counsellor', 12],
    ]);
    expect(missingDefaultPositionTypes('y', types)).toEqual([]);
    // Added by hand already, under any capitalisation.
    expect(missingDefaultPositionTypes('y', [...older, { ...types[0]!, id: 'x', name: 'school counsellor' }]).map((t) => t.name)).toEqual([
      'Part-time Teacher',
    ]);
  });

  it('moves a group past the next shown group, skipping types with nothing shown', () => {
    const id = (name: string) => types.find((t) => t.name === name)!.id;
    const names = (list: typeof types) => list.map((t) => t.name);
    // Only these have positions; the APs in between have none.
    const shown = ['Principal', 'Classroom Teacher', 'Deputy Principal', 'RFF Teacher'].map(id);
    const up = moveGroup(types, shown, id('Deputy Principal'), -1);
    expect(names(up).slice(0, 3)).toEqual(['Principal', 'Deputy Principal', 'Classroom Teacher']);
    expect(up.map((t) => t.sortOrder)).toEqual([...Array(types.length).keys()]);
    const down = moveGroup(types, shown, id('Classroom Teacher'), 1);
    expect(names(down).indexOf('Classroom Teacher')).toBe(names(down).indexOf('Deputy Principal') + 1);
    // Already first: no change.
    expect(names(moveGroup(types, shown, id('Principal'), -1))).toEqual(names(types));
  });
});
