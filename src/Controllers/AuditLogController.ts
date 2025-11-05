import { AdaptableController } from './AdaptableController';
import {
  AuditLogAdapterInterface,
  AuditLogFilter,
  type AuditLogFilterConfig,
  type AuditEvent,
  type UserLoginEvent,
  type DataViewEvent,
  type DataCreateEvent,
  type DataUpdateEvent,
  type DataDeleteEvent,
  type ACLModifyEvent,
  type SchemaModifyEvent,
  type PushSendEvent,
} from '../Adapters/AuditLog';

interface AuditLogControllerOptions {
  logFilter?: AuditLogFilterConfig;
}

interface UserContext {
  userId?: string;
  sessionToken?: string;
  isMasterKey?: boolean;
  roles?: string[];
}

/**
 * AuditLogController
 * Controller for managing GDPR-compliant audit logging
 * Supports pluggable adapters and configurable filtering
 */
export class AuditLogController extends AdaptableController {
  adapter: AuditLogAdapterInterface;
  filter: AuditLogFilter;
  appId: string;

  constructor(adapter: AuditLogAdapterInterface, appId: string, options: AuditLogControllerOptions = {}) {
    super(adapter, appId, options);
    this.filter = new AuditLogFilter(options.logFilter || {});
  }

  expectedAdapterType() {
    return AuditLogAdapterInterface;
  }

  /**
   * Get IP address from request
   */
  private getIPAddress(req: any): string | undefined {
    if (!req) {
      return undefined;
    }
    // Check for X-Forwarded-For header (common in proxied environments)
    const forwardedFor = req.headers && req.headers['x-forwarded-for'];
    if (forwardedFor) {
      // X-Forwarded-For can contain multiple IPs, take the first one
      return forwardedFor.split(',')[0].trim();
    }
    // Check for X-Real-IP header
    const realIP = req.headers && req.headers['x-real-ip'];
    if (realIP) {
      return realIP;
    }
    // Fallback to connection remote address
    return req.ip || req.connection?.remoteAddress;
  }

  /**
   * Extract user context from auth object
   */
  private getUserContext(auth: any): UserContext {
    if (!auth) {
      return {
        userId: undefined,
        sessionToken: undefined,
        isMasterKey: false,
        roles: [],
      };
    }
    return {
      userId: auth.user?.id || auth.user?.objectId,
      sessionToken: auth.sessionToken,
      isMasterKey: auth.isMaster || auth.isMasterKey || false,
      roles: auth.user?.get('roles') || [],
    };
  }

  /**
   * Mask sensitive data (passwords, tokens, etc.)
   */
  private maskSensitiveData(data: any): any {
    if (!data || typeof data !== 'object') {
      return data;
    }

    const masked = { ...data };
    const sensitiveFields = ['password', 'sessionToken', 'authData', '_hashed_password'];

    sensitiveFields.forEach(field => {
      if (masked[field]) {
        masked[field] = '***masked***';
      }
    });

    return masked;
  }

  /**
   * Write an audit event (with filtering and fire-and-forget async)
   */
  private writeEvent(event: AuditEvent): void {
    if (!this.adapter || !this.adapter.isEnabled()) {
      return;
    }

    // Apply filter
    if (!this.filter.shouldLog(event)) {
      return;
    }

    // Determine which adapter method to call based on event type
    const methodMap: Record<string, keyof AuditLogAdapterInterface> = {
      USER_LOGIN: 'logUserLogin',
      DATA_VIEW: 'logDataView',
      DATA_CREATE: 'logDataCreate',
      DATA_UPDATE: 'logDataUpdate',
      DATA_DELETE: 'logDataDelete',
      ACL_MODIFY: 'logACLModify',
      SCHEMA_MODIFY: 'logSchemaModify',
      PUSH_SEND: 'logPushSend',
      SYSTEM: 'logSystemEvent',
    };

    const methodName = methodMap[event.eventType];
    if (!methodName || typeof this.adapter[methodName] !== 'function') {
      console.error(`Unknown audit event type: ${event.eventType}`);
      return;
    }

    // Fire-and-forget: call adapter method asynchronously without awaiting
    (this.adapter[methodName] as any)(event).catch((error: Error) => {
      // Log error but don't throw (fire-and-forget)
      console.error(`Error writing audit event (${event.eventType}):`, error);
    });
  }

  /**
   * Log user login event
   */
  logUserLogin(params: {
    auth: any;
    req: any;
    username?: string;
    success: boolean;
    error?: string;
    loginMethod?: string;
  }): void {
    const { auth, req, username, success, error, loginMethod } = params;
    const userContext = this.getUserContext(auth);

    const event: UserLoginEvent = {
      eventType: 'USER_LOGIN',
      timestamp: new Date().toISOString(),
      appId: this.appId,
      userId: userContext.userId,
      sessionToken: userContext.sessionToken,
      ip: this.getIPAddress(req),
      success,
      error,
      isMasterKey: userContext.isMasterKey,
      roles: userContext.roles,
      username,
      authMethod: loginMethod,
    };

    this.writeEvent(event);
  }

