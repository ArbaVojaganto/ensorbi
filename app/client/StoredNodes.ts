
import type { NodeDictionary } from "./../models/Node.ts"
import { Node } from "./../models/Node.ts"
import {
  GetRequest,
  PutRequest,
} from "./../client/util.ts"
import { Graph, GraphNode, v4 } from "./../client/deps.ts"
import {
  isNull,
  metaResourcePath,
} from "./../common/util.ts";



export class StoredNodes {
  // ノード辞書
  private dict: NodeDictionary = {}
  private onRegister = (): void => {}
  constructor() {
  }

  /**
   * tagHashDictはtitleが一意なことを保証する(したい)、あとdatalistに使う都合上、keyをtitleにおきかえる
   */
  tagHashDict = (): NodeDictionary => {
    return Object.fromEntries(
      Object.entries(this.dict).filter(([key, value]) => value.type == "TagMeta")
        .map(([key, value]) => [value.title, value]),
    );
  };

  blobHashDict = (): NodeDictionary => {
    return Object.fromEntries(
      Object.entries(this.dict).filter(([key, value]) => value.type == "BlobMeta"),
    );
  };

  /**
   * 指定hashのノードを取得する
   */
  public fetch = async (hash: string): Promise<Node | undefined> => {
    if (!this.dict[hash]) {
      const updateNodes = await this.remoteGet(hash)
      // キャッシュ
      updateNodes.forEach( e => this.cache(e))
    }
    return this.dict[hash];
  }

  public update = async (node: Node, optionFormData: FormData): Promise<Node[]> => {
    if (JSON.stringify(node) != JSON.stringify(this.dict[node.hash])) {
      // 差分が発生したのでPUTリクエストを送信する
      const updateNodes = await this.remotePut(node, optionFormData)
      // キャッシュ
      updateNodes.forEach( e => this.cache(e))
      //return Object.fromEntries(updateNodes.map(e => [e.hash, e]))
      return updateNodes
    } else {
      return []
    }
  }

  /**
   * formDataにnode情報をまぜて送信する
   * @param node 
   * @param formData 
   */
  private remotePut = async (
    node: Node,
    optionFormData: FormData
  ): Promise<Node[]> => {
    optionFormData.set("meta", JSON.stringify(node))
    console.log({...optionFormData})
    const response = await PutRequest(
      "/posts/" + node.hash,
      optionFormData,
    );

    if (isNull(response)) return []
    const json = await response.json()
    console.log(json);

    // レスポンスの連想配列からノード集合以外をとりのぞく
    const nodes = Object.values(json).filter(( node ): node is Node => {
      const result = Node.validation(node)
      if (!result) throw new Error('バリデーション不能なjsonが混入しています')
      return result
    })
    return nodes
  }


  /**
   * 登録時に値の追加、更新が入った場合、PUTリクエストを送る
   * @param e 
   */
  private cache = (e: Node): void => { 
    this.dict[e.hash] = e
    this.onRegister()
  }

  /**
   * どこからリソースを取得するか、後から設定できるように
   * @param method 
   */
  setRemoteGetMethod = (
    method: (hash: string, force?: boolean) => Promise<Node[]>
    ) => {
    this.remoteGet = method
  }

  private remoteGet = async(
    hash: string,
    force = false,
  ): Promise<Node[]> =>  {
    const pathStruct = metaResourcePath(hash)
    const path = pathStruct.prefix + pathStruct.hashDir + pathStruct.hash + pathStruct.extention
    const response = await GetRequest(path);
    if (isNull(response)) return []
    const json = await response.json();
    console.log(json);

    if (Node.validation(json)) {
      console.log(`remoteGet: ${json}`)
      const nodeArray = [json]
      return nodeArray
    } else {
      console.warn("Nodeとして解釈できないものを取得しました")
      return []
    }

    // レスポンスの連想配列からノード集合以外をとりのぞく
    //const nodes = Object.values(json).filter(( node ): node is Node => {
    //  const result = Node.validation(node)
    //  if (!result) throw new Error('バリデーション不能なjsonが混入しています')
    //  return result
    //})

  }
}