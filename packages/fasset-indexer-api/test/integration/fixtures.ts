import * as E from 'fasset-indexer-core/entities'
import { FAssetType } from 'fasset-indexer-core'
import { evmLogId } from 'fasset-indexer-core/orm'
import type { EntityManager } from '@mikro-orm/core'


// Fluent fixture builders for the indexer entity graph.
//
// Lifecycle:  Fixtures(em) → ensure-or-create primitives → return entity refs.
// Strings act as natural keys (block index, tx hash, address hex/text) so the
// same call returns the same row when invoked twice. Tests build only what
// they assert against; everything else stays implicit.

let monotonicEvmLogIndex = 1
let monotonicEvmTxIndex = 0
let monotonicCrId = 1
let monotonicRequestId = 1


export class Fixtures {
  constructor(private readonly em: EntityManager) {}

  async evmBlock(index: number, timestamp: number): Promise<E.EvmBlock> {
    const existing = await this.em.findOne(E.EvmBlock, { index })
    if (existing) return existing
    const e = this.em.create(E.EvmBlock, { index, timestamp })
    await this.em.persistAndFlush(e)
    return e
  }

  async evmAddress(hex: string): Promise<E.EvmAddress> {
    const existing = await this.em.findOne(E.EvmAddress, { hex })
    if (existing) return existing
    const e = this.em.create(E.EvmAddress, { hex })
    await this.em.persistAndFlush(e)
    return e
  }

  async evmTransaction(opts: {
    hash: string, block: E.EvmBlock, source: E.EvmAddress, target?: E.EvmAddress
  }): Promise<E.EvmTransaction> {
    const existing = await this.em.findOne(E.EvmTransaction, { hash: opts.hash })
    if (existing) return existing
    const e = this.em.create(E.EvmTransaction, {
      hash: opts.hash,
      block: opts.block,
      index: monotonicEvmTxIndex++,
      source: opts.source,
      target: opts.target,
      value: 0n, gasUsed: 0n, gasPrice: 0n, gasLimit: 0n, type: 2, nonce: 0
    })
    await this.em.persistAndFlush(e)
    return e
  }

  async evmLog(opts: {
    name: string, address: E.EvmAddress, block: E.EvmBlock, transaction: E.EvmTransaction
  }): Promise<E.EvmLog> {
    // The id is assigned, not autoincremented: it encodes the log's chain
    // position, which is what the explorer orders and range-filters on.
    const index = monotonicEvmLogIndex++
    const e = this.em.create(E.EvmLog, {
      id: evmLogId(opts.block.index, index),
      index,
      name: opts.name,
      address: opts.address,
      block: opts.block,
      transaction: opts.transaction
    })
    await this.em.persistAndFlush(e)
    return e
  }

  async underlyingBlock(height: number, timestamp: number, hash?: string): Promise<E.UnderlyingBlock> {
    const existing = await this.em.findOne(E.UnderlyingBlock, { height })
    if (existing) return existing
    const e = this.em.create(E.UnderlyingBlock, {
      height, timestamp,
      hash: hash ?? `BLOCK_${height}`
    })
    await this.em.persistAndFlush(e)
    return e
  }

  async underlyingAddress(text: string): Promise<E.UnderlyingAddress> {
    const existing = await this.em.findOne(E.UnderlyingAddress, { text })
    if (existing) return existing
    const e = this.em.create(E.UnderlyingAddress, { text })
    await this.em.persistAndFlush(e)
    return e
  }

  async underlyingTransaction(opts: {
    hash: string, block: E.UnderlyingBlock,
    source?: E.UnderlyingAddress, target?: E.UnderlyingAddress,
    value?: bigint
  }): Promise<E.UnderlyingTransaction> {
    const existing = await this.em.findOne(E.UnderlyingTransaction, { hash: opts.hash })
    if (existing) return existing
    const e = this.em.create(E.UnderlyingTransaction, {
      hash: opts.hash,
      block: opts.block,
      source: opts.source,
      target: opts.target,
      value: opts.value ?? 0n
    })
    await this.em.persistAndFlush(e)
    return e
  }

  async underlyingReference(opts: {
    fasset: FAssetType, reference: string,
    transaction: E.UnderlyingTransaction, address: E.UnderlyingAddress, block: E.UnderlyingBlock
  }): Promise<E.UnderlyingReference> {
    const e = this.em.create(E.UnderlyingReference, opts)
    await this.em.persistAndFlush(e)
    return e
  }

