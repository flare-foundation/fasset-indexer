import { EVENTS } from "../../../src/config"
import type {
  AgentVaultCreatedEvent,
  CollateralTypeAddedEvent,
  AgentSettingChangedEvent,
  CollateralReservedEvent,
  AgentDestroyedEvent,
  SelfCloseEvent,
  MintingExecutedEvent,
  MintingPaymentDefaultEvent,
  CollateralReservationDeletedEvent,
  RedemptionRequestedEvent,
  RedemptionPerformedEvent,
  RedemptionDefaultEvent,
  RedemptionPaymentBlockedEvent,
  RedemptionPaymentFailedEvent,
  RedemptionRejectedEvent,
  RedemptionRequestIncompleteEvent,
  RedeemedInCollateralEvent,
  LiquidationStartedEvent,
  LiquidationPerformedEvent,
  FullLiquidationStartedEvent,
  LiquidationEndedEvent,
  AvailableAgentExitedEvent,
  AgentAvailableEvent,
  CurrentUnderlyingBlockUpdatedEvent,
  AgentPingEvent,
  AgentPingResponseEvent,
  SelfMintEvent,
  RedemptionTicketCreatedEvent,
  RedemptionTicketUpdatedEvent,
  RedemptionTicketDeletedEvent,
  CoreVaultRedemptionRequestedEvent,
  ReturnFromCoreVaultCancelledEvent,
  ReturnFromCoreVaultConfirmedEvent,
  ReturnFromCoreVaultRequestedEvent,
  TransferToCoreVaultStartedEvent,
  TransferToCoreVaultSuccessfulEvent,
  TransferToCoreVaultDefaultedEvent,
  SettingChangedEvent
} from "../../../chain/typechain/IAssetManager"
import type {
  CPClaimedRewardEvent,
  CPEnteredEvent,
  CPExitedEvent,
  CPFeeDebtChangedEvent,
  CPFeesWithdrawnEvent,
  CPPaidOutEvent,
  CPSelfCloseExitedEvent,
  EnteredEvent,
  ExitedEvent
} from "../../../chain/typechain/ICollateralPool"
import type { TransferEvent } from "../../../chain/typechain/IERC20"
import type { SettingsUpdatedEvent } from "../../../chain/typechain/ICoreVaultManager"


