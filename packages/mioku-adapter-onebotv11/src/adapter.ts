import {
  bindCapabilities,
  colors,
  avatarSet,
  botStatus,
  conversationGetHistory,
  defineAdapter,
  forwardSend,
  friendDelete,
  friendGetInfo,
  friendGetList,
  groupGetInfo,
  groupGetList,
  groupGetMembers,
  groupLeave,
  groupSetName,
  groupSetPortrait,
  groupSetWholeBan,
  memberBan,
  memberGetInfo,
  memberKick,
  memberPoke,
  memberSetAdmin,
  memberSetCard,
  memberSetTitle,
  messageGet,
  messageGetForward,
  messageRecall,
  messageSend,
  profileSet,
  reactionSet,
  registerStatusProvider,
} from 'mioku'
import { DEFAULT_INSTANCE, normalizeInstances } from './config'
import { createOneBot, type OneBot, type OneBotData } from './bot'
import { OneBotWebSocketGateway } from './gateway'
import { AdapterEventDeduplicator } from './dedup'
import { createOneBotStatusProvider } from './status'
import { buildMessageEvent, buildMetaEvent, buildNoticeEvent, buildRequestEvent, decodeWsMessage } from './event'
import { buildPayload, sentFromOneBot, stringifyMessage } from './message'

import type { Adapter, AdapterContext, AdapterFactoryOptions } from 'mioku'
import type { OneBotAdapterConfig, OneBotInstanceConfig } from './config'
import type { AdapterStatus, Capability, Event, Logger, Bot, MessageEvent } from 'mioku'
import type { WebSocketConnection } from 'mioku'

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const ONEBOT_NOTICE_NOTIFY_MAP: Record<string, { notice_type: string; sub_type: string }> = {
  input_status: { notice_type: 'friend', sub_type: 'input' },
  profile_like: { notice_type: 'friend', sub_type: 'like' },
  title: { notice_type: 'group', sub_type: 'title' },
}

const ONEBOT_NOTICE_EVENT_MAP: Record<string, { notice_type: string; sub_type: string }> = {
  friend_add: { notice_type: 'friend', sub_type: 'increase' },
  friend_recall: { notice_type: 'friend', sub_type: 'recall' },
  offline_file: { notice_type: 'friend', sub_type: 'offline_file' },
  client_status: { notice_type: 'client', sub_type: 'status' },
  group_admin: { notice_type: 'group', sub_type: 'admin' },
  group_ban: { notice_type: 'group', sub_type: 'ban' },
  group_card: { notice_type: 'group', sub_type: 'card' },
  group_upload: { notice_type: 'group', sub_type: 'upload' },
  group_decrease: { notice_type: 'group', sub_type: 'decrease' },
  group_increase: { notice_type: 'group', sub_type: 'increase' },
  group_msg_emoji_like: { notice_type: 'group', sub_type: 'reaction' },
  essence: { notice_type: 'group', sub_type: 'essence' },
  group_recall: { notice_type: 'group', sub_type: 'recall' },
}

const buildUrl = (config: OneBotInstanceConfig): string => {
  const protocol = config.protocol ?? DEFAULT_INSTANCE.protocol
  const host = config.host ?? DEFAULT_INSTANCE.host
  const port = config.port ?? DEFAULT_INSTANCE.port
  const token = config.token ?? ''
  const search = token ? `?access_token=${encodeURIComponent(token)}` : ''
  return `${protocol}://${host}:${port}${search}`
}

const buildMaskedUrl = (config: OneBotInstanceConfig): string => {
  const protocol = config.protocol ?? DEFAULT_INSTANCE.protocol
  const host = config.host ?? DEFAULT_INSTANCE.host
  const port = config.port ?? DEFAULT_INSTANCE.port
  const token = config.token ?? ''
  const search = token ? '?access_token=***' : ''
  return `${protocol}://${host}:${port}${search}`
}

const logMessage = (logger: Logger, data: Record<string, unknown>, event: MessageEvent): void => {
  const msg = stringifyMessage(event.message)
  const sender =
    isObject(data.sender) && typeof data.sender.nickname === 'string'
      ? `${data.sender.nickname}(${event.user_id})`
      : `(${event.user_id})`
  if (event.message_type === 'group') {
    const groupName = typeof data.group_name === 'string' ? data.group_name : ''
    logger.info(`[群:${groupName}(${event.group_id})] ${sender}: ${msg}`)
  } else {
    logger.info(`[私:${sender}] ${msg}`)
  }
}

