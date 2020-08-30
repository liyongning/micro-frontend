import React from 'react';
import ReactDOM from 'react-dom';
import './index.css'
import { BrowserRouter, Link, Route } from 'react-router-dom'
import singleSpaReact from 'single-spa-react'

// 子应用独立运行
if (!window.singleSpaNavigate) {
  ReactDOM.render(rootComponent(), document.getElementById('root'))
}

// 生命周期a
const reactLifecycles = singleSpaReact({
  React,
  ReactDOM,
  rootComponent,
  errorBoundary(err, info, props) {
    return <div>
      This renders when a catastrophic error occurs
    </div>
  }
})

// 这里和vue不一样，props必须向下传递
export const bootstrap = async props => {
  console.log('app3 bootstrap');
  return reactLifecycles.bootstrap(props)
}
export const mount = async props => {
  console.log('app3 mount');
  return reactLifecycles.mount(props);
}
export const unmount = async props => {
  console.log('app3 unmount');
  return reactLifecycles.unmount(props)
}

// 根组件
function rootComponent() {
  return <React.StrictMode>
    <BrowserRouter>
      <div>
        <Link to="/app3">Home</Link> |
          <Link to="/app3/about"> About</Link>
        <Route exact path="/app3" component={Home} />
        <Route exact path="/app3/about" component={About} />
      </div>
    </BrowserRouter>
  </React.StrictMode>
}

// home 组件
function Home() {
  return <div>
    <h1>app3 home page</h1>
  </div>
}

// about 组件
function About() {
  return <div>
    <h1>app3 about page</h1>
  </div>
}