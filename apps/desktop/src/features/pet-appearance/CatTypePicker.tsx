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
          <span>Choose your companion's breed.</span>
        </div>
        <button className="pet-section-action" type="button" aria-label="View all cat types" onClick={props.onViewAll}>
          <span>View all</span>
          <span aria-hidden="true">-&gt;</span>
        </button>
      </div>
      <CatTypeGrid cats={featuredCatTypes} selectedCat={props.selectedCat} onSelectCat={props.onSelectCat} />
    </section>
  );
}
