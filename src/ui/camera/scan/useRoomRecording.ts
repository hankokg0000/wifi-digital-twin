import { useEffect, useRef, useState } from 'react';
import { SCAN_MAX_BYTES, SCAN_MAX_SECONDS, SCAN_MIN_SECONDS } from '../../../core/camera/room-scan';

const MIME_TYPES = ['video/mp4', 'video/webm;codecs=vp8', 'video/webm'];

export function useRoomRecording(onClip: (clip: File) => void, onError: (message: string) => void) {
  const liveVideo = useRef<HTMLVideoElement>(null);
  const camera = useRef<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const mounted = useRef(false);
  const [recording, setRecording] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [seconds, setSeconds] = useState(0);

  function stopCamera() {
    clearInterval(timer.current);
    if (liveVideo.current) liveVideo.current.srcObject = null;
    camera.current?.getTracks().forEach((track) => track.stop());
    camera.current = null;
  }

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (recorder.current?.state === 'recording') recorder.current.stop();
      stopCamera();
    };
  }, []);

  async function start() {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      onError('ถ่ายจากเว็บได้เมื่อเปิดผ่าน HTTPS และใช้เบราว์เซอร์ที่อนุญาตกล้อง หรือเลือกไฟล์ที่ถ่ายไว้ได้');
      return;
    }
    setRequesting(true);
    setSeconds(0);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      if (!mounted.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      camera.current = stream;
      if (liveVideo.current) liveVideo.current.srcObject = stream;
      const mime = MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
      const current = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), videoBitsPerSecond: 4_500_000 });
      recorder.current = current;
      const chunks: Blob[] = [];
      let length = 0;
      let error = false;
      const started = performance.now();
      current.addEventListener('dataavailable', ({ data }) => {
        if (data.size) {
          length += data.size;
          chunks.push(data);
          if (length > SCAN_MAX_BYTES && current.state === 'recording') current.stop();
        }
      });
      current.addEventListener('error', () => {
        error = true;
        onError('กล้องหยุดบันทึก ลองเริ่มถ่ายใหม่');
        if (current.state === 'recording') current.stop();
        else stopCamera();
      });
      current.addEventListener('stop', () => {
        stopCamera();
        recorder.current = null;
        if (!mounted.current) return;
        setRecording(false);
        if (error) return;
        if ((performance.now() - started) / 1000 < SCAN_MIN_SECONDS || !length) {
          onError(`ถ่ายอย่างน้อย ${SCAN_MIN_SECONDS} วินาที แล้วเดินให้เห็นพื้นและผนังจากหลายมุม`);
          return;
        }
        if (length > SCAN_MAX_BYTES) {
          onError('ไฟล์ที่บันทึกใหญ่เกิน 180 MB ลองถ่ายคลิปสั้นลง');
          return;
        }
        const type = current.mimeType.split(';')[0] || chunks[0]?.type || 'video/mp4';
        onClip(new File(chunks, type.includes('webm') ? 'room-scan.webm' : 'room-scan.mp4', { type }));
      }, { once: true });
      current.start(500);
      setRecording(true);
      timer.current = setInterval(() => {
        const elapsed = (performance.now() - started) / 1000;
        setSeconds(Math.floor(elapsed));
        if (elapsed >= SCAN_MAX_SECONDS - 2 && current.state === 'recording') current.stop();
      }, 250);
    } catch (failure) {
      stopCamera();
      const denied = failure instanceof DOMException && failure.name === 'NotAllowedError';
      onError(denied ? 'อนุญาตใช้กล้องที่เบราว์เซอร์ หรือเลือกไฟล์คลิปที่ถ่ายไว้'
        : 'เปิดกล้องไม่ได้ ลองเลือกไฟล์คลิปที่ถ่ายไว้');
    } finally {
      if (mounted.current) setRequesting(false);
    }
  }

  return {
    liveVideo, recording, requesting, seconds, start,
    stop: () => { if (recorder.current?.state === 'recording') recorder.current.stop(); },
  };
}
