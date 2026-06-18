import { ConsoleApp } from "./views/ConsoleApp";
import { MenuBarApp } from "./views/MenuBarApp";
import { PetApp } from "./views/PetApp";
import { PopoverApp } from "./views/PopoverApp";

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

  return <PetApp />;
}
