import { LoggerAdapter } from './LoggerAdapter';
import { configureAuditLogger, logAuditEvent, isAuditLogEnabled } from './AuditLogger';

/**
 * AuditLogAdapter
 * Adapter for GDPR-compliant audit logging
 * Logs all data access and manipulation events to separate audit log files
 */
export class AuditLogAdapter extends LoggerAdapter {
  constructor(options) {
    super();
    if (options && options.auditLogFolder) {
      configureAuditLogger(options);
    }
  }

  /**
   * Standard log method (delegates to audit logger)
   * @param {string} level - Log level
   * @param {string} message - Log message
   * @param {Object} meta - Metadata
   */
  log(level, message, meta) {
    if (!isAuditLogEnabled()) {
      return;
    }
    // For standard log calls, just pass through
    logAuditEvent({
      eventType: 'SYSTEM',
      action: message,
      details: meta,
    });
  }

  /**
   * Log user login event
   * @param {Object} event - Login event details
   * @param {string} event.userId - User ID
   * @param {string} event.username - Username
   * @param {string} event.sessionToken - Session token
   * @param {string} event.ipAddress - IP address
   * @param {boolean} event.success - Whether login succeeded
   * @param {string} event.error - Error message if failed
   * @param {string} event.loginMethod - Method used (password, oauth, etc.)
   */
  logUserLogin(event) {
    if (!isAuditLogEnabled()) {
      return;
    }
    logAuditEvent({
      eventType: 'USER_LOGIN',
      userId: event.userId,
      sessionToken: event.sessionToken,
      ipAddress: event.ipAddress,
      action: `User login: ${event.username || event.userId}`,
      details: {
        username: event.username,
        loginMethod: event.loginMethod || 'password',
      },
      success: event.success,
      error: event.error,
    });
  }

  /**
   * Log data view (read) event
   * @param {Object} event - View event details
   * @param {string} event.userId - User ID performing the query
   * @param {string} event.sessionToken - Session token
   * @param {string} event.ipAddress - IP address
   * @param {string} event.className - Class being queried
   * @param {Object} event.query - Query parameters
   * @param {number} event.resultCount - Number of results returned
   * @param {Array<string>} event.objectIds - Object IDs accessed
   */
  logDataView(event) {
    if (!isAuditLogEnabled()) {
      return;
    }
    logAuditEvent({
      eventType: 'DATA_VIEW',
      userId: event.userId,
      sessionToken: event.sessionToken,
      ipAddress: event.ipAddress,
      className: event.className,
      action: `Query on ${event.className}`,
      details: {
        query: event.query,
        resultCount: event.resultCount,
        objectIds: event.objectIds,
      },
      success: true,
    });
  }

  /**
   * Log data creation event
   * @param {Object} event - Create event details
   * @param {string} event.userId - User ID
   * @param {string} event.sessionToken - Session token
   * @param {string} event.ipAddress - IP address
   * @param {string} event.className - Class name
   * @param {string} event.objectId - Created object ID
   * @param {Object} event.data - Data created (sensitive fields masked)
   * @param {boolean} event.success - Whether creation succeeded
   * @param {string} event.error - Error message if failed
   */
  logDataCreate(event) {
    if (!isAuditLogEnabled()) {
      return;
    }
    logAuditEvent({
      eventType: 'DATA_CREATE',
      userId: event.userId,
      sessionToken: event.sessionToken,
      ipAddress: event.ipAddress,
      className: event.className,
      objectId: event.objectId,
      action: `Created object in ${event.className}`,
      details: {
        data: event.data,
      },
      success: event.success,
      error: event.error,
    });
  }

  /**
   * Log data update event
   * @param {Object} event - Update event details
   * @param {string} event.userId - User ID
   * @param {string} event.sessionToken - Session token
   * @param {string} event.ipAddress - IP address
   * @param {string} event.className - Class name
   * @param {string} event.objectId - Updated object ID
   * @param {Object} event.updatedFields - Fields that were updated
   * @param {boolean} event.success - Whether update succeeded
   * @param {string} event.error - Error message if failed
   */
  logDataUpdate(event) {
    if (!isAuditLogEnabled()) {
      return;
    }
    logAuditEvent({
      eventType: 'DATA_UPDATE',
      userId: event.userId,
      sessionToken: event.sessionToken,
      ipAddress: event.ipAddress,
      className: event.className,
      objectId: event.objectId,
      action: `Updated object in ${event.className}`,
      details: {
        updatedFields: event.updatedFields,
      },
      success: event.success,
      error: event.error,
    });
  }

