/** Mint a fresh muse wallet. Prints the key once; store it somewhere private. */
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
const key = generatePrivateKey();
const a = privateKeyToAccount(key);
console.log(`MUSE_KEY=${key}\naddress=${a.address}\n\nfund it with 5–10 USDG + ~0.0005 ETH on chain 4663, then: npm run agent:register -- --key ${key} --name <name>`);
