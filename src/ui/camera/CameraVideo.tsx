import { useEffect, useMemo, useRef, useState, type PointerEvent, type RefObject } from 'react';
import { VideoOff } from 'lucide-react';
import type { SceneObservation } from '../../core/camera/generated-scene';
import { OFFICE_CALIBRATION } from '../../core/camera/office';
import type { ChairSuggestion, OfficeLayout } from '../../core/camera/office-layout';
import { createFloorProjection, type CameraTrack, type FloorPoint, type PersonDetection } from '../../core/camera/tracking';

const WIDTH = 960;
const HEIGHT = 540;

function polygonPoints(points: readonly FloorPoint[]) {
  return points.map(([x, y]) => `${x * WIDTH},${y * HEIGHT}`).join(' ');
}

export function TrackedBoxes({ observations, simulated = false }: { observations: SceneObservation[]; simulated?: boolean }) {
  return observations.map(({ id, box, ground, seat }) => (
    <g key={id} className={simulated ? 'camera-observation simulated' : ground ? 'camera-observation grounded' : 'camera-observation'}
      data-seat={seat?.side} data-testid="scene-video-detection">
      <rect x={box.x * WIDTH} y={box.y * HEIGHT} width={box.width * WIDTH} height={box.height * HEIGHT} rx="3" />
      {ground && <circle cx={ground[0] * WIDTH} cy={ground[1] * HEIGHT} r="5" />}
    </g>
  ));
}

interface CameraVideoProps {
  url: string | null;
  track: CameraTrack | null;
  imageDetection?: PersonDetection | null;
  sceneObservations?: SceneObservation[];
  simulatedPositions?: boolean;
  video: RefObject<HTMLVideoElement | null>;
  paused: boolean;
  elapsedMs: number;
  followsServer: boolean;
  showOverlay: boolean;
  showRegion?: boolean;
  calibrationPoints?: FloorPoint[];
  empty: string;
  layout?: OfficeLayout;
  suggestions?: ChairSuggestion[];
  showChairBoxes?: boolean;
  drawing?: FloorPoint[];
  displayedFrame?: RefObject<number | null>;
  onFrameClick?: (point: FloorPoint) => void;
  onTime?: (time: number) => void;
  onDuration?: (time: number) => void;
}

