import { GeneratedPetActorCanvas, hasGeneratedActor } from "../pet-generated-actor/GeneratedPetActorCanvas";
import { PetActorCanvas } from "../pet-actor/PetActorCanvas";
import type { PetActorProps } from "../pet-actor/actorTypes";

export function PetRenderer(props: PetActorProps) {
  if (hasGeneratedActor(props.appearance.catTypeId)) {
    return <GeneratedPetActorCanvas {...props} fallback={<PetActorCanvas {...props} />} />;
  }

  return <PetActorCanvas {...props} />;
}
