# NapCat SDK

NapCat OneBot V11 协议的 TypeScript/JavaScript SDK 类型定义。

## NapCat

> NapCat 客户端主类，提供所有 OneBot API 操作

### 属性

#### uin

机器人 QQ 号。

> 返回: `number` - QQ 号

#### app_name

应用名称。

> 返回: `string` - 应用名称

#### app_version

应用版本。

> 返回: `string` - 版本号

#### segment

消息段构造器。

> 返回: `Segment` - 消息段构造器

### 消息操作

#### send_group_msg

发送群消息。

> - `group_id`: 群号
> - `message`: 消息内容
>   返回: `Promise<{ message_id: number }>` - 发送成功后返回消息ID

#### send_private_msg

发送私聊消息。

> - `user_id`: 用户 QQ 号
> - `message`: 消息内容
>   返回: `Promise<{ message_id: number }>` - 发送成功后返回消息ID

#### send_msg

发送消息（自动判断群/私聊）。

> - `message`: 消息内容
>   返回: `Promise<{ message_id: number }>` - 发送成功后返回消息ID

#### delete_msg

删除消息。

> - `message_id`: 消息ID
>   返回: `Promise<void>`

#### get_msg

获取消息详情。

> - `message_id`: 消息ID
>   返回: `Promise<Message>` - 消息详情

<details>
<summary>点击展开完整类型定义</summary>

```typescript
class NapCat {
  uin: number;
  app_name: string;
  app_version: string;
  segment: Segment;

  send_group_msg(
    group_id: number | string,
    message: Sendable,
  ): Promise<{ message_id: number }>;
  send_private_msg(
    user_id: number | string,
    message: Sendable,
  ): Promise<{ message_id: number }>;
  send_msg(message: Sendable): Promise<{ message_id: number }>;
  delete_msg(message_id: number): Promise<void>;
  get_msg(message_id: number): Promise<Message>;
}
```

</details>

---

## 群操作

### 获取群信息

#### get_group_list

获取群列表。

> 返回: `Promise<GroupInfo[]>` - 群列表

#### get_group_info

获取群信息。

> - `group_id`: 群号
>   返回: `Promise<GroupInfo>` - 群信息

#### get_group_member_list

获取群成员列表。

> - `group_id`: 群号
>   返回: `Promise<GroupMember[]>` - 群成员列表

#### get_group_member_info

获取群成员信息。

> - `group_id`: 群号
> - `user_id`: 用户 QQ 号
>   返回: `Promise<GroupMember>` - 群成员信息

#### get_group_honor_info

获取群荣誉信息。

> - `group_id`: 群号
> - `type`: 荣誉类型
>   返回: `Promise<HonorInfo>` - 群荣誉信息

### 群管理

#### set_group_name

设置群名称。

> - `group_id`: 群号
> - `group_name`: 新群名称
>   返回: `Promise<void>`

#### set_group_card

设置群名片。

> - `group_id`: 群号
> - `user_id`: 用户 QQ 号
> - `card`: 新群名片
>   返回: `Promise<void>`

#### set_group_title

设置群称号。

> - `group_id`: 群号
> - `user_id`: 用户 QQ 号
> - `title`: 新群称号
>   返回: `Promise<void>`

#### set_group_admin

设置管理员。

> - `group_id`: 群号
> - `user_id`: 用户 QQ 号
> - `enable`: 是否设置为管理员
>   返回: `Promise<void>`

#### set_group_owner

转让群主。

> - `group_id`: 群号
> - `user_id`: 用户 QQ 号
>   返回: `Promise<void>`

#### set_group_ban

禁言成员。

> - `group_id`: 群号
> - `user_id`: 用户 QQ 号
> - `duration`: 禁言时长（秒），0为解除
>   返回: `Promise<void>`

#### set_group_whole_ban

全体禁言。

> - `group_id`: 群号
> - `enable`: 是否开启全体禁言
>   返回: `Promise<void>`

#### kick_group_member

踢出成员。

> - `group_id`: 群号
> - `user_id`: 用户 QQ 号
> - `reject_add_request?`: 是否拒绝再次入群
>   返回: `Promise<void>`

#### quit_group

退出群聊。

> - `group_id`: 群号
>   返回: `Promise<void>`

<details>
<summary>点击展开完整类型定义</summary>

