

import { Node, GetNodeEdges } from "../models/Node.ts"
import { Graph, GraphNode} from "./deps.ts"
import {
  isNull,
  RangeRandom,
} from "../common/util.ts";

import { CanvasManager } from "./CanvasManager.ts"
import { ForceGraphUpdate, NodeToForceNode } from "./ForceGraphSimulation.ts"
import type { ForceGarphNodeDict } from "./ForceGraphSimulation.ts"
import type { ScopeGraph } from "./ScopeGraphManager.ts";
import { TemporaryQueryNode } from "../models/TemporaryQueryNode.ts";



export class TemporaryQueryScopeGraph implements ScopeGraph {
  private graphNodes: {[hash: string]: GraphNode} = {}
  private nodes: ForceGarphNodeDict = {}
  private graph: Graph | undefined
  private graphId: number = -1
  // グラフの構築中か
  private isRebuilding: boolean = false
  // 前回のグラフ計算が終わっていなければアップデートを飛ばすためのフラグ
  private updataing: boolean = false

  /**
   * 依存はコンストラクタだけで完了させる
   * @param target 
   * @param fetchNode 
   * @param canvasManager 
   * @param onNodeSelectedOfView 
   */
  constructor (
    private queryNode: TemporaryQueryNode,
    private queryResultNode: Node[],
    private fetchNode = async (uri: string): Promise<Node | undefined> => { return undefined },
    private canvasManager: CanvasManager,
    private onNodeSelectedOfView: (node: Node) => void,
    private nextGraphRender: (hash: string) => void
  ){

    //if (target.hash != "545ea538461003efdc8c81c244531b003f6f26cfccf6c0073b3239fdedf49446") {
      this.nodes[queryNode.hash] = NodeToForceNode(queryNode)
      if (canvasManager.graphCanvas) {
        this.nodes[queryNode.hash].x = canvasManager.graphCanvas.width/2
        this.nodes[queryNode.hash].y = canvasManager.graphCanvas.height/2
      }
    //}
  }


  /**
   * このクラス内で発生したイベントの登録等を開放する
   */
  public removeDependancy = () => {
    if (isNull(this.graph)) { return }

    this.canvasManager.removeEventListner('mousemove', this.graph.pointing_check)
    this.canvasManager.removeEventListner('mousedown', this.graph.drag_start)
    this.canvasManager.removeEventListner('mouseup', this.graph.drag_end)
    this.canvasManager.removeEventListner('dblclick', this.graph.doubleClick)
  }

  /**
   * コンストラクタで入力された情報から初期化
   */
  public reset = async () => {
    const tempNodeDict: ForceGarphNodeDict = {}

    const criteria = NodeToForceNode(this.queryNode)
    criteria.movable = false
    tempNodeDict[this.queryNode.hash] = criteria

    // とりあえず一周分のノードを取得
    this.queryResultNode.forEach ( e => {
      tempNodeDict[e.hash] = NodeToForceNode(e)
    })

    if (this.canvasManager) {
      if (this.graph) {
        // 既にグラフインスタンスがある
      } else {
        // グラフインスタンスを新規作成する
        this.graph = new Graph(
          this.canvasManager.id(), 
          30, 
          true, 
          false, 
          null, 
          this.activateNodeCallback, 
          this.deActivateNodeCallback,
          this.doubleClickedNodeCallback,
        )

        this.graphId = this.graph.id
        this.canvasManager.addEventListner('mousemove', this.graph.pointing_check)
        this.canvasManager.addEventListner('mousedown', this.graph.drag_start)
        this.canvasManager.addEventListner('mouseup', this.graph.drag_end)
        this.canvasManager.addEventListner('dblclick', this.graph.doubleClick)
      }
      this.rebuildGraph(this.queryNode, this.nodes, tempNodeDict)
    }
  }

  /**
   * レンダリングされたグラフでノードに対して干渉があった時のイベント
   */
  private activateNodeCallback = async ( deactivateNode: GraphNode | null | undefined, activateNode: GraphNode ) => {
    // activateNodeといいつつ、ハッシュをわりあてていないエッジからの情報も来る可能性があるので弾く、
    if ( isNull(activateNode.hash) ) {
      return
    }

    if ( this.queryNode.hash == activateNode.hash) {
      // テンポラリはサーバー問い合わせしない 
      this.onNodeSelectedOfView(this.queryNode)
    } else {
      // テンポラリ以外はとりなおす
      const node = await this.fetchNode(activateNode.hash)
      if (node) {
        this.onNodeSelectedOfView(node)
      }
    }

  }

