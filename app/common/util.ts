import { NodeEdge } from "../models/Node.ts";
import { createHash } from "https://deno.land/std@0.110.0/node/crypto.ts";

import { is } from "https://deno.land/x/unknownutil@v3.17.0/mod.ts";


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
  hashable: string | ArrayBuffer,
): string => {
  // エンコードを指定しているのでdigestの返り値は必ずstringになる
  // @todo できればbufferで返したいが...
  return createHash("sha256").update(hashable).digest("hex") as string;
  //if ( typeof (hashable) == "string") {
  //  const messageBuffer = new TextEncoder().encode(hashable);
  //  const hashBuffer = await crypto.subtle.digest("SHA-256", messageBuffer);
  //  const hash = encodeHex(hashBuffer);
  //  return hash
  //} else if (Array.isArray(hashable)) {
  //  throw("bufferToHash(hashable: number[])は未実装です")
  //  //return "";
  //} else {
  //  const hashBuffer = await crypto.subtle.digest("SHA-256", hashable);
  //  const hash = encodeHex(hashBuffer);
  //  return hash
  //}
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

export const markdownResourcePath = (hash: string) => {
  return { prefix: "storage/md/", hashDir: hashToRemoteResourcePath(hash), hash: hash, extention: ".md" }
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

/**
 * T | T[] からTを取得する
 * @param arrayOrSingle 
 * @returns single
 */
export const getSingleOrArrayFirst = <T>(arrayOrSingle: T | T[]): T => {
  if ( is.Array(arrayOrSingle) ) {
    if ( 1 <= arrayOrSingle.length ) {
      const single = arrayOrSingle[0]
      return single
    } else {
        throw("getSingleOrArrayFirst: 配列の中身が0です")
    }
  } else {
    return arrayOrSingle
  }
}

//export class GlueMeta extends Node {}
