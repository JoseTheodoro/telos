import "./styles/fonts.css";
import "./styles/tokens.css";
import "./styles/telos.css";
import { renderCanvas } from "./canvas";
import { renderHome } from "./home";
import { currentRoute, onRouteChange, replaceRoute, routeHash, type Route } from "./router";
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
  const resolved: Route = board ? route : { name: "home" };
  if (location.hash && location.hash !== routeHash(resolved)) replaceRoute(resolved);
  if (board) renderCanvas(root, board, store);
  else renderHome(root, store);
}

onRouteChange(render);
render(currentRoute());
