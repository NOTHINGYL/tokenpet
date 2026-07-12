import { useState } from "react";
import type { CSSProperties } from "react";
import type {
  AccessoryId,
  AppSettings,
  MoodLookId,
  PetAppearanceSettings,
  PetThemeId,
  TokenFrameId,
  UsageSnapshot,
} from "../../types";
import {
  accessories,
  accessoryCatalog,
  getDefaultCatDetails,
  moodBadgeOptions,
  moodLooks,
  petConsoleSections,
  skinThemes,
  tokenFrameOptions,
  type PetConsoleSection,
} from "./catalog";
import { patchAccessorySettings } from "./accessorySettings";
import { AccessoriesPage } from "./AccessoriesPage";
import { CatTypePage } from "./CatTypePage";
import { CatTypeCard } from "./CatTypePicker";
import { MoodLooksPage } from "./MoodLooksPage";
import { PetStoryPanel } from "../pet-story/PetStoryPanel";
import { exportPetPreview } from "./previewExport";
import { PetAppearanceVisual } from "./PetAppearanceVisual";
import { PetIcon } from "./icons";
import { useAppearanceController } from "./useAppearanceController";

type AppearancePanelProps = {
  settings: AppSettings;
  setSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
  usage: UsageSnapshot;
  onSectionChange?: (section: PetConsoleSection) => void;
};

function HeaderAction(props: { label: string; onClick?: () => void; testId?: string }) {
  return (
    <button className="pet-section-action" type="button" aria-label={props.label} onClick={props.onClick} data-testid={props.testId}>
      <span>{props.label}</span>
      <span aria-hidden="true">-&gt;</span>
    </button>
  );
}

function PetSubnav(props: { activeSection: PetConsoleSection; onSelectSection: (section: PetConsoleSection) => void }) {
  return (
    <nav className="pet-console-subnav" aria-label="Pet customization sections">
      {petConsoleSections.map((section) => {
        const enabled = true;
        return (
          <button
            className={`${section.id === props.activeSection ? "active" : ""} ${enabled ? "" : "static"}`.trim()}
            key={section.id}
            type="button"
            aria-current={section.id === props.activeSection ? "page" : undefined}
            data-pet-section={section.id}
            onClick={() => {
              if (enabled) props.onSelectSection(section.id);
            }}
          >
            <PetIcon name={section.id} />
            {section.label}
          </button>
        );
      })}
    </nav>
  );
}

function PetPreview(props: {
  appearance: PetAppearanceSettings;
  usage: UsageSnapshot;
  canUndo: boolean;
  onCapture: () => void;
  onReset: () => void;
  onUndo: () => void;
}) {
  return (
    <section className="pet-preview-card">
      <div className="pet-card-header">
        <div>
          <strong>Pet Preview</strong>
        </div>
        <button className="pet-icon-button" type="button" aria-label="Capture preview" onClick={props.onCapture}>
          <PetIcon name="camera" />
        </button>
      </div>

      <div className="pet-preview-stage">
        <PetAppearanceVisual appearance={props.appearance} usage={props.usage} surface="preview" />
      </div>

      <div className="pet-preview-actions">
        <button type="button" onClick={props.onCapture}>
          <PetIcon name="capture" />
          <span>Capture</span>
        </button>
        <button type="button" onClick={props.onReset}>
          <PetIcon name="reset" />
          <span>Reset to default</span>
        </button>
        <button type="button" onClick={props.onUndo} disabled={!props.canUndo}>
          <PetIcon name="undo" />
          <span>Undo</span>
        </button>
      </div>
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
  const range = Math.max(max - min, 1);
  const progress = Math.min(100, Math.max(0, ((props.value - min) / range) * 100));

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
    <section className="pet-card display-card">
      <div className="pet-card-header">
        <div>
          <strong>Display</strong>
          <span>Adjust how your pet is displayed.</span>
        </div>
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
          disabled={generatedGolden}
          valueLabel={generatedGolden ? "Baked" : undefined}
          disabledReason={generatedGolden ? "The approved Golden British actor already contains its contact shadow." : undefined}
          onChange={(value) => props.onPatchAppearance({ shadow: value / 100 })}
        />
        <RangeControl
          icon="bubble"
          label={generatedGolden ? "Token text scale" : "Token frame scale"}
          min={70}
          max={125}
          value={Math.round(props.appearance.bubbleScale * 100)}
          disabled={!generatedGolden}
          valueLabel={generatedGolden ? undefined : "Unavailable"}
          disabledReason={!generatedGolden ? "No approved token-frame asset is available for this static fallback image." : undefined}
          onChange={(value) => props.onPatchAppearance({ bubbleScale: value / 100 })}
        />
      </div>
    </section>
  );
}

