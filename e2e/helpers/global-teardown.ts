import { verifyGlobalCleanliness } from './global-cleanliness'

export default async function globalTeardown(): Promise<void> {
  await verifyGlobalCleanliness('POST_SUITE')
}