  /**
   * Log data deletion event
   * @param {Object} event - Delete event details
   * @param {string} event.userId - User ID
   * @param {string} event.sessionToken - Session token
   * @param {string} event.ipAddress - IP address
   * @param {string} event.className - Class name
   * @param {string} event.objectId - Deleted object ID
   * @param {boolean} event.success - Whether deletion succeeded
   * @param {string} event.error - Error message if failed
   */
  logDataDelete(event) {
    if (!isAuditLogEnabled()) {
      return;
    }
    logAuditEvent({
      eventType: 'DATA_DELETE',
      userId: event.userId,
      sessionToken: event.sessionToken,
      ipAddress: event.ipAddress,
      className: event.className,
      objectId: event.objectId,
      action: `Deleted object from ${event.className}`,
      success: event.success,
      error: event.error,
    });
  }

  /**
   * Log ACL modification event
   * @param {Object} event - ACL modification event details
   * @param {string} event.userId - User ID
   * @param {string} event.sessionToken - Session token
   * @param {string} event.ipAddress - IP address
   * @param {string} event.className - Class name
   * @param {string} event.objectId - Object ID
   * @param {Object} event.oldACL - Previous ACL
   * @param {Object} event.newACL - New ACL
   * @param {boolean} event.success - Whether modification succeeded
   * @param {string} event.error - Error message if failed
   */
  logACLModify(event) {
    if (!isAuditLogEnabled()) {
      return;
    }
    logAuditEvent({
      eventType: 'ACL_MODIFY',
      userId: event.userId,
      sessionToken: event.sessionToken,
      ipAddress: event.ipAddress,
      className: event.className,
      objectId: event.objectId,
      action: `Modified ACL for object in ${event.className}`,
      details: {
        oldACL: event.oldACL,
        newACL: event.newACL,
      },
      success: event.success,
      error: event.error,
    });
  }

  /**
   * Log schema modification event
   * @param {Object} event - Schema modification event details
   * @param {string} event.userId - User ID
   * @param {string} event.sessionToken - Session token
   * @param {string} event.ipAddress - IP address
   * @param {string} event.className - Class name
   * @param {string} event.operation - Operation (create, update, delete)
   * @param {Object} event.changes - Schema changes
   * @param {boolean} event.success - Whether modification succeeded
   * @param {string} event.error - Error message if failed
   */
  logSchemaModify(event) {
    if (!isAuditLogEnabled()) {
      return;
    }
    logAuditEvent({
      eventType: 'SCHEMA_MODIFY',
      userId: event.userId,
      sessionToken: event.sessionToken,
      ipAddress: event.ipAddress,
      className: event.className,
      action: `Schema ${event.operation} for ${event.className}`,
      details: {
        operation: event.operation,
        changes: event.changes,
      },
      success: event.success,
      error: event.error,
    });
  }

  /**
   * Log push notification event
   * @param {Object} event - Push notification event details
   * @param {string} event.userId - User ID
   * @param {string} event.sessionToken - Session token
   * @param {string} event.ipAddress - IP address
   * @param {Object} event.query - Target query
   * @param {Array<string>} event.channels - Target channels
   * @param {number} event.targetCount - Number of devices targeted
   * @param {boolean} event.success - Whether push succeeded
   * @param {string} event.error - Error message if failed
   */
  logPushSend(event) {
    if (!isAuditLogEnabled()) {
      return;
    }
    logAuditEvent({
      eventType: 'PUSH_SEND',
      userId: event.userId,
      sessionToken: event.sessionToken,
      ipAddress: event.ipAddress,
      action: 'Push notification sent',
      details: {
        query: event.query,
        channels: event.channels,
        targetCount: event.targetCount,
      },
      success: event.success,
      error: event.error,
    });
  }

  /**
   * Check if audit logging is enabled
   * @returns {boolean} True if audit logging is enabled
   */
  isEnabled() {
    return isAuditLogEnabled();
  }
}

export default AuditLogAdapter;
