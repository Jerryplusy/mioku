/**
 * 配置服务接口
 */
export interface ConfigService {
  registerConfig(
    pluginName: string,
    configName: string,
    initialConfig: any,
  ): Promise<boolean>;

  updateConfig(
    pluginName: string,
    configName: string,
    updates: any,
  ): Promise<boolean>;

  getConfig(pluginName: string, configName: string): Promise<any>;

  getPluginConfigs(pluginName: string): Promise<Record<string, any>>;

  onConfigChange(
    pluginName: string,
    configName: string,
    callback: (newConfig: any) => void,
  ): () => void;
}
