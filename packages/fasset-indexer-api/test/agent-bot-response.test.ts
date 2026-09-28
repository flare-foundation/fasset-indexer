import { describe, it } from 'mocha'
import { expect } from 'chai'
import {
  MAX_ECHOED_RESPONSE_LENGTH, parseAgentBotResponse, truncateAgentBotResponse
} from '../src/analytics/utils/agent-bot-response'


describe('parseAgentBotResponse', () => {
  it('reads name and version out of the fasset-bots payload', () => {
    expect(parseAgentBotResponse('{"name":"flarenetwork/fasset-bots","version":"1.4.0-rc.1"}'))
      .to.deep.equal({ name: 'flarenetwork/fasset-bots', version: '1.4.0-rc.1' })
  })

  it('ignores extra fields a bot may add', () => {
    const parsed = parseAgentBotResponse('{"name":"b","version":"2.0.0","commit":"abc","uptime":123}')
    expect(parsed).to.deep.equal({ name: 'b', version: '2.0.0' })
  })

  it('returns nothing for a response that is not JSON', () => {
    expect(parseAgentBotResponse('alive')).to.deep.equal({})
    expect(parseAgentBotResponse('')).to.deep.equal({})
  })

  it('returns nothing for JSON that is not an identity object', () => {
    expect(parseAgentBotResponse('"1.4.0"')).to.deep.equal({})
    expect(parseAgentBotResponse('42')).to.deep.equal({})
    expect(parseAgentBotResponse('null')).to.deep.equal({})
    expect(parseAgentBotResponse('[{"version":"1.4.0"}]')).to.deep.equal({})
  })

  it('drops non-string and empty values rather than passing them through', () => {
    expect(parseAgentBotResponse('{"name":"","version":1}'))
      .to.deep.equal({ name: undefined, version: undefined })
  })

  it('takes a version even when the bot omits its name', () => {
    expect(parseAgentBotResponse('{"version":"1.4.0"}'))
      .to.deep.equal({ name: undefined, version: '1.4.0' })
  })
})

describe('truncateAgentBotResponse', () => {
  it('leaves a response that fits untouched', () => {
    const identity = '{"name":"flarenetwork/fasset-bots","version":"1.4.0-rc.1"}'
    expect(truncateAgentBotResponse(identity)).to.equal(identity)
  })

  it('caps an oversized response so one agent cannot inflate /agents', () => {
    const truncated = truncateAgentBotResponse('x'.repeat(MAX_ECHOED_RESPONSE_LENGTH * 4))
    expect(truncated).to.have.lengthOf(MAX_ECHOED_RESPONSE_LENGTH + 1)
    expect(truncated.endsWith('…')).to.equal(true)
  })
})
