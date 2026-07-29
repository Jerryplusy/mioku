import type { MiokiContext } from "mioki";

export interface ServiceRef<T> {
  readonly id: string;
}

export function defineService<T>(id: string): ServiceRef<T> {
  return { id };
}

export function getService<T>(
  ctx: MiokiContext,
  ref: ServiceRef<T>,
): T | undefined {
  return ctx.services[ref.id] as T | undefined;
}

export function requireService<T>(
  ctx: MiokiContext,
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

export function hasService<T>(
  ctx: MiokiContext,
  ref: ServiceRef<T>,
): boolean {
  return ctx.services[ref.id] !== undefined;
}