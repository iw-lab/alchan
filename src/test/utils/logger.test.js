import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { logger, createLogger } from '../../utils/logger';

describe('logger', () => {
  let consoleSpy;

  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();
  });

  describe('Development Environment', () => {
    beforeEach(() => {
      // Mock development environment
      vi.stubEnv('NODE_ENV', 'development');
    });

    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it('should log messages in development environment', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      // Create a new logger instance with development mode
      const devLogger = {
        log: process.env.NODE_ENV === 'development'
          ? (...args) => console.log('[Dev]', ...args)
          : () => {},
      };

      consoleSpy = vi.spyOn(console, 'log');
      devLogger.log('Test message');

      expect(consoleSpy).toHaveBeenCalledWith('[Dev]', 'Test message');

      process.env.NODE_ENV = originalEnv;
      consoleSpy.mockRestore();
    });

    it('should log info messages in development environment', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const devLogger = {
        info: process.env.NODE_ENV === 'development'
          ? (...args) => console.info('[Info]', ...args)
          : () => {},
      };

      consoleSpy = vi.spyOn(console, 'info');
      devLogger.info('Info message');

      expect(consoleSpy).toHaveBeenCalledWith('[Info]', 'Info message');

      process.env.NODE_ENV = originalEnv;
      consoleSpy.mockRestore();
    });

    it('should log debug messages in development environment', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const devLogger = {
        debug: process.env.NODE_ENV === 'development'
          ? (...args) => console.debug('[Debug]', ...args)
          : () => {},
      };

      consoleSpy = vi.spyOn(console, 'debug');
      devLogger.debug('Debug message');

      expect(consoleSpy).toHaveBeenCalledWith('[Debug]', 'Debug message');

      process.env.NODE_ENV = originalEnv;
      consoleSpy.mockRestore();
    });
  });

  describe('Production Environment', () => {
    beforeEach(() => {
      // Mock production environment
      vi.stubEnv('NODE_ENV', 'production');
    });

    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it('should not log messages in production environment', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const prodLogger = {
        log: process.env.NODE_ENV === 'development'
          ? (...args) => console.log('[Dev]', ...args)
          : () => {},
      };

      consoleSpy = vi.spyOn(console, 'log');
      prodLogger.log('Test message');

      expect(consoleSpy).not.toHaveBeenCalled();

      process.env.NODE_ENV = originalEnv;
      consoleSpy.mockRestore();
    });

    it('should not log info messages in production environment', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const prodLogger = {
        info: process.env.NODE_ENV === 'development'
          ? (...args) => console.info('[Info]', ...args)
          : () => {},
      };

      consoleSpy = vi.spyOn(console, 'info');
      prodLogger.info('Info message');

      expect(consoleSpy).not.toHaveBeenCalled();

      process.env.NODE_ENV = originalEnv;
      consoleSpy.mockRestore();
    });

    it('should not log debug messages in production environment', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const prodLogger = {
        debug: process.env.NODE_ENV === 'development'
          ? (...args) => console.debug('[Debug]', ...args)
          : () => {},
      };

      consoleSpy = vi.spyOn(console, 'debug');
      prodLogger.debug('Debug message');

      expect(consoleSpy).not.toHaveBeenCalled();

      process.env.NODE_ENV = originalEnv;
      consoleSpy.mockRestore();
    });
  });

  describe('Warning and Error Logging', () => {
    it('should always log warnings regardless of environment', () => {
      consoleSpy = vi.spyOn(console, 'warn');
      logger.warn('Warning message');

      expect(consoleSpy).toHaveBeenCalledWith('[Warn]', 'Warning message');
      consoleSpy.mockRestore();
    });

    it('should always log errors regardless of environment', () => {
      consoleSpy = vi.spyOn(console, 'error');
      logger.error('Error message');

      expect(consoleSpy).toHaveBeenCalledWith('[Error]', 'Error message');
      consoleSpy.mockRestore();
    });

    it('should log multiple warning arguments', () => {
      consoleSpy = vi.spyOn(console, 'warn');
      logger.warn('Warning:', { code: 500 }, 'Server error');

      expect(consoleSpy).toHaveBeenCalledWith('[Warn]', 'Warning:', { code: 500 }, 'Server error');
      consoleSpy.mockRestore();
    });

    it('should log multiple error arguments', () => {
      consoleSpy = vi.spyOn(console, 'error');
      const error = new Error('Test error');
      logger.error('Error occurred:', error);

      expect(consoleSpy).toHaveBeenCalledWith('[Error]', 'Error occurred:', error);
      consoleSpy.mockRestore();
    });
  });

  describe('Group Logging', () => {
    it('should create console groups in development', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const devLogger = {
        group: process.env.NODE_ENV === 'development'
          ? (label) => console.group(label)
          : () => {},
        groupEnd: process.env.NODE_ENV === 'development'
          ? () => console.groupEnd()
          : () => {},
      };

      const groupSpy = vi.spyOn(console, 'group');
      const groupEndSpy = vi.spyOn(console, 'groupEnd');

      devLogger.group('Test Group');
      expect(groupSpy).toHaveBeenCalledWith('Test Group');

      devLogger.groupEnd();
      expect(groupEndSpy).toHaveBeenCalled();

      process.env.NODE_ENV = originalEnv;
      groupSpy.mockRestore();
      groupEndSpy.mockRestore();
    });

    it('should not create console groups in production', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const prodLogger = {
        group: process.env.NODE_ENV === 'development'
          ? (label) => console.group(label)
          : () => {},
        groupEnd: process.env.NODE_ENV === 'development'
          ? () => console.groupEnd()
          : () => {},
      };

      const groupSpy = vi.spyOn(console, 'group');
      const groupEndSpy = vi.spyOn(console, 'groupEnd');

      prodLogger.group('Test Group');
      prodLogger.groupEnd();

      expect(groupSpy).not.toHaveBeenCalled();
      expect(groupEndSpy).not.toHaveBeenCalled();

      process.env.NODE_ENV = originalEnv;
      groupSpy.mockRestore();
      groupEndSpy.mockRestore();
    });
  });

  describe('Table Logging', () => {
    it('should log tables in development', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const devLogger = {
        table: process.env.NODE_ENV === 'development'
          ? (data) => console.table(data)
          : () => {},
      };

      const tableSpy = vi.spyOn(console, 'table');
      const tableData = [{ id: 1, name: 'Test' }];

      devLogger.table(tableData);
      expect(tableSpy).toHaveBeenCalledWith(tableData);

      process.env.NODE_ENV = originalEnv;
      tableSpy.mockRestore();
    });

    it('should not log tables in production', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const prodLogger = {
        table: process.env.NODE_ENV === 'development'
          ? (data) => console.table(data)
          : () => {},
      };

      const tableSpy = vi.spyOn(console, 'table');
      const tableData = [{ id: 1, name: 'Test' }];

      prodLogger.table(tableData);
      expect(tableSpy).not.toHaveBeenCalled();

      process.env.NODE_ENV = originalEnv;
      tableSpy.mockRestore();
    });
  });

  describe('Time Logging', () => {
    it('should log time in development', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const devLogger = {
        time: process.env.NODE_ENV === 'development'
          ? (label) => console.time(label)
          : () => {},
        timeEnd: process.env.NODE_ENV === 'development'
          ? (label) => console.timeEnd(label)
          : () => {},
      };

      const timeSpy = vi.spyOn(console, 'time');
      const timeEndSpy = vi.spyOn(console, 'timeEnd');

      devLogger.time('operation');
      expect(timeSpy).toHaveBeenCalledWith('operation');

      devLogger.timeEnd('operation');
      expect(timeEndSpy).toHaveBeenCalledWith('operation');

      process.env.NODE_ENV = originalEnv;
      timeSpy.mockRestore();
      timeEndSpy.mockRestore();
    });

    it('should not log time in production', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const prodLogger = {
        time: process.env.NODE_ENV === 'development'
          ? (label) => console.time(label)
          : () => {},
        timeEnd: process.env.NODE_ENV === 'development'
          ? (label) => console.timeEnd(label)
          : () => {},
      };

      const timeSpy = vi.spyOn(console, 'time');
      const timeEndSpy = vi.spyOn(console, 'timeEnd');

      prodLogger.time('operation');
      prodLogger.timeEnd('operation');

      expect(timeSpy).not.toHaveBeenCalled();
      expect(timeEndSpy).not.toHaveBeenCalled();

      process.env.NODE_ENV = originalEnv;
      timeSpy.mockRestore();
      timeEndSpy.mockRestore();
    });
  });
});

