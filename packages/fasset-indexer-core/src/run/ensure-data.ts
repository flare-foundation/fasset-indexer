import { Context } from "../context/context"
import { findOrCreateEntity } from "../orm"
import { AssetManagerSettings, UnderlyingAddress } from "../orm/entities"
import { CoreVaultManagerSettings } from "../orm/entities/state/settings"
import { FASSETS, FAssetType } from "../shared"


export async function ensureData(context: Context) {
  await ensureAssetManagerSettings(context)
  await ensureCoreVaultManagerSettings(context)
}

async function ensureAssetManagerSettings(context: Context) {
  for (const _fasset of FASSETS) {
    const fasset = FAssetType[_fasset]
    if (!context.supportsFAsset(fasset)) continue
    await context.orm.em.transactional(async em => {
      let assetManagerSettings = await em.findOne(AssetManagerSettings, { fasset })
      if (assetManagerSettings == null) {
        const assetManagerAddress = context.fAssetTypeToAssetManagerAddress(fasset)
        const assetManager = context.getAssetManagerContract(assetManagerAddress)
        const settings = await assetManager.getSettings()
        assetManagerSettings = em.create(AssetManagerSettings, {
          fasset, lotSizeAmg: settings.lotSizeAMG
        })
        em.persist(assetManagerSettings)
      }
    })
  }
}

async function ensureCoreVaultManagerSettings(context: Context) {
  const fasset = FAssetType.FXRP
  const coreVaultManagerAddress = context.fassetTypeToCoreVaultManagerAddress(fasset)
  const coreVaultManager = context.getCoreVaultManagerContract(coreVaultManagerAddress)
  await context.orm.em.transactional(async em => {
    let coreVaultManagerSettings = await em.findOne(CoreVaultManagerSettings, { fasset })
    if (coreVaultManagerSettings == null) {
      const settings = await coreVaultManager.getSettings()
      coreVaultManagerSettings = em.create(CoreVaultManagerSettings, {
        fasset,
        escrowAmount: settings._escrowAmount,
        minimalAmount: settings._minimalAmount,
        escrowEndTimeSeconds: Number(settings._escrowEndTimeSeconds),
        chainPaymentFee: settings._fee,

      })
      em.persist(coreVaultManagerSettings)
    }
    if (coreVaultManagerSettings.coreVault == null) {
      const _coreVault = await coreVaultManager.coreVaultAddress()
      const coreVault = await findOrCreateEntity(em, UnderlyingAddress, { text: _coreVault })
      coreVaultManagerSettings.coreVault = coreVault
    }
  })
}