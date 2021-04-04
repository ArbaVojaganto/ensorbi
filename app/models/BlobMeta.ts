
import { isNull, bufferToHash } from "../common/util.ts"
import { NodeType, Node, EdgeDict} from "../models/Node.ts"

/**
 * Node representing "static blob" metadata
 */
export class BlobMeta extends Node {
  public type:NodeType = "BlobMeta" as const
  constructor(
    hash: string,
    title: string,
    public extention: string,
    createdAt: string,
    thumbnail: string,
    description: string,
    vector: EdgeDict,
    public mimeType: string,
    remoteUri: string,
  )
  {
    super(hash, title, createdAt, thumbnail, description, vector, remoteUri)
    const allhash = bufferToHash("blob")
    vector[allhash] = vector[allhash] ?? {tag: 1}
  }


  public static validation = (meta: any): meta is BlobMeta => {
    if (meta.type != "BlobMeta") return false
    if (isNull(meta.extention)) return false
    if (isNull(meta.mimeType)) return false
    if (!Node.validation(meta)) return false
    return true
  }

}

