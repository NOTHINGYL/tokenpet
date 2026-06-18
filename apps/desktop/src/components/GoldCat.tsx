export function GoldCat() {
  return (
    <div className="cat" aria-hidden="true">
      <div className="cat-glow" />
      <div className="cat-tail" />
      <div className="cat-body">
        <div className="cat-ear cat-ear-left" />
        <div className="cat-ear cat-ear-right" />
        <div className="cat-face">
          <span className="cat-eye" />
          <span className="cat-eye" />
        </div>
        <div className="cat-muzzle">
          <span />
        </div>
      </div>
      <div className="cat-paw cat-paw-left" />
      <div className="cat-paw cat-paw-right" />
    </div>
  );
}
