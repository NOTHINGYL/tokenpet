import type { CSSProperties } from "react";
import type {
  AccessoryChoiceId,
  AccessoryColorId,
  AccessoryPosition,
  AccessorySettings,
  MoodLookId,
  PetAppearanceSettings,
  TokenFrameId,
  UsageSnapshot,
} from "../../types";
import { defaultAccessorySettings } from "./appearanceState";
import { patchAccessorySettings, type AccessorySettingsPatch } from "./accessorySettings";
import { accessoryColorOptions, accessoryPositionOptions, accessorySections, moodLooks, tokenFrameOptions } from "./catalog";
import { PetAppearanceVisual } from "./PetAppearanceVisual";
import { PetIcon } from "./icons";

type AccessoriesPageProps = {
  appearance: PetAppearanceSettings;
  usage: UsageSnapshot;
  canUndo: boolean;
  onBack: () => void;
  onPatchAppearance: (patch: Partial<PetAppearanceSettings>) => void;
  onUndo: () => void;
};

const categorySettingKeys = {
  neck: "neckId",
  head: "headId",
  base: "baseId",
  effects: "effectId",
} as const;

function AccessoriesToolbar(props: {
  canUndo: boolean;
  onBack: () => void;
  onUndo: () => void;
  onReset: () => void;
}) {
  return (
    <div className="accessories-page-toolbar">
      <div className="accessories-breadcrumb">
        <button className="cat-type-back" type="button" onClick={props.onBack}>
          <PetIcon name="back" />
          <span>Appearance</span>
        </button>
        <span aria-hidden="true">/</span>
        <strong>Accessories</strong>
      </div>

      <div className="cat-type-toolbar-actions">
        <span className="cat-type-save-state">
          <span aria-hidden="true" />
          Changes apply instantly
        </span>
        <button type="button" onClick={props.onUndo} disabled={!props.canUndo}>
          <PetIcon name="undo" />
          Undo
        </button>
        <button type="button" onClick={props.onReset}>
          <PetIcon name="reset" />
          Reset accessories
        </button>
      </div>
    </div>
  );
}

function TokenFramePreview(props: { frameId: TokenFrameId }) {
  if (props.frameId === "hidden") {
    return (
      <span className="token-frame-preview hidden">
        <PetIcon name="hidden" />
      </span>
    );
  }

  return (
    <span className={`token-frame-preview ${props.frameId}`}>
      {props.frameId === "embedded" ? <span className="token-frame-paws" aria-hidden="true" /> : null}
      {props.frameId === "cost" ? <small>$ +</small> : null}
      <strong>61.5M</strong>
    </span>
  );
}

function TokenFrameSection(props: {
  selectedFrame: TokenFrameId;
  onSelectFrame: (frameId: TokenFrameId) => void;
}) {
  return (
    <section className="pet-card accessory-section-card token-frame-section">
      <div className="accessory-section-heading">
        <strong>Token Frame</strong>
        <span>(Pick one)</span>
      </div>
      <div className="accessory-frame-grid">
        {tokenFrameOptions.map((frame) => (
          <button
            className={`accessories-choice-card token-frame-choice ${props.selectedFrame === frame.id ? "selected" : ""}`}
            key={frame.id}
            type="button"
            data-token-frame-id={frame.id}
            onClick={() => props.onSelectFrame(frame.id)}
          >
            <span className="accessory-card-radio" aria-hidden="true" />
            <TokenFramePreview frameId={frame.id} />
            <strong>{frame.label}</strong>
            <small>{frame.detail}</small>
          </button>
        ))}
      </div>
    </section>
  );
}

function AccessoryChoiceCard(props: {
  option: { id: AccessoryChoiceId; label: string; image?: string; locked?: boolean };
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      className={`accessories-choice-card ${props.selected ? "selected" : ""} ${props.option.locked ? "locked" : ""}`}
      type="button"
      data-accessory-choice-id={props.option.id}
      onClick={props.onSelect}
      disabled={Boolean(props.option.locked)}
    >
      <span className="accessory-card-radio" aria-hidden="true" />
      {props.option.image ? (
        <img src={props.option.image} alt="" draggable={false} aria-hidden="true" />
      ) : (
        <span className="accessory-none-mark" aria-hidden="true" />
      )}
      <strong>{props.option.label}</strong>
    </button>
  );
}

function AccessoryCategorySection(props: {
  section: (typeof accessorySections)[number];
  selectedId: AccessoryChoiceId;
  onSelect: (choiceId: AccessoryChoiceId) => void;
}) {
  return (
    <section className="pet-card accessory-section-card">
      <div className="accessory-section-heading">
        <strong>{props.section.label}</strong>
        <span>({props.section.detail})</span>
      </div>
      <div className="accessory-choice-grid">
        {props.section.options.map((option) => (
          <AccessoryChoiceCard
            key={option.id}
            option={option}
            selected={props.selectedId === option.id}
            onSelect={() => {
              if (!option.locked) props.onSelect(option.id);
            }}
          />
        ))}
      </div>
    </section>
  );
}

