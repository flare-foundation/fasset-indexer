import type { MikroORM, Options } from '@mikro-orm/core'
import type { AbstractSqlDriver } from '@mikro-orm/knex'

export type ORM = MikroORM<AbstractSqlDriver>

export type DatabaseType = "mysql" | "sqlite" | "postgresql";

export type SchemaUpdate = "none" | "safe" | "full" | "recreate"

export type OrmOptions = Options<AbstractSqlDriver>