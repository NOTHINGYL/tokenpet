import type { CSSProperties } from "react";
import { useState } from "react";
import { GoldCat } from "../../components/GoldCat";
import type { AppSettings, UsageSnapshot } from "../../types";
import { compactNumber } from "../../utils/format";
import {
  accessories,
  catTypes,
  moodBadgeOptions,
  moodLooks,
  petConsoleSections,
  skinThemes,
  tokenBubbleOptions,
} from "./catalog";
import { PetIcon } from "./icons";

type AppearancePanelProps = {
  settings: AppSettings;
  setSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
  usage: UsageSnapshot;
};

const petThemeIds: AppSettings["petTheme"][] = ["gold", "mint", "rose", "sky"];
const defaultMoodBadgeState = Object.fromEntries(moodBadgeOptions.map((option) => [option.id, option.enabled]));

function isPetTheme(theme: (typeof skinThemes)[number]["id"]): theme is AppSettings["petTheme"] {
  return petThemeIds.includes(theme as AppSettings["petTheme"]);
}

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

function PetPreview(props: { settings: AppSettings; usage: UsageSnapshot }) {
  return (
    <section
      className="pet-preview-card"
      style={
        {
          "--preview-scale": props.settings.petScale.toString(),
          "--preview-opacity": props.settings.petOpacity.toString(),
        } as CSSProperties
      }
    >
      <div className="pet-card-header">
        <div>
          <strong>Pet Preview</strong>
        </div>
        <button className="pet-icon-button" type="button" aria-label="Preview camera">
          <PetIcon name="camera" />
        </button>
      </div>

      <div className="pet-preview-stage">
        <span className="pet-preview-mood">focused</span>
        <GoldCat className="pet-preview-cat" />
        <span className="pet-preview-token">{compactNumber(props.usage.sevenDayTokens || props.usage.todayTokens)}</span>
      </div>

      <div className="pet-preview-actions">
        <button type="button">
          <PetIcon name="capture" />
          Capture
        </button>
        <button type="button">
          <PetIcon name="reset" />
          Reset
        </button>
        <button type="button">
          <PetIcon name="undo" />
          Undo
        </button>
      </div>
    </section>
  );
}

function CatTypeCard(props: { selectedCat: string; onSelectCat: (catId: string) => void }) {
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
  onChange?: (value: number) => void;
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
        {props.onChange ? (
          <input
            type="range"
            min={min}
            max={max}
            value={props.value}
            onChange={(event) => props.onChange?.(Number(event.currentTarget.value))}
            style={{ "--range-progress": `${progress}%` } as CSSProperties}
            aria-label={props.label}
          />
        ) : (
          <span className="pet-static-range" style={{ "--range-progress": `${progress}%` } as CSSProperties}>
            <span />
          </span>
        )}
        <small>{props.value}%</small>
      </span>
    </label>
  );
}

function DisplayCard(props: AppearancePanelProps) {
  const size = Math.round(props.settings.petScale * 100);
  const opacity = Math.round(props.settings.petOpacity * 100);

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
          value={size}
          onChange={(value) => props.setSetting("petScale", value / 100)}
        />
        <RangeControl
          icon="opacity"
          label="Opacity"
          min={45}
          max={100}
          value={opacity}
          onChange={(value) => props.setSetting("petOpacity", value / 100)}
        />
        <RangeControl icon="shadow" label="Shadow" value={60} />
        <RangeControl icon="bubble" label="Bubble scale" value={100} />
      </div>
    </section>
  );
}

function SkinCard(props: AppearancePanelProps & { selectedSkin: string; onSelectSkin: (skinId: string) => void }) {
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
            onClick={() => {
              props.onSelectSkin(theme.id);
              if (isPetTheme(theme.id)) props.setSetting("petTheme", theme.id);
            }}
          >
            <span className={`skin-swatch ${theme.className}`} />
            {theme.label}
          </button>
        ))}
      </div>
    </section>
  );
}

function TokenBubbleCard(props: { selectedBubble: string; onSelectBubble: (bubbleId: string) => void }) {
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
  moodBadgeState: Record<string, boolean>;
  onToggleMoodBadge: (optionId: string) => void;
}) {
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
          <button className="mood-badge-row" key={option.id} type="button" onClick={() => props.onToggleMoodBadge(option.id)}>
            <span>
              <strong>{option.label}</strong>
              <small>{option.detail}</small>
            </span>
            <span className={`pet-switch ${props.moodBadgeState[option.id] ? "on" : ""}`} aria-hidden="true" />
          </button>
        ))}
      </div>
    </section>
  );
}

function MoodLooksCard(props: { selectedMood: string; onSelectMood: (moodId: string) => void }) {
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

function AccessoriesCard(props: { selectedAccessories: string[]; onToggleAccessory: (accessoryId: string) => void }) {
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
            onClick={() => {
              if (!accessory.locked) props.onToggleAccessory(accessory.id);
            }}
            disabled={Boolean(accessory.locked)}
          >
            <strong>{accessory.label}</strong>
            <img src={accessory.image} alt="" draggable={false} aria-hidden="true" />
            <em
              className={
                accessory.locked ? "locked" : props.selectedAccessories.includes(accessory.id) ? "equipped" : ""
              }
            >
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
  const [selectedCat, setSelectedCat] = useState("golden-british");
  const [selectedBubble, setSelectedBubble] = useState("pill");
  const [selectedSkin, setSelectedSkin] = useState(props.settings.petTheme);
  const [selectedMood, setSelectedMood] = useState("focused");
  const [selectedAccessories, setSelectedAccessories] = useState(["collar", "ribbon"]);
  const [moodBadgeState, setMoodBadgeState] = useState<Record<string, boolean>>(defaultMoodBadgeState);

  const resetAppearance = () => {
    setSelectedCat("golden-british");
    setSelectedBubble("pill");
    setSelectedSkin("gold");
    setSelectedMood("focused");
    setSelectedAccessories(["collar", "ribbon"]);
    setMoodBadgeState(defaultMoodBadgeState);
    props.setSetting("petTheme", "gold");
    props.setSetting("petScale", 1);
    props.setSetting("petOpacity", 0.92);
  };

  const toggleAccessory = (accessoryId: string) => {
    setSelectedAccessories((current) =>
      current.includes(accessoryId) ? current.filter((id) => id !== accessoryId) : [...current, accessoryId],
    );
  };

  return (
    <div className="pet-appearance-panel">
      <PetSubnav />
      <div className="pet-appearance-grid">
        <PetPreview settings={props.settings} usage={props.usage} />
        <div className="pet-main-column">
          <CatTypeCard selectedCat={selectedCat} onSelectCat={setSelectedCat} />
          <div className="pet-lower-controls">
            <DisplayCard {...props} />
            <SkinCard {...props} selectedSkin={selectedSkin} onSelectSkin={setSelectedSkin} />
          </div>
        </div>
        <div className="pet-side-column">
          <TokenBubbleCard selectedBubble={selectedBubble} onSelectBubble={setSelectedBubble} />
          <MoodBadgeCard
            moodBadgeState={moodBadgeState}
            onToggleMoodBadge={(optionId) =>
              setMoodBadgeState((current) => ({ ...current, [optionId]: !current[optionId] }))
            }
          />
        </div>
        <div className="pet-bottom-row">
          <MoodLooksCard selectedMood={selectedMood} onSelectMood={setSelectedMood} />
          <AccessoriesCard selectedAccessories={selectedAccessories} onToggleAccessory={toggleAccessory} />
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