```typescript
interface GroupOperations {
  get_group_list(): Promise<GroupInfo[]>;
  get_group_info(group_id: number | string): Promise<GroupInfo>;
  get_group_member_list(group_id: number | string): Promise<GroupMember[]>;
  get_group_member_info(
    group_id: number | string,
    user_id: number | string,
  ): Promise<GroupMember>;
  get_group_honor_info(
    group_id: number | string,
    type: string,
  ): Promise<HonorInfo>;
  set_group_name(group_id: number | string, group_name: string): Promise<void>;
  set_group_card(
    group_id: number | string,
    user_id: number | string,
    card: string,
  ): Promise<void>;
  set_group_title(
    group_id: number | string,
    user_id: number | string,
    title: string,
  ): Promise<void>;
  set_group_admin(
    group_id: number | string,
    user_id: number | string,
    enable: boolean,
  ): Promise<void>;
  set_group_owner(
    group_id: number | string,
    user_id: number | string,
  ): Promise<void>;
  set_group_ban(
    group_id: number | string,
    user_id: number | string,
    duration: number,
  ): Promise<void>;
  set_group_whole_ban(
    group_id: number | string,
    enable: boolean,
  ): Promise<void>;
  kick_group_member(
    group_id: number | string,
    user_id: number | string,
    reject_add_request?: boolean,
  ): Promise<void>;
  quit_group(group_id: number | string): Promise<void>;
}
```

</details>

---

## 好友操作

### 好友信息

#### get_friend_list

获取好友列表。

> 返回: `Promise<Friend[]>` - 好友列表

#### get_stranger_info

获取陌生人信息。

> - `user_id`: 用户 QQ 号
> - `no_cache?`: 是否不使用缓存
>   返回: `Promise<StrangerInfo>` - 陌生人信息

### 好友请求

#### set_friend_add_request

处理好友请求。

> - `flag`: 请求标志
> - `approve?`: 是否同意
> - `remark?`: 备注
>   返回: `Promise<void>`

#### send_like

发送点赞。

> - `user_id`: 用户 QQ 号
> - `times?`: 点赞次数
>   返回: `Promise<void>`

<details>
<summary>点击展开完整类型定义</summary>

```typescript
interface FriendOperations {
  get_friend_list(): Promise<Friend[]>;
  get_stranger_info(
    user_id: number | string,
    no_cache?: boolean,
  ): Promise<StrangerInfo>;
  set_friend_add_request(
    flag: string,
    approve?: boolean,
    remark?: string,
  ): Promise<void>;
  send_like(user_id: number | string, times?: number): Promise<void>;
}
```

</details>

---

## 文件操作

### 文件上传

#### upload_group_file

上传群文件。

> - `group_id`: 群号
> - `file`: 文件路径
> - `name`: 文件名
> - `folder_id?`: 文件夹ID
>   返回: `Promise<{ file_id: string }>` - 上传后的文件ID

#### upload_private_file

上传私聊文件。

> - `user_id`: 用户 QQ 号
> - `file`: 文件路径
> - `name`: 文件名
>   返回: `Promise<{ file_id: string }>` - 上传后的文件ID

### 文件查询

#### get_group_files

获取群文件列表。

> - `folder_id`: 文件夹ID
>   返回: `Promise<{ folders: GroupFileFolder[]; files: GroupFile[] }>` - 文件夹和文件列表

#### get_group_root_files

获取群根目录文件。

> - `group_id`: 群号
>   返回: `Promise<{ folders: GroupFileFolder[]; files: GroupFile[] }>` - 根目录文件列表

#### get_group_file_url

获取群文件下载链接。

> - `group_id`: 群号
> - `file_id`: 文件ID
> - `no_cache?`: 是否不使用缓存
>   返回: `Promise<{ url: string }>` - 文件下载链接

### 文件夹管理

#### create_group_folder

创建群文件夹。

> - `group_id`: 群号
> - `name`: 文件夹名称
> - `parent_id?`: 父文件夹ID
>   返回: `Promise<{ folder_id: string }>` - 创建的文件夹ID

#### delete_group_folder

删除群文件夹。

> - `group_id`: 群号
> - `folder_id`: 文件夹ID
>   返回: `Promise<void>`

#### delete_group_file

删除群文件。

> - `group_id`: 群号
> - `file_id`: 文件ID
> - `folder_id?`: 文件夹ID
>   返回: `Promise<void>`

### 资源获取

#### get_image

获取图片下载链接。

> - `file`: 文件名
>   返回: `Promise<string>` - 图片下载链接

#### get_record

获取语音文件下载链接。

> - `file`: 文件名
> - `out_format?`: 输出格式
> - `prompt?`: 提示文字
>   返回: `Promise<string>` - 语音文件下载链接

