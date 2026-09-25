import { verifyCredentials } from '@/services/auth.service'
import { db } from '@/lib/db'
import bcrypt from 'bcryptjs'

// Mock the database
jest.mock('@/lib/db', () => ({
  db: {
    user: {
      findUnique: jest.fn(),
    },
  },
}))

describe('Admin Authentication Service', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should return null if user does not exist', async () => {
    (db.user.findUnique as jest.Mock).mockResolvedValue(null)
    
    const user = await verifyCredentials('unknown', 'password')
    expect(user).toBeNull()
    expect(db.user.findUnique).toHaveBeenCalledWith({ where: { username: 'unknown' } })
  })

  it('should return null if password does not match', async () => {
    const hashedPassword = await bcrypt.hash('correct_password', 10);
    (db.user.findUnique as jest.Mock).mockResolvedValue({
      id: '123',
      username: 'admin',
      password_hash: hashedPassword,
      role: 'MASTER'
    })
    
    const user = await verifyCredentials('admin', 'wrong_password')
    expect(user).toBeNull()
  })

  it('should return user object without password if credentials are valid', async () => {
    const hashedPassword = await bcrypt.hash('correct_password', 10);
    (db.user.findUnique as jest.Mock).mockResolvedValue({
      id: '123',
      username: 'admin',
      password_hash: hashedPassword,
      role: 'MASTER'
    })
    
    const user = await verifyCredentials('admin', 'correct_password')
    expect(user).not.toBeNull()
    expect(user?.username).toBe('admin')
    expect(user?.role).toBe('MASTER')
    expect(user).not.toHaveProperty('password_hash')
  })
})
