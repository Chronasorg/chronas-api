/**
 * Jest Configuration for Chronas API
 */

export default {
  // Test environment
  testEnvironment: 'node',
  
  // Use ES modules
  preset: null,
  extensionsToTreatAsEsm: ['.js'],
  globals: {
    'ts-jest': {
      useESM: true
    }
  },
  
  // Module resolution
  moduleNameMapping: {
    '^(\\.{1,2}/.*)\\.js$': '$1'
  },
  
  // Test file patterns
  testMatch: [
    '**/__tests__/**/*.js',
    '**/?(*.)+(spec|test).js'
  ],
  
  // Coverage configuration
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageReporters: [
    'text',
    'lcov',
    'html',
    'json-summary'
  ],
  
  // Coverage thresholds
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70
    }
  },
  
  // Files to collect coverage from
  collectCoverageFrom: [
    'server/**/*.js',
    'index-modern.js',
    '!server/tests/**',
    '!**/*.test.js',
    '!**/*.spec.js',
    '!**/node_modules/**'
  ],
  
  // Setup files
  setupFilesAfterEnv: [
    '<rootDir>/server/tests/setup.js'
  ],
  
  // Test timeout
  testTimeout: 30000,
  
  // Clear mocks between tests
  clearMocks: true,
  
  // Restore mocks after each test
  restoreMocks: true,
  
  // Verbose output
  verbose: true,
  
  // Transform configuration for ES modules
  transform: {},
  
  // Module file extensions
  moduleFileExtensions: [
    'js',
    'json'
  ],
  
  // Global setup/teardown
  globalSetup: '<rootDir>/server/tests/globalSetup.js',
  globalTeardown: '<rootDir>/server/tests/globalTeardown.js'
};