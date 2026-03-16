// src/cloud-code/CloudCodeManager.ts

import type {
  CloudCodeAdapter,
  CloudCodeRegistry,
  CloudFunctionHandler,
  CloudJobHandler,
  CloudTriggerHandler,
  FunctionEntry,
  JobEntry,
  LiveQueryEntry,
  LiveQueryHandler,
  ParseServerConfig,
  TriggerEntry,
  TriggerName,
  ValidatorHandler,
} from './types';

// Triggers that are restricted to _User class only
const USER_ONLY_TRIGGERS = new Set<TriggerName>([
  'beforeLogin',
  'afterLogin',
  'beforePasswordResetRequest',
]);

// Triggers blocked on _PushStatus (all except afterSave)
const PUSH_STATUS_ALLOWED_TRIGGERS = new Set<TriggerName>(['afterSave']);

function makeTriggerKey(className: string, triggerName: string): string {
  return `${className}:${triggerName}`;
}

function validateTriggerConstraints(className: string, triggerName: TriggerName): void {
  if (className === '_PushStatus' && !PUSH_STATUS_ALLOWED_TRIGGERS.has(triggerName)) {
    throw new Error(
      `Trigger "${triggerName}" is not allowed on _PushStatus. Only afterSave is permitted.`
    );
  }

  if (className === '_Session' && triggerName !== 'afterLogout') {
    throw new Error(
      `Trigger "${triggerName}" is not allowed on _Session. Only afterLogout is permitted.`
    );
  }

  if (USER_ONLY_TRIGGERS.has(triggerName) && className !== '_User') {
    throw new Error(
      `Trigger "${triggerName}" is only allowed on _User class, not "${className}".`
    );
  }

  if (triggerName === 'afterLogout' && className !== '_Session') {
    throw new Error(
      `Trigger "afterLogout" is only allowed on _Session class, not "${className}".`
    );
  }
}

export class CloudCodeManager {
  private readonly functions: Map<string, FunctionEntry> = new Map();
  private readonly triggers: Map<string, TriggerEntry> = new Map();
  private readonly jobs: Map<string, JobEntry> = new Map();
  private readonly liveQueryHandlers: LiveQueryEntry[] = [];
  private readonly adapters: CloudCodeAdapter[] = [];

  // ─── Function Registration ─────────────────────────────────────────────────

  defineFunction(
    name: string,
    handler: CloudFunctionHandler,
    source: string,
    validator?: ValidatorHandler
  ): void {
    const existing = this.functions.get(name);
    if (existing && existing.source !== source) {
      throw new Error(
        `Cloud function "${name}" is already registered by source "${existing.source}". Cannot register from "${source}".`
      );
    }
    this.functions.set(name, { handler, source, validator });
  }

  getFunction(name: string): FunctionEntry | null {
    return this.functions.get(name) ?? null;
  }

  getFunctionNames(): string[] {
    return Array.from(this.functions.keys());
  }

  getValidator(key: string): ValidatorHandler | null {
    // Check functions first
    const fnEntry = this.functions.get(key);
    if (fnEntry) {
      return fnEntry.validator ?? null;
    }
    // Check triggers — key format from facade is "triggerType.className"
    // Convert to our internal key format "className:triggerName"
    const dotIdx = key.indexOf('.');
    if (dotIdx !== -1) {
      const triggerName = key.substring(0, dotIdx);
      const className = key.substring(dotIdx + 1);
      const triggerEntry = this.triggers.get(makeTriggerKey(className, triggerName));
      if (triggerEntry) {
        return triggerEntry.validator ?? null;
      }
    }
    return null;
  }

  removeFunction(name: string): void {
    this.functions.delete(name);
  }

  // ─── Trigger Registration ──────────────────────────────────────────────────

  defineTrigger(
    className: string,
    triggerName: TriggerName,
    handler: CloudTriggerHandler,
    source: string,
    validator?: ValidatorHandler
  ): void {
    validateTriggerConstraints(className, triggerName);

    const key = makeTriggerKey(className, triggerName);
    const existing = this.triggers.get(key);
    if (existing && existing.source !== source) {
      throw new Error(
        `Trigger "${triggerName}" on "${className}" is already registered by source "${existing.source}". Cannot register from "${source}".`
      );
    }
    this.triggers.set(key, { handler, source, validator });
  }