  // ---------- composite helpers: one call = one event row + its scaffolding

  async logAt(opts: {
    name: string,
    addressHex: string,
    blockIndex: number,
    blockTimestamp: number,
    txHash?: string,
    txSourceHex?: string
  }): Promise<E.EvmLog> {
    const addr = await this.evmAddress(opts.addressHex)
    const block = await this.evmBlock(opts.blockIndex, opts.blockTimestamp)
    const source = await this.evmAddress(opts.txSourceHex ?? '0x0000000000000000000000000000000000000001')
    const tx = await this.evmTransaction({
      hash: opts.txHash ?? `0x${opts.blockIndex.toString(16).padStart(64, '0')}`,
      block, source
    })
    return this.evmLog({ name: opts.name, address: addr, block, transaction: tx })
  }

  // DirectMintingExecuted with a matching UnderlyingTransaction. The
  // transactionId on the event row is stored 0x-prefixed lowercase (bytes32
  // form from ethers); the UnderlyingTransaction.hash is uppercase no-prefix
  // (XRPL native form). Mirrors what the live indexers write.
  async directMintingExecuted(opts: {
    fasset: FAssetType,
    targetHex: string,
    executorHex: string,
    sourceText: string,
    mintedAmountUBA: bigint,
    mintingFeeUBA?: bigint,
    executorFeeUBA?: bigint,
    blockIndex?: number,
    blockTimestamp?: number,
    underlyingTxHash?: string, // raw 64-char hex, uppercase; will be aligned both sides
    underlyingBlockHeight?: number,
    underlyingBlockTimestamp?: number,
    underlyingTxValue?: bigint,
    assetManagerHex?: string
  }): Promise<E.DirectMintingExecuted> {
    const txHashRaw = opts.underlyingTxHash ?? 'A'.repeat(64)
    const targetAddress = await this.evmAddress(opts.targetHex)
    const executor = await this.evmAddress(opts.executorHex)
    const log = await this.logAt({
      name: 'DirectMintingExecuted',
      addressHex: opts.assetManagerHex ?? '0x00000000000000000000000000000000000000ff',
      blockIndex: opts.blockIndex ?? 1000 + monotonicEvmLogIndex,
      blockTimestamp: opts.blockTimestamp ?? 1_700_000_000
    })
    const dm = this.em.create(E.DirectMintingExecuted, {
      evmLog: log,
      fasset: opts.fasset,
      transactionId: `0x${txHashRaw.toLowerCase()}`,
      targetAddress,
      executor,
      mintedAmountUBA: opts.mintedAmountUBA,
      mintingFeeUBA: opts.mintingFeeUBA ?? 0n,
      executorFeeUBA: opts.executorFeeUBA ?? 0n
    })
    await this.em.persistAndFlush(dm)

    const underlyingBlock = await this.underlyingBlock(
      opts.underlyingBlockHeight ?? 10_000_000,
      opts.underlyingBlockTimestamp ?? opts.blockTimestamp ?? 1_700_000_000
    )
    const underlyingSource = await this.underlyingAddress(opts.sourceText)
    await this.underlyingTransaction({
      hash: txHashRaw, // uppercase, no prefix — matches the indexer's storage
      block: underlyingBlock,
      source: underlyingSource,
      value: opts.underlyingTxValue ?? opts.mintedAmountUBA
    })
    return dm
  }

  // ---------- agents

  async agentManager(addrHex: string, name = 'mgr'): Promise<E.AgentManager> {
    const addr = await this.evmAddress(addrHex)
    const existing = await this.em.findOne(E.AgentManager, { address: addr })
    if (existing) return existing
    const e = this.em.create(E.AgentManager, { address: addr, name })
    await this.em.persistAndFlush(e)
    return e
  }

  async agentOwner(manager: E.AgentManager, addrHex: string): Promise<E.AgentOwner> {
    const addr = await this.evmAddress(addrHex)
    const existing = await this.em.findOne(E.AgentOwner, { address: addr })
    if (existing) return existing
    const e = this.em.create(E.AgentOwner, { manager, address: addr })
    await this.em.persistAndFlush(e)
    return e
  }

