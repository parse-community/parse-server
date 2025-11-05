/**
 * Audit event types supported by the system
 */
export type AuditEventType =
  | 'SYSTEM'
  | 'USER_LOGIN'
  | 'DATA_VIEW'
  | 'DATA_CREATE'
  | 'DATA_UPDATE'
  | 'DATA_DELETE'
  | 'ACL_MODIFY'
  | 'SCHEMA_MODIFY'
  | 'PUSH_SEND';

/**
 * Base audit event structure containing common fields
 */
export interface AuditEvent {
  eventType: AuditEventType;
  timestamp: string;
  appId: string;
  userId?: string;
  sessionToken?: string;
  ip?: string;
  success: boolean;
  error?: string;
  isMasterKey?: boolean;
  roles?: string[];
}

/**
 * User login event
 */
export interface UserLoginEvent extends AuditEvent {
  eventType: 'USER_LOGIN';
  username?: string;
  authMethod?: string;
}

/**
 * Data view/query event
 */
export interface DataViewEvent extends AuditEvent {
  eventType: 'DATA_VIEW';
  className: string;
  query?: Record<string, unknown>;
  resultCount?: number;
  objectIds?: string[];
}

/**
 * Data creation event
 */
export interface DataCreateEvent extends AuditEvent {
  eventType: 'DATA_CREATE';
  className: string;
  objectId?: string;
  data?: Record<string, unknown>;
}

/**
 * Data update event
 */
export interface DataUpdateEvent extends AuditEvent {
  eventType: 'DATA_UPDATE';
  className: string;
  objectId: string;
  updatedFields?: Record<string, unknown>;
}

/**
 * Data deletion event
 */
export interface DataDeleteEvent extends AuditEvent {
  eventType: 'DATA_DELETE';
  className: string;
  objectId: string;
}

/**
 * ACL modification event
 */
export interface ACLModifyEvent extends AuditEvent {
  eventType: 'ACL_MODIFY';
  className: string;
  objectId: string;
  acl?: Record<string, unknown>;
}

/**
 * Schema modification event
 */
export interface SchemaModifyEvent extends AuditEvent {
  eventType: 'SCHEMA_MODIFY';
  operation: 'create' | 'update' | 'delete';
  className: string;
  schemaData?: Record<string, unknown>;
}

/**
 * Push notification send event
 */
export interface PushSendEvent extends AuditEvent {
  eventType: 'PUSH_SEND';
  payload?: Record<string, unknown>;
  target?: Record<string, unknown>;
  deviceCount?: number;
}

/**
 * AuditLogAdapterInterface is the interface for audit log storage adapters.
 * All audit log adapters must implement this interface to provide GDPR-compliant
 * audit logging capabilities.
 */
export abstract class AuditLogAdapterInterface {
  /**
   * Initialize the adapter. Called when the adapter is first created.
   * Optional lifecycle method for setup operations (e.g., database connections).
   */
  initialize?(): Promise<void>;

  /**
   * Close/cleanup the adapter. Called when Parse Server is shutting down.
   * Optional lifecycle method for cleanup operations (e.g., closing connections).
   */
  close?(): Promise<void>;

  /**
   * Check if audit logging is enabled for this adapter.
   */
  abstract isEnabled(): boolean;

  /**
   * Log a user login event.
   * Captures authentication attempts (both successful and failed).
   */
  abstract logUserLogin(event: UserLoginEvent): Promise<void>;

  /**
   * Log a data view/query event.
   * Captures when users query or read data from Parse classes.
   */
  abstract logDataView(event: DataViewEvent): Promise<void>;

  /**
   * Log a data creation event.
   * Captures when new objects are created in Parse classes.
   */
  abstract logDataCreate(event: DataCreateEvent): Promise<void>;

  /**
   * Log a data update event.
   * Captures when objects are modified in Parse classes.
   */
  abstract logDataUpdate(event: DataUpdateEvent): Promise<void>;

  /**
   * Log a data deletion event.
   * Captures when objects are deleted from Parse classes.
   */
  abstract logDataDelete(event: DataDeleteEvent): Promise<void>;

  /**
   * Log an ACL modification event.
   * Captures when object access control lists are changed.
   */
  abstract logACLModify(event: ACLModifyEvent): Promise<void>;

  /**
   * Log a schema modification event.
   * Captures when Parse class schemas are created, updated, or deleted.
   */
  abstract logSchemaModify(event: SchemaModifyEvent): Promise<void>;

  /**
   * Log a push notification send event.
   * Captures when push notifications are sent to devices.
   */
  abstract logPushSend(event: PushSendEvent): Promise<void>;

  /**
   * Log a generic system event.
   * Optional method for logging system-level events not covered by other methods.
   */
  logSystemEvent?(event: AuditEvent): Promise<void>;
}

export default AuditLogAdapterInterface;
