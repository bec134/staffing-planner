import { defaultPositionTypes, movePositionType, validatePositionTypeName } from './positionTypes';

const types = defaultPositionTypes('y');

describe('position types', () => {
  it('creates the default list with stable IDs and order', () => {
    expect(types).toHaveLength(10);
    expect(types[0]).toMatchObject({ id: 'y-pt-classroom-teacher', sortOrder: 0, category: 'class_teacher' });
    expect(types.find((t) => t.name === 'Learning & Support Teacher')!.id).toBe('y-pt-learning-and-support-teacher');
  });

  it('moves a type up or down and renumbers', () => {
    const moved = movePositionType(types, types[1]!.id, -1);
    expect(moved.map((t) => t.name).slice(0, 2)).toEqual(['Assistant Principal', 'Classroom Teacher']);
    expect(moved.map((t) => t.sortOrder)).toEqual([...Array(10).keys()]);
  });

  it('ignores moves past either end', () => {
    expect(movePositionType(types, types[0]!.id, -1).map((t) => t.id)).toEqual(types.map((t) => t.id));
    expect(movePositionType(types, types[9]!.id, 1).map((t) => t.id)).toEqual(types.map((t) => t.id));
  });

  it('validates names', () => {
    expect(validatePositionTypeName('  ', types)).toMatch(/Enter a name/);
    expect(validatePositionTypeName('rff teacher', types)).toMatch(/already exists/);
    expect(validatePositionTypeName('Instructional Leader', types)).toBeNull();
  });
});
