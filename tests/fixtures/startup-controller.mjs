// Windows kill(SIGINT) forcibly terminates Node instead of delivering a console
// event. Exercise the launcher's registered handler over IPC on every platform.
process.on("message", (signal) => {
  if (signal === "SIGINT" || signal === "SIGTERM") process.emit(signal);
});
process.channel?.unref();
