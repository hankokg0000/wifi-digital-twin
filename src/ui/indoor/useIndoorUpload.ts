import { useEffect, useState } from 'react';
import { indoorClipApi, type CameraDraft, type CameraOperator } from '../../core/camera/feed';
import { requireCameraJson } from '../camera/useOfficeEditor';

export function useIndoorUpload(enabled: boolean, roomId: string) {
  const api = indoorClipApi(roomId);
  const [clip, setClip] = useState<CameraDraft | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    void fetch(api + '/operator', { signal: controller.signal, cache: 'no-store' })
      .then(requireCameraJson<CameraOperator>)
      .then(({ draft }) => { if (!controller.signal.aborted && draft?.scene?.kind === 'floor-plan') setClip(draft); })
      .catch(() => {});
    return () => controller.abort();
  }, [enabled, api]);

  async function upload(file: File) {
    setUploading(true);
    setError('');
    try {
      const response = await fetch(api + '/upload', {
        method: 'POST',
        headers: { 'X-Camera-File': encodeURIComponent(file.name) },
        body: file,
      });
      const next = await requireCameraJson<CameraDraft>(response);
      if (next.scene?.kind !== 'floor-plan') throw new Error('ยังสร้างผังจากวิดีโอนี้ไม่ได้');
      setClip(next);
      return true;
    } catch (error) {
      setError(error instanceof Error ? error.message : 'เปิดวิดีโอนี้ไม่ได้');
      return false;
    } finally {
      setUploading(false);
    }
  }

  return { clip, uploading, error, upload };
}
