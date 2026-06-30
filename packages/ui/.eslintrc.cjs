/** @type {import("eslint").Linter.Config} */
module.exports = {
  root: false,
  extends: ['../../.eslintrc.cjs'],
  parserOptions: {
    tsconfigRootDir: __dirname,
    ecmaFeatures: { jsx: true },
  },
}
