import {
  NOT_MOUNTED,
  UNLOADING,
  NOT_LOADED,
  SKIP_BECAUSE_BROKEN,
  toName,
} from "../applications/app.helpers.js";
import { handleAppError } from "../applications/app-errors.js";
import { reasonableTime } from "../applications/timeouts.js";

const appsToUnload = {};

/**
 * 移除应用，就更改一下应用的状态，执行unload生命周期函数，执行清理操作
 * 
 * 其实一般情况是不会执行移除操作的，除非你手动调用unloadApplication方法
 * 单步调试会发现appsToUnload对象是个空对象，所以第一个if就return了，这里啥也没做
 * https://zh-hans.single-spa.js.org/docs/api#unloadapplication
 * */ 
export function toUnloadPromise(app) {
  return Promise.resolve().then(() => {
    // 应用信息
    const unloadInfo = appsToUnload[toName(app)];

    if (!unloadInfo) {
      /* No one has called unloadApplication for this app,
       * 不需要移除
       * 一般情况下都不需要移除，只有在调用unloadApplication方法手动执行移除时才会
       * 执行后面的内容
       */
      return app;
    }

    // 已经卸载了，执行一些清理操作
    if (app.status === NOT_LOADED) {
      /* This app is already unloaded. We just need to clean up
       * anything that still thinks we need to unload the app.
       */
      finishUnloadingApp(app, unloadInfo);
      return app;
    }

    // 如果应用正在执行挂载，路由突然发生改变，那么也需要应用挂载完成才可以执行移除
    if (app.status === UNLOADING) {
      /* Both unloadApplication and reroute want to unload this app.
       * It only needs to be done once, though.
       */
      return unloadInfo.promise.then(() => app);
    }

    if (app.status !== NOT_MOUNTED) {
      /* The app cannot be unloaded until it is unmounted.
       */
      return app;
    }

    // 更改状态为 UNLOADING
    app.status = UNLOADING;
    // 在合理的时间范围内执行生命周期函数
    return reasonableTime(app, "unload")
      .then(() => {
        // 一些清理操作
        finishUnloadingApp(app, unloadInfo);
        return app;
      })
      .catch((err) => {
        errorUnloadingApp(app, unloadInfo, err);
        return app;
      });
  });
}

// 移除完成，执行一些清理动作，其实就是从appsToUnload数组中移除该app，移除生命周期函数，更改app.status
// 但应用不是真的被移除，后面再激活时不需要重新去下载资源,，只是做一些状态上的变更，当然load的那个过程还是需要的，这点可能需要再确认一下
function finishUnloadingApp(app, unloadInfo) {
  delete appsToUnload[toName(app)];

  // Unloaded apps don't have lifecycles
  delete app.bootstrap;
  delete app.mount;
  delete app.unmount;
  delete app.unload;

  app.status = NOT_LOADED;

  /* resolve the promise of whoever called unloadApplication.
   * This should be done after all other cleanup/bookkeeping
   */
  unloadInfo.resolve();
}

function errorUnloadingApp(app, unloadInfo, err) {
  delete appsToUnload[toName(app)];

  // Unloaded apps don't have lifecycles
  delete app.bootstrap;
  delete app.mount;
  delete app.unmount;
  delete app.unload;

  handleAppError(err, app, SKIP_BECAUSE_BROKEN);
  unloadInfo.reject(err);
}

export function addAppToUnload(app, promiseGetter, resolve, reject) {
  appsToUnload[toName(app)] = { app, resolve, reject };
  Object.defineProperty(appsToUnload[toName(app)], "promise", {
    get: promiseGetter,
  });
}

export function getAppUnloadInfo(appName) {
  return appsToUnload[appName];
}
