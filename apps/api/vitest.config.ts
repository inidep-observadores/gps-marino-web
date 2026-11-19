import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.e2e.test.ts'],
    globalSetup: ['test/global-setup.ts'],
    // Los tests comparten una base: se ejecutan de a uno.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
})
