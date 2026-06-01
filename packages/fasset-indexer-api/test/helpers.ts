import 'reflect-metadata'
import { Test, TestingModule } from '@nestjs/testing'
import { CacheModule } from '@nestjs/cache-manager'
import type { INestApplication, Type } from '@nestjs/common'
import { expect } from 'chai'
import supertest from 'supertest'


type ServiceMap = Record<string, Type<any>>

export type ApiHarness = {
  app: INestApplication
  request: () => supertest.SuperTest<supertest.Test>
  services: Record<string, any>
  close: () => Promise<void>
}

export async function buildController(
  controller: Type<any>,
  serviceClasses: ServiceMap
): Promise<ApiHarness> {
  const services: Record<string, any> = {}
  for (const key of Object.keys(serviceClasses)) {
    services[key] = {}
  }

  const moduleRef: TestingModule = await Test.createTestingModule({
    imports: [CacheModule.register({ ttl: 0, max: 1000 })],
    controllers: [controller],
    providers: Object.entries(serviceClasses).map(([key, cls]) => ({
      provide: cls,
      useValue: services[key]
    }))
  }).compile()

  const app = moduleRef.createNestApplication({ logger: false })
  await app.init()

  return {
    app,
    request: () => supertest(app.getHttpServer()) as unknown as supertest.SuperTest<supertest.Test>,
    services,
    async close() { await app.close() }
  }
}

export function expectOk<T = any>(res: supertest.Response, expectedStatus = 200): T {
  expect(res.status, `unexpected http status\nbody: ${JSON.stringify(res.body)}`).to.equal(200)
  expect(res.body, 'missing api envelope').to.be.an('object')
  expect(res.body.status, 'envelope status').to.equal(expectedStatus)
  expect(res.body.error, `expected no error, got ${res.body.error}`).to.be.undefined
  return res.body.data as T
}

export function expectError(res: supertest.Response, status = 500): string | undefined {
  expect(res.status, 'unexpected http status').to.equal(200)
  expect(res.body.status, 'envelope status').to.equal(status)
  expect(res.body.error, 'expected error').to.be.a('string')
  return res.body.error
}

export function expectNestParseError(res: supertest.Response, status = 400): void {
  expect(res.status).to.equal(status)
}

export function stubMethod<T>(target: any, name: string, impl: (...args: any[]) => T | Promise<T>): void {
  target[name] = impl
}

export function stubResolve<T>(target: any, name: string, value: T): void {
  target[name] = async () => value
}

export function stubReject(target: any, name: string, reason: any): void {
  target[name] = async () => { throw reason instanceof Error ? reason : new Error(String(reason)) }
}
