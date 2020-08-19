import { reroute } from "./navigation/reroute.js";
import { formatErrorMessage } from "./applications/app-errors.js";
import { setUrlRerouteOnly } from "./navigation/navigation-events.js";
import { isInBrowser } from "./utils/runtime-environment.js";

let started = false;

/**
 * https://zh-hans.single-spa.js.org/docs/api#start
 * 调用start之前，应用会被加载，但不会初始化、挂载和卸载，有了start可以更好的控制应用的性能
 * @param {*} opts 
 */
export function start(opts) {
  started = true;
  if (opts && opts.urlRerouteOnly) {
    setUrlRerouteOnly(opts.urlRerouteOnly);
  }
  if (isInBrowser) {
    reroute();
  }
}

export function isStarted() {
  return started;
}

if (isInBrowser) {
  // registerApplication之后如果一直没有调用start，则在5000ms后给出警告提示
  setTimeout(() => {
    if (!started) {
      console.warn(
        formatErrorMessage(
          1,
          __DEV__ &&
            `singleSpa.start() has not been called, 5000ms after single-spa was loaded. Before start() is called, apps can be declared and loaded, but not bootstrapped or mounted.`
        )
      );
    }
  }, 5000);
}
