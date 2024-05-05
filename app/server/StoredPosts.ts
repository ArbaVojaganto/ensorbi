import { BlobMeta } from "./../models/BlobMeta.ts"
import { TagMeta } from "./../models/tags.ts"
import {
  saveBlob,
  saveMeta,
} from "./util.ts"
import {
  isNull,
  todayString,
  orgmodeResourcePath,
  bufferToHash,
} from "./../common/util.ts"

import {
  hashPath,
  metaPath,
} from "./ConfigLoader.ts";
import { NodeDictionary, Node } from "./../models/Node.ts";

import { base64 } from './deps.ts'
import { resize } from './deps.ts'
import { ensureDir } from './deps.ts'


const createOrThroughOrgFile = async (node: Node) => {
  const orgPath = orgmodeResourcePath(node.hash)
  const path = orgPath.prefix+orgPath.hashDir+orgPath.hash+orgPath.extention
  console.log(path)
  try {
    await Deno.readTextFile(path)
  } catch(e) {
    await ensureDir(orgPath.prefix+orgPath.hashDir)
    await Deno.writeTextFile(path, `
#+TITLE:${node.title}
#+DATE:${node.createdAt}

* ${node.title}
${node.description}

    `)
  }
}


/**
 * 対象ディレクトリに存在するファイルパスを再帰的に取得する
 * @param dir 
 * @returns 
 */
const filenames = async (dir: string): Promise<string[]> => {
  const paths: string[] = []
  for await (const dirEntry of Deno.readDir(dir)) {
    if (dirEntry.isDirectory) {
      paths.push(...await filenames(dir + "/" + dirEntry.name))
    }
    //if (dirEntry.isFile) paths.push(dir + "/" + dirEntry.name)
    const splitFileName = (filename: string) =>
      ((arr) => {
        return { name: arr[0], extention: arr[1] }
      })(filename.split(/(?=\.[^.]+$)/))
    if (dirEntry.isFile) paths.push(splitFileName(dirEntry.name).name)
  }
  return paths;
}


/**
 * ActiveRecord like Dictionary. BackEnd is LocalDirectory Onkkkkly.
 */
export class StoredPosts {
  private dict: { [hash: string]: Node } = {};
  
  migrationMetaFile = async () => {
    try {

      const files = await filenames(metaPath());
      for await (const hash of files) {
        const path = metaPath() + hashPath(hash) + hash + ".json";
        try {
          const meta = await Deno.readTextFile(path);
          if (isNull(meta)) return undefined;
          const metaJson = JSON.parse(meta);
          if (isNull(metaJson.remoteUri)) {

            // jsonの内容をフィルター処理する
            metaJson.remoteUri = ""


          }
          console.log(`${path} を生成`)
          await posts.register(metaJson)
        } catch (e) {
          console.log(`${metaPath()} が存在しない気がする`)
          console.log(e)
        }
      }
    } catch (e) {
      console.log(`${metaPath()} が存在しない気がする`)
      console.log(e)
    }
    return posts
  }
  

  reconstructReferrers= async () => {

    // 辞書を初期化
    posts.clear()

    // 全てのファイルをインメモリに読み出す
    await posts.fetchAll()

    // 全てのノードの被参照をリセット
    for await (const node of posts.toArray()) {
      node.referers = {}
      await posts.register(node)
    }

    // エッジを再設定する
    for await (const node of posts.toArray()) {
      await posts.changeVectorTransaction(node)
    }

    console.log(`被参照の再構築を終了`)
  }

  /**
   * Metaファイル保存はこの処理を通しておこなうことにより、被参照が最新になっていることを保証する
   * あんまよくない気がするけどallへの参照はここで追加する
   * @param e 
   */
  async changeVectorTransaction(e: Node): Promise<NodeDictionary> {
    const modificationNodes: NodeDictionary = {}
    await this.register(e)
    modificationNodes[e.hash] = e

    // ここでやるのもへんだがここは作成更新時に絶対通るはずなので必要な処理はまとめておく
    // orgファイルがなければ作成する
    await createOrThroughOrgFile(e)
    console.log("test")


    // このトランザクションによって変更されるノードを全列挙
    for await ( const [to, edge] of Object.entries(e.vector)) {
        const hash = to
        let node = await this.load(hash, false)

        // ない場合日付ノードへの参照っぽければその場で作る
        if (isNull(node)) {
          const today = todayString()
          console.log(`${today} のmetaファイルを作りますね`)
          if (!isNull(today)) {
            const todayHash = bufferToHash(today)
            if (hash == todayHash) {
              await registerTagMeta( new TagMeta(todayHash, today, today, "", "", {}, ""))
              node = await this.load(hash)
              if (isNull(node)) {
                console.log("今日のノードが作成できなかった")
                console.log(`to: ${hash}`)
                console.log(`today: ${todayHash}`)
              }else {
                modificationNodes[node.hash] = node
              }

            } else {
              console.log("ハッシュが今日のハッシュと一致しない...")
              console.log(`to: ${hash}`)
              console.log(`today: ${todayHash}`)
            }

          } else {
            console.log("日付の正規表現が死んでる")
          }
          console.log("")
        }

        // 被参照の更新
        if (node) {
          //node.referers[HashToUri(e.hash)] = { referer: 1 }
          node.referers[e.hash] = { referer: 1 }
          await this.register(node)
          modificationNodes[node.hash] = node
        } else {
          console.log(`warning ノード: ${to} が読みこめませんでした。 ${edge}`)
        }
    }

    return modificationNodes
  }

