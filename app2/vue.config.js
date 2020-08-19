const package = require('./package.json')
module.exports = {
  // 告诉子应用在这个地址加载静态资源，否则会去基座应用的域名下加载
  publicPath: '//localhost:8082',
  // 开发服务器
  devServer: {
    port: 8082
  },
  configureWebpack: {
    // 导出umd格式的包，在全局对象上挂载属性package.name，基座应用需要通过这个全局对象获取一些信息，比如子应用导出的生命周期函数
    output: {
      // library的值在所有子应用中需要唯一
      library: package.name,
      libraryTarget: 'umd'
    }
  }
}