import type { CSSProperties } from "react";
import { countPetNameGraphemes } from "./petIdentity";

type PetNameBubbleProps = {
  name: string;
  content?: string;
  contentMode?: "name" | "token";
  visible: boolean;
  surface: "desktop" | "preview";
  reduceMotion?: boolean;
};

function bubbleMetrics(name: string, surface: PetNameBubbleProps["surface"]) {
  const length = Math.max(1, countPetNameGraphemes(name));
  const extra = Math.max(0, length - 3);
  if (surface === "preview") {
    return {
      size: Math.min(96, 68 + extra * 4),
      fontSize: Math.max(12, 17 - extra * .72),
    };
  }
  return {
    size: Math.min(76, 52 + extra * 3.5),
    fontSize: Math.max(10, 14 - extra * .55),
  };
}

export function PetNameBubble(props: PetNameBubbleProps) {
  const trimmedName = props.name.trim();
  const content = (props.content ?? trimmedName).trim();
  const metrics = bubbleMetrics(content, props.surface);
  const visible = props.visible && content.length > 0;
  const style = {
    "--pet-name-bubble-size": `${metrics.size}px`,
    "--pet-name-bubble-font-size": `${metrics.fontSize}px`,
  } as CSSProperties;

  return (
    <div
      className={`pet-name-thought pet-name-thought-${props.surface} pet-name-thought-${props.contentMode ?? "name"} ${visible ? "is-visible" : ""}`}
      data-pet-name-bubble
      data-bubble-content-mode={props.contentMode ?? "name"}
      data-surface={props.surface}
      data-reduce-motion={props.reduceMotion ? "true" : "false"}
      aria-hidden={!visible}
      style={style}
    >
      <span className="pet-name-thought-circle">
        <strong>{content}</strong>
      </span>
      <span className="pet-name-thought-dot pet-name-thought-dot-large" />
      <span className="pet-name-thought-dot pet-name-thought-dot-small" />
    </div>
  );
}
