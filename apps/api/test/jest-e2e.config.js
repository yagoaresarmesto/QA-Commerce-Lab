/** Integration checks against a real database (DATABASE_URL). Run with: npm run test:e2e */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '..',
  testRegex: 'test/.*\\.e2e-spec\\.ts$',
  transform: { '^.+\\.(t|j)s$': ['ts-jest', { diagnostics: false }] },
  testEnvironment: 'node',
  testTimeout: 60000,
};
