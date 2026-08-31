import { describe, it } from "mocha"
import { expect } from "chai"
import { EventInterface } from "../src/context/events"
import { EVENTS } from "../src/config/constants"
import { Interface } from "ethers"

function oneOfHasEvent(ifaces: Interface[], eventnam: string): boolean {
  for (const iface of ifaces) {
    if (iface.hasEvent(eventnam)) return true
  }
  return false
}

describe("FAsset evm events", () => {
  let eventIface: EventInterface

  before(async () => {
    eventIface = new EventInterface()
  })

  it("should verify all asset manager event names are included in the interface", async () => {
    for (const eventname of Object.values(EVENTS.ASSET_MANAGER)) {
      expect(oneOfHasEvent(eventIface.interfaces.assetManagerInterface, eventname)).to.be.true
    }
  })

  it("should verify all collateral pool event names are included in the interface", async () => {
    for (const eventname of Object.values(EVENTS.COLLATERAL_POOL)) {
      expect(oneOfHasEvent(eventIface.interfaces.collateralPoolInterface, eventname)).to.be.true
    }
  })

  it("should verify all erc20 event names are included in the interface", async () => {
    for (const eventname of Object.values(EVENTS.ERC20)) {
      expect(oneOfHasEvent(eventIface.interfaces.erc20Interface, eventname)).to.be.true
    }
  })

  // Covers every contract group, not just the three asserted above. An event
  // configured for indexing but absent from the artifact used to yield no topic
  // and be dropped from the scrape filter in silence, so it is worth checking
  // the whole set resolves rather than one interface at a time.
  it("should resolve a topic for every configured event", async () => {
    for (const contract of Object.keys(EVENTS) as (keyof typeof EVENTS)[]) {
      const ifaces = eventIface.contractToIface(contract)
      for (const eventname of Object.values(EVENTS[contract])) {
        expect(() => eventIface.getEventTopics(eventname, ifaces), `${contract}:${eventname}`).to.not.throw()
      }
    }
  })

  it("should throw when an event is in no interface", async () => {
    const ifaces = eventIface.contractToIface("ASSET_MANAGER")
    expect(() => eventIface.getEventTopics("NoSuchEventExists", ifaces))
      .to.throw("Event NoSuchEventExists not found in interface")
  })

})