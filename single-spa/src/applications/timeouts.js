import { assign } from "../utils/assign";
import { getProps } from "../lifecycles/prop.helpers";
import { objectType, toName } from "./app.helpers";
import { formatErrorMessage } from "./app-errors";

const defaultWarningMillis = 1000;

const globalTimeoutConfig = {
  bootstrap: {
    millis: 4000,
    dieOnTimeout: false,
    warningMillis: defaultWarningMillis,
  },
  mount: {
    millis: 3000,
    dieOnTimeout: false,
    warningMillis: defaultWarningMillis,
  },
  unmount: {
    millis: 3000,
    dieOnTimeout: false,
    warningMillis: defaultWarningMillis,
  },
  unload: {
    millis: 3000,
    dieOnTimeout: false,
    warningMillis: defaultWarningMillis,
  },
  update: {
    millis: 3000,
    dieOnTimeout: false,
    warningMillis: defaultWarningMillis,
  },
};

export function setBootstrapMaxTime(time, dieOnTimeout, warningMillis) {
  if (typeof time !== "number" || time <= 0) {
    throw Error(
      formatErrorMessage(
        16,
        __DEV__ &&
          `bootstrap max time must be a positive integer number of milliseconds`
      )
    );
  }

  globalTimeoutConfig.bootstrap = {
    millis: time,
    dieOnTimeout,
    warningMillis: warningMillis || defaultWarningMillis,
  };
}

export function setMountMaxTime(time, dieOnTimeout, warningMillis) {
  if (typeof time !== "number" || time <= 0) {
    throw Error(
      formatErrorMessage(
        17,
        __DEV__ &&
          `mount max time must be a positive integer number of milliseconds`
      )
    );
  }

  globalTimeoutConfig.mount = {
    millis: time,
    dieOnTimeout,
    warningMillis: warningMillis || defaultWarningMillis,
  };
}

export function setUnmountMaxTime(time, dieOnTimeout, warningMillis) {
  if (typeof time !== "number" || time <= 0) {
    throw Error(
      formatErrorMessage(
        18,
        __DEV__ &&
          `unmount max time must be a positive integer number of milliseconds`
      )
    );
  }

  globalTimeoutConfig.unmount = {
    millis: time,
    dieOnTimeout,
    warningMillis: warningMillis || defaultWarningMillis,
  };
}

export function setUnloadMaxTime(time, dieOnTimeout, warningMillis) {
  if (typeof time !== "number" || time <= 0) {
    throw Error(
      formatErrorMessage(
        19,
        __DEV__ &&
          `unload max time must be a positive integer number of milliseconds`
      )
    );
  }

  globalTimeoutConfig.unload = {
    millis: time,
    dieOnTimeout,
    warningMillis: warningMillis || defaultWarningMillis,
  };
}

/**
 * 合理的时间，即生命周期函数合理的执行时间
 * 在合理的时间内执行生命周期函数，并将函数的执行结果resolve出去
 * @param {*} appOrParcel => app
 * @param {*} lifecycle => 生命周期函数名
 */
export function reasonableTime(appOrParcel, lifecycle) {
  // 应用的超时配置
  const timeoutConfig = appOrParcel.timeouts[lifecycle];
  // 超时警告
  const warningPeriod = timeoutConfig.warningMillis;
  const type = objectType(appOrParcel);

  return new Promise((resolve, reject) => {
    let finished = false;
    let errored = false;

    // 这里很关键，之前一直奇怪props是怎么传递给子应用的，这里就是了，果然和之前的猜想是一样的
    // 是在执行生命周期函数时像子应用传递的props，所以之前执行loadApp传递props不会到子应用，
    // 那么设计估计是给用户自己处理props的一个机会吧，因为那个时候处理的props已经是{ ...customProps, ...内置props }
    appOrParcel[lifecycle](getProps(appOrParcel))
      .then((val) => {
        finished = true;
        resolve(val);
      })
      .catch((val) => {
        finished = true;
        reject(val);
      });

    // 下面就没啥了，就是超时的一些提示信息
    setTimeout(() => maybeTimingOut(1), warningPeriod);
    setTimeout(() => maybeTimingOut(true), timeoutConfig.millis);

    const errMsg = formatErrorMessage(
      31,
      __DEV__ &&
        `Lifecycle function ${lifecycle} for ${type} ${toName(
          appOrParcel
        )} lifecycle did not resolve or reject for ${timeoutConfig.millis} ms.`,
      lifecycle,
      type,
      toName(appOrParcel),
      timeoutConfig.millis
    );

    function maybeTimingOut(shouldError) {
      if (!finished) {
        if (shouldError === true) {
          errored = true;
          if (timeoutConfig.dieOnTimeout) {
            reject(Error(errMsg));
          } else {
            console.error(errMsg);
            //don't resolve or reject, we're waiting this one out
          }
        } else if (!errored) {
          const numWarnings = shouldError;
          const numMillis = numWarnings * warningPeriod;
          console.warn(errMsg);
          if (numMillis + warningPeriod < timeoutConfig.millis) {
            setTimeout(() => maybeTimingOut(numWarnings + 1), warningPeriod);
          }
        }
      }
    }
  });
}

export function ensureValidAppTimeouts(timeouts) {
  const result = {};

  for (let key in globalTimeoutConfig) {
    result[key] = assign(
      {},
      globalTimeoutConfig[key],
      (timeouts && timeouts[key]) || {}
    );
  }

  return result;
}
