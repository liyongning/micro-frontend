import CustomEvent from "custom-event";
import { isStarted } from "../start.js";
import { toLoadPromise } from "../lifecycles/load.js";
import { toBootstrapPromise } from "../lifecycles/bootstrap.js";
import { toMountPromise } from "../lifecycles/mount.js";
import { toUnmountPromise } from "../lifecycles/unmount.js";
import {
  getAppStatus,
  getAppChanges,
  getMountedApps,
} from "../applications/apps.js";
import { callCapturedEventListeners } from "./navigation-events.js";
import { toUnloadPromise } from "../lifecycles/unload.js";
import {
  toName,
  shouldBeActive,
  NOT_MOUNTED,
  MOUNTED,
  NOT_LOADED,
  SKIP_BECAUSE_BROKEN,
} from "../applications/app.helpers.js";

let appChangeUnderway = false,
  peopleWaitingOnAppChange = [];

export function triggerAppChange() {
  // Call reroute with no arguments, intentionally
  return reroute();
}

/**
 * 每次切换路由前，将应用分为4大类，
 * 首次加载时执行loadApp
 * 后续的路由切换执行performAppChange
 * 为四大类的应用分别执行相应的操作，比如更改app.status，执行生命周期函数
 * 所以，从这里也可以看出来，single-spa就是一个维护应用的状态机
 * @param {*} pendingPromises 
 * @param {*} eventArguments 
 */
