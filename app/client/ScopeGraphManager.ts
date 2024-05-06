
import type { NodeEdge as Edge, EdgeDict, NodeDictionary, NodeType } from "./../models/Node.ts"
import { Node, GetNodeEdges } from "./../models/Node.ts"
import { Graph, GraphNode, v4 } from "./../client/deps.ts"
import {
  isNull,
  RangeRandom,
} from "./../common/util.ts";

import { StoredNodes } from "./../client/StoredNodes.ts"
import { CanvasManager } from "./CanvasManager.ts"
import { ForceGraphUpdate, NodeToForceNode } from "./ForceGraphSimulation.ts"
import type { ForceGarphNodeDict, ForceNode } from "./ForceGraphSimulation.ts"
import { SingleNodeTargetScopeGraph } from "./SingleNodeTargetScopeGraph.ts";
import { TemporaryQueryScopeGraph } from "./TemporaryQueryScopeGraph.ts"
import { TemporaryQueryNode } from "../models/TemporaryQueryNode.ts";


export interface ScopeGraph {
  update :() => void
  reload :() => Promise<void>
  draw :() => void
  removeDependancy :() => void
}

class NoScopeGraph implements ScopeGraph {
  public init = () => {}
  public update = () => {}
  public reload = async () => {}
  public draw = () => {}
  public removeDependancy = () => {}
}

export class ScopeGraphManager {
  public bufferSize = 10
  // リングバッファにしたい
  public history: SingleNodeTargetScopeGraph[] = Array<SingleNodeTargetScopeGraph>()
  public historyIndex: number = -1
  // とりあえずなんもグラフを使わないスコープを初期スコープとしてもつ
  public currentScopeGraph: ScopeGraph = new NoScopeGraph()
  public fetchNode = async (hash: string): Promise<Node | undefined> => { return undefined}

  public canvasManager: CanvasManager | undefined
  public store: StoredNodes | undefined
  public onNodeSelectedOfView: (node: Node) => void  = () => {}


  constructor () {
  }


/**
   * 依存モジュールをつっこみなおす
   * @param canvas 
   * @param store 
   */
  public dependancyModuleInjection(canvas: CanvasManager, store: StoredNodes, onNodeSelectedOfView: (node: Node) => void) {
    this.canvasManager = canvas
    this.store = store
    this.onNodeSelectedOfView = onNodeSelectedOfView
  }

  public startTemporaryQueryGraph =  async(temporaryQueryNode: TemporaryQueryNode, renderingNodeSet: Node[]) => {
    if (isNull(this.canvasManager) || isNull(this.store) || isNull(this.onNodeSelectedOfView)) {
      console.warn("必要な依存が注入されていません")
      return false
    }

    this.canvasManager.removeAllEventListner()

    const scope = new TemporaryQueryScopeGraph(
      temporaryQueryNode,
      renderingNodeSet,
      this.store.fetch,
      this.canvasManager,
      this.onNodeSelectedOfView,
      this.restart
    )
    if (scope) {
      await scope.reset()
      this.pushScope(scope)
    }
    return true
  }

  // 将来的には宣言的な集合表現をビューに与えるといいかんじにレンダリングするようになってほしい
  public restart = async (hash: string) => {
    const node = await this.store?.fetch(hash)
    if (isNull(node)) {
    console.warn(`指定ハッシュ: ${hash} でノードをフェッチできませんでした`)
      return false
    }
    if (isNull(this.canvasManager) || isNull(this.store) || isNull(this.onNodeSelectedOfView)) {
      console.warn("必要な依存が注入されていません")
      return false
    }

    this.canvasManager.removeAllEventListner()
    const scope = new SingleNodeTargetScopeGraph(
      node,
      this.store.fetch,
      this.canvasManager,
      this.onNodeSelectedOfView,
      this.restart
    )
    if (scope) {
      await scope.reset()
      this.pushScope(scope)
    }
    return true
  }

  /**
   * カレントスコープをスタックに追加する(予定)
   */
  public pushScope(scope: ScopeGraph) {
    // 直前のスコープの開放処理を行う
    this.currentScopeGraph.removeDependancy()
    // カレントにセット
    this.currentScopeGraph = scope
  }

  public update = () => {
    this.currentScopeGraph.update()
  }

  public draw = () => {
    this.currentScopeGraph.draw()
  }

  public currentScopeReload = async () => {
    await this.currentScopeGraph.reload()
  }
}


