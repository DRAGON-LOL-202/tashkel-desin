import { createApp } from "./app.js";
import { env } from "./utils/env.js";
import { startTimerWatcher } from "./utils/timerWatcher.js";

const app = createApp();
const port = env().PORT;
app.listen(port, () => console.log(`API listening on :${port}`));
startTimerWatcher(); // يعمل ما دامت الخدمة مستيقظة؛ على الخطة المجانية يوقظها ping خارجي كل دقيقة (/api/internal/tick)
