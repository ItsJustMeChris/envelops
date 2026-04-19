export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  if (process.env.NODE_ENV === 'test') return

  console.log(
    [
      '',
      ' _________________________________',
      '|\\                               /|',
      '| \\                             / |',
      '|  \\___________________________/  |',
      '|                                 |',
      '|            envelops             |',
      '|_________________________________|',
      '    self-hosted dotenvx keystore',
      ''
    ].join('\n')
  )
}