export function CameraVideo({
  url, track, imageDetection, sceneObservations, simulatedPositions, video, paused, elapsedMs, followsServer, showOverlay, showRegion = true, calibrationPoints, empty, onTime, onDuration, layout, suggestions, showChairBoxes, drawing, displayedFrame, onFrameClick,
}: CameraVideoProps) {
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const synchronize = useRef(() => {});
  synchronize.current = () => {
    const element = video.current;
    if (!element || element.readyState < 1) return;
    if (followsServer && !element.seeking) {
      const target = Math.max(0, Math.min(elapsedMs / 1000, element.duration - 0.02));
      if (Number.isFinite(target) && Math.abs(element.currentTime - target) > (paused ? 0.035 : 0.18)) {
        setSyncing(true);
        element.currentTime = target;
      }
    }
    if (paused) {
      if (!element.paused) element.pause();
    } else if (element.paused) {
      void element.play().catch(() => {});
    }
  };

  useEffect(() => { synchronize.current(); }, [elapsedMs, paused, url, followsServer]);
  useEffect(() => {
    const element = video.current;
    if (!element || !onTime) return;
    const update = () => onTime(element.currentTime * 1000);
    let frame: number | undefined;
    if (typeof element.requestVideoFrameCallback === 'function') {
      const next = (_: number, data: VideoFrameCallbackMetadata) => {
        if (displayedFrame) displayedFrame.current = data.mediaTime;
        onTime(data.mediaTime * 1000);
        frame = element.requestVideoFrameCallback(next);
      };
      frame = element.requestVideoFrameCallback(next);
    } else {
      element.addEventListener('timeupdate', update);
    }
    element.addEventListener('seeked', update);
    element.addEventListener('loadeddata', update);
    return () => {
      if (frame !== undefined) element.cancelVideoFrameCallback(frame);
      if (displayedFrame) displayedFrame.current = null;
      element.removeEventListener('timeupdate', update);
      element.removeEventListener('seeked', update);
      element.removeEventListener('loadeddata', update);
    };
  }, [onTime, url, video, displayedFrame]);

  function clickFrame(event: PointerEvent<SVGSVGElement>) {
    if (!onFrameClick || event.button !== 0) return;
    const matrix = event.currentTarget.getScreenCTM();
    if (!matrix) return;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    if (point.x >= 0 && point.x <= WIDTH && point.y >= 0 && point.y <= HEIGHT) {
      onFrameClick([point.x / WIDTH, point.y / HEIGHT]);
    }
  }

  const calibration = layout?.calibration ?? OFFICE_CALIBRATION;
  const projectToImage = useMemo(() => createFloorProjection({ image: calibration.floor, floor: calibration.image }), [calibration]);
  const point = track?.visibility === 'visible' && projectToImage([track.x, track.z]);
  return (
    <div className="camera-video viewport">
      {url && (
        <video ref={video} src={url} muted playsInline loop preload="auto" aria-label="วิดีโอต้นฉบับ"
          data-testid="source-video"
          onLoadedMetadata={(event) => {
            const duration = event.currentTarget.duration * 1000;
            if (Number.isFinite(duration)) onDuration?.(duration);
            synchronize.current();
          }}
          onLoadedData={() => { setReady(true); synchronize.current(); }}
          onWaiting={() => setSyncing(true)}
          onSeeking={() => setSyncing(true)}
          onSeeked={(event) => {
            if (event.currentTarget.readyState >= 2) setSyncing(false);
            synchronize.current();
          }}
          onPlaying={() => setSyncing(false)}
          onError={() => setFailed(true)} />
      )}
      {ready && !failed && showOverlay && (
        <svg className={`camera-overlay${onFrameClick ? ' editing' : ''}`} viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          aria-hidden="true" data-testid="camera-overlay" onPointerUp={onFrameClick ? clickFrame : undefined}>
          {drawing ? (
            <>
              <polyline points={polygonPoints(drawing)} className="camera-overlay-drawing" />
              {drawing.map(([x, y], index) => <circle key={index} cx={x * WIDTH} cy={y * HEIGHT} r="5" className="camera-region-point" />)}
            </>
          ) : showRegion && !calibrationPoints && (
            <polygon points={polygonPoints(layout?.region ?? OFFICE_CALIBRATION.image)}
              data-testid="video-region" className="camera-overlay-area" />
          )}
          {calibrationPoints && (
            <>
              <polyline points={polygonPoints(calibrationPoints)} className="camera-overlay-drawing" />
              {calibrationPoints.map(([x, y], index) => (
                <g key={index} className="calibration-video-point" transform={`translate(${x * WIDTH} ${y * HEIGHT})`}>
                  <circle r="11" />
                  <text y="3.5">{index + 1}</text>
                </g>
              ))}
            </>
          )}
          {suggestions?.map(({ id, point: [x, y], box: [bx, by, width, height] }) => (
            <g key={id} className="camera-chair-suggestion" data-testid="video-chair-suggestion">
              {showChairBoxes && <rect x={bx * WIDTH} y={by * HEIGHT} width={width * WIDTH} height={height * HEIGHT} rx="3" />}
              <circle cx={x * WIDTH} cy={y * HEIGHT} r="8" />
              <text x={x * WIDTH} y={y * HEIGHT + 3.5}>{id.split('-').at(-1)}</text>
            </g>
          ))}
          {layout?.chairs.map(({ id, point: [x, y] }, index) => (
            <g key={id} className="camera-chair-accepted" data-testid="video-chair">
              <circle cx={x * WIDTH} cy={y * HEIGHT} r="8" />
              <text x={x * WIDTH} y={y * HEIGHT + 3.5}>{index + 1}</text>
            </g>
          ))}
          {!syncing && sceneObservations && <TrackedBoxes observations={sceneObservations} simulated={simulatedPositions} />}
          {imageDetection && !calibrationPoints && !syncing && (
            <rect className="camera-image-detection" data-testid="video-upper-body"
              x={imageDetection.x * WIDTH} y={imageDetection.y * HEIGHT}
              width={imageDetection.width * WIDTH} height={imageDetection.height * HEIGHT} rx="3" />
          )}
          {point && !calibrationPoints && !syncing && (
            <g transform={`translate(${point[0] * WIDTH} ${point[1] * HEIGHT})`} data-testid="video-track">
              <circle r="10" className="camera-overlay-outline" />
              <circle r="10" className="camera-overlay-ring" />
              <circle r="2.8" className="camera-overlay-center" />
            </g>
          )}
        </svg>
      )}
      {ready && !failed && syncing && (
        <span className="camera-sync-note" role="status">กำลังจับคู่เวลากับผัง</span>
      )}
      {(!url || failed || !ready) && (
        <div className="camera-empty">
          <VideoOff size={26} strokeWidth={1.45} aria-hidden="true" />
          <span>{failed ? 'เบราว์เซอร์เปิดวิดีโอนี้ไม่ได้' : url ? 'กำลังเปิดวิดีโอ' : empty}</span>
        </div>
      )}
    </div>
  );
}
