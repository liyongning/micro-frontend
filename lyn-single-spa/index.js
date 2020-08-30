// 实现子应用的注册、挂载、切换、卸载功能

/**
 * 子应用状态
 */
// 子应用注册以后的初始状态
const NOT_LOADED = 'NOT_LOADED'
// 表示正在加载子应用源代码
const LOADING_SOURCE_CODE = 'LOADING_SOURCE_CODE'
// 执行完 app.loadApp，即子应用加载完以后的状态
const NOT_BOOTSTRAPPED = 'NOT_BOOTSTRAPPED'
// 正在初始化
const BOOTSTRAPPING = 'BOOTSTRAPPING'
// 执行 app.bootstrap 之后的状态，表是初始化完成，处于未挂载的状态
const NOT_MOUNTED = 'NOT_MOUNTED'
// 正在挂载
const MOUNTING = 'MOUNTING'
// 挂载完成，app.mount 执行完毕
const MOUNTED = 'MOUNTED'
const UPDATING = 'UPDATING'
// 正在卸载
const UNMOUNTING = 'UNMOUNTING'
// 以下三种状态这里没有涉及
const UNLOADING = 'UNLOADING'
const LOAD_ERROR = 'LOAD_ERROR'
const SKIP_BECAUSE_BROKEN = 'SKIP_BECAUSE_BROKEN'

// 存放所有的子应用
const apps = []

/**
 * 注册子应用
 * @param {*} appConfig = {
 *    name: '',
 *    app: promise function,
 *    activeWhen: location => location.pathname.startsWith(path),
 *    customProps: {}
 * }
 */
export function registerApplication (appConfig) {
  apps.push(Object.assign({}, appConfig, { status: NOT_LOADED }))
  reroute()
}

// 启动
let isStarted = false
export function start () {
  isStarted = true
}

function reroute () {
  // 三类 app
  const { appsToLoad, appsToMount, appsToUnmount } = getAppChanges()
  if (isStarted) {
    performAppChanges()
  } else {
    loadApps()
  }

  function loadApps () {
    appsToLoad.map(toLoad)
  }

  function performAppChanges () {
    // 卸载
    appsToUnmount.map(toUnmount)
    // 初始化 + 挂载
    appsToMount.map(tryToBoostrapAndMount)
  }
}

/**
 * 挂载应用
 * @param {*} app 
 */
async function tryToBoostrapAndMount(app) {
  if (shouldBeActive(app)) {
    // 正在初始化
    app.status = BOOTSTRAPPING
    // 初始化
    await app.bootstrap(app.customProps)
    // 初始化完成
    app.status = NOT_MOUNTED
    // 第二次判断是为了防止中途用户切换路由
    if (shouldBeActive(app)) {
      // 正在挂载
      app.status = MOUNTING
      // 挂载
      await app.mount(app.customProps)
      // 挂载完成
      app.status = MOUNTED
    }
  }
}

/**
 * 卸载应用
 * @param {*} app 
 */
async function toUnmount (app) {
  if (app.status !== 'MOUNTED') return app
  // 更新状态为正在卸载
  app.status = MOUNTING
  // 执行卸载
  await app.unmount(app.customProps)
  // 卸载完成
  app.status = NOT_MOUNTED
  return app
}

/**
 * 加载子应用
 * @param {*} app 
 */
async function toLoad (app) {
  if (app.status !== NOT_LOADED) return app
  // 更改状态为正在加载
  app.status = LOADING_SOURCE_CODE
  // 加载 app
  const res = await app.app()
  // 加载完成
  app.status = NOT_BOOTSTRAPPED
  // 将子应用导出的生命周期函数挂载到 app 对象上
  app.bootstrap = res.bootstrap
  app.mount = res.mount
  app.unmount = res.unmount
  app.unload = res.unload
  // 加载完以后执行 reroute 尝试挂载
  reroute()
  return app
}

/**
 * 将所有的子应用分为三大类，待加载、待挂载、待卸载
 */
function getAppChanges () {
  const appsToLoad = [],
    appsToMount = [],
    appsToUnmount = []
  
  apps.forEach(app => {
    switch (app.status) {
      // 待加载
      case NOT_LOADED:
        appsToLoad.push(app)
        break
      // 初始化 + 挂载
      case NOT_BOOTSTRAPPED:
      case NOT_MOUNTED:
        if (shouldBeActive(app)) {
          appsToMount.push(app)
        } 
        break
      // 待卸载
      case MOUNTED:
        if (!shouldBeActive(app)) {
          appsToUnmount.push(app)
        }
        break
    }
  })
  return { appsToLoad, appsToMount, appsToUnmount }
}

/**
 * 应用需要激活吗 ？
 * @param {*} app 
 * return true or false
 */
function shouldBeActive (app) {
  try {
    return app.activeWhen(window.location)
  } catch (err) {
    console.error('shouldBeActive function error', err);
    return false
  }
}

// 让子应用判断自己是否运行在基座应用中
window.singleSpaNavigate = true
// 监听路由
window.addEventListener('hashchange', reroute)
window.history.pushState = patchedUpdateState(window.history.pushState)
window.history.replaceState = patchedUpdateState(window.history.replaceState)
/**
 * 装饰器，增强 pushState 和 replaceState 方法
 * @param {*} updateState 
 */
function patchedUpdateState (updateState) {
  return function (...args) {
    // 当前url
    const urlBefore = window.location.href;
    // pushState or replaceState 的执行结果
    const result = Reflect.apply(updateState, this, args)
    // 执行updateState之后的url
    const urlAfter = window.location.href
    if (urlBefore !== urlAfter) {
      reroute()
    }
    return result
  }
}