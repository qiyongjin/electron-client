import { parentPort, workerData } from "node:worker_threads";
import { startUploadTestServer } from "./testServer.js";
void startUploadTestServer(workerData)
  .then((server) => {
    parentPort?.postMessage({ type: "ready", endpoint: server.endpoint });
    parentPort?.on("message", (message) => {
      if (message.type === "configure") server.configure(message.options);
    });
  })
  .catch((error) => {
    parentPort?.postMessage({ type: "error", error: error.message });
    parentPort?.close();
  });
