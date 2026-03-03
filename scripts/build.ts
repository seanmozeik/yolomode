function getCompileTarget(): string {
  const arch = process.arch;
  switch (process.platform) {
    case 'darwin':
      return `bun-darwin-${arch}`;
    case 'linux':
      return `bun-linux-${arch}`;
    case 'win32':
      return `bun-windows-${arch}`;
    default:
      throw new Error(`Unsupported platform: ${process.platform}`);
  }
}

async function runBuild(mode: string): Promise<void> {
  if (mode === 'compile') {
    const result = await Bun.build({
      bytecode: true,
      compile: {
        outfile: 'yolomode',
        target: getCompileTarget() as
          | 'bun-darwin-arm64'
          | 'bun-darwin-x64'
          | 'bun-linux-arm64'
          | 'bun-linux-x64'
          | 'bun-windows-x64'
      },
      entrypoints: ['./src/cli.ts'],
      format: 'esm',
      minify: true,
      target: 'bun'
    });

    if (!result.success) {
      for (const log of result.logs) console.error(log);
      process.exit(1);
    }
    return;
  }

  console.error('Usage: bun run scripts/build.ts compile');
  process.exit(1);
}

await runBuild(process.argv[2] ?? '');
