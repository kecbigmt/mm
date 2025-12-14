import { Command } from "@cliffy/command";

const ZSHELL_SCRIPT = `#compdef mm
# mm shell completion for Zsh
#
# Installation:
#   Add the following to your ~/.zshrc:
#     eval "$(mm completions zsh)"
#   Then restart your shell or run: source ~/.zshrc

_mm_resolve_workspace_root() {
    # Resolve MM_HOME
    local mm_home="\${MM_HOME:-\${HOME}/.mm}"

    # Read current workspace from config
    local config_file="\${mm_home}/config.json"
    if [[ ! -f "$config_file" ]]; then
        return 1
    fi

    # Extract currentWorkspace from JSON (simple grep approach)
    local current_workspace
    current_workspace=\$(grep -o '"currentWorkspace"[[:space:]]*:[[:space:]]*"[^"]*"' "$config_file" 2>/dev/null | sed 's/.*"\\([^"]*\\)".*/\\1/')

    # Default to "home" if not found
    if [[ -z "$current_workspace" ]]; then
        current_workspace="home"
    fi

    echo "\${mm_home}/workspaces/\${current_workspace}"
}

_mm_find_cache_file() {
    local filename="$1" # 'completion_aliases.txt' or 'completion_context_tags.txt'
    local workspace_root=\$(_mm_resolve_workspace_root)

    if [[ -z "$workspace_root" ]]; then
        return 1
    fi

    local cache_file="\${workspace_root}/.index/\${filename}"
    if [[ -f "$cache_file" ]]; then
        echo "$cache_file"
        return 0
    fi

    return 1
}

_mm_get_alias_candidates() {
    local cache_file="$(_mm_find_cache_file completion_aliases.txt)"
    if [[ -n "$cache_file" ]]; then
        cat "$cache_file" 2>/dev/null
    fi
    # No fallback: if cache is missing/empty, no candidates are provided
}

_mm_get_tag_candidates() {
    local cache_file="$(_mm_find_cache_file completion_context_tags.txt)"
    if [[ -n "$cache_file" ]]; then
        cat "$cache_file" 2>/dev/null
    fi
    # No fallback: if cache is missing/empty, no candidates are provided
}

_mm() {
    local -a commands
    commands=(
        'note:Create a new note'
        'task:Create a new task'
        'event:Create a new event'
        'list:List items'
        'edit:Edit an item'
        'move:Move items to a new placement'
        'close:Close items'
        'reopen:Reopen closed items'
        'workspace:Workspace management'
        'cd:Navigate to location in knowledge graph'
        'pwd:Show current location in knowledge graph'
        'where:Show logical and physical paths for an item'
        'snooze:Snooze item until a future datetime'
        'doctor:Workspace validation and maintenance'
        'sync:Sync with remote repository'
        'completions:Generate shell completion script'
    )

    local -a common_flags
    common_flags=(
        '--workspace[Workspace to override]:workspace:_files -/'
        '--help[Show help information]'
        '--version[Show version information]'
    )

    local -a note_flags
    note_flags=(
        '--body[Body text]:body:'
        '--parent[Parent locator]:parent:'
        '--context[Context tag]:context:->context_tags'
        '--alias[Alias for the item]:alias:'
        '--edit[Open editor after creation]'
    )

    local -a task_flags
    task_flags=(
        '--body[Body text]:body:'
        '--parent[Parent locator]:parent:'
        '--context[Context tag]:context:->context_tags'
        '--alias[Alias for the item]:alias:'
        '--edit[Open editor after creation]'
    )

    local -a event_flags
    event_flags=(
        '--body[Body text]:body:'
        '--parent[Parent locator]:parent:'
        '--context[Context tag]:context:->context_tags'
        '--alias[Alias for the item]:alias:'
        '--edit[Open editor after creation]'
    )

    _arguments -C \\
        '1: :->command' \\
        '*::arg:->args' && return 0

    case "$state" in
        command)
            _describe -t commands 'mm command' commands
            ;;
        args)
            local cmd="$line[1]"
            case "$cmd" in
                note|n)
                    _arguments $note_flags $common_flags
                    case "$state" in
                        context_tags)
                            local -a tags
                            tags=(\${(f)"\$(_mm_get_tag_candidates)"})
                            compadd -a tags
                            ;;
                    esac
                    ;;
                task|t)
                    _arguments $task_flags $common_flags
                    case "$state" in
                        context_tags)
                            local -a tags
                            tags=(\${(f)"\$(_mm_get_tag_candidates)"})
                            compadd -a tags
                            ;;
                    esac
                    ;;
                event|ev)
                    _arguments $event_flags $common_flags
                    case "$state" in
                        context_tags)
                            local -a tags
                            tags=(\${(f)"\$(_mm_get_tag_candidates)"})
                            compadd -a tags
                            ;;
                    esac
                    ;;
                edit|e)
                    _arguments \\
                        '1: :->item_id' \\
                        $common_flags
                    case "$state" in
                        item_id)
                            local -a aliases
                            aliases=(\${(f)"\$(_mm_get_alias_candidates)"})
                            compadd -a aliases
                            ;;
                    esac
                    ;;
                list|ls)
                    _arguments \\
                        '1: :' \\
                        '--all[Show all items including closed]' \\
                        $common_flags
                    ;;
                move|mv)
                    _arguments \\
                        '*: :->item_ids' \\
                        $common_flags
                    case "$state" in
                        item_ids)
                            local -a aliases
                            aliases=(\${(f)"\$(_mm_get_alias_candidates)"})
                            compadd -a aliases
                            ;;
                    esac
                    ;;
                close|cl)
                    _arguments \\
                        '*: :->item_ids' \\
                        $common_flags
                    case "$state" in
                        item_ids)
                            local -a aliases
                            aliases=(\${(f)"\$(_mm_get_alias_candidates)"})
                            compadd -a aliases
                            ;;
                    esac
                    ;;
                reopen|op)
                    _arguments \\
                        '*: :->item_ids' \\
                        $common_flags
                    case "$state" in
                        item_ids)
                            local -a aliases
                            aliases=(\${(f)"\$(_mm_get_alias_candidates)"})
                            compadd -a aliases
                            ;;
                    esac
                    ;;
                snooze|sn)
                    _arguments \\
                        '*: :->item_ids' \\
                        $common_flags
                    case "$state" in
                        item_ids)
                            local -a aliases
                            aliases=(\${(f)"\$(_mm_get_alias_candidates)"})
                            compadd -a aliases
                            ;;
                    esac
                    ;;
                where)
                    _arguments \\
                        '1: :->item_id' \\
                        $common_flags
                    case "$state" in
                        item_id)
                            local -a aliases
                            aliases=(\${(f)"\$(_mm_get_alias_candidates)"})
                            compadd -a aliases
                            ;;
                    esac
                    ;;
                completions)
                    _arguments \\
                        '1: :(bash zsh)' \\
                        $common_flags
                    ;;
                *)
                    _arguments $common_flags
                    ;;
            esac
            ;;
    esac
}
`;

