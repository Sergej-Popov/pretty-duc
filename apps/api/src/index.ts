import { parseConfig } from '@pretty-duc/config';
import { createApp } from './app';

const config = parseConfig(process.env as Record<string, string | undefined>);
const app = createApp(config);

await app.listen({ host: '0.0.0.0', port: config.port });
