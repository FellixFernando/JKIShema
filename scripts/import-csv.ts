import 'dotenv/config'
import fs from 'fs'
import { importParticipantsFromCSV } from '../src/services/advanced.service'
import { db } from '../src/lib/db'

const USAGE = `Usage: npm run import-csv -- --file <path> [--dry-run] [--limit <n>]

Imports participants from a CSV file into the database.
  --file <path>   Path to the CSV file (required).
  --dry-run       Parse, validate and check capacity without writing anything.
  --limit <n>     Process only the first n data rows.
  --help          Show this help.`

interface Args {
  file: string
  dryRun: boolean
  limit?: number
  help: boolean
}

function parseArgs(argv: string[]): Args {
  const args: Args = { file: '', dryRun: false, help: false }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--help' || arg === '-h') args.help = true
    else if (arg === '--dry-run') args.dryRun = true
    else if (arg === '--file') args.file = argv[++i] ?? ''
    else if (arg === '--limit') {
      const parsed = parseInt(argv[++i] ?? '', 10)
      if (Number.isInteger(parsed) && parsed >= 0) args.limit = parsed
    }
  }
  return args
}

async function main() {
  const args = parseArgs(process.argv.slice(2))

  if (args.help) {
    console.log(USAGE)
    return
  }

  if (!args.file) {
    console.error(USAGE)
    process.exitCode = 2
    return
  }

  const csvText = fs.readFileSync(args.file, 'utf8')
  const result = await importParticipantsFromCSV(csvText, { dryRun: args.dryRun, limit: args.limit })

  console.log(`Imported: ${result.importedCount}`)
  console.log(`Skipped: ${result.skippedCount}`)
  // Only the line number and reason are printed: never names or phone numbers.
  for (const item of result.skipped) {
    console.log(`  line ${item.line}: ${item.reason}`)
  }
  if (result.dryRun) {
    console.log('Dry run: nothing was written.')
  }
}

main()
  .catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e)
    process.exitCode = 1
  })
  .finally(async () => {
    await db.$disconnect()
  })
