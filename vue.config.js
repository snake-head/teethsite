/*
 * @Description: 
 * @Version: 1.0
 * @Autor: ZhuYichen
 * @Date: 2022-09-27 11:03:07
 * @LastEditors: ZhuYichen
 * @LastEditTime: 2024-01-26 21:14:11
 */
module.exports = {
    lintOnSave: false, // 关闭语法检查
    productionSourceMap: false, // 打包关闭源映射
    devServer: {
        port: 4000,
        open: true,
        hot: true,
        // proxy: {
        //     '/teethAPI2.0':{
        //         target: 'https://api.digi-ortho.com:8443',
        //     },
        //     '/data/teeth': {
        //         target: 'https://api.digi-ortho.com:8443',
        //     },
        //     '/api/BracketTypeFileServlet': {
        //         target: 'https://api.digi-ortho.com:8443',
        //     },
        // }
    },

    // configureWebpack: {
    //     module: {
    //         rules: [
    //             {
    //                 test: /\.worker.js$/,
    //                 use: [
    //                     {
    //                         loader: "worker-loader",
    //                     },
    //                     {
    //                         loader: "babel-loader",
    //                         options: {
    //                             presets: ["@babel/preset-env"],
    //                         },
    //                     },
    //                 ],
    //             },
    //         ],
    //     },
    // },
    chainWebpack: (config) => {
        config.module
            .rule("worker")
            .test(/\.worker\.js$/)
            .use("worker-loader")
            .loader("worker-loader")
            .options({
                inline: "fallback",
            })
            .end();
        config.module.rule("js").exclude.add(/\.worker\.js$/);
    },
    // chainWebpack: config => {
    //     // 配置
    //     config.module
    //         .rule('worker')
    //         .test(/\.worker\.js$/)
    //         .use('worker')
    //         .loader('worker-loader')
    //         .options({
    //             inline: 'fallback'
    //         })
    //     // 解决 "window is undefined", 这是因为 worker 线程中不存在 window 对象, 要用 this 代替: (不过我的项目中配置了这个也不行, 用的 self 代替, 后面介绍)
    //     config.output.globalObject('this')
    // },
    // 解决打包的时报错: (由于一些原因我的项目最后没有使用 worker, 也就没有研究打包遇到的问题...)
    parallel: false,

    outputDir: "teeth3d.dev",
    publicPath: "/teeth3d.dev/",
};