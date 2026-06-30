/** @type {import("eslint").Linter.Config} */
module.exports = {
  root: false,
  extends: ['next/core-web-vitals', 'prettier'],
  parserOptions: {
    tsconfigRootDir: __dirname,
  },
  rules: {
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
  },
}
