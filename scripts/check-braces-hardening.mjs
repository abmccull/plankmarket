import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// Failure inventory: an alias that leaves a second vulnerable copy installed;
// ordinary glob incompatibility; excessive string/AST recursion; depth-option
// bypasses; cyclic parent traversal; a lockfile change without the reviewed code.
const expectedVersion = '3.0.3-pn.3';
const nested = depth => '{'.repeat(depth) + 'x' + '}'.repeat(depth);
for (const graph of ['.', '.github/vercel-cli']) {
  const lock = JSON.parse(readFileSync(path.resolve(graph, 'package-lock.json'), 'utf8'));
  const entries = Object.entries(lock.packages).filter(([key]) => key.endsWith('/braces'));
  assert.ok(entries.length, `${graph}: missing reviewed braces dependency`);
  for (const [key, entry] of entries) {
    assert.equal(entry.name, '@dieub/braces-depth-guard', `${graph}/${key}`);
    assert.equal(entry.version, expectedVersion);
    assert.equal(entry.integrity, 'sha512-QY+Uq4s42STyIMPoRkBuUZfYyvz0uZuwuUburLwMx5N+lWqnHHaBxcKPtgKVKjTyFnS1q4ivKu9Wxi4VG7FE9Q==');
  }
  const graphRequire = createRequire(path.resolve(graph, 'package.json'));
  const globRequire = createRequire(graphRequire.resolve('fast-glob'));
  const matchRequire = createRequire(globRequire.resolve('micromatch'));
  const braces = matchRequire('braces');
  const manifest = matchRequire('braces/package.json');
  assert.equal(manifest.name, '@dieub/braces-depth-guard');
  assert.equal(manifest.version, expectedVersion);
  assert.deepEqual(braces.expand('src/{app,components}/**/*.{ts,tsx}'), [
    'src/app/**/*.ts', 'src/app/**/*.tsx',
    'src/components/**/*.ts', 'src/components/**/*.tsx',
  ]);
  assert.deepEqual(braces.expand('file{01..03}.ts'), ['file01.ts', 'file02.ts', 'file03.ts']);
  for (const method of ['parse', 'compile', 'expand', 'stringify']) {
    assert.doesNotThrow(() => braces[method](nested(100)));
    assert.throws(() => braces[method](nested(101)), /exceeds max depth/);
    assert.throws(() => braces[method](nested(3000)), /exceeds max depth/);
    assert.throws(() => braces[method](nested(2), { maxDepth: 1.5 }), /exceeds max depth/);
    assert.throws(() => braces[method](nested(1), { maxDepth: -1 }), /non-negative/);
  }
  // Direct AST callers must receive the same guard without relying on parsing.
  const unguardedAst = () => {
    let node = { type: 'text', value: 'x' };
    for (let i = 0; i < 101; i++) node = { type: 'brace', nodes: [node] };
    return { type: 'root', nodes: [node] };
  };
  for (const method of ['compile', 'expand', 'stringify']) {
    assert.throws(() => braces[method](unguardedAst()), /exceeds max depth/);
  }
  assert.throws(() => braces.parse('x'.repeat(10001), { maxLength: NaN }), /non-negative/);
  const cyclic = { type: 'paren', nodes: [] };
  cyclic.parent = cyclic;
  assert.throws(() => braces.expand(cyclic), /cycle/);
  console.log(`${graph}: reviewed braces ${expectedVersion}; glob compatibility and recursion guards passed`);
}
