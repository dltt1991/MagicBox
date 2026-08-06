import { agentTable } from '@data/db/schemas/agent'
import { and, eq, inArray, sql } from 'drizzle-orm'

import type { DbType, ISeeder } from '../../types'
import { hashObject } from '../hashObject'
import { MAGIC_ASSISTANT_AVATAR } from './cherryAssistantSeeder'

const LEGACY_MAGIC_ASSISTANT_AVATARS = ['🍒'] as const

export class BuiltinAgentAvatarRefreshSeeder implements ISeeder {
  readonly name = 'builtinAgentAvatarRefresh'
  readonly description = 'Refresh legacy builtin Magic Assistant avatars without overwriting user customizations'
  readonly version: string

  constructor() {
    this.version = hashObject({
      builtinRole: 'assistant',
      legacyAvatars: LEGACY_MAGIC_ASSISTANT_AVATARS,
      targetAvatar: MAGIC_ASSISTANT_AVATAR
    })
  }

  run(db: DbType): void {
    db.transaction((tx) => {
      const rows = tx
        .select({ id: agentTable.id, configuration: agentTable.configuration })
        .from(agentTable)
        .where(
          and(
            sql`json_extract(${agentTable.configuration}, '$.builtin_role') = 'assistant'`,
            inArray(sql`json_extract(${agentTable.configuration}, '$.avatar')`, [...LEGACY_MAGIC_ASSISTANT_AVATARS])
          )
        )
        .all()

      for (const row of rows) {
        tx.update(agentTable)
          .set({ configuration: { ...row.configuration, avatar: MAGIC_ASSISTANT_AVATAR } })
          .where(eq(agentTable.id, row.id))
          .run()
      }
    })
  }
}
