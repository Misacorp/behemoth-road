/**
 * Opening a page of this site outside the Activity. Inside Discord a plain link does nothing useful in the
 * iframe, so the Embedded App SDK's `commands.openExternalLink` opens it, with the absolute site URL.
 * Outside Discord (and in local dev) it is a normal link. App.tsx registers the SDK once it is loaded.
 */
export interface ExternalLinkSdk {
  readonly commands: { openExternalLink(args: { url: string }): Promise<unknown> };
}

let current: ExternalLinkSdk | null = null;

/** Called once the SDK exists (inside Discord only). */
export function registerLinkSdk(next: ExternalLinkSdk | null): void {
  current = next;
}

/** The absolute URL of a site path ("/wiki") on the page's own origin. */
export const siteUrl = (path: string, origin: string): string => new URL(path, origin).toString();

/**
 * A click on a link to a site path. Inside Discord it is taken over (default prevented) and opened through
 * the SDK; otherwise the event is left alone so the browser follows the link. Returns whether it was handled.
 */
export function openExternal(
  event: { preventDefault(): void },
  path: string,
  origin: string = window.location.origin,
  sdk: ExternalLinkSdk | null = current,
): boolean {
  if (!sdk) return false;
  event.preventDefault();
  void sdk.commands.openExternalLink({ url: siteUrl(path, origin) }).catch(() => undefined);
  return true;
}
