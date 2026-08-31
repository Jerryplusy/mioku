import type { AdapterStatus } from "mioku";
import type { OneBot } from "./bot";

export const createOneBotStatusProvider = (
  getStats: () => { send: number; receive: number } = () => ({
    send: 0,
    receive: 0,
  }),
): ((ctx: { bot: OneBot }) => Promise<AdapterStatus>) => {
  return async ({ bot }) => {
    const counters = getStats();
    const traffic = { sent: counters.send, received: counters.receive };
    try {
      const [versionInfo, friendList, groupList] = await Promise.all([
        bot.getVersionInfo(),
        bot.getFriendList(),
        bot.getGroupList(),
      ]);
      return {
        adapter: "onebotv11",
        bot_id: bot.bot_id,
        impl: versionInfo.app_name,
        version: versionInfo.app_version,
        protocol: versionInfo.protocol_version,
        stats: {
          friends: friendList.length,
          groups: groupList.length,
          ...traffic,
        },
        data: {
          app_name: versionInfo.app_name,
          protocol_version: versionInfo.protocol_version,
        },
      };
    } catch {
      return {
        adapter: "onebotv11",
        bot_id: bot.bot_id,
        stats: traffic,
        data: {},
      };
    }
  };
};