#### get_cookie

获取 Cookies。

> - `domain?`: 域名
>   返回: `Promise<string>` - Cookies 字符串

#### get_csrf_token

获取 CSRF Token。

> 返回: `Promise<number>` - CSRF token

#### get_credentials

获取登录凭证。

> - `domain?`: 域名
>   返回: `Promise<{ cookies: string; csrf: number }>` - Cookies 和 CSRF token

<details>
<summary>点击展开完整类型定义</summary>

```typescript
interface FileOperations {
  upload_group_file(
    group_id: number | string,
    file: string,
    name: string,
    folder_id?: string,
  ): Promise<{ file_id: string }>;
  upload_private_file(
    user_id: number | string,
    file: string,
    name: string,
  ): Promise<{ file_id: string }>;
  get_group_files(
    folder_id: number | string,
  ): Promise<{ folders: GroupFileFolder[]; files: GroupFile[] }>;
  get_group_root_files(
    group_id: number | string,
  ): Promise<{ folders: GroupFileFolder[]; files: GroupFile[] }>;
  get_group_file_url(
    group_id: number | string,
    file_id: string,
    no_cache?: boolean,
  ): Promise<{ url: string }>;
  create_group_folder(
    group_id: number | string,
    name: string,
    parent_id?: string,
  ): Promise<{ folder_id: string }>;
  delete_group_folder(
    group_id: number | string,
    folder_id: string,
  ): Promise<void>;
  delete_group_file(
    group_id: number | string,
    file_id: string,
    folder_id?: string,
  ): Promise<void>;
  get_image(file: string): Promise<string>;
  get_record(
    file: string,
    out_format?: string,
    prompt?: string,
  ): Promise<string>;
  get_cookie(domain?: string): Promise<string>;
  get_csrf_token(): Promise<number>;
  get_credentials(domain?: string): Promise<{ cookies: string; csrf: number }>;
}
```

</details>

---

## 请求处理

### 请求响应

#### set_group_add_request

处理群请求。

> - `flag`: 请求标志
> - `sub_type?`: 子类型
> - `approve?`: 是否同意
> - `reason?`: 理由
>   返回: `Promise<void>`

#### set_essence_group_msg

设置精华消息。

> - `message_id`: 消息ID
>   返回: `Promise<void>`

#### delete_essence_group_msg

删除精华消息。

> - `message_id`: 消息ID
>   返回: `Promise<void>`

### 群公告

#### get_group_notice

获取群公告。

> - `group_id`: 群号
>   返回: `Promise<GroupNotice[]>` - 群公告列表

#### publish_group_notice

发布群公告。

> - `group_id`: 群号
> - `message`: 公告内容
> - `image?`: 图片
>   返回: `Promise<void>`

#### delete_group_notice

删除群公告。

> - `group_id`: 群号
> - `message_id`: 公告消息ID
>   返回: `Promise<void>`

### 表情包

#### get_emoji_list

获取表情包列表。

> 返回: `Promise<Emoji[]>` - 表情包列表

#### fetch_emoji_like

点赞表情。

> - `user_id`: 用户 QQ 号
> - `message_id`: 消息ID
> - `emoji_id`: 表情ID
>   返回: `Promise<void>`

#### delete_emoji_like

取消表情点赞。

> - `user_id`: 用户 QQ 号
> - `message_id`: 消息ID
> - `emoji_id`: 表情ID
>   返回: `Promise<void>`

### 签到

#### get_group_sign_in_groups

获取开启签到的群列表。

> 返回: `Promise<number[]>` - 开启签到的群列表

#### sign_group

群签到。

> - `group_id`: 群号
>   返回: `Promise<void>`

### 配置

#### get_config

获取配置。

> - `type`: 配置类型
>   返回: `Promise<any>` - 配置内容

#### reload_config

重载配置。

> - `type`: 配置类型
>   返回: `Promise<void>`

#### set_config

设置配置。

> - `type`: 配置类型
> - `content`: 配置内容
>   返回: `Promise<void>`

### 机器人信息

#### get_login_info

获取登录信息。

> 返回: `Promise<{ user_id: number; nickname: string }>` - 登录信息

#### get_status

获取状态。

> 返回: `Promise<{ online: boolean; good: boolean }>` - 在线状态

#### get_version_info

获取版本信息。

> 返回: `Promise<{ app_name: string; app_version: string; protocol_version: string }>` - 版本信息

#### get_model_show

获取模型展示。

