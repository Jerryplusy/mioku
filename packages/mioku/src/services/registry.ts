import { getOrCreate } from '../internal/registry'

const services = getOrCreate<Record<string, unknown>>('services-registry', () => ({}))

export interface MiokuServices {
  [key: string]: unknown
}

export const servicesRegistry = services

export const getService = <T = unknown>(name: string): T | undefined => services[name] as T | undefined

export const setService = <T = unknown>(name: string, value: T, cover: boolean = true): () => void => {
  if (cover || !services[name]) {
    services[name] = value
  }
  return () => {
    delete services[name]
  }
}

export const addService = <T = unknown>(name: string, value: T, cover: boolean = true): (() => void) => {
  return setService(name, value, cover)
}

export type ServiceFactory<T> = () => T