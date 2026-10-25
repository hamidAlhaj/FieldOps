module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/test/**/*.spec.ts'],
  transform: { '^.+\\.tsx?$': ['ts-jest', { tsconfig: { experimentalDecorators: true, emitDecoratorMetadata: true, esModuleInterop: true } }] },
};
