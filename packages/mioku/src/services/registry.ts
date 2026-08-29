import { getOrCreate } from '../internal/registry'

const services = getOrCreate<Record<string, unknown>>('services-registry', () => ({}))

/** 按名称索引的服务注册表 */
export interface MiokuServices {
  [key: string]: unknown
}

/** 全局服务注册表实例，已加载的服务都注册在这里 */
export const servicesRegistry = services

/** 按名称取服务，不存在时返回 undefined */
export const getService = <T = unknown>(name: string): T | undefined => services[name] as T | undefined

/**
 * 注册服务并返回移除该服务的函数。
 * cover 为 false 且同名服务已存在时跳过注册。
 */
export const setService = <T = unknown>(name: string, value: T, cover: boolean = true): () => void => {
  if (cover || !services[name]) {
    services[name] = value
  }
  return () => {
    delete services[name]
  }
}

/** setService 的别名 */
export const addService = <T = unknown>(name: string, value: T, cover: boolean = true): (() => void) => {
  return setService(name, value, cover)
}

/** 惰性创建服务的工厂函数 */
export type ServiceFactory<T> = () => T