  /**
   * Log data view (read) event
   */
  logDataView(params: {
    auth: any;
    req: any;
    className: string;
    query?: any;
    resultCount?: number;
    objectIds?: string[];
  }): void {
    const { auth, req, className, query, resultCount, objectIds } = params;
    const userContext = this.getUserContext(auth);

    const event: DataViewEvent = {
      eventType: 'DATA_VIEW',
      timestamp: new Date().toISOString(),
      appId: this.appId,
      userId: userContext.userId,
      sessionToken: userContext.sessionToken,
      ip: this.getIPAddress(req),
      success: true,
      isMasterKey: userContext.isMasterKey,
      roles: userContext.roles,
      className,
      query,
      resultCount,
      objectIds,
    };

    this.writeEvent(event);
  }

  /**
   * Log data creation event
   */
  logDataCreate(params: {
    auth: any;
    req: any;
    className: string;
    objectId?: string;
    data?: any;
    success: boolean;
    error?: string;
  }): void {
    const { auth, req, className, objectId, data, success, error } = params;
    const userContext = this.getUserContext(auth);

    const event: DataCreateEvent = {
      eventType: 'DATA_CREATE',
      timestamp: new Date().toISOString(),
      appId: this.appId,
      userId: userContext.userId,
      sessionToken: userContext.sessionToken,
      ip: this.getIPAddress(req),
      success,
      error,
      isMasterKey: userContext.isMasterKey,
      roles: userContext.roles,
      className,
      objectId,
      data: this.maskSensitiveData(data),
    };

    this.writeEvent(event);
  }

  /**
   * Log data update event
   */
  logDataUpdate(params: {
    auth: any;
    req: any;
    className: string;
    objectId: string;
    updatedFields?: any;
    success: boolean;
    error?: string;
  }): void {
    const { auth, req, className, objectId, updatedFields, success, error } = params;
    const userContext = this.getUserContext(auth);

    const event: DataUpdateEvent = {
      eventType: 'DATA_UPDATE',
      timestamp: new Date().toISOString(),
      appId: this.appId,
      userId: userContext.userId,
      sessionToken: userContext.sessionToken,
      ip: this.getIPAddress(req),
      success,
      error,
      isMasterKey: userContext.isMasterKey,
      roles: userContext.roles,
      className,
      objectId,
      updatedFields: this.maskSensitiveData(updatedFields),
    };

    this.writeEvent(event);
  }

  /**
   * Log data deletion event
   */
  logDataDelete(params: {
    auth: any;
    req: any;
    className: string;
    objectId: string;
    success: boolean;
    error?: string;
  }): void {
    const { auth, req, className, objectId, success, error } = params;
    const userContext = this.getUserContext(auth);

    const event: DataDeleteEvent = {
      eventType: 'DATA_DELETE',
      timestamp: new Date().toISOString(),
      appId: this.appId,
      userId: userContext.userId,
      sessionToken: userContext.sessionToken,
      ip: this.getIPAddress(req),
      success,
      error,
      isMasterKey: userContext.isMasterKey,
      roles: userContext.roles,
      className,
      objectId,
    };

    this.writeEvent(event);
  }

  /**
   * Log ACL modification event
   */
  logACLModify(params: {
    auth: any;
    req: any;
    className: string;
    objectId: string;
    oldACL?: any;
    newACL?: any;
    success: boolean;
    error?: string;
  }): void {
    const { auth, req, className, objectId, newACL, success, error } = params;
    const userContext = this.getUserContext(auth);

    const event: ACLModifyEvent = {
      eventType: 'ACL_MODIFY',
      timestamp: new Date().toISOString(),
      appId: this.appId,
      userId: userContext.userId,
      sessionToken: userContext.sessionToken,
      ip: this.getIPAddress(req),
      success,
      error,
      isMasterKey: userContext.isMasterKey,
      roles: userContext.roles,
      className,
      objectId,
      acl: newACL,
    };

    this.writeEvent(event);
  }

  /**
   * Log schema modification event
   */
  logSchemaModify(params: {
    auth: any;
    req: any;
    className: string;
    operation: 'create' | 'update' | 'delete';
    changes?: any;
    success: boolean;
    error?: string;
  }): void {
    const { auth, req, className, operation, changes, success, error } = params;
    const userContext = this.getUserContext(auth);

    const event: SchemaModifyEvent = {
      eventType: 'SCHEMA_MODIFY',
      timestamp: new Date().toISOString(),
      appId: this.appId,
      userId: userContext.userId,
      sessionToken: userContext.sessionToken,
      ip: this.getIPAddress(req),
      success,
      error,
      isMasterKey: userContext.isMasterKey,
      roles: userContext.roles,
      operation,
      className,
      schemaData: changes,
    };

    this.writeEvent(event);
  }

  /**
   * Log push notification event
   */
  logPushSend(params: {
    auth: any;
    req: any;
    payload?: any;
    query?: any;
    channels?: string[];
    targetCount?: number;
    success: boolean;
    error?: string;
  }): void {
    const { auth, req, payload, query, channels, targetCount, success, error } = params;
    const userContext = this.getUserContext(auth);

    const event: PushSendEvent = {
      eventType: 'PUSH_SEND',
      timestamp: new Date().toISOString(),
      appId: this.appId,
      userId: userContext.userId,
      sessionToken: userContext.sessionToken,
      ip: this.getIPAddress(req),
      success,
      error,
      isMasterKey: userContext.isMasterKey,
      roles: userContext.roles,
      payload: this.maskSensitiveData(payload),
      target: query || { channels },
      deviceCount: targetCount,
    };

    this.writeEvent(event);
  }

  /**
   * Check if audit logging is enabled
   */
  isEnabled(): boolean {
    return !!(this.adapter && this.adapter.isEnabled());
  }
}

export default AuditLogController;
