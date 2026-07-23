import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import type {
  AccessoryChoiceId,
  AccessorySettings,
  AppSettings,
  PetAppearanceSettings,
  PetIdentitySettings,
  UsageSnapshot,
} from "../../types";
import { AccessoriesPage } from "./AccessoriesPage";
import { patchAccessorySettings } from "./accessorySettings";
import {
  accessoryCatalog,
  getDefaultCatDetails,
  petConsoleSections,
  type PetConsoleSection,
} from "./catalog";
import { CatTypePage } from "./CatTypePage";
import { CatTypeCard } from "./CatTypePicker";
import { PetIcon } from "./icons";
import { PetAppearanceVisual } from "./PetAppearanceVisual";
import { PetNameBubble } from "./PetNameBubble";
import { countPetNameGraphemes, MAX_PET_NAME_GRAPHEMES } from "./petIdentity";
import { getMoodLabel } from "./appearanceView";
import { exportPetPreview } from "./previewExport";
import { useAppearanceController } from "./useAppearanceController";
import { PetStoryPanel } from "../pet-story/PetStoryPanel";

type AppearancePanelProps = {
  settings: AppSettings;
  setSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
  usage: UsageSnapshot;
  onSectionChange?: (section: PetConsoleSection) => void;
};

type AppearanceAccessoryCategory = "neck" | "head" | "base" | "effects";

const accessorySettingKeys: Record<AppearanceAccessoryCategory, "neckId" | "headId" | "baseId" | "effectId"> = {
  neck: "neckId",
  head: "headId",
  base: "baseId",
  effects: "effectId",
};

const summaryAccessories = [
  { id: "neck" as const, label: "Neck", featuredId: "collar" as const, featuredLabel: "Bell collar", noneIsDefault: false },
  { id: "head" as const, label: "Head", featuredId: "focus-crown" as const, featuredLabel: "Focus crown", noneIsDefault: true },
  { id: "base" as const, label: "Ground", featuredId: "desk-mat" as const, featuredLabel: "Desk mat", noneIsDefault: true },
  { id: "effects" as const, label: "Effects", featuredId: "sparkle-aura" as const, featuredLabel: "Sparkle aura", noneIsDefault: true },
];

function PetSubnav(props: { activeSection: PetConsoleSection; onSelectSection: (section: PetConsoleSection) => void }) {
  return (
    <nav className="pet-console-subnav" aria-label="Pet customization sections">
      {petConsoleSections.map((section) => (
        <button
          className={section.id === props.activeSection ? "active" : ""}
          key={section.id}
          type="button"
          aria-current={section.id === props.activeSection ? "page" : undefined}
          data-pet-section={section.id}
          onClick={() => props.onSelectSection(section.id)}
        >
          <PetIcon name={section.id} />
          {section.label}
        </button>
      ))}
    </nav>
  );
}

function PetPreview(props: {
  appearance: PetAppearanceSettings;
  usage: UsageSnapshot;
  onCapture: () => void;
}) {
  const previewAppearance = {
    ...props.appearance,
    // The console preview is a fitted identity portrait, not a second desktop
    // window. Cap its visual scale so the full ears, body, and token frame stay
    // visible even when the desktop Size control is set to 125%.
    size: Math.min(props.appearance.size, .92),
    moodBadge: { ...props.appearance.moodBadge, showMood: false },
  };
  return (
    <section className="pet-preview-card appearance-v22-preview" data-appearance-preview>
      <div className="pet-card-header">
        <strong>Pet Preview</strong>
      </div>

      <div className="pet-preview-stage">
        <PetAppearanceVisual appearance={previewAppearance} usage={props.usage} storyActionId="idle_breathe" surface="preview" />
        <span className={`appearance-preview-mood appearance-preview-mood-${props.appearance.moodId}`} data-appearance-preview-mood>
          {getMoodLabel(props.appearance.moodId)}
        </span>
        <PetNameBubble
          name={props.appearance.identity.name}
          visible={props.appearance.identity.showNameOnHover}
          surface="preview"
          reduceMotion
        />
      </div>

      <button className="appearance-capture-preview" type="button" onClick={props.onCapture} data-testid="capture-appearance-preview">
        <PetIcon name="capture" />
        <span>Capture preview</span>
      </button>
    </section>
  );
}

