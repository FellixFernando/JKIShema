import { NextResponse } from 'next/server'
import { getParticipants } from '@/services/dashboard.service'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const search = searchParams.get('search') || undefined
  const status = (searchParams.get('status') as any) || 'ALL'

  const list = await getParticipants({ search, status })
  return NextResponse.json(list)
}
