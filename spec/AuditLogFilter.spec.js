'use strict';

const { AuditLogFilter } = require('../lib/Adapters/AuditLog/AuditLogFilter');

describe('AuditLogFilter', () => {
  const testAppId = 'testApp123';

  const createEvent = (overrides = {}) => ({
    eventType: 'DATA_CREATE',
    timestamp: new Date().toISOString(),
    appId: testAppId,
    userId: 'user1',
    success: true,
    className: 'TestClass',
    ...overrides,
  });

  describe('event type filtering', () => {
    it('should allow events in the events whitelist', () => {
      const filter = new AuditLogFilter({
        events: ['USER_LOGIN', 'DATA_DELETE'],
      });

      expect(filter.shouldLog(createEvent({ eventType: 'USER_LOGIN' }))).toBe(true);
      expect(filter.shouldLog(createEvent({ eventType: 'DATA_DELETE' }))).toBe(true);
      expect(filter.shouldLog(createEvent({ eventType: 'DATA_CREATE' }))).toBe(false);
    });

    it('should allow all events when events filter is not specified', () => {
      const filter = new AuditLogFilter({});

      expect(filter.shouldLog(createEvent({ eventType: 'USER_LOGIN' }))).toBe(true);
      expect(filter.shouldLog(createEvent({ eventType: 'DATA_CREATE' }))).toBe(true);
      expect(filter.shouldLog(createEvent({ eventType: 'SCHEMA_MODIFY' }))).toBe(true);
    });
  });

  describe('class name filtering', () => {
    it('should filter by includeClasses', () => {
      const filter = new AuditLogFilter({
        includeClasses: ['_User', 'Order'],
      });

      expect(filter.shouldLog(createEvent({ className: '_User' }))).toBe(true);
      expect(filter.shouldLog(createEvent({ className: 'Order' }))).toBe(true);
      expect(filter.shouldLog(createEvent({ className: 'Product' }))).toBe(false);
    });

    it('should filter by excludeClasses', () => {
      const filter = new AuditLogFilter({
        excludeClasses: ['_Session', 'TempData'],
      });

      expect(filter.shouldLog(createEvent({ className: '_Session' }))).toBe(false);
      expect(filter.shouldLog(createEvent({ className: 'TempData' }))).toBe(false);
      expect(filter.shouldLog(createEvent({ className: '_User' }))).toBe(true);
    });

    it('should handle events without className', () => {
      const filter = new AuditLogFilter({
        includeClasses: ['_User'],
      });

      const loginEvent = createEvent({ eventType: 'USER_LOGIN' });
      delete loginEvent.className;

      expect(filter.shouldLog(loginEvent)).toBe(true);
    });
  });

  describe('master key filtering', () => {
    it('should exclude master key operations when excludeMasterKey is true', () => {
      const filter = new AuditLogFilter({
        excludeMasterKey: true,
      });

      expect(filter.shouldLog(createEvent({ isMasterKey: true }))).toBe(false);
      expect(filter.shouldLog(createEvent({ isMasterKey: false }))).toBe(true);
      expect(filter.shouldLog(createEvent())).toBe(true);
    });

    it('should allow master key operations when excludeMasterKey is false', () => {
      const filter = new AuditLogFilter({
        excludeMasterKey: false,
      });

      expect(filter.shouldLog(createEvent({ isMasterKey: true }))).toBe(true);
    });
  });

  describe('role filtering', () => {
    it('should filter by includeRoles', () => {
      const filter = new AuditLogFilter({
        includeRoles: ['admin', 'moderator'],
      });

      expect(filter.shouldLog(createEvent({ roles: ['admin'] }))).toBe(true);
      expect(filter.shouldLog(createEvent({ roles: ['moderator'] }))).toBe(true);
      expect(filter.shouldLog(createEvent({ roles: ['user'] }))).toBe(false);
      expect(filter.shouldLog(createEvent({ roles: ['admin', 'user'] }))).toBe(true);
    });

    it('should filter by excludeRoles', () => {
      const filter = new AuditLogFilter({
        excludeRoles: ['bot', 'system'],
      });

      expect(filter.shouldLog(createEvent({ roles: ['bot'] }))).toBe(false);
      expect(filter.shouldLog(createEvent({ roles: ['system'] }))).toBe(false);
      expect(filter.shouldLog(createEvent({ roles: ['admin'] }))).toBe(true);
      expect(filter.shouldLog(createEvent({ roles: ['admin', 'bot'] }))).toBe(false);
    });
  });

  describe('custom filter function', () => {
    it('should apply custom filter function', () => {
      const filter = new AuditLogFilter({
        filter: (event) => event.userId !== 'system',
      });

      expect(filter.shouldLog(createEvent({ userId: 'user1' }))).toBe(true);
      expect(filter.shouldLog(createEvent({ userId: 'system' }))).toBe(false);
    });

    it('should handle custom filter errors gracefully', () => {
      const filter = new AuditLogFilter({
        filter: () => {
          throw new Error('Filter error');
        },
      });

      // Should return true (fail-open) on error
      expect(filter.shouldLog(createEvent())).toBe(true);
    });
  });

  describe('filter precedence', () => {
    it('should apply filters in order: event type → class → master key → roles → custom', () => {
      const filter = new AuditLogFilter({
        events: ['DATA_CREATE'],
        includeClasses: ['TestClass'],
        excludeMasterKey: true,
        includeRoles: ['admin'],
        filter: (event) => event.userId === 'user1',
      });

      // Pass all filters
      expect(
        filter.shouldLog(
          createEvent({
            eventType: 'DATA_CREATE',
            className: 'TestClass',
            isMasterKey: false,
            roles: ['admin'],
            userId: 'user1',
          })
        )
      ).toBe(true);

      // Fail event type filter
      expect(
        filter.shouldLog(
          createEvent({
            eventType: 'DATA_DELETE',
            className: 'TestClass',
            roles: ['admin'],
          })
        )
      ).toBe(false);

      // Fail class filter
      expect(
        filter.shouldLog(
          createEvent({
            eventType: 'DATA_CREATE',
            className: 'OtherClass',
            roles: ['admin'],
          })
        )
      ).toBe(false);

      // Fail master key filter
      expect(
        filter.shouldLog(
          createEvent({
            eventType: 'DATA_CREATE',
            className: 'TestClass',
            isMasterKey: true,
            roles: ['admin'],
          })
        )
      ).toBe(false);

      // Fail roles filter
      expect(
        filter.shouldLog(
          createEvent({
            eventType: 'DATA_CREATE',
            className: 'TestClass',
            roles: ['user'],
          })
        )
      ).toBe(false);

      // Fail custom filter
      expect(
        filter.shouldLog(
          createEvent({
            eventType: 'DATA_CREATE',
            className: 'TestClass',
            roles: ['admin'],
            userId: 'user2',
          })
        )
      ).toBe(false);
    });
  });
});