function AccessoriesDetails(props: {
  settings: AccessorySettings;
  onPatchSettings: (patch: AccessorySettingsPatch) => void;
}) {
  const scale = Math.round(props.settings.scale * 100);

  return (
    <section className="pet-card accessory-details-card">
      <div className="pet-card-header">
        <div>
          <strong>Accessory details</strong>
        </div>
        <PetIcon name="info" />
      </div>

      <div className="accessory-detail-group">
        <strong>Color</strong>
        <div className="accessory-color-row">
          {accessoryColorOptions.map((color) => (
            <button
              className={`accessory-color-swatch ${color.className} ${props.settings.colorId === color.id ? "selected" : ""}`}
              key={color.id}
              type="button"
              aria-label={`${color.label} accessories`}
              onClick={() => props.onPatchSettings({ colorId: color.id as AccessoryColorId })}
            />
          ))}
        </div>
      </div>

      <label className="accessory-detail-group">
        <span className="accessory-detail-row">
          <strong>Scale</strong>
          <small>{scale}%</small>
        </span>
        <input
          type="range"
          min={70}
          max={135}
          value={scale}
          onInput={(event) => props.onPatchSettings({ scale: Number(event.currentTarget.value) / 100 })}
          style={{ "--range-progress": `${((scale - 70) / 65) * 100}%` } as CSSProperties}
          aria-label="Accessory scale"
        />
      </label>

      <div className="accessory-detail-group">
        <strong>Position</strong>
        <div className="accessory-segmented">
          {accessoryPositionOptions.map((position) => (
            <button
              className={props.settings.position === position.id ? "selected" : ""}
              key={position.id}
              type="button"
              onClick={() => props.onPatchSettings({ position: position.id as AccessoryPosition })}
            >
              {position.label}
            </button>
          ))}
        </div>
      </div>

      <button
        className="accessory-toggle-row"
        type="button"
        onClick={() => props.onPatchSettings({ textOnlyFrame: !props.settings.textOnlyFrame })}
      >
        <span>Text only for built-in frame</span>
        <span className={`pet-switch ${props.settings.textOnlyFrame ? "on" : ""}`} aria-hidden="true" />
      </button>

      <div className="accessory-detail-group mood-visibility-list">
        <strong>Show with mood</strong>
        {moodLooks.map((mood) => (
          <button
            key={mood.id}
            type="button"
            onClick={() =>
              props.onPatchSettings({
                moodVisibility: {
                  [mood.id]: !props.settings.moodVisibility[mood.id as MoodLookId],
                },
              })
            }
          >
            <span className={`accessory-check ${props.settings.moodVisibility[mood.id] ? "checked" : ""}`} aria-hidden="true" />
            <span className={`mood-dot ${mood.dotClassName}`} />
            {mood.label}
          </button>
        ))}
      </div>
    </section>
  );
}

export function AccessoriesPage(props: AccessoriesPageProps) {
  const patchSettings = (patch: AccessorySettingsPatch) => {
    props.onPatchAppearance(patchAccessorySettings(props.appearance, patch));
  };

  const resetAccessories = () => {
    props.onPatchAppearance(patchAccessorySettings(props.appearance, defaultAccessorySettings));
  };

  return (
    <div className="accessories-page">
      <AccessoriesToolbar canUndo={props.canUndo} onBack={props.onBack} onUndo={props.onUndo} onReset={resetAccessories} />

      <div className="accessories-page-heading">
        <h3>Accessories</h3>
        <p>Pick one per category; combine different categories.</p>
      </div>

      <div className="accessories-page-layout">
        <aside className="accessories-preview-column">
          <section className="pet-card accessories-live-preview-card">
            <div className="pet-card-header">
              <div>
                <strong>Live Preview</strong>
              </div>
              <PetIcon name="info" />
            </div>
            <div className="accessories-live-preview-stage">
              <PetAppearanceVisual appearance={props.appearance} usage={props.usage} surface="preview" />
            </div>
            <span className="accessory-preview-chip">
              Token frame: <strong>{tokenFrameOptions.find((option) => option.id === props.appearance.accessorySettings.tokenFrameId)?.label}</strong>
            </span>
          </section>
          <AccessoriesDetails settings={props.appearance.accessorySettings} onPatchSettings={patchSettings} />
        </aside>

        <div className="accessories-library-column">
          <TokenFrameSection selectedFrame={props.appearance.accessorySettings.tokenFrameId} onSelectFrame={(tokenFrameId) => patchSettings({ tokenFrameId })} />
          {accessorySections.map((section) => {
            const settingKey = categorySettingKeys[section.id];
            return (
              <AccessoryCategorySection
                key={section.id}
                section={section}
                selectedId={props.appearance.accessorySettings[settingKey]}
                onSelect={(choiceId) => patchSettings({ [settingKey]: choiceId } as Partial<AccessorySettings>)}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
