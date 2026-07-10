import type { CatTypeId } from "../../types";
import { featuredCatTypes, type CatTypeOption } from "./catalog";

type CatTypeGridProps = {
  cats: CatTypeOption[];
  selectedCat: CatTypeId;
  onSelectCat: (catId: CatTypeId) => void;
  className?: string;
};

export function CatTypeGrid(props: CatTypeGridProps) {
  return (
    <div className={`cat-type-grid ${props.className ?? ""}`}>
      {props.cats.map((cat) => (
        <button
          className={`cat-type-option ${props.selectedCat === cat.id ? "selected" : ""}`}
          key={cat.id}
          type="button"
          data-cat-id={cat.id}
          onClick={() => props.onSelectCat(cat.id)}
        >
          <span className="cat-type-image-wrap">
            <img src={cat.image} alt="" draggable={false} aria-hidden="true" />
            {props.selectedCat === cat.id ? <span className="cat-selected-check" aria-hidden="true" /> : null}
          </span>
          <strong>{cat.label}</strong>
          <em className={cat.id === "golden-british" ? "actor-ready" : "fallback-image"}>
            {cat.id === "golden-british" ? "Actor-ready" : "Fallback image"}
          </em>
        </button>
      ))}
    </div>
  );
}

export function CatTypeCard(props: {
  selectedCat: CatTypeId;
  onSelectCat: (catId: CatTypeId) => void;
  onViewAll: () => void;
}) {
  return (
    <section className="pet-card cat-type-card">
      <div className="pet-card-header">
        <div>
          <strong>Cat Type</strong>
          <span>Cat type changes appearance only.</span>
        </div>
        <button className="pet-section-action" type="button" aria-label="View all cat types" onClick={props.onViewAll} data-testid="open-cat-type">
          <span>View all</span>
          <span aria-hidden="true">-&gt;</span>
        </button>
      </div>
      <span className="actor-ready-inline"><i />Golden British is actor-ready</span>
      <CatTypeGrid cats={featuredCatTypes} selectedCat={props.selectedCat} onSelectCat={props.onSelectCat} />
    </section>
  );
}
