import type {
  CommandDefinition,
  CommandShortcutPreferenceKey,
  KeybindingRule,
  RegisteredCommandDefinition,
  RegisteredKeybindingRule
} from '@shared/types/command'

import { parseContextExpr } from './contextExpr'

const defineCommand = <const T extends CommandDefinition>(definition: T): T => definition

export const COMMAND_DEFINITIONS = [
  defineCommand({
    id: 'app.fullscreen.exit',
    titleKey: 'settings.shortcuts.exit_fullscreen',
    categoryKey: 'settings.shortcuts.general',
    scope: 'renderer',
    keybinding: {
      defaultBinding: ['Escape'],
      editable: false
    }
  }),
  defineCommand({
    id: 'app.search',
    titleKey: 'settings.shortcuts.search_message',
    categoryKey: 'settings.shortcuts.general',
    scope: 'renderer',
    keybinding: {
      defaultBinding: ['CommandOrControl', 'Shift', 'F']
    }
  }),
  defineCommand({
    id: 'app.print',
    titleKey: 'settings.shortcuts.print',
    categoryKey: 'settings.shortcuts.general',
    scope: 'renderer',
    keybinding: {
      defaultBinding: ['CommandOrControl', 'P']
    }
  }),
  defineCommand({
    id: 'app.sidebar.toggle',
    titleKey: 'settings.shortcuts.toggle_left_sidebar',
    categoryKey: 'settings.shortcuts.topic',
    scope: 'renderer',
    keybinding: {
      defaultBinding: ['CommandOrControl', '[']
    }
  }),
  defineCommand({
    id: 'app.settings.open',
    titleKey: 'settings.shortcuts.show_settings',
    categoryKey: 'settings.shortcuts.general',
    scope: 'main',
    keybinding: {
      defaultBinding: ['CommandOrControl', ','],
      editable: false
    }
  }),
  defineCommand({
    id: 'app.window.show',
    titleKey: 'settings.shortcuts.show_app',
    categoryKey: 'settings.shortcuts.general',
    scope: 'main',
    keybinding: {
      defaultBinding: [],
      global: true
    }
  }),
  defineCommand({
    id: 'app.zoom.in',
    titleKey: 'settings.shortcuts.zoom_in',
    categoryKey: 'settings.shortcuts.general',
    scope: 'main',
    keybinding: {
      defaultBinding: ['CommandOrControl', '='],
      additionalBindings: [
        ['CommandOrControl', 'Shift', '='],
        ['CommandOrControl', 'numadd']
      ],
      editable: false
    }
  }),
  defineCommand({
    id: 'app.zoom.out',
    titleKey: 'settings.shortcuts.zoom_out',
    categoryKey: 'settings.shortcuts.general',
    scope: 'main',
    keybinding: {
      defaultBinding: ['CommandOrControl', '-'],
      additionalBindings: [['CommandOrControl', 'numsub']],
      editable: false
    }
  }),
  defineCommand({
    id: 'app.zoom.reset',
    titleKey: 'settings.shortcuts.zoom_reset',
    categoryKey: 'settings.shortcuts.general',
    scope: 'main',
    keybinding: {
      defaultBinding: ['CommandOrControl', '0'],
      editable: false
    }
  }),
  defineCommand({
    id: 'chat.context.toggle_new',
    titleKey: 'settings.shortcuts.toggle_new_context',
    categoryKey: 'settings.shortcuts.chat',
    scope: 'renderer',
    keybinding: {
      defaultBinding: ['CommandOrControl', 'K']
    }
  }),
  defineCommand({
    id: 'chat.message.copy_last',
    titleKey: 'settings.shortcuts.copy_last_message',
    categoryKey: 'settings.shortcuts.chat',
    scope: 'renderer',
    keybinding: {
      defaultBinding: ['CommandOrControl', 'Shift', 'C']
    }
  }),
  defineCommand({
    id: 'chat.message.edit_last_user',
    titleKey: 'settings.shortcuts.edit_last_user_message',
    categoryKey: 'settings.shortcuts.chat',
    scope: 'renderer',
    keybinding: {
      defaultBinding: ['CommandOrControl', 'Shift', 'E']
    }
  }),
  defineCommand({
    id: 'chat.message.search',
    titleKey: 'settings.shortcuts.search_message_in_chat',
    categoryKey: 'settings.shortcuts.chat',
    scope: 'renderer',
    keybinding: {
      defaultBinding: ['CommandOrControl', 'F']
    }
  }),
  defineCommand({
    id: 'chat.model.select',
    titleKey: 'settings.shortcuts.select_model',
    categoryKey: 'settings.shortcuts.chat',
    scope: 'renderer',
    keybinding: {
      defaultBinding: ['CommandOrControl', 'Shift', 'M']
    }
  }),
  defineCommand({
    id: 'quick_assistant.toggle',
    titleKey: 'settings.shortcuts.quick_assistant',
    categoryKey: 'settings.shortcuts.feature.quick_assistant',
    scope: 'main',
    enablement: 'feature.quick_assistant.enabled',
    keybinding: {
      defaultBinding: ['CommandOrControl', 'E'],
      global: true,
      when: 'feature.quick_assistant.enabled'
    }
  }),
  defineCommand({
    id: 'selection.capture_text',
    titleKey: 'settings.shortcuts.selection_assistant_select_text',
    categoryKey: 'settings.shortcuts.feature.selection',
    scope: 'main',
    enablement: 'feature.selection.enabled',
    keybinding: {
      defaultBinding: [],
      global: true,
      when: 'feature.selection.enabled',
      supportedPlatforms: ['darwin', 'win32', 'linux']
    }
  }),
  defineCommand({
    id: 'selection.toggle',
    titleKey: 'settings.shortcuts.selection_assistant_toggle',
    categoryKey: 'settings.shortcuts.feature.selection',
    scope: 'main',
    enablement: 'feature.selection.enabled',
    keybinding: {
      defaultBinding: [],
      global: true,
      when: 'feature.selection.enabled',
      supportedPlatforms: ['darwin', 'win32', 'linux']
    }
  }),
  defineCommand({
    id: 'topic.create',
    titleKey: 'settings.shortcuts.new_topic',
    categoryKey: 'settings.shortcuts.topic',
    scope: 'renderer',
    keybinding: {
      defaultBinding: ['CommandOrControl', 'N'],
      when: '!file_manager.focused'
    }
  }),
  defineCommand({
    id: 'topic.rename',
    titleKey: 'settings.shortcuts.rename_topic',
    categoryKey: 'settings.shortcuts.topic',
    scope: 'renderer',
    keybinding: {
      defaultBinding: ['CommandOrControl', 'T']
    }
  }),
  defineCommand({
    id: 'topic.sidebar.toggle',
    titleKey: 'settings.shortcuts.toggle_right_sidebar',
    categoryKey: 'settings.shortcuts.topic',
    scope: 'renderer',
    keybinding: {
      defaultBinding: ['CommandOrControl', ']']
    }
  }),
  defineCommand({
    id: 'tab.next',
    titleKey: 'settings.shortcuts.next_tab',
    categoryKey: 'settings.shortcuts.general',
    scope: 'renderer',
    keybinding: {
      // macOS reserves Cmd+Tab for the system app switcher.
      defaultBinding: { default: ['CommandOrControl', 'Tab'], darwin: ['Ctrl', 'Tab'] }
    }
  }),
  defineCommand({
    id: 'tab.prev',
    titleKey: 'settings.shortcuts.prev_tab',
    categoryKey: 'settings.shortcuts.general',
    scope: 'renderer',
    keybinding: {
      defaultBinding: { default: ['CommandOrControl', 'Shift', 'Tab'], darwin: ['Ctrl', 'Shift', 'Tab'] }
    }
  }),
  defineCommand({
    id: 'terminal.close_all',
    titleKey: 'settings.shortcuts.terminal_close_all',
    categoryKey: 'settings.shortcuts.terminal',
    scope: 'renderer',
    keybinding: {
      defaultBinding: []
    }
  }),
  defineCommand({
    id: 'terminal.close_current',
    titleKey: 'settings.shortcuts.terminal_close_current',
    categoryKey: 'settings.shortcuts.terminal',
    scope: 'renderer',
    keybinding: {
      defaultBinding: ['CommandOrControl', 'W']
    }
  }),
  defineCommand({
    id: 'terminal.close_others',
    titleKey: 'settings.shortcuts.terminal_close_others',
    categoryKey: 'settings.shortcuts.terminal',
    scope: 'renderer',
    keybinding: {
      defaultBinding: ['CommandOrControl', 'Alt', 'W']
    }
  }),
  defineCommand({
    id: 'terminal.new',
    titleKey: 'settings.shortcuts.terminal_new',
    categoryKey: 'settings.shortcuts.terminal',
    scope: 'renderer',
    keybinding: {
      defaultBinding: ['CommandOrControl', 'T']
    }
  }),
  defineCommand({
    id: 'terminal.switch_previous',
    titleKey: 'settings.shortcuts.terminal_switch_previous',
    categoryKey: 'settings.shortcuts.terminal',
    scope: 'renderer',
    keybinding: {
      defaultBinding: ['CommandOrControl', 'Left']
    }
  }),
  defineCommand({
    id: 'terminal.switch_next',
    titleKey: 'settings.shortcuts.terminal_switch_next',
    categoryKey: 'settings.shortcuts.terminal',
    scope: 'renderer',
    keybinding: {
      defaultBinding: ['CommandOrControl', 'Right']
    }
  }),
  defineCommand({
    id: 'file_manager.open',
    titleKey: 'settings.shortcuts.file_manager_open',
    categoryKey: 'settings.shortcuts.file_manager',
    scope: 'renderer',
    keybinding: {
      defaultBinding: ['Enter'],
      additionalBindings: [['CommandOrControl', 'O']],
      when: 'file_manager.focused'
    }
  }),
  defineCommand({
    id: 'file_manager.copy',
    titleKey: 'settings.shortcuts.file_manager_copy',
    categoryKey: 'settings.shortcuts.file_manager',
    scope: 'renderer',
    keybinding: {
      defaultBinding: ['CommandOrControl', 'C'],
      when: 'file_manager.focused'
    }
  }),
  defineCommand({
    id: 'file_manager.copy_path',
    titleKey: 'settings.shortcuts.file_manager_copy_path',
    categoryKey: 'settings.shortcuts.file_manager',
    scope: 'renderer',
    keybinding: {
      defaultBinding: ['CommandOrControl', 'Shift', 'C'],
      additionalBindings: [['CommandOrControl', 'Alt', 'C']],
      when: 'file_manager.focused'
    }
  }),
  defineCommand({
    id: 'file_manager.cut',
    titleKey: 'settings.shortcuts.file_manager_cut',
    categoryKey: 'settings.shortcuts.file_manager',
    scope: 'renderer',
    keybinding: {
      defaultBinding: ['CommandOrControl', 'X'],
      when: 'file_manager.focused'
    }
  }),
  defineCommand({
    id: 'file_manager.paste',
    titleKey: 'settings.shortcuts.file_manager_paste',
    categoryKey: 'settings.shortcuts.file_manager',
    scope: 'renderer',
    keybinding: {
      defaultBinding: ['CommandOrControl', 'V'],
      when: 'file_manager.focused'
    }
  }),
  defineCommand({
    id: 'file_manager.delete',
    titleKey: 'settings.shortcuts.file_manager_delete',
    categoryKey: 'settings.shortcuts.file_manager',
    scope: 'renderer',
    keybinding: {
      defaultBinding: ['Delete'],
      additionalBindings: [['CommandOrControl', 'Backspace']],
      when: 'file_manager.focused'
    }
  }),
  defineCommand({
    id: 'file_manager.rename',
    titleKey: 'settings.shortcuts.file_manager_rename',
    categoryKey: 'settings.shortcuts.file_manager',
    scope: 'renderer',
    keybinding: {
      defaultBinding: ['F2'],
      when: 'file_manager.focused'
    }
  }),
  defineCommand({
    id: 'file_manager.properties',
    titleKey: 'settings.shortcuts.file_manager_properties',
    categoryKey: 'settings.shortcuts.file_manager',
    scope: 'renderer',
    keybinding: {
      defaultBinding: ['CommandOrControl', 'I'],
      additionalBindings: [['Alt', 'Enter']],
      when: 'file_manager.focused'
    }
  }),
  defineCommand({
    id: 'file_manager.new_file',
    titleKey: 'settings.shortcuts.file_manager_new_file',
    categoryKey: 'settings.shortcuts.file_manager',
    scope: 'renderer',
    keybinding: {
      defaultBinding: ['CommandOrControl', 'N'],
      when: 'file_manager.focused'
    }
  }),
  defineCommand({
    id: 'file_manager.new_folder',
    titleKey: 'settings.shortcuts.file_manager_new_folder',
    categoryKey: 'settings.shortcuts.file_manager',
    scope: 'renderer',
    keybinding: {
      defaultBinding: ['CommandOrControl', 'Shift', 'N'],
      when: 'file_manager.focused'
    }
  }),
  defineCommand({
    id: 'file_manager.open_terminal_here',
    titleKey: 'settings.shortcuts.file_manager_open_terminal_here',
    categoryKey: 'settings.shortcuts.file_manager',
    scope: 'renderer',
    keybinding: {
      defaultBinding: ['CommandOrControl', 'Shift', 'T'],
      when: 'file_manager.focused'
    }
  }),
  defineCommand({
    id: 'file_manager.select_all',
    titleKey: 'settings.shortcuts.file_manager_select_all',
    categoryKey: 'settings.shortcuts.file_manager',
    scope: 'renderer',
    keybinding: {
      defaultBinding: ['CommandOrControl', 'A'],
      when: 'file_manager.focused'
    }
  }),
  defineCommand({
    id: 'file_manager.open_parent',
    titleKey: 'settings.shortcuts.file_manager_open_parent',
    categoryKey: 'settings.shortcuts.file_manager',
    scope: 'renderer',
    keybinding: {
      defaultBinding: ['CommandOrControl', 'Up'],
      additionalBindings: [['Alt', 'Up']],
      when: 'file_manager.focused'
    }
  }),
  defineCommand({
    id: 'file_manager.open_child_history',
    titleKey: 'settings.shortcuts.file_manager_open_child_history',
    categoryKey: 'settings.shortcuts.file_manager',
    scope: 'renderer',
    keybinding: {
      defaultBinding: ['CommandOrControl', 'Down'],
      additionalBindings: [['Alt', 'Down']],
      when: 'file_manager.focused'
    }
  })
] as const satisfies readonly CommandDefinition[]

