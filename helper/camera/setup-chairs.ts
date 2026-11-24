import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, mkdtemp, rename, rm, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { chairExecutable, chairModel } from './chairs';

const run = promisify(execFile);
const url = 'https://ml-assets.apple.com/coreml/models/Image/ObjectDetection/YOLOv3/YOLOv3Int8LUT.mlmodel';
const checksum = '0e32f297ad9cfc0ea8e67276867956488c7ee10dc87c057da4debc939e20b76d';
const root = process.cwd();
const target = chairModel(root);

if (!(await stat(target).catch(() => null))?.isDirectory()) {
  const directory = resolve(root, '.wdt-data');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const temporary = await mkdtemp(resolve(directory, 'chair-model-'));
  try {
    const source = resolve(temporary, 'YOLOv3Int8LUT.mlmodel');
    await run('curl', ['-fLsS', '--max-time', '120', '-o', source, url], { timeout: 125_000 });
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(source)) hash.update(chunk);
    if (hash.digest('hex') !== checksum) throw new Error('The downloaded Apple model checksum did not match');
    await run(await chairExecutable(root), [source, '--prepare'], { timeout: 120_000 });
    await rename(resolve(temporary, 'YOLOv3Int8LUT.mlmodelc'), target);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

console.log('โมเดลตรวจเก้าอี้พร้อมใช้งานบน Mac เครื่องนี้');
