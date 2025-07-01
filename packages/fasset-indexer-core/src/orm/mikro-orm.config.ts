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
  CPClaimedReward, CPEntered, CPExited, CPFeeDebtChanged,
  CPFeeDebtPaid, CPFeesWithdrawn, CPPaidOut, CPSelfCloseExited
} from "./entities/events/collateral-pool-v2"
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
    // agent entities
    AgentManager, AgentOwner, AgentVault, AgentVaultInfo,
    // agent operations
    AgentVaultCreated, AgentSettingChanged, SelfClose, SelfMint,
    VaultCollateralWithdrawalAnnounced, PoolTokenRedemptionAnnounced,
    UnderlyingWithdrawalAnnounced, UnderlyingWithdrawalConfirmed,
    // minting
    CollateralReserved, MintingExecuted, MintingPaymentDefault, CollateralReservationDeleted,
    // redemption
    RedemptionRequested, RedemptionPerformed, RedemptionDefault,
    RedemptionPaymentFailed, RedemptionPaymentBlocked, RedemptionRejected,
    RedeemedInCollateral, RedemptionRequestIncomplete,
    RedemptionTicketCreated, RedemptionTicketUpdated, RedemptionTicketDeleted, RedemptionTicket,
    // liquidation
    AgentInCCB, LiquidationStarted, FullLiquidationStarted, LiquidationPerformed, LiquidationEnded,
    // challenge
    IllegalPaymentConfirmed, DuplicatePaymentConfirmed, UnderlyingBalanceTooLow,
    // collateral pool
    CollateralPoolEntered, CollateralPoolExited, CollateralPoolDonated,
    CollateralPoolPaidOut, CollateralPoolClaimedReward,
    // collateral pool v2
    CPClaimedReward, CPEntered, CPExited, CPFeeDebtChanged,
    CPFeeDebtPaid, CPFeesWithdrawn, CPPaidOut, CPSelfCloseExited,
    // erc20
    ERC20Transfer, TokenBalance,
    // system tracking
    CollateralTypeAdded, CurrentUnderlyingBlockUpdated, PricesPublished, PricePublished,
    // agent ping
    AgentPing, AgentPingResponse,
    // core vault
    TransferToCoreVaultStarted, TransferToCoreVaultSuccessful, TransferToCoreVaultDefaulted,
    ReturnFromCoreVaultRequested, ReturnFromCoreVaultConfirmed, ReturnFromCoreVaultCancelled,
    CoreVaultRedemptionRequested,
    // core vault manager
    CoreVaultManagerSettingsUpdated, CoreVaultManagerPaymentConfirmed, CoreVaultManagerPaymentInstructions,
    CoreVaultManagerEscrowInstructions, CoreVaultManagerTransferRequested, CoreVaultManagerTransferRequestCanceled,
    CoreVaultManagerNotAllEscrowsProcessed, EscrowFinished, CoreVaultManagerCustodianAddressUpdated,
    // settings
    AssetManagerSettings, CoreVaultManagerSettings, AgentVaultSettings,
    // helpers
    FtsoPrice, UntrackedAgentVault,
    // underlying chain
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