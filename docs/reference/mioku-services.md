# MiokuService 服务接口

Mioku 服务接口定义，所有服务都需要实现此接口。

## MiokuService

> 服务接口定义

```typescript
interface MiokuService {
  name: string;
  version: string;
  description?: string;
  init(): Promise<void>;
  api: Record<string, any>;
  dispose?(): Promise<void>;
}
```

### 属性

#### name

服务名称。

> 返回: `string` - 服务名称

#### version

服务版本。

> 返回: `string` - 服务版本

#### description

服务描述。

> 返回: `string | undefined` - 服务描述

### 方法

#### init

初始化服务。

> 返回: `Promise<void>` - 初始化完成

#### api

服务提供的 API。

> 返回: `Record<string, any>` - 服务 API 对象

#### dispose

清理服务资源（可选）。

> 返回: `Promise<void>` - 清理完成

<details>
<summary>点击展开完整类型定义</summary>

```typescript
interface MiokuService {
  name: string;
  version: string;
  description?: string;
  init(): Promise<void>;
  api: Record<string, any>;
  dispose?(): Promise<void>;
}
```

</details>

---

## ServiceMetadata

> 服务元数据

```typescript
interface ServiceMetadata {
  name: string;
  version: string;
  description?: string;
  path: string;
  packageJson: any;
}
```

> - `name`: 服务名称
> - `version`: 服务版本
> - `description?`: 服务描述
> - `path`: 服务路径
> - `packageJson`: 服务 package.json

<details>
<summary>点击展开完整类型定义</summary>

```typescript
interface ServiceMetadata {
  name: string;
  version: string;
  description?: string;
  path: string;
  packageJson: any;
}
```

</details>
