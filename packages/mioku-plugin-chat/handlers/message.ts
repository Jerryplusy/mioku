import type { ChatPluginContext, ChatHandlerState } from "../context";
import {
  isGroupAllowed,
  shouldTrigger,
  isQuotingBot,
  buildChatMessageFromEvent,
} from "../utils";
import {
  buildHistoryMediaProcessingOptions,
  getCardData,
  getForwardId,
  getSegmentUrl,
  getVideoSourceCandidatesFromMessage,
  isMediaAnalysisBlocked,
} from "../core/media/segment";
import {
  getSegmentSourceCandidates,
  summarizeGroupNotice,
  summarizeHistoryCard,
  summarizeHistoryForward,
  summarizeHistoryVideo,
} from "../core/media/history-media";
import { handleIdleCheckDebug } from "./idle-debug";
import { processChat } from "../core/chat-turn";

const POKE_COOLDOWN_MS = 10 * 60_000;

export function createMessageHandler(
  pluginCtx: ChatPluginContext,
  state: ChatHandlerState,
) {
  const { ctx } = pluginCtx;
  const { getConfig, matchMessageCommands, runtimeState } = state;

  return async (e: any) => {
    const cfg = await getConfig();
    if (!cfg.apiKey) return;
    if (!e?.message || !Array.isArray(e.message)) return;

    const text = ctx.text(e) || "";
    const isGroup = e.message_type === "group";
    const groupId: number | undefined = isGroup ? e.group_id : undefined;
    const userId: number = e.user_id || e.sender?.user_id;

    if (userId === e.self_id) return;

    if (matchMessageCommands && matchMessageCommands(text).length > 0) return;

    if (text.startsWith("/空闲检查 ")) {
      await handleIdleCheckDebug(pluginCtx, e, cfg);
      return;
    }

    if (text === "/重置会话") {
      if (groupId) {
        pluginCtx.sessionManager.resetBotMessages(`group:${groupId}`);
        pluginCtx.groupStructuredHistory.clear(`group:${groupId}`);
        await e.reply("已清除本群会话中 AI 发送的消息~");
      } else {
        pluginCtx.sessionManager.resetBotMessages(`personal:${userId}`);
        pluginCtx.groupStructuredHistory.clear(`personal:${userId}`);
        await e.reply("已清除你的个人会话中 AI 发送的消息~");
      }
      return;
    }

    if (groupId && !isGroupAllowed(groupId, cfg)) return;

    // 媒体分析
    if (isGroup && groupId && e.message && !isMediaAnalysisBlocked(cfg, userId)) {
      const ai = pluginCtx.aiService.getDefault();
      const bot = ctx.pickBot(e.self_id) as any;
      const mediaOptions = ai
        ? buildHistoryMediaProcessingOptions(
            ai,
            cfg,
            pluginCtx.db,
            bot,
            groupId,
            {
              info: (m) => ctx.logger.info(m),
              warn: (m) => ctx.logger.warn(m),
              error: (m) => ctx.logger.error(m),
            },
            (request) =>
              pluginCtx.runWithRateLimitGuard(request, {
                userId,
                groupId,
                label: "history-media",
              }),
          )
        : undefined;

      if (ai && cfg.enableMediaRecognition) {
        const { processImage } = await import("../core/media/image-analyzer");
        for (const seg of e.message) {
          if (seg.type === "image") {
            const imageUrl = getSegmentUrl(seg);
            if (imageUrl) {
              processImage(ai, imageUrl, cfg.multimodalWorkingModel, pluginCtx.db, {
                runAIRequest: (request) =>
                  pluginCtx.runWithRateLimitGuard(request, {
                    userId,
                    groupId,
                    label: "image-analysis",
                  }),
                allowedCharacters:
                  cfg.emoji?.characters && cfg.emoji.characters.length > 0
                    ? cfg.emoji.characters
                    : undefined,
              }).catch((err) =>
                ctx.logger.error(`[image-analyzer] Failed: ${err}`),
              );
            }
          } else if (seg.type === "video" && mediaOptions) {
            const videoSources = [
              ...getSegmentSourceCandidates(seg),
              ...(await getVideoSourceCandidatesFromMessage(
                bot,
                e.message_id,
              ).catch(() => [])),
            ];
            if (videoSources.length > 0) {
              summarizeHistoryVideo(videoSources, mediaOptions).catch((err) =>
                ctx.logger.error(
                  `[history-media] Failed to process video: ${err}`,
                ),
              );
            }
          }
        }
      }

      if (mediaOptions) {
        for (const seg of e.message) {
          if (seg.type === "forward") {
            const forwardId = getForwardId(seg);
            if (forwardId) {
              summarizeHistoryForward(forwardId, mediaOptions).catch((err) =>
                ctx.logger.error(
                  `[history-media] Failed to process forward: ${err}`,
                ),
              );
            }
          } else if (["xml", "json", "lightapp", "ark"].includes(seg.type)) {
            const cardData = getCardData(seg);
            if (cardData) {
              summarizeHistoryCard(cardData, mediaOptions).catch((err) =>
                ctx.logger.error(
                  `[history-media] Failed to process card: ${err}`,
                ),
              );
            }
          }
        }
        if (e.sub_type === "notice") {
          summarizeGroupNotice(e, mediaOptions)
            .then((noticeMessage) => {
              if (!noticeMessage) return;
              pluginCtx.db.saveMessage({
                sessionId: `group:${groupId}`,
                role: "user",
                content: noticeMessage.content,
                userId: noticeMessage.userId,
                userName: noticeMessage.userName,
                userRole: noticeMessage.userRole,
                groupId,
                groupName: e.group_name,
                timestamp: noticeMessage.timestamp,
                messageId: noticeMessage.messageId,
              });
            })
            .catch((err) =>
              ctx.logger.error(
                `[history-media] Failed to process group notice: ${err}`,
              ),
            );
        }
      }
    }

    if (isGroup && groupId) {
      const learnSessionId = `group:${groupId}`;
      const learnMsg = buildChatMessageFromEvent(e, text, true, groupId);
      const hasText = !!learnMsg.content?.trim();
      const hasMultimodal =
        !!cfg.isMultimodal && !!cfg.multimodalWorkingModel;
      if (hasText || hasMultimodal) {
        pluginCtx
          .recordGroupMessageForLearning(learnMsg, learnSessionId)
          .catch((err) =>
            ctx.logger.error(`[learning] always-on record failed: ${err}`),
          );
      } else {
        pluginCtx.humanize.topicTracker
          .onMessage(learnSessionId)
          .catch((err) =>
            ctx.logger.error(`[topic] window advance failed: ${err}`),
          );
      }
    }

    const atBot = shouldTrigger(e, text, cfg, ctx);
    const quotedBot = isGroup ? await isQuotingBot(e, ctx) : null;
    const mentionedNickname =
      cfg.nicknames.length > 0 &&
      cfg.nicknames.some((n) => text.toLowerCase().includes(n.toLowerCase()));

    const groupSessionId = groupId ? `group:${groupId}` : undefined;

    // 记录群活动
    if (isGroup && groupId && groupSessionId) {
      pluginCtx.idleCheckManager.recordActivity(groupSessionId);

      if (pluginCtx.cooldownManager.isInCooldown(groupSessionId)) {
        pluginCtx.cooldownManager.collectMessage(
          groupSessionId,
          groupId,
          e,
          text,
          atBot,
        );
        return;
      }

      if (pluginCtx.queueProcessor.isInDynamicDelay(groupSessionId)) {
        if (atBot && !runtimeState.isRateLimitBlocked()) {
          pluginCtx.rateLimiter.recordInteraction(groupId, userId);
          pluginCtx.queueProcessor.collectDynamicDelayMessage(groupSessionId, e, text);
        }
        return;
      }
    }

    // 检查是否在处理中
    const processingSet = runtimeState.processingSet;
    if (isGroup && groupId && groupSessionId) {
      if (processingSet.has(groupSessionId)) {
        if ((atBot || mentionedNickname) && !runtimeState.isRateLimitBlocked()) {
          pluginCtx.queueManager.enqueue(groupSessionId, e, cfg);
          pluginCtx.rateLimiter.recordInteraction(groupId, userId);
        }
        return;
      }
      processingSet.add(groupSessionId);
    } else {
      const triggerKey = `personal:${userId}`;
      if (processingSet.has(triggerKey)) return;
      processingSet.add(triggerKey);
    }

    try {
      if (atBot) {
        if (!pluginCtx.rateLimiter.canProcess(userId, groupId, text)) return;

        if (isGroup && groupId && groupSessionId && cfg.dynamicDelay?.enabled) {
          pluginCtx.rateLimiter.recordInteraction(groupId, userId);
          const delayInfo = pluginCtx.rateLimiter.getDelayInfo(groupId);
          if (delayInfo.shouldDelay) {
            pluginCtx.rateLimiter.record(userId, groupId, text);
            pluginCtx.queueProcessor.collectDynamicDelayMessage(
              groupSessionId,
              e,
              text,
            );
            pluginCtx.queueProcessor.startDynamicDelayTimer(
              groupSessionId,
              groupId,
              delayInfo.delayMs,
              e.self_id,
            );
            return;
          }
        }

        pluginCtx.rateLimiter.record(userId, groupId, text);
        await processChat(e, pluginCtx, runtimeState);
        return;
      }

      if (quotedBot || mentionedNickname) {
        const { history } = await pluginCtx.getGroupHistoryMessages(
          groupId!,
          groupSessionId!,
          ctx,
          cfg.historyCount,
          pluginCtx.db,
          e.self_id,
          pluginCtx.buildHistoryMediaOptions(pluginCtx.aiInstance, cfg),
        );
        const botNickname =
          cfg.nicknames[0] || ctx.pickBot(e.self_id).nickname || "Bot";
        const planResult = await pluginCtx.humanize.actionPlanner.plan(
          groupSessionId!,
          botNickname,
          history,
          text,
        );
        if (planResult.action !== "reply") return;
        if (!pluginCtx.rateLimiter.canProcess(userId, groupId, text)) return;
        pluginCtx.rateLimiter.record(userId, groupId, text);
        await processChat(e, pluginCtx, runtimeState);
        return;
      }
    } finally {
      if (isGroup && groupId && groupSessionId) {
        processingSet.delete(groupSessionId);
        await pluginCtx.queueProcessor.processQueuedMessages(
          groupSessionId,
          e.self_id,
        );
      } else {
        processingSet.delete(`personal:${userId}`);
      }
    }
  };
}

// re-exported so poke handler can share the constant if needed
export { POKE_COOLDOWN_MS };
