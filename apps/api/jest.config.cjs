module.exports = {
  testEnvironment: 'node',
  testPathIgnorePatterns: ['/node_modules/', '/test/integration/'],
  testMatch: ['**/test/**/*.spec.ts'],
  transform: { '^.+\\.tsx?$': ['ts-jest', { tsconfig: { experimentalDecorators: true, emitDecoratorMetadata: true, esModuleInterop: true } }] },
};