function SkinCard(props: { selectedSkin: PetThemeId; catTypeId: PetAppearanceSettings["catTypeId"]; onSelectSkin: (skinId: PetThemeId) => void }) {
  const actorReady = props.catTypeId === "golden-british";
  return (
    <section className="pet-card skin-card">
      <div className="pet-card-header">
        <div>
          <strong>Skin &amp; Color</strong>
          <span>{actorReady ? "Baked into the approved actor art." : "Approved static fallback; color variants are planned."}</span>
        </div>
      </div>
      <div className="skin-grid">
        {skinThemes.map((theme) => (
          <button
            className={props.selectedSkin === theme.id ? "selected" : ""}
            key={theme.id}
            type="button"
            data-skin-id={theme.id}
            disabled
            title={actorReady ? "Golden British colors are baked into its generated actor bundle." : "This approved static fallback cannot be recolored at runtime."}
            onClick={() => props.onSelectSkin(theme.id)}
          >
            <span className={`skin-swatch ${theme.className}`} />
            {theme.label}
          </button>
        ))}
      </div>
    </section>
  );
}

function TokenFrameCard(props: { catTypeId: PetAppearanceSettings["catTypeId"]; selectedFrame: TokenFrameId; onSelectFrame: (frameId: TokenFrameId) => void }) {
  const actorReady = props.catTypeId === "golden-british";
  return (
    <section className="pet-card token-bubble-card">
      <div className="pet-card-header">
        <div>
          <strong>Token Frame</strong>
          <span>How your token value is displayed.</span>
        </div>
      </div>
      <span className={`actor-ready-inline ${actorReady ? "" : "fallback"}`.trim()}><i />{actorReady ? "Actor-ready" : "Static fallback · token frame unavailable"}</span>
      <div className="token-bubble-list">
        {tokenFrameOptions.map((option) => {
          const supported = props.catTypeId === "golden-british"
            ? option.id === "embedded" || option.id === "hidden"
            : option.id === "hidden";
          const displayLabel = props.catTypeId === "golden-british" && option.id === "hidden" ? "Hide value" : option.label;
          const displayDetail = props.catTypeId === "golden-british" && option.id === "hidden"
            ? "Baked frame remains"
            : props.catTypeId !== "golden-british" && option.id === "hidden"
              ? "No approved token-frame asset for this static fallback"
              : option.detail;
          return (
          <button
            className={`${props.selectedFrame === option.id ? "selected" : ""} ${supported ? "" : "planned"}`.trim()}
            key={option.id}
            type="button"
            data-token-frame-id={option.id}
            disabled={!supported}
            title={supported ? displayDetail : "Requires a generated actor bundle with an approved token-frame asset."}
            onClick={() => { if (supported) props.onSelectFrame(option.id); }}
          >
            <span className={`main-token-frame-preview ${option.id}`}>
              {option.id === "hidden" ? <PetIcon name="hidden" /> : <><small>{option.id === "cost" ? "$ +" : ""}</small><strong>61.5M</strong></>}
            </span>
            <span>
              <strong>{displayLabel}</strong>
              {supported && props.catTypeId === "golden-british" && option.id === "hidden" ? <small>{displayDetail}</small> : null}
              {!supported ? <small>Planned actor asset</small> : null}
            </span>
            {props.selectedFrame === option.id ? <span className="bubble-radio" /> : null}
          </button>
        );})}
      </div>
    </section>
  );
}