  async agentVault(opts: {
    fasset: FAssetType,
    addressHex: string,
    underlyingText: string,
    poolHex: string,
    poolTokenHex?: string,
    ownerHex?: string,
    managerHex?: string,
    destroyed?: boolean
  }): Promise<E.AgentVault> {
    const address = await this.evmAddress(opts.addressHex)
    const existing = await this.em.findOne(E.AgentVault, { address })
    if (existing) return existing
    const manager = await this.agentManager(opts.managerHex ?? '0x00000000000000000000000000000000000000aa')
    const owner = await this.agentOwner(manager, opts.ownerHex ?? '0x00000000000000000000000000000000000000bb')
    const underlying = await this.underlyingAddress(opts.underlyingText)
    const pool = await this.evmAddress(opts.poolHex)
    const poolToken = await this.evmAddress(opts.poolTokenHex ?? `${opts.poolHex}01`)
    const e = this.em.create(E.AgentVault, {
      fasset: opts.fasset, address, underlyingAddress: underlying,
      collateralPool: pool, collateralPoolToken: poolToken,
      owner, destroyed: opts.destroyed ?? false
    })
    await this.em.persistAndFlush(e)
    return e
  }

  // The watchdog-polled live state of a vault. Everything the analytics read is
  // non-nullable, so all of it defaults to zero and a test spells out only the
  // fields it asserts on. Keyed by agentVault (the PK).
  async agentVaultInfo(
    overrides: Partial<E.AgentVaultInfo> & { agentVault: E.AgentVault }
  ): Promise<E.AgentVaultInfo> {
    const base = {
      status: 0, publiclyAvailable: true,
      freeCollateralLots: 0n,
      totalVaultCollateralWei: 0n, freeVaultCollateralWei: 0n, vaultCollateralRatioBIPS: 0n,
      totalPoolCollateralNATWei: 0n, freePoolCollateralNATWei: 0n, poolCollateralRatioBIPS: 0n,
      totalAgentPoolTokensWei: 0n, freeAgentPoolTokensWei: 0n,
      mintedUBA: 0n, reservedUBA: 0n, redeemingUBA: 0n, poolRedeemingUBA: 0n, dustUBA: 0n,
      liquidationStartTimestamp: 0, maxLiquidationAmountUBA: 0n,
      liquidationPaymentFactorVaultBIPS: 0n, liquidationPaymentFactorPoolBIPS: 0n,
      underlyingBalanceUBA: 0n, requiredUnderlyingBalanceUBA: 0n, freeUnderlyingBalanceUBA: 0n
    }
    const e = this.em.create(E.AgentVaultInfo, { ...base, ...overrides })
    await this.em.persistAndFlush(e)
    return e
  }

  // A bot's answer to a liveness ping. `response` is off-chain defined; the
  // real fasset-bots payload is {"name":...,"version":...}.
  async agentPingResponse(opts: {
    fasset: FAssetType,
    agentVault: E.AgentVault,
    response: string,
    query?: bigint,
    blockIndex?: number,
    blockTimestamp?: number,
    assetManagerHex?: string
  }): Promise<E.AgentPingResponse> {
    const log = await this.logAt({
      name: 'AgentPingResponse',
      addressHex: opts.assetManagerHex ?? '0x00000000000000000000000000000000000000ff',
      blockIndex: opts.blockIndex ?? 1000 + monotonicEvmLogIndex,
      blockTimestamp: opts.blockTimestamp ?? 1_700_000_000
    })
    const e = this.em.create(E.AgentPingResponse, {
      evmLog: log,
      fasset: opts.fasset,
      agentVault: opts.agentVault,
      query: opts.query ?? 0n,
      response: opts.response
    })
    await this.em.persistAndFlush(e)
    return e
  }

  // ---------- mint: collateral reservation → executed (or defaulted)

  async collateralReserved(opts: {
    fasset: FAssetType,
    agentVault: E.AgentVault,
    minterHex: string,
    paymentAddressText: string,
    paymentReference: string,
    valueUBA: bigint,
    feeUBA?: bigint,
    collateralReservationId?: number,
    blockIndex?: number,
    blockTimestamp?: number
  }): Promise<E.CollateralReserved> {
    const minter = await this.evmAddress(opts.minterHex)
    const paymentAddress = await this.underlyingAddress(opts.paymentAddressText)
    const executor = await this.evmAddress('0x00000000000000000000000000000000000000ee')
    const log = await this.logAt({
      name: 'CollateralReserved',
      addressHex: '0x00000000000000000000000000000000000000ff',
      blockIndex: opts.blockIndex ?? 2000 + monotonicEvmLogIndex,
      blockTimestamp: opts.blockTimestamp ?? 1_700_000_000
    })
    const cr = this.em.create(E.CollateralReserved, {
      evmLog: log,
      fasset: opts.fasset,
      agentVault: opts.agentVault,
      collateralReservationId: opts.collateralReservationId ?? monotonicCrId++,
      minter,
      valueUBA: opts.valueUBA,
      feeUBA: opts.feeUBA ?? 0n,
      firstUnderlyingBlock: 0,
      lastUnderlyingBlock: 0,
      lastUnderlyingTimestamp: 0,
      paymentAddress,
      paymentReference: opts.paymentReference,
      executor,
      executorFeeNatWei: 0n
    })
    await this.em.persistAndFlush(cr)
    return cr
  }

