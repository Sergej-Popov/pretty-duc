import { buildConfig } from '@pretty-duc/config';
import { createApp } from './app';

const config = buildConfig(process.env as Record<string, string | undefined>);
console.info(`[config] database=${config.database} root=${config.root} enableTreeApi=${config.enableTreeApi} defaultMinSize=${config.defaultMinSize}`);
console.info(`[config] limits: ducTimeoutMs=${config.limits.ducTimeoutMs} recursiveBudgetMs=${config.limits.recursiveBudgetMs} maxChildrenLevels=${config.limits.maxChildrenLevels} maxTreeLevels=${config.limits.maxTreeLevels}`);
console.info(`[config] limits: maxChildrenPerDirectory=${config.limits.maxChildrenPerDirectory} maxRecursiveNodes=${config.limits.maxRecursiveNodes} maxTreeNodes=${config.limits.maxTreeNodes}`);
console.info(`[config] limits: maxChildrenResponseBytes=${config.limits.maxChildrenResponseBytes} maxTreeResponseBytes=${config.limits.maxTreeResponseBytes} recursiveConcurrency=${config.limits.recursiveConcurrency}`);
const app = createApp(config, { background: true });

await app.listen({ host: '0.0.0.0', port: config.port });
