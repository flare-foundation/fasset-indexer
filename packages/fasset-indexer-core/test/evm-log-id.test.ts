import { describe, before, beforeEach, after, it } from "mocha"
import { use, expect } from "chai"
import chaiAsPromised from "chai-as-promised"
import * as Entities from "../src/orm/entities"
import { evmLogId } from "../src/orm/utils"
import { EVENTS, EVM_LOG_INDEX_SCALE } from "../src/config/constants"
import { Context } from "../src/context/context"
import { EventStorer } from "../src/indexer/eventlib/store-logic/event-storer"
import { EventFixture } from "./fixtures/events/event"
import { createTestContext, resetDatabase } from "./fixtures/db"
import type { Event } from "../src/indexer/eventlib/types"

use(chaiAsPromised)

const ASSET_MANAGER_FXRP = "AssetManager_FTestXRP"

// Place a generated event at an exact chain position; the fixture otherwise
// randomises it.
function at(event: Event, blockIndex: number, logIndex: number): Event {
  event.block.index = blockIndex
  event.index = logIndex
  return event
}

describe("evm log id encoding", () => {

  describe("evmLogId", () => {

    it("should order by log index within a block", () => {
      expect(evmLogId(4, 0)).to.be.lessThan(evmLogId(4, 1))
    })

    it("should keep the last log of a block ahead of the first log of the next", () => {
      // The property an anti-diagonal pairing (e.g. Cantor) would not give us.
      expect(evmLogId(4, EVM_LOG_INDEX_SCALE - 1)).to.be.lessThan(evmLogId(5, 0))
    })

    it("should not collide across the block boundary", () => {
      expect(evmLogId(1, 0)).to.not.equal(evmLogId(0, EVM_LOG_INDEX_SCALE - 1))
    })

    it("should stay a safe integer well past the current chain head", () => {
      // ~1.5x the current flare head; ids must not lose precision as numbers.
      expect(Number.isSafeInteger(evmLogId(100_000_000, EVM_LOG_INDEX_SCALE - 1))).to.be.true
    })

    it("should reject a log index that would encode into the next block", () => {
      // Without this the row would silently sort as though it belonged to
      // block+1, since most blocks have no log to collide with.
      expect(() => evmLogId(7, EVM_LOG_INDEX_SCALE)).to.throw(/exceeds the id encoding scale/)
    })

    it("should reject positions that are not natural numbers", () => {
      expect(() => evmLogId(-1, 0)).to.throw(/invalid evm block index/)
      expect(() => evmLogId(1.5, 0)).to.throw(/invalid evm block index/)
      expect(() => evmLogId(1, -1)).to.throw(/invalid evm log index/)
      expect(() => evmLogId(1, 2.5)).to.throw(/invalid evm log index/)
    })
  })

  describe("stored logs", () => {
    let context: Context
    let fixture: EventFixture
    let storer: EventStorer

    before(async () => {
      context = await createTestContext()
    })

    beforeEach(async () => {
      await resetDatabase(context.orm)
      fixture = new EventFixture(context.orm)
      storer = new EventStorer(context.orm, context)
    })

    after(async () => {
      await context.orm.close(true)
    })

    it("should derive the stored id from the log's chain position", async () => {
      const assetManager = context.requireContractAddress(ASSET_MANAGER_FXRP)
      const event = at(await fixture.generateEvent(EVENTS.ERC20.TRANSFER, assetManager), 4_242, 7)
      await storer.processEvent(event)
      const em = context.orm.em.fork()
      const stored = await em.findOneOrFail(Entities.EvmLog, { index: 7 }, { populate: ['block'] })
      expect(stored.id).to.equal(4_242 * EVM_LOG_INDEX_SCALE + 7)
      expect(stored.block.index).to.equal(4_242)
    })

    // The regression this encoding exists for: back-population inserts an old
    // block after a newer one has already been indexed. Under an autoincrement
    // key the old row got the higher id and sorted last.
    it("should order a back-indexed old log ahead of an already-stored newer one", async () => {
      const assetManager = context.requireContractAddress(ASSET_MANAGER_FXRP)
      await storer.processEvent(
        at(await fixture.generateEvent(EVENTS.ERC20.TRANSFER, assetManager), 9_000_000, 0))
      await storer.processEvent(
        at(await fixture.generateEvent(EVENTS.ERC20.TRANSFER, assetManager), 1_000, 5))

      const em = context.orm.em.fork()
      const logs = await em.find(Entities.EvmLog, {},
        { orderBy: { id: 'asc' }, populate: ['block'] })
      expect(logs.map(l => l.block.index)).to.deep.equal([1_000, 9_000_000])
    })

    it("should turn a block range into an id range by arithmetic alone", async () => {
      const assetManager = context.requireContractAddress(ASSET_MANAGER_FXRP)
      for (const block of [100, 500, 900]) {
        await storer.processEvent(
          at(await fixture.generateEvent(EVENTS.ERC20.TRANSFER, assetManager), block, 0))
      }
      const em = context.orm.em.fork()
      const lo = 400 * EVM_LOG_INDEX_SCALE
      const hi = (600 + 1) * EVM_LOG_INDEX_SCALE - 1
      const logs = await em.find(Entities.EvmLog, { id: { $gte: lo, $lte: hi } },
        { populate: ['block'] })
      expect(logs.map(l => l.block.index)).to.deep.equal([500])
    })

    it("should not store a second row when the same log is processed again", async () => {
      const assetManager = context.requireContractAddress(ASSET_MANAGER_FXRP)
      const event = at(await fixture.generateEvent(EVENTS.ERC20.TRANSFER, assetManager), 777, 3)
      expect(await storer.processEvent(event)).to.be.true
      expect(await storer.processEvent(event)).to.be.false
      const em = context.orm.em.fork()
      expect(await em.count(Entities.EvmLog, {})).to.equal(1)
    })
  })
})