const BASH_SCRIPT = `# mm shell completion for Bash
#
# Installation:
#   Add the following to your ~/.bashrc or ~/.bash_profile:
#     eval "$(mm completions bash)"
#   Then restart your shell or run: source ~/.bashrc

_mm_resolve_workspace_root() {
    # Resolve MM_HOME
    local mm_home="\${MM_HOME:-\${HOME}/.mm}"

    # Read current workspace from config
    local config_file="\${mm_home}/config.json"
    if [[ ! -f "$config_file" ]]; then
        return 1
    fi

    # Extract currentWorkspace from JSON (simple grep approach)
    local current_workspace
    current_workspace=\$(grep -o '"currentWorkspace"[[:space:]]*:[[:space:]]*"[^"]*"' "$config_file" 2>/dev/null | sed 's/.*"\\([^"]*\\)".*/\\1/')

    # Default to "home" if not found
    if [[ -z "$current_workspace" ]]; then
        current_workspace="home"
    fi

    echo "\${mm_home}/workspaces/\${current_workspace}"
}

_mm_find_cache_file() {
    local filename="$1" # 'completion_aliases.txt' or 'completion_context_tags.txt'
    local workspace_root=\$(_mm_resolve_workspace_root)

    if [[ -z "$workspace_root" ]]; then
        return 1
    fi

    local cache_file="\${workspace_root}/.index/\${filename}"
    if [[ -f "$cache_file" ]]; then
        echo "$cache_file"
        return 0
    fi

    return 1
}

_mm_get_alias_candidates() {
    local cache_file="$(_mm_find_cache_file completion_aliases.txt)"
    if [[ -n "$cache_file" ]]; then
        cat "$cache_file" 2>/dev/null
    fi
    # No fallback: if cache is missing/empty, no candidates are provided
}

_mm_get_tag_candidates() {
    local cache_file="$(_mm_find_cache_file completion_context_tags.txt)"
    if [[ -n "$cache_file" ]]; then
        cat "$cache_file" 2>/dev/null
    fi
    # No fallback: if cache is missing/empty, no candidates are provided
}

_mm() {
    local cur prev words cword

    # Fallback if _init_completion is not available
    if declare -F _init_completion >/dev/null 2>&1; then
        _init_completion || return
    else
        # Basic fallback implementation
        COMPREPLY=()
        cur="\${COMP_WORDS[COMP_CWORD]}"
        prev="\${COMP_WORDS[COMP_CWORD-1]}"
        words=("\${COMP_WORDS[@]}")
        cword=$COMP_CWORD
    fi

    local commands="note task event list edit move close reopen workspace cd pwd where snooze doctor sync completions"
    local common_flags="--workspace --help --version"

    # First word: complete command
    if [[ $cword -eq 1 ]]; then
        COMPREPLY=($(compgen -W "$commands" -- "$cur"))
        return 0
    fi

    local cmd="\${words[1]}"

    # Complete flags for all commands
    if [[ "$cur" == -* ]]; then
        case "$cmd" in
            note|task|event|n|t|ev)
                local flags="--body --parent --context --alias --edit $common_flags"
                COMPREPLY=($(compgen -W "$flags" -- "$cur"))
                ;;
            list|ls)
                local flags="--all $common_flags"
                COMPREPLY=($(compgen -W "$flags" -- "$cur"))
                ;;
            *)
                COMPREPLY=($(compgen -W "$common_flags" -- "$cur"))
                ;;
        esac
        return 0
    fi

    # Complete flag values
    if [[ "$prev" == "--context" || "$prev" == "-c" ]]; then
        local tags="$(_mm_get_tag_candidates)"
        COMPREPLY=($(compgen -W "$tags" -- "$cur"))
        return 0
    fi

    # Complete item IDs/aliases for commands that take them
    case "$cmd" in
        edit|e|where)
            # Single item commands - only complete first argument
            if [[ $cword -eq 2 ]]; then
                local aliases="$(_mm_get_alias_candidates)"
                COMPREPLY=($(compgen -W "$aliases" -- "$cur"))
            fi
            return 0
            ;;
        move|mv|close|cl|reopen|op|snooze|sn)
            # Multiple item commands - complete all arguments
            local aliases="$(_mm_get_alias_candidates)"
            COMPREPLY=($(compgen -W "$aliases" -- "$cur"))
            return 0
            ;;
        completions)
            if [[ $cword -eq 2 ]]; then
                COMPREPLY=($(compgen -W "bash zsh" -- "$cur"))
            fi
            return 0
            ;;
    esac

    return 0
}

complete -F _mm mm
`;

export function createCompletionsCommand() {
  return new Command()
    .description("Generate shell completion script")
    .arguments("<shell:string>")
    .action((_options, shell: string) => {
      const normalizedShell = shell.toLowerCase();

      if (normalizedShell === "zsh") {
        console.log(ZSHELL_SCRIPT);
      } else if (normalizedShell === "bash") {
        console.log(BASH_SCRIPT);
      } else {
        console.error(`Error: unsupported shell "${shell}". Supported shells: bash, zsh`);
        Deno.exit(1);
      }
    });
}