function MoodBadgeCard(props: {
  appearance: PetAppearanceSettings;
  onPatchAppearance: (patch: Partial<PetAppearanceSettings>) => void;
}) {
  const stateByOption = {
    "show-mood": props.appearance.moodBadge.showMood,
    "color-state": props.appearance.moodBadge.colorByState,
    "focus-mode": props.appearance.moodBadge.hideInFocusMode,
  };

  return (
    <section className="pet-card mood-badge-card">
      <div className="pet-card-header">
        <div>
          <strong>Mood Badge</strong>
          <span>Show your pet's mood.</span>
        </div>
      </div>
      <div className="mood-badge-list">
        {moodBadgeOptions.map((option) => (
          <button
            className="mood-badge-row"
            key={option.id}
            type="button"
            data-mood-badge-id={option.id}
            onClick={() => {
              const nextEnabled = !stateByOption[option.id];
              const nextMoodBadge = {
                ...props.appearance.moodBadge,
                ...(option.id === "show-mood" ? { showMood: nextEnabled } : {}),
                ...(option.id === "color-state" ? { colorByState: nextEnabled } : {}),
                ...(option.id === "focus-mode" ? { hideInFocusMode: nextEnabled } : {}),
              };
              props.onPatchAppearance({ moodBadge: nextMoodBadge });
            }}
          >
            <span>
              <strong>{option.label}</strong>
              <small>{option.detail}</small>
            </span>
            <span className={`pet-switch ${stateByOption[option.id] ? "on" : ""}`} aria-hidden="true" />
          </button>
        ))}
      </div>
    </section>
  );
}

function MoodLooksCard(props: { actorReady: boolean; selectedMood: MoodLookId; onSelectMood: (moodId: MoodLookId) => void; onCustomize: () => void }) {
  return (
    <section className="pet-card mood-looks-card">
      <div className="pet-card-header">
        <div>
          <strong>Mood Looks</strong>
          <span>{props.actorReady ? "Preview the actor loops used by each mood." : "Static fallback image; actor mood loops are planned."}</span>
        </div>
        <HeaderAction label="Customize looks" onClick={props.onCustomize} testId="open-mood-looks" />
      </div>
      <div className="mood-look-grid">
        {moodLooks.map((mood) => (
          <button
            className={`mood-look-option ${mood.id} ${props.selectedMood === mood.id ? "selected" : ""} ${props.actorReady ? "" : "planned"}`.trim()}
            key={mood.id}
            type="button"
            data-mood-id={mood.id}
            disabled={!props.actorReady}
            title={props.actorReady ? `${mood.label} actor loop` : "This cat currently uses an approved static fallback image; actor loops are planned."}
            onClick={() => props.onSelectMood(mood.id)}
          >
            <span className="mood-look-title">
              <span className={`mood-dot ${mood.dotClassName}`} />
              <strong>{mood.label}</strong>
            </span>
            <em>{mood.badge}</em>
            <img src={mood.image} alt="" draggable={false} aria-hidden="true" />
            {!props.actorReady ? <small className="mood-look-capability">Planned actor loop</small> : null}
          </button>
        ))}
      </div>
    </section>
  );
}

function AccessoriesCard(props: {
  catTypeId: PetAppearanceSettings["catTypeId"];
  selectedAccessories: AccessoryId[];
  onToggleAccessory: (accessoryId: AccessoryId) => void;
  onViewAll: () => void;
}) {
  return (
    <section className="pet-card accessories-card">
      <div className="pet-card-header">
        <div>
          <strong>Accessories</strong>
          <span>Dress your pet with signature compatible looks.</span>
        </div>
        <HeaderAction label="View all" onClick={props.onViewAll} testId="open-accessories" />
      </div>
      <div className="accessory-grid">
        {accessories.map((accessory) => (
          <button
            className={`accessory-option ${props.selectedAccessories.includes(accessory.id) ? "selected" : ""} ${
              accessory.id === "collar" && props.catTypeId === "golden-british" ? "baked" : "planned"
            }`}
            key={accessory.id}
            type="button"
            data-accessory-id={accessory.id}
            title={accessory.id === "collar" && props.catTypeId === "golden-british" ? "Baked into this actor bundle." : "Requires a generated actor variant."}
            disabled
          >
            <strong>{accessory.label}</strong>
            <img src={accessory.image} alt="" draggable={false} aria-hidden="true" />
            <em className={accessory.id === "collar" && props.catTypeId === "golden-british" ? "equipped" : "locked"}>
              {accessory.id === "collar" && props.catTypeId === "golden-british" ? "Baked signature" : <><PetIcon name="lock" />Planned</>}
            </em>
          </button>
        ))}
      </div>
    </section>
  );
}

