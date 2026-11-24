import { execFile } from 'node:child_process';
import { open, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { readMagicplanPdf, readMagicplanUsdRoom } from '../../src/core/camera/plan-import';

const run = promisify(execFile);
const commandLimit = 28 * 1024 * 1024;

export class PlanImportError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

async function verifySignature(path: string, signature: Buffer) {
  const file = await open(path, 'r');
  try {
    const bytes = Buffer.alloc(signature.length);
    const read = await file.read(bytes, 0, bytes.length, 0);
    if (read.bytesRead !== signature.length || !bytes.equals(signature)) {
      throw new PlanImportError(422, 'ไฟล์ไม่ตรงกับชนิดที่เลือกหรือไฟล์เสียหาย');
    }
  } finally {
    await file.close();
  }
}

export async function importUsdRoom(path: string, directory: string, signal: AbortSignal) {
  await verifySignature(path, Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  const options = { signal, timeout: 18_000, maxBuffer: commandLimit };
  const { stdout: members } = await run('/usr/bin/unzip', ['-Z1', path], { ...options, maxBuffer: 256 * 1024 });
  // Read only the USD layer. Image textures and other archive members stay untouched.
  const entry = members.split(/\r?\n/)[0] ?? '';
  if (!/^[a-zA-Z0-9_.-]+\.usdc$/.test(entry) || entry.startsWith('-')) {
    throw new PlanImportError(422, 'เปิดชั้นโมเดลไม่ได้ ลองส่งออก USDZ ใหม่จาก magicplan');
  }
  const { stdout: crate } = await run('/usr/bin/unzip', ['-p', path, entry], { ...options, encoding: 'buffer' });
  if (!crate.subarray(0, 8).equals(Buffer.from('PXR-USDC'))) throw new PlanImportError(422, 'อ่านโมเดลในไฟล์ USDZ ไม่ได้');
  const binary = resolve(directory, 'plan.usdc');
  await writeFile(binary, crate, { mode: 0o600 });
  const { stdout } = await run('/usr/bin/usdcat', [binary], options);
  const room = readMagicplanUsdRoom(stdout);
  if (!room) throw new PlanImportError(422, 'ยังอ่านรูปทรงห้องจาก USDZ นี้ไม่ได้ ลองใช้ USDZ ของหนึ่งห้องจาก magicplan หรือส่ง Sketch PDF');
  return room;
}

export async function importPdfRoom(path: string, preview: string, signal: AbortSignal) {
  await verifySignature(path, Buffer.from('%PDF-'));
  const options = { signal, timeout: 18_000, maxBuffer: commandLimit };
  await run('pdftoppm', ['-f', '1', '-l', '1', '-scale-to', '1500', '-png', '-singlefile', path, preview], options);
  // The original PDF is never embedded. Preview is the rasterized first page.
  const [{ stdout: text }, { stdout: svg }] = await Promise.all([
    run('pdftotext', ['-f', '1', '-l', '1', '-layout', path, '-'], options),
    run('pdftocairo', ['-f', '1', '-l', '1', '-svg', path, '-'], options),
  ]).catch((error: unknown) => {
    if (signal.aborted) throw error;
    return [{ stdout: '' }, { stdout: '' }];
  });
  return readMagicplanPdf(svg, text);
}
