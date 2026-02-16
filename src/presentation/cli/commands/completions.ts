import { Command } from "@cliffy/command";

const ZSHELL_SCRIPT = `#compdef mm
# mm shell completion for Zsh
#
# Installation:
#   Add the following to your ~/.zshrc:
#     source <(mm completions zsh)
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
    local filename="$1" # 'completion_aliases.txt'
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

_mm() {
    local -a commands
    commands=(
        'note:Create a new note'
        'task:Create a new task'
        'event:Create a new event'
        'list:List items'
        'edit:Edit an item'
        'show:Show item details'
        'move:Move items to a new directory'
        'close:Close items'
        'reopen:Reopen closed items'
        'remove:Remove items'
        'workspace:Workspace management'
        'cd:Navigate to location in knowledge graph'
        'pwd:Show current location in knowledge graph'
        'where:Print the physical file path for an item'
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

    local -a create_flags
    create_flags=(
        '--body[Body text]:body:'
        '--dir[Directory locator]:dir:'
        '--project[Project reference]:project:->project_aliases'
        '(-c --context)'{-c,--context}'[Context tag]:context:->context_aliases'
        '--alias[Alias for the item]:alias:'
        '--edit[Open editor after creation]'
    )

    local -a edit_flags
    edit_flags=(
        '--title[Update title]:title:'
        '--icon[Update icon]:icon:'
        '--body[Update body]:body:'
        '--start-at[Update start time]:start-at:'
        '--duration[Update duration]:duration:'
        '--due-at[Update due date]:due-at:'
        '--alias[Update alias]:alias:'
        '--project[Project reference]:project:->project_aliases'
        '(-c --context)'{-c,--context}'[Context tag]:context:->context_aliases'
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
                note|n|task|t|event|ev)
                    _arguments -C $create_flags $common_flags
                    case "$state" in
                        project_aliases|context_aliases)
                            local -a aliases
                            aliases=(\${(f)"\$(_mm_get_alias_candidates)"})
                            compadd -a aliases
                            ;;
                    esac
                    ;;
                edit|e)
                    _arguments -C \\
                        '1: :->item_id' \\
                        $edit_flags \\
                        $common_flags
                    case "$state" in
                        item_id|project_aliases|context_aliases)
                            local -a aliases
                            aliases=(\${(f)"\$(_mm_get_alias_candidates)"})
                            compadd -a aliases
                            ;;
                    esac
                    ;;
                show|s)
                    _arguments -C \\
                        '1: :->item_id' \\
                        '--print[Output directly without using pager]' \\
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
                    local -a date_keywords
                    date_keywords=(
                        'today:Today'
                        'td:Today (alias)'
                        'tomorrow:Tomorrow'
                        'tm:Tomorrow (alias)'
                        'yesterday:Yesterday'
                        'this-week:This week (Mon-Sun)'
                        'tw:This week (alias)'
                        'next-week:Next week (Mon-Sun)'
                        'nw:Next week (alias)'
                        'last-week:Last week (Mon-Sun)'
                        'lw:Last week (alias)'
                        'this-month:This month (1st-last)'
                        'next-month:Next month (1st-last)'
                        'last-month:Last month (1st-last)'
                    )
                    _arguments -C \\
                        '1: :->path' \\
                        '--all[Show all items including closed]' \\
                        $common_flags
                    case "$state" in
                        path)
                            _describe -t date_keywords 'date keyword' date_keywords
                            ;;
                    esac
                    ;;
                move|mv)
                    _arguments -C \\
                        '*: :->item_ids' \\
                        $common_flags
                    case "$state" in
                        item_ids)
                            # Check if current word has a positioning prefix
                            local prefix=""
                            local suffix="$words[$CURRENT]"

                            if [[ "$suffix" == before:* ]]; then
                                prefix="before:"
                                suffix="\${suffix#before:}"
                            elif [[ "$suffix" == after:* ]]; then
                                prefix="after:"
                                suffix="\${suffix#after:}"
                            elif [[ "$suffix" == head:* ]]; then
                                prefix="head:"
                                suffix="\${suffix#head:}"
                            elif [[ "$suffix" == tail:* ]]; then
                                prefix="tail:"
                                suffix="\${suffix#tail:}"
                            fi

                            local -a aliases
                            aliases=(\${(f)"\$(_mm_get_alias_candidates)"})

                            if [[ -n "$prefix" ]]; then
                                # Complete with prefix
                                compadd -P "$prefix" -a aliases
                            else
                                # Normal completion
                                compadd -a aliases
                            fi
                            ;;
                    esac
                    ;;
                close|cl|reopen|op|remove|rm|snooze|sn)
                    _arguments -C \\
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
                    _arguments -C \\
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

# Register the completion function
compdef _mm mm
`;

