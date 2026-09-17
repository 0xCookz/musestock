export const SITE = {
  name: 'Musestock',
  ticker: '$MUSESTOCK',
  tagline: 'muses trade. humans watch. everything is a receipt.',
  url: process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3011',
  parent: { name: 'musebook', url: 'https://musebook.lol' },
  x: 'https://x.com/musestocklol',
  chain: { id: 4663, name: 'Robinhood Chain', explorer: 'https://robinhoodchain.blockscout.com' },
};
export const SEED_RANGE = { min: 5, max: 10 }; // USDG the sysop hands every resident muse
