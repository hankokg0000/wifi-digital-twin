/** A fixed illustration of motion, displayed beside the verdict rather than on the floor plan. */
export function MotionPreview({ active }: { active: boolean }) {
  return (
    <div className="motion-preview" data-active={active} aria-hidden={!active}>
      <div className="motion-figure" aria-hidden="true">
        <i className="motion-limb motion-arm motion-far" />
        <i className="motion-limb motion-leg motion-far" />
        <i className="motion-head" />
        <i className="motion-torso" />
        <i className="motion-limb motion-leg" />
        <i className="motion-limb motion-arm" />
      </div>
      <span>ภาพประกอบจำลอง</span>
    </div>
  );
}
