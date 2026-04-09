import { ConfigLoader } from "../config/config"
import { Context } from "../context/context"
import { EvmStateWatchdog } from "../indexer/watchdog"
import { Erc4626SharePrice } from "../orm/entities"

const N_BLOCK_STEP = 40

async function main() {
    const config = new ConfigLoader()
    const context = await Context.create(config)
    const watchdog = new EvmStateWatchdog(context)

    const em = context.orm.em.fork()
    const startBlock = 56930651 + N_BLOCK_STEP // earnXRP Flare deployment
    const endEntity = await em.findOne(Erc4626SharePrice, { block: { index: { $gt: startBlock }}}, { orderBy: { block: { index: 'asc' }}})
    const endBlock = endEntity?.block.index!
    console.log(startBlock, endBlock)

    for (let block = startBlock; block < endBlock; block += N_BLOCK_STEP) {
        try {
            await context.orm.em.transactional(async em => {
                await watchdog.watchVaultSharePrice(em, block)
                console.log('stored block', block)
            })
        } catch (e: any) {
            console.log('error', e)
        }
    }
}


main()