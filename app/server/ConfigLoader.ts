
import { relHashPath } from "./../common/util.ts"

const config = JSON.parse(Deno.readTextFileSync('app/config.json'))

// きちんとvalidationしたいね。
// デフォルト値の設定をプログラム側で行わず、強制終了させたい
export const serverConfig: { port: number, hostname: string } = {
    port: (typeof (config.server.port) == "number") ? config.server.port: 8090,
    hostname: (typeof (config.server.hostname) == "string") ? config.server.ip: "localhost"
}

export const loadConfig: {
    storagePrefixPath: string, 
    storageBlobPath: string, 
    storageMetaPath: string, 
    storageDepth: number} = {

    storagePrefixPath: (typeof (config.storagePrefixPath) == "string") ? config.storagePrefixPath : "./storage",
    storageBlobPath: (typeof (config.storageBlobPath) == "string") ? config.storageBlobPath : "blob",
    storageMetaPath: (typeof (config.storageMetaPath) == "string") ? config.storageMetaPath : "meta",
    storageDepth: (typeof (config.storageDepth) == "number") ? Number(config.storageDepth) : 3,
}

export const hashPath = (hash: string) => relHashPath(hash, loadConfig.storageDepth) + "/"
export const metaPath = () => loadConfig.storagePrefixPath + "/" + loadConfig.storageMetaPath + "/"
export const blobPath = () => loadConfig.storagePrefixPath + "/" + loadConfig.storageBlobPath + "/"

