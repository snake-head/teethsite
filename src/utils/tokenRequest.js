import axios from "axios";
import CryptoJS from "crypto-js";

const TOKEN_HEADER_NAME = {
    TOKEN: "authorization",
    USER_ID: "authorid",
};
// 手动指定默认路径进行拼接, 不然在dataLoadAndParse.worker.js中会有问题
// globalThis兼容性不好?
axios.defaults.baseURL = globalThis.location.origin;

axios.interceptors.request.use((configs) => {
    generateTimeStampAndNonceAndSign(configs.headers.common);
    return configs;
});

function setTokenHeader(token) {
    if (token) {
        axios.defaults.headers.common[TOKEN_HEADER_NAME.TOKEN] = token;
    }
}
function setUserIdHeader(userId) {
    if (userId) {
        axios.defaults.headers.common[TOKEN_HEADER_NAME.USER_ID] = userId;
    }
}

/**
 * 生成每次发送请求必要的数据, 用于应对重放攻击, 直接写入config的headers中
 * @param token 令牌
 * @param userId 静态令牌专属
 * @param config 其它配置
 * @return {{ts: number, nonce: string, sign: string}}
 */
function generateTimeStampAndNonceAndSign(headers) {
    // 静态令牌验证: userId + token
    // 动态令牌验证: token
    // 登录: 什么都没有
    if (!headers || !Reflect.has(headers, TOKEN_HEADER_NAME.TOKEN)) {
        return;
    }
    // 获取当前时间戳(秒)
    const ts = new Date().getTime() / 1000; // 秒级时间戳
    headers.ts = ts;
    // 生成md5编码随机数
    const noncestr = (ts + Math.round(Math.random() * 1000)).toString();
    const nonce = CryptoJS.MD5(noncestr).toString();
    headers.nonce = nonce;
    // 生成签名
    const signstr = `token:${
        headers[TOKEN_HEADER_NAME.TOKEN]
    }&timestamp:${ts}&nonce:${nonce}`;
    const sign = CryptoJS.MD5(signstr).toString();
    headers.sign = sign;
}

/**
 * @description 使用令牌形式向指定接口发送get请求
 * @param api 接口地址
 * @param config 配置, config.headers中不应该有authorization,authorid,ts,nonce,sign项
 * @return {Promise<AxiosResponse<any>>}
 */
async function getRequestWithToken(api, config = null) {
    // 发送请求
    return await axios.get(api, config);
}

/**
 * @description 使用令牌形式向指定接口发送post请求
 * @param api 接口地址
 * @param data post数据
 * @param config 配置, config.headers中不应该有authorization,ts,nonce,sign项
 * @return {Promise<AxiosResponse<any>>}
 */
async function postRequestWithToken(api, data, config = null) {
    // 发送请求
    return await axios.post(api, data, config);
}

const sendRequestWithToken = (configs) => axios({ ...configs });

export {
    setTokenHeader,
    setUserIdHeader,
    getRequestWithToken,
    postRequestWithToken,
    sendRequestWithToken,
};
