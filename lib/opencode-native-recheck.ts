export function createOpenCodeRecheck() {
  let revision = 0;
  let running: Promise<void> | undefined;
  let latest: ((current: () => boolean) => Promise<void>) | undefined;

  return (check: (current: () => boolean) => Promise<void>): Promise<void> => {
    revision += 1;
    latest = check;
    if (running) return running;
    running = (async () => {
      while (latest) {
        const work = latest;
        const version = revision;
        latest = undefined;
        await work(() => version === revision);
      }
    })().finally(() => {
      running = undefined;
    });
    return running;
  };
}
