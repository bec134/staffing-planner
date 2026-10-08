/**
 * Browser-storage implementation of Repository, using Dexie over IndexedDB.
 * This is the only file that knows about Dexie.
 */
import Dexie, { type Table } from 'dexie';
import type { Id, PlanningYear } from '../domain/types';
import type { PlanningYearSnapshot, Repository, ScopedCollection } from './repository';

type Scoped = { id: Id; planningYearId: Id };

const SCOPED_TABLES = [
  'positionTypes',
  'entitlements',
  'staff',
  'leave',
  'allocations',
  'classStructures',
  'enrolments',
  'classRules',
] as const satisfies readonly (keyof PlanningYearSnapshot)[];

type ScopedTableName = (typeof SCOPED_TABLES)[number];
type RecordOf<K extends ScopedTableName> = PlanningYearSnapshot[K][number];

class StaffingDb extends Dexie {
  planningYears!: Table<PlanningYear, Id>;
  positionTypes!: Table<RecordOf<'positionTypes'>, Id>;
  entitlements!: Table<RecordOf<'entitlements'>, Id>;
  staff!: Table<RecordOf<'staff'>, Id>;
  leave!: Table<RecordOf<'leave'>, Id>;
  allocations!: Table<RecordOf<'allocations'>, Id>;
  classStructures!: Table<RecordOf<'classStructures'>, Id>;
  enrolments!: Table<RecordOf<'enrolments'>, Id>;
  classRules!: Table<RecordOf<'classRules'>, Id>;

  constructor(name: string) {
    super(name);
    this.version(1).stores({
      planningYears: 'id, year',
      positionTypes: 'id, planningYearId',
      entitlements: 'id, planningYearId',
      staff: 'id, planningYearId',
      leave: 'id, planningYearId, staffId',
      allocations: 'id, planningYearId, staffId, positionTypeId, coveringLeaveId',
      classStructures: 'id, planningYearId',
      enrolments: 'id, planningYearId',
      classRules: 'id, planningYearId',
    });
  }

  scopedTables(): Table<Scoped, Id>[] {
    return SCOPED_TABLES.map((name) => this[name] as Table<Scoped, Id>);
  }
}

function scopedCollection<T extends Scoped>(table: Table<T, Id>): ScopedCollection<T> {
  return {
    listByYear: (planningYearId) => table.where('planningYearId').equals(planningYearId).toArray(),
    get: (id) => table.get(id),
    put: async (record) => {
      await table.put(record);
    },
    putMany: async (records) => {
      await table.bulkPut(records);
    },
    delete: (id) => table.delete(id),
  };
}

export function createDexieRepository(dbName = 'staffing-planner'): Repository & { close(): void } {
  const db = new StaffingDb(dbName);

  const deleteYearRecords = (id: Id) =>
    Promise.all(db.scopedTables().map((t) => t.where('planningYearId').equals(id).delete()));

  return {
    planningYears: {
      list: () => db.planningYears.orderBy('year').toArray(),
      get: (id) => db.planningYears.get(id),
      put: async (record) => {
        await db.planningYears.put(record);
      },
    },
    positionTypes: scopedCollection(db.positionTypes),
    entitlements: scopedCollection(db.entitlements),
    staff: scopedCollection(db.staff),
    leave: scopedCollection(db.leave),
    allocations: scopedCollection(db.allocations),
    classStructures: scopedCollection(db.classStructures),
    enrolments: scopedCollection(db.enrolments),
    classRules: scopedCollection(db.classRules),

    async exportPlanningYear(id) {
      return db.transaction('r', [db.planningYears, ...db.scopedTables()], async () => {
        const planningYear = await db.planningYears.get(id);
        if (!planningYear) return undefined;
        const byYear = <K extends ScopedTableName>(name: K) =>
          (db[name] as Table<RecordOf<K>, Id>).where('planningYearId').equals(id).toArray();
        return {
          planningYear,
          positionTypes: await byYear('positionTypes'),
          entitlements: await byYear('entitlements'),
          staff: await byYear('staff'),
          leave: await byYear('leave'),
          allocations: await byYear('allocations'),
          classStructures: await byYear('classStructures'),
          enrolments: await byYear('enrolments'),
          classRules: await byYear('classRules'),
        };
      });
    },

    async importPlanningYear(snapshot) {
      const id = snapshot.planningYear.id;
      await db.transaction('rw', [db.planningYears, ...db.scopedTables()], async () => {
        await deleteYearRecords(id);
        await db.planningYears.put(snapshot.planningYear);
        for (const name of SCOPED_TABLES) {
          const records = snapshot[name] as Scoped[];
          const foreign = records.find((r) => r.planningYearId !== id);
          if (foreign) {
            throw new Error(`${name} record ${foreign.id} belongs to a different planning year`);
          }
          await (db[name] as Table<Scoped, Id>).bulkPut(records);
        }
      });
    },

    async deletePlanningYear(id) {
      await db.transaction('rw', [db.planningYears, ...db.scopedTables()], async () => {
        await deleteYearRecords(id);
        await db.planningYears.delete(id);
      });
    },

    async clearAll() {
      await db.transaction('rw', [db.planningYears, ...db.scopedTables()], async () => {
        await Promise.all([db.planningYears.clear(), ...db.scopedTables().map((t) => t.clear())]);
      });
    },

    close: () => db.close(),
  };
}
