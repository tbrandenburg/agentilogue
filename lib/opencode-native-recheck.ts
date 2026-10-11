export function createOpenCodeRecheck() {
  let revision = 0;
  let running: Promise<void> | undefined;
  let latest: ((current: () => boolean) => Promise<void>) | undefined;

  return (check: (current: () => boolean) => Promise<void>): Promise<void> => {
    revision += 1;
    latest = check;
    if (running) return running;
    running = Promise.resolve().then(async () => {
      try {
        while (latest) {
          const work = latest;
          const version = revision;
          latest = undefined;
          await work(() => version === revision);
        }
      } finally {
        // Release ownership before another microtask can enqueue a new check.
        running = undefined;
      }
    });
    return running;
  };
}
