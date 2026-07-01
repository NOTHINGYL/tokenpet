import type { CSSProperties } from "react";
import type {
  AccessoryId,
  AppSettings,
  CatTypeId,
  MoodLookId,
  PetAppearanceSettings,
  PetThemeId,
  TokenBubbleId,
  UsageSnapshot,
} from "../../types";
import {
  accessories,
  catTypes,
  moodBadgeOptions,
  moodLooks,
  petConsoleSections,
  skinThemes,
  tokenBubbleOptions,
} from "./catalog";
import { exportPetPreview } from "./previewExport";
import { PetAppearanceVisual } from "./PetAppearanceVisual";
import { PetIcon } from "./icons";
import { useAppearanceController } from "./useAppearanceController";

type AppearancePanelProps = {
  settings: AppSettings;
  setSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
  usage: UsageSnapshot;
};

function HeaderAction(props: { label: string }) {
  return (
    <button className="pet-section-action" type="button" aria-label={props.label}>
      <span>{props.label}</span>
      <span aria-hidden="true">-&gt;</span>
    </button>
  );
}

function PetSubnav() {
  return (
    <nav className="pet-console-subnav" aria-label="Pet customization sections">
      {petConsoleSections.map((section) => (
        <button
          className={section.id === "appearance" ? "active" : "static"}
          key={section.id}
          type="button"
          aria-current={section.id === "appearance" ? "page" : undefined}
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

function CatTypeCard(props: { selectedCat: CatTypeId; onSelectCat: (catId: CatTypeId) => void }) {
  return (
    <section className="pet-card cat-type-card">
      <div className="pet-card-header">
        <div>
          <strong>Cat Type</strong>
          <span>Choose your companion's breed.</span>
        </div>
        <HeaderAction label="View all" />
      </div>
      <div className="cat-type-grid">
        {catTypes.map((cat) => (
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
            <em className={props.selectedCat === cat.id ? "equipped" : ""}>
              {props.selectedCat === cat.id ? "Equipped" : cat.badge}
            </em>
          </button>
        ))}
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
          data-range-id={props.label.toLowerCase().replace(/\s+/g, "-")}
          onChange={(event) => props.onChange(Number(event.currentTarget.value))}
          style={{ "--range-progress": `${progress}%` } as CSSProperties}
          aria-label={props.label}
        />
        <small>{props.value}%</small>
      </span>
    </label>
  );
}

function DisplayCard(props: {
  appearance: PetAppearanceSettings;
  onPatchAppearance: (patch: Partial<PetAppearanceSettings>) => void;
}) {
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
          max={115}
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
          label="Bubble scale"
          min={70}
          max={125}
          value={Math.round(props.appearance.bubbleScale * 100)}
          onChange={(value) => props.onPatchAppearance({ bubbleScale: value / 100 })}
        />
      </div>
    </section>
  );
}

function SkinCard(props: { selectedSkin: PetThemeId; onSelectSkin: (skinId: PetThemeId) => void }) {
  return (
    <section className="pet-card skin-card">
      <div className="pet-card-header">
        <div>
          <strong>Skin &amp; Color</strong>
          <span>Customize fur palette.</span>
        </div>
      </div>
      <div className="skin-grid">
        {skinThemes.map((theme) => (
          <button
            className={props.selectedSkin === theme.id ? "selected" : ""}
            key={theme.id}
            type="button"
            data-skin-id={theme.id}
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

function TokenBubbleCard(props: { selectedBubble: TokenBubbleId; onSelectBubble: (bubbleId: TokenBubbleId) => void }) {
  return (
    <section className="pet-card token-bubble-card">
      <div className="pet-card-header">
        <div>
          <strong>Token Bubble</strong>
          <span>Choose how token info is shown.</span>
        </div>
      </div>
      <div className="token-bubble-list">
        {tokenBubbleOptions.map((option) => (
          <button
            className={props.selectedBubble === option.id ? "selected" : ""}
            key={option.id}
            type="button"
            data-bubble-id={option.id}
            onClick={() => props.onSelectBubble(option.id)}
          >
            <span className="bubble-option-icon">
              <PetIcon name={option.icon} />
            </span>
            <span>
              <strong>{option.label}</strong>
              <small>{option.detail}</small>
            </span>
            {props.selectedBubble === option.id ? <span className="bubble-radio" /> : null}
          </button>
        ))}
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

function MoodLooksCard(props: { selectedMood: MoodLookId; onSelectMood: (moodId: MoodLookId) => void }) {
  return (
    <section className="pet-card mood-looks-card">
      <div className="pet-card-header">
        <div>
          <strong>Mood Looks</strong>
          <span>See how your pet looks in different moods.</span>
        </div>
        <HeaderAction label="Customize looks" />
      </div>
      <div className="mood-look-grid">
        {moodLooks.map((mood) => (
          <button
            className={`mood-look-option ${mood.id} ${props.selectedMood === mood.id ? "selected" : ""}`}
            key={mood.id}
            type="button"
            data-mood-id={mood.id}
            onClick={() => props.onSelectMood(mood.id)}
          >
            <span className="mood-look-title">
              <span className={`mood-dot ${mood.dotClassName}`} />
              <strong>{mood.label}</strong>
            </span>
            <em>{mood.badge}</em>
            <img src={mood.image} alt="" draggable={false} aria-hidden="true" />
          </button>
        ))}
      </div>
    </section>
  );
}

function AccessoriesCard(props: { selectedAccessories: AccessoryId[]; onToggleAccessory: (accessoryId: AccessoryId) => void }) {
  return (
    <section className="pet-card accessories-card">
      <div className="pet-card-header">
        <div>
          <strong>Accessories</strong>
          <span>Dress up your pet with accessories.</span>
        </div>
        <HeaderAction label="View all" />
      </div>
      <div className="accessory-grid">
        {accessories.map((accessory) => (
          <button
            className={`accessory-option ${props.selectedAccessories.includes(accessory.id) ? "selected" : ""} ${
              accessory.locked ? "locked" : ""
            }`}
            key={accessory.id}
            type="button"
            data-accessory-id={accessory.id}
            onClick={() => {
              if (!accessory.locked) props.onToggleAccessory(accessory.id);
            }}
            disabled={Boolean(accessory.locked)}
          >
            <strong>{accessory.label}</strong>
            <img src={accessory.image} alt="" draggable={false} aria-hidden="true" />
            <em className={accessory.locked ? "locked" : props.selectedAccessories.includes(accessory.id) ? "equipped" : ""}>
              {accessory.locked ? <PetIcon name="lock" /> : null}
              {props.selectedAccessories.includes(accessory.id) ? "Equipped" : accessory.badge}
            </em>
          </button>
        ))}
      </div>
    </section>
  );
}

export function AppearancePanel(props: AppearancePanelProps) {
  const { appearance, canUndo, patchAppearance, resetAppearance, undoAppearance } = useAppearanceController(
    props.settings,
    props.setSetting,
  );

  const toggleAccessory = (accessoryId: AccessoryId) => {
    patchAppearance({
      accessoryIds: appearance.accessoryIds.includes(accessoryId)
        ? appearance.accessoryIds.filter((id) => id !== accessoryId)
        : [...appearance.accessoryIds, accessoryId],
    });
  };

  return (
    <div className="pet-appearance-panel">
      <PetSubnav />
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
          <CatTypeCard selectedCat={appearance.catTypeId} onSelectCat={(catTypeId) => patchAppearance({ catTypeId })} />
          <div className="pet-lower-controls">
            <DisplayCard appearance={appearance} onPatchAppearance={patchAppearance} />
            <SkinCard selectedSkin={appearance.themeId} onSelectSkin={(themeId) => patchAppearance({ themeId })} />
          </div>
        </div>
        <div className="pet-side-column">
          <TokenBubbleCard
            selectedBubble={appearance.tokenBubbleId}
            onSelectBubble={(tokenBubbleId) => patchAppearance({ tokenBubbleId })}
          />
          <MoodBadgeCard appearance={appearance} onPatchAppearance={patchAppearance} />
        </div>
        <div className="pet-bottom-row">
          <MoodLooksCard selectedMood={appearance.moodId} onSelectMood={(moodId) => patchAppearance({ moodId })} />
          <AccessoriesCard selectedAccessories={appearance.accessoryIds} onToggleAccessory={toggleAccessory} />
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
    </div>
  );
}
