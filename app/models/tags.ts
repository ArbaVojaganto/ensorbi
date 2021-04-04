
import { NodeType, Node, EdgeDict } from "./Node.ts"
import { bufferToHash,  } from "./../common/util.ts"

/**
 * Node representing "tag" metadata
 */
export class TagMeta extends Node {
  public type: NodeType = 'TagMeta' as const
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

    // タグ文字列からblob生成
    const blob = new TextEncoder().encode(title) 
    // hash値を格納
    this.hash = bufferToHash(blob)

    // tag宛の参照を追加
    const allhash = bufferToHash("tag")
    vector[allhash] = vector[allhash] ?? {tag: 1}
  }

  public static validation = (meta: any): meta is TagMeta => {
    if (meta.type != "TagMeta") return false
    if (!Node.validation(meta)) return false
    return true
  }
}

