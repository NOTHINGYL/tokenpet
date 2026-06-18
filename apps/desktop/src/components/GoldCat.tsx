const petAssets = {
  desktop: "assets/pets/cat-desktop.png",
  summary: "assets/pets/cat-summary.png",
  menubar: "assets/pets/cat-menubar.png",
  icon: "assets/pets/cat-icon.png",
};

const pawAssets = {
  desktop: "assets/pets/cat-paws-desktop.png",
  summary: "assets/pets/cat-paws-summary.png",
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

export function CatPaws(props: { variant?: keyof typeof pawAssets; className?: string }) {
  const variant = props.variant ?? "desktop";

  return (
    <img
      className={`cat-paws-image cat-paws-image-${variant} ${props.className ?? ""}`}
      src={pawAssets[variant]}
      alt=""
      draggable={false}
      aria-hidden="true"
    />
  );
}