  private deActivateNodeCallback = (deactivateNode: GraphNode ) => {
  }


  private doubleClickedNodeCallback = (node: GraphNode) => {
    this.nextGraphRender(node.hash)
  }

  public reload = async () => {
    //const relaodedTarget = await this.fetchNode(this.target.hash) 
    //if (relaodedTarget) this.query = relaodedTarget
    await this.reset()
  }

  public graphUpdateTimer = 0

  public update = () => {
    if (this.isRebuilding) return
    if (this.updataing) {
      console.warn("前回のグラフアップデートが許容時間内に終了していないっぽい")
      return
    }
    this.updataing = true
    this.ToStableGraph()
    this.updataing = false
  }

  /**
   * 描画
   */
  public draw = () => {
    if (this.graph) {
      (this.graph as any).draw()
    }
  }


  /**
   * グラフ配置更新
   */
  ToStableGraph = () => {
    // 現在座標を取得
    Object.entries(this.graphNodes).forEach( ([hash, graphNode]) => {
      this.nodes[hash].x = graphNode.x
      this.nodes[hash].y = graphNode.y
    })
    // 計算
    this.nodes = ForceGraphUpdate(this.nodes, this.canvasManager.height(), this.canvasManager.width())
    // 描画ノードに反映させる
    Object.entries(this.nodes).forEach( ([hash, node]) => {
      this.graphNodes[hash].x = node.x
      this.graphNodes[hash].y = node.y
    })
  }


  /**
   * このスコープのグラフ描画データを再構築する
   * インスタンスのもっているnodesグラフ情報を元に座標だけ引き継がせる
   * 強制的にさせたい場合はbeforeNodesに空の連想配列を指定する
   * @param nodes 
   */
  rebuildGraph = (queryNode: Node, beforeNodeDict: ForceGarphNodeDict, nodes: ForceGarphNodeDict) => {
    if (isNull(this.graph)) return
    this.isRebuilding = true

    // グラフ初期化
    Graph.Clear(this.graphId)
    this.graphNodes = {}

    const graph = this.graph

    // ノードを配置
    Object.values(nodes).forEach (forceNode => {
      if (beforeNodeDict[forceNode.nodeHash]) {
        // 以前も存在していれば座標をひきつぐ
        forceNode.x = beforeNodeDict[forceNode.nodeHash].x
        forceNode.y = beforeNodeDict[forceNode.nodeHash].y
      } else {
        forceNode.x = RangeRandom(0, this.canvasManager.width())
        forceNode.y = RangeRandom(0, this.canvasManager.height())
      }

      const graphNode = graph.node(forceNode.x, forceNode.y, 40, "", forceNode.nodeHash)
      console.log(`make node ${forceNode.title}`)

      if (isNull(graphNode)) return undefined
      if (forceNode.thumbnail != "") {
        graphNode.setImage(forceNode.thumbnail)
      } else {
        graphNode.setText(forceNode.title)
      }
      this.graphNodes[forceNode.nodeHash] = graphNode 
      
      // ノードのリンク情報を一旦消す
      nodes[forceNode.nodeHash].vector = {}
      nodes[forceNode.nodeHash].referers = {}
    })


    // エッジを張る
    Object.values(nodes).forEach( forceNode => {
      //Object.entries(forceNode.vector).forEach( ([key, edge]) => {
      //  const target = nodes[key]

      //  // スコープ内にエッジの先のノードが存在すればエッジを張る
      //  if (!isNull(target) && this.graphNodes[target.nodeHash] && forceNode.nodeHash != target.nodeHash) {
      //    const t = target
      //    console.log(`make edge ${forceNode.title} -> ${t.title}`)
      //    Object.entries(edge).forEach( ([label, weight]) => {
      //      //this.graphNodes[forceNode.nodeHash].biDirectional(this.graphNodes[t.nodeHash], label)
      //      this.graphNodes[forceNode.nodeHash].biDirectional(this.graphNodes[t.nodeHash], "")
      //    })
      //  }
      //})

      // クエリノードとそれ以外のノードでリンクをはる
      if ( queryNode.hash != forceNode.nodeHash ) {
        this.graphNodes[queryNode.hash].biDirectional(this.graphNodes[forceNode.nodeHash], "")
        // クエリノードから各ノードに参照をとばす
        nodes[queryNode.hash].vector[forceNode.nodeHash] = {queryResult: 1}
        nodes[forceNode.nodeHash].vector[queryNode.hash] = {queryRequest: 1}
      }

    })

    // 更新後のグラフを設定する
    this.nodes = nodes
    this.isRebuilding = false
  }
}