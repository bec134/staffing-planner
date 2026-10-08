import { defaultPositionTypes, movePositionType, validatePositionTypeName } from './positionTypes';

const types = defaultPositionTypes('y');

describe('position types', () => {
  it('creates the default list with stable IDs and order', () => {
    expect(types).toHaveLength(11);
    expect(types[0]).toMatchObject({ id: 'y-pt-principal', sortOrder: 0, category: 'executive' });
    expect(types[1]).toMatchObject({ id: 'y-pt-classroom-teacher', sortOrder: 1, category: 'class_teacher' });
    expect(types.find((t) => t.name === 'Learning & Support Teacher')!.id).toBe('y-pt-learning-and-support-teacher');
  });

  it('moves a type up or down and renumbers', () => {
    const moved = movePositionType(types, types[2]!.id, -1);
    expect(moved.map((t) => t.name).slice(1, 3)).toEqual(['Assistant Principal', 'Classroom Teacher']);
    expect(moved.map((t) => t.sortOrder)).toEqual([...Array(11).keys()]);
  });

  it('ignores moves past either end', () => {
    expect(movePositionType(types, types[0]!.id, -1).map((t) => t.id)).toEqual(types.map((t) => t.id));
    expect(movePositionType(types, types[10]!.id, 1).map((t) => t.id)).toEqual(types.map((t) => t.id));
  });

  it('validates names', () => {
    expect(validatePositionTypeName('  ', types)).toMatch(/Enter a name/);
    expect(validatePositionTypeName('rff teacher', types)).toMatch(/already exists/);
    expect(validatePositionTypeName('Instructional Leader', types)).toBeNull();
  });
});
