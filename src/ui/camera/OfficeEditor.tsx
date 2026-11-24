import { Armchair, MousePointer2, PencilLine, ScanLine, Save, Undo2 } from 'lucide-react';
import type { useOfficeEditor } from './useOfficeEditor';

export function OfficeEditor({ editor, paused, pause, onDetect, disabled }: {
  editor: ReturnType<typeof useOfficeEditor>;
  paused: boolean;
  pause: () => void;
  onDetect: () => void;
  disabled: boolean;
}) {
  const { accepted, busy, calibrationPoints, edit, needsCalibration, points, suggestions, message } = editor;
  const calibrating = edit?.type === 'calibration';
  const calibrationCount = calibrationPoints.floor.length;
  const pickOnVideo = calibrationPoints.image.length === calibrationCount;
  const guide = calibrationCount === 4 ? 'ครบ 4 คู่แล้ว กดพรีวิวมุมใหม่'
    : pickOnVideo ? `เลือกจุดบนพื้นในวิดีโอ จุดที่ ${calibrationCount + 1} จาก 4`
    : `เลือกจุดเดียวกันบนผังมุมบน จุดที่ ${calibrationCount + 1} จาก 4`;
  return (
    <section className="camera-operator camera-layout" aria-label="แก้ไขผังออฟฟิศ">
      <div className="camera-operator-summary">
        <h2>แก้ไขผังออฟฟิศ</h2>
        <p>{calibrating ? guide : edit?.type === 'region' ? 'คลิกบนวิดีโอเพื่อวางจุดรอบเขต จากนั้นกดปิดเขตและพรีวิว'
          : edit?.type === 'move' ? 'คลิกจุดที่ขาเก้าอี้สัมผัสพื้นในวิดีโอ'
          : needsCalibration ? 'จับคู่จุดบนพื้น 4 จุดเพื่อให้คลิปมุมใหม่นี้ตรงกับผังห้องเดิม'
          : 'ปรับเทียบมุมกล้อง วาดเขตติดตาม หรือหยุดคลิปเพื่อค้นหาเก้าอี้'}</p>
        {calibrating && <p>เลือกจุดบนพื้นให้กระจายกว้างและเรียงรอบพื้นที่ เช่น มุมทางเดินหรือมุมที่พื้นชนผนัง</p>}
      </div>
      <div className="camera-operator-actions">
        {edit ? (
          <>
            {calibrating && (
              <>
                <button type="button" className="btn" disabled={disabled || !calibrationPoints.image.length}
                  onClick={editor.undoCalibrationPoint}><Undo2 size={15} aria-hidden="true" /> ย้อนจุดล่าสุด</button>
                <button type="button" className="btn btn-primary" disabled={disabled || calibrationCount !== 4}
                  onClick={() => void editor.previewCalibration()}>{busy === 'preview' ? 'กำลังเตรียมพรีวิว…' : 'พรีวิวมุมใหม่'}</button>
              </>
            )}
            {edit.type === 'region' && (
              <>
                <button type="button" className="btn" disabled={disabled || !points.length}
                  onClick={editor.undoPoint}><Undo2 size={15} aria-hidden="true" /> ย้อนจุดล่าสุด</button>
                <button type="button" className="btn btn-primary" disabled={disabled || points.length < 3}
                  onClick={() => void editor.closeRegion()}>{busy === 'preview' ? 'กำลังเตรียมพรีวิว…' : 'ปิดเขตและพรีวิว'}</button>
              </>
            )}
            <button type="button" className="btn" disabled={disabled} onClick={editor.cancelEdit}>ยกเลิกการวางจุด</button>
          </>
        ) : (
          <>
            <button type="button" className={needsCalibration ? 'btn btn-primary' : 'btn'} disabled={disabled}
              onClick={() => { pause(); editor.startCalibration(); }}>
              <ScanLine size={15} aria-hidden="true" /> ปรับเทียบมุมกล้อง
            </button>
            <button type="button" className="btn" disabled={disabled || needsCalibration} onClick={() => { pause(); editor.startRegion(); }}>
              <PencilLine size={15} aria-hidden="true" /> วาดเขตติดตาม
            </button>
            <button type="button" className="btn" disabled={disabled || !paused || needsCalibration} onClick={onDetect}>
              <Armchair size={15} aria-hidden="true" /> {busy === 'chairs' ? 'กำลังค้นหาเก้าอี้…' : 'ค้นหาเก้าอี้ในเฟรมนี้'}
            </button>
            {editor.dirty && (
              <>
                <button type="button" className="btn" disabled={disabled} onClick={editor.reset}>คืนค่าร่าง</button>
                <button type="button" className="btn btn-primary" disabled={disabled}
                  onClick={() => void editor.save()}><Save size={15} aria-hidden="true" /> {busy === 'save' ? 'กำลังบันทึก…' : 'บันทึกผัง'}</button>
              </>
            )}
          </>
        )}
      </div>
      {message && <p className={`camera-layout-message ${message.error ? 'error' : ''}`}
        role={message.error ? 'alert' : 'status'}>{message.text}</p>}
      {(suggestions.length > 0 || accepted.length > 0) && (
        <div className="camera-chair-lists">
          {suggestions.length > 0 && (
            <ul aria-label="เก้าอี้ที่ตรวจพบ">
              {suggestions.map((chair) => (
                <li key={chair.id}>
                  <span><Armchair size={14} aria-hidden="true" /> เก้าอี้ที่ตรวจพบ {chair.id.split('-').at(-1)}</span>
                  <button type="button" className="btn btn-sm" disabled={disabled || Boolean(edit)} onClick={() => editor.accept(chair)}>ใส่ในผัง</button>
                  <button type="button" className="btn btn-sm" disabled={disabled || Boolean(edit)}
                    onClick={() => editor.removeSuggestion(chair.id)}>ตัดออก</button>
                </li>
              ))}
            </ul>
          )}
          {accepted.length > 0 && (
            <ul aria-label="เก้าอี้ในผัง">
              {accepted.map((chair, index) => (
                <li key={chair.id}>
                  <span><Armchair size={14} aria-hidden="true" /> เก้าอี้ในผัง {index + 1}</span>
                  <button type="button" className="btn btn-sm" disabled={disabled || Boolean(edit)}
                    onClick={() => { pause(); editor.moveChair(chair.id); }}><MousePointer2 size={13} aria-hidden="true" /> ขยับ</button>
                  <button type="button" className="btn btn-sm" disabled={disabled || Boolean(edit)} onClick={() => editor.removeChair(chair.id)}>ลบ</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
