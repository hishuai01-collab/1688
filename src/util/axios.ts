import axios, { AxiosResponse } from "axios";

// 从环境变量读取代理配置，支持 HTTP_PROXY / HTTPS_PROXY / NO_PROXY
const httpProxy = process.env.HTTP_PROXY || process.env.http_proxy || "";
const httpsProxy = process.env.HTTPS_PROXY || process.env.https_proxy || "";
const noProxy = process.env.NO_PROXY || process.env.no_proxy || "";

function getProxyForUrl(url: string): string | null {
  // NO_PROXY 匹配
  if (noProxy) {
    const hosts = noProxy.split(",").map((h) => h.trim());
    const parsed = new URL(url);
    if (hosts.includes(parsed.hostname) || hosts.includes("*")) {
      return null;
    }
  }

  if (url.startsWith("https")) {
    return httpsProxy || httpProxy || null;
  }
  return httpProxy || null;
}

export const axiosInstance = axios.create();

// 自动代理拦截器
axiosInstance.interceptors.request.use(async (config) => {
  const proxyUrl = getProxyForUrl(config.url || "");
  if (proxyUrl) {
    const isHttps = (config.url || "").startsWith("https");
    try {
      const { HttpsProxyAgent } = require("https-proxy-agent");
      const { HttpProxyAgent } = require("http-proxy-agent");
      config.httpAgent = isHttps ? new HttpsProxyAgent(proxyUrl) : new HttpProxyAgent(proxyUrl);
      config.httpsAgent = isHttps ? new HttpsProxyAgent(proxyUrl) : new HttpProxyAgent(proxyUrl);
    } catch (e) {
      // 如果代理 agent 库不可用，回退到 axios 内置代理
      const parsed = new URL(proxyUrl);
      config.proxy = {
        host: parsed.hostname,
        port: parseInt(parsed.port) || (parsed.protocol === "https:" ? 443 : 80),
        auth: parsed.username
          ? { username: parsed.username, password: parsed.password || "" }
          : undefined,
        protocol: parsed.protocol
      };
    }
  }
  return config;
});

export const getFeedData = async (
  url: string
): Promise<AxiosResponse<string>> => {
  const { data } = await axiosInstance.get(url);
  return data;
};
