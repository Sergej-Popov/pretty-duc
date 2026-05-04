const registry = process.env.LOCAL_DOCKER_REGISTRY;
if (!registry) {
  console.error('LOCAL_DOCKER_REGISTRY is not set');
  process.exit(1);
}

const image = `${registry}/pretty-duc:latest`;

console.log(`Building ${image}...`);
const build = Bun.spawnSync(['docker', 'build', '--build-arg', 'DEPLOY_ENV=qa', '-t', image, '.'], {
  stdio: ['inherit', 'inherit', 'inherit']
});
if (build.exitCode !== 0) {
  process.exit(build.exitCode);
}

console.log(`Pushing ${image}...`);
const push = Bun.spawnSync(['docker', 'push', image], {
  stdio: ['inherit', 'inherit', 'inherit']
});
if (push.exitCode !== 0) {
  process.exit(push.exitCode);
}

console.log(`Pushed ${image}`);