  async mintingExecuted(opts: {
    collateralReserved: E.CollateralReserved,
    poolFeeUBA?: bigint,
    blockIndex?: number,
    blockTimestamp?: number
  }): Promise<E.MintingExecuted> {
    const log = await this.logAt({
      name: 'MintingExecuted',
      addressHex: '0x00000000000000000000000000000000000000ff',
      blockIndex: opts.blockIndex ?? 2500 + monotonicEvmLogIndex,
      blockTimestamp: opts.blockTimestamp ?? 1_700_000_500
    })
    const me = this.em.create(E.MintingExecuted, {
      evmLog: log,
      fasset: opts.collateralReserved.fasset,
      collateralReserved: opts.collateralReserved,
      poolFeeUBA: opts.poolFeeUBA ?? 0n
    })
    await this.em.persistAndFlush(me)
    return me
  }

  async mintingPaymentDefault(opts: {
    collateralReserved: E.CollateralReserved,
    blockIndex?: number, blockTimestamp?: number
  }): Promise<E.MintingPaymentDefault> {
    const log = await this.logAt({
      name: 'MintingPaymentDefault',
      addressHex: '0x00000000000000000000000000000000000000ff',
      blockIndex: opts.blockIndex ?? 2600 + monotonicEvmLogIndex,
      blockTimestamp: opts.blockTimestamp ?? 1_700_000_600
    })
    const e = this.em.create(E.MintingPaymentDefault, {
      evmLog: log,
      fasset: opts.collateralReserved.fasset,
      collateralReserved: opts.collateralReserved
    })
    await this.em.persistAndFlush(e)
    return e
  }

  // Convenience: full standard mint (CR + ME + payment-reference linkage to a
  // newly-created UnderlyingTransaction in a newly-created UnderlyingBlock).
  async standardMint(opts: {
    fasset: FAssetType,
    agentVault: E.AgentVault,
    minterHex: string,
    underlyingSourceText: string,
    valueUBA: bigint,
    underlyingTxValue?: bigint,
    paymentReference?: string,
    underlyingTxHash?: string,
    underlyingBlockHeight?: number,
    underlyingBlockTimestamp?: number,
    blockTimestamp?: number
  }): Promise<E.MintingExecuted> {
    const ref = opts.paymentReference ?? `0x46${'0'.repeat(62 - 8)}${Math.floor(Math.random() * 16777215).toString(16).padStart(8, '0')}`
    const cr = await this.collateralReserved({
      fasset: opts.fasset,
      agentVault: opts.agentVault,
      minterHex: opts.minterHex,
      paymentAddressText: opts.agentVault.underlyingAddress.text,
      paymentReference: ref,
      valueUBA: opts.valueUBA,
      blockTimestamp: opts.blockTimestamp
    })
    const me = await this.mintingExecuted({ collateralReserved: cr, blockTimestamp: opts.blockTimestamp })
    const block = await this.underlyingBlock(
      opts.underlyingBlockHeight ?? 11_000_000 + monotonicEvmLogIndex,
      opts.underlyingBlockTimestamp ?? opts.blockTimestamp ?? 1_700_000_500
    )
    const source = await this.underlyingAddress(opts.underlyingSourceText)
    const tx = await this.underlyingTransaction({
      hash: opts.underlyingTxHash ?? 'F'.repeat(32) + (monotonicEvmLogIndex.toString(16).padStart(32, '0').toUpperCase()),
      block, source, value: opts.underlyingTxValue ?? opts.valueUBA
    })
    await this.underlyingReference({
      fasset: opts.fasset, reference: ref, transaction: tx, address: source, block
    })
    return me
  }

  // ---------- redemption

