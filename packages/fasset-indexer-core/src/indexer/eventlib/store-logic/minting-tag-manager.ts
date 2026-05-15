import { EntityManager } from "@mikro-orm/knex"
import { findOrCreateEntity } from "../../../orm"
import * as Entities from '../../../orm/entities'
import { EVENTS } from '../../../config'
import type { Event } from "../types"
import type * as MTM from '../../../../chain/typechain/IMintingTagManager'


export class MintingTagManagerEventStorer {
  async processEvent(em: EntityManager, log: Event, evmLog: Entities.EvmLog): Promise<boolean> {
    switch (log.name) {
      case EVENTS.MINTING_TAG_MANAGER.MINTING_TAG_RESERVED: {
        await this.storeMintingTagReserved(em, evmLog, log.args)
        break
      } case EVENTS.MINTING_TAG_MANAGER.RECIPIENT_CHANGED: {
        await this.storeRecipientChanged(em, evmLog, log.args)
        break
      } case EVENTS.MINTING_TAG_MANAGER.ALLOWED_EXECUTOR_CHANGE_PENDING: {
        await this.storeAllowedExecutorChangePending(em, evmLog, log.args)
        break
      } case EVENTS.MINTING_TAG_MANAGER.RESERVATION_FEE_CHANGED: {
        await this.storeReservationFeeChanged(em, evmLog, log.args)
        break
      } default: {
        return false
      }
    }
    return true
  }

  async storeMintingTagReserved(
    em: EntityManager, evmLog: Entities.EvmLog, logArgs: MTM.MintingTagReservedEvent.OutputTuple
  ): Promise<Entities.MintingTagReserved> {
    const [tag, ownerAddress] = logArgs
    const owner = await findOrCreateEntity(em, Entities.EvmAddress, { hex: ownerAddress })
    return em.create(Entities.MintingTagReserved, { evmLog, tag, owner })
  }

  async storeRecipientChanged(
    em: EntityManager, evmLog: Entities.EvmLog, logArgs: MTM.RecipientChangedEvent.OutputTuple
  ): Promise<Entities.MintingTagRecipientChanged> {
    const [tag, recipientAddress] = logArgs
    const recipient = await findOrCreateEntity(em, Entities.EvmAddress, { hex: recipientAddress })
    return em.create(Entities.MintingTagRecipientChanged, { evmLog, tag, recipient })
  }

  async storeAllowedExecutorChangePending(
    em: EntityManager, evmLog: Entities.EvmLog, logArgs: MTM.AllowedExecutorChangePendingEvent.OutputTuple
  ): Promise<Entities.MintingTagAllowedExecutorChangePending> {
    const [tag, executorAddress, activeAfterTs] = logArgs
    const executor = await findOrCreateEntity(em, Entities.EvmAddress, { hex: executorAddress })
    return em.create(Entities.MintingTagAllowedExecutorChangePending, { evmLog, tag, executor, activeAfterTs })
  }

  async storeReservationFeeChanged(
    em: EntityManager, evmLog: Entities.EvmLog, logArgs: MTM.ReservationFeeChangedEvent.OutputTuple
  ): Promise<Entities.MintingTagReservationFeeChanged> {
    const [reservationFee, recipientAddress] = logArgs
    const recipient = await findOrCreateEntity(em, Entities.EvmAddress, { hex: recipientAddress })
    return em.create(Entities.MintingTagReservationFeeChanged, { evmLog, reservationFee, recipient })
  }
}
