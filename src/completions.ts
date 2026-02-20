import { die } from "./utils";

const COMMANDS = "build run attach ls diff apply sync rm completions ralph";
const SESSION_COMMANDS = "attach a diff apply sync rm ralph";

const COMPLETION_BASH = `\
_yolomode() {
    local cur prev
    COMPREPLY=()
    cur="\${COMP_WORDS[COMP_CWORD]}"
    prev="\${COMP_WORDS[COMP_CWORD-1]}"

    if [[ \$COMP_CWORD -eq 1 ]]; then
        COMPREPLY=( $(compgen -W "${COMMANDS}" -- "\$cur") )
        return
    fi

    case "\$prev" in
        ${SESSION_COMMANDS.split(" ").join("|")})
            local sessions
            sessions=$(yolomode --complete sessions 2>/dev/null)
            COMPREPLY=( $(compgen -W "\$sessions" -- "\$cur") )
            ;;
        completions)
            COMPREPLY=( $(compgen -W "bash zsh fish nu" -- "\$cur") )
            ;;
        run)
            COMPREPLY=( $(compgen -W "--import --memory --no-cache" -- "\$cur") )
            ;;
        ralph)
            local sessions
            sessions=$(yolomode --complete sessions 2>/dev/null)
            COMPREPLY=( $(compgen -W "\$sessions --max-iterations" -- "\$cur") )
            ;;
    esac
}
complete -F _yolomode yolomode
`;

function bashWithAliases(aliases: string[]): string {
	if (aliases.length === 0) return COMPLETION_BASH;
	return (
		COMPLETION_BASH +
		aliases.map((a) => `complete -F _yolomode ${a}\n`).join("")
	);
}

const COMPLETION_ZSH = `\
_yolomode() {
    local -a commands
    commands=(
        'build:Build the Docker image'
        'run:Start a new isolated session'
        'attach:Open a shell in a session'
        'ls:List all sessions'
        'diff:Show changes from a session'
        'apply:Apply session changes to a new branch'
        'sync:Extract full work dir from a session'
        'rm:Remove a session'
        'completions:Print shell completion script'
        'ralph:Run the ralph autonomous loop'
    )

    _arguments -C \\
        '1:command:->command' \\
        '*::arg:->args'

    case \$state in
        command)
            _describe 'command' commands
            ;;
        args)
            case \${words[1]} in
                attach|a|diff|apply|sync|rm)
                    local -a sessions
                    sessions=(\${(f)"\$(yolomode --complete sessions 2>/dev/null)"})
                    compadd -a sessions
                    ;;
                completions)
                    compadd bash zsh fish nu
                    ;;
                run)
                    _arguments \\
                        '--import[Copy file/dir into session]:path:_files' \\
                        '--memory[Memory limit]:limit:' \\
                        '--no-cache[Force rebuild without cache]'
                    ;;
                ralph)
                    local -a sessions
                    sessions=(\${(f)"\$(yolomode --complete sessions 2>/dev/null)"})
                    _arguments \\
                        '1:session:compadd -a sessions' \\
                        '--max-iterations[Max loop iterations]:count:'
                    ;;
            esac
            ;;
    esac
}
compdef _yolomode yolomode
`;

function zshWithAliases(aliases: string[]): string {
	if (aliases.length === 0) return COMPLETION_ZSH;
	return (
		COMPLETION_ZSH + aliases.map((a) => `compdef _yolomode ${a}\n`).join("")
	);
}

const COMPLETION_FISH = `\
# Disable file completions for yolomode
complete -c yolomode -f

# Subcommands (only when no subcommand given yet)
complete -c yolomode -n '__fish_use_subcommand' -a build -d 'Build the Docker image'
complete -c yolomode -n '__fish_use_subcommand' -a run -d 'Start a new isolated session'
complete -c yolomode -n '__fish_use_subcommand' -a attach -d 'Open a shell in a session'
complete -c yolomode -n '__fish_use_subcommand' -a ls -d 'List all sessions'
complete -c yolomode -n '__fish_use_subcommand' -a diff -d 'Show changes from a session'
complete -c yolomode -n '__fish_use_subcommand' -a apply -d 'Apply session changes to a new branch'
complete -c yolomode -n '__fish_use_subcommand' -a sync -d 'Extract full work dir from a session'
complete -c yolomode -n '__fish_use_subcommand' -a rm -d 'Remove a session'
complete -c yolomode -n '__fish_use_subcommand' -a completions -d 'Print shell completion script'
complete -c yolomode -n '__fish_use_subcommand' -a ralph -d 'Run the ralph autonomous loop'

# Session name completions
complete -c yolomode -n '__fish_seen_subcommand_from attach diff apply sync rm' -a '(yolomode --complete sessions 2>/dev/null)' -f

# ralph: session names + flags
complete -c yolomode -n '__fish_seen_subcommand_from ralph' -a '(yolomode --complete sessions 2>/dev/null)' -f
complete -c yolomode -n '__fish_seen_subcommand_from ralph' -l max-iterations -d 'Max loop iterations'

# run flags
complete -c yolomode -n '__fish_seen_subcommand_from run' -l import -d 'Copy file/dir into session' -r
complete -c yolomode -n '__fish_seen_subcommand_from run' -l memory -d 'Memory limit' -r
complete -c yolomode -n '__fish_seen_subcommand_from run' -l no-cache -d 'Force rebuild without cache'

# completions: shell names
complete -c yolomode -n '__fish_seen_subcommand_from completions' -a 'bash zsh fish nu' -f
`;

