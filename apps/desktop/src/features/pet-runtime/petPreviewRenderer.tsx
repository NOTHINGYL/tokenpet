import { PetRenderer } from "./PetRenderer";
import type { PetActorProps } from "../pet-actor/actorTypes";

export function PetPreviewRenderer(props: Omit<PetActorProps, "surface">) {
  return <PetRenderer {...props} surface="preview" />;
}
