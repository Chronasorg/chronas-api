import js from '@eslint/js';
import n from 'eslint-plugin-n';
import promise from 'eslint-plugin-promise';
import globals from 'globals';

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.es2021
      }
    },
    plugins: {
      n,
      promise
    },
    rules: {
      'indent': ['warn', 2],
      'linebreak-style': ['error', 'unix'],
      'quotes': ['warn', 'single'],
      'semi': ['warn', 'always'],
      'no-console': ['off'],
      'no-unused-vars': ['warn', { 'argsIgnorePattern': '^_' }],
      'no-trailing-spaces': 'warn',
      'eol-last': 'warn',
      'comma-dangle': ['warn', 'never'],
      'object-curly-spacing': ['warn', 'always'],
      'array-bracket-spacing': ['warn', 'never'],
      'space-before-function-paren': ['warn', {
        'anonymous': 'always',
        'named': 'never',
        'asyncArrow': 'always'
      }],
      'keyword-spacing': 'warn',
      'space-infix-ops': 'warn',
      'no-multiple-empty-lines': ['warn', { 'max': 2, 'maxEOF': 1 }],
      'prefer-const': 'warn',
      'no-var': 'error',
      'prefer-arrow-callback': 'warn',
      'arrow-spacing': 'warn',
      'prefer-template': 'warn',
      'template-curly-spacing': 'warn',
      'object-shorthand': 'warn',
      'prefer-destructuring': ['warn', {
        'array': false,
        'object': true
      }],
      'no-duplicate-imports': 'warn',
      'camelcase': 'off',
      'eqeqeq': 'warn',
      'no-undef': 'error',
      'no-return-assign': 'warn',
      'prefer-promise-reject-errors': 'warn',
      'n/handle-callback-err': 'off',
      'no-useless-escape': 'warn',
      'no-unused-expressions': 'off',
      'no-mixed-operators': 'warn'
    }
  },
  {
    files: ['**/*.test.js', '**/*.spec.js'],
    languageOptions: {
      globals: {
        ...globals.mocha
      }
    },
    rules: {
      'no-console': 'off'
    }
  },
  {
    ignores: ['node_modules/**', 'coverage/**', 'PostmanTests/**']
  }
];