  async redemptionRequested(opts: {
    fasset: FAssetType,
    agentVault: E.AgentVault,
    redeemerHex: string,
    paymentAddressText: string,
    paymentReference: string,
    valueUBA: bigint,
    feeUBA?: bigint,
    requestId?: number,
    kind?: 'plain' | 'tagged',
    blockIndex?: number, blockTimestamp?: number
  }): Promise<E.RedemptionRequested> {
    const redeemer = await this.evmAddress(opts.redeemerHex)
    const paymentAddress = await this.underlyingAddress(opts.paymentAddressText)
    const executor = await this.evmAddress('0x00000000000000000000000000000000000000ee')
    const log = await this.logAt({
      name: 'RedemptionRequested',
      addressHex: '0x00000000000000000000000000000000000000ff',
      blockIndex: opts.blockIndex ?? 3000 + monotonicEvmLogIndex,
      blockTimestamp: opts.blockTimestamp ?? 1_700_000_000
    })
    const rr = this.em.create(E.RedemptionRequested, {
      evmLog: log,
      fasset: opts.fasset,
      agentVault: opts.agentVault,
      kind: opts.kind ?? 'plain',
      // tagged-kind RR shares the table with plain via single-table inheritance
      // and requires destinationTag — supply a deterministic non-zero value
      // when caller asks for kind='tagged'.
      ...(opts.kind === 'tagged' ? { destinationTag: BigInt(monotonicRequestId) } : {}),
      requestId: opts.requestId ?? monotonicRequestId++,
      redeemer,
      paymentAddress,
      valueUBA: opts.valueUBA,
      feeUBA: opts.feeUBA ?? 0n,
      firstUnderlyingBlock: 0,
      lastUnderlyingBlock: 0,
      lastUnderlyingTimestamp: 0,
      paymentReference: opts.paymentReference,
      executor,
      executorFeeNatWei: 0n
    } as any)
    await this.em.persistAndFlush(rr)
    return rr
  }

  async redemptionPerformed(opts: {
    redemptionRequested: E.RedemptionRequested,
    transactionHash: string,
    spentUnderlyingUBA?: bigint,
    blockIndex?: number, blockTimestamp?: number
  }): Promise<E.RedemptionPerformed> {
    const log = await this.logAt({
      name: 'RedemptionPerformed',
      addressHex: '0x00000000000000000000000000000000000000ff',
      blockIndex: opts.blockIndex ?? 3500 + monotonicEvmLogIndex,
      blockTimestamp: opts.blockTimestamp ?? 1_700_000_700
    })
    const rp = this.em.create(E.RedemptionPerformed, {
      evmLog: log,
      fasset: opts.redemptionRequested.fasset,
      redemptionRequested: opts.redemptionRequested,
      transactionHash: opts.transactionHash,
      spentUnderlyingUBA: opts.spentUnderlyingUBA ?? 0n
    })
    await this.em.persistAndFlush(rp)
    return rp
  }

  async redemptionDefault(opts: {
    redemptionRequested: E.RedemptionRequested,
    redeemedVaultCollateralWei?: bigint,
    redeemedPoolCollateralWei?: bigint,
    blockIndex?: number, blockTimestamp?: number
  }): Promise<E.RedemptionDefault> {
    const log = await this.logAt({
      name: 'RedemptionDefault',
      addressHex: '0x00000000000000000000000000000000000000ff',
      blockIndex: opts.blockIndex ?? 3600 + monotonicEvmLogIndex,
      blockTimestamp: opts.blockTimestamp ?? 1_700_000_800
    })
    const rd = this.em.create(E.RedemptionDefault, {
      evmLog: log,
      fasset: opts.redemptionRequested.fasset,
      redemptionRequested: opts.redemptionRequested,
      redeemedVaultCollateralWei: opts.redeemedVaultCollateralWei ?? 0n,
      redeemedPoolCollateralWei: opts.redeemedPoolCollateralWei ?? 0n
    })
    await this.em.persistAndFlush(rd)
    return rd
  }

