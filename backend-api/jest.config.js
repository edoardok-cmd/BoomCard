process.env.NODE_ENV = 'test';

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]sx?$': ['ts-jest', {
      tsconfig: {
        types: ['node', 'jest'],
        allowJs: true,
      },
    }],
  },
  // @scure/base and @noble/* ship pure ESM via package.json `exports`. Jest's
  // default transformIgnorePatterns skips node_modules, so the bare `export`
  // keyword reaches Node and crashes integration tests at import time. The
  // .* in the lookahead handles *nested* node_modules too (e.g. otplib pulls
  // @noble/hashes through @otplib/plugin-crypto-noble/node_modules/@noble/...).
  transformIgnorePatterns: ['/node_modules/(?!.*(@scure|@noble)/)'],
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/*.test.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  testTimeout: 30000, // 30 seconds for integration tests
  verbose: true,
};
