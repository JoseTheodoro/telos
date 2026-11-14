export type Route = { name: "home" } | { name: "canvas"; id: string };

const HOME_HASH = "#/";
const CANVAS_PREFIX = "#/canvas/";

function decodeId(encoded: string): string {
  try {
    return decodeURIComponent(encoded);
  } catch {
    return "";
  }
}

export function parseRoute(hash: string): Route {
  const id = hash.startsWith(CANVAS_PREFIX) ? decodeId(hash.slice(CANVAS_PREFIX.length)) : "";
  return id ? { name: "canvas", id } : { name: "home" };
}

export const routeHash = (route: Route): string =>
  route.name === "canvas" ? `${CANVAS_PREFIX}${encodeURIComponent(route.id)}` : HOME_HASH;

export const currentRoute = (): Route => parseRoute(location.hash);

export function go(route: Route): void {
  location.hash = routeHash(route);
}

export function replaceRoute(route: Route): void {
  history.replaceState(null, "", routeHash(route));
}

export function onRouteChange(listener: (route: Route) => void): void {
  window.addEventListener("hashchange", () => listener(currentRoute()));
}
