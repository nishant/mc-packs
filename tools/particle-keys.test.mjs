import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Bedrock's particle component key is facing_camera_mode; facing_camera_type is silently ignored.
test('no particle file uses the invalid facing_camera_type key', () => {
  const packsDir = 'packs';
  const bad = [];
  for (const pack of fs.readdirSync(packsDir)) {
    const dir = path.join(packsDir, pack, 'particles');
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.json')) continue;
      if (fs.readFileSync(path.join(dir, f), 'utf8').includes('facing_camera_type')) bad.push(`${pack}/${f}`);
    }
  }
  assert.deepEqual(bad, []);
});
