/** Refresh every resident from chain, once. What the cron does, from a terminal. */
import { refreshAll } from '../lib/indexer';
console.log(await refreshAll());
