import { agentTable } from '@data/db/schemas/agent'
import { appStateTable } from '@data/db/schemas/appState'
import { seeders } from '@data/db/seeding/seederRegistry'
import { BuiltinAgentAvatarRefreshSeeder } from '@data/db/seeding/seeders/builtinAgentAvatarRefreshSeeder'
import { CherryAssistantSeeder } from '@data/db/seeding/seeders/cherryAssistantSeeder'
import { SeedRunner } from '@data/db/seeding/SeedRunner'
import { generateOrderKeyBetween } from '@data/services/utils/orderKey'
import { setupTestDatabase } from '@test-helpers/db'
import { eq, sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

function builtinAgents(db: ReturnType<typeof setupTestDatabase>['db']) {
  return db
    .select()
    .from(agentTable)
    .where(sql`json_extract(${agentTable.configuration}, '$.builtin_role') = 'assistant'`)
    .all()
}

function insertBuiltinAgent(db: ReturnType<typeof setupTestDatabase>['db'], avatar: string) {
  db.insert(agentTable)
    .values({
      id: `builtin-${avatar}`,
      type: 'claude-code',
      name: 'Magic Assistant',
      description: '',
      instructions: '',
      configuration: {
        avatar,
        permission_mode: 'default',
        max_turns: 100,
        env_vars: {},
        builtin_role: 'assistant'
      },
      orderKey: generateOrderKeyBetween(null, null)
    })
    .run()
}

function insertOrdinaryAgent(db: ReturnType<typeof setupTestDatabase>['db'], avatar: string) {
  db.insert(agentTable)
    .values({
      id: `ordinary-${avatar}`,
      type: 'claude-code',
      name: 'Ordinary Agent',
      description: '',
      instructions: '',
      configuration: {
        avatar,
        permission_mode: 'default'
      },
      orderKey: generateOrderKeyBetween(null, null)
    })
    .run()
}

describe('BuiltinAgentAvatarRefreshSeeder', () => {
  const dbh = setupTestDatabase()

  it('refreshes old builtin Magic Assistant avatars for existing users', () => {
    insertBuiltinAgent(dbh.db, '🍒')

    new BuiltinAgentAvatarRefreshSeeder().run(dbh.db)

    const [agent] = builtinAgents(dbh.db)
    expect(agent.configuration).toMatchObject({ avatar: '✨', builtin_role: 'assistant' })
  })

  it('does not overwrite a user-customized builtin agent avatar', () => {
    insertBuiltinAgent(dbh.db, '🚀')

    new BuiltinAgentAvatarRefreshSeeder().run(dbh.db)

    const [agent] = builtinAgents(dbh.db)
    expect(agent.configuration).toMatchObject({ avatar: '🚀', builtin_role: 'assistant' })
  })

  it('does not update ordinary agents that still use the legacy avatar', () => {
    insertOrdinaryAgent(dbh.db, '🍒')

    new BuiltinAgentAvatarRefreshSeeder().run(dbh.db)

    const [agent] = dbh.db.select().from(agentTable).where(eq(agentTable.id, 'ordinary-🍒')).all()
    expect(agent.configuration).toMatchObject({ avatar: '🍒' })
  })

  it('runs after the builtin Magic Assistant seeder in the production registry', () => {
    const assistantSeederIndex = seeders.findIndex((seeder) => seeder instanceof CherryAssistantSeeder)
    const avatarSeederIndex = seeders.findIndex((seeder) => seeder instanceof BuiltinAgentAvatarRefreshSeeder)

    expect(assistantSeederIndex).toBeGreaterThanOrEqual(0)
    expect(avatarSeederIndex).toBeGreaterThan(assistantSeederIndex)

    const runner = new SeedRunner(dbh.db)

    runner.runAll([new CherryAssistantSeeder(), new BuiltinAgentAvatarRefreshSeeder()])

    const [agent] = builtinAgents(dbh.db)
    expect(agent.configuration).toMatchObject({ avatar: '✨', builtin_role: 'assistant' })

    const [journal] = dbh.db
      .select()
      .from(appStateTable)
      .where(eq(appStateTable.key, 'seed:builtinAgentAvatarRefresh'))
      .all()
    expect(journal?.value).toMatchObject({ version: new BuiltinAgentAvatarRefreshSeeder().version })
  })
})