export type EventNameToEventArgs = {
  [EVENTS.ASSET_MANAGER.SETTING_CHANGED]: SettingChangedEvent.OutputTuple
  [EVENTS.ASSET_MANAGER.COLLATERAL_TYPE_ADDED]: CollateralTypeAddedEvent.OutputTuple
  [EVENTS.ASSET_MANAGER.AGENT_VAULT_CREATED]: AgentVaultCreatedEvent.OutputTuple
  [EVENTS.ASSET_MANAGER.AGENT_SETTING_CHANGED]: AgentSettingChangedEvent.OutputTuple
  [EVENTS.ASSET_MANAGER.AGENT_DESTROYED]: AgentDestroyedEvent.OutputTuple
  [EVENTS.ASSET_MANAGER.SELF_CLOSE]: SelfCloseEvent.OutputTuple
  [EVENTS.ASSET_MANAGER.COLLATERAL_RESERVED]: CollateralReservedEvent.OutputTuple
  [EVENTS.ASSET_MANAGER.MINTING_EXECUTED]: MintingExecutedEvent.OutputTuple
  [EVENTS.ASSET_MANAGER.MINTING_PAYMENT_DEFAULT]: MintingPaymentDefaultEvent.OutputTuple
  [EVENTS.ASSET_MANAGER.COLLATERAL_RESERVATION_DELETED]: CollateralReservationDeletedEvent.OutputTuple
  [EVENTS.ASSET_MANAGER.SELF_MINT]: SelfMintEvent.OutputTuple
  [EVENTS.ASSET_MANAGER.REDEMPTION_REQUESTED]: RedemptionRequestedEvent.OutputTuple
  [EVENTS.ASSET_MANAGER.REDEMPTION_PERFORMED]: RedemptionPerformedEvent.OutputTuple
  [EVENTS.ASSET_MANAGER.REDEMPTION_DEFAULT]: RedemptionDefaultEvent.OutputTuple
  [EVENTS.ASSET_MANAGER.REDEMPTION_PAYMENT_BLOCKED]: RedemptionPaymentBlockedEvent.OutputTuple
  [EVENTS.ASSET_MANAGER.REDEMPTION_PAYMENT_FAILED]: RedemptionPaymentFailedEvent.OutputTuple
  [EVENTS.ASSET_MANAGER.REDEMPTION_REJECTED]: RedemptionRejectedEvent.OutputTuple
  [EVENTS.ASSET_MANAGER.REDEMPTION_TICKET_CREATED]: RedemptionTicketCreatedEvent.OutputTuple
  [EVENTS.ASSET_MANAGER.REDEMPTION_TICKET_DELETED]: RedemptionTicketDeletedEvent.OutputTuple
  [EVENTS.ASSET_MANAGER.REDEMPTION_TICKET_UPDATED]: RedemptionTicketUpdatedEvent.OutputTuple
  [EVENTS.ASSET_MANAGER.REDEEMED_IN_COLLATERAL]: RedeemedInCollateralEvent.OutputTuple
  [EVENTS.ASSET_MANAGER.REDEMPTION_REQUEST_INCOMPLETE]: RedemptionRequestIncompleteEvent.OutputTuple
  [EVENTS.ASSET_MANAGER.LIQUIDATION_STARTED]: LiquidationStartedEvent.OutputTuple
  [EVENTS.ASSET_MANAGER.FULL_LIQUIDATION_STARTED]: FullLiquidationStartedEvent.OutputTuple
  [EVENTS.ASSET_MANAGER.LIQUIDATION_PERFORMED]: LiquidationPerformedEvent.OutputTuple
  [EVENTS.ASSET_MANAGER.LIQUIDATION_ENDED]: LiquidationEndedEvent.OutputTuple
  [EVENTS.ASSET_MANAGER.AVAILABLE_AGENT_EXITED]: AvailableAgentExitedEvent.OutputTuple
  [EVENTS.ASSET_MANAGER.AGENT_ENTERED_AVAILABLE]: AgentAvailableEvent.OutputTuple
  [EVENTS.ASSET_MANAGER.AGENT_PING]: AgentPingEvent.OutputTuple
  [EVENTS.ASSET_MANAGER.AGENT_PING_RESPONSE]: AgentPingResponseEvent.OutputTuple
  [EVENTS.COLLATERAL_POOL.ENTER]: EnteredEvent.OutputTuple
  [EVENTS.COLLATERAL_POOL.EXIT]: ExitedEvent.OutputTuple
  [EVENTS.ERC20.TRANSFER]: TransferEvent.OutputTuple
  [EVENTS.ASSET_MANAGER.CURRENT_UNDERLYING_BLOCK_UPDATED]: CurrentUnderlyingBlockUpdatedEvent.OutputTuple
  [EVENTS.ASSET_MANAGER.TRANSFER_TO_CORE_VAULT_STARTED]: TransferToCoreVaultStartedEvent.OutputTuple
  [EVENTS.ASSET_MANAGER.TRANSFER_TO_CORE_VAULT_SUCCESSFUL]: TransferToCoreVaultSuccessfulEvent.OutputTuple
  [EVENTS.ASSET_MANAGER.TRANSFER_TO_CORE_VAULT_DEFAULTED]: TransferToCoreVaultDefaultedEvent.OutputTuple
  [EVENTS.ASSET_MANAGER.RETURN_FROM_CORE_VAULT_REQUESTED]: ReturnFromCoreVaultRequestedEvent.OutputTuple
  [EVENTS.ASSET_MANAGER.RETURN_FROM_CORE_VAULT_CONFIRMED]: ReturnFromCoreVaultConfirmedEvent.OutputTuple
  [EVENTS.ASSET_MANAGER.RETURN_FROM_CORE_VAULT_CANCELLED]: ReturnFromCoreVaultCancelledEvent.OutputTuple
  [EVENTS.ASSET_MANAGER.CORE_VAULT_REDEMPTION_REQUESTED]: CoreVaultRedemptionRequestedEvent.OutputTuple
  [EVENTS.CORE_VAULT_MANAGER.SETTINGS_UPDATED]: SettingsUpdatedEvent.OutputTuple
  [EVENTS.COLLATERAL_POOL.CP_ENTERED]: CPEnteredEvent.OutputTuple
  [EVENTS.COLLATERAL_POOL.CP_EXITED]: CPExitedEvent.OutputTuple
  [EVENTS.COLLATERAL_POOL.CP_CLAIMED_REWARD]: CPClaimedRewardEvent.OutputTuple
  [EVENTS.COLLATERAL_POOL.CP_FEES_WITHDRAWN]: CPFeesWithdrawnEvent.OutputTuple
  [EVENTS.COLLATERAL_POOL.CP_SELF_CLOSE_EXITED]: CPSelfCloseExitedEvent.OutputTuple
  [EVENTS.COLLATERAL_POOL.CP_FEE_DEBT_CHANGED]: CPFeeDebtChangedEvent.OutputTuple
  [EVENTS.COLLATERAL_POOL.CP_FEE_DEBT_PAID]: CPFeesWithdrawnEvent.OutputTuple
  [EVENTS.COLLATERAL_POOL.CP_PAID_OUT]: CPPaidOutEvent.OutputTuple
}