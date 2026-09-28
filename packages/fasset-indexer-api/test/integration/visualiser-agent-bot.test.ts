import { describe, it, before, after, beforeEach } from 'mocha'
import { expect } from 'chai'
import { FAssetType } from 'fasset-indexer-core'
import { VisualiserAnalytics } from '../../src/analytics/visualiser'
import { startTestDb, TestDb } from './db-harness'
import { Fixtures } from './fixtures'


// Covers the agent bot make/version surfaced on AgentOverview.bot: indexed
// AgentPingResponse rows → latest response per vault → parsed identity on
// /api/visualiser/agents (and everything else built on agents()).
describe('VisualiserAnalytics — agent bot version from ping responses', () => {
  let db: TestDb
  let visualiser: VisualiserAnalytics

  const VAULT = '0x1000000000000000000000000000000000000001'
  const OTHER_VAULT = '0x1000000000000000000000000000000000000002'

  before(async function () {
    this.timeout(60000)
    db = await startTestDb()
    visualiser = new VisualiserAnalytics(db.orm, 'coston2')
  })

  after(async () => { if (db) await db.stop() })

  beforeEach(async () => {
    await db.orm.schema.refreshDatabase()
  })

  async function trackedVault(fx: Fixtures, addressHex: string) {
    const vault = await fx.agentVault({
      fasset: FAssetType.FXRP,
      addressHex,
      underlyingText: `r${addressHex.slice(2)}`,
      poolHex: `0x2${addressHex.slice(3)}`
    })
    await fx.agentVaultInfo({ agentVault: vault })
    return vault
  }

  it('reports name and version from the newest ping response', async () => {
    const fx = new Fixtures(db.orm.em.fork())
    const vault = await trackedVault(fx, VAULT)
    await fx.agentPingResponse({
      fasset: FAssetType.FXRP, agentVault: vault, blockIndex: 100, blockTimestamp: 1_700_000_100,
      response: '{"name":"flarenetwork/fasset-bots","version":"1.3.0"}'
    })
    await fx.agentPingResponse({
      fasset: FAssetType.FXRP, agentVault: vault, blockIndex: 200, blockTimestamp: 1_700_000_200,
      response: '{"name":"flarenetwork/fasset-bots","version":"1.4.0-rc.1"}'
    })

    const [agent] = await visualiser.agents()
    expect(agent.vault).to.equal(VAULT)
    expect(agent.bot?.name).to.equal('flarenetwork/fasset-bots')
    expect(agent.bot?.version).to.equal('1.4.0-rc.1')
    expect(agent.bot?.respondedAtTimestamp).to.equal(1_700_000_200)
  })

  it('keeps each vault on its own latest response', async () => {
    const fx = new Fixtures(db.orm.em.fork())
    const vault = await trackedVault(fx, VAULT)
    const other = await trackedVault(fx, OTHER_VAULT)
    await fx.agentPingResponse({
      fasset: FAssetType.FXRP, agentVault: vault, blockIndex: 100, blockTimestamp: 1_700_000_100,
      response: '{"name":"flarenetwork/fasset-bots","version":"1.3.0"}'
    })
    await fx.agentPingResponse({
      fasset: FAssetType.FXRP, agentVault: other, blockIndex: 300, blockTimestamp: 1_700_000_300,
      response: '{"name":"someone/other-bot","version":"0.1.0"}'
    })

    const agents = await visualiser.agents()
    const byVault = new Map(agents.map(a => [a.vault, a]))
    expect(byVault.get(VAULT)!.bot?.version).to.equal('1.3.0')
    expect(byVault.get(OTHER_VAULT)!.bot?.version).to.equal('0.1.0')
    expect(byVault.get(OTHER_VAULT)!.bot?.name).to.equal('someone/other-bot')
  })

  it('leaves bot unset for a vault that never answered a ping', async () => {
    const fx = new Fixtures(db.orm.em.fork())
    await trackedVault(fx, VAULT)

    const [agent] = await visualiser.agents()
    expect(agent.bot ?? null).to.equal(null)
  })

  it('keeps the raw response when it is not the JSON identity payload', async () => {
    const fx = new Fixtures(db.orm.em.fork())
    const vault = await trackedVault(fx, VAULT)
    await fx.agentPingResponse({
      fasset: FAssetType.FXRP, agentVault: vault, blockIndex: 100, blockTimestamp: 1_700_000_100,
      response: 'alive'
    })

    const [agent] = await visualiser.agents()
    expect(agent.bot?.response).to.equal('alive')
    expect(agent.bot?.name ?? null).to.equal(null)
    expect(agent.bot?.version ?? null).to.equal(null)
    expect(agent.bot?.respondedAtTimestamp).to.equal(1_700_000_100)
  })
})
