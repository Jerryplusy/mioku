# 事件 (Event)

Mioki 基于 napcat-sdk 定义事件，事件类型通过 `EventMap` 索引。

## EventMap

> 所有支持的事件类型映射

```typescript
type EventMap = {
  "message.group": GroupMessageEvent;
  "message.private": PrivateMessageEvent;
  "notice.online": OnlineEvent;
  "notice.offline": OfflineEvent;
  "notice.group_increase": GroupIncreaseEvent;
  "notice.group_decrease": GroupDecreaseEvent;
  "notice.group_ban": GroupBanEvent;
  "notice.friend_add": FriendAddEvent;
  "notice.friend_recall": FriendRecallEvent;
  "notice.group_recall": GroupRecallEvent;
  "notice.group_admin": GroupAdminEvent;
  "notice.group_name": GroupNameEvent;
  "notice.group_card": GroupCardEvent;
  "notice.group_title": GroupTitleEvent;
  "notice.group_poke": GroupPokeEvent;
  "notice.friend_poke": FriendPokeEvent;
  "notice.group_upload": GroupUploadFileEvent;
  "notice.group_essence": GroupEssenceEvent;
  "notice.group_emoji_like": GroupMsgEmojiLikeEvent;
  "notice.lucky_king": NotifyEvent;
  "notice.input_status": InputStatusEvent;
  "request.friend": FriendRequestEvent;
  "request.group": GroupRequestEvent;
  "meta.lifecycle": LifecycleMetaEvent;
  "meta.heartbeat": HeartbeatMetaEvent;
};
```

---

## GroupMessageEvent

> 用户在群聊中发送消息时触发的事件

### 基础信息字段

`message_id: number`

> 消息的唯一标识符

`user_id: number`

> 发送者的 QQ 号

`group_id: number`

> 消息所在的群号

`group_name: string | null`

> 群名称，可能为 null

`raw_message: string`

> 未解析的原始消息内容

`message: RecvElement[]`

> 解析后的消息元素数组

`message_type: "group"`

> 消息类型，固定为 "group"

`sub_type: "normal" | string`

> 消息子类型

`self_id: number`

> 机器人 QQ 号

`target_id: number | null`

> 目标用户 QQ 号

`time: number`

> 消息发送时间戳

`seq: number`

> 消息序列号

`rand: number`

> 消息随机数

### 发送者信息

`sender: MessageSender`

> 发送者信息对象

### group 对象

`group: Group`

> 群操作对象，提供对群的各种操作

### reply

```typescript
reply(message: Sendable, quote?: boolean): Promise<{ message_id: number }>
```

> - `message`: 回复的消息内容
> - `quote?`: 是否引用原消息
>   返回: `{ message_id: number }` - 回复成功的消息ID

### recall

> 返回: void

### addReaction

> - `emoji`: 表情ID
>   返回: void

### delReaction

> - `emoji`: 表情ID
>   返回: void

### setEssence

```typescript
setEssence(message_id?: number): Promise<void>
```

> - `message_id?`: 消息ID，默认当前消息
>   返回: void

### delEssence

```typescript
delEssence(message_id?: number): Promise<void>
```

> - `message_id?`: 消息ID，默认当前消息
>   返回: void

### getQuoteMsg

```typescript
getQuoteMsg(): Promise<GroupMessageEvent | null>
```

> 返回: `GroupMessageEvent | null` - 引用的消息事件

### sendMsg

```typescript
sendMsg(message: Sendable): Promise<{ message_id: number }>
```

> - `message`: 消息内容
>   返回: `{ message_id: number }` - 发送成功的消息ID

---

## PrivateMessageEvent

> 用户发送私聊消息时触发的事件

### 基础信息字段

`message_id: number`

> 消息的唯一标识符

`user_id: number`

> 发送者的 QQ 号

`raw_message: string`

> 原始消息文本

`message: RecvElement[]`

> 消息段数组

`message_type: "private"`

> 消息类型，固定为 "private"

`sub_type: "friend" | "group" | "normal"`

> 私聊子类型

