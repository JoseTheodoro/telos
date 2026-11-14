import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-500.css";
import "@fontsource/inter/latin-600.css";
import "./styles/tokens.css";
import "./styles/telos.css";
import { renderCanvas } from "./canvas";
import { renderHome } from "./home";
import { currentRoute, onRouteChange, replaceRoute, type Route } from "./router";
import { createLocalBoardStore } from "./store";

function appRoot(): HTMLElement {
  const root = document.querySelector<HTMLElement>("#app");
  if (!root) throw new Error("Elemento #app ausente em telos.html");
  return root;
}

const root = appRoot();
const store = createLocalBoardStore();

function render(route: Route): void {
  const board = route.name === "canvas" ? store.get(route.id) : null;
  if (board) return renderCanvas(root, board);
  if (route.name === "canvas") replaceRoute({ name: "home" });
  renderHome(root, store);
}

onRouteChange(render);
render(currentRoute());
