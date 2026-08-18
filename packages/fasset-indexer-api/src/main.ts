import helmet from 'helmet'
import { NestFactory } from '@nestjs/core'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { FAssetIndexerModule } from './app.module'
import { ApiConfigLoader } from './config/config'

let apiDocPath = 'api-doc'

async function bootstrap() {
  const apiConfig = new ApiConfigLoader()
  const app = await NestFactory.create(FAssetIndexerModule)
  if (apiConfig.rootPath !== '') {
    app.setGlobalPrefix(apiConfig.rootPath)
    apiDocPath = `${apiConfig.rootPath}/${apiDocPath}`
  }
  const config = new DocumentBuilder()
    .setTitle('FAsset Indexer Api')
    .setDescription('Api for the FAsset indexer')
    .setVersion('1.0')
    .build()
  const document = SwaggerModule.createDocument(app, config)
  SwaggerModule.setup(apiDocPath, app, document)
  await app.use(helmet()).listen(apiConfig.port)
}

bootstrap()