function RangeControl(props: {
  icon: "screen" | "opacity" | "shadow" | "bubble";
  label: string;
  value: number;
  min?: number;
  max?: number;
  disabled?: boolean;
  valueLabel?: string;
  disabledReason?: string;
  onChange: (value: number) => void;
}) {
  const min = props.min ?? 0;
  const max = props.max ?? 100;
  const progress = Math.min(100, Math.max(0, ((props.value - min) / Math.max(max - min, 1)) * 100));

  return (
    <label className="pet-range-row">
      <span className="pet-range-label">
        <PetIcon name={props.icon} />
        <strong>{props.label}</strong>
      </span>
      <span className="pet-range-control">
        <input
          type="range"
          min={min}
          max={max}
          value={props.value}
          disabled={props.disabled}
          title={props.disabled ? props.disabledReason : undefined}
          data-range-id={props.label.toLowerCase().replace(/\s+/g, "-")}
          onInput={(event) => props.onChange(Number(event.currentTarget.value))}
          style={{ "--range-progress": `${progress}%` } as CSSProperties}
          aria-label={props.label}
        />
        <small>{props.valueLabel ?? `${props.value}%`}</small>
      </span>
    </label>
  );
}

function DisplayCard(props: {
  appearance: PetAppearanceSettings;
  onPatchAppearance: (patch: Partial<PetAppearanceSettings>) => void;
}) {
  const generatedGolden = props.appearance.catTypeId === "golden-british";

  return (
    <section className="pet-card display-card" data-appearance-display>
      <div className="pet-card-header">
        <strong>Display</strong>
      </div>
      <div className="display-range-list">
        <RangeControl
          icon="screen"
          label="Size"
          min={75}
          max={125}
          value={Math.round(props.appearance.size * 100)}
          onChange={(value) => props.onPatchAppearance({ size: value / 100 })}
        />
        <RangeControl
          icon="opacity"
          label="Opacity"
          min={45}
          max={100}
          value={Math.round(props.appearance.opacity * 100)}
          onChange={(value) => props.onPatchAppearance({ opacity: value / 100 })}
        />
        <RangeControl
          icon="shadow"
          label="Shadow"
          value={Math.round(props.appearance.shadow * 100)}
          onChange={(value) => props.onPatchAppearance({ shadow: value / 100 })}
        />
        <RangeControl
          icon="bubble"
          label="Token text scale"
          min={70}
          max={125}
          value={Math.round(props.appearance.bubbleScale * 100)}
          disabled={!generatedGolden}
          valueLabel={generatedGolden ? undefined : "Unavailable"}
          disabledReason={!generatedGolden ? "No approved token slot is available for this static fallback image." : undefined}
          onChange={(value) => props.onPatchAppearance({ bubbleScale: value / 100 })}
        />
      </div>
    </section>
  );
}

function PetIdentityCard(props: {
  identity: PetIdentitySettings;
  onPatchIdentity: (patch: Partial<PetIdentitySettings>) => void;
}) {
  const [draftName, setDraftName] = useState(props.identity.name);
  const nameLength = countPetNameGraphemes(draftName);
  const invalid = nameLength > MAX_PET_NAME_GRAPHEMES;

  useEffect(() => {
    setDraftName(props.identity.name);
  }, [props.identity.name]);

  const updateName = (value: string) => {
    setDraftName(value);
    if (countPetNameGraphemes(value) <= MAX_PET_NAME_GRAPHEMES) {
      props.onPatchIdentity({ name: value });
    }
  };

  return (
    <section className="pet-card pet-identity-card" data-appearance-identity>
      <div className="pet-card-header">
        <div>
          <strong>Pet Identity</strong>
          <span>Make your companion yours.</span>
        </div>
      </div>
      <label className="pet-identity-name-label" htmlFor="pet-identity-name">
        <strong>Pet name</strong>
        <span className={`pet-identity-name-field ${invalid ? "is-invalid" : ""}`}>
          <input
            id="pet-identity-name"
            value={draftName}
            type="text"
            spellCheck={false}
            autoComplete="off"
            aria-invalid={invalid}
            aria-describedby={invalid ? "pet-identity-name-error" : undefined}
            data-testid="pet-identity-name"
            onChange={(event) => updateName(event.currentTarget.value)}
          />
          <PetIcon name="edit" />
        </span>
        {invalid ? <small id="pet-identity-name-error">最多10个字符</small> : null}
      </label>
      <button
        className="pet-identity-hover-toggle"
        type="button"
        aria-pressed={props.identity.showNameOnHover}
        data-testid="show-name-on-hover"
        onClick={() => props.onPatchIdentity({ showNameOnHover: !props.identity.showNameOnHover })}
      >
        <span>
          <strong>Show name on hover</strong>
          <small>Name appears in a thought bubble on hover</small>
        </span>
        <i className={`pet-identity-switch ${props.identity.showNameOnHover ? "on" : ""}`} aria-hidden="true" />
      </button>
    </section>
  );
}

