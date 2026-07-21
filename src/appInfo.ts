import packageJson from "../package.json";

export const APP_NAME = "Galley Pad";
export const APP_VERSION = packageJson.version;
export const APP_BRAND_LABEL = `${APP_NAME} v${APP_VERSION}`;

export function isLinuxDesktop(
  userAgent: string = globalThis.navigator?.userAgent ?? "",
): boolean {
  return /(?:X11|Wayland); Linux\b|Linux x86_64\b/.test(userAgent);
}

export const IS_LINUX_DESKTOP = isLinuxDesktop();