`self_id: number`

> 机器人 QQ 号

`target_id: number | null`

> 目标用户 QQ 号

`temp_source: number | null`

> 临时会话来源群号

`group_id: number | null`

> 对应的群号

`time: number`

> 时间戳

`seq: number`

> 消息序列号

`rand: number`

> 消息随机数

### 发送者信息

`sender: MessageSender`

> 发送者信息对象

### reply

```typescript
reply(message: Sendable, quote?: boolean): Promise<{ message_id: number }>
```

> - `message`: 回复的消息内容
> - `quote?`: 是否引用原消息
>   返回: `{ message_id: number }` - 回复成功的消息ID

### recall

```typescript
recall(): Promise<void>
```

> 返回: void

### sendMsg

```typescript
sendMsg(message: Sendable): Promise<{ message_id: number }>
```

> - `message`: 消息内容
>   返回: `{ message_id: number }` - 发送成功的消息ID

---

## MessageSender

> 消息发送者信息

`user_id: number`

> 用户 QQ 号

`nickname: string`

> 用户昵称

`card: string`

> 群名片

`role: "owner" | "admin" | "member"`

> 群角色

`title: string`

> 群称号

`join_timestamp: number`

> 入群时间戳

`last_sent_time: number`

> 最后发言时间

`level: number`

> 等级

`permission: "owner" | "admin" | "member"`

> 权限级别

`exp: { level: number; history: number[] }`

> 经验值

`sex: "male" | "female" | "unknown"`

> 性别

`age: number`

> 年龄

`area: string`

> 地区

`classification: string`

> 分类

---

## Group

> 群对象，提供群操作方法

### sendMsg

```typescript
sendMsg(message: Sendable): Promise<{ message_id: number }>
```

> - `message`: 消息内容
>   返回: `{ message_id: number }` - 发送成功的消息ID

### getInfo

```typescript
getInfo(): Promise<GroupInfo>
```

> 返回: `GroupInfo` - 群信息

### getMemberList

```typescript
getMemberList(): Promise<GroupMember[]>
```

> 返回: `GroupMember[]` - 群成员列表

### getMemberInfo

```typescript
getMemberInfo(user_id: number): Promise<GroupMember>
```

> - `user_id`: 用户 QQ 号
>   返回: `GroupMember` - 群成员信息

### kick

```typescript
kick(user_id: number, reject_add_request?: boolean): Promise<void>
```

> - `user_id`: 用户 QQ 号
> - `reject_add_request?`: 是否拒绝入群
>   返回: void

### setCard

```typescript
setCard(user_id: number, card: string): Promise<void>
```

> - `user_id`: 用户 QQ 号
> - `card`: 新群名片
>   返回: void

### setTitle

```typescript
setTitle(user_id: number, title: string): Promise<void>
```

> - `user_id`: 用户 QQ 号
> - `title`: 新群称号
>   返回: void

### ban

```typescript
ban(user_id: number, duration: number): Promise<void>
```

> - `user_id`: 用户 QQ 号
> - `duration`: 禁言时长（秒）
>   返回: void

### unban

```typescript
unban(user_id: number): Promise<void>
```

> - `user_id`: 用户 QQ 号
>   返回: void

### setWholeBan

```typescript
setWholeBan(enable: boolean): Promise<void>
```

> - `enable`: 是否开启全体禁言
>   返回: void

### setAdmin

```typescript
setAdmin(user_id: number, enable: boolean): Promise<void>
```

> - `user_id`: 用户 QQ 号
> - `enable`: 是否设置为管理员
>   返回: void

### setOwner

```typescript
setOwner(user_id: number): Promise<void>
```

> - `user_id`: 用户 QQ 号
>   返回: void

### quit

```typescript
quit(): Promise<void>
```

> 返回: void

### getHonorList

```typescript
getHonorList(honor_type: string): Promise<HonorInfo>
```

> - `honor_type`: 荣誉类型
>   返回: `HonorInfo` - 群荣誉信息

### getAchievementList

