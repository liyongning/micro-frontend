import "css.escape";

const defaultOpts = {
  // required opts
  Vue: null,
  appOptions: null,
  template: null
};

/**
 * 判断参数的合法性
 * 返回生命周期函数，其中的mount方法负责实例化子应用，update方法提供了基座应用和子应用通信的机会，unmount卸载子应用，bootstrap感觉没啥用
 * @param {*} userOpts = {
 *    Vue,
 *    appOptions: {
 *      el: '#id',
 *      store,
 *      router,
 *      render: h => h(App)
 *    } 
 * }
 * return 四个生命周期函数组成的对象
 */
export default function singleSpaVue(userOpts) {
  // object
  if (typeof userOpts !== "object") {
    throw new Error(`single-spa-vue requires a configuration object`);
  }

  // 合并用户选项和默认选项
  const opts = {
    ...defaultOpts,
    ...userOpts
  };

  // Vue构造函数
  if (!opts.Vue) {
    throw Error("single-spa-vue must be passed opts.Vue");
  }

  // appOptions
  if (!opts.appOptions) {
    throw Error("single-spa-vue must be passed opts.appOptions");
  }

  // el选择器
  if (
    opts.appOptions.el &&
    typeof opts.appOptions.el !== "string" &&
    !(opts.appOptions.el instanceof HTMLElement)
  ) {
    throw Error(
      `single-spa-vue: appOptions.el must be a string CSS selector, an HTMLElement, or not provided at all. Was given ${typeof opts
        .appOptions.el}`
    );
  }

  // Just a shared object to store the mounted object state
  // key - name of single-spa app, since it is unique
  let mountedInstances = {};

  /**
   * 返回一个对象，每个属性都是一个生命周期函数
   */
  return {
    bootstrap: bootstrap.bind(null, opts, mountedInstances),
    mount: mount.bind(null, opts, mountedInstances),
    unmount: unmount.bind(null, opts, mountedInstances),
    update: update.bind(null, opts, mountedInstances)
  };
}

function bootstrap(opts) {
  if (opts.loadRootComponent) {
    return opts.loadRootComponent().then(root => (opts.rootComponent = root));
  } else {
    return Promise.resolve();
  }
}

/**
 * 做了三件事情：
 *  大篇幅的处理el元素
 *  然后是render函数
 *  实例化子应用
 */
function mount(opts, mountedInstances, props) {
  const instance = {};
  return Promise.resolve().then(() => {
    const appOptions = { ...opts.appOptions };
    // 可以通过props.domElement属性单独设置自应用的渲染DOM容器，当然appOptions.el必须为空
    if (props.domElement && !appOptions.el) {
      appOptions.el = props.domElement;
    }

    let domEl;
    if (appOptions.el) {
      if (typeof appOptions.el === "string") {
        // 子应用的DOM容器
        domEl = document.querySelector(appOptions.el);
        if (!domEl) {
          throw Error(
            `If appOptions.el is provided to single-spa-vue, the dom element must exist in the dom. Was provided as ${appOptions.el}`
          );
        }
      } else {
        // 处理DOM容器是元素的情况
        domEl = appOptions.el;
        if (!domEl.id) {
          // 设置元素ID
          domEl.id = `single-spa-application:${props.name}`;
        }
        appOptions.el = `#${CSS.escape(domEl.id)}`;
      }
    } else {
      // 当然如果没有id，这里会自动生成一个id
      const htmlId = `single-spa-application:${props.name}`;
      appOptions.el = `#${CSS.escape(htmlId)}`;
      domEl = document.getElementById(htmlId);
      if (!domEl) {
        domEl = document.createElement("div");
        domEl.id = htmlId;
        document.body.appendChild(domEl);
      }
    }

    appOptions.el = appOptions.el + " .single-spa-container";

    // single-spa-vue@>=2 always REPLACES the `el` instead of appending to it.
    // We want domEl to stick around and not be replaced. So we tell Vue to mount
    // into a container div inside of the main domEl
    if (!domEl.querySelector(".single-spa-container")) {
      const singleSpaContainer = document.createElement("div");
      singleSpaContainer.className = "single-spa-container";
      domEl.appendChild(singleSpaContainer);
    }

    instance.domEl = domEl;

    // render
    if (!appOptions.render && !appOptions.template && opts.rootComponent) {
      appOptions.render = h => h(opts.rootComponent);
    }

    // data
    if (!appOptions.data) {
      appOptions.data = {};
    }

    appOptions.data = { ...appOptions.data, ...props };

    // 实例化子应用
    instance.vueInstance = new opts.Vue(appOptions);
    if (instance.vueInstance.bind) {
      instance.vueInstance = instance.vueInstance.bind(instance.vueInstance);
    }

    mountedInstances[props.name] = instance;

    return instance.vueInstance;
  });
}

// 基座应用通过update生命周期函数可以更新子应用的属性
function update(opts, mountedInstances, props) {
  return Promise.resolve().then(() => {
    // 应用实例
    const instance = mountedInstances[props.name];
    // 所有的属性
    const data = {
      ...(opts.appOptions.data || {}),
      ...props
    };
    // 更新实例对象上的属性值，vm.test = 'xxx'
    for (let prop in data) {
      instance.vueInstance[prop] = data[prop];
    }
  });
}

// 调用$destroy钩子函数，销毁子应用
function unmount(opts, mountedInstances, props) {
  return Promise.resolve().then(() => {
    const instance = mountedInstances[props.name];
    instance.vueInstance.$destroy();
    instance.vueInstance.$el.innerHTML = "";
    delete instance.vueInstance;

    if (instance.domEl) {
      instance.domEl.innerHTML = "";
      delete instance.domEl;
    }
  });
}
