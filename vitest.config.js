const { defineConfig } = require('vitest/config');

module.exports = defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
    },
    include: ['tests/unit/**/*.test.js'],
  },
});