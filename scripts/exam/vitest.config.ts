import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['scripts/exam/*.test.ts'], testTimeout: 3_600_000 } });
