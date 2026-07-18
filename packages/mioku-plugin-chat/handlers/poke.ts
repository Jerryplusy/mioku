import type { ChatPluginContext, ChatHandlerState } from "../context";
import type { TargetMessage } from "../types";
import { getBotRole, isGroupAllowed } from "../utils";
import { buildStructuredUserInputFromTarget } from "../manage/group-structured-history";
import { POKE_COOLDOWN_MS } from "./message";

export function createPokeHandler(
  pluginCtx: ChatPluginContext,
  state: ChatHandlerState,
) {
  const { ctx } = pluginCtx;
  const { getConfig, runtimeState, pokeCooldowns } = state;

  return async (e: any) => {
    if (e.target_id !== e.self_id) return;
    const groupId = e.group_id;
    const cfg = groupId ? await getConfig(groupId) : await getConfig();
    if (!cfg.apiKey) return;
    if (!groupId || !isGroupAllowed(groupId, cfg)) return;

    const lastPoke = pokeCooldowns.get(groupId) ?? 0;
    if (Date.now() - lastPoke < POKE_COOLDOWN_MS) return;
    pokeCooldowns.set(groupId, Date.now());

    const groupSessionId = `group:${groupId}`;
    if (runtimeState.isRateLimitBlocked()) return;

    const processingSet = runtimeState.processingSet;
    if (processingSet.has(groupSessionId)) {
      if (!runtimeState.isRateLimitBlocked()) {
        pluginCtx.queueManager.enqueue(groupSessionId, e, cfg);
      }
      return;
    }

    processingSet.add(groupSessionId);
    pluginCtx.sessionManager.getOrCreate(groupSessionId, "group", groupId);

    try {
      const userId = e.user_id || e.operator_id;
      const botRole = await getBotRole(groupId, ctx, e.self_id);
      const botNickname =
        cfg.nicknames[0] || ctx.pickBot(e.self_id).nickname || "Bot";

      let senderName = String(userId);
      try {
        const memberInfo = await ctx
          .pickBot(e.self_id)
          .getGroupMemberInfo(groupId, userId);
        senderName =
          (memberInfo as any).card ||
          (memberInfo as any).nickname ||
          String(userId);
      } catch {}

      const targetMessage: TargetMessage = {
        userName: senderName,
        userId,
        userRole: "member",
        content: `[${senderName} poked you]`,
        timestamp: Date.now(),
      };

      const { history } = await pluginCtx.getGroupHistoryMessages(
        groupId,
        groupSessionId,
        ctx,
        cfg.historyCount,
        pluginCtx.db,
        e.self_id,
        pluginCtx.buildHistoryMediaOptions(pluginCtx.aiInstance, cfg),
      );
      const { groupName, memberCount } = await pluginCtx.getGroupInfoData(
        ctx,
        groupId,
        e.self_id,
      );

      const toolCtx = pluginCtx.buildToolContext({
        ctx,
        event: e,
        groupSessionId,
        groupId,
        userId,
        config: cfg,
        aiService: pluginCtx.aiService,
        db: pluginCtx.db,
        botRole,
        humanize: pluginCtx.humanize,
        targetMessage,
        selfId: e.self_id,
      });

      const result = await pluginCtx.runWithRateLimitGuard(
        () =>
          pluginCtx.runChat(
            pluginCtx.aiInstance,
            toolCtx,
            history,
            targetMessage,
            {
              config: cfg,
              groupName,
              memberCount,
              botNickname,
              botRole,
              aiService: pluginCtx.aiService,
              isGroup: true,
              replyContext: {
                type: "poked",
                targetUser: targetMessage.userName,
                targetMessage: targetMessage.content,
              },
            },
            pluginCtx.humanize,
            pluginCtx.skillManager,
            {
              manager: pluginCtx.groupStructuredHistory,
              ttlMs: cfg.groupStructuredHistoryTtlMs,
              currentUserInputs: [
                buildStructuredUserInputFromTarget(targetMessage),
              ],
            },
          ),
        { userId, groupId, label: "poke" },
      );
      if (!result) return;

      await pluginCtx.sendAIResponse(
        {
          ctx,
          groupId,
          messages: result.messages,
          config: cfg,
          sentIndices: toolCtx.sentMessageIndices,
        },
        e.self_id,
      );

      const now = Date.now();
      pluginCtx.saveBotMessages(
        groupId,
        groupSessionId,
        result.messages,
        now,
        cfg,
        pluginCtx.db,
        ctx,
        e.self_id,
      );
      pluginCtx.idleCheckManager.recordBotMessages(
        groupSessionId,
        result.messages.length,
        e.self_id,
      );

      await pluginCtx.sendEmoji(ctx, groupId, result.emojiPath, e.self_id);
      pluginCtx.sessionManager.touch(groupSessionId);
    } catch (err) {
      ctx.logger.error(`Poke processing failed: ${err}`);
    } finally {
      processingSet.delete(groupSessionId);
    }
  };
}
