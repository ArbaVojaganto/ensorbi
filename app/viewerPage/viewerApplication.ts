
import type { NodeEdge as Edge, EdgeDict, NodeDictionary, NodeType } from "./../models/Node.ts"
import { Node } from "./../models/Node.ts"

import {
  CanvasManager,
} from "./../client/CanvasManager.ts"
import {
  GetRequest,
} from "./../client/util.ts"

import { StoredNodes } from "./../client/StoredNodes.ts"
import { NodeDetail } from "./../client/NodeDetail.ts"
import { ScopeGraphManager } from "./../client/ScopeGraphManager.ts"

import {
  isNull,
  bufferToHash,
  todayString,
  metaResourcePath,
} from "./../common/util.ts";

// index.htmlのインラインスクリプトで定義されているであろうリモートパスのグローバル宣言
declare var remoteStorageURL: string;


const viewerRequestOfRemoteGet = async(
  hash: string,
  force = false,
): Promise<Node[]> =>  {

  const pathStruct = metaResourcePath(hash)
  if (remoteStorageURL == "") {
    console.warn(`
    リモートストレージパスが設定されていません。
    HTML内で下記の例のようにノード情報の配置場所を定義してください。
    例:
    var remoteStorageURL = "https://raw.githubusercontent.com/ArbaVojaganto/hogeRepository/main/"
    `)
  } 

  const path = remoteStorageURL + pathStruct.prefix + pathStruct.hashDir + pathStruct.hash + pathStruct.extention
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
}


export class ViewerApplication {
  store: StoredNodes = new  StoredNodes()
  scopeGraphHistory = new ScopeGraphManager()
  globalMenu: GlobalMenu | undefined

  canvasManager: CanvasManager | undefined
  localMenu: LocalMenu | undefined
  updateFunctions: (() => void)[] = []

  constructor(
    public document: HTMLDocument,
    public containerNode: Element,
  ) {
    this.store.setRemoteGetMethod(viewerRequestOfRemoteGet)
    this.scopeGraphHistory = new ScopeGraphManager()
    this.canvasManager = new CanvasManager( this.document, this.containerNode)
  }

  init = ()=> {
    if (isNull(this.canvasManager) || isNull(this.canvasManager.graphCanvas)) return 
    this.canvasManager.init()
    const entryPoint = bufferToHash("entryPoint")
    const n = entryPoint

    this.scopeGraphHistory.dependancyModuleInjection(this.canvasManager, this.store, this.activateNode)
    this.scopeGraphHistory.restart(n)

    // メインアップデートを開始
    this.update()

    // 左メニュー追加
    this.globalMenu = GlobalMenu.init(
      this.document,
      this.containerNode,
      this.reload,
      this.scopeGraphHistory
    )

    customElements.define('localmenu-div', LocalMenu, {extends: 'div'})
    customElements.define('node-detail-div', NodeDetail, {extends: 'div'})
  }

  reload = async () => {
    await this.scopeGraphHistory.currentScopeReload()
    if (!isNull(this.localMenu)) {
      this.localMenu.reloadDetail()
    }
  }

  activateNode = (node: Node) => {
    if (isNull(this.localMenu)) {
      // なかったら生成してDOMを追加
      this.localMenu = new LocalMenu(this.store.tagHashDict, this.store.fetch, this.store.update, this.reload)
      this.containerNode.appendChild(this.localMenu)
    }

    this.localMenu.setDetail(node)
  }

  setUpdateFunction = (fn: () => void ) => {
    this.updateFunctions.push(fn)
  }

  update = () => {
    // canvasの変形処理
    this.canvasManager?.update()
    // ネットワーク更新
    this.scopeGraphHistory.update()

    // ネットワーク描画
    this.scopeGraphHistory.draw()

    // 更新メソッドの集合を呼び出していく
    this.updateFunctions.forEach ( e => {
      e()
    })

    requestAnimationFrame(this.update);
  }

}

/**
 * /LocalMenu
 *  /NodeDetail
 */
export class LocalMenu extends HTMLDivElement {
  detail: NodeDetail | undefined
  constructor(
    tagHashDict: () => NodeDictionary,
    private fetchNode: (uri: string) => Promise<Node | undefined>,
    private updateNode: (node: Node, optionFormData: FormData) => Promise<Node[]>,
    private reload: () => void
  ) {
    super()
    this.id = "network-graph-local-menu"

    this.detail = new NodeDetail (
      this.fetchNode
    )

    this.appendChild(this.detail)
  }

  public setDetail(node: Node) {
    if (isNull(this.detail)) return
    this.detail.setDetail(node)
  }

  public reloadDetail() {
    if (!isNull(this.detail)) {
      this.detail.reloadDetail()
    }
  }

}



class GlobalMenu {
  constructor(
    private document: HTMLDocument,
    private rootNode: HTMLElement,
    private reload: () => void,
    private scopeManager: ScopeGraphManager,
  ) {
    const toAllScope = document.createElement("button")
    toAllScope.onclick = () => {
      this.scopeManager?.restart(bufferToHash("node"))
    }
    toAllScope.innerText = `toAllScope`
    rootNode.appendChild(toAllScope)

    const toTagScope = document.createElement('button')
    toTagScope.onclick = () => {
      this.scopeManager?.restart(bufferToHash("tag"))
    }
    toTagScope.innerText = `toTagScope`
    rootNode.appendChild(toTagScope)

    const toBlobScope = document.createElement('button')
    toBlobScope.onclick = () => { 
      this.scopeManager?.restart(bufferToHash("blob"))
    }
    toBlobScope.innerText = `toBlobScope`
    rootNode.appendChild(toBlobScope)

    const toTodayScope = document.createElement('button')
    toTodayScope.onclick = () => { 
      const s = todayString()
      if (s) {
        this.scopeManager?.restart(bufferToHash(s))
      }
    }
    toTodayScope.innerText = `toTodayScope`
    rootNode.appendChild(toTodayScope)
  }

  public static init = (
    document: HTMLDocument,
    rootElement: Element,
    reload: () => void,
    scopeManager: ScopeGraphManager,
  ): GlobalMenu | undefined => {
    const globalMenu = document.createElement("div")
    if (isNull(globalMenu)) return undefined
    globalMenu.id = "network-graph-global-menu"

    rootElement.appendChild(globalMenu)

    const i = new GlobalMenu(
      document,
      globalMenu,
      reload,
      scopeManager,
    )
    return i
  }


}



