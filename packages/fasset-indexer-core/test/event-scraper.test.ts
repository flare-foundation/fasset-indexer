import { describe, before, after, it } from "mocha"
import { expect } from "chai"
import { Context } from "../src/context/context"
import { EventScraper } from "../src/indexer/eventlib/event-scraper"
import { EVENTS } from "../src/config/constants"
import { createTestContext } from "./fixtures/db"
import type { Log } from "ethers"


const PERSONAL_ACCOUNT_CREATED = `MASTER_ACCOUNT_CONTROLLER:${EVENTS.MASTER_ACCOUNT_CONTROLLER.PERSONAL_ACCOUNT_CREATED}`
const COLLATERAL_RESERVED = `ASSET_MANAGER:${EVENTS.ASSET_MANAGER.COLLATERAL_RESERVED}`
const ERC20_TRANSFER = `ERC20:${EVENTS.ERC20.TRANSFER}`
const POOL_ENTERED = `COLLATERAL_POOL:${EVENTS.COLLATERAL_POOL.ENTER}`

// Object.create keeps the context's caches and methods, so these read as the
// same context with one field swapped — no second ContractLookup, which would
// hand back the singleton anyway.
function withMaxFilterTopics(context: Context, max: number): Context {
  const config = Object.create(context.config, { evmLogFetchMaxFilterTopics: { value: max } })
  return Object.create(context, { config: { value: config } })
}

function withCapturingProvider(context: Context, logs: Log[]): { context: Context, requests: any[] } {
  const requests: any[] = []
  const provider = { getLogs: async (filter: any) => { requests.push(filter); return logs } }
  return { context: Object.create(context, { provider: { value: provider } }), requests }
}

describe("event scraper log narrowing", () => {
  let context: Context

  before(async () => {
    context = await createTestContext()
  })

  after(async () => {
    await context.orm.close(true)
  })

  // The reindex case: a back-population of one smart-account event has no
  // business pulling every log on the chain.
  it("narrows a single-event back-population to one address and one topic", () => {
    const { narrowing } = new EventScraper(context, [PERSONAL_ACCOUNT_CREATED])
    expect(narrowing.address).to.deep.equal([context.requireContractAddress('MasterAccountController')])
    expect(narrowing.topics).to.exist
    expect(narrowing.topics![0]).to.deep.equal(
      context.getEventTopics(EVENTS.MASTER_ACCOUNT_CONTROLLER.PERSONAL_ACCOUNT_CREATED,
        context.contractToIface('MASTER_ACCOUNT_CONTROLLER'))
    )
  })

  it("unions the addresses of every interface in the configured set", () => {
    const { narrowing } = new EventScraper(context, [PERSONAL_ACCOUNT_CREATED, COLLATERAL_RESERVED])
    const addresses = narrowing.address!
    expect(addresses).to.include(context.requireContractAddress('MasterAccountController'))
    const assetManagers = addresses.filter(a => context.isAssetManager(a))
    expect(assetManagers.length).to.be.greaterThan(1, 'coston deploys several asset managers')
    expect(addresses.length).to.equal(assetManagers.length + 1)
  })

  // Collateral pools and pool tokens are resolved out of agent_vault at parse
  // time, so a vault created inside the fetched range would emit from an address
  // no precomputed list can hold.
  for (const dynamic of [ERC20_TRANSFER, POOL_ENTERED]) {
    it(`does not narrow by address when ${dynamic} is indexed`, () => {
      const { narrowing } = new EventScraper(context, [COLLATERAL_RESERVED, dynamic])
      expect(narrowing.address).to.be.undefined
      expect(narrowing.topics, 'topics stay narrowed regardless').to.exist
    })
  }

  it("narrows by topic alone when indexing every event", () => {
    const { narrowing } = new EventScraper(context)
    expect(narrowing.address).to.be.undefined
    expect(narrowing.topics![0].length).to.equal(context.getTopicToIfaceMap().size)
  })

  it("drops the topic filter when the set exceeds the configured maximum", () => {
    const { narrowing } = new EventScraper(withMaxFilterTopics(context, 1), [PERSONAL_ACCOUNT_CREATED, COLLATERAL_RESERVED])
    expect(narrowing.topics).to.be.undefined
    expect(narrowing.address, 'address narrowing is independent of the topic cap').to.exist
  })

  it("filters nothing when narrowing is disabled", () => {
    const { narrowing } = new EventScraper(withMaxFilterTopics(context, 0))
    expect(narrowing).to.deep.equal({})
  })

  // The whole change is only safe if the filter is exactly the predicate
  // EventParser applies first, so no configured event may be filtered out.
  it("keeps a topic for every configured event", () => {
    const eventnames = Object.entries(EVENTS).flatMap(
      ([iface, events]) => Object.values(events).map(event => `${iface}:${event}`))
    const { narrowing } = new EventScraper(context, eventnames)
    for (const eventname of eventnames) {
      const [iface, event] = eventname.split(':')
      for (const topic of context.getEventTopics(event, context.contractToIface(iface))) {
        expect(narrowing.topics![0], `${eventname} must survive the filter`).to.include(topic)
      }
    }
  })

  it("sends the narrowing with the block range and orders the response", async () => {
    const log = (blockNumber: number, index: number) => ({ blockNumber, index }) as Log
    const { context: capturing, requests } = withCapturingProvider(context, [
      log(11, 0), log(10, 3), log(10, 1)
    ])
    const scraper = new EventScraper(capturing, [PERSONAL_ACCOUNT_CREATED])
    const logs = await scraper.getLogs(10, 11)
    expect(requests).to.have.length(1)
    expect(requests[0]).to.deep.equal({ ...scraper.narrowing, fromBlock: 10, toBlock: 11 })
    expect(logs.map(l => [l.blockNumber, l.index])).to.deep.equal([[10, 1], [10, 3], [11, 0]])
  })
})
