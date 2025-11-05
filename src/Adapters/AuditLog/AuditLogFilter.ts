import type { AuditEvent } from './AuditLogAdapterInterface';

/**
 * Filter configuration for selective audit logging
 */
export interface AuditLogFilterConfig {
  /** Whitelist of event types to log (if undefined, all events are logged) */
  events?: string[];
  /** Whitelist of Parse classes to log (if defined, only these classes are logged) */
  includeClasses?: string[];
  /** Blacklist of Parse classes to exclude from logging */
  excludeClasses?: string[];
  /** Whether to exclude operations performed with master key */
  excludeMasterKey?: boolean;
  /** Whitelist of user roles to log (if defined, only these roles are logged) */
  includeRoles?: string[];
  /** Blacklist of user roles to exclude from logging */
  excludeRoles?: string[];
  /** Custom filter function for advanced filtering */
  filter?: (event: AuditEvent) => boolean;
}

/**
 * AuditLogFilter provides filtering logic to determine which audit events should be logged.
 * This allows for selective logging based on event types, classes, users, and custom logic.
 */
export class AuditLogFilter {
  private config: AuditLogFilterConfig;

  constructor(config: AuditLogFilterConfig = {}) {
    this.config = config;
  }

  /**
   * Determine if an event should be logged based on filter configuration.
   * Evaluation order:
   * 1. Event type filtering (whitelist)
   * 2. Class name filtering (whitelist/blacklist)
   * 3. Master key filtering (blacklist)
   * 4. User role filtering (whitelist/blacklist)
   * 5. Custom filter function
   */
  shouldLog(event: AuditEvent): boolean {
    // If no filter config, log everything
    if (!this.config || Object.keys(this.config).length === 0) {
      return true;
    }

    // 1. Event type filtering (whitelist)
    if (!this.checkEventType(event)) {
      return false;
    }

    // 2. Class name filtering (whitelist/blacklist)
    if (!this.checkClassName(event)) {
      return false;
    }

    // 3. Master key filtering (exclude if configured)
    if (!this.checkMasterKey(event)) {
      return false;
    }

    // 4. User role filtering (whitelist/blacklist)
    if (!this.checkUserRoles(event)) {
      return false;
    }

    // 5. Custom filter function
    if (!this.checkCustomFilter(event)) {
      return false;
    }

    return true;
  }

  /**
   * Check if event type is allowed
   */
  private checkEventType(event: AuditEvent): boolean {
    const { events } = this.config;

    // If no event filter, allow all event types
    if (!events || !Array.isArray(events) || events.length === 0) {
      return true;
    }

    // Whitelist: only log events in the list
    return events.includes(event.eventType);
  }

  /**
   * Check if class name is allowed (for class-based events)
   */
  private checkClassName(event: AuditEvent): boolean {
    const { includeClasses, excludeClasses } = this.config;

    // Extract className from event (different event types store it differently)
    const className = this.extractClassName(event);

    // If event doesn't have a className, skip class filtering
    if (!className) {
      return true;
    }

    // Blacklist check: exclude specific classes
    if (excludeClasses && Array.isArray(excludeClasses) && excludeClasses.length > 0) {
      if (excludeClasses.includes(className)) {
        return false;
      }
    }

    // Whitelist check: only include specific classes
    if (includeClasses && Array.isArray(includeClasses) && includeClasses.length > 0) {
      return includeClasses.includes(className);
    }

    // If no class filters, allow
    return true;
  }

  /**
   * Extract className from event based on event structure
   */
  private extractClassName(event: AuditEvent): string | undefined {
    // Type-safe extraction based on event structure
    if ('className' in event) {
      return (event as any).className;
    }
    return undefined;
  }

  /**
   * Check if master key operations should be excluded
   */
  private checkMasterKey(event: AuditEvent): boolean {
    const { excludeMasterKey } = this.config;

    // If not configured to exclude master key, allow
    if (!excludeMasterKey) {
      return true;
    }

    // Exclude if event was performed with master key
    if (event.isMasterKey === true) {
      return false;
    }

    return true;
  }

  /**
   * Check if user roles are allowed
   */
  private checkUserRoles(event: AuditEvent): boolean {
    const { includeRoles, excludeRoles } = this.config;

    // If event doesn't have roles, skip role filtering
    if (!event.roles || !Array.isArray(event.roles) || event.roles.length === 0) {
      // If includeRoles is specified, absence of roles means exclude
      if (includeRoles && Array.isArray(includeRoles) && includeRoles.length > 0) {
        return false;
      }
      return true;
    }

    // Blacklist check: exclude if user has any excluded role
    if (excludeRoles && Array.isArray(excludeRoles) && excludeRoles.length > 0) {
      const hasExcludedRole = event.roles.some(role => excludeRoles.includes(role));
      if (hasExcludedRole) {
        return false;
      }
    }

    // Whitelist check: only include if user has at least one included role
    if (includeRoles && Array.isArray(includeRoles) && includeRoles.length > 0) {
      const hasIncludedRole = event.roles.some(role => includeRoles.includes(role));
      return hasIncludedRole;
    }

    // If no role filters, allow
    return true;
  }

  /**
   * Check custom filter function
   */
  private checkCustomFilter(event: AuditEvent): boolean {
    const { filter } = this.config;

    // If no custom filter, allow
    if (!filter || typeof filter !== 'function') {
      return true;
    }

    try {
      // Execute custom filter function
      return filter(event) === true;
    } catch (error) {
      // If custom filter throws, log error and allow the event
      // (fail open to prevent filter bugs from blocking all logging)
      console.error('Error in custom audit log filter:', error);
      return true;
    }
  }
}

/**
 * Static helper to quickly check if an event should be logged
 */
export function shouldLogEvent(event: AuditEvent, config: AuditLogFilterConfig): boolean {
  const filter = new AuditLogFilter(config);
  return filter.shouldLog(event);
}

export default AuditLogFilter;
