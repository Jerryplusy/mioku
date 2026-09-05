import util from "node:util";
import log4js from "log4js";
import type { Logger } from "mioku";
import type { LoggingEvent } from "log4js";

let target: Logger | null = null;

/** log4js 事件按级别转发到 mioku logger，未桥接时丢弃 */
const route = (event: LoggingEvent): void => {
  const logger = target;
  if (!logger) return;
  const message = util.format(...event.data);
  const level = event.level.levelStr;
  if (level === "ERROR" || level === "FATAL") logger.error(message);
  else if (level === "WARN") logger.warn(message);
  else if (level === "DEBUG") logger.debug(message);
  else if (level === "TRACE") logger.trace(message);
  else logger.info(message); // INFO / MARK / LOG
};

/** 把 icqq 内部的 log4js 日志重定向到 mioku logger，输出统一走 mioku 的格式与日志文件 */
export const bridgeIcqqLog4js = (logger: Logger): void => {
  target = logger;
  log4js.configure({
    appenders: {
      mioku: {
        type: { configure: () => route },
      },
    },
    categories: { default: { appenders: ["mioku"], level: "all" } },
  });
};
