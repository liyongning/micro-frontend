import { reroute } from "./reroute.js";
import { find } from "../utils/find.js";
import { formatErrorMessage } from "../applications/app-errors.js";
import { isInBrowser } from "../utils/runtime-environment.js";

/* We capture navigation event listeners so that we can make sure
 * that application navigation listeners are not called until
 * single-spa has ensured that the correct applications are
 * unmounted and mounted.
 */
const capturedEventListeners = {
  hashchange: [],
  popstate: [],
};

export const routingEventsListeningTo = ["hashchange", "popstate"];

export function navigateToUrl(obj) {
  let url;
  if (typeof obj === "string") {
    url = obj;
  } else if (this && this.href) {
    url = this.href;
  } else if (
    obj &&
    obj.currentTarget &&
    obj.currentTarget.href &&
    obj.preventDefault
  ) {
    url = obj.currentTarget.href;
    obj.preventDefault();
  } else {
    throw Error(
      formatErrorMessage(
        14,
        __DEV__ &&
          `singleSpaNavigate/navigateToUrl must be either called with a string url, with an <a> tag as its context, or with an event whose currentTarget is an <a> tag`
      )
    );
  }

  const current = parseUri(window.location.href);
  const destination = parseUri(url);

  if (url.indexOf("#") === 0) {
    window.location.hash = destination.hash;
  } else if (current.host !== destination.host && destination.host) {
    if (process.env.BABEL_ENV === "test") {
      return { wouldHaveReloadedThePage: true };
    } else {
      window.location.href = url;
    }
  } else if (
    destination.pathname === current.pathname &&
    destination.search === current.search
  ) {
    window.location.hash = destination.hash;
  } else {
    // different path, host, or query params
    window.history.pushState(null, null, url);
  }
}

export function callCapturedEventListeners(eventArguments) {
  if (eventArguments) {
    const eventType = eventArguments[0].type;
    if (routingEventsListeningTo.indexOf(eventType) >= 0) {
      capturedEventListeners[eventType].forEach((listener) => {
        try {
          // The error thrown by application event listener should not break single-spa down.
          // Just like https://github.com/single-spa/single-spa/blob/85f5042dff960e40936f3a5069d56fc9477fac04/src/navigation/reroute.js#L140-L146 did
          listener.apply(this, eventArguments);
        } catch (e) {
          setTimeout(() => {
            throw e;
          });
        }
      });
    }
  }
}

let urlRerouteOnly;

export function setUrlRerouteOnly(val) {
  urlRerouteOnly = val;
}

function urlReroute() {
  reroute([], arguments);
}

/**
 * 通过装饰器模式，增强pushstate和replacestate方法，除了原生的操作历史记录，还会调用reroute
 * @param {*} updateState window.history.pushstate/replacestate
 * @param {*} methodName 'pushstate' or 'replacestate'
 */
function patchedUpdateState(updateState, methodName) {
  return function () {
    // 当前url
    const urlBefore = window.location.href;
    // pushstate或者replacestate的执行结果
    const result = updateState.apply(this, arguments);
    // pushstate或replacestate执行后的url地址
    const urlAfter = window.location.href;

    // 如果调用start传递了参数urlRerouteOnly为true，则这里不会触发reroute
    // https://zh-hans.single-spa.js.org/docs/api#start
    if (!urlRerouteOnly || urlBefore !== urlAfter) {
      urlReroute(createPopStateEvent(window.history.state, methodName));
    }

    return result;
  };
}

function createPopStateEvent(state, originalMethodName) {
  // https://github.com/single-spa/single-spa/issues/224 and https://github.com/single-spa/single-spa-angular/issues/49
  // We need a popstate event even though the browser doesn't do one by default when you call replaceState, so that
  // all the applications can reroute. We explicitly identify this extraneous event by setting singleSpa=true and
  // singleSpaTrigger=<pushState|replaceState> on the event instance.
  let evt;
  try {
    evt = new PopStateEvent("popstate", { state });
  } catch (err) {
    // IE 11 compatibility https://github.com/single-spa/single-spa/issues/299
    // https://docs.microsoft.com/en-us/openspecs/ie_standards/ms-html5e/bd560f47-b349-4d2c-baa8-f1560fb489dd
    evt = document.createEvent("PopStateEvent");
    evt.initPopStateEvent("popstate", false, false, state);
  }
  evt.singleSpa = true;
  evt.singleSpaTrigger = originalMethodName;
  return evt;
}

/**
 * 监听路由变化
 */
if (isInBrowser) {
  // We will trigger an app change for any routing events，监听hashchange和popstate事件
  window.addEventListener("hashchange", urlReroute);
  window.addEventListener("popstate", urlReroute);

  // Monkeypatch addEventListener so that we can ensure correct timing
  /**
   * 扩展原生的addEventListener和removeEventListener方法
   * 每次注册事件和事件处理函数都会将事件和处理函数保存下来，当然移除时也会做删除
   * */ 
  const originalAddEventListener = window.addEventListener;
  const originalRemoveEventListener = window.removeEventListener;
  window.addEventListener = function (eventName, fn) {
    if (typeof fn === "function") {
      if (
        // eventName只能是hashchange或popstate && 对应事件的fn注册函数没有注册
        routingEventsListeningTo.indexOf(eventName) >= 0 &&
        !find(capturedEventListeners[eventName], (listener) => listener === fn)
      ) {
        // 注册（保存）eventName 事件的处理函数
        capturedEventListeners[eventName].push(fn);
        return;
      }
    }

    // 原生方法
    return originalAddEventListener.apply(this, arguments);
  };

  window.removeEventListener = function (eventName, listenerFn) {
    if (typeof listenerFn === "function") {
      // 从captureEventListeners数组中移除eventName事件指定的事件处理函数
      if (routingEventsListeningTo.indexOf(eventName) >= 0) {
        capturedEventListeners[eventName] = capturedEventListeners[
          eventName
        ].filter((fn) => fn !== listenerFn);
        return;
      }
    }

    return originalRemoveEventListener.apply(this, arguments);
  };

  // 增强pushstate和replacestate
  window.history.pushState = patchedUpdateState(
    window.history.pushState,
    "pushState"
  );
  window.history.replaceState = patchedUpdateState(
    window.history.replaceState,
    "replaceState"
  );

  if (window.singleSpaNavigate) {
    console.warn(
      formatErrorMessage(
        41,
        __DEV__ &&
          "single-spa has been loaded twice on the page. This can result in unexpected behavior."
      )
    );
  } else {
    /* For convenience in `onclick` attributes, we expose a global function for navigating to
     * whatever an <a> tag's href is.
     * singleSpa暴露出来的一个全局方法，用户也可以基于它去判断子应用是运行在基座应用上还是独立运行
     */
    window.singleSpaNavigate = navigateToUrl;
  }
}

function parseUri(str) {
  const anchor = document.createElement("a");
  anchor.href = str;
  return anchor;
}
