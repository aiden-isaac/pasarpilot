export const tradingCommands = ['setup', 'serve', 'generate'] as const;
if (process.argv[1]?.endsWith('/trading/cli.js')) {
  console.log('Synthetic WTS workspace: setup | serve | generate');
}
