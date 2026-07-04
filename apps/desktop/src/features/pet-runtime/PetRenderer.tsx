import type { CSSProperties } from "react";
import { createPetActor } from "./PetActor";
import type { PetActorProps, PetScene, PetSceneNode } from "./petRigTypes";

function formatNodeSize(node: PetSceneNode, axis: "width" | "height") {
  const value = axis === "width" ? node.transform.width : node.transform.height;
  if (value == null) return axis === "width" && node.kind === "badge" ? "max-content" : "auto";
  if (node.kind === "token") return `${Math.round(value)}px`;
  return `${(value * 100).toFixed(2)}%`;
}

function getNodeStyle(node: PetSceneNode) {
  return {
    "--pet-node-x": `${(node.transform.x * 100).toFixed(2)}%`,
    "--pet-node-y": `${(node.transform.y * 100).toFixed(2)}%`,
    "--pet-node-width": formatNodeSize(node, "width"),
    "--pet-node-height": formatNodeSize(node, "height"),
    "--pet-node-scale": node.transform.scale.toString(),
    "--pet-node-rotation": `${node.transform.rotation.toFixed(2)}deg`,
    "--pet-node-opacity": node.transform.opacity.toString(),
    "--pet-node-offset-x": `${node.transform.offsetX ?? 0}px`,
    "--pet-node-offset-y": `${node.transform.offsetY ?? 0}px`,
    "--pet-node-layer": node.layer,
  } as CSSProperties;
}

function getMaskStyle(node: PetSceneNode) {
  const mask = node.mask;
  return {
    "--pet-mask-x": `${((mask?.x ?? 0.5) * 100).toFixed(2)}%`,
    "--pet-mask-y": `${((mask?.y ?? 0.6) * 100).toFixed(2)}%`,
    "--pet-mask-w": `${((mask?.width ?? 0.3) * 100).toFixed(2)}%`,
    "--pet-mask-h": `${((mask?.height ?? 0.12) * 100).toFixed(2)}%`,
    "--pet-mask-opacity": node.transform.opacity.toString(),
    "--pet-node-layer": node.layer,
  } as CSSProperties;
}

function NodeAsset(props: { node: PetSceneNode }) {
  const motionClass = `pet-motion-${props.node.motion ?? "none"}`;

  if (props.node.kind === "shadow") {
    return <span className={`pet-scene-node-inner ${motionClass} ${props.node.className ?? ""}`} aria-hidden="true" />;
  }

  if (props.node.kind === "cat" || props.node.kind === "accessory" || props.node.kind === "effect") {
    return (
      <img
        className={`pet-scene-node-inner ${motionClass} ${props.node.className ?? ""}`}
        src={props.node.asset}
        alt=""
        draggable={false}
        aria-hidden="true"
      />
    );
  }

  return null;
}

function SceneNodeView(props: { node: PetSceneNode; onBubbleClick?: PetActorProps["onBubbleClick"] }) {
  if (props.node.kind === "occlusion") {
    return (
      <img
        className={`pet-scene-occlusion ${props.node.className ?? ""}`}
        src={props.node.asset}
        alt=""
        draggable={false}
        aria-hidden="true"
        style={getMaskStyle(props.node)}
      />
    );
  }

  if (props.node.kind === "token") {
    return (
      <span className={`pet-scene-node pet-scene-node-token ${props.node.className ?? ""}`} style={getNodeStyle(props.node)}>
        <button className="pet-visual-token pet-scene-token-button pet-motion-token" type="button" onClick={props.onBubbleClick} aria-label="Open TokenPet summary">
          {props.node.text}
        </button>
      </span>
    );
  }

  if (props.node.kind === "badge") {
    return (
      <span className={`pet-scene-node pet-scene-node-badge ${props.node.className ?? ""}`} style={getNodeStyle(props.node)}>
        <span className="pet-visual-mood pet-scene-badge-label pet-motion-badge">{props.node.text}</span>
      </span>
    );
  }

  return (
    <span className={`pet-scene-node pet-scene-node-${props.node.kind} ${props.node.className ?? ""}`} style={getNodeStyle(props.node)}>
      <NodeAsset node={props.node} />
    </span>
  );
}

function getSceneStyle(scene: PetScene) {
  return scene.styleVars as CSSProperties;
}

export function PetRenderer(props: PetActorProps) {
  const scene = createPetActor(props);

  return (
    <div className={scene.className} style={getSceneStyle(scene)}>
      <span className="pet-visual-cat-wrap pet-actor-root">
        <span className="pet-actor-scene">
          {scene.nodes.map((node) => (
            <SceneNodeView key={node.id} node={node} onBubbleClick={props.onBubbleClick} />
          ))}
        </span>
      </span>
    </div>
  );
}
