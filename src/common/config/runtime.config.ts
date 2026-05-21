import { registerAs } from '@nestjs/config';

export default registerAs('runtime', () => ({
  dockerSocket: process.env.DOCKER_SOCKET ?? '/var/run/docker.sock',
  executionTimeoutMs: parseInt(process.env.RUNTIME_EXECUTION_TIMEOUT_MS ?? '10000', 10),
  containerCpus: process.env.RUNTIME_CONTAINER_CPUS ?? '0.5',
  containerMemory: process.env.RUNTIME_CONTAINER_MEMORY ?? '256m',
}));
