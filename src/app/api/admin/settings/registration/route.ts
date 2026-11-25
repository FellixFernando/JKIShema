import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { setSystemConfig } from '@/services/config.service'

export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if ((session.user as any)?.role !== 'MASTER') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Format body tidak valid.' }, { status: 400 })
  }

  if (!body || typeof body.is_registration_open !== 'boolean') {
    return NextResponse.json(
      { error: 'Nilai is_registration_open harus berupa boolean.' },
      { status: 400 }
    )
  }

  await setSystemConfig('is_registration_open', String(body.is_registration_open))

  return NextResponse.json({ success: true, is_registration_open: body.is_registration_open })
}