function fishWithAliases(aliases: string[]): string {
	if (aliases.length === 0) return COMPLETION_FISH;
	// fish `--wraps` tells it to reuse all completions from the wrapped command
	const wraps = aliases
		.map((a) => `complete -c ${a} --wraps yolomode -d 'yolomode alias'\n`)
		.join("");
	return COMPLETION_FISH + wraps;
}

const COMPLETION_NU_HELPERS = `\
def "nu complete yolomode commands" [] {
    [
        { value: "build", description: "Build the Docker image" }
        { value: "run", description: "Start a new isolated session" }
        { value: "attach", description: "Open a shell in a session" }
        { value: "ls", description: "List all sessions" }
        { value: "diff", description: "Show changes from a session" }
        { value: "apply", description: "Apply session changes to a new branch" }
        { value: "sync", description: "Extract full work dir from a session" }
        { value: "rm", description: "Remove a session" }
        { value: "completions", description: "Print shell completion script" }
        { value: "ralph", description: "Run the ralph autonomous loop" }
    ]
}

def "nu complete yolomode sessions" [] {
    ^yolomode --complete sessions | lines | where { |it| ($it | str length) > 0 }
}

def "nu complete yolomode shells" [] {
    ["bash" "zsh" "fish" "nu"]
}
`;

function nuExterns(cmd: string): string {
	return `
export extern "${cmd}" [
    command?: string@"nu complete yolomode commands"
]

export extern "${cmd} build" [
    --no-cache    # Force rebuild without cache
]

export extern "${cmd} run" [
    --import: string    # Copy file/dir into session
    --memory: string    # Memory limit (default: 16g)
    --no-cache          # Force rebuild without cache
]

export extern "${cmd} attach" [
    name?: string@"nu complete yolomode sessions"
    --import: string    # Copy file/dir into session
]

export extern "${cmd} diff" [
    name: string@"nu complete yolomode sessions"
]

export extern "${cmd} apply" [
    name: string@"nu complete yolomode sessions"
]

export extern "${cmd} sync" [
    name: string@"nu complete yolomode sessions"
]

export extern "${cmd} rm" [
    name?: string@"nu complete yolomode sessions"
    --all(-a)    # Remove all sessions
]

export extern "${cmd} ralph" [
    name: string@"nu complete yolomode sessions"
    --max-iterations: int    # Max loop iterations (default: 10)
]

export extern "${cmd} completions" [
    shell: string@"nu complete yolomode shells"
]

export extern "${cmd} ls" []
`;
}

function nushellWithAliases(aliases: string[]): string {
	const aliasDefs = aliases
		.map((a) => `export alias ${a} = yolomode\n`)
		.join("");
	const aliasExterns = aliases.map((a) => nuExterns(a)).join("");
	return (
		COMPLETION_NU_HELPERS + nuExterns("yolomode") + aliasDefs + aliasExterns
	);
}

export async function cmdCompletions(args: string[]) {
	const shell = args[1];
	if (!shell) die("usage: yolomode completions <bash|zsh|fish|nu> [alias...]");

	const aliases = args.slice(2).filter((a) => !a.startsWith("-"));

	switch (shell) {
		case "bash":
			process.stdout.write(bashWithAliases(aliases));
			break;
		case "zsh":
			process.stdout.write(zshWithAliases(aliases));
			break;
		case "fish":
			process.stdout.write(fishWithAliases(aliases));
			break;
		case "nu":
		case "nushell":
			process.stdout.write(nushellWithAliases(aliases));
			break;
		default:
			die(`unsupported shell: ${shell} (supported: bash, zsh, fish, nu)`);
	}
}
