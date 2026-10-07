export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  const { startContentWatcher } = await import("./lib/content/watcher");
  await startContentWatcher();

  // MQTT broker（内嵌 aedes）：失败不影响站点，只记录错误
  try {
    const { readMqttConfig } = await import("./lib/mqtt/store");
    const { startMqttBroker } = await import("./lib/mqtt/broker");
    if (readMqttConfig().enabled) await startMqttBroker();
  } catch (error) {
    console.error("[mqtt] 初始化失败（站点继续运行）", error);
  }

  // 库存资源（参考图 / 数据手册）定时本地化：失败不影响站点
  try {
    const { startInventoryAssetScheduler } = await import("./lib/inventory/scheduler");
    startInventoryAssetScheduler();
  } catch (error) {
    console.error("[inventory] 定时本地化启动失败（站点继续运行）", error);
  }
}
