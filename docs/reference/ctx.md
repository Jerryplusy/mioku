# 上下文 (ctx)

Mioki 运行时上下文，包含机器人实例、事件处理、日志等。

## MiokiContext

> Mioki 运行时上下文对象，提供机器人操作、事件处理，日志等功能

### 属性

`bot: NapCat`

> 机器人实例，调用 NapCat API

`self_id: number`

> 当前机器人 QQ 号

`bots: ExtendedNapCat[]>`

> 所有已连接的机器人实例列表

`pickBot: (id: number) => ExtendedNapCat`

> - `id`: QQ 号
>   返回: `ExtendedNapCat` - 机器人实例

`segment: Segment`

> 消息段构造器

`logger: Logger`

> 日志记录器

`deduplicator: Deduplicator`

> 事件去重器

### handle

> 注册事件处理器

```typescript
handle: <EventName extends keyof EventMap>(
  eventName: EventName,
  handler: (event: EventMap[EventName]) => any,
  options?: HandleOptions
) => () => void
```

> - `eventName`: 事件名称
> - `handler`: 事件处理函数
> - `options`: 处理选项
>   返回: `() => void` - 取消处理函数

### cron

> 注册定时任务

```typescript
cron: (
  cronExpression: string,
  handler: (ctx: MiokiContext, task: TaskContext) => any,
) => ScheduledTask;
```

> - `cronExpression`: cron 表达式
> - `handler`: 任务处理函数
>   返回: `ScheduledTask` - 定时任务对象