  getTrigger(className: string, triggerName: string): TriggerEntry | null {
    return this.triggers.get(makeTriggerKey(className, triggerName)) ?? null;
  }

  triggerExists(className: string, triggerName: string): boolean {
    return this.triggers.has(makeTriggerKey(className, triggerName));
  }

  removeTrigger(className: string, triggerName: string): void {
    this.triggers.delete(makeTriggerKey(className, triggerName));
  }

  // ─── Job Registration ──────────────────────────────────────────────────────

  defineJob(name: string, handler: CloudJobHandler, source: string): void {
    const existing = this.jobs.get(name);
    if (existing && existing.source !== source) {
      throw new Error(
        `Cloud job "${name}" is already registered by source "${existing.source}". Cannot register from "${source}".`
      );
    }
    this.jobs.set(name, { handler, source });
  }

  getJob(name: string): JobEntry | null {
    return this.jobs.get(name) ?? null;
  }

  getJobs(): Map<string, JobEntry> {
    return this.jobs;
  }

  getJobsObject(): Record<string, CloudJobHandler> {
    const result: Record<string, CloudJobHandler> = {};
    for (const [name, entry] of this.jobs) {
      result[name] = entry.handler;
    }
    return result;
  }

  // ─── Live Query Handlers ───────────────────────────────────────────────────

  defineLiveQueryHandler(handler: LiveQueryHandler, source: string): void {
    this.liveQueryHandlers.push({ handler, source });
  }

  runLiveQueryEventHandlers(data: unknown): void {
    for (const entry of this.liveQueryHandlers) {
      entry.handler(data);
    }
  }

  // ─── Removal ──────────────────────────────────────────────────────────────

  unregisterAll(source: string): void {
    for (const [name, entry] of this.functions) {
      if (entry.source === source) {
        this.functions.delete(name);
      }
    }

    for (const [key, entry] of this.triggers) {
      if (entry.source === source) {
        this.triggers.delete(key);
      }
    }

    for (const [name, entry] of this.jobs) {
      if (entry.source === source) {
        this.jobs.delete(name);
      }
    }

    const handlersToRemove = this.liveQueryHandlers.filter(e => e.source === source);
    for (const entry of handlersToRemove) {
      const idx = this.liveQueryHandlers.indexOf(entry);
      if (idx !== -1) {
        this.liveQueryHandlers.splice(idx, 1);
      }
    }
  }

  clearAll(): void {
    this.functions.clear();
    this.triggers.clear();
    this.jobs.clear();
    this.liveQueryHandlers.length = 0;
  }

  // ─── Registry Factory ──────────────────────────────────────────────────────

  createRegistry(source: string): CloudCodeRegistry {
    const manager = this;
    return {
      defineFunction(name: string, handler: CloudFunctionHandler, validator?: ValidatorHandler): void {
        manager.defineFunction(name, handler, source, validator);
      },
      defineTrigger(
        className: string,
        triggerName: TriggerName,
        handler: CloudTriggerHandler,
        validator?: ValidatorHandler
      ): void {
        manager.defineTrigger(className, triggerName, handler, source, validator);
      },
      defineJob(name: string, handler: CloudJobHandler): void {
        manager.defineJob(name, handler, source);
      },
      defineLiveQueryHandler(handler: LiveQueryHandler): void {
        manager.defineLiveQueryHandler(handler, source);
      },
    };
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  async initialize(adapters: CloudCodeAdapter[], config: ParseServerConfig): Promise<void> {
    const seen = new Set<string>();
    for (const adapter of adapters) {
      if (seen.has(adapter.name)) {
        throw new Error(
          `Duplicate adapter name "${adapter.name}". Each adapter must have a unique name.`
        );
      }
      seen.add(adapter.name);
    }

    for (const adapter of adapters) {
      const registry = this.createRegistry(adapter.name);
      await adapter.initialize(registry, config);
      this.adapters.push(adapter);
    }
  }

  async shutdown(): Promise<void> {
    for (const adapter of this.adapters) {
      await adapter.shutdown();
    }
  }

  async healthCheck(): Promise<boolean> {
    for (const adapter of this.adapters) {
      const healthy = await adapter.isHealthy();
      if (!healthy) {
        return false;
      }
    }
    return true;
  }
}
