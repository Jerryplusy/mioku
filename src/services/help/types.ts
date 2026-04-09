import { PluginHelp } from "../../core/types";

export interface HelpService {
  registerHelp(pluginName: string, help: PluginHelp): void;
  getHelp(pluginName: string): PluginHelp | undefined;
  getAllHelp(): Map<string, PluginHelp>;
  unregisterHelp(pluginName: string): boolean;
}
