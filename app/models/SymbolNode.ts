
import { NodeType, Node, EdgeDict } from "./Node.ts"
import { bufferToHash,  } from "./../common/util.ts"

/**
 * Node representing "tag" metadata
 */
export class SymbolNode extends Node {
  public type: NodeType = 'SymbolNode' as const
  constructor(
    hash: string,
    title: string,
    createdAt: string,
    thumbnail: string,
    description: string,
    vector: EdgeDict,
    remoteUri: string,
  ) {
    super(hash, title, createdAt, thumbnail, description, vector, remoteUri)

    // 毎回一致しないであろう文字列を生成
    const unixtime = new Date().getTime().toString() 
    const randomText = Math.random().toString(32).substring(2)
    const blob = new TextEncoder().encode(unixtime+randomText) 

    this.hash = bufferToHash(blob)
    this.createdAt = new Date().toISOString()
  }

  public static validation = (meta: any): meta is SymbolNode => {
    if (meta.type != "SymbolNode") return false
    if (!Node.validation(meta)) return false
    return true
  }

}

