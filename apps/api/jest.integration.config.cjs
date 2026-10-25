module.exports = {
  ...require("./jest.config.cjs"),
  testMatch: ["**/test/integration/**/*.spec.ts"],
  testPathIgnorePatterns: ["/node_modules/"],
  testTimeout: 30000,
};