  /**
   * load method
   * @param  {Node} e
   * @returns Boolean
   */
  async register(e: Node): Promise<Boolean> {
    // 該当blobとmetaがなければ生成してから登録する
    // あったら上書きかな
    this.dict[e.hash] = e;
    await saveMeta(this.dict[e.hash]);
    return true
  }

  public toArray(): Node[] {
    const n = Object.keys(this.dict).map((key) => this.dict[key]);
    return n
  }

  public toJsonTextArray(): string[]{
    const jsons = Object.keys(this.dict).map((key) => JSON.stringify(this.dict[key]));
    return jsons
  }
  

  public async load(
    hash: string,
    force = false,
  ): Promise<Node | undefined> {
    if (this.dict[hash] && !force) return this.dict[hash];
    const path = metaPath() + hashPath(hash) + hash + ".json";
    try {
      const meta = await Deno.readTextFile(path);
      if (isNull(meta)) return undefined;
      const metaJson = JSON.parse(meta);

      if (Node.validation(metaJson)) {
        this.dict[hash] = metaJson
        return metaJson
      } else {
        return undefined;
      }
    } catch (e) {
      console.log(`おそらくファイル:${hash} がローカルに存在しないよ`)
      console.log(e)
    }
  }

  /**
   * インメモリ辞書を初期化する
   */
  clear () {
    this.dict = {}
  }

  unload(hash: string): Boolean {
    delete this.dict[hash];
    // アンロードの場合はメモリから消すだけ
    return true;
  }
  remove(hash: string): Boolean {
    delete this.dict[hash];
    // removeの場合は永続化されたblobとmetaファイルも消す
    return true;
  }

  async fetch(hash: string): Promise<Node | undefined> {
    if (!this.dict[hash]) {
      await this.load(hash)
    }
    return this.dict[hash];
  }

  async fetchAll() {
    try {
      const files = await filenames(metaPath());
      for await (const hash of files) {
        await posts.load(hash);
      }
    } catch (e) {
      console.log(`${metaPath()} が存在しない気がする`)
      console.log(e)
    }
    return posts;
  }

  filter(evaluater: (e: Node) => {}): Node[] {
    return Object.values(this.dict).filter((e) => evaluater(e));
  }

}



// DBでの永続化はせずインメモリで管理
export const posts: StoredPosts = new StoredPosts();

// タグメタのblobは
export const registerTagMeta = async ( meta: TagMeta ): Promise<NodeDictionary| undefined> => {
  //if (!TagMeta.validation(meta)) return

  // タグ文字列からblob生成
  const blob = new TextEncoder().encode(meta.title) 
  //const id = v4.generate()
  // hash値生成
  const hash = bufferToHash(blob)
  meta.hash = hash
  meta.createdAt = new Date().toISOString()
  return await posts.changeVectorTransaction(meta)
}

  // リソースの新規登録
export const registerBlobMeta = async ( uint8array: Uint8Array, meta: BlobMeta ): Promise<NodeDictionary> => {
  // 片方でも未定義であれば処理しない
  if (!BlobMeta.validation(meta)) return {}

  if(isNull(uint8array)) return {}

  meta.hash = bufferToHash(uint8array)
  meta.createdAt = new Date().toISOString()

  // クライアント側でサムネイルが生成されていないっぽかったら生成を試みる
  if ( meta.thumbnail != "" && meta.extention == ".jpg" || meta.extention == ".png" || meta.extention == ".jpeg" ) {
    try {
      const resized = await resize( uint8array, {width: 100, height: 100})
      const b64 = base64.fromUint8Array(resized)
      const src: string = "data:" + meta.mimeType + ";base64," + b64
      meta.thumbnail = src
    } catch(e) {
      console.log("create thumbnail failed...")
      console.log(e)
    }
  }

  await saveBlob(meta.hash, meta.extention, uint8array)
  return await posts.changeVectorTransaction(meta)
  
}

export const updateBlobMeta = async ( meta: BlobMeta): Promise<NodeDictionary> => {
  return await posts.changeVectorTransaction(meta)
}