import { EntityManager } from "@mikro-orm/knex"
import { findOrCreateEntity } from "../../../orm"
import { FAssetType } from "../../../shared"
import * as Entities from '../../../orm/entities'
import { EVENTS } from '../../../config'
import type { Event } from "../types"
import type * as FOA from '../../../../chain/typechain/FAssetOFTAdapter'

export class OftAdapterEventStorer {
  async processEvent(em: EntityManager, log: Event, evmLog: Entities.EvmLog): Promise<boolean> {
    switch (log.name) {
      case EVENTS.OFT_ADAPTER.OFT_RECEIVED: {
        await this.storeOftReceived(em, evmLog, log.args)
        break
      } case EVENTS.OFT_ADAPTER.OFT_SEND: {
        await this.storeOftSent(em, evmLog, log.args)
        break
      } default: {
        return false
      }
    }
    return true
  }

  async storeOftReceived(
    em: EntityManager, evmLog: Entities.EvmLog, logArgs: FOA.OFTReceivedEvent.OutputTuple
  ): Promise<Entities.OFTReceived> {
    const [guid, srcEid, toAddress, amountReceivedLD] = logArgs
    const to = await findOrCreateEntity(em, Entities.EvmAddress, { hex: toAddress })
    return em.create(Entities.OFTReceived, {
      fasset: FAssetType.FXRP, evmLog, guid, srcEid, to, amountReceivedLD
    })
  }

  async storeOftSent(
    em: EntityManager, evmLog: Entities.EvmLog, logArgs: FOA.OFTSentEvent.OutputTuple
  ): Promise<Entities.OFTSent> {
    const [guid, dstEid, fromAddress, amountSentLD, amountReceivedLD] = logArgs
    const from = await findOrCreateEntity(em, Entities.EvmAddress, { hex: fromAddress })
    return em.create(Entities.OFTSent, {
      fasset: FAssetType.FXRP, evmLog, guid, dstEid, from, amountSentLD, amountReceivedLD
    })
  }
}