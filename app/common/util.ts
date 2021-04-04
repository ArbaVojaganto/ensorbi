import { Sha256 } from "./deps.ts";
import type { Message } from "./deps.ts"
import { NodeEdge } from "../models/Node.ts";


/**
 * create <Array> from "startNumber to end Number")
 * @param start startNumber
 * @param end endNumber(inclued)
 */
export const Range = (start: number, end: number) => {
  return Array.from({ length: (end - start + 1) }, (v, k) => k + start);
};

/**
 * get a random integer number value in the specified range
 * @param begin range start value (include)
 * @param end range end value (exclude)
 */
export const RangeRandom = (begin: number, end: number): number => {
  return Math.floor(Math.random() * (end - begin) + begin)
};

/**
 * type gurde of null or undefined
 * @param value 
 */
export const isNull = (value: any): value is null | undefined => {
  return (value == null || value == undefined);
};

/**
 * filepath split to filename and extention
 * @param filepath
 */
export const splitFileName = (filepath: string): { name: string, extention: string | undefined} =>
  ((arr) => {
    return { name: arr[0], extention: arr[1] };
  })(filepath.split(/(?=\.[^.]+$)/));

/**
 * sha-256でハッシュ値を取る
 * @param hashable 
 */
export const bufferToHash = (
  hashable: string | number[] | ArrayBuffer,
): string => {
  const message: Message = hashable;
  const sha256: Sha256 = new Sha256();
  sha256.update(message);
  return sha256.hex();
};

export const relHashPath = (hash: string, num: number): string => {
  const A = Array.from(Array(num), (v, k) => k);
  return A.map<string>((i) => hash.substring(0, i + 1)).join("/");
};

/**
 * 
 * @param uri ${schema}:${identifier}
 */
export const UriToHash = (uri: string): string => {
  return uri.replace(/^[a-z]*:/, "")
}

export const HashToUri = (hash:string): string => {
  return `ensorbi:${hash}`
}

/**
 * TagMetaへのVectorを取得する
 */
export const getVectorTagMeta = (): {key: string, value: NodeEdge} => {
  const hash = bufferToHash("tag")
  return {key: hash, value:{ tag: 1} }
}

export const hashToRemoteResourcePath = (hash: string) => {
  // とりあえず決めうちしておこう...
  return `${relHashPath(hash, 3)}/`
}

export const orgmodeResourcePath = (hash: string) => {
  return { prefix: "storage/org/", hashDir: hashToRemoteResourcePath(hash), hash: hash, extention: ".org" }
}

export const blobResourcePath = (hash: string) => {
  return { prefix: "storage/blob/", hashDir: hashToRemoteResourcePath(hash), hash: hash }
}

export const metaResourcePath = (hash: string) => {
  return { prefix: "storage/meta/", hashDir: hashToRemoteResourcePath(hash), hash: hash, extention: ".json" }
}

export const todayString = () => {
  return new RegExp("^[0-9]+-[0-9]+-[0-9]+").exec(new Date().toISOString())?.[0]
}


//export class GlueMeta extends Node {}
