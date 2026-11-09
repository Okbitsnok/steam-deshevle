// Конфиг ESLint без внешних пакетов: только встроенные правила.
// Если хочешь полный набор — поставь @eslint/js и добавь js.configs.recommended.

const browserGlobals = {
  window: 'readonly', document: 'readonly', location: 'readonly', navigator: 'readonly',
  fetch: 'readonly', console: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly',
  sessionStorage: 'readonly', localStorage: 'readonly', AbortController: 'readonly',
  DOMException: 'readonly', Intl: 'readonly', URL: 'readonly', HTMLElement: 'readonly',
  HTMLInputElement: 'readonly', HTMLFormElement: 'readonly', HTMLOutputElement: 'readonly',
  HTMLButtonElement: 'readonly', HTMLSelectElement: 'readonly', Node: 'readonly', globalThis: 'readonly', chrome: 'readonly',
  RequestInit: 'readonly', self: 'readonly', requestAnimationFrame: 'readonly', Response: 'readonly',
  structuredClone: 'readonly', getComputedStyle: 'readonly',
};

const rules = {
  'no-undef': 'error',
  'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
  'no-redeclare': 'error',
  'no-dupe-keys': 'error',
  'no-duplicate-case': 'error',
  'no-unreachable': 'error',
  'no-empty': ['error', { allowEmptyCatch: true }],
  'no-constant-condition': ['error', { checkLoops: false }],
  'no-fallthrough': 'error',
  'no-self-assign': 'error',
  'no-unsafe-finally': 'error',
  'no-unsafe-negation': 'error',
  'no-useless-escape': 'error',
  'no-cond-assign': 'error',
  'no-dupe-else-if': 'error',
  'no-import-assign': 'error',
  'no-loss-of-precision': 'error',
  'no-misleading-character-class': 'error',
  'no-prototype-builtins': 'error',
  'no-shadow-restricted-names': 'error',
  'no-sparse-arrays': 'error',
  'use-isnan': 'error',
  'valid-typeof': 'error',
  eqeqeq: ['error', 'smart'],
  'prefer-const': 'error',
  'no-var': 'error',
};

export default [
  {
    files: ['src/**/*.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: browserGlobals },
    rules,
  },
  {
    files: ['src/content/**/*.js'],
    languageOptions: { sourceType: 'script' },
  },
  {
    files: ['tests/**/*.mjs', 'scripts/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...browserGlobals, process: 'readonly', __dirname: 'readonly', Buffer: 'readonly' },
    },
    rules,
  },
];
