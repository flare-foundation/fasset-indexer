// chain call config
export const CHAIN_FETCH_RETRY_LIMIT = 20
export const SLEEP_AFTER_ERROR_MS = 100

// evm event scrape config
export const EVM_LOG_FETCH_SLEEP_MS = 30 * 1000 // collect logs every 30 seconds
export const EVM_STATE_UPDATE_SLEEP_MS = 60 * 1000 // collect state every one minute
export const EVM_BLOCK_HEIGHT_OFFSET = 10 // log collection offset from the current block height

// db settings
export const MIN_DATABASE_POOL_CONNECTIONS = 2
export const MAX_DATABASE_POOL_CONNECTIONS = 30
export const MAX_DATABASE_ENTRIES_FETCH = 200

// db variable names
export const FIRST_UNHANDLED_EVENT_BLOCK_DB_KEY = "firstUnhandledEventBlock"
export const MIN_EVM_BLOCK_NUMBER_DB_KEY = "minEvmBlockNumber"

// db back indexer names
export function backUpdateFirstUnhandledBlockName(updateName: string): string {
  return `firstUnhandledEventBlock_${updateName}`
}
export function backUpdateLastBlockName(updateName: string): string {
  return `lastEventBlock_${updateName}`
}

// event names
// agent
export const EVENTS = {
  ASSET_MANAGER: {
    // settings
    SETTING_CHANGED: "SettingChanged",
    // agent
    AGENT_VAULT_CREATED: "AgentVaultCreated",
    AGENT_SETTING_CHANGED: "AgentSettingChanged",
    AVAILABLE_AGENT_EXITED: "AvailableAgentExited",
    AGENT_ENTERED_AVAILABLE: "AgentAvailable",
    AGENT_DESTROYED: "AgentDestroyed",
    SELF_CLOSE: "SelfClose",
    VAULT_COLLATERAL_WITHDRAWAL_ANNOUNCED: "VaultCollateralWithdrawalAnnounced",
    POOL_TOKEN_REDEMPTION_ANNOUNCED: "PoolTokenRedemptionAnnounced",
    UNDERLYING_WITHDRAWAL_ANNOUNCED: "UnderlyingWithdrawalAnnounced",
    UNDERLYING_WITHDRAWAL_CONFIRMED: "UnderlyingWithdrawalConfirmed",
    // minting
    COLLATERAL_RESERVED: "CollateralReserved",
    MINTING_EXECUTED: "MintingExecuted",
    SELF_MINT: "SelfMint",
    MINTING_PAYMENT_DEFAULT: "MintingPaymentDefault",
    COLLATERAL_RESERVATION_DELETED: "CollateralReservationDeleted",
    // redemption
    REDEMPTION_REQUESTED: "RedemptionRequested",
    REDEMPTION_PERFORMED: "RedemptionPerformed",
    REDEMPTION_DEFAULT: "RedemptionDefault",
    REDEMPTION_PAYMENT_BLOCKED: "RedemptionPaymentBlocked",
    REDEMPTION_PAYMENT_FAILED: "RedemptionPaymentFailed",
    REDEMPTION_REJECTED: "RedemptionRejected",
    REDEMPTION_REQUEST_INCOMPLETE: "RedemptionRequestIncomplete",
    REDEEMED_IN_COLLATERAL: "RedeemedInCollateral",
    // redemption tickets
    REDEMPTION_TICKET_CREATED: 'RedemptionTicketCreated',
    REDEMPTION_TICKET_UPDATED: 'RedemptionTicketUpdated',
    REDEMPTION_TICKET_DELETED: 'RedemptionTicketDeleted',
    // liquidation
    AGENT_IN_CCB: "AgentInCCB",
    LIQUIDATION_STARTED: "LiquidationStarted",
    FULL_LIQUIDATION_STARTED: "FullLiquidationStarted",
    LIQUIDATION_PERFORMED: "LiquidationPerformed",
    LIQUIDATION_ENDED: "LiquidationEnded",
    // challenges
    ILLEGAL_PAYMENT_CONFIRMED: "IllegalPaymentConfirmed",
    DUPLICATE_PAYMENT_CONFIRMED: "DuplicatePaymentConfirmed",
    UNDERLYING_BALANCE_TOO_LOW: "UnderlyingBalanceTooLow",
    // collateral types
    COLLATERAL_TYPE_ADDED: "CollateralTypeAdded",
    COLLATERAL_TYPE_DEPRECATED: "CollateralTypeDeprecated",
    AGENT_COLLATERAL_TYPE_CHANGED: "AgentCollateralTypeChanged",
    // pings
    AGENT_PING: "AgentPing",
    AGENT_PING_RESPONSE: "AgentPingResponse",
    // system
    CURRENT_UNDERLYING_BLOCK_UPDATED: 'CurrentUnderlyingBlockUpdated',
    // core vault
    TRANSFER_TO_CORE_VAULT_STARTED: 'TransferToCoreVaultStarted',
    TRANSFER_TO_CORE_VAULT_SUCCESSFUL: 'TransferToCoreVaultSuccessful',
    TRANSFER_TO_CORE_VAULT_DEFAULTED: 'TransferToCoreVaultDefaulted',
    RETURN_FROM_CORE_VAULT_REQUESTED: 'ReturnFromCoreVaultRequested',
    RETURN_FROM_CORE_VAULT_CONFIRMED: 'ReturnFromCoreVaultConfirmed',
    RETURN_FROM_CORE_VAULT_CANCELLED: 'ReturnFromCoreVaultCancelled',
    CORE_VAULT_REDEMPTION_REQUESTED: 'CoreVaultRedemptionRequested'
  },
  COLLATERAL_POOL: {
    ENTER: "Entered",
    EXIT: "Exited",
    DONATED: "Donated",
    CLAIMED_REWARD: "ClaimedReward",
    PAID_OUT: "PaidOut",
  },
  ERC20: {
    TRANSFER: "Transfer",
  },
  PRICE_READER: {
    PRICES_PUBLISHED: "PricesPublished",
  },
  CORE_VAULT_MANAGER: {
    TRANSFER_REQUESTED: "TransferRequested",
    PAYMENT_CONFIRMED: "PaymentConfirmed",
    PAYMENT_INSTRUCTIONS: "PaymentInstructions",
    ESCROW_INSTRUCTIONS: "EscrowInstructions",
    TRANSFER_REQUEST_CANCELED: "TransferRequestCanceled",
    NOT_ALL_ESCROWS_PROCESSED: "NotAllEscrowsProcessed",
    ESCROW_FINISHED: "EscrowFinished",
    CUSTODIAN_ADDRESS_UPDATED: "CustodianAddressUpdated",
    SETTINGS_UPDATED: "SettingsUpdated"
  }
}

// metadata
export const ADDRESS_LENGTH = 42
export const BYTES32_LENGTH = 66

// block explorers
export const BLOCK_EXPLORERS = {
  coston: 'https://coston-explorer.flare.network',
  songbird: 'https://songbird-explorer.flare.network',
  coston2: 'https://coston2-explorer.flare.network'
}