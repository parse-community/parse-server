import winston, { format } from 'winston';
import fs from 'fs';
import path from 'path';
import DailyRotateFile from 'winston-daily-rotate-file';

const auditLogger = winston.createLogger();

/**
 * Configure the audit logger with daily rotation
 * @param {Object} options - Configuration options for audit logging
 * @param {string} options.dirname - Directory for audit log files
 * @param {string} options.datePattern - Date pattern for log rotation (default: 'YYYY-MM-DD')
 * @param {string} options.maxSize - Maximum size per log file (default: '20m')
 * @param {string} options.maxFiles - Maximum number of log files to retain (default: '14d')
 */
function configureAuditTransports(options) {
  const transports = [];

  if (!options || !options.dirname) {
    // If no directory specified, audit logging is disabled
    return;
  }

  try {
    const auditLogTransport = new DailyRotateFile({
      dirname: options.dirname,
      filename: 'parse-server-audit-%DATE%.log',
      datePattern: options.datePattern || 'YYYY-MM-DD',
      maxSize: options.maxSize || '20m',
      maxFiles: options.maxFiles || '14d',
      json: true,
      format: format.combine(
        format.timestamp(),
        format.json()
      ),
    });

    auditLogTransport.name = 'parse-server-audit';
    transports.push(auditLogTransport);

    auditLogger.configure({
      transports,
      level: 'info',
    });
  } catch (e) {
    console.error('Failed to configure audit logger:', e);
  }
}

/**
 * Configure the audit logger
 * @param {Object} config - Audit log configuration
 * @param {string} config.auditLogFolder - Directory for audit logs
 * @param {string} config.datePattern - Date pattern for rotation
 * @param {string} config.maxSize - Maximum size per file
 * @param {string} config.maxFiles - Maximum files to retain
 */
export function configureAuditLogger({
  auditLogFolder,
  datePattern,
  maxSize,
  maxFiles,
} = {}) {
  if (!auditLogFolder) {
    // Audit logging disabled
    return;
  }

  let logFolder = auditLogFolder;
  if (!path.isAbsolute(logFolder)) {
    logFolder = path.resolve(process.cwd(), logFolder);
  }

  try {
    fs.mkdirSync(logFolder, { recursive: true });
  } catch (e) {
    console.error('Failed to create audit log folder:', e);
    return;
  }

  const options = {
    dirname: logFolder,
    datePattern,
    maxSize,
    maxFiles,
  };

  configureAuditTransports(options);
}

/**
 * Log an audit event
 * @param {Object} event - Audit event object
 * @param {string} event.eventType - Type of event (USER_LOGIN, DATA_VIEW, etc.)
 * @param {string} event.userId - User ID performing the action
 * @param {string} event.sessionToken - Session token (will be masked)
 * @param {string} event.ipAddress - IP address of the request
 * @param {string} event.className - Parse class name affected
 * @param {string} event.objectId - Object ID affected
 * @param {string} event.action - Description of the action
 * @param {Object} event.details - Additional context-specific details
 * @param {boolean} event.success - Whether the operation succeeded
 * @param {string} event.error - Error message if operation failed
 */
export function logAuditEvent(event) {
  if (!auditLogger.transports || auditLogger.transports.length === 0) {
    // Audit logging is disabled
    return;
  }

  const auditEntry = {
    timestamp: new Date().toISOString(),
    eventType: event.eventType,
    userId: event.userId || 'anonymous',
    sessionToken: event.sessionToken ? '***masked***' : undefined,
    ipAddress: event.ipAddress,
    className: event.className,
    objectId: event.objectId,
    action: event.action,
    details: event.details,
    success: event.success !== false, // Default to true if not specified
    error: event.error,
  };

  // Remove undefined fields
  Object.keys(auditEntry).forEach(key => {
    if (auditEntry[key] === undefined) {
      delete auditEntry[key];
    }
  });

  auditLogger.info('audit_event', auditEntry);
}

/**
 * Check if audit logging is enabled
 * @returns {boolean} True if audit logging is enabled
 */
export function isAuditLogEnabled() {
  return auditLogger.transports && auditLogger.transports.length > 0;
}

export { auditLogger };
export default auditLogger;
