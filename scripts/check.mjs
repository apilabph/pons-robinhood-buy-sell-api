import { readdir, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
for (const dir of ['src', 'scripts', 'test']) {
  for (const name of await readdir(dir)) {
    if (!/\.(mjs|js)$/.test(name)) continue;
    const r = spawnSync(process.execPath, ['--check', `${dir}/${name}`], { stdio: 'inherit' });
    if (r.status !== 0) process.exit(r.status ?? 1);
  }
}
const spec = JSON.parse(await readFile('openapi.json', 'utf8'));
if (!spec.paths['/v1/market'] || Object.keys(spec.paths).length !== 3) throw new Error('Unexpected API specification paths');
console.log('Syntax and API specification checks passed.');
