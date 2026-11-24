import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { mkdir, mkdtemp, rename, rm, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { promisify } from 'node:util';
import { planModelDirectory, sceneExecutable, sceneModel } from './scenes';

const run = promisify(execFile);
const name = 'DepthAnythingV2SmallF16P6';
const url = `https://ml-assets.apple.com/coreml/models/Image/DepthEstimation/DepthAnything/${name}.mlpackage.zip`;
const checksum = '0268456a2c388d73bc36ef8e8e2d7ecffbbb6afeb1d73e79030c84cb5e7f3594';
const root = process.cwd();
const target = sceneModel(root);

async function downloadChecked(url: string, path: string, checksum: string) {
  await run('curl', ['-fLsS', '--max-time', '180', '-o', path, url], { timeout: 185_000 });
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  if (hash.digest('hex') !== checksum) throw new Error(`Model checksum did not match for ${url}`);
}

if (!(await stat(target).catch(() => null))?.isDirectory()) {
  const directory = dirname(target);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const temporary = await mkdtemp(resolve(directory, 'download-'));
  try {
    const archive = resolve(temporary, 'model.zip');
    await downloadChecked(url, archive, checksum);
    await run('unzip', ['-oq', archive, `${name}.mlpackage/*`, '-d', temporary], { timeout: 30_000 });
    await run(await sceneExecutable(root), [resolve(temporary, `${name}.mlpackage`), '--prepare'], { timeout: 120_000 });
    await rename(resolve(temporary, `${name}.mlmodelc`), target);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

const folder = planModelDirectory(root);
await mkdir(folder, { recursive: true, mode: 0o700 });
const modelFiles = [
  ['segformer.onnx', 'https://huggingface.co/Xenova/segformer-b0-finetuned-ade-512-512/resolve/main/onnx/model.onnx',
    '3e5c18a4be395f16646438d54c42377ddc202edfa33d5eced0c9506de75c44c2'],
  ['labels.json', 'https://huggingface.co/nvidia/segformer-b0-finetuned-ade-512-512/resolve/main/config.json',
    '209caa9091e4632f7c8883c11170cd08ad29af68b23c09590aa4a5befb1a2a7f'],
  ['grounding.onnx', 'https://huggingface.co/onnx-community/grounding-dino-tiny-ONNX/resolve/1177833/onnx/model_quantized.onnx',
    '70bf2d3310d1ae73769c96a71e00cbf2861eb33a1f4d97d84a108a7bf02c03c9'],
  ['vocab.txt', 'https://huggingface.co/onnx-community/grounding-dino-tiny-ONNX/resolve/ff690b0a8050566c290287545bd059350f3e9096/vocab.txt',
    '07eced375cec144d27c900241f3e339478dec958f92fddbc551f295c992038a3'],
] as const;
for (const [name, modelUrl, digest] of modelFiles) {
  const target = resolve(folder, name);
  if (existsSync(target)) continue;
  const temporary = await mkdtemp(resolve(folder, 'download-'));
  try {
    await downloadChecked(modelUrl, resolve(temporary, name), digest);
    await rename(resolve(temporary, name), target);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

const venv = resolve(folder, 'venv');
const python = resolve(venv, 'bin/python');
if (!existsSync(python)) {
  const systemPython = process.env.WDT_SCENE_PYTHON ??
    (existsSync('/opt/homebrew/bin/python3.14') ? '/opt/homebrew/bin/python3.14' : 'python3');
  await run(systemPython, ['-m', 'venv', venv], { timeout: 90_000 });
}
if (!(await run(python, ['-c', 'import onnxruntime, PIL, pycolmap']).then(() => true, () => false))) {
  await run(python, ['-m', 'pip', 'install', '--disable-pip-version-check', '--only-binary=:all:',
    'onnxruntime==1.32.0', 'Pillow==12.3.0', 'pycolmap==4.2.1'], { timeout: 180_000 });
}

console.log('โมเดลสร้างแปลนจากวิดีโอพร้อมใช้งานบน Mac เครื่องนี้');
