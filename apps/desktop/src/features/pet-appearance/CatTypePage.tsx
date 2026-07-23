import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import type { CatBreedDetails, CatEyeColor, CatTypeId, PetAppearanceSettings, UsageSnapshot } from "../../types";
import { catEyeColors, catTypeFilters, catTypes, getDefaultCatDetails, type CatTypeFilter } from "./catalog";
import { CatTypeGrid } from "./CatTypePicker";
import { PetAppearanceVisual } from "./PetAppearanceVisual";
import { PetIcon } from "./icons";

type CatTypePageProps = {
  appearance: PetAppearanceSettings;
  usage: UsageSnapshot;
  canUndo: boolean;
  onBack: () => void;
  onPatchAppearance: (patch: Partial<PetAppearanceSettings>) => void;
  onUndo: () => void;
};

function filterCats(filterId: CatTypeFilter) {
  if (filterId === "all") return catTypes;
  if (filterId === "short") return catTypes.filter((cat) => cat.hairLength === "short");
  if (filterId === "long") return catTypes.filter((cat) => cat.hairLength === "long");
  if (filterId === "classic") return catTypes.filter((cat) => cat.classic);
  return catTypes.filter((cat) => cat.rare);
}

function patternLabel(value: number) {
  if (value >= 72) return "High";
  if (value <= 34) return "Low";
  return "Medium";
}

