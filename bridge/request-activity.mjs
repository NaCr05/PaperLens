export const AI_TASK_CHANNELS = ["translation", "chat", "terms"];

export function taskChannelForMode(mode) {
  if (mode === "translate") return "translation";
  if (mode === "terms") return "terms";
  return "chat";
}

export function createRequestActivityTracker() {
  const providers = new Map();

  function snapshot(providerId) {
    const channels = providers.get(providerId);
    const counts = Object.fromEntries(AI_TASK_CHANNELS.map((channel) => [channel, channels?.get(channel) || 0]));
    return {
      total: Object.values(counts).reduce((sum, count) => sum + count, 0),
      channels: counts,
    };
  }

  function start(providerId, mode) {
    const channel = taskChannelForMode(mode);
    const channels = providers.get(providerId) || new Map();
    channels.set(channel, (channels.get(channel) || 0) + 1);
    providers.set(providerId, channels);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const activeChannels = providers.get(providerId);
      if (!activeChannels) return;
      const nextCount = Math.max(0, (activeChannels.get(channel) || 0) - 1);
      if (nextCount) activeChannels.set(channel, nextCount);
      else activeChannels.delete(channel);
      if (!activeChannels.size) providers.delete(providerId);
    };
  }

  return { snapshot, start };
}