const logMessageSent = (logger: Logger, data: Record<string, unknown>, event: MessageEvent): void => {
  const msg = stringifyMessage(event.message)
  if (event.message_type === 'group') {
    const groupName = typeof data.group_name === 'string' ? data.group_name : ''
    logger.info(`[>>>:群:${groupName}(${event.group_id})] ${msg}`)
  } else {
    logger.info(`[>>>:私:(${event.user_id})] ${msg}`)
  }
}

const buildNoticeFromOneBot = (
  data: Record<string, unknown>,
): {
  notice_type: string
  sub_type?: string
  action_type?: string
} => {
  if (data.notice_type === 'notify') {
    const mapped =
      data.sub_type === 'poke'
        ? data.group_id
          ? { notice_type: 'group', sub_type: 'poke' }
          : { notice_type: 'friend', sub_type: 'poke' }
        : ONEBOT_NOTICE_NOTIFY_MAP[(data.sub_type as string) ?? '']
    if (mapped) {
      return {
        notice_type: mapped.notice_type,
        sub_type: mapped.sub_type,
        action_type: data.sub_type !== mapped.sub_type ? (data.sub_type as string) : undefined,
      }
    }
  }
  const mapped = ONEBOT_NOTICE_EVENT_MAP[(data.notice_type as string) ?? '']
  if (mapped) {
    return {
      notice_type: mapped.notice_type,
      sub_type: mapped.sub_type,
      action_type: data.sub_type && data.sub_type !== mapped.sub_type ? (data.sub_type as string) : undefined,
    }
  }
  return {
    notice_type: data.notice_type as string,
    sub_type: data.sub_type as string | undefined,
  }
}

