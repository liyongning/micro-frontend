import { find } from "../utils/find.js";
import { objectType, toName } from "../applications/app.helpers.js";
import { formatErrorMessage } from "../applications/app-errors.js";

export function validLifecycleFn(fn) {
  return fn && (typeof fn === "function" || isArrayOfFns(fn));

  function isArrayOfFns(arr) {
    return (
      Array.isArray(arr) && !find(arr, (item) => typeof item !== "function")
    );
  }
}

/**
 * 返回一个接受props作为参数的函数，这个函数负责执行子应用中的生命周期函数，
 * 并确保生命周期函数返回的结果为promise
 * @param {*} appOrParcel => window.singleSpa，子应用打包后的对象
 * @param {*} lifecycle => 字符串，生命周期名称
 */
export function flattenFnArray(appOrParcel, lifecycle) {
  // fns = fn or []
  let fns = appOrParcel[lifecycle] || [];
  // fns = [] or [fn]
  fns = Array.isArray(fns) ? fns : [fns];
  // 有些生命周期函数子应用可能不会设置，比如unload
  if (fns.length === 0) {
    fns = [() => Promise.resolve()];
  }

  const type = objectType(appOrParcel);
  const name = toName(appOrParcel);

  return function (props) {
    // 这里最后返回了一个promise链，这个操作似乎没啥必要，因为不可能出现同名的生命周期函数，所以，这里将生命周期函数放数组，没太理解目的是啥
    return fns.reduce((resultPromise, fn, index) => {
      return resultPromise.then(() => {
        // 执行生命周期函数，传递props给函数，并验证函数的返回结果，必须为promise
        const thisPromise = fn(props);
        return smellsLikeAPromise(thisPromise)
          ? thisPromise
          : Promise.reject(
              formatErrorMessage(
                15,
                __DEV__ &&
                  `Within ${type} ${name}, the lifecycle function ${lifecycle} at array index ${index} did not return a promise`,
                type,
                name,
                lifecycle,
                index
              )
            );
      });
    }, Promise.resolve());
  };
}

// 判断一个变量是否为promise
export function smellsLikeAPromise(promise) {
  return (
    promise &&
    typeof promise.then === "function" &&
    typeof promise.catch === "function"
  );
}
