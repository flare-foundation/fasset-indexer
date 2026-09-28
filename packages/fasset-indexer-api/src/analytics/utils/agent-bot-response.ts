/**
 * Parsing of the `AgentPingResponse.response` payload.
 *
 * The payload is off-chain defined -- the contract only requires a string (see
 * IAgentPing) -- but fasset-bots answers liveness pings with its own software
 * identity as JSON:
 *
 *   {"name":"flarenetwork/fasset-bots","version":"1.4.0-rc.1"}
 *
 * Anything else (a non-JSON string, JSON without those keys, a bot that reports
 * more fields) has to stay harmless: an unparseable response is not an error,
 * it just means that agent's bot make/version is unknown.
 */

export interface AgentBotIdentity {
  name?: string
  version?: string
}

// The response is agent-controlled text of unbounded length, and it is served
// back on /agents and /scene for every vault at once. Cap what is echoed so a
// single agent cannot inflate those payloads; the identity payload is ~60 chars.
export const MAX_ECHOED_RESPONSE_LENGTH = 256

export function truncateAgentBotResponse(response: string): string {
  return response.length <= MAX_ECHOED_RESPONSE_LENGTH
    ? response
    : `${response.slice(0, MAX_ECHOED_RESPONSE_LENGTH)}…`
}

export function parseAgentBotResponse(response: string): AgentBotIdentity {
  let parsed: unknown
  try {
    parsed = JSON.parse(response)
  } catch {
    return {}
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}
  const { name, version } = parsed as Record<string, unknown>
  return {
    name: typeof name === 'string' && name.length > 0 ? name : undefined,
    version: typeof version === 'string' && version.length > 0 ? version : undefined
  }
}