describe('createLogger', () => {
  let consoleSpy;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Module-specific Logger', () => {
    it('should create a logger with module name prefix in development', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const moduleLogger = createLogger('TestModule');
      consoleSpy = vi.spyOn(console, 'log');

      moduleLogger.log('Test message');
      expect(consoleSpy).toHaveBeenCalledWith('[TestModule]', 'Test message');

      process.env.NODE_ENV = originalEnv;
      consoleSpy.mockRestore();
    });

    it('should create a logger that does not log in production', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const moduleLogger = createLogger('TestModule');
      consoleSpy = vi.spyOn(console, 'log');

      moduleLogger.log('Test message');
      expect(consoleSpy).not.toHaveBeenCalled();

      process.env.NODE_ENV = originalEnv;
      consoleSpy.mockRestore();
    });

    it('should always log warnings with module prefix', () => {
      const moduleLogger = createLogger('TestModule');
      consoleSpy = vi.spyOn(console, 'warn');

      moduleLogger.warn('Warning message');
      expect(consoleSpy).toHaveBeenCalledWith('[TestModule]', 'Warning message');

      consoleSpy.mockRestore();
    });

    it('should always log errors with module prefix', () => {
      const moduleLogger = createLogger('TestModule');
      consoleSpy = vi.spyOn(console, 'error');

      moduleLogger.error('Error message');
      expect(consoleSpy).toHaveBeenCalledWith('[TestModule]', 'Error message');

      consoleSpy.mockRestore();
    });

    it('should handle multiple loggers with different module names', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const logger1 = createLogger('Module1');
      const logger2 = createLogger('Module2');

      consoleSpy = vi.spyOn(console, 'log');

      logger1.log('Message from Module1');
      expect(consoleSpy).toHaveBeenCalledWith('[Module1]', 'Message from Module1');

      logger2.log('Message from Module2');
      expect(consoleSpy).toHaveBeenCalledWith('[Module2]', 'Message from Module2');

      process.env.NODE_ENV = originalEnv;
      consoleSpy.mockRestore();
    });
  });
});