export type CommandId = (typeof COMMAND_DEFINITIONS)[number]['id']

export const commandShortcutPreferenceKey = (command: CommandId): CommandShortcutPreferenceKey<CommandId> =>
  `shortcut.${command}` as CommandShortcutPreferenceKey<CommandId>

export const KEYBINDING_RULES = COMMAND_DEFINITIONS.flatMap((definition) =>
  definition.keybinding
    ? [
        {
          command: definition.id,
          scope: definition.scope,
          ...definition.keybinding
        }
      ]
    : []
) satisfies readonly KeybindingRule<CommandId>[]

const registerCommand = (definition: CommandDefinition<CommandId>): RegisteredCommandDefinition<CommandId> => ({
  id: definition.id,
  titleKey: definition.titleKey,
  categoryKey: definition.categoryKey,
  scope: definition.scope,
  iconKey: definition.iconKey,
  enablement: definition.enablement ? parseContextExpr(definition.enablement) : undefined,
  enablementSource: definition.enablement
})

const registerKeybinding = (rule: KeybindingRule<CommandId>): RegisteredKeybindingRule<CommandId> => ({
  ...rule,
  preferenceKey: commandShortcutPreferenceKey(rule.command),
  when: rule.when ? parseContextExpr(rule.when) : undefined,
  whenSource: rule.when
})

export const REGISTERED_COMMANDS = COMMAND_DEFINITIONS.map(registerCommand)
export const REGISTERED_KEYBINDINGS = KEYBINDING_RULES.map(registerKeybinding)

const commandMap = new Map<CommandId, RegisteredCommandDefinition<CommandId>>(
  REGISTERED_COMMANDS.map((definition) => [definition.id, definition])
)
const keybindingMap = new Map<CommandId, RegisteredKeybindingRule<CommandId>>(
  REGISTERED_KEYBINDINGS.map((rule) => [rule.command, rule])
)

export const findCommandDefinition = (id: CommandId): RegisteredCommandDefinition<CommandId> | undefined =>
  commandMap.get(id)

export const findKeybindingRule = (id: CommandId): RegisteredKeybindingRule<CommandId> | undefined =>
  keybindingMap.get(id)
