// Ambient declarations for the Jasmine test globals defined in spec/helper.js.
// These let .ts specs reference the helpers without per-file `declare` clutter.
// (Dormant until a spec-scoped tsconfig is wired up in a later phase, but it is
// the canonical home for these contracts and has no runtime effect.)

type SpecBody = (done?: () => void) => void | Promise<void>;
type SpecFn = (name: string, body: SpecBody, timeout?: number) => void;

declare function reconfigureServer(config?: Record<string, unknown>): Promise<unknown>;

/** Assign a UUID to a test; disables it if the UUID is in the exclusion list. */
declare function it_id(id: string): (spec: SpecFn) => SpecFn;

/** Run a test on every database except the listed ones. */
declare function it_exclude_dbs(dbs: string[]): SpecFn;

/** Run a test only on the given database. */
declare function it_only_db(db: string): SpecFn;

/** Run a describe block only on the given database. */
declare function describe_only_db(db: string): (name: string, body: () => void) => void;
