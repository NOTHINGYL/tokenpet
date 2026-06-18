const petAssets = {
  desktop: "assets/pets/cat-desktop.png",
  summary: "assets/pets/cat-summary.png",
};

export function GoldCat(props: { variant?: keyof typeof petAssets; className?: string }) {
  const variant = props.variant ?? "desktop";

  return (
    <img
      className={`cat-image cat-image-${variant} ${props.className ?? ""}`}
      src={petAssets[variant]}
      alt=""
      draggable={false}
      aria-hidden="true"
    />
  );
}
