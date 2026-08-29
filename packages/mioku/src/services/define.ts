import type { MiokuContext } from "../runtime/mioku-context";

/** 服务引用的类型安全句柄，泛型参数对应该服务的实际类型 */
export interface ServiceRef<T> {
  readonly id: string;
}

/** 声明一个服务引用，只记录 id，不查询注册表 */
export function defineService<T>(id: string): ServiceRef<T> {
  return { id };
}

/** 从上下文取服务，未注册时返回 undefined */
export function getService<T>(
  ctx: MiokuContext,
  ref: ServiceRef<T>,
): T | undefined {
  return ctx.services[ref.id] as T | undefined;
}

/** 从上下文取服务，未注册时抛错 */
export function requireService<T>(
  ctx: MiokuContext,
  ref: ServiceRef<T>,
): T {
  const svc = ctx.services[ref.id] as T | undefined;
  if (svc === undefined) {
    throw new Error(
      `[mioku] required service "${ref.id}" is not available`,
    );
  }
  return svc;
}

/** 判断服务是否已注册 */
export function hasService<T>(
  ctx: MiokuContext,
  ref: ServiceRef<T>,
): boolean {
  return ctx.services[ref.id] !== undefined;
}