function NoneAccessoryMark() {
  return <span className="appearance-summary-none" aria-hidden="true" />;
}

function AppearanceAccessoryGroup(props: {
  category: AppearanceAccessoryCategory;
  label: string;
  featuredId: AccessoryChoiceId;
  featuredLabel: string;
  noneIsDefault: boolean;
  selectedId: AccessoryChoiceId;
  onSelect: (choiceId: AccessoryChoiceId) => void;
}) {
  const accessory = accessoryCatalog.find((item) => item.id === props.featuredId);
  const featuredSelected = props.selectedId === props.featuredId;
  const noneSelected = props.selectedId === "none";

  return (
    <div className="appearance-accessory-group" data-accessory-category={props.category}>
      <strong className="appearance-accessory-group-title">{props.label}</strong>
      <div className="appearance-accessory-pair">
        <button
          className={`appearance-summary-choice ${featuredSelected ? "selected" : ""}`}
          type="button"
          data-summary-choice="default"
          data-accessory-id={props.featuredId}
          aria-pressed={featuredSelected}
          onClick={() => props.onSelect(props.featuredId)}
        >
          {!props.noneIsDefault ? <span className="appearance-default-chip">Default</span> : null}
          <span className="appearance-summary-check" aria-hidden="true" />
          {accessory ? <img src={accessory.image} alt="" draggable={false} aria-hidden="true" /> : null}
          <strong>{props.featuredLabel}</strong>
        </button>
        <button
          className={`appearance-summary-choice ${noneSelected ? "selected" : ""}`}
          type="button"
          data-summary-choice="none"
          data-accessory-id="none"
          aria-pressed={noneSelected}
          onClick={() => props.onSelect("none")}
        >
          {props.noneIsDefault ? <span className="appearance-default-chip">Default</span> : null}
          <span className="appearance-summary-check" aria-hidden="true" />
          <NoneAccessoryMark />
          <strong>None</strong>
        </button>
      </div>
    </div>
  );
}

function AccessoriesSummary(props: {
  appearance: PetAppearanceSettings;
  onSelectAccessory: (category: AppearanceAccessoryCategory, choiceId: AccessoryChoiceId) => void;
  onViewAll: () => void;
}) {
  return (
    <section className="pet-card appearance-accessories-summary" data-appearance-accessories>
      <div className="appearance-accessories-heading">
        <div>
          <strong>Accessories</strong>
          <span>Choose one per category; combine different categories.</span>
        </div>
        <button type="button" onClick={props.onViewAll} data-testid="open-accessories">
          View all
        </button>
      </div>
      <div className="appearance-accessories-groups">
        {summaryAccessories.map((summary) => {
          const settingKey = accessorySettingKeys[summary.id];
          return (
            <AppearanceAccessoryGroup
              key={summary.id}
              category={summary.id}
              label={summary.label}
              featuredId={summary.featuredId}
              featuredLabel={summary.featuredLabel}
              noneIsDefault={summary.noneIsDefault}
              selectedId={props.appearance.accessorySettings[settingKey]}
              onSelect={(choiceId) => props.onSelectAccessory(summary.id, choiceId)}
            />
          );
        })}
      </div>
    </section>
  );
}