> - `model_id`: 模型ID
>   返回: `Promise<ModelShow[]>` - 模型展示列表

#### set_model_show

设置模型展示。

> - `model_id`: 模型ID
> - `model_show`: 模型展示
>   返回: `Promise<void>`

### 事件监听

#### on

监听事件。

> - `eventName`: 事件名称
> - `handler`: 处理函数
>   返回: `() => void` - 取消监听函数

#### once

监听一次事件。

> - `eventName`: 事件名称
> - `handler`: 处理函数
>   返回: `() => void` - 取消监听函数

#### off

取消监听。

> - `eventName`: 事件名称
> - `handler`: 处理函数
>   返回: `void`

#### wait_event

等待事件。

> - `eventName`: 事件名称
> - `filter?`: 过滤函数
> - `timeout?`: 超时时间（毫秒）
>   返回: `Promise<Event>` - 事件对象

<details>
<summary>点击展开完整类型定义</summary>

```typescript
interface RequestOperations {
  set_group_add_request(
    flag: string,
    sub_type?: string,
    approve?: boolean,
    reason?: string,
  ): Promise<void>;
  set_essence_group_msg(message_id: number): Promise<void>;
  delete_essence_group_msg(message_id: number): Promise<void>;
  get_group_notice(group_id: number | string): Promise<GroupNotice[]>;
  publish_group_notice(
    group_id: number | string,
    message: string,
    image?: string,
  ): Promise<void>;
  delete_group_notice(
    group_id: number | string,
    message_id: number,
  ): Promise<void>;
  get_emoji_list(): Promise<Emoji[]>;
  fetch_emoji_like(
    user_id: number | string,
    message_id: number,
    emoji_id: string,
  ): Promise<void>;
  delete_emoji_like(
    user_id: number | string,
    message_id: number,
    emoji_id: string,
  ): Promise<void>;
  get_group_sign_in_groups(): Promise<number[]>;
  sign_group(group_id: number | string): Promise<void>;
  get_config(type: "十字绣" | "ai_character" | "wording_ai"): Promise<any>;
  reload_config(type: "十字绣" | "ai_character" | "wording_ai"): Promise<void>;
  set_config(
    type: "十字绣" | "ai_character" | "wording_ai",
    content: any,
  ): Promise<void>;
  get_login_info(): Promise<{ user_id: number; nickname: string }>;
  get_status(): Promise<{ online: boolean; good: boolean }>;
  get_version_info(): Promise<{
    app_name: string;
    app_version: string;
    protocol_version: string;
  }>;
  get_model_show(model_id: string): Promise<ModelShow[]>;
  set_model_show(model_id: string, model_show: string): Promise<void>;
  on<EventName extends keyof EventMap>(
    eventName: EventName,
    handler: (event: EventMap[EventName]) => any,
  ): () => void;
  once<EventName extends keyof EventMap>(
    eventName: EventName,
    handler: (event: EventMap[EventName]) => any,
  ): () => void;
  off<EventName extends keyof EventMap>(
    eventName: EventName,
    handler: (event: EventMap[EventName]) => any,
  ): void;
  wait_event<EventName extends keyof EventMap>(
    eventName: EventName,
    filter?: (event: EventMap[EventName]) => boolean,
    timeout?: number,
  ): Promise<EventMap[EventName]>;
}
```

</details>

---

## Segment

> 消息段构造器，用于构建消息元素

### 基本元素

#### text

创建文本消息段。

> - `text`: 文本内容
>   返回: `Text` - 文本消息段

#### image

创建图片消息段。

> - `file`: 图片文件或对象
> - `sub_type?`: 图片子类型
>   返回: `Image` - 图片消息段

#### face

创建表情消息段。

> - `id`: 表情ID
>   返回: `Face` - 表情消息段

#### at

创建 @ 消息段。

> - `qq`: QQ 号或 "all"
>   返回: `At` - @消息段

### 互动元素

#### dice

创建骰子消息段。

> 返回: `Dice` - 骰子消息段

#### rps

创建猜拳消息段。

> 返回: `Rps` - 猜拳消息段

#### shake

创建窗口抖动消息段。

> 返回: `Shake` - 窗口抖动消息段

#### poke

创建戳一戳消息段。

> - `qq`: 被戳的QQ号
>   返回: `Poke` - 戳一戳消息段

### 媒体元素

#### flash

创建闪照消息段。

> - `file`: 图片文件
>   返回: `Flash` - 闪照消息段

#### voice

创建语音消息段。