export function reroute(pendingPromises = [], eventArguments) {
  // 应用正在切换，这个状态会在执行performAppChanges之前置为true，执行结束之后再置为false
  // 如果在中间用户重新切换路由了，即走这个if分支，暂时看起来就在数组中存储了一些信息，没看到有什么用
  // 字面意思理解就是用户等待app切换
  if (appChangeUnderway) {
    return new Promise((resolve, reject) => {
      peopleWaitingOnAppChange.push({
        resolve,
        reject,
        eventArguments,
      });
    });
  }

  // 将应用分为4大类
  const {
    // 需要被移除的
    appsToUnload,
    // 需要被卸载的
    appsToUnmount,
    // 需要被加载的
    appsToLoad,
    // 需要被挂载的
    appsToMount,
  } = getAppChanges();

  let appsThatChanged;

  // 是否已经执行 start 方法
  if (isStarted()) {
    // 已执行
    appChangeUnderway = true;
    // 所有需要被改变的的应用
    appsThatChanged = appsToUnload.concat(
      appsToLoad,
      appsToUnmount,
      appsToMount
    );
    // 执行改变
    return performAppChanges();
  } else {
    // 未执行
    appsThatChanged = appsToLoad;
    // 加载Apps
    return loadApps();
  }

  // 整体返回一个立即resolved的promise，通过微任务来加载apps
  function loadApps() {
    return Promise.resolve().then(() => {
      // 加载每个子应用，并做一系列的状态变更和验证（比如结果为promise、子应用要导出生命周期函数）
      const loadPromises = appsToLoad.map(toLoadPromise);

      return (
        // 保证所有加载子应用的微任务执行完成
        Promise.all(loadPromises)
          .then(callAllEventListeners)
          // there are no mounted apps, before start() is called, so we always return []
          .then(() => [])
          .catch((err) => {
            callAllEventListeners();
            throw err;
          })
      );
    });
  }

  function performAppChanges() {
    return Promise.resolve().then(() => {
      // https://github.com/single-spa/single-spa/issues/545
      // 自定义事件，在应用状态发生改变之前可触发，给用户提供搞事情的机会
      window.dispatchEvent(
        new CustomEvent(
          appsThatChanged.length === 0
            ? "single-spa:before-no-app-change"
            : "single-spa:before-app-change",
          getCustomEventDetail(true)
        )
      );

      window.dispatchEvent(
        new CustomEvent(
          "single-spa:before-routing-event",
          getCustomEventDetail(true)
        )
      );
      // 移除应用 => 更改应用状态，执行unload生命周期函数，执行一些清理动作
      // 其实一般情况下这里没有真的移除应用
      const unloadPromises = appsToUnload.map(toUnloadPromise);

      // 卸载应用，更改状态，执行unmount生命周期函数
      const unmountUnloadPromises = appsToUnmount
        .map(toUnmountPromise)
        // 卸载完然后移除，通过注册微任务的方式实现
        .map((unmountPromise) => unmountPromise.then(toUnloadPromise));

      const allUnmountPromises = unmountUnloadPromises.concat(unloadPromises);

      const unmountAllPromise = Promise.all(allUnmountPromises);

      // 卸载全部完成后触发一个事件
      unmountAllPromise.then(() => {
        window.dispatchEvent(
          new CustomEvent(
            "single-spa:before-mount-routing-event",
            getCustomEventDetail(true)
          )
        );
      });

      /* We load and bootstrap apps while other apps are unmounting, but we
       * wait to mount the app until all apps are finishing unmounting
       * 这个原因其实是因为这些操作都是通过注册不同的微任务实现的，而JS是单线程执行，
       * 所以自然后续的只能等待前面的执行完了才能执行
       * 这里一般情况下其实不会执行，只有手动执行了unloadApplication方法才会二次加载
       */
      const loadThenMountPromises = appsToLoad.map((app) => {
        return toLoadPromise(app).then((app) =>
          tryToBootstrapAndMount(app, unmountAllPromise)
        );
      });

      /* These are the apps that are already bootstrapped and just need
       * to be mounted. They each wait for all unmounting apps to finish up
       * before they mount.
       * 初始化和挂载app，其实做的事情很简单，就是改变app.status，执行生命周期函数
       * 当然这里的初始化和挂载其实是前后脚一起完成的(只要中间用户没有切换路由)
       */
      const mountPromises = appsToMount
        .filter((appToMount) => appsToLoad.indexOf(appToMount) < 0)
        .map((appToMount) => {
          return tryToBootstrapAndMount(appToMount, unmountAllPromise);
        });

      // 后面就没啥了，可以理解为收尾工作
      return unmountAllPromise
        .catch((err) => {
          callAllEventListeners();
          throw err;
        })
        .then(() => {
          /* Now that the apps that needed to be unmounted are unmounted, their DOM navigation
           * events (like hashchange or popstate) should have been cleaned up. So it's safe
           * to let the remaining captured event listeners to handle about the DOM event.
           */
          callAllEventListeners();

          return Promise.all(loadThenMountPromises.concat(mountPromises))
            .catch((err) => {
              pendingPromises.forEach((promise) => promise.reject(err));
              throw err;
            })
            .then(finishUpAndReturn);
        });
    });
  }

  function finishUpAndReturn() {
    const returnValue = getMountedApps();
    pendingPromises.forEach((promise) => promise.resolve(returnValue));

    try {
      const appChangeEventName =
        appsThatChanged.length === 0
          ? "single-spa:no-app-change"
          : "single-spa:app-change";
      window.dispatchEvent(
        new CustomEvent(appChangeEventName, getCustomEventDetail())
      );
      window.dispatchEvent(
        new CustomEvent("single-spa:routing-event", getCustomEventDetail())
      );
    } catch (err) {
      /* We use a setTimeout because if someone else's event handler throws an error, single-spa
       * needs to carry on. If a listener to the event throws an error, it's their own fault, not
       * single-spa's.
       */
      setTimeout(() => {
        throw err;
      });
    }

    /* Setting this allows for subsequent calls to reroute() to actually perform
     * a reroute instead of just getting queued behind the current reroute call.
     * We want to do this after the mounting/unmounting is done but before we
     * resolve the promise for the `reroute` function.
     */
    appChangeUnderway = false;

    if (peopleWaitingOnAppChange.length > 0) {
      /* While we were rerouting, someone else triggered another reroute that got queued.
       * So we need reroute again.
       */
      const nextPendingPromises = peopleWaitingOnAppChange;
      peopleWaitingOnAppChange = [];
      reroute(nextPendingPromises);
    }

    return returnValue;
  }

  /* We need to call all event listeners that have been delayed because they were
   * waiting on single-spa. This includes haschange and popstate events for both
   * the current run of performAppChanges(), but also all of the queued event listeners.
   * We want to call the listeners in the same order as if they had not been delayed by
   * single-spa, which means queued ones first and then the most recent one.
   */
  function callAllEventListeners() {
    pendingPromises.forEach((pendingPromise) => {
      callCapturedEventListeners(pendingPromise.eventArguments);
    });

    callCapturedEventListeners(eventArguments);
  }

  function getCustomEventDetail(isBeforeChanges = false) {
    const newAppStatuses = {};
    const appsByNewStatus = {
      // for apps that were mounted
      [MOUNTED]: [],
      // for apps that were unmounted
      [NOT_MOUNTED]: [],
      // apps that were forcibly unloaded
      [NOT_LOADED]: [],
      // apps that attempted to do something but are broken now
      [SKIP_BECAUSE_BROKEN]: [],
    };

    if (isBeforeChanges) {
      appsToLoad.concat(appsToMount).forEach((app, index) => {
        addApp(app, MOUNTED);
      });
      appsToUnload.forEach((app) => {
        addApp(app, NOT_LOADED);
      });
      appsToUnmount.forEach((app) => {
        addApp(app, NOT_MOUNTED);
      });
    } else {
      appsThatChanged.forEach((app) => {
        addApp(app);
      });
    }

    return {
      detail: {
        newAppStatuses,
        appsByNewStatus,
        totalAppChanges: appsThatChanged.length,
        originalEvent: eventArguments?.[0],
      },
    };

    function addApp(app, status) {
      const appName = toName(app);
      status = status || getAppStatus(appName);
      newAppStatuses[appName] = status;
      const statusArr = (appsByNewStatus[status] =
        appsByNewStatus[status] || []);
      statusArr.push(appName);
    }
  }
}

/**
 * Let's imagine that some kind of delay occurred during application loading.
 * The user without waiting for the application to load switched to another route,
 * this means that we shouldn't bootstrap and mount that application, thus we check
 * twice if that application should be active before bootstrapping and mounting.
 * https://github.com/single-spa/single-spa/issues/524
 * 这里这个两次判断还是很重要的
 */
function tryToBootstrapAndMount(app, unmountAllPromise) {
  if (shouldBeActive(app)) {
    // 一次判断为true，才会执行初始化
    return toBootstrapPromise(app).then((app) =>
      unmountAllPromise.then(() =>
        // 第二次, 两次都为true才会去挂载
        shouldBeActive(app) ? toMountPromise(app) : app
      )
    );
  } else {
    // 卸载
    return unmountAllPromise.then(() => app);
  }
}
