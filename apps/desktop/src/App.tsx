import { ConsoleApp } from "./views/ConsoleApp";
import { MenuBarApp } from "./views/MenuBarApp";
import { PetApp } from "./views/PetApp";
import { PopoverApp } from "./views/PopoverApp";
import { QuickPlayOverlayApp } from "./views/QuickPlayOverlayApp";

export function App() {
  const search = new URLSearchParams(window.location.search);
  const view = search.get("view");

  if (view === "popover") {
    return <PopoverApp />;
  }

  if (view === "menubar") {
    return <MenuBarApp />;
  }

  if (view === "console") {
    return <ConsoleApp />;
  }

  if (view === "quick-play-overlay") {
    return <QuickPlayOverlayApp />;
  }

  return <PetApp />;
}
