import { ConfigLoader } from "fasset-indexer-core"


export class ApiConfigLoader extends ConfigLoader {

  get port(): number {
    return parseInt(process.env.API_PORT ?? '3000', 10)
  }

  get rootPath(): string {
    const path = process.env.API_ROOT_PATH ?? ''
    if (path.endsWith('/')) {
      return path.slice(0, -1)
    }
    return path
  }

}