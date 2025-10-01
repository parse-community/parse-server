import AdaptableController from './AdaptableController';
import { AuditLogAdapter } from '../Adapters/Logger/AuditLogAdapter';

/**
 * AuditLogController
 * Controller for managing GDPR-compliant audit logging
 */
export class AuditLogController extends AdaptableController {
  constructor(adapter, appId, options = {}) {
    super(adapter, appId, options);
    this.adapter = adapter;
  }

  /**
   * Get IP address from request
   * @param {Object} req - Express request object
   * @returns {string} IP address
   * @private
   */
  _getIPAddress(req) {
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
   * @param {Object} auth - Auth object
   * @returns {Object} User context
   * @private
   */
  _getUserContext(auth) {
    if (!auth) {
      return {
        userId: undefined,
        sessionToken: undefined,
      };
    }
    return {
      userId: auth.user?.id || auth.user?.objectId,
      sessionToken: auth.sessionToken,
    };
  }

  /**
   * Log user login event
   * @param {Object} params - Login parameters
   * @param {Object} params.auth - Auth object
   * @param {Object} params.req - Request object
   * @param {string} params.username - Username
   * @param {boolean} params.success - Whether login succeeded
   * @param {string} params.error - Error message if failed
   * @param {string} params.loginMethod - Login method used
   */
  logUserLogin({ auth, req, username, success, error, loginMethod }) {
    if (!this.adapter || !this.adapter.isEnabled()) {
      return;
    }

    const userContext = this._getUserContext(auth);
    this.adapter.logUserLogin({
      userId: userContext.userId,
      username: username,
      sessionToken: userContext.sessionToken,
      ipAddress: this._getIPAddress(req),
      success: success,
      error: error,
      loginMethod: loginMethod,
    });
  }

  /**
   * Log data view (read) event
   * @param {Object} params - View parameters
   * @param {Object} params.auth - Auth object
   * @param {Object} params.req - Request object
   * @param {string} params.className - Class being queried
   * @param {Object} params.query - Query parameters
   * @param {number} params.resultCount - Number of results
   * @param {Array<string>} params.objectIds - Object IDs accessed
   */
  logDataView({ auth, req, className, query, resultCount, objectIds }) {
    if (!this.adapter || !this.adapter.isEnabled()) {
      return;
    }

    const userContext = this._getUserContext(auth);
    this.adapter.logDataView({
      userId: userContext.userId,
      sessionToken: userContext.sessionToken,
      ipAddress: this._getIPAddress(req),
      className: className,
      query: query,
      resultCount: resultCount,
      objectIds: objectIds,
    });
  }

  /**
   * Log data creation event
   * @param {Object} params - Create parameters
   * @param {Object} params.auth - Auth object
   * @param {Object} params.req - Request object
   * @param {string} params.className - Class name
   * @param {string} params.objectId - Created object ID
   * @param {Object} params.data - Data created
   * @param {boolean} params.success - Whether creation succeeded
   * @param {string} params.error - Error message if failed
   */
  logDataCreate({ auth, req, className, objectId, data, success, error }) {
    if (!this.adapter || !this.adapter.isEnabled()) {
      return;
    }

    const userContext = this._getUserContext(auth);
    this.adapter.logDataCreate({
      userId: userContext.userId,
      sessionToken: userContext.sessionToken,
      ipAddress: this._getIPAddress(req),
      className: className,
      objectId: objectId,
      data: this._maskSensitiveData(data),
      success: success,
      error: error,
    });
  }

  /**
   * Log data update event
   * @param {Object} params - Update parameters
   * @param {Object} params.auth - Auth object
   * @param {Object} params.req - Request object
   * @param {string} params.className - Class name
   * @param {string} params.objectId - Updated object ID
   * @param {Object} params.updatedFields - Fields that were updated
   * @param {boolean} params.success - Whether update succeeded
   * @param {string} params.error - Error message if failed
   */
  logDataUpdate({ auth, req, className, objectId, updatedFields, success, error }) {
    if (!this.adapter || !this.adapter.isEnabled()) {
      return;
    }

    const userContext = this._getUserContext(auth);
    this.adapter.logDataUpdate({
      userId: userContext.userId,
      sessionToken: userContext.sessionToken,
      ipAddress: this._getIPAddress(req),
      className: className,
      objectId: objectId,
      updatedFields: this._maskSensitiveData(updatedFields),
      success: success,
      error: error,
    });
  }

  /**
   * Log data deletion event
   * @param {Object} params - Delete parameters
   * @param {Object} params.auth - Auth object
   * @param {Object} params.req - Request object
   * @param {string} params.className - Class name
   * @param {string} params.objectId - Deleted object ID
   * @param {boolean} params.success - Whether deletion succeeded
   * @param {string} params.error - Error message if failed
   */
  logDataDelete({ auth, req, className, objectId, success, error }) {
    if (!this.adapter || !this.adapter.isEnabled()) {
      return;
    }

    const userContext = this._getUserContext(auth);
    this.adapter.logDataDelete({
      userId: userContext.userId,
      sessionToken: userContext.sessionToken,
      ipAddress: this._getIPAddress(req),
      className: className,
      objectId: objectId,
      success: success,
      error: error,
    });
  }

  /**
   * Log ACL modification event
   * @param {Object} params - ACL modification parameters
   * @param {Object} params.auth - Auth object
   * @param {Object} params.req - Request object
   * @param {string} params.className - Class name
   * @param {string} params.objectId - Object ID
   * @param {Object} params.oldACL - Previous ACL
   * @param {Object} params.newACL - New ACL
   * @param {boolean} params.success - Whether modification succeeded
   * @param {string} params.error - Error message if failed
   */
  logACLModify({ auth, req, className, objectId, oldACL, newACL, success, error }) {
    if (!this.adapter || !this.adapter.isEnabled()) {
      return;
    }

    const userContext = this._getUserContext(auth);
    this.adapter.logACLModify({
      userId: userContext.userId,
      sessionToken: userContext.sessionToken,
      ipAddress: this._getIPAddress(req),
      className: className,
      objectId: objectId,
      oldACL: oldACL,
      newACL: newACL,
      success: success,
      error: error,
    });
  }

  /**
   * Log schema modification event
   * @param {Object} params - Schema modification parameters
   * @param {Object} params.auth - Auth object
   * @param {Object} params.req - Request object
   * @param {string} params.className - Class name
   * @param {string} params.operation - Operation (create, update, delete)
   * @param {Object} params.changes - Schema changes
   * @param {boolean} params.success - Whether modification succeeded
   * @param {string} params.error - Error message if failed
   */
  logSchemaModify({ auth, req, className, operation, changes, success, error }) {
    if (!this.adapter || !this.adapter.isEnabled()) {
      return;
    }

    const userContext = this._getUserContext(auth);
    this.adapter.logSchemaModify({
      userId: userContext.userId,
      sessionToken: userContext.sessionToken,
      ipAddress: this._getIPAddress(req),
      className: className,
      operation: operation,
      changes: changes,
      success: success,
      error: error,
    });
  }

  /**
   * Log push notification event
   * @param {Object} params - Push notification parameters
   * @param {Object} params.auth - Auth object
   * @param {Object} params.req - Request object
   * @param {Object} params.query - Target query
   * @param {Array<string>} params.channels - Target channels
   * @param {number} params.targetCount - Number of devices targeted
   * @param {boolean} params.success - Whether push succeeded
   * @param {string} params.error - Error message if failed
   */
  logPushSend({ auth, req, query, channels, targetCount, success, error }) {
    if (!this.adapter || !this.adapter.isEnabled()) {
      return;
    }

    const userContext = this._getUserContext(auth);
    this.adapter.logPushSend({
      userId: userContext.userId,
      sessionToken: userContext.sessionToken,
      ipAddress: this._getIPAddress(req),
      query: query,
      channels: channels,
      targetCount: targetCount,
      success: success,
      error: error,
    });
  }

  /**
   * Mask sensitive data (passwords, tokens, etc.)
   * @param {Object} data - Data to mask
   * @returns {Object} Masked data
   * @private
   */
  _maskSensitiveData(data) {
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
   * Check if audit logging is enabled
   * @returns {boolean} True if enabled
   */
  isEnabled() {
    return this.adapter && this.adapter.isEnabled();
  }

  expectedAdapterType() {
    return AuditLogAdapter;
  }
}

export default AuditLogController;
