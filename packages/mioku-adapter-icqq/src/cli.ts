#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import consola from "consola";

import type { ConfirmPromptOptions, TextPromptOptions } from "consola";

type ConfirmOpts = Omit<ConfirmPromptOptions, "type" | "required"> & { required?: boolean };
type TextOpts = Omit<TextPromptOptions, "type" | "required"> & { required?: boolean };

const confirm = async (message: string, options?: ConfirmOpts): Promise<boolean> =>
  (await consola.prompt(message, { type: "confirm", cancel: "reject", ...options })) as boolean;

const input = async (message: string, options?: TextOpts): Promise<string> => {
  let result: string;
  do {
    result = (await consola.prompt(message, { type: "text", cancel: "reject", ...options })) as string;
    if (options?.required && !result) continue;
    break
  } while (true)
  return result
}

export interface IcqqCliContext {
  readonly cwd: string
  readonly logger?: typeof consola
}

export interface IcqqInstanceInput {
  uin: number
  password?: string
  ver?: string
  sign_api_addr?: string
  ignore_self?: boolean
}

export interface IcqqCliConfig {
  instances: IcqqInstanceInput[]
}

export const run = async (ctx: IcqqCliContext): Promise<IcqqCliConfig> => {
  const log = ctx.logger ?? consola
  log.info(`正在配置 icqq 适配器连接参数`)
  log.info('')

  const instances: IcqqInstanceInput[] = []
  let addMore = true
  while (addMore) {
    const uinRaw = await input('QQ 号 (uin)', { required: true, placeholder: '请输入 QQ 号' })
    const uin = Math.floor(Number(uinRaw))
    if (!Number.isFinite(uin) || uin <= 0) {
      log.error('QQ 号格式无效，请重新输入')
      continue
    }
    const password = await input('QQ 密码 (可空，留空将使用扫码/滑块登录)', {
      placeholder: '可空',
    })
    const ver = await input('icqq 协议版本 (可空，如 9.2.90)', {
      placeholder: '可空',
    })
    const signApiAddr = await input('qsign /sign 地址 (可空，如 http://127.0.0.1:8080/sign?key=xxx)', {
      placeholder: '可空',
    })
    const ignoreSelf = await confirm('忽略自己账号发送的消息？', { initial: true })

    const instance: IcqqInstanceInput = { uin }
    if (password) instance.password = password
    if (ver) instance.ver = ver
    if (signApiAddr) instance.sign_api_addr = signApiAddr
    if (!ignoreSelf) instance.ignore_self = false
    instances.push(instance)
    addMore = await confirm('是否继续添加连接实例？', { initial: false })
    if (addMore) log.info('')
  }

  return { instances }
}

const isRunningAsMain = (): boolean => {
  if (!process.argv[1]) return false
  try {
    return import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
  } catch {
    return false
  }
}

if (isRunningAsMain()) {
  void (async () => {
    const cwd = process.cwd()
    const pkgPath = path.join(cwd, 'package.json')
    if (!fs.existsSync(pkgPath)) {
      consola.error('未找到 package.json，请在机器人项目根目录运行此向导')
      process.exit(1)
    }
    const config = await run({ cwd })
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as { mioku?: Record<string, unknown> }
    pkg.mioku = pkg.mioku ?? {}
    const adapters = (pkg.mioku.adapters as Record<string, unknown> | undefined) ?? {}
    pkg.mioku.adapters = { ...adapters, icqq: config }
    fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf-8')
    consola.success('已写入 icqq 适配器配置')
  })()
}

export default run
