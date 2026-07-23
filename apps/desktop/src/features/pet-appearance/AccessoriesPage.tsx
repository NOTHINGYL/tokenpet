import type { AccessoryChoiceId, AccessorySettings, CatTypeId, PetAppearanceSettings, UsageSnapshot } from "../../types";
import { defaultAccessorySettings } from "./appearanceState";
import { patchAccessorySettings, type AccessorySettingsPatch } from "./accessorySettings";
import { accessorySections } from "./catalog";
import { PetAppearanceVisual } from "./PetAppearanceVisual";
import { PetIcon } from "./icons";

type AccessoriesPageProps = {
  appearance: PetAppearanceSettings;
  usage: UsageSnapshot;
  onBack: () => void;
  onPatchAppearance: (patch: Partial<PetAppearanceSettings>) => void;
};

const categorySettingKeys = {
  neck: "neckId",
  head: "headId",
  base: "baseId",
  effects: "effectId",
} as const;

type Capability = {
  ready: boolean;
  label?: string;
  title: string;
};

function getCapability(category: keyof typeof categorySettingKeys, choiceId: AccessoryChoiceId, actorId: CatTypeId): Capability {
  if (choiceId === "none") return { ready: true, title: `Remove the selected ${category === "base" ? "ground" : category} accessory.` };
  if (category === "neck") {
    if (choiceId === "collar" && actorId === "golden-british") return { ready: true, label: "Golden British", title: "Authored with the Golden British actor bundle." };
    return { ready: false, label: "Planned", title: "Planned until a complete wearable animation bundle is available." };
  }
  if (category === "head") {
    if (choiceId === "halo") return { ready: true, label: "All cats", title: "Universal non-contact head-slot overlay." };
    if (choiceId === "focus-crown" && actorId === "golden-british") return { ready: true, label: "Golden British", title: "Validated for the Golden British actor." };
    return { ready: false, label: "Planned", title: "Planned until a complete wearable animation bundle is available." };
  }
  return { ready: true, label: "All cats", title: category === "base" ? "Universal flat ground underlay." : "Universal ambient particle effect." };
}

function AccessoriesToolbar(props: { onBack: () => void; onReset: () => void }) {
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
        <span className="cat-type-save-state"><span aria-hidden="true" />Changes apply instantly.</span>
        <button type="button" onClick={props.onReset} data-testid="reset-accessories">
          <PetIcon name="reset" />
          Reset accessories
        </button>
      </div>
    </div>
  );
}

function AccessoryChoiceCard(props: {
  category: keyof typeof categorySettingKeys;
  actorId: CatTypeId;
  option: (typeof accessorySections)[number]["options"][number];
  selected: boolean;
  onSelect: () => void;
}) {
  const capability = getCapability(props.category, props.option.id, props.actorId);
  return (
    <button
      className={`accessories-choice-card ${props.selected ? "selected" : ""} ${capability.ready ? "" : "planned"}`.trim()}
      type="button"
      data-accessory-choice-id={props.option.id}
      aria-pressed={props.selected}
      disabled={!capability.ready}
      title={capability.title}
      onClick={props.onSelect}
    >
      <span className="accessory-card-radio" aria-hidden="true" />
      {props.option.image ? <img src={props.option.image} alt="" draggable={false} aria-hidden="true" /> : <span className="accessory-none-mark" aria-hidden="true" />}
      <strong>{props.option.label}</strong>
      {capability.label ? <small className={`accessory-capability-label ${capability.ready ? "ready" : "planned"}`}>{capability.label}</small> : null}
    </button>
  );
}

function AccessoryCategorySection(props: {
  actorId: CatTypeId;
  section: (typeof accessorySections)[number];
  selectedId: AccessoryChoiceId;
  onSelect: (choiceId: AccessoryChoiceId) => void;
}) {
  return (
    <section className="pet-card accessory-section-card" data-accessory-category={props.section.id}>
      <div className="accessory-section-heading">
        <strong>{props.section.label}</strong>
        <span>{props.section.detail}</span>
      </div>
      <div className="accessory-choice-grid">
        {props.section.options.map((option) => (
          <AccessoryChoiceCard
            key={option.id}
            category={props.section.id}
            actorId={props.actorId}
            option={option}
            selected={props.selectedId === option.id}
            onSelect={() => props.onSelect(option.id)}
          />
        ))}
      </div>
    </section>
  );
}

export function AccessoriesPage(props: AccessoriesPageProps) {
  const patchSettings = (patch: AccessorySettingsPatch) => props.onPatchAppearance(patchAccessorySettings(props.appearance, patch));
  const resetAccessories = () => props.onPatchAppearance(patchAccessorySettings(props.appearance, defaultAccessorySettings));
  const actorPreviewAppearance = { ...props.appearance, moodId: "focused" as const, moodBadge: { ...props.appearance.moodBadge, showMood: false } };
  const catLabel = props.appearance.catTypeId === "golden-british"
    ? "Golden British"
    : props.appearance.catTypeId.split("-").map((word) => word[0]?.toUpperCase() + word.slice(1)).join(" ");

  return (
    <div className="accessories-page accessories-v28" data-testid="accessories-page">
      <AccessoriesToolbar onBack={props.onBack} onReset={resetAccessories} />
      <div className="accessories-page-heading">
        <h3>Accessories</h3>
        <p>Pick one per category; combine different categories.</p>
      </div>
      <div className="accessories-page-layout">
        <aside className="accessories-preview-column">
          <section className="pet-card accessories-live-preview-card">
            <div className="pet-card-header"><strong>Live Preview</strong></div>
            <div className="accessories-live-preview-stage">
              <span className="accessories-preview-mood">focused</span>
              <PetAppearanceVisual appearance={actorPreviewAppearance} usage={props.usage} storyActionId="idle_breathe" surface="preview" />
            </div>
            <div className="accessories-compatibility-row">
              <strong>{catLabel}</strong>
              <span><i aria-hidden="true">✓</i> All selected items compatible</span>
            </div>
          </section>
        </aside>
        <div className="accessories-library-column">
          {accessorySections.map((section) => {
            const settingKey = categorySettingKeys[section.id];
            return (
              <AccessoryCategorySection
                key={section.id}
                actorId={props.appearance.catTypeId}
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
