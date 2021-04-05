
import type { NodeEdge as Edge, EdgeDict, NodeDictionary, NodeType } from "./../models/Node.ts"
import { Node } from "./../models/Node.ts"


export type ForceNode = {
  movable: boolean,
  nodeHash: string,
  title: string,
  thumbnail: string,
  vx: number,
  vy: number,
  x: number,
  y: number,
  links: EdgeDict,
  referers: EdgeDict,
}
export type ForceGarphNodeDict = {
  [nodeHash: string]: ForceNode
}

/**
 * 指定ノード集合の座標を力学計算によって更新し、更新後のノード集合を返す
 * 引数の値はimmutableに扱う
 * 返り値をまたすぐこの関数にそのままぶちこめるように、差分ではなく差分適応後の座標をリンク情報つきでかえす
 */
export const ForceGraphUpdate = (nodes: ForceGarphNodeDict, height: number, width: number): ForceGarphNodeDict => {
  const BOUNCE = 0.05
  const COULOMB = 600
  const ATTENUATION = 0.7


  // 全てのノードを列挙
  const ret = Object.entries(nodes)
    .map( ([key, target]):[string, ForceNode] => {
      let vx = 0
      let vy = 0

      if (target.movable) {

        let fx = 0
        let fy = 0

        // 全てのノードから受ける力を計算
        Object.entries(nodes).forEach( ([edgeTargetUri, n]) => {
          if (key != edgeTargetUri) {
            const distX = target.x - n.x
            const distY = target.y - n.y
            const rsq = distX * distX + distY * distY

            fx += COULOMB * distX/rsq
            fy += COULOMB * distY/rsq
          }
        })


        // つながってるノードから受ける力を計算
        // 参照と被参照を中心ノードからのエッジを一旦連想配列にまとめる
        const merged = {...target.links, ... target.referers};

        Object.entries(merged)
          .forEach( ([targetUri, edgeInfo]) => {

            // 自分へのエッジは無視する
            if (target.nodeHash != targetUri) {

              const n = nodes[targetUri]
              if (n) {
                // 対象ノードへのラベルの数だけまわす
                Object.entries(edgeInfo).forEach( ([hash, weight]) => {
                  const distX = n.x - target.x
                  const distY = n.y - target.y

                  fx += BOUNCE * distX
                  fy += BOUNCE * distY
                })
              }
            }
        })

        // 減衰速度を計算する
        vx = (target.vx + fx) * ATTENUATION
        vy = (target.vy + fy) * ATTENUATION
      }

      // canvasの端を考慮して移動量を反射させる
      //if (target.x + vx <= 0) { vx = -vx }
      //if (width <= target.x + vx ) { vx = -vx }
      //if (target.y + vy <= 0) { vy = -vy }
      //if (height <= target.y + vy) { vy = -vy }

      // 座標更新したノード情報を返す
      return [key, {
          movable: target.movable,
          nodeHash: target.nodeHash,
          title: target.title,
          thumbnail: target.thumbnail,
          vx: vx,
          vy: vy,
          x: target.x + vx,
          y: target.y + vy,
          links: target.links,
          referers: target.referers,
        }]
  })

  // 更新を適応したあたらしいグラフインスタンスを生成する
  return Object.fromEntries(ret)
}

/**
 * ノードをグラフで使用するノードインスタンスに変換する
 * @param node 
 */
export const NodeToForceNode = (node: Node) => {
  const ret = {
    movable: true,
    nodeHash: node.hash,
    title: node.title,
    thumbnail: node.thumbnail,
    vx: 0,
    vy: 0,
    x: 0,
    y: 0,
    links: node.vector,
    referers: node.referers
  }
  return ret
}