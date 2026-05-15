import { resolve } from "path"
import type { ContractInfo } from "./interface"

export function getContractInfo(chain: string, file?: string, deployment?: string): ContractInfo[] {
  if (file !== undefined) {
    return require(resolve(file))
  }
  const suffix = deployment != null && deployment !== '' ? `-${deployment}` : ''
  return require(`../../chain/${chain}${suffix}.json`)
}