// Hands of Fate — vitest.config.mts
// Tests live in /tests (outside assets/, so Cocos never compiles them).
// They use tests/tsconfig.json, not the Cocos one, which extends a temp/ file
// that only exists after the editor has run.
import { defineConfig } from 'vitest/config';

export default defineConfig({
    tsconfig: 'tests/tsconfig.json',
    test: {
        include: ['tests/**/*.test.ts'],
        environment: 'node',
    },
});
