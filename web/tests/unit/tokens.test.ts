import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';

// Design tokens live in src/index.css only; every other stylesheet and component uses var(--…).
it('has no raw colours outside src/index.css', () => {
  const files = (readdirSync('src', { recursive: true }) as string[]).filter(
    (f) => /\.(css|tsx)$/.test(f) && f !== 'index.css',
  );
  expect(files.length).toBeGreaterThan(0);
  const bad = files.filter((f) => /#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(readFileSync(join('src', f), 'utf8')));
  expect(bad).toEqual([]);
});
