import { Component, type ReactNode } from 'react';

export class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }

  render() {
    return this.state.failed
      ? <p className="canvas-fallback">เปิดผัง 3D ไม่ได้ ลองใช้เบราว์เซอร์ที่รองรับ WebGL</p>
      : this.props.children;
  }
}