function CatDetailRange(props: {
  label: string;
  value: number;
  minLabel: string;
  maxLabel: string;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  return (
    <label className="cat-detail-range">
      <span className="cat-detail-range-header">
        <strong>{props.label}</strong>
      </span>
      <span className="cat-detail-range-control">
        <small>{props.minLabel}</small>
        <input
          type="range"
          min={0}
          max={100}
          value={props.value}
          onInput={(event) => props.onChange(Number(event.currentTarget.value))}
          style={{ "--range-progress": `${props.value}%` } as CSSProperties}
          aria-label={props.label}
          disabled={props.disabled}
        />
        <small>{props.maxLabel}</small>
      </span>
    </label>
  );
}

function PreviewColumn(props: {
  appearance: PetAppearanceSettings;
  usage: UsageSnapshot;
  onPatchDetails: (patch: Partial<CatBreedDetails>) => void;
}) {
  const actorReady = props.appearance.catTypeId === "golden-british";
  const detailsLocked = true;
  const actorPreviewAppearance = { ...props.appearance, moodBadge: { ...props.appearance.moodBadge, showMood: false } };
  return (
    <aside className="cat-type-preview-column">
      <section className="pet-card cat-type-preview-card">
        <div className="pet-card-header">
          <div>
            <strong>Preview</strong>
          </div>
          <PetIcon name="info" />
        </div>
        <div className="cat-type-page-preview-stage">
          <PetAppearanceVisual appearance={actorPreviewAppearance} usage={props.usage} surface="preview" />
        </div>
      </section>

      <section className="pet-card cat-breed-details-card">
        <div className="pet-card-header">
          <div>
            <strong>Breed details</strong>
          </div>
          <PetIcon name="info" />
        </div>
        <div className="cat-breed-detail-list">
          <CatDetailRange
            label="Fur length"
            minLabel="Short"
            maxLabel="Long"
            value={props.appearance.catDetails.furLength}
            onChange={(furLength) => props.onPatchDetails({ furLength })}
            disabled={detailsLocked}
          />

          <div className="cat-eye-color-field">
            <strong>Eye color</strong>
            <div className="cat-eye-color-options">
              {catEyeColors.map((eyeColor) => (
                <button
                  className={`cat-eye-swatch ${eyeColor.className} ${
                    props.appearance.catDetails.eyeColor === eyeColor.id ? "selected" : ""
                  }`}
                  key={eyeColor.id}
                  type="button"
                  aria-label={`${eyeColor.label} eyes`}
                  disabled={detailsLocked}
                  onClick={() => props.onPatchDetails({ eyeColor: eyeColor.id as CatEyeColor })}
                />
              ))}
            </div>
          </div>

          <CatDetailRange
            label="Pattern intensity"
            minLabel="Soft"
            maxLabel={patternLabel(props.appearance.catDetails.patternIntensity)}
            value={props.appearance.catDetails.patternIntensity}
            onChange={(patternIntensity) => props.onPatchDetails({ patternIntensity })}
            disabled={detailsLocked}
          />

          <p className="cat-details-locked-note">
            {actorReady ? "Actor appearance is baked" : "Approved static fallback image"}
            <span>{actorReady ? "Fur, eyes, and markings stay faithful to the approved generated actor bundle." : "Fur, eye, and pattern variants require a generated actor bundle; the approved fallback image is shown unchanged."}</span>
          </p>
        </div>
      </section>
    </aside>
  );
}

export function CatTypePage(props: CatTypePageProps) {
  const [filterId, setFilterId] = useState<CatTypeFilter>("all");
  const visibleCats = useMemo(() => filterCats(filterId), [filterId]);

  const patchDetails = (patch: Partial<CatBreedDetails>) => {
    props.onPatchAppearance({
      catDetails: {
        ...props.appearance.catDetails,
        ...patch,
      },
    });
  };

  const selectCat = (catTypeId: CatTypeId) => {
    const golden = catTypeId === "golden-british";
    props.onPatchAppearance({
      accessoryDefaultsVersion: 2,
      catTypeId,
      tokenBubbleId: golden ? "pill" : "hidden",
      catDetails: getDefaultCatDetails(catTypeId),
      accessoryIds: golden ? ["collar"] : [],
      accessorySettings: {
        ...props.appearance.accessorySettings,
        tokenFrameId: golden ? "embedded" : "hidden",
        neckId: golden ? "collar" : "none",
        headId: "none",
        baseId: "none",
        effectId: "none",
      },
    });
  };

  const resetCatType = () => {
    props.onPatchAppearance({
      accessoryDefaultsVersion: 2,
      catTypeId: "golden-british",
      tokenBubbleId: "pill",
      catDetails: getDefaultCatDetails("golden-british"),
      accessoryIds: ["collar"],
      accessorySettings: {
        ...props.appearance.accessorySettings,
        tokenFrameId: "embedded",
        neckId: "collar",
        headId: "none",
        baseId: "none",
        effectId: "none",
      },
    });
  };

  return (
    <div className="cat-type-page" data-testid="cat-type-page">
      <div className="cat-type-page-toolbar">
        <button className="cat-type-back" type="button" onClick={props.onBack}>
          <PetIcon name="back" />
          <span>Appearance</span>
        </button>
        <span aria-hidden="true">/</span>
        <strong>Cat Type</strong>

        <div className="cat-type-toolbar-actions">
          <span className="cat-type-save-state">
            <span aria-hidden="true" />
            Changes apply instantly
          </span>
          <button type="button" onClick={props.onUndo} disabled={!props.canUndo}>
            <PetIcon name="undo" />
            Undo
          </button>
          <button type="button" onClick={resetCatType}>
            <PetIcon name="reset" />
            Reset cat type
          </button>
        </div>
      </div>

      <div className="cat-type-page-layout">
        <PreviewColumn appearance={props.appearance} usage={props.usage} onPatchDetails={patchDetails} />

        <section className="pet-card cat-type-library-card">
          <div className="cat-type-filter-tabs" aria-label="Cat type filters">
            {catTypeFilters.map((filter) => (
              <button
                className={filterId === filter.id ? "selected" : ""}
                key={filter.id}
                type="button"
                onClick={() => setFilterId(filter.id)}
              >
                {filter.label}
              </button>
            ))}
          </div>
          <CatTypeGrid className="cat-type-library-grid" cats={visibleCats} selectedCat={props.appearance.catTypeId} onSelectCat={selectCat} />
        </section>
      </div>
    </div>
  );
}
