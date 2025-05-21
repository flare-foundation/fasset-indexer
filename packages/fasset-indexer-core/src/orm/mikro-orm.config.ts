import { defineConfig, MikroORM } from "@mikro-orm/core"
import { UntrackedAgentVault, Var } from "./entities/state/var"
import { EvmAddress } from "./entities/evm/address"
import { EvmBlock } from "./entities/evm/block"
import { EvmTransaction } from "./entities/evm/transaction"
import { EvmLog } from "./entities/evm/log"
import {
  AgentVaultCreated, AgentSettingChanged, SelfClose,
  VaultCollateralWithdrawalAnnounced, PoolTokenRedemptionAnnounced,
  UnderlyingWithdrawalAnnounced, UnderlyingWithdrawalConfirmed
} from "./entities/events/agent"
import {
  CollateralReserved, MintingExecuted,
  MintingPaymentDefault, CollateralReservationDeleted,
  SelfMint
} from "./entities/events/minting"
import {
  RedemptionRequested, RedemptionPerformed, RedemptionDefault,
  RedemptionPaymentFailed, RedemptionPaymentBlocked, RedemptionRejected,
  RedemptionRequestIncomplete,
  RedeemedInCollateral
} from "./entities/events/redemption"
import {
  AgentInCCB,
  FullLiquidationStarted, LiquidationEnded,
  LiquidationPerformed, LiquidationStarted
} from "./entities/events/liquidation"
import {
  DuplicatePaymentConfirmed, IllegalPaymentConfirmed,
  UnderlyingBalanceTooLow
} from "./entities/events/challenge"
import { CollateralTypeAdded, ERC20Transfer } from "./entities/events/token"
import {
  CollateralPoolClaimedReward, CollateralPoolDonated, CollateralPoolEntered,
  CollateralPoolExited, CollateralPoolPaidOut
} from "./entities/events/collateral-pool"
import {
  RedemptionTicketCreated, RedemptionTicketDeleted, RedemptionTicketUpdated
} from "./entities/events/redemption-ticket"
import { RedemptionTicket } from "./entities/state/redemption-ticket"
import { AgentPing, AgentPingResponse } from "./entities/events/ping"
import { PricePublished, PricesPublished } from "./entities/events/price"
import { CurrentUnderlyingBlockUpdated } from "./entities/events/system"
import {
  CoreVaultRedemptionRequested, ReturnFromCoreVaultCancelled,
  ReturnFromCoreVaultConfirmed, ReturnFromCoreVaultRequested,
  TransferToCoreVaultDefaulted, TransferToCoreVaultStarted,
  TransferToCoreVaultSuccessful
} from "./entities/events/core-vault"
import { CoreVaultManagerCustodianAddressUpdated, CoreVaultManagerPaymentConfirmed, CoreVaultManagerSettingsUpdated, CoreVaultManagerTransferRequestCanceled, CoreVaultManagerTransferRequested, EscrowFinished, CoreVaultManagerEscrowInstructions, CoreVaultManagerNotAllEscrowsProcessed, CoreVaultManagerPaymentInstructions } from "./entities/events/core-vault-manager"
import { AgentVaultInfo, AgentVaultSettings } from "./entities/state/agent"
import { AgentManager, AgentOwner, AgentVault } from "./entities/agent"
import { AssetManagerSettings, CoreVaultManagerSettings } from "./entities/state/settings"
import { FtsoPrice } from "./entities/state/price"
import { TokenBalance } from "./entities/state/balance"
import { UnderlyingBlock } from "./entities/underlying/block"
import { UnderlyingAddress, UnderlyingBalance } from "./entities/underlying/address"
import { UnderlyingReference } from "./entities/underlying/reference"
import { updateSchema } from "./utils"
import { MIN_DATABASE_POOL_CONNECTIONS, MAX_DATABASE_POOL_CONNECTIONS } from "../config/constants"
import type { Options } from "@mikro-orm/core"
import type { AbstractSqlDriver } from "@mikro-orm/knex"
import type { ORM, OrmOptions, SchemaUpdate } from "./interface"


export const ORM_OPTIONS: Options<AbstractSqlDriver> = defineConfig({
  entities: [
    Var, EvmBlock, EvmTransaction, EvmLog, EvmAddress,
    AgentManager, AgentOwner, AgentVault, AgentVaultSettings, AgentVaultInfo,
    AgentVaultCreated, AgentSettingChanged, SelfClose, SelfMint,
    VaultCollateralWithdrawalAnnounced, PoolTokenRedemptionAnnounced,
    UnderlyingWithdrawalAnnounced, UnderlyingWithdrawalConfirmed,
    CollateralReserved, MintingExecuted, MintingPaymentDefault, CollateralReservationDeleted,
    RedemptionRequested, RedemptionPerformed, RedemptionDefault,
    RedemptionPaymentFailed, RedemptionPaymentBlocked, RedemptionRejected,
    RedeemedInCollateral, RedemptionRequestIncomplete,
    RedemptionTicketCreated, RedemptionTicketUpdated, RedemptionTicketDeleted, RedemptionTicket,
    AgentInCCB, LiquidationStarted, FullLiquidationStarted, LiquidationPerformed, LiquidationEnded,
    IllegalPaymentConfirmed, DuplicatePaymentConfirmed, UnderlyingBalanceTooLow,
    CollateralPoolEntered, CollateralPoolExited, CollateralPoolDonated,
    CollateralPoolPaidOut, CollateralPoolClaimedReward,
    ERC20Transfer, CollateralTypeAdded, AgentPing, AgentPingResponse,
    CurrentUnderlyingBlockUpdated, PricesPublished, PricePublished,
    FtsoPrice, UntrackedAgentVault, TokenBalance,
    TransferToCoreVaultStarted, TransferToCoreVaultSuccessful, TransferToCoreVaultDefaulted,
    ReturnFromCoreVaultRequested, ReturnFromCoreVaultConfirmed, ReturnFromCoreVaultCancelled,
    CoreVaultRedemptionRequested, CoreVaultManagerSettingsUpdated,
    CoreVaultManagerPaymentConfirmed, CoreVaultManagerPaymentInstructions, CoreVaultManagerEscrowInstructions,
    CoreVaultManagerTransferRequested, CoreVaultManagerTransferRequestCanceled, CoreVaultManagerNotAllEscrowsProcessed,
    EscrowFinished, CoreVaultManagerCustodianAddressUpdated,
    AssetManagerSettings, CoreVaultManagerSettings,
    // underlying
    UnderlyingBlock, UnderlyingReference, UnderlyingAddress, UnderlyingBalance
  ],
  pool: {
    min: MIN_DATABASE_POOL_CONNECTIONS,
    max: MAX_DATABASE_POOL_CONNECTIONS
  },
  migrations: { disableForeignKeys: false },
  debug: false
})

export async function createOrm(options: OrmOptions, update: SchemaUpdate): Promise<ORM> {
  const initOptions = { ...ORM_OPTIONS, ...options }
  const orm = await MikroORM.init(initOptions)
  await updateSchema(orm, update)
  if (!await orm.isConnected())
    throw new Error("Failed to connect to database")
  return orm
}

export default ORM_OPTIONS