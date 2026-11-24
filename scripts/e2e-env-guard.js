/**
 * Fail-Closed Pre-Execution E2E Environment Guard
 *
 * Enforces:
 * 1. APP_ENV must be 'e2e'.
 * 2. WHATSAPP_MOCK_MODE must be 'true'.
 * 3. DATABASE_URL must be present and parseable.
 * 4. DATABASE_URL must strictly target localhost / 127.0.0.1 / ::1 on port 5432, database /jkishema_e2e, user tiffany.
 * 5. DIRECT_URL (if present) must strictly target localhost / 127.0.0.1 / ::1 on port 5432, database /jkishema_e2e, user tiffany.
 * 6. Any remote host (including Supabase pooler or direct host) is rejected immediately with [SECURITY BLOCKED].
 * 7. Never logs credentials or connection strings with passwords.
 * 8. Never silently replaces an unexpected remote URL with a local URL.
 * 9. Spawns child process if arguments provided, forwarding all signals and exit code.
 */

const ALLOWED_LOCAL_HOSTS = ['localhost', '127.0.0.1', '::1', '']
const ALLOWED_LOCAL_USERS = ['tiffany']
const EXPECTED_DATABASE = 'jkishema_e2e'
const EXPECTED_PATH = '/jkishema_e2e'
const EXPECTED_PORT = 5432

function parseEndpoint(urlStr, varName) {
  try {
    const u = new URL(urlStr.replace(/^postgresql:\/\//i, 'http://'))
    return {
      host: u.hostname.toLowerCase(),
      port: u.port ? parseInt(u.port, 10) : 5432,
      user: decodeURIComponent(u.username).toLowerCase(),
      pathname: u.pathname.toLowerCase(),
    }
  } catch {
    throw new Error(`[SECURITY BLOCKED] ${varName} is not a valid PostgreSQL connection URL.`)
  }
}

function validateE2EEnvironment(env = process.env) {
  const appEnv = env.APP_ENV
  if (appEnv !== 'e2e') {
    throw new Error(`[SECURITY BLOCKED] Execution aborted: APP_ENV is "${appEnv || ''}", expected "e2e".`)
  }

  const mockMode = env.WHATSAPP_MOCK_MODE
  if (mockMode !== 'true') {
    throw new Error(
      `[SECURITY BLOCKED] Execution aborted: WHATSAPP_MOCK_MODE is "${mockMode || ''}", expected "true". Outbound WhatsApp calls must be mocked.`
    )
  }

  const dbUrl = env.DATABASE_URL
  if (!dbUrl) {
    throw new Error('[SECURITY BLOCKED] Execution aborted: DATABASE_URL is missing.')
  }

  const dbEndpoint = parseEndpoint(dbUrl, 'DATABASE_URL')

  if (!ALLOWED_LOCAL_HOSTS.includes(dbEndpoint.host)) {
    throw new Error(
      `[SECURITY BLOCKED] Disallowed DATABASE_URL host: "${dbEndpoint.host}". E2E execution is strictly restricted to local database on localhost/127.0.0.1. Remote and Supabase targets are strictly forbidden.`
    )
  }

  if (dbEndpoint.port !== EXPECTED_PORT) {
    throw new Error(
      `[SECURITY BLOCKED] Invalid local E2E database port in DATABASE_URL: ${dbEndpoint.port}. Expected ${EXPECTED_PORT}.`
    )
  }

  if (!ALLOWED_LOCAL_USERS.includes(dbEndpoint.user)) {
    throw new Error(
      `[SECURITY BLOCKED] Unauthorized local E2E database username in DATABASE_URL: "${dbEndpoint.user}". Expected "${ALLOWED_LOCAL_USERS.join('", "')}".`
    )
  }

  if (dbEndpoint.pathname !== EXPECTED_PATH) {
    throw new Error(
      `[SECURITY BLOCKED] Unauthorized local E2E database name in DATABASE_URL: "${dbEndpoint.pathname}". Expected "${EXPECTED_PATH}".`
    )
  }

  const directUrl = env.DIRECT_URL
  if (directUrl) {
    const directEndpoint = parseEndpoint(directUrl, 'DIRECT_URL')

    if (!ALLOWED_LOCAL_HOSTS.includes(directEndpoint.host)) {
      throw new Error(
        `[SECURITY BLOCKED] Disallowed DIRECT_URL host: "${directEndpoint.host}". DIRECT_URL must point to local E2E database on localhost/127.0.0.1.`
      )
    }

    if (directEndpoint.port !== EXPECTED_PORT) {
      throw new Error(
        `[SECURITY BLOCKED] Invalid local E2E direct port in DIRECT_URL: ${directEndpoint.port}. Expected ${EXPECTED_PORT}.`
      )
    }

    if (!ALLOWED_LOCAL_USERS.includes(directEndpoint.user)) {
      throw new Error(
        `[SECURITY BLOCKED] Unauthorized local E2E database username in DIRECT_URL: "${directEndpoint.user}". Expected "${ALLOWED_LOCAL_USERS.join('", "')}".`
      )
    }

    if (directEndpoint.pathname !== EXPECTED_PATH) {
      throw new Error(
        `[SECURITY BLOCKED] DIRECT_URL database path "${directEndpoint.pathname}" does not match local E2E database "${EXPECTED_PATH}".`
      )
    }
  }

  return true
}

if (require.main === module) {
  try {
    validateE2EEnvironment(process.env)
  } catch (err) {
    console.error(err.message)
    process.exit(1)
  }

  const args = process.argv.slice(2)
  if (args.length > 0) {
    const { spawn } = require('child_process')
    const child = spawn(args[0], args.slice(1), {
      stdio: 'inherit',
      env: process.env,
    })

    child.on('exit', (code, signal) => {
      if (signal) {
        process.kill(process.pid, signal)
      } else {
        process.exit(code ?? 0)
      }
    })
  }
}

module.exports = {
  validateE2EEnvironment,
  parseEndpoint,
  ALLOWED_LOCAL_HOSTS,
  ALLOWED_LOCAL_USERS,
  EXPECTED_DATABASE,
  EXPECTED_PORT,
}
