
import { bufferToHash, todayString, isNull } from "./../common/util.ts"

export type NodeType = "BlobMeta" | "TagMeta" | "SymbolNode" | "MarkdownFolderMeta" | "TemporaryQuery";
export type EdgeDict = {
  [targetNodeUri: string]: NodeEdge
};
export type NodeEdge = { [label: string]: number }
export const EdgeIndex = (edge: NodeEdge) => edge.label + ":" + edge.targetUri
export interface NodeDictionary {
  [index: string]: Node;
}

/**
 * namespaceの管理
 * - ファイルパス集合: 存在するファイルパスのみ
 *  - ex. /h/ho/hog/hogefuga
 * - ノード集合: 描画されるもの 範囲としてはファイルパス集合+各ファイルパス集合からのびるエッジの先の仮想ノード
 *  - ex. 'ensorbi:/h/ho/hog/hogefuga' ,  'https://github.com/index.html'
 *  - `scheme`:`uri`
 * - エッジ集合: 各ファイルパス集合からのびるエッジの集合
 *  - `label`:`scheme`:`uri`
 */

export abstract class Node {
  // ノードタイプ
  abstract type: NodeType
  // 被参照情報の格納
  public referers: EdgeDict = {}
  constructor(
    // SHA256のハッシュ値
    public hash: string,
    // スクリーンネーム
    public title: string,
    // 作成日
    public createdAt: string,
    // base64でデコードされたサムネイル
    public thumbnail: string,
    // 1行程度でノードについての説明
    public description: string,
    // ノードのベクトル情報
    public vector: EdgeDict,
    // リモートリソースへの参照
    // 主な意図としては管理外のローカルリソースへの参照パスやblobのオリジナルが存在するURL等
    public remoteUri: string,
    
  ) {
    console.log("create node instance:" + hash);
    const allhash = bufferToHash("node")
    vector[allhash] = vector[allhash] ?? {tag: 1}
    const today = todayString()
    console.log(today)
    if (!isNull(today)) {
      const todayHash = bufferToHash(today)
      vector[todayHash] = vector[todayHash] ?? {tag: 1}
    }

  }

  /**
   * バリデーションできなかったら例外なげるぐらいはしたい
   * @param meta 
   */
  public static validation = (meta: any): meta is Node => {
    if (isNull(meta)) return false
    if (isNull(meta.hash)) return false
    if (isNull(meta.title)) return false
    if (isNull(meta.createdAt)) return false
    if (isNull(meta.thumbnail)) return false
    if (isNull(meta.description)) return false
    if (isNull(meta.vector)) return false
    if (isNull(meta.referers)) return false
    if (isNull(meta.remoteUri)) return false
    return true
  };
}

  /**
   * 指定ノードの参照と被参照をまとめたうえで自分へのリンクを抜いたリストを取得する。
   * @param target 
   */
  export const GetNodeEdges = (target: Node): [string, NodeEdge][] => {
    const ret = {...target.vector, ...target.referers}
    delete ret[target.hash]
    return Object.entries(ret)
  }