export function AppearancePanel(props: AppearancePanelProps) {
  const [activeAppearancePage, setActiveAppearancePage] = useState<"appearance" | "cat-type" | "accessories">("appearance");
  const [activeSection, setActiveSection] = useState<PetConsoleSection>("appearance");
  const { appearance, canUndo, patchAppearance, resetAppearance, undoAppearance } = useAppearanceController(props.settings, props.setSetting);

  const selectCatType = (catTypeId: PetAppearanceSettings["catTypeId"]) => {
    const golden = catTypeId === "golden-british";
    patchAppearance({
      accessoryDefaultsVersion: 2,
      catTypeId,
      tokenBubbleId: golden ? "pill" : "hidden",
      catDetails: getDefaultCatDetails(catTypeId),
      accessoryIds: golden ? ["collar"] : [],
      accessorySettings: {
        ...appearance.accessorySettings,
        tokenFrameId: golden ? "embedded" : "hidden",
        neckId: golden ? "collar" : "none",
        headId: "none",
        baseId: "none",
        effectId: "none",
      },
    });
  };

  const selectConsoleSection = (section: PetConsoleSection) => {
    setActiveSection(section);
    props.onSectionChange?.(section);
    if (section !== "appearance") setActiveAppearancePage("appearance");
  };

  const selectAccessory = (category: AppearanceAccessoryCategory, choiceId: AccessoryChoiceId) => {
    const settingKey = accessorySettingKeys[category];
    patchAppearance(patchAccessorySettings(appearance, { [settingKey]: choiceId } as Partial<AccessorySettings>));
  };

  if (activeAppearancePage === "cat-type") {
    return (
      <div className="pet-appearance-panel pet-cat-type-panel" data-pet-page="cat-type" data-testid="cat-type-page-shell">
        <PetSubnav activeSection="appearance" onSelectSection={selectConsoleSection} />
        <CatTypePage
          appearance={appearance}
          usage={props.usage}
          canUndo={canUndo}
          onBack={() => setActiveAppearancePage("appearance")}
          onPatchAppearance={patchAppearance}
          onUndo={undoAppearance}
        />
      </div>
    );
  }

  if (activeAppearancePage === "accessories") {
    return (
      <div className="pet-appearance-panel pet-accessories-panel" data-pet-page="accessories" data-testid="accessories-page-shell">
        <PetSubnav activeSection="appearance" onSelectSection={selectConsoleSection} />
        <AccessoriesPage
          appearance={appearance}
          usage={props.usage}
          onBack={() => setActiveAppearancePage("appearance")}
          onPatchAppearance={patchAppearance}
        />
      </div>
    );
  }

  return (
    <div
      className={`pet-appearance-panel appearance-v22 ${activeSection !== "appearance" ? "pet-story-root" : ""}`}
      data-pet-page={activeSection}
      data-testid={`pet-page-${activeSection}`}
    >
      <PetSubnav activeSection={activeSection} onSelectSection={selectConsoleSection} />
      {activeSection !== "appearance" ? (
        <PetStoryPanel
          section={activeSection}
          settings={props.settings}
          usage={props.usage}
          setStory={(petStory) => props.setSetting("petStory", petStory)}
          setAppearance={patchAppearance}
        />
      ) : (
        <>
          <CatTypeCard
            selectedCat={appearance.catTypeId}
            onSelectCat={selectCatType}
            onViewAll={() => setActiveAppearancePage("cat-type")}
          />
          <div className="appearance-v22-workbench">
            <PetPreview
              appearance={appearance}
              usage={props.usage}
              onCapture={() => void exportPetPreview(appearance, props.usage)}
            />
            <div className="appearance-v22-side">
              <DisplayCard appearance={appearance} onPatchAppearance={patchAppearance} />
              <PetIdentityCard
                identity={appearance.identity}
                onPatchIdentity={(identityPatch) => patchAppearance({
                  identity: { ...appearance.identity, ...identityPatch },
                })}
              />
            </div>
          </div>
          <AccessoriesSummary
            appearance={appearance}
            onSelectAccessory={selectAccessory}
            onViewAll={() => setActiveAppearancePage("accessories")}
          />
          <footer className="pet-appearance-footer" data-appearance-footer>
            <span>
              <i className="appearance-footer-dot" aria-hidden="true" />
              Changes apply instantly.
            </span>
            <button type="button" onClick={resetAppearance} data-testid="reset-appearance">
              <PetIcon name="reset" />
              Reset appearance
            </button>
          </footer>
        </>
      )}
    </div>
  );
}
