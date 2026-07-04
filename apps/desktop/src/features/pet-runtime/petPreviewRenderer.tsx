import { PetRenderer } from "./PetRenderer";
import type { PetActorProps } from "./petRigTypes";

export function PetPreviewRenderer(props: Omit<PetActorProps, "surface">) {
  return <PetRenderer {...props} surface="preview" />;
}
