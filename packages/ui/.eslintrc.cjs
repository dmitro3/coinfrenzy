/** @type {import("eslint").Linter.Config} */
module.exports = {
  root: false,
  extends: ['../../.eslintrc.cjs'],
  plugins: ['react-hooks'],
  parserOptions: {
    tsconfigRootDir: __dirname,
    ecmaFeatures: { jsx: true },
  },
}