const BASH_SCRIPT = `# mm shell completion for Bash
#
# Installation:
#   Add the following to your ~/.bashrc or ~/.bash_profile:
#     source <(mm completions bash)
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
    local filename="$1" # 'completion_aliases.txt'
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

    local commands="note task event list edit show move close reopen remove workspace cd pwd where snooze doctor sync completions"
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
                local flags="--body --dir --project --context --alias --edit $common_flags"
                COMPREPLY=($(compgen -W "$flags" -- "$cur"))
                ;;
            edit|e)
                local flags="--title --icon --body --start-at --duration --due-at --alias --project --context $common_flags"
                COMPREPLY=($(compgen -W "$flags" -- "$cur"))
                ;;
            list|ls)
                local flags="--all $common_flags"
                COMPREPLY=($(compgen -W "$flags" -- "$cur"))
                ;;
            show|s)
                local flags="--print $common_flags"
                COMPREPLY=($(compgen -W "$flags" -- "$cur"))
                ;;
            *)
                COMPREPLY=($(compgen -W "$common_flags" -- "$cur"))
                ;;
        esac
        return 0
    fi

    # Complete flag values
    if [[ "$prev" == "--project" || "$prev" == "--context" || "$prev" == "-c" ]]; then
        local aliases="$(_mm_get_alias_candidates)"
        COMPREPLY=($(compgen -W "$aliases" -- "$cur"))
        return 0
    fi

    # Complete item IDs/aliases for commands that take them
    case "$cmd" in
        list|ls)
            # Complete date keywords for first argument
            if [[ $cword -eq 2 ]]; then
                local date_keywords="today td tomorrow tm yesterday this-week tw next-week nw last-week lw this-month next-month last-month"
                COMPREPLY=($(compgen -W "$date_keywords" -- "$cur"))
            fi
            return 0
            ;;
        edit|e|show|s|where)
            # Single item commands - only complete first argument
            if [[ $cword -eq 2 ]]; then
                local aliases="$(_mm_get_alias_candidates)"
                COMPREPLY=($(compgen -W "$aliases" -- "$cur"))
            fi
            return 0
            ;;
        move|mv|close|cl|reopen|op|remove|rm|snooze|sn)
            # Multiple item commands - complete all arguments
            local aliases="$(_mm_get_alias_candidates)"

            # For move command, check for positioning prefixes
            if [[ "$cmd" == "move" || "$cmd" == "mv" ]]; then
                local prefix=""
                local suffix="$cur"

                if [[ "$cur" == before:* ]]; then
                    prefix="before:"
                    suffix="\${cur#before:}"
                elif [[ "$cur" == after:* ]]; then
                    prefix="after:"
                    suffix="\${cur#after:}"
                elif [[ "$cur" == head:* ]]; then
                    prefix="head:"
                    suffix="\${cur#head:}"
                elif [[ "$cur" == tail:* ]]; then
                    prefix="tail:"
                    suffix="\${cur#tail:}"
                fi

                if [[ -n "$prefix" ]]; then
                    # Add prefix to each alias candidate
                    local -a prefixed_candidates
                    for alias in $aliases; do
                        prefixed_candidates+=("$prefix$alias")
                    done
                    COMPREPLY=($(compgen -W "\${prefixed_candidates[*]}" -- "$cur"))
                    return 0
                fi
            fi

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
