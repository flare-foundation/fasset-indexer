import { describe, before, beforeEach, after, it } from "mocha"
import { expect } from "chai"
import { setVar } from "../src/orm/utils"
import { FIRST_UNHANDLED_EVENT_BLOCK_DB_KEY } from "../src/config/constants"
import {
  backIndexerStats, backIndexerSynced, raceIndexerSynced, updateDistance,
  backUpdateFirstUnhandledBlockName, backUpdateLastBlockName,
  raceUpdateFirstUnhandledBlockName, raceIndexerSyncedFlagName
} from "../src/utils/updates"
import { createTestContext, resetDatabase } from "./fixtures/db"
import type { Context } from "../src/context/context"


const UPDATE = 'personal-accounts'

describe("update tracking", () => {
  let context: Context

  before(async () => {
    context = await createTestContext()
  })

  beforeEach(async () => {
    await resetDatabase(context.orm)
  })

  after(async () => {
    await context.orm.close(true)
  })

  function em() {
    return context.orm.em.fork()
  }

  // The back population walks firstUnhandled up towards last, which it froze at
  // the regular indexer's position when the update started.
  async function setBackVars(firstUnhandled: number, last: number) {
    await setVar(em(), backUpdateFirstUnhandledBlockName(UPDATE), firstUnhandled.toString())
    await setVar(em(), backUpdateLastBlockName(UPDATE), last.toString())
  }

  async function setRaceVars(firstUnhandledRace: number, firstUnhandledRegular: number) {
    await setVar(em(), raceUpdateFirstUnhandledBlockName(UPDATE), firstUnhandledRace.toString())
    await setVar(em(), FIRST_UNHANDLED_EVENT_BLOCK_DB_KEY, firstUnhandledRegular.toString())
  }

  describe("back population", () => {

    it("should read the stats in first-unhandled, last order", async () => {
      await setBackVars(1000, 5000)
      expect(await backIndexerStats(em(), UPDATE)).to.deep.equal([1000, 5000])
    })

    it("should count the blocks left to back-sync as a positive number", async () => {
      // The bug this guards: reading the two vars into swapped names returned
      // firstUnhandled - last + 1, which the api served as a large negative.
      await setBackVars(23_456_789, 36_290_968)
      expect(await updateDistance(em(), UPDATE)).to.equal(12_834_180)
    })

    it("should count one block left when first unhandled is the last block", async () => {
      await setBackVars(5000, 5000)
      expect(await updateDistance(em(), UPDATE)).to.equal(1)
      expect(await backIndexerSynced(em(), UPDATE), 'block 5000 is still unhandled').to.be.false
    })

    it("should report zero and synced once first unhandled passes the last block", async () => {
      // runHistoric leaves firstUnhandled at endBlock + 1
      await setBackVars(5001, 5000)
      expect(await updateDistance(em(), UPDATE)).to.equal(0)
      expect(await backIndexerSynced(em(), UPDATE)).to.be.true
    })

    it("should not report synced before the back indexer has written anything", async () => {
      expect(await backIndexerSynced(em(), UPDATE)).to.be.false
      expect(await updateDistance(em(), UPDATE)).to.be.null
    })

    it("should not report synced when only one of the two vars exists", async () => {
      await setVar(em(), backUpdateLastBlockName(UPDATE), '5000')
      expect(await backIndexerSynced(em(), UPDATE)).to.be.false
      expect(await updateDistance(em(), UPDATE)).to.be.null
    })
  })

  describe("race population", () => {

    it("should count the blocks between the race and regular indexers", async () => {
      await setRaceVars(1000, 5000)
      expect(await updateDistance(em(), UPDATE)).to.equal(4001)
      expect(await raceIndexerSynced(em(), UPDATE)).to.be.false
    })

    it("should report zero once the synced flag is set", async () => {
      await setRaceVars(1000, 5000)
      await setVar(em(), raceIndexerSyncedFlagName(UPDATE), 'true')
      expect(await raceIndexerSynced(em(), UPDATE)).to.be.true
      expect(await updateDistance(em(), UPDATE)).to.equal(0)
    })

    it("should prefer the race vars over the back vars when both exist", async () => {
      await setRaceVars(1000, 5000)
      await setBackVars(23_456_789, 36_290_968)
      expect(await updateDistance(em(), UPDATE)).to.equal(4001)
    })

    it("should fall back to the back vars when the race indexer has not started", async () => {
      await setVar(em(), FIRST_UNHANDLED_EVENT_BLOCK_DB_KEY, '36290968')
      await setBackVars(23_456_789, 36_290_968)
      expect(await updateDistance(em(), UPDATE)).to.equal(12_834_180)
    })
  })
})