> - `file`: 语音文件
>   返回: `Voice` - 语音消息段

#### music

创建音乐分享消息段。

> - `type`: 音乐类型
> - `id`: 音乐ID
>   返回: `Music` - 音乐分享消息段

### 分享元素

#### share

创建链接分享消息段。

> - `url`: 链接地址
> - `title`: 标题
> - `content?`: 内容
> - `image?`: 图片
>   返回: `Share` - 链接分享消息段

#### contact

创建联系人分享消息段。

> - `type`: 类型 qq/group
> - `id`: ID
>   返回: `Contact` - 联系人分享消息段

#### location

创建位置分享消息段。

> - `lat`: 纬度
> - `lon`: 经度
> - `title?`: 标题
> - `content?`: 内容
>   返回: `Location` - 位置分享消息段

### 特殊元素

#### anonymous

创建匿名消息段。

> - `ignore?`: 是否忽略
>   返回: `Anonymous` - 匿名消息段

#### ark

创建卡片消息段。

> - `data`: 卡片数据
>   返回: `Ark` - 卡片消息段

#### json

创建 JSON 消息段。

> - `data`: JSON 数据
>   返回: `Json` - JSON 消息段

#### redpacket

创建红包消息段。

> - `type`: 红包类型
> - `title`: 标题
> - `message`: 消息
>   返回: `Redpacket` - 红包消息段

#### gift

创建礼物消息段。

> - `id`: 礼物ID
> - `name`: 礼物名称
> - `count?`: 数量
>   返回: `Gift` - 礼物消息段

### 转发元素

#### forward

创建合并转发消息段。

> - `id`: 转发消息ID
>   返回: `Forward` - 合并转发消息段

#### node

创建合并转发节点。

> - `id`: 节点ID
> - `user_id?`: 用户QQ号
> - `nickname?`: 昵称
> - `content?`: 内容
> - `time?`: 时间
>   返回: `Node` - 合并转发节点

### 嵌入元素

#### embed

创建嵌入内容消息段。

> - `auto_inject?`: 自动注入
> - `banner_url?`: 横幅链接
> - `title?`: 标题
> - `content?`: 内容
> - `jump_url?`: 跳转链接
> - `bot_menu_ids?`: 菜单ID列表
>   返回: `Embed` - 嵌入内容消息段

#### music (自定义)

创建自定义音乐消息段。

> - `music`: 自定义音乐对象
>   返回: `MusicX` - 自定义音乐消息段

<details>
<summary>点击展开完整类型定义</summary>

```typescript
interface Segment {
  text(text: string): Text;
  image(
    file:
      | string
      | {
          file: string;
          url?: string;
          cache?: boolean;
          proxies?: boolean;
          timeout?: number;
        },
    sub_type?: string,
  ): Image;
  face(id: string | number): Face;
  at(qq: number | "all"): At;
  dice(): Dice;
  rps(): Rps;
  shake(): Shake;
  poke(qq: number): Poke;
  flash(
    file:
      | string
      | {
          file: string;
          url?: string;
          cache?: boolean;
          proxies?: boolean;
          timeout?: number;
        },
  ): Flash;
  voice(
    file:
      | string
      | {
          file: string;
          url?: string;
          cache?: boolean;
          proxies?: boolean;
          timeout?: number;
        },
  ): Voice;
  music(type: "qq" | "163" | "xm", id: string): Music;
  share(url: string, title: string, content?: string, image?: string): Share;
  contact(type: "qq" | "group", id: number): Contact;
  location(
    lat: number,
    lon: number,
    title?: string,
    content?: string,
  ): Location;
  anonymous(ignore?: boolean): Anonymous;
  ark(data: ArkData | string): Ark;
  json(data: Record<string, any>): Json;
  redpacket(type: string, title: string, message: string): Redpacket;
  gift(id: string | number, name: string, count?: number): Gift;
  forward(id: string): Forward;
  node(
    id: string,
    user_id?: number,
    nickname?: string,
    content?: string,
    time?: number,
  ): Node;
  embed(
    auto_inject?: boolean,
    banner_url?: string,
    title?: string,
    content?: string,
    jump_url?: string | number,
    bot_menu_ids?: (string | number)[],
  ): Embed;
  music(music: MusicX): MusicX;
}
```

</details>

---

## Sendable

> 可发送的消息类型

```typescript
type Sendable = string | RecvElement | Sendable[];
```

> - `string`: 纯文本
> - `RecvElement`: 消息元素
> - `Sendable[]`: 消息段数组
