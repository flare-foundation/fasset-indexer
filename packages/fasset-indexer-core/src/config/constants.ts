// chain call config
export const SLEEP_AFTER_ERROR_MS = 3000

// evm event scrape config
export const DEFAULT_EVM_LOG_FETCH_SLEEP_MS = 10 * 1000 // collect logs every 10 seconds
export const DEFAULT_EVM_STATE_UPDATE_SLEEP_MS = 60 * 1000 // collect state every one minute
export const DEFAULT_EVM_BLOCK_HEIGHT_OFFSET = 10 // log collection offset from the current block height
export const DEFAULT_EVM_LOG_FETCH_BLOCK_BATCH_SIZE = 29

// db settings
export const MIN_DATABASE_POOL_CONNECTIONS = 2
export const MAX_DATABASE_POOL_CONNECTIONS = 30
export const MAX_DATABASE_ENTRIES_FETCH = 200

// db variable names
export const FIRST_UNHANDLED_EVENT_BLOCK_DB_KEY = "firstUnhandledEventBlock"
export const MIN_EVM_BLOCK_NUMBER_DB_KEY = "minEvmBlockNumber"

// event names
// agent
export const EVENTS = {
  ASSET_MANAGER: {
    // settings
    SETTING_CHANGED: "SettingChanged",
    CONTRACT_CHANGED: "ContractChanged",
    // agent
    AGENT_VAULT_CREATED: "AgentVaultCreated",
    AGENT_VAULT_DESTROYED: "AgentDestroyed",
    AGENT_SETTING_CHANGED: "AgentSettingChanged",
    AVAILABLE_AGENT_EXITED: "AvailableAgentExited",
    AGENT_ENTERED_AVAILABLE: "AgentAvailable",
    AGENT_DESTROYED: "AgentDestroyed",
    SELF_CLOSE: "SelfClose",
    // announcements
    AGENT_VAULT_DESTROY_ANNOUNCED: "AgentDestroyAnnounced",
    VAULT_COLLATERAL_WITHDRAWAL_ANNOUNCED: "VaultCollateralWithdrawalAnnounced",
    POOL_TOKEN_REDEMPTION_ANNOUNCED: "PoolTokenRedemptionAnnounced",
    // underlying tracking
    UNDERLYING_WITHDRAWAL_ANNOUNCED: "UnderlyingWithdrawalAnnounced",
    UNDERLYING_WITHDRAWAL_CONFIRMED: "UnderlyingWithdrawalConfirmed",
    UNDERLYING_WITHDRAWAL_CANCELLED: "UnderlyingWithdrawalCancelled",
    UNDERLYING_BALANCE_TOPPED_UP: "UnderlyingBalanceToppedUp",
    UNDERLYING_BALANCE_CHANGED: "UnderlyingBalanceChanged",
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
    REDEMPTION_POOL_FEE_MINTED: "RedemptionPoolFeeMinted",
    // redemption tickets
    REDEMPTION_TICKET_CREATED: 'RedemptionTicketCreated',
    REDEMPTION_TICKET_UPDATED: 'RedemptionTicketUpdated',
    REDEMPTION_TICKET_DELETED: 'RedemptionTicketDeleted',
    // liquidation
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
    // low level state changes
    DUST_CHANGED: "DustChanged",
    COLLATERAL_RATIOS_CHANGED: "CollateralRatiosChanged",
    // emergency pause
    EMERGENCY_PAUSE_TRIGGERED: "EmergencyPauseTriggered",
    EMERGENCY_PAUSE_CANCELLED: "EmergencyPauseCanceled",
    EMERGENCY_PAUSE_TRANSFERS_TRIGGERED: "EmergencyPauseTransfersTriggered",
    EMERGENCY_PAUSE_TRANSFERS_CANCELLED: "EmergencyPauseTransfersCanceled",
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
    CLAIMED_REWARD: "ClaimedReward",
    PAID_OUT: "PaidOut",
    // v2 names for flare deploy
    CP_CLAIMED_REWARD: "CPClaimedReward",
    CP_ENTERED: "CPEntered",
    CP_EXITED: "CPExited",
    CP_FEE_DEBT_CHANGED: "CPFeeDebtChanged",
    CP_FEE_DEBT_PAID: "CPFeeDebtPaid",
    CP_FEES_WITHDRAWN: "CPFeesWithdrawn",
    CP_PAID_OUT: "CPPaidOut",
    CP_SELF_CLOSE_EXITED: "CPSelfCloseExited",
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
    ESCROW_EXPIRED: "EscrowExpired",
    ESCROW_FINISHED: "EscrowFinished",
    SETTINGS_UPDATED: "SettingsUpdated",
    CUSTODIAN_ADDRESS_UPDATED: "CustodianAddressUpdated"
  },
  PERSONAL_ACCOUNT: {
    DEPOSITED: 'Deposited',
    WITHDRAWN: 'Withdrawn',
    WITHDRAWAL_CLAIMED: 'WithdrawalClaimed',
    APPROVED: 'Approved',
    REDEEMED: 'Redeemed',
    COLLATERAL_RESERVED: 'CollateralReserved'
  },
  MASTER_ACCOUNT_CONTROLLER: {
    CUSTOM_INSTRUCTION: 'CustomInstruction',
    PERSONAL_ACCOUNT_IMPLEMENTATION_SET: 'PersonalAccountImplementationSet',
    OPERATOR_EXECUTION_WINDOW_SECONDS_SET: 'OperatorExecutionWindowSecondsSet',
    PERSONAL_ACCOUNT_CREATED: 'PersonalAccountCreated',
    EXECUTOR_FEE_SET: 'ExecutorFeeSet',
    INSTRUCTION_EXECUTED: 'InstructionExecuted'
  }
} as const

export const EVENT_NAMES = Object.keys(EVENTS).map(
  key => Object.values(EVENTS[key as keyof typeof EVENTS])).flat()

// metadata
export const ADDRESS_LENGTH = 42
export const BYTES32_LENGTH = 66

// block explorers
export const BLOCK_EXPLORERS = {
  coston: 'https://coston-explorer.flare.network',
  songbird: 'https://songbird-explorer.flare.network',
  coston2: 'https://coston2-explorer.flare.network',
  flare: 'https://flare-explorer.flare.network'
}