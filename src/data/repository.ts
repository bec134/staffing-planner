/**
 * The single data-access layer (see PLAN.md "Data and privacy").
 *
 * All reads and writes go through this interface so browser storage (Dexie /
 * IndexedDB) can be swapped for a shared database later without touching UI
 * or domain code. Nothing in the UI should import Dexie directly.
 */
import type {
  Allocation,
  ClassRules,
  ClassStructure,
  Enrolment,
  Entitlement,
  EntitlementMatch,
  EntitlementPosition,
  Id,
  Leave,
  PlanningYear,
  PositionType,
  Role,
  Staff,
} from '../domain/types';

/** CRUD for records scoped to a planning year. */
export interface ScopedCollection<T extends { id: Id; planningYearId: Id }> {
  listByYear(planningYearId: Id): Promise<T[]>;
  get(id: Id): Promise<T | undefined>;
  put(record: T): Promise<void>;
  putMany(records: T[]): Promise<void>;
  delete(id: Id): Promise<void>;
  deleteMany(ids: Id[]): Promise<void>;
}

export interface PlanningYearCollection {
  list(): Promise<PlanningYear[]>;
  get(id: Id): Promise<PlanningYear | undefined>;
  put(record: PlanningYear): Promise<void>;
}

/** Everything belonging to one planning year, e.g. for backup/export. */
export interface PlanningYearSnapshot {
  planningYear: PlanningYear;
  positionTypes: PositionType[];
  entitlements: Entitlement[];
  staff: Staff[];
  roles: Role[];
  leave: Leave[];
  allocations: Allocation[];
  classStructures: ClassStructure[];
  enrolments: Enrolment[];
  classRules: ClassRules[];
  /** Part 1: entitlement positions and the staff matched to them. */
  positions: EntitlementPosition[];
  matches: EntitlementMatch[];
}

export interface Repository {
  planningYears: PlanningYearCollection;
  positionTypes: ScopedCollection<PositionType>;
  entitlements: ScopedCollection<Entitlement>;
  staff: ScopedCollection<Staff>;
  roles: ScopedCollection<Role>;
  leave: ScopedCollection<Leave>;
  allocations: ScopedCollection<Allocation>;
  classStructures: ScopedCollection<ClassStructure>;
  enrolments: ScopedCollection<Enrolment>;
  classRules: ScopedCollection<ClassRules>;
  positions: ScopedCollection<EntitlementPosition>;
  matches: ScopedCollection<EntitlementMatch>;

  /** Read a planning year and all its records. */
  exportPlanningYear(id: Id): Promise<PlanningYearSnapshot | undefined>;
  /** Replace a planning year and all its records atomically. */
  importPlanningYear(snapshot: PlanningYearSnapshot): Promise<void>;
  /** Delete a planning year and all its records atomically. */
  deletePlanningYear(id: Id): Promise<void>;
  /** Delete everything stored on this device. */
  clearAll(): Promise<void>;
}