```typescript
getAchievementList(user_id: number): Promise<AchievementInfo[]>
```

> - `user_id`: 用户 QQ 号
>   返回: `AchievementInfo[]` - 成就列表

---

## GroupIncreaseEvent

> 新成员加入群时触发

`time: number`

> 时间戳

`self_id: number`

> 机器人 QQ 号

`group_id: number`

> 群号

`user_id: number`

> 新成员 QQ 号

`target_id: number`

> 操作者 QQ 号

`sub_type: "approve" | "invite"`

> 增加类型

---

## GroupDecreaseEvent

> 成员离开群或被踢出时触发

`time: number`

`self_id: number`

`group_id: number`

`user_id: number`

> 离开/被踢的成员

`operator_id: number`

> 操作者

`sub_type: "leave" | "kick" | "kick_by_admin"`

> 离开类型

---

## GroupBanEvent

> 成员被禁言或解除禁言时触发

`time: number`

`self_id: number`

`group_id: number`

`user_id: number`

> 被禁言的成员

`operator_id: number`

> 操作者

`duration: number`

> 禁言时长（秒），0为解除

---

## FriendAddEvent

> 成功添加好友时触发

`time: number`

`self_id: number`

`user_id: number`

> 新好友的 QQ 号

---

## GroupRecallEvent

> 成员撤回消息时触发

`time: number`

`self_id: number`

`group_id: number`

`user_id: number`

> 撤回消息的成员

`operator_id: number`

> 操作者

`message_id: number`

> 被撤回的消息 ID

---

## GroupEssenceEvent

> 消息被设为精华或取消精华时触发

`time: number`

`self_id: number`

`group_id: number`

`operator_id: number`

> 操作者

`message_id: number`

> 消息 ID

`sub_type: "add" | "remove"`

> 操作类型

---

## GroupMsgEmojiLikeEvent

> 有人对消息点赞表情时触发

`time: number`

`self_id: number`

`group_id: number`

`message_id: number`

> 被点赞的消息 ID

`user_id: number`

> 点赞者

`emoji_id_list: string[]>`

> 表情 ID 列表

---

## GroupAdminEvent

> 成员被设为/取消管理员时触发

`time: number`

`self_id: number`

`group_id: number`

`user_id: number`

> 被设置的成员

`sub_type: "set" | "unset"`

> 设置/取消

---

## GroupNameEvent / GroupCardEvent / GroupTitleEvent

> 群信息变更事件

`group_name: string`

> 新群名称

`card: string`

> 新群名片

`title: string`

> 新群称号

---

## GroupPokeEvent / FriendPokeEvent

> 戳一戳事件

`group_id: number` (GroupPokeEvent)

> 群号

`user_id: number`

> 发送戳一戳的人

`target_id: number`

> 被戳的人

`sender_id: number`

> 发送者

`message: string`

> 戳一戳的消息内容

---

## GroupUploadFileEvent

> 有人上传文件到群时触发

`group_id: number`

`user_id: number`

`file: { id, name, size, busid }`

> 文件信息

---

## FriendRequestEvent

> 有人申请添加好友时触发

`user_id: number`

> 申请者 QQ 号

`comment: string`

> 验证消息

`flag: string`

> 请求标志

### approve

```typescript
approve(approve: boolean, remark?: string): Promise<void>
```

> - `approve`: 是否同意
> - `remark?`: 备注
>   返回: void

---

## GroupRequestEvent

> 有人申请入群或邀请机器人入群时触发

`group_id: number`

> 目标群号

`user_id: number`

> 申请者 QQ 号

`comment: string`

> 验证消息

`flag: string`

> 请求标志

`sub_type: "add" | "invite"`

> 请求类型

`actor_id: number`

> 邀请人

### approve

```typescript
approve(approve: boolean): Promise<void>
```

> - `approve`: 是否同意
>   返回: void

---

## LifecycleMetaEvent

> 机器人连接/断开时触发

`meta_event_type: "lifecycle"`

> 事件类型

---

## HeartbeatMetaEvent

> 定时发送的心跳事件

