# Config Service

配置管理服务，提供配置的注册、读取、更新、热重载等。

## ConfigService

> 配置管理服务接口

### registerConfig

> 注册配置文件，如果已存在则合并配置

```typescript
registerConfig(pluginName, configName, initialConfig): Promise<boolean>
```

> - `pluginName`: 插件名称
> - `configName`: 配置名称
> - `initialConfig`: 初始配置或配置文件路径
>   返回: `boolean` - 是否注册成功

### updateConfig

> 更新配置内容，使用 lodash merge 合并

```typescript
updateConfig(pluginName, configName, updates): Promise<boolean>
```

> - `pluginName`: 插件名称
> - `configName`: 配置名称
> - `updates`: 更新内容
>   返回: `boolean` - 是否更新成功

### getConfig

> 获取指定配置

```typescript
getConfig(pluginName, configName): Promise<any>
```

> - `pluginName`: 插件名称
> - `configName`: 配置名称
>   返回: `any` - 配置内容

### getPluginConfigs

> 获取插件的所有配置

```typescript
getPluginConfigs(pluginName): Promise<Record<string, any>>
```

> - `pluginName`: 插件名称
>   返回: `Record<string, any>` - 插件所有配置

### onConfigChange

> 监听配置变更，支持热重载

```typescript
onConfigChange(pluginName, configName, callback): () => void
```

> - `pluginName`: 插件名称
> - `configName`: 配置名称
> - `callback`: 变更回调函数
>   返回: `() => void` - 取消订阅函数

<details>
<summary>点击展开完整类型定义</summary>

```typescript
interface ConfigService {
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
```

</details>