const buildAdapter = (
  instance: OneBotInstanceConfig,
  adapterName: string,
  logger: Logger,
  gatewayName: string,
  botLabel: string,
): Adapter => {
  const url = buildUrl(instance)
  const maskedUrl = buildMaskedUrl(instance)
  const dedup = new AdapterEventDeduplicator({ ttl: 60_000, maxSize: 1024 })
  const botData: OneBotData = {
    bot_id: String(0),
    adapter: adapterName,
    nickname: '',
    online: false,
  }
  let bot: OneBot | null = null
  let gateway: OneBotWebSocketGateway | null = null
  let adapterContext: AdapterContext | null = null
  let unregisterBot: (() => void) | null = null
  let unregisterCapabilities: Array<() => void> = []
  let unregisterStatus: (() => void) | null = null
  let sendCount = 0
  let receiveCount = 0

  const handleEvent = async (data: Record<string, unknown>): Promise<void> => {
    if (!bot || !adapterContext) return
    const identity = {
      adapter: adapterName,
      bot_id: bot.bot_id,
      event_type: typeof data.post_type === 'string' ? data.post_type : 'unknown',
      message_id:
        typeof data.message_id === 'number' || typeof data.message_id === 'string'
          ? String(data.message_id)
          : undefined,
      timestamp: typeof data.time === 'number' ? data.time * 1000 : undefined,
    }
    if (dedup.isDuplicate(identity)) return

    if (data.post_type === 'message') {
      receiveCount++
      const event = buildMessageEvent({
        adapter: adapterName,
        bot,
        data: data as Parameters<typeof buildMessageEvent>[0]['data'],
      })
      logMessage(logger, data, event)
      await adapterContext.dispatch(event)
      return
    }
    if (data.post_type === 'message_sent') {
      const event = buildMessageEvent({
        adapter: adapterName,
        bot,
        data: data as Parameters<typeof buildMessageEvent>[0]['data'],
      })
      logMessageSent(logger, data, event)
      await adapterContext.dispatch(event)
      return
    }
    if (data.post_type === 'notice') {
      const mapped = buildNoticeFromOneBot(data)
      const enriched: Record<string, unknown> = {
        ...data,
        notice_type: mapped.notice_type,
        sub_type: mapped.sub_type ?? data.sub_type,
        action_type: mapped.action_type ?? data.action_type,
      }
      await adapterContext.dispatch(
        buildNoticeEvent({
          adapter: adapterName,
          bot,
          data: enriched as Parameters<typeof buildNoticeEvent>[0]['data'],
        }),
      )
      return
    }
    if (data.post_type === 'request') {
      await adapterContext.dispatch(
        buildRequestEvent({
          adapter: adapterName,
          bot,
          api: gateway!.call,
          data: data as Parameters<typeof buildRequestEvent>[0]['data'],
        }),
      )
      return
    }
    if (data.post_type === 'meta_event') {
      await adapterContext.dispatch(
        buildMetaEvent({
          adapter: adapterName,
          bot,
          data: data as Parameters<typeof buildMetaEvent>[0]['data'],
        }),
      )
      return
    }
  }

  const registerBotCapabilities = (ctx: AdapterContext, currentBot: OneBot): void => {
    unregisterBot = ctx.registerBot(currentBot).unregister
    unregisterCapabilities = [
      ctx.registerCapability(messageSend, { adapter: adapterName, bot_id: currentBot.bot_id }, async (req) =>
        currentBot.sendMessage(req.target, req.message),
      ),
      ctx.registerCapability(messageRecall, { adapter: adapterName, bot_id: currentBot.bot_id }, async (req) => {
        await currentBot.recallMessage(req.message_id)
      }),
      ctx.registerCapability(messageGet, { adapter: adapterName, bot_id: currentBot.bot_id }, async (req) =>
        currentBot.getMessage(req.message_id),
      ),
      ctx.registerCapability(messageGetForward, { adapter: adapterName, bot_id: currentBot.bot_id }, async (req) =>
        currentBot.getForwardMessage(req.message_id),
      ),
      ctx.registerCapability(memberBan, { adapter: adapterName, bot_id: currentBot.bot_id }, async (req) => {
        await currentBot.banMember(req.group_id, req.user_id, req.duration)
      }),
      ctx.registerCapability(memberKick, { adapter: adapterName, bot_id: currentBot.bot_id }, async (req) => {
        await currentBot.kickMember(req.group_id, req.user_id)
      }),
      ctx.registerCapability(memberSetCard, { adapter: adapterName, bot_id: currentBot.bot_id }, async (req) => {
        await currentBot.setMemberCard(req.group_id, req.user_id, req.card)
      }),
      ctx.registerCapability(memberSetAdmin, { adapter: adapterName, bot_id: currentBot.bot_id }, async (req) => {
        await currentBot.setMemberAdmin(req.group_id, req.user_id, req.enable)
      }),
      ctx.registerCapability(memberGetInfo, { adapter: adapterName, bot_id: currentBot.bot_id }, async (req) =>
        currentBot.getMemberInfo(req.group_id, req.user_id),
      ),
      ctx.registerCapability(groupGetInfo, { adapter: adapterName, bot_id: currentBot.bot_id }, async (req) =>
        currentBot.getGroupInfo(req.group_id),
      ),
      ctx.registerCapability(groupGetMembers, { adapter: adapterName, bot_id: currentBot.bot_id }, async (req) =>
        currentBot.getGroupMembers(req.group_id),
      ),
      ctx.registerCapability(groupLeave, { adapter: adapterName, bot_id: currentBot.bot_id }, async (req) => {
        await currentBot.leaveGroup(req.group_id, req.is_dismiss)
      }),
      ctx.registerCapability(groupSetName, { adapter: adapterName, bot_id: currentBot.bot_id }, async (req) => {
        await currentBot.setGroupName(req.group_id, req.group_name)
      }),
      ctx.registerCapability(groupSetPortrait, { adapter: adapterName, bot_id: currentBot.bot_id }, async (req) => {
        await currentBot.setGroupPortrait(req.group_id, req.file)
      }),
      ctx.registerCapability(groupGetList, { adapter: adapterName, bot_id: currentBot.bot_id }, async () =>
        (await currentBot.getGroupList()).map((g) => ({
          ...g,
          group_id: String(g.group_id),
        })),
      ),
      ctx.registerCapability(friendGetInfo, { adapter: adapterName, bot_id: currentBot.bot_id }, async (req) =>
        currentBot.getFriendInfo(req.user_id),
      ),
      ctx.registerCapability(friendDelete, { adapter: adapterName, bot_id: currentBot.bot_id }, async (req) => {
        await currentBot.deleteFriend(req.user_id)
      }),
      ctx.registerCapability(friendGetList, { adapter: adapterName, bot_id: currentBot.bot_id }, async () =>
        (await currentBot.getFriendList()).map((f) => ({
          ...f,
          user_id: String(f.user_id),
        })),
      ),
      ctx.registerCapability(conversationGetHistory, { adapter: adapterName, bot_id: currentBot.bot_id }, async (req) =>
        currentBot.getHistory(req.target, req.before, req.limit, req.extra),
      ),
      ctx.registerCapability(memberPoke, { adapter: adapterName, bot_id: currentBot.bot_id }, async (req) => {
        await currentBot.sendApi('group_poke', { group_id: req.group_id, user_id: req.user_id })
      }),
      ctx.registerCapability(memberSetTitle, { adapter: adapterName, bot_id: currentBot.bot_id }, async (req) => {
        await currentBot.sendApi('set_group_special_title', {
          group_id: req.group_id,
          user_id: req.user_id,
          special_title: req.title,
        })
      }),
      ctx.registerCapability(groupSetWholeBan, { adapter: adapterName, bot_id: currentBot.bot_id }, async (req) => {
        await currentBot.sendApi('set_group_whole_ban', { group_id: req.group_id, enable: req.enable })
      }),
      ctx.registerCapability(reactionSet, { adapter: adapterName, bot_id: currentBot.bot_id }, async (req) => {
        await currentBot.sendApi('set_msg_emoji_like', {
          message_id: String(req.message_id),
          emoji_id: Number(req.emoji_id),
          set: req.set ?? true,
        })
      }),
      ctx.registerCapability(forwardSend, { adapter: adapterName, bot_id: currentBot.bot_id }, async (req) => {
        const payload = req.nodes.map((node) => ({
          type: 'node',
          data: {
            user_id: node.user_id,
            nickname: node.nickname,
            content: buildPayload(node.content),
          },
        }))
        const common: Record<string, unknown> = {
          messages: payload,
          ...(req.source ? { source: req.source } : {}),
          ...(req.news && req.news.length > 0 ? { news: req.news } : {}),
          ...(req.summary ? { summary: req.summary } : {}),
        }
        const action = req.target.type === 'group' ? 'send_group_forward_msg' : 'send_private_forward_msg'
        const idKey = req.target.type === 'group' ? 'group_id' : 'user_id'
        const sent = await currentBot.sendApi<{ message_id?: number | string }>(action, {
          [idKey]: req.target.group_id ?? req.target.user_id,
          ...common,
        })
        return sentFromOneBot(sent)
      }),
      ctx.registerCapability(profileSet, { adapter: adapterName, bot_id: currentBot.bot_id }, async (req) => {
        const params: Record<string, unknown> = {}
        if (req.nickname != null) params.nickname = req.nickname
        if (req.personal_note != null) params.personal_note = req.personal_note
        if (req.sex != null) params.sex = req.sex
        for (const [key, value] of Object.entries(req)) {
          if (!(key in params) && key !== 'nickname' && key !== 'personal_note' && key !== 'sex') {
            params[key] = value
          }
        }
        if (Object.keys(params).length > 0) await currentBot.sendApi('set_qq_profile', params)
      }),
      ctx.registerCapability(avatarSet, { adapter: adapterName, bot_id: currentBot.bot_id }, async (req) => {
        await currentBot.sendApi('set_qq_avatar', { file: req.file })
      }),
      ctx.registerCapability(botStatus, { adapter: adapterName, bot_id: currentBot.bot_id }, async () => {
        const [status, version] = await Promise.all([
          currentBot.sendApi<Record<string, unknown>>('get_status').catch(() => null),
          currentBot.getVersionInfo().catch(() => null),
        ])
        return {
          online: Boolean(status?.online ?? currentBot.online),
          app_name: version?.app_name,
          app_version: version?.app_version,
          protocol_version: version?.protocol_version,
          ...status,
        }
      }),
    ]
  }

  const ensureBot = async (): Promise<void> => {
    if (!adapterContext || !gateway) throw new Error('OneBot adapter is not initialized')
    const loginInfo = await gateway.call<{ user_id: number | string; nickname: string }>('get_login_info')
    let appName = ''
    let appVersion = ''
    try {
      const versionInfo = await gateway.call<{ app_name: string; app_version: string }>('get_version_info')
      appName = versionInfo.app_name
      appVersion = versionInfo.app_version
    } catch {
      // ignore
    }
    botData.bot_id = String(loginInfo.user_id)
    botData.nickname = loginInfo.nickname
    botData.connected_at = Date.now()
    if (!bot) {
      bot = bindCapabilities(
        createOneBot({ data: botData, api: gateway.call, logger, onSend: () => sendCount++ }),
        adapterContext.getCapabilityRegistry(),
      )
      registerBotCapabilities(adapterContext, bot)
    }
    if (!botData.online) {
      botData.online = true
      logger.info(
        `已连接到 ${colors.cyan(botLabel)}: ${colors.green(`${appName}-v${appVersion} ${loginInfo.nickname}(${botData.bot_id})`)}`,
      )
      await adapterContext.emitLifecycle({ type: 'bot:connected', bot })
    }
  }

  const handleLifecycleFromMeta = async (data: Record<string, unknown>): Promise<void> => {
    if (data.post_type !== 'meta_event' || data.meta_event_type !== 'lifecycle' || data.sub_type !== 'connect') return
    try {
      await ensureBot()
    } catch (err) {
      logger.warn(`Lifecycle connect handler failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const handleConnect = async (_connection: WebSocketConnection): Promise<void> => {
    await ensureBot()
  }

  const handleClose = async (): Promise<void> => {
    if (bot && botData.online) {
      botData.online = false
      await adapterContext?.emitLifecycle({ type: 'bot:disconnected', bot, reason: 'connection closed' })
    }
  }

  return {
    name: adapterName,
    version: '1.0.0',
    async start(context: AdapterContext): Promise<void> {
      adapterContext = context
      const driver = context.getDriver()
      logger.info(`>>> 正在连接 ${colors.cyan(botLabel)}: ${colors.green(maskedUrl)}`)
      const handlers = {
        async onMessage(payload: unknown): Promise<void> {
          if (!payload || typeof payload !== 'object') return
          const obj = payload as Record<string, unknown>
          if (obj.post_type === 'meta_event') {
            await handleLifecycleFromMeta(obj)
          }
          await handleEvent(obj)
        },
        onOpen(connection: WebSocketConnection): Promise<void> {
          return handleConnect(connection)
        },
        onClose(code: number, reason: string): Promise<void> {
          logger.warn(`OneBot WS closed (code=${code}, reason=${reason})`)
          return handleClose()
        },
        onError(err: Error): Promise<void> {
          logger.error(`OneBot WS error: ${err.message}`)
          return Promise.resolve()
        },
      }
      gateway = new OneBotWebSocketGateway(
        {
          name: gatewayName,
          url,
          ws: driver.websocket,
          logger,
          reconnect: instance.reconnect ?? DEFAULT_INSTANCE.reconnect,
          reconnectInterval: instance.reconnectInterval ?? DEFAULT_INSTANCE.reconnectInterval,
          maxReconnectAttempts: instance.maxReconnectAttempts ?? DEFAULT_INSTANCE.maxReconnectAttempts,
          maxReconnectInterval: instance.maxReconnectInterval ?? DEFAULT_INSTANCE.maxReconnectInterval,
          headers: instance.headers,
        },
        handlers,
      )
      const statusProvider = createOneBotStatusProvider(() => ({ send: sendCount, receive: receiveCount }))
      unregisterStatus = registerStatusProvider(adapterName, ({ bot: currentBot }: { bot: Bot }) =>
        statusProvider({ bot: currentBot as OneBot }),
      )
      context.registerGateway(gateway)
    },
    async stop(reason?: string): Promise<void> {
      if (bot && botData.online) {
        botData.online = false
        try {
          await adapterContext?.emitLifecycle({ type: 'bot:disconnected', bot, reason: reason ?? 'stop' })
        } catch (err) {
          logger.warn(`Failed to emit bot:disconnected: ${err instanceof Error ? err.message : String(err)}`)
        }
      }
      if (gateway) {
        await gateway.stop(reason)
        gateway = null
      }
      unregisterStatus?.()
      unregisterStatus = null
      for (const dispose of unregisterCapabilities) dispose()
      unregisterCapabilities = []
      unregisterBot?.()
      unregisterBot = null
      bot = null
      dedup.clear()
    },
  }
}

const ADAPTER_NAME = 'onebotv11' as string

export const oneBotAdapterDefinition = defineAdapter<OneBotAdapterConfig>({
  name: ADAPTER_NAME,
  version: '1.0.0',
  apiVersion: 1,
  validateConfig: (config): OneBotAdapterConfig => {
    const instances = normalizeInstances(config)
    if (instances.length === 0) {
      throw new Error('onebotv11.instances must contain at least one instance')
    }
    return { instances: instances.map((instance) => ({ ...DEFAULT_INSTANCE, ...instance })) }
  },
  create: (options: AdapterFactoryOptions<OneBotAdapterConfig>): Adapter => {
    const instances = [...options.config.instances]
    const adapters = instances.map((instance, index) =>
      buildAdapter(instance, ADAPTER_NAME, options.logger, `${ADAPTER_NAME}.gateway.${index + 1}`, `Bot${index + 1}`),
    )
    return {
      name: ADAPTER_NAME,
      version: '1.0.0',
      async start(context: AdapterContext): Promise<void> {
        for (const adapter of adapters) {
          await adapter.start(context)
        }
      },
      async stop(reason?: string): Promise<void> {
        for (let i = adapters.length - 1; i >= 0; i--) {
          await adapters[i].stop(reason)
        }
      },
    }
  },
})

export { buildNoticeFromOneBot }
export type { Event, Capability }
