module.exports = {
  extends: ["next", "prettier"],
  parser: "@typescript-eslint/parser",
  plugins: ["@typescript-eslint"],
  rules: {
    "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    "@typescript-eslint/no-explicit-any": "warn",
  },
  settings: {
    next: {
      rootDir: ["apps/*/", "packages/*/"],
    },
  },
};
