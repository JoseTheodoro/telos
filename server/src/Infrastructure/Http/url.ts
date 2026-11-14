export function pathnameOf(url: string): string {
  return url.split("?")[0] ?? "";
}