`status: { app_initialized, app_enabled, online_good, online }`

> 状态信息

---

## RecvElement

> 接收到的消息元素类型

### Text

> 文本消息段

```typescript
interface Text {
  type: "text";
  data: { text: string };
}
```

> - `text`: 文本内容

### Image

> 图片消息段

```typescript
interface Image {
  type: "image";
  data: { file: string; url?: string; sub_type?: string };
}
```

> - `file`: 文件名
> - `url`: 图片链接
> - `sub_type`: 图片子类型

### Face

> 表情消息段

```typescript
interface Face {
  type: "face";
  data: { id: string };
}
```

> - `id`: 表情ID

### At

> @某人消息段

```typescript
interface At {
  type: "at";
  data: { qq: string };
}
```

> - `qq`: 要@的QQ号，"all"表示@全体

### Quote

> 引用消息段

```typescript
interface Quote {
  type: "quote";
  data: { id: string; user_id: string; seq: string };
}
```

> - `id`: 消息ID
> - `user_id`: 原消息发送者
> - `seq`: 消息序列号

### Forward

> 合并转发消息段

```typescript
interface Forward {
  type: "forward";
  data: { id: string };
}
```

> - `id`: 合并转发消息ID

### Node

> 合并转发节点

```typescript
interface Node {
  type: "node";
  data: {
    id: string;
    user_id?: string;
    nickname?: string;
    content?: string;
    time?: number;
  };
}
```

> - `id`: 节点ID
> - `user_id`: 发送者QQ
> - `nickname`: 发送者昵称
> - `content`: 内容
> - `time`: 时间

<details>
<summary>点击展开完整类型定义</summary>

```typescript
type RecvElement =
  | Text
  | Image
  | Face
  | At
  | AtAll
  | Dice
  | Rps
  | Shake
  | FlashImage
  | Voice
  | Video
  | Music
  | Share
  | Anonymous
  | Ark
  | Json
  | Redpacket
  | Gift
  | Forward
  | Node
  | Quote
  | Poke
  | Contact
  | Location
  | MusicX
  | Embed
  | MarketFace;

interface Text {
  type: "text";
  data: { text: string };
}
interface Image {
  type: "image";
  data: { file: string; url?: string; sub_type?: string };
}
interface Face {
  type: "face";
  data: { id: string };
}
interface At {
  type: "at";
  data: { qq: string };
}
interface AtAll {
  type: "at";
  data: { qq: "all" };
}
interface Dice {
  type: "dice";
  data: { id: string };
}
interface Rps {
  type: "rps";
  data: { id: string };
}
interface Shake {
  type: "shake";
  data: Record<string, never>;
}
interface FlashImage {
  type: "flash";
  data: { file: string; url?: string };
}
interface Voice {
  type: "voice";
  data: { file: string; url?: string; base64?: string };
}
interface Video {
  type: "video";
  data: { file: string; url?: string };
}
interface Music {
  type: "music";
  data: { type: "163" | "qq" | "xm"; id: string };
}
interface Share {
  type: "share";
  data: { url: string; title: string; content?: string; image?: string };
}
interface Anonymous {
  type: "anonymous";
  data: { flag: string };
}
interface Ark {
  type: "ark";
  data: { data: string };
}
interface Json {
  type: "json";
  data: { data: string };
}
interface Redpacket {
  type: "redpacket";
  data: { title: string; message: string };
}
interface Gift {
  type: "gift";
  data: { id: string; name: string; count?: string };
}
interface Forward {
  type: "forward";
  data: { id: string };
}
interface Node {
  type: "node";
  data: {
    id: string;
    user_id?: string;
    nickname?: string;
    content?: string;
    time?: number;
  };
}
interface Quote {
  type: "quote";
  data: { id: string; user_id: string; seq: string };
}
interface Poke {
  type: "poke";
  data: { qq: string };
}
interface Contact {
  type: "contact";
  data: { type: "qq" | "group"; id: string };
}
interface Location {
  type: "location";
  data: { lat: string; lon: string; title?: string };
}
```

</details>