export function AppearancePanel(props: AppearancePanelProps) {
  const [activeAppearancePage, setActiveAppearancePage] = useState<"appearance" | "cat-type" | "mood-looks" | "accessories">("appearance");
  const [activeSection, setActiveSection] = useState<PetConsoleSection>("appearance");
  const { appearance, canUndo, patchAppearance, resetAppearance, undoAppearance } = useAppearanceController(
    props.settings,
    props.setSetting,
  );

  const toggleAccessory = (accessoryId: AccessoryId) => {
    const accessory = accessoryCatalog.find((option) => option.id === accessoryId);
    if (!accessory || accessory.category === "tokenFrame") return;

    const categorySettingKeys = {
      neck: "neckId",
      head: "headId",
      base: "baseId",
      effects: "effectId",
    } as const;
    const settingKey = categorySettingKeys[accessory.category];
    const selected = appearance.accessorySettings[settingKey] === accessoryId;

    patchAppearance(patchAccessorySettings(appearance, { [settingKey]: selected ? "none" : accessoryId }));
  };

  const selectCatType = (catTypeId: PetAppearanceSettings["catTypeId"]) => {
    const golden = catTypeId === "golden-british";
    patchAppearance({
      catTypeId,
      tokenBubbleId: golden ? "pill" : "hidden",
      catDetails: getDefaultCatDetails(catTypeId),
      accessoryIds: [],
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

  if (activeAppearancePage === "mood-looks") {
    return (
      <div className="pet-appearance-panel pet-mood-looks-panel" data-pet-page="mood-looks">
        <PetSubnav activeSection="appearance" onSelectSection={selectConsoleSection} />
        <MoodLooksPage
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
          canUndo={canUndo}
          onBack={() => setActiveAppearancePage("appearance")}
          onPatchAppearance={patchAppearance}
          onUndo={undoAppearance}
        />
      </div>
    );
  }

  return (
    <div className={`pet-appearance-panel ${activeSection !== "appearance" ? "pet-story-root" : ""}`} data-pet-page={activeSection} data-testid={`pet-page-${activeSection}`}>
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
          <div className="pet-appearance-grid">
            <PetPreview
              appearance={appearance}
              usage={props.usage}
              canUndo={canUndo}
              onCapture={() => void exportPetPreview(appearance, props.usage)}
              onReset={resetAppearance}
              onUndo={undoAppearance}
            />
            <div className="pet-main-column">
              <CatTypeCard
                selectedCat={appearance.catTypeId}
                onSelectCat={selectCatType}
                onViewAll={() => setActiveAppearancePage("cat-type")}
              />
              <div className="pet-lower-controls">
                <DisplayCard appearance={appearance} onPatchAppearance={patchAppearance} />
                <SkinCard selectedSkin={appearance.themeId} catTypeId={appearance.catTypeId} onSelectSkin={(themeId) => patchAppearance({ themeId })} />
              </div>
            </div>
            <div className="pet-side-column">
              <TokenFrameCard
                catTypeId={appearance.catTypeId}
                selectedFrame={appearance.accessorySettings.tokenFrameId}
                onSelectFrame={(tokenFrameId) => {
                  const option = tokenFrameOptions.find((item) => item.id === tokenFrameId);
                  if (!option) return;
                  patchAppearance({ tokenBubbleId: option.tokenBubbleId, accessorySettings: { ...appearance.accessorySettings, tokenFrameId } });
                }}
              />
              <MoodBadgeCard appearance={appearance} onPatchAppearance={patchAppearance} />
            </div>
            <div className="pet-bottom-row">
              <MoodLooksCard actorReady={appearance.catTypeId === "golden-british"} selectedMood={appearance.moodId} onSelectMood={(moodId) => patchAppearance({ moodId })} onCustomize={() => setActiveAppearancePage("mood-looks")} />
              <AccessoriesCard
                catTypeId={appearance.catTypeId}
                selectedAccessories={appearance.accessoryIds}
                onToggleAccessory={toggleAccessory}
                onViewAll={() => setActiveAppearancePage("accessories")}
              />
            </div>
          </div>
          <footer className="pet-appearance-footer">
            <span>
              <PetIcon name="spark" />
              Changes apply instantly.
            </span>
            <button type="button" onClick={resetAppearance}>
              <PetIcon name="reset" />
              Reset appearance
            </button>
          </footer>
        </>
      )}
    </div>
  );
}
