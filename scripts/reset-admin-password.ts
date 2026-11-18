import { db } from '../src/lib/db'
import bcrypt from 'bcryptjs'

async function updatePassword() {
  const hash = await bcrypt.hash('2810200616022005', 10)
  const user = await db.user.update({
    where: { username: 'masterjkishema' },
    data: { password_hash: hash },
  })
  console.log('Password updated successfully for:', user.username)
  const match = await bcrypt.compare('2810200616022005', user.password_hash)
  console.log('Verification check - password matches:', match)
}

updatePassword()
  .catch(console.error)
  .finally(async () => {
    await db.$disconnect()
  })
