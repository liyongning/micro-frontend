import Vue from 'vue'
import App from './App.vue'
import router from './router'
// import { registerApplication, start } from 'single-spa'
import { registerApplication, start } from '../../lyn-single-spa'

Vue.config.productionTip = false

// 远程加载子应用
function createScript(url) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = url
    script.onload = resolve
    script.onerror = reject
    const firstScript = document.getElementsByTagName('script')[0]
    firstScript.parentNode.insertBefore(script, firstScript)
  })
}

// 记载函数，返回一个 promise
function loadApp(url, globalVar) {
  // 支持远程加载子应用
  return async () => {
    await createScript(url + '/js/chunk-vendors.js')
    await createScript(url + '/js/app.js')
    // 这里的return很重要，需要从这个全局对象中拿到子应用暴露出来的生命周期函数
    return window[globalVar]
  }
}

// 子应用列表
const apps = [
  {
    // 子应用名称
    name: 'app1',
    // 子应用加载函数，是一个promise
    app: loadApp('http://localhost:8081', 'app1'),
    // 当路由满足条件时（返回true），激活（挂载）子应用
    activeWhen: location => location.pathname.startsWith('/app1'),
    // 传递给子应用的对象
    customProps: {}
  },
  {
    name: 'app2',
    app: loadApp('http://localhost:8082', 'app2'),
    activeWhen: location => location.pathname.startsWith('/app2'),
    customProps: {}
  },
  {
    // 子应用名称
    name: 'app3',
    // 子应用加载函数，是一个promise
    app: loadApp('http://localhost:3000', 'app3'),
    // 当路由满足条件时（返回true），激活（挂载）子应用
    activeWhen: location => location.pathname.startsWith('/app3'),
    // 传递给子应用的对象，这个很重要，该配置告诉react子应用自己的容器元素是什么，这块儿和vue子应用的集成不一样，官网并没有说这部分，或者我没找到，是通过看single-spa-react源码知道的
    customProps: {
      domElement: document.getElementById('microApp'),
      // 添加 name 属性是为了兼容自己写的lyn-single-spa，原生的不需要，当然加了也不影响
      name: 'app3'
    }
  }
]

// 注册子应用
for (let i = apps.length - 1; i >= 0; i--) {
  registerApplication(apps[i])
}

new Vue({
  router,
  mounted() {
    // 启动
    start()
  },
  render: h => h(App)
}).$mount('#app')
