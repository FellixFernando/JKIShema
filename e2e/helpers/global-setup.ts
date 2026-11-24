import { verifyGlobalCleanliness } from './global-cleanliness'

export default async function globalSetup(): Promise<void> {
  await verifyGlobalCleanliness('PRE_SUITE')
}
