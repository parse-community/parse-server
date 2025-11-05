import winston from 'winston';
import { format } from 'winston';
import fs from 'fs';
import path from 'path';
import DailyRotateFile from 'winston-daily-rotate-file';
import {
  AuditLogAdapterInterface,
  type UserLoginEvent,
  type DataViewEvent,
  type DataCreateEvent,
  type DataUpdateEvent,
  type DataDeleteEvent,
  type ACLModifyEvent,
  type SchemaModifyEvent,
  type PushSendEvent,
  type AuditEvent,
} from './AuditLogAdapterInterface';

/**
 * Options for Winston file-based audit log adapter
 */
export interface WinstonFileAuditLogAdapterOptions {
  /** Directory where audit log files will be stored */
  auditLogFolder: string;
  /** Date pattern for log rotation (default: 'YYYY-MM-DD') */
  datePattern?: string;
  /** Maximum size of each log file before rotation (default: '20m') */
  maxSize?: string;
  /** Maximum number of days to retain logs (default: '14d') */
  maxFiles?: string;
}

/**
 * Winston file-based implementation of the AuditLogAdapter interface.
 * Stores audit logs in daily-rotated JSON files with configurable retention.
 */
export class WinstonFileAuditLogAdapter extends AuditLogAdapterInterface {
  private logger: winston.Logger;
  private options: WinstonFileAuditLogAdapterOptions;
  private enabled: boolean;

  constructor(options: WinstonFileAuditLogAdapterOptions) {
    super();
    this.options = options;
    this.enabled = false;
    this.logger = winston.createLogger();

    if (options && options.auditLogFolder) {
      this.configure();
    }
  }

  /**
   * Configure the Winston logger with daily rotation
   */
  private configure(): void {
    const { auditLogFolder, datePattern, maxSize, maxFiles } = this.options;

    if (!auditLogFolder) {
      return;
    }

    // Resolve to absolute path
    let logFolder = auditLogFolder;
    if (!path.isAbsolute(logFolder)) {
      logFolder = path.resolve(process.cwd(), logFolder);
    }

    // Create directory if it doesn't exist
    try {
      fs.mkdirSync(logFolder, { recursive: true });
    } catch (error) {
      console.error('Failed to create audit log folder:', error);
      return;
    }

    // Configure Winston with daily rotation transport
    try {
      const transport = new DailyRotateFile({
        dirname: logFolder,
        filename: 'parse-server-audit-%DATE%.log',
        datePattern: datePattern || 'YYYY-MM-DD',
        maxSize: maxSize || '20m',
        maxFiles: maxFiles || '14d',
        json: true,
        format: format.combine(format.timestamp(), format.json()),
      });

      transport.name = 'parse-server-audit';

      this.logger.configure({
        transports: [transport],
        level: 'info',
      });

      this.enabled = true;
    } catch (error) {
      console.error('Failed to configure audit logger:', error);
      this.enabled = false;
    }
  }

  /**
   * Initialize the adapter (optional lifecycle method)
   */
  async initialize(): Promise<void> {
    // Winston is configured synchronously in constructor
    // This method is available for future async initialization needs
    return Promise.resolve();
  }

  /**
   * Close the adapter and flush any pending logs
   */
  async close(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.logger || !this.enabled) {
        resolve();
        return;
      }

      // Close all transports
      this.logger.close();
      this.enabled = false;
      resolve();
    });
  }

  /**
   * Check if audit logging is enabled
   */
  isEnabled(): boolean {
    return this.enabled && this.logger.transports && this.logger.transports.length > 0;
  }

  /**
   * Write an audit event to the log
   */
  private async writeEvent(event: AuditEvent): Promise<void> {
    if (!this.isEnabled()) {
      return Promise.resolve();
    }

    try {
      // Prepare audit entry with common fields
      const auditEntry: Record<string, unknown> = {
        timestamp: new Date().toISOString(),
        eventType: event.eventType,
        appId: event.appId,
        userId: event.userId || 'anonymous',
        sessionToken: event.sessionToken ? '***masked***' : undefined,
        ip: event.ip,
        success: event.success !== false,
        error: event.error,
        isMasterKey: event.isMasterKey,
        roles: event.roles,
        ...event, // Spread event to include type-specific fields
      };

      // Remove undefined fields for cleaner output
      Object.keys(auditEntry).forEach(key => {
        if (auditEntry[key] === undefined) {
          delete auditEntry[key];
        }
      });

      // Write to Winston logger
      this.logger.info('audit_event', auditEntry);

      return Promise.resolve();
    } catch (error) {
      // Log error but don't throw (fire-and-forget)
      console.error('Error writing audit event:', error);
      return Promise.resolve();
    }
  }

  /**
   * Log a user login event
   */
  async logUserLogin(event: UserLoginEvent): Promise<void> {
    return this.writeEvent(event);
  }

  /**
   * Log a data view/query event
   */
  async logDataView(event: DataViewEvent): Promise<void> {
    return this.writeEvent(event);
  }

  /**
   * Log a data creation event
   */
  async logDataCreate(event: DataCreateEvent): Promise<void> {
    return this.writeEvent(event);
  }

  /**
   * Log a data update event
   */
  async logDataUpdate(event: DataUpdateEvent): Promise<void> {
    return this.writeEvent(event);
  }

  /**
   * Log a data deletion event
   */
  async logDataDelete(event: DataDeleteEvent): Promise<void> {
    return this.writeEvent(event);
  }

  /**
   * Log an ACL modification event
   */
  async logACLModify(event: ACLModifyEvent): Promise<void> {
    return this.writeEvent(event);
  }

  /**
   * Log a schema modification event
   */
  async logSchemaModify(event: SchemaModifyEvent): Promise<void> {
    return this.writeEvent(event);
  }

  /**
   * Log a push notification send event
   */
  async logPushSend(event: PushSendEvent): Promise<void> {
    return this.writeEvent(event);
  }

  /**
   * Log a generic system event
   */
  async logSystemEvent(event: AuditEvent): Promise<void> {
    return this.writeEvent(event);
  }
}

export default WinstonFileAuditLogAdapter;