  // Standard redemption performed with linked underlying tx (target = redeemer's
  // underlying address; the SQL filters by ua.target_id).
  async standardRedemption(opts: {
    fasset: FAssetType,
    agentVault: E.AgentVault,
    redeemerHex: string,
    redeemerUnderlyingText: string,
    valueUBA: bigint,
    underlyingTxValue?: bigint,
    paymentReference?: string,
    underlyingTxHash?: string,
    requestId?: number,
    blockTimestamp?: number,
    underlyingBlockHeight?: number,
    underlyingBlockTimestamp?: number
  }): Promise<E.RedemptionPerformed> {
    const ref = opts.paymentReference ?? `0x52${'0'.repeat(62 - 8)}${Math.floor(Math.random() * 16777215).toString(16).padStart(8, '0')}`
    const rr = await this.redemptionRequested({
      fasset: opts.fasset,
      agentVault: opts.agentVault,
      redeemerHex: opts.redeemerHex,
      paymentAddressText: opts.redeemerUnderlyingText,
      paymentReference: ref,
      valueUBA: opts.valueUBA,
      requestId: opts.requestId,
      blockTimestamp: opts.blockTimestamp
    })
    const txHash = opts.underlyingTxHash ?? 'CAFE'.repeat(16) + (monotonicEvmLogIndex.toString(16).padStart(32, '0').toUpperCase())
    const block = await this.underlyingBlock(
      opts.underlyingBlockHeight ?? 12_000_000 + monotonicEvmLogIndex,
      opts.underlyingBlockTimestamp ?? opts.blockTimestamp ?? 1_700_000_700
    )
    const target = await this.underlyingAddress(opts.redeemerUnderlyingText)
    const agentSource = await this.underlyingAddress(opts.agentVault.underlyingAddress.text)
    const tx = await this.underlyingTransaction({
      hash: txHash, block, source: agentSource, target, value: opts.underlyingTxValue ?? opts.valueUBA
    })
    await this.underlyingReference({
      fasset: opts.fasset, reference: ref, transaction: tx, address: target, block
    })
    return this.redemptionPerformed({
      redemptionRequested: rr, transactionHash: `0x${txHash.toLowerCase()}`,
      blockTimestamp: opts.blockTimestamp
    })
  }

  // ---------- liquidation

  async liquidationPerformed(opts: {
    fasset: FAssetType, agentVault: E.AgentVault, liquidatorHex: string, valueUBA: bigint,
    paidVaultCollateralWei?: bigint, paidPoolCollateralWei?: bigint,
    blockIndex?: number, blockTimestamp?: number
  }): Promise<E.LiquidationPerformed> {
    const liquidator = await this.evmAddress(opts.liquidatorHex)
    const log = await this.logAt({
      name: 'LiquidationPerformed',
      addressHex: '0x00000000000000000000000000000000000000ff',
      blockIndex: opts.blockIndex ?? 4000 + monotonicEvmLogIndex,
      blockTimestamp: opts.blockTimestamp ?? 1_700_000_900
    })
    const lp = this.em.create(E.LiquidationPerformed, {
      evmLog: log,
      fasset: opts.fasset,
      agentVault: opts.agentVault,
      liquidator,
      valueUBA: opts.valueUBA,
      paidVaultCollateralWei: opts.paidVaultCollateralWei ?? 0n,
      paidPoolCollateralWei: opts.paidPoolCollateralWei ?? 0n
    })
    await this.em.persistAndFlush(lp)
    return lp
  }

  async directMintingExecutedToSmartAccount(opts: {
    fasset: FAssetType,
    sourceText: string,
    executorHex: string,
    mintedAmountUBA: bigint,
    mintingFeeUBA?: bigint,
    memoData?: string,
    blockIndex?: number,
    blockTimestamp?: number,
    underlyingTxHash?: string,
    underlyingBlockHeight?: number,
    underlyingBlockTimestamp?: number,
    underlyingTxValue?: bigint,
    assetManagerHex?: string
  }): Promise<E.DirectMintingExecutedToSmartAccount> {
    const txHashRaw = opts.underlyingTxHash ?? 'B'.repeat(64)
    const sourceAddress = await this.underlyingAddress(opts.sourceText)
    const executor = await this.evmAddress(opts.executorHex)
    const log = await this.logAt({
      name: 'DirectMintingExecutedToSmartAccount',
      addressHex: opts.assetManagerHex ?? '0x00000000000000000000000000000000000000ff',
      blockIndex: opts.blockIndex ?? 1000 + monotonicEvmLogIndex,
      blockTimestamp: opts.blockTimestamp ?? 1_700_000_000
    })
    const dms = this.em.create(E.DirectMintingExecutedToSmartAccount, {
      evmLog: log,
      fasset: opts.fasset,
      transactionId: `0x${txHashRaw.toLowerCase()}`,
      sourceAddress,
      executor,
      mintedAmountUBA: opts.mintedAmountUBA,
      mintingFeeUBA: opts.mintingFeeUBA ?? 0n,
      memoData: opts.memoData ?? '0x'
    })
    await this.em.persistAndFlush(dms)

    const underlyingBlock = await this.underlyingBlock(
      opts.underlyingBlockHeight ?? 10_000_001,
      opts.underlyingBlockTimestamp ?? opts.blockTimestamp ?? 1_700_000_000
    )
    await this.underlyingTransaction({
      hash: txHashRaw,
      block: underlyingBlock,
      source: sourceAddress,
      value: opts.underlyingTxValue ?? opts.mintedAmountUBA
    })
    return dms
  }

