import { useState } from 'react';
import {
  CAMERA_CHAIRS_PATH, CAMERA_LAYOUT_PREVIEW_PATH, CAMERA_LAYOUT_SAVE_PATH, type CameraDraft,
} from '../../core/camera/feed';
import {
  createOfficeProjector, defaultOfficeLayout, MAX_OFFICE_CHAIRS, MAX_REGION_POINTS, officeRegion, readOfficeCalibration, recalibrateOffice,
  type ChairSuggestion,
} from '../../core/camera/office-layout';
import { OFFICE_LENGTH, OFFICE_WIDTH } from '../../core/camera/office';
import type { FloorPoint } from '../../core/camera/tracking';

type Busy = 'preview' | 'save' | 'chairs';
type Edit = { type: 'region' } | { type: 'calibration' } | { type: 'move'; id: string } | null;

interface CalibrationPoints {
  image: FloorPoint[];
  floor: FloorPoint[];
}
const noCalibrationPoints: CalibrationPoints = { image: [], floor: [] };

export async function requireCameraJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(body?.error ?? 'เชื่อมต่อ Camera Twin ไม่สำเร็จ');
  }
  return await response.json() as T;
}

export function useOfficeEditor(
  draft: CameraDraft | null | undefined,
  onSave: (draft: CameraDraft) => void,
) {
  const [preview, setPreview] = useState<CameraDraft | null>(null);
  const [chairs, setChairs] = useState<NonNullable<CameraDraft['layout']>['chairs'] | null>(null);
  const [suggestions, setSuggestions] = useState<ChairSuggestion[]>([]);
  const [suggestionTime, setSuggestionTime] = useState<number | null>(null);
  const [points, setPoints] = useState<FloorPoint[]>([]);
  const [calibrationPoints, setCalibrationPoints] = useState(noCalibrationPoints);
  const [edit, setEdit] = useState<Edit>(null);
  const [busy, setBusy] = useState<Busy | null>(null);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const layout = preview?.layout ?? draft?.layout ?? defaultOfficeLayout();
  const mapPoint = createOfficeProjector(layout.calibration);
  const needsCalibration = Boolean(draft?.needsCalibration && !layout.calibration);
  const accepted = chairs ?? layout.chairs;
  const dirty = Boolean(preview || chairs || edit);
  const error = (text: string) => setMessage({ text, error: true });

  function reset() {
    setPreview(null);
    setChairs(null);
    setSuggestions([]);
    setSuggestionTime(null);
    setPoints([]);
    setCalibrationPoints(noCalibrationPoints);
    setEdit(null);
    setMessage(null);
  }

  async function request<T>(operation: Busy, path: string, data: object) {
    if (!draft || busy) return null;
    setBusy(operation);
    setMessage(null);
    try {
      return await requireCameraJson<T>(await fetch(path, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: draft.media.id, revision: draft.revision ?? 0, ...data }),
      }));
    } catch (failure) {
      error(failure instanceof Error ? failure.message : 'แก้ไขผังไม่สำเร็จ');
      return null;
    } finally {
      setBusy(null);
    }
  }

  function startRegion() {
    setMessage(null);
    setPoints([]);
    setEdit({ type: 'region' });
  }

  function startCalibration() {
    setMessage(null);
    setCalibrationPoints(noCalibrationPoints);
    setEdit({ type: 'calibration' });
  }

  function clickFloor([x, z]: FloorPoint) {
    if (edit?.type !== 'calibration' || busy || calibrationPoints.image.length !== calibrationPoints.floor.length + 1) return;
    if (x < 0 || x > OFFICE_WIDTH || z < 0 || z > OFFICE_LENGTH) return;
    setMessage(null);
    setCalibrationPoints({ ...calibrationPoints, floor: [...calibrationPoints.floor, [x, z]] });
  }

  function undoCalibrationPoint() {
    setMessage(null);
    if (calibrationPoints.image.length > calibrationPoints.floor.length) {
      setCalibrationPoints({ ...calibrationPoints, image: calibrationPoints.image.slice(0, -1) });
    } else {
      setCalibrationPoints({ ...calibrationPoints, floor: calibrationPoints.floor.slice(0, -1) });
    }
  }

  async function previewCalibration() {
    const calibration = readOfficeCalibration(calibrationPoints);
    if (!calibration) {
      error('จุดทั้ง 4 ต้องล้อมบริเวณพื้นโดยเส้นไม่ไขว้กัน และเรียงลำดับเดียวกันบนภาพกับผัง');
      return;
    }
    const previousLayout = preview?.layout ?? draft?.layout;
    const adjusted = recalibrateOffice(previousLayout && { ...previousLayout, chairs: accepted }, calibration);
    const next = await request<CameraDraft>('preview', CAMERA_LAYOUT_PREVIEW_PATH, { layout: adjusted });
    if (!next) return;
    setPreview(next);
    setEdit(null);
    setChairs(null);
    setSuggestions([]);
    setSuggestionTime(null);
    const adjustedPrevious = previousLayout && (adjusted.chairs.length !== accepted.length || adjusted.region !== previousLayout.region);
    setMessage({ text: adjustedPrevious
      ? 'พรีวิวมุมใหม่แล้ว จุดเดิมที่อยู่นอกผังถูกตัดออก ตรวจเขตและเก้าอี้ก่อนบันทึก'
      : 'พรีวิวมุมใหม่แล้ว เล่นคลิปเพื่อเทียบตำแหน่งบนภาพและผังก่อนบันทึก' });
  }

  function click(point: FloorPoint) {
    if (!edit || busy) return;
    if (edit.type === 'calibration') {
      if (calibrationPoints.image.length < 4 && calibrationPoints.image.length === calibrationPoints.floor.length) {
        setMessage(null);
        setCalibrationPoints({ ...calibrationPoints, image: [...calibrationPoints.image, point] });
      }
      return;
    }
    if (!mapPoint(point)) {
      error('จุดนี้อยู่นอกพื้นออฟฟิศบนผัง เลือกจุดที่ชิดพื้นในภาพ');
      return;
    }
    setMessage(null);
    if (edit.type === 'move') {
      setChairs(accepted.map((chair) => chair.id === edit.id ? { ...chair, point } : chair));
      setEdit(null);
    } else if (points.length < MAX_REGION_POINTS) {
      setPoints([...points, point]);
    } else {
      error('เพิ่มได้สูงสุด 12 จุด กดปิดเขตเพื่อพรีวิว');
    }
  }

  async function closeRegion() {
    if (!officeRegion(points, layout.calibration)) {
      error('วาดอย่างน้อย 3 จุดรอบพื้นที่ โดยให้เส้นเขตไม่ตัดกัน');
      return;
    }
    const next = await request<CameraDraft>('preview', CAMERA_LAYOUT_PREVIEW_PATH, {
      layout: { ...layout, region: points, chairs: accepted },
    });
    if (!next) return;
    setPreview(next);
    setEdit(null);
    setPoints([]);
    setMessage({ text: 'พรีวิวเขตใหม่แล้ว กดเล่นต่อเพื่อดูการติดตาม' });
  }

  async function detect(timeMs: number) {
    const found = await request<ChairSuggestion[]>('chairs', CAMERA_CHAIRS_PATH, { timeMs, calibration: layout.calibration });
    if (!found) return;
    setSuggestionTime(timeMs);
    const unique = found.filter(({ id, point }) => !accepted.some((chair) => chair.id === id ||
      Math.hypot(chair.point[0] - point[0], chair.point[1] - point[1]) < 0.027));
    setSuggestions(unique);
    setMessage({ text: unique.length ? 'ตรวจผลจากเฟรมนี้ แล้วเลือกเก้าอี้ที่จะใส่ในผัง' : found.length ? 'เก้าอี้ที่ตรวจพบมีตำแหน่งอยู่ในผังแล้ว' : 'เฟรมนี้ตรวจไม่พบเก้าอี้ ลองเลื่อนไปยังเฟรมที่เห็นเก้าอี้ชัดขึ้น' });
  }

  function removeSuggestion(id: string) {
    setSuggestions(suggestions.filter((chair) => chair.id !== id));
  }

  function accept(chair: ChairSuggestion) {
    if (accepted.length >= MAX_OFFICE_CHAIRS) {
      error('ใส่เก้าอี้ในผังได้สูงสุด 20 ตัว');
      return;
    }
    setChairs([...accepted, { id: chair.id, point: chair.point }]);
    removeSuggestion(chair.id);
  }

  async function save() {
    const next = await request<CameraDraft>('save', CAMERA_LAYOUT_SAVE_PATH, {
      layout: { ...layout, chairs: accepted },
    });
    if (!next) return;
    onSave(next);
    reset();
    setMessage({ text: 'บันทึกผังในร่างคลิปแล้ว' });
  }

  return {
    accepted, accept, busy, calibrationPoints, click, clickFloor, closeRegion, detect, dirty, edit, layout, message, needsCalibration,
    points, preview, previewCalibration, reset, save, startCalibration, startRegion, suggestions, suggestionTime, removeSuggestion,
    undoCalibrationPoint,
    removeChair: (id: string) => setChairs(accepted.filter((chair) => chair.id !== id)),
    moveChair: (id: string) => { setMessage(null); setEdit({ type: 'move', id }); },
    undoPoint: () => setPoints(points.slice(0, -1)),
    cancelEdit: () => { setPoints([]); setCalibrationPoints(noCalibrationPoints); setEdit(null); setMessage(null); },
  };
}
