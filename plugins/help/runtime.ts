import type { MiokiContext } from "mioki";
import type { HelpService } from "../../src/services/help";
import type { ScreenshotService } from "../../src/services/screenshot";

export interface HelpPluginRuntimeState {
  ctx?: MiokiContext;
  helpService?: HelpService;
  screenshotService?: ScreenshotService;
  miokiVersion?: string;
  miokuVersion?: string;
}

const runtimeState: HelpPluginRuntimeState = {};

export function setHelpRuntimeState(
  nextState: HelpPluginRuntimeState,
): HelpPluginRuntimeState {
  Object.assign(runtimeState, nextState);
  return runtimeState;
}

export function getHelpRuntimeState(): HelpPluginRuntimeState {
  return runtimeState;
}

export function resetHelpRuntimeState(): void {
  for (const key of Object.keys(runtimeState) as Array<
    keyof HelpPluginRuntimeState
  >) {
    delete runtimeState[key];
  }
}