  // Upsert a watchdog-style SystemSettings snapshot. All non-nullable columns
  // default to zero/empty so a test only spells out the fields it asserts on;
  // nullable columns (core-vault, direct-minting limiter state) stay unset
  // unless overridden. Keyed by fasset (the PK).
  async systemSettings(overrides: Partial<E.SystemSettings> & { fasset: FAssetType }): Promise<E.SystemSettings> {
    const base = {
      updatedAt: 1_700_000_000,
      lotSizeAMG: 0n, mintingCapAMG: 0n, mintingPoolHoldingsRequiredBIPS: 0n,
      collateralReservationFeeBIPS: 0n, underlyingBlocksForPayment: 0n, underlyingSecondsForPayment: 0n,
      redemptionFeeBIPS: 0n, redemptionDefaultFactorVaultCollateralBIPS: 0n, confirmationByOthersAfterSeconds: 0n,
      confirmationByOthersRewardUSD5: 0n, maxRedeemedTickets: 0n,
      paymentChallengeRewardBIPS: 0n, paymentChallengeRewardUSD5: 0n,
      withdrawalWaitMinSeconds: 0n, maxTrustedPriceAgeSeconds: 0n, vaultCollateralBuyForFlareFactorBIPS: 0n,
      attestationWindowSeconds: 0n, minUpdateRepeatTimeSeconds: 0n,
      agentExitAvailableTimelockSeconds: 0n, agentFeeChangeTimelockSeconds: 0n, agentMintingCRChangeTimelockSeconds: 0n,
      poolExitCRChangeTimelockSeconds: 0n, agentTimelockedOperationWindowSeconds: 0n, collateralPoolTokenTimelockSeconds: 0n,
      liquidationStepSeconds: 0n, liquidationCollateralFactorBIPS: '', liquidationFactorVaultCollateralBIPS: '',
      diamondCutMinTimelockSeconds: 0n, maxEmergencyPauseDurationSeconds: 0n, emergencyPauseDurationResetAfterSeconds: 0n,
      redemptionPaymentExtensionSeconds: 0n, minimumRedeemAmountUBA: 0n, redeemWithTagSupported: false,
      mintingTagManager: '', smartAccountManager: '', wNat: '',
      directMintingDailyLimitUBA: 0n, directMintingHourlyLimitUBA: 0n, directMintingLargeMintingThresholdUBA: 0n,
      directMintingLargeMintingDelaySeconds: 0n, directMintingFeeBIPS: 0n, directMintingMinimumFeeUBA: 0n,
      directMintingExecutorFeeUBA: 0n, directMintingFeeReceiver: '', directMintingOthersCanExecuteAfterSeconds: 0n,
      directMintingsUnblockUntilTimestamp: 0n, directMintingPaymentAddress: ''
    }
    const e = this.em.create(E.SystemSettings, { ...base, ...overrides })
    await this.em.persistAndFlush(e)
    return e
  }

  // The XRPL-address → personal-account mapping the indexer writes when it sees
  // MASTER_ACCOUNT_CONTROLLER:PersonalAccountCreated. Smart-account direct mints
  // resolve their target through this row.
  async personalAccount(opts: {
    fasset: FAssetType, addressHex: string, underlyingText: string
  }): Promise<E.PersonalAccount> {
    const address = await this.evmAddress(opts.addressHex)
    const existing = await this.em.findOne(E.PersonalAccount, { address })
    if (existing) return existing
    const underlyingAddress = await this.underlyingAddress(opts.underlyingText)
    const e = this.em.create(E.PersonalAccount, {
      fasset: opts.fasset, address, underlyingAddress
    })
    await this.em.persistAndFlush(e)
    return e
  }
}
