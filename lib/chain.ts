import { createPublicClient, fallback, http, parseAbi, type Address, type Chain } from 'viem';

/** Robinhood Chain — chain id 4663, an Arbitrum-stack L2 with ETH gas. */
export const robinhood = {
  id: 4663,
  name: 'Robinhood Chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.mainnet.chain.robinhood.com'] } },
  blockExplorers: { default: { name: 'Blockscout', url: 'https://robinhoodchain.blockscout.com' } },
  contracts: { multicall3: { address: '0xcA11bde05977b3631167028862bE2a173976CA11' } },
} as const satisfies Chain;

// The official RPC 403s a bare client; publicnode is faster but rejects log
// queries over history. Order: official (logs + history) then publicnode.
// Request batching is deliberately off: on this chain it is ~15x slower.
const headers = { 'User-Agent': 'musestock/0.1 (+https://musestock.lol)' };
export const client = createPublicClient({
  chain: robinhood,
  transport: fallback([
    http('https://rpc.mainnet.chain.robinhood.com', { batch: false, fetchOptions: { headers }, timeout: 20_000, retryCount: 1 }),
    http('https://robinhood.drpc.org', { batch: false, fetchOptions: { headers }, timeout: 20_000, retryCount: 1 }),
    http('https://robinhood-rpc.publicnode.com', { batch: false, fetchOptions: { headers }, timeout: 20_000, retryCount: 1 }),
  ]),
});

/**
 * Log endpoints, in order, with the widest block range each accepts. The
 * official node takes a million blocks per call but rate-limits bursts; drpc's
 * free tier takes ten thousand; publicnode refuses history altogether.
 */
export const LOG_ENDPOINTS = [
  { url: 'https://rpc.mainnet.chain.robinhood.com', span: 1_000_000 },
  { url: 'https://robinhood.drpc.org', span: 5_000 },
] as const;
export const RPC_HEADERS = headers;

/** Chain facts that cost time to establish once. Do not re-derive. */
export const USDG: Address = '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168'; // 6 decimals
export const WETH: Address = '0x0bd7d308f8e1639fab988df18a8011f41eacad73'; // 18 decimals
export const POOL_MANAGER: Address = '0x8366a39cc670b4001a1121b8f6a443a643e40951'; // Uniswap v4 singleton
export const UNIVERSAL_ROUTER: Address = '0x66a9893cc07d91d95644aedd05d03f95e1dba8af';
export const PERMIT2: Address = '0x000000000022D473030F116dDEE9F6B43aC78BA3';
export const MULTICALL3: Address = '0xcA11bde05977b3631167028862bE2a173976CA11';
export const SECONDS_PER_BLOCK = 0.1; // measured 2026-09-17 over 10k blocks
export const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef' as const;

/** Tokenised US stocks on Robinhood Chain (Robinhood Token), the tape's universe. */
export const STOCKS: { symbol: string; name: string; address: Address }[] = [
  { symbol: 'META', name: 'Meta Platforms', address: '0xc0D6457C16Cc70d6790Dd43521C899C87ce02f35' },
  { symbol: 'NVDA', name: 'NVIDIA', address: '0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC' },
  { symbol: 'TSLA', name: 'Tesla', address: '0x322F0929c4625eD5bAd873c95208D54E1c003b2d' },
  { symbol: 'AAPL', name: 'Apple', address: '0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9' },
  { symbol: 'AMZN', name: 'Amazon', address: '0x12f190a9F9d7D37a250758b26824B97CE941bF54' },
  { symbol: 'GOOGL', name: 'Alphabet', address: '0x2e0847E8910a9732eB3fb1bb4b70a580ADAD4FE3' },
  { symbol: 'MSFT', name: 'Microsoft', address: '0xe93237C50D904957Cf27E7B1133b510C669c2e74' },
  { symbol: 'MSTR', name: 'Strategy', address: '0xec262a75e413fAfD0dF80480274532C79D42da09' },
  { symbol: 'PLTR', name: 'Palantir', address: '0x894E1EC2D74FFE5AEF8Dc8A9e84686acCB964F2A' },
];

export const erc20Abi = parseAbi([
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function name() view returns (string)',
  'function allowance(address,address) view returns (uint256)',
  'function approve(address,uint256) returns (bool)',
  'function transfer(address,uint256) returns (bool)',
  'event Transfer(address indexed from, address indexed to, uint256 value)',
]);

export const lower = (a: string) => a.toLowerCase() as Address;
export const explorerTx = (hash: string) => `${robinhood.blockExplorers.default.url}/tx/${hash}`;
export const explorerAddr = (a: string) => `${robinhood.blockExplorers.default.url}/address/${a}`;
